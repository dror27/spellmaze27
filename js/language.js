// SpellMaze - languages (ontologies): word lists, alphabet, and the "which words can be formed" index
// Port of StringsLanguage / SymbolAlphabet / LanguageManager

import { Bitset, WordSet } from './bitset.js';
import { UserPrefs, PK_LANG_WHITELIST, PK_LANG_DEFAULT } from './prefs.js';
import { Folders, DF_LANGUAGES } from './folders.js';
import { randInt, shuffle, randomElement, dictGet, toBool, toInt } from './util.js';

export const JOKER_CHAR = '?';
export const MAX_JOKERS_IN_WORD = 2;
export const NO_SYMBOL = null;
export const LM_DEFAULT_LANGUAGE = '65F30756-43F1-40EA-B8B8-F8699B933FBD';
export const LM_GAME_LEVELS = 'GameLevels';

export const AlphabetSymbolOrderNatural = 0;
export const AlphabetSymbolOrderWeights = 1;
export const AlphabetSymbolOrderRandom = 2;

export function containsJoker(word) {
	return word.indexOf(JOKER_CHAR) >= 0;
}

export function pieceIsJoker(piece) {
	return piece && piece.text === JOKER_CHAR;
}

function upperChar(c) {
	const u = c.toUpperCase();
	return u.length === 1 ? u : c;
}

function upperString(s) {
	let out = '';
	for (const c of s)
		out += c.length === 1 ? upperChar(c) : c;
	return out;
}

export class SymbolAlphabet {
	constructor() {
		this.symbols = [];		// {symbol, count}
		this.countSum = 0;
		this.indexOf = new Map();
	}
	addSymbol(symbol, count) {
		this.indexOf.set(symbol, this.symbols.length);
		this.symbols.push({ symbol, count });
		this.countSum += count;
	}
	size() {
		return this.symbols.length;
	}
	symbolAt(i) {
		return this.symbols[i].symbol;
	}
	weightAt(i) {
		return this.countSum > 0 ? this.symbols[i].count / this.countSum : 0;
	}
	symbolIndex(symbol) {
		const i = this.indexOf.get(symbol);
		return i === undefined ? -1 : i;
	}
	allSymbols(order) {
		const list = this.symbols.slice();
		if (order === AlphabetSymbolOrderWeights)
			list.sort((a, b) => b.count - a.count);
		else if (order === AlphabetSymbolOrderRandom)
			shuffle(list);
		return list.map(e => e.symbol);
	}
}

export class StringsLanguage {
	constructor(opts = {}) {
		this.uuid = opts.uuid || null;
		this.name = opts.name || '';
		this.splitWords = !!opts.splitWords;
		this.allCaps = opts.allCaps !== undefined ? !!opts.allCaps : true;
		this.textDelimiter = opts.textDelimiter || null;
		this.rtl = !!opts.rtl;
		this.minWordLength = opts.minWordLength !== undefined ? opts.minWordLength : 2;
		this.allowAddWord = opts.allowAddWord !== undefined ? !!opts.allowAddWord : true;
		this.voiceLanguage = opts.voiceLanguage || null;
		this.props = opts.props || {};
		this.item = opts.item || null;			// FolderItem holding images/sounds
		this.allWordsOverride = null;
		this.allValid = false;
		this.wordsOrigin = new Map();
		this.texts = null;
		this.titles = null;
		this.wordImages = new Map();
		this.symbolImages = new Map();
		this.minMaxCache = new Map();
	}

	// ------------------------------------------------ building

