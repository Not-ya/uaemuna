import { database } from "../../server/db.mjs";
export default async () => {
  if (!process.env.DATABASE_URL) return new Response(null, { status: 204 });
  const db = database();
  await db.query("delete from auth_tokens where expires_at<now()");
  await db.query("delete from sessions where expires_at<now()");
  await db.query("delete from rate_limits where reset_at<now()");
  return new Response(null, { status: 204 });
};
export const config = { schedule: "@daily" };
