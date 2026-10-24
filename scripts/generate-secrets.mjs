import fs from "node:fs";
import { randomBytes } from "node:crypto";
import webpush from "web-push";
const path = ".env.generated";
if (fs.existsSync(path)) {
  console.log(`${path} already exists; no secrets were overwritten.`);
  process.exit(0);
}
const keys = webpush.generateVAPIDKeys();
fs.writeFileSync(
  path,
  `AUTH_SECRET=${randomBytes(48).toString("base64url")}\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=mailto:uaemodelun@gmail.com\n`,
  { flag: "wx", mode: 0o600 },
);
console.log(
  `Created ${path}. Import these values into Netlify Functions environment settings; keep the file private. No values were printed.`,
);
