import { motion } from 'framer-motion';
import { Brain, Check } from 'lucide-react';
import { computeCompatibility } from '../lib/compatibility';

// Circular gauge for the headline score
export function CompatibilityRing({ score, size = 64, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const hue = score >= 85 ? 'var(--primary)' : score >= 70 ? 'var(--accent)' : '#e0a75e';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}
      role="img" aria-label={`${score}% compatibility`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-subtle)" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={hue} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (c * score) / 100 }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold leading-none" style={{ fontSize: size * 0.28, color: 'var(--text)' }}>{score}</span>
        <span className="leading-none mt-0.5" style={{ fontSize: size * 0.14, color: 'var(--text-muted)' }}>% match</span>
      </div>
    </div>
  );
}

// Dimension bar
function Dim({ label, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium w-16 flex-shrink-0 text-right" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--line-subtle)' }}>
        <motion.div className="h-full rounded-full" style={{ background: 'var(--primary)' }}
          initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.7, ease: 'easeOut', delay: 0.2 }} />
      </div>
      <span className="text-[11px] font-bold w-7" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  );
}

/**
 * Compatibility Index — full breakdown with reasons.
 * Used inside the swipe deck card and (later) the profile detail view.
 */
export default function CompatibilityIndex({ profile, compact = false }) {
  // Null when the viewer has not onboarded — see the honesty contract in
  // lib/compatibility.js. Destructuring that returned the same fixed 61% for
  // every profile, so this component rendered a confident ring and two invented
  // reasons for signed-out visitors. Say why there is no score instead.
  const result = computeCompatibility(profile);

  if (!result) {
    return (
      <div className="text-xs" style={{ color: 'var(--color-ink-tertiary)' }}>
        {compact ? null : 'Complete your profile to see how you compare.'}
      </div>
    );
  }

  const { overall, breakdown, reasons } = result;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <CompatibilityRing score={overall} size={44} stroke={4.5} />
        <p className="text-[11px] leading-snug font-medium" style={{ color: 'var(--text-muted)' }}>
          {reasons.slice(0, 2).map((r, i) => (
            <span key={i} className="flex items-center gap-1">
              <Check className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--primary)' }} /> {r}
            </span>
          ))}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-4">
        <CompatibilityRing score={overall} size={72} stroke={6.5} />
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--primary)' }}>
            <Brain className="w-3.5 h-3.5" /> Compatibility Index
          </div>
          <Dim label="Faith" value={breakdown.faith} />
          <Dim label="Values" value={breakdown.values} />
          <Dim label="Lifestyle" value={breakdown.lifestyle} />
          <Dim label="Timeline" value={breakdown.timeline} />
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {reasons.slice(0, 3).map((r, i) => (
          <li key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10.5px] font-semibold"
            style={{ background: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)' }}>
            <Check className="w-3 h-3" strokeWidth={3} /> {r}
          </li>
        ))}
      </ul>
    </div>
  );
}
