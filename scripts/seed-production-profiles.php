#!/usr/bin/env php
<?php
/**
 * seed-production-profiles.php — one-shot cPanel seeder for Shia Rishta.
 *
 * WHY A CLI SEEDER INSTEAD OF HITTING /api/auth/register
 * ------------------------------------------------------
 * The live API deliberately throttles signups (php-api/index.php:110):
 *     register:ip -> 3 accounts / hour / IP
 *     write      -> 30 writes / minute / IP
 * Ten profiles would take ~4 hours of wall-clock and still produce LOCKED
 * accounts: profiles.php:397 gates full profile views behind
 * requireVerifiedEmail(), and the only way to satisfy that is the emailed
 * token — which cannot be delivered to @example.com placeholders.
 *
 * This script writes the same rows the API would, but directly, so the seed is
 * genuinely browsable: email_verified = 1 and visibility = 'public'.
 *
 * IT LIVES IN scripts/, WHICH THE DEPLOY NEVER SHIPS.
 * .github/workflows/deploy.yml pushes only ./dist/ and ./php-api/, so this file
 * cannot reach public_html and cannot be executed by a visitor. Upload it to
 * your cPanel home dir (NOT public_html) and run it from cPanel Terminal.
 *
 * USAGE (cPanel Terminal, from the repo root):
 *     php scripts/seed-production-profiles.php --dry-run
 *     php scripts/seed-production-profiles.php --purge
 *     php scripts/seed-production-profiles.php --seed
 *     php scripts/seed-production-profiles.php --all
 *
 * Requires PHP CLI + the pdo_mysql extension. Re-runnable: --seed is idempotent
 * (it updates an existing profile by email instead of inserting a duplicate).
 */

declare(strict_types=1);

// ── CLI guard ────────────────────────────────────────────────────────────────
// This script prints DB rows and writes files. It must never answer HTTP.
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Forbidden: CLI only.\n");
}

// ── Boot the API's own config + DB layer ─────────────────────────────────────
// bootstrap.php loads php-api/.env into getenv(), so DB_* credentials come from
// the same file the deployed API already uses. Nothing is hardcoded here.
$apiRoot = dirname(__DIR__) . '/php-api';
if (!is_file($apiRoot . '/lib/bootstrap.php')) {
    exit("Cannot find php-api/lib/bootstrap.php — run this from the repo root.\n");
}
require_once $apiRoot . '/lib/bootstrap.php';
require_once $apiRoot . '/lib/db.php';
require_once $apiRoot . '/lib/util.php';

// ── Args ─────────────────────────────────────────────────────────────────────
$argvFlags = array_slice($argv, 1);
$dryRun    = in_array('--dry-run', $argvFlags, true);
$wantPurge = in_array('--purge', $argvFlags, true) || in_array('--all', $argvFlags, true);
$wantSeed  = in_array('--seed', $argvFlags, true) || in_array('--all', $argvFlags, true);
if (!$wantPurge && !$wantSeed) {
    echo "Usage: php scripts/seed-production-profiles.php [--dry-run] [--purge|--seed|--all]\n";
    echo "  (no flags) prints a preview and exits without writing anything\n";
    exit(0);
}

$pdo = db();
$photoBase = trim((string)(getenv('UPLOAD_DIR') ?: ($apiRoot . '/uploads'))) . '/photos';

/** Echo a line only when we are actually writing. */
function act(string $msg): void {
    global $dryRun;
    echo ($dryRun ? '[dry-run] ' : '') . $msg . PHP_EOL;
}

// ═══════════════════════════════════════════════════════════════════════════
//  AVATAR GENERATION — pure-PHP PNG writer (no GD required)
// ═══════════════════════════════════════════════════════════════════════════
// Shared hosting frequently ships without ext-gd, so this encodes PNG bytes by
// hand: signature + IHDR + IDAT (zlib) + IEND. Colortype 2 = truecolour RGB,
// bit depth 8, no interlace. gzcompress() emits RFC1950 zlib, which is exactly
// what an IDAT chunk expects.
//
// These are deliberately NOT photorealistic faces. Real-looking images of
// invented people on a matrimonial site would be misleading; a branded monogram
// is honest, looks deliberate, and renders identically everywhere.

/** Wrap PNG chunk payload in length/type/CRC framing. */
function pngChunk(string $type, string $data): string
{
    return pack('N', strlen($data)) . $type . $data . pack('N', crc32($type . $data));
}

/** Encode a width x height RGB byte-string as a PNG. */
function pngEncode(int $w, int $h, string $rgb): string
{
    // Every scanline is prefixed with a filter byte; 0 = "None".
    $raw = '';
    for ($y = 0; $y < $h; $y++) {
        $raw .= "\x00" . substr($rgb, $y * $w * 3, $w * 3);
    }
    $ihdr = pack('NNCCCCC', $w, $h, 8, 2, 0, 0, 0);
    return "\x89PNG\r\n\x1a\n"
        . pngChunk('IHDR', $ihdr)
        . pngChunk('IDAT', (string)gzcompress($raw, 9))
        . pngChunk('IEND', '');
}

/** #RRGGBB -> [r,g,b]. */
function hexRgb(string $hex): array
{
    $hex = ltrim($hex, '#');
    return [
        (int)hexdec(substr($hex, 0, 2)),
        (int)hexdec(substr($hex, 2, 2)),
        (int)hexdec(substr($hex, 4, 2)),
    ];
}

