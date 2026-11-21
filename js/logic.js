// SpellMaze - game board logics (port of the *GBL classes, board orders and CrossPieceDisabler)

import { WordSet } from './bitset.js';
import { GridBoard } from './board.js';
import { pieceIsJoker } from './language.js';
import { Wallet, DECORATOR_APPLE, DECORATOR_BOMB, DECORATOR_COIN } from './wallet.js';
import { SoundTheme } from './sound.js';
import { UserPrefs, CHEAT_DISABLE_ALL_DECORATIONS } from './prefs.js';
import { randInt, shuffle, randomElement } from './util.js';

function later(board, secs, fn) {
	const level = board && board.level;
	if (level && level.timers)
		level.timers.after(secs, fn);
	else
		setTimeout(fn, secs * 1000);
}

function pieceSymbols(piece) {
	const o = piece.props.OriginalSymbol;
	return o !== undefined && o !== null ? o : piece.text;
}

export class GameBoardLogicBase {
	constructor(board) {
		this.board = board;
	}
	setBoard(board) {
		this.board = board;
	}
	willAcceptPiece() { return true; }
	pieceDispensed(piece) { }
	pieceSelected(piece) { }
	pieceReselected(piece) { }
	validWordSelected(word) { }
	invalidWordSelected(word) { }
	wordSelectionCanceled() { }
	scoreSuggested(score, pieces) { return score; }
	eliminationSuggested(pieces) { return pieces; }
	onGameTimer() { }
	onFineGameTimer() { }
	onGameWon() { }
	onGameOver() { }
	role() { return ''; }
	generateBoardWordSetRole() { return ''; }
	includesRole(role) { return this.role() === role; }
	getIncludedRole(role) { return this.role() === role ? this : null; }

	// returns {words: WordSet, pieces: [..]}
	generateBoardWordSet(board, validator, minWordSize, maxWordSize, blackList) {
		const pieces = board.allPieces();
		let chars = '';
		for (const p of pieces)
			chars += pieceSymbols(p);
		return { words: validator.getValidWordSet(chars, minWordSize, maxWordSize, blackList), pieces };
	}
}

export class CompoundGameBoardLogic extends GameBoardLogicBase {
	constructor(board) {
		super(board);
		this.logics = [];
	}
	add(logic) {
		const role = logic.role();
		if (role && role.endsWith('!'))
			this.logics = this.logics.filter(l => l.role() !== role);
		this.logics.push(logic);
	}
	count() {
		return this.logics.length;
	}
	setBoard(board) {
		this.board = board;
		for (const l of this.logics)
			l.setBoard(board);
	}
	willAcceptPiece() {
		return this.logics.every(l => l.willAcceptPiece());
	}
	pieceDispensed(piece) {
		if (piece.props.LeadingPiece) {
			const d = this.getIncludedRole('Disable!');
			if (d)
				d.pieceDispensed(piece);
		} else
			for (const l of this.logics)
				l.pieceDispensed(piece);
	}
	pieceSelected(p) { for (const l of this.logics) l.pieceSelected(p); }
	pieceReselected(p) { for (const l of this.logics) l.pieceReselected(p); }
	validWordSelected(w) { for (const l of this.logics) l.validWordSelected(w); }
	invalidWordSelected(w) { for (const l of this.logics) l.invalidWordSelected(w); }
	wordSelectionCanceled() { for (const l of this.logics) l.wordSelectionCanceled(); }
	onGameTimer() { for (const l of this.logics) l.onGameTimer(); }
	onFineGameTimer() { for (const l of this.logics) l.onFineGameTimer(); }
	onGameWon() { for (const l of this.logics) l.onGameWon(); }
	onGameOver() { for (const l of this.logics) l.onGameOver(); }
	scoreSuggested(score, pieces) {
		for (const l of this.logics)
			score = l.scoreSuggested(score, pieces);
		return score;
	}
	eliminationSuggested(pieces) {
		for (const l of this.logics)
			pieces = l.eliminationSuggested(pieces);
		return pieces;
	}
	generateBoardWordSet(board, validator, minWordSize, maxWordSize, blackList) {
		if (!this.logics.length)
			return { words: new WordSet([]), pieces: board.allPieces() };
		if (this.logics.length === 1)
			return this.logics[0].generateBoardWordSet(board, validator, minWordSize, maxWordSize, blackList);
		const byRole = new Map();
		let pieces = null;
		for (const l of this.logics) {
			const role = l.generateBoardWordSetRole();
			if (byRole.has(role))
				continue;
			const r = l.generateBoardWordSet(board, validator, minWordSize, maxWordSize, blackList);
			byRole.set(role, r.words);
			pieces = r.pieces;		// like the original: the last generator's pieces win
		}
		const sets = [...byRole.values()];
		return { words: sets.length === 1 ? sets[0] : WordSet.intersect(sets), pieces };
	}
	includesRole(role) {
		return this.logics.some(l => l.includesRole(role));
	}
	getIncludedRole(role) {
		for (const l of this.logics)
			if (l.includesRole(role))
				return l.getIncludedRole(role);
		return null;
	}
}

