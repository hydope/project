<?php
/**
 * Daily Community Seeder for ShiaRishta
 *
 * Creates 2 community posts + 2-4 replies each, every day, across the
 * community rooms. Runs via GitHub Actions cron through
 * seed-daily-community-cron.php (SEEDER_CRON_KEY protected).
 *
 * Content pools below cover 25 days of posts without repetition; a
 * community_seed_log table tracks used items so nothing repeats until
 * the pool cycles. Replies are generic-but-warm and fit most threads.
 */

// ── Configuration ──────────────────────────────────────────────
require_once __DIR__ . '/lib/db.php';

$AUTHORS = [
  'Fatima Z.', 'Ali R.', 'Zainab K.', 'Hassan M.', 'Maryam S.', 'Abbas J.',
  'Sakina R.', 'Ruqaya T.', 'Mehdi H.', 'Kulsum A.', 'Jafar S.', 'Tahira B.',
  'Sajjad H.', 'Nargis K.', 'Yusuf K.', 'Rabab S.', 'Kamran M.', 'Shazia A.',
  'Imran R.', 'Hina S.', 'Danish A.', 'Farah K.', 'Anonymous',
];

// [community_id, title, body, author] — 50 posts, 25 days at 2/day
$COMMUNITY_POSTS = [
  ['parents', 'When did you start the rishta conversation with your daughter?', 'Our daughter just turned 24 and we are unsure whether to bring it up directly or wait for her to signal readiness. How did your family handle the first conversation?', 'Anonymous'],
  ['hyderabad', 'Best time of year for rishta meetings in Hyderabad?', 'With Muharram and Ramadan around the corner, families pause everything. When do serious rishta conversations actually happen here — after Ramadan?', 'Fatima Z.'],
  ['london', 'How do UK families verify a rishta from Pakistan?', 'We have a proposal from Lahore and everything looks good on paper. What practical steps did you take to verify — beyond the usual phone calls?', 'Ali R.'],
  ['dallas', 'Dallas Shia community events for singles?', 'Are there any halal, family-friendly events in DFW where young professionals can meet in a supervised setting? Not matchmaking pressure — just community.', 'Zainab K.'],
  ['reverts', 'Explaining Shia Islam to my Sunni family', 'Reverted two years ago. My family is Sunni and loving but confused about the differences. How did you explain it with love and without debates at the dinner table?', 'Yusuf K.'],
  ['newlywed', 'First Ramadan as a married couple — tips?', 'We married in December and this is our first Ramadan together. How did you split taraweeh, iftars with both families, and sleep schedules?', 'Maryam S.'],
  ['parents', 'Mehr: how much is reasonable in 2026?', 'We want something meaningful but not extravagant. What are families actually agreeing on these days, and how did you have the conversation without awkwardness?', 'Hassan M.'],
  ['dubai', 'Nikah in Dubai courts — recent experience?', 'Planning nikah in Dubai this year. For those who did it recently: which documents did the court actually ask for, and how long did attestation take?', 'Abbas J.'],
  ['toronto', 'Balancing two careers and a new marriage', 'Both of us work demanding jobs in Toronto. Newlyweds here — how do you protect couple time when both calendars are full?', 'Sakina R.'],
  ['all', 'Dua for finding a righteous spouse — which worked for you?', 'Beyond the well-known duas, are there specific amal or duas your family swears by? Sharing what brought barakah to your search.', 'Ruqaya T.'],
  ['parents', 'Should the wali meet the prospect before the families?', 'Our wali wants an initial conversation with the young man before involving both extended families. Is this common? How did it go for you?', 'Mehdi H.'],
  ['hyderabad', 'How to write a biodata that actually gets responses?', 'We have sent our daughter\'s biodata to five families and heard nothing. What makes a biodata stand out — photo, wording, length?', 'Kulsum A.'],
  ['london', 'Long-distance rishta: London to Karachi — worth it?', 'We live in London, the family is in Karachi. The match looks excellent on paper. Those who did the distance — what made it work or not?', 'Jafar S.'],
  ['dallas', 'Istikhara before saying yes — how to read the answer?', 'We did istikhara and feel... unclear. Scholars say the answer comes as ease or difficulty in the matter itself. How did you interpret yours?', 'Tahira B.'],
  ['reverts', 'Finding a Shia spouse as a revert sister', 'Sisters who reverted and then married — where did you meet your spouse, and how did you navigate family involvement when your own family isn\'t Muslim?', 'Anonymous'],
  ['newlywed', 'Merging two kitchens and two sets of expectations', 'Small thing, big arguments: whose family recipes, whose routines. How did you build YOUR household culture in year one?', 'Sajjad H.'],
  ['parents', 'Red flags in a prospect\'s family — what to watch?', 'Beyond the individual, the family dynamics matter. What patterns made you pause — controlling behaviour, money opacity, disrespect to elders?', 'Nargis K.'],
  ['dubai', 'Best masjid centres in Dubai for community networking?', 'New to Dubai and looking to plug into the Shia community properly. Which centres have active youth and family programs?', 'Rabab S.'],
  ['toronto', 'Winter weddings in Toronto — practical tips?', 'Planning a January nikah. Heating, daylight, guest travel in snow — what do we need to think about that summer couples don\'t?', 'Kamran M.'],
  ['all', 'What does "practicing" mean to you in a profile?', 'Every profile says "practicing" but it means different things to different families. What specific practices do you actually ask about?', 'Shazia A.'],
  ['parents', 'Talking to your son about lowering expectations', 'Our son\'s checklist is... extensive. How do you gently help young men distinguish between needs and wishlist items?', 'Imran R.'],
  ['hyderabad', 'Rukhsati customs in Hyderabad — what\'s essential?', 'Families here have so many customs around rukhsati. Which ones are religiously meaningful vs purely cultural? Trying to keep it simple.', 'Hina S.'],
  ['london', 'Shia-Sunni proposal in the family — navigating with adab', 'A Sunni proposal came for our Shia daughter. Both families are respectful. Those who navigated this — what conversations mattered most?', 'Danish A.'],
  ['dallas', 'Saving for mehr and wedding on a resident\'s salary', 'Medical resident here. How did you budget for mehr, wedding, and setting up a home without starting married life in debt?', 'Farah K.'],
  ['reverts', 'Learning namaz properly as a new Shia', 'Brothers — what resources actually taught you the Shia method correctly? Videos, books, a patient teacher? Still stumbling on the details.', 'Anonymous'],
  ['newlywed', 'In-laws visiting for a month — survival guide', 'Love them, but a month under one roof is testing us. Boundaries, routines, and keeping the peace — what worked for you?', 'Fatima Z.'],
  ['parents', 'When the rishta search takes years — keeping hope', 'Three years searching for our daughter. She is losing heart and so are we. How did long-search families keep faith and morale?', 'Ali R.'],
  ['dubai', 'Halal investment options for young couples in UAE?', 'Beyond the usual savings accounts — what sharia-compliant options have UAE couples actually used? Sukuk, gold, funds?', 'Zainab K.'],
  ['toronto', 'Raising kids Shia in a non-Muslim majority school', 'Our kids are the only Shia (only Muslim) kids in class. How do you build identity and confidence without making them feel othered?', 'Hassan M.'],
  ['all', 'The first meeting: who should be there?', 'Our family does first meetings with both families present. Others do smaller. What format led to the most honest, comfortable first conversation?', 'Maryam S.'],
  ['parents', 'Biodata photo: yes or no?', 'Some families insist on seeing a photo upfront; others find it inappropriate before serious interest. What is the adab here, and what worked for you?', 'Abbas J.'],
  ['hyderabad', 'Marja differences between families — dealbreaker?', 'We follow Sistani, they follow Khamenei. Elders are making it an issue. Is this a real compatibility concern or family politics?', 'Sakina R.'],
  ['london', 'Muharram majalis as a place to meet families?', 'Is it appropriate to notice/network for rishta purposes during majalis season? Where is the line between community and opportunism?', 'Ruqaya T.'],
  ['dallas', 'Explaining our timeline to desi aunties', 'We want a two-year engagement to finish training. The aunties are horrified. How do you hold a boundary kindly?', 'Mehdi H.'],
  ['reverts', 'Ramadan as a revert — what I wish I knew', 'First Ramadan after reverting was overwhelming in the best way. What advice would you give someone approaching their first?', 'Kulsum A.'],
  ['newlywed', 'Keeping romance alive with a newborn', 'Six months in with our first baby and we are ships passing at 3am. Couples who survived this phase — what actually helped?', 'Jafar S.'],
  ['parents', 'Second marriage for a widowed parent — our support', 'Our father, widowed two years, is considering remarriage. We want to support him well. How did your family handle this with grace?', 'Tahira B.'],
  ['dubai', 'Finding halal entertainment for family nights in Dubai?', 'Beyond malls — what do Shia families here actually do together on weekends? Looking for real recommendations.', 'Sajjad H.'],
  ['toronto', 'Dealing with rishta rejection gracefully', 'We have been on the rejecting side and it feels awful. What is the kindest, clearest way to decline a proposal?', 'Nargis K.'],
  ['all', 'Questions to ask in the first phone call?', 'Before families meet, there is usually a call. What are the 5 questions that actually reveal compatibility?', 'Yusuf K.'],
  ['parents', 'Should daughters work after marriage? Discussing upfront', 'We believe this must be agreed before nikah, not after. How did you raise it without it becoming a confrontation?', 'Rabab S.'],
  ['hyderabad', 'Simple nikah vs big wedding — Hyderabad edition', 'The pressure for a grand wedding is immense here. Families who chose simple — any regrets? Any pushback stories?', 'Kamran M.'],
  ['london', 'Teaching kids Urdu/Arabic in the UK', 'Our kids understand but won\'t speak. What actually worked — weekend school, home rules, media?', 'Shazia A.'],
  ['dallas', 'Mental health and the rishta search', 'The search is straining my mental health and nobody talks about it. How do you protect your peace during years of searching?', 'Imran R.'],
  ['reverts', 'My first Ashura — what to expect?', 'Reverted last year, missed Muharram. Attending my first majalis this year. What should I know beforehand to be respectful and prepared?', 'Hina S.'],
  ['newlywed', 'Joint vs separate finances — what did you choose?', 'We can\'t agree. One account, separate accounts, hybrid? What system actually reduced money fights?', 'Danish A.'],
  ['parents', 'Verifying employment and education claims', 'A proposal claims a senior role at a known firm. How do you verify discreetly without offending?', 'Farah K.'],
  ['dubai', 'Best time to visit families in Pakistan for rishta talks?', 'Planning a trip specifically for rishta meetings. Which months do families actually have time and energy?', 'Anonymous'],
  ['toronto', 'Snow-day childcare swaps between Shia families?', 'Any informal networks where families cover for each other during school closures? Trying to build our village.', 'Fatima Z.'],
  ['all', 'What made you say YES? (Share your story)', 'For the married members: what was the moment or quality that made you certain? Give the searchers some hope.', 'Ali R.'],
];

