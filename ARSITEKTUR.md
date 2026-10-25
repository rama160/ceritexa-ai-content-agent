# ARSITEKTUR 1.2.0 — Ceritexa Studio
Single isolated Cloudflare Worker `ceritexa-content-agent`, D1 `ceritexa-content-db`. Optional private R2 `ceritexa-content-media` after owner enables storage.

```mermaid
flowchart TD
 A[Google Trends RSS/Seed] --> B[Cloudflare Worker]
 B --> C[Workers AI Story]
 C --> D[D1 Draft + Review]
 C -. once R2 enabled .-> E[R2 Artwork]
 D --> F[Schedule via Cron]
 F --> G[Meta Page text/photo API]
 F --> H[YouTube private upload per verified channel]
 G --> I[Analytics to D1]
 H --> I
 I --> B
```

## Code ownership
- src/core.js: channel rules, IP filter, RSS parser, AI JSON validation, security logic.
- src/index.js: Worker fetch+cron, DB, AI, API adapters, dashboard.
- tests/core.test.js: pure rules + regression.
- migrations/0001.sql: D1 schema; future schema changes require sequential migrations.
- wrangler.toml: only Ceritexa-specific resource bindings.
- .github/workflows/ci.yml: CI test-only, **no automatic production deployment**.

## Public API and admin
GET /api/health without auth; all other `/api/*` require Authorization: Bearer ADMIN_TOKEN (>=24 characters). Dashboard at /.
Admin: status, posts, trends, analytics, audit, research, generate, posts/:id/approve, schedule, media, pause, publish, metrics. No impersonation or public profile publishing.

## Safety & availability
Git history of old code remains but new HEAD tree has no old code. Default paused and publication off. Video rendering + audio/subtitles requires separate licensed renderer; the basic Worker cannot synthesize complete videos. R2 currently not enabled; MEDIAKV fallback is limited by free KV quotas and consistency. Publication and analytics adapters require secrets and account permissions and must be E2E tested before autopilot.

## Version 1.2.0 — Additive changes (single-owner files)
- Cloudflare Worker `src/index.js`: AI prompt engine, status/readiness, generated video artwork, audit, owner media upload and private preview; per-channel strategy() aggregates published engagement and updates canonical `settings.strategy_CHANNEL` only with >=3 measurable posts.
- GitHub Actions `.github/workflows/render-video.yml`: renders **draft video only** in ephemeral runner using `tools/render_video.py` (espeak-ng TTS, generated SRT, FFmpeg). It gets source image/script from the protected Worker API and sends MP4 back to existing post; it has no Facebook/YouTube token or publishing capability. Requires GitHub Actions `CERITEXA_ADMIN_TOKEN` secret; no new Cloudflare resource.
- Only `ceritexa-content-agent` script, `ceritexa-content-db` D1 and `ceritexa-content-media-kv` KV belong to this project. The `finchat-ai-gateway.workers.dev` suffix is the **Cloudflare account-wide workers.dev label**, not the application or Worker binding.
- Publication gate rejects generated image as MP4 and blocks Facebook Reels until official endpoint is implemented. YouTube upload only `privacyStatus=private` and after `mine=true` ID check.
- Cloudflare API model smoke: Gemma 4 26B A4B IT delivered valid original Indonesian JSON; Llama 3.1 8B is fallback; earlier GLM 4.7 Flash low-token response can be dominated by reasoning. Missing model output causes HOLD/error rather than invalid data.
- Neither GitHub Actions nor Worker secretly borrows API keys from Finchat/Spenva/Nusa Penida Experiences. OAuth + provider acceptance remain necessary for live posting.
