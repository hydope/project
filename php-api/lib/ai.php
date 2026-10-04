<?php
// AI layer: NVIDIA NIM client + grounding retrieval.
//
// ── Why this is server-side and must stay that way ─────────────────────────
// The NVIDIA key lives in php-api/.env (gitignored) and is read with getenv().
// It must never reach the browser: the client calls /api/ai/* and this file is
// the only thing that ever sees the credential. No error path returns an
// upstream body verbatim, because a debug payload can echo the Authorization
// header back.
//
// ── Why the old assistant was generic ──────────────────────────────────────
// It was a 9-entry regex lookup in the browser: anything that did not match a
// rule returned one canned fallback, so "can my wali see my messages?" got the
// generic privacy blob. The fix is retrieval — score platform facts against the
// question and ground the model on the winners. With no API key the retrieved
// facts are returned directly, so the assistant is never generic.

declare(strict_types=1);

/**
 * Platform knowledge base: specific factual answers plus the terms a member
 * would really use. Deliberately granular — coarse buckets are exactly what
 * produced generic replies before.
 */
function aiPlatformFacts(): array
{
    return [
        [
            'w' => ['verification', 'verified', 'badge', 'gold badge', 'id check', 'identity', 'verify'],
            'x' => "Identity verification is free for every member — it is never sold as an upgrade. Submit a selfie or ID "
                . "document from Settings → Verification. A moderator reviews each submission by hand, usually within 24 hours.\n\n"
                . "Verification is separate from account review. An admin reviews your account for genuine profile details "
                . "(clear photos, real bio, stated intentions) — that is a different badge from the document check. You can be "
                . "account-reviewed without submitting documents, and vice versa.\n\n"
                . "A verified member gets a badge and appears first in mutual-interest matches.",
        ],
        [
            'w' => ['wali', 'guardian', 'family access', 'supervision', 'chaperone', 'male family member'],
            'x' => "A wali (male family member) can be given read-only access to your profile and your messages — never your "
                . "password or email. Issue one from Settings → Wali and you get a private link to share.\n\n"
                . "You can revoke a wali link at any time; revocation takes effect immediately and permanently. Admins can "
                . "see who issued a link and whether it is still active, but can never see the link token itself.",
        ],
        [
            'w' => ['privacy', 'private', 'hidden', 'hide', 'incognito', 'who can see', 'visible', 'photos', 'screenshot', 'blur'],
            'x' => "You control three separate visibility settings:\n\n"
                . "• Profile — public, visible only after you express interest, or only after you match.\n"
                . "• Photos — public, hidden until interest, or private until matched.\n"
                . "• Chats — readable only by you and the person you are talking to.\n\n"
                . "Incognito mode hides your profile from search entirely without unlisting you.\n\n"
                . "Messages and uploaded documents are encrypted at rest (AES-256-GCM). A database leak cannot yield readable "
                . "message bodies or verification files.",
        ],
        [
            'w' => ['price', 'pricing', 'cost', 'free', 'premium', 'subscription', 'paid', 'plan', 'how much', 'money'],
            'x' => "Shia Rishta is free, and the core of it stays that way: creating a profile, browsing, expressing interest "
                . "and messaging are all free with no paywall. Identity verification is included for every member. Privacy is "
                . "not a premium feature — it is the default.\n\nThere is no paid tier today.",
        ],
        [
            'w' => ['report', 'block', 'safety', 'abuse', 'harassment', 'scam', 'concern', 'red flag', 'flag', 'unsafe'],
            'x' => "Use the ⚠ flag on any profile or message. Reports go straight to the moderation queue and are reviewed by a "
                . "human, usually within 24 hours.\n\nBlocking hides a member from you immediately and is reversible from "
                . "Settings.\n\nNever send money, bank details, crypto, or government ID over chat. Red flags worth reporting: "
                . "rushing you off-platform, asking for money, refusing a chaperoned call, or pressuring you to skip "
                . "verification.\n\nEmail support@shiarishta.com.",
        ],
        [
            'w' => ['onboarding', 'onboard', 'get started', 'sign up', 'register', 'first steps', 'setup', 'new account'],
            'x' => "Getting set up takes about five minutes:\n\n1. Create your account and confirm your email.\n"
                . "2. State your intentions, religious practice, and what you are looking for.\n"
                . "3. Add clear, appropriate photos.\n4. Complete verification when you are ready.\n"
                . "5. Browse with filters for sect, religiosity, education, location, and verified-only.\n\n"
                . "You can pause at any point — nothing is locked in and nothing is forced.",
        ],
        [
            'w' => ['first message', 'first chat', 'what do i say', 'how to start', 'opener', 'conversation', 'icebreaker', 'rizz', 'impress', 'flirt'],
            'x' => "Open with something specific and low-pressure. The strongest first messages reference a real detail from "
                . "their profile rather than a generic greeting.\n\nExamples:\n"
                . "• \"Assalamu alaikum — what drew you to this city?\"\n"
                . "• \"Your take on family involvement stood out to me. How does yours work in practice?\"\n"
                . "• \"I noticed you list hiking. What is the best trail near you?\"\n\n"
                . "Ask one open question, mirror their tone, and move to a chaperoned call once trust is built. "
                . "Dignity first: no love-bombing, no rushing.",
        ],
        [
            'w' => ['community', 'forum', 'post', 'comment', 'anonymous', 'group', 'space', 'subreddit'],
            'x' => "Community spaces are organised by city and by topic — city groups, plus groups for reverts, parents, and "
                . "people seeking marriage guidance.\n\nPosting is anonymous: your name is hidden, the post is visible. Guests "
                . "can read everything; register or log in to post or comment. Admins remove anything abusive or off-topic.",
        ],
        [
            'w' => ['match', 'matching', 'search', 'find', 'compatible', 'compatibility', 'more matches', 'visibility', 'ranking', 'algorithm'],
            'x' => "Completeness drives ranking, not payment. A finished profile with clear intentions, photos and a real bio "
                . "surfaces above an empty one.\n\nMatching weighs faith practice, lifestyle, timeline, location and sect. Use "
                . "the filters on /profiles — verified-only and religiosity most improve result quality.\n\n"
                . "A thoughtful profile always outperforms a generic one.",
        ],
        [
            'w' => ['profile', 'edit profile', 'bio', 'photos', 'photo upload', 'update profile'],
            'x' => "Edit anything from Settings → Profile: bio, age, city, sect, profession, education, religiosity, marital "
                . "status, timeline, and what you are looking for.\n\nThe fields that most affect matching quality are "
                . "intentions, religiosity, timeline, and photos. A bio that says what you actually want is worth more than a "
                . "long one.\n\nChoose a public username so people can address you without publishing your full name or email.",
        ],
        [
            'w' => ['username', 'handle', 'public name', 'display name'],
            'x' => "A username is a public handle you choose, separate from your display name and email. It lets people address "
                . "you without either being public. Set it in Settings → Profile.\n\n3–32 characters: letters, numbers, dots, "
                . "dashes or underscores, starting with a letter or number. Usernames are unique and case-insensitive.",
        ],
        [
            'w' => ['email', 'verify email', 'confirmation', 'not verified', 'change email'],
            'x' => "Email confirmation unlocks messaging. Browsing and viewing public profiles does not require it, so you can "
                . "look around before confirming.\n\nIf you change your email it must be confirmed again before messaging "
                . "reopens.\n\nResend the confirmation from Settings → Account if it has expired.",
        ],
        [
            'w' => ['account', 'delete account', 'deactivate', 'close account', 'cancel'],
            'x' => "You can close your account from Settings → Account. Closing hides your profile and revokes any active wali "
                . "links immediately.\n\nAn admin unblock restores a profile hidden by moderation — that is a different thing, "
                . "and it never deletes your data.",
        ],
        [
            'w' => ['introduction', 'draft', 'proposal', 'family meeting', 'matchmaker', 'ask for hand'],
            'x' => "Only verified matchmakers and guardians can open an introduction. A matchmaker proposes to women; a guardian "
                . "can propose on behalf of a male family member.\n\nAn introduction is a private draft with a one-time claim "
                . "link. It never becomes a public profile until the family member claims it. Members cannot self-promote to "
                . "either role — an admin grants it.",
        ],
        [
            'w' => ['how are you', 'who are you', 'what can you do', 'hello', 'hi', 'salam', 'assalam'],
            'x' => "I am the Shia Rishta assistant. I can explain how verification, privacy, wali access, safety reporting, "
                . "matching and introductions work, and help you write a respectful first message.\n\nI answer from this "
                . "platform's own guidance and published articles rather than guessing — if something is not covered here, I "
                . "will say so and point you to support@shiarishta.com.",
        ],
    ];
}

