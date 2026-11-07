# Worker `kite-obs` : vent mesuré en direct

Petit programme hébergé chez Cloudflare (offre gratuite). L'app lui demande `GET /obs` et reçoit les
dernières mesures des stations (Météo-France, Holfuy, Weameter), gardées 2 min en mémoire. Le code des
sources est partagé avec l'app : `src/lib/wind/obsSources.ts`.

## Développement
```
npm run worker:dev        # http://127.0.0.1:8787/obs
```
La clé Météo-France vient de `worker/.dev.vars` (`METEOFRANCE_API_KEY=…`, ignoré par git). En dev,
l'app lit le Worker local si `.env.development.local` contient `VITE_OBS_URL=http://127.0.0.1:8787/obs`.

## Déploiement
```
npx wrangler@4.151.2 login                                                   # une fois, ouvre le navigateur
npx wrangler@4.151.2 secret put METEOFRANCE_API_KEY --config worker/wrangler.toml   # une fois, colle la clé
npm run worker:deploy                                                        # à chaque changement du Worker
```
L'adresse publique (`https://kite-obs.<compte>.workers.dev/obs`) est dans `.env.production`
(`VITE_OBS_URL`), lue au build de l'app.
