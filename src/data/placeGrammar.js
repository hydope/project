/**
 * Place-name grammar for generated copy (2026-11-24 audit E-03, Phase 4B).
 *
 * A handful of country names take the definite article in English — "in
 * the USA", "in the United Kingdom", "in the UAE" — and the programmatic
 * page generators used to emit the bare name everywhere, producing "in
 * USA profiles dekhein" / "Shia matrimony in United States". Generators
 * must route place names through these helpers instead of interpolating
 * the raw name after a preposition.
 *
 * Only names whose article is unambiguous are listed. Ordinary country
 * names (Pakistan, Canada, America, Britain) and every city name pass
 * through unchanged.
 */
const THE_PLACES = new Set([
  'usa', 'u.s.a.', 'us', 'u.s.', 'united states', 'united states of america',
  'uk', 'u.k.', 'united kingdom',
  'uae', 'u.a.e.', 'united arab emirates',
  'netherlands', 'the netherlands',
  'philippines', 'the philippines',
  'maldives', 'the maldives',
  'bahamas', 'the bahamas',
  'gambia', 'the gambia',
  'seychelles', 'the seychelles',
  'comoros', 'the comoros',
  'czech republic', 'dominican republic', 'central african republic',
  'marshall islands', 'solomon islands', 'faroe islands', 'cayman islands',
  'british virgin islands', 'us virgin islands', 'u.s. virgin islands',
]);

/** "United States" → "the United States"; "Karachi" → "Karachi". */
export function placeWithArticle(name) {
  const n = String(name || '').trim();
  if (!n) return n;
  return THE_PLACES.has(n.toLowerCase()) ? `the ${n}` : n;
}

/** "in the USA" / "in Karachi" — the preposition phrase generators need. */
export function inPlace(name) {
  return `in ${placeWithArticle(name)}`;
}
