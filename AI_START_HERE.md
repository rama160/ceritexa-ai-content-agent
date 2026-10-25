# AI START HERE — Ceritexa canonical rules
Version 1.2.1 — 2026-10-25

1. Always read this file, PHASE.md, CHANGELOG.md, PRD.md and ARSITEKTUR.md before work.
2. Edit existing owner modules rather than writing similar/duplicate files; do not add suffixes *_fixed, *_new, _v2.
3. After **every** change update PHASE.md and CHANGELOG.md; modify PRD/ARSITEKTUR on contract changes.
4. Never modify/delete/access Spenva, Finchat or Nusa Penida Experiences resources, code, secrets or repositories.
5. Three channels: Panex = life stories; Heros Real Life = **original** superhero; Ceritexa Facebook = diverse original text/photo/comic/reels.
6. No copied TV, Marvel/DC hero, reused content without permission, fake news, views/follower manipulation or mass posting.
7. Runtime secrets only in Cloudflare Worker Secrets; GitHub Actions may use its encrypted Secrets store for CERITEXA_ADMIN_TOKEN, never committed to public files. Owner approval is mandatory before posting. **Current deployed Ceritexa config:** ALLOW_PUBLICATION=false (public posting OFF), ALLOW_DAILY_DRAFTS=true (daily draft generation), D1 paused=false (draft mode resumed by explicit owner request). Never change ALLOW_PUBLICATION to true before provider E2E approval.
8. Each social channel OAuth must confirm correct channel/page ID. Failed/ambiguous publish => UNCERTAIN, never blind retry.
9. Do not claim KV/R2/video automation, app review approval, or provider monetization until **live verified**.
10. Tests: npm run check, npm test, then D1 health/auth/draft/publisher E2E; record outcomes.
11. Admin dashboard for mobile only stores ADMIN_TOKEN in page memory, not localStorage.
12. Monthly draft quota cap and Pause All; never automatically purchase, upgrade, boost posts.

13. One canonical video renderer: `tools/render_video.py`; orchestration only in `.github/workflows/render-video.yml`. Do not create additional video scripts; edit these originals.
14. Video generation: Worker creates an AI illustrated VIDEO draft with `BLOCKED / VIDEO_RENDER_REQUIRED`, GitHub Actions uses offline Indonesian TTS + FFmpeg subtitles and uploads an MP4 back into the draft for owner review. Requires **GitHub Actions secret** `CERITEXA_ADMIN_TOKEN` matching the Cloudflare `ADMIN_TOKEN`. Never place either in source or logs.
15. Analytics-to-strategy engine lives in `src/index.js` under `strategy()`; strategy changes topic suggestions only after at least 3 published posts with actual available metrics. Missing analytics are always labeled unavailable.
16. The AI text provider is Gemma 4 26B A4B IT on Workers AI, fallback Llama 3.1 8B; revalidate schemas on model changes.
17. Verified Cloudflare account workers.dev suffix may contain another project's name; **only** isolated script `ceritexa-content-agent`, its D1, and its own KV may be changed. Shared suffix is not shared deployment.
18. Never claim full autopilot until owner has configured approved Facebook Page token and both verified YouTube OAuth channel refresh tokens, run provider tests, enabled publishing after consent, and confirmed media/video CI.

19. Security gates: Meta Page identity must match configured ID and a Page name beginning with Ceritexa; each Google OAuth token must match its own distinct YouTube channel ID. No token is ever returned from /api/connections/verify.
20. Dashboard provides /api/readiness and /api/connections/verify (admin-only); readiness checks are configuration checks, not proof that provider permissions or publication are operational.
21. Manual GitHub Actions CI includes read-only HTTP smoke with 401 anonymous checks (tests/smoke.py); it requires owner to mirror rotated ADMIN_TOKEN in GitHub Secret CERITEXA_ADMIN_TOKEN.
22. GitHub renderer refuses video longer than 59 seconds or drafts over 145 words; edit existing draft to create a complete ~95-125 word Short rather than trimming speech.
