import pg from "pg";
let pool;
export function database() {
  if (!pool) {
    if (!process.env.DATABASE_URL)
      throw Object.assign(
        new Error("Member services are awaiting their database connection."),
        { status: 503 },
      );
    const url = new URL(process.env.DATABASE_URL);
    const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
      url.searchParams.delete(key);
    pool = new pg.Pool({
      connectionString: url.toString(),
      max: 3,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 10000,
      ssl: local ? false : { rejectUnauthorized: true },
    });
  }
  return pool;
}
export async function transaction(db, fn) {
  const connection = await db.connect();
  try {
    await connection.query("begin");
    const result = await fn(connection);
    await connection.query("commit");
    return result;
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally {
    connection.release();
  }
}
