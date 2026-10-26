# PRD — Ceritexa AI Content Agent 1.7.1
Tanggal: 25 Oktober 2026 | Status: IMPLEMENTASI BERTAHAP

## Produk, pemilik dan batasan
Satu agen biaya rendah untuk Ceritexa Studio (Facebook Page), Panex (cerita kehidupan YouTube), Heros Real Life (superhero orisinal YouTube). Nusa Penida Experiences out of scope mutlak. Tidak mengubah, menghapus, atau mengambil alih konten lama dari kedua YouTube.

## Outcome
Meningkatkan audiens organik 30 hari menggunakan konten asli foto, teks, komik, video. Penghasilan tidak dijamin dan hanya tersedia setelah diterima program platform. Tidak membeli followers, repost tanpa izin, atau video mirip template massal.

## KPI pilot 30 hari — target produksi, bukan janji penayangan
- Facebook 24 post (8 foto cerita, 6 komik, 6 teks, 4 Reels), setelah izin tersedia.
- YouTube 10 Shorts (Panex 6, Heros 4), berbeda cerita/identitas.
- Anggaran target Rp0–300.000; setiap provider berbayar **off default**.
- Publication successful >=95% ketika terotorisasi, no double-post; konten lisensi tercatat 100%.
- Ukur followers, reach, views, subscriber, watch metrics jika izin memungkinkan, tidak mengarang earnings.

## Prioritas requirement
| ID | Prioritas | Requirement | Kriteria diterima |
|---|---|---|---|
| FR01 | P0 | 3 kanal terpisah | ID dan kebijakan tiap kanal tetap |
| FR02 | P0 | Ingest tren RSS | Timestamp, URL dan sumber jelas |
| FR03 | P0 | Naskah AI orisinal | Naskah+prompt+model tercatat |
| FR04 | P0 | Foto & komik AI | Bukti asal dari AI, aset R2 privat |
| FR05 | P0 | Review & approval | Default HOLD; hanya admin memutuskan |
| FR06 | P0 | Schedule WITA | Disimpan UTC, no duplikat |
| FR07 | P0 | Facebook Page publishing | Melalui token Page dan post ID |
| FR08 | P0 | YouTube verified channel | Private upload default; channel match |
| FR09 | P0 | Metrics | N/A jika akses tidak tersedia |
| FR10 | P0 | Budget + pause | Hard stop semua mutasi publik |
| FR11 | P1 | Analytics to strategy | Evaluasi mingguan, alasan & rollback |
| FR12 | P1 | MP4 creator | Renderer berlisensi dan narasi orisinal |
| FR13 | P1 | Admin dashboard HP | Daftar draft, review, jadwal, status |
| FR14 | P1 | Exceptions log | Ambiguous publish => UNCERTAIN (no blind retry) |
| FR15 | P2 | Premium cinematic video | Off sampai owner setuju biaya |

## Editorial
- Panex: drama keluarga, kehidupan, bisnis kecil, perjuangan; visual realistis, jelas fiksi.
- Heros Real Life: karakter pahlawan buatan sendiri, tidak boleh karakter/logos/musik Marvel/DC.
- Ceritexa Facebook: turunan editorial tema, teks/komik/foto, bukan duplicative cross-post.
- Setiap draft harus mempunyai asal media, pernyataan hak, review, dan deklarasi AI saat diwajibkan platform.

## 30-day timeline
D1–7: setup+3 pilot; D8–14: 6 konten; D15–21: 7 konten; D22–30: 8 konten. Jika API belum siap, tunda publishing tanpa memalsukan hasil.

## Alur
Tren berizin -> pemeriksaan skor/safety -> skrip AI -> gambar panel / teks -> review hak -> admin approval -> schedule -> adapter resmi -> metrics -> evaluasi -> strategi (tidak belajar dari views total lifetime).

## Non-fungsional
P0: no secret in repo/logs; auth header; idempotency; KV private media fallback (R2 when enabled); fail-closed network; anti-spam, rate limit. All timestamps UTC in DB, UI WITA; worker cron UTC. D1 & KV quotas monitored. Availability target conditional on platform APIs, no automatic retry ambiguous publication.

## Pengecualian jujur
Video otomatis lengkap, integrasi produksi, dan analytics resmi belum dianggap selesai sampai E2E nyata serta OAuth tervalidasi. Deploy saja bukan bukti autopilot.

## Acceptance
Tests + build green, Cloudflare bound and deploy, admin denied without token, post drafts created, rights approved, one FB publish test, one YouTube private test per channel, analytics fetched, Pause All works, no repeated posting.

