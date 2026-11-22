-- Shia Rishta PHP API -  MariaDB schema (utf8mb4). Idempotent: safe to re-run.
-- Port of server/schema.sql: UUID -> CHAR(36) app-generated, CITEXT -> TEXT with
-- lowercased values + unique index, TIMESTAMPTZ -> DATETIME (UTC session set by
-- db.php), gen_random_uuid() -> uuid() in PHP.
-- Marker bump 2026-11-20: re-run migrations to flag the three remaining
-- agent-created test accounts (Builder Three Alpha/Beta, Mahnoor Asif
-- retest) as is_test, and to recompute blog read_time from real word
-- counts instead of the stored '5 min' default.
-- Marker bump 2026-11-20b: also flag the qaverify* QA accounts
-- (QA Verify C and QA Verify 99 were still unflagged).
-- Marker bump 2026-11-20c: the 20b pass never ran — a request that
-- landed mid-upload sealed the 20b digest marker while the old
-- migrate.php was still in place, so the gate never reopened.
-- This bump reopens it with the current migrate.php already live.
-- Marker bump 2026-10-12: re-run migrations to apply the broadened
-- users.is_test backfill (QA emails + test-shell profile patterns).
-- Marker bump 2026-10-13: re-run migrations to seed blog_queue batch 7
-- (30 fresh topics) and pick up the queue-save earliest-free-slot fix.
-- Marker bump 2026-11-04: re-run migrations to seed blog_queue batch 8
-- (30 fresh topics) — topic queue was empty, blocking the daily refill.

