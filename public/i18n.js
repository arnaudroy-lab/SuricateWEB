// SuricateWeb — traduction de l'interface. Le français est la langue de référence ET la clé : tr('Texte français') rend le texte
// tel quel en français, et sa traduction (public/locales/<langue>.json) dans une autre langue. Une clé absente du dictionnaire
// s'affiche donc en français, jamais vide. Les paramètres s'écrivent {nom} : tr('Depuis {when}', { when }).
//
// La langue est choisie AVANT le démarrage de l'application (await en tête de module) : les constantes évaluées à l'import
// (libellés, tableaux) sont ainsi déjà traduites. Changer de langue recharge la page. Importé aussi par les tests Node
// (layout.js) : aucune API du navigateur n'est touchée sans garde.

/** Langues proposées : code → nom écrit DANS cette langue (on ne le traduit pas). Pour en ajouter une : ici + public/locales/<code>.json. */
export const LANGS = { fr: 'Français', en: 'English' };
const LOCALES = { fr: 'fr-FR', en: 'en-GB' };
const KEY = 'suricate-lang';

const has = (code) => typeof code === 'string' && Object.hasOwn(LANGS, code);

function pick() {
  try {
    const asked = new URLSearchParams(globalThis.location?.search ?? '').get('lang'); // ?lang=en : lien partageable, et retenu
    if (has(asked)) { localStorage.setItem(KEY, asked); return asked; }
    const saved = globalThis.localStorage?.getItem(KEY);
    if (has(saved)) return saved;
  } catch { /* stockage indisponible : français */ }
  return 'fr'; // langue par défaut : le français, quelle que soit celle du navigateur
}

export const lang = pick();
export const locale = LOCALES[lang];

let dict = {};
if (lang !== 'fr' && typeof fetch === 'function' && globalThis.location) {
  try {
    const r = await fetch(`/locales/${lang}.json`);
    if (r.ok) dict = await r.json();
  } catch { /* dictionnaire indisponible : l'interface reste lisible, en français */ }
}
if (globalThis.document) document.documentElement.lang = lang;

/** Traduit un texte français ; `params` remplace les {nom}. */
export function tr(text, params) {
  const out = lang === 'fr' ? text : (dict[text] ?? text);
  return params ? out.replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(params, k) ? String(params[k]) : m)) : out;
}

const rules = new Intl.PluralRules(locale);
/** Vrai si `n` prend la forme du singulier dans la langue (en français 0 et 1, en anglais 1 seulement). */
export const isOne = (n) => rules.select(n) === 'one';
/** « 1 site » / « 3 sites » : `one` et `other` sont déjà traduits (plural(n, tr('site'), tr('sites'))) ; la règle de pluriel est celle de la langue. */
export const plural = (n, one, other) => `${n} ${rules.select(n) === 'one' ? one : other}`;

/** Change la langue (retenue dans ce navigateur) et recharge. */
export function setLang(code) {
  if (!has(code)) return;
  try { localStorage.setItem(KEY, code); } catch { /* sans stockage, ?lang= reste possible */ }
  // Une adresse identique à une ancre près ne recharge pas : on recharge explicitement (et on retire ?lang= s'il y est).
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) { url.searchParams.delete('lang'); location.replace(url); } else location.reload();
}
