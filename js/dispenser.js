// SpellMaze - piece and symbol dispensers (port of GridBoardPieceDispenser*, RandomSymbolDispenser,
// AuctionSymbolDispenser and the auction classes, WordQueue, SingleProbabilityURS)

import { GridBoard } from './board.js';
import { SymbolPiece } from './piece.js';
import { BrandManager } from './brand.js';
import { JOKER_CHAR, NO_SYMBOL } from './language.js';
import { UserPrefs, PK_GAME_SPEED } from './prefs.js';
import { randInt, shuffle, randomElement } from './util.js';

export class SingleProbabilityURS {
	constructor(p) {
		this.p = p;
		this.n = 0;
		this.k = 0;
	}
	setProbability(p) {
		this.p = p;
	}
	next() {
		const pa = this.p * (this.n + 1) - this.k;
		let v;
		if (pa <= 0)
			v = 0;
		else if (pa >= 1)
			v = 1;
		else
			v = Math.random() <= pa ? 1 : 0;
		this.n++;
		this.k += v;
		return v;
	}
}

// ---------------------------------------------------------------- symbol dispensers

export class RandomSymbolDispenser {
	constructor() {
		this.alphabet = null;
		this.symbolCount = 0;
		this.symbolsLeft = 0;
		this.rushSymbols = '';
	}
	setAlphabet(a) {
		this.alphabet = a;
	}
	setSymbolCount(count) {
		this.symbolCount = count;
		this.symbolsLeft = count;
	}
	rushDispensing() {
		return !!(this.rushSymbols && this.rushSymbols.length);
	}
	canDispense() {
		return this.symbolsLeft > 0 || this.rushDispensing();
	}
	dispense(hints) {
		if (!this.canDispense())
			return NO_SYMBOL;
		if (this.rushDispensing()) {
			const ch = this.rushSymbols.charAt(0);
			this.rushSymbols = this.rushSymbols.slice(1);
			return ch;
		}
		this.symbolsLeft--;
		let r = Math.random();
		let index = this.alphabet.size();
		while (--index >= 0) {
			r -= this.alphabet.weightAt(index);
			if (r <= 0)
				return this.alphabet.symbolAt(index);
		}
		return this.alphabet.symbolAt(0);
	}
	progress() {
		return this.symbolCount ? 1.0 - this.symbolsLeft / this.symbolCount : 0;
	}
}

class WordQueue {
	constructor(language, minSize, maxSize, blackList) {
		const b = language.getMinMaxWords(minSize, maxSize).clone();
		if (blackList && blackList.size)
			b.andNotWith(blackList);
		this.remaining = b.toArray();
		this.prep = [];
		this.language = language;
	}
	hasWords() {
		return this.remaining.length > 0 || this.prep.length > 0;
	}
	nextWord() {
		if (!this.prep.length) {
			const chunk = 20;
			if (chunk >= this.remaining.length) {
				for (let i = this.remaining.length - 1; i >= 0; i--)
					this.prep.push(this.language.getWordByIndex(this.remaining[i]));
				this.remaining = [];
			} else {
				const taken = new Set();
				for (let n = 0; n < chunk; n++) {
					const i = randInt(this.remaining.length);
					if (!taken.has(i)) {
						taken.add(i);
						this.prep.push(this.language.getWordByIndex(this.remaining[i]));
					}
				}
				this.remaining = this.remaining.filter((_, i) => !taken.has(i));
			}
			if (!this.prep.length)
				return null;
			shuffle(this.prep);
		}
		return this.prep.pop();
	}
}

