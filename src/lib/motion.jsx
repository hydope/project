// ─── motion — in-house replacement for framer-motion ────────────────────────
// The bundle-budget diet named in scripts/check-bundle-budget.mjs since
// 2026-11-10 ("framer-motion ~43 KB gzip, used only for fade/slide-ins —
// replaceable with CSS transitions") was finally done on 2026-11-22: total
// JS sat at 519.97 KB against a 520 KB budget (~30 bytes of headroom), so
// CI flipped red on environment noise alone.
//
// An audit of every call site showed the library was only ever used for:
//   * entrance tweens of opacity / x / y / scale / rotate (+ width, height,
//     strokeDashoffset in two components),
//   * AnimatePresence as a mount/unmount wrapper (exit animations),
//   * useReducedMotion (2 files),
//   * drag physics in SwipeDeck.jsx — which nothing imports.
// This module implements exactly that surface with plain CSS transitions:
//
//   * motion.<tag> renders the tag, applies `initial` values pre-paint
//     (useLayoutEffect), then transitions to `animate` values using the
//     `transition` prop's duration/delay/ease (springs map to the default
//     ease-out curve; per-value overrides and stagger are not supported).
//   * `variants` objects are honoured for the common shape where a
//     component receives variants.initial / variants.animate (the
//     Animations.jsx presets); variant *propagation* by state name from a
//     parent is not implemented — pass initial/animate explicitly.
//   * AnimatePresence is a passthrough: children mount/unmount instantly,
//     with no exit animation. That is the one visible behaviour change —
//     toasts, drawers and route swaps disappear instead of fading out.
//   * whileHover / whileTap apply their values while the pointer state is
//     active, composed over the current `animate` values.
//   * useMotionValue / useTransform / animate are minimal stubs — only the
//     unimported SwipeDeck references them; they exist so that file still
//     type-checks/parses if it is ever re-imported, not to do physics.
//
// `layout` animations are intentionally not implemented (the prop is
// accepted and ignored — elements simply render at their natural layout).

import React, {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

const useIsoLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);
  return reduced;
}

// ── value → CSS ─────────────────────────────────────────────────────────────

const EASE_NAMES = {
  easeIn: 'ease-in',
  easeOut: 'ease-out',
  easeInOut: 'ease-in-out',
  circIn: 'ease-in',
  circOut: 'ease-out',
  circInOut: 'ease-in-out',
  backIn: 'cubic-bezier(0.36, 0, 0.66, -0.56)',
  backOut: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  backInOut: 'cubic-bezier(0.68, -0.6, 0.32, 1.6)',
  anticipate: 'cubic-bezier(0.38, 0.2, 0.3, 1.2)',
};
const DEFAULT_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

function easeCss(ease) {
  if (Array.isArray(ease)) return `cubic-bezier(${ease.join(', ')})`;
  if (typeof ease === 'string') return EASE_NAMES[ease] || ease;
  return DEFAULT_EASE;
}

function transitionCss(transition) {
  if (prefersReducedMotion()) return 'all 0s linear 0s';
  const t = transition && typeof transition === 'object' ? transition : {};
  const duration = typeof t.duration === 'number' ? t.duration : 0.3;
  const delay = typeof t.delay === 'number' ? t.delay : 0;
  return `all ${duration}s ${easeCss(t.ease)} ${delay}s`;
}

function transitionMs(transition) {
  const t = transition && typeof transition === 'object' ? transition : {};
  const duration = typeof t.duration === 'number' ? t.duration : 0.3;
  const delay = typeof t.delay === 'number' ? t.delay : 0;
  return (duration + delay) * 1000;
}

const px = (v) => (typeof v === 'number' ? `${v}px` : v);

function transformOf(values) {
  const parts = [];
  const x = values.x ?? values.translateX;
  const y = values.y ?? values.translateY;
  if (x !== undefined || y !== undefined) {
    parts.push(`translate3d(${px(x ?? 0)}, ${px(y ?? 0)}, 0)`);
  }
  if (values.scale !== undefined) parts.push(`scale(${values.scale})`);
  if (values.scaleX !== undefined) parts.push(`scaleX(${values.scaleX})`);
  if (values.scaleY !== undefined) parts.push(`scaleY(${values.scaleY})`);
  if (values.rotate !== undefined) {
    parts.push(
      `rotate(${typeof values.rotate === 'number' ? `${values.rotate}deg` : values.rotate})`,
    );
  }
  return parts.length ? parts.join(' ') : undefined;
}

// Apply one set of motion values to a DOM node. `auto` width/height are
// resolved to the measured content size for the transition, then released
// back to `auto` once it finishes so later content changes are not clipped.
function applyValues(el, values, transition) {
  if (!el || !values) return;
  if (transition !== undefined) el.style.transition = transition;
  if (values.opacity !== undefined) el.style.opacity = String(values.opacity);
  const transform = transformOf(values);
  if (transform !== undefined) el.style.transform = transform;
  for (const prop of ['width', 'height']) {
    const v = values[prop];
    if (v === undefined) continue;
    if (v === 'auto') {
      const measured = prop === 'height' ? el.scrollHeight : el.scrollWidth;
      el.style[prop] = `${measured}px`;
      const ms = transitionMs(transition);
      window.setTimeout(() => {
        if (el.isConnected) el.style[prop] = 'auto';
      }, ms + 30);
    } else {
      el.style[prop] = px(v);
    }
  }
  if (values.strokeDashoffset !== undefined) {
    el.style.strokeDashoffset = String(values.strokeDashoffset);
  }
  if (values.backgroundColor !== undefined) {
    el.style.backgroundColor = values.backgroundColor;
  }
}

