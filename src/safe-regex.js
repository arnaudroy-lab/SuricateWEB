// Expressions régulières saisies par les utilisateurs (« lignes à ignorer ») : exécutées avec un délai.
//
// Pourquoi. Le moteur d'expressions régulières de Node est synchrone et sans délai : un motif comme ^(a+)+$ sur 33 caractères bloque le
// processus pendant plus d'une minute. Le serveur est unique et partagé (version hébergée) : un seul motif malveillant gèlerait les
// contrôles, les alertes et l'API de TOUS les comptes. Le délai de `vm` interrompt le moteur d'expressions régulières lui-même.
import vm from 'node:vm';

/** Durée maximale d'un test sur une ligne (ms). Un motif normal en demande une fraction de milliseconde. */
export const REGEX_TIMEOUT_MS = 20;
/** Longueur maximale d'un motif et nombre maximal de motifs par site : au-delà, c'est un abus, pas un besoin. */
export const REGEX_MAX_LENGTH = 200;
export const REGEX_MAX_COUNT = 20;

const context = vm.createContext({ re: null, line: '' }, { codeGeneration: { strings: false, wasm: false } });
const script = new vm.Script('re.test(line)');

/**
 * Compile `source` (insensible à la casse) en un testeur `(ligne) → booléen`, ou null si le motif est invalide ou trop long.
 * Dès qu'un test dépasse le délai, le testeur se désactive (renvoie toujours false) : la suite de l'analyse reste rapide.
 */
export function compileSafeRegex(source) {
  if (typeof source !== 'string' || source.length > REGEX_MAX_LENGTH) return null;
  let re;
  try {
    re = new RegExp(source, 'i');
  } catch {
    return null;
  }
  let disabled = false;
  const test = (line) => {
    if (disabled) return false;
    context.re = re;
    context.line = String(line);
    try {
      return script.runInContext(context, { timeout: REGEX_TIMEOUT_MS }) === true;
    } catch {
      disabled = true; // délai dépassé : motif catastrophique
      return false;
    }
  };
  test.source = source;
  return test;
}