class WordAuctionParticipant {
	constructor(word, wordIndex) {
		this.word = word;
		this.wordIndex = wordIndex;
		this.leadingSymbol = word.charAt(0);
		this.symbols = word.split('').sort();
		this.blackListed = false;
		this.blackListVersion = -1;
	}
	// returns bids [{symbol, price, participant}] or null
	bid(article, threshold) {
		if (this.blackListed)
			return null;
		const level = article.board.level;
		const blackList = level ? level.blackList : null;
		if (blackList && blackList.version !== this.blackListVersion) {
			this.blackListVersion = blackList.version;
			this.blackListed = blackList.has(this.wordIndex);
		}
		if (this.blackListed)
			return null;
		if (article.leadingSymbol !== NO_SYMBOL && article.leadingSymbol !== this.leadingSymbol)
			return null;
		let bids = null;
		const ws = this.symbols, bs = article.symbols;
		let wi = 0, bi = 0, bidCount = 0, targetPrice = 0;
		while (wi < ws.length) {
			const s = ws[wi++];
			while (bi < bs.length && bs[bi] < s)
				bi++;
			if (bi < bs.length && bs[bi] === s)
				bi++;
			else {
				(bids || (bids = [])).push({ symbol: s, price: 0, participant: this });
				bidCount++;
				targetPrice = 1.0 / bidCount;
				if (threshold && threshold.value > targetPrice)
					return null;
			}
		}
		if (bidCount) {
			for (const b of bids)
				b.price = targetPrice;
			if (threshold && targetPrice > threshold.value)
				threshold.value = targetPrice;
		}
		return bids;
	}
	doneBidding() {
		return this.blackListed;
	}
}

class BoardAuctionArticle {
	constructor(board) {
		this.board = board;
		this.symbols = [];
		this.leadingPiece = null;
		this.leadingSymbol = NO_SYMBOL;
	}
	prepareForBids() {
		const level = this.board.level;
		const gbl = level ? level.logic : null;
		const all = this.board.allPieces();
		let syms = [];
		if (!gbl || !gbl.includesRole('Disable!') || !all.length) {
			for (const p of all)
				syms.push(p.text);
			this.leadingPiece = null;
			this.leadingSymbol = NO_SYMBOL;
		} else {
			this.leadingPiece = randomElement(all);
			this.leadingSymbol = this.leadingPiece.text.charAt(0);
			const cross = gbl.getIncludedRole('Disable!');
			for (const p of cross.collectCrossPieces(this.leadingPiece, all))
				syms.push(p.text);
		}
		this.symbols = syms.join('').split('').sort();
	}
}

const AUCTION_ROOM_CAPACITY = 200;

class BoardLanguageWordsAuctionUsher {
	constructor(board) {
		this.board = board;
		this.didInitialize = false;
		this.wordQueue = null;
		this.nextSize = 0;
	}
	initialize() {
		const level = this.board.level;
		this.language = level.language;
		this.minWordSize = level.minWordSize;
		this.didInitialize = true;
	}
	prepareRoom(room) {
		if (!this.didInitialize)
			this.initialize();
		while (room.participants.size < AUCTION_ROOM_CAPACITY && this.hasMoreQueuedWords()) {
			const word = this.wordQueue ? this.wordQueue.nextWord() : null;
			if (!word)
				break;
			const index = this.language.wordIndex(word);
			if (index < 0)
				break;
			room.participants.add(new WordAuctionParticipant(word, index));
		}
	}
	hasMoreQueuedWords() {
		if (this.wordQueue && this.wordQueue.hasWords())
			return true;
		if (!this.nextSize)
			this.nextSize = this.minWordSize || 2;
		else if (this.nextSize < this.language.maxWordSize())
			this.nextSize++;
		else {
			this.wordQueue = null;
			return false;
		}
		this.wordQueue = new WordQueue(this.language, this.nextSize, this.nextSize, this.board.level.blackList);
		return this.hasMoreQueuedWords();
	}
}

class AuctionRoom {
	constructor(usher) {
		this.participants = new Set();
		this.usher = usher;
	}
	prepareForBids() {
		this.usher.prepareRoom(this);
		for (const p of [...this.participants])
			if (p.doneBidding())
				this.participants.delete(p);
	}
}

