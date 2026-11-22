/**
 * Proves the static SEO shell behaves correctly in a real browser.
 *
 * Two failure modes matter and neither shows up in a source diff:
 *
 *  1. The shell is still in the DOM once React mounts — duplicate content,
 *     duplicate H1, and a page that looks broken. (React's createRoot
 *     clears #root, so both shell parts must be gone.)
 *  2. Nothing readable exists when JS never runs, so a no-JS user gets a
 *     blank page — the exact problem this work set out to fix.
 *
 * The shell has two parts since 2026-11-22: the full crawler copy inside
 * .seo-static (display:none — read from source, never painted) and the
 * route's hero emitted a second time in .seo-static.seo-shell, which IS
 * painted at first paint so users see the headline, CTAs and hero image
 * instead of a blank cream screen behind a spinner. The checks below map
 * to those two parts: block 1 proves both are replaced on mount; block 2
 * proves the visible hero works without JS and the crawler copy is still
 * complete in the document.
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

  const shellCount = await page.locator('.seo-static').count();
  check('the static shell is fully replaced once React mounts', shellCount === 0, `found ${shellCount}`);

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
// The visible hero is what a no-JS user (or a slow-JS phone) actually gets;
// the hidden crawler copy must still be complete in the document source.
{
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });

  const hero = page.locator('.seo-shell');
  check('the hero shell is visible without JavaScript', await hero.isVisible());

  const h1 = (await hero.locator('h1').innerText().catch(() => '')).trim();
  check('a no-JS reader gets a real H1', h1.length > 0, 'h1 was empty');

  const heroImg = await hero.locator('img.seo-hero-img').count();
  check('a no-JS reader gets the hero image', heroImg === 1, `found ${heroImg}`);

  const heroText = (await hero.innerText()).replace(/\s+/g, ' ').trim();
  check('a no-JS reader gets the hero copy and CTAs', heroText.length > 150, `${heroText.length} chars`);

  // The crawler copy: hidden from paint, complete in the document.
  const copy = page.locator('.seo-static:not(.seo-shell)');
  check('the crawler copy is present in the document', (await copy.count()) === 1);

  const headings = await copy.locator('h1, h2, h3').count();
  check('the crawler copy has a heading structure', headings >= 6, `found ${headings}`);

  const navCount = await copy.locator('nav').count();
  check('the crawler copy has a navigation landmark', navCount >= 1, `found ${navCount}`);

  const fullText = await copy.evaluate((el) => el.textContent).then((t) => t.replace(/\s+/g, ' ').trim());
  check('the crawler copy carries substantial text', fullText.length > 1500, `${fullText.length} chars`);

  // Legal and trust signals a crawler looks for. Prerendered routes link in
  // trailing-slash form (the URL that serves 200), so accept both forms.
  const hrefs = await copy.locator('a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  const hasRoute = (route) => hrefs.some((h) => h === route || h === `${route}/`);
  check('privacy policy is reachable without JS', hasRoute('/privacy'));
  check('terms are reachable without JS', hasRoute('/terms'));
  check('a contact route is reachable without JS', hasRoute('/contact'));

  // Honesty: the shell must not claim things we cannot prove.
  check(
    'the shell states the service is free',
    /free/i.test(fullText),
    'no pricing statement found'
  );
  check(
    'the shell invents no testimonials',
    !/testimonial/i.test(fullText)
  );
  check(
    'the shell invents no member count',
    !/\b[\d,]+\+?\s+(members|families|couples)\b/i.test(fullText),
    'a hardcoded member count is present'
  );

  await context.close();
}

await browser.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);