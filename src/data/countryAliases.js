/**
 * Country name variations for SEO — each country's alternate names get
 * woven into the location page as keyword variations, e.g.:
 *   "Shia Rishta in USA" / "Shia Rishta in United States" / "Shia Rishta in America"
 *
 * Keyed by lowercase slug. Falls back to just the display name when unknown.
 */
export const COUNTRY_ALIASES = {
  'usa': ['United States', 'America'],
  'united-states': ['USA', 'America'],
  'america': ['USA', 'United States'],
  'uk': ['United Kingdom', 'Britain', 'England'],
  'united-kingdom': ['UK', 'Britain', 'England'],
  'uae': ['United Arab Emirates'],
  'united-arab-emirates': ['UAE'],
  'saudi-arabia': ['Saudi', 'KSA'],
  'south-africa': ['South Africa', 'SA'],
  'new-zealand': ['NZ'],
  'sri-lanka': ['Sri Lanka'],
};

export function countryAliases(slug, displayName) {
  const key = slug.toLowerCase();
  const aliases = COUNTRY_ALIASES[key];
  if (aliases && aliases.length) return aliases;
  // Unknown country: no aliases, just the display name itself.
  return [];
}