// ── Generic warm replies (fit most threads) ──
$REPLIES = [
  'JazakAllah for sharing this — really needed to read something like this today.',
  'This is such an important question. Following for the wisdom in the replies.',
  'We went through exactly this last year. Happy to share what worked for us if helpful.',
  'BarakAllahu feeki for raising this. The adab in the replies here is beautiful.',
  'Saving this thread. The practical advice here is better than most articles.',
  'May Allah bless your search and grant you what is best, even if it is not what you expect.',
  'This deserves more attention. Bumping so more families see it.',
  'Honest question and honest replies — this is what community is for.',
  'We made the opposite choice and it worked out too. There is rarely one right answer.',
  'Please involve your wali early in this. It protects everyone, especially the sisters.',
  'The part about family involvement really resonates. That is where barakah comes from.',
  'As someone on the other side of this now, I promise it gets clearer with time.',
  'Dua for you. And remember: istikhara is about facilitation, not dreams.',
  'This is why I love this community — real questions, no judgment.',
  'We asked our alim the same thing. His answer surprised us — worth asking yours too.',
  'Practical tip from our experience: write down your non-negotiables before emotions get involved.',
  'May Allah put khair in your efforts. The search itself is an act of worship with the right niyyah.',
  'Following. We are in the same boat and the solidarity here helps more than you know.',
  'Beautifully put. Sharing this with my family WhatsApp group.',
  'The cultural vs religious distinction in the replies is so important. Know the difference.',
  'We learned this the hard way — document everything agreed before nikah, kindly but clearly.',
  'This thread is gold. New members should read this before posting their first question.',
  'Patience and prayer. What is written for you will not miss you.',
  'As a parent, I appreciate young people asking these questions openly.',
  'The respect in this discussion is exactly what our community needs more of.',
  'We did this differently in our family and both approaches can work — context matters.',
  'Dua accepted in advance — may your family find ease in this matter.',
  'This is the conversation every family needs but few have openly. Thank you.',
  'Pro tip: keep notes after every meeting. Details blur after the third family.',
  'Allahumma barik. May He bless your home with sakinah.',
  'The financial honesty in these replies is refreshing. More of this please.',
  'We involved both grandmothers and it changed the whole dynamic — for the better.',
  'Remember that the other family is probably just as nervous as you are.',
  'This is such a balanced take. Extremes in either direction cause the problems.',
  'If it helps anyone: we set a 6-month review point and it removed so much pressure.',
  'The dua suggestions here are wonderful. Adding them to my nightly routine.',
  'As a revert, threads like this make me feel less alone. Thank you all.',
  'Clear communication early prevents 90% of the problems described here.',
  'We asked three different scholars and got three nuanced answers — scholarship is not monolithic.',
  'May Allah reward everyone sharing their experience here. This is sadaqah.',
  'Bumping this — every new member should see this discussion.',
  'The kindness in this thread is the best dawah for our community.',
  'We kept it simple and have zero regrets. The marriage is the point, not the event.',
  'Document, document, document — especially mehr and conditions. Kindly, but in writing.',
  'This question comes up every few months and the answers keep getting better.',
  'Sending duas your way. The right match is worth the wait, truly.',
  'Our alim said something I will never forget: marry the deen, the rest follows.',
  'Practical and heartfelt — exactly the mix these discussions need.',
  'We navigated this as a family and came out closer. Hard conversations are worth it.',
  'For anyone anxious reading this: most families figure it out. You will too.',
  'The generational perspective here is valuable — elders, please keep sharing.',
  'This is why verification matters. Trust, but verify — with adab.',
  'Beautiful question. May Allah guide you to what is khair.',
  'We tried the WhatsApp group route and it was chaos. Structured platforms exist for a reason.',
  'The emphasis on wali involvement here is spot on. It is protection, not control.',
  'Reading this as a young person — thank you to the parents sharing so honestly.',
  'Duas for your family. And remember to make dua for others too — it comes back.',
  'This thread answered questions I did not know I had.',
  'The balance between deen and dunya in these replies is exactly right.',
  'We set expectations in writing before the engagement and it saved us twice.',
  'May Allah bless every sincere seeker here with a righteous spouse.',
  'Honest, practical, kind — the three things every rishta discussion needs.',
  'Following for my sister who is searching. This community is a gift.',
  'The scholars-differ point cannot be overstated. Get a ruling from YOUR marja.',
  'We learned to ask about conflict style early. Everything else follows from that.',
  'BarakAllahu feek — this is the kind of post that makes community real.',
  'Patience, prayer, and practical steps. All three, not just one.',
  'This helped me reframe the whole search. JazakAllah khair.',
  'As someone married 10 years: the small kindnesses matter more than the big gestures.',
  'The financial transparency advice here is worth its weight in gold.',
  'We involved a neutral elder as mediator and it changed everything.',
  'Dua, effort, tawakkul — in that order, repeated daily.',
  'This is the most useful thread I have read here in weeks.',
  'May Allah make your path easy and your match righteous.',
  'The cultural pressure described here is real. Hold your boundaries with love.',
  'We chose character over checklist and never looked back.',
  'Beautiful adab in this discussion. This is our community at its best.',
  'For the reverts reading: you belong here fully. Never doubt that.',
  'The practical steps here are actionable today, not someday.',
  'We prayed istikhara and the path opened in ways we could not have planned.',
  'This deserves to be pinned. Mods, please consider it.',
  'The honesty about money is so needed. Debt poisons marriages.',
  'We kept families involved from day one and it made everything easier.',
  'Duas for all the searchers here — may this be the year.',
  'The distinction between needs and wants saved our search. Write both lists.',
  'As a mother, I wept reading some of these replies. Thank you.',
  'This community gives me hope for the next generation, wallahi.',
  'Practical tip: meet in person as early as halal-ly possible. Video hides things.',
  'The marja question comes up constantly — when in doubt, ask your alim directly.',
  'We found that shared values beat shared backgrounds every time.',
  'May Allah bless this platform and everyone building it.',
  'The patience in these replies is a lesson in itself.',
  'We said no to three good proposals before saying yes. Trust the process.',
  'This thread is why I check this community every morning.',
  'Beautifully said. The niyyah behind the search matters enormously.',
  'For anyone new: lurk for a week, then introduce yourself. You will be welcomed.',
];

