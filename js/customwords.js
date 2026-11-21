// SpellMaze - the player's own word list (port of the original "Custom" language, which loaded its words from
// a URL; here the words can also be typed or pasted). It becomes a regular word list item in memory.

import { Folders, DF_LANGUAGES } from './folders.js';
import { UserPrefs } from './prefs.js';
import { toXmlPlist } from './plist.js';

export const CUSTOM_UUID = '687DEE42-E29D-419F-89F4-61F42E877CDA';		// the original's Custom language uuid
export const PK_CUSTOM_WORDS = 'pref_custom_words';					// pasted words
export const PK_LANGUAGE_URL = 'pref_language_url';					// or a web address to load them from
export const PK_CUSTOM_NAME = 'pref_custom_words_name';
export const PK_CUSTOM_VOICE = 'pref_custom_words_voice';
const SOURCE = 'custom-words';

export function customWordsConfigured() {
	return !!(UserPrefs.getString(PK_CUSTOM_WORDS, '') || UserPrefs.getString(PK_LANGUAGE_URL, ''));
}

// (re)builds the custom word list item; throws on a failed download
export async function registerCustomWords() {
	Folders.removeSource(SOURCE);
	let text = UserPrefs.getString(PK_CUSTOM_WORDS, '');
	const url = UserPrefs.getString(PK_LANGUAGE_URL, '');
	if (!text && url) {
		const r = await fetch(url, { cache: 'no-cache' });
		if (!r.ok)
			throw new Error(`HTTP ${r.status} loading ${url}`);
		text = await r.text();
	}
	if (!text || !text.trim())
		return null;
	const props = {
		name: UserPrefs.getString(PK_CUSTOM_NAME, '') || 'My Words',
		description: url && !UserPrefs.getString(PK_CUSTOM_WORDS, '') ? `Words from ${url}` : 'Your own words',
		'split-words': true,
		'all-caps': true,
		'voice-language': UserPrefs.getString(PK_CUSTOM_VOICE, '') || 'en',
		'allow-add-word': true
	};
	const items = await Folders.addMemorySource(SOURCE, {
		[`${CUSTOM_UUID}/props.plist`]: toXmlPlist(props),
		[`${CUSTOM_UUID}/words.txt`]: text
	}, 'custom', DF_LANGUAGES, 2000000);
	return items[0] || null;
}

export function countWords(text) {
	const set = new Set();
	for (const line of String(text || '').split(/[\r\n]+/)) {
		const l = line.trim();
		if (!l || l.startsWith('#'))
			continue;
		for (const w of l.split(/[ \t]+/))
			if (w)
				set.add(w.toUpperCase());
	}
	return set.size;
}
