import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../layouts/LandingLayout';
import { usePageTitle } from '../lib/usePageTitle';
import Seo from '../components/Seo';
import { http } from '../lib/api/transport';
import { MapPin, Users } from 'lucide-react';
import ProfileCard from '../components/ProfileCard';

/**
 * City landing page — maximum SEO coverage per city.
 *
 * One canonical URL per city (/city/hyderabad), but 10 keyword variations
 * spread across the title tag, H1, H2s, meta description, and content so the
 * page ranks for every way people search:
 *   1. Shia Rishta in {City}        (title tag)
 *   2. Shia Nikah in {City}         (H1)
 *   3. Shia Marriage in {City}      (H2)
 *   4. Shia Matrimony in {City}     (H2)
 *   5. {City} Shia Brides           (H2)
 *   6. {City} Shia Grooms           (H2)
 *   7. Shia Shaadi in {City}        (content)
 *   8. Find Shia Rishta {City}      (meta description)
 *   9. {City} Shia Matrimonial      (content)
 *  10. Shia Nikah Match {City}      (CTA section)
 */
export default function CityPage() {
  const { slug } = useParams();
  const isCountry = window.location.pathname.startsWith('/country/');
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locationName, setLocationName] = useState('');

  // Derive display name from slug: "new-york" -> "New York"
  const displayName = slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const kind = isCountry ? 'country' : 'city';
  const Kind = isCountry ? 'Country' : 'City';

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

  // 10 SEO keyword variations, adapted for city vs country
  const kw = {
    rishta: `Shia Rishta in ${name}`,
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

  return (
    <Layout>
      <Seo
        title={`${kw.rishta} | ${kw.nikah}, ${kw.marriage} & ${kw.matrimony}`}
        description={`${kw.find}. Verified ${kw.nikah.toLowerCase()}, ${kw.marriage.toLowerCase()} and ${kw.matrimony.toLowerCase()} profiles — ${kw.brides} and ${kw.grooms} seeking a serious match. Free to browse.`}
        canonical={`https://shiarishta.com/${isCountry ? 'country' : 'city'}/${slug}`}
      />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <nav className="text-xs mb-4" style={{ color: 'var(--color-ink-tertiary)' }} aria-label="Breadcrumb">
          <Link to="/" className="hover:underline">Home</Link>
          {' / '}
          <Link to="/locations" className="hover:underline">Locations</Link>
          {' / '}
          <span style={{ color: 'var(--color-ink)' }}>{name}</span>
        </nav>

        <header className="mb-8">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: 'var(--color-primary)' }}>
            <MapPin className="w-3.5 h-3.5" /> {kw.matrimony}
          </p>
          {/* H1 — keyword variation #2 */}
          <h1 className="text-3xl font-bold mb-3" style={{ color: 'var(--color-ink)' }}>
            {kw.nikah}
          </h1>
          <p className="text-sm max-w-2xl leading-relaxed" style={{ color: 'var(--color-ink-secondary)' }}>
            Find verified Shia matrimonial profiles in {name}. Every profile below is from
            a member in {name} seeking a serious nikah match. Browse {name} Shia brides and
            grooms, filter by what matters to you, and connect with respect.
            Your {name} Shia shaadi starts with a single verified rishta.
          </p>
        </header>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[0,1,2,3].map(i => <div key={i} className="skeleton h-64 rounded-2xl" />)}
          </div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--color-ink-tertiary)' }} />
            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-ink)' }}>
              {kw.marriage} — Be the First
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--color-ink-secondary)' }}>
              No {name} Shia matrimonial profiles yet. Create your free profile and put {name} on the map.
            </p>
            <Link to="/auth/register" className="btn btn-primary">Create free account</Link>
          </div>
        ) : (
          <>
            {/* H2 — keyword variation #4 */}
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--color-ink)' }}>
              {kw.matrimony} — {count} Profile{count === 1 ? '' : 's'}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {profiles.map(p => <ProfileCard key={p.id} profile={p} />)}
            </div>
          </>
        )}

        {/* SEO content sections — keyword variations #3, #5, #6, #7, #9 */}
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

        {/* CTA — keyword variation #10 */}
        <section className="mt-6 p-8 rounded-2xl text-center" style={{ background: 'var(--color-primary-subtle)', border: '1px solid var(--color-border)' }}>
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
