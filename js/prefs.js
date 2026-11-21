// SpellMaze - user preferences (NSUserDefaults replacement, persisted in localStorage)
//
// As in the original, a key of the form "<UUID>/<path>" that is not explicitly set by the user
// is looked up in the "prefs-data" dictionary of the loaded object with that UUID (typically a level).

import { dictGet, dictHas, toBool, toInt, toFloat } from './util.js';

export const PK_SCORE = 'score';
export const PK_LEVEL_ENABLED = 'level-enabled';
export const PK_LEVEL_PASSED = 'level-passed';
export const PK_IDENTITY_UUID = 'identity-uuid';
export const PK_LAST_LEVEL = 'last-level';
export const PK_GAME_SPEED = 'pref_game_speed';
export const PK_LEVEL_SET = 'pref_level_set';
export const PK_BRAND = 'pref_brand';
export const PK_LANG_WHITELIST = 'pref_lang_whitelist';
export const PK_LANG_DEFAULT = 'pref_default_language';
export const PK_LANG_DEFAULT_PREV = 'pref_default_language_prev';
export const PK_SOUND_ENABLED = 'pref_sound_enabled';
export const PK_TTS_ENABLED = 'pref_tts_enabled';

export const CHEAT_ENABLE_ALL_LEVELS = 'pref_cheat_enable_all_levels';
export const CHEAT_REPEAT_WORDS_IN_LEVEL = 'pref_cheat_repeat_words_in_level';
export const CHEAT_PLAY_PAUSE_AT_WILL = 'pref_cheat_play_pause';
export const CHEAT_SHOW_HINTS_AT_WILL = 'pref_cheat_show_hint';
export const CHEAT_DISABLE_ALL_DECORATIONS = 'pref_cheat_disable_decorations';
export const CHEAT_LEVEL_END_MENU = 'pref_cheat_level_end_menu';
export const CHEAT_SPEAK_LETTER_SPELLING = 'pref_cheat_speak_spell';
export const CHEAT_WIDE_CELLS = 'pref_cheat_wide_cells';
export const CHEAT_OLD_IMAGE_HINTS = 'pref_cheat_old_image_hint';
export const CHEAT_TEXT_HINT_MODE_1 = 'pref_cheat_text_hint';
export const CHEAT_TEXT_HINT_MODE_2 = 'pref_cheat_text_hint2';
export const CHEAT_AUTORUN = 'pref_cheat_autorun';
export const CHEAT_AUTORUN_LEVEL_LOOP = 'pref_cheat_autorun_level_loop';
export const CHEAT_AUTORUN_GAME_LOOP = 'pref_cheat_autorun_game_loop';
export const CHEAT_AUTORUN_ACCUMULATE_SCORE = 'pref_cheat_autorun_accumulate_score';

// the nickname escape codes of the original (RoleManager): "Nick/code/code..." turns cheats on
export const CHEAT_CODES = {
	[CHEAT_ENABLE_ALL_LEVELS]: 'eal',
	[CHEAT_REPEAT_WORDS_IN_LEVEL]: 'rwil',
	[CHEAT_PLAY_PAUSE_AT_WILL]: 'ppaw',
	[CHEAT_SHOW_HINTS_AT_WILL]: 'shaw',
	[CHEAT_DISABLE_ALL_DECORATIONS]: 'dad',
	[CHEAT_LEVEL_END_MENU]: 'lem',
	[CHEAT_SPEAK_LETTER_SPELLING]: 'sls',
	[CHEAT_WIDE_CELLS]: 'wc',
	[CHEAT_OLD_IMAGE_HINTS]: 'oih',
	[CHEAT_TEXT_HINT_MODE_1]: 'thm1',
	[CHEAT_TEXT_HINT_MODE_2]: 'thm2',
	[CHEAT_AUTORUN]: 'ar',
	[CHEAT_AUTORUN_LEVEL_LOOP]: 'arll',
	[CHEAT_AUTORUN_GAME_LOOP]: 'argl',
	[CHEAT_AUTORUN_ACCUMULATE_SCORE]: 'aras'
};
export const PK_IDENTITY_NICK_KEY = 'pref_scoring_nickname';

