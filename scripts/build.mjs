import { build } from "esbuild";
import fs from "node:fs";
const data = JSON.parse(fs.readFileSync("content.json", "utf8"));
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const link = (href, text, cls = "button") =>
  `<a class="${cls}" href="${esc(href)}">${text} <span aria-hidden="true">↗</span></a>`;
const nav = [
  ["/registration/", "Applications"],
  ["/about/", "About us"],
  ["/services/", "Our services"],
  ["/partners/", "Partners"],
  ["/faq/", "FAQ"],
  ["/contact/", "Contact"],
];
const services = [
  {
    n: "01",
    icon: "◎",
    title: "Professional photography",
    desc: "Every debate. Every breakthrough. Captured.",
    body: "Professional-grade photography and videography that captures the essence of your conference.",
  },
  {
    n: "02",
    icon: "↗",
    title: "Volunteer coordination",
    desc: "Great people. Seamless teamwork.",
    body: "Recruitment, training, scheduling, and on-site support for a team you can count on.",
  },
  {
    n: "03",
    icon: "⌘",
    title: "Event logistics",
    desc: "The details behind an exceptional event.",
    body: "From venue setup to the final session, we handle the moving parts so you can focus on diplomacy.",
  },
];
const serviceCards = () =>
  `<div class="cards">${services.map((s) => `<a class="service-card" href="/services/#service-${s.n}"><div class="card-top"><span>${s.n} /</span></div><h3>${s.title}</h3><p>${s.body}</p><span class="text-link">Explore service <span>↗</span></span></a>`).join("")}</div>`;
const partners = () =>
  `<div class="partner-grid" data-live-partners aria-busy="true"><p class="partners-loading" role="status">Loading our conference partners…</p><template>${[
    {
      name: "ValorMUN",
      image: "valormun-banner.webp",
      url: "https://valormun-dnl7epua.manus.space/",
      description:
        "A premier Model United Nations conference dedicated to fostering diplomatic excellence and global leadership.",
    },
    {
      name: "AAIOMUN",
      image: "aaiomun-banner.webp",
      url: "https://aaiomun2026-2huqjyfc.manus.space",
      description:
        "Al Ain International Online MUN — bringing delegates together through online Model United Nations.",
    },
  ]
    .map(
      (p) =>
        `<a href="${p.url}" class="partner"><img class="conference-banner" src="/images/${p.image}" alt="${p.name} conference banner" width="2048" height="${p.name === "ValorMUN" ? 979 : 910}" loading="lazy"><div class="partner-content"><h3>${p.name}</h3><p>${p.description}</p><span class="text-link">Visit conference website ↗</span></div></a>`,
    )
    .join("")}</template></div>`;
const team = () =>
  `<div class="team">${[
    ["Youssef Abdalla", "Founder & CEO"],
    ["Reem Alzeyoudi", "Founder & Director"],
    ["Raneem", "Founder & Coordinator"],
  ]
    .map(([name, role]) => `<article><h3>${name}</h3><p>${role}</p></article>`)
    .join("")}</div>`;
const heading = (tag, title, desc) =>
  `<section class="page-heading wrap"><p class="eyebrow">${tag}</p><h1>${title}</h1><p class="lead">${desc}</p></section>`;
const prose = (arr) =>
  arr
    .map((t) =>
      /^\d+\. |^Our |^What's Included:/.test(t)
        ? `<h2>${esc(t)}</h2>`
        : `<p>${esc(t)}</p>`,
    )
    .join("");
