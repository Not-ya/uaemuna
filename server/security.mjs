import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
  createHmac,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
export const token = () => randomBytes(32).toString("base64url");
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export const failure = (status, message) =>
  Object.assign(new Error(message), { status });
export async function hashPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 10 ||
    password.length > 128
  )
    throw failure(400, "Use a password between 10 and 128 characters.");
  const salt = randomBytes(24).toString("hex");
  const hash = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt:${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password, stored) {
  const [, salt, hex] = String(stored || "").split(":");
  const expected = hex ? Buffer.from(hex, "hex") : Buffer.alloc(64);
  const actual = await scrypt(
    String(password || "").slice(0, 128),
    salt || "uaemuna-invalid-account",
    64,
    { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
  );
  return (
    expected.length === actual.length &&
    timingSafeEqual(expected, actual) &&
    !!stored
  );
}
export const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  active: u.active,
  email_confirmed_at: u.verified_at,
});
export const validEmail = (value) =>
  typeof value === "string" &&
  value.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const validId = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const canRead = (user, c) =>
  !!user?.active &&
  (c.kind === "direct"
    ? [c.direct_a, c.direct_b].includes(user.id)
    : (
        {
          main: ["owner", "admin", "executive", "staff", "volunteer", "member"],
          leadership: ["owner", "admin", "executive"],
          staff: ["owner", "admin", "executive", "staff"],
          volunteers: ["owner", "admin", "executive", "staff", "volunteer"],
        }[c.slug] || []
      ).includes(user.role));
export function sameOrigin(request, env = process.env) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw failure(403, "This request must come from the UAEMUNA website.");
}
export async function limit(db, key, max, seconds, secret) {
  if (!secret || secret.length < 32)
    throw failure(503, "Account security is awaiting configuration.");
  const hashed = createHmac("sha256", secret).update(key).digest("hex");
  const r = await db.query(
    `insert into rate_limits(key,count,reset_at) values($1,1,now()+($2 * interval '1 second')) on conflict(key) do update set count=case when rate_limits.reset_at<now() then 1 else rate_limits.count+1 end,reset_at=case when rate_limits.reset_at<now() then excluded.reset_at else rate_limits.reset_at end returning count`,
    [hashed, seconds],
  );
  if (r.rows[0].count > max)
    throw failure(429, "Too many attempts. Please wait before trying again.");
}
export function allowedPushEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    const allowed =
      [
        "fcm.googleapis.com",
        "web.push.apple.com",
        "updates.push.services.mozilla.com",
      ].includes(u.hostname) || u.hostname.endsWith(".notify.windows.com");
    return (
      allowed &&
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443")
    );
  } catch {
    return false;
  }
}
export function cookie(value, expired = false) {
  return `__Host-uaemuna_session=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${expired ? 0 : 604800}`;
}
export async function authenticate(request, db, csrf = false) {
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("__Host-uaemuna_session="))
    ?.split("=")[1];
  if (!raw) throw failure(401, "Please sign in.");
  const r = await db.query(
    `select u.*,s.id session_id,s.csrf from sessions s join users u on u.id=s.user_id where s.hash=$1 and s.expires_at>now() and u.active and u.verified_at is not null`,
    [digest(raw)],
  );
  const u = r.rows[0];
  if (!u) throw failure(401, "Your session has expired. Please sign in again.");
  if (csrf) {
    const sent = Buffer.from(request.headers.get("x-csrf-token") || "");
    const actual = Buffer.from(u.csrf);
    if (sent.length !== actual.length || !timingSafeEqual(sent, actual))
      throw failure(403, "Refresh the page and try again.");
  }
  return u;
}
