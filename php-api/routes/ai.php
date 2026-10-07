<?php
// AI + content routes.
//
// The NVIDIA credential is read from the environment only. Nothing in this file
// returns it, and the browser never sees it: the client posts a question here and
// receives an answer.

declare(strict_types=1);

function routeAI(string $method, array $segments): void
{
    $action = $segments[0] ?? '';

    if ($method === 'GET' && $action === 'status') {
        // Reports whether the assistant can call a model. Deliberately a boolean
        // — never the key, never the upstream response.
        //
        // Reads through aiApiKey() so it reflects a key pasted into
        // /admin/content, not just the environment variable. Before this it
        // reported `available: false` forever whenever the GitHub secret was
        // missing, which made the panel look permanently broken even after an
        // operator had configured a working key.
        // Reports the model so the admin panel can show which one is active.
    // Never assign the credential to a local that could reach a response body.
    // Two separate calls, so no variable holding the key exists in this scope:
    // the boolean is derived from a function call and the fingerprint is
    // computed inside aiKeyFingerprint(), which returns only the digest.
    json([
        'available' => aiApiKey() !== '',
        'model' => aiModel(),
        // A non-reversible fingerprint of the key currently in use.
        //
        // Why: after rotating a compromised credential there is no way to tell
        // whether the new key actually took effect, because nothing exposed
        // WHICH key is live. The only previous signal was "a key exists". An
        // operator rotating a burned key had to trust the deploy worked.
        //
        // SHA-256 of the key, first 12 hex chars. This reveals nothing useful:
        // NVIDIA keys are high-entropy random strings, so the digest cannot be
        // brute-forced or reversed, and it is not a secret that can be replayed.
        // It is a receipt, not a credential.
        //
        // Before rotating, note the current fingerprint. After rotating, it MUST
        // change — if it does not, the old key is still serving traffic.
        'keyFingerprint' => aiKeyFingerprint(),
        'keySource' => aiApiKey() !== '' ? aiApiKeySource() : null,
    ]);
    }

    if ($method === 'POST' && $action === 'chat') {
        requireAdminOrGuest();
        aiChat();
        return;
    }

    if ($method === 'POST' && $action === 'generate-post') {
        requireAdminUser();
        aiGeneratePost();
        return;
    }

    // GET /api/ai/blog-topics — curated + AI topic suggestions for the blog
    // queue. Interactive: the admin picks a suggestion and it becomes a draft.
    if ($method === 'GET' && $action === 'blog-topics') {
        requireAdminUser();
        aiBlogTopics();
        return;
    }

    // GET /api/ai/posts/:slug — a public, single published post.
    if ($method === 'GET' && $action === 'posts' && count($segments) === 2) {
        aiGetPost((string)$segments[1]);
        return;
    }

    if ($segments === [] || $action === 'posts') {
        // NOTE: more specific /posts/* routes must be checked BEFORE this
        // general block, otherwise they are swallowed by aiCreatePost().
        if ($method === 'POST' && ($segments[1] ?? null) === 'auto-schedule') {
            requireAdminUser();
            aiAutoSchedule();
            return;
        }
        if ($method === 'GET' && count($segments) <= 1) { aiListPosts(); return; }
        if ($method === 'POST' && count($segments) <= 1) { requireAdminUser(); aiCreatePost(); return; }
    }

    if ($action === 'posts' && count($segments) >= 2) {
        requireAdminUser();
        $id = (string)$segments[1];
        if ($method === 'PUT' || $method === 'PATCH') { aiUpdatePost($id); return; }
        if ($method === 'DELETE') { aiDeletePost($id); return; }
    }

    json(['error' => 'AI endpoint not found'], 404);
}

/** Chat is open to signed-out visitors but the auth gate is still rate limited. */
function requireAdminOrGuest(): void
{
    rateCheck('ai:chat', cip(), 20, 900, 'Too many assistant questions. Try again in a few minutes.');
}

/**
 * POST /api/ai/chat { question, history[], context{} }
 */
