// ─── PHP API smoke test — parity with scripts/smoke-api.mjs contract ────────
// Expects `php -S 127.0.0.1:8091 index.php` running from php-api/ with
// MariaDB reachable per php-api/.env.
import { rm, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.API_URL || 'http://127.0.0.1:8091';
const HERE = dirname(fileURLToPath(import.meta.url));

// ─── Dev-mail scraping ───────────────────────────────────────────────────────
// With SMTP_HOST unset the mail adapter logs every outbound message to the
// PHP server's stderr, exactly like the Node dev adapter. verify-email and
// reset are link-in-token flows, so they can only be asserted end to end by
// reading the real token back out. The links are 64-hex; we match the path so
// a verify token can never be mistaken for a reset token (or vice versa).
const SERVER_ERR = join(HERE, '..', 'tests', 'php-server.err.log');
async function waitForMailToken(pathNeedle, since = 0, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const raw = await readFile(SERVER_ERR, 'utf8').catch(() => '');
    const slice = raw.slice(since);
    const re = new RegExp(`${pathNeedle}\\?token=([a-f0-9]{64})`);
    const m = slice.match(re);
    if (m) return m[1];
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, 150));
  }
}

// Rate-limit state is file-backed and survives restarts (by design — PHP has no
// cross-request memory). The auth ceilings (login 5/15min, auth 30/15min,
// forgot 5/h, resend 5/h) are enforced identically in Node, so a re-run inside
// those windows would 429 legitimate assertions. When we own the server we
// clear the LOCAL store; against a remote API we leave it untouched.
const LOCAL_API = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(API);
async function resetLocalRateStore() {
  if (!LOCAL_API) return;
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'storage', 'rate');
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); ok ? pass++ : fail++; };

const api = async (method, route, { token, body } = {}) => {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) { try { data = await res.json(); } catch { /* ignore */ } }
  else data = await res.arrayBuffer();
  return { status: res.status, data, headers: res.headers };
};

// Builds a genuinely valid 2x2 PNG. The hand-copied 1x1 JPEG used elsewhere in
// this file decodes with width 0, which the upload endpoint correctly refuses as
// malformed — so the photo tests need a real image with real dimensions.
import { deflateSync } from 'node:zlib';

function makePng(w = 2, h = 2) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xFFFFFFFF;
    for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // colour type: truecolour
  // raw scanlines: filter byte 0 + 3 bytes per pixel
  const raw = Buffer.alloc(h * (1 + w * 3), 0);
  for (let y = 0; y < h; y++) raw[y * (1 + w * 3)] = 0;
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const stamp = Date.now().toString(36);
const PW = 'SmokeTest123';

