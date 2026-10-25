# Ceritexa AI Content Agent

Worker dashboard & orchestration for **Facebook Ceritexa Studio**, **YouTube Panex** (life stories), and **YouTube Heros Real Life** (original superheroes).

## Status and safe deployment
The new, isolated Cloudflare Worker (public URL on account workers.dev suffix) is `ceritexa-content-agent` and D1 is `ceritexa-content-db`. R2 is **not yet enabled** on the account; a new isolated Workers KV media fallback is bound as MEDIAKV for limited pilot images/short clips. Media generation is unverified until ADMIN_TOKEN and API smoke tests. Meta/YouTube OAuth secrets are **not configured**. Publishing is disabled by default, and D1 setting paused starts true. Do not claim public posting ready.

## Quick start
Read `AI_START_HERE.md`, `PHASE.md`, `PRD.md`, `ARSITEKTUR.md`, `CHANGELOG.md`.
```bash
npm test
npm run check
npx wrangler d1 migrations apply ceritexa-content-db --remote
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```
Use a random admin token >=24 chars. Login at the Worker URL. Only the public health endpoint needs no token.

## Current capabilities
- Trend research from Google Trends RSS; transparently labeled fallback ideas.
- Draft text (Workers AI), optional image using KV fallback, review and UTC scheduling.
- Dashboard for approval & analytics, protective pause; no unapproved post.
- Facebook Page text/photos adapter; YouTube private MP4 uploader and per-channel verification are implemented but **untested pending credentials, R2, provider permissions**.
- Video composer/render pipeline **not implemented**; short MP4 can be uploaded using KV after integrations are tested.
- No auth secrets in this public repo. No worker code from Nusa Penida Experiences or Spenva/Finchat is modified.

## Required one-time owner action: Admin login and integrations
1. Open [Cloudflare dashboard](https://dash.cloudflare.com/), Workers & Pages → **ceritexa-content-agent** → Settings → Variables and Secrets.
2. Create a **secret** `ADMIN_TOKEN` containing a new random passphrase of at least 24 characters (not a normal plain variable). Save it privately, never commit it to this public repo.
3. Open `https://ceritexa-content-agent.finchat-ai-gateway.workers.dev/` and enter the token. The account workers.dev suffix is shared, **not the Worker code/resources**.
4. First test `/api/health`, admin login, research, one AI text draft and approval. If Workers AI model has no access, check the model and quotas.
5. Set up a new Ceritexa Facebook Page and verify Page token; configure Panex and Heros YouTube OAuth tokens with separate verified channel IDs. The publishing switch MUST remain off until owner checks live/private smoke tests.
6. The app currently cannot auto-render full-length video nor upload Facebook Reels; this is not a finished autonomous multimedia agent.
