// Probes authenticated admin endpoints with a hard timeout, so a hanging PHP
// route is reported as a hang instead of stalling the run.
// Usage: set SH_TOKEN=... ; node scripts/probe-admin.cjs /api/admin/analytics?range=7d
const https = require('https');

const TOKEN = process.env.SH_TOKEN;
const BASE = process.env.SH_BASE || 'https://shiarishta.com';
const paths = process.argv.slice(2);

if (!TOKEN) {
  console.error('set SH_TOKEN to an admin bearer token');
  process.exit(1);
}

const get = (p, ms) => new Promise((resolve) => {
  const started = Date.now();
  const req = https.get(
    BASE + p,
    { headers: { Authorization: 'Bearer ' + TOKEN, 'User-Agent': 'probe' } },
    (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: d, ms: Date.now() - started }));
    }
  );
  req.on('error', (e) => resolve({ status: 'ERR', body: e.message, ms: Date.now() - started }));
  req.setTimeout(ms, () => {
    req.destroy();
    resolve({ status: 'TIMEOUT', body: '', ms: Date.now() - started });
  });
});

(async () => {
  for (const p of paths) {
    const r = await get(p, 30000);
    console.log(`${p}\n  -> ${r.status} in ${r.ms}ms\n  ${r.body.slice(0, 400)}\n`);
  }
})();