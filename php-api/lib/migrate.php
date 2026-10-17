<?php
// Idempotent schema migration — runs db/schema.sql statements on first boot.

function migrateSchema(): void
{
    static $done = false;
    if ($done) return;
    $done = true;

    // Runs before the marker gate below: it is naturally idempotent (no-op
    // once the stale key is gone) and must not wait for a schema.sql change.
    migrateClearStaleNvidiaKey();

    // Fast path: once a full migration has succeeded, a marker file lets us
    // skip all the SHOW COLUMNS / SHOW TABLES probes on every request.
    // (This was adding 5-6 DB round-trips to EVERY API call on shared hosting.)
    //
    // The marker name carries a digest of the schema, NOT a fixed filename. It
    // used to be a constant path with a 6-hour TTL, which meant that shipping a
    // change to migrateAddProfileColumns() did nothing for up to six hours: the
    // stale marker short-circuited before the column was ever added, and every
    // write to that column failed with an opaque 500. Hashing the desired schema
    // means a new column invalidates the marker on the very next request, while
    // an unchanged schema still short-circuits instantly.
    $schemaDigest = substr(sha1((string)@file_get_contents(__DIR__ . '/../db/schema.sql')), 0, 12);
    $marker = sys_get_temp_dir() . '/shiarishta_migrated_' . $schemaDigest;
    if (is_file($marker)) {
        return;
    }

    $file = __DIR__ . '/../db/schema.sql';
    if (!is_file($file)) return;
    $sql = file_get_contents($file);
    if ($sql === false || trim($sql) === '') return;

    // Additive columns run FIRST and unconditionally. They used to sit at the end
    // of this function, which the early-return probe below skipped on any database
    // that already had its tables — so those columns never got created.
    migrateAddProfileColumns();
    migrateAddContactTable();
    migrateAddSessionsTable();
    migrateAddEmailVerificationsTable();
    migrateAddNotificationsTable();
    migrateAddAdminAuditTable();
    migrateAddWaliLinksTable();
    migrateAddUserVerificationColumns();
    migrateAddBlogPostsTable();
    migrateAddBlogImageColumn();
    migrateAddContactSpamColumn();
    migrateAddFavouritesTable();
    migrateAddAppSettingsTable();
    migrateAddDisappearingAndMatchmaker();
    migrateAddBlogQueueTable();
    migrateAddBiodataDraftsTable();
    migrateAuditMetaToMediumtext();
    migrateAddPageviewsTable();
    migrateAddSeededFlag();
    migrateAddTestFlag();
    migrateSeedDefaultCommunities();

    // Cheap "already migrated" probe. Must check a LATE table too: probing only
    // users.* would skip migration forever after a partial run (a lesson learned
    // the hard way — conversations/messages/profile_drafts never got created).
    try {
        $col = db()->query("SHOW COLUMNS FROM users LIKE 'email_verified'")->fetch();
        $tbl = db()->query("SHOW TABLES LIKE 'profile_drafts'")->fetch();
        if ($col && $tbl) {
            @touch($marker);
            return;
        }
    } catch (Throwable) {
        // Table missing — fall through and create everything.
    }

    try {
        $statements = preg_split('/;\s*(?:\r?\n|$)/', $sql) ?: [];
        $errors = 0;
        foreach ($statements as $stmt) {
            // Strip comment lines FIRST: chunks between statements often begin
            // with "-- ..." comments (e.g. profile_drafts) — skipping any chunk
            // that starts with -- would silently never create those tables.
            $lines = array_filter(
                explode("\n", $stmt),
                fn($l) => !preg_match('/^\s*(--|#)/', $l)
            );
            $stmt = trim(implode("\n", $lines));
            // A UTF-8 BOM on the first chunk would otherwise be sent as SQL.
            $stmt = ltrim($stmt, "\xEF\xBB\xBF");
            if ($stmt === '') continue;
            try {
                db()->exec($stmt);
            } catch (Throwable $e) {
                // Keep going: one failing statement must not strand the rest of
                // the schema (the failure mode that left tables missing).
                $errors++;
                $msg = $e->getMessage();
                if (stripos($msg, 'already exists') === false) {
                    error_log('[api] migration statement failed: ' . substr($msg, 0, 200));
                }
            }
        }
        error_log($errors === 0 ? '[api] schema migrated' : "[api] schema migrated with {$errors} tolerated statement error(s)");
        @touch($marker);
    } catch (Throwable $e) {
        error_log('[api] migration issue: ' . $e->getMessage());
    }
}