function aiChat(): void
{
    $body = requestJson();
    $question = sanitizeText($body['question'] ?? '', 500);
    if ($question === '') {
        je('Ask a question.', 400);
    }

    // Guardrails run before the model so a blocked request never leaves the
    // server. This is the same list the old client-side guard used.
    $blocked = '/\b(nude|naked|porn|sexual|sex|hookup|onlyfans|erotic|escort|sext|fuck|'
        . 'nigga|nigger|faggot|tranny|camgirl|chaturbite|money for sex|kill myself|suicide|'
        . 'self[- ]harm|underage|minor|deepfake|send (me )?(a )?nude)\b/i';
    if (preg_match($blocked, $question)) {
        json([
            'answer' => "That request is outside what I can help with. Shia Rishta is a nikah-first platform, so I "
                . "will not assist with anything explicit, sexual, deceptive, financial or harmful.\n\n"
                . "Use the ⚠ flag on a profile or message, or email support@shiarishta.com — reports are reviewed "
                . "by a human, usually within 24 hours.",
            'source' => 'guardrail',
        ]);
        return;
    }

    $history = is_array($body['history'] ?? null) ? $body['history'] : [];
    $context = is_array($body['context'] ?? null) ? $body['context'] : [];

    // Personalise when we can: a signed-in member asking "what should I do next"
    // should not get the anonymous answer.
    try {
        $user = currentUser();
        if ($user) {
            $context['signedIn'] = true;
            $context['verified'] = !empty($user['emailVerified']);
        }
    } catch (Throwable) {
        // Anonymous: context stays as the client sent it.
    }

    $result = aiAnswerQuestion($question, $history, $context);
    json($result);
}

// ── Admin content: AI-drafted blog posts with scheduling ─────────────────────

/** GET /api/ai/blog-topics — topic suggestions for the blog queue. */
function aiBlogTopics(): void
{
    // Curated evergreen topics that rank for real search queries in this niche.
    $curated = [
        ['topic' => 'How to write an Islamic marriage biodata that gets responses', 'angle' => 'Practical checklist with examples', 'category' => 'Guidance'],
        ['topic' => 'Shia marriage: questions to ask before saying yes', 'angle' => 'Faith, family and lifestyle questions', 'category' => 'Guidance'],
        ['topic' => 'How to involve your wali in online matchmaking', 'angle' => 'Balancing tradition and modern platforms', 'category' => 'Guidance'],
        ['topic' => 'Red flags in online rishta conversations', 'angle' => 'Safety-first guide with examples', 'category' => 'Safety'],
        ['topic' => 'How to verify someone you met on a matrimony site', 'angle' => 'Step-by-step verification checklist', 'category' => 'Safety'],
        ['topic' => 'Keeping photos private while searching for a spouse', 'angle' => 'Privacy features explained', 'category' => 'Safety'],
        ['topic' => 'Syed marriages: what families actually look for', 'angle' => 'Cultural expectations, respectfully covered', 'category' => 'Community'],
        ['topic' => 'Long-distance rishta: making it work across continents', 'angle' => 'USA, UK, Gulf and India perspectives', 'category' => 'Community'],
        ['topic' => 'What to put in your matrimony profile bio', 'angle' => 'Before/after examples', 'category' => 'Profiles'],
        ['topic' => 'First message examples that get replies', 'angle' => 'Respectful openers, not pickup lines', 'category' => 'Profiles'],
        ['topic' => 'Marja and marriage: why scholars matter in spouse search', 'angle' => 'Explainer for younger members', 'category' => 'Guidance'],
        ['topic' => 'Duas for finding a righteous spouse', 'angle' => 'With Arabic, transliteration and meaning', 'category' => 'Community'],
    ];
    // Exclude topics already covered.
    $existing = [];
    try {
        foreach (db()->query('SELECT title FROM blog_posts ORDER BY created_at DESC LIMIT 40')->fetchAll() as $r) {
            $existing[] = strtolower((string)$r['title']);
        }
    } catch (Throwable) { /* ignore */ }
    $fresh = array_values(array_filter($curated, function ($t) use ($existing) {
        foreach ($existing as $e) {
            if ($e !== '' && stripos($t['topic'], substr($e, 0, 20)) !== false) return false;
        }
        return true;
    }));

    // Ask the model for 4 fresh, trending angles to keep the queue surprising.
    $aiTopics = [];
    $raw = aiComplete(
        [['role' => 'system', 'content' => 'You suggest blog topics for Shia Rishta, a Shia Muslim marriage platform. Return STRICT JSON: an array of 4 objects with keys "topic" (under 70 chars, SEO-friendly, something people actually search), "angle" (under 80 chars), "category" (one of: Guidance, Safety, Community, Profiles). Topics must be fresh, specific and respectful. Return only the JSON array.']],
        ['temperature' => 0.9, 'max_tokens' => 400, 'timeout' => 30]
    );
    if (is_string($raw)) {
        $start = strpos($raw, '[');
        $end = strrpos($raw, ']');
        if ($start !== false && $end !== false && $end > $start) {
            $decoded = json_decode(substr($raw, $start, $end - $start + 1), true);
            if (is_array($decoded)) {
                foreach ($decoded as $t) {
                    if (is_array($t) && !empty($t['topic'])) {
                        $aiTopics[] = [
                            'topic' => sanitizeText((string)$t['topic'], 90),
                            'angle' => sanitizeText((string)($t['angle'] ?? ''), 100),
                            'category' => sanitizeText((string)($t['category'] ?? 'Guidance'), 20),
                            'ai' => true,
                        ];
                    }
                }
            }
        }
    }

    json(['ok' => true, 'topics' => array_merge($aiTopics, $fresh)]);
}

