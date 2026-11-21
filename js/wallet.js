// SpellMaze - the wallet (decorations collected from spelled words) and session-wide "already learnt" words.
// In the original the wallet lived in memory for the lifetime of the app; here it lives in sessionStorage
// (survives reloads, cleared when the tab is closed).

export const DECORATOR_CHECKED = 'CheckedPieceDecorator';
export const DECORATOR_CHECKED2 = 'CheckedPieceDecorator2';
export const DECORATOR_APPLE = 'ApplePieceDecorator';
export const DECORATOR_BOMB = 'BombPieceDecorator';
export const DECORATOR_COIN = 'CoinPieceDecorator';
export const DECORATOR_DIGIT = 'DigitPieceDecorator';

const KEY = 'spellmaze:wallet';

class WalletImpl {
	constructor() {
		this.items = {};
		this.stepSizes = { [DECORATOR_APPLE]: 21, [DECORATOR_COIN]: 18, [DECORATOR_BOMB]: 16 };
		this.hintBlackWords = new Set();
		this.version = 0;
		try {
			const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
			if (s) {
				this.items = s.items || {};
				this.hintBlackWords = new Set(s.hintBlackWords || []);
			}
		} catch (e) { }
	}
	save() {
		try {
			sessionStorage.setItem(KEY, JSON.stringify({ items: this.items, hintBlackWords: [...this.hintBlackWords] }));
		} catch (e) { }
	}
	incrWalletItemValue(name, incr) {
		const value = this.walletItemValue(name);
		const step = this.walletItemDisplayStepSize(name);
		const stepChanged = Math.trunc(value / step) !== Math.trunc((value + incr) / step);
		const nv = value + incr;
		if (nv)
			this.items[name] = nv;
		else
			delete this.items[name];
		this.version++;
		this.save();
		return stepChanged;
	}
	walletItemValue(name) {
		return this.items[name] || 0;
	}
	allWalletItems() {
		return Object.keys(this.items);
	}
	walletItemDisplayStepSize(name) {
		return this.stepSizes[name] || 1;
	}
	hasSteppedWalletItem(name) {
		return this.walletItemValue(name) >= this.walletItemDisplayStepSize(name);
	}
	incrWalletItemValueByStep(name, incr) {
		return this.incrWalletItemValue(name, incr * this.walletItemDisplayStepSize(name));
	}
	addHintBlackWord(word) {
		this.hintBlackWords.add(word);
		this.save();
	}
	clearHintBlackWords() {
		this.hintBlackWords.clear();
		this.save();
	}
	allHintBlackWords() {
		return this.hintBlackWords;
	}
	// when all the words of a language have been learnt, start over
	checkNotAllLanguageWordsHintBlackWords(language) {
		if (this.hintBlackWords.size < language.wordCount())
			return;
		const words = [...this.hintBlackWords].filter(w => language.wordIndex(w) >= 0);
		if (words.length >= language.wordCount()) {
			for (const w of words)
				this.hintBlackWords.delete(w);
			this.save();
		}
	}
	reset() {
		this.items = {};
		this.hintBlackWords.clear();
		this.version++;
		this.save();
	}
}

export const Wallet = new WalletImpl();
