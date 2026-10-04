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
  id         CHAR(36) NOT NULL PRIMARY KEY,
  user_a     CHAR(36) NOT NULL,
  user_b     CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  KEY idx_messages_conv (conversation_id, created_at)
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
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_contact_status (status, created_at)
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
  meta        TEXT         DEFAULT NULL,
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
