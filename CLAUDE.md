# Kite App — vent AROME sur le Bassin d'Arcachon

PWA mobile-first pour kitesurfeurs, rendu **façon Meteociel** (lecture rapide plutôt que finesse graphique). La carte MapLibre affiche le vent AROME 0,01° (~1,3 km) de Météo-France, de Lacanau à Mimizan et loin au large :
- des **zones de couleur vectorielles** par paliers de 2–3 kn, nettes à tous les zooms, avec un liseré et le trait de côte redessiné par-dessus ;
- une **grille régulière de petites valeurs en nœuds** ;
- de **longues lignes de vent continues, régulièrement espacées, avec des pointes de flèche intégrées** le long de chaque ligne.

La carte est **bloquée sur la zone des données** (`maxBounds`) : on ne peut pas dézoomer sur un bord vide.

Chaque couche s'active ou se désactive, et on bascule entre vent moyen et rafales. On change d'heure avec un **module flottant indépendant** en bas de l'écran. Toucher la carte affiche le vent du point touché. La liste des spots est dans un panneau séparé, fermé par défaut.

Testé puis rejeté (voir l'historique git) : le réticule central, la frise horaire, le dégradé continu, les flèches isolées ou en quinconce (pas assez « continues »), le champ en image raster (bords pixelisés), l'heure intégrée au panneau qui s'ouvre, et Open-Meteo appelé depuis le navigateur (quota par point, trop peu de valeurs).

## Phase actuelle : POC
Le code sert de **bac à sable** pour tester des variantes sur téléphone. Il doit rester propre et lisible, sans viser l'architecture définitive. L'app sera **refaite ensuite avec une structure pensée à l'avance**. Conséquences :
- Préférer une variante isolée (un fichier, une couche, un flag) à une abstraction générique.
- Noter dans `docs/decisions.md` (à créer au besoin) ce qu'on a essayé, retenu ou rejeté, et pourquoi.

## Architecture
```
Météo-France open data ──► pipeline/fetch_arome.py ──► public/data/ ──► build Vite ──► GitHub Pages
(GRIB2 AROME 0,01°, SP1)   (GitHub Actions, chaque heure)  meta.json + <run>/hNN.bin      (app + données)
```
- **Source** : `https://meteofrance-pnt.s3.rbx.io.cloud.ovh.net/pnt/<run>/arome/001/SP1/arome__001__SP1__<NN>H__<run>.grib2`. C'est le jeu de données data.gouv « Paquets Arome - Résolution 0,01° », en Licence Ouverte 2.0, sans clé. Il y a un run toutes les 3 h, avec 52 échéances (0 à 51 h), soit environ 23 Mo par fichier. On utilise `10u`, `10v` et `max_10efg`/`max_10nfg` (rafale max de l'heure écoulée, absente à l'échéance 0).
- **Pipeline** (Python, `eccodes` + `numpy`) : il prend le dernier run complet, découpe `BOX` (44,10–45,10 N, 1,90–0,80 O, 101 × 111 points) et écrit un fichier binaire par heure (~34 Ko). Le format est documenté en tête de `fetch_arome.py` : `int8` u, `int8` v, `uint8` rafale, 0,5 kn par unité, ligne 0 au sud.
- **Workflow** `.github/workflows/deploy.yml` : il se lance à chaque push et toutes les heures (`:25`). En mode planifié, il s'arrête si le run publié est toujours le dernier. Un run complet prend environ 4 minutes.
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
npm run data      # pipeline local, 13 heures (Python + `pip install -r pipeline/requirements.txt`)
npm run build     # build prod + service worker (BASE_PATH=/kite-app/ pour GitHub Pages)
npm run preview   # sert le build (tester la PWA / le hors-ligne)
npm test          # vitest
npm run check     # svelte-check + tsc
npm run dev:phone # serveur accessible depuis le téléphone sur le Wi-Fi local (sans HTTPS)
```
`public/data/` est généré et ignoré par git. Dans la console du navigateur, en dev, `window.app` donne accès à l'état de l'app.

## Arborescence
```
pipeline/                  fetch_arome.py (GRIB → binaire), requirements.txt
src/
  App.svelte               MapView + Legend + LayerToggles + TimeDial + SpotsSheet
  lib/
    map/                   MapView, LayerToggles, Legend, windLayers.ts (sources/couches MapLibre + image du champ)
    time/                  TimeDial (module flottant : heure, gestes, point touché)
    sheet/                 SpotsSheet (fermé / half / full) + SpotList
    wind/                  arome.ts (format des données, décodage, vent en un point),
                           field.ts (valeurs, interpolation, isobandes, lignes de vent, grille de valeurs),
                           units.ts, time.ts, windColor.ts (paliers)
    spots/                 spots.ts (données statiques), rating.ts (note d'un spot)
    stores/app.svelte.ts   état global (run, heures chargées, heure choisie, point touché, couches, vue)
```

## Règles UX
- Mobile-first (cible 360–430 px), portrait. Zones tactiles ≥ 44 px, `env(safe-area-inset-*)`.
- **Changer d'heure doit rester le geste le plus simple et le plus naturel** : un module flottant indépendant (`TimeDial`), qui ne s'ouvre pas. Le swipe horizontal fait 24 px par heure, et **doigt vers la droite = avancer**, comme l'a demandé l'utilisateur. Toucher ‹ › déplace d'une heure, et un appui long fait défiler en continu. Un tap sur les ticks saute à cette heure. Flèches ← → au clavier.
- La liste des spots (`SpotsSheet`) s'ouvre avec le bouton ☰ et se ferme au glisser ou avec ✕. Pas de modale. Seuls de petits boutons flottants sont tolérés sur la carte.
- Le `padding.bottom` de la carte suit ce qui la couvre : le module de temps, ou la moitié de l'écran quand le panneau est ouvert.
- Rotation de la carte désactivée : nord en haut.

## Règles données et rendu
- Vitesses en **nœuds**. La direction indique **d'où vient** le vent (convention météo). Les flèches pointent **là où il va**.
- Heures affichées en `Europe/Paris`, clé `YYYY-MM-DDTHH:00`. `meta.json` donne les heures de validité en UTC.
- **Zones de couleur** : `isobands` (d3-contour, marching squares interpolé) produit des MultiPolygones cumulés (« ≥ seuil »), dessinés opaques dans l'ordre sous les libellés du fond de carte. d3-contour place la valeur de la cellule (x, y) en (x + 0,5, y + 0,5). Elles sont mémorisées par run, heure et type.
- **Lignes de vent** : `streamlines` (Jobard & Lefer) trace de longues lignes espacées de 26 px à l'écran, de l'amont vers l'aval. Les pointes sont des symboles `symbol-placement: line` (chevron dessiné vers l'est, tous les 70 px). Elles sont calculées sur la zone visible et recalculées à chaque `moveend` et à chaque changement d'heure.
- **Valeurs** : `labels` sur un réseau de pas `k` cellules, où `strideFor` garde au moins 24 px entre deux valeurs. **MapLibre compte ses zooms en tuiles de 512 px.**

## Conventions
- La logique pure va dans `lib/**/*.ts` et a ses tests `*.test.ts` à côté. Les composants `.svelte` restent minces.
- L'objet `maplibregl.Map` et les tableaux décodés ne sont jamais mis dans un `$state` : ce sont des propriétés simples de `app`. Après l'arrivée d'une heure, incrémenter `app.dataVersion`.
- Pas de nouvelle dépendance sans le justifier.
