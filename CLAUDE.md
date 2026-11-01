# Kite App — vent AROME sur le Bassin d'Arcachon

PWA mobile-first pour kitesurfeurs, rendu **façon Meteociel** (lecture rapide plutôt que finesse graphique). La carte MapLibre affiche le vent AROME 0,01° (~1,3 km) de Météo-France, de l'estuaire de la Gironde à Capbreton, loin au large et jusqu'aux portes de Bordeaux (spots de La Chambrette au Pyla, lacs d'Hourtin et de Lacanau compris) :
- des **zones de couleur vectorielles** par paliers de 2–3 kn, nettes à tous les zooms, avec un liseré et le trait de côte redessiné par-dessus ;
- une **grille régulière de petites valeurs en nœuds** ;
- de **longues lignes de vent continues, régulièrement espacées, avec des pointes de flèche intégrées** le long de chaque ligne.

La carte est **bloquée sur la zone des données** (`maxBounds`) : on ne peut pas dézoomer sur un bord vide.

Chaque couche s'active ou se désactive, et on bascule entre vent moyen et rafales ainsi qu'entre **nœuds et km/h** (Meteociel affiche en km/h). Les données et les seuils restent en nœuds : seul l'affichage est converti (`fmtSpeed`). L'unité est mémorisée dans `localStorage` (`kite-prefs`). On change d'heure avec un **module flottant indépendant** en bas de l'écran. Toucher la carte affiche le vent du point touché. La liste des spots est dans un panneau séparé, fermé par défaut.

Testé puis rejeté (voir l'historique git) : le réticule central, la frise horaire, le dégradé continu, les flèches isolées ou en quinconce (pas assez « continues »), le champ en image raster (bords pixelisés), « atténuer la terre » (masque tiré de l'orographie AROME, car le champ `lsm` du fichier constant se décode mal), l'heure intégrée au panneau qui s'ouvre, et Open-Meteo appelé depuis le navigateur (quota par point, trop peu de valeurs).

## Phase actuelle : POC
Le code sert de **bac à sable** pour tester des variantes sur téléphone. Il doit rester propre et lisible, sans viser l'architecture définitive. L'app sera **refaite ensuite avec une structure pensée à l'avance**. Conséquences :
- Préférer une variante isolée (un fichier, une couche, un flag) à une abstraction générique.
- Noter dans `docs/decisions.md` (à créer au besoin) ce qu'on a essayé, retenu ou rejeté, et pourquoi.

## Architecture
```
Météo-France open data ──► pipeline/fetch_arome.py ───┐
(GRIB2 AROME 0,01°, SP1)                              ├─► public/data/ ──► build Vite ──► GitHub Pages
API Météo-France ─────────► pipeline/fetch_aromepi.py ┘   meta.json + <run>/hNN.bin + pi-<run>.bin
(WCS AROME-PI, clé)        (GitHub Actions, chaque heure)
```
- **AROME-PI** (`fetch_aromepi.py`) : c'est le run horaire de prévision immédiate (+1 à +6 h), publié environ 1 h après son heure. Via l'API, il n'a **que des rafales, pas de vent moyen**. On prend `WIND_SPEED_GUST` à 10 m (rafale max de l'heure écoulée, même définition que la rafale AROME) sur toute `BOX`, en 6 requêtes WCS GetCoverage au format GRIB. Ce n'est pas dessiné sur la carte : la liste des spots montre un badge « PI ↑ / ↓ / = » (écart moyen AROME-PI − AROME sur les heures communes, seuil 1,5 kn, voir `wind/pi.ts`), et le point touché affiche « (PI xx) ». La clé est le secret GitHub `METEOFRANCE_API_KEY`, ou `.env.local` en local (ignoré par git, jamais affiché). Sans clé, AROME-PI est simplement absent.
- **Source** : `https://meteofrance-pnt.s3.rbx.io.cloud.ovh.net/pnt/<run>/arome/001/SP1/arome__001__SP1__<NN>H__<run>.grib2`. C'est le jeu de données data.gouv « Paquets Arome - Résolution 0,01° », en Licence Ouverte 2.0, sans clé. Il y a un run toutes les 3 h, avec 52 échéances (0 à 51 h), soit environ 23 Mo par fichier. On utilise `10u`, `10v` et `max_10efg`/`max_10nfg` (rafale max de l'heure écoulée, absente à l'échéance 0).
- **Pipeline** (Python, `eccodes` + `numpy`) : il prend le dernier run complet, découpe `BOX` (43,55–45,85 N, 2,00–0,60 O, de l'estuaire de la Gironde à Capbreton, jusqu'aux portes de Bordeaux, 231 × 141 points) et écrit un fichier binaire par heure (~98 Ko, soit ~5 Mo par run). Les noms de fichiers portent une empreinte de la grille (`data_folder`) : un changement de `BOX` ne sert jamais d'anciens fichiers en cache. Au-delà de ~3 fois cette surface, il faudra découper en tuiles et ne charger que la partie visible.
- **Fraîcheur** : AROME tourne toutes les 3 h (00, 03… 21 UTC), et Météo-France publie chaque run environ 3 à 4 h après son heure nominale. La légende affiche l'heure du run en heure de Paris (le run 15 UTC s'affiche « 16 h »). Le format est documenté en tête de `fetch_arome.py` : `int8` u, `int8` v, `uint8` rafale, 0,5 kn par unité, ligne 0 au sud.
- **Workflow** `.github/workflows/deploy.yml` : il se lance à chaque push et toutes les heures (`:25`). Si le run AROME n'a pas changé, il recopie les fichiers déjà publiés (`--reuse-from`) au lieu de retélécharger 1,2 Go. En mode planifié, il ne republie rien si ni AROME ni AROME-PI n'ont changé. Un nouveau run AROME prend environ 4 minutes, une simple mise à jour AROME-PI environ 1 minute.
- **App** : elle lit `data/meta.json` (NetworkFirst), puis l'heure affichée, puis les autres heures (CacheFirst, les fichiers sont rangés par run). Aucun appel API côté client.

