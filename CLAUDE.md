# Kite App — vent AROME pour le kitesurf, Gironde et Landes

PWA mobile-first (iPhone en priorité, installée sur l'écran d'accueil) pour décider **où et quand aller naviguer**. Elle affiche la prévision de vent AROME 0,01° (~1,3 km) de Météo-France, de l'estuaire de la Gironde à Capbreton, loin au large et jusqu'aux portes de Bordeaux. Les spots viennent du tableau KitesurfBordeaux.

En ligne : https://simonlloos-prog.github.io/kite-app/ (GitHub Pages, dépôt public `simonlloos-prog/kite-app`).

## Phase actuelle : POC
Le code sert de **bac à sable** pour tester des variantes sur téléphone. Il doit rester propre et lisible, sans viser l'architecture définitive. L'app sera **refaite ensuite avec une structure pensée à l'avance** (voir « À faire »). Conséquences :
- Préférer une variante isolée (un fichier, une couche, un flag) à une abstraction générique.
- Garder à jour la section « Testé puis rejeté » ci-dessous : elle évite de refaire les mêmes essais.

## Choix métiers et logique
- **Lecture façon Meteociel** : l'utilisateur la juge plus claire que Windy pour voir d'un coup d'œil où et quand ça souffle. D'où :
  - des **zones de couleur nettes par paliers** de 2–3 kn ;
  - **une valeur par point de grille** ;
  - de **longues lignes de vent continues avec des flèches intégrées**.
  
  L'échelle est en bleus de plus en plus foncés jusqu'à 12 kn, puis vert, jaune, orange, rouge et violet.