/**
 * Render a 400x400 monogram avatar: vertical brand gradient + centred initials.
 * $glyphs is an array of 7-row, 5-column bitmaps (see FONT_5X7 below).
 */
function renderAvatar(array $glyphs, string $hexFrom, string $hexTo): string
{
    $size = 400;
    [$r1, $g1, $b1] = hexRgb($hexFrom);
    [$r2, $g2, $b2] = hexRgb($hexTo);
    // Monogram drawn in the site's paper tone so it reads on any gradient.
    [$fr, $fg, $fb] = hexRgb('#FFFAF4');

    // Scale each 5x7 glyph to 5*26 x 7*26 = 130 x 182, with a 26px inter-glyph gap.
    $scale = 26;
    $glyphW = 5 * $scale;
    $glyphH = 7 * $scale;
    $gap = 26;
    $totalW = count($glyphs) * $glyphW + (count($glyphs) - 1) * $gap;
    $originX = intdiv($size - $totalW, 2);
    $originY = intdiv($size - $glyphH, 2);

    // Pre-mark the glyph pixels so the gradient loop can test membership cheaply.
    // Key MUST be row-major (y * size + x) to match the lookup below.
    $ink = [];
    foreach ($glyphs as $gi => $rows) {
        foreach ($rows as $ry => $row) {
            foreach (str_split($row) as $cx => $bit) {
                if ($bit !== '1') {
                    continue;
                }
                for ($dy = 0; $dy < $scale; $dy++) {
                    for ($dx = 0; $dx < $scale; $dx++) {
                        $px = $originX + $gi * ($glyphW + $gap) + $cx * $scale + $dx;
                        $py = $originY + $ry * $scale + $dy;
                        $ink[$py * $size + $px] = true;
                    }
                }
            }
        }
    }

    $out = '';
    for ($y = 0; $y < $size; $y++) {
        $t = $y / ($size - 1);
        $r = (int)round($r1 + ($r2 - $r1) * $t);
        $g = (int)round($g1 + ($g2 - $g1) * $t);
        $b = (int)round($b1 + ($b2 - $b1) * $t);
        $rowIdx = $y * $size;
        for ($x = 0; $x < $size; $x++) {
            if (isset($ink[$rowIdx + $x])) {
                $out .= chr($fr) . chr($fg) . chr($fb);
            } else {
                $out .= chr($r) . chr($g) . chr($b);
            }
        }
    }
    return pngEncode($size, $size, $out);
}

// 5x7 bitmap glyphs, '1' = ink. Covers A-Z plus a space fallback so any initial
// pair renders rather than throwing.
const FONT_5X7 = [
    'A' => ['01110','10001','10001','11111','10001','10001','10001'],
    'B' => ['11110','10001','10001','11110','10001','10001','11110'],
    'C' => ['01110','10001','10000','10000','10000','10001','01110'],
    'D' => ['11110','10001','10001','10001','10001','10001','11110'],
    'E' => ['11111','10000','10000','11110','10000','10000','11111'],
    'F' => ['11111','10000','10000','11110','10000','10000','10000'],
    'G' => ['01110','10001','10000','10111','10001','10001','01111'],
    'H' => ['10001','10001','10001','11111','10001','10001','10001'],
    'I' => ['11111','00100','00100','00100','00100','00100','11111'],
    'J' => ['00111','00010','00010','00010','00010','10010','01100'],
    'K' => ['10001','10010','10100','11000','10100','10010','10001'],
    'L' => ['10000','10000','10000','10000','10000','10000','11111'],
    'M' => ['10001','11011','10101','10101','10001','10001','10001'],
    'N' => ['10001','11001','10101','10011','10001','10001','10001'],
    'O' => ['01110','10001','10001','10001','10001','10001','01110'],
    'P' => ['11110','10001','10001','11110','10000','10000','10000'],
    'Q' => ['01110','10001','10001','10001','10101','10010','01101'],
    'R' => ['11110','10001','10001','11110','10100','10010','10001'],
    'S' => ['01111','10000','10000','01110','00001','00001','11110'],
    'T' => ['11111','00100','00100','00100','00100','00100','00100'],
    'U' => ['10001','10001','10001','10001','10001','10001','01110'],
    'V' => ['10001','10001','10001','10001','10001','01010','00100'],
    'W' => ['10001','10001','10001','10101','10101','11011','10001'],
    'X' => ['10001','10001','01010','00100','01010','10001','10001'],
    'Y' => ['10001','10001','01010','00100','00100','00100','00100'],
    'Z' => ['11111','00001','00010','00100','01000','10000','11111'],
];

/** Map an initials string to glyph bitmaps, upper-casing and tolerating gaps. */
function glyphsFor(string $initials): array
{
    $glyphs = [];
    foreach (preg_split('/\s+/', strtoupper(trim($initials))) ?: [] as $ch) {
        if ($ch === '') {
            continue;
        }
        $glyphs[] = FONT_5X7[$ch] ?? FONT_5X7['A'];
    }
    return $glyphs ?: [FONT_5X7['A']];
}

const DEMO_PASSWORD = 'DemoRishta!2026';

