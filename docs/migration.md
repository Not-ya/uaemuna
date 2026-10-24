# Source audit and migration

Source: https://uaemunaweb-36zi5zye.manus.space/ inspected 24 October 2026.

| Original route | New behavior |
| --- | --- |
| / | Redesigned homepage: services, founders and roles, conference partners, all three original news topics |
| /about | Mission, vision, founders, team expansion and four values |
| /services | All three services and all 15 inclusions; original free-service claim qualified pending confirmation |
| /partners | ValorMUN and AAIOMUN descriptions and original website destinations |
| /faq | All eight questions and answers; original pricing conflict visibly clarified |
| /registration | All four application destinations, including Executive and Advisor tabs discovered in the published client |
| /contact | Same email and social destinations; replacement contact form uses Netlify Forms |
| /privacy | Original policy and April 2026 date retained; note explains new form processing and removed analytics |
| /terms | Original terms and April 2026 date retained |
| /login | Integrated email/password login backed by Netlify Functions and PostgreSQL |
| /dashboard | Integrated member hub: role-based rooms, private chat, reactions, owner invitations, and contact inbox |
| /404 | Redesigned error page and actual 404 response |
| /register | Fixes the original broken homepage destination by redirecting to /registration/ |

Public text and links are archived in source-audit.json. The original legal introduction and contact paragraphs are retained verbatim in content.json. Existing member records, contact submissions, newsletter subscribers, internal messages and guidance notes are not publicly accessible and have not been extracted. The original client references executive, advisor, and member dashboards; reproducing their interfaces would not migrate their data or security. Old records remain on the original platform; the new member system starts independently.

Original logo and partner image URLs are recorded in source-assets.json. The logo, circular emblem upload, and both conference banners have now been downloaded over verified HTTPS and are served from public/images/. Both banners appear on the home and partners pages without cropping. The original emblem appears in the header, footer, hero, and browser favicon. The decorative globe and placeholder founder portraits have been removed; founder names and roles remain.

Every browser tab is titled UAEMUNA. The light/dark toggle follows the operating system until a visitor makes a choice, saves that choice locally when storage is available, and applies it before the stylesheet loads. Storage failures are tolerated. Private member credentials are never stored by this website.

Original FAQ references a newsletter, but no subscription form appeared on the inspected homepage. No newsletter subscription behavior is claimed in the replacement. The retained FAQ and policy are original content; the added privacy note explains this implementation.

AAIOMUN is corrected to Al Ain International Online MUN following the owner’s clarification. Other source facts remain as requested. "Coming soon" news is retained as pending information, not asserted as newly verified. Source pricing is inconsistent; both claims are retained transparently until the operator confirms the correct position. Google application links and conference destinations were preserved; their ownership, availability and submissions were not independently validated.

## Validation

- Build: 17 static HTML pages plus a bundled member client and Netlify server functions.
- Automated tests: six checks covering local links and anchors, form markup, application destinations, FAQs, original logo and banners, tab title, theme controls, and exclusion of old credential storage and analytics.
- Chromium: 17 routes at 1440px, 390px, and 320px in both light and dark mode (102 combinations); successful expected responses, exact UAEMUNA tab title, one main heading, all images loaded, no horizontal overflow or JavaScript exceptions.
- Interactions: mobile menu navigation, FAQ expansion, required-field and valid-form checks; theme toggle persistence after reload and navigation, system preference, and storage-disabled fallback.
- Member feature update: 21 automated checks pass, including real handler/SQL tests against embedded PostgreSQL. Browser flows passed for login, chat, reactions, replies, invitations, contact inbox, DMs, mobile layouts, and logout using local test transports.
- Pending external configuration: SMTP sender verification, Netlify API access for inbox, VAPID environment values, real device push delivery, and any old-platform data export. See member-setup.md.

Production PostgreSQL initialization completed successfully on 24 October 2026. Runtime presence checks confirm the database URL, SMTP variables, account-security secret, and VAPID settings are present. Netlify API token and Site ID remain missing for the contact inbox. Actual email delivery and device push still require verification.
