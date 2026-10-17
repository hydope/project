import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Heart, Bookmark, MapPin, Briefcase, Lock, Sparkles } from 'lucide-react';
import VerifiedBadge from './VerifiedBadge';
import { useAuthedImage } from '../lib/api/useAuthedImage';
import { computeCompatibility, getMyProfile } from '../lib/compatibility';
import { formatCity, formatCountry } from '../lib/format';
import { useAuth } from '../lib/auth/AuthContext';
import LoginGate from './LoginGate';
import SampleProfileBadge from './SampleProfileBadge';

function excerptText(value, maxLength = 90) {
  const text = String(value || '').trim();
  if (!text) return 'No profile summary yet.';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).replace(/\s+\S*$/, '').trim() + '...';
}

export default function ProfileCard({ profile, className = '' }) {
  // ── Favourites ──
  // Persisted on the server so a save survives a reload and a new device.
  // Seeded from the profile payload (favourited) the server sends, then driven
  // by the API. The old version was pure local state: it reset to false on
  // every remount, so the bookmark silently undid itself.
  const [saved, setSaved] = useState(profile.favourited === true);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const { isLoggedIn } = useAuth();
  const [loginGateOpen, setLoginGateOpen] = useState(false);
  const [gateReason, setGateReason] = useState('favourites');

  const toggleSaved = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (saveBusy) return;    // Sample profiles cannot receive messages, so saving one would put it on a
    // favourites list the member could never act on. Say so instead of storing it.
    if (profile.isDemo === true) {
      setSaveError('This is a sample profile, so it cannot be saved. Create your own profile to start building your list.');
      return;
    }
    // Favourites need an account — the API is session-scoped and there is no
    // anonymous save, so send a signed-out visitor to the login gate instead of
    // pretending the bookmark worked.
    if (!isLoggedIn) { setGateReason('favourites'); setLoginGateOpen(true); return; }
    const next = !saved;
    setSaveBusy(true);
    setSaveError('');
    setSaved(next); // optimistic
    try {
      const { api } = await import('../lib/api/client');
      if (next) await api.addFavourite(profile.id);
      else await api.removeFavourite(profile.id);
    } catch (err) {
      setSaved(!next); // roll back — never show a save that did not happen
      setSaveError(err.message || (next ? 'Could not save this profile.' : 'Could not remove this favourite.'));
    } finally {
      setSaveBusy(false);
    }
  };
  // Interest state is server truth: initialise from the profile payload when
  // the API provides it, and persist every tap via the API — the button used
  // to be a local-only toggle that silently dropped the interest on reload.
  const [interested, setInterested] = useState(() => profile.interestSent === true);
  const [interestBusy, setInterestBusy] = useState(false);
  const [interestError, setInterestError] = useState('');

  const handleInterest = async (e) => {
    e.preventDefault();
    if (interestBusy) return;
    // Interest is the highest-intent action on the site. A signed-out guest
    // gets the signup-nudge modal — never the silent failure that used to
    // swallow the tap with no feedback at all.
    if (!isLoggedIn) { setGateReason('interest'); setLoginGateOpen(true); return; }
    // Sending interest is what opens a conversation, and a sample profile has
    // nobody on the other end. Block it here and explain, rather than letting the
    // request succeed against a person who does not exist.
    if (profile.isDemo === true) {
      setInterestError('This is a sample profile written to show the format — there is no one behind it. Browse real members to send interest.');
      return;
    }
    setInterestBusy(true);
    setInterestError('');
    try {
      const { api } = await import('../lib/api/client');
      if (interested) {
        await api.withdrawInterest(profile.id);
        setInterested(false);
      } else {
        await api.expressInterest(profile.id);
        setInterested(true);
      }
    } catch (err) {
      setInterestError(err.message || (interested ? 'Could not withdraw interest.' : 'Could not send interest.'));
    } finally {
      setInterestBusy(false);
    }
  };
  // Real compatibility score — computed from the viewer's onboarding answers
  // vs this profile. Null when the viewer hasn't onboarded (no honest basis
  // for a score), so we show nothing rather than a fabricated number.
  const matchScore = useMemo(() => {
    try {
      const me = getMyProfile();
      if (!me || !me.sect) return null;
      return computeCompatibility(profile, me)?.overall ?? null;
    } catch {
      return null;
    }
  }, [profile.id]);
  // The server sends `photosVisibility` / `photosLocked`. The old `photoAccess`
  // field was never returned, so this always evaluated false and the "blurred"
  // state could never appear.
  const photoLocked = profile.photosLocked === true;
  // Photos are fetched with the bearer token: a plain <img src> cannot send the
  // Authorization header, so a members/private tier would 401 and render broken.
  const { url: photoUrl } = useAuthedImage(photoLocked ? null : profile.photo);
  const hasPhoto = Boolean(photoUrl);
  // The API returns `bio` (and `expectations` / `aboutFamily`). There is no
  // `about` field on the payload — reading it made excerptText() fall through
  // to "No profile summary yet." for EVERY member, no matter what they wrote.
  // Fall back to aboutFamily so a member who only filled that in still shows
  // something meaningful on the card.
  const about = excerptText(profile.bio || profile.aboutFamily);
  // The API marks the minimal signed-out payload with teaser:true. Everything
  // below the name is withheld in that mode, so the card must not try to draw it.
  const isTeaser = profile.teaser === true;

  return (
    <motion.article
      className={'premium-card overflow-hidden flex flex-col group ' + className}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link to={'/profiles/' + profile.id} className="block flex-1">
        {/* Photo */}
        <div className="relative aspect-[4/4.6] overflow-hidden" style={{ background: 'var(--color-surface)' }}>
          {/* Only ever render a real photo. The old `|| stock-unsplash-url`
              fallback put the same stranger's face on every card and
              misrepresented every member shown. */}
          {hasPhoto && (
            <img
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
              src={photoUrl}
              alt={profile.displayName}
              loading="lazy"
              decoding="async"
              onError={e => { e.currentTarget.style.display = 'none'; }}
              style={{ objectPosition: 'center top', position: 'relative', zIndex: 1 }}
            />
          )}
          {/* Elegant fallback monogram — two initials, brand gradient, decorative ring */}
          <div
            aria-hidden={hasPhoto || undefined}
            role={hasPhoto ? undefined : 'img'}
            aria-label={
              photoLocked
                ? `Photos of ${profile.displayName} are private`
                : `${profile.displayName} has not added a photo`
            }
            className="absolute inset-0 flex items-center justify-center select-none"
            style={{
              background: 'linear-gradient(150deg, #1a5c40 0%, #0d1f16 55%, #0a0f1a 100%)',
              zIndex: 0,
            }}
          >
            {/* Decorative concentric rings */}
            <div className="absolute w-28 h-28 rounded-full" style={{ border: '1px solid rgba(212,175,105,0.25)' }} />
            <div className="absolute w-32 h-32 rounded-full" style={{ border: '1px solid rgba(212,175,105,0.12)' }} />
            <div className="absolute w-24 h-24 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(212,175,105,0.08)', border: '1px solid rgba(212,175,105,0.35)' }}>
              <span className="text-3xl font-bold tracking-wide" style={{ color: '#d4af69', fontFamily: 'Georgia, serif' }}>
                {(() => {
                  const name = (profile.displayName || '?').trim();
                  const parts = name.split(/\s+/);
                  return parts.length > 1
                    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                    : name.slice(0, 2).toUpperCase();
                })()}
              </span>
            </div>
          </div>
          {/* Bottom gradient scrim */}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />

          {photoLocked && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(7,10,18,0.55)' }}>
              <div className="text-center text-white space-y-1 px-4">
                <div
                  className="w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-1.5"
                  style={{ background: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)' }}
                >
                  <Lock className="w-4 h-4" />
                </div>
                <p className="text-[11px] font-semibold">
                  {profile.photosVisibility === 'match' ? '💍 After match'
                    : profile.photosVisibility === 'request' ? '👁️ After interest'
                    : profile.photosVisibility === 'private' ? '🔒 Private'
                    : '👁️ Members only'}
                </p>
                <p className="text-[9px] opacity-60">Private until mutual step</p>
              </div>
            </div>
          )}

          {/* Match score — only when honestly computable */}
          {typeof matchScore === 'number' && !Number.isNaN(matchScore) && (
            <div
              className="absolute top-2.5 left-2.5 px-2 py-1 rounded-full text-[10px] font-bold backdrop-blur-md"
              style={{ background: 'rgba(11,15,23,0.6)', border: '1px solid rgba(255,255,255,0.18)', color: 'var(--color-success)', boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }}
              title="Compatibility based on your onboarding answers: faith alignment, values, lifestyle, and timeline."
            >
              {matchScore}% match
            </div>
          )}

          {/* Verified — two-tier badge (ID gold / selfie blue) */}
          <VerifiedBadge
            verifiedKind={profile.verified_kind}
            variant="icon"
            size={28}
            className="absolute top-2.5 right-2.5"
          />

          {/* Syed / Sadat badge */}
          {(profile.syedStatus === 'sadat-both' || profile.syedStatus === 'syed-paternal') && (
            <div
              className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                background: 'linear-gradient(135deg,#d4af37,#b8860b)',
                color: '#1a1a1a',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
              title={profile.syedStatus === 'sadat-both' ? 'Syed / Sadat — both sides' : 'Syed (paternal)'}
            >
              Syed
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--color-ink)' }}>
              {profile.displayName}{profile.age ? ', ' + profile.age : ''}
            </h3>
            <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-primary)', opacity: 0.7 }} />
          </div>
          {/* Labelled before anything else the card says. A sample profile is
              fully written and could otherwise read as a real person. */}
          {profile.isDemo === true && (
            <SampleProfileBadge className="w-fit" />
          )}
          <p className="flex items-center gap-1.5 text-[13px] leading-6 truncate mt-1" style={{ color: 'var(--color-ink-secondary)' }}>
            <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-primary)' }} />
            {/* City and country link to indexable landing pages (e.g. /city/hyderabad,
                /country/india) so every profile maps to canonical location pages.
                Links are always underlined + have padding for touch targets. */}
            {profile.city || profile.country ? (
              <span className="truncate">
                {profile.city ? (
                  <Link
                    to={`/city/${profile.city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`}
                    className="underline decoration-dotted underline-offset-2 font-semibold px-1 py-1 -mx-1"
                    style={{ color: 'var(--color-primary)' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {formatCity(profile.city)}
                  </Link>
                ) : null}
                {profile.city && profile.country ? <span className="mx-1" style={{ color: 'var(--color-ink-tertiary)' }}>·</span> : null}
                {profile.country ? (
                  <Link
                    to={`/country/${profile.country.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`}
                    className="underline decoration-dotted underline-offset-2 px-1 py-1 -mx-1"
                    style={{ color: 'var(--color-ink-secondary)' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {formatCountry(profile.country)}
                  </Link>
                ) : null}
              </span>
            ) : (
              <span style={{ color: 'var(--color-ink-tertiary)' }}>Location not shared</span>
            )}
          </p>

          {/* A teaser payload (what a signed-out visitor gets) carries only
              name/age/location — no profession, bio or religiosity. Rendering
              those rows unconditionally stamped the same three fallback
              strings onto every card, which read as a broken page rather than
              as a gated one. Hide what we were never sent and say plainly why. */}
          {isTeaser ? (
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-ink-tertiary)' }}>
              Sign in to see occupation, background and expectations.
            </p>
          ) : (
            <>
              {profile.profession && (
                <p className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-ink-secondary)' }}>
                  <Briefcase className="w-3 h-3 flex-shrink-0" /> {profile.profession}
                </p>
              )}
              <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--color-ink-secondary)' }}>{about}</p>
              {profile.religiosity && (
                <span className="badge-primary text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}>{profile.religiosity}</span>
              )}
            </>
          )}
        </div>
      </Link>

      {/* Actions */}
      <div className="px-3.5 pb-3.5 flex gap-2">
        <button
          onClick={handleInterest}
          disabled={interestBusy || profile.isDemo === true}
          className={'flex-1 py-2.5 min-h-[38px] text-xs font-semibold flex items-center justify-center gap-1 rounded-lg transition-all disabled:opacity-60 ' + (interested ? '' : 'btn-primary')}
          style={{ minHeight: '38px', ...(interested ? { background: 'var(--color-primary-subtle)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-subtle)' } : undefined) }}
          title={interestError || (interested ? 'Click to withdraw interest' : undefined)}
          aria-label={interested ? `Withdraw interest in ${profile.displayName}` : `Express interest in ${profile.displayName}`}
        >
          <Heart className={'w-3.5 h-3.5 ' + (interested ? 'fill-current' : '')} />
          {interestBusy ? (interested ? 'Withdrawing…' : 'Sending…') : interested ? 'Interested' : profile.isDemo === true ? 'Sample' : 'Interest'}
        </button>
        <button
          onClick={toggleSaved}
          disabled={saveBusy}
          className="btn-secondary p-2.5"
          aria-pressed={saved}
          aria-label={saved ? `Remove ${profile.displayName} from favourites` : `Save ${profile.displayName} to favourites`}
          title={saveError || (saved ? 'Remove from favourites' : 'Save to favourites')}
          style={{ minWidth: '38px', minHeight: '38px' }}
        >
          <Bookmark
            className="w-3.5 h-3.5"
            style={{ color: saved ? 'var(--color-primary)' : 'var(--color-ink-tertiary)', fill: saved ? 'var(--color-primary)' : 'none' }}
          />
        </button>
      </div>
      {saveError && (
        <p className="px-3.5 pb-3 -mt-2 text-[11px]" style={{ color: 'var(--color-danger, #b3261e)' }}>{saveError}</p>
      )}
      {loginGateOpen && (
        <LoginGate reason={gateReason} onClose={() => setLoginGateOpen(false)} />
      )}
    </motion.article>
  );
}
