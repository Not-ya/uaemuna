# UAEMUNA

The UAEMUNA public website and invitation-only member hub, deployed from GitHub to Netlify. Node 24, PostgreSQL, secure cookie sessions, authenticated SMTP email, database-backed contact submissions, and native Web Push. No Supabase account or SDK is used.

```sh
npm ci
npm run build
npm test
npm start
```

Netlify builds and tests with `npm run build && npm test` and publishes `dist/`; server endpoints are in `netlify/functions/`. `npm start` serves static pages and the real API locally on port 3000 (`PORT` overrides it). Rebuild after front-end edits. Public content is in `content.json` and `scripts/build.mjs`, browser member code in `src/members.js`, styles and original artwork in `public/`. The browser tab title is UAEMUNA; light/dark preference is supported throughout.

**Member services require runtime configuration:** follow [docs/member-setup.md](docs/member-setup.md) for PostgreSQL, SMTP, contact inbox, push keys, migration, and the owner bootstrap for `youssef.f1@hotmail.com`. Configuration is deliberately not fabricated. Passwords are hashed server-side with scrypt; session and activation tokens are stored hashed. The owner cannot create anyone’s password or read their private chats through the application. Account/role controls and room access are checked on the server.

Deployments need Netlify Functions, so use the GitHub-connected Netlify deployment for the full application. Uploading only `dist/` through manual drag-and-drop hosts the public pages but **does not** install the member backend. New contact messages are stored in PostgreSQL; no Netlify API token is required. SMTP, database and real device push must be verified after their settings are supplied.

No old Manus accounts, passwords, private chats, or submissions have been imported. The contact inbox now shows submissions saved through the site’s own contact endpoint. Earlier Netlify Forms entries remain in Netlify and are not imported automatically. Owners can manage partner listings and banners directly in the member dashboard. Source preservation and public content history are recorded in [docs/migration.md](docs/migration.md).

Leadership email: owner/admin/executive members have a branded composer with their verified personal signature, Reply-To, send review, and private sent history. Requires migration 004; uses the existing SMTP settings. See docs/member-setup.md.
