import { accountEmail } from "./email-template.mjs";
import {
  authorizeSetup,
  initializeMembers,
  initializeContactInbox,
  initializePartners,
} from "./initialize.mjs";
import { database, transaction } from "./db.mjs";
import { mailer, verifyMailer } from "./mail.mjs";
import {
  token,
  digest,
  failure,
  hashPassword,
  verifyPassword,
  publicUser,
  validEmail,
  validId,
  canRead,
  sameOrigin,
  limit,
  cookie,
  authenticate,
  allowedPushEndpoint,
} from "./security.mjs";
const roles = ["admin", "executive", "staff", "volunteer", "member"];
const genericAccount =
  "If this address is eligible, an email is on its way. Check your inbox and spam folder.";
const safeJson = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
const cleanEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
function text(value, max, required = true) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw failure(400, "Check the information you entered.");
  return value.trim();
}
function requireRole(user, allowed) {
  if (!allowed.includes(user.role))
    throw failure(403, "You do not have access to this area.");
}
async function conversation(db, user, id) {
  if (!validId(id)) throw failure(400, "Invalid conversation.");
  const r = await db.query("select * from conversations where id=$1", [id]);
  if (!r.rows[0] || !canRead(user, r.rows[0]))
    throw failure(404, "Conversation unavailable.");
  return r.rows[0];
}
async function message(db, user, id) {
  if (!validId(id)) throw failure(400, "Invalid message.");
  const r = await db.query("select * from messages where id=$1", [id]);
  if (!r.rows[0]) throw failure(404, "Message unavailable.");
  await conversation(db, user, r.rows[0].conversation_id);
  return r.rows[0];
}
async function issueEmail(db, email, purpose, send, origin) {
  const raw = token();
  await db.query(
    "insert into auth_tokens(hash,email,purpose,expires_at) values($1,$2,$3,now()+interval '30 minutes')",
    [digest(raw), email, purpose],
  );
  const path = purpose === "activate" ? "/set-password/" : "/reset-password/";
  try {
    const content = accountEmail({
      purpose,
      url: `${origin}${path}?token=${raw}`,
    });
    await send(
      email,
      purpose === "activate"
        ? "Your UAEMUNA account invitation"
        : "Reset your UAEMUNA password",
      content.text,
      { html: content.html },
    );
  } catch (error) {
    await db.query("delete from auth_tokens where hash=$1", [digest(raw)]);
    throw failure(
      503,
      "Your request could not be emailed right now. Please try again later.",
    );
  }
}
export function createHandler({
  getDb = database,
  sendMail = mailer(),
  verifyMail = () => verifyMailer(env),
  env = process.env,
} = {}) {
  return async (request, context = {}) => {
    try {
      const url = new URL(request.url);
      if (!["GET", "POST"].includes(request.method))
        return safeJson({ error: "Method not allowed." }, 405);
      let input = {};
      if (request.method === "POST") {
        sameOrigin(request, env);
        const raw = await request.text();
        if (raw.length > 20000)
          throw failure(413, "This request is too large.");
        try {
          input = JSON.parse(raw);
        } catch {
          throw failure(400, "Invalid request.");
        }
      }
      const action =
        request.method === "GET"
          ? url.searchParams.get("action")
          : input.action;
      if (action === "status") {
        // Presence only: never include connection strings, passwords, or private keys.
        const required = [
          "DATABASE_URL",
          "AUTH_SECRET",
          "SMTP_HOST",
          "SMTP_USER",
          "SMTP_PASSWORD",
          "MAIL_FROM",
        ];
        const checks = Object.fromEntries(
          [
            ...required,
            "VAPID_PUBLIC_KEY",
            "VAPID_PRIVATE_KEY",
            "VAPID_SUBJECT",
          ].map((name) => [
            name,
            name === "AUTH_SECRET" ? !!(env[name]?.length >= 32) : !!env[name],
          ]),
        );
        return safeJson({
          configured: required.every((name) => checks[name]),
          pushConfigured: [
            "VAPID_PUBLIC_KEY",
            "VAPID_PRIVATE_KEY",
            "VAPID_SUBJECT",
          ].every((name) => checks[name]),
          vapidPublicKey: env.VAPID_PUBLIC_KEY || "",
          checks,
        });
      }
      const readActions = [
        "auth.session",
        "member.list",
        "chat.list",
        "message.list",
        "reaction.list",
        "invitation.list",
        "contact.list",
        "push.status",
      ];
      if (request.method === "GET" && !readActions.includes(action))
        throw failure(405, "Use POST for this request.");
      const data =
        request.method === "GET" ? Object.fromEntries(url.searchParams) : input;
      if (action === "setup.verify-email") {
        authorizeSetup(request, env);
        try {
          await verifyMail();
          return safeJson({ connected: true, emailSent: false });
        } catch (error) {
          return safeJson(
            {
              error: "SMTP connection verification failed.",
              code: /^[A-Z0-9_]{2,40}$/.test(error.code || "")
                ? error.code
                : "SMTP_VERIFY_FAILED",
            },
            503,
          );
        }
      }
      if (action === "setup.partners") {
        authorizeSetup(request, env);
        return safeJson(await initializePartners(getDb()));
      }
      if (action === "setup.contact") {
        authorizeSetup(request, env);
        return safeJson(await initializeContactInbox(getDb()));
      }
      if (action === "setup.initialize") {
        authorizeSetup(request, env);
        try {
          return safeJson(await initializeMembers(getDb()));
        } catch (error) {
          if (error.status) throw error;
          console.error("Database initialization:", error.code || error.name);
          return safeJson(
            {
              error: "The database could not be initialized.",
              code: /^[A-Z0-9_]{2,40}$/.test(error.code || "")
                ? error.code
                : "DATABASE_SETUP_FAILED",
            },
            503,
          );
        }
      }
      const db = getDb();
      const origin = url.origin;
      const ip = context.ip || "unavailable";
      if (action === "auth.session") {
        try {
          const u = await authenticate(request, db);
          return safeJson({ user: publicUser(u), csrf: u.csrf });
        } catch (error) {
          if (error.status === 401) return safeJson({ user: null });
          throw error;
        }
      }
      if (action?.startsWith("auth.")) {
        if (action === "auth.login") {
          const email = cleanEmail(data.email);
          if (
            !validEmail(email) ||
            typeof data.password !== "string" ||
            data.password.length > 128
          )
            throw failure(400, "Check your email and password.");
          await limit(db, `login:ip:${ip}`, 25, 900, env.AUTH_SECRET);
          await limit(db, `login:email:${email}`, 12, 900, env.AUTH_SECRET);
          const r = await db.query("select * from users where email=$1", [
            email,
          ]);
          const u = r.rows[0];
          const valid = await verifyPassword(data.password, u?.password_hash);
          if (!valid || !u?.active || !u.verified_at)
            throw failure(
              401,
              "Could not sign in. Check your email and password.",
            );
          const raw = token(),
            csrf = token();
          await db.query(
            "insert into sessions(hash,user_id,csrf,expires_at) values($1,$2,$3,now()+interval '7 days')",
            [digest(raw), u.id, csrf],
          );
          return safeJson({ user: publicUser(u), csrf }, 200, {
            "Set-Cookie": cookie(raw),
          });
        }
        if (["auth.request-account", "auth.forgot"].includes(action)) {
          const email = cleanEmail(data.email);
          if (!validEmail(email))
            throw failure(400, "Enter a valid email address.");
          await limit(db, `email:ip:${ip}`, 10, 3600, env.AUTH_SECRET);
          await limit(db, `email:address:${email}`, 4, 3600, env.AUTH_SECRET);
          const existing = (
            await db.query("select * from users where email=$1", [email])
          ).rows[0];
          if (action === "auth.forgot") {
            if (existing?.active && existing.verified_at)
              await issueEmail(db, email, "reset", sendMail, origin);
          } else if (!existing) {
            const invite = (
              await db.query(
                "select * from invitations where email=$1 and not revoked and accepted_at is null and expires_at>now()",
                [email],
              )
            ).rows[0];
            const owner =
              email ===
                cleanEmail(env.OWNER_EMAIL || "youssef.f1@hotmail.com") &&
              !(await db.query("select id from users where role='owner'")).rows
                .length;
            if (invite || owner)
              await issueEmail(db, email, "activate", sendMail, origin);
          }
          return safeJson({ message: genericAccount });
        }
        if (action === "auth.complete") {
          await limit(db, `complete:ip:${ip}`, 15, 900, env.AUTH_SECRET);
          const raw = text(data.token, 100);
          const hash = digest(raw);
          const r = await transaction(db, async (tx) => {
            const t = (
              await tx.query(
                "select * from auth_tokens where hash=$1 and expires_at>now() for update",
                [hash],
              )
            ).rows[0];
            if (!t)
              throw failure(
                400,
                "This link has expired or has already been used. Request another email.",
              );
            const passwordHash = await hashPassword(data.password);
            let u;
            if (t.purpose === "activate") {
              const owner =
                t.email ===
                  cleanEmail(env.OWNER_EMAIL || "youssef.f1@hotmail.com") &&
                !(await tx.query("select id from users where role='owner'"))
                  .rows.length;
              const invite = (
                await tx.query(
                  "select * from invitations where email=$1 and not revoked and accepted_at is null and expires_at>now() for update",
                  [t.email],
                )
              ).rows[0];
              if (!owner && !invite)
                throw failure(
                  403,
                  "Your invitation has expired or was revoked. Ask the owner to send a new one.",
                );
              const name = text(data.name, 80);
              u = (
                await tx.query(
                  "insert into users(email,name,password_hash,role,verified_at) values($1,$2,$3,$4,now()) returning *",
                  [t.email, name, passwordHash, owner ? "owner" : invite.role],
                )
              ).rows[0];
              if (invite)
                await tx.query(
                  "update invitations set accepted_at=now() where email=$1",
                  [t.email],
                );
            } else {
              u = (
                await tx.query(
                  "update users set password_hash=$1 where email=$2 and active returning *",
                  [passwordHash, t.email],
                )
              ).rows[0];
              if (!u) throw failure(400, "This account is unavailable.");
              await tx.query("delete from sessions where user_id=$1", [u.id]);
            }
            await tx.query("delete from auth_tokens where email=$1", [t.email]);
            return publicUser(u);
          });
          return safeJson({ ok: true, user: r }, 200, {
            "Set-Cookie": cookie("", true),
          });
        }
      }
      const user = await authenticate(request, db, request.method === "POST");
      if (action === "auth.logout") {
        await db.query("delete from sessions where id=$1", [user.session_id]);
        return safeJson({ ok: true }, 200, { "Set-Cookie": cookie("", true) });
      }
      if (action === "member.list") {
        const r = await db.query(
          `select id,email,name,role,active from users where verified_at is not null ${user.role === "owner" ? "" : "and active"} order by name`,
        );
        return safeJson({ data: r.rows });
      }
      if (action === "member.rename") {
        await db.query("update users set name=$1 where id=$2", [
          text(data.name, 80),
          user.id,
        ]);
        return safeJson({ ok: true });
      }
      if (action === "member.manage") {
        requireRole(user, ["owner"]);
        if (
          !validId(data.id) ||
          !roles.includes(data.role) ||
          typeof data.active !== "boolean"
        )
          throw failure(400, "Invalid membership.");
        await transaction(db, async (tx) => {
          const r = await tx.query(
            "update users set role=$1,active=$2 where id=$3 and role<>'owner' returning id",
            [data.role, data.active, data.id],
          );
          if (!r.rows.length)
            throw failure(400, "That member cannot be changed.");
          await tx.query("delete from sessions where user_id=$1", [data.id]);
        });
        return safeJson({ ok: true });
      }
      if (action === "invitation.list") {
        requireRole(user, ["owner"]);
        return safeJson({
          data: (
            await db.query("select * from invitations order by created_at desc")
          ).rows,
        });
      }
      if (action === "invitation.create") {
        requireRole(user, ["owner"]);
        const email = cleanEmail(data.email);
        if (!validEmail(email) || !roles.includes(data.role))
          throw failure(400, "Check the email and role.");
        await limit(db, `invite:${user.id}`, 30, 3600, env.AUTH_SECRET);
        if (
          (await db.query("select id from users where email=$1", [email])).rows
            .length
        )
          throw failure(
            400,
            "That person already has an account. Update their membership instead.",
          );
        await db.query(
          "insert into invitations(email,role,invited_by,expires_at) values($1,$2,$3,now()+interval '7 days') on conflict(email) do update set role=excluded.role,invited_by=excluded.invited_by,expires_at=excluded.expires_at,accepted_at=null,revoked=false",
          [email, data.role, user.id],
        );
        try {
          await issueEmail(db, email, "activate", sendMail, origin);
          return safeJson({
            ok: true,
            message:
              "Invitation sent. They can set their name and password from the email.",
          });
        } catch {
          return safeJson({
            ok: true,
            message:
              "Invitation saved, but the email could not be sent. Share the signup page so they can request a new link.",
          });
        }
      }
      if (action === "invitation.revoke") {
        requireRole(user, ["owner"]);
        const email = cleanEmail(data.email);
        await transaction(db, async (tx) => {
          await tx.query("update invitations set revoked=true where email=$1", [
            email,
          ]);
          await tx.query(
            "delete from auth_tokens where email=$1 and purpose='activate'",
            [email],
          );
        });
        return safeJson({ ok: true });
      }
      if (action === "chat.list") {
        const all = (
          await db.query("select * from conversations order by created_at")
        ).rows;
        return safeJson({ data: all.filter((c) => canRead(user, c)) });
      }
      if (action === "chat.direct") {
        if (!validId(data.other) || data.other === user.id)
          throw failure(400, "Choose another member.");
        const other = (
          await db.query(
            "select id from users where id=$1 and active and verified_at is not null",
            [data.other],
          )
        ).rows[0];
        if (!other) throw failure(404, "Member unavailable.");
        const [a, b] = [user.id, data.other].sort();
        const c = (
          await db.query(
            "insert into conversations(kind,title,direct_a,direct_b) values('direct','Private chat',$1,$2) on conflict(direct_a,direct_b) do update set title=excluded.title returning id",
            [a, b],
          )
        ).rows[0];
        return safeJson({ data: c.id });
      }
      if (action === "message.list") {
        await conversation(db, user, data.chat);
        let params = [data.chat];
        let before = "";
        if (data.before) {
          if (
            !validId(data.beforeId) ||
            !Number.isFinite(Date.parse(data.before))
          )
            throw failure(400, "Invalid message cursor.");
          params.push(data.before, data.beforeId);
          before = "and (created_at,id)<($2::timestamptz,$3::uuid)";
        }
        return safeJson({
          data: (
            await db.query(
              `select *,created_at::text as cursor_time from messages where conversation_id=$1 ${before} order by created_at desc,id desc limit 80`,
              params,
            )
          ).rows,
        });
      }
      if (action === "message.send") {
        await conversation(db, user, data.chat);
        await limit(db, `messages:${user.id}`, 60, 60, env.AUTH_SECRET);
        const body = text(data.body, 4000);
        if (data.replyTo) {
          const parent = await message(db, user, data.replyTo);
          if (parent.conversation_id !== data.chat)
            throw failure(400, "Replies must stay in the same chat.");
        }
        const r = await db.query(
          "insert into messages(conversation_id,author_id,body,reply_to) values($1,$2,$3,$4) returning id",
          [data.chat, user.id, body, data.replyTo || null],
        );
        return safeJson({ data: r.rows[0] });
      }
      if (action === "message.edit" || action === "message.delete") {
        const m = await message(db, user, data.id);
        if (
          m.author_id !== user.id &&
          (action === "message.edit" || !["owner", "admin"].includes(user.role))
        )
          throw failure(403, "This is not your message.");
        if (action === "message.edit")
          await db.query(
            "update messages set body=$1,edited_at=now() where id=$2",
            [text(data.body, 4000), m.id],
          );
        else await db.query("delete from messages where id=$1", [m.id]);
        return safeJson({ data: { id: m.id } });
      }
      if (action === "reaction.list") {
        await conversation(db, user, data.chat);
        return safeJson({
          data: (
            await db.query(
              "select r.* from reactions r join messages m on m.id=r.message_id where m.conversation_id=$1 order by m.created_at desc limit 3000",
              [data.chat],
            )
          ).rows,
        });
      }
      if (action === "reaction.toggle") {
        await message(db, user, data.id);
        if (!["❤️", "😂", "🔥", "👏", "👍", "😮"].includes(data.emoji))
          throw failure(400, "Unsupported reaction.");
        await limit(db, `reactions:${user.id}`, 120, 60, env.AUTH_SECRET);
        await transaction(db, async (tx) => {
          const r = await tx.query(
            "delete from reactions where message_id=$1 and user_id=$2 and emoji=$3 returning *",
            [data.id, user.id, data.emoji],
          );
          if (!r.rows.length)
            await tx.query(
              "insert into reactions(message_id,user_id,emoji) values($1,$2,$3) on conflict do nothing",
              [data.id, user.id, data.emoji],
            );
        });
        return safeJson({ ok: true });
      }
      if (action === "push.status")
        return safeJson({
          enabled: !!(
            await db.query(
              "select id from push_subscriptions where session_id=$1",
              [user.session_id],
            )
          ).rows.length,
        });
      if (action === "push.subscribe") {
        const s = data.subscription;
        if (
          !s ||
          !allowedPushEndpoint(s.endpoint) ||
          typeof s.keys?.p256dh !== "string" ||
          s.keys.p256dh.length > 300 ||
          typeof s.keys?.auth !== "string" ||
          s.keys.auth.length > 200
        )
          throw failure(400, "Invalid push subscription.");
        await db.query(
          "insert into push_subscriptions(user_id,session_id,endpoint,p256dh,auth) values($1,$2,$3,$4,$5) on conflict(endpoint) do update set user_id=excluded.user_id,session_id=excluded.session_id,p256dh=excluded.p256dh,auth=excluded.auth",
          [user.id, user.session_id, s.endpoint, s.keys.p256dh, s.keys.auth],
        );
        return safeJson({ ok: true });
      }
      if (action === "push.unsubscribe") {
        await db.query("delete from push_subscriptions where session_id=$1", [
          user.session_id,
        ]);
        return safeJson({ ok: true });
      }
      if (action === "contact.list") {
        requireRole(user, ["owner", "admin"]);
        const page = Math.max(
          1,
          Math.min(10000, Math.floor(Number(data.page) || 1)),
        );
        const rows = (
          await db.query(
            "select id,name,email,subject,message,created_at from contact_submissions order by created_at desc,id desc limit 51 offset $1",
            [(page - 1) * 50],
          )
        ).rows;
        return safeJson({
          submissions: rows.slice(0, 50),
          page,
          hasMore: rows.length > 50,
        });
      }
      throw failure(404, "This action is unavailable.");
    } catch (error) {
      if (!error.status)
        console.error("Member API error:", error.code || error.name);
      return safeJson(
        {
          error: error.status
            ? error.message
            : "The request could not be completed. Please try again.",
        },
        error.status || 500,
      );
    }
  };
}
export default createHandler();
