# Ceritexa AI Content Agent — v1.2.1

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
- Admin token: installed as **Cloudflare Secret ADMIN_TOKEN**. **Owner must rotate to a new known private value and mirror it in GitHub Actions Secret.**
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

To enable, go to repository → **Settings → Secrets and variables → Actions → New repository secret** and create `CERITEXA_ADMIN_TOKEN`, with the exact same NEW value as the Cloudflare Worker ADMIN_TOKEN that you personally rotate and save. Do NOT commit or paste token in issues/PRs. Run **Actions → Ceritexa Video Renderer → Run workflow** for the first test.

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
python -m py_compile tools/render_video.py tests/smoke.py
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


## Owner actions — in order (DO NOT send tokens to ChatGPT)
1. **Rotate ADMIN_TOKEN**. Cloudflare Dashboard → Workers & Pages → **ceritexa-content-agent** → Settings → Variables and Secrets → `ADMIN_TOKEN` → Edit/Replace. Create a NEW randomly generated secret of at least 32 characters in your password manager. The initial secret was provisioned during setup, but the owner has not received a usable copy; rotating it avoids relying on an unknown key. Save the new value privately.
2. **GitHub Actions secret**. Repo → Settings → Secrets and variables → Actions → New repository secret. Name **`CERITEXA_ADMIN_TOKEN`**, value = exactly the NEW token from step 1. Do not put it in a file or chat. Two services read the same owner-only value; there is no Finchat/Spenva dependency.
3. **Verify**. Open dashboard, sign in with the new secret. Test "Riset Tren", inspect existing sample **UJI INTERNAL** and a new TEXT draft, try Pause/Resume. Then run GitHub → Actions → **Ceritexa CI** → Run workflow; the manually triggered CI runs `tests/smoke.py` to check real HTTP health/auth and that publication is off.
4. **Render video**. In dashboard, create a Panex or Heros VIDEO draft; owner may edit the complete 95–125 word script. Go to Actions → **Ceritexa Video Renderer (drafts only)** → Run workflow. Verify the result has a media preview and remains **PENDING_REVIEW**. This does not post anything to YouTube.
5. **Facebook Page connection**. In your *Ceritexa-only* Meta developer app, grant the Page-scoped permissions `pages_show_list`, `pages_read_engagement` and `pages_manage_posts` as required, and ensure your account has permission to create Page content. Store the **Ceritexa Studio Page** ID as Worker variable `FB_PAGE_ID` and its **Page access token** as Worker Secret `FB_PAGE_ACCESS_TOKEN`. DO NOT use Nusa Penida Page ID/token. Dashboard "Uji koneksi sosial" must return `facebook.verified=true` and the page name must begin with "Ceritexa". App Review may be required for other user access. Graph API photo and text posting are implemented; Facebook Reels currently BLOCKED.
6. **Both YouTube channels**. Create a separate Google Cloud project for Ceritexa, enable **YouTube Data API v3**, configure OAuth consent and client credentials. Authorize **Panex** and **Heros Real Life** separately using OAuth with YouTube upload/read permission and `access_type=offline`, capturing separate refresh tokens using a secure trusted flow. Store OAuth client ID/secret and the refresh token for EACH channel as individual Cloudflare Worker Secrets `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN_PANEX`, `YT_REFRESH_TOKEN_HEROS`. Store the distinct channel IDs in Worker variables `YT_CHANNEL_ID_PANEX` and `YT_CHANNEL_ID_HEROS`. The Worker verifies `channels.list(mine=true)` before any private MP4 upload. Never paste tokens in GitHub/ChatGPT.
7. **Controlled provider test**. Dashboard → "Uji koneksi sosial" and inspect results; then review a real draft and test one Ceritexa Page post and **one private YouTube upload per channel** under controlled permission settings. The Cloudflare `ALLOW_PUBLICATION` switch must remain `false` until tests pass **and** you explicitly decide to activate real publishing.
8. **Optional, not blocking initial pilot**. Consider enabling R2 when you have an accepted payment/activation route. The isolated KV storage already supports limited images and small MP4 files; it is not a scalable media library.

Expected user effort: token rotation / GitHub action secret, approving the first draft, Meta Page authorization, OAuth for Panex and Heros. The agent does not need a VPS.

