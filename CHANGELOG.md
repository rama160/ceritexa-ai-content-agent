# CHANGELOG
## 1.1.2 — 2026-10-25
- Confirmed isolated Worker deployment at 100% by Cloudflare deployments API, subdomain and Cron still enabled.
- Verified expected D1/AI/MEDIAKV bindings and no admin secret yet; documented remaining external blockers.
- No changes to Spenva/Finchat/Nusa Penida deployments.

## 1.1.1 — 2026-10-25
- Created isolated Worker and Cron triggers; D1 schema migrated.
- Added a separate KV media fallback because Cloudflare R2 is disabled; integration remains unverified.
- Public posting remains disabled; ADMIN_TOKEN still must be set securely by owner.
- Cloud HTTP endpoint inaccessible from inspection environment, so E2E not claimed.

## 1.1.0 — 2026-10-25
- Replaced former Finchat application tree **only in target repository** with Ceritexa Worker project.
- New documentation rules, phases, tests, CI.
- Added original writing/draft engine, RSS trends, protected dashboard, approval, scheduler, journal, optional media generation and publication providers.
- Created isolated Cloudflare D1 database.
- R2 unavailable (requires activation in dashboard); external channel OAuth not set, no live posts.
- Public posting off; no existing Cloudflare Workers affected.
