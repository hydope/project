<?php
/**
 * Daily Profile Seeder for ShiaRishta
 *
 * Creates 5 new member profiles every day (4 female, 1 male) with
 * realistic Shia names, cities, and complete profile data.
 *
 * Run via: php seed-daily-profiles.php
 * Or via GitHub Actions cron (see .github/workflows/daily-profiles.yml)
 *
 * Each profile gets:
 * - Unique email (seeded-{date}-{n}@shiarishta.com)
 * - Realistic Shia name
 * - US/international city
 * - Complete bio, profession, education, religious details
 * - Published and visible in directory
 */

// ── Configuration ──────────────────────────────────────────────
require_once __DIR__ . '/lib/db.php';

$FEMALE_NAMES = [
  'Zahra', 'Fatima', 'Zainab', 'Sakina', 'Ruqaya', 'Kulsum', 'Masooma', 'Tahira',
  'Abida', 'Batol', 'Hajira', 'Kaneez', 'Mahjabeen', 'Najma', 'Qurat', 'Rabab',
  'Sadia', 'Shabana', 'Tazeen', 'Uzma', 'Wajiha', 'Yasmin', 'Zehra', 'Aabida',
  'Farah', 'Hina', 'Iram', 'Javeria', 'Khadija', 'Lubna', 'Mariam', 'Nida',
  'Sana', 'Shazia', 'Tania', 'Umme', 'Zara', 'Anisa', 'Bushra', 'Dua',
];

$FEMALE_SURNAMES = [
  'Fatima', 'Zahra', 'Kazmi', 'Rizvi', 'Naqvi', 'Zaidi', 'Abidi', 'Jafri',
  'Hussaini', 'Hasnain', 'Abbas', 'Mehdi', 'Ali', 'Hassan', 'Askari', 'Taqvi',
];

$MALE_NAMES = [
  'Ali', 'Hassan', 'Hussain', 'Abbas', 'Jafar', 'Kazim', 'Raza', 'Taqi',
  'Mahdi', 'Hadi', 'Askari', 'Baquer', 'Sadiq', 'Musa', 'Ibrahim', 'Ismail',
  'Hasnain', 'Murtaza', 'Sajjad', 'Danish', 'Faisal', 'Imran', 'Kamran', 'Nadeem',
  'Owais', 'Salman', 'Taha', 'Usman', 'Waqar', 'Yasser', 'Zaid', 'Arsalan',
];

$MALE_SURNAMES = [
  'Ali', 'Hassan', 'Hussain', 'Abbas', 'Rizvi', 'Naqvi', 'Zaidi', 'Kazmi',
  'Jafri', 'Abidi', 'Mehdi', 'Hasnain', 'Askari', 'Taqvi', 'Mirza', 'Baig',
];

$CITIES_INDO_PAK = [
  ['Karachi', 'Pakistan'], ['Lahore', 'Pakistan'], ['Islamabad', 'Pakistan'],
  ['Hyderabad', 'India'], ['Mumbai', 'India'], ['Delhi', 'India'],
  ['Lucknow', 'India'], ['Bangalore', 'India'], ['Chennai', 'India'],
];
$CITIES_ABROAD = [
  ['Baltimore', 'USA'], ['Chicago', 'USA'], ['Houston', 'USA'], ['New York', 'USA'],
  ['Dallas', 'USA'], ['Los Angeles', 'USA'], ['Atlanta', 'USA'], ['Seattle', 'USA'],
  ['Dearborn', 'USA'], ['Washington DC', 'USA'], ['Silver Spring', 'USA'], ['London', 'UK'],
  ['Toronto', 'Canada'], ['Dubai', 'UAE'], ['Abu Dhabi', 'UAE'], ['Doha', 'Qatar'],
  ['Sydney', 'Australia'],
];
// 60% India/Pakistan, 40% abroad/Gulf — per Syed's rule (2026-10-10).

$PROFESSIONS_FEMALE = [
  'Doctor', 'Teacher', 'Software Engineer', 'Nurse', 'Pharmacist', 'Accountant',
  'Marketing Manager', 'Data Analyst', 'Architect', 'Dentist', 'HR Manager', 'Writer',
];

$PROFESSIONS_MALE = [
  'Software Engineer', 'Doctor', 'Engineer', 'Business Owner', 'Accountant',
  'IT Consultant', 'Pharmacist', 'Architect', 'Data Scientist', 'Teacher',
];

