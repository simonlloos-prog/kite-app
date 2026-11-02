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
- **Données AROME 0,01°**, le même modèle que l'« AROME 1.3 km » de Meteociel. Les fichiers GRIB open data de Météo-France sont préparés par un serveur (GitHub Actions) plutôt qu'appelés depuis le téléphone : il y a assez de points pour la pleine résolution, sans quota ni clé côté app. L'utilisateur accepte quelques minutes de préparation par run, puisque Meteociel n'est pas plus frais.
- **Fraîcheur** : un run AROME toutes les 3 h, publié 3 à 4 h après. La légende affiche le run en heure de Paris (« run dim. 16 h » = 15 UTC). Au-delà de 8 h après l'heure du run, au moins un run plus récent manque : la légende ajoute « en retard (N h) » en orange (`staleHours`).
- **AROME-PI** (run horaire, environ 1 h de retard) ne donne que des **rafales** via l'API, pas de vent moyen : il n'est pas dessiné. Il sert d'**indicateur de tendance** : pour chaque spot, un badge « PI ↑ +3 / ↓ −2 / = » donne l'écart moyen des rafales AROME-PI − AROME sur les heures communes (+1 à +6 h), avec un seuil de 1,5 kn. Le badge **ne dépend pas de l'heure choisie**. Le point touché affiche aussi « raf. 18 (PI 18) ».
- **Marée du Bassin** : le Bassin d'Arcachon montre **ce qui découvre à l'heure choisie** (bancs et crassats en gris, chenaux en couleur), et l'état de la marée s'affiche sous l'heure (« marée basse ↓ », « mi-marée ↑ »…). La hauteur d'eau vient d'Open-Meteo Marine (sans clé, CC BY 4.0), au large du Cap Ferret, **moins la moyenne de la série** : c'est le niveau au-dessus du niveau moyen (NM), quel que soit le zéro du modèle. Le relief vient du Shom (MNT HOMONIM 20 m, référence NM, Licence Ouverte). Une case est sèche quand le sol est au-dessus de l'eau (`isobands` au niveau d'eau, mémorisé au centimètre). Comparaison avec l'annuaire d'Eyrac (2 nov. 2026, coef. 47) : marnage juste (~2,3 m), heures en avance de 0 à 1 h. Le grisé est limité au Bassin à l'est d'une ligne Bélisaire – Jetée Thiers (les passes et Les Arbousiers se naviguent à marée basse). « Marée basse / mi-marée / haute » = place de l'heure entre basse mer (0) et pleine mer (1) sur ±6 h (`tideByTime`, seuil `LOW_TIDE` = 1/3). Crédits Open-Meteo et Shom dans ⓘ.
- **Unités** : tout est calculé en **nœuds**. Le bouton kn ↔ km/h ne convertit que l'affichage (`fmtSpeed`) ; Meteociel affiche en km/h. Le choix est mémorisé (`localStorage`, `kite-prefs`).
- **Direction** : on parle d'où vient le vent (convention météo), et les flèches pointent là où il va.
- **Spots** (`spots/spots.ts`) : les spots du tableau « Trouve ton spot autour de Bordeaux » (KitesurfBordeaux.com, 2018), avec quelques ajustements :
  - Lacanau Sud et Super Sud sont fusionnés en **Lacanau Océan** ;
  - l'**Aérium** (à la place d'Arès), **Taussat** et **Soulac** sont ajoutés, avec des orientations devinées et marquées « à vérifier » ;
  - **Les Aigrettes** (lac de Cazaux, « Interdit ») est retiré.

  Chaque spot a ses directions 🤙 bonnes (`good`), 👍 moyennes (`ok`) et ⚠ **offshore** (`offshore`) sur 8 directions, son niveau et ses restrictions (« Interdit l'été »…). Toutes les positions ont été données par l'utilisateur. **Les orientations viennent de windspot.fr (2026)** pour les 17 spots qu'il décrit (idéal = `good`, navigable = `ok`, offshore), relevées sur sa rose des vents. Elles remplacent celles du tableau de 2018. Lacanau Océan et Le Porge marchent comme Le Grand Crohot (dit par l'utilisateur) et en prennent les orientations. Les autres plages océanes qu'il n'a pas (Soulac, La Lagune, La Salie, Biscarrosse) gardent les directions du tableau et prennent les secteurs offshore du Grand Crohot (NE, E, SE, S), sur la même côte rectiligne.
