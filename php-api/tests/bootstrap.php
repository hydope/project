<?php
// PHPUnit bootstrap — loads libs without booting the full API.
declare(strict_types=1);

require __DIR__ . '/../lib/validate.php';
require __DIR__ . '/../lib/compatibility.php';

// Minimal stubs for functions the libs reference.
if (!function_exists('uuid')) {
    function uuid(): string { return bin2hex(random_bytes(16)); }
}
