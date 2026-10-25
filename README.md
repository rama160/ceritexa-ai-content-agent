# Ceritexa AI Content Agent

Worker dashboard & orchestration for **Facebook Ceritexa Studio**, **YouTube Panex** (life stories), and **YouTube Heros Real Life** (original superheroes).

## Status and safe deployment
The new, isolated Cloudflare Worker is `ceritexa-content-agent` and D1 is `ceritexa-content-db`. R2 is **not yet enabled** on the account; media generation/upload remains blocked. Meta/YouTube OAuth secrets are **not configured**. Publishing is disabled by default, and D1 setting paused starts true. Do not claim public posting ready.

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
- Draft text (Workers AI), optional image when R2 available, review and UTC scheduling.
- Dashboard for approval & analytics, protective pause; no unapproved post.
- Facebook Page text/photos adapter; YouTube private MP4 uploader and per-channel verification are implemented but **untested pending credentials, R2, provider permissions**.
- Video composer/render pipeline **not implemented**; manual MP4 can be uploaded after R2 works.
- No auth secrets in this public repo. No worker code from Nusa Penida Experiences or Spenva/Finchat is modified.
