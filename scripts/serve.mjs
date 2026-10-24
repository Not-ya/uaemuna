import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import members from "../server/api.mjs";
import push from "../server/push.mjs";
import contact from "../server/contact.mjs";
import partners from "../server/partners.mjs";
import email from "../server/email-sender.mjs";
if (!fs.existsSync("dist/index.html")) await import("./build.mjs");
const root = path.resolve("dist");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".webp": "image/webp",
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://" + req.headers.host);
      if (url.pathname.startsWith("/.netlify/functions/")) {
        const handler =
          url.pathname === "/.netlify/functions/members"
            ? members
            : url.pathname === "/.netlify/functions/email"
              ? email
              : url.pathname === "/.netlify/functions/partners"
                ? partners
                : url.pathname === "/.netlify/functions/contact"
                  ? contact
                  : url.pathname ===
                      "/.netlify/functions/push-message-background"
                    ? push
                    : null;
        if (!handler) {
          res.writeHead(404);
          res.end();
          return;
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (
            size >
            (url.pathname === "/.netlify/functions/partners"
              ? 3 * 1024 * 1024
              : 20000)
          ) {
            res.writeHead(413);
            res.end();
            return;
          }
          chunks.push(chunk);
        }
        const request = new Request(url, {
          method: req.method,
          headers: req.headers,
          body: req.method === "GET" ? undefined : Buffer.concat(chunks),
        });
        const result = await handler(request, { ip: req.socket.remoteAddress });
        res.writeHead(result.status, Object.fromEntries(result.headers));
        res.end(Buffer.from(await result.arrayBuffer()));
        return;
      }
      let name;
      try {
        name = decodeURIComponent(url.pathname);
      } catch {
        res.writeHead(400);
        res.end("Bad request");
        return;
      }
      let file = path.resolve(root, "." + name);
      if (!file.startsWith(root + path.sep) && file !== root) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory())
        file = path.join(file, "index.html");
      if (!fs.existsSync(file)) {
        res.statusCode = 404;
        file = path.join(root, "404.html");
      }
      res.setHeader(
        "Content-Type",
        types[path.extname(file)] || "application/octet-stream",
      );
      res.setHeader("Referrer-Policy", "no-referrer");
      fs.createReadStream(file).pipe(res);
    } catch {
      res.writeHead(500);
      res.end("Request unavailable");
    }
  })
  .listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
    console.log(
      "Development server running on port " + (process.env.PORT || 3000),
    ),
  );
