-- Shia Rishta PHP API -  MariaDB schema (utf8mb4). Idempotent: safe to re-run.
-- Port of server/schema.sql: UUID -> CHAR(36) app-generated, CITEXT -> TEXT with
-- lowercased values + unique index, TIMESTAMPTZ -> DATETIME (UTC session set by
-- db.php), gen_random_uuid() -> uuid() in PHP.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id                      CHAR(36)     NOT NULL PRIMARY KEY,
  email                   VARCHAR(320) NOT NULL,
  password_hash           TEXT         NOT NULL,
  display_name            VARCHAR(255) NOT NULL,
  is_admin                TINYINT(1)   NOT NULL DEFAULT 0,
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
  created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role),
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
  expectations       TEXT         DEFAULT NULL,
  about_family       TEXT         DEFAULT NULL,
  visibility         VARCHAR(16)  NOT NULL DEFAULT 'members',
  photos_visibility  VARCHAR(16)  NOT NULL DEFAULT 'members',
  is_verified        TINYINT(1)   NOT NULL DEFAULT 0,
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
  ethnicity          VARCHAR(120) DEFAULT NULL,
  income_range       VARCHAR(80)  DEFAULT NULL,
  marital_status     VARCHAR(60)  DEFAULT NULL,
  children           VARCHAR(60)  DEFAULT NULL,
  children_plans     VARCHAR(80)  DEFAULT NULL,
  relocation         VARCHAR(80)  DEFAULT NULL,
  family_involvement VARCHAR(80)  DEFAULT NULL,
  height_cm          INT          DEFAULT NULL,
  timeline           VARCHAR(80)  DEFAULT NULL,
  photo_url          VARCHAR(500) DEFAULT NULL,
  syed_status        VARCHAR(40)  DEFAULT NULL,
  -- Illustrative sample content, NOT a real member. Set only by the seeder in
  -- scripts/. The API passes it through as `isDemo` so the UI can label the
  -- profile: a sample profile must never be mistakable for a person a member
  -- could actually send a message to.
  is_demo            TINYINT(1)   NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS conversations (
  id                CHAR(36) NOT NULL PRIMARY KEY,
  user_a            CHAR(36) NOT NULL,
  user_b            CHAR(36) NOT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disappearing_after INT NOT NULL DEFAULT 0,
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
  KEY idx_messages_conv (conversation_id, created_at),
  KEY idx_messages_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS matchmaker_profiles (
  id           CHAR(36)   NOT NULL PRIMARY KEY,
  submitted_by CHAR(36)   NOT NULL,
  payload      MEDIUMTEXT NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at   DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at  DATETIME   DEFAULT NULL,
  reviewed_by  CHAR(36)   DEFAULT NULL,
  KEY idx_mm_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_reports_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id CHAR(36) NOT NULL,
  blocked_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker_id, blocked_id)
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