	initWithStrings(text, includeWhiteList = true) {
		const words = [];
		let wordLengthMax = 0;
		if (includeWhiteList && this.uuid) {
			const whiteList = UserPrefs.getArray(UserPrefs.keyForUuid(PK_LANG_WHITELIST, this.uuid), null);
			if (whiteList && whiteList.length)
				text = text + '\n' + whiteList.join('\n') + '\n';
		}
		const delim = this.textDelimiter && this.textDelimiter.length === 1 ? this.textDelimiter : null;
		for (let line of text.split(/[\r\n]+/)) {
			line = line.replace(/^ +| +$/g, '');
			if (!line.length || line.charAt(0) === '#')
				continue;
			if (delim) {
				const toks = line.split(delim);
				let word = toks[0], title = toks.length > 1 ? toks[1] : null, txt = toks.length > 2 ? toks[2] : null;
				if (!txt && title) {
					txt = title;
					title = null;
				}
				word = word.trim();
				if (this.allCaps)
					word = upperString(word);
				if (title) {
					if (!this.titles)
						this.titles = new Map();
					this.titles.set(word, title.trim());
				}
				if (txt) {
					if (!this.texts)
						this.texts = new Map();
					this.texts.set(word, txt.trim());
				}
				line = word;
			} else if (this.allCaps)
				line = upperString(line);
			if (!line.length)
				continue;
			if (!this.splitWords || !/[ \t]/.test(line))
				words.push(line);
			else {
				for (const w of line.split(/[ \t]+/)) {
					if (!w.length)
						continue;
					words.push(w);
					if (!this.wordsOrigin.has(w))
						this.wordsOrigin.set(w, []);
					this.wordsOrigin.get(w).push(line);
				}
			}
			if (line.length > wordLengthMax)
				wordLengthMax = line.length;
		}
		this.buildIndex(words);
		return this;
	}

	initWithStringsArray(array) {
		return this.initWithStrings(array.join('\n'), false);
	}

	buildIndex(words) {
		// sort (by UTF-16 code units, like the original unichar compare) and remove duplicates
		words.sort((a, b) => (a < b ? -1 : (a > b ? 1 : 0)));
		const uniq = [];
		for (const w of words)
			if (!uniq.length || uniq[uniq.length - 1] !== w)
				uniq.push(w);
		this.words = uniq;
		const n = uniq.length;

		// alphabet (symbols ordered by character code, weighted by frequency)
		const freq = new Map();
		let maxLen = 0;
		for (const w of uniq) {
			if (w.length > maxLen)
				maxLen = w.length;
			for (const c of w)
				freq.set(c, (freq.get(c) || 0) + 1);
		}
		this.wordLengthMax = maxLen;
		this.alphabet = new SymbolAlphabet();
		for (const c of [...freq.keys()].sort((a, b) => a.charCodeAt(0) - b.charCodeAt(0)))
			this.alphabet.addSymbol(c, freq.get(c));

		// length sets
		this.lengthSets = [];
		for (let i = 0; i <= maxLen; i++)
			this.lengthSets.push([]);
		// per symbol, per repeat count: words with at least that many occurrences
		const symCount = this.alphabet.size();
		this.atLeast = new Array(symCount);
		for (let s = 0; s < symCount; s++)
			this.atLeast[s] = [null];
		const counts = new Map();
		for (let wi = 0; wi < n; wi++) {
			const w = uniq[wi];
			this.lengthSets[w.length].push(wi);
			counts.clear();
			for (const c of w)
				counts.set(c, (counts.get(c) || 0) + 1);
			for (const [c, k] of counts) {
				const s = this.alphabet.symbolIndex(c);
				const list = this.atLeast[s];
				for (let r = 1; r <= k; r++) {
					if (!list[r])
						list[r] = new Bitset(n);
					const b = list[r];
					b.words[wi >>> 5] |= (1 << (wi & 31));
				}
			}
		}
		this.allWordsSet = Bitset.full(n);
		this.minMaxCache.clear();
	}

	// ------------------------------------------------ queries

	wordCount() {
		return this.words.length;
	}

	maxWordSize() {
		return this.wordLengthMax;
	}

	getWordByIndex(index) {
		return (index >= 0 && index < this.words.length) ? this.words[index] : '';
	}

	getValidWordByIndex(index) {
		return this.getWordByIndex(index);
	}

	getValidWordCharacterByIndex(index, charIndex) {
		return this.words[index].charAt(charIndex);
	}

	getAllWords() {
		return this.allWordsOverride || this.words;
	}