-- Marker bump 2026-11-21: social scheduler tables (social_accounts,
-- social_posts, social_post_targets) + migrateAddSocialSchedulerTables().
-- This comment alone changes the sha1 digest migrateSchema() keys its
-- marker on, so the new migration actually runs in production.
-- Marker bump 2026-11-22: publishing reliability layer —
-- social_post_targets.retry_attempts / next_retry_at (watchdog
-- backoff + dead-letter) and the social_state table (publisher
-- heartbeat + reconciliation gate) + migrateAddSocialReliability().

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id                      CHAR(36)     NOT NULL PRIMARY KEY,
  email                   VARCHAR(320) NOT NULL,
  password_hash           TEXT         NOT NULL,
  display_name            VARCHAR(255) NOT NULL,
  is_admin                TINYINT(1)   NOT NULL DEFAULT 0,
  is_test                 TINYINT(1)   NOT NULL DEFAULT 0,
  role                    VARCHAR(16)  NOT NULL DEFAULT 'member',
  email_verified          TINYINT(1)   NOT NULL DEFAULT 0,
  email_verify_token      VARCHAR(64)  DEFAULT NULL,
  email_verify_expires    DATETIME     DEFAULT NULL,
  password_reset_token    VARCHAR(64)  DEFAULT NULL,
  password_reset_expires  DATETIME     DEFAULT NULL,
  -- Manual account verification. Distinct from profiles.is_verified, which is the
  -- document-derived public badge: this is a human moderator's decision.
  verification_status     VARCHAR(16)  NOT NULL DEFAULT 'unverified',
  verified_by             CHAR(36)     DEFAULT NULL,
  verified_at             DATETIME     DEFAULT NULL,
  verification_note       TEXT         DEFAULT NULL,
  google_id               VARCHAR(64)  DEFAULT NULL,
  facebook_id             VARCHAR(64)  DEFAULT NULL,
  -- Date of birth (2026-11-10): the Terms require members to be 18+; the
  -- server validates age >= 18 at registration and stores the DOB here.
  date_of_birth           DATE         DEFAULT NULL,
  -- Last active (2026-11-10): updated on login + profile/chat writes, never
  -- per-request. NULL = never recorded; the UI shows nothing, never a claim.
  last_active_at          DATETIME     DEFAULT NULL,
  created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role),
  KEY idx_users_test (is_test),
  KEY idx_users_verif (verification_status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS profiles (
  user_id            CHAR(36)     NOT NULL PRIMARY KEY,
  display_name       VARCHAR(255) NOT NULL,
  age                INT          DEFAULT NULL,
  gender             VARCHAR(8)   DEFAULT NULL,
  city               VARCHAR(120) DEFAULT NULL,
  country            VARCHAR(120) DEFAULT NULL,
  sect               VARCHAR(120) DEFAULT NULL,
  profession         VARCHAR(160) DEFAULT NULL,
  bio                TEXT         DEFAULT NULL,
  onboarding_draft   MEDIUMTEXT   DEFAULT NULL,
  expectations       TEXT         DEFAULT NULL,
  about_family       TEXT         DEFAULT NULL,
  visibility         VARCHAR(16)  NOT NULL DEFAULT 'members',
  photos_visibility  VARCHAR(16)  NOT NULL DEFAULT 'members',
  -- Contact phone + who may see contact details (2026-11-09, P0 follow-up):
  -- Settings has collected a phone number and a contact-visibility choice
  -- for a long time, and profileUpdate() maps contactPhone/contactVisibility
  -- to these columns — but they never existed on `profiles` (contact_phone
  -- only exists on matchmaker_profiles). Any PUT containing them 500d the
  -- whole upsert with "Unknown column", so the Settings save silently saved
  -- nothing at all — not even the city/bio in the same request. The live
  -- P0 test caught it: city stayed Baltimore, phone stayed null.
  contact_phone      VARCHAR(40)  DEFAULT NULL,
  contact_visibility VARCHAR(16)  NOT NULL DEFAULT 'members',
  is_verified        TINYINT(1)   NOT NULL DEFAULT 0,
  -- Two-tier verification: 'none' | 'selfie' | 'id_document'. Set when an
  -- admin approves a verification submission; mirrors verifications.kind.
  verified_kind      VARCHAR(20)  NOT NULL DEFAULT 'none',
  is_blocked         TINYINT(1)   NOT NULL DEFAULT 0,
  blocked_until      DATETIME     DEFAULT NULL,
  block_reason       VARCHAR(255) DEFAULT NULL,
  seeking_gender     VARCHAR(20)  DEFAULT NULL,
  is_matchmaker      TINYINT(1)   NOT NULL DEFAULT 0,
  matchmaker_by      CHAR(36)     DEFAULT NULL,
  introduced_by      CHAR(36)     DEFAULT NULL,
  introduced_at      DATETIME     DEFAULT NULL,
  religiosity        VARCHAR(60)  DEFAULT NULL,
  education_level    VARCHAR(80)  DEFAULT NULL,
  marja              VARCHAR(80)  DEFAULT NULL,
  prayer             VARCHAR(80)  DEFAULT NULL,
  modesty            VARCHAR(80)  DEFAULT NULL,
  diet               VARCHAR(80)  DEFAULT NULL,
  languages          VARCHAR(255) DEFAULT NULL,
  -- Citizenships (2026-11-09): collected in onboarding, stored like
  -- languages as a comma-joined string.
  citizenships       VARCHAR(255) DEFAULT NULL,
  ethnicity          VARCHAR(120) DEFAULT NULL,
  sub_ethnicity      VARCHAR(120) DEFAULT NULL,
  -- Guardian-managed profiles (2026-11-09): onboarding collects a wali's
  -- name + email and promises an invite; these columns store them. NULL
  -- management_mode = self-managed. The guardian's email is NEVER exposed
  -- in a public payload — only in the invite email itself.
  management_mode    VARCHAR(16)  DEFAULT NULL,
  guardian_name      VARCHAR(120) DEFAULT NULL,
  guardian_email     VARCHAR(190) DEFAULT NULL,
  -- Hide-any-field (2026-11-09): JSON array of payload keys the member
  -- wants hidden from other viewers (e.g. ["incomeRange","heightCm"]).
  -- Display-only: the values stay stored and are still used for matching
  -- and filters; visibleProfile() omits them for non-owners.
  hidden_fields      TEXT         DEFAULT NULL,
  -- Notification preferences (2026-11-09): JSON object of the Settings
  -- toggles (emailMessages, emailMatches, emailInterests, emailWeeklyDigest,
  -- pushMessages, pushMatches, pushProfileViews). Stored server-side so the
  -- mailer can respect them — localStorage-only prefs were invisible to it,
  -- so the toggles promised emails that were never sent. NULL = defaults.
  notification_prefs TEXT         DEFAULT NULL,
  -- Privacy toggles (2026-11-09, P0 batch): block_unverified hides the
  -- profile from members whose email is not verified (and blocks their
  -- interest); allow_family_view gates the wali view links. Both are
  -- enforced server-side — the Settings toggles used to be localStorage-only
  -- while the copy claimed server enforcement.
  block_unverified   TINYINT(1)   NOT NULL DEFAULT 0,
  allow_family_view  TINYINT(1)   NOT NULL DEFAULT 1,
  -- First Connections (2026-11-11): the member's opt-in to be suggested
  -- to brand-new members as a first connection. Default off — nobody is
  -- put forward until they choose it. Also added by
  -- migrateAddOpenToIntrosColumn() (marker digest).
  open_to_intros     TINYINT(1)   NOT NULL DEFAULT 0,
  income_range       VARCHAR(80)  DEFAULT NULL,
  income_currency    VARCHAR(10)  DEFAULT NULL,
  marital_status     VARCHAR(60)  DEFAULT NULL,
  children           VARCHAR(60)  DEFAULT NULL,
  children_plans     VARCHAR(80)  DEFAULT NULL,
  relocation         VARCHAR(80)  DEFAULT NULL,
  family_involvement VARCHAR(80)  DEFAULT NULL,
  height_cm          INT          DEFAULT NULL,
  timeline           VARCHAR(80)  DEFAULT NULL,
  photo_url          VARCHAR(500) DEFAULT NULL,
  -- Profile depth (2026-11-10): education detail, employer, residency/visa
  -- status, build, hobbies (comma-joined like languages), convert status,
  -- structured partner preferences, one profile video. All nullable —
  -- nothing here is required to publish.
  education_field       VARCHAR(120) DEFAULT NULL,
  education_institution VARCHAR(160) DEFAULT NULL,
  employer              VARCHAR(160) DEFAULT NULL,
  residency_status      VARCHAR(60)  DEFAULT NULL,
  build                 VARCHAR(40)  DEFAULT NULL,
  hobbies               VARCHAR(500) DEFAULT NULL,
  convert_status        VARCHAR(40)  DEFAULT NULL,
  pref_age_min          INT          DEFAULT NULL,
  pref_age_max          INT          DEFAULT NULL,
  pref_height_min_cm    INT          DEFAULT NULL,
  pref_height_max_cm    INT          DEFAULT NULL,
  pref_education        VARCHAR(80)  DEFAULT NULL,
  pref_location         VARCHAR(120) DEFAULT NULL,
  pref_must_haves       TEXT         DEFAULT NULL,
  video_url             VARCHAR(500) DEFAULT NULL,
  syed_status        VARCHAR(40)  DEFAULT NULL,
  -- Illustrative sample content, NOT a real member. Set only by the seeder in
  -- scripts/. The API passes it through as `isDemo` so the UI can label the
  -- profile: a sample profile must never be mistakable for a person a member
  -- could actually send a message to.
  is_demo            TINYINT(1)   NOT NULL DEFAULT 0,
  -- Synthetic profile from the daily seeder. Used ONLY for ordering (real
  -- profiles first) and admin identification — unlike is_demo, it triggers
  -- no UI badge, so seeded profiles keep looking realistic to members.
  is_seeded          TINYINT(1)   NOT NULL DEFAULT 0,
  -- Public handle chosen by the member, distinct from display_name. Unique
  -- where present; many members may leave it NULL.
  username           VARCHAR(32)  DEFAULT NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_profiles_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS interests (
  from_user_id CHAR(36) NOT NULL,
  to_user_id   CHAR(36) NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (from_user_id, to_user_id),
  KEY idx_interests_to (to_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A decline sticks: when member A declines member B's interest, the interest
-- row is deleted AND this row is kept, so B cannot re-express interest and
-- the declined request can never reappear. decliner_id declined sender_id.
CREATE TABLE IF NOT EXISTS interest_declines (
  decliner_id CHAR(36) NOT NULL,
  sender_id   CHAR(36) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (decliner_id, sender_id),
  KEY idx_declines_sender (sender_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversations (
  id                CHAR(36) NOT NULL PRIMARY KEY,
  user_a            CHAR(36) NOT NULL,
  user_b            CHAR(36) NOT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disappearing_after INT NOT NULL DEFAULT 0,
  -- Last time each side opened the thread (mark-read). NULL = never opened,
  -- so every message from the other side counts as unread.
  last_read_a       DATETIME DEFAULT NULL,
  last_read_b       DATETIME DEFAULT NULL,
  UNIQUE KEY uq_conversation (user_a, user_b),
  KEY idx_conv_user_a (user_a),
  KEY idx_conv_user_b (user_b)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id              CHAR(36) NOT NULL PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL,
  sender_id       CHAR(36) NOT NULL,
  body            TEXT     NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      DATETIME DEFAULT NULL,
  -- Chat image attachment (2026-11-10): server-generated file path under
  -- the shared photo root; body stays the encrypted text (empty for
  -- image-only messages). NULL = text-only message.
  attachment_path VARCHAR(500) DEFAULT NULL,
  attachment_type VARCHAR(20) DEFAULT NULL,
  KEY idx_messages_conv (conversation_id, created_at),
  KEY idx_messages_expires (expires_at),
  KEY idx_messages_sender (sender_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS matchmaker_profiles (
  id           CHAR(36)   NOT NULL PRIMARY KEY,
  submitted_by CHAR(36)   NOT NULL,
  payload      MEDIUMTEXT NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- Subject consent (2026-11-10): a submission stays 'pending-consent'
  -- until the subject confirms by email (consent_token link). Admin
  -- approve is blocked until consent_confirmed_at is set.
  consent_token       VARCHAR(64)  DEFAULT NULL,
  consent_email       VARCHAR(320) DEFAULT NULL,
  consent_confirmed_at DATETIME   DEFAULT NULL,
  created_at   DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at  DATETIME   DEFAULT NULL,
  reviewed_by  CHAR(36)   DEFAULT NULL,
  KEY idx_mm_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The eight curated rooms (hyderabad, dubai, dallas, london, toronto, reverts,
-- parents, newlywed) are seeded by migrateSeedDefaultCommunities() in
-- php-api/lib/migrate.php (INSERT IGNORE — safe to re-run). They must exist or
-- /community/:slug 404s in remote mode while the seeder writes into the void.
CREATE TABLE IF NOT EXISTS communities (
  id         VARCHAR(32) NOT NULL PRIMARY KEY,
  name       VARCHAR(80) NOT NULL,
  icon       VARCHAR(16) NOT NULL DEFAULT '🌍',
  created_by CHAR(36)    DEFAULT NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS posts (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  community_id VARCHAR(32)  NOT NULL,
  author_id    CHAR(36)     DEFAULT NULL,
  author_name  VARCHAR(80)  NOT NULL,
  title        VARCHAR(300) NOT NULL,
  body         TEXT         NOT NULL,
  likes        INT          NOT NULL DEFAULT 0,
  is_hidden    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_posts_community (community_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS replies (
  id          CHAR(36)    NOT NULL PRIMARY KEY,
  post_id     CHAR(36)    NOT NULL,
  author_id   CHAR(36)    DEFAULT NULL,
  author_name VARCHAR(80) NOT NULL,
  body        TEXT        NOT NULL,
  is_hidden   TINYINT(1)  NOT NULL DEFAULT 0,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_replies_post (post_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reports (
  id          CHAR(36)      NOT NULL PRIMARY KEY,
  reporter_id CHAR(36)      NOT NULL,
  target_type VARCHAR(16)   NOT NULL,
  target_id   VARCHAR(64)   NOT NULL,
  reason      VARCHAR(1000) NOT NULL,
  status      VARCHAR(16)   NOT NULL DEFAULT 'open',
  actioned_by CHAR(36)      DEFAULT NULL,
  actioned_at DATETIME      DEFAULT NULL,
  -- Appeal (2026-11-10): the reporter can appeal a closed report, which
  -- reopens it for review with their reason attached.
  appeal_reason TEXT        DEFAULT NULL,
  appeal_at   DATETIME      DEFAULT NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_reports_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id CHAR(36) NOT NULL,
  blocked_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker_id, blocked_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mute (2026-11-15, fix-everything Batch A): ONE-WAY and silent, unlike
-- blocks (which hide both sides from each other and stop contact). A mute
-- only affects the muter: the muted member disappears from the muter's
-- browse and stops generating notifications for them. The muted member is
-- never told and can still see/contact the muter unless separately blocked.
-- Marker bump 2026-11-15b: this table + pageviews attribution columns
-- (referrer_path, channel, utm_*) below force migrateSchema() to re-run.
CREATE TABLE IF NOT EXISTS mutes (
  muter_id CHAR(36) NOT NULL,
  muted_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (muter_id, muted_id),
  KEY idx_mutes_muted (muted_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS verifications (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  user_id      CHAR(36)     NOT NULL,
  kind         VARCHAR(32)  NOT NULL,
  storage_path VARCHAR(512) NOT NULL,
  status       VARCHAR(16)  NOT NULL DEFAULT 'pending',
  review_note  TEXT         DEFAULT NULL,
  reviewed_by  CHAR(36)     DEFAULT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at  DATETIME     DEFAULT NULL,
  KEY idx_verifications_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Runtime configuration an admin can change without a redeploy.
--
-- The value column holds ENCRYPTED-AT-REST text (see encAtRest() in
-- lib/util.php — AES-256-GCM, envelope "enc1:iv:tag:ct"). This table exists so
-- an operator can repair a broken AI credential from /admin/content rather than
-- needing shell access to a cPanel box and hand-editing .env.
--
-- There is deliberately NO read endpoint that returns `value`. The API reports
-- only whether a key is present and how it was last verified. An admin can
-- overwrite a credential; nobody can read one back out through the API.
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(64)  NOT NULL PRIMARY KEY,
  value_enc   TEXT         DEFAULT NULL,
  updated_by  CHAR(36)     DEFAULT NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Last non-secret diagnostic: HTTP status / error class from the last verify.
  -- Never the credential, never an upstream body (those can echo the header).
  last_status VARCHAR(160) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A member's saved profiles. Strictly personal: one member's favourites must
-- never appear on someone else's profile, so there is no read path for anyone
-- but the owner.
CREATE TABLE IF NOT EXISTS favourites (
  user_id    CHAR(36)    NOT NULL,
  profile_id CHAR(36)    NOT NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, profile_id),
  KEY idx_fav_profile (profile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wali_links (
  token      VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id    CHAR(36)    NOT NULL,
  revoked    TINYINT(1)  NOT NULL DEFAULT 0,
  -- Revocation timestamp (2026-11-10): a revoked link can be restored by
  -- the member within 24h of revocation; after that it is gone for good.
  revoked_at DATETIME    DEFAULT NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Introductions: verified matchmakers + guardians create a PRIVATE draft,
-- share a one-time claim link, and the subject claims it -  a draft is NEVER a
-- profile row until she claims it.
CREATE TABLE IF NOT EXISTS profile_drafts (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  created_by          CHAR(36)     NOT NULL,
  creator_role        VARCHAR(16)  NOT NULL,
  claim_token         VARCHAR(64)  NOT NULL,
  claim_token_expires DATETIME     NOT NULL,
  short_code          CHAR(6)      NOT NULL,
  gender              VARCHAR(8)   NOT NULL,
  relationship        VARCHAR(80)  DEFAULT NULL,
  display_name        VARCHAR(255) NOT NULL,
  age                 INT          DEFAULT NULL,
  city                VARCHAR(120) DEFAULT NULL,
  country             VARCHAR(120) DEFAULT NULL,
  sect                VARCHAR(120) DEFAULT NULL,
  profession          VARCHAR(160) DEFAULT NULL,
  bio                 TEXT         DEFAULT NULL,
  expectations        TEXT         DEFAULT NULL,
  about_family        TEXT         DEFAULT NULL,
  contact_email       VARCHAR(320) NOT NULL,
  contact_phone       VARCHAR(40)  DEFAULT NULL,
  consent_attested    TINYINT(1)   NOT NULL DEFAULT 0,
  consent_attested_at DATETIME     DEFAULT NULL,
  status              VARCHAR(16)  NOT NULL DEFAULT 'awaiting_claim',
  claimed_by          CHAR(36)     DEFAULT NULL,
  claimed_at          DATETIME     DEFAULT NULL,
  declined_at         DATETIME     DEFAULT NULL,
  scrubbed_at         DATETIME     DEFAULT NULL,
  last_sent_at        DATETIME     DEFAULT NULL,
  send_count          INT          NOT NULL DEFAULT 0,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_draft_claim_token (claim_token),
  UNIQUE KEY uq_draft_short_code (short_code),
  KEY idx_drafts_creator (created_by, status),
  KEY idx_drafts_status (status, claim_token_expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only audit of every introduction event. Reviewable by admins; never edited.
CREATE TABLE IF NOT EXISTS draft_events (
  id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  draft_id   CHAR(36)     NOT NULL,
  actor_id   CHAR(36)     DEFAULT NULL,
  event      VARCHAR(40)  NOT NULL,
  detail     VARCHAR(512) DEFAULT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_draft_events_draft (draft_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contact form submissions. Visible to admins in the admin panel.
CREATE TABLE IF NOT EXISTS contact_messages (
  id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  email      VARCHAR(320) NOT NULL,
  subject    VARCHAR(200) NOT NULL,
  message    TEXT         NOT NULL,
  status     VARCHAR(16)  NOT NULL DEFAULT 'new',
  -- Set by an admin. Separates marketing mail from member enquiries so the
  -- inbox is triagable; the default view hides flagged rows.
  is_spam    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_contact_status (status, created_at),
  KEY idx_contact_spam (is_spam)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Session tracking: one row per login token so the Security tab can list
-- active sessions. token_hash is the SHA-256 of the bearer JWT — the token
-- itself is never stored, so a DB leak yields no usable credentials.
CREATE TABLE IF NOT EXISTS sessions (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  user_id    CHAR(36)     NOT NULL,
  token_hash VARCHAR(64)  NOT NULL,
  ip         VARCHAR(64)  DEFAULT NULL,
  user_agent VARCHAR(512) DEFAULT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY idx_sessions_user (user_id, last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Immutable audit trail for admin actions. Append-only: no UPDATE or DELETE is
-- ever issued against this table by the application. Required on a platform
-- that verifies identity documents and can block a member -- "which admin did
-- this, and when" has to be answerable months later.
CREATE TABLE IF NOT EXISTS admin_audit (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  actor_id    CHAR(36)     DEFAULT NULL,
  actor_email VARCHAR(320) DEFAULT NULL,
  action      VARCHAR(64)  NOT NULL,
  target_type VARCHAR(32)  NOT NULL,
  target_id   VARCHAR(255) DEFAULT NULL,
  meta        MEDIUMTEXT  DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_created (created_at),
  KEY idx_audit_target (target_type, target_id),
  KEY idx_audit_actor (actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Email verification tokens (stored HASHED — a DB leak must not yield usable
-- verification links). One row per user; re-requested tokens replace the old.
CREATE TABLE IF NOT EXISTS email_verifications (
  user_id    CHAR(36)     NOT NULL PRIMARY KEY,
  token_hash VARCHAR(64)  NOT NULL,
  expires_at DATETIME     NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- In-app notifications (interests, messages, introductions).
-- Blog posts written and scheduled by admins. The curated long-form articles in
-- src/data/articles.js stay compiled into the bundle; this table holds anything
-- produced later from the admin console, so publishing never needs a rebuild.
CREATE TABLE IF NOT EXISTS blog_posts (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  slug         VARCHAR(160) NOT NULL,
  title        VARCHAR(160) NOT NULL,
  excerpt      VARCHAR(300) DEFAULT NULL,
  category     VARCHAR(40)  NOT NULL DEFAULT 'Guidance',
  read_time    VARCHAR(16)  NOT NULL DEFAULT '5 min',
  body         MEDIUMTEXT   NOT NULL,
  status       VARCHAR(16)  NOT NULL DEFAULT 'draft',
  -- Set when status = 'scheduled'. A reader sees the post only once this is in
  -- the past, which is what makes "scheduled" mean anything.
  scheduled_for DATETIME    DEFAULT NULL,
  published_at  DATETIME    DEFAULT NULL,
  author_email  VARCHAR(320) DEFAULT NULL,
  created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_blog_slug (slug),
  KEY idx_blog_public (status, scheduled_for),
  KEY idx_blog_published (published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Autonomous blog queue: long-tail SEO topic backlog. The daily cron
-- endpoint takes the next 'queued' row, generates the article and schedules
-- it. Seeded by migrateAddBlogQueueTable(); schema kept in sync here.
CREATE TABLE IF NOT EXISTS blog_queue (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  position   INT          NOT NULL DEFAULT 0,
  topic      VARCHAR(160) NOT NULL,
  angle      VARCHAR(200) DEFAULT NULL,
  category   VARCHAR(40)  NOT NULL DEFAULT 'Guidance',
  keyword    VARCHAR(160) NOT NULL,
  status     VARCHAR(16)  NOT NULL DEFAULT 'queued',
  attempts   INT          NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_blog_queue_keyword (keyword),
  KEY idx_blog_queue_status (status, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- In-app notifications (interests, messages, introductions).
CREATE TABLE IF NOT EXISTS notifications (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  user_id    CHAR(36)     NOT NULL,
  type       VARCHAR(40)  NOT NULL,
  title      VARCHAR(255) NOT NULL,
  body       TEXT         DEFAULT NULL,
  ref_id     CHAR(36)     DEFAULT NULL,
  is_read    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notif_user (user_id, created_at),
  KEY idx_notif_unread (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS biodata_drafts (
  user_id    CHAR(36)     NOT NULL PRIMARY KEY,
  data_enc   MEDIUMTEXT   NOT NULL,
  template   VARCHAR(20)  NOT NULL DEFAULT 'essential',
  lang       VARCHAR(5)   NOT NULL DEFAULT 'en',
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_biodata_drafts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pageviews (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  path          VARCHAR(255) NOT NULL,
  referrer_host VARCHAR(255) DEFAULT NULL,
  -- Attribution (2026-11-15, Batch B): referrer PATH only (query string is
  -- never stored — it can carry tokens/PII), the server-classified channel
  -- (google/chatgpt/perplexity/direct/social/…), and first-touch UTM.
  -- visitor_hash is now PERSISTENT (sha256 of ip+ua, no date) so a visitor
  -- can be followed across days for page-to-signup attribution; per-day
  -- uniques are still exact because rows are filtered by day window.
  referrer_path VARCHAR(255) DEFAULT NULL,
  channel       VARCHAR(32)  DEFAULT NULL,
  utm_source    VARCHAR(120) DEFAULT NULL,
  utm_medium    VARCHAR(120) DEFAULT NULL,
  utm_campaign  VARCHAR(160) DEFAULT NULL,
  device        VARCHAR(16)  NOT NULL DEFAULT 'desktop',
  visitor_hash  CHAR(64)     NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pv_created (created_at),
  KEY idx_pv_path (path, created_at),
  KEY idx_pv_ref (referrer_host, created_at),
  KEY idx_pv_channel (channel, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Client event log (2026-11-15): form submits, validation failures and
-- client crashes from POST /api/analytics/event. Detail is allowlisted
-- JSON (field names + error messages only — never typed values).
CREATE TABLE IF NOT EXISTS client_events (
  id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind         VARCHAR(16)  NOT NULL,
  name         VARCHAR(80)  NOT NULL DEFAULT '',
  page         VARCHAR(255) NOT NULL DEFAULT '/',
  detail       TEXT         DEFAULT NULL,
  user_id      CHAR(36)     DEFAULT NULL,
  visitor_hash CHAR(64)     NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ce_created (created_at),
  KEY idx_ce_kind (kind, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recovery_emails (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       CHAR(36)     NOT NULL,
  stage         VARCHAR(32)  NOT NULL,
  sent_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY idx_re_user_stage (user_id, stage),
  KEY idx_re_sent (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Why members leave. Written at account-deletion time, BEFORE the user row
-- is deleted, and deliberately WITHOUT a foreign key to users: the row must
-- survive the deletion it describes, or the reason is lost with the account.
-- reason is one of the DELETION_REASONS keys (see src/lib/api/safety.js);
-- unknown values are stored as 'other', a skipped question as NULL.
CREATE TABLE IF NOT EXISTS account_deletion_feedback (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  user_id       CHAR(36)     NOT NULL,
  display_name  VARCHAR(120) DEFAULT NULL,
  email         VARCHAR(190) DEFAULT NULL,
  city          VARCHAR(120) DEFAULT NULL,
  country       VARCHAR(120) DEFAULT NULL,
  joined_at     DATETIME     DEFAULT NULL,
  reason        VARCHAR(64)  DEFAULT NULL,
  detail        TEXT         DEFAULT NULL,
  is_test       TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_adf_created (created_at),
  KEY idx_adf_reason (reason)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Guest lead capture (2026-11-15): visitors not ready to register can
-- subscribe to new-profile alerts. Runtime also lazy-creates this table
-- in php-api/routes/leads.php; it lives here so the migration digest
-- covers it and fresh installs match production.
CREATE TABLE IF NOT EXISTS guest_leads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(190) NOT NULL,
  source VARCHAR(24) NOT NULL DEFAULT 'site',
  city VARCHAR(80) NULL,
  unsub_token CHAR(32) NOT NULL,
  unsubscribed TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_sent_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_guest_leads_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Social Scheduler (Phase 1, 2026-11-21): the admin portal is ONLY the
-- control panel — posts are published NATIVELY to Facebook Pages,
-- Instagram and YouTube via their official APIs; nothing is posted on
-- shiarishta.com itself. Tokens are stored encAtRest() ciphertext
-- (AES-256-GCM, lib/util.php) and are never returned by any endpoint.
-- Also created by migrateAddSocialSchedulerTables() in lib/migrate.php.
CREATE TABLE IF NOT EXISTS social_accounts (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  -- platform: facebook | instagram | youtube
  platform            VARCHAR(16)  NOT NULL,
  platform_account_id VARCHAR(128) NOT NULL,
  account_name        VARCHAR(255) DEFAULT NULL,
  access_token_enc    TEXT         DEFAULT NULL,
  refresh_token_enc   TEXT         DEFAULT NULL,
  token_expires_at    DATETIME     DEFAULT NULL,
  scopes              VARCHAR(500) DEFAULT NULL,
  -- status: connected | disconnected | needs_attention | error
  status              VARCHAR(16)  NOT NULL DEFAULT 'connected',
  -- Autopilot safety rail: bumped on every failed publish, reset on
  -- success; at 3 the account flips to needs_attention and autopilot
  -- stops generating for it until an admin reconnects/checks it.
  consecutive_failures INT         NOT NULL DEFAULT 0,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_social_account (platform, platform_account_id),
  KEY idx_social_accounts_platform (platform, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS social_posts (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  caption      TEXT         NOT NULL,
  -- JSON object of optional per-platform caption overrides.
  caption_overrides TEXT    DEFAULT NULL,
  -- Server-side path under the photo storage root (social/<file>) plus
  -- its media kind. NULL media = text-only post (Facebook/YouTube rules
  -- apply per platform at publish time).
  media_path   VARCHAR(500) DEFAULT NULL,
  -- media_type: image | video
  media_type   VARCHAR(16)  DEFAULT NULL,
  -- media_url: externally hosted media URL, if any
  media_url    VARCHAR(1000) DEFAULT NULL,
  -- thumbnail_path: optional custom thumbnail image (social/<file>),
  -- uploaded with the video at ingest; applied to YouTube via
  -- thumbnails.set at publish time (best-effort). NULL = platform
  -- auto-generated thumbnail.
  thumbnail_path VARCHAR(500) DEFAULT NULL,
  -- Storage lifecycle (2026-11-21): when the publish cron purged the
  -- server copy of the media, and why. The platforms keep the content;
  -- platform URLs stay on social_post_targets.
  media_purged_at DATETIME     DEFAULT NULL,
  media_purge_note VARCHAR(255) DEFAULT NULL,
  scheduled_at DATETIME     DEFAULT NULL,
  -- status: draft | scheduled | publishing | published | partial | failed
  status       VARCHAR(16)  NOT NULL DEFAULT 'draft',
  -- source: manual | autopilot | autopilot_reel
  source       VARCHAR(16)  NOT NULL DEFAULT 'manual',
  -- sha256 of the normalized caption; autopilot rejects any caption
  -- whose hash already exists so a caption is never posted twice.
  caption_hash CHAR(64)     DEFAULT NULL,
  created_by   CHAR(36)     DEFAULT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_social_posts_due (status, scheduled_at),
  UNIQUE KEY uq_social_posts_caption_hash (caption_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS social_post_targets (
  id                CHAR(36)     NOT NULL PRIMARY KEY,
  post_id           CHAR(36)     NOT NULL,
  social_account_id CHAR(36)     NOT NULL,
  -- platform: facebook | instagram | youtube
  platform          VARCHAR(16)  NOT NULL,
  -- status: pending | publishing | published | failed | skipped | dead
  -- ('dead' = the watchdog gave up after 6 backoff retries; the admin
  -- surfaces it under Needs Attention and a manual Retry revives it)
  status            VARCHAR(16)  NOT NULL DEFAULT 'pending',
  platform_post_id  VARCHAR(255) DEFAULT NULL,
  platform_url      VARCHAR(1000) DEFAULT NULL,
  error             TEXT         DEFAULT NULL,
  attempts          INT          NOT NULL DEFAULT 0,
  -- Watchdog bookkeeping (2026-11-22): failed watchdog attempts so
  -- far, and when the next one becomes eligible (exponential backoff).
  retry_attempts    INT          NOT NULL DEFAULT 0,
  next_retry_at     DATETIME     DEFAULT NULL,
  published_at      DATETIME     DEFAULT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_social_target (post_id, social_account_id),
  KEY idx_social_targets_post (post_id),
  KEY idx_social_targets_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Social reliability state (2026-11-22): tiny key/value store for the
-- publisher heartbeat (publisher_heartbeat → JSON {last_run_at,
-- processed, ok, source}; the admin goes red when it is >15 min old)
-- and the hourly reconciliation gate (reconcile_last_run_at). Also
-- created by migrateAddSocialReliability() in lib/migrate.php.
CREATE TABLE IF NOT EXISTS social_state (
  state_key   VARCHAR(64) NOT NULL PRIMARY KEY,
  state_value TEXT        DEFAULT NULL,
  updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
