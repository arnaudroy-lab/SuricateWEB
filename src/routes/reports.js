// Rapports mensuels clients (un site, ou un groupe entier) : HTML imprimable ou enregistrable en PDF.
import { HttpError, sendHtml } from '../http.js';
import { monthRange, siteReport, renderReport, serverTz } from '../report.js';
import { clamp } from '../util.js';
import { loadWatch } from './shared.js';
import { isLang, currentLang, runWithLang, tr } from '../i18n.js';

/** `?lang=en` impose la langue du rapport (un client peut être d'une autre langue que le compte) ; sinon celle du compte. */
const reportLang = (ctx) => (isLang(ctx.query.get('lang')) ? ctx.query.get('lang') : currentLang());
const langQuery = (ctx) => (isLang(ctx.query.get('lang')) ? `?lang=${ctx.query.get('lang')}` : '');

export default function register({ route }) {
  function reportRange(ctx) {
    const tz = clamp(ctx.query.get('tz'), -840, 840, serverTz());
    const range = monthRange(ctx.query.get('month'), Math.round(tz));
    if (!range) throw new HttpError(400, tr('Mois invalide (format AAAA-MM, pas dans le futur)'));
    return range;
  }

  // Un site : /api/watches/12/report?month=2026-10&tz=60 — ouvert dans un onglet, imprimable ou enregistrable en PDF.
  route('GET', '/api/watches/:id/report', (ctx) => runWithLang(reportLang(ctx), async () => {
    const w = await loadWatch(ctx);
    const range = reportRange(ctx);
    return sendHtml(ctx.res, renderReport({ title: `${w.name} · ${new URL(w.url).hostname.replace(/^www\./, '')}`, sites: [await siteReport(w, range)], range, nav: { base: `/api/watches/${w.id}/report${langQuery(ctx)}` } }));
  }), { perm: 'report:read' });

  // Un groupe (un client) : tous ses sites dans un seul rapport.
  route('GET', '/api/groups/:id/report', (ctx) => runWithLang(reportLang(ctx), async () => {
    const g = await ctx.data.getGroup(Number(ctx.params.id));
    if (!g) throw new HttpError(404, tr('Groupe introuvable'));
    const members = (await ctx.data.listWatches()).filter((w) => w.groupId === g.id);
    if (!members.length) throw new HttpError(400, tr('Ce groupe ne contient aucun site'));
    const range = reportRange(ctx);
    return sendHtml(ctx.res, renderReport({ title: g.name, sites: await Promise.all(members.map((w) => siteReport(w, range))), range, nav: { base: `/api/groups/${g.id}/report${langQuery(ctx)}` } }));
  }), { perm: 'report:read' });

}