## Social integration onboarding — 2026-10-25
Current owner-confirmed: onboarding steps 1-3 (admin login, repository action connection and dashboard checks) performed. Before public publication, owner must configure:
- Meta Developer app with **Manage everything on your Page** use case and Page posting scopes. Official https://developers.facebook.com/docs/pages-api/getting-started
- The **Ceritexa Studio** Facebook Page identifier under the Ceritexa Worker binding FB_PAGE_ID and corresponding Page credential under the existing protected FB_PAGE_ACCESS_TOKEN binding. Never reuse the Nusa Penida Experiences Page.
- A separate Google Cloud project for Ceritexa with **YouTube Data API v3**, Google Auth Platform (Branding, Audience, Data Access, Clients), a Web OAuth client and offline consent for each distinct channel. https://developers.google.com/youtube/data/guides/auth/server-side-web-apps
- Each channel must be confirmed by YouTube channels.list mine=true. Obtain Panex and Heros Real Life distinct channel IDs from YouTube Advanced settings. https://support.google.com/youtube/answer/3250431?hl=id
- Current integration bindings: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN_PANEX, YT_REFRESH_TOKEN_HEROS (protected); YT_CHANNEL_ID_PANEX and YT_CHANNEL_ID_HEROS (ordinary non-secret identifiers).
- Google external OAuth applications in Testing may give only 7-day authorizations; move to In production and complete the applicable verification before sustained autopilot. https://developers.google.com/identity/protocols/oauth2
- Confirm identity in Dashboard → **Uji koneksi sosial**; expect three verified=true results, separate channel IDs, and Facebook Page name **Ceritexa Studio**.
- Keep ALLOW_PUBLICATION=false until official controlled end-to-end tests and explicit owner launch approval. Existing YouTube uploader always sets videos private; Facebook Reels is not yet available.

## Google OAuth Branding — public pages (added 2026-10-26)

Ceritexa's public branding site now lives in this repository's **single canonical `docs/` folder**:
- `docs/index.html` — public homepage describing Ceritexa's AI-assisted original content service, owner-controlled approval and three channels.
- `docs/privacy.html` — complete plain-English Privacy Policy for Google YouTube API and Facebook Page data.
- `docs/terms.html` — Terms of Service.
- `docs/style.css` — a single shared stylesheet; do not duplicate page CSS.

**Owner activation required** (GitHub connector does not manage GitHub Pages settings):
1. This repository → **Settings → Pages → Build and deployment**.
2. Source: **Deploy from a branch**; Branch: **main**; Folder: **/docs** → Save.
3. Wait for GitHub Pages deployment, then open the three URLs in a private/incognito browser and check HTTP success before entering them in Google OAuth Branding:
   - Application home page: `https://rama160.github.io/ceritexa-ai-content-agent/`
   - Application privacy policy link: `https://rama160.github.io/ceritexa-ai-content-agent/privacy.html`
   - Application terms of service link: `https://rama160.github.io/ceritexa-ai-content-agent/terms.html`
4. Google Cloud → Google Auth Platform → Branding → **Authorized domains**: enter `rama160.github.io` (domain only, no https or path), once the domain verification prerequisites are met. Do **not** enter `github.io` alone or `finchat-ai-gateway.workers.dev`.
5. Google may require that the registrable domain be verified using **Google Search Console** by a project owner. A public GitHub Pages URL is **not itself proof of domain ownership**. If Google's verification rejects the shared GitHub Pages domain, use a domain/subdomain you can control and verify, and update the URLs accordingly; do not claim production approval prematurely.
6. Logo: square 120×120 PNG <=1MB; user can upload the optimized Ceritexa branding logo supplied separately in the chat. Uploading an app logo to an External production OAuth consent screen can trigger brand verification.
7. Google Auth Platform → Audience → Publish app / In production when available; branding verification and sensitive-scope review may remain separate checks, and YouTube private upload/API audit restrictions can still apply. The authorization flow must be re-run if previously issued Testing refresh tokens are expired or scope-incomplete.

**Current status:** public page source committed; GitHub Pages activation and external HTTP accessibility **not verified**. Never paste tokens into these static files. This documentation-only change must not update Cloudflare Worker bindings or any unrelated repo.
