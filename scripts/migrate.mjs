import fs from "node:fs";
import { database } from "../server/db.mjs";
const db = database();
try {
  for (const file of fs
    .readdirSync(new URL("../database/", import.meta.url))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort()) {
    await db.query(
      fs.readFileSync(new URL("../database/" + file, import.meta.url), "utf8"),
    );
  }
  console.log("Member database migration completed.");
} finally {
  await db.end();
}
