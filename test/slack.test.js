// Canal Slack : webhook entrant. Mise en forme, validation de l'adresse, nouvelle tentative sur 429, réglages (secret masqué),
// acheminement réel d'une alerte (avec Telegram en parallèle) et chiffrement au repos.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'suricate-slack-'));
process.env.CHROME_PATH = '/nonexistent/chrome';

// Faux Slack : enregistre les messages ; le comportement est piloté par `mode`.
const posts = [];
let mode = 'ok'; // ok | 429-once | 429-always | revoked | archived
let hits = 0;
const fakeSlack = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    hits++;
    if (mode === '429-always' || (mode === '429-once' && hits === 1)) { res.writeHead(429, { 'retry-after': '0' }); return res.end('rate_limited'); }
    if (mode === 'revoked') { res.writeHead(404); return res.end('no_service'); }
    if (mode === 'archived') { res.writeHead(403); return res.end('channel_is_archived'); }
    posts.push({ url: req.url, body: JSON.parse(b) });
    res.writeHead(200); res.end('ok');
  });
});
await new Promise((r) => fakeSlack.listen(0, '127.0.0.1', r));
const SLACK = `http://127.0.0.1:${fakeSlack.address().port}`;
process.env.SLACK_API = SLACK;
const HOOK = `${SLACK}/services/T0123ABCD/B0456EFGH/xyzSECRETxyz123`;

const tgSent = [];
const fakeTelegram = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => { if (req.url.endsWith('/sendMessage')) tgSent.push(JSON.parse(b)); res.setHeader('content-type', 'application/json'); res.end('{"ok":true,"result":{}}'); });
});
await new Promise((r) => fakeTelegram.listen(0, '127.0.0.1', r));
process.env.TELEGRAM_API = `http://127.0.0.1:${fakeTelegram.address().port}`;

let page = '<html><head><title>Boutique</title></head><body><p>Artisan depuis 1987.</p><p>Contact</p><p>Mentions légales</p></body></html>';
const site = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); });
await new Promise((r) => site.listen(0, '127.0.0.1', r));

const dbm = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { runCheck } = await import('../src/checker.js');
const { cleanWebhookUrl, maskWebhook, buildSlackMessage, postToWebhook } = await import('../src/slack.js');
const { resetExtensions } = await import('../src/extensions.js');

const app = createApp({ auth: { authenticate: () => ({ user: { id: 1, name: 'alice' }, account: { id: 1 } }), register: ({ route }) => route('GET', '/api/auth', () => ({}), { public: true }) } });
const base = `http://127.0.0.1:${await app.listen(0, '127.0.0.1')}`;
const call = async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* pas du JSON */ }
  return { status: res.status, json, text };
};
test.beforeEach(() => { resetExtensions(); posts.length = 0; tgSent.length = 0; mode = 'ok'; hits = 0; });

test('adresse du webhook : seule la forme Slack est acceptée, sans paramètres ni identifiants', () => {
  assert.equal(cleanWebhookUrl(HOOK), HOOK);
  assert.equal(cleanWebhookUrl(`  ${HOOK}  `), HOOK);
  for (const bad of ['', 'n\'importe quoi', `${SLACK}/services/T1/B2`, `${SLACK}/other/T1/B2/c3`, `${SLACK}/services/T1/B2/c3?x=1`, `${SLACK}/services/T1/B2/c3#h`,
    'http://169.254.169.254/services/T1/B2/c3', 'https://evil.example/services/T1/B2/c3', `http://u:p@127.0.0.1:${fakeSlack.address().port}/services/T1/B2/c3`, `${HOOK}/../x`]) {
    assert.equal(cleanWebhookUrl(bad), '', `refusée : ${bad}`);
  }
  assert.equal(cleanWebhookUrl(`${HOOK}${'a'.repeat(300)}`), '');
  assert.ok(!maskWebhook(HOOK).includes('xyzSECRETxyz123'.slice(0, 10)) && maskWebhook(HOOK).endsWith('z123'), maskWebhook(HOOK));
  assert.equal(maskWebhook(''), '');
});

