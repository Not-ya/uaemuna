import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createContactHandler } from "../server/contact.mjs";
import { createPartnersHandler } from "../server/partners.mjs";
import { accountEmail } from "../server/email-template.mjs";
import { digest } from "../server/security.mjs";
let pg, db, partners, contact, owner, staff;
const secret = "test-secret".repeat(5);
before(async () => {
  pg = new PGlite();
  for (const name of ["001_members.sql", "002_contact.sql", "003_partners.sql"])
    await pg.exec(fs.readFileSync("database/" + name, "utf8"));
  const query = (sql, args = []) => pg.query(sql, args);
  db = {
    query,
    async connect() {
      return { query, release() {} };
    },
  };
  const create = async (role) => {
    const user = (
      await query(
        "insert into users(email,name,role,verified_at) values($1,$2,$3,now()) returning id",
        [role + "@example.test", role, role],
      )
    ).rows[0];
    const raw = randomUUID(),
      csrf = randomUUID();
    await query(
      "insert into sessions(hash,user_id,csrf,expires_at) values($1,$2,$3,now()+interval '1 day')",
      [digest(raw), user.id, csrf],
    );
    return { cookie: "__Host-uaemuna_session=" + raw, csrf };
  };
  owner = await create("owner");
  staff = await create("staff");
  partners = createPartnersHandler({ getDb: () => db });
  contact = createContactHandler({
    getDb: () => db,
    env: { AUTH_SECRET: secret },
  });
});
after(async () => pg.close());
const req = (path, body, account, headers = {}) =>
  new Request("https://uaemuna.test/.netlify/functions/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: "https://uaemuna.test",
      "Content-Type": "application/json",
      ...(account
        ? { Cookie: account.cookie, "X-CSRF-Token": account.csrf }
        : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
test("contact submissions validate, save once, and do not disclose submitted data", async () => {
  const data = {
    name: "Real sender",
    email: "sender@example.test",
    subject: "Support",
    message: "Can we work together?",
    request_id: randomUUID(),
  };
  for (let i = 0; i < 2; i++) {
    const r = await contact(req("contact", data), { ip: "sender-1" });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
  }
  assert.equal(
    (await db.query("select * from contact_submissions")).rows.length,
    1,
  );
  assert.equal(
    (
      await contact(req("contact", { ...data, email: "invalid" }), {
        ip: "sender-2",
      })
    ).status,
    400,
  );
  assert.equal(
    (await contact(req("contact", { ...data, website: "spam" }), { ip: "bot" }))
      .status,
    200,
  );
  assert.equal(
    (await db.query("select * from contact_submissions")).rows.length,
    1,
  );
  assert.equal(
    (
      await contact(
        req("contact", data, undefined, { Origin: "https://evil.test" }),
        { ip: "evil" },
      )
    ).status,
    403,
  );
  assert.equal((await contact(req("contact"))).status, 405);
});
test("native form submission redirects only after saving, and spam is throttled", async () => {
  const r = await contact(
    new Request("https://uaemuna.test/.netlify/functions/contact", {
      method: "POST",
      headers: {
        Origin: "https://uaemuna.test",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        name: "No JS",
        email: "native@example.test",
        message: "Works without JS",
      }),
    }),
    { ip: "native" },
  );
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/thank-you/");
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await contact(
          req("contact", {
            name: "Person",
            email: "person@example.test",
            message: "Request",
          }),
          { ip: "rate-test" },
        )
      ).status,
      200,
    );
  assert.equal(
    (
      await contact(
        req("contact", {
          name: "Person",
          email: "person@example.test",
          message: "Request",
        }),
        { ip: "rate-test" },
      )
    ).status,
    429,
  );
});
let partnerId;
test("only the owner can create partners; private drafts do not appear publicly", async () => {
  assert.equal(
    (await partners(req("partners", { action: "list" }))).status,
    401,
  );
  assert.equal(
    (await partners(req("partners", { action: "list" }, staff))).status,
    403,
  );
  assert.equal(
    (
      await partners(
        req("partners", { action: "list" }, owner, { "X-CSRF-Token": "bad" }),
      )
    ).status,
    403,
  );
  const fields = {
    action: "save",
    name: "NewMUN",
    description: "New partner",
    website: "https://newmun.example",
    position: 2,
    published: false,
  };
  const r = await partners(req("partners", fields, owner));
  assert.equal(r.status, 200);
  partnerId = (await r.json()).partner.id;
  assert.equal(
    (await (await partners(req("partners"))).json()).partners.length,
    2,
  );
  const invalid = await partners(
    req("partners", { ...fields, website: "javascript:alert(1)" }, owner),
  );
  assert.equal(invalid.status, 400);
});
test("original banners upload, display with the right MIME type, and can be replaced", async () => {
  const image = fs.readFileSync("public/images/valormun-banner.webp");
  const fields = {
    action: "save",
    id: partnerId,
    name: "NewMUN",
    description: "Published partner",
    website: "https://newmun.example",
    position: 2,
    published: true,
    banner: { type: "image/webp", data: image.toString("base64") },
  };
  const save = await partners(req("partners", fields, owner));
  assert.equal(save.status, 200);
  const partner = (await save.json()).partner;
  const r = await partners(req("partners?action=banner&id=" + partnerId));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/webp");
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), image);
  const unchanged = await partners(
    req("partners?action=banner&id=" + partnerId, undefined, undefined, {
      "If-None-Match": r.headers.get("etag"),
    }),
  );
  assert.equal(unchanged.status, 304);
  const list = await (await partners(req("partners"))).json();
  assert.equal(list.partners.length, 3);
  assert.ok(partner.bannerUrl.includes(partnerId));
  const bad = await partners(
    req(
      "partners",
      {
        ...fields,
        banner: {
          type: "image/png",
          data: Buffer.from('<svg onload="alert(1)"></svg>').toString("base64"),
        },
      },
      owner,
    ),
  );
  assert.equal(bad.status, 400);
  const hidden = await partners(
    req("partners", { ...fields, published: false, banner: undefined }, owner),
  );
  assert.equal(hidden.status, 200);
  assert.equal(
    (await partners(req("partners?action=banner&id=" + partnerId))).status,
    404,
  );
  assert.equal(
    (
      await partners(
        req("partners?action=banner&id=" + partnerId, undefined, owner),
      )
    ).status,
    200,
  );
});
test("removing a seed partner stays removed when the migration is repeated", async () => {
  const current = (
    await (await partners(req("partners", { action: "list" }, owner))).json()
  ).partners;
  const original = current.find((p) => p.name === "ValorMUN");
  assert.equal(
    (
      await partners(
        req("partners", { action: "delete", id: original.id }, owner),
      )
    ).status,
    200,
  );
  await pg.exec(fs.readFileSync("database/003_partners.sql", "utf8"));
  assert.ok(
    !(
      await (await partners(req("partners", { action: "list" }, owner))).json()
    ).partners.some((p) => p.id === original.id),
  );
});
test("branded emails contain an embedded logo, accessible links and a plain-text fallback", () => {
  for (const purpose of ["activate", "reset"]) {
    const url =
      "https://uaemuna.test/set-password/?token=test-token&mode=" + purpose;
    const mail = accountEmail({ purpose, url });
    assert.ok(mail.html.includes("cid:uaemuna-emblem"));
    assert.ok(mail.html.includes("UAEMUNA"));
    assert.ok(mail.html.includes('charset="utf-8"'));
    assert.ok(mail.html.includes("&amp;mode="));
    assert.ok(mail.text.includes(url));
    assert.ok(mail.html.includes("30 minutes"));
    assert.ok(!mail.html.includes("<script"));
  }
});
