/**
 * Display normalization for user-entered location data.
 *
 * Cities and countries are free-text in profiles, so the stored values vary
 * ("Usa", "USA", "usa", "  Dubai "). Rendering them raw produces visible
 * inconsistency ("Baltimore, Usa" on a card vs "Baltimore, USA" on the
 * detail page for the same place). This normalizes for DISPLAY only — the
 * stored data is never mutated.
 */

// Abbreviations that must always render fully uppercased.
const UPPER_ABBREVIATIONS = new Set(['usa', 'uk', 'uae', 'ksa', 'qatar']);

export function formatCountry(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (UPPER_ABBREVIATIONS.has(lower)) return lower.toUpperCase();
  // Title-case each word: "united states" -> "United States".
  return s
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

export function formatCity(raw) {
  return String(raw || '').trim();
}
