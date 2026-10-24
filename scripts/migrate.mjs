import fs from "node:fs";
import { database } from "../server/db.mjs";
const db = database();
try {
  await db.query(
    fs.readFileSync(
      new URL("../database/001_members.sql", import.meta.url),
      "utf8",
    ),
  );
  console.log("Member database migration completed.");
} finally {
  await db.end();
}