// "vertical" aggregation: each symbol bin is priced by its best bid; ties broken by bid count, then randomly
function sell(article, room) {
	article.prepareForBids();
	room.prepareForBids();
	const threshold = { value: -1.0 };
	const bids = [];
	for (const participant of room.participants) {
		const pb = participant.bid(article, threshold);
		if (pb)
			bids.push(...pb);
	}
	const bins = new Map();
	for (const bid of bids) {
		let bin = bins.get(bid.symbol);
		if (!bin)
			bins.set(bid.symbol, bin = { price: 0, count: 0, bids: [] });
		bin.bids.push(bid);
		if (bid.price > bin.price) {
			bin.price = bid.price;
			bin.count = 1;
		} else if (bid.price === bin.price)
			bin.count++;
	}
	let topPrice = -1, topCount = 0, topBins = [];
	for (const bin of bins.values()) {
		if (bin.price > topPrice || (bin.price === topPrice && bin.count > topCount)) {
			topPrice = bin.price;
			topCount = bin.count;
			topBins = [bin];
		} else if (bin.price === topPrice && bin.count === topCount)
			topBins.push(bin);
	}
	if (!topBins.length)
		return null;
	return randomElement(randomElement(topBins).bids);
}

export class AuctionSymbolDispenser extends RandomSymbolDispenser {
	constructor(board) {
		super();
		this.board = board;
		this.room = null;
		this.article = null;
	}
	setBoard(board) {
		if (board !== this.board) {
			this.board = board;
			this.room = null;
			this.article = null;
		}
	}
	realizeBoard() {
		if (this.room)
			return;
		this.room = new AuctionRoom(new BoardLanguageWordsAuctionUsher(this.board));
		this.room.prepareForBids();
		this.article = new BoardAuctionArticle(this.board);
	}
	canDispense() {
		this.realizeBoard();
		if (!this.room.participants.size)
			return false;
		return super.canDispense();
	}
	dispense(hints) {
		this.realizeBoard();
		if (!this.canDispense())
			return NO_SYMBOL;
		if (this.rushDispensing())
			return super.dispense(hints);
		const level = this.board.level;
		let rounds = level && level.logic && level.logic.includesRole('Disable!') ? 4 : 1;
		let bid = null;
		for (; !bid && rounds > 0; rounds--)
			bid = sell(this.article, this.room);
		if (bid && bid.symbol !== NO_SYMBOL) {
			this.symbolsLeft--;
			if (this.article.leadingPiece)
				hints.LeadingPiece = this.article.leadingPiece;
			return bid.symbol;
		}
		return super.dispense(hints);
	}
}

// ---------------------------------------------------------------- piece dispensers

export class GridBoardPieceDispenserBase {
	constructor() {
		this.boardFullnessTickPeriodFactor = 0.75;
		this.boardFullnessTickPeriodCurve = -0.5;
		this.boardProgressTickPeriodFactor = 0.25;
		this.dispenserProgressTickPeriodFactor = 0.0;
		this.dispensingTickPeriod = 1.0;
		this.ownBoard = new GridBoard(1, 1);
		this.ownBoard.setPiecesSelectable(false);
		this.gameSpeed = UserPrefs.getFloat(PK_GAME_SPEED, 1) || 1;
		this.target = null;
		this.dispensing = false;
		this.timer = null;
	}
	setDispensingTickPeriod(v) { this.dispensingTickPeriod = v; }
	setBoardFullnessTickPeriodFactor(v) { this.boardFullnessTickPeriodFactor = v; }
	setBoardFullnessTickPeriodCurve(v) { this.boardFullnessTickPeriodCurve = v; }
	setBoardProgressTickPeriodFactor(v) { this.boardProgressTickPeriodFactor = v; }
	setDispenserProgressTickPeriodFactor(v) { this.dispenserProgressTickPeriodFactor = v; }

