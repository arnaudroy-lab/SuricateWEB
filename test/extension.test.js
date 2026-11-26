// Point d'extension d'une fonction métier (src/extension.js) : sans extension le cœur ne change rien ; avec une extension, chaque crochet est appelé
// au bon endroit. Le connecteur WordPress / PrestaShop de la version hébergée en est le premier utilisateur (testé dans son propre dépôt).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'suricate-ext-'));
process.env.CHROME_PATH = '/nonexistent/chrome';
process.env.SURICATE_CAPTURES = '0'; // aucune capture en tâche de fond pendant le test

const dbm = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { setExtension, getExtension, hook } = await import('../src/extension.js');
const { isRunning } = await import('../src/scheduler.js');

const auth = { authenticate: () => ({ user: { id: 1, name: 'alice' }, account: { id: 1 } }), register: ({ route }) => route('GET', '/api/auth', () => ({}), { public: true }) };
const apps = [];
async function start(extension) {
  const app = createApp({ auth, extension });
  const base = `http://127.0.0.1:${await app.listen(0, '127.0.0.1')}`;
  apps.push(app);
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* pas du JSON */ }
    return { status: r.status, json, text, headers: r.headers };
  };
  return { app, base, call };
}
const settle = async (id) => { for (let i = 0; i < 200 && isRunning(id); i++) await new Promise((r) => setTimeout(r, 25)); };
test.after(async () => { for (const a of apps) await a.stop(); setExtension(null); dbm.db.close(); });

const body = { name: 'Site', url: 'https://exemple.test/', interval: 5, config: { checks: { dns: false, tls: false, rdap: false }, cms: { secret: 'x'.repeat(10), deep: { a: 1 } } } };

test('le registre : un objet de crochets, null pour le retirer, un crochet absent rend la valeur de repli', () => {
  assert.equal(getExtension(), null);
  assert.throws(() => setExtension('texte'), /objet/);
  assert.throws(() => setExtension([]), /objet/);
  setExtension({ double: (n) => n * 2 });
  assert.equal(hook('double', 0, 4), 8);
  assert.equal(hook('absent', 'repli', 4), 'repli');
  setExtension(null);
  assert.equal(hook('double', 'repli', 4), 'repli');
});

test('sans extension : aucune route, aucun module d\'interface, configuration de l\'extension gardée telle quelle', async () => {
  const s = await start(null);
  const caps = (await s.call('GET', '/api/capabilities')).json;
  assert.equal('uiModule' in caps, false);
  assert.equal((await s.call('GET', '/api/plugins')).status, 404);
  const w = (await s.call('POST', '/api/watches', body)).json;
  await settle(w.id);
  assert.equal((await s.call('GET', `/api/watches/${w.id}`)).json.config.cms.secret, 'x'.repeat(10));
  assert.equal(w.exemple, undefined);
});

test('avec une extension : configuration, champs, routes, adresse publique, module d\'interface, tâches de fond', async () => {
  const calls = [];
  const seen = [];
  const ext = {
    name: 'exemple',
    ui: { script: '/ext-exemple.js' },
    routes: [({ route }) => route('GET', '/api/exemple', () => ({ ok: true }), { perm: 'site:read' })],
    publicHandlers: [{ pattern: /^\/exemple\/([a-z]+)\.json$/, handle: (req, res, m) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ jeton: m[1] })); } }],
    start: () => calls.push('start'),
    stop: () => calls.push('stop'),
    normalizeConfig: (raw) => ({ kind: String(raw?.kind ?? 'aucun').slice(0, 5), token: String(raw?.token ?? '') }),
    configureWatch: (cfg) => { if (cfg.cms.kind === 'refuse') { const e = new Error('Réglage refusé'); e.status = 400; throw Object.assign(e, { name: 'HttpError' }); } cfg.cms.token ||= 'généré'; },
    listFields: (w) => ({ champListe: w.name }),
    detailFields: (w) => ({ champFiche: w.id }),
    watchCreated: (w) => { calls.push(`créé:${w.id}`); return null; },
    updatePatch: () => ({ nextCms: 4242 }),
    ownsIncident: (key) => key.startsWith('ext_'),
    incidents: ({ watch }) => { seen.push(watch?.id); return { active: false }; },
  };
  const s = await start(ext);
  assert.equal((await s.call('GET', '/api/capabilities')).json.uiModule, '/ext-exemple.js');
  assert.deepEqual((await s.call('GET', '/api/exemple')).json, { ok: true }, 'route de l\'extension');
  const pub = await fetch(`${s.base}/exemple/abc.json`);
  assert.deepEqual(await pub.json(), { jeton: 'abc' }, 'adresse publique hors /api');
  assert.equal((await fetch(`${s.base}/exemple/ABC.json`)).status, 404, 'seul ce que le motif accepte');

  const w = (await s.call('POST', '/api/watches', { ...body, config: { ...body.config, cms: { kind: 'wp', token: '' } } })).json;
  await settle(w.id);
  assert.equal(w.champListe, 'Site', 'champs ajoutés à la liste');
  assert.ok(calls.includes(`créé:${w.id}`));
  const d = (await s.call('GET', `/api/watches/${w.id}`)).json;
  assert.deepEqual(d.config.cms, { kind: 'wp', token: 'généré' }, 'configuration normalisée puis complétée par l\'extension');
  assert.equal(d.champFiche, w.id, 'champs ajoutés à la fiche');
  await s.call('PUT', `/api/watches/${w.id}`, { ...body, config: { ...body.config, cms: { kind: 'wp', token: 'a' } } });
  await settle(w.id);
  assert.equal((await dbm.getWatch(w.id)).nextCms, 4242, 'le correctif de modification vient de l\'extension');
  assert.ok(seen.includes(w.id), 'le crochet des incidents reçoit le site (donc son compte)');
  assert.ok(calls.includes('start') === false, 'start n\'est appelé que par startBackground()');
  s.app.startBackground();
  assert.ok(calls.includes('start'));
  await s.app.stop();
  apps.splice(apps.indexOf(s.app), 1);
  assert.ok(calls.includes('stop'), 'stop() est appelé à l\'arrêt');
  await settle(w.id);
});

test('incidents de l\'extension : acquittables par « Tout est normal », le relevé reste', async () => {
  const s = await start({ ownsIncident: (k) => k.startsWith('ext_') });
  const w = (await s.call('POST', '/api/watches', body)).json;
  await settle(w.id);
  const state = { incidents: { ext_x: { severity: 'warning', title: 'T', detail: '', since: 1 } }, cms: { garde: true } };
  await dbm.db.run('UPDATE watches SET state = ?, last_check = 1 WHERE id = ?', [JSON.stringify(state), w.id]);
  const open = async () => (await s.call('GET', `/api/watches/${w.id}`)).json.incidents.filter((i) => !i.acked).map((i) => i.key);
  assert.deepEqual(await open(), ['ext_x']);
  assert.equal((await s.call('POST', `/api/watches/${w.id}/ack`)).status, 200);
  assert.deepEqual(await open(), []);
});