/**
 * Score facts against the question by term overlap, best first.
 *
 * Cheap and deterministic: no embeddings to host, nothing to keep in sync, and
 * it cannot silently drift away from the knowledge base.
 */
function aiRetrieveFacts(string $question, int $limit = 3): array
{
    $q = mb_strtolower($question);
    $qWords = array_values(array_filter(
        preg_split('/[^\p{L}\p{N}]+/u', $q) ?: [],
        fn($w) => mb_strlen($w) > 2
    ));

    $scored = [];
    foreach (aiPlatformFacts() as $fact) {
        $score = 0;
        foreach ($fact['w'] as $term) {
            $term = mb_strtolower($term);
            // A whole-phrase hit is worth far more than a shared token.
            if (str_contains($q, $term)) { $score += 10; continue; }
            foreach (explode(' ', $term) as $word) {
                if (mb_strlen($word) > 3 && in_array($word, $qWords, true)) { $score += 3; }
            }
        }
        if ($score > 0) $scored[] = ['score' => $score, 'text' => $fact['x']];
    }

    usort($scored, fn($a, $b) => $b['score'] <=> $a['score']);
    return array_slice($scored, 0, $limit);
}

/** Titles of published posts, so the assistant knows what the site has put out. */
function aiPublishedTopics(int $limit = 12): array
{
    try {
        $rows = db()->query(
            "SELECT title, excerpt FROM blog_posts
              WHERE status = 'published' ORDER BY published_at DESC LIMIT {$limit}"
        )->fetchAll();
    } catch (Throwable) {
        return []; // table not migrated yet
    }
    $out = [];
    foreach ($rows as $r) {
        $out[] = trim((string)$r['title'] . ' — ' . (string)$r['excerpt']);
    }
    return $out;
}

