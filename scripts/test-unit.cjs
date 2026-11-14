// Unit tests: analytics queue + profile completeness scoring.
// Pure Node — no browser, no server, no network.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
const tmp = path.join(os.tmpdir(), 'sh-unit-imports');
fs.mkdirSync(tmp, { recursive: true });
// Copy ESM sources to .mjs so Node can import them from a CJS test.
for (const [src, out] of [
  ['src/lib/analytics.js', 'analytics.mjs'],
  ['src/lib/onboardingData.js', 'onboardingData.mjs'],
  ['src/lib/dobParts.js', 'dobParts.mjs'],
]) {
  fs.copyFileSync(path.join(root, src), path.join(tmp, out));
}

const results = [];
const pass = (name) => { results.push(name); console.log('PASS:', name); };

// seoResolve.js is NOT self-contained (it imports six data modules), so it
// is copied with its import tree preserved and a type:module marker —
// importing it standalone from a bare copy would fail on relative paths.
const seoTmp = path.join(os.tmpdir(), 'sh-unit-seo');
for (const rel of [
  'lib/seoResolve.js',
  'pages/landing/landingPageMeta.js',
  'data/tagLandingPages.js',
  'data/articleMeta.js',
  'data/locationSeo.js',
  'data/routeSeo.js',
  'data/socialLinks.js',
]) {
  const dest = path.join(seoTmp, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(root, 'src', rel), dest);
}
fs.writeFileSync(path.join(seoTmp, 'package.json'), JSON.stringify({ type: 'module' }));

