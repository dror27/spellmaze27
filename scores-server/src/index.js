// SpellMaze shared score board - a Cloudflare Worker backed by D1 (SQLite).
//
// Speaks the request/response shape of the original iOS client (ScoresComm, protocol version 0.3),
// as JSON instead of an XML plist:
//
// POST /v1/scores
//   { version, program, identity, "identity-nick", "identity-icon", locale, game, language,
//     "game-toplevel", "query-type", "games-scores": [{type: global|game|language|game_language, score}] }
// -> { version, "query-type", "score-table": { entries: [{position, score, nick, icon, me}], total } }
//
// query-type: global | my_global | game_language | my_game_language | game | my_game | language | my_language
//   (the "my_" variants return the rows around the player's own position)

const VERSION = '0.3';
const TABLE_SIZE = 6;					// rows shown by the client (ScoreTableWidget)
const MAX_SCORE = 2000000000;
const MAX_INCREASE_PER_SUBMIT = 5000000;	// plausibility limit between two submissions
const MIN_WRITE_INTERVAL_SECS = 3;		// per identity
const MAX_NICK = 20;
const MAX_ICON = 4;

const UUID_RE = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;

// a small, deliberately conservative list; matching words in nicknames are masked
const BLOCKED = ['fuck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'whore', 'bitch', 'rape', 'nazi', 'hitler', 'porn', 'dick', 'pussy', 'cock', 'asshole'];

function corsHeaders(request, env) {
	const origin = request.headers.get('Origin') || '';
	const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
	const ok = allowed.includes('*') || allowed.includes(origin);
	return {
		'Access-Control-Allow-Origin': ok ? origin : (allowed[0] || '*'),
		'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
		'Access-Control-Max-Age': '86400',
		'Vary': 'Origin'
	};
}

function json(data, status, headers) {
	return new Response(JSON.stringify(data), {
		status: status || 200,
		headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {})
	});
}

export function cleanNick(nick, identity) {
	let s = String(nick || '').normalize('NFC')
		.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
		.replace(/\s+/g, ' ').trim();
	// the original used "nick/code" suffixes for cheat codes: never show them
	s = s.split('/')[0].trim();
	if ([...s].length > MAX_NICK)
		s = [...s].slice(0, MAX_NICK).join('').trim();
	const lower = s.toLowerCase();
	for (const w of BLOCKED) {
		let i = lower.indexOf(w);
		while (i >= 0) {
			s = s.slice(0, i) + '*'.repeat(w.length) + s.slice(i + w.length);
			i = lower.indexOf(w, i + w.length);
		}
	}
	if (!s.replace(/\*/g, '').trim())
		s = 'Player-' + String(identity || '').slice(0, 4).toUpperCase();
	return s;
}

function cleanIcon(icon) {
	const s = String(icon || '').replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
	return [...s].slice(0, MAX_ICON).join('');
}

function scopeFor(type, game, language) {
	switch (type) {
		case 'global': return 'global';
		case 'game': return game ? `game:${game}` : null;
		case 'language': return language ? `language:${language}` : null;
		case 'game_language': return game && language ? `game_language:${game}:${language}` : null;
		default: return null;
	}
}

