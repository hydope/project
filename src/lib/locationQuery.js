// Builds the /api/profiles query params for a /city/:slug or /country/:slug
// page.
//
// Curated slugs can encode MORE than the place name: 'hyderabad-india' and
// 'hyderabad-pakistan' are two different cities that share a name, so their
// curated entries carry { name: 'Hyderabad', country: 'India' | 'Pakistan' }.
// Querying with the slug-derived display name ("Hyderabad India") asks the
// API for a city literally named that — its slug matches no stored city —
// so the page rendered empty for a city with members, noindexed itself,
// and stamped its tab "Page Not Found" (found live 2026-11-16). Curated
// entries therefore query by their real stored fields; non-curated
// (dynamic) slugs keep the display-name query, which round-trips because
// the API matches location filters by slug.
export function locationQueryParams({ isCountry, curatedEntry, displayName }) {
  if (curatedEntry) {
    if (!isCountry && curatedEntry.country) {
      return { city: curatedEntry.name, country: curatedEntry.country };
    }
    return isCountry
      ? { country: curatedEntry.name }
      : { city: curatedEntry.name };
  }
  return isCountry ? { country: displayName } : { city: displayName };
}
