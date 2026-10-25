# AI START HERE — Ceritexa canonical rules
Version 1.1.0 — 2026-10-25

1. Always read this file, PHASE.md, CHANGELOG.md, PRD.md and ARSITEKTUR.md before work.
2. Edit existing owner modules rather than writing similar/duplicate files; do not add suffixes *_fixed, *_new, _v2.
3. After **every** change update PHASE.md and CHANGELOG.md; modify PRD/ARSITEKTUR on contract changes.
4. Never modify/delete/access Spenva, Finchat or Nusa Penida Experiences resources, code, secrets or repositories.
5. Three channels: Panex = life stories; Heros Real Life = **original** superhero; Ceritexa Facebook = diverse original text/photo/comic/reels.
6. No copied TV, Marvel/DC hero, reused content without permission, fake news, views/follower manipulation or mass posting.
7. Secrets only in Cloudflare secrets; do not add to public GitHub. Owner approval is mandatory before posting. Default Cloudflare vars ALLOW_PUBLICATION=false, ALLOW_DAILY_DRAFTS=false and D1 paused=true.
8. Each social channel OAuth must confirm correct channel/page ID. Failed/ambiguous publish => UNCERTAIN, never blind retry.
9. Do not claim R2/video automation, app review approval, or provider monetization until **live verified**.
10. Tests: npm run check, npm test, then D1 health/auth/draft/publisher E2E; record outcomes.
11. Admin dashboard for mobile only stores ADMIN_TOKEN in page memory, not localStorage.
12. Monthly draft quota cap and Pause All; never automatically purchase, upgrade, boost posts.
