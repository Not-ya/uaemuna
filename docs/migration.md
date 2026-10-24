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
| /login | Link to existing member authentication; credentials are not collected by the replacement |
| /dashboard | Same portal handoff; unauthenticated old route redirects to login |
| /404 | Redesigned error page and actual 404 response |
| /register | Fixes the original broken homepage destination by redirecting to /registration/ |

Public text and links are archived in source-audit.json. The original legal introduction and contact paragraphs are retained verbatim in content.json. Existing member records, contact submissions, newsletter subscribers, internal messages and guidance notes are not publicly accessible and have not been extracted. The original client references executive, advisor, and member dashboards; reproducing their interfaces would not migrate their data or security. They remain accessible through the original portal.

Original logo and partner image URLs are recorded in source-assets.json. The cloud proxy currently blocks files.manuscdn.com and d2xsxph8kpxj0f.cloudfront.net. Media bytes have not been downloaded; the redesign uses original vector artwork, a typographic identity, and founder initials instead of inventing portraits. Allow these media hosts to recover the original assets for an archive or later placement.

Original FAQ references a newsletter, but no subscription form appeared on the inspected homepage. No newsletter subscription behavior is claimed in the replacement. The retained FAQ and policy are original content; the added privacy note explains this implementation.

Source facts remain as requested. "Coming soon" news is retained as pending information, not asserted as newly verified. Source pricing is inconsistent; both claims are retained transparently until the operator confirms the correct position. Google application links and conference destinations were preserved; their ownership, availability and submissions were not independently validated.

## Validation

- Build: 13 static HTML pages.
- Automated tests: local links and anchors, form markup, all application destinations, eight FAQs, and exclusion of old credential storage and analytics.
- Chromium: 13 routes at 1440px and 390px; successful expected responses, one main heading, no horizontal overflow or JavaScript exceptions.
- Interactions: mobile menu navigation, FAQ expansion, required-field and valid-form checks.
- Pending after deployment: Netlify Forms receipt, notifications, published custom domain and any private portal migration.
