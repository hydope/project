# Social Scheduler — Phase 1 Build Report (2026-11-21)

**Status: built LOCAL ONLY. Nothing committed, pushed, or deployed.** All changes sit
uncommitted in the `shiarishta-deploy` working tree.

**Concept (Syed's clarification):** the ShiaRishta admin portal is ONLY the control
panel. Posts are published **natively** to Facebook Page, Instagram, and YouTube via
their official APIs — nothing is posted on shiarishta.com itself.

## Files changed / added

| File | Change |
|---|---|
| `php-api/db/schema.sql` | + `social_accounts`, `social_posts`, `social_post_targets` tables; marker-bump comment (changes the sha1 digest `migrateSchema()` keys on, so the migration actually runs in production) |
| `php-api/lib/migrate.php` | + `migrateAddSocialSchedulerTables()` (same DDL + column-ensures for `source`, `caption_hash`, `consecutive_failures`), called from `migrateSchema()` |
| `php-api/lib/bootstrap.php` | + `socialConfig()` — env reading with empty defaults for `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `API_PUBLIC_URL`, `ADMIN_URL`, `SOCIAL_INGEST_KEY` |
| `php-api/lib/SocialPublisher.php` | **New.** Meta Graph publisher (FB feed/photo/video/Reel, IG media-container image + REELS with processing poll), YouTube Data API v3 resumable upload with refresh-token handling and `status.publishAt` native scheduling, per-target orchestration, post-status recalculation, 3-failure account rail |
| `php-api/lib/SocialAutopilot.php` | **New.** Autopilot settings, content pillars + brand template bank, AI caption generation with template fallback, caption-hash dedup, slot filling, daily caps |
| `php-api/routes/social_scheduler.php` | **New.** Admin API (accounts/connect/disconnect/reactivate, posts CRUD, publish-now, retry, media upload, autopilot settings), OAuth callbacks (Meta + Google), public media serve, reel ingest endpoint |
| `php-api/index.php` | Requires the new files; dispatches `/api/admin/social/*`, `/api/social-oauth/:provider/callback`, `/api/social-media/:file`, `/api/social-ingest` |
| `php-api/social-publish-cron.php` | **New.** Publishes all due scheduled posts (every source, one path) |
| `php-api/social-autopilot-cron.php` | **New.** Hourly fallback generator (see Autopilot) |
| `php-api/.env.example` | + Social Scheduler env block |
| `src/pages/admin/AdminSocialScheduler.jsx` | **New.** "Social Scheduler" admin page: accounts + Connect buttons, autopilot panel, composer, queue with per-platform live links |
| `src/routes.jsx`, `src/layouts/AdminLayout.jsx` | Route `/admin/social-scheduler` + sidebar link |

## Tables added

- **`social_accounts`** — platform (`facebook|instagram|youtube`), platform_account_id,
  account_name, `access_token_enc` / `refresh_token_enc` (AES-256-GCM via the existing
  `encAtRest()` / `DATA_ENCRYPTION_KEY` helper — tokens are never returned by any API),
  token_expires_at, scopes, status (`connected|disconnected|needs_attention|error`),
  `consecutive_failures`, timestamps. Unique on (platform, platform_account_id).
- **`social_posts`** — caption, caption_overrides (JSON, per-platform), media_path /
  media_type (`image|video`) / media_url, scheduled_at, status
  (`draft|scheduled|publishing|published|partial|failed`), `source`
  (`manual|autopilot|autopilot_reel`), `caption_hash` (UNIQUE — sha256 of the normalized
  caption; autopilot can never post the same caption twice), created_by, timestamps.
- **`social_post_targets`** — one row per post × account: platform, status
  (`pending|publishing|published|failed|skipped`), platform_post_id, platform_url
  (the live-post link shown in admin), error, attempts, published_at.

## Env vars needed (php-api/.env, from GitHub secrets on deploy)

- `META_APP_ID`, `META_APP_SECRET` — **not set; the Meta app does not exist yet** (see owner steps).
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google Cloud project (also read by the existing social-login route).
- `API_PUBLIC_URL` — optional; defaults to `https://shiarishta.com/api`. Used for OAuth redirect URIs and the media URLs Instagram fetches.
- `SOCIAL_INGEST_KEY` — shared secret for the reel ingest endpoint. Blank = ingest disabled.
- Existing: `SEEDER_CRON_KEY` (both crons), `DATA_ENCRYPTION_KEY`, `JWT_SECRET`.

Missing keys never crash anything: the Connect endpoints return a clear
"not configured" error naming exactly what is missing.

## How publishing works

- **Composer / queue:** `POST /api/admin/social/posts` (draft, scheduled, or publish-now),
  media via `POST /api/admin/social/media` (multipart, stored under the photo storage
  root at `social/<uuid>.<ext>`, served publicly at `/api/social-media/<file>` because
  Instagram must fetch media by URL).
- **Worker:** `curl -H "X-Seeder-Cron-Key: <SEEDER_CRON_KEY>" https://shiarishta.com/api/social-publish-cron.php`
  — suggested every 5 minutes (GitHub Actions or cPanel cron). It picks up every due
  `scheduled` post regardless of source, publishes each target, and records the platform
  post id + URL or the error. The admin "Retry failed" button re-runs only that post's
  failed/pending targets through the same code path.
- **Video is first-class:** one vertical MP4 publishes as an **IG Reel** (container with
  `media_type=REELS`, polled to FINISHED, then `media_publish`), an **FB Reel**
  (`video_reels` start→transfer→finish, falling back to a plain video post), and a
  **YouTube Short/video** (resumable `videos.insert`; when the slot is in the future it
  uploads as private with `publishAt` so YouTube itself schedules it natively).
- **YouTube tokens** refresh automatically from the stored refresh token
  (`access_type=offline` at connect). **Meta** connect exchanges for a long-lived user
  token, then discovers Pages via `/me/accounts` and stores each Page token plus the
  linked Instagram business account automatically.

## Autopilot

### The seam: generation is Muse-side, publishing is server-side

Reels cannot be generated on cPanel (no video generation there), and autopilot content
is **mostly reels generated by Muse**. So:

- **Generation (Muse side):** a scheduled agent job (ShortSmash pipeline at
  `~/workspace/shortsmash` — script → TTS → stock footage → karaoke captions → FFmpeg
  1080×1920) produces one vertical reel per slot and feeds it to the server.
  **This hourly agent job is NOT created yet** — it starts only after accounts are
  connected and Phase 1 live proof passes, the same gate as autopilot ON.
- **Ingest (the seam):** `POST /api/social-ingest` with header
  `X-Ingest-Key: <SOCIAL_INGEST_KEY>` (same secret-key pattern as the crons).
  Multipart: `video` file (or `mediaRef` = basename of a file already in the social
  media dir), `caption`, optional `captionOverrides` (JSON), optional `scheduledAt`
  (default = next free hourly slot). Creates a `social_posts` row with
  `source='autopilot_reel'`, `media_type='video'`, and targets for every connected,
  healthy FB/IG/YouTube account subject to the autopilot enables + daily caps.
  Duplicate captions are rejected (409) via the caption hash.
- **Fallback generator (server side):** `social-autopilot-cron.php` (hourly, same
  `X-Seeder-Cron-Key` pattern). If the next hour's slot has **no reel waiting** and no
  earlier fallback post, it fills the slot with a text/image post so the hour is never
  missed. Style sources: (a) our own previously published captions, (b) published blog
  posts + community posts from the DB, (c) a built-in brand template bank — Qur'an
  30:21 / 78:8 reflections, nikah duas, hadith, rishta tips, biodata-maker CTA,
  community questions, success-story format — rotated across 8 content pillars.
  Generation tries the existing NVIDIA integration (`aiComplete()` in `lib/ai.php`)
  first and falls back to the template bank on any unusable output — the same
  fallback pattern the blog engine uses. Images rotate the site's existing branded
  blog-cover images (GD poster as last resort); no external paid image APIs.
  Fallback posts never target YouTube (it requires video) and only target Instagram
  when an image exists.

### Settings & safety rails (Admin → Social Scheduler → Autopilot)

- **Autopilot defaults to OFF in code.** Nothing generates and the ingest endpoint
  refuses (409) until Syed turns it on in admin — after accounts are connected and
  Phase 1 live proof passes. The same toggle is the **kill switch**: off halts
  generation and ingest immediately (the cron checks it before every slot).
- **Per-platform enable + daily caps**, editable in admin. Defaults: Facebook 24/day
  (hourly), Instagram 24/day (hourly), **YouTube 6/day** — the YouTube Data API v3
  default quota is 10,000 units/day and one `videos.insert` costs 1,600 units, so
  ~6 uploads/day is the hard ceiling until Google grants a quota increase.
- **Failure rail:** 3 consecutive publish failures on an account flip it to
  `needs_attention`; autopilot and ingest skip it, the admin page flags it, and an
  admin can reactivate it after checking. A success resets the counter.
- **No repeats:** `caption_hash` UNIQUE + generator-side duplicate rejection.
- **One publishing path:** autopilot and reel rows are ordinary `social_posts`;
  `social-publish-cron.php` publishes them with identical status/proof recording.

## Owner-only steps remaining (cannot be done by the agent)

1. **Meta app — DOES NOT EXIST YET.** Syed's Create-app click from 2026-11-16 is still
   outstanding. He must create the app at developers.facebook.com (type: Business,
   name "Shia Rishta"), add the Facebook Login + Instagram products, register the
   redirect URI `https://shiarishta.com/api/social-oauth/meta/callback`, then put
   `META_APP_ID` / `META_APP_SECRET` into the server `.env` (GitHub secrets). Until
   then Meta connect returns "not configured" — by design, not a bug.
2. **Meta App Review:** submit for `pages_manage_posts` and
   `instagram_content_publish` (plus `pages_read_engagement`, `instagram_basic`)
   with a screencast of the scheduler; business verification may be required.
   Publishing to the owner's own Page works in dev mode before review, which is
   enough for the Phase 1 live proof.
3. **Google Cloud project:** create/select a project, enable **YouTube Data API v3**,
   configure the OAuth consent screen (External; scopes `youtube.upload`,
   `youtube.readonly`), create an OAuth Web client with redirect URI
   `https://shiarishta.com/api/social-oauth/google/callback`, and set
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. If the app stays in "Testing",
   add the channel-owning Google account as a test user; publishing the consent
   screen removes the 7-day refresh-token expiry. The channel-owning Google
   account is still unconfirmed — connect with the account that owns the
   ShiaRishta YouTube channel.
4. **Set `SOCIAL_INGEST_KEY`** on the server (long random string) and hand it to the
   Muse-side generator job when that job is created.
5. **Schedule the crons** after deploy: publish cron every ~5 min, autopilot cron
   hourly (both `X-Seeder-Cron-Key` authenticated, matching the existing cron pattern).
6. **Then:** connect accounts in Admin → Social Scheduler, run one manual post per
   platform as live proof, and only then turn Autopilot ON and create the hourly
   ShortSmash reel job.

## Verification performed (local)

- `php -l` clean on all new/changed PHP files (SocialPublisher, SocialAutopilot,
  social_scheduler routes, both crons, index.php, migrate.php, bootstrap.php).
- `npm run build` passes (Vite build + prerender, 506 routes).
- Offline probe of the autopilot library with a stubbed DB: settings default to OFF
  with caps FB 24 / IG 24 / YT 6, every template-bank caption carries a
  shiarishta.com CTA, caption-hash dedup is case/whitespace-normalized, and a run
  with autopilot OFF is skipped by the kill switch.
- Not yet verifiable locally: live Meta/YouTube calls (no app/credentials exist yet —
  see owner steps), and DB execution against MySQL (no local MySQL; DDL mirrors the
  existing schema style and the migrate function is idempotent).

## Meta connect fixes (2026-11-21, post-live-proof)

Live connect attempt (admin as Syed Ali, app "Shia Rishta Scheduler"
1854748145546859) proved YouTube connect end-to-end. Meta connect had two bugs:

1. **Facebook Connect button 404'd before OAuth.** The admin UI sent the
   platform name verbatim — `connect('facebook')` — while
   `routeAdminSocial()` only registered the `meta` and `youtube` connect
   sub-routes, so `/api/admin/social/connect/facebook` fell through to the
   404 at the bottom of the dispatcher and the UI showed a "Not found"
   banner. (Instagram's button worked because it already mapped to
   `meta`.) Fix: the UI now maps every non-YouTube platform to `meta`,
   and the API additionally accepts `facebook` as an alias for `meta`.
2. **Callback page discovery failed / mis-selected under Facebook Login
   for Business.** The callback only read `/me/accounts`:
   - with an asset-scoped grant (only the Shia Rishta Page + IG granted)
     it returned EMPTY -> false "No Facebook Page was found" error;
   - with an all-assets grant it returned several pages and the nested
     `instagram_business_account` expansion was not reliably populated,
     so Instagram was never discovered.
   Fix: new `socialDiscoverMetaPages()` — follows pagination on
   `/me/accounts`; when it returns nothing, OR returns pages but none
   carries a linked IG, it merges in the business route
   (`/me/businesses` -> `/{id}/owned_pages` + `/{id}/client_pages`,
   covered by business_management; the Shia Rishta Page is owned by
   portfolio 2222291815376368). Pages are deduped/merged by id, ALL
   discovered pages are stored as facebook accounts (never a blind
   first-page pick), IG-linked pages sort first so the default account
   for autopilot/ingest is the right one, and IG is resolved per page —
   list payload first, then `GET /{page-id}?fields=instagram_business_account`,
   with a username lookup when the id comes back without one. The clear
   "no Page" error now fires only when zero pages are visible after
   both routes; a separate error covers "pages visible but no Page
   access token returned".
   Regression test: `php-api/tests/social-discovery-test.php` (offline,
   stubbed Graph transport; scenarios A-E all pass).

## Meta connect fix round 2 (2026-11-21)

Round 1's fix deployed and the Connect button worked (OAuth opened, no
404), but a connect attempt granting ONLY the Shia Rishta Page +
@shiarishta.official (Facebook Login for Business, app 1854748145546859)
STILL failed with "No Facebook Page was found on that Meta account."
Root causes confirmed in code this round:

1. **Scope gap — the business route could never work.** The connect
   start (`socialConnectMeta()` in php-api/routes/social_scheduler.php)
   requested scopes
   `pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish`
   — `business_management` was NOT in the list, even though round 1's
   discovery depended on it for `/me/businesses` -> `owned_pages` /
   `client_pages`. Without the user granting it, those calls fail with a
   Graph permission error, so the portfolio-owned Shia Rishta Page was
   unreachable. Fix: `business_management` added to the connect-start
   scope list and to the scopes string stored on connected accounts.
2. **Silent Graph errors made every failure look identical.**
   `socialGraphListAll()` treated any response without a `data` array
   (including permission errors) as an empty list and discarded the
   error, so round 1 shipped with zero diagnostic signal. Fix: it now
   writes the first Graph error per call to an optional by-ref
   `$firstError` (formatted by new `socialGraphErrorDiag()` as
   `error <code>/<subcode>: <message>`, message clipped, no token/URL),
   and `socialDiscoverMetaPages()` records every route's outcome into a
   `$diag` map.
3. **Token handling — checked, was already correct.** The callback
   exchanges the code for a short-lived token, immediately exchanges it
   via `fb_exchange_token` for the long-lived user token, and discovery
   runs with that long-lived USER token. No change needed; the failure
   was permissions + silence, not token type or exchange order.

Additional discovery route + diagnostics added:

- Route 2: `GET /me?fields=accounts{id,name,access_token,instagram_business_account{id,username}}`
  (accounts connection nested under /me) is now tried between
  `/me/accounts` and the business route; `/me/accounts` is also called
  with `limit=100`. IG-linked-first ordering and per-page IG resolution
  from round 1 are unchanged.
- On a zero-page result the callback now reads `GET /me/permissions`
  and the admin redirect error is built by `socialMetaNoPagesMessage()`.

New diagnostic error format (shown in the admin via `?social_error=`):

```
No Facebook Page was found on that Meta account. Discovery — accounts: <outcome>; me.accounts-field: <outcome>; businesses: <outcome>; business-pages: <outcome>. Permissions declined or not granted: <names>.
```

where each `<outcome>` is `N row(s)`, `empty`, or
`error <code>/<subcode>: <Meta's message>`; the permissions sentence
appears only when one of pages_show_list / pages_manage_posts /
business_management / instagram_basic is not `granted` in
`/me/permissions`, and names exactly those. The message contains no
tokens. One failed attempt now identifies the failing route and whether
it is a declined permission (fix: re-grant) vs an empty asset list
(fix: asset assignment).

Regression test extended: `php-api/tests/social-discovery-test.php`
scenarios F (Graph error on /me/accounts falls through to business
route + diag records `error 200`), G (accounts routes empty, business
route returns the page), H (diagnostic message names the route error
and the declined permission, carries no token material) — 16/16 checks
pass. `php -l` clean; `npm run build` passes (506 routes).

Retry expectation: reconnect from the admin and grant only the Shia
Rishta Page + @shiarishta.official. The OAuth dialog will now also ask
for business_management (because it is newly requested). Expected:
Facebook card = Shia Rishta Page connected, Instagram card =
@shiarishta.official connected. If it still fails, the red banner now
shows the per-route diagnostic above — quote it verbatim.
