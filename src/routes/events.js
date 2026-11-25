// Flux temps réel (SSE) : l'interface se met à jour sans recharger.
//
// Chaque utilisateur ne reçoit que les événements de SON compte. Un événement porte soit `accountId`, soit `watchId` (on retrouve
// alors le compte du site). Un événement dont on ne sait pas à quel compte il appartient n'est transmis à personne : mieux vaut
// manquer une mise à jour que montrer l'activité d'un autre compte.
import { bus } from '../events.js';
import { watchAccountId } from '../db.js';

export default function register({ route }) {
  route('GET', '/api/events', (ctx) => {
    const { req, res } = ctx;
    const mine = ctx.account.id;
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write('retry: 3000\n\n');

    // Le compte d'un site ne change jamais : on le retient pour ne pas interroger la base à chaque événement.
    const siteAccount = new Map();
    const accountOf = async (e) => {
      if (e.accountId != null) return e.accountId;
      if (e.watchId == null) return null;
      if (!siteAccount.has(e.watchId)) siteAccount.set(e.watchId, await watchAccountId(e.watchId));
      return siteAccount.get(e.watchId);
    };
    // File d'attente : la recherche du compte est asynchrone, et les événements doivent arriver dans l'ordre où ils sont survenus.
    let queue = Promise.resolve();
    let closed = false;
    const on = (e) => {
      queue = queue
        .then(async () => {
          if (closed || (await accountOf(e)) !== mine) return;
          // Accès limité (invité) : pas l'activité des sites qui ne lui sont pas partagés.
          if (ctx.data.restricted && e.watchId != null && !(await ctx.data.getWatch(e.watchId))) return;
          res.write(`data: ${JSON.stringify(e)}\n\n`);
        })
        .catch(() => {});
    };
    bus.on('event', on);
    // L'identité n'est lue qu'à l'ouverture : sans nouveau contrôle, un accès retiré (invité supprimé, session révoquée, mot de passe
    // réinitialisé, compte suspendu) continuerait de recevoir les évènements du compte. À chaque battement, on la revérifie et on coupe.
    // Une erreur passagère (base indisponible) ne ferme pas le flux : seule une réponse « plus d'identité » le fait.
    let checking = false;
    const ping = setInterval(async () => {
      if (checking || closed) return;
      checking = true;
      try {
        const identity = await ctx.app.auth.authenticate(req);
        if (!identity || identity.account?.id !== mine) {
          closed = true;
          bus.off('event', on);
          clearInterval(ping);
          res.end();
          return;
        }
      } catch { /* indisponibilité passagère : on réessaie au prochain battement */ } finally {
        checking = false;
      }
      if (!closed) res.write(': ping\n\n');
    }, Number(ctx.app.env.SURICATE_SSE_PING_MS) || 25000); // battement = fréquence de revérification de l'identité (réglable pour les tests)
    req.on('close', () => {
      closed = true;
      bus.off('event', on);
      clearInterval(ping);
    });
    return Symbol.for('handled');
  }, { perm: 'site:read' });
}