async function submit(env, req, now) {
	const identity = req.identity;
	const nick = cleanNick(req['identity-nick'], identity);
	const icon = cleanIcon(req['identity-icon']);
	const locale = String(req.locale || '').slice(0, 20);
	const db = env.DB;

	const player = await db.prepare('SELECT updated_at FROM players WHERE identity = ?').bind(identity).first();
	if (player && now - player.updated_at < MIN_WRITE_INTERVAL_SECS)
		return false;		// too frequent: answer the query only
	if (player)
		await db.prepare('UPDATE players SET nick = ?, icon = ?, locale = ?, updated_at = ? WHERE identity = ?')
			.bind(nick, icon, locale, now, identity).run();
	else
		await db.prepare('INSERT INTO players (identity, nick, icon, locale, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(identity, nick, icon, locale, now, now).run();

	const topLevel = Number.isInteger(req['game-toplevel']) ? req['game-toplevel'] : -1;
	const stmts = [];
	for (const gs of Array.isArray(req['games-scores']) ? req['games-scores'] : []) {
		const scope = scopeFor(gs && gs.type, req.game, req.language);
		const score = Math.trunc(Number(gs && gs.score));
		if (!scope || !Number.isFinite(score) || score <= 0 || score > MAX_SCORE)
			continue;
		const prev = await db.prepare('SELECT score FROM scores WHERE scope = ? AND identity = ?').bind(scope, identity).first();
		if (prev && score <= prev.score)
			continue;
		if (score - (prev ? prev.score : 0) > MAX_INCREASE_PER_SUBMIT)
			continue;		// implausible jump: ignore
		stmts.push(db.prepare(`INSERT INTO scores (scope, identity, score, top_level, updated_at) VALUES (?, ?, ?, ?, ?)
			ON CONFLICT (scope, identity) DO UPDATE SET score = excluded.score, top_level = excluded.top_level, updated_at = excluded.updated_at`)
			.bind(scope, identity, score, scope.startsWith('global') ? -1 : topLevel, now));
	}
	if (stmts.length)
		await db.batch(stmts);
	return true;
}

async function scoreTable(env, req) {
	const qt = String(req['query-type'] || 'game_language');
	const mine = qt.startsWith('my_');
	const scope = scopeFor(mine ? qt.slice(3) : qt, req.game, req.language);
	if (!scope)
		return { entries: [], total: 0 };
	const db = env.DB;
	const total = (await db.prepare('SELECT COUNT(*) AS n FROM scores WHERE scope = ?').bind(scope).first()).n;
	let offset = 0;
	if (mine) {
		const me = await db.prepare('SELECT score, updated_at FROM scores WHERE scope = ? AND identity = ?').bind(scope, req.identity).first();
		if (me) {
			const better = (await db.prepare(
				'SELECT COUNT(*) AS n FROM scores WHERE scope = ? AND (score > ? OR (score = ? AND updated_at < ?))')
				.bind(scope, me.score, me.score, me.updated_at).first()).n;
			offset = Math.max(0, Math.min(better - Math.floor(TABLE_SIZE / 2) + 1, total - TABLE_SIZE));
		}
	}
	const rows = await db.prepare(
		`SELECT s.identity, s.score, p.nick, p.icon FROM scores s JOIN players p ON p.identity = s.identity
		 WHERE s.scope = ? ORDER BY s.score DESC, s.updated_at ASC LIMIT ? OFFSET ?`)
		.bind(scope, TABLE_SIZE, offset).all();
	return {
		total,
		entries: (rows.results || []).map((r, i) => ({
			position: offset + i + 1, score: r.score, nick: r.nick, icon: r.icon || '', me: r.identity === req.identity
		}))
	};
}

export default {
	async fetch(request, env) {
		const cors = corsHeaders(request, env);
		if (request.method === 'OPTIONS')
			return new Response(null, { status: 204, headers: cors });
		const url = new URL(request.url);
		if (url.pathname === '/v1/health')
			return json({ ok: true, version: VERSION }, 200, cors);
		if (url.pathname !== '/v1/scores' || request.method !== 'POST')
			return json({ error: 'not found' }, 404, cors);

		let req;
		try {
			const text = await request.text();
			if (text.length > 20000)
				return json({ version: VERSION, error: 'request too large' }, 413, cors);
			req = JSON.parse(text);
		} catch (e) {
			return json({ version: VERSION, error: 'bad request' }, 400, cors);
		}
		if (!req || typeof req !== 'object' || !UUID_RE.test(String(req.identity || '')))
			return json({ version: VERSION, error: 'bad identity' }, 400, cors);
		for (const k of ['game', 'language'])
			if (req[k] !== undefined && req[k] !== null && !UUID_RE.test(String(req[k])))
				return json({ version: VERSION, error: `bad ${k}` }, 400, cors);
		req.identity = req.identity.toUpperCase();
		if (req.game)
			req.game = req.game.toUpperCase();
		if (req.language)
			req.language = req.language.toUpperCase();

		try {
			const now = Math.floor(Date.now() / 1000);
			await submit(env, req, now);
			const table = await scoreTable(env, req);
			return json({ version: VERSION, 'query-type': req['query-type'] || 'game_language', 'score-table': table }, 200, cors);
		} catch (e) {
			return json({ version: VERSION, error: 'server error' }, 500, cors);
		}
	}
};
