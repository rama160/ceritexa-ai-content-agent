# CHANGELOG
## 1.4.0 — 2026-10-26
- Made Ceritexa's existing mobile dashboard installable as a standalone Progressive Web App (PWA) through Android Chrome/Samsung Internet without generating a second Android codebase or Play Store APK.
- Added minimal branded web manifest (id, name, start_url, scope, standalone display, portrait, theme), scalable 192/512 SVG icon routes from original embedded Ceritexa logo and JPEG raster fallback; HTTP assets served on same isolated Worker origin.
- Added small install card and button driven by beforeinstallprompt/appinstalled where supported, with manual Chrome Add to Home screen guidance when browser prompt unavailable.
- Added service worker restricted to public app shell/manifest/icons only; network-first navigation and public offline shell fallback. Private /api, images/media, credentials, response bodies, authorization headers and non-GET actions are not cached.
- Extended CSP narrowly for same-origin Worker/manifest, preserved ADMIN_TOKEN exclusively in volatile page memory. Kept existing review/rejection, Facebook and YouTube integrations and automatic posting disabled.
- Added regression tests to existing tests/core.test.js for manifest fields, PWA service-worker cache safeguards, same-origin public endpoint MIME and auth boundaries. Browser install confirmation is pending device test.
- No other Cloudflare Worker or repository touched. Existing Ceritexa secrets and D1 preserved.

## 1.3.0 — 2026-10-26
- Embedded actual owner-supplied Ceritexa logo in existing dashboard header and review-card fallback; no new duplicate branding module.
- Added an AI cover generation attempt to all new draft formats, including Facebook TEXT (review only); old records can create/replace a private review image using a shared image helper and owner button.
- Added reject action with controlled reason/note form in the same dashboard. Original draft remains REJECTED, reason/note stored with audit, regenerated child maintains same channel/topic/format and parent linkage.
- Limited automatic regeneration to three revisions across ancestry; checks distinct title/caption/story, refuses overly similar copy, and exposes explicit retry after generation failure (no infinite retries).
- Added D1 migration 0002_review_feedback.sql, idempotent draft_reviews table with parent_id, revision_depth, regen_state, preview_media_key and error tracking. Applied against isolated Ceritexa D1; 6 existing posts had review metadata backfilled.
- Enhanced existing tests/core.test.js with review validation, similarity, migration presence, brand/preview syntax, and simulated HTTP reject-to-regenerate flow. Tool sandbox observed 15 pure checks passing and a controlled in-memory Worker HTTP simulation passing. Actual GitHub Action result is not observed.
- Successfully deployed to Ceritexa Worker only. Cloudflare API GET verified logo, preview, reject and regeneration handlers in live script and latest version at 100% traffic. Preserved 6 secrets for admin, Facebook, Google; ALLOW_PUBLICATION remains false.
- Public provider posting, browser owner flow and GitHub runner E2E remain pending. No unrelated Worker, repo, account, content or previous draft was deleted or modified.

## 1.2.2 — 2026-10-26
- Verified actual Ceritexa Worker draft generation through Cloudflare D1 audit and posts table: new Facebook TEXT and Heros VIDEO drafts; Heros awaits MP4 renderer, zero public-posting claim.
- Owner screenshot confirmed Facebook Page Ceritexa Studio, Panex and Heros Real Life all verified=true; no credential values shown or modified.
- Fixed unrelated viral/news topic contamination: src/core.js now owns channel-specific keyword matching, editorial seed pool and reusable selectDraftTopic() helper. src/index.js changed to use this selector rather than latest RSS headline. Older off-brand drafts remain for owner review and are not auto-posted.
- Added regressions for ignoring soccer-league standings for Panex/Heros and respecting owner-entered topics; seven pure tests and Worker/dashboard JavaScript syntax passed in a tool sandbox. Full GitHub Actions CI not independently confirmed.
- Deployed only to isolated Ceritexa Worker; latest version reported 100% traffic, all existing Cloudflare Facebook/YouTube/Admin secrets and channel IDs preserved, publication remains OFF and two cron schedules unchanged.
- Updated AI_START_HERE, PHASE, PRD, architecture, README and canonical CHANGELOG; no duplicate engine/files created.

## Onboarding documentation update — 2026-10-25
- Appended current Meta Facebook Page and separate Google OAuth Panex/Heros setup references to the existing README.
- Owner reports the initial three dashboard/CI setup tasks complete. Provider tokens remain to be configured and verified.
- No application code or unrelated Workers were modified. Public publishing stays disabled.

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

## 2026-10-26 — Google OAuth Branding preparation
- Added public branding homepage, privacy policy, terms of service and one shared stylesheet to `docs/` for optional free GitHub Pages deployment (specific to Ceritexa).
- Documented candidate homepage/policy/terms URLs and Google Auth Platform field names in existing README; Pages activation and HTTP confirmation remain owner tasks.
- Clarified Google Authorized domains and Search Console ownership verification caveat; do not infer that public pages or Google production review have been approved.
- Generated compact 120x120 PNG copy of the Ceritexa logo in the conversation for upload under Google's 1MB requirement. No binary credential or secret committed.

### v1.4.0 deployment verification
- Cloudflare returned HTTP 200 on isolated Ceritexa Worker upload and management GET confirmed the 1.4.0 PWA code on latest 100% deployment.
- 19 core/regression tests passed in a local JS-compatible harness, including unauthenticated PWA routes and protected data boundaries. Android install prompt and device-specific launcher behavior still need owner acceptance.
- Existing admin, Facebook and two YouTube refresh token secrets preserved without revealing their values. Two Cron triggers unchanged, ALLOW_PUBLICATION remained false.
