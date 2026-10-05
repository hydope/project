import { useEffect, useRef } from 'react';

/**
 * Fail-safe scroll reveal. Content is VISIBLE by default — the hidden initial
 * state only applies when JavaScript is running (`.js` on <html>) and the
 * browser has no reduced-motion preference. A native IntersectionObserver adds
 * `.is-visible`; a backstop timer guarantees content can never stay hidden if
 * the observer misfires. Animation enhances, never gates.
 *
 * ── Why the immediate check below exists ─────────────────────────────────────
 * Measuring LCP on a throttled Pixel 5 showed React mounting at 2834ms but the
 * hero only becoming the largest contentful paint at 5056ms — a 2.2 second gap
 * that was NOT rendering time. The hero sits inside <Reveal>, and the observer
 * uses `rootMargin: '0px 0px -70px'`, so an above-the-fold block taller than the
 * shrunken root can fail to intersect. When that happened the hero stayed at
 * opacity: 0 until the 2500ms backstop timer fired, and LCP is recorded when the
 * element actually paints — so the safety net became the critical path.
 *
 * The fix is to stop relying on the observer for content that is already on
 * screen. Anything intersecting the viewport at mount is revealed immediately,
 * which is what the observer would have done anyway had it fired. Content below
 * the fold still animates on scroll.
 */
export default function Reveal({ children, delay = 0, className = '', as: Tag = 'div', ...rest }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let io = null;
    const show = () => el.classList.add('is-visible');

    // Already on screen? Reveal now. This is the whole point: above-the-fold
    // content must never wait on an observer that may not fire, because every
    // millisecond it stays at opacity 0 is added to LCP.
    const rect = el.getBoundingClientRect();
    const margin = 70;
    if (rect.top < window.innerHeight - margin && rect.bottom > -margin) {
      show();
    }

    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              show();
              io?.disconnect();
            }
          });
        },
        { rootMargin: '0px 0px -70px 0px' }
      );
      io.observe(el);
    } else {
      show();
    }

    // Backstop only. Shortened from 2500ms to 1200ms: when it does fire it means
    // something went wrong, and a long wait makes a cosmetic fault look like a
    // slow page.
    const t = setTimeout(show, 1200);
    return () => {
      io?.disconnect();
      clearTimeout(t);
    };
  }, []);

  return (
    <Tag ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}s` }} {...rest}>
      {children}
    </Tag>
  );
}