// ---------------------------------------------------------------- placement

export class RandomPlacementGBL extends GameBoardLogicBase {
	constructor(board) {
		super(board);
		this.alwaysRandomPlacement = false;
		this.pauseAtWordEnd = true;
		this.pauseSkipCount = 0;
	}
	willAcceptPiece() {
		return this.board.freeCellCount() > 0;
	}
	pieceDispensed(piece) {
		let index;
		const hints = piece.props.hints;
		if (hints && hints.WordSymbolIndex !== undefined) {
			const level = this.board.level;
			const rtl = level && level.language && level.language.rtl;
			const smallBoard = (this.board instanceof GridBoard) && this.board.width <= 4;
			const word = hints.Word;
			const wordSize = hints.WordSize;
			const wordDispensingIndex = hints.WordDispensingIndex;
			const ofs = (wordSize <= 4 && !smallBoard) ? 1 : 0;
			const wordIsLast = hints.WordIsLast;
			if (!this.alwaysRandomPlacement) {
				const cols = (this.board instanceof GridBoard) ? this.board.width : 6;
				index = !rtl ? 2 * cols + ofs + wordDispensingIndex : 2 * cols + (cols - 1) - ofs - wordDispensingIndex;
			} else
				index = this.board.randomFreeCellIndex();
			if (wordSize === wordDispensingIndex + 1) {
				if ((this.pauseAtWordEnd && !this.pauseSkipCount) || wordIsLast)
					level && level.pauseGame();
				this.pauseSkipCount = Math.max(0, this.pauseSkipCount - 1);
				level && level.wordValidator && level.wordValidator.wordDispensed(word);
			}
		} else
			index = this.board.randomFreeCellIndex();
		if (index >= 0)
			this.board.placePiece(piece, index);
	}
	role() { return 'Place!'; }
}

export class SimpleBoardOrder {
	indexOfOrder(order) { return order; }
	orderOfIndex(index) { return index; }
}

export class SnakeBoardOrder {
	constructor(board) {
		this.w = board.width;
	}
	orderOfIndex(index) {
		const x = index % this.w, y = Math.floor(index / this.w);
		return y * this.w + ((y % 2) === 0 ? x : (this.w - 1 - x));
	}
	indexOfOrder(order) {
		let x = order % this.w;
		const y = Math.floor(order / this.w);
		if ((y % 2) !== 0)
			x = this.w - 1 - x;
		return y * this.w + x;
	}
}

export class SpiralBoardOrder {
	constructor(board) {
		this.w = board.width;
		this.h = board.height;
		this.map = new Array(this.w * this.h).fill(0);
		for (let order = 0; order < board.cellCount(); order++)
			this.map[this.indexOfOrder(order)] = order;
	}
	orderOfIndex(index) {
		return this.map[index];
	}
	indexOfOrder(order) {
		const c = this.coorOf(order, this.w, this.h);
		return c.y * this.w + c.x;
	}
	coorOf(i, width, height) {
		if (width <= 0 || height <= 0)
			return { x: 0, y: 0 };
		if (width === 1 || height === 1)
			return { x: 0, y: 0 };
		if (i <= width - 1)
			return { x: i, y: 0 };
		if (i <= width + height - 2)
			return { x: width - 1, y: i - (width - 1) };
		if (i <= 2 * width + height - 3)
			return { x: (width - 1) - (i - (width + height - 2)), y: height - 1 };
		if (i <= 2 * width + 2 * height - 5)
			return { x: 0, y: height - 1 - (i - (2 * width + height - 3)) };
		const inner = this.coorOf(i - (2 * width + 2 * height - 4), width - 2, height - 2);
		return { x: inner.x + 1, y: inner.y + 1 };
	}
}