/** POST /api/ai/generate-post { topic, angle, audience } */
function aiGeneratePost(): void
{
    $body = requestJson();
    $topic = sanitizeText($body['topic'] ?? '', 160);
    if ($topic === '') {
        je('Give the post a topic.', 400);
    }
    $angle = sanitizeText($body['angle'] ?? '', 200);
    $audience = sanitizeText($body['audience'] ?? 'members seeking a serious marriage', 120);

    $existing = [];
    try {
        foreach (db()->query('SELECT title FROM blog_posts ORDER BY created_at DESC LIMIT 15')->fetchAll() as $r) {
            $existing[] = (string)$r['title'];
        }
    } catch (Throwable) {
        // First post on a fresh database.
    }

    $system = "You write for Shia Rishta, a Shia Muslim marriage platform that publishes long-form guidance "
        . "articles for people searching for a spouse.\n\n"
        . "Voice: warm, specific, respectful, never preachy. British-leaning international English. "
        . "Assume a Muslim reader who takes faith seriously; reference Islamic practice where natural but do "
        . "not lecture or quote scripture as authority.\n\n"
        . "Return STRICT JSON with keys: title, excerpt, category, readTime, body.\n"
        . "'excerpt' is one sentence under 160 characters. 'category' is one of: Guidance, Safety, Community, "
        . "Profiles. 'readTime' is like '5 min'. 'body' is an ARRAY of objects, each {\"t\": \"p\"|\"h2\", "
        . "\"x\": \"...\"} — never markdown fences.\n\n"
        . "Write a focused piece of roughly 500 words, 5-8 paragraphs with an h2 heading or two. "
        . "Do not invent statistics, user counts or claims about the site's features beyond what is stated.\n\n"
        . ($existing ? "Recently published (do not repeat these angles): " . implode(' | ', $existing) . "\n\n" : '')
        . "TOPIC: " . $topic . ($angle !== '' ? "\nANGLE: " . $angle : '')
        . "\nAUDIENCE: " . $audience . "\n\nReturn only the JSON object.";

    $raw = aiComplete(
        [['role' => 'system', 'content' => $system]],
        // Model, timeout and token budget are all tuned for SHARED HOSTING.
        //
        // The host terminates any request that outlives roughly 60s and returns
        // an HTML "Request Timeout" page, which the client cannot parse. Measured
        // on this stack with the real article prompt:
        //
        //   max_tokens=3000 -> 112s  (killed by the host)
        //   max_tokens=1200 ->  31s  (fits, with headroom)
        //
        // 1200 tokens yields a complete ~500 word article. The previous 8000
        // could never finish here regardless of model: the large MoE models in
        // this catalogue all take 80s+ for a 1000-word piece, and
        // `reasoning_effort` produced empty content outright.
        ['temperature' => 0.9, 'max_tokens' => 1200, 'timeout' => 45]
    );

    if ($raw === null) {
        je('The writing assistant is unavailable right now. Try again shortly.', 503);
    }

    $post = parseGeneratedPost($raw);
    if ($post === null) {
        je('The assistant returned something unreadable. Try rephrasing the topic.', 502);
    }

    json(['ok' => true, 'draft' => $post]);
}