// short descriptions, for the in-game Cheat Codes page (docs/CHEAT_CODES.md has the details)
export const CHEAT_INFO = [
	[CHEAT_ENABLE_ALL_LEVELS, 'Enable All Levels', 'every level is unlocked'],
	[CHEAT_REPEAT_WORDS_IN_LEVEL, 'Repeat Words', 'a word can be used again in the same level'],
	[CHEAT_PLAY_PAUSE_AT_WILL, 'Pause At Will', 'every level gets a pause button'],
	[CHEAT_SHOW_HINTS_AT_WILL, 'Hints At Will', 'every level gets a hint button'],
	[CHEAT_LEVEL_END_MENU, 'Level End Menu', 'passed levels offer "Play Remaining Words"'],
	[CHEAT_DISABLE_ALL_DECORATIONS, 'No Decorations', 'no bombs, coins or apples'],
	[CHEAT_SPEAK_LETTER_SPELLING, 'Speak Spelling', 'spoken hints spell the word out'],
	[CHEAT_WIDE_CELLS, 'Wide Cells', 'half the columns, on levels without their own board'],
	[CHEAT_OLD_IMAGE_HINTS, 'Old Image Hints', 'the original polaroid picture hints'],
	[CHEAT_TEXT_HINT_MODE_1, 'Text Hints', 'show word texts in the score panel'],
	[CHEAT_TEXT_HINT_MODE_2, 'Text Only Hints', 'with thm1: show the text but not the word'],
	[CHEAT_AUTORUN, 'Autorun', 'the game plays itself'],
	[CHEAT_AUTORUN_LEVEL_LOOP, 'Autorun Level Loop', 'with ar: repeat the same level'],
	[CHEAT_AUTORUN_GAME_LOOP, 'Autorun Game Loop', 'with ar: start over after the last level'],
	[CHEAT_AUTORUN_ACCUMULATE_SCORE, 'Autorun Scores', 'with ar: self-played words score']
];

// cheats that make scores easier to get: while one is on, scores aren't sent to the shared score board
export function scoreAffectingCheats() {
	const on = [CHEAT_ENABLE_ALL_LEVELS, CHEAT_REPEAT_WORDS_IN_LEVEL, CHEAT_PLAY_PAUSE_AT_WILL, CHEAT_SHOW_HINTS_AT_WILL,
		CHEAT_LEVEL_END_MENU].filter(c => UserPrefs.cheat(c));
	if (UserPrefs.cheat(CHEAT_AUTORUN) && UserPrefs.cheat(CHEAT_AUTORUN_ACCUMULATE_SCORE))
		on.push(CHEAT_AUTORUN_ACCUMULATE_SCORE);
	return on.map(c => CHEAT_CODES[c]);
}

export function nickCodes() {
	const nick = String(UserPrefs.getString(PK_IDENTITY_NICK_KEY, '') || '');
	return new Set(nick.split('/').slice(1).map(c => c.trim().toLowerCase()).filter(Boolean));
}

const PREFIX = 'spellmaze:';

let uuidPropsResolver = null;		// uuid -> props (object holding 'prefs-data')

function storageGet(key) {
	try {
		const v = localStorage.getItem(PREFIX + key);
		return v === null ? undefined : JSON.parse(v);
	} catch (e) {
		return undefined;
	}
}

function storageSet(key, value) {
	try {
		if (value === undefined || value === null)
			localStorage.removeItem(PREFIX + key);
		else
			localStorage.setItem(PREFIX + key, JSON.stringify(value));
	} catch (e) {
		console.warn('prefs: cannot persist', key, e);
	}
}

function splitUUIDKey(key) {
	if (!key || key.length < 38 || key.charAt(36) !== '/')
		return null;
	return [key.slice(0, 36), key.slice(37)];
}

function uuidPrefsData(key) {
	const comps = splitUUIDKey(key);
	if (!comps || !uuidPropsResolver)
		return null;
	const props = uuidPropsResolver(comps[0]) || uuidPropsResolver(comps[0].toUpperCase());
	if (!props || !props['prefs-data'])
		return null;
	return { dict: props['prefs-data'], key: comps[1] };
}

const listeners = new Map();		// key -> Set(fn)
const anyListeners = new Set();

