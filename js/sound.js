// SpellMaze - sound effects (SoundTheme) and speech (TextSpeaker, using the Web Speech API instead of eSpeak)

import { UserPrefs, PK_SOUND_ENABLED, PK_TTS_ENABLED } from './prefs.js';

const SOUND_NAMES = ['PieceSelected', 'PieceDispensed', 'PieceHinted', 'PieceHintedLast', 'WordValid', 'WordInvalid',
	'WordBlackListed', 'WordReset', 'BoardFullWarning', 'DispenserDoneWarning', 'PassedLevel', 'FailedLevel',
	'Clicked', 'Swiped',
	'Decoration_ApplePieceDecorator', 'Decoration_BombPieceDecorator', 'Decoration_CoinPieceDecorator',
	'DecorationExtra_ApplePieceDecorator', 'DecorationExtra_BombPieceDecorator', 'DecorationExtra_CoinPieceDecorator'];

const AVAILABLE = new Set(['PieceSelected', 'PieceDispensed', 'PieceHinted', 'PieceHintedLast', 'WordValid', 'WordInvalid',
	'WordBlackListed', 'WordReset', 'BoardFullWarning', 'DispenserDoneWarning', 'Clicked', 'Swiped',
	'Decoration_ApplePieceDecorator', 'Decoration_BombPieceDecorator', 'Decoration_CoinPieceDecorator',
	'DecorationExtra_ApplePieceDecorator', 'DecorationExtra_BombPieceDecorator', 'DecorationExtra_CoinPieceDecorator']);

let audioCtx = null;
const buffers = new Map();
const loading = new Map();
let soundsBase = 'assets/sounds/';

function ctx() {
	if (!audioCtx) {
		const AC = window.AudioContext || window.webkitAudioContext;
		if (!AC)
			return null;
		audioCtx = new AC();
	}
	return audioCtx;
}

function loadSound(name) {
	if (!AVAILABLE.has(name))
		return Promise.resolve(null);
	if (buffers.has(name))
		return Promise.resolve(buffers.get(name));
	if (loading.has(name))
		return loading.get(name);
	const c = ctx();
	if (!c)
		return Promise.resolve(null);
	const p = fetch(soundsBase + name + '.wav')
		.then(r => r.ok ? r.arrayBuffer() : null)
		.then(ab => ab ? new Promise((res, rej) => c.decodeAudioData(ab, res, rej)) : null)
		.then(buf => { buffers.set(name, buf); return buf; })
		.catch(e => { console.warn('sound load failed', name, e); buffers.set(name, null); return null; });
	loading.set(name, p);
	return p;
}

// browsers only allow audio after a user gesture
export function unlockAudio() {
	const c = ctx();
	if (c && c.state !== 'running')
		c.resume().catch(() => { });
	if (window.speechSynthesis && !TextSpeaker.unlocked) {
		TextSpeaker.unlocked = true;
		// iOS Safari needs a speak() call during a user gesture
		try {
			const u = new SpeechSynthesisUtterance('');
			u.volume = 0;
			window.speechSynthesis.speak(u);
		} catch (e) { }
	}
}

export const SoundTheme = {
	speakValidWords: true,

	preload() {
		for (const n of AVAILABLE)
			loadSound(n);
	},
	enabled() {
		return UserPrefs.getBoolean(PK_SOUND_ENABLED, true);
	},
	playSound(name) {
		if (!this.enabled())
			return;
		const c = ctx();
		if (!c)
			return;
		const play = buf => {
			if (!buf)
				return;
			const src = c.createBufferSource();
			src.buffer = buf;
			src.connect(c.destination);
			src.start();
		};
		if (buffers.has(name))
			play(buffers.get(name));
		else
			loadSound(name).then(play);
	},
	pieceSelected() { this.playSound('PieceSelected'); },
	pieceDispensed() { this.playSound('PieceDispensed'); },
	pieceHinted() { this.playSound('PieceHinted'); },
	pieceHintedLast() { this.playSound('PieceHintedLast'); },
	clicked() { this.playSound('Clicked'); },
	swiped() { this.playSound('Swiped'); },
	wordValid(word, language) {
		if (word && this.speakValidWords && TextSpeaker.enabled()) {
			const url = language ? language.wordSoundUrl(word) : null;
			if (url) {
				TextSpeaker.play(url);
				return;
			}
			const vl = (language && language.voiceLanguage) || TextSpeaker.DEFAULT_LANG;
			if (TextSpeaker.speak(language ? language.wordForHintWord(word) : word, vl))
				return;
		}
		this.playSound('WordValid');
	},
	wordInvalid() { this.playSound('WordInvalid'); },
	wordBlackListed() { this.playSound('WordBlackListed'); },
	wordReset() { this.playSound('WordReset'); },
	boardFullWarning() { this.playSound('BoardFullWarning'); },
	dispenserDoneWarning() { this.playSound('DispenserDoneWarning'); },
	passedLevel() { this.playSound('PassedLevel'); },
	failedLevel() { this.playSound('FailedLevel'); },
	decoration(d) { this.playSound(`Decoration_${d}`); },
	decorationExtra(d) { this.playSound(`DecorationExtra_${d}`); }
};

// ---------------------------------------------------------------- speech

let voices = [];
function refreshVoices() {
	if (window.speechSynthesis)
		voices = window.speechSynthesis.getVoices() || [];
}
if (window.speechSynthesis) {
	refreshVoices();
	window.speechSynthesis.onvoiceschanged = refreshVoices;
}

function pickVoice(lang) {
	if (!voices.length)
		refreshVoices();
	if (!lang || !voices.length)
		return null;
	lang = lang.toLowerCase().replace('_', '-');
	const base = lang.split('-')[0];
	const matches = voices.filter(v => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith(base));
	if (!matches.length)
		return null;
	return matches.find(v => v.lang.toLowerCase().replace('_', '-') === lang && v.localService) ||
		matches.find(v => v.lang.toLowerCase().replace('_', '-') === lang) ||
		matches.find(v => v.default) ||
		matches.find(v => v.localService) || matches[0];
}

let currentAudio = null;

export const TextSpeaker = {
	DEFAULT_LANG: 'en',
	unlocked: false,
	enabled() {
		return UserPrefs.getBoolean(PK_TTS_ENABLED, true);
	},
	available() {
		return !!window.speechSynthesis;
	},
	// returns true when speech was issued
	speak(text, lang) {
		if (!this.enabled() || !text || !window.speechSynthesis)
			return false;
		try {
			const synth = window.speechSynthesis;
			synth.cancel();
			const u = new SpeechSynthesisUtterance(String(text).toLowerCase() === String(text) ? String(text) : String(text).toLowerCase());
			u.lang = lang || this.DEFAULT_LANG;
			const v = pickVoice(u.lang);
			if (v)
				u.voice = v;
			u.rate = 1.0;
			synth.speak(u);
			return true;
		} catch (e) {
			console.warn('speech failed', e);
			return false;
		}
	},
	play(url) {
		if (!this.enabled() || !url)
			return;
		try {
			if (currentAudio)
				currentAudio.pause();
			currentAudio = new Audio(url);
			currentAudio.play().catch(() => { });
		} catch (e) { }
	}
};
