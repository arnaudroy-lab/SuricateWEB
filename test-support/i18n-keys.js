// Clés de traduction d'un fichier source : les textes français passés à tr('…') (la langue de référence EST la clé).
// Extraction par expression régulière (le cœur n'a aucune dépendance) : tr() doit recevoir un littéral entre apostrophes ou guillemets.
const RE = /\btr\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const unescape = (s) => s.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');

export function sourceKeys(text) {
  const keys = new Set();
  for (const m of text.matchAll(RE)) keys.add(unescape(m[1] ?? m[2]));
  return keys;
}

/** Paramètres {nom} d'un texte, triés : une traduction doit avoir exactement les mêmes. */
export const paramsOf = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

import { readFileSync, readdirSync } from 'node:fs';

const listJs = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listJs(new URL(`${e.name}/`, dir)) : e.name.endsWith('.js') ? [new URL(e.name, dir)] : []));

/** Textes de l'interface (public/app.js et layout.js). */
export function clientKeys() {
  const keys = new Set();
  for (const f of ['app.js', 'layout.js']) for (const k of sourceKeys(readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8'))) keys.add(k);
  return keys;
}

/** Textes du serveur : tout tr('…') sous src/ (sauf le module de traduction lui-même). */
export function serverKeys(dir = new URL('../src/', import.meta.url)) {
  const keys = new Set();
  for (const f of listJs(dir)) {
    if (f.pathname.endsWith('/i18n.js')) continue;
    for (const k of sourceKeys(readFileSync(f, 'utf8'))) keys.add(k);
  }
  return keys;
}