- **Note d'un spot** (`spots/rating.ts`) :
  - **Direction** : bonne, moyenne (un cran de moins), offshore ou défavorable. Chacune des 8 directions couvre ±22,5°. **Offshore** (vent de terre, qui emporte vers le large) : dès 12 kn, le spot est noté « Offshore ⚠ dangereux », avec un point **rouge** sur la carte et dans la liste. En dessous, il reste « Trop faible ».
  - **Force** : sous 12 kn trop faible, 12–15 léger, 15–25 bon, 25–32 fort, au-delà trop fort.
  - **Marée** (`tide` dans `spots.ts`, créneaux de windspot.fr) : un spot du Bassin ne se navigue en kite qu'à ±N h de la pleine mer (Claouey, l'Aérium, Le Betey, Taussat ±2 h ; La Hume ±3 h). Hors créneau, un vent bon devient « Marée trop basse » (note 0). Un vent trop faible ou défavorable garde son propre libellé. Les Arbousiers, Bonne Anse, La Chambrette et Le Grand Crohot se naviguent à toute marée, et les lacs n'en ont pas. L'heure de pleine mer vient de la série de marée au large du Cap Ferret (sommet d'une parabole sur 3 heures, `highWaters`). Au fond du Bassin, la pleine mer arrive un peu plus tard (à vérifier sur le terrain).
  - **Tri** : la liste est triée par note, puis par force.
- **Zone** (`BOX`, 43,55–45,85 N, 2,00–0,60 O) : elle couvre tous les spots, avec du large pour voir le vent arriver. La carte est **bloquée sur cette zone** (`maxBounds`) pour qu'on ne dézoome jamais sur un bord sans données.
- **Changer d'heure doit rester le geste le plus simple** : un module flottant indépendant, qui ne s'ouvre pas, et qu'on swipe **vers la droite pour avancer**. Changer d'heure ne fait aucune requête : toutes les heures sont chargées en arrière-plan.

## Architecture
```
Météo-France open data ──► pipeline/fetch_arome.py ───┐
(GRIB2 AROME 0,01°, SP1)                              ├─► public/data/ ──► build Vite ──► GitHub Pages
API Météo-France ─────────► pipeline/fetch_aromepi.py ┘   meta.json + <run>_<grille>/hNN.bin + pi-<run>_<grille>.bin
(WCS AROME-PI, clé)        (GitHub Actions, chaque heure)
Open-Meteo Marine ────────► pipeline/fetch_tide.py ─── (marée du Bassin, dans meta.json)
```
- **Source AROME** : `https://meteofrance-pnt.s3.rbx.io.cloud.ovh.net/pnt/<run>/arome/001/SP1/arome__001__SP1__<NN>H__<run>.grib2`. C'est le jeu de données data.gouv « Paquets Arome - Résolution 0,01° », en Licence Ouverte 2.0, sans clé. Il y a 52 échéances (0 à 51 h), environ 23 Mo par fichier. On utilise `10u`, `10v` et `max_10efg`/`max_10nfg` (rafale max de l'heure écoulée, absente à l'échéance 0).
- **Pipeline AROME** (Python, `eccodes` + `numpy`) : il prend le dernier run complet, découpe `BOX` (231 × 141 points) et écrit un fichier binaire par heure (~98 Ko, ~5 Mo par run). Le format, documenté en tête de `fetch_arome.py`, est `int8` u, `int8` v, `uint8` rafale, 0,5 kn par unité, ligne 0 au sud. **Les noms de fichiers portent une empreinte de la grille** (`data_folder`). Le téléphone garde les fichiers en cache indéfiniment, et republier un run sur une autre grille sous les mêmes noms avait servi d'anciens fichiers (« Fichier AROME inattendu »). L'app recharge aussi depuis le réseau un fichier de taille inattendue (`fetchBin`). Au-delà de ~3 fois la surface actuelle, il faudra découper en tuiles.
- **Pipeline AROME-PI** (`fetch_aromepi.py`) : `WIND_SPEED_GUST` à 10 m sur toute `BOX`, en 6 requêtes WCS GetCoverage en GRIB. La clé est le secret GitHub `METEOFRANCE_API_KEY`, ou `.env.local` en local (ignoré par git, jamais affiché). Sans clé ou si l'API échoue, AROME-PI est simplement absent.
- **Pipeline marée** (`fetch_tide.py`) : hauteur horaire au large du Cap Ferret, d'un jour avant le run à un jour après sa dernière heure, ajoutée à `meta.json` (`tide`). Sans réponse, le Bassin n'est jamais grisé.
- **Contour du Bassin** (`src/lib/map/bassin.json`, 25 Ko) : généré une fois par `node pipeline/bassin_water.mjs`, qui découpe l'eau des tuiles OpenFreeMap avec un masque dessiné à la main (milieu de la presqu'île du Cap Ferret, et au sud une ligne Bélisaire – Jetée Thiers). Il utilise `polygon-clipping` (dépendance de dev, seulement pour ce script).
- **Relief du Bassin** (`src/lib/map/bassin-depth.bin` + `.json`, 190 Ko, mis en cache hors ligne) : généré une fois par `node pipeline/bassin_depth.mjs <fichier .asc>` depuis le MNT Shom HOMONIM « NM » (archive 7z de 41 Mo sur data.gouv.fr, non versionnée). Pas de ~40 m, `int8` en décimètres au-dessus du NM, ligne 0 au sud, −128 hors du contour du Bassin.
- **Workflow** `.github/workflows/deploy.yml` : il se lance à chaque push et tous les quarts d'heure, à des minutes décalées (`:07`, `:22`, `:37`, `:52`). GitHub retarde ou saute les tâches planifiées quand il est chargé, surtout à l'heure pile : avec un seul passage par heure, il n'y a eu que 3 lancements en 18 h et le site est resté bloqué sur un vieux run. Si le run AROME n'a pas changé, il recopie les fichiers déjà publiés (`--reuse-from`) au lieu de retélécharger 1,2 Go. En mode planifié, il ne republie rien si ni AROME ni AROME-PI n'ont changé. Un nouveau run prend environ 4 min, une mise à jour AROME-PI seule environ 1 min.
- **App** : elle lit `data/meta.json` (NetworkFirst), puis l'heure affichée, puis les autres (CacheFirst). Aucun appel API côté client.

