// Point d'extension unique du cœur pour une fonction métier ajoutée par la version hébergée (aujourd'hui : le connecteur WordPress / PrestaShop).
//
// Le cœur ne sait pas ce que fait l'extension : il l'appelle à des endroits précis, TOUJOURS de façon facultative (chaque crochet peut manquer).
// Un module SANS import, lisible de partout (db.js, contrôles, rapports) sans cycle.
//
// Crochets (tous facultatifs) :
//   normalizeConfig(raw)                    config.cms d'un site (lecture ET écriture) : normalise ; sans extension, le cœur garde l'objet tel quel (borné)
//   configureWatch(cfg, { ctx, existing })  valide / complète la configuration d'un site enregistré (jetons…) ; lève une HttpError pour refuser
//   ownsIncident(key)                       vrai pour les incidents de l'extension (catégorie « ext » ; acquittables ; ré-alerte si plus graves)
//   incidents({ cfg, state, settings, now, domainOnly })
//                                           → { active, keep(key), evaluated, list:[{ key, severity, title, detail, count }] }
//                                           active : l'extension s'applique à ce site (sinon ses incidents disparaissent sans message « rétabli »)
//                                           keep(key) : faux = ce groupe d'incidents est coupé pour ce site ; evaluated : l'état est assez récent pour juger
//   listFields(w)                           champs ajoutés à chaque site de la liste (GET /api/watches)
//   detailFields(w)                         champs ajoutés à la fiche d'un site (GET /api/watches/:id)
//   watchSaved({ w, prev, created })        après création / modification d'un site (ex. planifier un premier relevé)
//   reportData(w, range, now)               données ajoutées au rapport mensuel d'un site (sous `cms`) ; null = rien
//   reportCard(data, range, tz)             HTML de la section du rapport (une chaîne) ; reportSummary(data) : { pending, security } cellules du tableau de synthèse
//   routes                                  [(api) => void] : routes supplémentaires (comme l'option `routes` de createApp)
//   publicHandlers                          [{ pattern: RegExp, handle(req, res, match) }] : adresses publiques HORS /api (ex. /widget/<jeton>.json), GET seulement
//   start(app) / stop(app)                  tâches de fond (relevés périodiques) : appelés par startBackground() / stop()
//   ui                                      { script } : module d'interface chargé par l'application (voir public/app.js, SuricateExt)
let current = null;

export const getExtension = () => current;

/** Installe l'extension (un seul jeu par processus, comme les autres points d'extension) ; null la retire. */
export function setExtension(ext) {
  if (ext != null && (typeof ext !== 'object' || Array.isArray(ext))) throw new Error('extension doit être un objet de crochets');
  current = ext ?? null;
}

/** Appelle un crochet s'il existe, sinon renvoie `fallback`. */
export const hook = (name, fallback, ...args) => (typeof current?.[name] === 'function' ? current[name](...args) : fallback);