const cta = `<section class="cta wrap"><div><p class="eyebrow">ORGANISING A CONFERENCE?</p><h2>Got something in the works?</h2></div>${link("/contact/", "Let’s talk")}</section>`;
const pages = {};
pages[""] = {
  title: "Empowering future diplomats",
  body: `<section class="hero wrap"><div class="hero-copy"><p class="eyebrow"><span class="dot"></span> UNITED ARAB EMIRATES</p><h1>Your people.<br>Your next MUN.</h1><p class="lead">The debates, the late-night prep, the people you meet. We’re here for all of it — helping the UAE’s MUN community make things happen.</p><div class="actions">${link("/registration/", "Find your next MUN")}${link("/services/", "Our services", "plain-link")}</div></div><figure class="hero-identity"><img src="/images/uaemuna-emblem.png" alt="United Arab Emirates Model United Nations Association emblem" width="400" height="400" fetchpriority="high"><figcaption>United Arab Emirates<br>Model United Nations Association</figcaption></figure></section><section class="section wrap"><div class="section-heading"><div><p class="eyebrow">CONFERENCE SUPPORT</p><h2>Good conferences take good people.</h2></div><p>Practical support, from planning<br>through to the closing ceremony.</p></div>${serviceCards()}</section><section class="about-band"><div class="wrap split"><div><p class="eyebrow">ABOUT UAEMUNA</p><h2>A community for<br>young diplomats.</h2></div><div><p class="large-copy">We’re here to help students take part in Model United Nations and help organisers run their conferences well.</p><p>UAEMUNA empowers future diplomats and global leaders through international cooperation, professional conference support, and a shared commitment to excellence.</p>${link("/about/", "Meet the association", "plain-link")}</div></div></section><section class="section wrap"><div class="section-heading"><div><p class="eyebrow">OUR PARTNERS</p><h2>Meet our conference friends.</h2></div>${link("/partners/", "Our partnerships", "plain-link")}</div>${partners()}</section><section class="section wrap"><div class="section-heading"><div><p class="eyebrow">OUR FOUNDERS</p><h2>The people behind UAEMUNA.</h2></div>${link("/about/#leadership", "Our story", "plain-link")}</div>${team()}</section><section class="section wrap updates"><p class="eyebrow">FROM THE ASSOCIATION</p><h2>Association news.</h2><div class="news-row"><span>APRIL 2026</span><h3>UAEMUNA launches</h3><p>Official launch of UAEMUNA dedicated to supporting MUN excellence.</p></div><div class="news-row"><span>COMING SOON</span><h3>First conference partnership</h3><p>Announcements about our first official conference partnership.</p></div><div class="news-row"><span>COMING SOON</span><h3>Team expansion</h3><p>Growing our team to better serve the MUN community.</p></div></section>${cta}`,
};
pages.about = {
  title: "About us",
  body:
    heading(
      "THE ASSOCIATION",
      "About UAEMUNA",
      "United Arab Emirates Model United Nations Association. A community dedicated to the next generation of global leaders.",
    ) +
    `<section class="wrap split section"><div><h2>Our mission</h2><p>${esc(data.about[3])}</p></div><div><h2>Our vision</h2><p>${esc(data.about[5])}</p></div></section><section class="section wrap" id="leadership"><p class="eyebrow">OUR FOUNDERS</p><h2>Our founders</h2>${team()}<p class="reading">${esc(data.about.find((t) => t.startsWith("Our three founders")))}</p><h3>Our growing team</h3><p>More team members will be announced soon. ${link("/registration/", "View applications", "plain-link")}</p></section><section class="section wrap"><h2>Our values</h2><div class="values">${["Excellence", "Integrity", "Collaboration", "Empowerment"].map((t) => `<article><h3>${t}</h3><p>${esc(data.about[data.about.indexOf(t) + 1])}</p></article>`).join("")}</div></section>${cta}`,
};
const serviceContent = data.services
  .slice(2)
  .filter((t) => !["FREE", "INQUIRE ABOUT SERVICES"].includes(t));