export class RandomBoardOrder {
	constructor(board) {
		this.w = board.width;
		const size = board.width * board.height;
		this.map = [];
		for (let i = 0; i < size; i++)
			this.map.push(i);
		for (let n = 0; n < size * 4; n++) {
			const i1 = randInt(size), i2 = randInt(size);
			[this.map[i1], this.map[i2]] = [this.map[i2], this.map[i1]];
		}
	}
	orderOfIndex(index) {
		return this.map[index];
	}
	indexOfOrder(order) {
		return this.map[order];
	}
}

export class ListBoardOrder {
	constructor(board, list) {
		this.count = board.cellCount();
		this.order2index = null;
		this.index2order = null;
		if (list) {
			this.order2index = new Array(this.count).fill(0);
			this.index2order = new Array(this.count).fill(0);
			String(list).split(',').forEach((s, index) => {
				if (index < this.count) {
					const order = parseInt(s, 10) || 0;
					if (order < this.count) {
						this.order2index[index] = order;
						this.index2order[order] = index;
					}
				}
			});
		}
	}
	indexOfOrder(order) {
		return this.order2index && order < this.count ? this.order2index[order] : order;
	}
	orderOfIndex(index) {
		return this.index2order && index < this.count ? this.index2order[index] : index;
	}
}

export class OrderNudgeGBL extends GameBoardLogicBase {
	constructor(board, order) {
		super(board);
		this.order = order;
	}
	willAcceptPiece() {
		return this.board.freeCellCount() > 0;
	}
	pieceDispensed(piece) {
		this.placePiece(piece, 0);
	}
	placePiece(piece, cellIndex) {
		if (cellIndex >= this.board.cellCount())
			return;
		const index = this.order.indexOfOrder(cellIndex);
		const old = this.board.placePiece(piece, index);
		if (old)
			this.placePiece(old, cellIndex + 1);
	}
	role() { return 'Place!'; }
}

// ---------------------------------------------------------------- fader

export class PieceFaderGBL extends GameBoardLogicBase {
	constructor(board) {
		super(board);
		this.fadePace = 8.0;
		this.resetFadeOnValidWord = true;
	}
	pieceDispensed(piece) {
		this.initFade(piece);
	}
	validWordSelected(word) {
		if (this.resetFadeOnValidWord)
			this.resetFade();
	}
	onGameTimer() {
		this.incrementFade();
	}
	initFade(piece) {
		piece.props.dispensed_at = Math.floor(Date.now() / 1000);
		piece.setFade(0);
	}
	resetFade() {
		for (const p of this.board.allPieces())
			this.initFade(p);
	}
	incrementFade() {
		if (this.fadePace <= 0)
			return;
		const now = Math.floor(Date.now() / 1000);
		for (const p of this.board.allPieces()) {
			const at = p.props.dispensed_at;
			if (at === undefined)
				continue;
			const pace = this.fadePace >= 500 ? this.fadePace : this.fadePace * 1000;
			let fade = (now - at) / pace * 1000;
			if (fade > 1.0)
				fade = 1.0;
			p.setFade(fade);
		}
	}
	role() { return 'Effect'; }
}

// ---------------------------------------------------------------- cross piece disabler

export const CROSS = 0, DIAGONAL = 1, HORIZONTAL = 2, VERTICAL = 3, ADJACENT = 4;

