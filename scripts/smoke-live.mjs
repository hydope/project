// Post-deploy smoke test: load the top public routes in a real browser
// and fail if any of them shows the crash screen.
//
// Why this exists (2026-11-17): a declaration-order bug in Profiles.jsx
// crashed /profiles for EVERY visitor for a full day. The build was
// green, the API was healthy, and the deploy "succeeded" — nothing
// noticed until a member deleted his account over it. The only honest
// check is a browser looking at the rendered page, so the deploy
// workflow runs this after every deploy and goes red if a top route is
// down. It would have caught that bug in the same run that shipped it.
//
// Usage: node scripts/smoke-live.mjs [baseUrl]
// Exit code 0 = every route healthy, 1 = at least one failure.
import { chromium } from 'playwright';

const BASE = (process.argv[2] || process.env.SMOKE_BASE_URL || 'https://shiarishta.com').replace(/\/$/, '');

const ROUTES = [
  { path: '/', label: 'homepage' },
  { path: '/profiles/', label: 'browse', needsProfileLinks: true },
  { path: '/auth/login', label: 'login' },
  { path: '/auth/register', label: 'register' },
  { path: '/how-it-works', label: 'how it works' },
  { path: '/blog', label: 'blog' },
  { path: '/city/hyderabad-india/', label: 'city page' },
];

const CRASH_TEXT = 'Something went wrong';

// Honor the standard proxy env vars when present (some networks route
// all egress through one); CI runners have none set and connect directly.
function proxyFromEnv() {
  const raw = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    const proxy = { server: `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}` };
    if (u.username) proxy.username = decodeURIComponent(u.username);
    if (u.password) proxy.password = decodeURIComponent(u.password);
    return proxy;
  } catch {
    return undefined;
  }
}

const browser = await chromium.launch({ args: ['--no-sandbox'], proxy: proxyFromEnv() });
let failures = 0;
for (const route of ROUTES) {
  const page = await browser.newPage();
  const url = BASE + route.path;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // Let the SPA settle: lazy chunks + first data fetch.
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2_500);
    const text = await page.evaluate(() => document.body?.innerText || '');
    if (text.includes(CRASH_TEXT)) {
      console.log(`FAIL ${route.label} ${route.path} — crash screen shown`);
      failures++;
    } else if (route.needsProfileLinks) {
      // Profile cards link to /profiles/<id> (the detail route) — count
      // anchors whose href has a real id segment after /profiles/.
      const links = await page.evaluate(() => [...document.querySelectorAll('a')]
        .filter((a) => /\/profiles\/[^/?#]+/.test(a.getAttribute('href') || '')).length);
      if (links === 0) {
        console.log(`FAIL ${route.label} ${route.path} — no crash screen, but zero profile links rendered (empty/broken grid)`);
        failures++;
      } else {
        console.log(`PASS ${route.label} ${route.path} — ${links} profile links`);
      }
    } else if (text.trim().length < 40) {
      console.log(`FAIL ${route.label} ${route.path} — page rendered almost no text (${text.trim().length} chars)`);
      failures++;
    } else {
      console.log(`PASS ${route.label} ${route.path}`);
    }
  } catch (e) {
    console.log(`FAIL ${route.label} ${route.path} — ${String(e.message || e).split('\n')[0]}`);
    failures++;
  } finally {
    await page.close().catch(() => {});
  }
}
await browser.close();
if (failures > 0) {
  console.log(`SMOKE FAILED: ${failures} of ${ROUTES.length} routes unhealthy at ${BASE}`);
  process.exit(1);
}
console.log(`SMOKE PASSED: all ${ROUTES.length} routes healthy at ${BASE}`);