pages.services = {
  title: "Our services",
  body:
    heading(
      "CONFERENCE SUPPORT",
      "Conference support",
      "Comprehensive support for Model United Nations conferences across the UAE.",
    ) +
    `<section class="wrap section"><p class="notice">The original website lists these services as free. Please confirm availability and your conference’s requirements with our team.</p>${serviceContent.map((t) => (t.match(/^[📷👥⚙]/u) ? `<h2 id="service-${String(serviceContent.filter((x) => x.match(/^[📷👥⚙]/u)).indexOf(t) + 1).padStart(2, "0")}">${esc(t.replace(/^[^A-Za-z]+/, ""))}</h2>` : t === "What's Included:" ? "<h3>What’s included</h3>" : `<p class="${t.startsWith("✓") ? "included" : "reading"}">${esc(t)}</p>`)).join("")}</section>${cta}`,
};
pages.partners = {
  title: "Our partners",
  body:
    heading(
      "BETTER TOGETHER",
      "Our conference partners",
      "We work with MUN conferences across the UAE that share our commitment to excellence and diplomatic education.",
    ) +
    `<section class="wrap section">${partners()}<h2>Interested in partnering?</h2><p class="reading">If your MUN conference would like to work with UAEMUNA for photography, volunteer coordination, logistics support, or other services, we’d love to hear from you.</p></section>${cta}`,
};
pages.faq = {
  title: "Frequently asked questions",
  body:
    heading(
      "A LITTLE CLARITY",
      "Frequently asked questions",
      "Everything you need to know about working with UAEMUNA.",
    ) +
    `<section class="wrap section reading">${data.faq.map((f, i) => `<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p>${i === 3 ? '<p class="notice">This answer is retained from the original site. The services page separately marks services as free. Contact us to confirm the terms for your event.</p>' : ""}</details>`).join("")}</section>${cta}`,
};
pages.registration = {
  title: "Join UAEMUNA",
  body:
    heading(
      "FIND YOUR PLACE",
      "Join UAEMUNA",
      "Join a conference, volunteer behind the scenes, or help lead the team. Pick your path below.",
    ) +
    `<section class="wrap section application-grid">${data.applications.map((a, i) => `<article class="application" id="apply-${i}"><span class="eyebrow">0${i + 1} / GET INVOLVED</span><h2>${esc(a.title)}</h2><p>${esc(a.description)}</p>${link(a.url, ["Apply to a conference", "Apply as a volunteer", "Apply to the executive team", "Apply as an advisor"][i])}<p class="application-note">Opens the original application form.</p></article>`).join("")}</section><section class="wrap section"><h2>Need a hand?</h2><p>Questions about applying? <a href="mailto:uaemodeluna@gmail.com">uaemodeluna@gmail.com</a></p></section>`,
};
pages.contact = {
  title: "Contact us",
  body:
    heading(
      "LET’S START A CONVERSATION",
      "Contact UAEMUNA",
      "Planning a conference, looking to volunteer, or simply curious? We’d love to hear from you.",
    ) +
    `<section class="wrap section contact-layout"><div><h2>Get in touch.</h2><p class="eyebrow">EMAIL</p><a class="contact-email" href="mailto:uaemodeluna@gmail.com">uaemodeluna@gmail.com ↗</a><p class="eyebrow">FIND OUR COMMUNITY</p><p><a href="https://instagram.com/uaemuna">Instagram ↗</a> &nbsp; <a href="https://tiktok.com/@uaemuna">TikTok ↗</a></p><p>United Arab Emirates</p></div><form id="contact-form" name="contact" method="POST" action="/.netlify/functions/contact"><input type="hidden" name="request_id" value=""><p hidden><label>Leave this empty<input name="website"></label></p><div class="form-row"><label>Your name<input name="name" autocomplete="name" required maxlength="150"></label><label>Email address<input name="email" type="email" autocomplete="email" required maxlength="254"></label></div><label>Subject<input name="subject" maxlength="200"></label><label>How can we help?<textarea name="message" rows="5" required maxlength="10000"></textarea></label><p class="small">By submitting, you agree to our <a href="/privacy/">privacy policy</a>. Please don’t include sensitive information.</p><p id="contact-status" role="status" aria-live="polite"></p><button class="button" type="submit">Send message ↗</button></form></section>`,
};
for (const key of ["privacy", "terms"])
  pages[key] = {
    title: key === "privacy" ? "Privacy policy" : "Terms & conditions",
    body:
      heading("THE DETAILS", data[key][0], data[key][1]) +
      `<section class="section wrap reading legal">${prose(data[key].slice(2))}${key === "privacy" ? "<h2>Contact form on this website</h2><p>Contact form submissions are stored in our PostgreSQL database and are visible only to the owner and authorised admins through the member inbox. We store your name, email address, subject, and message so our team can respond. Earlier submissions made through Netlify Forms remain in that service and are not automatically imported. This version does not include the old site’s analytics or a newsletter subscription form. Contact us at uaemodeluna@gmail.com for privacy requests.</p><h2>Member hub — October 2026 update</h2><p>When enabled, the member hub stores your email, display name, role, password hash, session records, messages, and reactions in our PostgreSQL database. Account verification, invitation, and password-reset emails are sent through our email provider. Member names and emails are visible to signed-in teammates. Group conversations are restricted by role; private chats are restricted to their participants in the application. Messages are not end-to-end encrypted, and authorised infrastructure administrators can access stored records. Owners and admins can see website contact submissions. Browser notifications are optional and store a delivery endpoint and encryption keys for the current signed-in device; notification previews do not contain message text. Signing out or resetting your password revokes the relevant session subscriptions. Contact us to request account or message deletion.</p>" : ""}</section>`,
  };