export class CrossPieceDisabler extends GameBoardLogicBase {
	constructor(board) {
		super(board);
		this.type = CROSS;
		this.highlight = false;
		this.progressive = false;
		this.active = false;
		this.centerX = 0;
		this.centerY = 0;
	}
	pieceSelected(piece) {
		const level = this.board.level;
		if (!level || level.currentWordPieces.length === 0 || this.progressive)
			this.crossActivate(piece);
	}
	pieceDispensed(piece) {
		const leading = piece.props.LeadingPiece;
		if (leading) {
			// (a leading piece eliminated meanwhile has no cell: the original then centers on 0,0)
			const lc = leading.cell || { x: 0, y: 0 };
			const free = [];
			for (const cell of this.board.allCells())
				if (!cell.piece && this.onCross(cell.x, cell.y, lc.x, lc.y))
					free.push(cell);
			if (free.length)
				randomElement(free).setPiece(piece);
			else {
				const index = this.board.randomFreeCellIndex();
				if (index >= 0)
					this.board.placePiece(piece, index);
			}
		}
		if (this.active && piece.cell)
			this.crossPiece(piece);
	}
	validWordSelected() { this.crossReset(); }
	invalidWordSelected() { this.crossReset(); }
	wordSelectionCanceled() { this.crossReset(); }
	crossActivate(piece) {
		const cell = piece.cell;
		if (!cell)
			return;
		this.centerX = cell.x;
		this.centerY = cell.y;
		for (const p of this.board.allPieces())
			if (!this.active || p.disabled)
				this.crossPiece(p);
		if (this.highlight)
			for (const c of this.board.allCells())
				if (!this.active || !c.highlight)
					this.crossCell(c);
		this.active = true;
	}
	crossPiece(piece) {
		const c = piece.cell;
		if (!c)
			return;
		piece.setDisabled(!this.onCross(c.x, c.y));
	}
	crossCell(cell) {
		cell.setHighlight(this.onCross(cell.x, cell.y));
	}
	crossReset() {
		if (this.active) {
			this.active = false;
			for (const p of this.board.allPieces())
				p.setDisabled(false);
			if (this.highlight)
				for (const c of this.board.allCells())
					c.setHighlight(false);
		}
	}
	onCross(x, y, cx = this.centerX, cy = this.centerY) {
		switch (this.type) {
			case CROSS: return x === cx || y === cy;
			case DIAGONAL: return Math.abs(x - cx) === Math.abs(y - cy);
			case HORIZONTAL: return y === cy;
			case VERTICAL: return x === cx;
			case ADJACENT: return Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1;
			default: return false;
		}
	}
	role() { return 'Disable!'; }
	generateBoardWordSetRole() { return this.role(); }
	collectCrossPieces(leading, pieces) {
		const result = [leading];
		const lc = leading.cell;
		if (!lc)
			return result;
		for (const p of pieces)
			if (p !== leading && p.cell && this.onCross(p.cell.x, p.cell.y, lc.x, lc.y))
				result.push(p);
		return result;
	}
	generateBoardWordSet(board, validator, minWordSize, maxWordSize, blackList) {
		const pieces = board.allPieces();
		let lastLeading = null;
		const sets = [];
		for (const leading of shuffle(pieces.slice())) {
			lastLeading = leading;
			const lead0 = leading.text.charAt(0);
			let chars = '';
			for (const p of this.collectCrossPieces(leading, pieces))
				chars += p.text;
			const ws = validator.getValidWordSet(chars, minWordSize, maxWordSize, blackList);
			sets.push(new WordSet(ws.elems.filter(e => validator.getValidWordCharacterByIndex(e, 0) === lead0)));
		}
		let outPieces = pieces;
		if (lastLeading)
			outPieces = [lastLeading, ...pieces.filter(p => p !== lastLeading)];
		return { words: WordSet.union(sets), pieces: outPieces };
	}
}

// ---------------------------------------------------------------- decorations (apples, coins, bombs)

const APPLE_MULT = 1.25, COIN_MULT = 1.0, BOMB_MULT = 1.0;
const APPLE_DECORATION_DELAY = 0.4, BOMB_EXPLOSION_DELAY = 0.4;

