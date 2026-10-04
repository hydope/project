/**
 * Measures real Core Web Vitals against production.
 *
 * The grader reported LCP 4073ms from Google's FIELD data, which describes the
 * last 28 days of real visits and cannot be moved by a deploy. That number is
 * only meaningful again once this has shipped and been collected. So this
 * measures LAB data instead: what a first-time visitor on a mid-range connection
 * experiences right now.
 *
 * Emulated to a 4G-ish profile because the likely audience is a mid-range
 * Android across Karachi, Lahore and the Gulf, not a wired desktop.
 */
import { chromium, devices } from 'playwright';

const BASE = process.env.BASE_URL || 'https://shiarishta.com';

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`); }
  else { fail++; console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices['Pixel 5'],
  // Throttle to approximate a mid-range phone on 4G. Playwright's CDP network
  // conditions, not a raw socket, so it does not distort JS execution time.
});
const page = await context.newPage();

// CDP throttling: ~1.6Mbps down, 150ms RTT — roughly "Slow 4G".
const cdp = await context.newCDPSession(page);
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
});

await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });

// Give the SPA a moment to hydrate so the measurement reflects the real
// experience rather than the empty shell.
await page.waitForTimeout(2500);

const vitals = await page.evaluate(() => new Promise((resolve) => {
  const out = { lcp: 0, cls: 0, fcp: 0, ttfb: 0, lcpEl: '', shifts: [] };
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) out.ttfb = Math.round(nav.responseStart);
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    if (fcp) out.fcp = Math.round(fcp.startTime);
  } catch { /* noop */ }

  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      out.lcp = Math.round(last.startTime);
      out.lcpEl = `${last.element?.tagName || '?'}.${(last.element?.className || '').toString().split(' ')[0]}`;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch { /* noop */ }

  try {
    let cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        cls += e.value;
        const src = (e.sources || [])[0];
        out.shifts.push({
          v: Math.round(e.value * 1000) / 1000,
          t: Math.round(e.startTime),
          el: src ? `${src.node?.tagName || '?'}.${(src.node?.className || '').toString().split(' ')[0]}` : '?',
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
    setTimeout(() => { out.cls = Math.round(cls * 1000) / 1000; resolve(out); }, 500);
  } catch {
    resolve(out);
  }
}));

const baseline = await browser.newContext({
  ...devices['Pixel 5'],
  javaScriptEnabled: false,
});
const basePage = await baseline.newPage();
const baseCdp = await baseline.newCDPSession(basePage);
await baseCdp.send('Network.emulateNetworkConditions', {
  offline: false, latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
});
await basePage.goto(BASE, { waitUntil: 'load', timeout: 60000 });
await basePage.waitForTimeout(1500);
const noJsPaint = await basePage.evaluate(() => {
  const fcp = performance.getEntriesByName('first-contentful-paint')[0];
  const nav = performance.getEntriesByType('navigation')[0];
  return {
    fcp: fcp ? Math.round(fcp.startTime) : 0,
    ttfb: nav ? Math.round(nav.responseStart) : 0,
  };
});
await baseline.close();

console.log(`\n  TTFB  ${vitals.ttfb}ms`);
console.log(`  FCP   ${vitals.fcp}ms   (no-JS baseline: ${noJsPaint.fcp}ms)`);
console.log(`  LCP   ${vitals.lcp}ms  (${vitals.lcpEl})`);
console.log(`  CLS   ${vitals.cls}`);
if (vitals.shifts.length) {
  console.log('  shift sources:');
  for (const s of vitals.shifts.slice(0, 6)) {
    console.log(`    ${String(s.v).padStart(6)} @${String(s.t).padStart(5)}ms  ${s.el}`);
  }
}
console.log('');

// Google's "good" thresholds.

// A render-blocking font or an oversized hero would show up here.
const resources = await page.evaluate(() =>
  performance.getEntriesByType('resource').map((r) => ({
    name: r.name.split('/').pop(),
    type: r.initiatorType,
    kb: Math.round((r.transferSize || 0) / 1024),
    ms: Math.round(r.duration),
  })),
);
const totalKb = resources.reduce((a, r) => a + r.kb, 0);
const js = resources.filter((r) => r.type === 'script' || r.name.endsWith('.js'));
const jsKb = js.reduce((a, r) => a + r.kb, 0);
console.log(`  JS transferred before settle: ${jsKb}KB across ${js.length} files`);
console.log(`  Total transferred: ${totalKb}KB across ${resources.length} resources`);

const heavy = resources.filter((r) => r.kb > 200).sort((a, b) => b.kb - a.kb);
if (heavy.length) console.log(`  Largest: ${heavy.slice(0, 3).map((r) => `${r.name} ${r.kb}KB`).join(', ')}`);


await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);