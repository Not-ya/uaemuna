# Activate the UAEMUNA member hub on Netlify

The code uses ordinary email/password authentication. There is no Supabase dependency or account. It needs hosted PostgreSQL and an authenticated SMTP provider. The site remains public while the member pages clearly report unavailable services until configured. No production owner account, email delivery, or web push has been activated in this workspace.

## 1. Database and runtime settings

Create a hosted PostgreSQL database (Netlify Database or another PostgreSQL host is fine). Use a pooled connection URL if the provider supplies one. This server verifies TLS certificates for remote database connections; do not disable certificate checks. Local PostgreSQL on localhost may use an unencrypted local socket connection.

Add the following in **Netlify → Project configuration → Environment variables**, scoped to Functions and to the production context. Keep preview deployments isolated from the production database. Do not paste credentials into chat or commit `.env` files.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL with its credentials |
| `AUTH_SECRET` | Random secret, at least 32 characters, for private abuse-control identifiers |
| `OWNER_EMAIL` | `youssef.f1@hotmail.com` |
| `SMTP_HOST` | Your transactional email provider’s SMTP hostname |
| `SMTP_PORT` | `465` for implicit TLS or `587` for required STARTTLS |
| `SMTP_USER` | SMTP username |
| `SMTP_PASSWORD` | SMTP password/API credential |
| `MAIL_FROM` | Verified sender address, e.g. `UAEMUNA <team@your-domain>` |
| `NETLIFY_API_TOKEN` | Netlify personal access token with access to this project’s forms; server-only |
| `NETLIFY_SITE_ID` | The project’s Netlify Site ID |
| `VAPID_PUBLIC_KEY` | Web Push public key |
| `VAPID_PRIVATE_KEY` | Web Push private key; server-only |
| `VAPID_SUBJECT` | `mailto:uaemodeluna@gmail.com` |

For a custom sender domain, configure it with your email provider (SPF/DKIM) so account emails arrive reliably. A Gmail sender uses its matching Gmail address instead. The system sends real invitation, activation, and reset emails; there are no simulated email links in production.

Generate `AUTH_SECRET` and Web Push keys with `npm run secrets:generate`. It writes a private ignored `.env.generated` file and never prints the values. Import those values into Netlify; do not regenerate VAPID keys after browsers subscribe unless intentionally rotating them. Existing values are never overwritten.

## Gmail SMTP for uaemuna.netlify.app

The production site is https://uaemuna.netlify.app/. The existing SMTP implementation supports Gmail without code changes. Use the association’s `uaemodeluna@gmail.com` account if that is the mailbox you control:

| Netlify Functions variable | Gmail setting |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `uaemodeluna@gmail.com` |
| `SMTP_PASSWORD` | A Google App Password for that Gmail account; **not** its normal login password |
| `MAIL_FROM` | `UAEMUNA <uaemodeluna@gmail.com>` |

In that Google account, enable 2-Step Verification under https://myaccount.google.com/security, then create an App Password at https://myaccount.google.com/apppasswords. Put it directly in Netlify’s `SMTP_PASSWORD` setting. If you use a different Gmail account, change both `SMTP_USER` and `MAIL_FROM` to match it. Do not share the App Password in chat or commit it to GitHub. Gmail controls the sending limits; it is suitable for starting with a small invited team.

SMTP sends the account emails; PostgreSQL is still required for accounts and chat storage. Once all runtime values and the schema are present, redeploy, visit https://uaemuna.netlify.app/create-account/, and request the owner activation link for `youssef.f1@hotmail.com`.

## 2. Create the schema

Run `database/001_members.sql` in your database’s secure SQL console, **or** set `DATABASE_URL` in an ignored local `.env` and run:

```sh
npm ci
npm run migrate
```

The initial migration is repeatable and does not delete existing data. Future schema changes should get new migration files. Netlify Functions need permissions to read/write these tables. Do not expose database credentials to browser code. Database backups belong to the hosting provider and should be configured there.

