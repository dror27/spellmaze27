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

	cheat(name) {
		return this.getBoolean(name, false);
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
