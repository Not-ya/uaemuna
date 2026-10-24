import { database, transaction } from "./db.mjs";
import { mailer } from "./mail.mjs";
import {
  authenticate,
  sameOrigin,
  failure,
  validEmail,
  validId,
  limit,
} from "./security.mjs";
import { correspondenceEmail } from "./email-template.mjs";
export const senderRoles = ["owner", "admin", "executive"];
export function signatureFor(user) {
  return {
    name: (user.name || user.email.split("@")[0])
      .replace(/[\r\n]/g, " ")
      .trim(),
    title: {
      owner: "Founder & CEO",
      admin: "Administrator",
      executive: "Executive Team",
    }[user.role],
    email: user.email,
  };
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
export function createEmailSender({
  getDb = database,
  env = process.env,
  sendMail = mailer(env),
} = {}) {
  return async (request, context = {}) => {
    try {
      if (!["GET", "POST"].includes(request.method))
        throw failure(405, "Method not allowed.");
      if (request.method === "POST") sameOrigin(request);
      const db = getDb(),
        user = await authenticate(request, db, request.method === "POST");
      if (!senderRoles.includes(user.role))
        throw failure(
          403,
          "Email sending is available to leadership and admins only.",
        );
      const signature = signatureFor(user),
        url = new URL(request.url);
      if (request.method === "GET") {
        if (url.searchParams.get("action") === "history") {
          const page = Math.max(
            1,
            Math.min(
              10000,
              Math.floor(Number(url.searchParams.get("page")) || 1),
            ),
          );
          const rows = (
            await db.query(
              "select id,recipient,subject,body,sender_name,sender_title,reply_to,case when status='sending' and created_at<now()-interval '5 minutes' then 'uncertain' else status end as status,created_at,sent_at from outbound_emails where sender_id=$1 order by created_at desc,id desc limit 26 offset $2",
              [user.id, (page - 1) * 25],
            )
          ).rows;
          return json({
            emails: rows.slice(0, 25),
            page,
            hasMore: rows.length > 25,
          });
        }
        return json({
          signature,
          from: env.MAIL_FROM || "UAEMUNA <uaemodeluna@gmail.com>",
          limitPerHour: 20,
        });
      }
      const raw = await request.text();
      if (raw.length > 20000)
        throw failure(413, "Keep the message under 10,000 characters.");
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw failure(400, "Check your email details.");
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) throw failure(400,"Check your email details.");
      const recipient =
        typeof data.to === "string" ? data.to.trim().toLowerCase() : "";
      const subject =
        typeof data.subject === "string" ? data.subject.trim() : "";
      const body = typeof data.body === "string" ? data.body.trim() : "";
      if (
        !validEmail(recipient) ||
        /[<>,;:\r\n"\\\s]/.test(recipient) ||
        !subject ||
        subject.length > 200 ||
        /[\r\n]/.test(subject) ||
        !body ||
        body.length > 10000 ||
        !validId(data.requestId)
      )
        throw failure(
          400,
          "Enter one valid recipient, a subject, and a message of up to 10,000 characters.",
        );
      const claim = await transaction(db, async (tx) => {
        const created = (
          await tx.query(
            "insert into outbound_emails(sender_id,request_id,recipient,subject,body,sender_name,sender_title,reply_to,status) values($1,$2,$3,$4,$5,$6,$7,$8,'sending') on conflict(sender_id,request_id) do nothing returning *",
            [
              user.id,
              data.requestId,
              recipient,
              subject,
              body,
              signature.name,
              signature.title,
              signature.email,
            ],
          )
        ).rows[0];
        if (!created) {
          const prior = (
            await tx.query(
              "select * from outbound_emails where sender_id=$1 and request_id=$2 for update",
              [user.id, data.requestId],
            )
          ).rows[0];
          if (
            prior.recipient !== recipient ||
            prior.subject !== subject ||
            prior.body !== body
          )
            throw failure(
              409,
              "This message reference is already in use. Start a new email.",
            );
          if (prior.status === "sent")
            return { alreadySent: true, id: prior.id };
          if (prior.status !== "failed")
            throw failure(
              409,
              "This message may already be sending. Check your sent history and Gmail before trying a new email.",
            );
          await tx.query(
            "update outbound_emails set status='sending',sender_name=$2,sender_title=$3,reply_to=$4 where id=$1",
            [prior.id, signature.name, signature.title, signature.email],
          );
          await limit(tx, "email:sender:" + user.id, 20, 3600, env.AUTH_SECRET);
          await limit(tx, "email:organisation-hour", 50, 3600, env.AUTH_SECRET);
          await limit(
            tx,
            "email:organisation-day",
            250,
            86400,
            env.AUTH_SECRET,
          );
          return { id: prior.id };
        }
        await limit(tx, "email:sender:" + user.id, 20, 3600, env.AUTH_SECRET);
        await limit(tx, "email:organisation-hour", 50, 3600, env.AUTH_SECRET);
        await limit(tx, "email:organisation-day", 250, 86400, env.AUTH_SECRET);
        return { id: created.id };
      });
      if (claim.alreadySent)
        return json({ status: "sent", id: claim.id, alreadySent: true });
      const content = correspondenceEmail({ subject, body, signature });
      let receipt;
      try {
        receipt = await sendMail(
          { address: recipient },
          subject,
          content.text,
          {
            html: content.html,
            replyTo: { name: signature.name, address: signature.email },
          },
        );
      } catch (error) {
        const knownFailure = ["EAUTH", "EENVELOPE"].includes(
            error.code,
          ),
          status = knownFailure ? "failed" : "uncertain";
        await db.query("update outbound_emails set status=$1 where id=$2", [
          status,
          claim.id,
        ]);
        return json(
          {
            error: knownFailure
              ? "Your email was not sent. Please try again later or contact the owner."
              : "We could not confirm whether Gmail accepted this email. Check Gmail’s Sent folder before sending it again.",
            status,
            id: claim.id,
          },
          503,
        );
      }
      try {
        await db.query(
          "update outbound_emails set status='sent',provider_message_id=$1,sent_at=now() where id=$2",
          [receipt?.messageId || null, claim.id],
        );
      } catch {
        console.error("Email accepted but history could not be updated");
        return json(
          {
            status: "uncertain",
            id: claim.id,
            message:
              "Gmail accepted this email, but its history could not be updated. Do not resend it.",
          },
          202,
        );
      }
      return json({ status: "sent", id: claim.id });
    } catch (error) {
      if (!error.status)
        console.error("Email sender:", error.code || error.name);
      return json(
        {
          error: error.status
            ? error.message
            : "Email could not be processed. Please try again.",
        },
        error.status || 503,
      );
    }
  };
}
export default createEmailSender();