/**
 * Pull a JSON object out of a model response and validate its shape.
 *
 * Returns null rather than half a post: a truncated body would publish an
 * article with missing paragraphs.
 */
function parseGeneratedPost(string $raw): ?array
{
    $start = strpos($raw, '{');
    $end = strrpos($raw, '}');
    if ($start === false || $end === false || $end <= $start) return null;

    $decoded = json_decode(substr($raw, $start, $end - $start + 1), true);

    // Truncated output is the common failure, not a rare one: a token ceiling
    // cut mid-object leaves valid-but-incomplete JSON, and json_decode returns
    // null for the whole thing. Discarding every complete "x" block salvages the
    // finished paragraphs instead of failing the entire draft.
    if (!is_array($decoded)) {
        $decoded = salvageTruncatedPost($raw);
        if ($decoded === null) return null;
    }

    $title = sanitizeText($decoded['title'] ?? '', 160);
    if ($title === '') return null;

    $body = [];
    foreach ((array)($decoded['body'] ?? []) as $block) {
        if (!is_array($block)) continue;
        $t = in_array(($block['t'] ?? ''), ['p', 'h2'], true) ? $block['t'] : 'p';
        $x = sanitizeText($block['x'] ?? '', 4000);
        if ($x !== '') $body[] = ['t' => $t, 'x' => $x];
    }
    if (count($body) < 3) return null;

    $allowedCategories = ['Guidance', 'Safety', 'Community', 'Profiles'];
    $category = in_array($decoded['category'] ?? '', $allowedCategories, true)
        ? $decoded['category']
        : 'Guidance';

    return [
        'title' => $title,
        'excerpt' => sanitizeText($decoded['excerpt'] ?? '', 300),
        'category' => $category,
        'readTime' => sanitizeText($decoded['readTime'] ?? '5 min', 16),
        'body' => $body,
    ];
}

/**
 * Recover what we can from a JSON response the token ceiling cut short.
 *
 * Regex-based and deliberately narrow: it only matches a body block whose
 * closing brace is actually present, so it can never invent content. Returns
 * null when there is not enough intact structure to be worth showing — a
 * partial article with no title is worse than a clear "try again".
 */
function salvageTruncatedPost(string $raw): ?array
{
    // A title that was emitted before the cut is enough to render something.
    if (!preg_match('/"title"\s*:\s*"((?:[^"\\\\]|\\\\.)*)"/', $raw, $tm)) {
        return null;
    }
    $title = json_decode('"' . $tm[1] . '"');
    if (!is_string($title) || trim($title) === '') return null;

    $body = [];
    // Only complete blocks: the lookahead requires a closing brace after "x".
    preg_match_all(
        '/\{\s*"t"\s*:\s*"(p|h2)"\s*,\s*"x"\s*:\s*"((?:[^"\\\\]|\\\\.)*)"\s*\}/',
        $raw,
        $bm,
        PREG_SET_ORDER
    );
    foreach ($bm as $m) {
        $x = json_decode('"' . $m[2] . '"');
        if (is_string($x) && trim($x) !== '') {
            $body[] = ['t' => $m[1], 'x' => sanitizeText($x, 4000)];
        }
    }
    // parseGeneratedPost() already requires 3 blocks; bail early if we have fewer.
    if (count($body) < 3) return null;

    $excerpt = '';
    if (preg_match('/"excerpt"\s*:\s*"((?:[^"\\\\]|\\\\.)*)"/', $raw, $em)) {
        $excerpt = json_decode('"' . $em[1] . '"');
        $excerpt = is_string($excerpt) ? $excerpt : '';
    }

    $readTime = '5 min';
    if (preg_match('/"readTime"\s*:\s*"((?:[^"\\\\]|\\\\.)*)"/', $raw, $rm)) {
        $rt = json_decode('"' . $rm[1] . '"');
        if (is_string($rt) && trim($rt) !== '') $readTime = $rt;
    }

    $category = 'Guidance';
    if (preg_match('/"category"\s*:\s*"((?:[^"\\\\]|\\\\.)*)"/', $raw, $cm)) {
        $cat = json_decode('"' . $cm[1] . '"');
        if (in_array($cat, ['Guidance', 'Safety', 'Community', 'Profiles'], true)) $category = $cat;
    }

    return [
        'title' => $title,
        'excerpt' => $excerpt,
        'category' => $category,
        'readTime' => $readTime,
        'body' => $body,
    ];
}

