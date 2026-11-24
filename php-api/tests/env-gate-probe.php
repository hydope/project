<?php
/**
 * Child-process probe for the fail-closed environment gates (audit A-13,
 * 2026-11-24).
 *
 * Loads the REAL lib/bootstrap.php (appEnv()/isProductionEnv()) and the REAL
 * lib/jwt.php (jwtSecret()) and drives them through APP_ENV / JWT_SECRET
 * combinations with putenv(). Prints one key=json line per observation for
 * the parent suite to assert on.
 *
 * The contract under test: an unset, empty, or unrecognised APP_ENV is
 * production for security purposes; the known literal JWT fallback secret is
 * reachable ONLY under an explicit APP_ENV=development; a real >=32-char
 * JWT_SECRET is always used as-is.
 */
declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/jwt.php';

/** Emit one observation for the parent to assert on. */
function emit(string $key, $value): void
{
    echo $key . '=' . json_encode($value, JSON_UNESCAPED_SLASHES) . "\n";
}

/** Set (value) or unset (null) one env var for the next scenario. */
function setEnv(string $name, ?string $value): void
{
    if ($value === null) {
        putenv($name);
        unset($_ENV[$name], $_SERVER[$name]);
    } else {
        putenv($name . '=' . $value);
        $_ENV[$name] = $value;
    }
}

/** jwtSecret() outcome for the current env state: the secret, or 'THREW'. */
function secretOutcome(): string
{
    try {
        return jwtSecret();
    } catch (Throwable) {
        return 'THREW';
    }
}

// ── appEnv() resolution ─────────────────────────────────────────────────────
setEnv('APP_ENV', null);
emit('env_unset_is_production', appEnv());
setEnv('APP_ENV', '');
emit('env_empty_is_production', appEnv());
setEnv('APP_ENV', 'staging');
emit('env_unknown_is_production', appEnv());
setEnv('APP_ENV', 'production');
emit('env_production', appEnv());
setEnv('APP_ENV', 'Production');
emit('env_production_case_insensitive', appEnv());
setEnv('APP_ENV', 'development');
emit('env_development', appEnv());
emit('is_production_helper', isProductionEnv());

// ── jwtSecret() fallback gating (no usable JWT_SECRET) ─────────────────────
setEnv('JWT_SECRET', null);
setEnv('APP_ENV', null);
emit('secret_unset_env_unset', secretOutcome());
setEnv('APP_ENV', 'production');
emit('secret_unset_env_production', secretOutcome());
setEnv('APP_ENV', 'staging');
emit('secret_unset_env_unknown', secretOutcome());
setEnv('APP_ENV', 'development');
emit('secret_unset_env_development', secretOutcome());

// A short secret is as unusable as a missing one.
setEnv('JWT_SECRET', 'too-short');
setEnv('APP_ENV', null);
emit('secret_short_env_unset', secretOutcome());
setEnv('APP_ENV', 'development');
emit('secret_short_env_development', secretOutcome());

// ── A real secret is always used as-is, whatever the env ───────────────────
$real = str_repeat('r', 40);
setEnv('JWT_SECRET', $real);
setEnv('APP_ENV', null);
emit('secret_real_env_unset', secretOutcome());
setEnv('APP_ENV', 'production');
emit('secret_real_env_production', secretOutcome());

// Restore a neutral state for anything running after this probe.
setEnv('APP_ENV', null);
setEnv('JWT_SECRET', null);