	viewWithFrame(frame) {
		return this.ownBoard.viewWithFrame(frame);
	}
	timers() {
		return this.target && this.target.timers;
	}
	startTimer() {
		let period = this.nextTickPeriod();
		if (this.boardFullnessTickPeriodFactor !== 0) {
			let fullness = this.target.targetFullness();
			const curve = 1.0 - ((this.boardFullnessTickPeriodCurve + 1) / 2);
			const direction = this.boardFullnessTickPeriodFactor > 0 ? 1 : -1;
			if (direction < 0)
				fullness = 1.0 - fullness;
			const multiplier = (Math.exp(1.0 / (fullness + curve)) / Math.exp(1.0 / (1.0 + curve))) - 1.0;
			const factor = (Math.exp(1.0 / ((1 - Math.abs(this.boardFullnessTickPeriodFactor)) + 0.5)) / Math.exp(1.0 / 1.5)) - 1.0;
			period /= (1.0 + factor * multiplier);
		}
		if (this.boardProgressTickPeriodFactor !== 0)
			period *= Math.pow(1.0 - this.boardProgressTickPeriodFactor, this.target.targetProgress());
		if (this.dispenserProgressTickPeriodFactor !== 0)
			period *= Math.pow(1.0 - this.dispenserProgressTickPeriodFactor, this.progress());
		period /= this.gameSpeed;
		const t = this.timers();
		this.timer = t ? t.after(period, () => this.onTimer()) : setTimeout(() => this.onTimer(), period * 1000);
	}
	stopTimer() {
		if (this.timer !== null) {
			const t = this.timers();
			if (t)
				t.cancel(this.timer);
			else
				clearTimeout(this.timer);
			this.timer = null;
		}
	}
	preparePiece() {
		return false;
	}
	dispense() {
		let piece = this.ownBoard.pieceAt(0);
		if (!piece) {
			this.dispensing = false;
			this.target.onNoMorePieces();
			return false;
		}
		if (this.target.onWillAcceptPiece()) {
			piece = this.ownBoard.placePiece(null, 0);
			this.target.onPieceDispensed(piece);
			this.preparePiece();
			return true;
		}
		this.dispensing = false;
		return false;
	}
	onTimer() {
		this.timer = null;
		if (this.dispensing && this.dispense() && this.dispensing)
			this.startTimer();
	}
	startDispensing(target) {
		this.stopTimer();
		this.target = target;
		target.onDispensingStarted && target.onDispensingStarted();
		this.preparePiece();
		this.dispensing = true;
		this.startTimer();
	}
	stopDispensing() {
		this.dispensing = false;
		this.stopTimer();
		this.target && this.target.onDispensingStopped && this.target.onDispensingStopped();
	}
	resumeDispensing() {
		this.stopTimer();
		this.dispensing = true;
		if (this.dispense() && this.dispensing)
			this.startTimer();
	}
	progress() {
		return 0;
	}
	piecesLeft() {
		return 0;
	}
	nextTickPeriod() {
		return this.dispensingTickPeriod;
	}
	makePiece(symbol, image) {
		const piece = new SymbolPiece(symbol);
		piece.image = image || null;
		if (image)
			return piece;
		const language = this.target ? this.target.targetLanguage() : null;
		const langImage = language ? language.symbolImage(symbol) : null;
		if (langImage) {
			piece.image = langImage;
			piece.showSymbolText = language.showSymbolTextOnSymbolImage();
			return piece;
		}
		const brand = BrandManager.currentBrand();
		const brandImage = brand.globalImage(`symbols_${symbol}`);
		if (brandImage) {
			piece.image = brandImage;
			piece.showSymbolText = brand.globalBoolean('skin/props/show-symbol-text', true);
		}
		return piece;
	}
}

export class GridBoardPieceDispenserSymbols extends GridBoardPieceDispenserBase {
	constructor() {
		super();
		this.symbolDispenser = null;
		this.rushDispensingFactor = 0;
		this.lastRushDispensing = false;
		this.jokerProb = 0;
		this.jokerURS = new SingleProbabilityURS(0);
	}
	setSymbolDispenser(sd) {
		this.symbolDispenser = sd;
	}
	setJokerProb(p) {
		this.jokerProb = p;
		this.jokerURS.setProbability(p);
	}
	setBoard(board) {
		if (this.symbolDispenser && this.symbolDispenser.setBoard)
			this.symbolDispenser.setBoard(board);
	}
	preparePiece() {
		if (!this.symbolDispenser.canDispense())
			return false;
		const hints = {};
		let symbol = this.symbolDispenser.dispense(hints);
		if (symbol === NO_SYMBOL)
			return false;
		let originalSymbol = null;
		if (symbol === JOKER_CHAR)
			originalSymbol = symbol;
		else if (this.jokerURS.next()) {
			originalSymbol = symbol;
			symbol = JOKER_CHAR;
		}
		const piece = this.makePiece(symbol, null);
		if (originalSymbol)
			piece.props.OriginalSymbol = originalSymbol;
		if (hints.LeadingPiece)
			piece.props.LeadingPiece = hints.LeadingPiece;
		this.ownBoard.placePiece(piece, 0);
		return true;
	}
	progress() {
		return this.symbolDispenser.progress();
	}
	piecesLeft() {
		return this.symbolDispenser.symbolsLeft;
	}
	nextTickPeriod() {
		const rush = this.symbolDispenser.rushDispensing();
		let period;
		if (!rush)
			this.rushDispensingFactor = 0.0;
		if ((rush || this.lastRushDispensing) && this.rushDispensingFactor > 0)
			period = super.nextTickPeriod() / this.rushDispensingFactor;
		else
			period = super.nextTickPeriod();
		this.lastRushDispensing = rush;
		return period;
	}
}

