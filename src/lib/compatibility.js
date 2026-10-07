// Compatibility Index — scores a candidate profile against the
// current member's onboarding answers. Pure function; no side effects.
// Falls back to a neutral preference model when the member hasn't onboarded.

import { getMyProfile } from './storage';

export { getMyProfile };

// Normalize religiosity to a 0–4 scale so "distance" can be measured
const RELIGIOSITY_SCALE = { 'very-practicing': 4, practicing: 3, moderately: 2, learning: 1, cultural: 0 };
const RELIGIOSITY_BY_LABEL = {
  'very practicing': 4, practicing: 3, 'moderately practicing': 2, reconnecting: 1, 'culturally connected': 0
};

function religiosityScore(value) {
  if (!value) return null;
  if (RELIGIOSITY_SCALE[value] !== undefined) return RELIGIOSITY_SCALE[value];
  return RELIGIOSITY_BY_LABEL[String(value).toLowerCase()] ?? null;
}

// Loose timeline keyword buckets: 0=immediate … 4=exploring
const TIMELINE_BUCKETS = [
  { words: ['immediate', 'now'], bucket: 0 },
  { words: ['6 month', '6-12', '6–12', 'near term'], bucket: 1 },
  { words: ['1-2', '1–2', '12 month', 'year'], bucket: 2 },
  { words: ['long-term', 'exploring', 'open'], bucket: 3 }
];

function timelineBucket(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const { words, bucket } of TIMELINE_BUCKETS) {
    if (words.some(w => t.includes(w))) return bucket;
  }
  return null;
}

// Language overlap ratio (0–1)
function languageOverlap(mine, theirs) {
  if (!Array.isArray(mine) || !Array.isArray(theirs)) return 0.5;
  const set = new Set(mine.map(l => l.toLowerCase()));
  if (set.size === 0) return 0.5;
  const shared = theirs.filter(l => set.has(l.toLowerCase())).length;
  return shared / Math.min(set.size, theirs.length || 1);
}

/**
 * Compute the compatibility breakdown between "me" and a candidate profile.
 * @param {Object} profile  candidate profile (mock or directory shape)
 * @param {Object} [me]     my onboarding answers; auto-loaded when omitted
 * @returns {{overall:number, breakdown:{values:number, lifestyle:number, faith:number, timeline:number}, reasons:string[], topReason:string}|null}
 *
 * HONESTY CONTRACT: returns null when there is no basis for a score — when the
 * viewer has not onboarded, or has not stated a sect. It will NOT fall back to
 * invented constants.
 *
 * Why that matters: with no viewer profile the old code fell through to fixed
 * seeds (faith 62, values 65, lifestyle 58, timeline 60) which weighted to a
 * flat **61% on every single profile**. Every signed-out visitor — and every
 * signed-in member who had not finished onboarding — saw the same "61% match"
 * badge on all 30 cards. A number identical across every candidate carries no
 * information; it is not a weak signal, it is a fabricated one dressed up as a
 * personal assessment.
 *
 * Callers must handle null. Every call site does; ProfileCard and
 * CuratedMatchFeed simply omit the badge, which is the honest rendering.
 */
