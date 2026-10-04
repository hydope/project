<?php
// Idempotent schema migration — runs db/schema.sql statements on first boot.

function migrateSchema(): void
{
    static $done = false;
    if ($done) return;
    $done = true;

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
