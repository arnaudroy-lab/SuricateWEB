import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { serverKeys, paramsOf } from '../test-support/i18n-keys.js';
import { startServer } from '../test-support/server.js';
import { runWithLang, tr, plural, currentLang, LOCALES } from '../src/i18n.js';
import { buildMessage } from '../src/telegram.js';
import { CODE_LABELS } from '../src/cms-alerts.js';

const others = Object.keys(LOCALES).filter((c) => c !== 'fr');
const dictOf = (code) => JSON.parse(readFileSync(new URL(`../src/locales/${code}.json`, import.meta.url), 'utf8'));

test('textes du serveur : chaque langue a son dictionnaire, complet, sans reste, aux mêmes {paramètres}', () => {
  assert.deepEqual(readdirSync(new URL('../src/locales/', import.meta.url)).map((f) => f.replace('.json', '')).sort(), [...others].sort());
  const keys = serverKeys();
  for (const code of others) {
    const dict = dictOf(code);
    assert.deepEqual([...keys].filter((k) => typeof dict[k] !== 'string' || !dict[k].trim()), [], `${code} : textes sans traduction (node scripts/i18n-missing.js ${code} serveur)`);
    assert.deepEqual(Object.keys(dict).filter((k) => !keys.has(k)), [], `${code} : traductions orphelines`);
    assert.deepEqual(Object.entries(dict).filter(([k, v]) => paramsOf(k) !== paramsOf(v)).map(([k]) => k), [], `${code} : {paramètres} différents du français`);
  }
});

test('tr() côté serveur : français hors contexte, langue du contexte dedans, jamais de fuite entre deux contextes', async () => {
  assert.equal(currentLang(), 'fr');
  assert.equal(tr('Site inaccessible'), 'Site inaccessible');
  assert.equal(runWithLang('en', () => tr('Site inaccessible')), 'Site unreachable');
  assert.equal(runWithLang('xx', () => tr('Site inaccessible')), 'Site inaccessible', 'langue inconnue : français');
  // Deux contextes qui s'entrecroisent (comme deux comptes dont les contrôles se chevauchent) gardent chacun leur langue.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const [a, b] = await Promise.all([
    runWithLang('en', async () => { await wait(20); return tr('Page inaccessible'); }),
    runWithLang('fr', async () => { await wait(5); return tr('Page inaccessible'); }),
  ]);
  assert.deepEqual([a, b], ['Page unreachable', 'Page inaccessible']);
  assert.equal(runWithLang('fr', () => plural(0, 'site', 'sites')), '0 site');
  assert.equal(runWithLang('en', () => plural(0, 'site', 'sites')), '0 sites');
});

test('message Telegram : français par défaut, anglais pour un compte en anglais', () => {
  const watch = { id: 3, name: 'Boutique', url: 'https://exemple.fr/' };
  const alerts = [{ id: 9, severity: 'critical', title: 'Site inaccessible', detail: 'x' }];
  const settings = { baseUrl: 'https://suricate.example.org', telegram: { includeDiff: true } };
  assert.match(buildMessage(watch, alerts, settings), /<b>CRITIQUE<\/b>.*\n[\s\S]*Ouvrir dans SuricateWeb/);
  const en = runWithLang('en', () => buildMessage(watch, alerts, settings));
  assert.match(en, /<b>CRITICAL<\/b>/);
  assert.match(en, /Open in SuricateWeb/);
});

test('libellés des motifs de code suspect : traduits à la lecture', () => {
  assert.equal(CODE_LABELS.eval_decode, 'code décodé puis exécuté (eval + base64, gzinflate…)');
  assert.equal(runWithLang('en', () => CODE_LABELS.eval_decode), 'code decoded then executed (eval + base64, gzinflate…)');
});

const srv = await startServer({ env: { SURICATE_DEMO: '1' } });
test.after(() => srv.stop());

test('réglage « langue » : enregistré, relu, valeur inconnue ignorée ; rapport et page de statut dans la langue', async () => {
  assert.equal((await srv.get('/api/settings')).json.language, 'fr');
  assert.equal((await srv.put('/api/settings', { language: 'en' })).json.language, 'en');
  assert.equal((await srv.put('/api/settings', { language: 'klingon' })).json.language, 'en', 'inconnue : inchangée');

  const id = (await srv.post('/api/watches', { url: 'http://127.0.0.1:9/', name: 'Boutique', interval: 15, config: { statusPage: { enabled: true } } })).json.id;
  const account = (await srv.get(`/api/watches/${id}/report`)).text;
  assert.match(account, /<html lang="en">/, 'compte en anglais : rapport en anglais');
  assert.match(account, /Uptime/);
  const fr = (await srv.get(`/api/watches/${id}/report?lang=fr`)).text;
  assert.match(fr, /<html lang="fr">/, '?lang=fr impose le français au rapport');
  assert.match(fr, /Disponibilité/);
  assert.match(fr, /lang=fr/, 'les liens mois précédent / suivant gardent la langue');

  await srv.put('/api/settings', { language: 'fr' });
  assert.match((await srv.get(`/api/watches/${id}/report`)).text, /<html lang="fr">/);
});
