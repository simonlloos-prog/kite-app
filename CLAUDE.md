# Kite App — vent AROME HD sur le Bassin d'Arcachon

PWA mobile-first pour kitesurfeurs, rendu **façon Meteociel**, qui privilégie la lecture rapide à la finesse graphique. Sur une carte MapLibre, le vent AROME HD (Météo-France, 1,5 km) s'affiche en **bandes de couleur nettes** par paliers de 2–3 kn, séparées par un liseré. Par-dessus viennent des **lignes de vent continues** avec une pointe côté aval, et une grille régulière de valeurs en nœuds. Chaque couche s'active ou se désactive, et on bascule entre vent moyen et rafales. On change d'heure avec un **module flottant indépendant** en bas de l'écran. Toucher la carte affiche le vent du point touché. La liste des spots est dans un panneau séparé, fermé par défaut.

Testé puis rejeté : le réticule central, la frise horaire, le dégradé continu, les flèches isolées, et l'heure intégrée au panneau qui s'ouvre (voir l'historique git).

## Phase actuelle : POC
Le code actuel sert de **bac à sable** : on y teste des technos et des variantes d'UX sur téléphone. Il doit rester propre et lisible, sans viser l'architecture définitive. Une fois les bonnes approches trouvées, l'app sera **refaite avec une structure pensée à l'avance**. Conséquences :
- Préférer une variante isolée (un fichier, une couche, un flag) à une abstraction générique.
- Noter dans `docs/decisions.md` (à créer au besoin) ce qu'on a essayé, retenu ou rejeté, et pourquoi.

## Stack (décisions figées)
- Svelte 5 (runes) + Vite + TypeScript strict
- `maplibre-gl` ; fond de carte OpenFreeMap `https://tiles.openfreemap.org/styles/liberty` (sans clé, polices `Noto Sans Regular|Bold|Italic`)
- Données : Open-Meteo, modèle `meteofrance_arome_france_hd` (sans clé, CORS OK, **aucun backend**). Rafales disponibles. Une requête peut contenir plusieurs points (`latitude=a,b&longitude=c,d`) et renvoie alors un tableau.
- `vite-plugin-pwa` (Workbox) ; Vitest pour la logique pure
- Gestionnaire de paquets : **npm** (pnpm n'est pas installé)

## Commandes
```
npm run dev       # serveur de dev
npm run build     # build prod + service worker
npm run preview   # sert le build (tester la PWA / le hors-ligne)
npm test          # vitest
npm run check     # svelte-check + tsc
npm run dev:phone # serveur accessible depuis le téléphone sur le Wi-Fi local (sans HTTPS)
```

Déploiement : Netlify build `main` à chaque push (`netlify.toml`). Le HTTPS de Netlify est nécessaire pour tester sur téléphone la géolocalisation et l'installation de la PWA.

## Arborescence
```
src/
  App.svelte               MapView + Legend + LayerToggles + TimeDial + SpotsSheet
  app.css                  tokens (clair/sombre), safe-area
  lib/
    map/                   MapView, LayerToggles, Legend, windLayers.ts (sources/couches MapLibre + image du champ)
    time/                  TimeDial (module flottant : heure, gestes, point touché)
    sheet/                 SpotsSheet (fermé / half / full) + SpotList
    wind/                  openMeteo.ts (URL + parsing), cache.ts (arrondi + cache persistant + loadPoints),
                           domain.ts (grille fixe du Bassin), field.ts (champ, interpolation, lignes de vent),
                           units.ts, time.ts, windColor.ts (paliers)
    spots/                 spots.ts (données statiques), rating.ts (note d'un spot)
    stores/app.svelte.ts   état global (heures, heure choisie, point touché, couches, panneau)
```

## Règles UX
- Mobile-first (cible 360–430 px), portrait. Zones tactiles ≥ 44 px, `env(safe-area-inset-*)`.
- **Changer d'heure doit rester le geste le plus simple et le plus naturel** : un module flottant indépendant (`TimeDial`), qui ne s'ouvre pas. Le swipe horizontal fait 24 px par heure, et **doigt vers la droite = avancer**, comme l'a demandé l'utilisateur. Toucher ‹ › déplace d'une heure, et un appui long fait défiler en continu. Un tap sur les ticks saute à cette heure. Flèches ← → au clavier.
- La liste des spots (`SpotsSheet`) s'ouvre avec le bouton ☰ et se ferme au glisser ou avec ✕. Pas de modale. Seuls de petits boutons flottants sont tolérés sur la carte (couches, moyen/rafales, liste, géoloc).
- Le `padding.bottom` de la carte suit ce qui la couvre : le module de temps, ou la moitié de l'écran quand le panneau est ouvert.
- Rotation de la carte désactivée : les flèches restent lisibles, nord en haut.

## Règles données
- Vitesses en **nœuds**. La direction indique **d'où vient** le vent (convention météo). Les lignes de vent et les flèches pointent **là où il va**.
- Lignes de vent (`streamlines`) : on part de chaque germe d'un réseau régulier et on suit le vent interpolé en vecteurs, dans les deux sens. Il y a deux jeux : un grossier sous le zoom 12, un fin au-dessus. Leur longueur vaut 1,6 × l'espacement des germes, pour que les lignes voisines se chevauchent en traits continus.
- Heures en `Europe/Paris`, clé horaire `YYYY-MM-DDTHH:00` (format Open-Meteo).
- **Grille fixe** `DOMAIN` (44,50–44,85 N, 1,35–0,95 O, pas de 0,025°, soit 15 × 17 = 255 points) + les spots, chargés **une fois pour tout l'horizon AROME HD** (`forecast_days=3`, on ne garde que les heures avec données, environ 45–48 h). Changer d'heure ne fait aucune requête. L'image du champ (bilinéaire, paliers + liserés, 512 px) est mémorisée par heure et par type.
- Le cache est persisté dans `localStorage` (`wind-cache-v2`, TTL 30 min) et rafraîchi au retour sur l'app (`visibilitychange`). Les points sont arrondis à 0,0125° (`keyOf`) avant tout fetch.
- Les appels Open-Meteo vivent uniquement dans `src/lib/wind/`.
- Quota gratuit Open-Meteo : environ 600 appels/minute et 10 000/jour, et **chaque point d'une requête multi-points compte comme un appel**. Un chargement complet coûte environ 264 appels : ne pas agrandir ni densifier `DOMAIN` sans recalculer. Un `$effect` qui relance un fetch doit passer par `untrack` : une boucle d'effet épuise le quota en quelques secondes (erreur 429).

## Conventions
- La logique pure va dans `lib/**/*.ts` et a ses tests `*.test.ts` à côté. Les composants `.svelte` restent minces.
- L'objet `maplibregl.Map` n'est jamais mis dans un `$state` : c'est une propriété simple de `app`.
- Le cache vent n'est pas réactif : après un chargement, incrémenter `app.cacheVersion`, et le lire dans les `$effect` qui en dépendent.
- Pas de nouvelle dépendance sans le justifier.
