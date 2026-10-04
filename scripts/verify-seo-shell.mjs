/**
 * Proves the static SEO shell behaves correctly in a real browser.
 *
 * Two failure modes matter and neither shows up in a source diff:
 *
 *  1. The shell never hides, so it renders ON TOP of the React app — duplicate
 *     content, duplicate H1, and a page that looks broken.
 *  2. The shell hides even when JS never runs, so a no-JS user gets a blank
 *     page — the exact problem this work set out to fix.
 *
 * Playwright is already a dev dependency for the E2E suite, so this reuses it
 * rather than adding a browser driver.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'https://shiarishta.com';

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
};

const browser = await chromium.launch();

// ── 1. With JavaScript enabled ──────────────────────────────────────────────
{
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 });

  const shell = page.locator('.seo-static');
  const shellVisible = await shell.isVisible().catch(() => false);
  check('the static shell is hidden once React mounts', shellVisible === false);

  // If it were still present it would be a second H1 in the accessibility tree.
  const h1s = await page.locator('h1').count();
  check('the hydrated page has exactly one H1', h1s === 1, `found ${h1s}`);

  const navs = await page.locator('nav').count();
  check('the hydrated page exposes a navigation landmark', navs >= 1, `found ${navs}`);

  const heroText = await page.locator('h1').first().innerText().catch(() => '');
  check('the React app actually rendered', heroText.trim().length > 0, 'h1 was empty');

  await page.close();
}

// ── 2. With JavaScript disabled ─────────────────────────────────────────────
// This is the whole point of the shell. If the content is not readable here,
// the fix does not work for the crawlers that motivated it.
{
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });

  const shell = page.locator('.seo-static');
  check('the static shell is visible without JavaScript', await shell.isVisible());

  const h1 = (await page.locator('h1').innerText().catch(() => '')).trim();
  check('a no-JS reader gets a real H1', h1.length > 0, 'h1 was empty');

  const headings = await page.locator('h1, h2, h3').count();
  check('a no-JS reader gets a heading structure', headings >= 6, `found ${headings}`);

  const navCount = await page.locator('nav').count();
  check('a no-JS reader gets a navigation landmark', navCount >= 1, `found ${navCount}`);

  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  check('a no-JS reader gets substantial text', text.length > 1500, `${text.length} chars`);

  // Legal and trust signals a crawler looks for.
  const hrefs = await page.locator('a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  check('privacy policy is reachable without JS', hrefs.includes('/privacy'));
  check('terms are reachable without JS', hrefs.includes('/terms'));
  check('a contact route is reachable without JS', hrefs.includes('/contact'));

  // Honesty: the shell must not claim things we cannot prove.
  check(
    'the shell states the service is free',
    /free/i.test(text),
    'no pricing statement found'
  );
  check(
    'the shell invents no testimonials',
    !/testimonial/i.test(text)
  );
  check(
    'the shell invents no member count',
    !/\b[\d,]+\+?\s+(members|families|couples)\b/i.test(text),
    'a hardcoded member count is present'
  );

  await context.close();
}

await browser.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);