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
  known = null; // l'index des textes connus est à refaire
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

// ───────────── Textes déjà enregistrés ─────────────
// Les alertes (titre, détail) et les incidents sont enregistrés dans la langue du compte AU MOMENT de la détection. Pour qu'un utilisateur qui change
// de langue les lise dans la sienne, on les retraduit à l'affichage : le texte est rapproché d'un texte connu (français ou autre langue, tel quel ou
// gabarit à {paramètres}), ramené à sa clé française, puis traduit. Un texte inconnu (extrait de page, liste de fichiers…) reste tel quel.
let known = null;
const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildKnown() {
  const exact = new Map(); // texte, dans n'importe quelle langue → clé française
  const templates = [];
  const add = (text, key) => {
    if (!/\{\w+\}/.test(text)) { if (!exact.has(text)) exact.set(text, key); return; }
    // Deux motifs : « strict » (un paramètre tient sur UNE ligne : les listes à puces ne se laissent pas avaler par un seul paramètre) et
    // « large » (un paramètre peut couvrir plusieurs lignes), essayé en dernier recours.
    const names = []; let re = ''; let strict = ''; let last = 0;
    for (const m of text.matchAll(/\{(\w+)\}/g)) { const lit = escRe(text.slice(last, m.index)); re += `${lit}([\\s\\S]+?)`; strict += `${lit}([^\\n]+?)`; names.push(m[1]); last = m.index + m[0].length; }
    const tail = escRe(text.slice(last));
    templates.push({ re: new RegExp(`^${re}${tail}$`), strict: new RegExp(`^${strict}${tail}$`), names, key, weight: text.replace(/\{\w+\}/g, '').length });
  };
  for (const code of Object.keys(LOCALES)) {
    if (code === DEFAULT_LANG) continue;
    for (const [key, value] of Object.entries(load(code))) { add(key, key); add(value, key); }
  }
  templates.sort((a, b) => b.weight - a.weight); // le plus précis d'abord
  return { exact, templates };
}

/** Retraduit un texte enregistré dans la langue du contexte (voir ci-dessus). Sans correspondance : le texte, inchangé. */
export function retranslate(text) {
  if (typeof text !== 'string' || text.length < 3) return text;
  known ??= buildKnown();
  if (known.exact.has(text)) return tr(known.exact.get(text));
  const fill = (t, m) => tr(t.key, Object.fromEntries(t.names.map((n, i) => [n, retranslate(m[i + 1])])));
  for (const t of known.templates) {
    const m = t.strict.exec(text);
    if (m) return fill(t, m);
  }
  // Texte de plusieurs lignes (liste à puces de mises à jour, de fichiers…) : chaque ligne est un gabarit à part.
  if (text.includes('\n')) {
    const lines = text.split('\n');
    const out = lines.map((l) => retranslate(l));
    if (out.some((l, i) => l !== lines[i])) return out.join('\n');
  }
  for (const t of known.templates) {
    const m = t.re.exec(text);
    if (m) return fill(t, m);
  }
  // « thème, inactif » : une liste courte de mots connus, séparés par des virgules.
  if (text.includes(', ') && !text.includes('\n')) {
    const parts = text.split(', ');
    const out = parts.map((x) => retranslate(x));
    if (out.some((x, i) => x !== parts[i])) return out.join(', ');
  }
  // « 12 jours », « 2 mises à jour en attente » : un nombre suivi d'un nom connu (paramètres produits par plural()).
  const counted = /^(\d+) ([^\n]+)$/.exec(text);
  if (counted) {
    const noun = retranslate(counted[2]);
    if (noun !== counted[2]) return `${counted[1]} ${noun}`;
  }
  return text;
}

/** « 1 site » / « 3 sites » : `one` et `other` sont déjà traduits (plural(n, tr('site'), tr('sites'))). */
export const plural = (n, one, other) => `${n} ${new Intl.PluralRules(currentLocale()).select(n) === 'one' ? one : other}`;
export const isOne = (n) => new Intl.PluralRules(currentLocale()).select(n) === 'one';

/** Séparateur décimal de la langue du contexte. */
export const decimalSep = () => (currentLang() === 'fr' ? ',' : '.');

/** Dates dans la langue du contexte. */
export const fmtDate = (ts, opts) => new Date(ts).toLocaleDateString(currentLocale(), opts);
export const fmtDateTime = (ts, opts) => new Date(ts).toLocaleString(currentLocale(), opts);
