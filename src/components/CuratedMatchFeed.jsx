import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Bookmark, MapPin, Shield, Sparkles, Check } from 'lucide-react';
import { computeCompatibility, getMyProfile } from '../lib/compatibility';
import VerifiedBadge from './VerifiedBadge';

/**
 * CuratedMatchFeed — Intentional profile browsing for marriage-minded users.
 * Replaces swipe-based mechanics with thoughtful, one-at-a-time profile review.
 * Users see one highlighted profile at a time with compatibility context,
 * then choose to express interest, save for later, or pass respectfully.
 */
export default function CuratedMatchFeed({ profiles = [], onExpressInterest }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [interested, setInterested] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [exitDirection, setExitDirection] = useState(0);

  const current = profiles[currentIndex];
  const next = profiles[currentIndex + 1];

  // Single source of truth for match scores: computed from the viewer's own
  // onboarding answers. No hardcoded fallback — when there isn't enough data
  // the badge is hidden rather than inventing a number.
  const me = useMemo(() => {
    try { return getMyProfile(); } catch { return null; }
  }, []);
  const matchScore = useMemo(() => {
    try {
      return current ? computeCompatibility(current, me)?.overall ?? null : null;
    } catch {
      return null;
    }
  }, [current, me]);

  const handleDecision = useCallback((decision) => {
    if (exiting || !current) return;
    setExiting(true);
    setExitDirection(decision === 'interested' ? 1 : -1);

    if (decision === 'interested') {
      setInterested(true);
      onExpressInterest?.(current);
    } else if (decision === 'save') {
      setSaved(true);
    }

    setTimeout(() => {
      setCurrentIndex(i => i + 1);
      setInterested(false);
      setSaved(false);
      setExiting(false);
      setExitDirection(0);
    }, 200);
  }, [exiting, current, onExpressInterest]);

  // Keyboard: → interested, ↓ save, ← pass
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowRight') handleDecision('interested');
    else if (e.key === 'ArrowDown') handleDecision('save');
    else if (e.key === 'ArrowLeft') handleDecision('pass');
  }, [handleDecision]);

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'var(--color-primary-subtle)' }}>
          <Sparkles className="w-7 h-7" style={{ color: 'var(--color-primary)' }} />
        </div>
        <h3 className="text-heading mb-2">You&apos;ve seen everyone</h3>
        <p className="text-body mb-4 max-w-sm">
          Check back later for new matches curated just for you.
        </p>
        <button onClick={() => setCurrentIndex(0)} className="btn btn-secondary btn-sm">
          Start over
        </button>
      </div>
    );
  }

  return (
    <div className="relative" onKeyDown={handleKeyDown} tabIndex={0} role="region" aria-label="Match feed">
      {/* Stack effect — next card visible behind */}
      <div className="relative mx-auto" style={{ maxWidth: 420 }}>
        {next && (
          <div
            className="absolute inset-0 rounded-3xl"
            style={{
              background: 'var(--color-elevated)',
              border: '1px solid var(--color-border)',
              transform: 'scale(0.95) translateY(8px)',
              opacity: 0.6,
              zIndex: 0,
            }}
          />
        )}

        {/* Current card */}
        <AnimatePresence mode="popLayout">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{
              opacity: exiting ? 0 : 1,
              x: exiting ? exitDirection * 300 : 0,
              y: exiting ? -20 : 0,
              scale: exiting ? 0.9 : 1,
              rotate: exiting ? exitDirection * 8 : 0,
            }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative rounded-3xl overflow-hidden"
            style={{
              background: 'var(--color-elevated)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 1,
            }}
          >
            {/* Photo */}
            <div className="relative" style={{ aspectRatio: '3/4', background: 'var(--color-surface)' }}>
              {current.photo ? (
                <img
                  src={current.photo}
                  alt={`${current.displayName} — profile photo`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  style={{ objectPosition: 'center top' }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-6xl font-bold" style={{ color: 'var(--color-ink-tertiary)' }}>
                    {(current.displayName || '?').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              {/* Gradient scrim */}
              <div className="absolute inset-x-0 bottom-0 h-2/3" style={{ background: 'linear-gradient(to top, rgba(6,20,15,0.92), transparent)' }} />

              {/* Match score */}
              {matchScore !== null && (
                <div
                  className="absolute top-4 left-4 px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{ background: 'rgba(11,15,23,0.7)', border: '1px solid rgba(255,255,255,0.18)', color: 'var(--color-success)' }}
                >
                  {matchScore}% match
                </div>
              )}

              {/* Verified — two-tier badge (ID gold / selfie blue) */}
              <VerifiedBadge
                verifiedKind={current.verified_kind}
                variant="icon"
                size={32}
                className="absolute top-4 right-4"
              />

              {/* Identity overlay */}
              <div className="absolute bottom-4 left-4 right-4">
                <h3 className="text-white font-bold text-2xl leading-tight">
                  {current.displayName}, {current.age}
                </h3>
                <p className="text-white/80 text-sm flex items-center gap-1.5 mt-1">
                  <MapPin className="w-3.5 h-3.5" /> {current.city}, {current.country} · {current.profession}
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {/* Tags */}
              <div className="flex flex-wrap gap-2">
                {[current.sect, current.religiosity, current.intentions].filter(Boolean).map(chip => (
                  <span
                    key={chip}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                    style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}
                  >
                    {chip}
                  </span>
                ))}
              </div>

              {/* About excerpt */}
              <p className="text-sm leading-relaxed line-clamp-3" style={{ color: 'var(--color-ink-secondary)' }}>
                {/* Same payload mismatch ProfileCard had: the API sends `bio`,
                    never `about`, so this always showed the placeholder. */}
                {current.bio || current.aboutFamily || 'No profile summary yet.'}
              </p>

              {/* Privacy note */}
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-ink-tertiary)' }}>
                <Shield className="w-3.5 h-3.5" />
                Photo privacy respected — full access after mutual interest
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => handleDecision('pass')}
                  className="btn btn-secondary flex-1 py-3"
                  aria-label="Pass on this profile"
                >
                  Pass
                </button>
                <button
                  onClick={() => handleDecision('save')}
                  className="btn btn-secondary p-3"
                  aria-label="Save for later"
                  style={saved ? { background: 'var(--color-primary-subtle)', borderColor: 'var(--color-primary)' } : undefined}
                >
                  <Bookmark className="w-5 h-5" style={saved ? { color: 'var(--color-primary)', fill: 'var(--color-primary)' } : undefined} />
                </button>
                <button
                  onClick={() => handleDecision('interested')}
                  className="btn btn-primary flex-1 py-3"
                  aria-label="Express interest"
                  style={interested ? { background: 'var(--color-success)' } : undefined}
                >
                  {interested ? <><Check className="w-4 h-4" /> Interest sent</> : <><Heart className="w-4 h-4" /> Express interest</>}
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-1.5 mt-6">
        {profiles.slice(0, Math.min(profiles.length, 8)).map((_, i) => (
          <div
            key={i}
            className="h-1.5 rounded-full transition-all duration-200"
            style={{
              width: i === currentIndex ? 24 : 6,
              background: i === currentIndex ? 'var(--color-primary)' : 'var(--color-border-strong)',
            }}
          />
        ))}
      </div>
    </div>
  );
}
