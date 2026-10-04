<?php
// Idempotent schema migration — runs db/schema.sql statements on first boot.

function migrateSchema(): void
{
    static $done = false;
    if ($done) return;
    $done = true;

    // Fast path: once a full migration has succeeded, a marker file lets us
    // skip all the SHOW COLUMNS / SHOW TABLES probes on every request. The
    // marker expires after 6 hours so new migrations still get picked up.
    // (This was adding 5-6 DB round-trips to EVERY API call on shared hosting.)
    $marker = sys_get_temp_dir() . '/shiarishta_migrated';
    if (is_file($marker) && (time() - filemtime($marker) < 21600)) {
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

    // Cheap "already migrated" probe. Must check a LATE table too: probing only
    // users.* would skip migration forever after a partial run (a lesson learned
    // the hard way — conversations/messages/profile_drafts never got created).
    try {
        $col = db()->query("SHOW COLUMNS FROM users LIKE 'email_verified'")->fetch();
        $tbl = db()->query("SHOW TABLES LIKE 'profile_drafts'")->fetch();
        if ($col && $tbl) {
            @touch(sys_get_temp_dir() . '/shiarishta_migrated');
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
        @touch(sys_get_temp_dir() . '/shiarishta_migrated');
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
        // Public handle, distinct from display_name. A member picks this
        // themselves (e.g. "zainab.h") so they can be addressed without
        // publishing a full name or an email address.
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

    // Uniqueness for the public handle. Added separately because MySQL cannot
    // express "unique unless NULL" in the ADD COLUMN above, and because an
    // existing database may already hold duplicate values from before handles
    // existed (every row is NULL at that point, which is fine).
    try {
        db()->exec("CREATE UNIQUE INDEX uq_profiles_username ON profiles (username)");
        error_log('[api] migration: added unique index on profiles.username');
    } catch (Throwable $e) {
        // "Duplicate key name" simply means it already exists — not an error.
        if (!/Duplicate key name|already exists/i.test($e->getMessage())) {
            error_log('[api] migration: username index not created — ' . substr($e->getMessage(), 0, 120));
        }
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