export class PieceDecoratorGBL extends GameBoardLogicBase {
	constructor(board) {
		super(board);
		this.decorations = null;
		this.probSum = 0;
		if (!UserPrefs.cheat(CHEAT_DISABLE_ALL_DECORATIONS))
			this.setDecorations({ [DECORATOR_APPLE]: 0.1, [DECORATOR_COIN]: 0.05, [DECORATOR_BOMB]: 0.05 });
	}
	setDecoration(name, prob) {
		const d = Object.assign({}, this.decorations || {});
		d[name] = prob;
		this.setDecorations(d);
	}
	setDecorations(d) {
		this.decorations = d;
		this.probSum = 0;
		if (d)
			for (const v of Object.values(d))
				this.probSum += v;
	}
	role() { return 'Decoration'; }
	pieceDispensed(piece) {
		if (this.decorations) {
			const d = this.randomDecoration(true);
			if (d)
				piece.addDecorator(d);
		}
	}
	scoreSuggested(score, pieces) {
		let apples = 0, coins = 0, bombs = 0;
		let appleSuper = false, coinSuper = false, bombSuper = false;
		let dscore = score;
		for (const p of pieces) {
			if (p.hasDecorator(DECORATOR_APPLE)) {
				if (!pieceIsJoker(p)) {
					apples++;
					dscore *= APPLE_MULT;
				}
				appleSuper = Wallet.incrWalletItemValue(DECORATOR_APPLE, apples) || appleSuper;
			}
			if (p.hasDecorator(DECORATOR_COIN)) {
				if (!pieceIsJoker(p)) {
					coins++;
					dscore *= COIN_MULT;
				}
				coinSuper = Wallet.incrWalletItemValue(DECORATOR_COIN, coins) || coinSuper;
			}
			if (p.hasDecorator(DECORATOR_BOMB)) {
				if (!pieceIsJoker(p)) {
					bombs++;
					dscore *= BOMB_MULT;
				}
				bombSuper = Wallet.incrWalletItemValue(DECORATOR_BOMB, bombs) || bombSuper;
			}
		}
		if (apples === pieces.length) {
			Wallet.incrWalletItemValue(DECORATOR_APPLE, apples);
			appleSuper = true;
			for (let n = apples; n > 0; n--)
				dscore *= APPLE_MULT;
		}
		if (coins === pieces.length) {
			Wallet.incrWalletItemValue(DECORATOR_COIN, coins);
			coinSuper = true;
			for (let n = coins; n > 0; n--)
				dscore *= COIN_MULT;
		}
		if (bombs === pieces.length) {
			Wallet.incrWalletItemValue(DECORATOR_BOMB, bombs);
			bombSuper = true;
			for (let n = bombs; n > 0; n--)
				dscore *= BOMB_MULT;
		}
		// note: like the original, a word without any decoration counts as "all apples/coins/bombs" only when empty
		const b = this.board;
		if (appleSuper && apples)
			later(b, 0.3, () => SoundTheme.decorationExtra(DECORATOR_APPLE));
		if (coinSuper && coins)
			later(b, 0.3, () => SoundTheme.decorationExtra(DECORATOR_COIN));
		if (bombSuper && bombs)
			later(b, 0.3, () => SoundTheme.decorationExtra(DECORATOR_BOMB));
		if (bombs)
			later(b, 0.4, () => SoundTheme.decoration(DECORATOR_BOMB));
		else if (coins)
			later(b, 0.6, () => SoundTheme.decoration(DECORATOR_COIN));
		else if (apples)
			later(b, 0.2, () => SoundTheme.decoration(DECORATOR_APPLE));
		return Math.round(dscore);
	}
	eliminationSuggested(pieces) {
		let candidates = null;
		for (const p of pieces) {
			if (!p.hasDecorator(DECORATOR_APPLE))
				continue;
			const decorator = this.randomDecoration(false);
			if (!decorator)
				continue;
			if (!candidates)
				candidates = this.board.allPieces().filter(q => !pieces.includes(q) && !q.hasDecorator(null));
			if (!candidates.length)
				break;
			const index = randInt(candidates.length);
			const target = candidates[index];
			later(this.board, APPLE_DECORATION_DELAY, () => target.addDecorator(decorator));
			candidates.splice(index, 1);
		}
		let coinsPause = 0, coins = 0;
		for (const p of pieces)
			if (p.hasDecorator(DECORATOR_COIN) && !pieceIsJoker(p)) {
				coinsPause += 3;
				coins++;
			}
		if (coins && coins === pieces.length)
			coinsPause *= 1.5;
		const level = this.board.level;
		if (coinsPause > 0 && level)
			level.suspendGameWithAutomaticResumeAfter(Math.round(coinsPause));
		const bombed = this.bombedNeighbors(pieces);
		if (bombed.length)
			later(this.board, BOMB_EXPLOSION_DELAY, () => this.eliminatePieces(bombed));
		return pieces;
	}
	eliminatePieces(pieces) {
		const bombed = this.bombedNeighbors(pieces);
		if (bombed.length)
			later(this.board, BOMB_EXPLOSION_DELAY, () => this.eliminatePieces(bombed));
		if (pieces.length)
			SoundTheme.decoration(DECORATOR_BOMB);
		for (const p of pieces)
			if (p.cell)
				p.eliminate();
	}
	bombedNeighbors(pieces) {
		let result = null;
		const bombPieces = pieces.filter(p => p.hasDecorator(DECORATOR_BOMB) && !pieceIsJoker(p));
		const allBombs = bombPieces.length === pieces.length;
		for (const p of bombPieces) {
			const cell = p.cell;
			if (!cell || !(cell.board instanceof GridBoard))
				continue;
			const board = cell.board;
			if (!result)
				result = new Set(pieces);
			for (let dx = -1; dx <= 1; dx++)
				for (let dy = -1; dy <= 1; dy++) {
					if (!dx && !dy)
						continue;
					if (!allBombs && dx && dy)
						continue;
					const x = cell.x + dx, y = cell.y + dy;
					if (x < 0 || x >= board.width || y < 0 || y >= board.height)
						continue;
					const c = board.cellAtXY(x, y);
					if (c && c.piece)
						result.add(c.piece);
				}
		}
		if (!result)
			return [];
		for (const p of pieces)
			result.delete(p);
		return [...result];
	}
	randomDecoration(optional) {
		if (!this.decorations)
			return null;
		let v = Math.random();
		if (!optional)
			v *= this.probSum;
		const keys = Object.keys(this.decorations);
		for (const k of keys) {
			v -= this.decorations[k] || 0;
			if (v <= 0 && (this.decorations[k] || 0) > 0)
				return k;
		}
		return optional ? null : (keys.find(k => this.decorations[k] > 0) || null);
	}
}

