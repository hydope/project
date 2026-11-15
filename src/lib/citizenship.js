// Citizenship free-text entries (Syed's ask, 2026-11-14): the picker
// lists countries, but a member whose citizenship is not listed — or
// who holds one the list spells differently — can type it instead.
// Storage is a comma-joined string, so a written value may not contain
// a comma; it is otherwise stored exactly like a listed country, and
// browse filters pick it up from the database like any other value.

export const MAX_CITIZENSHIPS = 6;
export const MAX_CITIZENSHIP_LENGTH = 40;

// Clean a typed citizenship, or return null when it cannot be one:
// letters (any alphabet), spaces, dots, apostrophes and hyphens only.
export function normalizeCitizenship(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s || s.length > MAX_CITIZENSHIP_LENGTH) return null;
  if (s.includes(',')) return null;
  if (!/^[\p{L}][\p{L} .'-]*$/u.test(s)) return null;
  // Display polish: an all-lowercase word reads as a typo on a profile,
  // so capitalize its first letter; words the member capitalized on
  // purpose (UAE, McLeod) are left exactly as typed.
  return s.split(' ').map(w => (/^[\p{Ll}]+$/u.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}

// Returns the new list with the entry added, or null when the entry is
// invalid, a duplicate (of a selected value, or — case-insensitively —
// of a listed country, whose canonical spelling wins), or the list is
// already at the cap.
export function addCitizenship(list, raw, known = []) {
  const v = normalizeCitizenship(raw);
  if (!v) return null;
  const canonical = known.find(c => c.toLowerCase() === v.toLowerCase()) || v;
  if (list.some(c => c.toLowerCase() === canonical.toLowerCase())) return null;
  if (list.length >= MAX_CITIZENSHIPS) return null;
  return [...list, canonical];
}