test('message : couleur de la gravité, échappement mrkdwn, extrait des changements facultatif, bouton si adresse publique', () => {
  const watch = { id: 7, name: 'Boutique <b>&Co</b>', url: 'https://boutique.test/' };
  const alerts = [
    { severity: 'warning', title: 'Contenu <modifié> & plus', detail: 'Détail', diffPreview: '+ nouvelle ligne ``` fin' },
    { severity: 'critical', title: 'Mot suspect', detail: '' },
  ];
  const m = buildSlackMessage(watch, alerts, { baseUrl: 'https://suricate.example.org/', slack: { includeDiff: true } });
  assert.equal(m.attachments[0].color, '#cf222e', 'la gravité la plus haute colore la barre');
  assert.match(m.text, /CRITIQUE · Boutique/);
  const json = JSON.stringify(m);
  assert.ok(!json.includes('<modifié>') && json.includes('&lt;modifié&gt; &amp; plus'), 'échappement &, <, >');
  assert.ok(json.includes('nouvelle ligne') && !/```[^`]*```[^`]*```/.test(json.replace(/\\n/g, '')), 'les ``` du diff ne cassent pas le bloc de code');
  const blocks = m.attachments[0].blocks;
  assert.equal(blocks[0].type, 'header');
  assert.equal(blocks.at(-1).elements[0].url, 'https://suricate.example.org/#/sites/7');
  assert.ok(!JSON.stringify(buildSlackMessage(watch, alerts, { baseUrl: '', slack: { includeDiff: false } })).includes('nouvelle ligne'), 'sans extrait si désactivé');
  assert.ok(!buildSlackMessage(watch, alerts, { baseUrl: 'http://localhost:3000', slack: {} }).attachments[0].blocks.some((b) => b.type === 'actions'), 'pas de bouton vers une adresse locale');
  const many = buildSlackMessage(watch, Array.from({ length: 40 }, (_, i) => ({ severity: 'info', title: `a${i}` })), { baseUrl: '' });
  assert.ok(many.attachments[0].blocks.length <= 50, 'limite de 50 blocs de Slack');
});

test('envoi : 429 → une nouvelle tentative ; deux 429 → erreur claire ; webhook révoqué ou canal archivé → message lisible', async () => {
  mode = '429-once';
  await postToWebhook(HOOK, { text: 'x' });
  assert.equal(hits, 2); assert.equal(posts.length, 1);
  mode = '429-always'; hits = 0;
  await assert.rejects(postToWebhook(HOOK, { text: 'x' }), /limite les envois/);
  assert.equal(hits, 2, 'une seule nouvelle tentative');
  mode = 'revoked';
  await assert.rejects(postToWebhook(HOOK, { text: 'x' }), /invalide ou révoquée/);
  mode = 'archived';
  await assert.rejects(postToWebhook(HOOK, { text: 'x' }), /archivé/);
  await assert.rejects(postToWebhook('https://evil.example/services/T/B/c', { text: 'x' }), /manquante ou invalide/);
});

test('réglages : adresse invalide refusée, secret jamais renvoyé, test d\'envoi, conservation si le champ est vide', async () => {
  const bad = await call('PUT', '/api/settings', { slack: { webhookUrl: 'https://evil.example/services/T/B/c' } });
  assert.equal(bad.status, 400);
  assert.equal((await call('POST', '/api/slack/test', {})).status, 400, 'rien d\'enregistré : demande de coller l\'adresse');

  const t = await call('POST', '/api/slack/test', { webhookUrl: HOOK });
  assert.equal(t.status, 200);
  assert.equal(posts.length, 1, 'le test envoie vraiment un message');
  assert.match(JSON.stringify(posts[0].body), /SuricateWeb est connecté/);

  const put = await call('PUT', '/api/settings', { slack: { webhookUrl: HOOK, minSeverity: 'critical', sendRecovery: false } });
  assert.equal(put.status, 200);
  assert.equal(put.json.slack.webhookSet, true);
  assert.equal(put.json.slack.minSeverity, 'critical');
  assert.ok(!put.text.includes('xyzSECRETxyz123'), 'le secret n\'est jamais renvoyé');
  assert.equal((await dbm.settingsFor(1)).slack.webhookUrl, HOOK);

  // Le formulaire renvoie le champ vide quand on ne change rien : l'adresse enregistrée est conservée, et le test l'utilise.
  await call('PUT', '/api/settings', { slack: { webhookUrl: '', enabled: true } });
  assert.equal((await dbm.settingsFor(1)).slack.webhookUrl, HOOK);
  posts.length = 0;
  assert.equal((await call('POST', '/api/slack/test', {})).status, 200);
  assert.equal(posts.length, 1);

  await call('PUT', '/api/settings', { slack: { clearWebhook: true } });
  assert.equal((await call('GET', '/api/settings')).json.slack.webhookSet, false);
  assert.equal((await dbm.settingsFor(1)).slack.webhookUrl, '');
});

