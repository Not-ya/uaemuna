import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createEmailSender } from "../server/email-sender.mjs";
import { digest } from "../server/security.mjs";
let pg,
  db,
  handler,
  accounts = {};
const delivered = [];
let failureCode;
const env = {
  AUTH_SECRET: "secret".repeat(10),
  MAIL_FROM: "UAEMUNA <uaemodeluna@gmail.com>",
};
before(async () => {
  pg = new PGlite();
  for (const file of ["001_members.sql", "004_email_sender.sql"])
    await pg.exec(fs.readFileSync("database/" + file, "utf8"));
  const query = (sql, args = []) => pg.query(sql, args);
  db = {
    query,
    async connect() {
      return { query, release() {} };
    },
  };
  for (const role of [
    "owner",
    "admin",
    "executive",
    "staff",
    "volunteer",
    "member",
  ]) {
    const user = (
      await query(
        "insert into users(email,name,role,verified_at) values($1,$2,$3,now()) returning *",
        [
          role + "@example.test",
          role === "owner" ? "Youssef Abdalla" : role + " Person",
          role,
        ],
      )
    ).rows[0];
    const raw = randomUUID(),
      csrf = randomUUID();
    await query(
      "insert into sessions(hash,user_id,csrf,expires_at) values($1,$2,$3,now()+interval '1 day')",
      [digest(raw), user.id, csrf],
    );
    accounts[role] = { user, cookie: "__Host-uaemuna_session=" + raw, csrf };
  }
  handler = createEmailSender({
    getDb: () => db,
    env,
    sendMail: async (to, subject, text, options) => {
      delivered.push({ to, subject, text, options });
      if (failureCode)
        throw Object.assign(new Error("Private provider diagnostic"), {
          code: failureCode,
        });
      return { messageId: "provider-" + randomUUID() };
    },
  });
});
after(async () => pg.close());
function req(account, body, options = {}) {
  return new Request(
    "https://uaemuna.test/.netlify/functions/email" + (options.query || ""),
    {
      method: body ? "POST" : "GET",
      headers: {
        Origin: options.origin || "https://uaemuna.test",
        "Content-Type": "application/json",
        ...(account
          ? {
              Cookie: account.cookie,
              "X-CSRF-Token": options.noCsrf ? "" : account.csrf,
            }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}
const draft = (extra = {}) => ({
  to: "recipient@example.test",
  subject: "Conference partnership",
  body: "Hello,\n\nWe would love to work with your conference.",
  requestId: randomUUID(),
  ...extra,
});
test("only owner, admin and executive can see or use the sender", async () => {
  assert.equal((await handler(req(null))).status, 401);
  for (const role of ["staff", "volunteer", "member"]) {
    assert.equal((await handler(req(accounts[role]))).status, 403);
    assert.equal((await handler(req(accounts[role], draft()))).status, 403);
  }
  for (const role of ["owner", "admin", "executive"]) {
    const metadata = await handler(req(accounts[role]));
    assert.equal(metadata.status, 200);
    assert.equal(
      (await metadata.json()).signature.email,
      accounts[role].user.email,
    );
  }
  assert.equal(delivered.length, 0);
});
test("messages use the verified sender identity, branded logo, plain text and Reply-To", async () => {
  for (const role of ["owner", "admin", "executive"]) {
    const body = draft({
      name: "Impersonated",
      replyTo: "intruder@example.test",
      signature: { name: "Fake owner", title: "Owner" },
      body: "Hi <script>alert(1)</script>\n\nA safe plain-text message.",
    });
    const r = await handler(req(accounts[role], body));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).status, "sent");
    const sent = delivered.at(-1);
    assert.equal(sent.options.replyTo.address, accounts[role].user.email);
    assert.equal(sent.options.replyTo.name, accounts[role].user.name);
    assert.ok(sent.options.html.includes("cid:uaemuna-emblem"));
    assert.ok(sent.options.html.includes("&lt;script&gt;"));
    assert.ok(!sent.options.html.includes("<script>"));
    assert.ok(!sent.options.html.includes("Fake owner"));
    assert.ok(sent.text.includes(accounts[role].user.name));
    assert.equal(sent.to.address, body.to);
  }
});
test("CSRF, origin, recipients and subject injection are rejected before email delivery", async () => {
  const count = delivered.length,
    account = accounts.owner;
  assert.equal(
    (await handler(req(account, draft(), { noCsrf: true }))).status,
    403,
  );
  assert.equal(
    (await handler(req(account, draft(), { origin: "https://evil.test" })))
      .status,
    403,
  );
  for (const fields of [
    { to: "first@example.test,second@example.test" },
    { to: "first@example.test,evil" },
    { to: "bad\r\nBcc: victim@example.test" },
    { subject: "Subject\r\nBcc: victim@example.test" },
    { body: "" },
    { body: "x".repeat(10001) },
  ])
    assert.equal((await handler(req(account, draft(fields)))).status, 400);
  assert.equal(delivered.length, count);
});
test("successful repeat requests are idempotent and sent history is private per sender", async () => {
  const body = draft(),
    count = delivered.length;
  const first = await handler(req(accounts.owner, body));
  assert.equal(first.status, 200);
  const result = await first.json();
  const repeat = await handler(req(accounts.owner, body));
  assert.equal((await repeat.json()).alreadySent, true);
  assert.equal(delivered.length, count + 1);
  assert.equal(
    (await handler(req(accounts.owner, { ...body, body: "Different content" })))
      .status,
    409,
  );
  const ownerHistory = await (
    await handler(req(accounts.owner, null, { query: "?action=history" }))
  ).json();
  assert.ok(ownerHistory.emails.some((row) => row.id === result.id));
  const adminHistory = await (
    await handler(req(accounts.admin, null, { query: "?action=history" }))
  ).json();
  assert.ok(!adminHistory.emails.some((row) => row.id === result.id));
});
test("definite rejection is recorded as failed and can be retried safely", async () => {
  const body = draft();
  failureCode = "EAUTH";
  const rejected = await handler(req(accounts.admin, body));
  assert.equal(rejected.status, 503);
  const value = await rejected.json();
  assert.equal(value.status, "failed");
  assert.ok(!value.error.includes("Private provider diagnostic"));
  failureCode = undefined;
  const retried = await handler(req(accounts.admin, body));
  assert.equal(retried.status, 200);
  assert.equal((await retried.json()).status, "sent");
});
test("uncertain SMTP outcomes are recorded and never automatically resent", async () => {
  const body = draft();
  failureCode = "ETIMEDOUT";
  const r = await handler(req(accounts.executive, body));
  assert.equal((await r.json()).status, "uncertain");
  failureCode = undefined;
  const count = delivered.length;
  assert.equal((await handler(req(accounts.executive, body))).status, 409);
  assert.equal(delivered.length, count);
});
test("suspended accounts lose access to both sending and sent history", async () => {
  await db.query("update users set active=false where id=$1", [
    accounts.admin.user.id,
  ]);
  assert.equal((await handler(req(accounts.admin, draft()))).status, 401);
  assert.equal(
    (await handler(req(accounts.admin, null, { query: "?action=history" })))
      .status,
    401,
  );
});
test("per-sender limits stop excessive sends before contacting SMTP", async () => {
  // A separate executive member gets a fresh per-sender allowance.
  const u = (
    await db.query(
      "insert into users(email,name,role,verified_at) values('quota@example.test','Quota tester','executive',now()) returning *",
    )
  ).rows[0];
  const raw = randomUUID(),
    csrf = randomUUID();
  await db.query(
    "insert into sessions(hash,user_id,csrf,expires_at) values($1,$2,$3,now()+interval '1 day')",
    [digest(raw), u.id, csrf],
  );
  const account = { user: u, cookie: "__Host-uaemuna_session=" + raw, csrf };
  for (let i = 0; i < 20; i++)
    assert.equal((await handler(req(account, draft()))).status, 200);
  const count = delivered.length;
  assert.equal((await handler(req(account, draft()))).status, 429);
  assert.equal(delivered.length, count);
});
