import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, useMotionValue, useTransform, animate, AnimatePresence } from 'framer-motion';
import { Heart, X, Star, Undo2, Lock, MapPin, Sparkles, RotateCcw, Search, ShieldCheck } from 'lucide-react';
import CompatibilityIndex, { CompatibilityRing } from './CompatibilityIndex';
import { computeCompatibility } from '../lib/compatibility';
import { apiUrl } from '../lib/api/transport';

const DECISIONS_KEY = 'shiarishta_deck_decisions';
const INTERESTS_KEY = 'shiarishta_interests';

// Deck state follows the signed-in account — one member's likes/passes must
// never leak into another member's deck on a shared device.
function sessionUid() {
  try {
    const raw = localStorage.getItem('sh_session');
    const uid = raw ? JSON.parse(raw).uid : null;
    return uid || 'signed-out';
  } catch { return 'signed-out'; }
}
const scopedKey = (base) => `${base}::${sessionUid()}`;

function loadDecisions() {
  try { return JSON.parse(localStorage.getItem(scopedKey(DECISIONS_KEY))) || {}; } catch { return {}; }
}
function persistDecision(id, decision) {
  const all = loadDecisions();
  all[id] = decision;
  try { localStorage.setItem(scopedKey(DECISIONS_KEY), JSON.stringify(all)); } catch { /* ignore */ }
}

/**
 * Muzz/Tinder-style swipe deck with respectful, marriage-focused context.
 * - Drag or buttons/keyboard to decide (← pass, → like, ↑ maybe, U undo)
 * - Photo blur enforced by each profile's photoAccess setting
 * - Decisions persist locally; "like" records an interest for the Request Center
 */
