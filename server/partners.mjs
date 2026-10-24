import { database, transaction } from "./db.mjs";
import { authenticate, sameOrigin, failure, validId } from "./security.mjs";
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
function publicPartner(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    website: row.website,
    published: row.published,
    position: row.position,
    bannerUrl: row.has_banner
      ? `/.netlify/functions/partners?action=banner&id=${row.id}&v=${row.banner_version}`
      : row.banner_path || "",
  };
}
const fields =
  "id,name,description,website,published,position,banner_path,banner_version,(banner_data is not null) as has_banner";
function banner(input) {
  if (
    !input ||
    typeof input.data !== "string" ||
    !["image/png", "image/jpeg", "image/webp"].includes(input.type) ||
    input.data.length > 2800000 ||
    !/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      input.data,
    )
  )
    throw failure(400, "Choose a PNG, JPEG or WebP banner up to 2 MB.");
  const bytes = Buffer.from(input.data, "base64");
  const mime = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? "image/jpeg"
      : bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP"
        ? "image/webp"
        : null;
  if (
    bytes.length > 2 * 1024 * 1024 ||
    bytes.length < 12 ||
    mime !== input.type
  )
    throw failure(
      400,
      "That file is not a supported banner image. Use PNG, JPEG or WebP up to 2 MB.",
    );
  return { bytes, type: mime };
}
export function createPartnersHandler({ getDb = database } = {}) {
  return async (request) => {
    try {
      const url = new URL(request.url),
        db = getDb();
      if (request.method === "GET") {
        if (url.searchParams.get("action") === "banner") {
          const id = url.searchParams.get("id");
          if (!validId(id)) throw failure(404, "Banner unavailable.");
          const row = (
            await db.query(
              "select banner_data,banner_type,banner_version,published from partners where id=$1",
              [id],
            )
          ).rows[0];
          if (!row?.banner_data) throw failure(404, "Banner unavailable.");
          if (!row.published) {
            try {
              const u = await authenticate(request, db);
              if (u.role !== "owner") throw new Error();
            } catch {
              throw failure(404, "Banner unavailable.");
            }
          }
          const tag = '"' + row.banner_version + '"';
          const headers = {
            "Content-Type": row.banner_type,
            "X-Content-Type-Options": "nosniff",
            ETag: tag,
            "Cache-Control": row.published
              ? "public,max-age=3600"
              : "private,no-store",
          };
          if (request.headers.get("if-none-match") === tag)
            return new Response(null, { status: 304, headers });
          return new Response(row.banner_data, { headers });
        }
        return json({
          partners: (
            await db.query(
              `select ${fields} from partners where published order by position,created_at`,
            )
          ).rows.map(publicPartner),
        });
      }
      if (request.method !== "POST") throw failure(405, "Method not allowed.");
      sameOrigin(request);
      const owner = await authenticate(request, db, true);
      if (owner.role !== "owner")
        throw failure(403, "Only the owner can manage partners.");
      const raw = await request.text();
      if (raw.length > 3 * 1024 * 1024)
        throw failure(413, "Choose a banner up to 2 MB.");
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw failure(400, "Invalid partner details.");
      }
      if (data.action === "list")
        return json({
          partners: (
            await db.query(
              `select ${fields} from partners order by position,created_at`,
            )
          ).rows.map(publicPartner),
        });
      if (data.action === "delete") {
        if (!validId(data.id)) throw failure(400, "Invalid partner.");
        await db.query("delete from partners where id=$1", [data.id]);
        return json({ ok: true });
      }
      if (data.action !== "save") throw failure(400, "Invalid partner action.");
      const name = typeof data.name === "string" ? data.name.trim() : "";
      const description =
        typeof data.description === "string" ? data.description.trim() : "";
      let website;
      try {
        website = new URL(data.website);
        if (
          website.protocol !== "https:" ||
          website.username ||
          website.password
        )
          throw new Error();
      } catch {
        throw failure(
          400,
          "Enter a full HTTPS website address for the partner.",
        );
      }
      const position = Number(data.position);
      if (
        !name ||
        name.length > 100 ||
        description.length > 1500 ||
        website.href.length > 2000 ||
        !Number.isInteger(position) ||
        position < 0 ||
        position > 10000 ||
        typeof data.published !== "boolean" ||
        (data.id && !validId(data.id))
      )
        throw failure(400, "Check the name, description and display order.");
      const image = data.banner ? banner(data.banner) : null;
      const saved = await transaction(db, async (tx) => {
        let id = data.id;
        if (id) {
          const existing = await tx.query(
            "update partners set name=$1,description=$2,website=$3,published=$4,position=$5,updated_at=now() where id=$6 returning id",
            [name, description, website.href, data.published, position, id],
          );
          if (!existing.rows.length) throw failure(404, "Partner unavailable.");
        } else {
          id = (
            await tx.query(
              "insert into partners(name,description,website,published,position) values($1,$2,$3,$4,$5) returning id",
              [name, description, website.href, data.published, position],
            )
          ).rows[0].id;
        }
        if (image)
          await tx.query(
            "update partners set banner_data=$1,banner_type=$2,banner_path=null,banner_version=gen_random_uuid(),updated_at=now() where id=$3",
            [image.bytes, image.type, id],
          );
        if (data.removeBanner && !image)
          await tx.query(
            "update partners set banner_data=null,banner_type=null,banner_path=null,banner_version=gen_random_uuid(),updated_at=now() where id=$1",
            [id],
          );
        return (
          await tx.query(`select ${fields} from partners where id=$1`, [id])
        ).rows[0];
      });
      return json({ partner: publicPartner(saved) });
    } catch (error) {
      if (!error.status)
        console.error("Partner request:", error.code || error.name);
      return json(
        {
          error: error.status
            ? error.message
            : "Partners could not be loaded. Please try again.",
        },
        error.status || 503,
      );
    }
  };
}
export default createPartnersHandler();