/** @var array<int,array<string,mixed>> */
$PROFILES = [
    [
        'email' => 'fatima.zahra@example.com',
        'displayName' => 'Fatima Zahra Baig',
        'initials' => 'FZ',
        'age' => 26, 'gender' => 'female',
        'city' => 'Karachi', 'country' => 'Pakistan',
        'sect' => 'Ithna Ashari (Twelver)',
        'profession' => 'Pediatric Registered Nurse',
        'religiosity' => 'very-practicing',
        'educationLevel' => "Bachelor's degree",
        'marja' => 'Ayatollah al-Sistani',
        'prayer' => 'All 5 daily prayers',
        'modesty' => 'Hijab — always observed',
        'diet' => 'Halal only',
        'languages' => 'Urdu, English, Arabic',
        'ethnicity' => 'South Asian',
        'incomeRange' => '$40k–$60k',
        'maritalStatus' => 'Never married',
        'children' => 'No children',
        'childrenPlans' => 'Want children, insha\'Allah',
        'relocation' => 'same-country',
        'familyInvolvement' => 'from-start',
        'heightCm' => 163,
        'timeline' => '6m',
        'syedStatus' => 'syed-paternal',
        'photosVisibility' => 'public',
        'isVerified' => true,
        'bio' => "Assalamu alaikum. I work in pediatric nursing at a charity hospital in Karachi, which I love — most of my patients are children and patience is the whole job. I completed my BSN and am now doing a postgraduate diploma in child health.\n\nOutside work I read, cook for my family, and try to keep a consistent routine of Fajr and evening adhkar. I am looking for a deen-conscious partner who values consistency over words.",
        'expectations' => "I am looking for a man who prays regularly, is honest and settled in his work, and does not treat religion as something to display only on weekends. I would like a marriage where both families are involved from the beginning — this should move at a respectful pace.\n\nRelocation within Pakistan is fine; I would consider moving if the opportunity is genuinely right.",
        'aboutFamily' => "We are a practising Shia family originally from Multan, settled in Karachi for two generations. My father is a retired schoolteacher and my mother is a homemaker. I have one younger brother in medical school. Our home is modest but there is a lot of conversation in it.",
    ],
    [
        'email' => 'zainab.husayn@example.com',
        'displayName' => 'Zainab Husayn',
        'initials' => 'ZH',
        'age' => 29, 'gender' => 'female',
        'city' => 'Houston', 'country' => 'USA',
        'sect' => 'Ithna Ashari (Twelver)',
        'profession' => 'Chemical Engineer',
        'religiosity' => 'practicing',
        'educationLevel' => "Master's degree",
        'marja' => 'Ayatollah al-Khamenei',
        'prayer' => 'Mostly daily',
        'modesty' => 'Hijab — always observed',
        'diet' => 'Halal only',
        'languages' => 'English, Urdu, Farsi / Persian',
        'ethnicity' => 'South Asian',
        'incomeRange' => '$100k–$150k',
        'maritalStatus' => 'Never married',
        'children' => 'No children',
        'childrenPlans' => 'Want children, insha\'Allah',
        'relocation' => 'anywhere',
        'familyInvolvement' => 'after-match',
        'heightCm' => 168,
        'timeline' => '1y',
        'syedStatus' => 'non-syed',
        'photosVisibility' => 'public',
        'isVerified' => true,
        'bio' => "I am a chemical engineer at a refining company in Houston, working on emissions and process efficiency — the unglamorous half of the job, which I actually prefer.\n\nI grew up bilingual, English and Urdu with some Farsi from my mother's side, and I visit Karachi most summers. I am not hugely public about my practice, but I am consistent: Fajr most days, and I try not to let work swallow the rest of it.\n\nWhat I want is simple. Someone serious, kind, and settled.",
        'expectations' => "I would like a partner who is comfortable with who I am — a working woman with my own career and my own opinions, and who expects the same from his wife. I am not interested in a rushed process.\n\nI am open to relocating, though my instinct is to build a life somewhere I can practise my faith with a community rather than moving somewhere isolated.",
        'aboutFamily' => "Both my parents immigrated from Karachi in the 80s and run a small import business in the Houston area. I have one older brother and a younger sister, both married. My family is small, warm, and very involved — my mother will want to speak with your family early, and that is fine by me.",
    ],
    [
        'email' => 'khadija.noor@example.com',
        'displayName' => 'Khadija Noor',
        'initials' => 'KN',
        'age' => 24, 'gender' => 'female',
        'city' => 'Lahore', 'country' => 'Pakistan',
        'sect' => 'Ithna Ashari (Twelver)',
        'profession' => 'Architect',
        'religiosity' => 'moderately',
        'educationLevel' => "Bachelor's degree",
        'marja' => 'Not following a specific Marja yet',
        'prayer' => 'Weekly / Jumu\'ah',
        'modesty' => 'Hijab — working towards it',
        'diet' => 'Halal & Kitab',
        'languages' => 'Urdu, English, Punjabi',
        'ethnicity' => 'South Asian',
        'incomeRange' => '$20k–$40k',
        'maritalStatus' => 'Never married',
        'children' => 'No children',
        'childrenPlans' => 'Open to children',
        'relocation' => 'discuss',
        'familyInvolvement' => 'wali-required',
        'heightCm' => 160,
        'timeline' => '2y',
        'syedStatus' => 'non-syed',
        'photosVisibility' => 'members',
        'isVerified' => false,
        'bio' => "I graduated from NCA with a degree in architecture and I now work at a small firm in Gulberg, mostly residential and interiors. The job is good but the hours are long, and the field work is the part I like most.\n\nI will be honest about where I am with my deen: I was raised practising, I drifted a little through university, and I am actively coming back to it. I am not looking for someone to lecture me — I would rather find someone honest about their own struggles.\n\nI am in no rush. I would rather get this right than get it done.",
        'expectations' => "I want someone kind and patient, who does not need me to be perfect before he will talk to me. I need my wali involved — please do not approach me directly, my father will handle introductions.\n\nI am not fixed on where we live. I am fixed on not being married to someone who treats my career as a phase.",
        'aboutFamily' => "We are from Lahore, a middle-class family. My father is an accountant and my mother is a schoolteacher. I have two younger sisters who are still studying.",
    ],
    [
        'email' => 'maryam.siddiqui@example.com',
        'displayName' => 'Maryam Siddiqui',
        'initials' => 'MS',
        'age' => 31, 'gender' => 'female',
        'city' => 'Toronto', 'country' => 'Canada',
        'sect' => 'Ithna Ashari (Twelver)',
        'profession' => 'Data Scientist',
        'religiosity' => 'very-practicing',
        'educationLevel' => "Master's degree",
        'marja' => 'Ayatollah al-Sistani',
        'prayer' => 'All 5 daily prayers',
        'modesty' => 'Hijab — always observed',
        'diet' => 'Halal only',
        'languages' => 'English, Urdu, Arabic',
        'ethnicity' => 'South Asian',
        'incomeRange' => '$100k–$150k',
        'maritalStatus' => 'Never married',
        'children' => 'No children',
        'childrenPlans' => 'Want children, insha\'Allah',
        'relocation' => 'same-country',
        'familyInvolvement' => 'from-start',
        'heightCm' => 165,
        'timeline' => '6m',
        'syedStatus' => 'syed-paternal',
        'photosVisibility' => 'public',
        'isVerified' => true,
        'bio' => "I work in applied machine learning for a healthcare startup in Toronto. The work is exactly as unglamorous as it sounds — mostly cleaning other people's data and being right about it.\n\nI moved here for my studies eight years ago and built the life I wanted, but I never stopped thinking about this. I keep my practice deliberately: all five prayers, daily adhkar, and a stable community around the masjid.\n\nI am looking for someone who does not need me to be anywhere near perfect, because I am not. I am just honest.",
        'expectations' => "Someone with a settled career and an unshakeable routine. I do not need you to be wealthy, but I do need you to have a plan.\n\nI would like both our families involved early — I have no interest in a relationship that only exists in private. And I would like someone who can laugh at me, because I am quite serious and I have been told that is a problem.",
        'aboutFamily' => "My parents moved to Toronto from Karachi when I was nineteen and they are both settled here now, near me. I am the eldest of four. My younger brother is in medical school in London and my two sisters are close to my age. Family dinners are a weekly non-negotiable.",
    ],
    [
        'email' => 'ayesha.rahman@example.com',
        'displayName' => 'Ayesha Rahman',
        'initials' => 'AR',
        'age' => 27, 'gender' => 'female',
        'city' => 'London', 'country' => 'United Kingdom',
        'sect' => 'Ismaili',
        'profession' => 'Clinical Pharmacist',
        'religiosity' => 'very-practicing',
        'educationLevel' => "Master's degree",
        'marja' => 'Ayatollah al-Shirazi',
        'prayer' => 'All 5 daily prayers',
        'modesty' => 'Hijab — always observed',
        'diet' => 'Halal only',
        'languages' => 'English, Arabic, Urdu',
        'ethnicity' => 'South Asian',
        'incomeRange' => '$60k–$100k',
        'maritalStatus' => 'Never married',
        'children' => 'No children',
        'childrenPlans' => 'Want children, insha\'Allah',
        'relocation' => 'same-country',
        'familyInvolvement' => 'after-match',
        'heightCm' => 162,
        'timeline' => '1y',
        'syedStatus' => 'non-syed',
        'photosVisibility' => 'private',
        'isVerified' => true,
        'bio' => "I am a clinical pharmacist at a large NHS trust in London, working in oncology. It is a heavy job and I will not dress that up — but I am good at it and I have the postgraduate training to back it up.\n\nI am Ismaili, from a Khoja family in Gujranwala with roots going back to Kenya, which makes me mildly obsessed with East African biryani.\n\nI keep my photos private at the moment and I would rather explain why over a proper conversation than in a profile.",
        'expectations' => "I would want someone who understands that a demanding career is not the absence of commitment. My work is not a phase and I will not be told it is.\n\nI am not interested in anyone who wants me to choose between my deen and my degree. Both stay.",
        'aboutFamily' => "We are a small family in London — my parents, my younger brother in medical school, and me. My father runs a small accounts practice and my mother volunteers at the Ismaili centre every week. They are the most straightforward people I know and they will want to meet your family.",
    ],
    [
        'email' => 'zoya.kazmi@example.com',
        'displayName' => 'Zoya Kazmi',
        'initials' => 'ZK',
        'age' => 23, 'gender' => 'female',
        'city' => 'Dubai', 'country' => 'UAE',
        'sect' => 'Ithna Ashari (Twelver)',
        'profession' => 'Primary School Teacher',
        'religiosity' => 'very-practicing',
        'educationLevel' => 'Some college',
        'marja' => 'Ayatollah al-Sistani',
        'prayer' => 'All 5 daily prayers',
        'modesty' => 'Hijab — always observed',
        'diet' => 'Halal only',
        'languages' => 'Urdu, English, Arabic',
        'ethnicity' => 'South Asian',
        'incomeRange' => '$40k–$60k',
        'maritalStatus' => 'Never married',
        'children' => 'No children',
        'childrenPlans' => 'Want children, insha\'Allah',
        'relocation' => 'same-country',
        'familyInvolvement' => 'from-start',
        'heightCm' => 158,
        'timeline' => 'now',
        'syedStatus' => 'non-syed',
        'photosVisibility' => 'public',
        'isVerified' => true,
        'bio' => "I teach Year 4 in a Dubai British school. It is noisy, loud, occasionally chaotic, and I love it more than I expected to.\n\nI grew up here but I did my teaching diploma in Lahore, which is where I learned that I actually like children and not just my own cousins. I am the eldest of four daughters, which explains a lot about how I argue.\n\nI am looking to move forward with this properly and soon. My family knows I mean it.",
        'expectations' => "Someone who is kind to my family and to wait properly for things. I would like both families involved from the start and I would like this to move quickly enough that we actually get married.\n\nI want a man who prays — not for show, but because he is actually building something with his deen.",
        'aboutFamily' => "We moved to Dubai when I was nine. My father runs a small trading business and my mother is a homemaker. Three younger sisters, all still at school. We are very close and my mother will absolutely be in the room for every conversation.",
    ],
    [
        'email' => 'iman.farooq@example.com',
        'displayName' => 'Iman Farooq',
        'initials' => 'IF',
        'age' => 33, 'gender' => 'female',
        'city' => 'Chicago', 'country' => 'USA',
        'sect' => 'Ithna Ashari (Twelver)',
        'profession' => 'Attorney',
        'religiosity' => 'practicing',
        'educationLevel' => 'Doctorate (PhD / MD / JD)',
        'marja' => 'Ayatollah al-Khamenei',
        'prayer' => 'Mostly daily',
        'modesty' => 'Hijab — always observed',
        'diet' => 'Halal & Kitab',
        'languages' => 'English, Urdu, Arabic',
        'ethnicity' => 'South Asian',
        'incomeRange' => '$150k+',
        'maritalStatus' => 'Never married',
        'children' => 'No children',
        'childrenPlans' => 'Open to children',
        'relocation' => 'anywhere',
        'familyInvolvement' => 'after-match',
        'heightCm' => 170,
        'timeline' => '1y',
        'syedStatus' => 'non-syed',
        'photosVisibility' => 'members',
        'isVerified' => true,
        'bio' => "I litigate commercial disputes for a Chicago firm. I did my JD at Northwestern and I have been at it for eight years, four of them as a junior partner, which I mention only because people here assume it is luck.\n\nI am direct. I would rather tell you something uncomfortable early than have it surface later. I suspect that is not for everyone, and I have made my peace with that.\n\nI am looking for a marriage that is a partnership in the actual sense — two people with their own lives who choose to build one life together.",
        'expectations' => "I want someone intellectually curious. That is non-negotiable for me. I do not need you to be a lawyer, but I do need you to be someone who thinks about things.\n\nI am not looking to be impressed. I am looking for someone I can be honest with at 2am.",
        'aboutFamily' => "My parents moved from Lahore to Michigan in 1989 for my father's engineering work and stayed. I have one brother in Ann Arbor and a sister-in-law who is far better organised than both of us. My parents are in Dearborn and I see them most weekends.",
    ],
    [
        'email' => 'sumayya.raza@example.com',
        'displayName' => 'Sumayya Raza',
        'initials' => 'SR',
        'age' => 25, 'gender' => 'female',
        'city' => 'Islamabad', 'country' => 'Pakistan',
        'sect' => 'Ithna Ashari (Twelver)',
        'profession' => 'Graphic Designer',
        'religiosity' => 'moderately',
        'educationLevel' => "Bachelor's degree",
        'marja' => 'Prefer not to say',
        'prayer' => 'Mostly daily',
        'modesty' => 'Modest dress, no hijab yet',
        'diet' => 'Halal only',
        'languages' => 'Urdu, English, Punjabi',
        'ethnicity' => 'South Asian',
        'incomeRange' => '$20k–$40k',
        'maritalStatus' => 'Never married',
        'children' => 'No children',
        'childrenPlans' => 'Open to children',
        'relocation' => 'same-city',
        'familyInvolvement' => 'wali-required',
        'heightCm' => 161,
        'timeline' => 'exploring',
        'syedStatus' => 'prefer',
        'photosVisibility' => 'members',
        'isVerified' => false,
        'bio' => "I design brand identities from a small studio in F-7. I did my degree from NCA and I have been freelance for three years, which mostly means I have learned to invoice people properly.\n\nI am not hugely religious in the outward sense — I am honest about that — but I care about the deen and I am not a skeptic. I keep prayer and I try not to be awful about Ramadan, even though my clients never stop emailing.\n\nI am exploring rather than rushing, and I would rather be upfront about that than pretend otherwise.",
        'expectations' => "I want someone kind and easy to talk to, who does not try to change how I live. I have heard enough horror stories about creative people and controlling partners.\n\nI am not chasing a timeline. If it takes a year, it takes a year.",
        'aboutFamily' => "We are a middle-class family in Islamabad. My father is an engineer and my mother is a homemaker. I have one younger brother in engineering at NUST. Please go through my family — I mean that respectfully, and my wali will want to be involved early.",
    ],
    [
        'email' => 'hiba.aslam@example.com',
        'displayName' => 'Hiba Aslam',
        'initials' => 'HA',
        'age' => 28, 'gender' => 'female',
        'city' => 'New York', 'country' => 'USA',
        'sect' => 'Ithna Ashari (Twelver)',
        'profession' => 'Financial Analyst',
        'religiosity' => 'practicing',
        'educationLevel' => "Bachelor's degree",
        'marja' => 'Ayatollah al-Hakim',
        'prayer' => 'Mostly daily',
        'modesty' => 'Hijab — always observed',
        'diet' => 'Halal only',
        'languages' => 'English, Urdu, Arabic',
        'ethnicity' => 'South Asian',
        'incomeRange' => '$100k–$150k',
        'maritalStatus' => 'Never married',
        'children' => 'No children',
        'childrenPlans' => 'Want children, insha\'Allah',
        'relocation' => 'same-country',
        'familyInvolvement' => 'couple-first',
        'heightCm' => 167,
        'timeline' => '6m',
        'syedStatus' => 'syed-paternal',
        'photosVisibility' => 'private',
        'isVerified' => false,
        'bio' => "I work in corporate finance in Manhattan, which is a very polite way of saying I read spreadsheets all day.\n\nI grew up in Queens in a very loud household, which is where I get my mouth. I converted at nineteen and took my practice seriously from the start, so I am not looking for someone to teach me anything.\n\nI want a marriage where we are equal partners first and everything else follows from that.",
        'expectations' => "I am looking for someone financially stable and emotionally mature. I have watched enough people get married for the wrong reasons.\n\nI would like us to get to know each other first, and bring families in once we both actually want this.",
        'aboutFamily' => "We are originally from Hyderabad, India, and have been in New York for twenty years. My father is a retired accountant, my mother is a teacher, and I have one older brother. Family is close but they are not suffocating, which I appreciate.",
    ],
    [
        'email' => 'ruqayyah.sheikh@example.com',
        'displayName' => 'Ruqayyah Sheikh',
        'initials' => 'RS',
        'age' => 30, 'gender' => 'female',
        'city' => 'Melbourne', 'country' => 'Australia',
        'sect' => 'Ithna Ashari (Twelver)',
        'profession' => 'Veterinarian',
        'religiosity' => 'very-practicing',
        'educationLevel' => 'Islamic seminary (Hawza)',
        'marja' => 'Ayatollah al-Sadr (via wakeel)',
        'prayer' => 'All 5 daily prayers',
        'modesty' => 'Hijab — always observed',
        'diet' => 'Halal only',
        'languages' => 'English, Arabic, Farsi / Persian',
        'ethnicity' => 'Persian / Iranian',
        'incomeRange' => '$60k–$100k',
        'maritalStatus' => 'Never married',
        'children' => 'No children',
        'childrenPlans' => 'Want children, insha\'Allah',
        'relocation' => 'discuss',
        'familyInvolvement' => 'from-start',
        'heightCm' => 164,
        'timeline' => '6m',
        'syedStatus' => 'sadat-both',
        'photosVisibility' => 'public',
        'isVerified' => true,
        'bio' => "I am a veterinarian at a small animal clinic in Melbourne, which means I have strong opinions about your golden retriever's teeth.\n\nI spent four years in Najaf studying at the hawza before I did my veterinary degree in Melbourne. I did them in that order because I was not prepared to choose, and I am glad I did not.\n\nI am told I am intense about small things. I am told this by people who are not intense about small things.",
        'expectations' => "I want a partner of faith who will understand that my religion is not a hobby and my career is not a phase.\n\nI am open to moving if it makes sense, though Melbourne has a community I would be sorry to leave. I want families involved from the start.",
        'aboutFamily' => "My family is Iranian and we have been in Australia since I was a child. My father is an engineer, my mother is a homemaker, and I have two brothers, both married. We are a loud, warm family and you will be fed constantly.",
    ],
];

