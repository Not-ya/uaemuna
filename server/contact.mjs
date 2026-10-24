import { database } from "./db.mjs";
import {
  sameOrigin,
  limit,
  validEmail,
  validId,
  failure,
} from "./security.mjs";
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
export function createContactHandler({
  getDb = database,
  env = process.env,
} = {}) {
  return async (request, context = {}) => {
    const wantsJson = request.headers
      .get("content-type")
      ?.includes("application/json");
    try {
      if (request.method !== "POST")
        throw failure(405, "Use the contact form to send a message.");
      sameOrigin(request, env);
      const raw = await request.text();
      if (raw.length > 20000) throw failure(413, "Your message is too long.");
      let data;
      try {
        data = wantsJson
          ? JSON.parse(raw)
          : Object.fromEntries(new URLSearchParams(raw));
      } catch {
        throw failure(400, "Please check your message and try again.");
      }
      const success = () =>
        wantsJson
          ? json({ ok: true })
          : new Response(null, {
              status: 303,
              headers: { Location: "/thank-you/", "Cache-Control": "no-store" },
            });
      if (data.website) return success();
      const name = typeof data.name === "string" ? data.name.trim() : "";
      const email =
        typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
      const subject =
        typeof data.subject === "string" ? data.subject.trim() : "";
      const message =
        typeof data.message === "string" ? data.message.trim() : "";
      if (
        !name ||
        name.length > 150 ||
        !validEmail(email) ||
        subject.length > 200 ||
        !message ||
        message.length > 10000
      )
        throw failure(
          400,
          "Please enter your name, a valid email, and a message.",
        );
      if (data.request_id && !validId(data.request_id))
        throw failure(400, "Please reload the contact page and try again.");
      const db = getDb();
      await limit(db, "contact:" + context.ip, 10, 3600, env.AUTH_SECRET);
      await db.query(
        "insert into contact_submissions(request_id,name,email,subject,message) values($1,$2,$3,$4,$5) on conflict(request_id) do nothing",
        [data.request_id || null, name, email, subject, message],
      );
      return success();
    } catch (error) {
      if (!error.status)
        console.error("Contact submission:", error.code || error.name);
      const status = error.status || 503;
      const message = error.status
        ? error.message
        : "Your message could not be saved right now. Please try again, or email uaemodeluna@gmail.com.";
      if (wantsJson) return json({ error: message }, status);
      return new Response(
        `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UAEMUNA</title><link rel="stylesheet" href="/style.css"><main class="wrap section"><h1>Message not sent yet</h1><p>${message}</p><a href="/contact/">Return to contact</a></main></html>`,
        {
          status,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }
  };
}
export default createContactHandler();
