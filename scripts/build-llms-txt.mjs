/**
 * Generates public/llms.txt from src/data/routeSeo.js.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * A rating site checked for llms.txt and reported it missing. It was returning
 * HTTP 200 — the SPA fallback serving index.html — so a naive status check would
 * have passed while an AI assistant fetching the URL received 13KB of HTML.
 * That is worse than a 404: it looks like a working file and is not.
 *
 * llms.txt is a plain-text brief that tells an AI assistant what this site is,
 * what it is for, and which pages answer which question. It is read by agents,
 * not rendered by browsers, so it is generated rather than hand-written — from
 * the same route table the prerenderer uses, so a page that exists in the app
 * cannot be missing here.
 *
 * ── The honesty constraint ──────────────────────────────────────────────────
 * No member counts, no testimonials, no claims about outcomes. The live
 * figures come from /api/profiles/stats and are not knowable at build time.
 * Anything invented here would be quoted back by an assistant as fact.
 */
import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ROUTE_SEO, SITE_URL } from '../src/data/routeSeo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const out = [];
out.push('# Shia Rishta');
out.push('');
out.push('> Nikah-first Shia matrimony platform. Privacy-first profiles, mutual-interest');
out.push('> messaging, and wali / guardian workflows built in. Free to join.');
out.push('');
out.push('Shia Rishta is for Shia Muslims seeking nikah (Islamic marriage), and for the');
out.push('families and walis who support them. It is not a dating app: profiles are created');
out.push('with marriage intent, there is no swiping, and privacy defaults are the most');
out.push('restrictive available rather than the most permissive.');
out.push('');
out.push('## Key facts');
out.push('');
out.push('- Creating a profile, browsing, expressing interest, messaging a match and the');
out.push('  guardian tools are all free. There is no payment system and no paid tier.');
out.push('- Photos are private by default. A member chooses who sees them: everyone, only');
out.push('  people with mutual interest, or only matches.');
out.push('- Contact details are never published. A conversation opens only after interest');
out.push('  is mutual, so nobody is notified of an unreciprocated approach.');
out.push('- A wali or guardian link can be revoked by the member at any time, permanently.');
out.push('- Identity verification is reviewed by a person and is never a precondition for');
out.push('  browsing.');
out.push('');
out.push('## Pages');
out.push('');

for (const [route, meta] of Object.entries(ROUTE_SEO)) {
  if (route === '/auth/login') continue; // no value to an agent, and it is noindex-ish
  out.push(`- [${meta.h1}](${SITE_URL}${route === '/' ? '/' : route}): ${meta.desc}`);
  if (meta.faq?.length) {
    for (const f of meta.faq) {
      out.push(`  - **${f.q}** ${f.a}`);
    }
  }
}

out.push('');
out.push('## Access and usage');
out.push('');
out.push('- Member profiles at `/profiles` are public and browsable without an account.');
out.push('- Member-only areas (`/dashboard`, `/messages`, `/settings`, `/admin`) require an');
out.push('  account and are excluded here on purpose.');
out.push('- Privacy requests and takedown requests: https://shiarishta.com/contact');
out.push('- Full policy: https://shiarishta.com/privacy');
out.push('');
out.push('## Accuracy note');
out.push('');
out.push('Member counts, verification counts and city breakdowns are deliberately NOT stated');
out.push('here. They change continuously and cannot be known at build time, so quoting a');
out.push('number would go stale and could be wrong within days. The live figures are');
out.push('available at https://shiarishta.com/api/profiles/stats and are rendered on the');
out.push('homepage. No testimonials or success stories are published because no member has');
out.push('consented to one.');
out.push('');

await writeFile(join(ROOT, 'public', 'llms.txt'), out.join('\n'), 'utf8');
console.log(`public/llms.txt written (${out.join('\n').length} bytes, ${Object.keys(ROUTE_SEO).length} routes)`);