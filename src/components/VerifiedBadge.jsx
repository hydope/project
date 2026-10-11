import { BadgeCheck } from 'lucide-react';
import Tooltip from './Tooltip.jsx';

// Two-tier verification badge — the single source of truth for the verified
// indicator across the site.
//
// verifiedKind: 'id_document' → gold "ID Verified"   (government ID approved)
//               'selfie'      → blue "Photo Verified" (selfie approved)
//               'none'/null   → renders nothing
//
// variant: 'icon'   — circular gradient medallion for photo-card overlays
//                     (className positions the medallion; size sets diameter)
//          'inline'  — bare checkmark for name headings / list rows
//                     (iconClassName sizes the icon, e.g. "w-4 h-4")
//          'pill'    — labeled pill ("ID Verified" / "Photo Verified")
const TIERS = {
  id_document: {
    label: 'ID Verified',
    tooltip: 'Government-issued ID verified by our team',
    gradient: 'linear-gradient(135deg,#f0c25c 0%,#d4a03c 45%,#a9762a 100%)',
    glow: '0 4px 14px rgba(212,160,60,0.55)',
    iconColor: '#b98334',
    textColor: '#5c4413',
    pillBg: 'linear-gradient(135deg,rgba(240,194,92,0.20),rgba(212,160,60,0.10))',
    pillBorder: 'rgba(185,131,52,0.45)',
  },
  selfie: {
    label: 'Photo Verified',
    tooltip: 'Selfie verified by our team',
    gradient: 'linear-gradient(135deg,#7db4fb 0%,#3b82f6 55%,#1d4ed8 100%)',
    glow: '0 4px 14px rgba(59,130,246,0.55)',
    iconColor: '#2563eb',
    textColor: '#1e3a8a',
    pillBg: 'linear-gradient(135deg,rgba(125,180,251,0.18),rgba(59,130,246,0.08))',
    pillBorder: 'rgba(59,130,246,0.40)',
  },
};

export default function VerifiedBadge({
  verifiedKind,
  variant = 'inline',
  size = 28,
  className = '',
  iconClassName = '',
}) {
  const tier = TIERS[verifiedKind];
  if (!tier) return null;
  const tip = `${tier.label} — ${tier.tooltip}`;

  if (variant === 'icon') {
    return (
      <span className={className} style={{ display: 'inline-flex' }}>
        <Tooltip content={tip}>
          <span
            className="rounded-full inline-flex items-center justify-center flex-shrink-0"
            style={{
              width: size,
              height: size,
              background: tier.gradient,
              boxShadow: tier.glow,
              border: '1.5px solid rgba(255,255,255,0.65)',
            }}
            role="img"
            aria-label={tier.label}
          >
            <BadgeCheck
              style={{ width: size * 0.62, height: size * 0.62, color: '#ffffff' }}
              strokeWidth={2.4}
            />
          </span>
        </Tooltip>
      </span>
    );
  }

  if (variant === 'pill') {
    return (
      <span className={className} style={{ display: 'inline-flex' }}>
        <Tooltip content={tier.tooltip}>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
            style={{
              background: tier.pillBg,
              border: `1px solid ${tier.pillBorder}`,
              color: tier.textColor,
              boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
              whiteSpace: 'nowrap',
            }}
            role="img"
            aria-label={tier.label}
          >
            <BadgeCheck style={{ width: 14, height: 14, color: tier.iconColor }} strokeWidth={2.6} />
            {tier.label}
          </span>
        </Tooltip>
      </span>
    );
  }

  // 'inline' — bare checkmark for headings and list rows.
  return (
    <Tooltip content={tip}>
      <BadgeCheck
        className={`flex-shrink-0 ${iconClassName}`}
        style={{ color: tier.iconColor }}
        strokeWidth={2.6}
        role="img"
        aria-label={tier.label}
      />
    </Tooltip>
  );
}
