// Briques HTTP communes à l'application et à ses extensions : erreurs, réponses JSON / HTML, lecture du corps.
// Les extensions (version hébergée) importent d'ici : `throw new HttpError(402, '…')` se traduit en réponse HTTP.

/** Erreur dont le message est destiné à l'utilisateur : l'API la renvoie telle quelle avec ce statut. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Valeur que renvoie un gestionnaire qui a déjà écrit lui-même la réponse (image, flux, HTML…). */
export const HANDLED = Symbol.for('handled');

export const send = (res, status, data, headers = {}) => {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(body);
};

/** Taille maximale du corps d'une requête (JSON ou brut) : 2 Mo. */
export const MAX_BODY = 2e6;

/** Octets bruts du corps de la requête, tels que reçus (Buffer vide s'il n'y en a pas). Lève 413 au-delà de `limit` octets. */
export async function readRaw(req, limit = MAX_BODY) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > limit) throw new HttpError(413, 'Requête trop volumineuse');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

/** Corps JSON de la requête, limité à 2 Mo ({} s'il n'y en a pas). */
export async function readJson(req) {
  const raw = await readRaw(req);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON invalide');
  }
}

/** Pages publiques et rapports : aucun script en ligne, aucune ressource extérieure. */
// Rapport et page de statut reprennent la charte de l'application : sa feuille de style, ses polices auto-hébergées et son logo, tous du
// même site (jamais une ressource externe). Rien d'autre n'est autorisé : pas de connexion réseau, pas de cadre, pas de formulaire.
export const REPORT_CSP = "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export function sendHtml(res, html, extra = {}) {
  const buf = Buffer.from(html, 'utf8');
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8', 'content-length': buf.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow', 'content-security-policy': REPORT_CSP, ...extra,
  });
  res.end(buf);
  return HANDLED;
}

/**
 * Nombre de reverse proxys de confiance devant l'application, d'après TRUST_PROXY : « 1 »/« true »/« yes » = un proxy, « 2 » = deux
 * (ex. CDN puis Traefik), absent/« 0 »/« false » = aucun.
 */
export function proxyHops(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (/^\d{1,2}$/.test(v)) return Number(v);
  return v === 'true' || v === 'yes' ? 1 : 0;
}

/**
 * Adresse IP du client. Derrière `trustProxy` proxys de confiance (nombre, ou true = 1), on lit X-Forwarded-For en partant de la FIN :
 * chaque proxy y AJOUTE l'adresse qu'il a vue, donc seules les dernières entrées sont fiables. La première est écrite par le client et
 * permettrait de contourner toute limitation par adresse en la changeant à chaque requête.
 */
export function clientIpOf(req, trustProxy) {
  const hops = trustProxy === true ? 1 : Number(trustProxy) || 0;
  if (hops > 0) {
    const chain = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (chain.length >= hops) return chain[chain.length - hops];
  }
  return req.socket.remoteAddress;
}