/** Slug that is stable, URL-safe and guaranteed unique. */
function aiSlugify(string $title): string
{
    $slug = strtolower(trim((string)preg_replace('/[^A-Za-z0-9]+/', '-', $title), '-'));
    $slug = trim(substr($slug, 0, 80), '-');
    if ($slug === '') $slug = 'post-' . substr(bin2hex(random_bytes(4)), 0, 8);

    $base = $slug;
    $n = 2;
    $check = db()->prepare('SELECT id FROM blog_posts WHERE slug = ? LIMIT 1');
    for ($i = 0; $i < 50; $i++) {
        $check->execute([$slug]);
        if (!$check->fetch()) return $slug;
        $slug = $base . '-' . $n++;
    }
    return $base . '-' . bin2hex(random_bytes(3));
}

/**
 * Validate a publish schedule.
 *
 * Returns null when the post should go live immediately. A past timestamp is
 * treated as "publish now" rather than rejected, because an admin setting a time
 * slightly in the past has meant "now", not "fail".
 */
function normaliseSchedule(?string $when): ?string
{
    $when = trim((string)$when);
    if ($when === '') return null;
    $ts = strtotime($when);
    if ($ts === false) {
        je('That publish date could not be read.', 400);
    }
    return gmdate('Y-m-d H:i:s', $ts);
}

/** GET /api/ai/posts — public: only published posts, newest first. */
function aiListPosts(): void
{
    $includeAll = !empty(currentUser()['isAdmin']);
    $sql = 'SELECT id, slug, title, excerpt, category, read_time, status, created_at,
                   scheduled_for, published_at
              FROM blog_posts';
    if (!$includeAll) {
        $sql .= " WHERE status = 'published' AND (scheduled_for IS NULL OR scheduled_for <= UTC_TIMESTAMP())";
    }
    $sql .= ' ORDER BY COALESCE(published_at, created_at) DESC LIMIT 100';

    try {
        $rows = db()->query($sql)->fetchAll();
    } catch (Throwable $e) {
        error_log('[ai] post list unavailable: ' . substr($e->getMessage(), 0, 120));
        json(['rows' => [], 'available' => false]);
    }

    // An admin sees drafts and future posts; a visitor sees only what is live.
    if (!$includeAll) {
        $rows = array_map(static fn($r) => array_intersect_key(
            $r,
            array_flip(['id', 'slug', 'title', 'excerpt', 'category', 'read_time', 'published_at'])
        ), $rows);
    }

    json(['rows' => $rows, 'available' => true]);
}

/** GET /api/ai/posts/:slug — a single published post with its body. */
function aiGetPost(string $slug): void
{
    $st = db()->prepare(
        "SELECT id, slug, title, excerpt, category, read_time, body, published_at
           FROM blog_posts
          WHERE slug = ? AND status = 'published'
            AND (scheduled_for IS NULL OR scheduled_for <= UTC_TIMESTAMP())
          LIMIT 1"
    );
    $st->execute([$slug]);
    $row = $st->fetch();
    if (!$row) {
        json(['error' => 'Post not found'], 404);
    }
    $decoded = json_decode((string)$row['body'], true);
    $row['body'] = is_array($decoded) ? $decoded : [];
    json(['post' => $row]);
}