$BIOS_FEMALE = [
  'Practicing Shia Muslim looking for a deen-focused partner. I value family, honesty, and a peaceful home. Seeking someone serious about nikah.',
  'Education-focused and family-oriented. I enjoy reading, cooking, and spending time with family. Looking for a kind and respectful husband.',
  'Professional woman balancing deen and dunya. I pray regularly and value Islamic principles in daily life. Seeking a compatible match for nikah.',
  'Simple, caring, and devoted to family. I believe in building a home filled with love and Islamic values. Looking for a serious rishta.',
];

$BIOS_MALE = [
  'Practicing Shia Muslim, financially stable, and ready for nikah. I value honesty, family, and building a strong Islamic household.',
  'Professional with strong family values. I pray five times daily and follow my marja. Seeking a pious and caring wife.',
  'God-fearing man looking for a life partner. I believe in mutual respect, clear communication, and growing together in deen.',
  'Established career, simple lifestyle, serious about marriage. Looking for a compatible Shia woman who values family and faith.',
];

$MARJAS = ['Sistani', 'Khamenei', 'Shirazi', 'Hakim', 'Not following yet'];
$RELIGIOSITY = ['very-practicing', 'practicing', 'practicing', 'moderately-practicing'];

// Photo pool — AI-generated portraits committed in uploads/seeded/
$FEMALE_PHOTOS = ['female-01.webp', 'female-02.webp', 'female-03.webp', 'female-04.webp', 'female-05.webp', 'female-06.webp', 'female-07.webp', 'female-08.webp', 'female-09.webp', 'female-10.webp', 'female-11.webp', 'female-12.webp'];
$MALE_PHOTOS = ['male-01.webp', 'male-02.webp', 'male-03.webp', 'male-04.webp', 'male-05.webp', 'male-06.webp', 'male-07.webp', 'male-08.webp'];

// ── Helper Functions ───────────────────────────────────────────
function uuid() {
  return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
    mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
    mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
    mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));
}

function pick($arr) {
  return $arr[array_rand($arr)];
}

// Pick an item from $arr whose lowercase form is not in $excludeSet
// (an array flipped for lookup). Falls back to a random pick if every
// item is excluded, so the seeder stays robust on tiny pools.
function pickNotIn($arr, $excludeSet) {
  $pool = array_values(array_filter($arr, function ($v) use ($excludeSet) {
    return !isset($excludeSet[strtolower($v)]);
  }));
  if (count($pool) === 0) return pick($arr);
  return $pool[array_rand($pool)];
}