// Gradient pairs from the brand palette in public/brand-preview.html:
// --sage #33604F · --sage-deep #1B3D31 · --gold #B98334
$AVATAR_GRADIENTS = [
    ['#33604F', '#1B3D31'],
    ['#B98334', '#8A5A20'],
    ['#8C5A3B', '#5C3A26'],
    ['#3E5C76', '#22384A'],
    ['#6B4E71', '#3E2C42'],
    ['#4A7C59', '#27452F'],
    ['#A0522D', '#6B3418'],
    ['#2F6F6B', '#1B4140'],
    ['#7A5C3A', '#4A3623'],
    ['#5B6B3A', '#33421F'],
];

// ═══════════════════════════════════════════════════════════════════════════
//  PURGE — remove QA/test accounts left by past E2E runs
// ═══════════════════════════════════════════════════════════════════════════
// READ THIS BEFORE RUNNING --purge
// ---------------------------
// Two of the predicates are deliberately broad:
//   • email LIKE '%@example.com'  removes EVERY placeholder account, which
//     includes the demo profiles that --seed creates. That is intentional and
//     is what you want before real families use the site: no account with a
//     known public password may remain. Run `--all` to wipe and re-seed in one
//     pass, or run `--purge` alone to clear everything and seed later.
//   • the 'QA Test%' / 'qatest%' / 'Sec Test%' / 'Probe L1-%' prefixes sweep up
//     the ~50 empty shells that accumulated from E2E runs and which are
//     currently served to every signed-in member on /profiles.
//
// Child rows are deleted before parents in the same order as authDeleteAccount()
// at routes/auth.php:353, and messages are cleared for BOTH sender and
// receiver — the schema has no ON DELETE CASCADE, so a missed direction would
// leave orphaned rows that break a later DELETE.

