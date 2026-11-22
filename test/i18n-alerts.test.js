import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Un compte en anglais : les alertes détectées ET le message Telegram sont en anglais ; un compte en français, inchangé.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'suricate-i18n-'));
const sent = [];
const fakeTelegram = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    if (req.url.endsWith('/sendMessage')) sent.push(JSON.parse(b));
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, result: {} }));
  });
});
await new Promise((r) => fakeTelegram.listen(0, '127.0.0.1', r));
process.env.TELEGRAM_API = `http://127.0.0.1:${fakeTelegram.address().port}`;

let html = '';
const site = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); });
await new Promise((r) => site.listen(0, '127.0.0.1', r));
const siteUrl = `http://127.0.0.1:${site.address().port}/`;
test.after(() => { site.close(); fakeTelegram.close(); });

const db = await import('../src/db.js');
const { runCheck } = await import('../src/checker.js');
const page = (extra = '') => `<!doctype html><html><head><title>Shop</title></head><body><h1>Welcome</h1><p>Craftsman since 1987.</p><p>Our products</p><p>Our story</p>${extra}</body></html>`;
const defaced = '<html><head><title>HACKED</title></head><body><h1>Hacked by Evil Crew</h1><p>greetz to all</p></body></html>';
const cfg = { checks: { dns: false, tls: false, rdap: false } };

async function scenario(language) {
  sent.length = 0;
  await db.saveAccountSettings(1, { language, telegram: { token: '123:ABC', chatId: '42', enabled: true, minSeverity: 'warning', sendRecovery: true, includeDiff: true, buttons: false } });
  html = page();
  const w = await db.createWatch({ name: `Boutique ${language}`, url: siteUrl, interval: 5, config: cfg });
  await runCheck(w.id); // référence
  html = defaced;
  const r = await runCheck(w.id);
  return { r, text: sent.at(-1)?.text ?? '' };
}

test('compte en français : alertes et message Telegram en français (comportement historique)', async () => {
  const { r, text } = await scenario('fr');
  assert.ok(r.alerts.some((a) => a.title === 'Le titre de la page a changé'), r.alerts.map((a) => a.title).join(' | '));
  assert.match(text, /<b>CRITIQUE<\/b>/);
});

test('compte en anglais : alertes et message Telegram en anglais', async () => {
  const { r, text } = await scenario('en');
  assert.ok(r.alerts.some((a) => a.title === 'The page title has changed'), r.alerts.map((a) => a.title).join(' | '));
  assert.match(text, /<b>CRITICAL<\/b>/);
  assert.match(text, /The page title has changed/);
  assert.doesNotMatch(text, /titre de la page|CRITIQUE/);
});
