// ── Segmented date-of-birth state logic (pure, unit-tested) ───────────────
// The register form's DOB is picked as three independent parts (day / month
// / year). The parts are the source of truth; the ISO YYYY-MM-DD string the
// API expects is DERIVED from them. The first version of the segmented
// picker did it the other way round — it stored only the assembled string
// and derived the parts back out of it. A partial pick (day chosen, month
// and year still empty) assembles to '', so the parts derived back were
// empty too and every partial pick silently snapped back to the
// placeholder: the date could never be completed and signup was blocked
// (2026-11-13 P0). These helpers are extracted so scripts/test-unit.cjs can
// pin the partial-pick behaviour in CI.

// Days that exist in the chosen month. With no month chosen allow 31; with
// a month but no year yet, February allows 29 — the year pick re-clamps.
export function daysInMonth(year, month) {
  if (!month) return 31;
  if (!year) return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Number(month) - 1];
  return new Date(Number(year), Number(month), 0).getDate();
}

export function emptyDobParts() {
  return { day: '', month: '', year: '' };
}

// Split a complete ISO date into parts; anything else yields empty parts.
export function splitDobParts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof iso === 'string' ? iso : '');
  return m ? { year: m[1], month: m[2], day: m[3] } : emptyDobParts();
}

// The derived ISO string: present only when all three parts are chosen.
export function dobIso(parts) {
  return parts.year && parts.month && parts.day ? `${parts.year}-${parts.month}-${parts.day}` : '';
}

// Apply ONE part change, leaving the other parts untouched, then clamp the
// day into the resulting month/year so an impossible date (31 February,
// 29 Feb in a non-leap year) can never be assembled.
export function applyDobPart(parts, part, value) {
  const next = {
    day: parts.day || '',
    month: parts.month || '',
    year: parts.year || '',
    [part]: value,
  };
  if (next.day) {
    const max = daysInMonth(next.year, next.month);
    if (Number(next.day) > max) next.day = String(max).padStart(2, '0');
  }
  return next;
}

// Parts for a restored signup draft. Drafts saved by the current build
// carry the three parts; drafts saved by the buggy build carry only a
// complete dateOfBirth (it could only ever save complete dates), which is
// split back into parts.
export function dobPartsFromDraft(draft) {
  if (!draft || typeof draft !== 'object') return emptyDobParts();
  if (draft.dobDay || draft.dobMonth || draft.dobYear) {
    return {
      day: typeof draft.dobDay === 'string' ? draft.dobDay : '',
      month: typeof draft.dobMonth === 'string' ? draft.dobMonth : '',
      year: typeof draft.dobYear === 'string' ? draft.dobYear : '',
    };
  }
  return splitDobParts(draft.dateOfBirth);
}
