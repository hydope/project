import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../layouts/LandingLayout';
import { usePageTitle } from '../lib/usePageTitle';
import Seo from '../components/Seo';
import { http } from '../lib/api/transport';
import { MapPin, Users } from 'lucide-react';
import ProfileCard from '../components/ProfileCard';

/**
 * City landing page — indexable, AI-crawlable location page.
 *
 * Every profile's city links here (e.g. /city/hyderabad). The page has a
 * unique SEO title per city, descriptive content for crawlers, and lists
 * live profiles from that city. The prerender script also generates a static
 * version for bots; this React version serves interactive users.
 */
export default function CityPage() {
  const { slug } = useParams();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cityName, setCityName] = useState('');

  // Derive display name from slug: "new-york" -> "New York"
  const displayName = slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  usePageTitle(`Shia Matrimony in ${displayName} | Shia Rishta`);

  useEffect(() => {
    setLoading(true);
    // Fetch profiles filtered by city. The API matches city names case-insensitively.
    http.get(`/api/profiles?city=${encodeURIComponent(displayName)}&limit=24`)
      .then(r => {
        const list = Array.isArray(r) ? r : (r.profiles || r.data || []);
        setProfiles(list);
        if (list.length > 0 && list[0].city) setCityName(list[0].city);
      })
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  }, [slug, displayName]);

  const name = cityName || displayName;

  return (
    <Layout>
      <Seo
        title={`Shia Matrimony in ${name} — Shia Rishta | Shia Rishta`}
        description={`Find verified Shia matrimonial profiles in ${name}. Browse Shia brides and grooms in ${name} seeking nikah. Free to browse.`}
        canonical={`https://shiarishta.com/city/${slug}`}
      />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <nav className="text-xs mb-4" style={{ color: 'var(--color-ink-tertiary)' }}>
          <Link to="/" className="hover:underline">Home</Link>
          {' / '}
          <Link to="/locations" className="hover:underline">Locations</Link>
          {' / '}
          <span style={{ color: 'var(--color-ink)' }}>{name}</span>
        </nav>

        <header className="mb-8">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: 'var(--color-primary)' }}>
            <MapPin className="w-3.5 h-3.5" /> Shia Matrimony
          </p>
          <h1 className="text-3xl font-bold mb-3" style={{ color: 'var(--color-ink)' }}>
            Shia Rishta in {name}
          </h1>
          <p className="text-sm max-w-2xl leading-relaxed" style={{ color: 'var(--color-ink-secondary)' }}>
            Find verified Shia matrimonial profiles in {name}. Every profile below is from
            a member in {name} seeking a serious nikah match. Browse {name} Shia brides and
            grooms, filter by what matters to you, and connect with respect.
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
              No profiles in {name} yet
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--color-ink-secondary)' }}>
              Be the first — create your free profile and put {name} on the map.
            </p>
            <Link to="/auth/register" className="btn btn-primary">Create free account</Link>
          </div>
        ) : (
          <>
            <p className="text-sm mb-4" style={{ color: 'var(--color-ink-secondary)' }}>
              {profiles.length} profile{profiles.length === 1 ? '' : 's'} in {name}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {profiles.map(p => <ProfileCard key={p.id} profile={p} />)}
            </div>
          </>
        )}

        <section className="mt-12 p-6 rounded-2xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--color-ink)' }}>
            Shia marriages in {name}
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-ink-secondary)' }}>
            Shia Rishta connects Shia Muslims in {name} for nikah. Whether you're looking for
            a Shia bride or groom in {name}, our verified profiles help you find someone who
            shares your faith, values, and vision for marriage. All profiles are manually
            reviewed, photos are privacy-protected, and conversations stay respectful.
          </p>
        </section>
      </main>
    </Layout>
  );
}
