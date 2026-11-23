// Réglages, Telegram (test d'envoi, détection de la conversation) et Slack (test d'envoi).
//
// Deux niveaux (voir db.js) : les réglages du COMPTE (Telegram, mots-clés, User-Agent, intervalle par défaut, seuil CMS,
// conservation des captures) sont lus et écrits pour le compte de l'utilisateur. Ceux de l'INSTALLATION (adresse publique de
// SuricateWeb) ne se modifient qu'avec le droit « instance:write » : accordé par défaut dans le cœur, refusé aux comptes clients
// de la version hébergée, qui ne doivent pas changer l'adresse de tout le monde.
import { HttpError } from '../http.js';
import { settingsFor, saveAccountSettings, saveInstanceSettings, accountDefaults, MAX_KEEP } from '../db.js';
import { pruneAllShots } from '../screenshot.js';
import * as tg from '../telegram.js';
import { cleanWebhookUrl, sendSlackTest } from '../slack.js';
import { clamp } from '../util.js';
import { isLang, tr } from '../i18n.js';
import { publicSettings } from './shared.js';

export default function register({ route }) {
  route('GET', '/api/settings', async (ctx) => publicSettings(ctx), { perm: 'settings:read' });

  // Langue de l'UTILISATEUR (sélecteur de langue, profil) : ouverte à tout utilisateur connecté, invités compris, qui n'ont pas le droit de
  // modifier les réglages du compte. La couche hébergée la garde par utilisateur (`auth.saveLanguage(user, langue)`) ; le cœur y ajoute la langue
  // des textes du COMPTE (alertes, messages Telegram) quand l'utilisateur peut régler le compte : le titulaire change tout d'un geste.
  route('PUT', '/api/language', async (ctx) => {
    const language = ctx.body?.language;
    if (!isLang(language)) throw new HttpError(400, tr('Langue inconnue'));
    await ctx.app.auth?.saveLanguage?.(ctx.user, language);
    if (await ctx.can('settings:write')) await saveAccountSettings(ctx.account.id, { language });
    return { language };
  }, { perm: 'settings:read' });

  route('PUT', '/api/settings', async (ctx) => {
    const b = ctx.body;
    const accountId = ctx.account.id;
    const cur = await settingsFor(accountId);
    const patch = {};
    if (b.telegram) {
      const t = b.telegram;
      patch.telegram = {
        token: t.token ? String(t.token).trim() : cur.telegram.token,
        chatId: t.chatId !== undefined ? String(t.chatId).trim() : cur.telegram.chatId,
        enabled: t.enabled !== undefined ? !!t.enabled : cur.telegram.enabled,
        minSeverity: ['info', 'warning', 'critical'].includes(t.minSeverity) ? t.minSeverity : cur.telegram.minSeverity,
        sendRecovery: t.sendRecovery !== undefined ? !!t.sendRecovery : cur.telegram.sendRecovery,
        includeDiff: t.includeDiff !== undefined ? !!t.includeDiff : cur.telegram.includeDiff,
        sendScreenshot: t.sendScreenshot !== undefined ? !!t.sendScreenshot : cur.telegram.sendScreenshot,
        buttons: t.buttons !== undefined ? !!t.buttons : cur.telegram.buttons,
      };
      if (t.clearToken) patch.telegram.token = '';
    }
    if (b.slack) {
      const sl = b.slack;
      const url = sl.webhookUrl ? cleanWebhookUrl(sl.webhookUrl) : cur.slack.webhookUrl;
      if (sl.webhookUrl && !url) throw new HttpError(400, tr('Adresse de webhook Slack invalide : elle doit ressembler à https://hooks.slack.com/services/T…/B…/…'));
      patch.slack = {
        webhookUrl: sl.clearWebhook ? '' : url,
        enabled: sl.enabled !== undefined ? !!sl.enabled : cur.slack.enabled,
        minSeverity: ['info', 'warning', 'critical'].includes(sl.minSeverity) ? sl.minSeverity : cur.slack.minSeverity,
        sendRecovery: sl.sendRecovery !== undefined ? !!sl.sendRecovery : cur.slack.sendRecovery,
        includeDiff: sl.includeDiff !== undefined ? !!sl.includeDiff : cur.slack.includeDiff,
      };
    }
    // Fréquence par défaut des nouveaux sites : jamais plus courte que ce que le forfait autorise (sinon elle serait ramenée au minimum à chaque création).
    const minEvery = Math.max(1, (await ctx.limits()).minIntervalMin ?? 1);
    if (b.defaultInterval !== undefined) patch.defaultInterval = clamp(b.defaultInterval, minEvery, 10080, Math.max(15, minEvery));
    const keepAll = b.retention?.screenshots !== undefined ? Math.round(clamp(b.retention.screenshots, 1, MAX_KEEP, accountDefaults().retention.screenshots)) : null;
    if (keepAll !== null) patch.retention = { screenshots: keepAll };
    if (isLang(b.language)) patch.language = b.language;
    if (b.cmsAfterDays !== undefined) patch.cmsAfterDays = Math.round(clamp(b.cmsAfterDays, 1, 90, 7));
    if (b.userAgent !== undefined) patch.userAgent = String(b.userAgent).trim() || cur.userAgent;
    if (Array.isArray(b.builtinKeywords)) patch.builtinKeywords = b.builtinKeywords.map((s) => String(s).trim()).filter(Boolean).slice(0, 300);

    // Adresse publique : propre à l'installation (liens des boutons Telegram). Vérifier le droit AVANT d'écrire quoi que ce soit.
    // Le formulaire de l'interface renvoie TOUJOURS ce champ, même inchangé : le droit n'est donc exigé que si la valeur CHANGE.
    // Sans cela, un compte client de la version hébergée (qui n'a pas instance:write) aurait un « Accès refusé » à chaque enregistrement
    // des réglages, y compris pour son bot Telegram.
    const cleanBase = (v) => String(v ?? '').trim().replace(/\/+$/, '');
    const baseChanged = b.baseUrl !== undefined && cleanBase(b.baseUrl) !== cleanBase(cur.baseUrl);
    if (baseChanged) await ctx.require('instance:write');
    if (baseChanged) await saveInstanceSettings({ baseUrl: cleanBase(b.baseUrl) });
    await saveAccountSettings(accountId, patch);
    if (keepAll !== null && keepAll !== cur.retention.screenshots) await pruneAllShots(accountId); // limite abaissée : appliquée aux sites du compte
    return await publicSettings(ctx);
  }, { perm: 'settings:write' });

  /** Jeton du formulaire, sinon celui déjà enregistré pour le compte. */
  const tokenFrom = async (ctx) => String(ctx.body.token || '').trim() || (await settingsFor(ctx.account.id)).telegram.token;

  route('POST', '/api/telegram/test', async (ctx) => {
    const token = await tokenFrom(ctx);
    const chatId = String(ctx.body.chatId || '').trim() || (await settingsFor(ctx.account.id)).telegram.chatId;
    try {
      const me = await tg.getMe(token);
      await tg.sendMessage(token, chatId, tr('✅ <b>SuricateWeb est connecté</b>\nLes alertes de surveillance arriveront ici.\n<i>Bot : @{bot}</i>', { bot: me.username }));
      return { ok: true, bot: me.username };
    } catch (e) {
      throw new HttpError(400, e.message);
    }
  }, { perm: 'settings:write' });

  // Test Slack : l'adresse du formulaire si elle est saisie, sinon celle déjà enregistrée. Le message part vraiment dans le canal.
  route('POST', '/api/slack/test', async (ctx) => {
    const typed = String(ctx.body.webhookUrl || '').trim();
    const url = typed ? cleanWebhookUrl(typed) : (await settingsFor(ctx.account.id)).slack.webhookUrl;
    if (!url) throw new HttpError(400, typed ? tr('Adresse de webhook Slack invalide : elle doit ressembler à https://hooks.slack.com/services/T…/B…/…') : tr('Collez d\'abord l\'adresse du webhook Slack'));
    try {
      await sendSlackTest(url);
      return { ok: true };
    } catch (e) {
      throw new HttpError(400, e.message);
    }
  }, { perm: 'settings:write' });

  route('POST', '/api/telegram/detect', async (ctx) => {
    try {
      const token = await tokenFrom(ctx);
      const me = await tg.getMe(token);
      return { bot: me.username, chats: await tg.detectChats(token) };
    } catch (e) {
      throw new HttpError(400, e.message);
    }
  }, { perm: 'settings:write' });
}