export const UserPrefs = {
	setUUIDPropsResolver(fn) {
		uuidPropsResolver = fn;
	},

	hasKey(key) {
		if (!key)
			return false;
		if (storageGet(key) !== undefined)
			return true;
		const r = uuidPrefsData(key);
		return r ? dictHas(r.dict, r.key) : false;
	},

	getRaw(key, def) {
		if (!key)
			return def;
		const v = storageGet(key);
		if (v !== undefined)
			return v;
		const r = uuidPrefsData(key);
		if (r)
			return dictGet(r.dict, r.key, def);
		return def;
	},

	getString(key, def) {
		const v = this.getRaw(key, undefined);
		if (v === undefined || v === null)
			return def;
		return typeof v === 'string' ? v : String(v);
	},
	getInteger(key, def) {
		return toInt(this.getRaw(key, undefined), def);
	},
	getFloat(key, def) {
		return toFloat(this.getRaw(key, undefined), def);
	},
	getBoolean(key, def) {
		return toBool(this.getRaw(key, undefined), def);
	},
	getObject(key, def) {
		return this.getRaw(key, def);
	},
	getArray(key, def) {
		const v = this.getRaw(key, undefined);
		return Array.isArray(v) ? v : def;
	},

	// explicit (stored) values only
	getExplicit(key, def) {
		const v = storageGet(key);
		return v === undefined ? def : v;
	},

	set(key, value) {
		if (!key)
			return;
		const cur = storageGet(key);
		if (cur === value || (cur !== undefined && JSON.stringify(cur) === JSON.stringify(value)))
			return;
		storageSet(key, value);
		this.fire(key);
	},
	setString(key, v) { this.set(key, v === null || v === undefined ? undefined : String(v)); },
	setInteger(key, v) { this.set(key, Math.trunc(v)); },
	setFloat(key, v) { this.set(key, Number(v)); },
	setBoolean(key, v) { this.set(key, !!v); },
	setObject(key, v) { this.set(key, v); },

	remove(key) {
		if (storageGet(key) !== undefined) {
			storageSet(key, undefined);
			this.fire(key);
		}
	},

	listKeys(prefix) {
		const out = [];
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k && k.startsWith(PREFIX)) {
				const key = k.slice(PREFIX.length);
				if (!prefix || key.startsWith(prefix))
					out.push(key);
			}
		}
		return out;
	},

	removeByPrefix(prefix) {
		const keys = this.listKeys(prefix);
		for (const k of keys)
			localStorage.removeItem(PREFIX + k);
		for (const k of keys)
			this.fire(k);
	},

	removeAll() {
		this.removeByPrefix('');
	},

	addListener(key, fn) {
		if (!key) {
			anyListeners.add(fn);
			return;
		}
		if (!listeners.has(key))
			listeners.set(key, new Set());
		listeners.get(key).add(fn);
	},
	removeListener(key, fn) {
		if (!key)
			anyListeners.delete(fn);
		else if (listeners.has(key))
			listeners.get(key).delete(fn);
	},
	fire(key) {
		const set = listeners.get(key);
		if (set)
			for (const fn of [...set])
				try { fn(key); } catch (e) { console.error(e); }
		for (const fn of [...anyListeners])
			try { fn(key); } catch (e) { console.error(e); }
	},

	// a cheat is on when its setting is on (CONF > Advanced > Cheats) or its code is in the nickname
	cheat(name) {
		if (this.getBoolean(name, false))
			return true;
		const code = CHEAT_CODES[name];
		return !!code && nickCodes().has(code);
	},

	keyForUuid(key, uuid) {
		return `${uuid}_${key}`;
	},

	// ---- level state
	levelEnabled(uuid) {
		if (this.cheat(CHEAT_ENABLE_ALL_LEVELS))
			return true;
		return this.getString(`${PK_LEVEL_ENABLED}.${uuid}`, '0') === '1';
	},
	setLevelEnabled(uuid, enabled) {
		this.setString(`${PK_LEVEL_ENABLED}.${uuid}`, enabled ? '1' : '0');
	},
	levelPassed(levelUUID, langUUID) {
		return this.getString(`${PK_LEVEL_PASSED}.${levelUUID}:${langUUID}`, '0') === '1';
	},
	setLevelPassed(levelUUID, langUUID, passed) {
		this.setString(`${PK_LEVEL_PASSED}.${levelUUID}:${langUUID}`, passed ? '1' : '0');
	},
	levelExhausted(levelUUID, langUUID) {
		return this.getString(`${PK_LEVEL_PASSED}.${levelUUID}:${langUUID}:Exhausted`, '0') === '1';
	},
	setLevelExhausted(levelUUID, langUUID, v) {
		this.setString(`${PK_LEVEL_PASSED}.${levelUUID}:${langUUID}:Exhausted`, v ? '1' : '0');
	}
};

// ---------------------------------------------------------------- preference layers (UserPrefsLayer)

// bottom layer: the user prefs themselves
export class UserPrefsUPL {
	hasKey(key) { return UserPrefs.hasKey(key); }
	getObject(key, def) { return UserPrefs.getObject(key, def); }
	getString(key, def) { return UserPrefs.getString(key, def); }
	getInteger(key, def) { return UserPrefs.getInteger(key, def); }
	getFloat(key, def) { return UserPrefs.getFloat(key, def); }
	getBoolean(key, def) { return UserPrefs.getBoolean(key, def); }
}

// a props dictionary layered on top of another layer. If uuid is given the props are mounted at "<uuid>/"
export class UUIDPropsUPL {
	constructor(uuid, props, next) {
		this.props = uuid ? { [uuid]: props || {} } : (props || {});
		this.next = next;
	}
	hasKey(key) {
		return dictHas(this.props, key) || (this.next ? this.next.hasKey(key) : false);
	}
	getObject(key, def) {
		if (dictHas(this.props, key))
			return dictGet(this.props, key, def);
		return this.next ? this.next.getObject(key, def) : def;
	}
	getString(key, def) {
		const v = this.getObject(key, undefined);
		return v === undefined || v === null ? def : String(v);
	}
	getInteger(key, def) { return toInt(this.getObject(key, undefined), def); }
	getFloat(key, def) { return toFloat(this.getObject(key, undefined), def); }
	getBoolean(key, def) { return toBool(this.getObject(key, undefined), def); }
}
