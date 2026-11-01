# Kite App — vent AROME HD sur le Bassin d'Arcachon

PWA mobile-first pour kitesurfeurs. Une carte MapLibre plein écran avec un **réticule fixe au centre** : le vent prévu par AROME HD (Météo-France, 1,5 km) sous la cible s'affiche en direct quand on déplace la carte. Une grille de **valeurs de vent façon Meteociel** (chiffres colorés + flèches) se superpose à la carte et s'active ou se désactive. Toute l'interface tient dans **un seul panneau bas à 3 crans**. Les spots du Bassin sont préchargés.

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
    map/                   MapView, Reticle, LayerToggles, windLayers.ts (sources/couches MapLibre)
    sheet/                 BottomSheet (3 crans) + PeekView / HalfView / FullView
    wind/                  openMeteo.ts (URL + parsing), cache.ts (arrondi grille + cache + loadPoints),
                           grid.ts (grille visible), units.ts, time.ts, windColor.ts
    spots/                 spots.ts (données statiques), rating.ts (note d'un spot)
    stores/app.svelte.ts   état global (centre, vent cible, heure choisie, cran, couches)
```

## Règles UX
- Mobile-first (cible 360–430 px), portrait. Zones tactiles ≥ 44 px, `env(safe-area-inset-*)`.
- **Un seul panneau bas** à 3 crans (`peek` / `half` / `full`), sans modale ni second panneau. Seuls de petits boutons flottants sont tolérés sur la carte (couches, géoloc).
- Le réticule reste au centre de la **zone visible** : le `padding.bottom` de la carte suit le cran (plafonné au cran `half`), et `getCenter()` renvoie donc le point sous le réticule.
- Rotation de la carte désactivée : les flèches restent lisibles, nord en haut.

## Règles données
- Vitesses en **nœuds**. La direction indique **d'où vient** le vent (convention météo) ; la flèche est tournée de `dir + 180` pour pointer là où il va.
- Heures en `Europe/Paris`, clé horaire `YYYY-MM-DDTHH:00` (format Open-Meteo).
- Chaque point est **arrondi à la grille 0,0125°** (`keyOf`/`snapPoint`) avant tout fetch, et les pas de la grille visible en sont des multiples : la cible, la grille et les spots partagent le même cache.
- Les appels Open-Meteo vivent uniquement dans `src/lib/wind/`. Chaque appel déclenché par un mouvement de carte passe par un `AbortController`.
- Quota gratuit Open-Meteo : environ 600 appels/minute et 10 000/jour, et **chaque point d'une requête multi-points compte comme un appel**. Garder la grille ≤ 120 points (espacés d'au moins 64 px) et le cache TTL à 30 min. Un `$effect` qui relance un fetch doit passer par `untrack` : une boucle d'effet épuise le quota en quelques secondes (erreur 429).

## Conventions
- La logique pure va dans `lib/**/*.ts` et a ses tests `*.test.ts` à côté. Les composants `.svelte` restent minces.
- L'objet `maplibregl.Map` n'est jamais mis dans un `$state` : c'est une propriété simple de `app`.
- Le cache vent n'est pas réactif : après un chargement, incrémenter `app.cacheVersion`, et le lire dans les `$effect` qui en dépendent.
- Pas de nouvelle dépendance sans le justifier.