// Resolve a prop that may be an object, `false`, or a variant state name.
function resolveValues(prop, variants, key) {
  if (prop && typeof prop === 'object') return prop;
  if (typeof prop === 'string' && variants && typeof variants[prop] === 'object') {
    return variants[prop];
  }
  if (prop === undefined && variants && typeof variants[key] === 'object') {
    return variants[key];
  }
  return null;
}

// ── motion.<tag> ────────────────────────────────────────────────────────────

const STRIP_PROPS = new Set([
  'initial', 'animate', 'exit', 'variants', 'transition',
  'whileHover', 'whileTap', 'whileFocus', 'whileInView', 'viewport',
  'layout', 'layoutId', 'layoutScroll', 'layoutRoot',
  'drag', 'dragConstraints', 'dragElastic', 'dragMomentum', 'dragSnapToOrigin',
  'dragTransition', 'dragListener', 'dragControls',
  'onDragStart', 'onDrag', 'onDragEnd',
  'onAnimationStart', 'onAnimationComplete', 'onUpdate',
  'onHoverStart', 'onHoverEnd', 'onTap', 'onTapStart', 'onTapCancel',
  'transformTemplate', 'custom', 'inherit',
]);

function createMotionComponent(tag) {
  return forwardRef(function MotionComponent(props, ref) {
    const {
      initial, animate, variants, transition, whileHover, whileTap,
      onMouseEnter, onMouseLeave, onPointerDown, onPointerUp,
      ...rest
    } = props;
    for (const key of Object.keys(rest)) {
      if (STRIP_PROPS.has(key)) delete rest[key];
    }

    const nodeRef = useRef(null);
    const startedRef = useRef(false);
    const fromValues = resolveValues(initial, variants, 'initial');
    const toValues = resolveValues(animate, variants, 'animate');
    const toKey = JSON.stringify(toValues);

    const setRef = (node) => {
      nodeRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    };

    useIsoLayoutEffect(() => {
      const el = nodeRef.current;
      if (!el || !toValues) return;
      const css = transitionCss(transition);
      if (!startedRef.current) {
        startedRef.current = true;
        if (fromValues) {
          // Pre-paint: jump to the initial values with no transition, force
          // a reflow, then transition to the animate values.
          applyValues(el, fromValues, 'none');
          void el.getBoundingClientRect();
          applyValues(el, toValues, css);
        } else {
          applyValues(el, toValues, 'none');
        }
        return;
      }
      applyValues(el, toValues, css);
      // Intentionally keyed on toKey only — a serialised change signal for
      // the values, so the effect does not re-run on every render.
    }, [toKey]);

    const interactionProps = {};
    if (whileHover) {
      interactionProps.onMouseEnter = (e) => {
        const el = nodeRef.current;
        if (el) applyValues(el, { ...toValues, ...whileHover }, transitionCss(transition));
        if (onMouseEnter) onMouseEnter(e);
      };
      interactionProps.onMouseLeave = (e) => {
        const el = nodeRef.current;
        if (el && toValues) applyValues(el, toValues, transitionCss(transition));
        if (onMouseLeave) onMouseLeave(e);
      };
    }
    if (whileTap) {
      interactionProps.onPointerDown = (e) => {
        const el = nodeRef.current;
        if (el) applyValues(el, { ...toValues, ...whileTap }, transitionCss(transition));
        if (onPointerDown) onPointerDown(e);
      };
      interactionProps.onPointerUp = (e) => {
        const el = nodeRef.current;
        if (el && toValues) applyValues(el, toValues, transitionCss(transition));
        if (onPointerUp) onPointerUp(e);
      };
    }

    return React.createElement(tag, { ...rest, ...interactionProps, ref: setRef });
  });
}

const componentCache = new Map();
export const motion = new Proxy(
  {},
  {
    get(_target, tag) {
      if (typeof tag !== 'string') return undefined;
      if (!componentCache.has(tag)) componentCache.set(tag, createMotionComponent(tag));
      return componentCache.get(tag);
    },
  },
);

// ── AnimatePresence ─────────────────────────────────────────────────────────
// Passthrough by design (see header): no exit animations. Accepts and
// ignores framer's props (mode, initial, exitBeforeEnter, ...).

export function AnimatePresence({ children }) {
  return <>{children}</>;
}

// ── MotionValue stubs (dead-code surface only — see header) ─────────────────

export function useMotionValue(initialValue) {
  const ref = useRef(null);
  if (!ref.current) {
    let value = initialValue;
    const subscribers = new Set();
    ref.current = {
      get: () => value,
      set: (next) => {
        value = next;
        subscribers.forEach((fn) => fn(value));
      },
      on: (_event, fn) => {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
      },
    };
  }
  return ref.current;
}

export function useTransform(input, transformer) {
  const ref = useRef(null);
  if (!ref.current) {
    ref.current = { get: () => transformer(input.get()) };
  }
  return ref.current;
}

export function animate() {
  return { stop() {}, cancel() {}, pause() {}, play() {} };
}