Operator-assisted setup can also use the protected POST action `setup.initialize` on `/.netlify/functions/members`, with the private `AUTH_SECRET` supplied as `X-Setup-Key`. It creates a fresh schema transactionally, does nothing when all member tables already exist, and refuses a partial schema to preserve existing data. Never place this key in browser code or share it in chat. The protected action `setup.verify-email` checks the SMTP connection and authentication without sending a message.

Production database initialization was successfully completed on 24 October 2026; the server returned `initialized: true, ready: true`. SMTP connection and authentication also passed the protected verification check (`connected: true, emailSent: false`). Actual mail delivery and owner activation still need a signup request from the owner.

## 3. Deploy, claim the owner account, invite members

Deploy the GitHub `main` branch after setting environment variables. Visit `/create-account/`, enter `youssef.f1@hotmail.com`, and open the email link to set your name and password. No one can claim owner access by typing that email alone: the one-use emailed token proves access to the mailbox. Do not forward it.

After signing in, **Team & invitations** lets the owner add invited emails, assign roles, revoke invitations, and change/suspend registered members. Invitations last seven days; activation and reset links last 30 minutes. Invited people can request a fresh link from `/create-account/` while their invitation remains valid. Existing accounts use `/forgot-password/`. Resetting a password revokes all existing sessions and their push subscriptions. Role changes/suspensions also revoke that member’s sessions immediately.

The new system does not import passwords, accounts, or private messages from the old Manus backend.

## 4. Groups, private chats, and contact inbox

| Role | Main | Big guns (Leadership) | Staff | Volunteers | Contact inbox | Invite/manage |
| --- | --- | --- | --- | --- | --- | --- |
| Owner | Yes | Yes | Yes | Yes | Yes | Yes |
| Admin | Yes | Yes | Yes | Yes | Yes | No |
| Executive | Yes | Yes | Yes | Yes | No | No |
| Staff | Yes | No | Yes | Yes | No | No |
| Volunteer | Yes | No | No | Yes | No | No |
| Member | Yes | No | No | No | No | No |

Direct chats are visible only to their two participants, including when someone else is owner/admin. They are private through application access controls, not end-to-end encryption. Infrastructure administrators with database access can access records. Users can reply, react, edit their own messages, and delete them; admins can moderate messages in group chats they can access. Live chat refreshes every four seconds while the page is visible; this is polling, not WebSockets. Earlier messages load on demand.

Keep Netlify Forms detection enabled. Submit the public contact form after deployment and confirm the message appears in the member **Contact inbox**. The inbox reads the real `contact` form via the Netlify API with pagination, so existing submissions from this Netlify project are included. The old Manus server’s submissions cannot be recovered without its backend export. No data is fetched directly from Netlify in the browser and the API token is never exposed there.

## 5. Push notifications

The service worker uses native Web Push with VAPID signing. Opt-in is in the chat header or **My account**. No browser permission is requested before a user clicks. On iPhone/iPad (iOS 16.4+), install the site using **Add to Home Screen** and open that installed app before enabling push. The site must use HTTPS. Browser/platform support and OS permissions still apply; delivery cannot be guaranteed by a website.

Signed-in sessions own subscriptions. The background delivery function checks the sender, chat membership, recipient role, and active recipient sessions, then deduplicates each message/subscription pair. Notification previews contain no private message text. On sign-out, password reset, suspension, or session expiry, server-side subscriptions are removed. Daily cleanup removes expired tokens, sessions, and rate-limit rows.

Production verification requires two real accounts/devices: subscribe one, send a permitted message from the other with the recipient’s tab closed, and check delivery plus notification navigation. Verify that a leadership message does not notify a volunteer and that signing out stops future delivery. These provider/device checks are pending; local tests cover recipient filtering and deduplication with an injected push transport.

## Local validation

```sh
npm ci
npm run build
npm test
npm start
```

Tests execute the real API handlers and SQL against embedded PostgreSQL (PGlite) with a test mail transport and a test Netlify Forms response. They cover password hashing, one-use activation, owner bootstrap, CSRF, invitation expiry/revocation, role boundaries, private-chat isolation, reactions, contact permissions, password reset and session revocation, rate limits, push membership, and duplicate delivery protection. They do not prove external SMTP, production PostgreSQL, Netlify Forms permissions, or actual device push delivery.