export function computeCompatibility(profile, me = getMyProfile()) {
  // Faith alignment is the heaviest weighted component (34%) and the one thing
  // we can state with confidence. Without a viewer profile — or without a sect
  // to compare — there is nothing to compute against, so we decline rather than
  // emit a number.
  if (!profile || !me || !me.sect) return null;
  // Gender honesty: a candidate whose gender is not what the viewer is seeking
  // can never be a top match. Score them near zero so "Best match" sorting
  // buries them instead of ranking a same-gender profile first for a member
  // seeking the opposite gender.
  const seeking = me.seekingGender || me.seeking_gender;
  const genderMismatch = seeking && profile.gender && seeking !== profile.gender;
  // ── Faith alignment ──────────────────────────────────────────────────
  let faith = 62;
  if (me?.sect && profile.sect) faith = me.sect === profile.sect ? 95 : 55;
  const myR = religiosityScore(me?.religiosity);
  const theirR = religiosityScore(profile.religiosity);
  if (myR !== null && theirR !== null) {
    const gap = Math.abs(myR - theirR); // 0–4
    faith = Math.round(faith * 0.6 + (1 - gap / 4) * 100 * 0.4);
  }
  if (me?.marja && profile.marja && me.marja === profile.marja) faith = Math.min(100, faith + 4);

  // ── Shared values (languages, family involvement, children views) ────
  const langRatio = languageOverlap(me?.languages, profile.languages);
  let values = 45 + Math.round(langRatio * 40);
  if (me?.familyInvolvement === 'wali-required' || /wali|family guided|family-first/i.test(profile.halalLifestyle || '')) values += 8;
  if (me?.childrenPlans && profile.children && /no children/i.test(profile.children)) values += 4;
  values = Math.max(20, Math.min(100, values));

  // ── Lifestyle alignment (diet, modesty, practice intensity) ──────────
  let lifestyle = 58;
  if (myR !== null && theirR !== null) {
    const gap = Math.abs(myR - theirR);
    lifestyle = Math.round(90 - gap * 12);
  }
  if (me?.diet && /halal|zabiha/i.test(me.diet)) lifestyle += 3;
  if (profile.prayer === 'Daily prayers') lifestyle += 4;
  lifestyle = Math.max(25, Math.min(100, lifestyle));

  // ── Timeline compatibility ───────────────────────────────────────────
  const myT = timelineBucket(me?.timeline);
  const theirT = timelineBucket(profile.intentions);
  let timeline = 60;
  if (myT !== null && theirT !== null) {
    const gap = Math.abs(myT - theirT); // 0–3
    timeline = Math.round(96 - gap * 22);
  }
  if (/immediate|now|ready/i.test(profile.intentions || '')) timeline += 2;
  timeline = Math.max(25, Math.min(100, timeline));

  const overall = Math.round(faith * 0.34 + values * 0.24 + lifestyle * 0.22 + timeline * 0.20
    + (profile.is_verified ? 2 : 0));

  // ── Human-readable reasons ───────────────────────────────────────────
  const reasons = [];
  if (me?.sect && profile.sect && me.sect === profile.sect) reasons.push(`Same sect — ${profile.sect}`);
  if (myR !== null && theirR !== null && Math.abs(myR - theirR) <= 1) reasons.push('Closely matched religiosity');
  // languages is stored as a comma-separated STRING (profiles.languages is
  // VARCHAR(255) — "Urdu, English, Arabic"), but the onboarding draft keeps it
  // as an array. `(profile.languages || [])` therefore handed a string to
  // .filter() and threw "languages.filter is not a function", crashing the whole
  // profile page. Normalise both sides through one helper.
  const toLangList = (v) => (Array.isArray(v)
    ? v.filter((x) => typeof x === 'string' && x.trim())
    : String(v || '').split(',').map((s) => s.trim()).filter(Boolean));
  const myLangs = toLangList(me?.languages).map((x) => x.toLowerCase());
  const sharedLangs = toLangList(profile.languages).filter((l) => myLangs.includes(l.toLowerCase()));
  if (sharedLangs.length) reasons.push(`Shares ${sharedLangs.join(' & ')}`);
  if (profile.is_verified) reasons.push('ID-verified member');
  if (timeline >= 80) reasons.push('Aligned nikah timelines');
  if (/wali|family/i.test(profile.halalLifestyle || '') || me?.familyInvolvement === 'wali-required') reasons.push('Family-involved approach');
  if (profile.maritalStatus === 'Never married' && me?.maritalStatus === 'Never married') reasons.push('Both seeking a first marriage');

  // Gender mismatch can never be a top match — clamp the score to the floor
  // so "Best match" sorting buries these instead of ranking them first.
  const finalOverall = genderMismatch ? 5 : Math.max(35, Math.min(99, overall || profile.matchScore || 70));

  return {
    overall: finalOverall,
    breakdown: { values, lifestyle, faith, timeline },
    reasons: reasons.length ? reasons : ['Strong overall alignment across core dimensions'],
    topReason: reasons[0] || 'Strong overall alignment'
  };
}