export default function SwipeDeck({ profiles = [], onExpressInterest }) {
  const allProfiles = useMemo(() => profiles.filter((p) => !p.isPrivate), [profiles]);
  const [decisions, setDecisions] = useState(loadDecisions());
  const [exitDirection, setExitDirection] = useState(0);
  const deckRef = useRef(null);

  const queue = useMemo(() => allProfiles.filter(p => !decisions[p.id]), [allProfiles, decisions]);
  const viewedCount = Object.keys(decisions).length;

  const decide = useCallback((decision, profileId) => {
    const target = queue[0];
    if (!target || profileId !== target.id) return;
    setExitDirection(decision === 'like' ? 1 : decision === 'maybe' ? 0.5 : -1);
    persistDecision(target.id, decision);
    setDecisions(loadDecisions());
    if (decision === 'like') {
      try {
        const raw = localStorage.getItem(scopedKey(INTERESTS_KEY));
        const list = raw ? JSON.parse(raw) : [];
        if (!list.includes(target.id)) {
          list.push(target.id);
          localStorage.setItem(scopedKey(INTERESTS_KEY), JSON.stringify(list));
        }
      } catch { /* ignore */ }
      onExpressInterest?.(target);
    }
  }, [queue, onExpressInterest]);

  const undo = useCallback(() => {
    const entries = Object.entries(decisions);
    if (!entries.length) return;
    const last = entries[entries.length - 1];
    const next = { ...decisions };
    delete next[last[0]];
    setDecisions(next);
    try { localStorage.setItem(scopedKey(DECISIONS_KEY), JSON.stringify(next)); } catch { /* ignore */ }
  }, [decisions]);

  const resetDeck = useCallback(() => {
    setDecisions({});
    try { localStorage.removeItem(scopedKey(DECISIONS_KEY)); } catch { /* ignore */ }
  }, []);

  // Keyboard navigation: ← pass, → like, ↑ maybe, U undo
  useEffect(() => {
    const handler = (e) => {
      // Arrow keys and "u" are ordinary characters while a member is typing.
      // Without this guard, opening the deck and then pressing ← in the search
      // box silently swiped the top profile away — data loss caused by an
      // unrelated keystroke.
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) {
        return;
      }
      // Never steal keys from another overlay (confirm dialog, command palette).
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

      if (e.key === 'ArrowRight') { e.preventDefault(); decide('like', queue[0]?.id); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); decide('pass', queue[0]?.id); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); decide('maybe', queue[0]?.id); }
      else if (e.key.toLowerCase() === 'u') { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [decide, undo, queue]);

  const top = queue[0];
  const behind = queue.slice(1, 3);

  return (
    <div className="flex flex-col items-center select-none" ref={deckRef}>
      <div className="relative w-full max-w-sm" style={{ minHeight: 560 }}>
        <AnimatePresence mode="popLayout">
          {top && <DeckCard key={top.id} profile={top} exitDirection={exitDirection} onDecide={decide} isTop />}
          {behind.map((p, i) => (
            <div key={p.id} className="absolute inset-0" style={{ zIndex: -i - 1, pointerEvents: 'none' }}>
              <motion.div initial={{ scale: 1 - 0.05 * (i + 1), y: 18 * (i + 1) }}
                animate={{ scale: 1 - 0.05 * (i + 1), y: 18 * (i + 1) }} className="h-full w-full">
                <CardFace profile={p} staticMode />
              </motion.div>
            </div>
          ))}
        </AnimatePresence>

        {!top && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center px-6 py-12 rounded-3xl w-full"
              style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--border)' }}>
              <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4"
                style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
                <Sparkles className="w-7 h-7" style={{ color: 'var(--primary)' }} />
              </div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                {viewedCount ? "You've seen everyone for now" : 'Your deck awaits'}
              </h3>
              <p className="text-sm mt-1.5 max-w-xs mx-auto" style={{ color: 'var(--text-muted)' }}>
                {viewedCount
                  ? 'New members join weekly — browse the grid view or review the deck again.'
                  : 'Swipe through intention-first profiles with compatibility insights.'}
              </p>
              <div className="flex items-center justify-center gap-2.5 mt-5">
                {viewedCount > 0 && (
                  <button onClick={resetDeck} className="button-secondary px-4 py-2.5 text-sm flex items-center gap-1.5">
                    <RotateCcw className="w-4 h-4" /> Review again
                  </button>
                )}
                <a href="/profiles?view=grid" className="button primary px-4 py-2.5 text-sm flex items-center gap-1.5">
                  <Search className="w-4 h-4" /> Browse grid
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action bar */}
      {top && (
        <div className="flex items-center gap-4 mt-6" role="toolbar" aria-label="Deck actions">
          <button onClick={() => decide('pass', top.id)} aria-label="Pass (left arrow)"
            className="rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
            style={{ width: 52, height: 52, background: 'var(--bg-elevated)', border: '2px solid var(--border)' }}>
            <X className="w-6 h-6" style={{ color: '#c0574f' }} />
          </button>
          <button onClick={() => decide('maybe', top.id)} aria-label="Save for later (up arrow)"
            className="rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
            style={{ width: 44, height: 44, background: 'var(--bg-elevated)', border: '2px solid var(--border)' }}>
            <Star className="w-5 h-5" style={{ color: '#d9a441' }} />
          </button>
          <button onClick={() => decide('like', top.id)} aria-label="Express interest (right arrow)"
            className="rounded-full flex items-center justify-center text-white shadow-lg transition-transform hover:scale-110 active:scale-95"
            style={{ width: 58, height: 58, background: 'linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, var(--accent)))' }}>
            <Heart className="w-7 h-7" fill="currentColor" />
          </button>
          <button onClick={undo} aria-label="Undo last decision (U)" disabled={!viewedCount}
            className="rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95 disabled:opacity-40"
            style={{ width: 44, height: 44, background: 'var(--bg-elevated)', border: '2px solid var(--border)' }}>
            <Undo2 className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      )}
      {top && (
        <p className="text-[11px] mt-3 text-center" style={{ color: 'var(--text-faint)' }}>
          Drag the card or use ← pass · ↑ maybe · → interest · U undo
        </p>
      )}
    </div>
  );
}

// ── Draggable top card with pass/like overlays ──────────────────────────────
const SWIPE_THRESHOLD = 140;

