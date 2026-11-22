// Rapport mensuel client et page de statut publique : deux documents HTML autonomes, sans JavaScript d'affichage.
//
// Données (disponibilité, pannes, alertes, mises à jour) → `siteReport()` ; mise en page → `renderReport()` et `renderStatusPage()`.
// Les fuseaux horaires sont donnés en minutes de décalage avec UTC (+60 pour Paris en hiver), comme pour les barres de disponibilité.
import {
  DAY_MS, alertsBetween, currentOutage, uptimeBetween, uptimeSummary, uptimeBars, outageList, outagesBetween, maintenanceBetween, listMaintenance, responseBetween,
} from './db.js';
import { phpSupport, codeAlertFiles } from './cms-alerts.js';
import { esc, fmtDuration } from './util.js';
import { tr, plural, currentLang, currentLocale, decimalSep } from './i18n.js';

/** Nom du mois (0 à 11) dans la langue du contexte. */
const monthName = (m) => new Date(Date.UTC(2000, m, 1)).toLocaleDateString(currentLocale(), { month: 'long', timeZone: 'UTC' });

/** Décalage du serveur lui-même (minutes par rapport à UTC), quand le navigateur n'en transmet pas. */
export const serverTz = () => -new Date().getTimezoneOffset();

/** Un jour local en texte, à partir d'un horodatage UTC et du décalage. */
const local = (t, tz) => new Date(t + tz * 60e3);
const fmtDate = (t, tz) => local(t, tz).toLocaleDateString(currentLocale(), { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
const fmtDateTime = (t, tz) => local(t, tz).toLocaleString(currentLocale(), { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtShort = (t, tz) => local(t, tz).toLocaleString(currentLocale(), { timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Disponibilité tronquée, jamais arrondie vers le haut (99,9996 % ne doit pas s'afficher « 100 % »). */
export function fmtPct(u) {
  if (u == null) return '—';
  const f = u >= 99 ? Math.floor(u * 1000) / 1000 : Math.floor(u * 100) / 100;
  return `${(f >= 100 ? '100' : f.toFixed(u >= 99 ? 3 : 2)).replace('.', decimalSep())}${currentLang() === 'fr' ? ' %' : '%'}`;
}

const fmtMs = (n) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(2).replace('.', decimalSep())} s` : tr('{v1} ms', { v1: Math.round(n) }));

/**
 * Mois demandé (« 2026-10 ») → bornes en ms UTC. Sans mois : le dernier mois entier.
 * `now` borne la fin (mois en cours). Retourne null si le mois est invalide ou dans le futur.
 */
export function monthRange(month, tz = 0, now = Date.now()) {
  const off = tz * 60e3;
  const here = local(now, tz);
  let y = here.getUTCFullYear();
  let m = here.getUTCMonth();
  if (month === undefined || month === null || month === '') {
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
  } else {
    const mm = /^(\d{4})-(\d{2})$/.exec(String(month));
    if (!mm) return null;
    y = Number(mm[1]);
    m = Number(mm[2]) - 1;
    if (m < 0 || m > 11 || y < 2000 || y > 2100) return null;
  }
  const from = Date.UTC(y, m, 1) - off;
  const to = Date.UTC(y, m + 1, 1) - off;
  if (from > now) return null;
  const key = `${y}-${String(m + 1).padStart(2, '0')}`;
  const prev = m === 0 ? `${y - 1}-12` : `${y}-${String(m).padStart(2, '0')}`;
  const next = m === 11 ? `${y + 1}-01` : `${y}-${String(m + 2).padStart(2, '0')}`;
  return { key, from, to, label: `${monthName(m)} ${y}`, partial: to > now, days: Math.round((to - from) / DAY_MS), prev, next: to > now ? null : next, tz };
}

const overlap = (aStart, aEnd, bStart, bEnd) => Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

/** Toutes les données d'un site pour une période [from, to[. */
export async function siteReport(w, range, now = Date.now()) {
  const { from, to } = range;
  const end = Math.min(to, now);
  const domainOnly = w.config.mode === 'domain';
  const out = { id: w.id, name: w.name, url: w.url, host: safeHost(w.url), domainOnly, since: w.createdAt, monitoredFrom: Math.max(from, w.createdAt) };
  if (domainOnly) {
    out.uptime = null;
  } else {
    const u = await uptimeBetween(w, from, end, now);
    out.uptime = u.uptime;
    out.downtime = u.downtime;
    out.outageCount = u.outages;
    out.outages = (await outagesBetween(w.id, from, to, now)).map((o) => ({ start: o.start, end: o.ongoing ? null : o.end, duration: o.duration, ongoing: o.ongoing, startedBefore: o.startedBefore }));
    out.longest = out.outages.reduce((m, o) => Math.max(m, o.duration), 0);
    out.response = await responseBetween(w.id, from, to);
    out.days = [];
    for (let t = from; t < end; t += DAY_MS) {
      const d = t + DAY_MS <= w.createdAt ? { uptime: null } : await uptimeBetween(w, t, Math.min(t + DAY_MS, end), now);
      out.days.push({ from: t, uptime: d.uptime, outages: d.outages ?? 0, downtime: d.downtime ?? 0 });
    }
  }
  const maint = await maintenanceBetween(w.id, from, to);
  out.maintenance = maint.map((m) => ({ start: m.start, end: m.end, note: m.note }));
  out.maintenanceMs = maint.reduce((s, m) => s + overlap(m.start, m.end, from, end), 0);

  // Alertes de la période (hors rétablissements et récapitulatifs de maintenance) : titres seulement, jamais le détail technique.
  const rows = await alertsBetween(w.id, from, to);
  out.alerts = { critical: rows.filter((r) => r.severity === 'critical').length, warning: rows.filter((r) => r.severity === 'warning').length, items: rows.slice(0, 15) };
  out.alerts.total = rows.length;

  const cms = w.state.cms;
  if (!domainOnly && w.config.cms.type && cms?.core) {
    const pending = [
      ...(cms.core?.available ? [{ kind: 'core', name: w.config.cms.type === 'prestashop' ? 'PrestaShop' : 'WordPress', current: cms.core.current, available: cms.core.available }] : []),
      ...(cms.extensions || []).filter((e) => e.available).map((e) => ({ kind: 'ext', name: e.name, current: e.current, available: e.available })),
      ...(cms.themes || []).filter((e) => e.available).map((e) => ({ kind: 'theme', name: e.name, current: e.current, available: e.available })),
    ];
    // Un contrôle désactivé pour ce site ne doit plus apparaître : les anciens résultats resteraient affichés comme s'ils étaient d'actuels.
    const secured = w.config.cms.security !== false;
    const integ = secured ? cms.integrity : null;
    const issues = integ?.core ? countIssues(integ) : null;
    const code = secured && w.config.cms.codeScan !== false ? codeSummary(cms.code) : null;
    out.cms = {
      type: w.config.cms.type, version: cms.cmsVersion || cms.core?.current || null, php: cms.php || null, phpSupport: phpSupport(cms.php, now),
      checkedAt: cms.checkedAt || null, pending,
      watched: { extensions: (cms.extensions || []).length, themes: (cms.themes || []).length },
      applied: (cms.history || []).filter((h) => h.ts >= from && h.ts < to),
      integrity: integ?.checkedAt && integ.core ? { checkedAt: integ.checkedAt, issues, partial: !!integ.partial || !integ.core.known } : null,
      code,
      admins: secured && cms.admins ? { count: cms.admins.count, flagged: (cms.admins.added?.length || 0) + (cms.admins.extra || 0) } : null,
    };
  }
  out.tlsExpires = w.state.tls?.expires || null;
  out.domainExpires = w.state.rdap?.expires || null;
  return out;
}

const safeHost = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

/** Recherche de code suspect : seulement des nombres (jamais un chemin de fichier ni un motif) ; null tant qu'aucune analyse n'a abouti. */
function codeSummary(code) {
  if (!code?.checkedAt || code.enabled === false) return null;
  const alerting = codeAlertFiles(code);
  const toReview = (code.files || []).filter((f) => !f.known && f.level !== 'vendor').length - alerting.length;
  return { checkedAt: code.checkedAt, alerting: alerting.length, critical: alerting.some((f) => f.level === 'strong' && f.origin === 'change'), toReview: Math.max(0, toReview), tracked: code.inventory || 0 };
}

function countIssues(integ) {
  const n = (s) => (s?.modified?.length || 0) + (s?.added?.length || 0);
  return n(integ.core) + (integ.plugins || []).reduce((t, p) => t + n(p), 0) + (integ.uploads?.php?.length || 0);
}

// ───────────── Mise en page ─────────────

// Les pages publiques reprennent la charte de l'application : elles chargent /style.css (jetons --sw-*, polices auto-hébergées, halos du fond,
// clair / sombre, classes .card .btn .pill .brand) et n'ajoutent ici que ce qui leur est propre, sous le préfixe « rp- » pour ne jamais
// entrer en collision avec les classes de l'application.
const CSS = `
body.rp{min-height:100vh;font-size:15px}
.rp-main{max-width:920px;margin:0 auto;padding:28px 18px 56px}
.rp-top{display:flex;flex-wrap:wrap;gap:12px 18px;align-items:center;justify-content:space-between;margin-bottom:26px}
.rp-top .brand{display:flex;padding:0}.rp-top .brand .logo{width:40px;height:40px}.rp-top .brand-name{font-size:19px}
.rp-nav{display:flex;flex-wrap:wrap;gap:8px}
.rp-main .btn[aria-disabled=true]{opacity:.45;pointer-events:none}
.rp-head{margin:0 0 22px}
.rp-head h1{font:700 34px/1.12 var(--sw-font-display);letter-spacing:-.02em;text-transform:none;margin:0 0 6px}
.rp-head p{margin:0;color:var(--sw-muted)}
.rp-main h2{font:700 18px/1.3 var(--sw-font-display);letter-spacing:-.01em;margin:0 0 14px}
.rp-main h3{font-size:14px;font-weight:700;margin:20px 0 8px;color:var(--sw-text-2)}
.rp-main p{margin:0 0 10px}
.rp-card{padding:20px 22px;margin:0 0 16px}
.rp-small{font-size:13px}
.rp-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:8px}
.rp-stat{background:var(--sw-glass-strong);border:1px solid var(--sw-glass-border);border-radius:var(--sw-r-control);padding:14px 16px;box-shadow:var(--sw-shadow-sm)}
.rp-stat b{display:block;font:700 28px/1.15 var(--sw-font-display);letter-spacing:-.02em}
.rp-stat b.ok{color:var(--sw-ok)}.rp-stat b.warn{color:var(--sw-warn)}.rp-stat b.crit{color:var(--sw-alert)}
.rp-stat span{display:block;margin-top:2px;font-size:13px;color:var(--sw-muted)}
@media (max-width:640px){.rp-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.rp-head h1{font-size:27px}.rp-card{padding:16px}.rp-stat b{font-size:24px}}
.rp-table{width:100%;border-collapse:collapse;font-size:14px}
.rp-table th,.rp-table td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--sw-divider);vertical-align:top}
.rp-table th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--sw-muted);font-weight:650}
.rp-table td.r,.rp-table th.r{text-align:right}.rp-table tr:last-child td{border-bottom:0}
.rp-bars{display:flex;gap:3px;height:38px;align-items:stretch;margin:14px 0 6px}
.rp-bars i{flex:1;min-width:2px;border-radius:4px;background:var(--sw-bar-ok)}
.rp-bars i.warn{background:var(--sw-warn)}.rp-bars i.bad{background:var(--sw-alert)}.rp-bars i.none{background:var(--sw-grid)}
.rp-legend{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--sw-muted)}
.rp-key{display:flex;flex-wrap:wrap;gap:6px 16px;margin:10px 0 0;font-size:12.5px;color:var(--sw-muted)}
.rp-key span::before{content:"";display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px;background:var(--sw-bar-ok)}
.rp-key .warn::before{background:var(--sw-warn)}.rp-key .bad::before{background:var(--sw-alert)}.rp-key .none::before{background:var(--sw-grid)}
.rp-list{margin:0;padding-left:18px}.rp-list li{margin:4px 0}
.rp-checks{list-style:none;margin:0;padding:0}
.rp-checks li{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:10px 0;border-bottom:1px solid var(--sw-divider)}
.rp-checks li:last-child{border-bottom:0}.rp-checks .k{flex:1 1 220px;color:var(--sw-text-2)}
.rp-empty{color:var(--sw-muted);font-style:italic}
.rp-state{display:flex;align-items:center;gap:16px}
.rp-state .dot{width:18px;height:18px;border-radius:50%;flex:none;background:var(--sw-grid)}
.rp-state .dot.ok{background:var(--sw-bar-ok);box-shadow:0 0 0 6px var(--sw-ok-bg)}.rp-state .dot.bad{background:var(--sw-alert);box-shadow:0 0 0 6px var(--sw-alert-bg)}.rp-state .dot.warn{background:var(--sw-warn);box-shadow:0 0 0 6px var(--sw-warn-bg)}
.rp-state h1{font:700 28px/1.15 var(--sw-font-display);letter-spacing:-.02em;text-transform:none;margin:0}
.rp-foot{margin-top:28px;font-size:12px;color:var(--sw-muted);text-align:center}
.rp-site{break-inside:auto;display:block;padding:0;border:0;cursor:auto}.rp-site h1.rp-sitehead{font:700 24px/1.2 var(--sw-font-display);text-transform:none;letter-spacing:-.02em;margin:6px 0 14px}
@media print{
  :root:root:root{--sw-bg:#fff;--sw-text:#0f172a;--sw-text-2:#334155;--sw-muted:#475569;--sw-divider:rgba(15,23,42,.12);--sw-grid:#d0d5dd;--sw-glass:#fff;--sw-glass-strong:#fff;--sw-glass-border:#d0d5dd;--sw-ok:#15803d;--sw-ok-bg:#dcfce7;--sw-warn:#b45309;--sw-warn-bg:#fef3c7;--sw-alert:#be123c;--sw-alert-bg:#ffe4e6;--sw-bar-ok:#16a34a;--bg:#fff;--surface:#fff;--surface-2:#f1f5f9;--border:#d0d5dd;--text:#0f172a;--text-2:#334155;--muted:#475569;--ok:#15803d;--ok-soft:#dcfce7;--warn:#b45309;--warn-soft:#fef3c7;--crit:#be123c;--crit-soft:#ffe4e6}
  body.rp{background:#fff;font-size:12.5px}body.rp::before{display:none}
  .rp-main{padding:0;max-width:none}.card{background:#fff!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;box-shadow:none!important;break-inside:avoid}
  .rp-stat{box-shadow:none}.noprint{display:none!important}.rp-sep{break-before:page}.rp-sep:first-of-type{break-before:auto}
}
`;

/** En-tête de marque : fonction, car le slogan se traduit à l'affichage (langue du contexte), pas au chargement du module. */
const brand = () => '<div class="brand"><div class="logo"><img src="/icon-192.png" alt="" width="40" height="40"></div><div><div class="brand-name"><span><span class="suricate">Suricate</span><span class="web">Web</span></span></div><small>' + tr('Surveillance de sites') + '</small></div></div>';

const page = ({ title, body, head = '', refresh = 0 }) => `<!doctype html>
<html lang="${currentLang()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">${refresh ? `<meta http-equiv="refresh" content="${refresh}">` : ''}
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<title>${esc(title)}</title><link rel="stylesheet" href="/style.css"><style>${CSS}</style>${head}</head><body class="rp"><main class="rp-main">${body}</main></body></html>`;

const barCls = (u) => (u == null ? 'none' : u >= 99.9 ? '' : u >= 95 ? 'warn' : 'bad');
const upCls = (u) => (u == null ? 'mute' : u >= 99.9 ? 'ok' : u >= 99 ? 'warn' : 'crit');
const upPill = (u) => `<span class="pill ${upCls(u)}">${fmtPct(u)}</span>`;

/** Barres jour par jour. Le détail de chaque jour est dans l'infobulle ET dans le libellé accessible : un écran tactile n'a pas de survol. */
function dayBars(days, tz) {
  const worst = days.filter((d) => d.outages).length;
  return `<div class="rp-bars" role="img" aria-label="${tr('Disponibilité jour par jour')} : ${worst ? tr('{plural} sur {length}', { plural: plural(worst, tr('jour avec panne'), tr('jours avec panne')), length: days.length }) : tr('aucune panne sur {length} jours', { length: days.length })}">${days.map((d) => {
    const when = local(d.from, tz).toLocaleDateString(currentLocale(), { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
    const t = d.uptime == null ? tr('{when} — pas de donnée', { when }) : `${when} — ${fmtPct(d.uptime)}${d.outages ? ` · ${plural(d.outages, tr('panne'), tr('pannes'))} (${fmtDuration(d.downtime)})` : tr(' · aucune panne')}`;
    return `<i class="${barCls(d.uptime)}" title="${esc(t)}"></i>`;
  }).join('')}</div><div class="rp-key" aria-hidden="true"><span>${tr('Disponible')}</span><span class="warn">${tr('Dégradé (moins de 99,9 %)')}</span><span class="bad">${tr('Panne importante (moins de 95 %)')}</span><span class="none">${tr('Pas de donnée')}</span></div>`;
}

function outageTable(list, tz) {
  if (!list.length) return ('<p class="rp-empty">' + tr('Aucune panne sur la période.') + '</p>');
  return `<table class="rp-table"><thead><tr><th>${tr('Début')}</th><th>${tr('Fin')}</th><th class="r">${tr('Durée')}</th></tr></thead><tbody>${list.map((o) => `<tr>
<td>${esc(o.startedBefore ? tr('avant le {fmtDate}', { fmtDate: fmtDate(o.start, tz) }) : fmtDateTime(o.start, tz))}</td>
<td>${o.ongoing ? ('<span class="pill crit">' + tr('En cours') + '</span>') : esc(fmtDateTime(o.end, tz))}</td>
<td class="r"><b>${esc(fmtDuration(o.duration))}</b></td></tr>`).join('')}</tbody></table>`;
}

const kindOf = (k) => ({ core: tr('noyau'), ext: tr('extension'), theme: tr('thème') })[k];

/** Pastille de synthèse « sécurité » d'un site (tableau d'un groupe) : à vérifier dès qu'un contrôle signale quelque chose. */
function securityPill(c) {
  if (!c || (!c.integrity && !c.code && !c.admins)) return '<span class="pill mute">—</span>';
  const n = (c.integrity?.issues || 0) + (c.code?.alerting || 0) + (c.admins?.flagged || 0);
  return n ? `<span class="pill crit">${plural(n, tr('point à vérifier'), tr('points à vérifier'))}</span>` : ('<span class="pill ok">' + tr('Rien à signaler') + '</span>');
}

function cmsSection(c, range, tz) {
  const shop = c.type === 'prestashop';
  const label = shop ? 'PrestaShop' : 'WordPress';
  const rows = [];
  rows.push(`<p><b>${esc(label)} ${esc(c.version || '')}</b>${c.php ? tr(' · PHP {esc}', { esc: esc(c.php) }) : ''}${c.phpSupport?.status === 'ended' ? tr((' <span class="pill crit">' + tr('PHP non maintenu') + '</span>')) : c.phpSupport?.status === 'ending' ? tr((' <span class="pill warn">' + tr('fin de support de PHP proche') + '</span>')) : ''}
<span class="muted rp-small"> · ${tr('relevé du {date}', { date: esc(fmtDate(c.checkedAt, tz)) })}${c.watched.extensions || c.watched.themes ? ` · ${plural(c.watched.extensions, tr('extension surveillée'), tr('extensions surveillées'))}, ${plural(c.watched.themes, tr('thème surveillé'), tr('thèmes surveillés'))}` : ''}</span></p>`);
  rows.push(`<h3>${tr('Mises à jour effectuées')} ${range.partial ? tr('ce mois-ci') : tr('sur la période')}</h3>`);
  rows.push(c.applied.length
    ? `<ul class="rp-list">${c.applied.map((h) => `<li>${esc(h.name)} (${kindOf(h.kind) || h.kind}) : ${h.from ? `${esc(h.from)} → ` : tr('installée en ')}<b>${esc(h.to)}</b> <span class="muted rp-small">· ${esc(fmtDate(h.ts, tz))}</span></li>`).join('')}</ul>`
    : ('<p class="rp-empty">' + tr('Aucune mise à jour détectée sur la période.') + '</p>'));
  rows.push(('<h3>' + tr('Mises à jour en attente') + '</h3>'));
  rows.push(c.pending.length
    ? `<ul class="rp-list">${c.pending.slice(0, 12).map((p) => `<li>${esc(p.name)} (${kindOf(p.kind)}) : ${esc(p.current || '—')} → <b>${esc(p.available)}</b></li>`).join('')}${c.pending.length > 12 ? `<li class="muted">… et ${c.pending.length - 12} autre(s)</li>` : ''}</ul>`
    : ('<p><span class="pill ok">' + tr('Tout est à jour') + '</span></p>'));
  if (c.integrity || c.code || c.admins) {
    rows.push(('<h3>' + tr('Sécurité du site') + '</h3><ul class="rp-checks">'));
    if (c.integrity) {
      // PrestaShop ne publie pas de sommes de contrôle : son module cherche seulement des fichiers PHP là où il ne devrait pas y en avoir.
      rows.push(`<li><span class="k">${shop ? tr('Fichiers PHP dans les dossiers de médias') : tr('Intégrité des fichiers{v1}', { v1: c.integrity.partial ? tr(' (contrôle partiel)') : '' })}</span>${c.integrity.issues ? `<span class="pill crit">${plural(c.integrity.issues, tr('anomalie'), tr('anomalies'))}</span>` : `<span class="pill ok">${shop ? tr('aucun') : tr('aucune anomalie')}</span>`} <span class="muted rp-small">${tr('contrôlé le {date}', { date: esc(fmtDate(c.integrity.checkedAt, tz)) })}</span></li>`);
    }
    if (c.code) {
      const k = c.code;
      rows.push(`<li><span class="k">${tr('Recherche de code suspect')}</span>${k.alerting ? `<span class="pill ${k.critical ? 'crit' : 'warn'}">${plural(k.alerting, tr('fichier à vérifier'), tr('fichiers à vérifier'))}</span>` : ('<span class="pill ok">' + tr('rien de suspect') + '</span>')}${k.toReview ? ` <span class="pill mute">${plural(k.toReview, tr('fichier à relire'), tr('fichiers à relire'))}</span>` : ''} <span class="muted rp-small">analysé le ${esc(fmtDate(k.checkedAt, tz))}${k.tracked ? ` · ${plural(k.tracked, tr('fichier suivi'), tr('fichiers suivis'))}` : ''}</span></li>`);
    }
    if (c.admins) rows.push(`<li><span class="k">${tr('Comptes administrateurs : {count}', { count: c.admins.count })}</span>${c.admins.flagged ? `<span class="pill crit">${plural(c.admins.flagged, tr('nouveau compte à vérifier'), tr('nouveaux comptes à vérifier'))}</span>` : ('<span class="pill ok">' + tr('aucun nouveau compte inconnu') + '</span>')}</li>`);
    rows.push('</ul>');
  }
  return `<div class="card rp-card"><h2>${tr('Mises à jour et sécurité')}</h2>${rows.join('')}</div>`;
}

function siteSection(s, range, { multi = false } = {}) {
  const tz = range.tz;
  const parts = [];
  parts.push(`<div class="card rp-card"><h2>${esc(multi ? s.name : tr('Disponibilité'))}${multi ? ` <span class="muted rp-small">· ${esc(s.host)}</span>` : ''}</h2>`);
  if (s.domainOnly) {
    parts.push(('<p class="muted">' + tr('Surveillance du nom de domaine seul : pas de mesure de disponibilité du site.') + '</p>'));
  } else {
    parts.push(`<div class="rp-stats">
<div class="rp-stat"><b class="${upCls(s.uptime)}">${fmtPct(s.uptime)}</b><span>${tr('Disponibilité')}</span></div>
<div class="rp-stat"><b>${s.outageCount ? esc(fmtDuration(s.downtime)) : '0'}</b><span>${tr('Indisponibilité cumulée')}</span></div>
<div class="rp-stat"><b>${s.outageCount}</b><span>${s.outageCount > 1 ? tr('Pannes') : tr('Panne')}${s.longest ? tr(' · la plus longue : {esc}', { esc: esc(fmtDuration(s.longest)) }) : ''}</span></div>
<div class="rp-stat"><b>${esc(fmtMs(s.response.avg))}</b><span>${tr('Temps de réponse moyen')}</span></div></div>`);
    if (s.monitoredFrom > range.from) parts.push(`<p class="muted rp-small">${tr('Surveillance démarrée le {date} : la période est comptée à partir de cette date.', { date: esc(fmtDate(s.monitoredFrom, tz)) })}</p>`);
    parts.push(dayBars(s.days, tz));
    parts.push(`<div class="rp-legend"><span>${esc(fmtDate(range.from, tz))}</span><span>${esc(fmtDate(Math.min(range.to, Date.now()) - 1, tz))}</span></div>`);
    parts.push(('<h3>' + tr('Pannes') + '</h3>'), outageTable(s.outages, tz));
  }
  if (s.maintenance.length) {
    parts.push(`<h3>${tr('Maintenances planifiées ')}<span class="muted rp-small">· ${esc(fmtDuration(s.maintenanceMs))}</span></h3><ul class="rp-list">${s.maintenance.map((m) => `<li>${esc(fmtShort(m.start, tz))} → ${esc(fmtShort(m.end, tz))}${m.note ? ` · ${esc(m.note)}` : ''}</li>`).join('')}</ul><p class="muted rp-small">${tr('Une maintenance n\'est pas comptée comme une indisponibilité.')}</p>`);
  }
  parts.push('</div>');

  parts.push(`<div class="card rp-card"><h2>${tr('Incidents détectés')}</h2>${s.alerts.total
    ? `<p>${s.alerts.critical ? `<span class="pill crit">${plural(s.alerts.critical, tr('critique'), tr('critiques'))}</span> ` : ''}${s.alerts.warning ? `<span class="pill warn">${plural(s.alerts.warning, tr('avertissement'), tr('avertissements'))}</span>` : ''}</p>
<table class="rp-table"><tbody>${s.alerts.items.map((a) => `<tr><td style="white-space:nowrap">${esc(fmtShort(a.ts, tz))}</td><td>${esc(a.title)}</td></tr>`).join('')}</tbody></table>${s.alerts.total > s.alerts.items.length ? `<p class="muted rp-small">… et ${s.alerts.total - s.alerts.items.length} autre(s).</p>` : ''}`
    : ('<p><span class="pill ok">' + tr('Aucun incident') + '</span> <span class="muted">' + tr('Aucune anomalie détectée sur la période.') + '</span></p>')}</div>`);

  if (s.cms) parts.push(cmsSection(s.cms, range, tz));

  const certs = [];
  if (s.tlsExpires) certs.push(tr('Certificat TLS valide jusqu\'au <b>{date}</b>', { date: esc(fmtDate(s.tlsExpires, tz)) }));
  if (s.domainExpires) certs.push(tr('Nom de domaine renouvelable avant le <b>{date}</b>', { date: esc(fmtDate(s.domainExpires, tz)) }));
  if (certs.length) parts.push(`<div class="card rp-card"><h2>${tr('Échéances')}</h2><ul class="rp-list">${certs.map((c) => `<li>${c}</li>`).join('')}</ul></div>`);
  return parts.join('\n');
}

/**
 * Rapport HTML : un site, ou plusieurs (un groupe) avec un tableau de synthèse.
 * `nav` : { base } adresse de la page sans le paramètre « month », pour les liens mois précédent / suivant.
 */
export function renderReport({ title, sites, range, nav, generatedAt = Date.now(), appName = 'SuricateWeb' }) {
  const tz = range.tz;
  const multi = sites.length > 1;
  const link = (month, text, cls = '') => (month ? `<a class="btn ${cls}" href="${esc(`${nav.base}${nav.base.includes('?') ? '&' : '?'}month=${month}&tz=${tz}`)}">${text}</a>` : `<a class="btn" aria-disabled="true">${text}</a>`);
  const head = `<header class="rp-top">${brand()}<div class="rp-nav noprint">${link(range.prev, tr('← Mois précédent'))}${link(range.next, tr('Mois suivant →'))}<button class="btn primary" type="button" data-print>${tr('Imprimer / PDF')}</button></div></header>
<div class="rp-head"><h1>Rapport mensuel — ${esc(range.label)}</h1><p>${esc(title)}${range.partial ? tr(' · mois en cours (jusqu’à ce jour)') : ''}</p></div>`;
  const summary = multi ? `<div class="card rp-card"><h2>${tr('Synthèse')}</h2><table class="rp-table"><thead><tr><th>${tr('Site')}</th><th class="r">${tr('Disponibilité')}</th><th class="r">${tr('Pannes')}</th><th class="r">${tr('Incidents')}</th><th class="r">${tr('Mises à jour en attente')}</th><th class="r">${tr('Sécurité')}</th></tr></thead><tbody>${sites.map((s) => `<tr>
<td><b>${esc(s.name)}</b><br><span class="muted rp-small">${esc(s.host)}</span></td><td class="r">${s.domainOnly ? '<span class="pill mute">—</span>' : upPill(s.uptime)}</td><td class="r">${s.domainOnly ? '—' : s.outageCount}</td><td class="r">${s.alerts.total}</td><td class="r">${s.cms ? s.cms.pending.length : '—'}</td><td class="r">${securityPill(s.cms)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const body = sites.map((s, i) => `<section class="rp-site ${multi && i ? 'rp-sep' : ''}">${multi ? `<h1 class="rp-sitehead">${esc(s.name)}</h1>` : ''}${siteSection(s, range, { multi: false })}</section>`).join('\n');
  const foot = `<footer class="rp-foot">${tr('Rapport généré par {app} le {when}. Période : du {from} au {to}.', { app: esc(appName), when: esc(fmtDateTime(generatedAt, tz)), from: esc(fmtDate(range.from, tz)), to: esc(fmtDate(Math.min(range.to, generatedAt) - 1, tz)) })}</footer>`;
  return page({ title: tr('Rapport {label} — {title}', { label: range.label, title }), body: head + summary + body + foot, head: '<script src="/report.js" defer></script>' });
}

// ───────────── Page de statut publique ─────────────

/** Ce que la page publique montre : disponibilité, pannes, maintenances. Jamais d'alerte de sécurité ni de détail technique. */
export async function statusData(w, tz = 0, now = Date.now()) {
  const open = await currentOutage(w.id);
  const maint = await listMaintenance(w.id, now);
  const active = maint.find((m) => m.start <= now) || null;
  let state = 'up';
  if (!w.enabled) state = 'paused';
  else if (active) state = 'maintenance';
  else if (open) state = 'down';
  return {
    state, since: open?.start ?? null, maintenance: maint.slice(0, 5), active,
    periods: await uptimeSummary(w, now), bars: await uptimeBars(w, tz, now, 90),
    outages: (await outageList(w.id, 90, now)).filter((o) => (o.end ?? now) > now - 90 * DAY_MS).slice(0, 15),
    checkedAt: w.lastCheck,
  };
}

const stateOf = (state) => ({
  up: ['ok', tr('Tous les systèmes fonctionnent normalement')],
  down: ['bad', tr('Panne en cours')],
  maintenance: ['warn', tr('Maintenance en cours')],
  paused: ['mute', tr('Surveillance en pause')],
})[state];

export function renderStatusPage({ title, host, data, tz = 0, now = Date.now() }) {
  const [cls, text] = stateOf(data.state);
  const pillCls = { ok: 'ok', bad: 'crit', warn: 'warn', mute: 'mute' }[cls];
  const per = (k, l) => `<div class="rp-stat"><b class="${upCls(data.periods[k].uptime)}">${fmtPct(data.periods[k].uptime)}</b><span>${l}</span></div>`;
  const body = `<header class="rp-top">${brand()}</header>
<div class="card rp-card"><div class="rp-state"><span class="dot ${cls}"></span><div><h1>${esc(title)}</h1><div class="muted rp-small">${esc(host)}</div></div></div>
<p style="margin:16px 0 0"><span class="pill ${pillCls}">${esc(text)}</span>${data.state === 'down' && data.since ? ` <span class="muted">${tr('depuis {when} ({duration})', { when: esc(fmtShort(data.since, tz)), duration: esc(fmtDuration(now - data.since)) })}</span>` : ''}${data.state === 'maintenance' && data.active ? ` <span class="muted">${tr('jusqu\'à {when}', { when: esc(fmtShort(data.active.end, tz)) })}${data.active.note ? ` · ${esc(data.active.note)}` : ''}</span>` : ''}</p></div>
<div class="card rp-card"><h2>${tr('Disponibilité')}</h2><div class="rp-stats">${per('24h', tr('24 heures'))}${per('7d', tr('7 jours'))}${per('30d', tr('30 jours'))}${per('90d', tr('90 jours'))}</div>
${dayBars(data.bars, tz)}<div class="rp-legend"><span>${tr('Il y a 90 jours')}</span><span>${tr('Aujourd\'hui')}</span></div></div>
${data.maintenance.length ? `<div class="card rp-card"><h2>${tr('Maintenances')}</h2><ul class="rp-list">${data.maintenance.map((m) => `<li>${esc(fmtShort(m.start, tz))} → ${esc(fmtShort(m.end, tz))}${m.note ? ` · ${esc(m.note)}` : ''}</li>`).join('')}</ul></div>` : ''}
<div class="card rp-card"><h2>${tr('Pannes des 90 derniers jours')}</h2>${outageTable(data.outages.map((o) => ({ start: o.start, end: o.end, duration: o.duration, ongoing: o.ongoing })), tz)}</div>
<footer class="rp-foot">${tr('Mis à jour le {when} · cette page se rafraîchit toute seule.', { when: esc(fmtDateTime(data.checkedAt || now, tz)) })}</footer>`;
  return page({ title: tr('État de {title}', { title }), body, refresh: 60, head: '<script src="/report.js" defer></script>' });
}
