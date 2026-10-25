# CHANGELOG
## 1.2.1 — 2026-10-25
### Implemented
- Added centralized setup readiness in existing `src/core.js`, exposed admin-only `GET /api/readiness`, and integrated checklist in existing mobile dashboard.
- Added admin-only `GET /api/connections/verify` for real Meta Page identity and per-channel YouTube OAuth checks, without posting.
- Hardened Facebook publisher to reject any Page whose id differs from `FB_PAGE_ID` or whose name is not Ceritexa, protecting Nusa Penida Experiences.
- Enforced distinct OAuth IDs for Panex and Heros before private YouTube upload.
- Updated video AI instructions to provide a complete 95–125 word voice-over. Existing offline renderer refuses >59-second narrations or >145-word script to prevent clipped stories.
- Added unit test for credential-safe readiness and dashboard inline-JS syntax.
- Added one canonical `tests/smoke.py` read-only HTTP integration checker, manual GitHub CI step using encrypted Actions Secret only; no duplicate engine.
- Published ordered owner onboarding checklist to existing README, clarified Cloudflare and GitHub Actions secret separation, aligned documentation to v1.2.1.
### Verified
- Cloudflare Workers AI FLUX.1 Schnell API returned usable JPEG image base64; Gemma 4 (thinking disabled) returned valid Indonesian story JSON.
- Created one sample `UJI INTERNAL` draft directly via isolated Workers AI + Ceritexa D1 API; no Facebook/YouTube posting. D1 currently held two PENDING_REVIEW posts and zero PUBLISHED posts at check.
- Uploaded new Worker module to isolated `ceritexa-content-agent`; Cloudflare deployment reports latest version at 100%, secret ADMIN_TOKEN preserved, all public social posting disabled.
### Pending and not claimed complete
- External browser/HTTP E2E for protected Worker and real GitHub Actions CI smoke (requires owner-controlled token).
- Meta/Google OAuth permissions and real provider posting tests.
- GitHub-hosted video render full E2E; R2/media scaling, Facebook Reels full automated publishing, monetization eligibility.
- Owner must **rotate current ADMIN_TOKEN** to a private known value and add it to encrypted GitHub Actions Secret `CERITEXA_ADMIN_TOKEN`.

## 1.2.0 — 2026-10-25
- Verified Cloudflare latest Worker script live with 100% traffic, isolated AI/D1/KV bindings, ADMIN_TOKEN still installed; public publication OFF.
- Enabled daily automated draft rotation (ALLOW_DAILY_DRAFTS=true) and unpaused D1 review workflow (paused=false) on owner's autonomy request; one draft/day up to 24/month; no social publication without approval.
- Tested offline FFmpeg subtitles/video command locally with Indonesian TTS voice and valid MP4 output; GitHub-hosted rendering still requires repo secret and runtime test.
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
