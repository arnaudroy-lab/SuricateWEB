// Liste les textes à traduire pour une langue : node scripts/i18n-missing.js en
// Affiche un squelette JSON { "texte français": "" } à compléter dans public/locales/<langue>.json.
import { readFileSync, existsSync } from 'node:fs';
import { sourceKeys } from '../test-support/i18n-keys.js';

const lang = process.argv[2];
if (!lang) { console.error('Usage : node scripts/i18n-missing.js <langue> (ex. en)'); process.exit(1); }
const root = new URL('../public/', import.meta.url);
const keys = new Set();
for (const f of ['app.js', 'layout.js']) for (const k of sourceKeys(readFileSync(new URL(f, root), 'utf8'))) keys.add(k);
const file = new URL(`locales/${lang}.json`, root);
const have = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
const todo = Object.fromEntries([...keys].filter((k) => !have[k]).map((k) => [k, '']));
console.error(`${keys.size} textes dans l'interface, ${Object.keys(todo).length} sans traduction en « ${lang} ».`);
console.log(JSON.stringify(todo, null, 2));
