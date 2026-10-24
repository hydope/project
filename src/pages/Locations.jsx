import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../layouts/LandingLayout';
import Seo from '../components/Seo';
import { usePageTitle } from '../lib/usePageTitle';
import { CITIES, COUNTRIES } from '../data/locationSeo';
import { TAG_PLACES, tagPagesForPlace } from '../data/tagLandingPages';
import snapshot from '../data/locationSnapshot.json';
import { MapPin, Globe2, Search, X, Users, ArrowRight, ArrowLeft } from 'lucide-react';

/**
 * /locations — the location hub.
 *
 * Every /city/* and /country/* page used to be an orphan: in the sitemap with
 * unique metadata, reachable from nothing (the CityPage breadcrumb even linked
 * here, to a page that did not exist — a 404). This hub fixes that: one page
 * that links every curated location, itself linked from the primary nav, so
 * the whole cluster is reachable in two clicks from the homepage.
 *
 * All curated locations are listed (see locationSeo.js) — ones with members
 * show their count, ones without invite the first profile.
 */
export default function Locations() {
  const [query, setQuery] = useState('');
  usePageTitle('Shia Matrimony by City & Country | Shia Rishta');

  const cities = useMemo(() => {
    const counts = snapshot?.cities || {};
    return CITIES
      .map((c) => ({ ...c, count: counts[c.slug] || 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, []);

  const countries = useMemo(() => {
    const counts = snapshot?.countries || {};
    return COUNTRIES
      .map((c) => ({ ...c, count: counts[c.slug] || 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, []);

  const q = query.trim().toLowerCase();
  const matches = (name, extra = '') =>
    !q || name.toLowerCase().includes(q) || extra.toLowerCase().includes(q);

  const filteredCities = cities.filter((c) => matches(c.name, `${c.country} ${c.slug}`));
  const filteredCountries = countries.filter((c) => matches(c.name, c.slug));
  const totalResults = filteredCities.length + filteredCountries.length;

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  return (
    <Layout>
      <Seo />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-xs mb-6" style={{ color: 'var(--color-ink-tertiary)' }} aria-label="Breadcrumb">
          <Link to="/" className="hover:underline">Home</Link>
          {' / '}
          <span style={{ color: 'var(--color-ink)' }} aria-current="page">Locations</span>
        </nav>

        {/* Hero */}
        <header
          className="mb-8 p-8 md:p-10 rounded-3xl relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, var(--color-primary-subtle) 0%, var(--color-surface) 100%)', border: '1px solid var(--color-border)' }}
        >
          <div className="relative z-10 max-w-2xl">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--color-primary)' }}>
              <MapPin className="w-4 h-4" aria-hidden="true" /> Find Shia rishta near you
            </p>
            <h1 className="text-3xl md:text-4xl font-bold mb-3" style={{ color: 'var(--color-ink)' }}>
              Shia matrimony by location
            </h1>
            <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--color-ink-secondary)' }}>
              Every city and country below is a real Shia community with its own page.
              Search for your city or country — each page links straight to live,
              verified profiles there, or invites the first profile where none exist yet.
            </p>

            {/* Search */}
            <div className="relative">
              <label htmlFor="location-search" className="sr-only">Search cities and countries</label>
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-ink-tertiary)' }} aria-hidden="true" />
              <input
                id="location-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a city or country — try “Chicago” or “Canada”…"
                autoComplete="off"
                className="w-full rounded-2xl pl-12 pr-12 py-3.5 text-base outline-none transition-shadow"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-ink)',
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 hover:opacity-80"
                  style={{ color: 'var(--color-ink-tertiary)' }}
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              )}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--color-ink-tertiary)' }} role="status" aria-live="polite">
              {q
                ? totalResults > 0
                  ? `${plural(totalResults, 'location', 'locations')} matching “${query.trim()}”`
                  : `No locations matching “${query.trim()}”`
                : `${plural(cities.length, 'city', 'cities')} · ${plural(countries.length, 'country', 'countries')} with Shia communities`}
            </p>
          </div>
        </header>

        {totalResults === 0 ? (
          /* Empty state — honest: nobody there yet */
          <section className="text-center py-16 px-6 rounded-3xl" style={{ border: '1px dashed var(--color-border)' }}>
            <MapPin className="w-10 h-10 mx-auto mb-4" style={{ color: 'var(--color-ink-tertiary)' }} aria-hidden="true" />
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-ink)' }}>
              No Shia Rishta members in “{query.trim()}” yet
            </h2>
            <p className="text-sm max-w-md mx-auto mb-6" style={{ color: 'var(--color-ink-secondary)' }}>
              We list every city and country with a real Shia community — this search
              found no match. Join free and be the first, or browse every profile
              on the platform.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                to="/auth/register"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white"
                style={{ background: 'var(--color-primary)' }}
              >
                Join free <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link
                to="/profiles"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-ink)' }}
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Browse all profiles
              </Link>
            </div>
          </section>
        ) : (
          <>
            {/* Cities */}
            {filteredCities.length > 0 && (
              <section aria-labelledby="cities-heading" className="mb-12">
                <div className="flex items-baseline justify-between mb-4">
                  <h2 id="cities-heading" className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--color-ink)' }}>
                    <MapPin className="w-5 h-5" style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
                    Cities
                  </h2>
                  <span className="text-xs" style={{ color: 'var(--color-ink-tertiary)' }}>
                    {plural(filteredCities.length, 'city', 'cities')}
                  </span>
                </div>
                <ul className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))' }}>
                  {filteredCities.map((c) => (
                    <li key={c.slug}>
                      <Link
                        to={`/city/${c.slug}`}
                        className="group flex flex-col h-full rounded-2xl p-5 transition-transform hover:-translate-y-0.5"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <p className="font-bold text-base" style={{ color: 'var(--color-ink)' }}>{c.name}</p>
                            <p className="text-xs" style={{ color: 'var(--color-ink-tertiary)' }}>{c.country}</p>
                          </div>
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
                            style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}
                          >
                            <Users className="w-3.5 h-3.5" aria-hidden="true" />
                            {c.count > 0 ? plural(c.count, 'profile', 'profiles') : 'Be the first'}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed flex-1" style={{ color: 'var(--color-ink-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {c.note}
                        </p>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold mt-3" style={{ color: 'var(--color-primary)' }}>
                          View {c.name} profiles
                          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Countries */}
            {filteredCountries.length > 0 && (
              <section aria-labelledby="countries-heading" className="mb-12">
                <div className="flex items-baseline justify-between mb-4">
                  <h2 id="countries-heading" className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--color-ink)' }}>
                    <Globe2 className="w-5 h-5" style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
                    Countries
                  </h2>
                  <span className="text-xs" style={{ color: 'var(--color-ink-tertiary)' }}>
                    {plural(filteredCountries.length, 'country', 'countries')}
                  </span>
                </div>
                <ul className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))' }}>
                  {filteredCountries.map((c) => (
                    <li key={c.slug}>
                      <Link
                        to={`/country/${c.slug}`}
                        className="group flex flex-col h-full rounded-2xl p-5 transition-transform hover:-translate-y-0.5"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="font-bold text-base" style={{ color: 'var(--color-ink)' }}>{c.name}</p>
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
                            style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}
                          >
                            <Users className="w-3.5 h-3.5" aria-hidden="true" />
                            {c.count > 0 ? plural(c.count, 'profile', 'profiles') : 'Be the first'}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed flex-1" style={{ color: 'var(--color-ink-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {c.note}
                        </p>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold mt-3" style={{ color: 'var(--color-primary)' }}>
                          View {c.name} profiles
                          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {/* FAQ — honest, answerable from the page itself */}
        <section aria-labelledby="locations-faq" className="mb-12 max-w-3xl">
          <h2 id="locations-faq" className="text-xl font-bold mb-4" style={{ color: 'var(--color-ink)' }}>
            Location questions
          </h2>
          <div className="space-y-3">
            {[
              {
                q: 'Why isn’t my city listed?',
                a: 'This directory lists only places that currently have at least one member. If your city isn’t here, nobody on the platform lives there yet — join free and you’ll be the first.',
              },
              {
                q: 'What happens when I open a city page?',
                a: 'Each city and country page links straight to live, filtered profiles for that place — real members you can express interest in, not a static list.',
              },
              {
                q: 'Can I search across the whole platform instead?',
                a: 'Yes. The full directory lets you filter by city, country, age, sect and more, whatever your location.',
              },
            ].map((f) => (
              <details key={f.q} className="rounded-2xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <summary className="text-sm font-semibold cursor-pointer" style={{ color: 'var(--color-ink)' }}>{f.q}</summary>
                <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--color-ink-secondary)' }}>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Popular searches — one primary tag page per tag place (2026-10-24
            indexing fix). Tag pages were sitemap-only orphans; this hub is
            linked from the homepage, so one click here reaches every tag
            family, and sibling links on tag pages reach the rest. */}
        <section aria-labelledby="popular-searches-heading" className="mb-12">
          <h2 id="popular-searches-heading" className="text-xl font-bold mb-4" style={{ color: 'var(--color-ink)' }}>
            Popular Shia rishta searches
          </h2>
          <div className="flex flex-wrap gap-2">
            {TAG_PLACES.map((place) => {
              const pages = tagPagesForPlace(place.slug) || [];
              const primary = pages[0];
              if (!primary) return null;
              return (
                <Link key={place.slug} to={`/${primary.slug}`} className="px-3 py-1.5 rounded-full text-xs font-medium hover:underline"
                  style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}>
                  {primary.phrase}
                </Link>
              );
            })}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="text-center py-10 px-6 rounded-3xl" style={{ background: 'linear-gradient(135deg, var(--color-primary-subtle) 0%, var(--color-surface) 100%)', border: '1px solid var(--color-border)' }}>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-ink)' }}>Not bound to one place?</h2>
          <p className="text-sm mb-5" style={{ color: 'var(--color-ink-secondary)' }}>
            Browse every verified Shia profile on the platform, wherever they live.
          </p>
          <Link
            to="/profiles"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            Browse all profiles <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </section>
      </main>
    </Layout>
  );
}
