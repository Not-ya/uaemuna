import nodemailer from "nodemailer";
function transport(env) {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.MAIL_FROM)
    throw Object.assign(new Error("Account email is awaiting configuration."), { status: 503 });
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 465),
    secure: Number(env.SMTP_PORT || 465) === 465,
    requireTLS: Number(env.SMTP_PORT || 465) !== 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 10000,
    socketTimeout: 15000,
    tls: { rejectUnauthorized: true },
  });
}
export function mailer(env = process.env) {
  return async (to, subject, text) => {
    const client = transport(env);
    try { await client.sendMail({ from: env.MAIL_FROM, to, subject, text }); }
    finally { client.close(); }
  };
}
export async function verifyMailer(env = process.env) {
  const client = transport(env);
  try { await client.verify(); return true; }
  finally { client.close(); }
}
