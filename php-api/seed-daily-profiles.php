<?php
/**
 * Daily Profile Seeder for ShiaRishta
 *
 * Creates 12 new member profiles every day (8 female, 4 male) with
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

$CITIES = [
  ['Baltimore', 'USA'], ['Chicago', 'USA'], ['Houston', 'USA'], ['New York', 'USA'],
  ['Dallas', 'USA'], ['Los Angeles', 'USA'], ['Atlanta', 'USA'], ['Seattle', 'USA'],
  ['Dearborn', 'USA'], ['Washington DC', 'USA'], ['Silver Spring', 'USA'], ['London', 'UK'],
  ['Toronto', 'Canada'], ['Dubai', 'UAE'], ['Karachi', 'Pakistan'], ['Lahore', 'Pakistan'],
];

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

// ── Main ───────────────────────────────────────────────────────
try {
  $db = db();
  $date = date('Y-m-d');
  $created = 0;

  // Check how many seeded profiles already exist today (avoid duplicates)
  $stmt = $db->prepare("SELECT COUNT(*) FROM users WHERE email LIKE ?");
  $stmt->execute(["seeded-{$date}-%@shiarishta.com"]);
  $existing = $stmt->fetchColumn();

  if ($existing >= 12) {
    echo "Already created 12 profiles today. Skipping.\n";
    exit(0);
  }

  $toCreate = 12 - $existing;
  echo "Creating {$toCreate} profiles for {$date}...\n";

  for ($i = $existing; $i < 12; $i++) {
    $isFemale = $i < 8; // First 8 are female, last 4 are male
    $gender = $isFemale ? 'female' : 'male';

    if ($isFemale) {
      $firstName = pick($FEMALE_NAMES);
      $lastName = pick($FEMALE_SURNAMES);
      $profession = pick($PROFESSIONS_FEMALE);
      $bio = pick($BIOS_FEMALE);
      $seeking = 'male';
    } else {
      $firstName = pick($MALE_NAMES);
      $lastName = pick($MALE_SURNAMES);
      $profession = pick($PROFESSIONS_MALE);
      $bio = pick($BIOS_MALE);
      $seeking = 'female';
    }

    $displayName = "{$firstName} {$lastName}";
    $email = "seeded-{$date}-{$i}@shiarishta.com";
    $userId = uuid();
    $city = pick($CITIES);
    $age = rand(22, 35);

    // Create user
    $passwordHash = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);
    $stmt = $db->prepare("
      INSERT INTO users (id, email, password_hash, display_name, email_verified, verification_status, created_at)
      VALUES (?, ?, ?, ?, 0, 'unverified', NOW())
    ");
    $stmt->execute([$userId, $email, $passwordHash, $displayName]);

    // Create profile
    $stmt = $db->prepare("
      INSERT INTO profiles (
        user_id, display_name, age, gender, city, country, sect,
        profession, bio, visibility, photos_visibility,
        seeking_gender, religiosity, education_level, marja,
        marital_status, is_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'members', 'members', ?, ?, ?, ?, 'Never married', 0)
    ");
    $stmt->execute([
      $userId, $displayName, $age, $gender, $city[0], $city[1], 'Ithna Ashari (Twelver)',
      $profession, $bio, $seeking, pick($RELIGIOSITY),
      pick(['Bachelor\'s', 'Master\'s', 'Doctorate']), pick($MARJAS),
    ]);

    $created++;
    echo "  Created: {$displayName} ({$gender}, {$age}, {$city[0]})\n";
  }

  echo "\nDone. Created {$created} profiles.\n";

} catch (Exception $e) {
  echo "ERROR: " . $e->getMessage() . "\n";
  exit(1);
}