## Stack (décisions figées)
- Svelte 5 (runes) + Vite + TypeScript strict
- `maplibre-gl` ; fond de carte OpenFreeMap `https://tiles.openfreemap.org/styles/liberty` (sans clé, polices `Noto Sans Regular|Bold|Italic`)
- `vite-plugin-pwa` (Workbox, `autoUpdate`) ; Vitest pour la logique pure
- `d3-contour` : isobandes vectorielles (petite librairie, sans dépendance lourde)
- Hébergement GitHub Pages ; gestionnaire de paquets **npm** (pnpm n'est pas installé)

## Commandes
```
npm run dev       # serveur de dev (il faut des données dans public/data, voir `npm run data`)
npm run data      # pipeline local : AROME 13 heures + AROME-PI + marée (Python + `pip install -r pipeline/requirements.txt`)
npm run build     # build prod + service worker (BASE_PATH=/kite-app/ pour GitHub Pages)
npm run preview   # sert le build (tester la PWA / le hors-ligne)
npm test          # vitest
npm run check     # svelte-check + tsc
npm run dev:phone # serveur accessible depuis le téléphone sur le Wi-Fi local (sans HTTPS)
```
`public/data/` est généré et ignoré par git. En dev, `window.app` dans la console donne accès à l'état de l'app.

## Arborescence
```
pipeline/                  fetch_arome.py (GRIB → binaire), fetch_aromepi.py (rafales AROME-PI), fetch_tide.py (marée),
                           bassin_water.mjs (contour du Bassin), bassin_depth.mjs (relief du Bassin), requirements.txt
.github/workflows/         deploy.yml (données + build + GitHub Pages, chaque heure)
src/
  main.ts                  montage, service worker, blocage du pincement iOS
  App.svelte               MapView + Legend + LayerToggles + TimeDial + SpotsSheet (+ Diagnostics)
  lib/
    map/                   MapView, LayerToggles (couches, Moy/Raf, kn/km/h, ☰, ⟳), Legend, windLayers.ts (sources/couches)
    time/                  TimeDial (module flottant : heure, gestes, frise, point touché)
    sheet/                 SpotsSheet (fermé / half / full), SpotList, PiBadge
    wind/                  arome.ts (format, décodage, vent en un point), field.ts (valeurs, interpolation, isobandes,
                           lignes de vent, grille de valeurs), pi.ts (AROME-PI), units.ts, time.ts, tide.ts (marée), windColor.ts (paliers)
    spots/                 spots.ts (spots, orientations, niveau, restrictions), rating.ts (note)
    stores/app.svelte.ts   état global (run, heures, AROME-PI, heure choisie, point touché, couches, vue, préférences)
    pwa.ts                 enregistrement du service worker, vérification des mises à jour
    Diagnostics.svelte     diagnostic écran (appui long sur ⟳)
```

## Règles UX
- Mobile-first (cible 360–430 px), portrait. Zones tactiles ≥ 44 px, `env(safe-area-inset-*)`.
- **Module de temps** (`TimeDial`) : le swipe horizontal fait 24 px par heure (doigt vers la droite = avancer). ‹ › déplace d'une heure, et un appui long fait défiler en continu. Un tap sur la frise saute à l'heure touchée. Sur la frise, un grand tick avec le nom du jour marque minuit, un petit marque midi, le bleu marque l'heure choisie. Flèches ← → au clavier.
- **Liste des spots** (`SpotsSheet`) : elle s'ouvre avec ☰, se ferme au glisser ou avec ✕, et défile à tous les crans. Pas de modale. Seuls de petits boutons flottants sont tolérés sur la carte.
- **Boutons à gauche** : couleurs, valeurs, flèches, spots, Moy/Raf, kn/km/h, ☰, ⟳ (tap = recharger ; appui long = diagnostic). **Crédits du fond de carte** (ⓘ, obligatoires) en haut à droite sous la géolocalisation, repliés au démarrage.
- **Barre d'état iOS opaque (`black`), jamais `black-translucent`** : choix de l'utilisateur après essai. En app installée (iOS 18, iPhone 393 × 852), la barre translucide met la carte sous l'heure, mais iOS raccourcit quand même la page de la hauteur de la barre (`innerHeight` 793). Les 59 px du bas ne sont alors **jamais dessinés**, quoi qu'on mette en CSS (diagnostic sur le téléphone). On ne peut pas avoir les deux. La carte est en `position: fixed; inset: 0`, pas en `100vh`/`100lvh` (852 dans ce mode). iOS lit ce réglage à l'ajout sur l'écran d'accueil : il faut réinstaller l'app après un changement. Le manifeste demande `fullscreen` (Android) ; iOS l'ignore.
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
- **Barre d'état iOS translucide** : bande vide en bas, voir les règles UX.

## À faire
**Carte sur tout l'écran de l'iPhone (souhaité, peut-être impossible)**
- L'utilisateur voudrait la carte partout : sous l'heure en haut **et** jusqu'en bas. Aujourd'hui, c'est l'un ou l'autre (voir « Barre d'état iOS » dans les règles UX). Pistes à essayer, en réinstallant l'app à chaque fois, et à vérifier avec le diagnostic (appui long sur ⟳) :
  - revérifier `black-translucent` après chaque mise à jour d'iOS : c'est peut-être un bug corrigé un jour ;
  - avec `black-translucent`, essayer `html`/`body` à `height: 100vh` (852) ou `min-height: calc(100% + env(safe-area-inset-top))`, au cas où iOS dessinerait alors le bas ;
  - en dernier recours, garder la barre translucide et coller le module de temps au bas de l'écran, sa couleur remplissant les 59 px non dessinés : plus de bande vide, mais un module « barre du bas » (proposé et refusé pour l'instant).

**Données des spots à compléter**
- Point de mesure manquant : Taussat. Bonne Anse a son point sur sa position.
- Orientations devinées à confirmer : Soulac (absent de windspot.fr).

**Mises à jour fiables (si les quarts d'heure ne suffisent pas)**
- Un réveil externe qui lance le workflow (`workflow_dispatch`) à heure fixe : Cloudflare Worker planifié, cron-job.org, ou `pg_cron` de Supabase. Il faut un jeton GitHub limité au dépôt, à créer par l'utilisateur.

**Idées évoquées, non décidées**
- Reprendre d'autres infos de windspot.fr (en reformulant et en citant la source, l'app est publique) : niveaux kite et wing séparés, plan d'eau et courant, règlements saisonniers à l'heure près (Arbousiers : kite seulement avant 12 h et après 19 h en juillet-août), balises de vent en direct (Holfuy), spots manquants (Cercle Voile Arcachon, Lacanau Port). Les Arbousiers sont recommandés à marée basse (plat) : un bonus possible.
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