function DeckCard({ profile, exitDirection, onDecide }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-14, 14]);
  const likeOpacity = useTransform(x, [30, SWIPE_THRESHOLD], [0, 1]);
  const passOpacity = useTransform(x, [-SWIPE_THRESHOLD, -30], [1, 0]);
  const maybeOpacity = useTransform(x, [-46, -12, 12, 46], [0, 1, 1, 0]);

  const fling = (dir) => {
    const target = dir === 'like' ? 320 : dir === 'pass' ? -320 : 0;
    animate(x, target, { type: 'spring', stiffness: 220, damping: 26 });
    setTimeout(() => onDecide(dir, profile.id), 170);
  };

  return (
    <motion.div
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
      style={{ x, rotate, zIndex: 1 }}
      drag
      dragElastic={0.7}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDragEnd={(_, info) => {
        if (info.offset.x > SWIPE_THRESHOLD) fling('like');
        else if (info.offset.x < -SWIPE_THRESHOLD) fling('pass');
        else if (info.offset.y < -110) fling('maybe');
      }}
      initial={{ scale: 0.92, y: 24, opacity: 0, rotate: exitDirection * -10 }}
      animate={{ scale: 1, y: 0, opacity: 1, rotate: 0 }}
      exit={{ x: exitDirection * 340, y: exitDirection === 0.5 ? -340 : 60, opacity: 0, rotate: exitDirection * 22, transition: { duration: 0.28 } }}
    >
      <CardFace profile={profile}>
        {/* Swipe overlays */}
        <motion.div style={{ opacity: likeOpacity }} aria-hidden
          className="absolute top-6 left-6 z-20 px-4 py-1.5 rounded-xl rotate-[-12deg]"
          >
          <span className="text-lg font-extrabold tracking-widest text-white drop-shadow"
            style={{ border: '3px solid var(--primary)', borderRadius: 12, padding: '2px 12px', background: 'color-mix(in srgb, var(--primary) 82%, transparent)' }}>
            INTEREST
          </span>
        </motion.div>
        <motion.div style={{ opacity: passOpacity }} aria-hidden className="absolute top-6 right-6 z-20 rotate-[12deg]">
          <span className="text-lg font-extrabold tracking-widest text-white"
            style={{ border: '3px solid #c0574f', borderRadius: 12, padding: '2px 12px', background: 'rgba(192,87,79,.82)' }}>
            PASS
          </span>
        </motion.div>
        <motion.div style={{ opacity: maybeOpacity }} aria-hidden className="absolute top-6 left-1/2 -translate-x-1/2 z-20">
          <span className="text-base font-extrabold tracking-widest text-white"
            style={{ border: '3px solid #d9a441', borderRadius: 12, padding: '2px 12px', background: 'rgba(217,164,65,.82)' }}>
            MAYBE
          </span>
        </motion.div>
      </CardFace>
    </motion.div>
  );
}

// ── Card face — shared by top card and stack previews ───────────────────────
function CardFace({ profile, children, staticMode = false }) {
  const blurred = profile.photoAccess !== 'public';
  const compat = computeCompatibility(profile);

  return (
    <div className="h-full w-full rounded-3xl overflow-hidden flex flex-col"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', boxShadow: '0 22px 60px -22px rgba(0,0,0,.28)' }}>
      {/* Photo */}
      <div className="relative flex-shrink-0" style={{ height: '58%' }}>
        <img src={apiUrl(profile.photo)} alt={staticMode ? '' : `${profile.displayName} — profile photo`}
          className={`w-full h-full object-cover ${blurred ? 'blur-xl scale-110' : ''}`}
          draggable={false} loading="lazy" style={{ filter: blurred ? undefined : 'saturate(1.05)' }} />
        {blurred && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5" style={{ background: 'rgba(8,26,20,.34)' }}>
            <Lock className="w-6 h-6 text-white" />
            <span className="text-[11px] font-bold text-white bg-black/45 px-3 py-1 rounded-full">Photo blurs until mutual match</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-24" style={{ background: 'linear-gradient(to top, rgba(6,20,15,.86), transparent)' }} />
        {/* Identity over photo */}
        <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-white font-bold text-xl leading-tight flex items-center gap-1.5 truncate">
              {profile.displayName}, {profile.age}
              {profile.is_verified && <ShieldCheck className="w-4.5 h-4.5 flex-shrink-0" style={{ color: 'var(--accent)' }} aria-label="ID verified" />}
            </h3>
            <p className="text-white/85 text-xs flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3" /> {profile.city}, {profile.country} · {profile.profession}
            </p>
          </div>
          {compat && <CompatibilityRing score={compat.overall} size={52} stroke={5} />}
        </div>
        {children}
      </div>

      {/* Body */}
      <div className="flex-1 p-4 flex flex-col gap-3 min-h-0">
        <div className="flex flex-wrap gap-1.5">
          {[profile.sect, profile.religiosity, profile.intentions].filter(Boolean).map(chip => (
            <span key={chip} className="px-2.5 py-1 rounded-full text-[10.5px] font-semibold"
              style={{ background: 'color-mix(in srgb, var(--primary) 9%, transparent)', color: 'var(--primary)' }}>
              {chip}
            </span>
          ))}
        </div>
        <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'var(--text-muted)' }}>{profile.about}</p>
        <div className="mt-auto">
          <CompatibilityIndex profile={profile} compact />
        </div>
      </div>
    </div>
  );
}