- **Données AROME 0,01°**, le même modèle que l'« AROME 1.3 km » de Meteociel. Les fichiers GRIB open data de Météo-France sont préparés par un serveur (GitHub Actions) plutôt qu'appelés depuis le téléphone : il y a assez de points pour la pleine résolution, sans quota ni clé côté app. L'utilisateur accepte quelques minutes de préparation par run.
- **Fraîcheur** : un run AROME toutes les 3 h, publié 3 à 4 h après. Il sort échéance par échéance pendant environ 50 min, et Meteociel affiche les premières heures dès qu'elles existent (constaté le 9 nov. 2026). L'app **publie donc le run au fil des échéances** dès que +3 h est sorti (les précédentes sont déjà passées quand le run sort) ; au-delà, chaque heure garde le fichier du run précédent jusqu'à l'arrivée du nouveau, et la légende ajoute « en cours (jusqu'à +N h) » (`runThrough`). Sur le run de 13 h du 9 nov., le bucket open data a reçu tout le run d'un bloc 1 h 07 après l'API Paquet AROME ; sur le run de 16 h, seulement 2 min après : l'API n'a pas été branchée. La légende affiche le run en heure de Paris (« run dim. 16 h » = 15 UTC). Au-delà de 8 h après l'heure du run, au moins un run plus récent manque : la légende ajoute « en retard (N h) » en orange (`staleHours`).
- **AROME-PI** (run horaire, environ 1 h de retard) ne donne que des **rafales** via l'API, pas de vent moyen : il n'est pas dessiné. Il sert d'**indicateur de tendance** : pour chaque spot, un badge « PI ↑ +3 / ↓ −2 / = » donne l'écart moyen des rafales AROME-PI − AROME sur les heures communes (+1 à +6 h), avec un seuil de 1,5 kn. Le badge **ne dépend pas de l'heure choisie**. Le point touché affiche aussi « raf. 18 (PI 18) ».
- **Vent mesuré** : stations Météo-France (API DPObs) au Cap Ferret, à Cazaux, Biscarrosse, Vendays-Montalivet, Royan et Capbreton, dernier relevé de 6 min (environ 10 min de retard) ; les balises Holfuy du CVA, des Arbousiers, de La Hume (APCK) et de La Jenny (pour Le Porge et Le Grand Crohot) ; les stations Weameter d'Andernos (pour Claouey, l'Aérium, Le Betey et Taussat) et de Lachanau (pour Lachanau et Hourtin Port). Holfuy et Weameter : accord des propriétaires (nov. 2026), moyenne et rafale max sur 10 min. La source s'affiche avec la mesure (`source`). Les autres stations de la zone sont dans les terres, ou sans anémomètre (Lacanau, Soorts-Hossegor). Les rafales sont rarement fournies. Sur la carte (`obsMarkers.ts`, marqueurs HTML pour l'animation CSS) : une **hélice à 4 pales fines en croissant** (forme choisie par l'utilisateur parmi trois variantes, nov. 2026) **à la couleur de l'échelle du vent** (une balise à 18 kn a la couleur d'une zone prévue à 18 kn), contour blanc dessiné une seule fois sous les pales (un contour par pale traçait des traits blancs entre elles), **qui tourne plus vite quand le vent forcit** (`spinSeconds` : un tour en 8 s jusqu'à 2,5 kn, 5 s à 4 kn, 2 s à 10 kn, 1 s à 20 kn, 0,75 s dès 27 kn ; immobile sous 1 kn ou si le téléphone coupe les animations ; ralenti deux fois après essai, ça tournait trop vite par vent faible). Chaque partie est un bloc : dans un `<span>` resté en ligne, l'hélice « tournait » sans bouger (vérifier l'angle mesuré, pas seulement que l'animation est active). La direction est une **flèche en pointe, sombre à liseré blanc, fixe au centre** de l'hélice (forme donnée par l'utilisateur ; à l'extérieur, du côté où va le vent, elle se voyait mal, et dans une pastille blanche elle était trop grosse), et la valeur est **à gauche** (à droite, elle chevauchait le nom du spot voisin) ; idée de l'utilisateur, dans l'esprit de Winds-Up sans en reprendre l'icône. Bouton ◉ « Balises » pour les masquer (`layers.obs`). **Sur une autre heure que maintenant**, elles restent visibles mais **grisées, plus petites, immobiles et sans flèche** (idée de l'utilisateur : elles ont l'air éteintes), avec l'heure de la mesure, et la légende le dit (« balises grisées : vent mesuré maintenant ») ; en toucher une ramène à maintenant (`obsLive`). Avant, elles disparaissaient hors de l'heure actuelle, ce qui déroutait. Une balise posée sur un spot cache le point de note du spot (la note reste dans la liste). Toucher une station ajoute une ligne « Mesuré : 3 kn E à 16 h 36 · Météo-France » au module de temps. Dans la liste, sur l'heure actuelle seulement, un spot affiche la station la plus proche à moins de 10 km (`nearestObs` ; La Hume est à 11 km du Cap Ferret, de l'autre côté du Bassin). Un relevé de plus de 75 min est ignoré (`freshObs`). Les mesures viennent **en direct du Worker Cloudflare** (voir l'architecture), redemandé toutes les 2 min tant que l'app est ouverte ; la copie de `meta.json` sert de repli (`mergeObs` garde le relevé le plus récent de chaque station). L'app relit `meta.json` toutes les 10 min. Crédit « Stations : Météo-France · Balises : Holfuy (CVA, APCK, La Jenny) · Andernos, Lachanau : Weameter » dans ⓘ.
- **Marée du Bassin** : le Bassin d'Arcachon montre **ce qui découvre à l'heure choisie** (bancs et crassats en **sable hachuré**, chenaux en couleur ; une ligne « à sec dans le Bassin (marée) » dans la légende le dit. Un gris uni se lisait comme une couleur de vent de plus), et l'état de la marée s'affiche sous l'heure (« marée basse ↓ », « mi-marée ↑ »…). La hauteur d'eau vient d'**api-maree.fr** à Arcachon (Jetée d'Eyrac) (clé `API_MAREE_KEY`, CC BY : calcul harmonique à partir des composantes Ifremer / PREVIMER, recalées sur le marégraphe REFMAR), **moins la moyenne de la série** : c'est le niveau au-dessus du niveau moyen (NM), quel que soit le zéro. Comparée au SHOM à Eyrac (7-8 nov. 2026) : pleines et basses mers 10 à 17 min en avance, mêmes coefficients. Open-Meteo Marine, au large du Cap Ferret, n'est plus qu'un secours : il était 1 h 20 à 1 h 40 en avance. Les prédictions du SHOM (maree.info) ne sont pas réutilisables librement dans une appli publique. Le relief vient du Shom (MNT HOMONIM 20 m, référence NM, Licence Ouverte). Une case est sèche quand le sol est au-dessus de l'eau (`isobands` au niveau d'eau, mémorisé au centimètre). Le grisé est limité au Bassin à l'est d'une ligne Bélisaire – Jetée Thiers (les passes et Les Arbousiers se naviguent à marée basse). « Marée basse / mi-marée / haute » = place de l'heure entre basse mer (0) et pleine mer (1) sur ±6 h (`tideByTime`, seuil `LOW_TIDE` = 1/3). Crédits dans ⓘ : la mention et l'avertissement d'api-maree.fr sont **obligatoires** (ses CGU), plus Open-Meteo (secours) et Shom.
- **Unités** : tout est calculé en **nœuds**. Le bouton kn ↔ km/h ne convertit que l'affichage (`fmtSpeed`) ; Meteociel affiche en km/h. Le choix est mémorisé (`localStorage`, `kite-prefs`).
- **Direction** : on parle d'où vient le vent (convention météo), et les flèches pointent là où il va.
- **Spots** (`spots/spots.ts`) : les spots du tableau « Trouve ton spot autour de Bordeaux » (KitesurfBordeaux.com, 2018), avec quelques ajustements :
  - Lacanau Sud et Super Sud sont fusionnés en **Lacanau Océan** ;
  - l'**Aérium** (à la place d'Arès), **Taussat** et **Soulac** sont ajoutés, avec des orientations devinées et marquées « à vérifier » ;
  - le **Cercle Voile Arcachon** (CVA) est ajouté depuis windspot.fr (toute marée, déconseillé l'été à cause des baigneurs) ;
  - **Les Aigrettes** (lac de Cazaux, « Interdit ») est retiré ;
  - les orientations de **Soulac** ont été confirmées par l'utilisateur (nov. 2026), et l'Ouest est en bonne direction à Soulac, La Salie et Biscarrosse (dit par l'utilisateur).

  Chaque spot a ses directions 🤙 bonnes (`good`), 👍 moyennes (`ok`) et ⚠ **offshore** (`offshore`) sur 8 directions, son niveau et ses restrictions (« Interdit l'été »…). Toutes les positions ont été données par l'utilisateur. **Les orientations viennent de windspot.fr (2026)** pour les 18 spots qu'il décrit (idéal = `good`, navigable = `ok`, offshore), relevées sur sa rose des vents. Elles remplacent celles du tableau de 2018. Lacanau Océan et Le Porge marchent comme Le Grand Crohot (dit par l'utilisateur) et en prennent les orientations. Les autres plages océanes qu'il n'a pas (Soulac, La Lagune, La Salie, Biscarrosse) gardent les directions du tableau et prennent les secteurs offshore du Grand Crohot (NE, E, SE, S), sur la même côte rectiligne.
- **Note d'un spot** (`spots/rating.ts`) :
  - **Direction** : bonne, moyenne (un cran de moins), offshore ou défavorable. Chacune des 8 directions couvre ±22,5°. **Offshore** (vent de terre, qui emporte vers le large) : dès 12 kn, le spot est noté « Offshore ⚠ dangereux », avec un point **rouge** sur la carte et dans la liste. En dessous, il reste « Trop faible ». Exception, sur les plages océanes seulement : le vent de Sud longe la côte. De 195° à 202,5°, il est traité comme du SO (bon) ; de 180° à 195°, le spot est noté « Side-off, prudence » (orange, note 1 ; limites données par l'utilisateur, nov. 2026). Sous 180° il reste rouge, et de 180° à 195° au-delà de 32 kn aussi.
  - **Force** : sous 12 kn trop faible, 12–15 léger, 15–25 bon, 25–32 fort, au-delà trop fort.
  - **Marée** (`tide` dans `spots.ts`) : un spot du Bassin ne se navigue en kite qu'à ±N h de la pleine mer (Claouey, l'Aérium, Le Betey, Taussat, La Hume : ±3 h ; windspot.fr donnait ±2 h sauf à La Hume, élargi par l'utilisateur en nov. 2026 car le spot était gris même à mi-marée). Hors créneau, un vent bon devient « Marée trop basse » (note 0). Un vent trop faible ou défavorable garde son propre libellé. Les Arbousiers, le CVA, Bonne Anse, La Chambrette et Le Grand Crohot se naviguent à toute marée, et les lacs n'en ont pas. L'heure de pleine mer vient de la série de marée au large du Cap Ferret (sommet d'une parabole sur 3 heures, `highWaters`). Au fond du Bassin, la pleine mer arrive un peu plus tard (à vérifier sur le terrain).
  - **Interdictions** (`ban` dans `spots.ts`) : aux dates et heures connues exactement (La Hume, Mayotte, Navarrosse, Arbousiers), le spot est gris et noté « Interdit (saison) », quel que soit le vent. Un « l'été » sans dates reste du texte dans `note`, sans effet sur la note.
  - **Dangers** (`danger`) : courant et obstacles, une ligne ⚠ dans la liste, sans effet sur la note. Dangers et règlements viennent de windspot.fr, reformulés, avec l'accord de son auteur (message Facebook à l'utilisateur, nov. 2026) ; crédit dans ⓘ. Toutes les plages océanes ont les dangers du Grand Crohot (dit par l'utilisateur). L'Aérium et Taussat sont autorisés l'été (dit par l'utilisateur, contre WindSpot).
  - **Tri** : la liste est triée par note, puis par force.
- **Zone** (`BOX`, 43,55–45,85 N, 2,00–0,60 O) : elle couvre tous les spots, avec du large pour voir le vent arriver. La carte est **bloquée sur cette zone** (`maxBounds`) pour qu'on ne dézoome jamais sur un bord sans données.
- **Changer d'heure doit rester le geste le plus simple** : un module flottant indépendant, qui ne s'ouvre pas, et qu'on swipe **vers la droite pour avancer**. Changer d'heure ne fait aucune requête : toutes les heures sont chargées en arrière-plan.

## Architecture
Les données vivent **hors de l'appli** (depuis le 7 nov. 2026) : une nouvelle donnée ne redéploie jamais l'appli.
```
Météo-France open data ──► pipeline/fetch_arome.py ───┐  (GitHub Actions, tâche « data »)
(GRIB2 AROME 0,01°, SP1)                              ├─► R2 kite-data ──► Worker kite-obs /data/… ──┐
API Météo-France ─────────► pipeline/fetch_aromepi.py ┤   meta.json + <run>_<grille>/hNN.bin         │
(WCS AROME-PI, clé)                                   │   + pi-<run>_<grille>.bin (gzip)             │
api-maree.fr (Eyrac) ─────► pipeline/fetch_tide.py ───┤   (marée dans meta.json)                     ├─► téléphone
API Météo-France (DPObs) ─► pipeline/fetch_obs.py ────┘   (stations : copie de repli)                │
Stations (Météo-France, Holfuy, Weameter) ──► Worker kite-obs /obs (direct, gardé 2 min) ────────────┤
Code de l'appli ──► GitHub Actions, tâche « app » (push seulement) ──► GitHub Pages ──────────────────┘
```
- **Stockage R2 `kite-data`** (compte Cloudflare de l'utilisateur ; R2 a demandé d'enregistrer un moyen de paiement, rien n'est facturé sous 10 Go et 1 M d'écritures/mois) : préfixe `data/`, mêmes noms que l'ancien `public/data/`. Fichiers d'heure et AROME-PI **compressés en gzip** au dépôt (`Content-Encoding: gzip`, ~20 Ko l'heure), `Cache-Control: immutable` (le nom porte le run) ; `meta.json` en `no-cache`, déposé **en dernier** (il pointe vers les autres). Règle de cycle de vie `old-runs` : effacement après 3 jours. Le workflow dépose par l'API S3 de R2 (`aws s3 cp`, jeton R2 « Object Read & Write » limité au bucket : secrets GitHub `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`).
- **Worker `kite-obs`** (`worker/index.ts`, https://kite-obs.kite-app.workers.dev, compte Cloudflare de l'utilisateur, offre gratuite) : sert `/data/<clé>` depuis R2 (liaison `DATA`, corps gzip renvoyé tel quel, `encodeBody: 'manual'`, CORS ouvert) et `/obs`. Pour `/obs`, il interroge les 12 stations à la demande et garde la réponse 2 min en mémoire (le Cache API ne marche pas sur `*.workers.dev`), les demandes simultanées partagent le même appel. Code des sources partagé avec l'app et testé : `src/lib/wind/obsSources.ts` (même règles que `fetch_obs.py`). Clé Météo-France en secret Cloudflare (`wrangler secret put`). Déploiement : `npm run worker:deploy` (voir `worker/README.md`). Les adresses sont dans `.env.production` (`VITE_OBS_URL`, `VITE_DATA_URL`) ; en dev, l'app lit `public/data/` (`npm run data`) et `.env.development.local` peut pointer `VITE_OBS_URL` sur `npm run worker:dev`. Toutes les URL sont publiques : la clé Météo-France reste dans le Worker. Quota gratuit : 100 000 requêtes/jour (~53 par ouverture d'appli après un nouveau run). Avant le Worker, les mesures passaient par `meta.json` et la republication du site tous les quarts d'heure : 10 à 35 min de retard (cache GitHub Pages de 10 min).
- **Source AROME** : `https://meteofrance-pnt.s3.rbx.io.cloud.ovh.net/pnt/<run>/arome/001/SP1/arome__001__SP1__<NN>H__<run>.grib2`. C'est le jeu de données data.gouv « Paquets Arome - Résolution 0,01° », en Licence Ouverte 2.0, sans clé. Il y a 52 échéances (0 à 51 h), environ 23 Mo par fichier. On utilise `10u`, `10v` et `max_10efg`/`max_10nfg` (rafale max de l'heure écoulée, absente à l'échéance 0).
- **Pipeline AROME** (Python, `eccodes` + `numpy`) : il prend le dernier run dont +3 h est sorti, ne télécharge que les échéances pas encore publiées (avec `--reuse-from … --meta-only`), découpe `BOX` (231 × 141 points) et écrit un fichier binaire par heure (~98 Ko, ~5 Mo par run). Le format, documenté en tête de `fetch_arome.py`, est `int8` u, `int8` v, `uint8` rafale, 0,5 kn par unité, ligne 0 au sud. **Les noms de fichiers portent une empreinte de la grille** (`data_folder`). Le téléphone garde les fichiers en cache indéfiniment, et republier un run sur une autre grille sous les mêmes noms avait servi d'anciens fichiers (« Fichier AROME inattendu »). L'app recharge aussi depuis le réseau un fichier de taille inattendue (`fetchBin`). Au-delà de ~3 fois la surface actuelle, il faudra découper en tuiles.
- **Pipeline AROME-PI** (`fetch_aromepi.py`) : `WIND_SPEED_GUST` à 10 m sur toute `BOX`, en 6 requêtes WCS GetCoverage en GRIB. La clé est le secret GitHub `METEOFRANCE_API_KEY`, ou `.env.local` en local (ignoré par git, jamais affiché). Sans clé, AROME-PI est absent. Si l'API échoue (panne de Météo-France, vue le 7 nov. 2026), le workflow garde l'AROME-PI déjà publié au lieu de l'effacer.
- **Pipeline marée** (`fetch_tide.py`) : hauteur horaire à Eyrac (`/water-levels`, api-maree.fr, quota 360 requêtes/h, mise en cache autorisée), sinon Open-Meteo, d'un jour avant le run à un jour après sa dernière heure, ajoutée à `meta.json` (`tide`, avec `source`). Clé : secret GitHub `API_MAREE_KEY`, ou `.env.local`. Sans réponse, le Bassin n'est jamais grisé.
- **Pipeline stations** (`fetch_obs.py`) : le dernier relevé de 6 min de chaque station (`STATIONS`), via l'API « Données Publiques Observation » (DPObs v1). **La même clé que pour AROME-PI** : une clé du portail Météo-France contient la liste des API abonnées au moment où elle est générée (c'est un JWT, champ `subscribedAPIs`). Après un nouvel abonnement, il faut regénérer la clé et la remplacer dans `.env.local` et dans le secret GitHub. Weameter (Andernos, Lachanau) : `weameter.com/stations/<station>/windrtv2.json`, sans clé, position relevée sur la page de la station, en nœuds (`Average["0"]` = 10 dernières minutes) ; le serveur ne répond qu'aux requêtes compressées (406 sinon). Holfuy : `holfuy.com/dynamic/graphs/tdarr<id>.js`, sans clé, le fichier des graphiques de la page de la balise (pas une API : il peut changer sans prévenir). ~5 jours, un relevé toutes les 2 min, **en km/h entiers** (la page affiche des nœuds convertis) et **en heure de Paris** (`paris_to_utc`, règle européenne, sans `tzdata` absent de Python sous Windows). On garde les 10 dernières minutes : vitesse moyenne, rafale max, direction moyenne pondérée. Ajouté à `meta.json` (`obs`). Une station sans vent ou en erreur est simplement absente.
- **Contour du Bassin** (`src/lib/map/bassin.json`, 25 Ko) : généré une fois par `node pipeline/bassin_water.mjs`, qui découpe l'eau des tuiles OpenFreeMap avec un masque dessiné à la main (milieu de la presqu'île du Cap Ferret, et au sud une ligne Bélisaire – Jetée Thiers). Il utilise `polygon-clipping` (dépendance de dev, seulement pour ce script).
- **Relief du Bassin** (`src/lib/map/bassin-depth.bin` + `.json`, 190 Ko, mis en cache hors ligne) : généré une fois par `node pipeline/bassin_depth.mjs <fichier .asc>` depuis le MNT Shom HOMONIM « NM » (archive 7z de 41 Mo sur data.gouv.fr, non versionnée). Pas de ~40 m, `int8` en décimètres au-dessus du NM, ligne 0 au sud, −128 hors du contour du Bassin.
- **Workflow** `.github/workflows/deploy.yml`, deux tâches : **data** (pipeline puis dépôt dans R2, à chaque lancement) et **app** (build + GitHub Pages, seulement sur push ou lancement manuel, après data). Il se lance à chaque push, par le Worker quand un run est attendu (voir plus bas) et par le planning GitHub, à des minutes décalées (`:07`, `:22`, `:37`, `:52`). GitHub retarde ou saute les tâches planifiées quand il est chargé, surtout à l'heure pile : avec un seul passage par heure, il n'y a eu que 3 lancements en 18 h et le site est resté bloqué sur un vieux run. Si le run AROME n'a pas changé, il ne réécrit que `meta.json` (`--reuse-from … --meta-only`) : les fichiers d'heure restent dans R2, sans retélécharger 1,2 Go. En mode planifié, il ne dépose rien si ni AROME ni AROME-PI n'ont changé (les stations n'en déclenchent pas : elles passent par le Worker). Un nouveau run prend environ 4 min, une mise à jour AROME-PI seule environ 1 min.
- **Réveil par le Worker** (depuis le 7 nov. 2026) : le planning GitHub ne donnait que 3 à 4 passages par jour malgré le cron au quart d'heure. Le Worker a une tâche planifiée toutes les 5 min (`worker/check.ts`, testée) : il lance le workflow (`POST …/actions/workflows/deploy.yml/dispatches` avec `{"ref":"main","inputs":{"scheduled":"true"}}`) seulement si un nouveau run AROME démarre (échéance +3 h présente sur le bucket Météo-France, requête HEAD), si le run publié n'est pas complet (`runThrough`, à chaque vérification de 5 min, jusqu'à 7 h après l'heure du run) ou si AROME-PI est attendu (100 min après le dernier publié ; il ne le vérifie pas lui-même : la liste des runs fait 2 Mo, trop pour les 10 ms de calcul gratuites). Pas deux lancements à moins de 10 min (15 min tant qu'AROME-PI tarde) ; heure du dernier lancement dans R2 (`state/last-dispatch`). `GET /status` montre sa décision du moment sans rien lancer. Jeton GitHub *fine-grained* limité à `kite-app` (Actions : lecture et écriture) en secret Cloudflare `GITHUB_TOKEN` ; quand il expire, les lancements s'arrêtent et la légende passe « en retard ». Avant : une tâche cron-job.org tous les quarts d'heure (96 lancements par jour, la plupart pour rien). Le planning GitHub reste en secours. Les runs AROME complets arrivent à heure fixe (heure d'hiver, Paris) : 3 h 44, 6 h 38, 12 h 00, 14 h 11, 16 h 54, 19 h 50, 0 h 00, 2 h 09 (runs de 7 h et 19 h plus lents).
- **App** : elle lit `meta.json` (NetworkFirst), puis l'heure affichée, puis les autres (CacheFirst), sur le Worker (`VITE_DATA_URL`). Aucune clé côté client.

