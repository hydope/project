// One-off production verification: confirm the rebuilt admin console is served.
// Checks the route paths and lazy component names in the deployed index chunk.
const https = require('https');
const https = require('https');

const get = (url) => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': 'verify' } }, (res) => {
    let d = '';
    res.on('data', (c) => { d += c; });
    res.on('end', () => resolve(d));
  }).on('error', reject);
});

(async () => {
  const html = await get('https://shiarishta.com/');
  const files = [...html.matchAll(/assets\/([A-Za-z0-9_.-]+\.js)/g)].map((m) => m[1]);
  const keys = [
    'AdminQueue', 'AdminMembers', 'AdminAudit',
    'queue', 'members', 'audit',
    'AdminMessages', // should be gone
  ];
  const found = [];
  for (const f of files) {
    let c;
    try { c = await get('https://shiarishta.com/assets/' + f); } catch { continue; }
    for (const k of keys) if (c.includes(k)) found.push(k + '  <-  ' + f);
  }
  const uniq = [...new Set(found)];
  console.log(uniq.length ? uniq.join('\n') : 'nothing found');
})();