	wordIndex(word) {
		let lo = 0, hi = this.words.length - 1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			const w = this.words[mid];
			if (w === word)
				return mid;
			if (w < word)
				lo = mid + 1;
			else
				hi = mid - 1;
		}
		return -1;
	}

	getMinMaxWords(minWordSize, maxWordSize) {
		if (minWordSize <= 0 && maxWordSize <= 0)
			return this.allWordsSet;
		minWordSize = Math.max(1, minWordSize);
		if (maxWordSize <= 0 || maxWordSize >= this.lengthSets.length)
			maxWordSize = this.lengthSets.length - 1;
		const key = minWordSize * 1000 + maxWordSize;
		let b = this.minMaxCache.get(key);
		if (!b) {
			b = new Bitset(this.words.length);
			for (let size = minWordSize; size <= maxWordSize; size++)
				for (const wi of this.lengthSets[size] || [])
					b.words[wi >>> 5] |= (1 << (wi & 31));
			this.minMaxCache.set(key, b);
		}
		return b;
	}

	// words that can be formed from (a subset of) the given symbols
	getValidWordSet(chars, minWordSize, maxWordSize, blackList) {
		const symCount = this.alphabet.size();
		const counts = new Int32Array(symCount);
		for (const c of chars) {
			const s = this.alphabet.symbolIndex(c);
			if (s >= 0)
				counts[s]++;
		}
		const result = this.getMinMaxWords(minWordSize, maxWordSize).clone();
		for (let s = 0; s < symCount; s++) {
			const exceeding = this.atLeast[s][counts[s] + 1];
			if (exceeding)
				result.andNotWith(exceeding);
		}
		if (blackList && blackList.size)
			result.andNotWith(blackList);
		return WordSet.fromBitset(result);
	}

	isValidWord(word, blackList, whiteListWords) {
		if (this.allValid)
			return word;
		const jokers = [];
		for (let i = 0; i < word.length; i++)
			if (word.charAt(i) === JOKER_CHAR)
				jokers.push(i);
		if (!jokers.length) {
			const index = this.wordIndex(word);
			if (index < 0)
				return null;
			const w = this.words[index];
			if (whiteListWords && whiteListWords.size && !whiteListWords.has(w))
				return null;
			return w;
		}
		if (jokers.length > MAX_JOKERS_IN_WORD)
			return null;
		const symbols = this.alphabet.allSymbols(AlphabetSymbolOrderRandom);
		const symbolNum = symbols.length;
		let combinationNum = symbolNum;
		for (let n = 1; n < jokers.length; n++)
			combinationNum *= combinationNum;
		const chars = word.split('');
		for (let combination = 0; combination < combinationNum; combination++) {
			let temp = combination;
			for (let j = 0; j < jokers.length; j++) {
				chars[jokers[j]] = symbols[temp % symbolNum];
				temp = Math.floor(temp / symbolNum);
			}
			const index = this.wordIndex(chars.join(''));
			if (index >= 0) {
				if (blackList && blackList.has(index))
					continue;
				const w = this.words[index];
				if (whiteListWords && whiteListWords.size && !whiteListWords.has(w))
					continue;
				return w;
			}
		}
		return null;
	}

	getRandomWord(minSize, maxSize, blackList) {
		if (minSize <= 0)
			minSize = 1;
		if (maxSize <= 0)
			maxSize = this.lengthSets.length - 1;
		else
			maxSize = Math.min(maxSize, this.lengthSets.length - 1);
		const b = this.getMinMaxWords(minSize, maxSize).clone();
		if (blackList && blackList.size)
			b.andNotWith(blackList);
		const elems = b.toArray();
		if (!elems.length)
			return null;
		return this.words[elems[randInt(elems.length)]];
	}

	getWordCount(minSize, maxSize) {
		if (minSize <= 0)
			minSize = 1;
		if (maxSize <= 0)
			maxSize = this.lengthSets.length - 1;
		else
			maxSize = Math.min(maxSize, this.lengthSets.length - 1);
		let sum = 0;
		for (let size = minSize; size <= maxSize; size++)
			sum += (this.lengthSets[size] || []).length;
		return sum;
	}

	wordForHintWord(word) {
		return word;
	}

	wordDispensed(word) { }
	wordCompleted(word) { }

	addWord(word) {
		if (!this.uuid)
			return;
		const key = UserPrefs.keyForUuid(PK_LANG_WHITELIST, this.uuid);
		const list = (UserPrefs.getArray(key, []) || []).slice();
		if (!list.includes(word))
			list.push(word);
		UserPrefs.setObject(key, list);
	}

	// ------------------------------------------------ media

	originWordFor(word) {
		const origins = this.wordsOrigin.get(word);
		return origins && origins.length ? origins[randInt(origins.length)] : word;
	}

	wordImage(word) {
		if (!word || !this.item)
			return null;
		if (this.wordImages.has(word))
			return this.wordImages.get(word);
		const imageWord = this.originWordFor(word);
		let url = null;
		for (const ext of ['jpg', 'jpeg', 'png', 'gif']) {
			url = this.item.url(`images/${imageWord}.${ext}`);
			if (url)
				break;
		}
		if (!url) {
			const path = dictGet(this.props, ['words', imageWord, 'image'].join('/'), null);
			if (typeof path === 'string')
				url = this.item.url(path);
		}
		this.wordImages.set(word, url || null);
		return url || null;
	}

	wordSoundUrl(word) {
		if (!word || !this.item)
			return null;
		const soundWord = this.originWordFor(word);
		let url = this.item.url(`sounds/${soundWord}.mp3`);
		if (!url) {
			const path = dictGet(this.props, ['words', soundWord, 'sound'].join('/'), null);
			if (typeof path === 'string')
				url = this.item.url(path);
		}
		return url || null;
	}

	symbolImage(symbol) {
		if (symbol === null || symbol === undefined || !this.item)
			return null;
		if (!this.symbolImages.has(symbol)) {
			let value = dictGet(this.props, `skin/images/symbols_${symbol}`, null);
			if (typeof value === 'string')
				value = [value];
			const urls = [];
			if (Array.isArray(value))
				for (const p of value) {
					const u = this.item.url(p);
					if (u)
						urls.push(u);
				}
			this.symbolImages.set(symbol, urls.length ? urls : null);
		}
		const urls = this.symbolImages.get(symbol);
		return urls ? randomElement(urls) : null;
	}

	showSymbolTextOnSymbolImage() {
		const key = 'skin/props/show-symbol-text';
		const v = UserPrefs.getObject(`${this.uuid}/${key}`, undefined);
		if (v !== undefined && v !== null)
			return toBool(v);
		return toBool(dictGet(this.props, key, true), true);
	}

	getSkinProp(name, def) {
		const key = `skin/props/${name}`;
		const v = UserPrefs.getObject(`${this.uuid}/${key}`, undefined);
		if (v !== undefined && v !== null)
			return v;
		return dictGet(this.props, key, def);
	}

	backgroundImage() {
		return this.item ? (this.item.url('background.jpg') || this.item.url('background.png')) : null;
	}

	wordMetaData(word) {
		const index = this.wordIndex(word);
		if (index < 0)
			return null;
		const md = { word };
		let originWord = word;
		const origins = this.wordsOrigin.get(word);
		if (origins && origins.length) {
			originWord = origins[randInt(origins.length)];
			md.wordOrigin = originWord;
		}
		const image = this.wordImage(word);
		if (image)
			md.image = image;
		if (this.texts && this.texts.has(originWord))
			md.text = this.texts.get(originWord);
		if (this.titles && this.titles.has(originWord))
			md.textTitle = this.titles.get(originWord);
		const props = dictGet(this.props, 'words', null);
		md.props = (props && props[originWord]) || {};
		return md;
	}

	get iconUrl() {
		if (!this.item)
			return null;
		const icon = this.props['item-icon'];
		return icon ? this.item.url(icon) : null;
	}
}