## v1.4.0 — Implemented pilot additions and limits
- Original AI video draft generates a still image; GitHub Actions renderer composes image, offline Indonesian speech and subtitles into a <8MB MP4. The owner still reviews before approval. Actions requires CERITEXA_ADMIN_TOKEN GitHub secret and can have schedule delays.
- Adaptive editorial planning evaluates actual post engagement per distinct channel and suggests top-performing subject only after >=3 published posts with recorded metrics. It cannot autonomously change brand, buy services, change OAuth scopes or delete posts.
- The automated daily draft rotation is split between Ceritexa Facebook TEXT/PHOTO/COMIC, Panex VIDEO and Heros VIDEO, with hard monthly quota. Deployed Cloudflare setting now allows daily draft-only rotation; public publication remains disabled and owner must explicitly approve every item.
- Provider OAuth integrations, Facebook Reels uploader, real YouTube public posting, final analytics and monetization remain external acceptance gates. Never represent them as verified or guaranteed.
- R2 unavailable: KV file fallback is used only for pilot media <=8MB, not large-scale production.

## v1.4.0 acceptance addendum
- Dashboard exposes readiness of bindings/credentials separately from live connection identity checks. Readiness never reveals secrets or claims untested authorization.
- Facebook Page ID and returned Page name must represent Ceritexa Studio; disallow posting to other Pages such as Nusa Penida Experiences even if a token is mistakenly configured.
- YouTube must verify distinct OAuth channel IDs for Panex and Heros, and upload PRIVATE in pilot.
- Shorts stories 95–125 words; rendering fails safely if duration >59 seconds rather than clipping endings.
- CI smoke verifies protected routes reject anonymous requests; this is separate from unit tests and only runs on manually triggered workflow when owner provides GitHub Action secret.

## 2026-10-26 — Pilot draft editorial quality gate
- Channel-aligned topic selection: a global trend is never automatically inserted into an unrelated original fiction category. Text matching for relevance is deliberately conservative and falls back to editorial evergreen seeds appropriate for each of the three brands.
- Priorities: explicit owner topic > channel-aligned strategy suggestion supported by metrics > channel-relevant RSS topic > channel-specific original story seed.
- Existing off-topic drafts are not deleted or automatically published; owner may edit or reject them in pending review. For new drafts, use the updated policy.
- Acceptance proof: Cloudflare D1 audit contains DRAFT_CREATED for real Worker calls; public posting remains disabled and YouTube VIDEO requires human review and MP4 rendering.

## v1.4.0 owner visual review and feedback requirements
- Every draft review card must show a visual: private AI artwork, owner-uploaded image, or the actual Ceritexa logo as fallback. Even TEXT drafts create AI artwork for REVIEW (Facebook TEXT publishing remains text only).
- Owner can generate or replace a missing image through a protected action; existing drafts do not have to be discarded. Manual image replacements are capped at 8 per day.
- Reject any pending/blocking draft with one of seven predefined reasons plus optional written feedback. Original remains REJECTED with audit and review metadata; do not delete it.
- Agent produces a new distinct child draft for the SAME channel, format and topic, based on the prior story, the reason and owner notes. It must avoid identical titles/captions and high lexical similarity; subjective improvement still requires human judgment.
- Maximum 3 automated regenerations per ancestry chain. On failure, visible FAILED state and explicit retry only, with no automatic infinite loop or duplicate children.
- Draft remains pending approval and cannot publish unless explicit human approval, schedule and separate production publishing flag. No changes to Facebook/YouTube secrets, Nusa Penida Experiences, Finchat or Spenva.

## v1.4.0 — Installable Ceritexa dashboard on Android
- Owner can install Ceritexa AI Content Agent from Chrome/Samsung Internet as a standalone Progressive Web App with branded home-screen icon; no Play Store, APK, subscription, VPS or separate app deployment required.
- Same HTTPS dashboard and backend; no extra account connections, tokens, data migration, or changes to Facebook/Panex/Heros workflows. The installation UX displays a clear install button when Android Chrome offers an install event, and readable manual Chrome ⋮ → Add to Home screen → Install instructions otherwise.
- Manifest must expose canonical id/scope/start_url=/, names, theme/background, standalone display, and 192/512 scalable branded icons with raster fallback.
- Offline scope limited to PUBLIC application shell, logo, manifest and icons. No offline draft viewing, approval, rejection, upload, scheduling, or API caching. Admin token remains memory-only and must be entered again on reopening.
- Preserve owner approval, review cards, image preview, rejected originals, draft feedback, and ALLOW_PUBLICATION=false.

## v1.4.2 — MP4 completion acceptance
- Green GitHub Actions status requires confirmed MP4 upload and D1 post state=PENDING_REVIEW/media_type=video/mp4. Renderer failure must produce nonzero process exit.
- Renderer must verify video and audio, H264 codec, vertical MP4 and size, preserve story, and only accept a correct upload acknowledgement. Show renderer errors on the actual PWA draft.
- Static JPEG cover remains a thumbnail; actual MP4 gives an obvious ▶ Putar MP4 button. No public publishing and owner approval remains necessary.