const memberShell =
  '<section class="member-shell wrap"><div id="member-app"><p class="member-loading" role="status">Opening the member space…</p></div></section><script defer src="/members.js"></script>';
for (const route of [
  "login",
  "dashboard",
  "create-account",
  "forgot-password",
  "reset-password",
  "set-password",
])
  pages[route] = { title: "UAEMUNA", body: memberShell };
pages["thank-you"] = {
  title: "Thank you",
  body:
    heading(
      "MESSAGE RECEIVED",
      "Thanks for reaching out.",
      "Your message has been submitted. We look forward to speaking with you.",
    ) + `<section class="wrap section">${link("/", "Back to home")}</section>`,
};
pages["404"] = {
  title: "Page not found",
  body:
    heading(
      "404",
      "Page not found",
      "This page doesn’t exist. Let’s get you back to the conversation.",
    ) + `<section class="wrap section">${link("/", "Back to home")}</section>`,
};
fs.mkdirSync("dist", { recursive: true });
fs.cpSync("public", "dist", { recursive: true });
for (const [slug, page] of Object.entries(pages)) {
  let html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UAEMUNA</title><meta name="description" content="UAEMUNA empowers future diplomats through Model United Nations conference support across the UAE. Photography, volunteers, and event logistics."><meta name="theme-color" content="#173f35"><link rel="icon" href="/images/uaemuna-emblem.png" type="image/png"><script src="/theme-init.js"></script><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/members.css"><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/images/uaemuna-emblem.png"><script defer src="/site.js"></script></head><body><a href="#main" class="skip-link">Skip to content</a><header class="header wrap"><a class="brand" href="/" aria-label="UAEMUNA home"><img class="brand-logo" src="/images/uaemuna-emblem.png" alt="" width="56" height="56"><span>UAEMUNA<small>MODEL UNITED NATIONS ASSOCIATION</small></span></a><nav id="navigation" aria-label="Main navigation">${nav.map(([h, t]) => `<a href="${h}" ${h === `/${slug}/` ? 'aria-current="page"' : ""}>${t}</a>`).join("")}${link("/login/", "Members", "button nav-cta")}</nav><div class="header-controls"><a class="quick-apply" href="/registration/">Apply ↗</a><button class="theme-toggle" type="button" aria-label="Switch to dark mode" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20 14a8 8 0 0 1-10-10 8.5 8.5 0 1 0 10 10Z"/></svg><span class="theme-label">Dark mode</span></button><button class="menu-toggle" aria-expanded="false" aria-controls="navigation">Menu <span>☰</span></button></div></header><main id="main">${page.body}</main><footer><div class="wrap footer-top"><div><a class="brand" href="/"><img class="brand-logo" src="/images/uaemuna-emblem.png" alt="" width="56" height="56"><span>UAEMUNA<small>MODEL UNITED NATIONS ASSOCIATION</small></span></a><p>Conference support and opportunities<br>for the UAE’s MUN community.</p><a href="mailto:uaemodeluna@gmail.com">uaemodeluna@gmail.com ↗</a></div><div><p class="eyebrow">EXPLORE</p>${nav.map(([h, t]) => `<a href="${h}">${t}</a>`).join("")}</div><div><p class="eyebrow">GET INVOLVED</p><a href="/registration/">Applications</a><a href="/login/">Member hub</a><a href="https://instagram.com/uaemuna">Instagram ↗</a><a href="https://tiktok.com/@uaemuna">TikTok ↗</a></div></div><div class="wrap footer-bottom"><span>© ${new Date().getUTCFullYear()} UAEMUNA · United Arab Emirates</span><div><a href="/privacy/">Privacy policy</a><a href="/terms/">Terms & conditions</a></div></div></footer></body></html>`;
  html = html.replaceAll(
    "↗",
    '<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 19L19 5M5 5h14v14"/></svg>',
  );
  const out =
    slug === "404"
      ? "dist/404.html"
      : slug
        ? `dist/${slug}/index.html`
        : "dist/index.html";
  fs.mkdirSync(out.slice(0, out.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(out, html);
}
console.log(`Built ${Object.keys(pages).length} static pages.`);

await build({
  entryPoints: ["src/members.js"],
  outfile: "dist/members.js",
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2022"],
});
