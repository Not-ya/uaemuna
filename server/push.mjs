import webpush from "web-push";
import { database } from "./db.mjs";
import {
  authenticate,
  sameOrigin,
  failure,
  validId,
  canRead,
  allowedPushEndpoint,
} from "./security.mjs";
export function createPushHandler({
  getDb = database,
  env = process.env,
  sendNotification = (...args) => webpush.sendNotification(...args),
} = {}) {
  return async (request, context) => {
    try {
      if (request.method !== "POST") throw failure(405, "Method not allowed.");
      sameOrigin(request);
      const db = getDb();
      const user = await authenticate(request, db, true);
      const data = await request.json();
      if (!validId(data.messageId)) throw failure(400, "Invalid message.");
      const m = (
        await db.query("select * from messages where id=$1", [data.messageId])
      ).rows[0];
      if (
        !m ||
        m.author_id !== user.id ||
        Date.now() - new Date(m.created_at).getTime() > 300000
      )
        throw failure(403, "Message unavailable.");
      const c = (
        await db.query("select * from conversations where id=$1", [
          m.conversation_id,
        ])
      ).rows[0];
      if (!canRead(user, c)) throw failure(403, "Conversation unavailable.");
      const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env;
      if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT)
        throw failure(503, "Push is not configured.");
      webpush.setVapidDetails(
        VAPID_SUBJECT,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY,
      );
      const all = (
        await db.query(
          "select p.*,u.role,u.active from push_subscriptions p join users u on u.id=p.user_id join sessions s on s.id=p.session_id where u.active and u.verified_at is not null and s.expires_at>now() and p.user_id<>$1",
          [user.id],
        )
      ).rows;
      const recipients = all.filter((p) => canRead({ ...p, id: p.user_id }, c));
      const payload = JSON.stringify({
        body: "You have a new message in the member hub.",
        url: `/dashboard/?chat=${c.id}`,
        tag: `chat-${c.id}`,
      });
      for (let i = 0; i < recipients.length; i += 10)
        await Promise.all(
          recipients.slice(i, i + 10).map(async (p) => {
            if (!allowedPushEndpoint(p.endpoint)) return;
            const claim = await db.query(
              "insert into push_deliveries(message_id,subscription_id) values($1,$2) on conflict do nothing returning message_id",
              [m.id, p.id],
            );
            if (!claim.rows.length) return;
            try {
              await sendNotification(
                {
                  endpoint: p.endpoint,
                  keys: { p256dh: p.p256dh, auth: p.auth },
                },
                payload,
                { TTL: 3600, timeout: 10000 },
              );
            } catch (error) {
              if ([404, 410].includes(error.statusCode))
                await db.query("delete from push_subscriptions where id=$1", [
                  p.id,
                ]);
              else
                await db.query(
                  "delete from push_deliveries where message_id=$1 and subscription_id=$2",
                  [m.id, p.id],
                );
            }
          }),
        );
      return new Response(null, { status: 200 });
    } catch (error) {
      console.error("Push delivery:", error.status || error.code || error.name);
      return new Response(null, { status: error.status || 500 });
    }
  };
}
export default createPushHandler();