## Stack (décisions figées)
- Svelte 5 (runes) + Vite + TypeScript strict
- `maplibre-gl` ; fond de carte OpenFreeMap `https://tiles.openfreemap.org/styles/liberty` (sans clé, polices `Noto Sans Regular|Bold|Italic`)
- `vite-plugin-pwa` (Workbox, `autoUpdate`) ; Vitest pour la logique pure
- `d3-contour` : isobandes vectorielles (petite librairie, sans dépendance lourde)
- Hébergement GitHub Pages ; gestionnaire de paquets **npm** (pnpm n'est pas installé)

## Commandes
```
npm run dev       # serveur de dev (il faut des données dans public/data, voir `npm run data`)
npm run data      # pipeline local : AROME 13 heures + AROME-PI + marée + stations (Python + `pip install -r pipeline/requirements.txt`)
npm run build     # build prod + service worker (BASE_PATH=/kite-app/ pour GitHub Pages)
npm run preview   # sert le build (tester la PWA / le hors-ligne)
npm test          # vitest
npm run check     # svelte-check + tsc
npm run dev:phone # serveur accessible depuis le téléphone sur le Wi-Fi local (sans HTTPS)
npm run worker:dev    # Worker des mesures en local (http://127.0.0.1:8787/obs)
npm run worker:deploy # déploie le Worker sur Cloudflare (wrangler login fait une fois)
```
`public/data/` est généré et ignoré par git. En dev, `window.app` dans la console donne accès à l'état de l'app.

## Arborescence
```
pipeline/                  fetch_arome.py (GRIB → binaire), fetch_aromepi.py (rafales AROME-PI), fetch_tide.py (marée), fetch_obs.py (stations),
                           bassin_water.mjs (contour du Bassin), bassin_depth.mjs (relief du Bassin), requirements.txt
.github/workflows/         deploy.yml (tâche data → R2 ; tâche app → GitHub Pages, sur push)
worker/                    index.ts (Worker Cloudflare : /obs mesures en direct, /data/… prévisions depuis R2, /status, tâche planifiée),
                           check.ts (quand lancer le workflow, testé), wrangler.toml, README.md
src/
  main.ts                  montage, service worker, blocage du pincement iOS
  App.svelte               MapView + Legend + LayerToggles + TimeDial + SpotsSheet (+ Diagnostics)
  lib/
    map/                   MapView, LayerToggles (couches, Moy/Raf, kn/km/h, ☰, ⟳), Legend, windLayers.ts (sources/couches),
                           obsMarkers.ts (balises animées)
    time/                  TimeDial (module flottant : heure, gestes, frise, point touché)
    sheet/                 SpotsSheet (fermé / half / full), SpotList, PiBadge
    wind/                  arome.ts (format, décodage, vent en un point), field.ts (valeurs, interpolation, isobandes,
                           lignes de vent, grille de valeurs), pi.ts (AROME-PI), obs.ts (vent mesuré), obsSources.ts (lecture des stations, pour le Worker), units.ts, time.ts, tide.ts (marée), windColor.ts (paliers)
    spots/                 spots.ts (spots, orientations, niveau, restrictions), rating.ts (note)
    stores/app.svelte.ts   état global (run, heures, AROME-PI, heure choisie, point touché, couches, vue, préférences)
    pwa.ts                 enregistrement du service worker, vérification des mises à jour
    Diagnostics.svelte     diagnostic écran (appui long sur ⟳)
```

## Règles UX
- Mobile-first (cible 360–430 px), portrait. Zones tactiles ≥ 44 px, `env(safe-area-inset-*)`.
- **Module de temps** (`TimeDial`) : le swipe horizontal fait 24 px par heure (doigt vers la droite = avancer). ‹ › déplace d'une heure, et un appui long fait défiler en continu. Un tap sur la frise saute à l'heure touchée. Sur la frise, un grand tick avec le nom du jour marque minuit, un petit marque midi, le bleu marque l'heure choisie. Flèches ← → au clavier.
- **Liste des spots** (`SpotsSheet`) : elle s'ouvre avec ☰, se ferme au glisser ou avec ✕, et défile à tous les crans. Pas de modale. Seuls de petits boutons flottants sont tolérés sur la carte.
- **Boutons à gauche** : couleurs, valeurs, flèches, spots, balises ◉, Moy/Raf, kn/km/h, ☰, ⟳ (tap = recharger ; appui long = diagnostic). **Crédits du fond de carte** (ⓘ, obligatoires) en haut à droite sous la géolocalisation, repliés au démarrage. Ouverts, ils restent à droite des boutons et commencent sous la légende (hauteur suivie par `--legend-h`) : la carte est sous la légende et les boutons, qui cachaient le texte sur iPhone. Le ⓘ ne bouge pas, seul le texte a un fond blanc (un fond blanc étiré depuis le ⓘ faisait une bande vide sous la légende).
- **Hauteur de page `--page-h`** (`app.css`) : `100vh` en app installée (classe `installed` sur `html`, posée par `main.ts` d'après `display-mode: standalone|fullscreen` ou `navigator.standalone`), `100dvh` dans le navigateur du téléphone. Là, `100vh` est la hauteur barres d'outils repliées et le bas du module de temps passait sous la barre d'adresse. Tout ce qui suit vaut pour l'app installée ; le diagnostic affiche la valeur et le mode retenus.
- **Carte sur tout l'écran de l'iPhone, sous l'heure comprise** : barre d'état `black-translucent` **et page à `100vh`** (`html`, `body`, `#app`, `.map`). En app installée (iOS 18.7, iPhone 393 × 852), la barre translucide fait commencer la page sous l'heure, mais iOS annonce une page raccourcie de la barre (`innerHeight` 793) et ne dessinait rien en dessous : 59 px vides en bas avec `inset: 0` ou `100%`. Avec une page à `100vh` (852), iOS dessine tout l'écran (testé sur le téléphone le 2 nov. 2026, avec une app de test et 4 variantes : 100vh, hauteur de l'écran et page + barre marchaient, seule `inset: 0` échouait). Ce qui est calé en bas se place **depuis le haut de la page à 100vh**, pas depuis le bas du viewport (qui peut être 59 px trop haut) : module de temps `top: calc(var(--page-h) - 12px - env(safe-area-inset-bottom))` + `translate(-50%, -100%)`, panneau des spots `top: calc(var(--page-h) - hauteur)`, hauteurs du panneau tirées de la hauteur de `html`. iOS lit la barre d'état à l'ajout sur l'écran d'accueil : il faut réinstaller l'app après un changement. Le manifeste demande `fullscreen` (Android) ; iOS l'ignore.
- **Pas de `padding.bottom` pour le module de temps** : `maxBounds` ignore le padding, et un padding laissait le bas de l'écran déborder des données. Seul le panneau des spots ouvert met la moitié de l'écran en padding.
- **La page ne zoome jamais**, seule la carte zoome : `touch-action: pan-x pan-y` sur `html`/`body`, `user-scalable=no` (Android), et `gesturestart` bloqué hors carte (iOS ignore `user-scalable`).
- **Trait de côte** : la classe `ocean` de la couche `water`, plus les **grands lacs** choisis par leur identifiant OSM (`BIG_LAKES` dans `windLayers.ts` : Hourtin, Lacanau, Cazaux, Parentis-Biscarrosse, Petit étang de Biscarrosse, Aureilhan, Léon, Soustons, Hossegor), en ligne sombre sur un liseré clair. Tous les « lakes » OSM incluraient les réservoirs à poissons de Piraillan, qui dessinaient un rectangle dans l'eau, et les tuiles ne donnent pas la surface. Les identifiants ont été relevés en décodant les tuiles OpenFreeMap (z10) : si un lac disparaît après une mise à jour du fond de carte, revérifier son identifiant.
- **Rotation de la carte désactivée** : nord en haut.
- **Mises à jour** : une nouvelle version s'installe et recharge la page toute seule (`lib/pwa.ts`). Elle est vérifiée au retour sur l'app, toutes les 30 min, et avec ⟳ (`app.refresh()` : nouvelle version, puis nouvelles données).
- **Diagnostic écran** (appui long sur ⟳) : il affiche innerHeight, vh/lvh/dvh, les zones de sécurité, le mode installé, la barre d'état, la position de la carte… Ça sert à déboguer depuis une capture du téléphone ce qu'on ne reproduit pas sur ordinateur.

## Règles données et rendu
- Heures affichées en `Europe/Paris`, clé `YYYY-MM-DDTHH:00`. `meta.json` donne les heures de validité en UTC.
- **Zones de couleur** : `isobands` (d3-contour, marching squares interpolé) produit des MultiPolygones cumulés (« ≥ seuil »), dessinés opaques dans l'ordre sous les libellés du fond de carte. d3-contour place la valeur de la cellule (x, y) en (x + 0,5, y + 0,5). Elles sont mémorisées par run, heure et type.
- **Lignes de vent** : `streamlines` (Jobard & Lefer) trace de longues lignes espacées de 14 px à l'écran, de l'amont vers l'aval. Les pointes sont des symboles `symbol-placement: line` (chevron dessiné vers l'est, tous les 35 px). Elles sont calculées sur la zone visible, et recalculées à chaque `moveend` et à chaque changement d'heure (~50 ms).
- **Valeurs** : `labels` sur un réseau de pas `k` cellules, où `strideFor` garde au moins 14 px entre deux valeurs (une valeur par point de grille dès que ça tient). **MapLibre compte ses zooms en tuiles de 512 px.**
- **Légende** : les valeurs sont sous la barre de couleurs, centrées sur la limite de leur palier. Dans les cases, elles débordaient sur la couleur suivante.
- **Vent d'un spot** : lu au **point de mesure** `windPoint`, un peu au large, donné par l'utilisateur (`windPointOf`, sinon la position du spot). Près du bord, le modèle ralentit le vent (frottement de la terre) et notait des spots « trop faible » à tort. Le point sert à la note, aux valeurs de la liste, au point touché et à la tendance AROME-PI. `lat`/`lon` restent l'emplacement affiché. On lit la cellule AROME la plus proche (`windAt` → `cellOf`, ~1,1 × 0,8 km) : un point à quelques centaines de mètres du spot tombe souvent dans la même cellule et ne change rien (gain constaté à La Chambrette, Lacanau Océan, Navarrosse, Ispe).

## Testé puis rejeté (voir l'historique git)
- **Interface** :
  - réticule central qui donne le vent sous la cible ;
  - frise horaire dans un panneau ;
  - heure intégrée au panneau qui s'ouvre ;
  - swipe dans l'autre sens (gauche = avancer).
- **Rendu** :
  - dégradé de couleurs continu ;
  - champ en image raster (bords pixelisés) ;
  - flèches isolées ou en quinconce (pas assez « continues ») ;
  - cyan à 10–12 kn (paraissait plus clair que le palier précédent).
- **Données** : Open-Meteo appelé depuis le navigateur. Le quota compte par point, ce qui donnait trop peu de valeurs et une zone en carré figé.
- **« Atténuer la terre »** : le masque était tiré de l'orographie AROME, parce que le champ `lsm` du fichier constant se décode mal (valeurs de −256 à 253). L'utilisateur n'a pas aimé.
- **Balises en disque blanc cerclé** (valeur au centre, flèche décalée) et **masquées hors de l'heure actuelle** : peu lisible, remplacé par les hélices colorées et le grisé. Puis disque coloré avec rotor à 3 traits, et hélice à 3 pales courbes : remplacés par les 4 pales en croissant.
- **Barre d'état iOS opaque (`black`)** : carte jusqu'en bas mais pas sous l'heure. Remplacée par translucide + page à `100vh` (voir les règles UX).

## À faire
**À vérifier sur le téléphone** : le bas du module de temps dans Safari/Chrome (`100dvh`), et que l'app installée garde bien `100vh` (diagnostic : ligne `--page-h`).

**Android** : installation et plein écran vérifiés sur un téléphone (nov. 2026).

**Marée** : à revoir sur le terrain avec api-maree.fr (Eyrac, depuis le 7 nov. 2026). Au fond du Bassin (Taussat, Le Betey, l'Aérium), la pleine mer arrive encore plus tard qu'à Eyrac : un décalage par spot serait possible si l'écart se confirme.

**Balises de vent en direct**
- Holfuy : branché sur le fichier des graphiques (voir le pipeline stations). Les propriétaires sont d'accord ; la clé de l'API officielle (`api.holfuy.com/live/`, générée depuis leur compte admin) reste la solution de secours si le fichier change. Le lien `holfuy.com/puget/mjso.php?k=…` ne marche pas : même réponse quel que soit `k`.
- Pyla : balise FFVL 64 (balisemeteo.com) ; l'API FFVL demande une clé à la fédération. Les balises FFVL de Gironde sont en maintenance.
- Rien à prendre : OpenWindMap / Pioupiou (aucune balise sur nos spots), Winds-Up et Windguru (pas d'API publique).

**Suite prévue : données hors de l'appli** (décidé le 7 nov. 2026)
1. Fait : Worker des mesures.
2. Fait : prévisions dans R2.
3. Fait : vérification par le Worker (remplace cron-job.org, à désactiver par l'utilisateur une fois les lancements du Worker vérifiés).

**Idées évoquées, non décidées**
- Reprendre d'autres infos de windspot.fr (ses CGU interdisent la reproduction sans accord écrit ; son auteur a donné son accord à l'utilisateur, nov. 2026) : niveaux kite et wing séparés, plan d'eau, dates exactes des interdictions « l'été » (arrêtés listés sur sa page réglementation). Les Arbousiers sont recommandés à marée basse (plat) : un bonus possible.
- Restrictions saisonnières (griser un spot « Interdit l'été » en été).
- Dessiner AROME-PI sur la carte si Météo-France publie un jour son vent moyen.

**Après le POC**
- Refaire l'app avec une structure pensée à l'avance, en reprenant les choix ci-dessus et les essais rejetés.
- Back-end envisagé : GitHub Actions pour le traitement AROME, GitHub Pages (ou Cloudflare Pages) pour l'app et les fichiers de prévision, **Supabase** (gratuit) seulement le jour où il faut des comptes, des favoris synchronisés ou des **alertes push** (fonction jugée la plus utile). Le pipeline enverrait les alertes après chaque nouveau run. Vercel n'apporte rien à une app statique et ne peut pas décoder les GRIB. Alternative : un VPS à ~5 €/mois (Hetzner, OVH), tout au même endroit, mais à maintenir.

## Conventions
- La logique pure va dans `lib/**/*.ts` et a ses tests `*.test.ts` à côté. Les composants `.svelte` restent minces.
- L'objet `maplibregl.Map` et les tableaux décodés ne sont jamais mis dans un `$state` : ce sont des propriétés simples de `app`. Après l'arrivée d'une heure ou d'AROME-PI, incrémenter `app.dataVersion`.
- Pas de nouvelle dépendance sans le justifier.
- Commits en français, poussés sur `main` (déploiement automatique).
