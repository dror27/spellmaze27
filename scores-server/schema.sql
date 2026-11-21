-- SpellMaze shared score board (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS players (
	identity   TEXT PRIMARY KEY,          -- a random UUID per browser (UserPrefs identity-uuid)
	nick       TEXT NOT NULL,
	icon       TEXT NOT NULL DEFAULT '',  -- optional short text/emoji shown instead of the position
	locale     TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

-- one row per player per scope:
--   global                     all games, all languages
--   game:<game uuid>           best for a game
--   language:<language uuid>   total for a language
--   game_language:<game>:<language>
CREATE TABLE IF NOT EXISTS scores (
	scope      TEXT NOT NULL,
	identity   TEXT NOT NULL,
	score      INTEGER NOT NULL,
	top_level  INTEGER NOT NULL DEFAULT -1,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (scope, identity)
);

CREATE INDEX IF NOT EXISTS scores_rank ON scores (scope, score DESC, updated_at ASC);
