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

/** Relative time ("2h ago", "3d ago") — falls back to a short date for old items. */
export function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
