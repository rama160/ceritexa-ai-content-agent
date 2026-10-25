# Ceritexa AI Content Agent — v1.2.0

An isolated Cloudflare Worker and GitHub Actions project for:
- **Ceritexa Studio** (Facebook Page, text/photo/comic)
- **Panex** (YouTube, real-life fictional dramas)
- **Heros Real Life** (YouTube, original heroes and fantasy)

**No code, database, secrets, routes or deployments of Nusa Penida Experiences, Spenva or Finchat are shared.** The account's legacy workers.dev suffix `finchat-ai-gateway` is merely the shared domain label.

## Live resource inventory
- Worker: `ceritexa-content-agent`
- Dashboard: **https://ceritexa-content-agent.finchat-ai-gateway.workers.dev/**
- D1: `ceritexa-content-db`
- KV: `ceritexa-content-media-kv` (isolated fallback for small files)
- Workers AI binding: `AI`
- R2: not available on account; not used
- Admin token: installed as **Cloudflare Secret ADMIN_TOKEN** (not in GitHub)
- Public social publishing: **OFF**; automatic DAILY DRAFTS **ON**; D1 `paused=false`
- OAuth Facebook Page/YouTube: still requires owner authorization

Cloudflare management API has confirmed the Worker script deploy and bindings, **but this environment cannot connect to the workers.dev HTTP hostname**. Public URL and dashboard should be verified from the owner's browser.

## Documentation rule (MANDATORY)
Read `AI_START_HERE.md`, `PHASE.md`, `CHANGELOG.md`, `PRD.md`, `ARSITEKTUR.md` before changes. Fix owner file instead of creating duplicates. Record every change in PHASE and CHANGELOG. Do not claim E2E deployment success without actual E2E checks.

## How the workflow works
```
Trend research -> original AI story -> optional AI artwork -> owner media upload
    -> manual review / license check -> owner approves -> UTC schedule
    -> official Facebook Page / YouTube adapters (when connected)
    -> engagement metrics -> strategy topic feedback -> next AI draft
```

The owner must approve **each** post. An AI-generated VIDEO draft includes artwork and waits in BLOCKED / VIDEO_RENDER_REQUIRED until rendered.

## Free video rendering (no VPS)
`tools/render_video.py` runs only in `.github/workflows/render-video.yml`. The GitHub workflow uses offline Indonesian `espeak-ng`, FFmpeg and SRT subtitles to create a small vertical MP4 and upload it to the existing draft for review, **not** to Facebook/YouTube. It checks Pause All. Results depend on GitHub Actions availability, Worker reachability and voice quality. It is not a premium cinematic generative video model.

To enable, go to repository → **Settings → Secrets and variables → Actions → New repository secret** and create `CERITEXA_ADMIN_TOKEN`, with the exact same value as the Cloudflare Worker ADMIN_TOKEN delivered privately to the owner. Do NOT commit or paste token in issues/PRs. Run **Actions → Ceritexa Video Renderer → Run workflow** for the first test.

## Cloudflare manual smoke-test
1. Open dashboard and enter Admin token. The form clears the input after connection and keeps the token only in memory.
2. Drafting is already resumed, public publication stays disabled. Use **Pause All** to suspend all scheduled draft/publishing activity.
3. Click **Riset Tren**. Check the source label (RSS vs evergreen fallback).
4. Choose Facebook TEXT → **Buat draft**, verify original Indonesian story and `PENDING_REVIEW`.
5. Choose PHOTO or COMIC; preview generated image; if needed use **Tambah media** for own images.
6. Review content, media license and platform policy; **Setujui setelah review**, then choose explicit local date/time.
7. To test Shorts: choose Panex/Heros VIDEO, let GitHub video-render workflow create MP4, then review and approve it.
8. Test `/api/health`, unauthenticated `/api/status` must return 401; `Pause All` must prevent scheduled processing.
9. Facebook Page and both YouTube channels must be connected to official provider APIs before enabling external publishing.

## Cloudflare secrets and vars
Secrets (Worker Settings → Variables & Secrets → Secret):
- `ADMIN_TOKEN` (already installed; store in secure password manager)
- `FB_PAGE_ACCESS_TOKEN`
- `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN_PANEX`, `YT_REFRESH_TOKEN_HEROS`

Plain Worker vars (IDs, no tokens):
- `FB_PAGE_ID`
- `YT_CHANNEL_ID_PANEX`, `YT_CHANNEL_ID_HEROS`
- `ALLOW_PUBLICATION` — default `false`
- `ALLOW_DAILY_DRAFTS` — currently `true`, daily 08:00 WITA draft-only rotation (Cloudflare Cron at 00:00 UTC), monthly limit 24
- `MONTHLY_DRAFT_LIMIT` — default `24`

Use a unique new Facebook Page token belonging to **Ceritexa Studio**, not Nusa Penida Experiences. YouTube identity is verified via `channels.list(mine=true)` before a private upload. Never reuse OAuth credentials from unrelated apps.

## Developer commands
```bash
npm run check
npm test
python -m py_compile tools/render_video.py
npx wrangler d1 migrations apply ceritexa-content-db --remote
npx wrangler deploy
```
There is no automatic production deploy triggered by pushes; CI tests only. Do not overwrite the existing Worker with unverified source.

## Known limitations
- Actual Facebook/YouTube provider publishing cannot be verified until owner authorizes official APIs; no expected views or income guarantees.
- Fully automated Facebook Reels is blocked by strict safety gates until its API publisher exists.
- KV media files and render size limited to 8 MB; for larger videos enable separate R2 when available.
- Strategy adapts topic preferences only on measurable engagement from at least three published posts/channel.
- Current TTS quality is utilitarian, not cinematic; for higher quality configure a licensed voice provider in a later gated phase.
- GitHub Actions scheduled jobs can be delayed, paused or disabled by GitHub; workflow requires one-time repo secret.