function purgeJunk(PDO $pdo, string $photoBase, bool $dryRun): int
{
    // Match on EITHER the user or the profile side. Subqueries (rather than a
    // JOIN) keep this correct for accounts that have no profile row at all.
    $junkIds = [
        "SELECT id FROM users WHERE email LIKE 'probe.%@example.com'",
        "SELECT id FROM users WHERE email LIKE '%@example.com'",
        "SELECT user_id FROM profiles WHERE display_name LIKE 'TEST PROFILE%'",
        "SELECT user_id FROM profiles WHERE display_name LIKE 'Desi Test%'",
        "SELECT user_id FROM profiles WHERE display_name LIKE 'Life Test%'",
        "SELECT user_id FROM profiles WHERE display_name LIKE 'Data-%'",
        "SELECT user_id FROM profiles WHERE city LIKE 'TEST PROFILE%'",
        "SELECT user_id FROM profiles WHERE city LIKE 'DATA-% City'",
        "SELECT user_id FROM profiles WHERE profession LIKE 'probe-%'",
        // The accumulated E2E run left ~50 empty shells visible to real members
        // on /profiles ("QA Test 07", "qatest15", "QATest Alpha", "Sec Test 03",
        // "QA Tester 53", "Probe L1-1", "QA Verify C", ...). Matching on the
        // prefixes below clears them all in one pass.
        "SELECT user_id FROM profiles WHERE display_name LIKE 'QA Test%'",
        "SELECT user_id FROM profiles WHERE display_name LIKE 'QATest%'",
        "SELECT user_id FROM profiles WHERE display_name LIKE 'qatest%'",
        "SELECT user_id FROM profiles WHERE display_name LIKE 'QA Tester%'",
        "SELECT user_id FROM profiles WHERE display_name LIKE 'QA Verify%'",
        "SELECT user_id FROM profiles WHERE display_name LIKE 'Sec Test%'",
        "SELECT user_id FROM profiles WHERE display_name LIKE 'Probe L1-%'",
    ];

    $ids = [];
    foreach ($junkIds as $sql) {
        foreach ($pdo->query($sql)->fetchAll() as $row) {
            $ids[(string)reset($row)] = true;
        }
    }
    $ids = array_keys($ids);

    if (!$ids) {
        echo "Purge: no QA/test accounts found.\n";
        return 0;
    }

    $in = implode(',', array_fill(0, count($ids), '?'));
    $labels = $pdo->prepare("SELECT id, email FROM users WHERE id IN ($in)");
    $labels->execute($ids);
    echo "\nPurge candidates:\n";
    foreach ($labels->fetchAll() as $r) {
        printf("  - %s  (%s)\n", $r['email'], $r['id']);
    }

    if ($dryRun) {
        printf("[dry-run] would delete %d account(s). Re-run without --dry-run to apply.\n", count($ids));
        return count($ids);
    }

    $pdo->beginTransaction();
    try {
        foreach ([
            "DELETE FROM messages WHERE sender_id IN ($in) OR receiver_id IN ($in)",
            "DELETE FROM conversations WHERE user_a IN ($in) OR user_b IN ($in)",
            "DELETE FROM interests WHERE from_user_id IN ($in) OR to_user_id IN ($in)",
            "DELETE FROM blocks WHERE blocker_id IN ($in) OR blocked_id IN ($in)",
            "DELETE FROM reports WHERE reporter_id IN ($in)",
            "DELETE FROM wali_links WHERE user_id IN ($in)",
            "DELETE FROM verifications WHERE user_id IN ($in)",
            "DELETE FROM notifications WHERE user_id IN ($in)",
            "DELETE FROM sessions WHERE user_id IN ($in)",
            "DELETE FROM profiles WHERE user_id IN ($in)",
            "DELETE FROM users WHERE id IN ($in)",
        ] as $sql) {
            $pdo->prepare($sql)->execute($ids);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        exit("\nPURGE FAILED (rolled back): " . $e->getMessage() . "\n");
    }

    // Clear the upload dirs too, otherwise they leak on every purge.
    foreach ($ids as $id) {
        $dir = $photoBase . '/' . $id;
        if (is_dir($dir)) {
            foreach (glob($dir . '/*') ?: [] as $f) {
                @unlink($f);
            }
            @rmdir($dir);
        }
    }

    printf("Purge: deleted %d account(s) + their photo dirs.\n", count($ids));
    return count($ids);
}

// ═══════════════════════════════════════════════════════════════════════════
//  SEED
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Upsert one demo profile.
 *
 * Idempotent by email: re-running updates the existing row rather than failing
 * on uq_users_email, so this is safe to run after a partial failure.
 */
function seedOne(PDO $pdo, array $p, int $index, string $photoBase, bool $dryRun): string
{
    $email = strtolower((string)$p['email']);

    // Reuse the existing UUID when the account is already present, otherwise the
    // photo path we write below would not match profiles.user_id.
    $existing = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
    $existing->execute([$email]);
    $uid = $existing->fetch();
    $uid = $uid ? (string)$uid['id'] : uuid();

    $photoPath = null;
    if (($p['photosVisibility'] ?? '') !== 'private') {
        $photoPath = $photoBase . '/' . $uid . '/' . uuid() . '.png';
    }

    if ($dryRun) {
        printf("  [dry-run] %-22s %-26s photo=%s\n", $p['displayName'], $p['city'] . ', ' . $p['country'],
            $photoPath ? 'yes' : 'no');
        return $uid;
    }

    $hash = password_hash(DEMO_PASSWORD, PASSWORD_BCRYPT);

    // Write the avatar BEFORE committing the row, so a failed write cannot
    // leave a profile pointing at a photo that does not exist.
    if ($photoPath !== null) {
        $dir = dirname($photoPath);
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException("Could not create photo dir: {$dir}");
        }
        [$from, $to] = $AVATAR_GRADIENTS[$index % count($AVATAR_GRADIENTS)];
        $png = renderAvatar(glyphsFor((string)$p['initials']), $from, $to);
        if (@file_put_contents($photoPath, $png) === false) {
            throw new RuntimeException("Could not write avatar: {$photoPath}");
        }
    }

    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO users (id, email, password_hash, display_name, is_admin, role, email_verified)
             VALUES (?, ?, ?, ?, 0, \'member\', 1)
             ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash),
                                     display_name = VALUES(display_name),
                                     email_verified = 1'
        )->execute([$uid, $email, $hash, $p['displayName']]);

        // profiles.user_id is the PK, so INSERT ... ON DUPLICATE KEY UPDATE
        // gives us the same upsert semantics here.
        $pdo->prepare(
            'INSERT INTO profiles
               (user_id, display_name, age, gender, city, country, sect, profession,
                bio, expectations, about_family, visibility, photos_visibility,
                is_verified, religiosity, education_level, marja, prayer, modesty,
                diet, languages, ethnicity, income_range, marital_status, children,
                children_plans, relocation, family_involvement, height_cm, timeline,
                photo_url, syed_status, is_demo)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
                display_name = VALUES(display_name), age = VALUES(age), gender = VALUES(gender),
                city = VALUES(city), country = VALUES(country), sect = VALUES(sect),
                profession = VALUES(profession), bio = VALUES(bio),
                expectations = VALUES(expectations), about_family = VALUES(about_family),
                visibility = VALUES(visibility), photos_visibility = VALUES(photos_visibility),
                is_verified = VALUES(is_verified), religiosity = VALUES(religiosity),
                education_level = VALUES(education_level), marja = VALUES(marja),
                prayer = VALUES(prayer), modesty = VALUES(modesty), diet = VALUES(diet),
                languages = VALUES(languages), ethnicity = VALUES(ethnicity),
                income_range = VALUES(income_range), marital_status = VALUES(marital_status),
                children = VALUES(children), children_plans = VALUES(children_plans),
                relocation = VALUES(relocation), family_involvement = VALUES(family_involvement),
                height_cm = VALUES(height_cm), timeline = VALUES(timeline),
                photo_url = VALUES(photo_url), syed_status = VALUES(syed_status),
                is_demo = VALUES(is_demo),
                updated_at = UTC_TIMESTAMP()'
        )->execute([
            $uid, $p['displayName'], $p['age'], $p['gender'], $p['city'], $p['country'],
            $p['sect'], $p['profession'], $p['bio'], $p['expectations'], $p['aboutFamily'],
            // visibility must be 'public': anything else and anonymous visitors
            // cannot see the profile at all (db.php:131).
            'public', $p['photosVisibility'], $p['isVerified'] ? 1 : 0,
            $p['religiosity'], $p['educationLevel'], $p['marja'], $p['prayer'], $p['modesty'],
            $p['diet'], $p['languages'], $p['ethnicity'], $p['incomeRange'],
            $p['maritalStatus'], $p['children'], $p['childrenPlans'], $p['relocation'],
            $p['familyInvolvement'], $p['heightCm'], $p['timeline'],
            $photoPath, $p['syedStatus'],
            // Every row this script writes is illustrative sample content, and is
            // labelled as such in the UI. A well-written example profile is
            // genuinely useful for showing what "complete" looks like; presenting
            // one as a person a member could message is not. is_demo=1 makes the
            // badge appear and disables interest + favourites for it.
            1,
        ]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    return $uid;
}

// ═══════════════════════════════════════════════════════════════════════════
//  RUN
// ═══════════════════════════════════════════════════════════════════════════

echo "Shia Rishta production seeder\n";
echo "  photo base : {$photoBase}\n";
echo ($dryRun ? "  MODE       : DRY RUN (no writes)\n\n" : "  MODE       : LIVE\n\n");

if ($wantPurge) {
    purgeJunk($pdo, $photoBase, $dryRun);
    echo "\n";
}

if ($wantSeed) {
    $seeded = 0;
    foreach ($PROFILES as $i => $profile) {
        try {
            seedOne($pdo, $profile, $i, $photoBase, $dryRun);
            $seeded++;
        } catch (Throwable $e) {
            // One bad profile must not abort the remaining nine.
            printf("  FAILED %s: %s\n", $profile['displayName'], $e->getMessage());
        }
    }
    printf(
        "%sSeeded %d/%d profiles. Sign in with any %s and the password: %s\n",
        $dryRun ? "[dry-run] " : '', $seeded, count($PROFILES),
        'example.com address', DEMO_PASSWORD
    );
    echo "\nNOTE: all seeded accounts share one known password. Delete these\n";
    echo "accounts with --purge before opening the site to real families.\n";
}