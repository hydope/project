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
  // 'dark' = dark text for light surfaces (headers). 'light' = light
  // text for dark surfaces — the footer band is near-black, and the
  // default ink wordmark rendered almost invisible on it (external
  // audit, 2026-11-20).
  tone = 'dark',
}) {
  const wordColor = tone === 'light' ? '#f3ece2' : 'var(--color-ink)';
  const tagColor = tone === 'light' ? 'rgba(243, 236, 226, 0.6)' : 'var(--color-ink-tertiary)';
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
            color: wordColor,
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
              color: tagColor,
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