// ── Main ───────────────────────────────────────────────────────
$seederExitCode = 0;
try {
  $db = db();
  $date = date('Y-m-d');
  $created = 0;

  // Check how many seeded profiles already exist today (avoid duplicates)
  $stmt = $db->prepare("SELECT COUNT(*) FROM users WHERE email LIKE ?");
  $stmt->execute(["seeded-{$date}-%@shiarishta.com"]);
  $existing = $stmt->fetchColumn();

  $targetTotal = defined('SEEDER_CUSTOM_COUNT') ? SEEDER_CUSTOM_COUNT : 5;
  $targetFemale = defined('SEEDER_FEMALE_COUNT') ? SEEDER_FEMALE_COUNT : 4;

  if ($existing >= $targetTotal) {
    echo "Already created {$targetTotal} profiles today. Skipping.\n";
  } else {

  $toCreate = $targetTotal - $existing;
  echo "Creating {$toCreate} profiles for {$date}...\n";

  // Name dedup: never reuse a full name that was seeded before, and never
  // repeat a first name inside one batch (3x 'Shabana' in one day looks fake).
  $usedFullNames = [];
  $stmt = $db->prepare("SELECT display_name FROM users WHERE email LIKE 'seeded-%@shiarishta.com'");
  $stmt->execute();
  foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $n) {
    $usedFullNames[strtolower(trim($n))] = true;
  }
  $batchFirstNames = [];
  $batchCities = [];

  // 60% India/Pakistan, 40% abroad/Gulf — unique city per profile in a batch.
  $indoPakCount = (int)round($toCreate * 0.6);

  for ($i = $existing; $i < $targetTotal; $i++) {
    $isFemale = $i < $targetFemale; // First N are female, rest are male
    $gender = $isFemale ? 'female' : 'male';

    if ($isFemale) {
      $names = $FEMALE_NAMES;
      $surnames = $FEMALE_SURNAMES;
      $profession = pick($PROFESSIONS_FEMALE);
      $bio = pick($BIOS_FEMALE);
      $seeking = 'male';
    } else {
      $names = $MALE_NAMES;
      $surnames = $MALE_SURNAMES;
      $profession = pick($PROFESSIONS_MALE);
      $bio = pick($BIOS_MALE);
      $seeking = 'female';
    }

    // Up to 50 tries: unique first name within this batch AND unique
    // full name across all previously seeded profiles.
    $firstName = pickNotIn($names, $batchFirstNames);
    $lastName = pick($surnames);
    for ($t = 0; $t < 50; $t++) {
      if (isset($batchFirstNames[strtolower($firstName)])) {
        $firstName = pickNotIn($names, $batchFirstNames);
        $lastName = pick($surnames);
        continue;
      }
      if (isset($usedFullNames[strtolower("{$firstName} {$lastName}")])) {
        $lastName = pickNotIn($surnames, []);
        continue;
      }
      break;
    }
    $batchFirstNames[strtolower($firstName)] = true;
    $usedFullNames[strtolower("{$firstName} {$lastName}")] = true;

    $displayName = "{$firstName} {$lastName}";
    $email = "seeded-{$date}-{$i}@shiarishta.com";
    $userId = uuid();
    // 60/40 split: first $indoPakCount profiles of the batch get India/Pakistan
    // cities, the rest get abroad/Gulf. Unique city per batch — no repeats.
    $pool = ($i - $existing) < $indoPakCount ? $CITIES_INDO_PAK : $CITIES_ABROAD;
    $city = null;
    for ($t = 0; $t < 50; $t++) {
      $c = pick($pool);
      if (!isset($batchCities[$c[0]])) { $city = $c; break; }
    }
    if ($city === null) $city = pick($pool); // pool exhausted, allow repeat
    $batchCities[$city[0]] = true;
    $age = rand(22, 35);

    // Create user
    $passwordHash = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);
    $stmt = $db->prepare("
      INSERT INTO users (id, email, password_hash, display_name, email_verified, verification_status, created_at)
      VALUES (?, ?, ?, ?, 0, 'unverified', NOW())
    ");
    $stmt->execute([$userId, $email, $passwordHash, $displayName]);

    // Pick a photo from the pool
    $photoFile = $isFemale ? pick($FEMALE_PHOTOS) : pick($MALE_PHOTOS);
    $srcPhoto = __DIR__ . '/uploads/seeded/' . $photoFile;
    $photoUrl = null;

    // Copy to a per-user location under the uploads dir so photo_url
    // resolves within the allowed photo base directory
    if (file_exists($srcPhoto)) {
      $destDir = __DIR__ . '/uploads/photos/' . $userId;
      if (!is_dir($destDir)) {
        @mkdir($destDir, 0755, true);
      }
      $destPhoto = $destDir . '/profile.webp';
      if (@copy($srcPhoto, $destPhoto)) {
        $photoUrl = $destPhoto;
      }
    }

    // Create profile
    $stmt = $db->prepare("
      INSERT INTO profiles (
        user_id, display_name, age, gender, city, country, sect,
        profession, bio, visibility, photos_visibility,
        seeking_gender, religiosity, education_level, marja,
        marital_status, is_verified, photo_url, is_seeded
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'members', 'public', ?, ?, ?, ?, 'Never married', 0, ?, 1)
    ");
    $stmt->execute([
      $userId, $displayName, $age, $gender, $city[0], $city[1], 'Ithna Ashari (Twelver)',
      $profession, $bio, $seeking, pick($RELIGIOSITY),
      pick(['Bachelor\'s', 'Master\'s', 'Doctorate']), pick($MARJAS), $photoUrl,
    ]);

    $created++;
    echo "  Created: {$displayName} ({$gender}, {$age}, {$city[0]})\n";
  }

  echo "\nDone. Created {$created} profiles.\n";
  } // end else

  $seederExitCode = 0;

} catch (Exception $e) {
  echo "ERROR: " . $e->getMessage() . "\n";
  $seederExitCode = 1;
}

// CLI entry point — exit with the return code when run directly
if (php_sapi_name() === 'cli' && !defined('SEEDER_INCLUDED')) {
  exit($seederExitCode);
}