/**
 * Call NVIDIA NIM. Returns the model text, or null on any failure.
 *
 * Never throws and never returns the key or a raw upstream body: an upstream
 * debug payload can echo the Authorization header back. Only the status is
 * logged.
 */
function aiComplete(array $messages, array $opts = []): ?string
{
    $key = trim((string)getenv('NVIDIA_API_KEY'));
    if ($key === '') {
        error_log('[ai] NVIDIA_API_KEY is not set');
        return null;
    }

    $base = rtrim((string)(getenv('NVIDIA_BASE_URL') ?: 'https://integrate.api.nvidia.com/v1'), '/');
    $payload = json_encode([
        'model' => (string)(getenv('NVIDIA_MODEL') ?: 'meta/llama-3.3-70b-instruct'),
        'messages' => $messages,
        'temperature' => (float)($opts['temperature'] ?? 0.4),
        'top_p' => (float)($opts['top_p'] ?? 0.9),
        'max_tokens' => (int)($opts['max_tokens'] ?? 600),
    ], JSON_UNESCAPED_UNICODE);

    $ch = curl_init($base . '/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $key,
            'Content-Type: application/json',
            'Accept: application/json',
        ],
        CURLOPT_POSTFIELDS => $payload,
    ]);

    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($body === false || $err !== '' || $status < 200 || $status >= 300) {
        error_log('[ai] NVIDIA call failed: status=' . $status
            . ($err !== '' ? ' err=' . substr($err, 0, 80) : ''));
        return null;
    }

    $decoded = json_decode((string)$body, true);
    $text = $decoded['choices'][0]['message']['content'] ?? null;
    return is_string($text) && trim($text) !== '' ? trim($text) : null;
}

/**
 * Answer a member question.
 *
 * Grounding is not optional. The model is told to answer ONLY from the supplied
 * facts and to admit a gap rather than invent policy — on a marriage platform
 * an invented answer about safety or privacy is far worse than "I don't cover
 * that, email support". When the model is unavailable the retrieved facts are
 * returned directly, so the assistant still answers specifically.
 */
function aiAnswerQuestion(string $question, array $history = [], array $context = []): array
{
    $facts = aiRetrieveFacts($question, 3);
    $topics = aiPublishedTopics();

    $grounding = '';
    foreach ($facts as $f) {
        $grounding .= "\n---\n" . $f['text'];
    }
    if ($topics) {
        $grounding .= "\n\nRecently published on the site: " . implode(' | ', $topics);
    }
    if ($grounding === '') {
        $grounding = '(no matching platform guidance was retrieved)';
    }

    $ctx = [];
    if (!empty($context['signedIn'])) $ctx[] = 'signed in';
    if (!empty($context['verified'])) $ctx[] = 'verified';
    // implode() takes the array as the SECOND argument here. Calling it with
    // only the separator throws a TypeError, which surfaced as a 500 for every
    // signed-in member — and only for them, because $ctx is empty for guests.
    $ctxLine = $ctx ? 'User context: ' . implode(', ', $ctx) . '.' : '';

    $messages = [[
        'role' => 'system',
        'content' => "You are the assistant for Shia Rishta, a Shia Muslim marriage platform.\n\n"
            . "Answer ONLY from the platform facts below. They are the source of truth. Do not invent policy, "
            . "pricing, features or timelines that are not stated there.\n\n"
            . "If the facts do not cover the question, say plainly that it is not covered and point to "
            . "support@shiarishta.com rather than guessing.\n\n"
            . "Be warm, concise and respectful. Use short paragraphs; markdown bullets are fine. Never use emoji "
            . "excessively and never be flippant about faith, family or safety.\n\n"
            . $ctxLine . "\n\nPLATFORM FACTS:" . $grounding,
    ]];

    // Keep only the last few turns so the prompt stays bounded.
    foreach (array_slice($history, -6) as $turn) {
        if (is_array($turn) && isset($turn['role'], $turn['content'])) {
            $messages[] = [
                'role' => $turn['role'] === 'user' ? 'user' : 'assistant',
                'content' => (string)$turn['content'],
            ];
        }
    }
    $messages[] = ['role' => 'user', 'content' => $question];

    $answer = aiComplete($messages);
    if ($answer !== null) {
        return ['answer' => $answer, 'grounded' => true, 'source' => 'model'];
    }

    // Degraded but still specific.
    $fallback = $facts
        ? implode("\n\n", array_column($facts, 'text'))
        : "I don't have guidance covering that yet. Email support@shiarishta.com and a human will answer.";
    return ['answer' => $fallback, 'grounded' => false, 'source' => 'facts'];
}