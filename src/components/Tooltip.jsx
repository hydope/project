import { useState, useEffect, useRef } from 'react';

export default function Tooltip({ content, children, className = '', placement = 'top' }) {
  const [showTooltip, setShowTooltip] = useState(false);
  // Timers live in refs, not state. They were `useState` before, which meant a
  // re-render fired on every hover just to store a timer id, and the cleanup
  // effect below re-ran each time — leaving already-fired timers un-cleared.
  const showTimeout = useRef(null);
  const hideTimeout = useRef(null);

  const clearTimers = () => {
    if (showTimeout.current) { clearTimeout(showTimeout.current); showTimeout.current = null; }
    if (hideTimeout.current) { clearTimeout(hideTimeout.current); hideTimeout.current = null; }
  };

  useEffect(() => clearTimers, []);

  const handleMouseEnter = () => {
    if (hideTimeout.current) { clearTimeout(hideTimeout.current); hideTimeout.current = null; }
    if (showTimeout.current) clearTimeout(showTimeout.current);
    showTimeout.current = setTimeout(() => setShowTooltip(true), 300);
  };

  const handleMouseLeave = () => {
    if (showTimeout.current) { clearTimeout(showTimeout.current); showTimeout.current = null; }
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => setShowTooltip(false), 100);
  };

  // Keyboard parity. Hover-only tooltips are unreachable for keyboard and
  // screen-reader users, which fails WCAG 1.4.13 (Content on Hover or Focus).
  // Focus shows immediately (no delay — a keyboard user has already committed
  // intent) and Escape dismisses.
  const handleFocus = () => {
    clearTimers();
    setShowTooltip(true);
  };
  const handleBlur = () => setShowTooltip(false);
  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && showTooltip) {
      e.stopPropagation();
      setShowTooltip(false);
    }
  };

  if (!content) return <>{children}</>;

  return (
    <span
      className="tooltip-wrap"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      {children}
      {showTooltip && (
        <span role="tooltip" className={`tooltip-bubble tooltip-${placement} ${className}`}>
          {content}
        </span>
      )}
    </span>
  );
}
