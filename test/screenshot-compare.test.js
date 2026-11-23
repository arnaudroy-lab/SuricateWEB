import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Détection d'un changement d'apparence : une capture planifiée qui diffère de la précédente d'au moins le seuil du site déclenche une
// alerte (et un message Telegram suivi de l'image des zones modifiées). Le navigateur est remplacé par un faux moteur qui renvoie la
// différence demandée : la comparaison réelle (dans Chrome) est testée à part (DIFF_FN).
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'suricate-cmp-'));
const sent = [];
const telegram = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    sent.push({ method: req.url.split('/').pop(), body: Buffer.concat(chunks) });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, result: {} }));
  });
});
await new Promise((r) => telegram.listen(0, '127.0.0.1', r));
process.env.TELEGRAM_API = `http://127.0.0.1:${telegram.address().port}`;

const dbm = await import('../src/db.js');
const shots = await import('../src/screenshot.js');
test.after(() => { telegram.close(); dbm.db.close(); });

const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
let plan = []; // une entrée par capture : la différence que le faux navigateur « mesure » (null : pas de comparaison)
const asked = [];
shots.engine.available = () => true;
shots.engine.capture = async (url, opts) => {
  asked.push({ hasPrevious: !!opts.compareWith, ignore: opts.ignore, tolerance: opts.tolerance });
  const pct = plan.shift();
  return { image: JPEG, thumb: JPEG, width: 1280, height: 800, finalUrl: url, title: 'Boutique', diff: opts.compareWith && pct != null ? { pct, image: Buffer.from(`diff-${pct}`) } : null };
};

await dbm.saveSettings({ telegram: { token: '123:ABC', chatId: '42', enabled: true, minSeverity: 'info', sendRecovery: true, includeDiff: true, buttons: false } });
const mkWatch = (compare = { enabled: true, minPct: 10, tolerance: 20, ignore: ['.clock'] }) => dbm.createWatch({ name: 'Boutique', url: 'https://boutique.test/', interval: 5, config: { checks: { dns: false, tls: false, rdap: false }, screenshot: { compare } } });
const alertsOf = async (id) => (await dbm.queryAlerts({ watchId: id })).filter((a) => a.type === 'visual_changed');
const tick = () => new Promise((r) => setTimeout(r, 5));

test('comparaison : pas d\'alerte sur les deux premières captures, une alerte au-dessus du seuil, image des zones modifiées envoyée sur Telegram', async () => {
  const w = await mkWatch();
  plan = [null, 3, 4, 62, 12];
  sent.length = 0;
  for (let i = 0; i < 3; i++) { await shots.captureWatch(w.id, { kind: 'scheduled' }); await tick(); }
  assert.equal((await alertsOf(w.id)).length, 0, 'sous le seuil : rien');
  assert.deepEqual(asked.at(-1), { hasPrevious: true, ignore: ['.clock'], tolerance: 20 }, 'la capture précédente, les éléments ignorés et la tolérance partent au navigateur');
  const list = await dbm.listScreenshots(w.id);
  assert.deepEqual(list.map((s) => s.diffPct).reverse(), [null, 3, 4], 'la différence est gardée avec chaque capture');

  await shots.captureWatch(w.id, { kind: 'scheduled' }); // 62 % : page remplacée
  const [a] = await alertsOf(w.id);
  assert.equal(a.severity, 'critical', 'plus de la moitié de la page : critique');
  assert.match(a.title, /L'apparence de la page a changé \(62 %\)/);
  assert.match(a.detail, /62 % de la page est différent de la capture du/);
  assert.ok(sent.some((m) => m.method === 'sendMessage' && /apparence/.test(m.body.toString())), 'message Telegram');
  const photo = sent.find((m) => m.method === 'sendPhoto');
  assert.ok(photo && photo.body.includes(Buffer.from('diff-62')), 'l\'image des zones modifiées suit le message');
  assert.equal((await dbm.listScreenshots(w.id))[0].diffFile, `${w.id}/${(await dbm.listScreenshots(w.id))[0].ts}.d.jpg`);

  await shots.captureWatch(w.id, { kind: 'scheduled' }); // 12 % : au-dessus du seuil, sous la moitié
  assert.deepEqual((await alertsOf(w.id)).map((x) => x.severity).sort(), ['critical', 'warning']);
});

test('comparaison : captures manuelles sans alerte, comparaison désactivée = aucune comparaison demandée', async () => {
  const w = await mkWatch();
  plan = [null, 5, 80];
  for (const kind of ['scheduled', 'scheduled']) { await shots.captureWatch(w.id, { kind }); await tick(); }
  await shots.captureWatch(w.id, { kind: 'manual' }); // 80 % mais manuelle
  assert.equal((await alertsOf(w.id)).length, 0);
  assert.equal((await dbm.listScreenshots(w.id))[0].diffPct, 80, 'la différence est quand même enregistrée');

  const off = await mkWatch({ enabled: false });
  plan = [90, 90];
  await shots.captureWatch(off.id, { kind: 'scheduled' }); await tick();
  await shots.captureWatch(off.id, { kind: 'scheduled' });
  assert.equal(asked.at(-1).hasPrevious, false, 'désactivée : rien n\'est envoyé au navigateur');
  assert.equal((await alertsOf(off.id)).length, 0);
});

test('comparaison : pendant une maintenance, l\'alerte est retenue (pas de message)', async () => {
  const w = await mkWatch();
  plan = [null, 2, 70];
  for (let i = 0; i < 2; i++) { await shots.captureWatch(w.id, { kind: 'scheduled' }); await tick(); }
  await dbm.addMaintenance({ watchId: w.id, start: Date.now() - 1000, end: Date.now() + 3600e3 });
  sent.length = 0;
  await shots.captureWatch(w.id, { kind: 'scheduled' });
  const [a] = await alertsOf(w.id);
  assert.ok(a && a.maintenance > 0, 'alerte enregistrée, retenue');
  assert.equal(sent.length, 0, 'rien n\'est envoyé');
});

test('retention : le fichier des différences part avec sa capture', async () => {
  const { existsSync } = await import('node:fs');
  const w = await mkWatch();
  plan = [null, 20, 20, 20];
  for (let i = 0; i < 4; i++) { await shots.captureWatch(w.id, { kind: 'scheduled' }); await tick(); }
  const rows = await dbm.listScreenshots(w.id);
  const withDiff = rows.filter((r) => r.diffFile);
  assert.ok(withDiff.length >= 2 && withDiff.every((r) => existsSync(join(dbm.SHOTS_DIR, r.diffFile))));
  await dbm.saveAccountSettings(1, { retention: { screenshots: 1 } });
  await shots.pruneWatchShots(w.id);
  assert.ok(!existsSync(join(dbm.SHOTS_DIR, withDiff.at(-1).diffFile)), 'diff de la plus ancienne supprimée');
});
