# AI START HERE — Ceritexa canonical rules
Version 1.4.2 — 2026-10-25

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

23. Public OAuth brand site is exclusively in `docs/index.html`, `docs/privacy.html`, `docs/terms.html` and shared `docs/style.css`; update these existing files, never add duplicate homepage/privacy/terms files elsewhere. Its role is public documentation, completely separate from the protected Worker dashboard.
24. Production OAuth settings require real accessible links and ownership verification; GitHub Pages deployment from main:/docs is OWNER ACTION because this integration cannot change repository Pages settings. Do not claim GitHub Pages URL works until real external HTTP check succeeds. GitHub Pages hostname ending .github.io is shared, so Google Search Console verification may need a separately controlled domain.

25. Editorial topic selection is canonical in src/core.js: EDITORIAL_TOPICS, CHANNEL_KEYWORDS, score() and selectDraftTopic(). Do not use unrelated RSS trending headlines for YouTube Heros/Panex; irrelevant trending titles must use channel-specific original story fallback. Manual owner-entered topics always take priority unless blocked by safety policy.
26. Pilot verification 2026-10-26: Cloudflare D1 and audit logs show Worker DRAFT_CREATED events for Facebook TEXT and Heros VIDEO; Heros art draft is BLOCKED/VIDEO_RENDER_REQUIRED pending video-render workflow. Do not claim a complete video exists until MP4 is present. User independently confirmed all three official channel identities verified=true. OAuth provider test does not equal publish E2E.

27. Dashboard logo uses owner's supplied Ceritexa artwork embedded ONCE as CERITEXA_LOGO in the existing src/index.js. Do not create duplicate branding files or use a stock logo.
28. Canonical review routes in src/index.js: authenticated GET /api/preview/:id; POST /api/posts/:id/preview, /api/posts/:id/reject, and /api/posts/:id/regenerate, plus original edit/approve/schedule/upload handlers. No duplicate controllers.
29. Review metadata ONLY in migrations/0002_review_feedback.sql: draft_reviews (post_id, parent_id, revision_depth, rejection_reason, rejection_note, regen_state, preview_media_key, last_error). Migration is idempotent and old posts remain untouched.
30. On rejection preserve old post in REJECTED state, record feedback, generate a distinct child based on the original topic with creativeSimilarity, maximum three child revisions. If model generation fails, report FAILED and allow explicit retry only. Never auto-approve or publish any regenerated content.
31. TEXT, PHOTO, COMIC and VIDEO all attempt AI image previews on creation; old drafts can request an artwork via existing preview endpoint. AI media is privately stored in Ceritexa KV; fallback uses owner's actual logo. Preserve preview_media_key when a VIDEO draft's media_key becomes MP4.
32. Only Ceritexa Worker resources and secrets may be touched; ALLOW_PUBLICATION=false remains mandatory throughout pilot testing.

33. Ceritexa Android install is a Progressive Web App, not a new Flutter/Android app and not a new Cloudflare Worker. The canonical web manifest, brand icon endpoints, and service-worker source are defined in existing src/index.js so manual single-script Cloudflare deploy still works. Do not introduce duplicate dashboard or parallel service-worker modules.
34. PWA public routes are GET /manifest.webmanifest, /sw.js, /icon-192.svg, /icon-512.svg and /icon-96.jpg. They do not require admin authorization. Manifest uses display=standalone, scope=/, start_url=/ and original Ceritexa branding. The dashboard registers the service worker only on HTTPS and supports beforeinstallprompt as available, with an Android Chrome menu fallback.
35. SECURITY CRITICAL: service-worker cache contains ONLY the public HTML shell and icons/manifest. Do not cache ANY /api/ response, private photo/video/blob, bearer authorization header, draft content, analytics, access token or admin token. On offline startup show shell but API operations require internet and private login. Never save ADMIN_TOKEN in localStorage, IndexedDB, Cookies, cache, or manifest.
36. All changes stay on ceritexa-content-agent Worker only; published posting remains ALLOW_PUBLICATION=false. Update existing tests/core.test.js plus documentation on every PWA change. If PWA browser prompt is absent, document manual Chrome menu installation rather than claiming guaranteed prompt.

37. v1.4.1 media viewing is OWNED by existing src/index.js and tests/core.test.js. Do NOT add separate viewer files/controllers. A private media button opens the visible mediaDialog modal immediately, then retrieves media with an admin Bearer token and shows loading/errors, zoomable image or playable MP4 video with native controls and playsInline.
38. Always differentiate JPEG artwork from an MP4 video: VIDEO drafts in BLOCKED/VIDEO_RENDER_REQUIRED are illustration-only until render-video.yml produces an actual MP4. Never label a JPEG as “Putar video”. Dialog close MUST pause playback, revoke blob URLs and clear DOM. The CSP `media-src 'self' blob:` is required for in-memory private video playback.
39. Preserve PWA service-worker behavior: /api/media, /api/preview, credentials and all draft responses MUST NOT be cached. Browser/device acceptance is separate from code and Cloudflare deployment tests.

40. Renderer status must be truthful: GitHub Actions Success is NOT proof MP4 exists. Canonical tools/render_video.py must exit nonzero when any attempted render or upload fails. It verifies MP4 H264+audio, signed upload response, and D1 media_type=video/mp4 state=PENDING_REVIEW.
41. Canonical renderer is existing tools/render_video.py and existing .github/workflows/render-video.yml only. No duplicate or parallel engine. Private POST /api/posts/:id/render-event writes STARTED,FAILED,COMPLETED audit events. Completion is blocked unless D1 confirms MP4. No additional tables or credentials.
42. Installed PWA may show a JPEG cover for a real MP4, but actual video will have ▶ Putar MP4 overlay; blocked JPEG displays explanatory message and latest renderer event. No media auto-publishing. PUBLICATION=false.
43. Github workflow now has preflight/self-test, missing-secret failure, red failure logs, summary, existing schedule and a push trigger limited to renderer/workflow changes, so an internal retry may run without owner approving public posting.
44. Never say renderer succeeded unless the actual D1 post has media_type video/mp4 and state PENDING_REVIEW; inspect Actions error and exact D1 state.
