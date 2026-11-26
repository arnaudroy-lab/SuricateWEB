import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { sourceKeys, paramsOf } from '../test-support/i18n-keys.js';

const pub = new URL('../public/', import.meta.url);
const read = (f) => readFileSync(new URL(f, pub), 'utf8');
const keys = new Set([...sourceKeys(read('app.js')), ...sourceKeys(read('layout.js')), ...sourceKeys(read('ext-cms.js'))]);
const { LANGS } = await import('../public/i18n.js');
const others = Object.keys(LANGS).filter((c) => c !== 'fr');

test('chaque langue proposée a son dictionnaire, complet et sans reste', () => {
  assert.ok(others.length >= 1, 'au moins une langue en plus du français');
  assert.deepEqual(readdirSync(new URL('locales/', pub)).map((f) => f.replace('.json', '')).sort(), [...others].sort(), 'un fichier par langue de LANGS, pas un de plus');
  for (const code of others) {
    const dict = JSON.parse(read(`locales/${code}.json`));
    const missing = [...keys].filter((k) => typeof dict[k] !== 'string' || dict[k].trim() === '');
    assert.deepEqual(missing, [], `${code} : textes sans traduction (node scripts/i18n-missing.js ${code})`);
    const orphans = Object.keys(dict).filter((k) => !keys.has(k));
    assert.deepEqual(orphans, [], `${code} : traductions de textes qui n'existent plus dans l'interface`);
  }
});

test('une traduction garde exactement les paramètres {nom} du texte français', () => {
  for (const code of others) {
    const dict = JSON.parse(read(`locales/${code}.json`));
    const bad = Object.entries(dict).filter(([k, v]) => paramsOf(k) !== paramsOf(v)).map(([k]) => k);
    assert.deepEqual(bad, [], `${code} : paramètres différents du français`);
  }
});

test('tr() : français par défaut (texte tel quel, paramètres remplacés), anglais sur demande', async () => {
  const fr = await import('../public/i18n.js');
  assert.equal(fr.lang, 'fr');
  assert.equal(fr.tr('Réglages'), 'Réglages');
  assert.equal(fr.tr('Depuis {when}', { when: 'hier' }), 'Depuis hier');
  assert.equal(fr.tr('Inconnu {x}', {}), 'Inconnu {x}', 'un paramètre absent reste visible');
  assert.equal(fr.plural(0, 'site', 'sites'), '0 site', 'en français, 0 est au singulier');
  assert.equal(fr.plural(2, 'site', 'sites'), '2 sites');

  // Comme le navigateur : ?lang=en, dictionnaire servi par /locales/en.json
  const saved = { location: globalThis.location, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  const store = new Map();
  globalThis.location = { search: '?lang=en' };
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  globalThis.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(read(String(url).replace('/locales/', 'locales/'))) });
  try {
    const en = await import('../public/i18n.js?en');
    assert.equal(en.lang, 'en');
    assert.equal(store.get('suricate-lang'), 'en', 'la langue demandée est retenue');
    assert.equal(en.tr('Réglages'), 'Settings');
    assert.equal(en.tr('Depuis {rel}', { rel: '3 min' }), 'Since 3 min');
    assert.equal(en.tr('Texte jamais traduit'), 'Texte jamais traduit', 'sans traduction : le français, jamais vide');
    assert.equal(en.plural(0, 'site', 'sites'), '0 sites', 'en anglais, 0 est au pluriel');
    assert.equal(en.plural(1, 'site', 'sites'), '1 site');
    assert.equal(en.locale, 'en-GB');
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
  }
});

test('l\'interface n\'a plus de texte français hors tr() dans les constructions courantes', () => {
  // Filet contre l'oubli : un h('…', {}, 'Texte') littéral accentué ou à plusieurs mots doit passer par tr().
  const src = read('app.js');
  const stray = [...src.matchAll(/\bh\('[a-z0-9]+', (?:\{[^{}]*\}|null), '([^'\\]*[À-ÿ][^'\\]*|[A-ZÀ-Ý][a-zà-ÿ]+(?: [a-zà-ÿ]+)+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(stray, [], 'textes à envelopper dans tr()');
});