## v1.5.0 — Cinematic storyboard, natural-sounding Indonesian narration
- Owner rejected previous single static image + espeak-ng voice and approximate captions as below intended quality. New renderer MUST use FOUR UNIQUE visual scenes with framing, moving virtual camera, fading transitions and voice-synchronized captions.
- Humanlike neural Indonesian TTS for Panex/Heros, default Gadis/Ardi, never robotically downgrade on failure. Narrator is synthetic, not a real person; confirm commercial voice license before monetization.
- Label output honestly as CINEMATIC_MOTION_COMIC. Camera moves over original AI illustrations; characters do NOT physically animate. True text/image-to-video is a separate explicitly approved PAID future capability, OFF by default.
- Owner reviews storyboard, can voluntarily upgrade an unapproved MP4, and approves new MP4 independently. Previously approved/scheduled/published content is never changed by re-render.
- Four storyboard keys in the additive canonical D1 table, 12 new AI scene cap per day, no charged models, <=7.5MB vertical H264/AAC MP4, 8-59 second speech and synchronized SRT.
- Acceptance: four visually distinct beats, valid moving-camera 540x960 video, coherent neural narration, timed subtitles, actual D1 upload confirmation and full review in installed PWA. Approval/public posting remains separate.

## v1.6.0 — Narrative-led scene count (supersedes historical fixed-4 requirement)
- The director agent picks storyboard cuts from narrative developments, plot twists, action, changes of scene/character, punctuation and channel pacing. It must not silently omit story beats to comply with a fixed scene count.
- Preserve every word in an ordered narration beat. Panex may hold emotional framing; Heros may use faster action cuts. Same-length scripts can legitimately have different shot counts. Display planned count and progress in the installed PWA.
- No fixed four-scene requirement; a defensive maximum of 24 shots protects Shorts from broken inputs. Use actual neural voice duration and spoken word ratios to time each shot, not equal-duration cuts.
- The 12-extra-images-per-day free resource guard is independent from shot planning. If a storyboard needs more frames, show incomplete progress and permit continuation instead of automatically reducing the story.
- Re-render of an older MP4 requires the owner and must preserve existing object bytes. All new MP4 files still require explicit review, no public posting.
- Acceptance: distinct Panex/Heros scripts create different counts; narrative is fully preserved; historical D1 rows survive migration; FFmpeg valid 6- and 10-scene H264/AAC output verified; private access maintained.

## v1.6.1 — Non-destructive video production and real internal acceptance
- Rendering a replacement video must create a fresh versioned private object. No overwrite or deletion of an earlier MP4 that the owner had reviewed. A delayed upload cannot change a previously approved/scheduled/published draft back to review.
- Progressive storyboard generation from PWA runs in bounded batches via one owner click, with an explicit incomplete/quota status rather than truncating the planned count.
- Before any live render, the GitHub workflow exercises the same FFmpeg H264/AAC camera-motion/subtitle encoder with distinct synthetic scenes and no credentials or public provider calls.
- Internal acceptance evidence: GitHub Actions uploaded an eight-scene Panex MP4 using a neural Indonesian narrator to the isolated Ceritexa D1/KV, with audit RENDER_COMPLETED; all user-owned legacy drafts remain untouched and public posting stays OFF.

## v1.7.0 — Approved clean, mobile-first four-page owner dashboard
- Owner APPROVED preview v3 with 4 separate navigable views: Home for focus and counts, Draft with Review and Disetujui tabs, Analitik with real metrics and filters, Tren with editable ideas. No excessively long single-page scroll and NO integration-readiness card. Mobile bottom navigation and desktop sidebar remain responsive; branded Ceritexa styling preserved.
- Drafts in states BLOCKED/PENDING_REVIEW appear in Review. APPROVED/SCHEDULED/PUBLISHED are collected under Disetujui. REJECTED is excluded from both active lists but all rejected rows/audit and automated revisions remain in database.
- Reuse existing actions: generate, edit, approve, reject with reasons and improvements, preview original JPEG/MP4, upload media, owner-initiated cinematic re-render, storyboard gallery, scheduling, trend research and actual analytics. No duplicate endpoints or fake metrics.
- Owner remains logged in across ordinary reloads and browser/app restarts after one Admin Token connection. Backend stores only hashed opaque session tokens in D1; secure SameSite Strict HttpOnly cookie with server-side revocation on Logout and protection against CSRF/brute force. Credential rotation/browser storage clearing/expiry may end the session. Never promise an unbounded irreversible login.
- External GitHub renderer uses existing Authorization Bearer token independently of owner cookie. No change to media, auto-draft scheduling, publication permissions or other Cloudflare projects.

## v1.7.1 — Session usability under connectivity changes
- A temporary Wi-Fi/mobile interruption during dashboard boot or refresh must not display login as if the user signed out. Show a reconnect screen; retry automatically when connectivity returns or on owner tap, retaining the secure server-side session cookie.
- Explicit authenticated:false from /api/auth/me requires reauthentication; failed network fetch indicates a network/service problem, not logout.
- Logout is successful only after the dedicated Worker confirms revocation. When offline surface an error and retain the session instead of showing false success.
- No plaintext credential caching, background public publishing or changes to Facebook/YouTube tokens.
