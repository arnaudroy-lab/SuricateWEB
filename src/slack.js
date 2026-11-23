// Canal Slack : webhook entrant (« Incoming Webhook »), mis en forme en Block Kit.
//
// Pourquoi un webhook et non une application Slack : l'installation se résume à copier une adresse, sans OAuth ni adresse publique,
// donc aussi simple en auto-hébergé que sur la version hébergée. Limite assumée : un webhook ne peut pas joindre d'image
// (pas de capture d'écran dans Slack pour l'instant) ni recevoir de clic (pas de bouton « Marquer comme lu »).
import { SEV } from './util.js';
import { tr } from './i18n.js';
import { siteLink } from './telegram.js';

/** Origine autorisée pour le webhook ; `SLACK_API` ne sert qu'aux tests (faux serveur local). */
const ORIGIN = () => (process.env.SLACK_API || 'https://hooks.slack.com').replace(/\/+$/, '');

/**
 * Adresse de webhook valide : `<origine Slack>/services/T…/B…/…`. Refuser tout autre hôte évite qu'un champ de réglages serve
 * à faire envoyer des requêtes du serveur vers une adresse interne.
 * @returns {string} l'adresse nettoyée, ou '' si elle n'est pas valide.
 */
export function cleanWebhookUrl(value) {
  const v = String(value ?? '').trim();
  if (!v || v.length > 300) return '';
  let u;
  try { u = new URL(v); } catch { return ''; }
  const origin = new URL(ORIGIN());
  if (u.origin !== origin.origin || u.username || u.password || u.search || u.hash) return '';
  // La chaîne saisie doit être identique à l'adresse normalisée : `new URL` résout `/../` et `/./` en silence.
  const clean = u.origin + u.pathname;
  return clean === v && /^\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/.test(u.pathname) ? clean : '';
}

/** Adresse affichable sans la révéler : on garde le début (identifiant d'équipe) et la fin. */
export const maskWebhook = (u) => (u ? `${u.slice(0, u.indexOf('/services/') + 10)}••••••••${u.slice(-4)}` : '');

const COLOR = { critical: '#cf222e', warning: '#e0a000', info: '#0b63ae', recovery: '#1a7f37' };
const ICON = { critical: '🚨', warning: '⚠️', info: 'ℹ️', recovery: '✅' };
const label = (severity) => ({ critical: tr('CRITIQUE'), warning: tr('ATTENTION'), info: tr('INFO'), recovery: tr('RÉTABLI') })[severity];

/** Slack n'interprète que trois caractères dans son mrkdwn. */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Corps du message : une pièce jointe colorée (la gravité la plus haute) avec une section par alerte. */
export function buildSlackMessage(watch, alerts, settings) {
  const top = alerts.reduce((a, b) => ((SEV[b.severity] || 0) > (SEV[a.severity] || 0) ? b : a), alerts[0]);
  const blocks = [{ type: 'header', text: { type: 'plain_text', text: cut(`${ICON[top.severity]} ${label(top.severity)} · ${watch.name}`, 150), emoji: true } }];
  for (const a of alerts.slice(0, 20)) {
    let text = `${alerts.length > 1 ? `${ICON[a.severity]} ` : ''}*${esc(a.title)}*`;
    if (a.detail) text += `\n${esc(a.detail)}`;
    if (a.diffPreview && settings.slack?.includeDiff !== false) text += `\n\`\`\`${esc(cut(a.diffPreview, 1200)).replace(/```/g, '’’’')}\`\`\``;
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: cut(text, 2900) } });
  }
  if (alerts.length > 20) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: tr('… et {n} autres alertes', { n: alerts.length - 20 }) }] });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `🔗 ${esc(watch.url)}` }] });
  const link = siteLink(settings.baseUrl, watch.id);
  if (link) blocks.push({ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: tr('Ouvrir dans SuricateWeb') }, url: link }] });
  // `text` : texte de repli (notifications du téléphone, lecteurs d'écran) ; l'affichage riche est dans `attachments`.
  return { text: cut(`${label(top.severity)} · ${watch.name} — ${top.title}`, 300), attachments: [{ color: COLOR[top.severity] || COLOR.info, blocks }] };
}

const ERRORS = {
  invalid_token: () => tr('Adresse du webhook invalide ou révoquée : créez-en une nouvelle dans Slack'),
  no_service: () => tr('Adresse du webhook invalide ou révoquée : créez-en une nouvelle dans Slack'),
  no_service_id: () => tr('Adresse du webhook invalide ou révoquée : créez-en une nouvelle dans Slack'),
  channel_not_found: () => tr('Canal Slack introuvable : le webhook pointe vers un canal supprimé'),
  channel_is_archived: () => tr('Le canal Slack est archivé : choisissez-en un autre pour ce webhook'),
  action_prohibited: () => tr('Slack refuse ce webhook : un administrateur de l\'espace de travail l\'a restreint'),
  posting_to_general_channel_denied: () => tr('Slack interdit d\'écrire dans #general avec ce webhook'),
};

/**
 * Envoie `payload` au webhook. Slack répond « 429 » avec `Retry-After` quand on écrit trop vite : une seule nouvelle tentative,
 * après au plus 10 s, pour qu'une alerte ne soit pas perdue sans bloquer le contrôle longtemps.
 */
export async function postToWebhook(url, payload, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const clean = cleanWebhookUrl(url);
  if (!clean) throw new Error(tr('Adresse du webhook Slack manquante ou invalide'));
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(clean, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(15000) });
    } catch (e) {
      throw new Error(tr('Slack injoignable ({v1})', { v1: e.cause?.code || e.name }));
    }
    if (res.ok) return true;
    const body = (await res.text().catch(() => '')).trim().slice(0, 100);
    if (res.status === 429 && attempt === 0) {
      const wait = Math.min(10, Math.max(0, Number(res.headers.get('retry-after')) || 1));
      await sleep(wait * 1000);
      continue;
    }
    if (res.status === 429) throw new Error(tr('Slack limite les envois : réessayez dans quelques instants'));
    throw new Error(ERRORS[body] ? ERRORS[body]() : tr('Slack a refusé le message (HTTP {status} {body})', { status: res.status, body }));
  }
}

export const sendSlackAlert = (url, watch, alerts, settings) => postToWebhook(url, buildSlackMessage(watch, alerts, settings));

/** Message de test : prouve que le webhook écrit bien dans le bon canal. */
export const sendSlackTest = (url) => postToWebhook(url, {
  text: tr('✅ SuricateWeb est connecté'),
  blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `${tr('✅ *SuricateWeb est connecté*')}\n${tr('Les alertes de surveillance arriveront ici.')}` } }],
});
