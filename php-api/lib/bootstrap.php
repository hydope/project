<?php
// Core bootstrap: .env loading, JSON/HTTP helpers, client IP.
// DB lives in db.php; JWT in jwt.php; mail in mail.php; rate limit in ratelimit.php.

if (file_exists(__DIR__.'/../.env')) {
    foreach (file(__DIR__.'/../.env', FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) as $l) {
        $l=trim($l);
        if($l===''||$l[0]==='#')continue;
        if(strpos($l,'=')!==false){[$k,$v]=explode('=',$l,2);putenv(trim($k).'='.trim($v));}
    }
}
date_default_timezone_set(getenv('TZ')?: 'UTC');
mb_internal_encoding('UTF-8');

function json(mixed $d,int $s=200):never{
    http_response_code($s);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('X-Content-Type-Options: nosniff');
    $e=json_encode($d,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    if($e===false){http_response_code(500);echo json_encode(['error'=>'Internal encoding error']);}
    else echo $e;
    exit;
}
function je(string $m,int $s=400):never{json(['error'=>$m],$s);}
function qp(string $k,mixed $d=null):mixed{return $_GET[$k]??$d;}
function hbearer():?string{
    $h=$_SERVER['HTTP_AUTHORIZATION']??'';
    if(str_starts_with($h,'Bearer '))return substr($h,7);
    $h=$_SERVER['REDIRECT_HTTP_AUTHORIZATION']??'';
    if(str_starts_with($h,'Bearer '))return substr($h,7);
    if(function_exists('getallheaders')){
        $a=getallheaders();
        foreach(['Authorization','authorization'] as $k){
            if(isset($a[$k])&&str_starts_with($a[$k],'Bearer '))return substr($a[$k],7);
        }
    }
    // HttpOnly cookie fallback — the secure path. The cookie is set on
    // login/register via setAuthCookie(). Header takes precedence so
    // native apps and API clients keep working.
    if (!empty($_COOKIE['sr_token'])) {
        return (string)$_COOKIE['sr_token'];
    }
    return null;
}

/**
 * Set the auth JWT as an HttpOnly, Secure, SameSite=Lax cookie.
 * This is the primary token transport for browsers — immune to XSS theft,
 * unlike localStorage. The token is ALSO returned in the JSON body for
 * backward compatibility with existing clients.
 */
function setAuthCookie(string $token): void
{
    $secure = ($_SERVER['HTTPS'] ?? '') === 'on'
        || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    // 30-day expiry matches the JWT lifetime.
    setcookie('sr_token', $token, [
        'expires' => time() + 30 * 86400,
        'path' => '/',
        'domain' => '',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

/**
 * Clear the auth cookie (logout).
 */
function clearAuthCookie(): void
{
    setcookie('sr_token', '', [
        'expires' => time() - 3600,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}
/**
 * Best client IP for this request (2026-11-13 fix).
 *
 * Behind Cloudflare, REMOTE_ADDR is the edge address of the connection —
 * one address shared by everyone routed through that edge — so every
 * IP-keyed bucket (rate limits, analytics IP tagging, visitor hashing)
 * was effectively shared across strangers (the 2026-10-07 mechanism,
 * re-proven 2026-11-13: TRUST_PROXY is absent from the production .env,
 * so the forwarded chain below never fired). Cloudflare sends the real
 * visitor address in CF-Connecting-IP, so prefer it when present and a
 * syntactically valid IP (the same header routes/biodata.php already
 * reads directly); fall back to the TRUST_PROXY forwarded chain, then
 * REMOTE_ADDR.
 */
function cip():string{
    $cfIp = trim((string)($_SERVER['HTTP_CF_CONNECTING_IP'] ?? ''));
    if ($cfIp !== '' && filter_var($cfIp, FILTER_VALIDATE_IP) !== false) {
        return $cfIp;
    }
    if((int)getenv('TRUST_PROXY')===1){
        foreach(['HTTP_X_FORWARDED_FOR','HTTP_X_REAL_IP','REMOTE_ADDR'] as $k){
            $v=$_SERVER[$k]??'';
            if($v!=='')return trim(explode(',',$v)[0]);
        }
    }
    return $_SERVER['REMOTE_ADDR']??'0.0.0.0';
}
function isLocalIp(string $ip):bool{
    return in_array($ip,['127.0.0.1','::1','::ffff:127.0.0.1'],true);
}
