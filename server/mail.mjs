import nodemailer from "nodemailer";
export function mailer(env = process.env) {
  return async (to, subject, text) => {
    if (
      !env.SMTP_HOST ||
      !env.SMTP_USER ||
      !env.SMTP_PASSWORD ||
      !env.MAIL_FROM
    )
      throw Object.assign(
        new Error("Account email is awaiting configuration."),
        { status: 503 },
      );
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 465),
      secure: Number(env.SMTP_PORT || 465) === 465,
      requireTLS: Number(env.SMTP_PORT || 465) !== 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      connectionTimeout: 10000,
      socketTimeout: 15000,
      tls: { rejectUnauthorized: true },
    });
    await transport.sendMail({ from: env.MAIL_FROM, to, subject, text });
  };
}