## Stack (décisions figées)
- Svelte 5 (runes) + Vite + TypeScript strict
- `maplibre-gl` ; fond de carte OpenFreeMap `https://tiles.openfreemap.org/styles/liberty` (sans clé, polices `Noto Sans Regular|Bold|Italic`)
- `vite-plugin-pwa` (Workbox) ; Vitest pour la logique pure
- `d3-contour` : isobandes vectorielles (petite librairie, sans dépendance lourde)
- Gestionnaire de paquets : **npm** (pnpm n'est pas installé)

## Commandes
```
npm run dev       # serveur de dev (il faut des données dans public/data, voir `npm run data`)
npm run data      # pipeline local : AROME 13 heures + AROME-PI (Python + `pip install -r pipeline/requirements.txt`)
npm run build     # build prod + service worker (BASE_PATH=/kite-app/ pour GitHub Pages)
npm run preview   # sert le build (tester la PWA / le hors-ligne)
npm test          # vitest
npm run check     # svelte-check + tsc
npm run dev:phone # serveur accessible depuis le téléphone sur le Wi-Fi local (sans HTTPS)
```
`public/data/` est généré et ignoré par git. Dans la console du navigateur, en dev, `window.app` donne accès à l'état de l'app.

## Arborescence
```
pipeline/                  fetch_arome.py (GRIB → binaire), fetch_aromepi.py (rafales AROME-PI), requirements.txt
src/
  App.svelte               MapView + Legend + LayerToggles + TimeDial + SpotsSheet
  lib/
    map/                   MapView, LayerToggles, Legend, windLayers.ts (sources/couches MapLibre + image du champ)
    time/                  TimeDial (module flottant : heure, gestes, point touché)
    sheet/                 SpotsSheet (fermé / half / full) + SpotList
    wind/                  arome.ts (format des données, décodage, vent en un point),
                           field.ts (valeurs, interpolation, isobandes, lignes de vent, grille de valeurs), pi.ts (AROME-PI),
                           units.ts, time.ts, windColor.ts (paliers)
    spots/                 spots.ts (données statiques), rating.ts (note d'un spot)
    stores/app.svelte.ts   état global (run, heures chargées, heure choisie, point touché, couches, vue)
```

## Règles UX
- Mobile-first (cible 360–430 px), portrait. Zones tactiles ≥ 44 px, `env(safe-area-inset-*)`.
- **Changer d'heure doit rester le geste le plus simple et le plus naturel** : un module flottant indépendant (`TimeDial`), qui ne s'ouvre pas. Le swipe horizontal fait 24 px par heure, et **doigt vers la droite = avancer**, comme l'a demandé l'utilisateur. Toucher ‹ › déplace d'une heure, et un appui long fait défiler en continu. Un tap sur les ticks saute à cette heure. Flèches ← → au clavier.
- La liste des spots (`SpotsSheet`) s'ouvre avec le bouton ☰ et se ferme au glisser ou avec ✕. Pas de modale. Seuls de petits boutons flottants sont tolérés sur la carte.
- Pas de `padding.bottom` pour le module de temps : `maxBounds` ignore le padding, et un padding laissait le bas de l'écran déborder des données (une bande sans vent). Seul le panneau des spots ouvert met la moitié de l'écran en padding, et il couvre ce débord.
- Trait de côte : seulement la classe `ocean` de la couche `water`. Les « lakes » OSM incluent les réservoirs à poissons de Piraillan, qui dessinaient un rectangle dans l'eau.
- Rotation de la carte désactivée : nord en haut.
- **La page ne zoome jamais**, seule la carte zoome : `touch-action: pan-x pan-y` sur `html`/`body`, `user-scalable=no` (Android), et `gesturestart` bloqué hors carte (iOS Safari ignore `user-scalable`).
- Frise du module de temps : un grand tick avec le nom du jour marque minuit, un petit marque midi, le bleu marque l'heure choisie.
- **Mises à jour** : le service worker est enregistré dans `lib/pwa.ts` (`autoUpdate`). Une nouvelle version s'installe et recharge la page toute seule. Elle est vérifiée au retour sur l'app, toutes les 30 min, et avec le bouton ⟳ (`app.refresh()` : nouvelle version, puis nouvelles données).

## Règles données et rendu
- Vitesses en **nœuds**. La direction indique **d'où vient** le vent (convention météo). Les flèches pointent **là où il va**.
- Heures affichées en `Europe/Paris`, clé `YYYY-MM-DDTHH:00`. `meta.json` donne les heures de validité en UTC.
- **Zones de couleur** : `isobands` (d3-contour, marching squares interpolé) produit des MultiPolygones cumulés (« ≥ seuil »), dessinés opaques dans l'ordre sous les libellés du fond de carte. d3-contour place la valeur de la cellule (x, y) en (x + 0,5, y + 0,5). Elles sont mémorisées par run, heure et type.
- **Lignes de vent** : `streamlines` (Jobard & Lefer) trace de longues lignes espacées de 14 px à l’écran, de l'amont vers l'aval. Les pointes sont des symboles `symbol-placement: line` (chevron dessiné vers l’est, tous les 35 px). Elles sont calculées sur la zone visible et recalculées à chaque `moveend` et à chaque changement d'heure.
- **Valeurs** : `labels` sur un réseau de pas `k` cellules, où `strideFor` garde au moins 14 px entre deux valeurs (une valeur par point de grille dès que ça tient, comme Meteociel). **MapLibre compte ses zooms en tuiles de 512 px.**

## Conventions
- La logique pure va dans `lib/**/*.ts` et a ses tests `*.test.ts` à côté. Les composants `.svelte` restent minces.
- L'objet `maplibregl.Map` et les tableaux décodés ne sont jamais mis dans un `$state` : ce sont des propriétés simples de `app`. Après l'arrivée d'une heure, incrémenter `app.dataVersion`.
- Pas de nouvelle dépendance sans le justifier.
