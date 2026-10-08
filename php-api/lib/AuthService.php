<?php
// ─── Auth service ────────────────────────────────────────────────────────────
// Authentication business logic: registration, login, token issuance.
// Routes handle HTTP; this class enforces auth rules.

declare(strict_types=1);

class AuthService
{
    /**
     * Register a new user. Returns [userId, token].
     * @throws RuntimeException on duplicate email
     */
    public static function register(string $email, string $password, string $displayName, string $sect, string $role = 'member'): array
    {
        $userId = uuid();
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $isAdmin = in_array($email, adminEmails(), true);

        $pdo = db();
        try {
            $pdo->beginTransaction();
            $pdo->prepare('INSERT INTO users (id, email, password_hash, display_name, is_admin, role) VALUES (?, ?, ?, ?, ?, ?)')
                ->execute([$userId, $email, $hash, $displayName, $isAdmin ? 1 : 0, $role]);
            $pdo->prepare('INSERT INTO profiles (user_id, display_name, sect) VALUES (?, ?, ?)')
                ->execute([$userId, $displayName, $sect]);
            $pdo->commit();
        } catch (PDOException $e) {
            $pdo->rollBack();
            if (str_contains($e->getMessage(), 'Duplicate')) {
                throw new RuntimeException('An account with this email already exists.');
            }
            throw $e;
        }

        logInfo('User registered', ['user_id' => $userId, 'role' => $role]);
        return [$userId, jwtEncode(['uid' => $userId, 'email' => $email])];
    }

    /**
     * Authenticate. Returns [user, token].
     * @throws RuntimeException on invalid credentials
     */
    public static function login(string $email, string $password): array
    {
        $stmt = db()->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([strtolower($email)]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user || !password_verify($password, (string)$user['password_hash'])) {
            logWarn('Failed login attempt', ['email' => substr($email, 0, 50)]);
            throw new RuntimeException('Invalid email or password.');
        }

        // Rehash if the algorithm upgraded.
        if (password_needs_rehash((string)$user['password_hash'], PASSWORD_BCRYPT)) {
            db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
                ->execute([password_hash($password, PASSWORD_BCRYPT), $user['id']]);
        }

        $token = jwtEncode(['uid' => $user['id'], 'email' => $user['email']]);
        logInfo('User logged in', ['user_id' => $user['id']]);
        return [$user, $token];
    }
}
