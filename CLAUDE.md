# Kite App — vent AROME HD sur le Bassin d'Arcachon

PWA mobile-first pour kitesurfeurs, rendu **façon Meteociel** : sur une carte MapLibre, un champ de vent AROME HD (Météo-France, 1,5 km) coloré et lissé, avec les valeurs et les flèches de vent par-dessus. Chaque couche s'active ou se désactive, et on bascule entre vent moyen et rafales. On change d'heure par un **swipe horizontal** sur le bandeau du bas. Il n'y a ni réticule ni frise horaire, deux idées testées puis rejetées. Toucher la carte affiche le vent du point touché. Toute l'interface tient dans **un seul panneau bas à 3 crans** : bandeau du temps, puis liste des spots.

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
  App.svelte               MapView + Reticle + LayerToggles + BottomSheet
  app.css                  tokens (clair/sombre), safe-area
  lib/
    map/                   MapView, LayerToggles, windLayers.ts (sources/couches MapLibre + image du champ)
    sheet/                 BottomSheet (3 crans, gestes) + TimeBar (heure, point touché) + SpotList
    wind/                  openMeteo.ts (URL + parsing), cache.ts (arrondi + cache persistant + loadPoints),
                           domain.ts (grille fixe du Bassin), field.ts (champ + interpolation),
                           units.ts, time.ts, windColor.ts (échelle continue)
    spots/                 spots.ts (données statiques), rating.ts (note d'un spot)
    stores/app.svelte.ts   état global (centre, vent cible, heure choisie, cran, couches)
```

## Règles UX
- Mobile-first (cible 360–430 px), portrait. Zones tactiles ≥ 44 px, `env(safe-area-inset-*)`.
- **Un seul panneau bas** à 3 crans (`peek` / `half` / `full`), sans modale ni second panneau. Seuls de petits boutons flottants sont tolérés sur la carte (couches, moyen/rafales, géoloc).
- **Changer d'heure doit rester immédiat** : swipe horizontal sur l'en-tête du panneau, 28 px par heure (doigt vers la gauche = avancer). Le sens du geste se décide après 8 px : vertical = panneau, horizontal = temps, tap = cran suivant. Flèches ← → au clavier.
- Le `padding.bottom` de la carte suit le cran (plafonné au cran `half`).
- Rotation de la carte désactivée : les flèches restent lisibles, nord en haut.

## Règles données
- Vitesses en **nœuds**. La direction indique **d'où vient** le vent (convention météo) ; la flèche est tournée de `dir + 180` pour pointer là où il va.
- Heures en `Europe/Paris`, clé horaire `YYYY-MM-DDTHH:00` (format Open-Meteo).
- **Grille fixe** `DOMAIN` (44,50–44,85 N, 1,35–0,95 O, pas de 0,025°, soit 15 × 17 = 255 points) + les spots, chargés **une fois pour les 48 h**. Changer d'heure ne fait aucune requête. L'image du champ (bilinéaire, 256 px) est mémorisée par heure et par type.
- Le cache est persisté dans `localStorage` (`wind-cache-v1`, TTL 30 min) et rafraîchi au retour sur l'app (`visibilitychange`). Les points sont arrondis à 0,0125° (`keyOf`) avant tout fetch.
- Les appels Open-Meteo vivent uniquement dans `src/lib/wind/`.
- Quota gratuit Open-Meteo : environ 600 appels/minute et 10 000/jour, et **chaque point d'une requête multi-points compte comme un appel**. Un chargement complet coûte environ 264 appels : ne pas agrandir ni densifier `DOMAIN` sans recalculer. Un `$effect` qui relance un fetch doit passer par `untrack` : une boucle d'effet épuise le quota en quelques secondes (erreur 429).

## Conventions
- La logique pure va dans `lib/**/*.ts` et a ses tests `*.test.ts` à côté. Les composants `.svelte` restent minces.
- L'objet `maplibregl.Map` n'est jamais mis dans un `$state` : c'est une propriété simple de `app`.
- Le cache vent n'est pas réactif : après un chargement, incrémenter `app.cacheVersion`, et le lire dans les `$effect` qui en dépendent.
- Pas de nouvelle dépendance sans le justifier.
