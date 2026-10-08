<?php
// ─── Migration CLI ───────────────────────────────────────────────────────────
// Usage:
//   php migrate-cli.php status    — list applied/pending migrations
//   php migrate-cli.php migrate   — run pending migrations
//   php migrate-cli.php rollback  — roll back the last migration batch
//
// Migrations are tracked in the `migrations` table. Each migration file in
// db/migrations/ has up() and down() functions.

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/logger.php';

$command = $argv[1] ?? 'status';

// Ensure the tracking table exists.
db()->exec(
    "CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        batch INT NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB"
);

$migrationDir = __DIR__ . '/db/migrations';
$files = glob("$migrationDir/*.php") ?: [];
sort($files);

$applied = [];
foreach (db()->query('SELECT name FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_COLUMN) as $name) {
    $applied[$name] = true;
}

switch ($command) {
    case 'status':
        echo "Applied migrations:\n";
        foreach (array_keys($applied) as $name) {
            echo "  ✓ $name\n";
        }
        echo "\nPending migrations:\n";
        $pending = 0;
        foreach ($files as $file) {
            $name = basename($file, '.php');
            if (!isset($applied[$name])) {
                echo "  ○ $name\n";
                $pending++;
            }
        }
        if ($pending === 0) echo "  (none)\n";
        break;

    case 'migrate':
        $batch = (int)(db()->query('SELECT MAX(batch) FROM migrations')->fetchColumn() ?? 0) + 1;
        $ran = 0;
        foreach ($files as $file) {
            $name = basename($file, '.php');
            if (isset($applied[$name])) continue;
            require_once $file;
            $fn = "migration_{$name}_up";
            if (!function_exists($fn)) {
                echo "SKIP: $name (no up function)\n";
                continue;
            }
            echo "Migrating: $name... ";
            try {
                $fn();
                db()->prepare('INSERT INTO migrations (name, batch) VALUES (?, ?)')->execute([$name, $batch]);
                echo "done\n";
                $ran++;
            } catch (Throwable $e) {
                echo "FAILED: {$e->getMessage()}\n";
                logError('Migration failed', ['name' => $name, 'error' => $e->getMessage()]);
                exit(1);
            }
        }
        echo "Migrated $ran migration(s) in batch $batch.\n";
        break;

    case 'rollback':
        $batch = (int)(db()->query('SELECT MAX(batch) FROM migrations')->fetchColumn() ?? 0);
        if ($batch === 0) {
            echo "Nothing to roll back.\n";
            break;
        }
        $toRollback = db()->query("SELECT name FROM migrations WHERE batch = $batch ORDER BY id DESC")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($toRollback as $name) {
            $file = "$migrationDir/$name.php";
            if (!is_file($file)) {
                echo "SKIP: $name (file missing)\n";
                continue;
            }
            require_once $file;
            $fn = "migration_{$name}_down";
            if (!function_exists($fn)) {
                echo "SKIP: $name (no down function)\n";
                continue;
            }
            echo "Rolling back: $name... ";
            try {
                $fn();
                db()->prepare('DELETE FROM migrations WHERE name = ?')->execute([$name]);
                echo "done\n";
            } catch (Throwable $e) {
                echo "FAILED: {$e->getMessage()}\n";
                exit(1);
            }
        }
        echo "Rolled back batch $batch.\n";
        break;

    default:
        echo "Usage: php migrate-cli.php [status|migrate|rollback]\n";
        exit(1);
}
