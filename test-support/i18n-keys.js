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