/** POST /api/ai/posts — save an AI draft as a post. */
function aiCreatePost(): void
{
    $body = requestJson();
    $draft = is_array($body['draft'] ?? null) ? $body['draft'] : $body;

    $title = sanitizeText($draft['title'] ?? '', 160);
    if ($title === '') {
        je('The post needs a title.', 400);
    }
    $status = in_array($draft['status'] ?? '', ['draft', 'scheduled', 'published'], true)
        ? $draft['status']
        : 'draft';
    $schedule = normaliseSchedule($draft['scheduledFor'] ?? $draft['scheduled_for'] ?? null);

    $blocks = [];
    foreach ((array)($draft['body'] ?? []) as $b) {
        if (!is_array($b)) continue;
        $t = in_array($b['t'] ?? '', ['p', 'h2'], true) ? $b['t'] : 'p';
        $x = sanitizeText($b['x'] ?? '', 4000);
        if ($x !== '') $blocks[] = ['t' => $t, 'x' => $x];
    }
    if (!$blocks) {
        je('The post has no body.', 400);
    }

    $actor = currentUser();
    $id = uuid();
    $slug = aiSlugify($title);
    $category = sanitizeText($draft['category'] ?? 'Guidance', 40);
    $readTime = sanitizeText($draft['readTime'] ?? '5 min', 16);
    $excerpt = sanitizeText($draft['excerpt'] ?? '', 300);

    db()->prepare(
        'INSERT INTO blog_posts
            (id, slug, title, excerpt, category, read_time, body, status, scheduled_for,
             published_at, author_email, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())'
    )->execute([
        $id, $slug, $title, $excerpt, $category, $readTime,
        json_encode($blocks, JSON_UNESCAPED_UNICODE),
        $status,
        $status === 'scheduled' ? $schedule : null,
        $status === 'published' ? gmdate('Y-m-d H:i:s') : null,
        (string)($actor['email'] ?? ''),
    ]);

    auditLog('post.created', 'blog_post', $id, ['slug' => $slug, 'status' => $status]);
    json(['ok' => true, 'id' => $id, 'slug' => $slug, 'status' => $status]);
}

/**
 * PUT /api/ai/posts/:id — edit content, or change status / schedule.
 *
 * Publishing and scheduling are idempotent transitions rather than separate
 * endpoints, because "schedule it" and "publish it now" are the same intent
 * with a different timestamp, and two buttons for one thing is how an admin ends
 * up with a post stuck in draft.
 */
function aiUpdatePost(string $id): void
{
    $body = requestJson();

    $probe = db()->prepare('SELECT id, slug, status FROM blog_posts WHERE id = ? LIMIT 1');
    $probe->execute([$id]);
    $post = $probe->fetch();
    if (!$post) {
        je('Post not found.', 404);
    }

    $sets = [];
    $args = [];

    if (array_key_exists('title', $body)) {
        $title = sanitizeText($body['title'] ?? '', 160);
        if ($title === '') {
            je('The post needs a title.', 400);
        }
        $sets[] = 'title = ?';
        $args[] = $title;
    }
    foreach (['excerpt' => 300, 'category' => 40] as $col => $max) {
        if (array_key_exists($col, $body)) {
            $sets[] = "{$col} = ?";
            $args[] = sanitizeText($body[$col] ?? '', $max);
        }
    }
    if (array_key_exists('readTime', $body)) {
        $sets[] = 'read_time = ?';
        $args[] = sanitizeText($body['readTime'] ?? '', 16);
    }
    if (array_key_exists('body', $body)) {
        $blocks = [];
        foreach ((array)$body['body'] as $b) {
            if (!is_array($b)) continue;
            $t = in_array($b['t'] ?? '', ['p', 'h2'], true) ? $b['t'] : 'p';
            $x = sanitizeText($b['x'] ?? '', 4000);
            if ($x !== '') $blocks[] = ['t' => $t, 'x' => $x];
        }
        if (!$blocks) {
            je('The post has no body.', 400);
        }
        $sets[] = 'body = ?';
        $args[] = json_encode($blocks, JSON_UNESCAPED_UNICODE);
    }

    $status = $post['status'];
    if (array_key_exists('status', $body)) {
        $status = in_array($body['status'], ['draft', 'scheduled', 'published'], true)
            ? $body['status']
            : $post['status'];
        $sets[] = 'status = ?';
        $args[] = $status;
    }

    if ($status === 'scheduled') {
        $schedule = normaliseSchedule($body['scheduledFor'] ?? $body['scheduled_for'] ?? null);
        if ($schedule === null) {
            je('A scheduled post needs a publish date.', 400);
        }
        $sets[] = 'scheduled_for = ?';
        $args[] = $schedule;
        // Moving back to scheduled must not leave a stale published_at behind,
        // or the post would appear in the sitemap while "scheduled".
        $sets[] = 'published_at = NULL';
    } elseif ($status === 'published') {
        $sets[] = 'published_at = ?';
        $args[] = gmdate('Y-m-d H:i:s');
        $sets[] = 'scheduled_for = NULL';
    }

    if (!$sets) {
        je('Nothing to update.', 400);
    }

    $args[] = $id;
    db()->prepare('UPDATE blog_posts SET ' . implode(', ', $sets) . ', updated_at = UTC_TIMESTAMP() WHERE id = ?')
        ->execute($args);

    auditLog('post.updated', 'blog_post', $id, [
        'from' => $post['status'],
        'to' => $status,
    ]);
    json(['ok' => true, 'id' => $id, 'status' => $status]);
}