// ── Seeder logic ───────────────────────────────────────────────
function communityUuid(): string
{
    return sprintf(
        '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

try {
    require_once __DIR__ . '/lib/db.php';
} catch (Throwable $e) {
    // lib/db.php already loaded by cron trigger in some setups
}

$db = db();

// Track used content so nothing repeats until the pool cycles
$db->exec("CREATE TABLE IF NOT EXISTS community_seed_log (
  content_key VARCHAR(64) NOT NULL PRIMARY KEY,
  used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

$used = [];
foreach ($db->query('SELECT content_key FROM community_seed_log')->fetchAll() as $r) {
    $used[$r['content_key']] = true;
}

// Pick 2 unused posts (reset the log if the pool is exhausted)
$available = [];
foreach ($COMMUNITY_POSTS as $i => $p) {
    $key = 'post-' . md5($p[1]);
    if (!isset($used[$key])) $available[] = [$i, $key];
}
if (count($available) < 2) {
    $db->exec('DELETE FROM community_seed_log');
    $used = [];
    $available = [];
    foreach ($COMMUNITY_POSTS as $i => $p) {
        $available[] = [$i, 'post-' . md5($p[1])];
    }
}
shuffle($available);
$chosen = array_slice($available, 0, 2);

$insPost = $db->prepare('INSERT INTO posts (id, community_id, author_id, author_name, title, body, likes) VALUES (?, ?, NULL, ?, ?, ?, ?)');
$insRoom = $db->prepare("INSERT IGNORE INTO communities (id, name) VALUES (?, ?)");
// 'all' is a client-side pseudo-room (every room's feed), never a DB row.
$ROOM_NAMES = ['hyderabad' => 'Hyderabad', 'dubai' => 'Dubai', 'dallas' => 'Dallas', 'london' => 'London', 'toronto' => 'Toronto', 'reverts' => 'Reverts', 'parents' => 'Parents', 'newlywed' => 'Newlywed', 'general' => 'General'];
$insReply = $db->prepare('INSERT INTO replies (id, post_id, author_id, author_name, body) VALUES (?, ?, NULL, ?, ?)');
$insLog = $db->prepare('INSERT IGNORE INTO community_seed_log (content_key) VALUES (?)');

$postsMade = 0;
$repliesMade = 0;

foreach ($chosen as [$i, $key]) {
    [$community, $title, $body, $author] = $COMMUNITY_POSTS[$i];
    // Never orphan a post in a room that doesn't exist (the /community/dallas
    // 404: rooms only resolve from the DB `communities` table in remote mode).
    if ($community !== 'all' && isset($ROOM_NAMES[$community])) {
        $insRoom->execute([$community, $ROOM_NAMES[$community]]);
    }
    $postId = communityUuid();
    $likes = mt_rand(3, 28);
    $insPost->execute([$postId, $community, $author, $title, $body, $likes]);
    $insLog->execute([$key]);
    $postsMade++;

    // 2-4 replies per post, varied authors (never the post author twice in a row)
    $n = mt_rand(2, 4);
    $replyPool = $REPLIES;
    shuffle($replyPool);
    $lastAuthor = $author;
    for ($k = 0; $k < $n; $k++) {
        $rAuthor = $AUTHORS[array_rand($AUTHORS)];
        if ($rAuthor === $lastAuthor) $rAuthor = 'Anonymous';
        $lastAuthor = $rAuthor;
        $insReply->execute([communityUuid(), $postId, $rAuthor, $replyPool[$k]]);
        $repliesMade++;
    }
}

echo "OK: seeded $postsMade posts, $repliesMade replies\n";