test('alerte réelle : Slack et Telegram reçoivent la même alerte ; Slack coupé ou gravité insuffisante : rien', async () => {
  await call('PUT', '/api/settings', { telegram: { token: 'T:tok', chatId: '99', enabled: true, minSeverity: 'warning' }, slack: { webhookUrl: HOOK, enabled: true, minSeverity: 'warning', sendRecovery: true } });
  const w = await dbm.createWatch({ name: 'Boutique', url: `http://127.0.0.1:${site.address().port}/`, interval: 5, config: { checks: { dns: false, tls: false, rdap: false }, screenshot: { enabled: false } } });
  await runCheck(w.id);
  page = page.replace('</body>', '<p>Nouvelle offre</p></body>');
  await runCheck(w.id);
  assert.equal(tgSent.length, 1, 'Telegram prévenu');
  assert.equal(posts.length, 1, 'Slack prévenu');
  assert.match(JSON.stringify(posts[0].body), /Boutique/);
  assert.ok((await dbm.db.all('SELECT notified FROM alerts WHERE watch_id = ?', [w.id])).every((r) => r.notified), 'alerte marquée envoyée');

  posts.length = 0; tgSent.length = 0;
  await call('PUT', '/api/settings', { slack: { enabled: false } });
  page = page.replace('</body>', '<p>Autre offre</p></body>');
  await runCheck(w.id);
  assert.equal(posts.length, 0, 'Slack coupé');
  assert.equal(tgSent.length, 1, 'Telegram continue');

  // Slack en panne : l'alerte reste envoyée par Telegram, et l'erreur de Slack n'empêche rien.
  await call('PUT', '/api/settings', { slack: { enabled: true } });
  mode = 'revoked';
  page = page.replace('</body>', '<p>Encore une offre</p></body>');
  tgSent.length = 0;
  await runCheck(w.id);
  assert.equal(tgSent.length, 1);
});

test('chiffrement au repos : l\'adresse du webhook est chiffrée en base avec un codec, lisible en mémoire', () => {
  const REGISTRY = new URL('../src/store/registry.js', import.meta.url).href;
  const DB = new URL('../src/db.js', import.meta.url).href;
  const codec = `{ seal: (t) => 'v1:' + Buffer.from('k|' + t).toString('base64url'), open: (s) => Buffer.from(s.slice(3), 'base64url').toString().slice(2) }`;
  const d = mkdtempSync(join(tmpdir(), 'suricate-slacksec-'));
  const out = execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e',
    `const { configureStore } = await import(${JSON.stringify(REGISTRY)}); configureStore({ secrets: ${codec} });
     const dbm = await import(${JSON.stringify(DB)});
     await dbm.saveAccountSettings(5, { slack: { webhookUrl: ${JSON.stringify(HOOK)} } });
     const raw = JSON.parse((await dbm.db.get('SELECT value FROM settings WHERE key = ?', ['account:5'])).value);
     console.log('@@' + JSON.stringify({ raw: raw.slack.webhookUrl, mem: (await dbm.settingsFor(5)).slack.webhookUrl })); process.exit(0);`,
  ], { env: { ...process.env, DATA_DIR: d }, encoding: 'utf8' });
  const r = JSON.parse(out.split('@@').pop());
  assert.match(r.raw, /^v1:/);
  assert.ok(!r.raw.includes('xyzSECRET') && !r.raw.includes('T0123ABCD'), 'plus rien de lisible en base');
  assert.equal(r.mem, HOOK);
});

test.after(async () => {
  await app.stop();
  fakeSlack.close();
  fakeTelegram.close();
  site.close();
  dbm.db.close();
});