// dispenses whole words, symbol by symbol (dispenser_word_by_word) - port of WordListWordDispenser and
// GridBoardPieceDispenserWords
export class WordListWordDispenser {
	constructor(words, randomOrder) {
		this.words = randomOrder ? shuffle(words.slice()) : words.slice();
		this.dispenseIndex = 0;
	}
	dispense() {
		return this.dispenseIndex < this.words.length ? this.words[this.dispenseIndex++] : null;
	}
	canDispense() {
		return this.dispenseIndex < this.words.length;
	}
	progress() {
		return this.words.length ? this.dispenseIndex / this.words.length : 0;
	}
}

let wordIdCounter = 0;

export class GridBoardPieceDispenserWords extends GridBoardPieceDispenserBase {
	constructor(wordDispenser) {
		super();
		this.wordDispenser = wordDispenser;
		this.currentWord = null;
		this.currentWordId = 0;
		this.currentIndex = 0;
		this.dispensingOrder = [];
		this.interWordTickPeriod = 0.5;
		this.scrambleWordSymbols = false;
	}
	preparePiece() {
		if (this.currentWord === null && !this.wordDispenser.canDispense())
			return false;
		if (this.currentWord === null) {
			this.currentWord = this.wordDispenser.dispense();
			this.currentWordId = ++wordIdCounter;
			this.buildDispensingOrder();
			this.currentIndex = 0;
		}
		if (this.currentWord === null)
			return false;
		const word = this.currentWord;
		const hints = {
			Word: word, WordId: this.currentWordId, WordSize: word.length,
			WordDispensingIndex: this.currentIndex, WordSymbolIndex: this.dispensingOrder[this.currentIndex],
			WordIsLast: this.wordDispenser.canDispense() ? 0 : 1
		};
		const symbol = word.charAt(this.dispensingOrder[this.currentIndex]);
		if (++this.currentIndex >= word.length)
			this.currentWord = null;
		if (symbol === ' ')
			return this.preparePiece();		// phrases: spaces are not dealt
		const piece = this.makePiece(symbol, null);
		piece.props.hints = hints;
		this.ownBoard.placePiece(piece, 0);
		return true;
	}
	progress() {
		return this.wordDispenser.progress();
	}
	// a pause before the first letter of every word
	nextTickPeriod() {
		return this.currentIndex === 1 ? this.interWordTickPeriod : super.nextTickPeriod();
	}
	buildDispensingOrder() {
		const size = this.currentWord.length;
		this.dispensingOrder = [];
		for (let n = 0; n < size; n++)
			this.dispensingOrder.push(n);
		if (this.scrambleWordSymbols) {
			// scramble, retrying (up to 5 times) when the letters end up in their original order
			for (let trys = 0; trys < 5; trys++) {
				for (let n = 0; n < size * 2; n++) {
					const i1 = randInt(size), i2 = randInt(size);
					[this.dispensingOrder[i1], this.dispensingOrder[i2]] = [this.dispensingOrder[i2], this.dispensingOrder[i1]];
				}
				if (this.dispensingOrder.some((v, n) => v !== n))
					break;
			}
		}
	}
}
