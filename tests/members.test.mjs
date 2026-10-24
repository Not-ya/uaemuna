import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createHandler } from "../server/api.mjs";
import {
  canRead,
  hashPassword,
  verifyPassword,
  allowedPushEndpoint,
} from "../server/security.mjs";
let pg,
  db,
  handler,
  mail = [],
  ip = 0;
const env = {
  DATABASE_URL: "postgres://test",
  AUTH_SECRET: "a".repeat(64),
  OWNER_EMAIL: "youssef.f1@hotmail.com",
  SMTP_HOST: "mail.test",
  SMTP_USER: "test",
  SMTP_PASSWORD: "test",
  MAIL_FROM: "test@example.test",
  NETLIFY_API_TOKEN: "test",
  NETLIFY_SITE_ID: "test",
};
before(async () => {
  pg = new PGlite();
  await pg.exec(fs.readFileSync("database/001_members.sql", "utf8"));
  const query = async (sql, params = []) => {
    const r = await pg.query(sql, params);
    return { ...r, rowCount: r.affectedRows };
  };
  db = {
    query,
    async connect() {
      return { query, release() {} };
    },
  };
  handler = createHandler({
    getDb: () => db,
    env,
    sendMail: async (to, subject, text) => {
      mail.push({ to, subject, text });
    },
    netlifyFetch: async (url) =>
      Response.json(
        url.includes("/forms?")
          ? []
          : url.endsWith("/forms")
            ? [{ id: "test-form", name: "contact" }]
            : [
                {
                  id: "submission-1",
                  created_at: "2026-10-24",
                  data: {
                    name: "Test sender",
                    email: "sender@example.test",
                    message: "Hello team",
                    subject: "Partnership",
                  },
                },
              ],
      ),
  });
});
after(async () => pg.close());
async function request(action, params = {}, account, opts = {}) {
  const headers = {
    "Content-Type": "application/json",
    Origin: opts.origin || "https://uaemuna.test",
  };
  if (account) {
    headers.Cookie = account.cookie;
    headers["X-CSRF-Token"] = opts.csrf === false ? "" : account.csrf;
  }
  const response = await handler(
    new Request("https://uaemuna.test/.netlify/functions/members", {
      method: "POST",
      headers,
      body: JSON.stringify({ action, ...params }),
    }),
    { ip: "test-" + ++ip },
  );
  const body = await response.json();
  return { status: response.status, body, headers: response.headers };
}
function lastToken(email) {
  return new URL(
    mail
      .filter((m) => m.to === email)
      .at(-1)
      .text.match(/https:\/\/\S+/)[0],
  ).searchParams.get("token");
}
async function login(email, password = "a-strong-test-password") {
  const r = await request("auth.login", { email, password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return {
    cookie: r.headers.get("set-cookie").split(";")[0],
    csrf: r.body.csrf,
    user: r.body.user,
  };
}
let owner, volunteer, staff, executive, outsider;
test("password hashes use scrypt and validate without storing plaintext", async () => {
  const value = "not-a-real-password";
  const hash = await hashPassword(value);
  assert.ok(!hash.includes(value));
  assert.equal(await verifyPassword(value, hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
  await assert.rejects(() => hashPassword("short"));
});
test("invitation-only setup verifies owner email before account creation; token is one-use", async () => {
  const count = mail.length;
  const unknown = await request("auth.request-account", {
    email: "notinvited@example.test",
  });
  assert.equal(unknown.status, 200);
  assert.equal(mail.length, count);
  const r = await request("auth.request-account", { email: env.OWNER_EMAIL });
  assert.equal(r.body.message, unknown.body.message);
  const raw = lastToken(env.OWNER_EMAIL);
  assert.equal((await db.query("select * from users")).rows.length, 0);
  assert.ok(
    !(await db.query("select hash from auth_tokens")).rows.some(
      (t) => t.hash === raw,
    ),
  );
  const complete = await request("auth.complete", {
    token: raw,
    password: "a-strong-test-password",
    name: "Youssef",
  });
  assert.equal(complete.status, 200);
  assert.equal(complete.body.user.role, "owner");
  assert.equal(
    (
      await request("auth.complete", {
        token: raw,
        password: "another-strong-password",
        name: "Intruder",
      })
    ).status,
    400,
  );
  owner = await login(env.OWNER_EMAIL);
  const header = (
    await request("auth.login", {
      email: env.OWNER_EMAIL,
      password: "a-strong-test-password",
    })
  ).headers.get("set-cookie");
  for (const flag of [
    "__Host-",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
  ])
    assert.ok(header.includes(flag));
});
test("cross-origin and CSRF mutations are rejected; no unauthenticated member access", async () => {
  assert.equal((await request("member.list")).status, 401);
  assert.equal(
    (
      await request(
        "invitation.create",
        { email: "bad@example.test", role: "admin" },
        owner,
        { origin: "https://evil.test" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "invitation.create",
        { email: "bad@example.test", role: "admin" },
        owner,
        { csrf: false },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "invitation.create",
        { email: "bad@example.test", role: "owner" },
        owner,
      )
    ).status,
    400,
  );
});
async function invite(email, role) {
  const r = await request("invitation.create", { email, role }, owner);
  assert.equal(r.status, 200);
  const token = lastToken(email);
  assert.equal(
    (
      await request("auth.complete", {
        token,
        password: "a-strong-test-password",
        name: role,
      })
    ).status,
    200,
  );
  return login(email);
}
test("owner invitations create limited roles; members cannot manage or read invitations", async () => {
  volunteer = await invite("volunteer@example.test", "volunteer");
  staff = await invite("staff@example.test", "staff");
  executive = await invite("exec@example.test", "executive");
  outsider = await invite("member@example.test", "member");
  assert.equal((await request("invitation.list", {}, volunteer)).status, 403);
  assert.equal(
    (
      await request(
        "member.manage",
        { id: owner.user.id, role: "admin", active: true },
        volunteer,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "member.manage",
        { id: owner.user.id, role: "admin", active: true },
        owner,
      )
    ).status,
    400,
  );
});
test("room ACL is enforced on reads, writes, reactions and reply targets", async () => {
  const rooms = (await request("chat.list", {}, owner)).body.data;
  const leadership = rooms.find((r) => r.slug === "leadership"),
    main = rooms.find((r) => r.slug === "main");
  const visible = (await request("chat.list", {}, volunteer)).body.data.map(
    (c) => c.slug,
  );
  assert.deepEqual(visible, ["main", "volunteers"]);
  assert.equal(
    (await request("message.list", { chat: leadership.id }, volunteer)).status,
    404,
  );
  assert.equal(
    (
      await request(
        "message.send",
        { chat: leadership.id, body: "not allowed" },
        volunteer,
      )
    ).status,
    404,
  );
  const secret = (
    await request(
      "message.send",
      { chat: leadership.id, body: "Leadership plan" },
      executive,
    )
  ).body.data.id;
  assert.equal(
    (await request("reaction.toggle", { id: secret, emoji: "❤️" }, volunteer))
      .status,
    404,
  );
  assert.equal(
    (
      await request(
        "message.send",
        { chat: main.id, body: "Cross-room reply", replyTo: secret },
        owner,
      )
    ).status,
    400,
  );
  assert.ok(
    canRead(
      staff.user,
      rooms.find((c) => c.slug === "staff"),
    ),
  );
  assert.ok(
    !canRead(
      volunteer.user,
      rooms.find((c) => c.slug === "staff"),
    ),
  );
});
test("DMs are isolated from outsiders, including the owner; duplicates converge", async () => {
  const open = await request(
    "chat.direct",
    { other: staff.user.id },
    volunteer,
  );
  assert.equal(open.status, 200);
  const id = open.body.data;
  assert.equal(
    (await request("chat.direct", { other: volunteer.user.id }, staff)).body
      .data,
    id,
  );
  const sent = await request(
    "message.send",
    { chat: id, body: "A private message" },
    volunteer,
  );
  assert.equal(sent.status, 200);
  assert.equal(
    (await request("message.list", { chat: id }, owner)).status,
    404,
  );
  assert.equal(
    (await request("message.list", { chat: id }, outsider)).status,
    404,
  );
  assert.equal(
    (
      await request(
        "message.edit",
        { id: sent.body.data.id, body: "Edited by someone else" },
        staff,
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("message.delete", { id: sent.body.data.id }, owner)).status,
    404,
  );
  assert.equal(
    (
      await request(
        "message.edit",
        { id: sent.body.data.id, body: "Edited by its author" },
        volunteer,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        "reaction.toggle",
        { id: sent.body.data.id, emoji: "❤️" },
        staff,
      )
    ).status,
    200,
  );
  const reactions = (await request("reaction.list", { chat: id }, staff)).body
    .data;
  assert.equal(reactions.length, 1);
  await request(
    "reaction.toggle",
    { id: sent.body.data.id, emoji: "❤️" },
    staff,
  );
  assert.equal(
    (await request("reaction.list", { chat: id }, staff)).body.data.length,
    0,
  );
});
test("contact submissions are available to owner/admin only", async () => {
  const r = await request("contact.list", { page: 1 }, owner);
  assert.equal(r.status, 200);
  assert.equal(r.body.submissions[0].message, "Hello team");
  assert.equal(
    (await request("contact.list", { page: 1 }, executive)).status,
    403,
  );
  assert.equal(
    (await request("contact.list", { page: 1 }, volunteer)).status,
    403,
  );
});
test("revoked and expired invites cannot create accounts", async () => {
  await request(
    "invitation.create",
    { email: "revoked@example.test", role: "staff" },
    owner,
  );
  const raw = lastToken("revoked@example.test");
  await request("invitation.revoke", { email: "revoked@example.test" }, owner);
  assert.equal(
    (
      await request("auth.complete", {
        token: raw,
        password: "a-strong-test-password",
        name: "No",
      })
    ).status,
    400,
  );
  await request(
    "invitation.create",
    { email: "expired@example.test", role: "staff" },
    owner,
  );
  const expired = lastToken("expired@example.test");
  await db.query(
    "update invitations set expires_at=now()-interval '1 hour' where email='expired@example.test'",
  );
  assert.equal(
    (
      await request("auth.complete", {
        token: expired,
        password: "a-strong-test-password",
        name: "No",
      })
    ).status,
    403,
  );
});
test("password resets revoke all sessions and browser push subscriptions", async () => {
  const sub = {
    endpoint: "https://fcm.googleapis.com/fcm/send/test-sub",
    keys: { p256dh: "testkey", auth: "testauth" },
  };
  assert.equal(
    (await request("push.subscribe", { subscription: sub }, volunteer)).status,
    200,
  );
  assert.equal(
    (await request("push.status", {}, volunteer)).body.enabled,
    true,
  );
  const r = await request("auth.forgot", { email: volunteer.user.email });
  assert.equal(r.status, 200);
  const raw = lastToken(volunteer.user.email);
  assert.equal(
    (
      await request("auth.complete", {
        token: raw,
        password: "changed-strong-password",
      })
    ).status,
    200,
  );
  assert.equal((await request("member.list", {}, volunteer)).status, 401);
  assert.equal(
    (
      await db.query("select * from push_subscriptions where user_id=$1", [
        volunteer.user.id,
      ])
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await request("auth.login", {
        email: volunteer.user.email,
        password: "a-strong-test-password",
      })
    ).status,
    401,
  );
  volunteer = await login(volunteer.user.email, "changed-strong-password");
});
test("suspension revokes existing sessions; push endpoint validation prevents SSRF", async () => {
  assert.equal(allowedPushEndpoint("https://127.0.0.1/private"), false);
  assert.equal(
    allowedPushEndpoint("https://fcm.googleapis.com.evil.test/path"),
    false,
  );
  assert.equal(allowedPushEndpoint("http://fcm.googleapis.com/path"), false);
  assert.equal(
    allowedPushEndpoint("https://fcm.googleapis.com/fcm/send/test"),
    true,
  );
  assert.equal(
    (
      await request(
        "push.subscribe",
        {
          subscription: {
            endpoint: "https://127.0.0.1",
            keys: { p256dh: "key", auth: "key" },
          },
        },
        staff,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "member.manage",
        { id: outsider.user.id, role: "member", active: false },
        owner,
      )
    ).status,
    200,
  );
  assert.equal((await request("member.list", {}, outsider)).status, 401);
});
test("login throttling uses an atomic database counter", async () => {
  for (let i = 0; i < 12; i++)
    assert.equal(
      (
        await request("auth.login", {
          email: "throttle@example.test",
          password: "wrong",
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await request("auth.login", {
        email: "throttle@example.test",
        password: "wrong",
      })
    ).status,
    429,
  );
});
test("push deliveries follow room membership and sessions, avoid DM leakage, and deduplicate", async () => {
  const { createPushHandler } = await import("../server/push.mjs");
  const webpush = (await import("web-push")).default;
  const keys = webpush.generateVAPIDKeys();
  const calls = [];
  const handler = createPushHandler({
    getDb: () => db,
    env: {
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT: "mailto:test@example.test",
    },
    sendNotification: async (subscription, payload) =>
      calls.push({
        endpoint: subscription.endpoint,
        payload: JSON.parse(payload),
      }),
  });
  for (const [i, account] of [volunteer, staff, executive].entries())
    await request(
      "push.subscribe",
      {
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/test-" + i,
          keys: { p256dh: "key", auth: "key" },
        },
      },
      account,
    );
  const rooms = (await request("chat.list", {}, owner)).body.data;
  const leadership = rooms.find((c) => c.slug === "leadership");
  const msg = (
    await request(
      "message.send",
      { chat: leadership.id, body: "Private leadership content" },
      owner,
    )
  ).body.data.id;
  const invoke = async (id, account = owner) =>
    handler(
      new Request(
        "https://uaemuna.test/.netlify/functions/push-message-background",
        {
          method: "POST",
          headers: {
            Origin: "https://uaemuna.test",
            Cookie: account.cookie,
            "X-CSRF-Token": account.csrf,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messageId: id }),
        },
      ),
    );
  assert.equal((await invoke(msg)).status, 200);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endpoint.endsWith("test-2"));
  assert.ok(
    !JSON.stringify(calls[0].payload).includes("Private leadership content"),
  );
  await invoke(msg);
  assert.equal(calls.length, 1);
  assert.equal((await invoke(msg, volunteer)).status, 403);
  const direct = (await request("chat.direct", { other: staff.user.id }, owner))
    .body.data;
  const dm = (
    await request("message.send", { chat: direct, body: "A DM body" }, owner)
  ).body.data.id;
  await invoke(dm);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].endpoint.endsWith("test-1"));
});
