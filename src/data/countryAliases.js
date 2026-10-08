/**
 * Country name variations for SEO — each country's alternate names get
 * woven into the location page as keyword variations, e.g.:
 *   "Shia Rishta in USA" / "Shia Rishta in United States" / "Shia Rishta in America"
 *
 * Keyed by lowercase slug. Falls back to just the display name when unknown.
 */
export const COUNTRY_ALIASES = {
  'usa': ['United States', 'America', 'US'],
  'united-states': ['USA', 'America', 'US'],
  'america': ['USA', 'United States'],
  'us': ['USA', 'United States', 'America'],
  'uk': ['United Kingdom', 'Britain', 'England', 'Great Britain'],
  'united-kingdom': ['UK', 'Britain', 'England'],
  'britain': ['UK', 'United Kingdom', 'England'],
  'england': ['UK', 'United Kingdom', 'Britain'],
  'uae': ['United Arab Emirates', 'Emirates'],
  'united-arab-emirates': ['UAE', 'Emirates'],
  'saudi-arabia': ['Saudi', 'KSA', 'Kingdom of Saudi Arabia'],
  'saudi': ['Saudi Arabia', 'KSA'],
  'south-korea': ['Korea', 'Republic of Korea'],
  'korea': ['South Korea'],
  'netherlands': ['Holland', 'Dutch'],
  'holland': ['Netherlands'],
  'new-zealand': ['NZ', 'Aotearoa'],
  'south-africa': ['SA', 'RSA'],
  'sri-lanka': ['Ceylon'],
  'ivory-coast': ["Côte d'Ivoire"],
  "cote-d-ivoire": ['Ivory Coast'],
};

export function countryAliases(slug, displayName) {
  const key = slug.toLowerCase();
  const aliases = COUNTRY_ALIASES[key];
  if (aliases && aliases.length) return aliases;
  return [];
}