/** DELETE /api/ai/posts/:id */
function aiDeletePost(string $id): void
{
    $probe = db()->prepare('SELECT id, slug FROM blog_posts WHERE id = ? LIMIT 1');
    $probe->execute([$id]);
    $post = $probe->fetch();
    if (!$post) {
        je('Post not found.', 404);
    }
    db()->prepare('DELETE FROM blog_posts WHERE id = ?')->execute([$id]);
    auditLog('post.deleted', 'blog_post', $id, ['slug' => $post['slug']]);
    json(['ok' => true]);
}

/**
 * POST /api/ai/posts/auto-schedule — schedule draft posts, one per day.
 *
 * Takes the oldest drafts (up to `count`, default 7) and schedules them for
 * 09:00 UTC on consecutive days, starting after the last already-scheduled or
 * published post. Idempotent: drafts that are already scheduled/published are
 * never touched, and days that already have a post are skipped.
 */
function aiAutoSchedule(): void
{
    $body = requestJson();
    $count = max(1, min(30, (int)($body['count'] ?? 7)));

    // Find the latest date that already has a post going live, so we never
    // double-book a day.
    $last = db()->query(
        "SELECT GREATEST(
            COALESCE(MAX(scheduled_for), '1970-01-01'),
            COALESCE(MAX(published_at), '1970-01-01')
        ) AS last_day FROM blog_posts WHERE status IN ('scheduled','published')"
    )->fetch();
    $cursor = new DateTimeImmutable($last['last_day'] ?? '1970-01-01', new DateTimeZone('UTC'));
    $today = new DateTimeImmutable('today', new DateTimeZone('UTC'));
    if ($cursor < $today) $cursor = $today;

    $drafts = db()->prepare(
        "SELECT id, title FROM blog_posts WHERE status = 'draft' ORDER BY created_at ASC LIMIT ?"
    );
    $drafts->bindValue(1, $count, PDO::PARAM_INT);
    $drafts->execute();
    $rows = $drafts->fetchAll();

    $scheduled = [];
    foreach ($rows as $d) {
        // Next free day at 09:00 UTC.
        $cursor = $cursor->modify('+1 day')->setTime(9, 0, 0);
        $slot = $cursor->format('Y-m-d H:i:s');
        db()->prepare("UPDATE blog_posts SET status = 'scheduled', scheduled_for = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?")
            ->execute([$slot, $d['id']]);
        $scheduled[] = ['id' => $d['id'], 'title' => $d['title'], 'scheduled_for' => $slot];
        auditLog('post.auto_scheduled', 'blog_post', (string)$d['id'], ['scheduled_for' => $slot]);
    }

    json(['ok' => true, 'scheduled' => $scheduled, 'count' => count($scheduled)]);
}