(async () => {
  const { createAnalytics } = await import('file:///' + path.join(tmp, 'analytics.mjs').replace(/\\/g, '/'));
  const { computeProfileCompleteness } = await import('file:///' + path.join(tmp, 'onboardingData.mjs').replace(/\\/g, '/'));
  const { daysInMonth, applyDobPart, dobIso, splitDobParts, dobPartsFromDraft, emptyDobParts } = await import('file:///' + path.join(tmp, 'dobParts.mjs').replace(/\\/g, '/'));
  const { resolveMeta, canonicalFor } = await import('file:///' + path.join(seoTmp, 'lib', 'seoResolve.js').replace(/\\/g, '/'));

  // ── In-memory storage stand-in (no DOM required) ──────────────────────────
  const memoryStorage = () => {
    const map = new Map();
    return {
      getItem: k => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: k => map.delete(k),
    };
  };

  // 1. Records, counts, exports, clears.
  const a = createAnalytics(memoryStorage());
  assert.equal(a.count(), 0);
  a.track('profile_viewed', { id: 'p1' });
  a.track('interest_sent', { id: 'p1' });
  a.track('profile_viewed', { id: 'p2' });
  assert.equal(a.count(), 3);
  assert.equal(a.count('profile_viewed'), 2);
  const events = a.getEvents();
  assert.equal(events[0].event, 'profile_viewed');
  assert.ok(events[0].ts);
  assert.equal(events[1].props.id, 'p1');
  assert.equal(JSON.parse(a.exportJson()).length, 3);
  a.clear();
  assert.equal(a.count(), 0);
  pass('analytics records, counts, exports, clears');

  // 2. Queue caps at MAX_EVENTS (500), keeping the newest.
  const b = createAnalytics(memoryStorage());
  for (let i = 0; i < 600; i++) b.track('filler', { i });
  const kept = b.getEvents();
  assert.equal(kept.length, 500);
  assert.equal(kept[0].props.i, 100); // oldest 100 dropped
  assert.equal(kept[499].props.i, 599);
  pass('analytics queue caps at 500 keeping newest');

  // 3. Garbage input rejected; corrupted storage tolerated; failures silent.
  const c = createAnalytics(memoryStorage());
  assert.equal(c.track(''), null);
  assert.equal(c.track(null), null);
  // Permanently-corrupt reads: every getItem returns invalid JSON.
  const broken = { getItem: () => 'not json', setItem: () => {}, removeItem: () => {} };
  const d = createAnalytics(broken);
  assert.equal(d.count(), 0);           // corrupted queue tolerated
  assert.doesNotThrow(() => d.track('still_works')); // never throws
  assert.equal(d.count(), 0);           // reads stay corrupt; writes are best-effort
  pass('analytics tolerates bad input and corrupted storage without throwing');

  // 4. Completeness scoring is ordered, bounded, and numeric.
  const empty = computeProfileCompleteness({});
  const full = computeProfileCompleteness({
    displayName: 'Aaliyah', bio: 'Salam', city: 'Chicago', country: 'US',
    sect: 'shia', religiosity: 'devout', prayer: 'five', education: 'masters',
    maritalStatus: 'never', children: 'none', intentions: 'marriage',
  });
  assert.equal(typeof empty, 'number');
  assert.ok(empty < full, `empty (${empty}) should score below filled (${full})`);
  assert.ok(full > 0 && full <= 100);
  pass(`completeness scoring: empty=${empty}, filled=${full}`);

  // 5. Segmented DOB: a PARTIAL pick must survive (2026-11-13 P0 regression
  // guard — the first segmented picker derived the parts from the assembled
  // ISO string, so picking Day alone wrote '' and the select snapped back
  // to its placeholder; the trio could never be completed and signup was
  // blocked on web + both apps).
  let parts = applyDobPart(emptyDobParts(), 'day', '15');
  assert.deepEqual(parts, { day: '15', month: '', year: '' });
  assert.equal(dobIso(parts), ''); // not a date yet — but the pick is KEPT
  parts = applyDobPart(parts, 'month', '09');
  assert.deepEqual(parts, { day: '15', month: '09', year: '' });
  parts = applyDobPart(parts, 'year', '1992');
  assert.equal(dobIso(parts), '1992-09-15'); // assembles only when complete
  pass('DOB partial picks survive and assemble when complete');

  // 6. DOB day clamp follows the NEW parts, leap years included.
  let feb = applyDobPart({ day: '31', month: '01', year: '1998' }, 'month', '02');
  assert.equal(feb.day, '28'); // 1998 is not a leap year
  feb = applyDobPart({ day: '31', month: '01', year: '' }, 'month', '02');
  assert.equal(feb.day, '29'); // no year yet — February allows 29
  feb = applyDobPart(feb, 'year', '1999');
  assert.equal(feb.day, '28'); // the year pick re-clamps
  assert.equal(daysInMonth('2000', '02'), 29);
  pass('DOB day clamps against the new month/year');

  // 7. DOB draft restore: stored parts win; a legacy draft carrying only a
  // complete dateOfBirth (the buggy build could save nothing else) splits.
  assert.deepEqual(dobPartsFromDraft({ dobDay: '05', dobMonth: '', dobYear: '' }), { day: '05', month: '', year: '' });
  assert.deepEqual(dobPartsFromDraft({ dateOfBirth: '1992-09-10' }), { day: '10', month: '09', year: '1992' });
  assert.deepEqual(dobPartsFromDraft(null), { day: '', month: '', year: '' });
  assert.equal(dobIso(splitDobParts('1992-09-10')), '1992-09-10');
  pass('DOB draft restore: parts kept, legacy ISO drafts split');

  // 8. Filtered browse is faceted navigation, not a landing page (GSC
  // 2026-11-08: 29 /profiles?… variants under "Crawled – not indexed" and
  // "Soft 404"). Any real query string on /profiles → noindex, follow with
  // the browse title kept; the clean route stays indexable; a bare "?"
  // changes nothing; queries on other routes are ignored; the canonical
  // never carries the query.
  const cleanBrowse = resolveMeta('/profiles');
  assert.equal(cleanBrowse.index, true);
  const filtered = resolveMeta('/profiles', '?city=Leeds');
  assert.equal(filtered.index, false);
  assert.equal(filtered.robots, 'noindex, follow');
  assert.equal(filtered.title, cleanBrowse.title);
  assert.equal(resolveMeta('/profiles/', '?country=Iran').index, false);
  assert.equal(resolveMeta('/profiles', '?').index, true);
  assert.equal(resolveMeta('/profiles', '').index, true);
  assert.equal(resolveMeta('/blog', '?utm_source=x').index, true);
  assert.equal(canonicalFor('/profiles'), 'https://shiarishta.com/profiles/');
  pass('filtered browse: noindex+follow with clean canonical, clean route indexable');

  fs.mkdirSync('C:/Users/Mitchell/AppData/Local/Temp/member-audit', { recursive: true });
  fs.writeFileSync('C:/Users/Mitchell/AppData/Local/Temp/member-audit/unit-tests.json',
    JSON.stringify({ passed: results, ts: new Date().toISOString() }, null, 2));
  console.log(`ALL PASS: ${results.length} unit checks`);
})().catch(e => { console.error(e); process.exitCode = 1; });

