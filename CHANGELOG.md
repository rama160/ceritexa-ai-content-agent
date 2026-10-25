# CHANGELOG
## 1.2.0 — 2026-10-25
- Live-tested Cloudflare Workers AI text providers: GLM reasoning consumed low output budget; Llama JSON incomplete; switched primary to Gemma 4 26B (valid Indonesian JSON) with Llama fallback.
- Provisioned strong ADMIN_TOKEN solely as Cloudflare Worker secret; no credential committed to GitHub.
- Expanded existing Worker media generation to create illustration for video draft; owner's approval remains mandatory.
- Added media upload and previews to existing dashboard, exact date/time scheduling, login field clearing and integration status flags.
- Added one canonical offline video renderer (espeak-ng Indonesian voice, FFmpeg, SRT captions) plus one scheduled GitHub Actions workflow, disabled in effect until GitHub secret is configured.
- Added per-channel analytics-to-strategy topic-learning loop (minimum three published posts and actual engagement).
- Introduced channel-balanced daily draft rotation; remains opt-in and paused on Cloudflare.
- Strengthened MIME approval gates (no JPEG as YouTube MP4; unsupported Facebook Reels cannot be approved) with regression tests.
- Expanded CI with Python syntax check, updated canonical docs and phase tracking.
- Reuploaded updated code to isolated Cloudflare Worker after GitHub changes; no changes to Finchat, Spenva or tourism resources.
- Remaining: HTTP/browser E2E inaccessible from environment, GitHub Actions runtime unverified, GitHub renderer secret, provider OAuth/Meta permissions, full public posting and monetization **not validated**.

## 1.1.2 — 2026-10-25
- Aligned package.json, PRD, architecture, phase and AI_START_HERE versions to v1.1.2.
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
