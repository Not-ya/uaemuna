import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith(".html")) files.push(p);
  }
}
walk("dist");
test("all internal page, asset, and fragment links resolve", () => {
  assert.equal(files.length, 17);
  for (const file of files) {
    const html = fs.readFileSync(file, "utf8");
    for (const m of html.matchAll(/(?:href|src)="([^" ]+)"/g)) {
      let url = m[1];
      if (!url.startsWith("/") && !url.startsWith("#")) continue;
      const [route, fragment] = url.split("#");
      let target = route ? path.join("dist", route) : file;
      if (fs.existsSync(target) && fs.statSync(target).isDirectory())
        target = path.join(target, "index.html");
      assert.ok(fs.existsSync(target), `${file}: missing ${url}`);
      if (fragment)
        assert.ok(
          fs.readFileSync(target, "utf8").includes(`id="${fragment}"`),
          `${file}: missing fragment ${url}`,
        );
    }
  }
});
test("contact form posts to its own database-backed endpoint", () => {
  const html = fs.readFileSync("dist/contact/index.html", "utf8");
  for (const token of [
    'method="POST"',
    'name="website"',
    'name="request_id"',
    'action="/.netlify/functions/contact"',
    'name="name"',
    'name="email"',
    'name="message"',
  ])
    assert.ok(html.includes(token), token);
});
test("all four original application destinations and eight FAQs are preserved", () => {
  const data = JSON.parse(fs.readFileSync("content.json"));
  assert.equal(data.applications.length, 4);
  assert.equal(data.faq.length, 8);
  const page = fs.readFileSync("dist/registration/index.html", "utf8");
  for (const a of data.applications)
    assert.ok(page.includes(a.url.replaceAll("&", "&amp;")));
  const faq = fs.readFileSync("dist/faq/index.html", "utf8");
  for (const f of data.faq)
    assert.ok(faq.includes(f.question.replaceAll("'", "&#39;")));
});
test("no legacy credential storage or analytics is carried into output", () => {
  for (const file of files) {
    const html = fs.readFileSync(file, "utf8");
    assert.ok(
      !/localStorage|manus-analytics|plausible\.io|type="password"/.test(html),
    );
  }
});
test("every page uses the UAEMUNA title, original emblem, and theme control", () => {
  for (const file of files) {
    const html = fs.readFileSync(file, "utf8");
    assert.ok(html.includes("<title>UAEMUNA</title>"), file);
    assert.ok(html.includes('src="/images/uaemuna-emblem.png"'), file);
    assert.ok(html.includes('class="theme-toggle"'), file);
    assert.ok(
      html.indexOf('src="/theme-init.js"') < html.indexOf('href="/style.css"'),
      file,
    );
  }
});
test("both conference banners appear on home and partners pages", () => {
  for (const file of ["dist/index.html", "dist/partners/index.html"]) {
    const html = fs.readFileSync(file, "utf8");
    for (const banner of ["valormun-banner.webp", "aaiomun-banner.webp"]) {
      assert.ok(html.includes(`/images/${banner}`), file);
      assert.ok(fs.statSync(`dist/images/${banner}`).size > 0);
    }
  }
});

test("Applications are reachable from the main navigation and mobile header", () => {
  for (const file of files) {
    const html = fs.readFileSync(file, "utf8");
    assert.ok(html.includes('href="/registration/"'), file);
    assert.ok(html.includes('class="quick-apply"'), file);
    const nav = html.split('id="navigation"')[1].split("</nav>")[0];
    assert.ok(nav.includes("Applications"), file);
  }
});