// Additive column migrations. CREATE TABLE IF NOT EXISTS cannot add a column to
// a table that already exists, and the early-return probe above means a database
// created before a column was introduced never picks it up. That is exactly how
// religiosity/education/marja' ended up collected in onboarding and then silently
// discarded on save: the columns were never there. Every statement is idempotent.
// NOTE: these columns are also declared in db/schema.sql so fresh installs get
// them on the first request; this function remains for databases created earlier.
function migrateAddProfileColumns(): void
{
    $additions = [
        'religiosity'      => "VARCHAR(60) DEFAULT NULL",
        'education_level'  => "VARCHAR(80) DEFAULT NULL",
        'marja'            => "VARCHAR(80) DEFAULT NULL",
        'prayer'           => "VARCHAR(80) DEFAULT NULL",
        'modesty'          => "VARCHAR(80) DEFAULT NULL",
        'diet'             => "VARCHAR(80) DEFAULT NULL",
        'languages'        => "VARCHAR(255) DEFAULT NULL",
        'ethnicity'        => "VARCHAR(120) DEFAULT NULL",
        'income_range'     => "VARCHAR(80) DEFAULT NULL",
        'marital_status'   => "VARCHAR(60) DEFAULT NULL",
        'children'         => "VARCHAR(60) DEFAULT NULL",
        'children_plans'   => "VARCHAR(80) DEFAULT NULL",
        'relocation'       => "VARCHAR(80) DEFAULT NULL",
        'family_involvement' => "VARCHAR(80) DEFAULT NULL",
        'height_cm'        => "INT DEFAULT NULL",
        'timeline'         => "VARCHAR(80) DEFAULT NULL",
        'photo_url'        => "VARCHAR(500) DEFAULT NULL",
        'contact_visibility' => "VARCHAR(20) DEFAULT 'members'",
        'syed_status'        => "VARCHAR(40) DEFAULT NULL",
        // Public handle chosen by the member, distinct from display_name, so
        // they can be addressed without publishing a full name or an email.
        'username'           => "VARCHAR(32) DEFAULT NULL",
        // Marks a profile as illustrative sample content rather than a real
        // member. Set only by scripts/seed-production-profiles.php. The API
        // surfaces it so the UI can badge the card honestly — a demo profile
        // must never be mistakable for someone a member could write to.
        'is_demo'            => "TINYINT(1) NOT NULL DEFAULT 0",
        // Who the member is looking for ('male' / 'female'). Collected as a
        // required onboarding field but never persisted until now — which is
        // why browse/matching could not honor it and members saw same-gender
        // profiles ranked as top matches.
        'seeking_gender'       => "VARCHAR(20) DEFAULT NULL",
        // Temporary restriction: when set and in the future, the block is
        // active; when it passes, the block lapses automatically. NULL means
        // a permanent ban (or no block when is_blocked = 0).
        'blocked_until'        => "DATETIME DEFAULT NULL",
        // Human-readable reason for the current block, shown to the member
        // and recorded in the audit log.
        'block_reason'         => "VARCHAR(255) DEFAULT NULL",
        // Matchmaker-submitted profile: 1 when this row was added by a
        // matchmaker and approved by an admin. matchmaker_by is the
        // submitter's user id (interests go to them).
        'is_matchmaker'        => "TINYINT(1) NOT NULL DEFAULT 0",
        'matchmaker_by'        => "CHAR(36) DEFAULT NULL",
        // Two-tier verification badge: 'none' | 'selfie' | 'id_document'.
        // Mirrors verifications.kind at the moment an admin approves. Kept as
        // a denormalized column so every profile read path gets it for free.
        'verified_kind'        => "VARCHAR(20) NOT NULL DEFAULT 'none'",
    ];

    try {
        $existing = [];
        foreach (db()->query('SHOW COLUMNS FROM profiles')->fetchAll() as $c) {
            $existing[strtolower((string)$c['Field'])] = true;
        }
        foreach ($additions as $col => $def) {
            if (isset($existing[$col])) continue;
            try {
                db()->exec("ALTER TABLE profiles ADD COLUMN `$col` $def");
                error_log("[api] migration: added profiles.$col");
            } catch (Throwable $e) {
                error_log("[api] migration: could not add $col — " . substr($e->getMessage(), 0, 120));
            }
        }
    } catch (Throwable $e) {
        error_log('[api] migration (columns) issue: ' . $e->getMessage());
    }

    // Backfill the two-tier badge for profiles verified before verified_kind
    // existed. Without this, every previously-verified member would silently
    // lose their badge on the next read (verified_kind defaults to 'none').
    // ID-document approval outranks a selfie approval for the same member.
    // Idempotent: re-running keeps the same values.
    try {
        db()->exec(
            "UPDATE profiles p SET p.verified_kind = 'id_document'
              WHERE p.is_verified = 1 AND p.verified_kind = 'none'
                AND EXISTS (SELECT 1 FROM verifications v
                             WHERE v.user_id = p.user_id
                               AND v.status = 'approved'
                               AND v.kind = 'id_document')"
        );
        db()->exec(
            "UPDATE profiles p SET p.verified_kind = 'selfie'
              WHERE p.is_verified = 1 AND p.verified_kind = 'none'
                AND EXISTS (SELECT 1 FROM verifications v
                             WHERE v.user_id = p.user_id
                               AND v.status = 'approved'
                               AND v.kind = 'selfie')"
        );
    } catch (Throwable $e) {
        error_log('[api] migration: verified_kind backfill — ' . substr($e->getMessage(), 0, 120));
    }

    // Backfill for existing members: on a nikah platform the overwhelmingly
    // common case is seeking the opposite gender. Members can change it in
    // onboarding/settings; without this, everyone existing would see no
    // gender default until they re-saved their profile. Runs after the column
    // additions above so the column is guaranteed to exist.
    try {
        db()->exec("UPDATE profiles SET seeking_gender = 'female' WHERE seeking_gender IS NULL AND gender = 'male'");
        db()->exec("UPDATE profiles SET seeking_gender = 'male' WHERE seeking_gender IS NULL AND gender = 'female'");
    } catch (Throwable $e) {
        error_log('[api] migration: seeking_gender backfill — ' . substr($e->getMessage(), 0, 120));
    }
}

// One-time: clear a stale NVIDIA key stored via /admin/content.
//
// The panel key takes precedence over the NVIDIA_API_KEY env secret. A dead
// key was sitting in app_settings (fingerprint 065f8465ef9b) while a fresh,
// working key shipped via the GitHub secret — so the assistant kept failing
// despite a valid credential being deployed. This clears the panel copy once
// (only when its fingerprint matches the known-dead one), letting the env
// secret take over. An operator can still paste a new key in /admin/content
// afterwards; that path is untouched.
function migrateClearStaleNvidiaKey(): void
{
    // A stale panel model override (e.g. the slow ultra-550b) would pin the
    // assistant to a model that times out on shared hosting, ignoring the
    // NVIDIA_MODEL env. Clear it so the env/default (fast lightning) takes
    // effect. Runs unconditionally — not gated on the key check below.
    try {
        db()->prepare('DELETE FROM app_settings WHERE setting_key = ?')->execute(['nvidia_model']);
    } catch (Throwable $e) {
        error_log('[api] migration: nvidia model clear — ' . substr($e->getMessage(), 0, 100));
    }
    try {
        $row = db()->prepare('SELECT value_enc FROM app_settings WHERE setting_key = ? LIMIT 1');
        $row->execute(['nvidia_api_key']);
        $stored = $row->fetch();
        $enc = (string)($stored['value_enc'] ?? '');
        if ($enc === '') return;
        $key = trim(decAtRest($enc));
        if ($key === '') return;
        if (substr(hash('sha256', $key), 0, 12) !== '065f8465ef9b') return;
        db()->prepare('DELETE FROM app_settings WHERE setting_key = ?')->execute(['nvidia_api_key']);
        error_log('[api] migration: cleared stale admin-panel NVIDIA key; env secret now active');
    } catch (Throwable $e) {
        error_log('[api] migration: nvidia key clear — ' . substr($e->getMessage(), 0, 100));
    }
}

