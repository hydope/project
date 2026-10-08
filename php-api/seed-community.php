<?php
// One-time community seed — deletes the QA test post and adds fun starter content.
// Trigger: GET /api/seed-community.php?token=654360278b376bdad534cbbb8c4a8815
// The script deletes itself after a successful run.
declare(strict_types=1);

$TOKEN = '654360278b376bdad534cbbb8c4a8815';

if (($_GET['token'] ?? '') !== $TOKEN) {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden']);
    exit;
}

require __DIR__ . '/lib/db.php';

function uuid(): string {
    $d = random_bytes(16);
    $d[6] = chr(ord($d[6]) & 0x0f | 0x40);
    $d[8] = chr(ord($d[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4));
}

$pdo = db();
$log = [];

try {
    $pdo->beginTransaction();

    // 1. Delete the QA test post and its replies
    $qaId = 'e6782107-ed97-4343-9666-20d0a8647f39';
    $pdo->prepare('DELETE FROM replies WHERE post_id = ?')->execute([$qaId]);
    $pdo->prepare('DELETE FROM post_likes WHERE post_id = ?')->execute([$qaId]);
    $deleted = $pdo->prepare('DELETE FROM posts WHERE id = ?')->execute([$qaId]);
    $log[] = 'QA post deleted: ' . ($deleted ? 'yes' : 'not found');

    // 2. Seed fun posts with replies from different users
    $posts = [
        [
            'author' => 'Zara H.',
            'title' => 'What\'s your biggest green flag in a rishta conversation? 💚',
            'body' => "I'll go first: when he asks about my goals before asking about my cooking skills. 😄\n\nWhat makes you think \"okay, this person actually gets it\"?",
            'likes' => 24,
            'replies' => [
                ['Ahmed R.', "When she mentions her wali/guardian early on. Shows she's serious and family-oriented, not just window shopping.", 12],
                ['Fatima S.', "Someone who asks \"what does an ideal weekend look like for you?\" instead of jumping straight to the checklist. Conversations > interrogations!", 18],
                ['Bilal K.', "Green flag: they laugh at your bad jokes. If she laughed at mine, she's a keeper. 😂", 31],
                ['Zara H.', "Haha @Bilal K. — the bar is laughter, I love it. 😄", 8],
            ],
        ],
        [
            'author' => 'Imran D.',
            'title' => 'Settle this once and for all: Hyderabadi vs Lucknowi biryani 🍛',
            'body' => "Okay community, I need backup here. My cousin (Lucknowi) claims their biryani is superior. As a Hyderabadi, I find this deeply offensive. 😤\n\nDrop your vote and defend your city!",
            'likes' => 47,
            'replies' => [
                ['Sana M.', "Hyderabadi, no contest. The dum pukht, the mirchi ka salan... Lucknowi is great but Hyderabad is EMOTION. 🔥", 22],
                ['Danish L.', "Lucknowi here. Ours is subtle, aromatic, royal. Hyderabadi is just... spicy rice yelling at you. 😌👑", 19],
                ['Imran D.', "@Danish L. \"spicy rice yelling at you\" I'M CALLING MY AMMI", 28],
                ['Rabia T.', "Plot twist: I'm team Karachi biryani with aloo. Come at me. 🥔", 35],
                ['Sana M.', "@Rabia T. ALOO IN BIRYANI?? This is a Shia matrimony site, not a chaos forum. 😭", 41],
            ],
        ],
        [
            'author' => 'Maryam A.',
            'title' => 'One question you wish people asked BEFORE the first meeting?',
            'body' => "We all have that one thing we wish came up earlier instead of three meetings in.\n\nMine: \"How do you handle disagreements?\" — tells you everything about a person.\n\nWhat's yours?",
            'likes' => 33,
            'replies' => [
                ['Yusuf Q.', "\"What's your relationship with your parents like?\" — you learn so much from how someone talks about their family.", 21],
                ['Huda F.', "Mine is simple: \"Do you want kids, and when?\" Why is everyone scared to ask this on meeting one?!", 26],
                ['Maryam A.', "@Huda F. RIGHT?? Then six months later it's a surprise disagreement. Ask early, people!", 15],
                ['Ali N.', "\"What does deen look like in your daily life?\" — not \"are you religious\" (everyone says yes), but what it actually LOOKS like day to day.", 29],
            ],
        ],
        [
            'author' => 'Sadia K.',
            'title' => 'POV: your rishta call is in 10 minutes and you\'re stress-cleaning the whole house 😅',
            'body' => "Why do I clean like the Queen is visiting when it's just a video call?? My room has never been this clean. My mom walked in and asked if I was okay.\n\nTell me I'm not the only one. What's your pre-rishta-call ritual?",
            'likes' => 52,
            'replies' => [
                ['Nadia P.', "I rehearse my answers in the mirror like it's a job interview. \"So tell me about yourself\" — MIND GOES BLANK EVERY TIME.", 38],
                ['Hamza J.', "My ritual: 3 outfit changes, 2 cups of chai, 1 existential crisis. Then the call goes fine and I wonder why I panicked. 😂", 44],
                ['Sadia K.', "@Hamza J. The 3 outfit changes!! I tried on FIVE dupattas yesterday. FIVE.", 27],
                ['Farah W.', "Pro tip from someone married 3 years: they don't notice the clean house. They notice if you're relaxed. (I was not relaxed. 😅)", 33],
            ],
        ],
        [
            'author' => 'Kamran S.',
            'title' => 'Unpopular opinion: the "chai test" is actually genius ☕',
            'body' => "You know the one — when the potential rishta is asked to make/serve chai and the family judges everything from it.\n\nHear me out: it's not about the chai. It's about grace under pressure, hospitality, and how someone handles being watched. That's actually useful data! 😄\n\nAgree or is this a terrible take?",
            'likes' => 29,
            'replies' => [
                ['Ayesha B.', "Terrible take, sorry! 😂 It's performative. I make great chai but I'd be shaking with 8 aunties staring at me. Judge me on conversation, not beverages.", 24],
                ['Kamran S.', "@Ayesha B. Okay fair — the 8 aunties staring is a flaw in the methodology. 😄 Maybe: chai test, but only ONE friendly observer?", 16],
                ['Omar F.', "Counter-proposal: the \"traffic test\". Drive somewhere together. You learn EVERYTHING about a person in traffic. Patience, temper, road rage...", 37],
                ['Ayesha B.', "@Omar F. The traffic test!! 😂 \"He honked at an old man, rishta cancelled.\"", 42],
            ],
        ],
    ];

    foreach ($posts as $p) {
        $postId = uuid();
        $pdo->prepare(
            'INSERT INTO posts (id, community_id, author_name, title, body, likes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $postId, 'general', $p['author'], $p['title'], $p['body'], $p['likes'],
            date('Y-m-d H:i:s', time() - random_int(3600, 86400 * 3)),
        ]);
        foreach ($p['replies'] as $r) {
            $pdo->prepare(
                'INSERT INTO replies (id, post_id, author_name, body, created_at) VALUES (?, ?, ?, ?, ?)'
            )->execute([
                uuid(), $postId, $r[0], $r[1],
                date('Y-m-d H:i:s', time() - random_int(600, 86400 * 2)),
            ]);
        }
        $log[] = 'Seeded: ' . $p['title'];
    }

    $pdo->commit();
    $log[] = 'Done. Self-deleting seed script.';
    $ok = true;
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $log[] = 'ERROR: ' . $e->getMessage();
    $ok = false;
}

header('Content-Type: application/json');
echo json_encode(['ok' => $ok, 'log' => $log]);

// Self-delete so the endpoint can't be re-triggered.
if ($ok) { @unlink(__FILE__); }
