import { useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import Layout from '../layouts/LandingLayout';
import { usePageTitle } from '../lib/usePageTitle';
import Seo from '../components/Seo';
import { http } from '../lib/api/transport';
import { MapPin, Users, Heart, ShieldCheck } from 'lucide-react';
import ProfileCard from '../components/ProfileCard';
import { countryAliases } from '../data/countryAliases';

/**
 * Location landing page — city or country.
 *
 * One canonical URL per location (/city/hyderabad, /country/usa), with
 * 11+ keyword variations spread across title, H1, H2s, meta description,
 * and content. Countries also get their alternate names woven in:
 * "Shia Rishta in USA" / "Shia Rishta in United States" / "Shia Rishta in America".
 *
 * UI mirrors the Profiles browse page: hero with live stats, profile grid,
 * SEO content sections, CTA.
 */
export default function CityPage() {
  const { slug } = useParams();
  const location = useLocation();
  const isCountry = location.pathname.startsWith('/country/');
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locationName, setLocationName] = useState('');

  const displayName = slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const kind = isCountry ? 'country' : 'city';
  const aliases = isCountry ? countryAliases(slug, displayName) : [];
  const altName = aliases[0] || null;

  usePageTitle(`Shia Rishta in ${displayName} | Shia Nikah Match`);

  useEffect(() => {
    setLoading(true);
    http.get(`/api/profiles?${kind}=${encodeURIComponent(displayName)}&limit=24`)
      .then(r => {
        const list = Array.isArray(r) ? r : (r.profiles || r.data || []);
        setProfiles(list);
        if (list.length > 0 && list[0][kind]) setLocationName(list[0][kind]);
      })
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  }, [slug, displayName, kind]);

  const name = locationName || displayName;
  const count = profiles.length;

  // Keyword variations — 11 base + country alternate names
  const kw = {
    rishta: `Shia Rishta in ${name}`,
    rishtay: `Shia Rishtay in ${name}`,
    nikah: `Shia Nikah in ${name}`,
    marriage: `Shia Marriage in ${name}`,
    matrimony: `Shia Matrimony in ${name}`,
    brides: `${name} Shia Brides`,
    grooms: `${name} Shia Grooms`,
    shaadi: `Shia Shaadi in ${name}`,
    find: `Find Shia Rishta ${name}`,
    matrimonial: `${name} Shia Matrimonial`,
    match: `Shia Nikah Match ${name}`,
  };
  // Alternate country names, e.g. "Shia Rishta in United States"
  const altKw = aliases.map(a => `Shia Rishta in ${a}`);

  const titleTag = altName
    ? `${kw.rishta} | ${kw.nikah} | Shia Rishta in ${altName}`
    : `${kw.rishta} | ${kw.nikah}, ${kw.marriage} & ${kw.matrimony}`;

  return (
    <Layout>
      <Seo
        title={titleTag}
        description={`${kw.find}. Verified ${kw.nikah.toLowerCase()}, ${kw.marriage.toLowerCase()} and ${kw.matrimony.toLowerCase()} profiles — ${kw.brides} and ${kw.grooms} seeking a serious match. Free to browse.`}
        canonical={`https://shiarishta.com/${isCountry ? 'country' : 'city'}/${slug}`}
      />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-xs mb-6" style={{ color: 'var(--color-ink-tertiary)' }} aria-label="Breadcrumb">
          <Link to="/" className="hover:underline">Home</Link>
          {' / '}
          <Link to="/locations" className="hover:underline">Locations</Link>
          {' / '}
          <span style={{ color: 'var(--color-ink)' }}>{name}</span>
        </nav>

        {/* Hero — mirrors Profiles page header */}
        <header className="mb-8 p-8 rounded-3xl relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, var(--color-primary-subtle) 0%, var(--color-surface) 100%)', border: '1px solid var(--color-border)' }}>
          <div className="relative z-10">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest mb-3"
              style={{ color: 'var(--color-primary)' }}>
              <MapPin className="w-4 h-4" /> {kw.matrimony}
            </p>
            <h1 className="text-3xl md:text-4xl font-bold mb-3" style={{ color: 'var(--color-ink)' }}>
              {kw.nikah}
            </h1>
            <p className="text-sm max-w-2xl leading-relaxed mb-4" style={{ color: 'var(--color-ink-secondary)' }}>
              {kw.find}. Browse verified {name} Shia brides and grooms seeking a serious nikah match.
              Every profile is manually reviewed. Your {name} Shia shaadi starts here — explore {kw.rishtay.toLowerCase()} today.
            </p>
            <div className="flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: 'var(--color-primary)', color: 'white' }}>
                <Users className="w-3.5 h-3.5" /> {count} Profile{count === 1 ? '' : 's'}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-ink-secondary)' }}>
                <ShieldCheck className="w-3.5 h-3.5" /> Verified members
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-ink-secondary)' }}>
                <Heart className="w-3.5 h-3.5" /> Nikah-first
              </span>
            </div>
          </div>
        </header>

        {/* Profile grid — same as Profiles page */}
        {loading ? (
          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {[0,1,2,3,4,5].map(i => <div key={i} className="skeleton h-80 rounded-2xl" />)}
          </div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-16 px-6 rounded-3xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <Users className="w-14 h-14 mx-auto mb-4" style={{ color: 'var(--color-ink-tertiary)' }} />
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-ink)' }}>
              {kw.marriage} — Be the First
            </h2>
            <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: 'var(--color-ink-secondary)' }}>
              No {name} Shia matrimonial profiles yet. Create your free profile and put {name} on the map.
            </p>
            <Link to="/auth/register" className="btn btn-primary">Create free account</Link>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold" style={{ color: 'var(--color-ink)' }}>
                {kw.matrimony}
              </h2>
              <Link to="/profiles" className="text-sm font-semibold hover:underline" style={{ color: 'var(--color-primary)' }}>
                View all profiles →
              </Link>
            </div>
            <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {profiles.map(p => <ProfileCard key={p.id} profile={p} />)}
            </div>
          </>
        )}

        {/* SEO content — keyword variations + country aliases */}
        <section className="mt-12 grid md:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--color-ink)' }}>
              {kw.marriage}
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-ink-secondary)' }}>
              Looking for a Shia marriage in {name}? ShiaRishta connects verified Shia Muslims
              in {name} seeking nikah. Every {name} Shia matrimonial profile is manually reviewed,
              photos stay private until you choose to share, and conversations are respectful
              from the first salaam.
              {altKw.length > 0 && ` Whether you search for ${altKw.join(', ')}, you'll find the same trusted ${name} community here.`}
            </p>
          </div>
          <div className="p-6 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--color-ink)' }}>
              {kw.brides} & {kw.grooms}
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-ink-secondary)' }}>
              Browse {name} Shia brides and {name} Shia grooms in one place. Filter by age,
              education, profession, and religiosity to find a {name} Shia shaadi match who
              shares your values. Creating your own profile is free and takes minutes.
            </p>
          </div>
        </section>

        {/* Country aliases as visible tags — also crawlable */}
        {altKw.length > 0 && (
          <section className="mt-6 p-6 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <h2 className="text-base font-bold mb-3" style={{ color: 'var(--color-ink)' }}>
              Also searched as
            </h2>
            <div className="flex flex-wrap gap-2">
              {[kw.rishta, ...altKw].map((t, i) => (
                <span key={i} className="px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}>
                  {t}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="mt-6 p-8 rounded-3xl text-center" style={{ background: 'var(--color-primary-subtle)', border: '1px solid var(--color-border)' }}>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-ink)' }}>
            Your {kw.match} Starts Here
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--color-ink-secondary)' }}>
            Join free — browse {name} profiles, express interest, and begin your nikah journey.
          </p>
          <Link to="/auth/register" className="btn btn-primary">Create free account</Link>
        </section>
      </main>
    </Layout>
  );
}
