<p align="center">
  <img src="docs/screenshots/suricateweb_banner.jpg" alt="SuricateWeb" width="400">
</p>


# SuricateWeb

> 📖 **Documentation en ligne** (français et anglais) : <https://docs.suricateweb.fr>

Surveillance de sites web pour webmasters : **détecter un piratage, une défiguration, un remplacement ou un transfert de domaine sans ouvrir le site**, et être alerté sur **Telegram**.

Inspiré de [changedetection.io](https://github.com/dgtlmoon/changedetection.io), mais pensé pour la sécurité plutôt que pour le suivi de prix : en plus du contenu, SuricateWeb surveille ce qui change quand un site est compromis.

**Node.js pur — zéro dépendance npm, pas de Python.** Serveur HTTP, `fetch`, `dns`, `tls` et SQLite (`node:sqlite`) sont natifs.

![Tableau de bord SuricateWeb : sites regroupés par client, état, disponibilité et temps de réponse](docs/screenshots/tableau-de-bord.png)

> **Toutes les images de ce document utilisent des données fictives** (domaines en `.example`, adresses IP de documentation) : elles sont générées par le [mode démo](#essayer-sans-rien-configurer-mode-démo), jamais à partir de vrais sites.

## Sommaire

[Aperçu](#aperçu) · [Démarrage](#démarrage) · [Déploiement sur Dokploy](#déploiement-sur-dokploy-docker) · [Telegram](#configurer-telegram) · [Captures d'écran](#captures-décran) · [Groupes](#groupes-de-sites) · [Ce qui est surveillé](#ce-qui-est-surveillé) · [Plusieurs pages](#plusieurs-pages-par-site) · [Rapport et page de statut](#rapport-mensuel-et-page-de-statut) · [Réduire le bruit](#réduire-le-bruit) · [Maintenance](#fenêtres-de-maintenance) · [Limites](#limites-à-connaître) · [Architecture](#architecture) · [Mode démo](#essayer-sans-rien-configurer-mode-démo)

## Aperçu

### La page d'un site

Un coup d'œil suffit : l'**aperçu** de la page (dernière capture), l'état HTTP, le temps de réponse, la disponibilité sur 30 jours, la frise des 90 derniers jours, puis chaque **signal surveillé** (contenu, certificat TLS, DNS, nom de domaine, serveur et redirections) avec son état.

![Page d'un site : aperçu, disponibilité, temps de réponse et signaux surveillés](docs/screenshots/site-apercu.png)

### Détecter une défiguration

Quand le contenu est remplacé, SuricateWeb le dit clairement (**similarité 0 %**), montre les lignes retirées et ajoutées, et garde chaque version : on peut toujours revenir voir ce qui a changé et quand.

![Onglet Modifications : diff d'une page défigurée](docs/screenshots/modifications.png)

Les **captures d'écran** régulières montrent ce que voient réellement les visiteurs, et la visionneuse permet de **comparer avant / après** côte à côte.

![Comparaison avant / après d'une capture d'écran](docs/screenshots/comparaison.png)

### Être alerté sur Telegram

Un seul message par contrôle, avec la sévérité, le détail, un extrait des lignes modifiées, deux **boutons** (« Marquer comme lu » et « Ouvrir dans SuricateWeb ») et, pour les alertes critiques visibles sur la page, **une photo de la page au moment de l'alerte**. Le texte de cette image est celui que l'application génère ; seul l'habillage de la conversation est une reconstitution.
<p align="center">
<img src="docs/screenshots/telegram.png" alt="Message Telegram d'alerte critique avec photo de la page défigurée" width="420">
</p>

Les mêmes alertes peuvent aussi arriver dans un **canal Slack** (webhook entrant, en couleur selon la gravité) : [Configurer Slack](#configurer-slack).

### Disponibilité, domaine et alertes

| Disponibilité (type UptimeRobot) | Domaine & DNS |
|---|---|
| ![Disponibilité : pannes, temps de réponse](docs/screenshots/disponibilite.png) | ![Domaine & DNS : registre, DNSSEC, enregistrements](docs/screenshots/domaine-dns.png) |

![Journal des alertes, classées par jour et par sévérité](docs/screenshots/alertes.png)

### Pages sensibles, rapport client

- **Plusieurs pages par site** : panier, connexion, contact… surveillés pour les scripts, iframes, formulaires détournés et textes suspects. [Détails](#plusieurs-pages-par-site).
- **Rapport mensuel client** (disponibilité, incidents, mises à jour, à imprimer ou enregistrer en PDF) et **page de statut** publique en lecture seule. [Détails](#rapport-mensuel-et-page-de-statut).

### Thème sombre et mobile

L'interface suit le thème du système (bouton lune / soleil dans la barre latérale) et s'adapte aux petits écrans : la barre latérale devient une barre de navigation en bas. Sur téléphone, les onglets d'un site défilent : un dégradé et une flèche indiquent qu'il en reste, et l'onglet ouvert est toujours amené à l'écran.

| Thème sombre | Mobile |
|---|---|
| ![Tableau de bord, thème sombre](docs/screenshots/tableau-de-bord-sombre.png) | <img src="docs/screenshots/mobile.png" alt="Tableau de bord sur mobile" width="300"> |

### Barre latérale

Sous le nom **SuricateWeb**, la **version de l'application** (lue dans `package.json`). En bas, à côté du thème et de la déconnexion : un lien vers le **dépôt GitHub** et un lien vers la **documentation en ligne** ([docs.suricateweb.fr](https://docs.suricateweb.fr)). Ces liens s'ouvrent dans un nouvel onglet ; ils proviennent de `package.json`, et disparaissent s'ils n'y sont pas renseignés.

Le lien de documentation suit la **langue de l'interface** : la racine du site en français, `/en/` en anglais. Il vient du champ `docs` de `package.json` (`url` du site et `languages` qu'il propose : le français à la racine, les autres sous `/<langue>/`). Sans ce champ, il retombe sur `homepage`, puis sur le README du dépôt, et n'ajoute alors aucune langue : un **fork** qui publie sa propre documentation modifie `docs` (ou le retire) sans toucher au code.

## Démarrage

Prérequis : Node.js ≥ 22.13 (et Chrome/Chromium pour les [captures d'écran](#captures-décran), facultatif).

```bash
cp .env.example .env     # puis éditez SURICATE_USER et SURICATE_PASSWORD
npm start
```

Ouvrez <http://localhost:3000>, connectez-vous, cliquez sur **Ajouter un site**, puis configurez Telegram dans **Réglages**.

![Formulaire d'ajout d'un site : adresse, fréquence, groupe, étiquettes et signaux à surveiller](docs/screenshots/formulaire.png)

Dans le formulaire, le bouton **Tester** vérifie l'adresse avant de l'enregistrer. La configuration recommandée surveille tout ; désactivez ce qui produit trop de bruit sur un site donné.

### Connexion : identifiant et mot de passe dans `.env`

**L'application est toujours protégée.** Les identifiants se définissent uniquement dans le fichier `.env` (ou dans les variables d'environnement de l'hébergeur) ; rien n'est modifiable depuis l'interface, et **SuricateWeb refuse de démarrer** s'ils sont absents.

```ini
SURICATE_USER=admin
SURICATE_PASSWORD="un mot de passe solide"     # 8 caractères minimum ; guillemets si il contient # ou des espaces
```

- Générer un mot de passe : `node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"`
- Changer d'identifiants : modifiez le `.env`, redémarrez. **Toutes les sessions ouvertes sont alors déconnectées.**
- Si `SURICATE_USER` est absent, l'identifiant par défaut est `admin` (avertissement au démarrage).
- Les variables déjà définies dans l'environnement (Docker, Dokploy) **ont priorité** sur le `.env`.
- `.env` est ignoré par Git et par Docker : il ne sera jamais versionné ni copié dans une image.
- 5 tentatives de connexion par minute et par IP ; le mot de passe n'apparaît jamais dans les journaux.

| Variable | Défaut | Rôle |
|---|---|---|
| `SURICATE_USER` | `admin` | Identifiant de connexion |
| `SURICATE_PASSWORD` | — (**obligatoire**) | Mot de passe de connexion |
| `PORT` | `3000` | Port d'écoute |
| `HOST` | `127.0.0.1` | Interface d'écoute (`0.0.0.0` pour exposer sur le réseau) |
| `DATA_DIR` | `./data` | Base SQLite et captures d'écran |
| `TRUST_PROXY` | — | Nombre de reverse proxys de confiance : `1` derrière Traefik/nginx, `2` si un CDN les précède (cookie `Secure`, IP client lue en partant de la fin de `X-Forwarded-For`) |
| `CHROME_PATH` | détecté | Chemin de Chrome/Chromium pour les captures |
| `CHROME_NO_SANDBOX` | — | `1` dans Docker (déjà défini dans l'image) |
| `CHROME_WS_URL` | — | Chrome **distant** (`ws://hôte:port?token=…`, ex. conteneur Browserless) : le serveur s'y connecte au lieu de lancer Chrome |
| `SCREENSHOT_CONCURRENCY` | `2` | Captures simultanées au maximum |
| `SCREENSHOT_KEEP_DEFAULT` | `168` | Captures planifiées conservées par site, par défaut (chaque compte peut choisir autrement dans les réglages) |
| `SCREENSHOT_PURGE` | `1` | `0` désactive la purge périodique (toutes les 6 h) des captures dont le fichier a disparu : leurs lignes sont retirées de la liste, aucun fichier n'est jamais supprimé |
| `ENV_FILE` | `./.env` | Emplacement alternatif du fichier d'environnement |
| `TELEGRAM_API` | `https://api.telegram.org` | Adresse de l'API Telegram (utile pour les tests ou un relais) |
| `TELEGRAM_POLL` | — | `0` : n'écoute pas les clics sur les boutons Telegram (voir [Boutons sous les alertes](#boutons-sous-les-alertes)) |
| `SURICATE_DEMO` | — | `1` : [mode démo](#essayer-sans-rien-configurer-mode-démo), contrôles et captures désactivés |

> **Placez SuricateWeb derrière HTTPS** (reverse proxy) si vous l'exposez hors de votre machine : le mot de passe transite sinon en clair. Un utilisateur connecté peut faire requêter des adresses arbitraires par le serveur : ne partagez pas l'accès.

Pour le laisser tourner en continu : `pm2 start server.js --name suricateweb --node-args="--disable-warning=ExperimentalWarning"`, ou un service systemd (`ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning server.js`).

### Essayer sans rien configurer (mode démo)

```bash
npm run demo
```

Ouvrez <http://127.0.0.1:3100> (identifiant `demo`, mot de passe `demo-password`) : SuricateWeb démarre avec **des sites, des alertes, des pannes et des captures fictifs**, dans un dossier temporaire supprimé à l'arrêt. Aucune donnée de `./data` n'est touchée. « Wiki technique » est en maintenance. En mode démo, les contrôles, les captures et les relevés sont désactivés (un clic sur « Vérifier maintenant » l'indique), et aucune requête n'est envoyée vers l'extérieur ; Telegram n'est pas configuré.

Les images de ce document sont produites par le même jeu de données :

```bash
npm run docs:screenshots     # régénère docs/screenshots/*.png (nécessite Chrome ou Chromium)
npm run docs:screenshots -- --lang=en --only=tableau-de-bord,telegram   # en anglais (docs/screenshots/en/), seulement ces images
```

En anglais, l'interface, les sites fictifs, les alertes et le message Telegram sont écrits en anglais ; `--only` évite de versionner un jeu complet. La page d'accueil de la version hébergée reprend six de ces images (voir sa documentation).

## Déploiement sur Dokploy (Docker)

Le `Dockerfile` à la racine produit une image d'environ **1,3 Go** (Node 24 Alpine + Chromium et ses polices pour les captures), avec `tini` et un healthcheck. Le processus Node tourne sans droits root ; au démarrage, l'image rend d'abord le volume de données accessible à l'utilisateur `node`.

1. **Créer l'application** : *Create Application* → source Git (ou dépôt public) → *Build Type* : **Dockerfile**.
2. **Variables d'environnement** (onglet *Environment*) :

   | Variable | Valeur | Rôle |
   |---|---|---|
   | `SURICATE_USER` | l'identifiant de votre choix | Identifiant de connexion (`admin` si absent) |
   | `SURICATE_PASSWORD` | un mot de passe de 8+ caractères | **Obligatoire** : sans lui, le conteneur s'arrête avec un message explicite dans les journaux |
   | `TRUST_PROXY` | `1` (déjà dans l'image) | Lit `X-Forwarded-*` de Traefik : cookie `Secure` en HTTPS, vraie IP pour la limitation des tentatives de connexion |

   Chromium (`CHROME_PATH`, `CHROME_NO_SANDBOX`) est déjà configuré dans l'image.

3. **Volume persistant** (onglet *Advanced › Volumes*) : type **Volume**, nom `suricate-data` (nom libre : gardez celui que vous avez déjà créé), chemin de montage `/data`. Sans lui, la base (sites, historique, jeton Telegram) **et les captures d'écran** sont perdues à chaque redéploiement.
   Un volume créé par Dokploy appartient souvent à root : l'image corrige ça au démarrage (`unable to open database file` venait de là). Le chemin de montage doit rester `/data`, ou correspondre à `DATA_DIR` si vous le changez.
4. **Domaine** (onglet *Domains*) : votre domaine, **port `3000`**, HTTPS activé (Let's Encrypt).
5. **Déployer.**

Notes :
- Ne lancez qu'**une seule instance** : la base SQLite et le planificateur ne sont pas conçus pour tourner en double.
- Les contrôles partent du serveur Dokploy : pour surveiller un site, celui-ci doit être joignable depuis ce serveur (un site restreint par IP doit autoriser son adresse).
- Sauvegarde : le dossier `/data` contient tout ; sinon *Réglages › Données › Exporter* sauvegarde la liste des sites, leurs groupes et leur configuration (pas l'historique).
- L'image ne contient que le code de l'application : les scripts de démo, les tests et les captures de ce README n'y sont pas copiés.

Hors Dokploy, la même image fonctionne partout :

```bash
docker build -t suricateweb .
docker run -d --name suricateweb -p 3000:3000 -v suricate-data:/data \
  -e SURICATE_USER=admin -e SURICATE_PASSWORD='un-mot-de-passe-solide' suricateweb
```

## Configurer Telegram

1. Dans Telegram, ouvrez **@BotFather**, envoyez `/newbot`, copiez le jeton.
2. Collez-le dans *Réglages › Notifications Telegram*, puis envoyez `/start` à votre bot (ou ajoutez-le dans un groupe).
3. Cliquez sur **Détecter** (retrouve le chat ID tout seul), puis **Tester**, puis **Enregistrer**.

![Réglages : notifications Telegram](docs/screenshots/reglages.png)

Les options : notifications actives (coupe tous les envois sans perdre la configuration), message de **rétablissement**, **extrait des changements**, **capture d'écran jointe aux alertes critiques**, **niveau minimal** des notifications (« Attention et critique » par défaut) et **boutons** sous les messages et **adresse de SuricateWeb** (celle du bouton « Ouvrir dans SuricateWeb »). Le jeton, une fois enregistré, n'est plus renvoyé au navigateur qu'abrégé (`1234••••0000`). La section *Détection* des Réglages fixe la fréquence et le User-Agent par défaut, le nombre de captures d'écran conservées par site, le délai d'alerte de l'extension et la liste des mots-clés suspects ; *Données* exporte et importe la liste des sites.

Un seul message est envoyé par contrôle, même si plusieurs anomalies sont détectées. Il contient la sévérité, le site, le détail et un extrait des lignes modifiées.

Sur une alerte **critique visible sur la page** (contenu remplacé, texte de piratage, script ou iframe injectés, redirection vers un autre domaine…), le message est suivi d'une **photo de la page au moment de l'alerte** : on voit depuis le téléphone ce que voient les visiteurs. Désactivable dans *Réglages › Telegram*. Les alertes sans effet visible (DNS, registre, certificat, panne) n'en envoient pas.

### Boutons sous les alertes

Chaque message d'alerte porte deux boutons :

| Bouton | Effet |
|---|---|
| **✓ Marquer comme lu** | SuricateWeb marque comme lues les alertes **de ce site, jusqu'à la dernière de ce message** (comme « Tout est normal » dans l'application) : le badge et l'état du site se mettent à jour, sans ouvrir l'application. Le bouton devient « ✓ Lu ». |
| **Ouvrir dans SuricateWeb** | Ouvre la page du site dans SuricateWeb (après connexion). |

- Un message « ✅ Rétabli » n'a que « Ouvrir » : ses alertes sont déjà lues.
- **« Ouvrir » exige l'adresse publique de SuricateWeb** (*Réglages › Adresse de SuricateWeb*), joignable depuis un téléphone. Telegram refuse `localhost` et les réseaux privés : dans ce cas le bouton est omis et le lien reste dans le texte du message. Si Telegram refuse malgré tout un bouton, SuricateWeb réessaie sans lui, puis sans aucun bouton : une alerte ne se perd jamais à cause d'un bouton.
- **Comment SuricateWeb reçoit le clic** : en interrogeant Telegram régulièrement (`getUpdates`, attente de 25 secondes). Il n'y a **aucune adresse publique à ouvrir ni route sans connexion** : l'application se comporte comme avant côté réseau, et cela marche aussi en local. Les réglages sont relus à chaque tour : activer ou couper les boutons n'exige aucun redémarrage (comptez quelques secondes).
- **Seule la conversation configurée a le droit d'agir** : un clic venu d'une autre conversation est refusé (« Action non autorisée »). Si le bot est dans un **groupe**, tous les membres du groupe peuvent cliquer : c'est une limite de Telegram.
- Un clic n'est jamais rejoué, et un bouton sur un très ancien message reste valable (il ne marque que ce qui est encore non lu).
- Les boutons se coupent dans *Réglages › Telegram*, ou pour toute l'installation avec `TELEGRAM_POLL=0` (les messages gardent alors leur bouton « Ouvrir »). Sans boutons, le message est identique à avant.

**Limites** : Telegram n'admet qu'**un seul lecteur** par bot. Si vous avez configuré un **webhook** pour ce bot (autre outil), SuricateWeb ne peut pas recevoir les clics et le signale une fois dans ses journaux : supprimez le webhook ou coupez les boutons. Le bouton **Détecter** des Réglages interroge le même flux : il prend la main un instant, puis la réception reprend d'elle-même ; si un clic arrive juste avant, il peut avoir effacé le `/start` attendu : renvoyez-le au bot.

Dans l'application, l'onglet **Alertes** liste tout ce qui a été détecté (filtres Critiques / Attention / Infos / Rétablis, « Voir les changements » pour ouvrir le diff, badge « Envoyé sur Telegram »). **Tout marquer comme lu** efface le badge ; sur la page d'un site, **Tout est normal** marque ses alertes comme vérifiées.

## Configurer Slack

Les alertes arrivent dans le canal Slack de votre équipe, en plus (ou à la place) de Telegram. Rien à héberger : un **webhook entrant** suffit.

1. Sur `api.slack.com/apps`, créez une application, activez **Incoming Webhooks**, puis *Add New Webhook to Workspace* et choisissez le canal.
2. Collez l'adresse (`https://hooks.slack.com/services/T…/B…/…`) dans *Réglages › Notifications Slack*, cliquez sur **Tester** (un vrai message part dans le canal), puis **Enregistrer**.

Chaque contrôle envoie **un seul message** : un en-tête avec la gravité la plus haute et le nom du site, une section par alerte (titre, détail, extrait des changements en option), l'adresse du site et un bouton **Ouvrir dans SuricateWeb** si l'adresse publique de l'instance est utilisable. La barre de couleur suit la gravité (rouge, orange, bleu, vert pour un rétablissement). Les options sont celles de Telegram : notifications actives, rétablissement, extrait des changements, niveau minimal.

- **L'adresse du webhook est un secret** : quiconque la possède peut écrire dans votre canal. Elle n'est jamais renvoyée au navigateur (seulement masquée), et chiffrée en base quand la version hébergée fournit une clé (`configureStore({ secrets })`). Une adresse qui n'est pas de la forme `https://hooks.slack.com/services/…` est refusée : le champ ne peut pas servir à faire joindre une adresse interne par le serveur.
- **Limites d'un webhook** : pas de capture d'écran jointe et pas de bouton « Marquer comme lu » (Slack ne renvoie pas les clics à un simple webhook). Ces deux fonctions restent propres à Telegram.
- Si Slack répond « trop de requêtes » (429), SuricateWeb réessaie une fois après le délai demandé (10 secondes au plus). Si le webhook a été révoqué ou le canal archivé, l'alerte est marquée en erreur d'envoi avec une explication, et Telegram n'est pas gêné.

## Captures d'écran

SuricateWeb prend une photo de chaque site à intervalle régulier (**toutes les heures par défaut**, de 5 minutes à 7 jours) :

- **Aperçu immédiat** : la dernière capture s'affiche dans un cadre de navigateur en haut de la page du site, et en vignette dans la liste.
- **Onglet Captures** : l'historique en grille, une visionneuse (flèches ← →), et une **comparaison côte à côte avant / après** pour constater une défiguration.
- Réglable par site : fréquence, **nombre de captures à conserver**, format (ordinateur 1280×800, grand écran 1920×1080, mobile 390×844), page entière (5 000 px maximum, **activée par défaut** pour les nouveaux sites), attente après chargement, simulation de visiteur, masquage des bandeaux de cookies. Bouton **Capturer maintenant**.

![Onglet Captures : historique des captures d'un site, dont celle prise au moment de l'alerte](docs/screenshots/captures.png)

**Avant de capturer, SuricateWeb se comporte comme un visiteur** : il attend que le réseau soit au repos, simule une interaction (souris, molette), descend la page par paliers pour déclencher le chargement différé des images et les animations « à l'apparition », la remonte, attend les polices, puis patiente (3 s par défaut). Cela évite les captures à moitié vides.

> Pourquoi la simulation de visiteur ? Beaucoup de sites WordPress (WP Rocket « retarder l'exécution du JavaScript », NitroPack, Perfmatters…) **n'exécutent leurs scripts qu'à la première interaction réelle** d'un visiteur. Sans elle, jQuery, le slider d'accueil ou les menus ne démarrent jamais, et la capture montre des zones vides — y compris si on attend 6 secondes de plus, ce qui a été constaté sur un site réel. Contrepartie : ces scripts retardés incluent souvent vos **statistiques** (Google Analytics, Matomo, pixels) ; chaque capture peut donc compter une visite. Désactivez « Simuler un visiteur » pour un site dont ce n'est pas souhaitable, ou excluez l'IP du serveur de vos statistiques.

- **Conservation : la limite est réglable.** Par défaut, les **168 dernières captures planifiées** de chaque site sont gardées (7 jours à raison d'une par heure) ; les plus anciennes sont supprimées, lignes et fichiers, après chaque capture.
  - **Réglage général** : *Réglages › Détection › Captures d'écran conservées par site* (de 12 à 2 000). Ce réglage affiche aussi le nombre de captures et l'espace occupé par l'ensemble des sites.
  - **Réglage par site** : *Modifier › Capture d'écran › Captures à conserver*. « Réglage général » suit la valeur ci-dessus ; le formulaire indique la durée d'historique que couvre la limite à la fréquence choisie (24 captures à 1 h = 24 heures, 24 captures à 24 h = 24 jours).
  - **Les captures manuelles et d'alerte ont leur quota**, de même taille que la limite mais **100 au plus** : elles ne sont jamais écrasées par les planifiées, et une rafale de captures planifiées ne fait pas disparaître celle prise au moment d'une défiguration.
  - **Une limite abaissée s'applique tout de suite** : les captures en trop sont supprimées à l'enregistrement, sans attendre la prochaine capture. Changer seulement la limite ne déclenche pas de nouvelle capture.
  - L'onglet **Captures** rappelle la limite, le nombre de captures en stock et leur poids. Le poids d'une capture dépend entièrement du site (une page entière en pèse bien plus qu'une fenêtre visible) : consultez ce chiffre avant de relever la limite.
  - Une miniature de ~5 Ko évite d'alourdir le tableau de bord.
- Les images restent derrière la connexion : aucun lien de capture n'est public.

Le navigateur est piloté directement par le protocole DevTools de Chrome : **aucune dépendance npm**. Il faut Chrome, Chromium, Edge ou Brave sur le serveur (détecté automatiquement, ou `CHROME_PATH`) ; l'image Docker embarque Chromium. Sans navigateur, tout le reste fonctionne et l'interface l'indique. Pour garder Chrome hors du serveur, `CHROME_WS_URL` pointe vers un Chrome déjà lancé ailleurs (conteneur Browserless, `chromedp/headless-shell`…) : chaque capture y ouvre un contexte isolé, détruit ensuite.

### Alerte si l'apparence change

*Modifier › Capture d'écran › Alerter si l'apparence change* : chaque capture **planifiée** est comparée à la précédente, pixel par pixel, **dans le Chrome qui vient de la prendre** (aucune dépendance : le navigateur sait décoder les images). Les deux images sont ramenées à une largeur commune (640 px) ; un point compte comme modifié si un canal de couleur s'écarte de plus de la **tolérance** (32 sur 255 par défaut : elle absorbe le bruit de compression JPEG), ou si l'une des pages n'a rien à cet endroit (page plus longue ou plus courte).

- **Seuil d'alerte** : part de la page qui doit avoir changé (10 % par défaut). Une alerte « L'apparence de la page a changé (n %) » est créée, **critique au-delà de la moitié de la page** (page remplacée), sinon avertissement. Elle part sur **Telegram suivie de l'image des zones modifiées** (la page estompée, le changé en rouge), comme sur les autres canaux qui reçoivent des photos. Elle est retenue pendant une maintenance, comme les autres.
- **Éléments à ignorer** : sélecteurs CSS (horloge, carrousel, publicité) masqués sur les captures pour ne pas déclencher d'alerte à chaque passage. Un sélecteur invalide est sans effet.
- **Rien n'est comparé la première fois** : ni la toute première capture, ni la suivante (la précédente n'a pas été prise avec les mêmes réglages) ; l'alerte ne vaut que pour les captures planifiées, jamais pour une capture manuelle ou d'alerte.
- L'onglet **Captures** affiche sur chaque capture comparée un repère « Δ n % », et la visionneuse un bouton **Différence** (image des zones modifiées). Les images de différence suivent la rétention de leur capture.
- Comparer coûte quelques secondes de plus que la capture seule (décodage et comparaison dans Chrome) ; seul un site qui active l'option les paie.

Chaque capture lance un navigateur neuf avec un profil jetable, puis le détruit : pas de cookies qui s'accumulent, pas de processus orphelin. Les fenêtres `alert()` sont ignorées. **La page est réellement exécutée** (JavaScript compris) : si un site est piraté, son code malveillant s'exécute dans ce navigateur. Il tourne dans le conteneur, sous un utilisateur sans privilèges, et ne conserve rien après la capture. Dans Docker, le bac à sable interne de Chrome est désactivé (`--no-sandbox`, impossible sans privilèges) : l'isolation est celle du conteneur. Si ce risque ne vous convient pas, désactivez les captures site par site (*Modifier › Capture d'écran*).

## Groupes de sites

La liste des sites peut être organisée en **groupes nommés et colorés** (par client, par projet, par environnement…), réorganisables à volonté (voir le [tableau de bord](#suricateweb) en haut de cette page).

- **Glisser-déposer** : attrapez la poignée ⠿ à gauche d'un site pour le déplacer dans son groupe, vers un autre groupe (même vide ou replié) ou vers « Sans groupe » ; attrapez celle d'un groupe pour changer l'ordre des groupes. Une ligne bleue indique où le site va tomber.
- **Au clavier** : placez le focus sur une poignée, puis **↑ / ↓** pour déplacer d'un cran. Un site franchit la frontière du groupe voisin ; le focus le suit et un lecteur d'écran annonce « position 2 sur 3, groupe Clients ».
- **Chaque en-tête de groupe** affiche le nombre de sites et l'état le plus grave (« 2 en alerte », « Intact »), se replie d'un clic (état mémorisé), et propose `+` (ajouter un site dans ce groupe), ✎ (renommer, changer la couleur) et 🗑 (supprimer). Ces trois actions apparaissent au survol, et en permanence sur écran tactile.
- **Supprimer un groupe ne supprime jamais ses sites** : ils passent dans « Sans groupe », à la suite et dans leur ordre.
- Le champ **Groupe** du formulaire d'un site permet aussi de classer (et de créer un groupe à la volée) : c'est l'alternative sur écran tactile, où le glisser-déposer natif n'existe pas.
- La vue **Par état** (bouton en haut de la liste) remet la liste à plat, sites en alerte en premier, avec le groupe de chaque site en pastille. Le choix est mémorisé dans le navigateur.
- Pendant une **recherche ou un filtre** (état, étiquette), la réorganisation est désactivée (des sites sont cachés : le résultat serait ambigu) et les groupes repliés se déplient pour ne rien cacher.
- Chaque déplacement est appliqué tout de suite à l'écran, puis enregistré **en une seule transaction** côté serveur (tout ou rien) ; en cas d'échec, l'état réel est rechargé.
- L'**export / import** conserve les groupes (par leur nom, couleur comprise) ; un groupe existant du même nom est réutilisé. Un ancien export sans groupes s'importe comme avant.

## Ce qui est surveillé

**Contenu du site**

| Signal | Détecte |
|---|---|
| Contenu de la page | Modification du texte ; **remplacement total** (similarité < 25 %) classé critique ; page quasi vide |
| Mots-clés suspects | « hacked by », pages par défaut nginx/Apache, « domaine à vendre », compte suspendu, spam pharmaceutique/casino… (liste modifiable) |
| Textes obligatoires / interdits | Vos propres mots-clés par site |
| Titre | Changement de `<title>` |
| Scripts | Nouveau fichier JS (externe = critique) ; JS obfusqué (`eval(atob…)`, packers…) |
| Liens, iframes, formulaires | Iframe externe injectée, formulaire détourné vers un autre domaine, `meta refresh`, nouveaux domaines liés (spam SEO) |

**Redirections** — redirection vers un autre domaine, retour en HTTP non chiffré, changement du logiciel serveur.

**Certificat TLS** — invalide, expiré, expiration proche, changement d'émetteur (critique) ou simple renouvellement (info).

Chaque version du contenu est conservée (les 300 dernières par site) et comparable à la précédente dans l'onglet **Modifications**.

### Disponibilité (type UptimeRobot)

Un site est **en panne** s'il ne répond pas ou renvoie une vraie erreur HTTP (5xx, 404…). Les accès restreints (401, 403, 429) comptent comme « joignable ». La panne est **confirmée** après N échecs consécutifs (2 par défaut, réglable) pour éviter les fausses alertes, mais elle est **datée du premier échec**.

- **Disponibilité sur 24 h, 7, 30 et 90 jours**, calculée **en temps** à partir de la durée réelle des pannes : elle reste exacte quelle que soit la fréquence de contrôle (de 1 minute à 24 heures).
- **Frise de 90 jours** (une barre par jour : vert, ambre, rouge) et **historique des pannes** (début, fin, durée, cause).
- **Temps de réponse** moyen / min / max sur 24 h, 7, 30 et 90 jours.
- Alerte « Site inaccessible », puis « ✅ Le site est de nouveau accessible — indisponible pendant 12 min ».
- Mettre un site en pause clôt une panne en cours : la pause ne compte pas comme indisponibilité.

Les agrégats journaliers sont conservés ~13 mois ; seul le détail des contrôles est purgé (10 000 derniers par site).

### Détournement de domaine, transfert et DNS

Onglet **Domaine & DNS** de chaque site, ou type **Domaine seul** pour un nom sans site web (messagerie, nom réservé) : aucune requête HTTP, uniquement DNS et registre.

| Signal | Sévérité | Pourquoi c'est un signe de détournement |
|---|---|---|
| Serveurs de noms (NS) changés | critique | Le plus classique : le pirate délègue la zone à ses propres serveurs |
| **Délégation au registre** changée (RDAP) | critique | La source officielle : change immédiatement, sans cache DNS |
| **Registrar** changé / transfert enregistré | critique | Le domaine a quitté votre registrar |
| Statut **« pending transfer »**, « hold », « redemption », « pending delete » | critique | Transfert en cours, domaine suspendu ou en cours de suppression |
| **DNSSEC désactivé** | critique | Retiré lors de nombreux détournements de zone |
| Verrou anti-transfert retiré | attention | Préalable à un transfert non autorisé |
| Résolveurs publics en désaccord (Cloudflare, Google, Quad9) | attention | Propagation d'un changement, ou détournement / cache empoisonné |
| MX, SPF, DMARC changés | attention | Interception ou usurpation des e-mails |
| CNAME, CAA changés | attention | Redirection du site ; autorisation d'un autre émetteur de certificats |
| Adresse IP : plage jamais vue | attention | Nouvel hébergeur (les rotations de CDN sont ignorées) |
| Échéance du domaine < 30 j, puis < 7 j | attention / critique | Expiration = perte du domaine |
| Date de dernière modification au registre | info | Pour l'historique |

Le registre est interrogé **toutes les heures** (une seule requête par domaine, même si plusieurs sites le partagent) ; le DNS à chaque contrôle.

> Le détournement DNS d'un domaine dont les NS restent les mêmes mais dont les enregistrements A sont modifiés chez l'hébergeur DNS est détecté par le changement de plage d'IP et le changement de CNAME, pas par les NS.

Deux familles d'alertes : les **incidents** (état anormal persistant : une alerte à l'apparition, un message « ✅ Rétabli » à la disparition, jamais de répétition) et les **évènements** (changement ponctuel : la nouvelle valeur devient la référence).

Le premier contrôle établit la référence et ne déclenche aucune alerte de changement.

## Plusieurs pages par site

Une défiguration touche souvent la page d'accueil, mais les pirates visent aussi le **panier**, le **paiement**, la **connexion** et le **contact** : c'est là que se volent les cartes bancaires et les mots de passe. Dans *Modifier › Pages supplémentaires*, listez ces pages, une par ligne :

```
/panier | Panier
/commande
/mon-compte | Connexion
https://boutique.exemple.fr/contact | Contact
```

Un chemin ou une adresse **du même domaine** (sous-domaines compris), un nom facultatif après « | », **10 pages au plus**. Une adresse d'un autre domaine est refusée.

Chaque page est contrôlée en même temps que le site, avec ses réglages (délai, en-têtes personnalisés, mots-clés interdits) :

| Signal | Alerte |
|---|---|
| **Texte suspect** (« hacked by », spam…) | **critique**, tant qu'il est présent ; une alerte de plus s'il y en a davantage |
| **Nouveau script** chargé par la page, **script suspect** (obfusqué, redirection) | critique pour un script externe, avertissement sinon |
| **Iframe externe**, **formulaire qui envoie vers un autre domaine**, redirection `<meta refresh>` | **critique** |
| **Titre** modifié | avertissement |
| **Page inaccessible** (erreur HTTP, délai) | avertissement, après le nombre d'échecs réglé pour le site (2 par défaut) |

- Les alertes portent le nom de la page : « Nouveau script externe chargé par la page — page « Panier » ».
- **Le premier passage sur une page pose sa référence** sans alerter, comme pour le site : seuls les changements ensuite sont signalés.
- **Pas de comparaison du texte** : un panier ou un espace client change à chaque visite. Seuls les signaux ci-dessus comptent.
- **Une panne d'une page ne compte pas dans la disponibilité du site**, et pas de capture d'écran pour ces pages.
- Un échec isolé ne « rétablit » pas un texte suspect déjà signalé. Retirer une page de la liste efface ses alertes sans message.
- L'onglet *Aperçu* du site affiche la carte **Pages surveillées** (état, code, temps de réponse, dernier contrôle).

## Rapport mensuel et page de statut

### Rapport mensuel client

Le bouton **Rapport** d'un site ouvre dans un nouvel onglet un document HTML prêt à envoyer à votre client : **Imprimer / PDF** l'enregistre au format PDF depuis le navigateur. Un bouton du même nom dans l'en-tête d'un **groupe** produit le rapport de **tous ses sites** (un groupe par client) : une synthèse, puis un chapitre par site.

Par défaut, c'est le **dernier mois entier** ; les boutons *Mois précédent* et *Mois suivant* parcourent les autres (`/api/watches/12/report?month=2026-10`). Il contient :

- **Disponibilité** du mois, indisponibilité cumulée, nombre de pannes et la plus longue, temps de réponse moyen, frise jour par jour et tableau des pannes (durées bornées au mois). Les maintenances planifiées sont listées et ne comptent pas comme des pannes.
- **Incidents détectés** : le nombre et les titres des alertes critiques et d'avertissement du mois, sans leur détail technique.
- **Échéances** : certificat TLS et nom de domaine.


### Page de statut publique

*Modifier › Page de statut publique* publie une page **en lecture seule**, à l'adresse `/status/<jeton>` (la base est l'adresse de SuricateWeb réglée dans *Réglages*, sinon celle du navigateur). Le jeton est aléatoire ; **Nouvelle adresse** en génère un autre et l'ancien cesse aussitôt de fonctionner.

Elle montre l'état actuel (tout fonctionne, panne en cours, maintenance, en pause), la disponibilité sur 24 h, 7, 30 et 90 jours, la frise de 90 jours, les maintenances et les pannes des 90 derniers jours ; elle se rafraîchit toute seule. **Elle ne montre jamais** d'alerte de sécurité, de cause technique, de version ni de réglage. Rapport et page de statut reprennent la **charte de l'application** (logo, polices, verre dépoli, clair / sombre selon le système ou le choix fait dans l'application) : ils chargent la feuille de style, les polices et le logo du même site, la politique de sécurité du contenu n'autorisant rien d'externe. Pas de connexion requise : toute personne qui connaît l'adresse la voit. La page est exclue des moteurs de recherche, ses requêtes sont limitées par adresse (120 par minute) et un jeton inconnu ou une page coupée répondent de la même façon (404).

## Réduire le bruit

- **Sélecteur CSS** (`main`, `#contenu`, `.article > p`) pour ne comparer qu'une zone ; **exclusion** (`.horloge, .pub`).
- **Expressions régulières** pour ignorer des lignes (compteurs, dates).
- **Seuil de modification** (%) et **niveau minimal de notification** (global ou par site).
- Désactivez individuellement chaque famille de contrôle sur un site donné.

## Fenêtres de maintenance

Mettre à jour un site, changer d'hébergeur ou renouveler un certificat provoque des pannes, des changements de contenu et des alertes critiques que vous causez vous-même. À force, on cesse de les lire. Une **fenêtre de maintenance** retient les alertes du site pendant l'intervention, puis reprend toute seule.

![Page d'un site avec une maintenance en cours et une maintenance prévue](docs/screenshots/maintenance.png)

### Planifier

Sur la page d'un site, le bouton **Maintenance** ouvre un dialogue :

<img src="docs/screenshots/maintenance-dialogue.png" alt="Dialogue de planification d'une maintenance : début, durée et note" width="420">

- **Commencer** : maintenant, ou à une date et une heure précises (jusqu'à 90 jours à l'avance) ;
- **Durée** : de 30 minutes à 3 jours (l'API accepte de 5 minutes à 7 jours) ;
- **Note** facultative (« Mise à jour du thème »).

Une fenêtre en cours ou prévue s'affiche en bandeau bleu en haut de la page du site, avec **Terminer maintenant** (la surveillance reprend aussitôt, par un contrôle immédiat) ou **Annuler** (fenêtre à venir). Dans la liste des sites, une icône « clé à molette » signale les sites en maintenance ; son infobulle donne l'heure de fin. Une fenêtre ne concerne qu'**un site** : pour un serveur qui en héberge plusieurs, planifiez chacun.

### Ce qui se passe pendant la fenêtre

- **SuricateWeb continue de contrôler le site** : les mesures et les captures restent enregistrées, rien n'est perdu.
- **Les alertes sont retenues** : elles apparaissent dans le journal avec la mention *Retenue (maintenance)*, déjà lues, et **ne partent pas sur Telegram**.
- **Aucune panne n'est comptée** : un site coupé pendant l'intervention n'ouvre pas de panne et ne baisse pas la disponibilité. Les échecs de la fenêtre ne s'accumulent pas : si le site est encore coupé à la reprise, la panne est datée du premier échec **après** la fenêtre.
- **Un état anormal apparu pendant la fenêtre** (texte de piratage, certificat invalide…) est annoncé à la reprise s'il est toujours là. S'il a disparu entre-temps, il n'y a pas de message « rétabli » : personne n'avait été prévenu.

### À la reprise : un seul récapitulatif

Si des alertes d'avertissement ou critiques ont été retenues, SuricateWeb envoie **un seul message** « Fin de la maintenance : N alertes retenues pendant la fenêtre », qui les liste et prend la gravité la plus haute. Les simples informations n'en déclenchent pas. Quand un contrôle a eu lieu pendant la fenêtre, le suivant est programmé juste après sa fin, pour que ce message n'attende pas l'intervalle normal.

**Maintenance ou pause ?** La pause arrête tout contrôle, donc toute alerte, jusqu'à ce que vous la leviez : si vous l'oubliez, le site n'est plus surveillé. La maintenance continue de mesurer, garde la trace de ce qui s'est passé, et se termine à l'heure prévue.

> **À savoir** : un changement ponctuel survenu pendant la fenêtre (contenu remplacé, script ajouté) ne vous est signalé qu'à la fin, dans le récapitulatif. Pour une intervention à risque, gardez la fenêtre courte et ouvrez le journal des alertes avant de la terminer.

## Langues

L'interface existe en **français** (par défaut, quelle que soit la langue du navigateur) et en **anglais**. Le sélecteur de langue est dans la barre latérale et sur l'écran de connexion ; le choix est retenu dans le navigateur, et `?lang=en` dans une adresse l'impose (lien partageable). Changer de langue recharge la page.

**Ce qui est traduit** : l'interface (tableau de bord, détail d'un site, alertes, réglages, formulaires, connexion), les dates, nombres et unités, mais aussi ce que le **serveur** produit pour un compte : alertes détectées, messages et boutons Telegram, rapports mensuels, page de statut publique. Ces textes suivent le réglage **langue du compte** (enregistré quand on change la langue dans l'interface). `?lang=en` dans l'adresse d'un rapport ou d'une page de statut impose la langue de cette page (un client peut lire une autre langue que le titulaire). Les alertes déjà enregistrées gardent la langue dans laquelle elles ont été détectées. **Pas encore traduits** : une partie des messages d'erreur de l'API (« Accès refusé »…), et, dans la version hébergée, les e-mails et les pages du compte.

**Ajouter une langue** (ex. `es`) :
1. Dans `public/i18n.js` (`LANGS`, `LOCALES`) et `src/i18n.js` (`LOCALES`), ajouter la langue.
2. Deux dictionnaires à créer : `node scripts/i18n-missing.js es > public/locales/es.json` (interface) et `node scripts/i18n-missing.js es serveur > src/locales/es.json` (serveur). Chacun produit le squelette `{ "texte français": "" }` à compléter.
3. Ajouter `/locales/es.json` à la coque de `public/sw.js` et incrémenter son numéro de cache.
4. `node --disable-warning=ExperimentalWarning --test test/i18n.test.js test/i18n-server.test.js` : vérifie que tous les textes sont traduits, qu'aucun n'est resté sans objet et que les `{paramètres}` sont identiques au français.

**Écrire du code** : côté interface comme côté serveur (`src/i18n.js`), un texte s'écrit `tr('Texte français')`, avec des paramètres `{nom}` : `tr('Depuis {when}', { when })`. Le français est la clé, donc un texte sans traduction s'affiche en français, jamais vide. Les pluriels passent par `plural(n, tr('site'), tr('sites'))` (règle de la langue : en français 0 est au singulier, en anglais au pluriel). Ne jamais comparer une valeur à un texte traduit : comparer des codes. Côté serveur, la langue n'est pas passée de fonction en fonction : elle suit le contexte (`runWithLang(langue, () => …)`), déjà posé autour d'un contrôle de site, d'une requête de l'API, d'une page de rapport ou de statut et d'un clic sur un bouton Telegram. Une constante de module ne doit donc pas contenir de `tr()` (évaluée au chargement, donc en français) : en faire une fonction.

## Limites à connaître

- **La comparaison de contenu lit le HTML tel que le serveur le renvoie**, sans l'exécuter. Le contenu généré uniquement par JavaScript (SPA) n'est pas comparé (la capture d'écran, elle, l'affiche), mais DNS, TLS, RDAP, redirections et scripts restent surveillés.
- **Le cloaking** (un site piraté qui montre une page saine aux robots) peut passer entre les mailles ; changez le User-Agent par site si vous le suspectez.
- **RDAP** dépend du registre de l'extension ; certains (dont `.fr`) n'exposent pas le verrou de transfert : l'interface l'indique plutôt que d'afficher « absent ».
- **La disponibilité est mesurée depuis votre serveur SuricateWeb.** Une panne réseau de ce serveur peut apparaître comme une panne du site, et un site injoignable seulement depuis certains pays n'est pas vu. Pour plus de fiabilité, hébergez SuricateWeb ailleurs que les sites surveillés.
- **Pas de rétroactivité** : la disponibilité n'est calculée qu'à partir de l'installation de cette fonction ; avant, les sites sont considérés disponibles.
- Les résolveurs publics (1.1.1.1, 8.8.8.8, 9.9.9.9) doivent être joignables en UDP/53 depuis le serveur ; sinon la cohérence entre résolveurs est simplement ignorée.
- **Les pages supplémentaires ne sont pas comparées en texte**, et ne comptent ni dans la disponibilité ni dans les captures d'écran.
- Les adresses IP derrière un CDN tournent : SuricateWeb ne signale un changement d'IP que si **aucune** plage déjà vue n'est reconnue.

## Architecture

```
server.js            point d'entrée : environnement, createApp(), écoute, tâches de fond, arrêt propre
src/app.js           createApp(options) : routeur, pipeline des requêtes (authentification, droits, CSRF), points d'extension
src/routes/          les routes de l'API, un module par thème (sites, suivi, captures, rapports, groupes, alertes, réglages…)
src/http.js          erreurs HTTP, réponses JSON / HTML, lecture du corps
src/auth-env.js      fournisseur d'authentification par défaut : un compte, identifiants du .env, cookie signé
src/notify.js        canaux de notification (Telegram par défaut) ; src/extensions.js : notifications, planificateur et garde réseau remplaçables
src/net-guard.js     garde réseau (SSRF) : adresses privées refusées, adresse vérifiée à la connexion, client HTTP qui l'applique
src/checker.js       un contrôle : HTTP → pannes → contenu → DNS/TLS/RDAP → incidents/évènements → alertes
src/html.js          parseur HTML tolérant + sélecteurs CSS + extraction des signaux
src/diff.js          diff ligne à ligne (LCS)
src/telegram.js      API Bot Telegram (texte, photo, boutons) + mise en forme des messages
src/telegram-poll.js réception des clics sur les boutons (interrogation régulière de Telegram)
src/screenshot.js    captures d'écran : Chrome piloté par DevTools (WebSocket natif), file d'attente, rétention
src/auth.js          identifiants lus dans l'environnement, comparaison en temps constant, clé de session
src/env.js           chargement du .env (avant l'ouverture de la base)
src/scheduler.js     planificateur (5 contrôles en parallèle)
src/pages.js         pages supplémentaires d'un site : adresse résolue (même domaine) et nom affiché
src/report.js        rapport mensuel (par site ou groupe) et page de statut publique : calculs et mise en page HTML
src/scoped.js        accès aux données limité à un compte (ctx.data) : c'est par là que les routes lisent et écrivent
                     (réglages : db.js, deux niveaux — installation et compte)
src/db.js            sites, groupes, contrôles, versions (gzip), alertes, réglages : tout le SQL de l'application, en SQL portable, fonctions asynchrones
src/store/sqlite.js  adaptateur de base (SQLite) : la seule porte d'accès à la base, même contrat pour tout moteur
src/store/migrate.js migrations de schéma numérotées (src/store/migrations/), une version par moteur (SQLite, PostgreSQL)
src/store/registry.js moteur de base remplaçable avant le premier import de db.js (+ migrations supplémentaires)
public/              interface (JS/CSS vanilla, sans build)
public/report.js     bouton « Imprimer / PDF » du rapport (sans script en ligne)
public/layout.js     organisation en groupes : calcul pur (déplacements, pas au clavier), sans DOM, testé unitairement
src/i18n.js          traduction des textes du serveur (alertes, Telegram, rapports) : même principe, langue portée par le contexte asynchrone
src/locales/         dictionnaires du serveur (en.json)
public/i18n.js       traduction de l'interface : tr('texte français'), langue choisie avant le démarrage de l'application
public/locales/      un dictionnaire JSON par langue (en.json) : { "texte français": "traduction" }
test/                node --test (unitaires, API réelle, et bout en bout dans un vrai Chrome)
test-support/        lancement d'un serveur de test et pilotage de Chrome (tests et captures)
scripts/docs/        mode démo : faux sites, données fictives, génération des captures de ce README
docs/couche-cloud.md référence pour construire une version hébergée (points d'extension, comptes, base, sécurité, limites)
docs/webhook-stripe.md guide pour créer le webhook Stripe (point de terminaison, route signée et idempotente, test local)
docs/screenshots/    images de ce README (régénérables avec npm run docs:screenshots)
```

```bash
npm test
```

Les tests lancent un faux site qu'ils « piratent » en direct et un faux serveur Telegram pour vérifier les messages réellement envoyés ; les tests d'interface s'exécutent dans un vrai Chrome (ils sont ignorés si aucun navigateur n'est installé).

Scripts disponibles : `npm start`, `npm run dev` (rechargement automatique), `npm test`, `npm run demo`, `npm run docs:screenshots`.

### Étendre SuricateWeb (version hébergée, intégrations)

> Référence complète, à l'usage de qui construit une couche hébergée sur SuricateWeb : **[docs/couche-cloud.md](docs/couche-cloud.md)** (assemblage, chaque point d'extension, données et comptes, base PostgreSQL, sécurité, limites connues, travail restant).

Le serveur s'assemble avec `createApp(options)` (`src/app.js`). Sans option, c'est l'installation classique : un compte, les identifiants du `.env`, aucune limite. Une version qui embarque SuricateWeb (comptes multiples, forfaits…) fournit ses propres extensions :

| Option | Rôle |
|---|---|
| `auth` | qui est l'utilisateur et son compte pour chaque requête (`ctx.user`, `ctx.account`) ; déclare ses routes de connexion |
| `authorize(ctx, action, ressource)` | droit d'agir ; chaque route du cœur déclare son action (`site:read`, `site:create`, `settings:write`…) |
| `entitlements` | `check(ctx, action)` refuse (HttpError 402…) au-delà du forfait ; `limits(ctx)` plafonne (ex. intervalle minimal) |
| `routes` | routes supplémentaires, publiques ou protégées par une permission |
| `hooks` | `onWatchCreated`, `onWatchUpdated`, `onWatchDeleted`, `onStart`, `onStop` (une erreur y est journalisée, jamais renvoyée) |
| `notifier` | canaux de notification d'une alerte (`src/notify.js`) : Telegram par défaut, d'autres sur demande |
| `scheduler` | quels sites contrôler à chaque passage, et la concurrence |
| `capabilities` | ce que `GET /api/capabilities` annonce à l'interface |
| `extension` | crochets d'une fonction métier ajoutée (config d'un site, incidents, rapport, routes, tâches de fond, module d'interface) : voir `src/extension.js` ; aucune par défaut |

**Comptes.** Chaque site et chaque groupe appartient à un compte (colonne `account_id`) ; le cœur n'en a qu'un, le compte 1. Les routes n'accèdent aux données que par `ctx.data` (`src/scoped.js`) : un compte ne voit, ne modifie ni ne supprime que les siens, et une ressource d'un autre compte répond « introuvable » (404), jamais « interdit ». Le fournisseur `auth` doit donner un `account.id` entier ≥ 1. `test/account-isolation.test.js` essaie chaque route à paramètre avec les identifiants d'un autre compte, et échoue si une nouvelle route n'y est pas ajoutée.

**Réglages à deux niveaux.** Ceux de l'**installation** (secret de session, adresse publique, rétention des contrôles et des versions) et ceux du **compte** (Telegram, mots-clés, User-Agent, intervalle par défaut, délai d'alerte de l'extension, conservation des captures). Chaque contrôle, message utilise les réglages du compte propriétaire du site (`settingsFor(compte)`). Modifier l'adresse publique demande le droit `instance:write`, accordé par défaut. Le flux temps réel (`/api/events`) ne transmet à chaque utilisateur que les événements de son compte. Tests : `test/account-settings.test.js` et `test/account-isolation.test.js`.

**Garde réseau (SSRF).** SuricateWeb va chercher des adresses saisies par ses utilisateurs ; sans garde, l'une d'elles peut viser le réseau interne du serveur (service de métadonnées d'un hébergeur, base de données, panneau d'administration) et en révéler le contenu. `createApp({ netGuard })` ou `SURICATE_NET_GUARD=1` l'active : seules les adresses http(s) sur les ports autorisés (80, 443, 8080, 8443 par défaut), vers des adresses IP publiques, sont permises — pour les contrôles, chaque étape d'une redirection, les relevés de l'extension, le certificat TLS et les captures. L'adresse IP est vérifiée au moment même de la connexion (pas de « DNS rebinding »). Des exceptions explicites existent (`SURICATE_NET_ALLOW_HOSTS`). Elle est **inactive par défaut** : sur une installation personnelle, surveiller son propre réseau est légitime. Limite : Chrome résout les adresses lui-même ; ses requêtes sont interceptées une à une, mais pour une garantie complète il faut l'isoler dans un conteneur ou un réseau sans accès à l'interne. Voir `src/net-guard.js` et `test/net-guard.test.js`.

Le moteur de base se remplace avant le premier import de `src/db.js` (`configureStore` dans `src/store/registry.js`) : un adaptateur qui respecte le contrat de `src/store/sqlite.js`, vérifiable avec `test-support/adapter-contract.js`, et ses propres migrations. Les tests `test/app-extensions.test.js` illustrent chaque point d'extension.

## Nom du produit et migration depuis VigieWeb

Le produit s'appelle **SuricateWeb** ; il s'appelait VigieWeb. Les identifiants techniques ont été renommés avec lui. Une installation existante se met à jour en changeant ces noms, une seule fois :

| Avant | Maintenant | À faire |
|---|---|---|
| `VIGIE_USER`, `VIGIE_PASSWORD`, `VIGIE_DEMO`, `VIGIE_NET_GUARD`, `VIGIE_NET_ALLOW_PORTS`, `VIGIE_NET_ALLOW_HOSTS` | `SURICATE_USER`, `SURICATE_PASSWORD`, `SURICATE_DEMO`, `SURICATE_NET_GUARD`, `SURICATE_NET_ALLOW_PORTS`, `SURICATE_NET_ALLOW_HOSTS` | Renommer les variables dans le `.env` ou chez l'hébergeur (Dokploy, Docker) |
| `data/vigie.db` | `data/suricate.db` | Renommer le fichier **avant** de lancer la nouvelle version (avec `vigie.db-wal` et `vigie.db-shm` s'ils existent) ; sinon l'application refuse de démarrer, pour ne pas repartir d'une base vide |
| cookie `vigie_session`, clé `vigie-theme`, `vigie-view` | `suricate_session`, `suricate-theme`, `suricate-view` | Rien : chacun se reconnecte une fois et retrouve le thème par défaut |
| export `vigie-sites.json` | `suricate-sites.json` | Rien : seul le nom du fichier téléchargé change |

Les noms d'un volume Docker, d'un conteneur ou d'une image (`vigie-data`…) sont libres : gardez ceux que vous avez déjà. Dans les textes affichés (interface, messages Telegram, journaux, User-Agent), c'est « SuricateWeb » ; le User-Agent par défaut enregistré en base est migré automatiquement (migration v7), un User-Agent personnalisé n'est jamais modifié. Le dépôt GitHub est `arnaudroy-lab/SuricateWEB`. D'anciennes adresses du dépôt redirigent vers celle-ci.

## Sécurité

Une faille dans SuricateWeb touche potentiellement tous les sites qu'il surveille. Pour en signaler une, utilisez le signalement privé de GitHub (voir [SECURITY.md](SECURITY.md)) et non une issue publique.

## Licence

SuricateWeb est distribué sous licence **[GNU AGPL v3](LICENSE)** (AGPL-3.0) : usage, étude, modification et redistribution libres, y compris commerciaux, à condition de conserver la licence et l'avis de copyright ([NOTICE](NOTICE)) et de publier, sous la même licence, le code source de toute version modifiée que vous distribuez **ou que vous proposez à des utilisateurs à travers un réseau** (article 13 : une version modifiée exploitée comme service en ligne doit en offrir le code source). La licence comprend aussi une concession de brevets et exclut toute garantie. Le projet n'a aucune dépendance npm : aucun code tiers n'est embarqué.

### Licence et marque

- **Auto-hébergement** : le cœur est libre et gratuit (AGPL-3.0). Vous pouvez l'installer, l'étudier et le modifier. Si vous publiez ou exploitez en ligne une version **modifiée**, vous devez en publier le code source sous la même licence.
- **Version hébergée** : le service commercial proposé sur [suricateweb.fr](https://suricateweb.fr/) est un produit distinct, construit sur ce cœur, dont le code additionnel (comptes, forfaits, paiement) n'est pas publié.
- **Licence commerciale** : pour utiliser ou modifier le cœur sans les obligations de l'AGPL, contactez le titulaire du projet.
- **Marque** : « SuricateWeb » et son logo sont des marques de leur titulaire. La licence AGPL ne les concède pas : une version modifiée ou un service tiers doit porter un autre nom et ne pas laisser croire qu'il est proposé ou approuvé par le projet. Citer le nom pour désigner le logiciel d'origine reste libre.
- **Contribuer** : voir [CONTRIBUTING.md](CONTRIBUTING.md) (signature DCO et licence accordée au titulaire).

