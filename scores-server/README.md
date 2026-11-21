# SpellMaze shared score board

A Cloudflare Worker with a D1 (SQLite) database. It speaks the original iOS client's score protocol
(`ScoresComm`, version 0.3) as JSON. The free tier covers this easily: 100k requests a day, 5 GB of
storage, and no expiry.

## API

`POST /v1/scores`, with a JSON body:

```json
{ "identity": "<uuid>", "identity-nick": "Dror", "identity-icon": "", "locale": "en-US",
  "game": "<game uuid>", "language": "<ontology uuid>", "game-toplevel": 3,
  "query-type": "game_language",
  "games-scores": [{"type": "global", "score": 12345}, {"type": "game", "score": 9000},
                   {"type": "language", "score": 11000}, {"type": "game_language", "score": 9000}] }
```

It records the scores, which only go up per identity and scope, then returns a table of six rows:

```json
{ "version": "0.3", "query-type": "game_language",
  "score-table": { "total": 42, "entries": [{"position": 1, "score": 9000, "nick": "Dror", "icon": "", "me": true}] } }
```

`query-type` is one of `global`, `game_language`, `game`, `language`, or one of those prefixed with `my_`.
The `my_` variants return the rows around the player's own position. `GET /v1/health` checks that the service is up.

Safeguards:
* identities and UUIDs are validated
* nicknames are cleaned: at most 20 characters, no control or invisible characters, the original "nick/code"
  suffixes dropped, and a short profanity list masked
* scores never decrease, and an increase of more than 5,000,000 in one submission is ignored
* at most one write per identity every 3 seconds
* CORS allows only the origins in `ALLOWED_ORIGINS`

A game that runs in the browser can always be made to submit fake scores. These checks only make it harder.

## Deployment

Live at **https://spellmaze-scores.spellmaze-scores.workers.dev**, with D1 database `spellmaze-scores`.
To redeploy after changing `src/index.js`, run `npx wrangler deploy`.

## Deploying from scratch

You need Node.js and a free Cloudflare account.

```sh
cd scores-server
npm install
npx wrangler login                          # opens a browser to authorize wrangler
npx wrangler d1 create spellmaze-scores     # copy the printed database_id into wrangler.toml
npm run db:init:remote                      # create the tables
npx wrangler deploy                         # prints the URL, e.g. https://spellmaze-scores.<you>.workers.dev
```

Then point the game at it: add `Scores: <that URL>` to `data/manifest.txt`, commit and push.
The SCORES entry appears in the main menu once a score server is configured.

## Local development

```sh
npm run db:init:local
npx wrangler dev --port 8787
# and temporarily add  "Scores: http://127.0.0.1:8787"  to data/manifest.txt
```
