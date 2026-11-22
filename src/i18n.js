// SuricateWeb — traduction des textes produits par le serveur (alertes, messages Telegram, rapports, e-mails…).
//
// Même principe que l'interface (public/i18n.js) : le français est la langue de référence ET la clé, tr('Texte français', { param })
// rend le texte tel quel en français et sa traduction (src/locales/<langue>.json) ailleurs ; sans traduction, le français s'affiche.
//
// La langue n'est pas passée de fonction en fonction : elle suit le contexte asynchrone (runWithLang). Chaque point d'entrée qui produit
// un texte pour un compte (contrôle d'un site, envoi Telegram, rapport, e-mail) s'exécute dans `runWithLang(langue du compte, …)`. Hors
// de ce contexte, la langue est le français : c'est le comportement historique, et celui des tests.
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';

/** Langues connues : code → locale Intl (dates, nombres). Pour en ajouter une : ici, public/i18n.js, et un dictionnaire par côté. */
export const LOCALES = { fr: 'fr-FR', en: 'en-GB' };
export const DEFAULT_LANG = 'fr';
export const isLang = (code) => typeof code === 'string' && Object.hasOwn(LOCALES, code);

const store = new AsyncLocalStorage();
const dicts = new Map(); // langue → { texte français: traduction }

const load = (lang) => {
  if (!dicts.has(lang)) {
    let d = {};
    try { d = JSON.parse(readFileSync(new URL(`./locales/${lang}.json`, import.meta.url), 'utf8')); } catch { /* dictionnaire absent : français */ }
    dicts.set(lang, d);
  }
  return dicts.get(lang);
};

/** Ajoute des traductions (couche hébergée : ses propres textes, dans ses propres fichiers). Les clés déjà connues sont conservées. */
export function addTranslations(lang, entries) {
  if (!isLang(lang) || lang === DEFAULT_LANG) return;
  const d = load(lang);
  for (const [k, v] of Object.entries(entries)) if (typeof v === 'string' && !Object.hasOwn(d, k)) d[k] = v;
}

/** Exécute `fn` avec cette langue (français si elle est inconnue). La valeur de `fn` est rendue telle quelle, promesse comprise. */
export const runWithLang = (lang, fn) => store.run(isLang(lang) ? lang : DEFAULT_LANG, fn);
export const currentLang = () => store.getStore() ?? DEFAULT_LANG;
export const currentLocale = () => LOCALES[currentLang()];

/** Traduit un texte français dans la langue du contexte ; `params` remplace les {nom}. */
export function tr(text, params) {
  const lang = currentLang();
  const out = lang === DEFAULT_LANG ? text : (load(lang)[text] ?? text);
  return params ? out.replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(params, k) ? String(params[k]) : m)) : out;
}

/** « 1 site » / « 3 sites » : `one` et `other` sont déjà traduits (plural(n, tr('site'), tr('sites'))). */
export const plural = (n, one, other) => `${n} ${new Intl.PluralRules(currentLocale()).select(n) === 'one' ? one : other}`;
export const isOne = (n) => new Intl.PluralRules(currentLocale()).select(n) === 'one';

/** Séparateur décimal de la langue du contexte. */
export const decimalSep = () => (currentLang() === 'fr' ? ',' : '.');

/** Dates dans la langue du contexte. */
export const fmtDate = (ts, opts) => new Date(ts).toLocaleDateString(currentLocale(), opts);
export const fmtDateTime = (ts, opts) => new Date(ts).toLocaleString(currentLocale(), opts);