// wali_links. Present in db/schema.sql, so a fresh install creates it on the
// first request. This exists because the schema probe below short-circuits on
// any database that already has users + profile_drafts, which meant a database
// created before wali_links was introduced never picked it up: the Guardians
// screen then reported "not available" forever.
function migrateAddWaliLinksTable(): void
{
    try {
        // Must match db/schema.sql exactly: token as PK and a `revoked` flag.
        // An earlier version of this migration invented `revoked_at`, which
        // would have created a table whose shape disagreed with every other
        // reader of wali_links.
        db()->exec(
            "CREATE TABLE IF NOT EXISTS wali_links (
                token      VARCHAR(64) NOT NULL PRIMARY KEY,
                user_id    CHAR(36)    NOT NULL,
                revoked    TINYINT(1)  NOT NULL DEFAULT 0,
                created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_wali_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    } catch (Throwable $e) {
        error_log('[api] migration: wali_links — ' . substr($e->getMessage(), 0, 120));
    }
}

// Manual (admin-driven) account verification.
//
// This is deliberately NOT the same thing as profiles.is_verified, which is the
// public blue badge flipped when an identity document is approved. Those are two
// independent claims: "this person proved their identity with paperwork" and
// "a human moderator reviewed this account and accepts it". Storing the second
// on the same column would let a document approval silently vouch for an
// account nobody ever reviewed.
function migrateAddUserVerificationColumns(): void
{
    $additions = [
        'verification_status' => "VARCHAR(16) NOT NULL DEFAULT 'unverified'",
        'verified_by'         => 'CHAR(36) DEFAULT NULL',
        'verified_at'         => 'DATETIME DEFAULT NULL',
        'verification_note'   => 'TEXT DEFAULT NULL',
        'google_id'           => 'VARCHAR(64) DEFAULT NULL',
        'facebook_id'         => 'VARCHAR(64) DEFAULT NULL',
    ];

    try {
        $existing = [];
        foreach (db()->query('SHOW COLUMNS FROM users')->fetchAll() as $c) {
            $existing[strtolower((string)$c['Field'])] = true;
        }
        foreach ($additions as $col => $def) {
            if (isset($existing[$col])) continue;
            try {
                db()->exec("ALTER TABLE users ADD COLUMN `$col` $def");
                error_log("[api] migration: added users.$col");
            } catch (Throwable $e) {
                error_log("[api] migration: could not add users.$col — " . substr($e->getMessage(), 0, 120));
            }
        }

        // Oldest-first queue ordering depends on this existing; a database that
        // already has rows would otherwise fall back to a full scan.
        foreach (db()->query("SHOW INDEX FROM users WHERE Key_name = 'idx_users_verif'")->fetchAll() as $_) {
            return;
        }
        try {
            db()->exec('CREATE INDEX idx_users_verif ON users (verification_status, created_at)');
        } catch (Throwable $e) {
            error_log('[api] migration: users verification index — ' . substr($e->getMessage(), 0, 120));
        }
    } catch (Throwable $e) {
        error_log('[api] migration (user verification) issue: ' . substr($e->getMessage(), 0, 120));
    }
}

/**
 * Saved profiles.
 *
 * Created on upgrade as well as on a fresh install. Favourites are private to
 * the owner: the only read path is "my favourites", so there is no way to see
 * who bookmarked you.
 */
function migrateAddFavouritesTable(): void
{
    try {
        db()->exec(
            "CREATE TABLE IF NOT EXISTS favourites (
                user_id    CHAR(36)    NOT NULL,
                profile_id CHAR(36)    NOT NULL,
                created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, profile_id),
                KEY idx_fav_profile (profile_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    } catch (Throwable $e) {
        error_log('[api] migration: favourites — ' . substr($e->getMessage(), 0, 120));
    }
}

/**
 * Runtime admin-configurable settings (currently the NVIDIA credential).
 *
 * Lets an operator repair a broken API key from /admin/content instead of
 * needing shell access to edit .env on the host. Values are stored encrypted at
 * rest; the API never returns them.
 */
function migrateAddAppSettingsTable(): void
{
    try {
        db()->exec(
            "CREATE TABLE IF NOT EXISTS app_settings (
                setting_key VARCHAR(64)  NOT NULL PRIMARY KEY,
                value_enc   TEXT         DEFAULT NULL,
                updated_by  CHAR(36)     DEFAULT NULL,
                updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                last_status VARCHAR(160) DEFAULT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    } catch (Throwable $e) {
        error_log('[api] migration: app_settings — ' . substr($e->getMessage(), 0, 120));
    }
}

// Disappearing messages + matchmaker profiles.
//
// conversations.disappearing_after: seconds after which messages vanish
// (0 = off, 86400 = 24h, 604800 = 7 days). messages.expires_at is stamped at
// send time; expired rows are purged lazily when the thread loads (no cron
// on shared hosting).
//
// matchmaker_profiles: profiles submitted by matchmakers. They stay invisible
// until an admin approves; if nobody approves within 7 days they are deleted
// automatically (lazy purge on admin queue load + on public browse).
function migrateAddDisappearingAndMatchmaker(): void
{
    try {
        $cols = [];
        foreach (db()->query('SHOW COLUMNS FROM conversations')->fetchAll() as $c) {
            $cols[] = $c['Field'];
        }
        if (!in_array('disappearing_after', $cols, true)) {
            db()->exec('ALTER TABLE conversations ADD COLUMN disappearing_after INT NOT NULL DEFAULT 0');
        }
    } catch (Throwable $e) {
        error_log('[api] migration: conversations.disappearing_after — ' . substr($e->getMessage(), 0, 100));
    }
    try {
        $cols = [];
        foreach (db()->query('SHOW COLUMNS FROM messages')->fetchAll() as $c) {
            $cols[] = $c['Field'];
        }
        if (!in_array('expires_at', $cols, true)) {
            db()->exec('ALTER TABLE messages ADD COLUMN expires_at DATETIME DEFAULT NULL');
            db()->exec('ALTER TABLE messages ADD KEY idx_messages_expires (expires_at)');
        }
    } catch (Throwable $e) {
        error_log('[api] migration: messages.expires_at — ' . substr($e->getMessage(), 0, 100));
    }
    try {
        db()->exec(
            "CREATE TABLE IF NOT EXISTS matchmaker_profiles (
                id          CHAR(36)     NOT NULL PRIMARY KEY,
                submitted_by CHAR(36)    NOT NULL,
                payload     MEDIUMTEXT   NOT NULL,
                status      VARCHAR(20)  NOT NULL DEFAULT 'pending',
                created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                reviewed_at DATETIME     DEFAULT NULL,
                reviewed_by CHAR(36)     DEFAULT NULL,
                KEY idx_mm_status (status, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    } catch (Throwable $e) {
        error_log('[api] migration: matchmaker_profiles — ' . substr($e->getMessage(), 0, 100));
    }
}

/**
 * Spam flag on the contact inbox.
 *
 * Without it the inbox is untriagable in practice: marketing mail from
 * jmailservice.com sits interleaved with real member enquiries and there is
 * nothing to separate them. Declared in schema.sql too, so the conformance test
 * keeps the two in step.
 */
function migrateAddContactSpamColumn(): void
{
    try {
        $existing = [];
        foreach (db()->query('SHOW COLUMNS FROM contact_messages')->fetchAll() as $c) {
            $existing[strtolower((string)$c['Field'])] = true;
        }
        if (isset($existing['is_spam'])) return;

        db()->exec('ALTER TABLE contact_messages ADD COLUMN is_spam TINYINT(1) NOT NULL DEFAULT 0');
        error_log('[api] migration: added contact_messages.is_spam');
    } catch (Throwable $e) {
        error_log('[api] migration: contact_messages.is_spam — ' . substr($e->getMessage(), 0, 120));
    }
}

// Admin-authored blog posts, including scheduled ones. Declared identically in
// db/schema.sql so a fresh install and an upgraded one agree — the schema
// conformance test in tests/ fails if these two ever drift.
function migrateAddBlogPostsTable(): void
{
    try {
        db()->exec(
            "CREATE TABLE IF NOT EXISTS blog_posts (
                id            CHAR(36)     NOT NULL PRIMARY KEY,
                slug          VARCHAR(160) NOT NULL,
                title         VARCHAR(160) NOT NULL,
                excerpt       VARCHAR(300) DEFAULT NULL,
                category      VARCHAR(40)  NOT NULL DEFAULT 'Guidance',
                read_time     VARCHAR(16)  NOT NULL DEFAULT '5 min',
                body          MEDIUMTEXT   NOT NULL,
                status        VARCHAR(16)  NOT NULL DEFAULT 'draft',
                scheduled_for DATETIME     DEFAULT NULL,
                published_at  DATETIME     DEFAULT NULL,
                author_email  VARCHAR(320) DEFAULT NULL,
                created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_blog_slug (slug),
                KEY idx_blog_public (status, scheduled_for),
                KEY idx_blog_published (published_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    } catch (Throwable $e) {
        error_log('[api] migration: blog_posts — ' . substr($e->getMessage(), 0, 120));
    }
}

function migrateAddBlogImageColumn(): void
{
    try {
        $cols = db()->query("SHOW COLUMNS FROM blog_posts LIKE 'image_url'")->fetchAll();
        if (!$cols) {
            db()->exec("ALTER TABLE blog_posts ADD COLUMN image_url VARCHAR(500) DEFAULT NULL AFTER excerpt");
        } else {
            // Data URLs from admin file uploads exceed VARCHAR(500) and were
            // silently truncated, breaking the image. TEXT holds them intact.
            $type = strtoupper($cols[0]['Type'] ?? '');
            if (strpos($type, 'TEXT') === false) {
                db()->exec("ALTER TABLE blog_posts MODIFY COLUMN image_url TEXT DEFAULT NULL");
            }
        }
    } catch (Throwable $e) {
        error_log('[api] migration: blog_posts.image_url — ' . substr($e->getMessage(), 0, 120));
    }
}

// Admin audit trail. Created unconditionally (idempotent). auditLog() in
// routes/admin.php swallows its own errors, so an existing database missing this
// table degrades to "no audit entries" rather than breaking every admin action.
function migrateAddAdminAuditTable(): void
{
    try {
        db()->exec("CREATE TABLE IF NOT EXISTS admin_audit (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (Throwable $e) {
        error_log('[api] migration (admin_audit): ' . substr($e->getMessage(), 0, 120));
    }
}

// Contact form submissions table. Created unconditionally (idempotent) so
// databases created before this table existed still get it.
function migrateAddContactTable(): void
{
    try {
        db()->exec("CREATE TABLE IF NOT EXISTS contact_messages (
          id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
          name       VARCHAR(120) NOT NULL,
          email      VARCHAR(320) NOT NULL,
          subject    VARCHAR(200) NOT NULL,
          message    TEXT         NOT NULL,
          status     VARCHAR(16)  NOT NULL DEFAULT 'new',
          created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_contact_status (status, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (Throwable $e) {
        error_log('[api] migration (contact table) issue: ' . $e->getMessage());
    }
}

// Session tracking table. Created unconditionally (idempotent) so databases
// created before this table existed still get it — the early-return probe at
// the top of migrateSchema() would otherwise skip it forever.
function migrateAddSessionsTable(): void
{
    try {
        db()->exec("CREATE TABLE IF NOT EXISTS sessions (
          id         CHAR(36)     NOT NULL PRIMARY KEY,
          user_id    CHAR(36)     NOT NULL,
          token_hash VARCHAR(64)  NOT NULL,
          ip         VARCHAR(64)  DEFAULT NULL,
          user_agent VARCHAR(512) DEFAULT NULL,
          created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_seen  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_sessions_token (token_hash),
          KEY idx_sessions_user (user_id, last_seen)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (Throwable $e) {
        error_log('[api] migration (sessions table) issue: ' . $e->getMessage());
    }
}

// Email verification tokens table. Same unconditional-idempotent treatment as
// sessions: existing databases must pick it up on the next boot.
function migrateAddEmailVerificationsTable(): void
{
    try {
        db()->exec("CREATE TABLE IF NOT EXISTS email_verifications (
          user_id    CHAR(36)     NOT NULL PRIMARY KEY,
          token_hash VARCHAR(64)  NOT NULL,
          expires_at DATETIME     NOT NULL,
          created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (Throwable $e) {
        error_log('[api] migration (email_verifications table) issue: ' . $e->getMessage());
    }
}

// Notifications table. Created unconditionally (idempotent) so databases
// created before this table existed still get it.
function migrateAddNotificationsTable(): void
{
    try {
        db()->exec("CREATE TABLE IF NOT EXISTS notifications (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (Throwable $e) {
        error_log('[api] migration (notifications table) issue: ' . $e->getMessage());
    }
}

// Autonomous blog queue. Holds a long-tail SEO topic backlog; the daily cron
// endpoint picks the next queued topic, generates the article via the AI
// provider and schedules it. Seeded once — re-runs only top up topics that
// were never seeded (by keyword), so hand-added topics are never wiped.
function migrateAddBlogQueueTable(): void
{
    try {
        db()->exec("CREATE TABLE IF NOT EXISTS blog_queue (
          id         CHAR(36)     NOT NULL PRIMARY KEY,
          position   INT          NOT NULL DEFAULT 0,
          topic      VARCHAR(160) NOT NULL,
          angle      VARCHAR(200) DEFAULT NULL,
          category   VARCHAR(40)  NOT NULL DEFAULT 'Guidance',
          keyword    VARCHAR(160) NOT NULL,
          status     VARCHAR(16)  NOT NULL DEFAULT 'queued',
          created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_blog_queue_keyword (keyword),
          KEY idx_blog_queue_status (status, position)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (Throwable $e) {
        error_log('[api] migration (blog_queue table) issue: ' . $e->getMessage());
        return;
    }

    // Additive: attempts column for retry logic (older installs lack it).
    try {
        $cols = [];
        foreach (db()->query('SHOW COLUMNS FROM blog_queue')->fetchAll() as $c) {
            $cols[(string)$c['Field']] = true;
        }
        if (!isset($cols['attempts'])) {
            db()->exec('ALTER TABLE blog_queue ADD COLUMN attempts INT NOT NULL DEFAULT 0');
        }
    } catch (Throwable $e) {
        error_log('[api] migration (blog_queue attempts) issue: ' . $e->getMessage());
    }

    // 30 long-tail SEO topics — one per day for a month. Each targets a real
    // search query in the Shia matrimony niche that a new domain can
    // realistically rank for (city + niche terms the big sites ignore).
    $topics = [
        ['Shia matrimony in Houston: a practical rishta guide for Texas', 'Mosques, communities and how to search well', 'Guidance', 'shia matrimony houston'],
        ['Shia matrimony in Chicago: finding your rishta in Illinois', 'Where the community gathers + profile tips', 'Guidance', 'shia matrimony chicago'],
        ['Shia matrimony in New York: tri-state rishta guide', 'NY, NJ and CT community overview', 'Guidance', 'shia matrimony new york'],
        ['Shia matrimony in Dallas-Fort Worth', 'DFW mosques, events and searching smart', 'Guidance', 'shia matrimony dallas'],
        ['Shia matrimony in Los Angeles', 'SoCal Shia community and rishta advice', 'Guidance', 'shia matrimony los angeles'],
        ['Shia rishta in Dearborn, Michigan: America\'s Shia heartland', 'Why Dearborn leads + how outsiders connect', 'Community', 'shia rishta dearborn'],
        ['Shia matrimony in London: a UK rishta guide', 'Centres, events and online searching', 'Guidance', 'shia matrimony london'],
        ['Shia matrimony in Toronto: a Canadian rishta guide', 'GTA community and practical tips', 'Guidance', 'shia matrimony toronto'],
        ['Syed rishta in the USA: what Syed families actually look for', 'Lineage, expectations and respect', 'Community', 'syed rishta usa'],
        ['Shia matrimony in the San Francisco Bay Area', 'Bay Area community guide', 'Guidance', 'shia matrimony bay area'],
        // Batch 2 (2026-10-11): second month of topics. Same rules — real
        // long-tail queries in the Shia matrimony niche, city + niche terms.
        ['Shia matrimony in San Diego: Southern California rishta guide', 'Community overview and search tips', 'Guidance', 'shia matrimony san diego'],
        ['Shia matrimony in Seattle: Pacific Northwest rishta guide', 'Where the community gathers', 'Guidance', 'shia matrimony seattle'],
        ['Shia matrimony in Boston: New England rishta guide', 'Community and practical advice', 'Guidance', 'shia matrimony boston'],
        ['Shia matrimony in Atlanta: Georgia rishta guide', 'Community overview', 'Guidance', 'shia matrimony atlanta'],
        ['Shia matrimony in Miami: Florida rishta guide', 'South Florida community', 'Guidance', 'shia matrimony miami'],
        ['Shia matrimony in Phoenix: Arizona rishta guide', 'Community and search tips', 'Guidance', 'shia matrimony phoenix'],
        ['Shia matrimony in Denver: Colorado rishta guide', 'Community overview', 'Guidance', 'shia matrimony denver'],
        ['Shia matrimony in Detroit: Michigan rishta guide', 'Beyond Dearborn', 'Guidance', 'shia matrimony detroit'],
        ['Shia matrimony in Minneapolis: Minnesota rishta guide', 'Community overview', 'Guidance', 'shia matrimony minneapolis'],
        ['Shia matrimony in Philadelphia: Pennsylvania rishta guide', 'Community and search tips', 'Guidance', 'shia matrimony philadelphia'],
        ['Shia matrimony in Washington DC: capital region rishta guide', 'DC, Maryland and Virginia community', 'Guidance', 'shia matrimony washington dc'],
        ['Shia matrimony in Baltimore: Maryland rishta guide', 'Community overview', 'Guidance', 'shia matrimony baltimore'],
        ['Shia matrimony in Austin: Texas rishta guide', 'Community and search tips', 'Guidance', 'shia matrimony austin'],
        ['Shia matrimony in Vancouver: British Columbia rishta guide', 'Community overview', 'Guidance', 'shia matrimony vancouver'],
        ['Shia matrimony in Montreal: Quebec rishta guide', 'Community and search tips', 'Guidance', 'shia matrimony montreal'],
        ['Shia matrimony in Birmingham UK: rishta guide', 'Midlands community overview', 'Guidance', 'shia matrimony birmingham uk'],
        ['Shia matrimony in Manchester UK: rishta guide', 'North West community', 'Guidance', 'shia matrimony manchester uk'],
        ['Shia matrimony in Sydney: Australia rishta guide', 'Community overview', 'Guidance', 'shia matrimony sydney'],
        ['Shia matrimony in Dubai: UAE rishta guide', 'Gulf community and search tips', 'Guidance', 'shia matrimony dubai'],
        ['Shia matrimony in Kuwait: rishta guide', 'Community overview', 'Guidance', 'shia matrimony kuwait'],
        ['Mutah (temporary marriage) in Shia Islam: explained simply', 'What it is, rules and misconceptions', 'Guidance', 'mutah shia islam explained'],
        ['Khula in Shia Islam: the process explained', 'Steps, rights and practical guidance', 'Guidance', 'khula shia islam process'],
        ['Shia-Sunni marriage: what families should know', 'Fiqh differences and practical advice', 'Guidance', 'shia sunni marriage guidance'],
        ['Rishta for Shia doctors: balancing career and marriage search', 'Practical advice for medical professionals', 'Profiles', 'shia doctor rishta'],
        ['How much mehr is appropriate? A practical guide', 'Benchmarks and family discussions', 'Guidance', 'mehr amount guide'],
        ['Meeting your rishta match: halal first-meeting etiquette', 'What to do and what to avoid', 'Guidance', 'halal first meeting rishta'],
        ['Involving your wali the right way in online rishta search', 'Practical steps for families', 'Guidance', 'wali online rishta'],
        ['Shia matrimony red flags in biodata: what to watch for', 'Spotting exaggerated profiles', 'Safety', 'biodata red flags shia'],
        ['After the nikah: first-year advice for Shia couples', 'Faith-centered marriage guidance', 'Community', 'first year marriage advice shia'],
        ['Duas for parents seeking a spouse for their child', 'Arabic, transliteration and translation', 'Community', 'duas parents rishta child'],
        ['Shia nikah requirements: the complete checklist', 'Every requirement explained simply', 'Guidance', 'shia nikah requirements'],
        ['How to write a Shia marriage biodata that gets responses', 'Format, wording and a full sample', 'Profiles', 'shia marriage biodata format'],
        ['Questions to ask a potential Shia spouse before saying yes', 'Faith, family and lifestyle questions', 'Guidance', 'questions to ask potential spouse shia'],
        ['Marja in Shia marriage: why scholars matter in spouse search', 'Explainer for younger members', 'Guidance', 'marja shia marriage'],
        ['Wali consent in Shia nikah: the rules explained simply', 'When it is required and how it works', 'Guidance', 'wali consent shia nikah'],
        ['Mehr in Shia nikah: the complete guide', 'Meaning, amounts and common mistakes', 'Guidance', 'mehr shia nikah'],
        ['Istikhara for marriage: the Shia method step by step', 'How to do it and how to read the answer', 'Community', 'istikhara for marriage shia'],
        ['Duas for finding a righteous spouse', 'Arabic, transliteration and translation', 'Community', 'duas for marriage shia'],
        ['Red flags in online rishta conversations', 'Safety-first guide with real examples', 'Safety', 'rishta red flags'],
        ['How to verify someone you met on a matrimony site', 'Step-by-step verification checklist', 'Safety', 'verify matrimony profile'],
        ['Keeping photos private while searching for a spouse', 'Privacy tiers explained', 'Safety', 'matrimony photo privacy'],
        ['Long-distance Shia rishta: making it work across continents', 'USA, UK, Gulf and India perspectives', 'Community', 'long distance rishta'],
        ['Shia second marriage: guidance for divorcees and widows', 'Faith, family and fresh starts', 'Community', 'shia second marriage'],
        ['How to talk to your parents about your rishta choice', 'Respectful conversation guide', 'Guidance', 'convince parents rishta'],
        ['First message examples that actually get replies', 'Respectful openers, not pickup lines', 'Profiles', 'first message matrimony examples'],
        ['What to put in your matrimony profile bio', 'Before-and-after examples', 'Profiles', 'matrimony profile bio examples'],
        ['Shia wedding traditions: the complete guide', 'From nikah to walima', 'Community', 'shia wedding traditions'],
        ['How long should a Shia engagement be?', 'Balancing caution and momentum', 'Guidance', 'shia engagement period'],
        ['Staying safe on Shia matchmaking sites', 'Scams, catfishing and privacy', 'Safety', 'online shia matchmaking safety'],
        ['Niyaz and Syed status in rishta: explained respectfully', 'What it means and what it does not', 'Community', 'syed status rishta meaning'],
        // Batch 3 (2026-10-12): ShiaMatch-beating keyword universe — geo rishta
        // phrasing, Syed niche, nikah how-tos, free/WhatsApp angles, comparisons.
        ['Shia rishtay in UK: the complete 2026 guide', 'Where to look and how to verify', 'Guidance', 'shia rishtay in uk'],
        ['Shia rishtay in USA: the complete 2026 guide', 'Diaspora search strategies', 'Guidance', 'shia rishtay in usa'],
        ['Shia rishtay in Canada: the complete 2026 guide', 'Community and search tips', 'Guidance', 'shia rishtay in canada'],
        ['Shia rishtay in Australia: the complete 2026 guide', 'Community overview', 'Guidance', 'shia rishtay in australia'],
        ['Shia rishta online: how to search safely in 2026', 'Sites, apps and safety', 'Guidance', 'shia rishta online guide'],
        ['Free Shia matrimonial sites: what is actually free in 2026', 'Honest cost breakdown', 'Guidance', 'free shia matrimonial sites list'],
        ['ShiaMatch vs ShiaRishta: honest comparison 2026', 'Features, cost and who it suits', 'Guidance', 'shiamatch vs shiarishta'],
        ['Best website for Shia marriage: 2026 comparison', 'ShiaMatch, Shia Spouse, ShiaRishta compared', 'Guidance', 'best website for shia marriage'],
        ['Why Shia men in USA, UK and Canada are switching matrimony sites', 'The cost problem nobody talks about', 'Community', 'shia matrimony usa uk canada cost'],
        ['Shia marriage bureau USA: how matchmakers work', 'What bureaus do and what they charge', 'Guidance', 'shia marriage bureau usa guide'],
        ['Syed rishta in UK: where Syed families search', 'Community channels and etiquette', 'Guidance', 'syed rishta uk guide'],
        ['Syed rishta in USA: the complete guide', 'Diaspora Syed networks', 'Guidance', 'syed rishta usa guide'],
        ['Syed rishta in Pakistan: how families search', 'Traditional and online channels', 'Guidance', 'syed rishta pakistan guide'],
        ['Can a Syeda marry a non-Syed? What scholars say', 'Fiqh positions explained respectfully', 'Guidance', 'syeda marry non syed ruling'],
        ['Shia nikah procedure step by step', 'From proposal to nikah day', 'Guidance', 'shia nikah procedure steps'],
        ['Shia nikah seegha in Arabic with transliteration', 'The exact wording and how it is recited', 'Guidance', 'shia nikah seegha arabic'],
        ['Shia nikah nama: every clause explained', 'What you are signing and why it matters', 'Guidance', 'shia nikah nama clauses'],
        ['Shia nikah khutba: text and translation', 'The sermon recited at nikah', 'Guidance', 'shia nikah khutba text'],
        ['Shia nikah rules: the essentials', 'Conditions for a valid nikah', 'Guidance', 'shia nikah rules essentials'],
        ['Shia nikah dua for the wedding day', 'Arabic, transliteration and translation', 'Community', 'shia nikah dua wedding'],
        ['Shia rishta WhatsApp groups: the risks nobody mentions', 'Scams, privacy and better alternatives', 'Safety', 'shia rishta whatsapp group risks'],
        ['Shia rishta photos: privacy guide', 'Sharing photos safely while searching', 'Safety', 'shia rishta photos privacy'],
        ['Shia brides in USA: the 2026 search guide', 'Where American Shia families look', 'Guidance', 'shia brides usa guide'],
        ['Shia grooms in USA: the 2026 search guide', 'Where to find Shia grooms in America', 'Guidance', 'shia grooms usa guide'],
        ['Shia girl for marriage: writing a biodata that works', 'Format and real examples', 'Profiles', 'shia girl marriage biodata'],
        ['How to find a Shia husband: practical guide', 'Online and community channels', 'Guidance', 'how to find shia husband'],
        ['Shia spouse app vs website: which works better', 'Honest pros and cons', 'Guidance', 'shia spouse app vs website'],
        ['Shia matrimony app: what to look for in 2026', 'Features that actually matter', 'Guidance', 'shia matrimony app features'],
        ['Shia second marriage: guidance for divorcees', 'Faith, family and fresh starts', 'Community', 'shia second marriage divorcee'],
        ['Temporary marriage (mutah): rules and misconceptions', 'What it is and is not', 'Guidance', 'mutah rules misconceptions'],
        ['Shia wedding traditions explained', 'Nikah, rukhsati and walima customs', 'Community', 'shia wedding traditions explained'],
        ['Shia wedding card wording: samples', 'Invitation text examples', 'Community', 'shia wedding card wording'],
        ['Does Shia Islam allow dating? The honest answer', 'Courtship rules explained', 'Guidance', 'shia dating allowed'],
        ['Sunni-Shia marriage: can it work?', 'Scholarly views and real couples', 'Guidance', 'sunni shia marriage work'],
        ['Shia marriage contract: what to include', 'Mehr, conditions and clauses', 'Guidance', 'shia marriage contract clauses'],
        ['Shia marriage counseling: when and where', 'Finding faith-aligned counseling', 'Guidance', 'shia marriage counseling'],
        ['Shia rishta in London: where UK families actually search', 'Rishta phrasing for the London community', 'Guidance', 'shia rishta london'],
        ['Shia rishta in New York: tri-state search guide', 'Rishta phrasing for NY, NJ and CT', 'Guidance', 'shia rishta new york'],
        ['Shia matrimony in Houston: Texas rishta guide', 'Community overview', 'Guidance', 'shia matrimony houston guide'],
        ['Shia matrimony in Chicago: rishta guide', 'Midwest community overview', 'Guidance', 'shia matrimony chicago guide'],
        ['Shia matrimony in Toronto: rishta guide', 'GTA community and search tips', 'Guidance', 'shia matrimony toronto guide'],
        ['Shia matrimony in Karachi: rishta guide', 'Community channels', 'Guidance', 'shia matrimony karachi'],
        ['Shia matrimony in Lahore: rishta guide', 'Community channels', 'Guidance', 'shia matrimony lahore'],
        ['Shia matrimony in Lucknow: rishta guide', 'Community overview', 'Guidance', 'shia matrimony lucknow'],
        ['Shia matrimony in Mumbai: rishta guide', 'Community overview', 'Guidance', 'shia matrimony mumbai guide'],
        ['Shia matrimony in Hyderabad: rishta guide', 'Deccan community overview', 'Guidance', 'shia matrimony hyderabad guide'],
        ['Rishta red flags: when to walk away', 'Warning signs with examples', 'Safety', 'rishta red flags walk away'],
        ['Verifying a rishta profile: family checklist', 'Practical verification steps', 'Safety', 'verify rishta profile family'],
        ['First meeting with a rishta prospect: etiquette', 'Halal guidelines for families', 'Guidance', 'rishta first meeting etiquette'],
        ['Long-distance Shia rishta: USA to Pakistan', 'Making it work across continents', 'Community', 'long distance shia rishta pakistan'],
        ['Shia rishta for doctors and professionals', 'Career and marriage balance', 'Profiles', 'shia rishta professionals'],
        ['Duas for marriage in Shia Islam', 'Powerful duas with translation', 'Community', 'duas for marriage shia islam'],
        // Batch 4 (2026-10-12): ShiaMatch brand-capture — "shiamatch" is the
        // highest-volume keyword in the niche (10K-100K/mo per Keyword Planner).
        ['ShiaMatch alternative: free options compared', 'Best free alternatives to ShiaMatch', 'Guidance', 'shiamatch alternative'],
        ['Is ShiaMatch free? The honest answer', 'What ShiaMatch charges and who pays', 'Guidance', 'is shiamatch free'],
        ['Sites like ShiaMatch: 2026 options', 'Every ShiaMatch competitor compared', 'Guidance', 'sites like shiamatch'],
        ['ShiaMatch review 2026: features and pricing', 'Honest review with the pricing fine print', 'Guidance', 'shiamatch review 2026'],
        // Batch 5 (2026-10-12): second Planner pass — more 10K-100K brands.
        ['NikahForever vs ShiaRishta: honest comparison', 'Features and pricing compared', 'Guidance', 'nikahforever vs shiarishta'],
        ['ShiaSpouse vs ShiaRishta: honest comparison', 'Which suits your family', 'Guidance', 'shiaspouse vs shiarishta'],
        ['Temporary nikah in Islam: rules explained', 'What it is, rules and misconceptions', 'Guidance', 'temporary nikah in islam rules'],
        ['Dawoodi Bohra matrimony: community guide', 'Bohra rishta channels and etiquette', 'Guidance', 'dawoodi bohra matrimony guide'],
        // Batch 6 (2026-10-12): GSC question-query tactic (additive) — PAA
        // questions from the keyword universe + Planner photo-privacy angle.
        // Syed approved: extra on top, nothing removed.
        ['How do Shias get married? Nikah explained simply', 'Seegha, mahr and witnesses — the whole process', 'Guidance', 'how do shias get married'],
        ['What is mahr in Shia nikah? How it works', 'Amount, types and when it is paid', 'Guidance', 'what is mahr shia nikah'],
        ['How to find a Shia rishta in 2026: every channel ranked', 'Apps, mosques, matchmakers and family networks', 'Guidance', 'how to find shia rishta'],
        ['Is there a WhatsApp group for Shia marriage?', 'What the groups are really like — and safer options', 'Safety', 'shia marriage whatsapp group'],
        ['Locked photos on ShiaRishta: how photo privacy works', 'You control exactly who sees your pictures', 'Guidance', 'shiarishta locked photos'],
        ['Why your rishta photos stay hidden until you allow it', 'Photo privacy vs public photo galleries', 'Safety', 'rishta photo privacy settings'],
        // Batch 7 (2026-10-13): third month of topics. Fresh long-tail
        // keywords — geo expansion (Europe/Gulf/APAC diaspora), life-stage
        // niches, rulings questions, competitor comparisons. All keywords
        // verified absent from batches 1-6.
        ['Shia rishtay in Germany: a European rishta guide', 'Berlin, Hamburg and Munich communities', 'Guidance', 'shia rishtay in germany'],
        ['Shia rishtay in France: Paris community guide', 'Centres and searching from abroad', 'Guidance', 'shia rishtay in france'],
        ['Shia rishtay in the Netherlands: Dutch community guide', 'Amsterdam, Rotterdam and The Hague', 'Guidance', 'shia rishtay in netherlands'],
        ['Shia rishta in Melbourne: Victoria guide', 'Community and practical search tips', 'Guidance', 'shia rishta melbourne'],
        ['Shia rishta in Brisbane and Perth: Australia guide', 'Queensland and WA communities', 'Guidance', 'shia rishta brisbane perth'],
        ['Shia rishtay in Saudi Arabia: Riyadh and Jeddah guide', 'Searching well within the Kingdom', 'Guidance', 'shia rishtay in saudi arabia'],
        ['Shia rishtay in Qatar: Doha community guide', 'Small community, smart searching', 'Guidance', 'shia rishtay in qatar'],
        ['Shia rishtay in Oman: Muscat guide', 'Community overview and channels', 'Guidance', 'shia rishtay in oman'],
        ['Shia rishtay in Bahrain: island community guide', 'Local networks and family routes', 'Guidance', 'shia rishtay in bahrain'],
        ['Shia rishta in Singapore and Malaysia: Southeast Asia guide', 'KL and Singapore communities', 'Guidance', 'shia rishta singapore malaysia'],
        ['Shia rishta in New Zealand: Auckland guide', 'Small-community playbook', 'Guidance', 'shia rishta new zealand'],
        ['Shia rishta in Sweden: Stockholm community guide', 'Scandinavian searching, done right', 'Guidance', 'shia rishta sweden'],
        ['Shia divorcee rishta: a dignified second chance', 'What families should actually know', 'Guidance', 'shia divorcee rishta'],
        ['Shia rishta after 30: honest advice', 'For late-20s and 30s seekers', 'Guidance', 'shia rishta after 30'],
        ['Shia rishta for single mothers', 'Compassionate, practical guidance', 'Family', 'shia rishta single mothers'],
        ['A Shia father\'s guide to finding his daughter\'s rishta', 'Leading the search well', 'Family', 'shia father daughter rishta guide'],
        ['Shia revert rishta: marrying into the community', 'What converts should know', 'Guidance', 'shia revert rishta guide'],
        ['Shia rishta for engineers and tech professionals', 'Career-focused searching', 'Guidance', 'shia rishta engineers'],
        ['Is online nikah valid in Shia Islam?', 'Rulings on remote nikah, explained', 'Guidance', 'online nikah shia valid'],
        ['Shia nikah without a wali: is it valid?', 'The rulings, explained carefully', 'Guidance', 'shia nikah without wali'],
        ['Shia matrimony scams: red flags that save you', 'Fraud patterns to watch for', 'Safety', 'shia matrimony scams'],
        ['Shia rishta events in the USA: where to meet', 'Conventions, camps and centres', 'Community', 'shia rishta events usa'],
        ['Shia wedding on a budget: dignified and simple', 'Costs, priorities and mahr', 'Guidance', 'shia wedding budget guide'],
        ['Average mahr amounts in the USA: what\'s realistic', 'Ranges families actually agree on', 'Guidance', 'average mahr amount usa'],
        ['Muzmatch vs ShiaRishta: honest comparison', 'General apps vs Shia-first platform', 'Guidance', 'muzmatch vs shiarishta'],
        ['Salams app vs ShiaRishta: which fits Shia seekers', 'App comparison for Shia Muslims', 'Guidance', 'salams app vs shiarishta'],
        ['Shia rishta Facebook groups: using them safely', 'Groups vs a real platform', 'Safety', 'shia rishta facebook groups'],
        ['Shia simple nikah: a minimal, beautiful guide', 'Stripping it to the essentials', 'Guidance', 'shia simple nikah guide'],
        ['Shia nikah before the visa arrives: long-distance rules', 'Paperwork, patience and rulings', 'Guidance', 'shia nikah before visa'],
        ['Shia rishta from Pakistan to the USA: the full playbook', 'Immigration-aware searching', 'Guidance', 'shia rishta pakistan to usa'],
    ];

    try {
        $have = [];
        foreach (db()->query('SELECT keyword FROM blog_queue')->fetchAll() as $r) {
            $have[(string)$r['keyword']] = true;
        }
        $ins = db()->prepare(
            'INSERT INTO blog_queue (id, position, topic, angle, category, keyword, status)
             VALUES (?,?,?,?,?,?,\'queued\')'
        );
        $pos = 0;
        foreach ($topics as $t) {
            $pos++;
            if (isset($have[$t[3]])) continue;
            $ins->execute([uuid(), $pos, $t[0], $t[1], $t[2], $t[3]]);
        }
    } catch (Throwable $e) {
        error_log('[api] migration (blog_queue seed) issue: ' . $e->getMessage());
    }
}

// Biodata drafts. One encrypted draft per member — the biodata holds PII
// (name, phone, email, address, photo), so the payload is AES-256-GCM
// encrypted at rest via encAtRest(). Guests never touch this table.
function migrateAddBiodataDraftsTable(): void
{
    try {
        db()->exec("CREATE TABLE IF NOT EXISTS biodata_drafts (
          user_id    CHAR(36)     NOT NULL PRIMARY KEY,
          data_enc   MEDIUMTEXT   NOT NULL,
          template   VARCHAR(20)  NOT NULL DEFAULT 'essential',
          lang       VARCHAR(5)   NOT NULL DEFAULT 'en',
          updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_biodata_drafts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (Throwable $e) {
        error_log('[api] migration (biodata_drafts table) issue: ' . $e->getMessage());
    }
}

// Audit log storage: meta was TEXT (64KB) — too small once biodata logs
// started carrying photo data. MEDIUMTEXT gives 16MB of headroom.
function migrateAuditMetaToMediumtext(): void
{
    try {
        $col = db()->query("SHOW COLUMNS FROM admin_audit LIKE 'meta'")->fetch();
        $type = strtolower((string)($col['Type'] ?? ''));
        if ($type !== '' && !str_contains($type, 'mediumtext')) {
            db()->exec('ALTER TABLE admin_audit MODIFY meta MEDIUMTEXT DEFAULT NULL');
        }
    } catch (Throwable $e) {
        error_log('[api] migration (admin_audit meta mediumtext) issue: ' . $e->getMessage());
    }
}

// First-party pageview log — powers the admin SEO & Growth dashboard.
// Privacy design: NO ip, NO user agent, NO full referrer URL is stored.
// visitor_hash is a day-scoped sha256(ip + ua + date): enough to count unique
// visitors per day, useless for identifying anyone afterwards.
function migrateAddPageviewsTable(): void
{
    try {
        db()->exec("CREATE TABLE IF NOT EXISTS pageviews (
          id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
          path          VARCHAR(255) NOT NULL,
          referrer_host VARCHAR(255) DEFAULT NULL,
          device        VARCHAR(16)  NOT NULL DEFAULT 'desktop',
          visitor_hash  CHAR(64)     NOT NULL,
          created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_pv_created (created_at),
          KEY idx_pv_path (path, created_at),
          KEY idx_pv_ref (referrer_host, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    } catch (Throwable $e) {
        error_log('[api] migration (pageviews) issue: ' . substr($e->getMessage(), 0, 120));
    }
}

// Seeded-profile flag: marks synthetic profiles created by the daily seeder.
// Used ONLY for ordering (real profiles first) and admin identification —
// unlike is_demo, it does NOT trigger any UI badge or interaction block,
// so seeded profiles keep looking realistic to members.
function migrateAddSeededFlag(): void
{
    try {
        $cols = db()->query("SHOW COLUMNS FROM profiles LIKE 'is_seeded'")->fetchAll();
        if (!$cols) {
            db()->exec("ALTER TABLE profiles ADD COLUMN is_seeded TINYINT(1) NOT NULL DEFAULT 0 AFTER is_demo");
            db()->exec("ALTER TABLE profiles ADD KEY idx_profiles_seeded (is_seeded, created_at)");
        }
        // Backfill: any profile whose user email matches the seeder pattern.
        db()->exec(
            "UPDATE profiles p
             JOIN users u ON u.id = p.user_id
             SET p.is_seeded = 1
             WHERE u.email LIKE 'seeded-%@shiarishta.com' AND p.is_seeded = 0"
        );
    } catch (Throwable $e) {
        error_log('[api] migration: profiles.is_seeded — ' . substr($e->getMessage(), 0, 120));
    }
}

// QA/test-account flag: marks accounts created by E2E/QA runs (qatest bots,
// e2e personas, critic personas). These are NOT seeded profiles and NOT real
// members — they must never appear in the admin member directory, the public
// browse directory, member counts or the signup KPI. Hidden everywhere by
// default; the admin directory can opt in with ?include_test=1. Backfill keys
// off email patterns (exact), not display names (the critic persona uses a
// real-looking name like "Zahra Fatima", which pattern filters miss).
function migrateAddTestFlag(): void
{
    try {
        $cols = db()->query("SHOW COLUMNS FROM users LIKE 'is_test'")->fetchAll();
        if (!$cols) {
            db()->exec("ALTER TABLE users ADD COLUMN is_test TINYINT(1) NOT NULL DEFAULT 0 AFTER is_admin");
            db()->exec("ALTER TABLE users ADD KEY idx_users_test (is_test)");
        }
        // Backfill: every account created by QA/E2E runs. Runs on every
        // deploy (idempotent) so accounts created between deploys get flagged.
        // Email patterns cover the bots and personas; the profile patterns
        // cover E2E debris whose email doesn't match (e.g. asqatest13@,
        // cities like "test-profile-for-qa-please-ignore"). Patterns are the
        // established test-shell labels — never bare 'TEST%', which would
        // catch genuine names like "Testament".
        db()->exec(
            "UPDATE users u
             LEFT JOIN profiles p ON p.user_id = u.id
             SET u.is_test = 1
             WHERE u.is_test = 0 AND u.is_admin = 0 AND (
                 u.email LIKE '%qatest%@example.com'
                 OR u.email LIKE 'syedmohammedali1512+e2e%@gmail.com'
                 OR u.email LIKE 'syedmohammedali1512+critic%@gmail.com'
                 OR p.display_name LIKE 'TEST PROFILE%'
                 OR p.display_name LIKE 'QA Test%'
                 OR p.display_name LIKE 'QATest%'
                 OR p.display_name LIKE 'E2E QA%'
                 OR p.display_name LIKE 'E2E Test%'
                 OR p.city LIKE 'TEST PROFILE%'
                 OR p.city LIKE 'test-profile-for-qa%'
                 OR p.city LIKE 'DATA-%'
             )"
        );
    } catch (Throwable $e) {
        error_log('[api] migration: users.is_test — ' . substr($e->getMessage(), 0, 120));
    }
}

/**
 * Seed the curated community rooms.
 *
 * The frontend's DEFAULT_COMMUNITIES (src/lib/communityData.js) defines the
 * eight curated rooms (hyderabad, dubai, dallas, london, toronto, reverts,
 * parents, newlywed), and the daily community seeder writes posts into them —
 * but in remote mode the app lists rooms ONLY from the DB `communities`
 * table. Until this migration, that table held just `general` (plus QA debris),
 * so /community/dallas etc. rendered "Community not found" while seeded posts
 * piled up in rooms nobody could open. Idempotent: INSERT IGNORE.
 */
function migrateSeedDefaultCommunities(): void
{
    try {
        $rooms = [
            ['hyderabad', 'Hyderabad', '🇮🇳'],
            ['dubai',     'Dubai',     '🇦🇪'],
            ['dallas',    'Dallas',    '🇺🇸'],
            ['london',    'London',    '🇬🇧'],
            ['toronto',   'Toronto',   '🇨🇦'],
            ['reverts',   'Reverts',   '🧘'],
            ['parents',   'Parents',   '👨‍👩‍👧‍👦'],
            ['newlywed',  'Newlywed',  '💍'],
        ];
        $ins = db()->prepare(
            "INSERT IGNORE INTO communities (id, name, icon) VALUES (?, ?, ?)"
        );
        foreach ($rooms as [$id, $name, $icon]) {
            $ins->execute([$id, $name, $icon]);
        }
        // QA debris must never surface in member-facing lists.
        db()->exec("DELETE FROM replies WHERE post_id IN (SELECT id FROM posts WHERE community_id = 'qatestcommunity07')");
        db()->exec("DELETE FROM posts WHERE community_id = 'qatestcommunity07'");
        db()->exec("DELETE FROM communities WHERE id = 'qatestcommunity07'");
    } catch (Throwable $e) {
        error_log('[api] migration: seed default communities — ' . substr($e->getMessage(), 0, 120));
    }
}
