# UAEMUNA

A responsive, statically generated website for the United Arab Emirates Model United Nations Association. Node 24; no third-party build dependencies.

## Develop

```sh
npm run build
npm test
npm start
```

The development server uses port 3000 (override with `PORT`). Rebuild after edits. Content lives in `content.json` and `scripts/build.mjs`; styles and client navigation live in `public/`. Generated files go to ignored `dist/`.

## Deploy on Netlify

Import this repository in Netlify. Use `npm run build` as the build command and `dist` as the publish directory; `netlify.toml` supplies these defaults. Alternatively, build locally and upload the contents of `dist/` through Netlify's manual deploy flow.

Enable Netlify form detection and deploy the generated HTML. The contact form is a static Netlify Form named `contact`, with a honeypot, required fields, and a thank-you destination. After deployment, submit a real test message and confirm it appears in Netlify Forms; configure email notifications there. Local preview does not process form submissions. No deployment or form receipt has been verified yet.

Member login deliberately links to the existing site's portal. This repository has no copy of its database or authentication server and never accepts member passwords. A full portal migration requires authorized backend/database access and a separate implementation.

Before launch, review the pricing inconsistency carried over from the original site (free services vs a quotation FAQ), pending announcements, and legal policy text. Existing facts and names were retained; no current conference dates or new team members were invented.

## Source preservation

See `docs/source-audit.json` for rendered text and links from all original routes; `docs/source-assets.json` records original media URLs. `docs/migration.md` maps migrated content and remaining limits. Audit files are not published to the website.