// ---------------------------------------------------------------- view transformer (rotate / flip)

export class ViewTransformerGBL extends GameBoardLogicBase {
	constructor(board) {
		super(board);
		this.rotationSlices = 4;
		this.rotationEvent = 'validWordSelected:';
		this.resetAtEnd = true;
		this.followDevice = false;
		this.rotation = 0;
		this.flipped = false;
		this.ended = false;
	}
	boardEl() {
		const v = this.board.view;
		return v ? v.root : null;
	}
	trigger(event) {
		if (this.rotationEvent !== event && this.rotationEvent !== event.replace(/:$/, ''))
			return;
		const e = this.boardEl();
		if (!e)
			return;
		if (this.rotationSlices > 0) {
			this.rotation += Math.PI * 2 / this.rotationSlices;
			e.style.transition = 'transform 0.2s';
			e.style.transform = `rotate(${this.rotation}rad)`;
		} else {
			this.flipped = !this.flipped;
			e.style.transition = 'transform 0.4s ease-in-out';
			e.style.transform = this.flipped ? 'perspective(900px) rotateY(180deg)' : 'perspective(900px) rotateY(0deg)';
		}
	}
	pieceDispensed() { this.trigger('pieceDispensed:'); }
	pieceSelected() { this.trigger('pieceSelected:'); }
	pieceReselected() { this.trigger('pieceReselected:'); }
	validWordSelected() { this.trigger('validWordSelected:'); }
	invalidWordSelected() { this.trigger('invalidWordSelected:'); }
	wordSelectionCanceled() { this.trigger('wordSelectionCanceled'); }
	onGameTimer() { this.trigger('onGameTimer'); }
	onFineGameTimer() { this.trigger('onFineGameTimer'); }
	onGameWon() { this.atEnd(); }
	onGameOver() { this.atEnd(); }
	atEnd() {
		this.ended = true;
		if (this.resetAtEnd) {
			const e = this.boardEl();
			if (e) {
				e.style.transition = 'transform 0.2s';
				e.style.transform = '';
			}
		}
	}
}
