# Worker `kite-obs` : les données de l'app

Petit programme hébergé chez Cloudflare (offre gratuite) :
- `GET /obs` : dernières mesures des stations (Météo-France, Holfuy, Weameter), gardées 30 s en
  mémoire. Le code des sources est partagé avec l'app : `src/lib/wind/obsSources.ts`.
- `GET /data/<clé>` : fichiers de prévision (`meta.json`, heures, AROME-PI) du bucket R2 `kite-data`,
  déposés par le workflow GitHub.
- Toutes les 5 min (tâche planifiée) : lance le workflow GitHub quand un nouveau run AROME ou AROME-PI
  est attendu (`check.ts`). `GET /status` montre sa décision du moment sans rien lancer.

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
npx wrangler@4.151.2 secret put GITHUB_TOKEN --config worker/wrangler.toml         # une fois, jeton GitHub (Actions, kite-app)
npx wrangler@4.151.2 secret put HOLFUY_JENNY_CLE --config worker/wrangler.toml     # une fois, clé Holfuy de La Jenny
npm run worker:deploy                                                        # à chaque changement du Worker
```
Adresse publique : `https://kite-obs.kite-app.workers.dev`, dans `.env.production` (`VITE_OBS_URL`,
`VITE_DATA_URL`), lue au build de l'app.

## Stockage R2
Bucket `kite-data` (préfixe `data/`), créé avec `wrangler r2 bucket create kite-data`, règle
`old-runs` qui efface après 3 jours (`wrangler r2 bucket lifecycle add kite-data old-runs data/ --expire-days 3`).
Le workflow y dépose avec un jeton R2 « Object Read & Write » limité au bucket (secrets GitHub
`R2_ACCESS_KEY_ID` et `R2_SECRET_ACCESS_KEY`).
