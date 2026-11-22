// Liste les textes à traduire pour une langue : node scripts/i18n-missing.js en [interface|serveur]
// Affiche un squelette JSON { "texte français": "" } à compléter dans public/locales/<langue>.json (interface, par défaut)
// ou src/locales/<langue>.json (serveur : alertes, messages Telegram, rapports, e-mails).
import { readFileSync, existsSync } from 'node:fs';
import { clientKeys, serverKeys } from '../test-support/i18n-keys.js';

const lang = process.argv[2];
const side = process.argv[3] === 'serveur' ? 'serveur' : 'interface';
if (!lang) { console.error('Usage : node scripts/i18n-missing.js <langue> [interface|serveur] (ex. en)'); process.exit(1); }
const keys = side === 'serveur' ? serverKeys() : clientKeys();
const file = new URL(side === 'serveur' ? `../src/locales/${lang}.json` : `../public/locales/${lang}.json`, import.meta.url);
const have = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
const todo = Object.fromEntries([...keys].filter((k) => !have[k]).map((k) => [k, '']));
console.error(`${keys.size} textes (${side}), ${Object.keys(todo).length} sans traduction en « ${lang} ».`);
console.log(JSON.stringify(todo, null, 2));