// ---------------------------------------------------------------- LanguageManager

const languageCache = new Map();

function languageFromItem(item, text) {
	const props = item.props || {};
	const opts = {
		uuid: item.uuid,
		name: props.name || item.uuid,
		splitWords: toBool(props['split-words'], false),
		allCaps: toBool(props['all-caps'], true),
		textDelimiter: props['text-delimiter'] || null,
		rtl: toBool(props.rtl, false),
		minWordLength: toInt(props['min-word-length'], 2),
		allowAddWord: toBool(props['allow-add-word'], true),
		voiceLanguage: props['voice-language'] || null,
		props,
		item
	};
	const explicitWords = UserPrefs.getExplicit(`${item.uuid}/words`, null);
	if (typeof explicitWords === 'string') {
		opts.splitWords = toBool(UserPrefs.getExplicit(`${item.uuid}/split-words`, true), true);
		opts.allCaps = toBool(UserPrefs.getExplicit(`${item.uuid}/all-caps`, true), true);
		opts.rtl = toBool(UserPrefs.getExplicit(`${item.uuid}/rtl`, false), false);
		text = explicitWords;
	}
	return new StringsLanguage(opts).initWithStrings(text || '');
}

export const LanguageManager = {
	defaultLanguageUUID() {
		let name = UserPrefs.getString(PK_LANG_DEFAULT, LM_DEFAULT_LANGUAGE);
		if (!Folders.find(DF_LANGUAGES, name)) {
			if (Folders.find(DF_LANGUAGES, LM_DEFAULT_LANGUAGE))
				name = LM_DEFAULT_LANGUAGE;
			else {
				const first = Folders.list(DF_LANGUAGES)[0];
				name = first ? first.uuid : LM_DEFAULT_LANGUAGE;
			}
		}
		return name;
	},

	async getNamedLanguage(name) {
		if (!name || name === LM_GAME_LEVELS)
			name = this.defaultLanguageUUID();
		if (languageCache.has(name))
			return languageCache.get(name);
		const item = Folders.find(DF_LANGUAGES, name);
		if (!item)
			throw new Error(`language ${name} not found`);
		const text = await item.text('words.txt');
		const lang = languageFromItem(item, text);
		// keep at most two languages in memory (the original kept one)
		while (languageCache.size >= 2)
			languageCache.delete(languageCache.keys().next().value);
		languageCache.set(name, lang);
		return lang;
	},

	clearCache(uuid) {
		if (uuid)
			languageCache.delete(uuid);
		else
			languageCache.clear();
	},

	languageProps(uuid) {
		const item = Folders.find(DF_LANGUAGES, uuid);
		return item ? item.props : null;
	},

	tutorialLanguageFor(language) {
		let words = null;
		const props = language.props || {};
		if (Array.isArray(props['tutorial-words']))
			words = props['tutorial-words'].map(w => language.allCaps ? upperString(String(w)) : String(w));
		if (!words) {
			const tutorialWords = [];
			const maxLengths = [3, 4, 6, 4];
			for (let index = 0; tutorialWords.length < maxLengths.length && index < language.wordCount(); index++) {
				const word = language.getWordByIndex(index);
				if (word.length > maxLengths[tutorialWords.length])
					continue;
				tutorialWords.push(word);
			}
			words = tutorialWords;
		}
		if (!words || words.length < 4) {
			words = [];
			for (let index = 0; index < Math.min(4, language.wordCount()); index++)
				words.push(language.getWordByIndex(index));
		}
		return this.derivedLanguage(language, words);
	},

	tutorialPageLanguageFor(language, page, pages) {
		if (page <= 0 || pages <= 0)
			return this.tutorialLanguageFor(language);
		page = Math.min(page, pages);
		const wordCount = language.wordCount();
		const pageSize = Math.floor(wordCount / pages);
		const pageStart = Math.round(pageSize * (page - 1));
		const pageEnd = Math.round(pageSize * page) - 1;
		const words = [];
		for (let index = pageStart; index < pageEnd; index++)
			words.push(language.getWordByIndex(index));
		return this.derivedLanguage(language, words);
	},

	derivedLanguage(language, words) {
		const l = new StringsLanguage({
			uuid: language.uuid, name: language.name, rtl: language.rtl, allowAddWord: false,
			voiceLanguage: language.voiceLanguage, props: language.props, item: language.item, allCaps: false
		});
		l.wordsOrigin = language.wordsOrigin;
		l.initWithStringsArray(words);
		l.allWordsOverride = words;
		return l;
	},

	listFromString(wordList) {
		const l = new StringsLanguage({ name: 'List' });
		return l.initWithStrings(wordList || '', false);
	}
};
