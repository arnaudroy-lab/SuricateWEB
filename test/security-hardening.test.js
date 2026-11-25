// Durcissement : expressions régulières bornées (ReDoS), adresse du client derrière un proxy, flux temps réel et accès retiré.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'suricate-sec-'));
process.env.CHROME_PATH = '/nonexistent/chrome';

const { clientIpOf, proxyHops, HttpError } = await import('../src/http.js');
const { compileSafeRegex, REGEX_MAX_LENGTH, REGEX_MAX_COUNT } = await import('../src/safe-regex.js');
const { analyze } = await import('../src/checker.js');
const { validateConfig } = await import('../src/routes/shared.js');
const { createApp } = await import('../src/app.js');

// ───────────── ReDoS ─────────────

test('regex : un motif catastrophique est interrompu au lieu de bloquer le processus', () => {
  const evil = compileSafeRegex('^(a+)+$');
  const t0 = Date.now();
  assert.equal(evil('a'.repeat(40) + '!'), false);
  assert.ok(Date.now() - t0 < 1000, `interrompu rapidement (${Date.now() - t0} ms)`);
  // Désactivé après le premier dépassement : les lignes suivantes ne coûtent plus rien.
  const t1 = Date.now();
  for (let i = 0; i < 50; i++) evil('a'.repeat(40) + '!');
  assert.ok(Date.now() - t1 < 100);
});

test('regex : les motifs normaux se comportent comme avant (insensible à la casse)', () => {
  const t = compileSafeRegex('^copyright \\d{4}');
  assert.equal(t('Copyright 2026 Société'), true);
  assert.equal(t('rien'), false);
  assert.equal(compileSafeRegex('('), null, 'invalide');
  assert.equal(compileSafeRegex('a'.repeat(REGEX_MAX_LENGTH + 1)), null, 'trop long');
});

test('analyze : une expression catastrophique ne gèle pas l’analyse, les autres lignes sont gardées', () => {
  const page = { contentType: 'text/plain', finalUrl: 'https://x.test/', buf: Buffer.from(''), body: `${'a'.repeat(40)}!\nbonjour\nvisiteurs : 12` };
  const t0 = Date.now();
  const r = analyze(page, { ignoreRegex: ['^(a+)+$', '^visiteurs'] });
  assert.ok(Date.now() - t0 < 1500);
  assert.deepEqual(r.lines, [`${'a'.repeat(40)}!`, 'bonjour'], 'le motif sain filtre, le motif lent est désactivé');
});

test('validation : trop de motifs ou motif trop long refusés à l’enregistrement', () => {
  const cfg = (ignoreRegex) => ({ cms: {}, pages: [], ignoreRegex });
  assert.throws(() => validateConfig(cfg(Array(REGEX_MAX_COUNT + 1).fill('x')), 'https://x.test/'), (e) => e instanceof HttpError && e.status === 400);
  assert.throws(() => validateConfig(cfg(['a'.repeat(REGEX_MAX_LENGTH + 1)]), 'https://x.test/'), (e) => e.status === 400);
  assert.doesNotThrow(() => validateConfig(cfg(['^ok$']), 'https://x.test/'));
});

// ───────────── Adresse du client ─────────────

const req = (xff, remote = '10.0.0.2') => ({ headers: xff === undefined ? {} : { 'x-forwarded-for': xff }, socket: { remoteAddress: remote } });

test('clientIpOf : la valeur écrite par le client (début de la chaîne) n’est jamais retenue', () => {
  assert.equal(clientIpOf(req('1.2.3.4, 203.0.113.9'), 1), '203.0.113.9');
  assert.equal(clientIpOf(req('9.9.9.9, 1.2.3.4, 198.51.100.7, 203.0.113.9'), 2), '198.51.100.7', 'deux proxys : l’avant-dernière entrée');
  assert.equal(clientIpOf(req('1.2.3.4'), true), '1.2.3.4');
});

test('clientIpOf : sans proxy de confiance, ou chaîne trop courte, on garde l’adresse de la connexion', () => {
  assert.equal(clientIpOf(req('1.2.3.4'), 0), '10.0.0.2');
  assert.equal(clientIpOf(req('1.2.3.4'), false), '10.0.0.2');
  assert.equal(clientIpOf(req(undefined), 1), '10.0.0.2');
  assert.equal(clientIpOf(req('1.2.3.4'), 2), '10.0.0.2', 'moins d’entrées que de proxys : en-tête incohérent, ignoré');
});

test('TRUST_PROXY : 1/true/yes = un proxy, un nombre = autant, le reste = aucun', () => {
  assert.deepEqual(['1', 'true', 'YES', '2', '0', '', undefined, 'non', '99999'].map(proxyHops), [1, 1, 1, 2, 0, 0, 0, 0, 0]);
});

// ───────────── Flux temps réel ─────────────

test('SSE : l’accès retiré ferme le flux au battement suivant', async () => {
  let allowed = true;
  const auth = {
    kind: 'test',
    authenticate: () => (allowed ? { user: { id: 7, name: 'alice' }, account: { id: 70, name: 'A' } } : null),
    register({ route }) { route('GET', '/api/auth', () => ({ required: true, authenticated: false }), { public: true }); },
  };
  const app = createApp({ auth, env: { ...process.env, SURICATE_SSE_PING_MS: '50' } });
  const port = await app.listen(0, '127.0.0.1');
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/events`);
    assert.equal(res.status, 200);
    const reader = res.body.getReader();
    await reader.read(); // « retry: 3000 »
    allowed = false;
    const ended = await Promise.race([
      (async () => { for (;;) { const { done } = await reader.read(); if (done) return 'fermé'; } })(),
      new Promise((r) => setTimeout(() => r('toujours ouvert'), 3000)),
    ]);
    assert.equal(ended, 'fermé');
  } finally {
    await app.stop();
  }
});

test('SSE : tant que l’accès est valide, le flux reste ouvert et bat', async () => {
  const auth = {
    kind: 'test',
    authenticate: () => ({ user: { id: 7, name: 'alice' }, account: { id: 70, name: 'A' } }),
    register({ route }) { route('GET', '/api/auth', () => ({ required: true, authenticated: false }), { public: true }); },
  };
  const app = createApp({ auth, env: { ...process.env, SURICATE_SSE_PING_MS: '50' } });
  const port = await app.listen(0, '127.0.0.1');
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/events`);
    const reader = res.body.getReader();
    let text = '';
    const dec = new TextDecoder();
    const deadline = Date.now() + 3000;
    while (!text.includes(': ping') && Date.now() < deadline) text += dec.decode((await reader.read()).value ?? new Uint8Array());
    assert.match(text, /: ping/);
    await reader.cancel();
  } finally {
    await app.stop();
  }
});
