# UAEMUNA

The UAEMUNA public website and invitation-only member hub, deployed from GitHub to Netlify. Node 24, PostgreSQL, secure cookie sessions, authenticated SMTP email, Netlify Forms, and native Web Push. No Supabase account or SDK is used.

```sh
npm ci
npm run build
npm test
npm start
```

Netlify builds and tests with `npm run build && npm test` and publishes `dist/`; server endpoints are in `netlify/functions/`. `npm start` serves static pages and the real API locally on port 3000 (`PORT` overrides it). Rebuild after front-end edits. Public content is in `content.json` and `scripts/build.mjs`, browser member code in `src/members.js`, styles and original artwork in `public/`. The browser tab title is UAEMUNA; light/dark preference is supported throughout.

**Member services require runtime configuration:** follow [docs/member-setup.md](docs/member-setup.md) for PostgreSQL, SMTP, Netlify inbox permissions, push keys, migration, and the owner bootstrap for `youssef.f1@hotmail.com`. Configuration is deliberately not fabricated. Passwords are hashed server-side with scrypt; session and activation tokens are stored hashed. The owner cannot create anyone’s password or read their private chats through the application. Account/role controls and room access are checked on the server.

Deployments need Netlify Functions, so use the GitHub-connected Netlify deployment for the full application. Uploading only `dist/` through manual drag-and-drop hosts the public pages but **does not** install the member backend. Keep form detection enabled. SMTP, database, Netlify Forms and real device push must be verified after their settings are supplied.

No old Manus accounts, passwords, private chats, or submissions have been imported. The new contact inbox includes this Netlify project’s `contact` form submissions once connected. Source preservation and public content history are recorded in [docs/migration.md](docs/migration.md).
