import BrandLogo from './BrandLogo';

// Shia Rishta wordmark lockup (2026-09-26).
//
// Silicon Valley-clean: the heart mark paired with a single-color
// geometric sans wordmark — Inter 700, tight tracking, theme-aware ink.
// Tagline set in tracked-out uppercase. No italics, no two-tone: the mark
// carries the brand color, the word carries the name.
export default function BrandLockup({
  iconSize = 36,
  tagline = true,
  className = '',
  style = {},
}) {
  const wordSize = Math.round(iconSize * 0.58);
  const tagSize = Math.max(8, Math.round(iconSize * 0.21));
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: iconSize * 0.34, ...style }}
    >
      <BrandLogo size={iconSize} detail />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.08 }}>
        <span
          style={{
            fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif",
            fontWeight: 700,
            fontSize: wordSize,
            letterSpacing: '-0.03em',
            color: 'var(--color-ink)',
            whiteSpace: 'nowrap',
          }}
        >
          Shia Rishta
        </span>
        {tagline && (
          <span
            className="brandlockup-tagline"
            style={{
              fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif",
              fontSize: tagSize,
              fontWeight: 600,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--color-ink-tertiary)',
              whiteSpace: 'nowrap',
              marginTop: 3,
            }}
          >
            Nikah Matchmaking
          </span>
        )}
      </span>
    </span>
  );
}
