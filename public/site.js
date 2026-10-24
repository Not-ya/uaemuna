const button = document.querySelector(".menu-toggle");
const nav = document.querySelector("#navigation");
button?.addEventListener("click", () => {
  const open = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(open));
  nav.classList.toggle("open", open);
});

const themeButton = document.querySelector(".theme-toggle");
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === "dark";
  themeButton?.setAttribute("aria-pressed", String(dark));
  themeButton?.setAttribute(
    "aria-label",
    `Switch to ${dark ? "light" : "dark"} mode`,
  );
  const label = themeButton?.querySelector(".theme-label");
  if (label) label.textContent = dark ? "Light mode" : "Dark mode";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#111c19" : "#f6f5ef");
}
applyTheme(document.documentElement.dataset.theme || "light");
themeButton?.addEventListener("click", () => {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try {
    localStorage.setItem("uaemuna-theme", next);
  } catch {}
  applyTheme(next);
});
systemTheme.addEventListener("change", (event) => {
  let saved;
  try {
    saved = localStorage.getItem("uaemuna-theme");
  } catch {}
  if (saved !== "dark" && saved !== "light")
    applyTheme(event.matches ? "dark" : "light");
});

// Form values stay in place on failure; only a saved submission reaches thank-you.
const contactForm = document.querySelector("#contact-form");
if (contactForm) {
  const key = contactForm.querySelector('[name="request_id"]');
  key.value = crypto.randomUUID();
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = contactForm.querySelector('button[type="submit"]');
    const status = document.querySelector("#contact-status");
    submit.disabled = true;
    status.textContent = "Sending your message…";
    try {
      const response = await fetch(contactForm.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(contactForm))),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "Could not send your message. Please try again.",
        );
      location.assign("/thank-you/");
    } catch (error) {
      status.textContent =
        error.message ||
        "Could not send. Please try again or email uaemodeluna@gmail.com.";
      submit.disabled = false;
    }
  });
}
const escapePublic = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
async function loadPublicPartners() {
  const grids = [...document.querySelectorAll("[data-live-partners]")];
  if (!grids.length) return;
  try {
    const response = await fetch("/.netlify/functions/partners");
    if (!response.ok) throw new Error();
    const { partners } = await response.json();
    for (const grid of grids) {
      grid.innerHTML = partners.length
        ? partners
            .map(
              (p) =>
                `<a class="partner" href="${escapePublic(p.website)}" target="_blank" rel="noopener noreferrer">${p.bannerUrl ? `<img class="conference-banner" src="${escapePublic(p.bannerUrl)}" alt="${escapePublic(p.name)} conference banner" loading="lazy">` : `<div class="partner-placeholder" aria-hidden="true">${escapePublic(p.name.slice(0, 2).toUpperCase())}</div>`}<div class="partner-content"><h3>${escapePublic(p.name)}</h3><p>${escapePublic(p.description)}</p><span class="text-link">Visit conference website <span aria-hidden="true">↗</span></span></div></a>`,
            )
            .join("")
        : '<p>New partnerships are on the way. Want to work together? <a href="/contact/">Let’s talk.</a></p>';
      grid.setAttribute("aria-busy", "false");
      activateReveals(grid);
    }
  } catch {
    for (const grid of grids) {
      grid.innerHTML =
        '<p>Partners couldn’t load right now. <button class="subtle-button" data-retry-partners>Try again</button></p>';
      grid.setAttribute("aria-busy", "false");
      grid
        .querySelector("button")
        .addEventListener("click", loadPublicPartners);
    }
  }
}
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const revealObserver =
  "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries)
            if (entry.isIntersecting) {
              entry.target.classList.remove("reveal-pending");
              entry.target.classList.add("revealed");
              revealObserver.unobserve(entry.target);
            }
        },
        { threshold: 0.08 },
      )
    : null;
function activateReveals(parent = document) {
  if (reduceMotion.matches || !revealObserver) return;
  parent
    .querySelectorAll(
      ".section-heading,.service-card,.partner,.application,.team article,.cta",
    )
    .forEach((element, index) => {
      if (element.getBoundingClientRect().top < innerHeight * 0.9) return;
      element.classList.add("reveal-pending", "reveal-step-" + (index % 3));
      revealObserver.observe(element);
    });
}
reduceMotion.addEventListener("change", (event) => {
  if (event.matches) {
    document
      .querySelectorAll(".reveal-pending")
      .forEach((n) => n.classList.remove("reveal-pending"));
    revealObserver?.disconnect();
  }
});
activateReveals();
loadPublicPartners();