const run = async () => {
  // 0. Clear the local rate-limit store so the suite is re-runnable.
  await resetLocalRateStore();

  // 1. Health — the contract smoke-api.mjs asserts
  const h = await api('GET', '/api/health');
  check('health responds', h.status === 200 || h.status === 503, `${h.status}`);
  check('health reports db state explicitly', h.data && (h.data.db === 'up' || h.data.db === 'down'), h.data?.db);
  if (h.data?.db !== 'up') { console.log('DB down — aborting.'); return; }

  // 2. CORS preflight must NOT swallow real requests (the ?? precedence bug)
  const pre = await fetch(`${API}/api/auth/login`, { method: 'OPTIONS' });
  check('OPTIONS returns 204', pre.status === 204, `${pre.status}`);
  const notGet = await api('GET', '/api/profiles');
  check('GET is not hijacked to 204', notGet.status === 200 && Array.isArray(notGet.data), `${notGet.status}`);

  // 3. Auth: register admin from ADMIN_EMAILS → isAdmin true (Node parity)
  const admin = await api('POST', '/api/auth/register', { body: { email: 'admin@shiarishta.com', password: PW, displayName: 'PHP Admin' } });
  let adminToken = admin.data?.token;
  // A 409 (re-run against a seeded DB) carries no session, so the shape check
  // below must inspect the re-login response instead of the error body.
  let sessionUser = admin.data?.user ?? null;
  if (admin.status === 409) {
    const login = await api('POST', '/api/auth/login', { body: { email: 'admin@shiarishta.com', password: PW } });
    adminToken = login.data?.token;
    sessionUser = login.data?.user ?? null;
    check('admin can log in on re-run', login.status === 200 && login.data?.user?.isAdmin === true, `${login.status}`);
  } else {
    check('register returns 201 + session', admin.status === 201 && !!adminToken, `${admin.status}`);
    check('ADMIN_EMAILS member gets isAdmin:true', admin.data?.user?.isAdmin === true, `${admin.data?.user?.isAdmin}`);
  }
  check('session shape matches Node', sessionUser && 'uid' in sessionUser && 'emailVerified' in sessionUser, Object.keys(sessionUser ?? {}).join(','));

  // 4. Duplicate email → 409
  const dup = await api('POST', '/api/auth/register', { body: { email: 'admin@shiarishta.com', password: PW, displayName: 'Dup' } });
  check('duplicate email → 409', dup.status === 409, `${dup.status}`);

  // 5. Wrong password → 401 with constant shape
  const wrong = await api('POST', '/api/auth/login', { body: { email: 'admin@shiarishta.com', password: 'WrongPassword1' } });
  check('wrong password → 401', wrong.status === 401 && !!wrong.data?.error, `${wrong.status}`);

  // 6. Register a member + profile visibility
  const memEmail = `member-${stamp}@example.com`;
  const mem = await api('POST', '/api/auth/register', { body: { email: memEmail, password: PW, displayName: 'PHP Member' } });
  const memToken = mem.data?.token;
  check('member registered', mem.status === 201 && !!memToken, `${mem.status}`);

  const listAnon = await api('GET', '/api/profiles');
  check('anonymous browse returns array', listAnon.status === 200 && Array.isArray(listAnon.data), `${listAnon.status}`);
  check('members-only rows are visible-tier for anonymous (privacy parity)', listAnon.data.every(p => p.visibility !== 'private'), `n=${listAnon.data.length}`);

  const upd = await api('PUT', '/api/profiles/me', { token: memToken, body: { bio: 'Salam from PHP smoke test.', age: 28, gender: 'female', visibility: 'members' } });
  check('PUT /profiles/me returns {ok, profile}', upd.status === 200 && upd.data?.ok === true && !!upd.data?.profile, `${upd.status}`);

  const updBad = await api('PUT', '/api/profiles/me', { token: memToken, body: { age: 12 } });
  check('age < 18 rejected', updBad.status === 400, `${updBad.status}`);

  const me = await api('GET', '/api/profiles/me', { token: memToken });
  check('GET /profiles/me returns own profile', me.status === 200 && String(me.data?.bio ?? '').includes('PHP smoke test'), `${me.status}`);
  // 7. Private profile hidden from others (Node visibleProfile parity)
  await api('PUT', '/api/profiles/me', { token: memToken, body: { visibility: 'private' } });
  const hidden = await api('GET', `/api/profiles/${mem.data.user.uid}`, { token: adminToken });
  check('private profile hidden from other members', hidden.status === 404, `${hidden.status}`);
  const ownOk = await api('GET', `/api/profiles/${mem.data.user.uid}`, { token: memToken });
  check('owner still sees own private profile', ownOk.status === 200, `${ownOk.status}`);
  await api('PUT', '/api/profiles/me', { token: memToken, body: { visibility: 'members' } });

  // 8. Interest gate: one-way → 403 mutualInterest:false; mutual → 201
  const mem2 = await api('POST', '/api/auth/register', { body: { email: `member2-${stamp}@example.com`, password: PW, displayName: 'PHP Member Two' } });
  const mem2Token = mem2.data?.token;
  const gated = await api('POST', '/api/messages', { token: memToken, body: { userId: mem2.data.user.uid } });
  check('messaging blocked before mutual interest', gated.status === 403 && gated.data?.mutualInterest === false, `${gated.status}`);
  await api('POST', `/api/profiles/${mem2.data.user.uid}/interest`, { token: memToken, body: {} });
  const oneWay = await api('POST', '/api/messages', { token: memToken, body: { userId: mem2.data.user.uid } });
  check('one-way interest still gated', oneWay.status === 403, `${oneWay.status}`);
  const interestBack = await api('POST', `/api/profiles/${mem.data.user.uid}/interest`, { token: mem2Token, body: {} });
  check('interest response shape {success, matched}', interestBack.data?.success === true && interestBack.data?.matched === true, JSON.stringify(interestBack.data));
  const conv = await api('POST', '/api/messages', { token: memToken, body: { userId: mem2.data.user.uid } });
  check('mutual interest opens conversation → 201 {id}', conv.status === 201 && !!conv.data?.id, `${conv.status}`);

  // 9. Contact stripping in messages
  const sent = await api('POST', `/api/messages/${conv.data.id}`, { token: memToken, body: { text: 'Call me at +91 98765 43210 or email a@b.com' } });
  check('contact details stripped before storage', sent.status === 201 && String(sent.data?.text).includes('[Removed'), String(sent.data?.text).slice(0, 50));
  const normal = await api('POST', `/api/messages/${conv.data.id}`, { token: memToken, body: { text: 'My wali would like to speak with your family this week.' } });
  check('ordinary message stored untouched', normal.data?.text?.includes('wali') === true, `${normal.status}`);
  const thread = await api('GET', `/api/messages/${conv.data.id}`, { token: memToken });
  check('thread returns me/them mapping', Array.isArray(thread.data) && thread.data.some(m => m.senderId === 'me'), `n=${thread.data?.length}`);
  const outsider = await api('POST', '/api/auth/register', { body: { email: `out-${stamp}@example.com`, password: PW, displayName: 'Outsider' } });
  const notMine = await api('GET', `/api/messages/${conv.data.id}`, { token: outsider.data?.token });
  check('non-participant cannot read thread → 403', notMine.status === 403, `${notMine.status}`);

  // 10. Block cuts conversation both ways
  await api('POST', '/api/reports/block', { token: memToken, body: { userId: mem2.data.user.uid } });
  const afterBlock = await api('GET', `/api/messages/${conv.data.id}`, { token: memToken });
  check('block cuts existing conversation', afterBlock.status === 403, `${afterBlock.status}`);
  await api('DELETE', `/api/reports/block/${mem2.data.user.uid}`, { token: memToken });

  // 10b. Unblock must actually restore access, not just return 200.
  const afterUnblock = await api('GET', `/api/messages/${conv.data.id}`, { token: memToken });
  check('unblock restores the conversation', afterUnblock.status === 200, `${afterUnblock.status}`);

  // 10c. Conversation list (GET /api/messages) — the inbox view.
  const inbox = await api('GET', '/api/messages', { token: memToken });
  check('conversation list returns the thread', inbox.status === 200 && Array.isArray(inbox.data)
    && inbox.data.some(c => String(c.id) === String(conv.data.id)), `${inbox.status} n=${inbox.data?.length}`);
  const inboxAnon = await api('GET', '/api/messages');
  check('conversation list needs auth → 401', inboxAnon.status === 401, `${inboxAnon.status}`);

  // 11. Drafts: plain member cannot create (403), matchmaker can
  const noRole = await api('POST', '/api/drafts', { token: memToken, body: { gender: 'female', displayName: 'X', contactEmail: 'x@example.com', consentAttested: true } });
  check('plain member cannot create drafts → 403', noRole.status === 403, `${noRole.status}`);

  await api('POST', `/api/admin/users/${mem.data.user.uid}/role`, { token: adminToken, body: { role: 'matchmaker' } });
  const caps = await api('GET', '/api/drafts/capabilities', { token: memToken });
  check('role granted immediately visible (DB, not JWT)', caps.data?.role === 'matchmaker' && caps.data?.canDraft === true, caps.data?.role);
  check('capabilities quota shape', typeof caps.data?.quota?.limit === 'number' && typeof caps.data?.quota?.open === 'number', JSON.stringify(caps.data?.quota));

  const boyAttempt = await api('POST', '/api/drafts', { token: memToken, body: { gender: 'male', displayName: 'Y', contactEmail: 'y@example.com', consentAttested: true } });
  check('matchmaker cannot draft male → 403', boyAttempt.status === 403, `${boyAttempt.status}`);
  const draft = await api('POST', '/api/drafts', {
    token: memToken,
    body: {
      gender: 'female', displayName: 'PHP Zoya', age: 24, city: 'Hyderabad', country: 'India',
      bio: 'About me: quiet, studious, family-first.',
      expectations: 'About expectations: practising, kind.',
      contactEmail: `zoya-${stamp}@example.com`, contactPhone: '+91 90000 00000',
      consentAttested: true,
    },
  });
  check('draft created with share + whatsapp + short code', draft.status === 201 && !!draft.data?.shareUrl && !!draft.data?.whatsappUrl && !!draft.data?.draft?.shortCode, `${draft.status}`);
  const dToken = draft.data?.shareUrl?.split('/claim/')[1];

  // Draft must be invisible as a profile (safety invariant)
  const listAfterDraft = await api('GET', '/api/profiles', { token: adminToken });
  check('draft never appears as a profile', !listAfterDraft.data.some(p => p.displayName === 'PHP Zoya'), `n=${listAfterDraft.data.length}`);

  // Preview: no contact leak
  const preview = await api('GET', `/api/drafts/claim/${dToken}`);
  check('claim preview opens without account', preview.status === 200 && preview.data?.draft?.bio?.includes('quiet') === true, `${preview.status}`);
  check('preview masks email, hides phone', !JSON.stringify(preview.data).includes(`zoya-${stamp}@example.com`) && !JSON.stringify(preview.data).includes('90000'), 'masked');

  // Send invite BEFORE claiming (resolved drafts refuse sends — correct).
  // Mail falls back to console in dev.
  const sentInvite = await api('POST', `/api/drafts/${draft.data.draft.id}/send`, { token: memToken, body: {} });
  check('send invite → 200 {sentTo}', sentInvite.status === 200 && !!sentInvite.data?.sentTo, `${sentInvite.status}`);

  // Extend BEFORE claiming (resolved drafts refuse extensions — correct).
  const ext = await api('POST', `/api/drafts/${draft.data.draft.id}/extend`, { token: memToken, body: {} });
  check('extend returns fresh expiresAt', ext.status === 200 && !!ext.data?.expiresAt, `${ext.status}`);

  // Short code lookup BEFORE claiming (claimed drafts defeat it — correct).
  const code = await api('GET', `/api/drafts/by-short-code/${draft.data.draft.shortCode}`);
  check('short code revives claim URL', code.status === 200 && !!code.data?.claimUrl, `${code.status}`);
  const badCode = await api('GET', '/api/drafts/by-short-code/ZZZZZZ');
  check('unknown short code → 404', badCode.status === 404, `${badCode.status}`);

  // Wrong email claim → 400; correct claim → 201 with session
  const wrongClaim = await api('POST', `/api/drafts/claim/${dToken}`, { body: { email: 'nope@example.com', password: 'SomePass123' } });
  check('claim requires invited email → 400', wrongClaim.status === 400, `${wrongClaim.status}`);
  const claimed = await api('POST', `/api/drafts/claim/${dToken}`, { body: { email: `zoya-${stamp}@example.com`, password: 'ClaimPass123', displayName: 'Zoya PHP Claimed' } });
  check('claim → 201 signed-in session', claimed.status === 201 && !!claimed.data?.token, `${claimed.status}`);
  const replay = await api('POST', `/api/drafts/claim/${dToken}`, { body: { email: `zoya-${stamp}@example.com`, password: 'ClaimPass123' } });
  check('claim token dies after one use → 404', replay.status === 404, `${replay.status}`);

  const herProfile = await api('GET', `/api/profiles/${claimed.data.user.uid}`, { token: claimed.data.token });
  check('claim seeds her real profile with her name', herProfile.data?.displayName === 'Zoya PHP Claimed' && herProfile.data?.bio?.includes('quiet'), herProfile.data?.displayName);

  // Mine: rows returned
  const mine = await api('GET', '/api/drafts/mine', { token: memToken });
  check('drafts/mine returns rows', Array.isArray(mine.data) && mine.data.length >= 1, `n=${mine.data?.length}`);
  const resolvedHasNoToken = mine.data.every(d => d.status !== 'awaiting_claim' || typeof d.claim_token === 'string');
  check('live drafts expose token; resolved omit it (Node parity)', resolvedHasNoToken, 'masking ok');

  // Decline path on a second draft
  const d2 = await api('POST', '/api/drafts', {
    token: memToken,
    body: { gender: 'female', displayName: 'Decline Me', contactEmail: `decl-${stamp}@example.com`, consentAttested: true },
  });
  const d2Token = d2.data?.shareUrl?.split('/claim/')[1];
  const declined = await api('POST', `/api/drafts/claim/${d2Token}/decline`, {});
  check('decline erases with no account → 200 ok', declined.status === 200 && declined.data?.ok === true, `${declined.status}`);
  const deadPreview = await api('GET', `/api/drafts/claim/${d2Token}`);
  check('declined link is dead → 404/410', deadPreview.status === 404 || deadPreview.status === 410, `${deadPreview.status}`);

  // Withdraw path on a third draft
  const d3 = await api('POST', '/api/drafts', {
    token: memToken,
    body: { gender: 'female', displayName: 'Withdraw Me', contactEmail: `wd-${stamp}@example.com`, consentAttested: true },
  });
  const wd = await api('DELETE', `/api/drafts/${d3.data.draft.id}`, { token: memToken });
  check('creator can withdraw → 200', wd.status === 200, `${wd.status}`);
  const wdAgain = await api('DELETE', `/api/drafts/${d3.data.draft.id}`, { token: memToken });
  check('double withdraw → 404', wdAgain.status === 404, `${wdAgain.status}`);

  // Resolved drafts refuse further actions (guarded, not accidental).
  const codeAfterClaim = await api('GET', `/api/drafts/by-short-code/${draft.data.draft.shortCode}`);
  check('claimed draft defeats short code → 404', codeAfterClaim.status === 404, `${codeAfterClaim.status}`);
  const sendAfterClaim = await api('POST', `/api/drafts/${draft.data.draft.id}/send`, { token: memToken, body: {} });
  check('resolved draft refuses send → 400', sendAfterClaim.status === 400, `${sendAfterClaim.status}`);
  const extAfterClaim = await api('POST', `/api/drafts/${draft.data.draft.id}/extend`, { token: memToken, body: {} });
  check('resolved draft refuses extend → 404', extAfterClaim.status === 404, `${extAfterClaim.status}`);

  // Audit trail
  const events = await api('GET', `/api/drafts/${draft.data.draft.id}/events`, { token: memToken });
  check('audit events recorded', Array.isArray(events.data) && events.data.some(e => e.event === 'created'), `n=${events.data?.length}`);
  const eventsOther = await api('GET', `/api/drafts/${draft.data.draft.id}/events`, { token: mem2Token });
  check('audit not readable by others → 403', eventsOther.status === 403, `${eventsOther.status}`);
  // 12. Admin gates
  const notAdmin = await api('GET', '/api/admin/overview', { token: memToken });
  check('member cannot reach admin → 403', notAdmin.status === 403, `${notAdmin.status}`);
  const noAuth = await api('GET', '/api/admin/overview');
  check('admin without token → 401', noAuth.status === 401, `${noAuth.status}`);

  const overview = await api('GET', '/api/admin/overview', { token: adminToken });
  check('overview returns numeric counts', overview.status === 200 && typeof overview.data?.totalMembers === 'number', JSON.stringify(overview.data).slice(0, 80));

  const analytics = await api('GET', '/api/admin/analytics?range=7d', { token: adminToken });
  check('analytics returns two charts with labels=values', analytics.status === 200
    && analytics.data?.charts?.length === 2
    && analytics.data.charts[0].labels.length === analytics.data.charts[0].values.length,
    `labels=${analytics.data?.charts?.[0]?.labels?.length}`);

  const roleUsers = await api('GET', '/api/admin/users?role=matchmaker', { token: adminToken });
  check('admin can list users by role', roleUsers.status === 200 && Array.isArray(roleUsers.data), `n=${roleUsers.data?.length}`);

  const badRole = await api('POST', `/api/admin/users/${mem2.data.user.uid}/role`, { token: adminToken, body: { role: 'wizard' } });
  check('invalid role → 400', badRole.status === 400, `${badRole.status}`);
  const ghost = await api('POST', '/api/admin/users/00000000-0000-0000-0000-000000000000/role', { token: adminToken, body: { role: 'member' } });
  check('role grant on unknown member → 404', ghost.status === 404, `${ghost.status}`);

  // 13. Verification pipeline (submit → admin approve → badge)
  const tinyJpeg = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  const submit = await api('POST', '/api/verifications', { token: memToken, body: { kind: 'selfie', imageBase64: tinyJpeg } });
  check('verification submitted → 201 pending', submit.status === 201 && submit.data?.verification?.status === 'pending', `${submit.status}`);
  const badKind = await api('POST', '/api/verifications', { token: memToken, body: { kind: 'passport_scan', imageBase64: tinyJpeg } });
  check('only selfie/id_document accepted → 400', badKind.status === 400, `${badKind.status}`);
  const mySubs = await api('GET', '/api/verifications/mine', { token: memToken });
  check('member sees own submissions', Array.isArray(mySubs.data) && mySubs.data.length >= 1, `n=${mySubs.data?.length}`);
  const queue = await api('GET', '/api/admin/verifications?status=pending', { token: adminToken });
  // The list response is now { rows, counts }; accept a bare array too, so this
  // test cannot silently pass against whichever shape it happens to receive.
  const queueRows = Array.isArray(queue.data) ? queue.data : (queue.data?.rows || []);
  check('admin sees pending queue', queue.status === 200 && queueRows.length >= 1, `n=${queueRows.length}`);
  const vid = queueRows[0].id;
  const approve = await api('POST', `/api/admin/verifications/${vid}/approve`, { token: adminToken, body: {} });
  check('approve → 200 verified', approve.status === 200 && approve.data?.verified === true, `${approve.status}`);
  const doubleApprove = await api('POST', `/api/admin/verifications/${vid}/approve`, { token: adminToken, body: {} });
  check('re-review → 404', doubleApprove.status === 404, `${doubleApprove.status}`);

  const fileNoAuth = await api('GET', `/api/admin/verifications/${vid}/file`);
  check('verification file needs auth → 401', fileNoAuth.status === 401, `${fileNoAuth.status}`);
  const fileAdmin = await api('GET', `/api/admin/verifications/${vid}/file`, { token: adminToken });
  check('admin gets photo bytes', fileAdmin.status === 200 && fileAdmin.data?.byteLength > 0, `bytes=${fileAdmin.data?.byteLength}`);

  // 14. Wali links
  const wali = await api('POST', '/api/wali/link', { token: memToken, body: {} });
  check('wali link created → 201', wali.status === 201 && typeof wali.data?.url === 'string', `${wali.status}`);
  const wToken = wali.data.url.split('/wali/')[1];
  const wView = await api('GET', `/api/wali/${wToken}`);
  check('wali view is read-only public', wView.status === 200 && wView.data?.readOnly === true, `${wView.status}`);
  check('wali view never leaks email', !JSON.stringify(wView.data).includes('@example.com'), 'no email');
  await api('DELETE', `/api/wali/link/${wToken}`, { token: memToken });
  const wRevoked = await api('GET', `/api/wali/${wToken}`);
  check('revoked wali link → 404', wRevoked.status === 404, `${wRevoked.status}`);
  // 15. Reports
  const report = await api('POST', '/api/reports', { token: memToken, body: { targetType: 'profile', targetId: mem2.data.user.uid, reason: 'Test report from smoke' } });
  check('report filed → 201', report.status === 201 && report.data?.ok === true, `${report.status}`);
  const dupReport = await api('POST', '/api/reports', { token: memToken, body: { targetType: 'profile', targetId: mem2.data.user.uid, reason: 'Again' } });
  check('duplicate report in 24h → 429', dupReport.status === 429, `${dupReport.status}`);
  const adminReports = await api('GET', '/api/admin/reports?status=open', { token: adminToken });
  check('admin sees open reports', adminReports.status === 200 && adminReports.data.length >= 1, `n=${adminReports.data.length}`);
  const rAction = await api('POST', `/api/admin/reports/${report.data.id}/action`, { token: adminToken, body: {} });
  check('report action → 200', rAction.status === 200, `${rAction.status}`);
  const afterAction = await api('GET', '/api/admin/reports?status=actioned', { token: adminToken });
  check('actioned report visible in queue', afterAction.data.some(r => r.id === report.data.id), 'found');

  // 16. Community
  const room = await api('POST', '/api/community', { token: memToken, body: { name: `NikahTalk${stamp}` } });
  check('community created → 201 {id,name,icon}', room.status === 201 && !!room.data?.id, `${room.status}`);
  const rooms = await api('GET', '/api/community');
  check('community list uses members key (Node parity)', rooms.status === 200 && rooms.data.every(r => 'members' in r), JSON.stringify(rooms.data[0] ?? {}));
  const post = await api('POST', `/api/community/${room.data.id}/posts`, { token: memToken, body: { title: 'Salam everyone', body: 'First post from smoke test.' } });
  check('post created → 201', post.status === 201 && !!post.data?.id, `${post.status}`);
  const allFeed = await api('GET', '/api/community/all/posts');
  check("'all' feed works", allFeed.status === 200 && Array.isArray(allFeed.data), `${allFeed.status}`);
  const reply = await api('POST', `/api/community/post/${post.data.id}/replies`, { token: mem2Token, body: { body: 'Wa alaikum salam!' } });
  check('reply created → 201', reply.status === 201, `${reply.status}`);
  const threadView = await api('GET', `/api/community/post/${post.data.id}`);
  check('thread includes repliesList', Array.isArray(threadView.data?.repliesList) && threadView.data.repliesList.length === 1, `n=${threadView.data?.repliesList?.length}`);

  // 17. Password reset flow (mail to console)
  const forgot = await api('POST', '/api/auth/forgot', { body: { email: memEmail } });
  check('forgot → constant-shape ok', forgot.status === 200 && forgot.data?.ok === true, `${forgot.status}`);
  const forgotUnknown = await api('POST', '/api/auth/forgot', { body: { email: 'ghost-nope@example.com' } });
  check('forgot unknown email indistinguishable', forgotUnknown.status === forgot.status && forgotUnknown.data?.ok === true, `${forgotUnknown.status}`);

  // 18. Email verify + resend
  const fresh = await api('POST', '/api/auth/register', { body: { email: `verify-${stamp}@example.com`, password: PW, displayName: 'Verify Me' } });
  check('fresh account has emailVerified:false', fresh.data?.user?.emailVerified === false, `${fresh.data?.user?.emailVerified}`);
  const resend = await api('POST', '/api/auth/resend-verification', { token: fresh.data.token });
  check('resend-verification → ok', resend.status === 200 && resend.data?.ok === true, `${resend.status}`);
  const resendNoAuth = await api('POST', '/api/auth/resend-verification');
  check('resend without token → 401', resendNoAuth.status === 401, `${resendNoAuth.status}`);

  // 19. Invalid JSON → 400 (Node parity)
  const badJson = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
  check('invalid JSON body → 400', badJson.status === 400, `${badJson.status}`);

  // 20. Unknown API route → 404 {error:'Not found'}
  const missing = await api('GET', '/api/definitely-not-a-route');
  check('unknown route → 404', missing.status === 404 && missing.data?.error === 'Not found', `${missing.status}`);

  // 21. Security headers present
  const sec = await fetch(`${API}/api/health`);
  check('nosniff + no-store headers set', (sec.headers.get('x-content-type-options') === 'nosniff') && (sec.headers.get('cache-control')?.includes('no-store')), `${sec.headers.get('x-content-type-options')}`);
  check('X-Frame-Options DENY set', sec.headers.get('x-frame-options') === 'DENY', sec.headers.get('x-frame-options'));

  // ── 22. verify-email completion (untested before: the suite never read the link)
  const markA = (await readFile(SERVER_ERR, 'utf8').catch(() => '')).length;
  const veEmail = `ve-${stamp}@example.com`;
  await api('POST', '/api/auth/register', { body: { email: veEmail, password: PW, displayName: 'Verify End' } });
  const veToken = await waitForMailToken('/verify-email', markA);
  check('verify link was mailed', !!veToken, veToken ? 'token captured' : 'no /verify-email link in dev mail');
  if (veToken) {
    const verified = await api('GET', `/api/auth/verify-email?token=${veToken}`);
    check('email verification link activates the account', verified.status === 200 && verified.data?.emailVerified === true, JSON.stringify(verified.data));
    const replay = await api('GET', `/api/auth/verify-email?token=${veToken}`);
    check('verify link is single-use → 400', replay.status === 400, `${replay.status}`);
    const veLogin = await api('POST', '/api/auth/login', { body: { email: veEmail, password: PW } });
    check('verified account reports emailVerified:true', veLogin.data?.user?.emailVerified === true, `${veLogin.data?.user?.emailVerified}`);
  }
  const noVeToken = await api('GET', '/api/auth/verify-email');
  check('verify-email without token → 400', noVeToken.status === 400, `${noVeToken.status}`);

  // ── 23. Password reset completion (forgot was asserted; reset never was)
  const markB = (await readFile(SERVER_ERR, 'utf8').catch(() => '')).length;
  const newPw = 'RotatedPass456';
  const forgotPw = await api('POST', '/api/auth/forgot', { body: { email: memEmail } });
  check('forgot for reset flow → 200', forgotPw.status === 200, `${forgotPw.status}`);
  const resetToken = await waitForMailToken('/auth/reset', markB);
  check('reset link was mailed', !!resetToken, resetToken ? 'token captured' : 'no /auth/reset link in dev mail');
  if (resetToken) {
    const tooShort = await api('POST', '/api/auth/reset', { body: { token: resetToken, password: 'short' } });
    check('reset rejects a weak password → 400', tooShort.status === 400, `${tooShort.status}`);
    const reset = await api('POST', '/api/auth/reset', { body: { token: resetToken, password: newPw } });
    check('password reset completes → 200 ok', reset.status === 200 && reset.data?.ok === true, `${reset.status}`);
    const replay = await api('POST', '/api/auth/reset', { body: { token: resetToken, password: 'AnotherPass789' } });
    check('reset token is single-use → 400', replay.status === 400, `${replay.status}`);
    const withNew = await api('POST', '/api/auth/login', { body: { email: memEmail, password: newPw } });
    check('sign in with the rotated password', withNew.status === 200 && !!withNew.data?.token, `${withNew.status}`);
    const withOld = await api('POST', '/api/auth/login', { body: { email: memEmail, password: PW } });
    check('old password no longer works → 401', withOld.status === 401, `${withOld.status}`);
  }

  // ── 24. Admin reject branch (approve was covered; reject never was)
  const rejSubmit = await api('POST', '/api/verifications', { token: mem2Token, body: { kind: 'id_document', imageBase64: tinyJpeg } });
  check('second verification submitted for reject branch', rejSubmit.status === 201, `${rejSubmit.status}`);
  if (rejSubmit.status === 201) {
    const rejId = rejSubmit.data?.verification?.id;
    const notAdminRej = await api('POST', `/api/admin/verifications/${rejId}/reject`, { token: mem2Token, body: {} });
    check('non-admin cannot reject → 403', notAdminRej.status === 403, `${notAdminRej.status}`);
    const rejected = await api('POST', `/api/admin/verifications/${rejId}/reject`, { token: adminToken, body: {} });
    // Node parity: the handler returns {ok:true} only — the new status is read
    // back from the queue, it is NOT echoed in the response body.
    check('admin reject → 200 {ok:true}', rejected.status === 200 && rejected.data?.ok === true, JSON.stringify(rejected.data));
    const rejQueue = await api('GET', '/api/admin/verifications?status=rejected', { token: adminToken });
    const rejRows = Array.isArray(rejQueue.data) ? rejQueue.data : (rejQueue.data?.rows || []);
   check('rejected submission appears in the rejected queue', rejRows.some(v => String(v.id) === String(rejId)), `n=${rejRows.length}`);
    const reRej = await api('POST', `/api/admin/verifications/${rejId}/reject`, { token: adminToken, body: {} });
    check('re-reject an already-reviewed item → 404', reRej.status === 404, `${reRej.status}`);
  }

  // ── 25. Admin dismiss branch (action was covered; dismiss never was)
  const disReport = await api('POST', '/api/reports', { token: mem2Token, body: { targetType: 'profile', targetId: mem.data.user.uid, reason: 'Dismiss me' } });
  check('report for dismiss branch → 201', disReport.status === 201, `${disReport.status}`);
  if (disReport.status === 201) {
    const notAdminDis = await api('POST', `/api/admin/reports/${disReport.data.id}/dismiss`, { token: mem2Token, body: {} });
    check('non-admin cannot dismiss → 403', notAdminDis.status === 403, `${notAdminDis.status}`);
    const dismissed = await api('POST', `/api/admin/reports/${disReport.data.id}/dismiss`, { token: adminToken, body: {} });
    check('admin dismiss → 200 ok', dismissed.status === 200 && dismissed.data?.ok === true, `${dismissed.status} ${JSON.stringify(dismissed.data)}`);
    const stillOpen = await api('GET', '/api/admin/reports?status=open', { token: adminToken });
    check('dismissed report leaves the open queue', !stillOpen.data.some(r => String(r.id) === String(disReport.data.id)), `open=${stillOpen.data?.length}`);
    const reDis = await api('POST', `/api/admin/reports/${disReport.data.id}/dismiss`, { token: adminToken, body: {} });
    // Node parity: the Node handler runs an unconditional UPDATE with no
    // row-count check, so dismiss is idempotent and always answers 200 — unlike
    // reject, which 404s once the row is no longer pending.
    check('dismiss is idempotent → 200 again', reDis.status === 200 && reDis.data?.ok === true, `${reDis.status}`);
  }

  // ── 26. Filter parameters (added after the browse filters were found dead)
  {
    const f = await api('POST', '/api/auth/register', { body: { email: `filt-${stamp}@example.com`, password: PW, displayName: 'Filter Target' } });
    const fTok = f.data?.token;
    // Both key shapes must be accepted: the filter query uses `education`, the
    // onboarding form uses `educationLevel`. The alias was missing, so the value
    // was silently dropped on save.
    const set = await api('PUT', '/api/profiles/me', {
      token: fTok,
      body: { visibility: 'public', photos_visibility: 'public', age: 30, gender: 'male',
              sect: 'Ithna Ashari (Twelver)', religiosity: 'Very practicing',
              education: "Master's degree", marja: 'Sistani', country: 'Karachi' },
    });
    check('onboarding fields accepted on save', set.status === 200, `${set.status}`);
    const meF = await api('GET', '/api/profiles/me', { token: fTok });
    check('religiosity persisted', meF.data?.religiosity === 'Very practicing', `${meF.data?.religiosity}`);
    check('education persisted via alias', meF.data?.educationLevel === "Master's degree", `${meF.data?.educationLevel}`);
    check('marja persisted', meF.data?.marja === 'Sistani', `${meF.data?.marja}`);

    const bySect = await api('GET', `/api/profiles?sect=${encodeURIComponent('Ithna Ashari (Twelver)')}`);
    check('filter ?sect matches', bySect.status === 200 && bySect.data.some(p => p.displayName === 'Filter Target'), `n=${bySect.data?.length}`);
    const byMarja = await api('GET', '/api/profiles?marja=Sistani');
    check('filter ?marja matches', byMarja.status === 200 && byMarja.data.some(p => p.displayName === 'Filter Target'), `n=${byMarja.data?.length}`);
    const byEduc = await api('GET', `/api/profiles?education=${encodeURIComponent("Master's degree")}`);
    check('filter ?education matches', byEduc.status === 200 && byEduc.data.some(p => p.displayName === 'Filter Target'), `n=${byEduc.data?.length}`);
    const byRelig = await api('GET', `/api/profiles?religiosity=${encodeURIComponent('Very practicing')}`);
    check('filter ?religiosity matches', byRelig.status === 200 && byRelig.data.some(p => p.displayName === 'Filter Target'), `n=${byRelig.data?.length}`);
    const byCountry = await api('GET', '/api/profiles?country=Karachi');
    check('filter ?country matches', byCountry.status === 200 && byCountry.data.some(p => p.displayName === 'Filter Target'), `n=${byCountry.data?.length}`);

    // Placeholder sentinels must be ignored, not matched as literal strings.
    const sentinel = await api('GET', '/api/profiles?sect=Any%20sect&religiosity=Any%20level&education=Any%20education');
    check('placeholder sentinels do not filter anything out', sentinel.status === 200 && Array.isArray(sentinel.data) && sentinel.data.length > 0, `n=${sentinel.data?.length}`);
    const nonExistent = await api('GET', '/api/profiles?sect=' + encodeURIComponent('Nonexistent Sect'));
    check('a real filter value excludes non-matches', nonExistent.status === 200 && !nonExistent.data.some(p => p.displayName === 'Filter Target'), `n=${nonExistent.data?.length}`);
  }

  // ── 27. Photo privacy (the leak that showed a stranger's face)
  {
    const o = await api('POST', '/api/auth/register', { body: { email: `lockp-${stamp}@example.com`, password: PW, displayName: 'Locked Photos' } });
    await api('PUT', '/api/profiles/me', { token: o.data?.token, body: { visibility: 'public', photos_visibility: 'private', age: 27, gender: 'female' } });
    const other = await api('POST', '/api/auth/register', { body: { email: `lockv-${stamp}@example.com`, password: PW, displayName: 'Photo Viewer' } });
    const seen = await api('GET', `/api/profiles/${o.data.user.uid}`, { token: other.data?.token });
    check('locked photos → photo is null', seen.status === 200 && seen.data?.photo === null, `${JSON.stringify(seen.data?.photo)}`);
    check('locked photos → photosLocked is true', seen.data?.photosLocked === true, `${seen.data?.photosLocked}`);
    check('locked photos → photosVisibility reaches the client', seen.data?.photosVisibility === 'private', `${seen.data?.photosVisibility}`);
    const own = await api('GET', '/api/profiles/me', { token: o.data?.token });
    check('owner is not locked from their own photos', own.data?.photosLocked === false, `${own.data?.photosLocked}`);
  }

  // ── 28. Photo upload: validation, EXIF stripping, privacy-gated serving
  {
    const png = makePng(2, 2);
    const owner = await api('POST', '/api/auth/register', { body: { email: `up-${stamp}@example.com`, password: PW, displayName: 'Uploader' } });
    const uTok = owner.data?.token;
    const uid = owner.data.user.uid;
    await api('PUT', '/api/profiles/me', { token: uTok, body: { visibility: 'public', photos_visibility: 'public' } });

    const up = await api('POST', '/api/profiles/me/photo', { token: uTok, body: { photo: png.toString('base64') } });
    check('photo upload → 201', up.status === 201 && up.data?.ok === true, `${up.status} ${JSON.stringify(up.data)}`);

    const meU = await api('GET', '/api/profiles/me', { token: uTok });
    check('photo URL is the gated endpoint', meU.data?.photo === `/api/profiles/${uid}/photo`, `${meU.data?.photo}`);

    const served = await api('GET', `/api/profiles/${uid}/photo`);
    const servedBytes = served.data ? Buffer.from(served.data) : Buffer.alloc(0);
    check('served bytes are the original image', served.status === 200 && servedBytes.equals(png),
      `${servedBytes.length}b vs ${png.length}b`);
    check('served with a non-sniffable content type', served.headers.get('x-content-type-options') === 'nosniff', `${served.headers.get('x-content-type-options')}`);

    // ── Rejections: judged on real content, never the declared type ──
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf8');
    check('SVG rejected → 400 (scriptable, XSS vector)',
      (await api('POST', '/api/profiles/me/photo', { token: uTok, body: { photo: svg.toString('base64') } })).status === 400);

    const php = Buffer.from('<?php system($_GET["c"]); ?>', 'utf8');
    check('PHP file disguised as an image rejected → 400',
      (await api('POST', '/api/profiles/me/photo', { token: uTok, body: { photo: php.toString('base64') } })).status === 400);

    // A valid image with a script appended: passes the MIME sniff, so it must be
    // refused by the pixel-count/decode check instead.
    const polyglot = Buffer.concat([png, Buffer.from('<?php echo "pwned"; ?>', 'utf8')]);
    const rPoly = await api('POST', '/api/profiles/me/photo', { token: uTok, body: { photo: polyglot.toString('base64') } });
    check('appended-script polyglot rejected → 400', rPoly.status === 400, `${rPoly.status}`);

    check('empty upload → 400',
      (await api('POST', '/api/profiles/me/photo', { token: uTok, body: {} })).status === 400);
    check('upload without a token → 401',
      (await api('POST', '/api/profiles/me/photo', { body: { photo: png.toString('base64') } })).status === 401);

    // A member cannot overwrite someone else's photo reference.
    check('photo routes have no cross-account write surface',
      (await api('POST', `/api/profiles/${uid}/photo`, { token: mem2Token, body: { photo: png.toString('base64') } })).status === 404);

    // ── Serving is privacy-gated ──
    check('public photo is viewable by anyone', (await fetch(`${API}/api/profiles/${uid}/photo`)).status === 200);

    // Flip to private: the SAME url must stop working immediately, so a link
    // that was already shared or cached cannot keep serving the image.
    await api('PUT', '/api/profiles/me', { token: uTok, body: { photos_visibility: 'private' } });
    check('locking photos breaks the shared URL at once',
      (await fetch(`${API}/api/profiles/${uid}/photo`)).status === 404);
    check('locked photo is 404 for another member',
      (await api('GET', `/api/profiles/${uid}/photo`, { token: mem2Token })).status === 404);
    check('owner can still see their own locked photo',
      (await api('GET', `/api/profiles/${uid}/photo`, { token: uTok })).status === 200);

    // members tier: anonymous gets 401, a signed-in member gets the bytes.
    await api('PUT', '/api/profiles/me', { token: uTok, body: { photos_visibility: 'members' } });
    check('members-tier photo is 401 for anonymous',
      (await fetch(`${API}/api/profiles/${uid}/photo`)).status === 401);
    check('members-tier photo is 200 for a member',
      (await api('GET', `/api/profiles/${uid}/photo`, { token: mem2Token })).status === 200);

    // The JSON profile must stop advertising the URL once photos are locked.
    await api('PUT', '/api/profiles/me', { token: uTok, body: { photos_visibility: 'private' } });
    const seenLocked = await api('GET', `/api/profiles/${uid}`, { token: mem2Token });
    check('locked profile JSON does not leak the photo URL', seenLocked.data?.photo === null, `${seenLocked.data?.photo}`);

    const del = await api('DELETE', '/api/profiles/me/photo', { token: uTok });
    check('photo delete → 200', del.status === 200 && del.data?.ok === true, `${del.status}`);
    check('deleted photo is 404', (await api('GET', `/api/profiles/${uid}/photo`)).status === 404);
  }
};

run()
  .catch((e) => { console.error('PHP API SMOKE CRASHED:', e.message); fail++; })
  .finally(() => { console.log(`\n${pass} passed, ${fail} failed`); process.exitCode = fail === 0 ? 0 : 1; });




