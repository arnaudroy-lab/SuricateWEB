// Téléphone : pas de flou « verre » (backdrop-filter). Android abandonne des couches quand une page haute dépasse la taille maximale d'une texture :
// la barre du bas, le bandeau et le sélecteur de langue disparaissaient sur la page des alertes. Garde-fou sur la feuille de style.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

/** Corps de chaque bloc `@media (max-width: 860px) { … }` (accolades équilibrées). */
function mobileBlocks(text) {
  const out = [];
  const re = /@media \(max-width: 860px\)\s*\{/g;
  for (let m; (m = re.exec(text));) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < text.length && depth) { if (text[i] === '{') depth++; else if (text[i] === '}') depth--; i++; }
    out.push(text.slice(re.lastIndex, i - 1));
  }
  return out;
}

test('mobile : le flou est coupé sur les cartes, le bandeau, la barre du bas et le sélecteur de langue — en dernier, pour l\'emporter', () => {
  const blocks = mobileBlocks(css);
  const last = blocks.findLast((b) => /backdrop-filter:\s*none/.test(b) && /\.card/.test(b));
  assert.ok(last, 'bloc mobile qui coupe backdrop-filter');
  for (const sel of ['.card', '.sidebar::before', '.brand', '.side-foot .lang-select', '.btn', '.overlay']) assert.ok(last.includes(sel), `${sel} dans la liste`);
  // Aucune règle mobile postérieure ne rétablit un flou.
  const after = css.slice(css.indexOf(last) + last.length);
  assert.ok(!/@media \(max-width: 860px\)[^{]*\{[^}]*backdrop-filter:\s*(?!none)/.test(after.replace(/\/\*[\s\S]*?\*\//g, '')), 'aucun flou rétabli après');
  // Les éléments fixes ont un fond plein : rien ne doit se lire derrière eux.
  assert.match(last, /\.brand,\s*\.side-foot \.lang-select\s*\{\s*background:\s*var\(--surface\)/);
});

test('alertes : la carte rogne ses lignes aux coins arrondis, sans zone de défilement', () => {
  assert.match(css, /\.card\.alerts\s*\{[^}]*overflow:\s*clip/);
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /class: 'card alerts'/);
});
