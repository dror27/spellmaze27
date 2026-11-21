// SpellMaze - a game level (port of GameLevel + ParametricGameLevel)

import { Bitset } from './bitset.js';
import { GridBoard, boardByFormula } from './board.js';
import { SymbolPiece } from './piece.js';
import {
	RandomPlacementGBL, OrderNudgeGBL, SnakeBoardOrder, SpiralBoardOrder, RandomBoardOrder, ListBoardOrder,
	PieceFaderGBL, CrossPieceDisabler, PieceDecoratorGBL, ViewTransformerGBL, CompoundGameBoardLogic
} from './logic.js';
import {
	AuctionSymbolDispenser, GridBoardPieceDispenserSymbols, GridBoardPieceDispenserWords, WordListWordDispenser
} from './dispenser.js';
import { LanguageManager, JOKER_CHAR, containsJoker, pieceIsJoker } from './language.js';
import { BrandManager } from './brand.js';
import { SoundTheme, TextSpeaker } from './sound.js';
import { Wallet, DECORATOR_APPLE, DECORATOR_BOMB, DECORATOR_COIN } from './wallet.js';
import { ScoresDatabase } from './scores.js';
import {
	UserPrefs, UserPrefsUPL, UUIDPropsUPL,
	CHEAT_REPEAT_WORDS_IN_LEVEL, CHEAT_PLAY_PAUSE_AT_WILL, CHEAT_SHOW_HINTS_AT_WILL, CHEAT_LEVEL_END_MENU,
	CHEAT_SPEAK_LETTER_SPELLING, CHEAT_WIDE_CELLS, CHEAT_TEXT_HINT_MODE_1, CHEAT_TEXT_HINT_MODE_2,
	CHEAT_AUTORUN, CHEAT_AUTORUN_ACCUMULATE_SCORE
} from './prefs.js';
import { TimerGroup, randInt, shuffle, nowSecs, toBool, toInt, toFloat, dictHas } from './util.js';
import { SplashPanel, ActionSheet } from './ui/splash.js';
import { ScoreWidget, PS_NONE, PS_PLAYING, PS_PAUSED, GA_NONE, GA_HINT } from './ui/scorewidget.js';
import { GameLevelView } from './ui/gameview.js';

export const INIT = 'INIT', LOADED = 'LOADED', START_SPLASH = 'START_SPLASH', PLAYING = 'PLAYING', PAUSED = 'PAUSED',
	HINTING = 'HINTING', REPLAYING = 'REPLAYING', BOARD_FULL = 'BOARD_FULL', DISPENSER_DONE = 'DISPENSER_DONE',
	GAME_OVER = 'GAME_OVER', GAME_WON = 'GAME_WON', STOPPED = 'STOPPED', SUSPENDED = 'SUSPENDED', DEALLOCATED = 'DEALLOCATED';

export const WI_VALID = 1, WI_INVALID = 2, WI_ADDED = 3, WI_BLACKLISTED = 4;

export const PassedLevelEndMenuContext_NextLevel = 1;
export const PassedLevelEndMenuContext_RepeatLevel = 2;
export const PassedLevelEndMenuContext_ContinueLevel = 3;
export const PassedLevelEndMenuContext_StopPlaying = 4;

const DEFAULT_BOARD_SIZE = 6;
const AUTORUN_DELAY = 0;
const AUTORUN_CLICK_DELAY = 0.2;		// SystemUtils autorunDelay
const OLD_REWARD_CLEAR_SECS = 3;
const DEFAULT_BOARD_FULL_WARN_BUDGET = 150;
const DEFAULT_BOARD_FULL_WARN_COST = 15;

let askToAddWordsGlobal = true;

const AutoMaxWordSizeBehaviorNone = 0, AutoMaxWordSizeBehaviorReset = 1, AutoMaxWordSizeBehaviorTerminate = 2;

export class GameLevel {
	constructor() {
		this.state = INIT;
		this.title = 'Title';
		this.shortDescription = 'Short Description';
		this.uuid = '';
		this.loadDefaultLanguage = true;
		this.loadDefaultBoard = true;
		this.loadDefaultDispenser = true;
		this.loadDefaultLogic = true;
		this.scoreFactor = 1;
		this.props = {};
		this.seq = null;
		this.timers = new TimerGroup();
		this.helpSplashPanel = null;
		this.textSplashPanel = null;
		this.summarySplashPanel = null;
		this.initialBlackList = null;
		this.hintBoard = null;
		this.minWordSize = 0;
		this.autoMaxWordSizeBehavior = AutoMaxWordSizeBehaviorNone;
		this.pauseOnWordCount = 0;
		this.pauseOnWordCountIncrement = 0;
		this.validWordCount = 0;
		this.idle = 0;
		this.grace = 0;
		this.hintIndex = 0;
		this.hintPending = false;
		this.timerTickCounter = 0;
		this.lastGeneratedHintWordIndex = -1;
		this.enabledVerified = false;
		this.replayIndex = 0;
		this.fastGame = false;
	}

	// ------------------------------------------------ loading

	async loadGame() {
		if (this.state !== INIT)
			return;
		this.gameOverGrace = 15;
		this.gameWonGrace = 15;
		this.pausedGrace = 10;
		this.piecesHint = null;
		this.hintWord = null;
		this.soundTheme = SoundTheme;
		this.hintsEnabled = true;
		this.scoreWidget = new ScoreWidget();
		this.scoreWidget.eventsTarget = this;
		this.allowDupWords = false;
		this.selectedWords = new Map();
		this.allowReselectPartialDeselect = false;
		this.allowAddWords = true;
		this.showWordImageOnValid = true;
		this.showWordImageOnDispensed = false;
		this.speakWordOnDispensed = false;
		this.replayValidWord = false;
		this.showHintImage = true;
		this.showHintText = false;
		this.allowPlayPause = false;
		this.allowShowHint = false;
		this.levelEndMenu = false;
		this.levelEndContinueRemainingWordCountThreshold = 0;
		this.boardFullWarnBudget = DEFAULT_BOARD_FULL_WARN_BUDGET;
		this.boardFullWarnCost = DEFAULT_BOARD_FULL_WARN_COST;
		this.showHintDelay = 6;
		this.betweenHintDelay = 7;
		this.speakHintWord = true;
		this.showHintWord = true;
		this.showHintPieces = false;
		this.jokerImageHints = false;
		this.jokerImageRewards = false;
		this.hintMaxWordSize = 6;
		this.showSummarySplash = true;
		this.showRewardImage = true;
		this.showRewardText = true;
		this.speakRewardWord = true;
		this.showLanguageBackground = false;
		this.flashAttackDuration = 0.20;
		this.flashAttackAlpha = 1.0;
		this.flashSustainDuration = 0.2;
		this.flashSustainAlpha = 1.0;
		this.flashDecayDuration = 0.2;
		this.flashDecayAlpha = 0;
		this.idleToHintGrace = this.showHintDelay;
		this.rushSymbols = '';
		this.rushWords = 1;
		this.rushMinWordSize = 3;
		this.rushMaxWordSize = 4;
		this.rushDispensingFactor = 3;
		this.showHintWordCount = true;
		this.autorun = false;

		if (this.loadDefaultLanguage)
			this.language = this.seq && this.seq.language ? this.seq.language : await LanguageManager.getNamedLanguage(null);

		if (this.loadDefaultBoard) {
			let cols = -1, rows = -1;
			const sc = this.language.getSkinProp('grid-cell-columns', null);
			const sr = this.language.getSkinProp('grid-cell-rows', null);
			if (sc !== null)
				cols = toInt(sc, -1);
			if (sr !== null)
				rows = toInt(sr, -1);
			const brand = BrandManager.currentBrand();
			if (cols < 0)
				cols = brand.globalInteger('skin/props/grid-cell-columns', DEFAULT_BOARD_SIZE);
			if (rows < 0)
				rows = brand.globalInteger('skin/props/grid-cell-rows', DEFAULT_BOARD_SIZE);
			if (UserPrefs.cheat(CHEAT_WIDE_CELLS))
				cols = Math.max(1, Math.floor(cols / 2));
			this.board = new GridBoard(cols, rows);
			this.board.level = this;
		}
		if (this.loadDefaultDispenser) {
			const sd = new AuctionSymbolDispenser(this.board);
			sd.setAlphabet(this.language.alphabet);
			sd.setSymbolCount(100);
			const pd = new GridBoardPieceDispenserSymbols();
			pd.setSymbolDispenser(sd);
			pd.setDispensingTickPeriod(1.5);
			this.dispenser = pd;
		}
		if (this.loadDefaultLogic)
			this.logic = new RandomPlacementGBL(this.board);
		this.currentWordPieces = [];
	}

	viewWithFrame(frame) {
		if (!this.view)
			this.view = new GameLevelView(frame, this);
		return this.view.root;
	}

	get wordValidator() {
		return this._wordValidator || this.language;
	}
	set wordValidator(v) {
		this._wordValidator = v;
	}

	// ------------------------------------------------ game flow

	startGame() {
		if (this.state !== INIT && this.state !== LOADED && this.state !== START_SPLASH) {
			console.warn('[GameLevel] startGame called in an invalid state:', this.state);
			return;
		}
		if (this.state !== START_SPLASH) {
			this.blackList = new Bitset(this.language.wordCount());
			this.hintBlackList = new Bitset(this.language.wordCount());
			if (this.initialBlackList) {
				this.hintMaxWordSize = this.language.maxWordSize();
				this.rushMaxWordSize = this.hintMaxWordSize;
				for (const word of this.initialBlackList)
					this.addWordToBlackList(word, true, true);
			}
			Wallet.checkNotAllLanguageWordsHintBlackWords(this.language);
			for (const word of Wallet.allHintBlackWords())
				this.addWordToBlackList(word, this.levelEndMenu, true);
			if (this.dispenser.setBoard)
				this.dispenser.setBoard(this.board);
			if (this.logic.setBoard)
				this.logic.setBoard(this.board);
			this.stateWhenSuspended = [];
			this.boardFullWarnLeft = this.boardFullWarnBudget;
		}
		if (this.state === LOADED && this.helpSplashPanel && this.helpSplashPanel.autoShow && !(this.initialBlackList && this.initialBlackList.size)) {
			this.state = START_SPLASH;
			this.showHelpSplash();
			this.soundTheme.wordValid(null, null);
			return;
		}
		this.allowDupWords = this.allowDupWords || UserPrefs.cheat(CHEAT_REPEAT_WORDS_IN_LEVEL);
		this.allowPlayPause = this.allowPlayPause || UserPrefs.cheat(CHEAT_PLAY_PAUSE_AT_WILL);
		this.allowShowHint = this.allowShowHint || UserPrefs.cheat(CHEAT_SHOW_HINTS_AT_WILL);
		this.levelEndMenu = this.levelEndMenu || UserPrefs.cheat(CHEAT_LEVEL_END_MENU);
		this.askToAddWordsLevel = this.language.allowAddWord;

		const sdb = ScoresDatabase;
		const sw = this.scoreWidget;
		sw.allowPlayPause = this.allowPlayPause;
		sw.allowShowHint = this.allowShowHint;
		sw.scoreDisplayOffset = -sdb.globalScore() + sdb.bestScoreForGame(this.seq ? this.seq.uuid : '', this.language.uuid);
		if (!this.initialBlackList || !this.initialBlackList.size)
			sw.scoreDisplayOffset -= sdb.maxScoreForLevel(this.uuid, this.language.uuid);

		if (this.dispenser instanceof GridBoardPieceDispenserSymbols) {
			this.dispenser.rushDispensingFactor = this.rushDispensingFactor;
			this.dispenser.symbolDispenser.rushSymbols = this.buildRushSymbolsForDispenser();
		}
		if (this.hintMaxWordSize && this.hintMaxWordSize < this.minWordSize)
			this.hintMaxWordSize = this.minWordSize + 2;
		this.gameOverGraceLeft = this.gameOverGrace;
		this.idleToHintGrace = this.showHintDelay;
		this.state = PLAYING;
		this.fastGame = (this.dispenser instanceof GridBoardPieceDispenserSymbols) && this.dispenser.dispensingTickPeriod <= 0.1;
		this.dispenser.startDispensing(this);
		this.tickTimer = this.timers.every(0.2, () => this.onTimer());
		sw.setMessage1(this.title);
		sw.setMessage2(this.shortDescription);
		if (this.allowPlayPause)
			sw.setPlayState(PS_PLAYING);
		if (this.allowShowHint)
			sw.setGameAction(GA_HINT);
		// autorun (the "ar" cheat): the game plays itself, spelling its own hints right away
		this.autorun = this.autorun || UserPrefs.cheat(CHEAT_AUTORUN);
		this.autorunAccumulateScore = UserPrefs.cheat(CHEAT_AUTORUN_ACCUMULATE_SCORE);
		if (this.autorun) {
			this.idleToHintGrace = this.betweenHintDelay = this.showHintDelay = AUTORUN_DELAY;
			this.showHintWord = true;
		}
	}

	updateProgress() {
		this.scoreWidget.setProgress(this.dispenser.progress());
	}

	onDispensingStarted() { }
	onDispensingStopped() { }

	onNoMorePieces() {
		this.state = DISPENSER_DONE;
		UserPrefs.setLevelPassed(this.uuid, this.language.uuid, true);
		if (this.languageWordCount() - this.validSelectedWordCount() <= 0)
			UserPrefs.setLevelExhausted(this.uuid, this.language.uuid, true);
		this.grace = this.board.isEmpty() ? 0 : this.gameWonGrace;
	}

	onWillAcceptPiece() {
		if (this.pauseOnWordCount > 0) {
			const r = this.logic.generateBoardWordSet(this.board, this.wordValidator, this.minWordSize, 0, null);
			if (r.words.size >= this.pauseOnWordCount) {
				this.state = PAUSED;
				this.grace = this.gameOverGraceLeft;
				this.dispenser.stopDispensing();
				return false;
			}
		}
		if (this.logic.willAcceptPiece())
			return true;
		if (this.state !== BOARD_FULL) {
			this.state = BOARD_FULL;
			this.grace = this.gameOverGrace ? this.gameOverGraceLeft : -1;
		}
		this.dispenser.stopDispensing();
		return false;
	}

	onTimer() {
		if (this.state === INIT || this.state === SUSPENDED || this.state === STOPPED || this.state === DEALLOCATED)
			return;
		if (!this.enabledVerified && !UserPrefs.levelEnabled(this.uuid)) {
			this.pauseGame();
			this.eventsTarget && this.eventsTarget.abortedLevel(this);
			return;
		}
		this.enabledVerified = true;
		this.logic.onFineGameTimer();

		if (this.state === REPLAYING) {
			const word = this.getCurrentWord();
			if (this.replayIndex < 0)
				this.replayIndex++;
			else if (this.replayIndex >= word.length && this.replayIndex < word.length + 10) {
				for (const p of this.currentWordPieces)
					p.deselect();
				this.replayIndex++;
			} else if (this.replayIndex >= word.length + 10) {
				this.state = PAUSED;
				this.processValidWord(word, false);
			} else
				this.onReplayTick();
			return;
		}

		this.timerTickCounter++;
		if ((this.timerTickCounter % 5) !== 1)
			return;

		const left = this.dispenser.piecesLeft();
		this.view && this.view.updateSymbolsLeft(left ? String(left) : '');

		this.idle++;
		this.logic.onGameTimer();
		if (this.boardFullWarnLeft < this.boardFullWarnBudget)
			this.boardFullWarnLeft++;

		const now = nowSecs();
		const clearOldRewards = board => {
			for (const p of board.allPieces()) {
				const t = p.props.JokerRewardTime;
				if (t !== undefined && now - t >= OLD_REWARD_CLEAR_SECS)
					p.eliminate();
			}
		};
		clearOldRewards(this.board);
		if (this.hintBoard)
			clearOldRewards(this.hintBoard);

		switch (this.state) {
			case BOARD_FULL: {
				if (!this.logic.willAcceptPiece()) {
					if (this.grace === -1)
						break;
					this.scoreWidget.setProgress2(1.0 - (this.grace - 1) / this.gameOverGrace);
					this.grace--;
					if (this.grace <= 0) {
						if (Wallet.hasSteppedWalletItem(DECORATOR_COIN)) {
							Wallet.incrWalletItemValueByStep(DECORATOR_COIN, -1);
							this.soundTheme.decoration(DECORATOR_COIN);
							this.scoreWidget.updateWallet();
							this.grace = this.gameOverGraceLeft;
						} else {
							this.soundTheme.failedLevel();
							this.state = GAME_OVER;
							this.gameOverAlert();
						}
					} else if (this.grace <= 10 || (this.grace % 2)) {
						if (this.boardFullWarnLeft >= this.boardFullWarnCost) {
							this.soundTheme.boardFullWarning();
							this.boardFullWarnLeft -= this.boardFullWarnCost;
						}
					}
				}
				if (this.boardFullNoHint) {
					this.boardFullNoHint = false;
					this.clearBoard();
					this.state = PLAYING;
					this.gameOverGraceLeft = Math.max(this.grace, this.gameOverGraceLeft);
					this.dispenser.resumeDispensing();
				}
				break;
			}
			case DISPENSER_DONE: {
				this.scoreWidget.setProgress3(1.0 - this.grace / this.gameWonGrace);
				if ((this.grace % 5) === 4)
					this.soundTheme.dispenserDoneWarning();
				if (this.boardWordCount() === 0) {
					this.clearBoard();
					this.grace = 0;
				}
				if (this.grace-- <= 0) {
					this.soundTheme.passedLevel();
					this.state = GAME_WON;
					this.clearBoard();
					this.timers.after(0.4, () => this.gameWonAlert());
				}
				break;
			}
		}

		if (this.hintsEnabled && this.state !== GAME_WON && this.state !== GAME_OVER)
			this.hintTick();
	}

	hintTick() {
		if (this.idle >= this.idleToHintGrace && !this.hintPending && !this.hintWord) {
			// as in the original (hint generated on a thread): the generator's own idleToHintGrace
			// (betweenHintDelay, or showHintDelay when no hint was found) wins, and the hint starts showing
			// on the next tick
			this.idle = 0;
			this.idleToHintGrace = this.betweenHintDelay;
			if (this.showHintWord || this.showHintImage || this.showHintPieces || this.speakHintWord) {
				this.hintPending = true;
				this.manualHint = false;
				this.generateHint();
				this.hintPending = false;
				return;
			}
		}
		const hintIndexOffset = this.showHintImage ? 1 : 0;
		if (this.hintPending || !this.piecesHint || this.hintIndex >= this.piecesHint.length + hintIndexOffset)
			return;
		if (this.hintIndex === 0) {
			if (this.showHintPieces)
				this.resetCurrentWordPieces();
			if (this.hintWord && this.speakHintWord && !this.autorun)
				this.speak(UserPrefs.cheat(CHEAT_SPEAK_LETTER_SPELLING) ? this.spelledWord(this.hintWord) : this.hintWord);
			if (this.showHintImage && !this.autorun) {
				const hintImage = this.language.wordImage(this.wordValidator.wordForHintWord(this.hintWord));
				if (hintImage) {
					if (!this.jokerImageHints)
						this.view && this.view.showHintImage(hintImage, this.flashEnvelope());
					else {
						this.removeAllJokerHints(null);
						if (!this.hintBoard && !this.logic.willAcceptPiece()) {
							const hintPieces = this.piecesHint;
							for (const piece of shuffle(this.board.allPieces()))
								if (!hintPieces.includes(piece)) {
									piece.eliminate();
									break;
								}
						}
						const piece = new SymbolPiece(JOKER_CHAR);
						piece.image = hintImage;
						piece.props.JokerHint = true;
						piece.props.JokerHintWord = this.hintWord;
						piece.props.JokerHintWord1 = this.wordValidator.wordForHintWord(this.hintWord);
						if (this.hintBoard)
							this.hintBoard.placePiece(piece, 0);
						else if (this.logic.willAcceptPiece())
							this.logic.pieceDispensed(piece);
						piece.examine();
					}
				}
			}
			if (this.showHintWord) {
				if (UserPrefs.cheat(CHEAT_TEXT_HINT_MODE_1)) {
					// text hint modes: show the word's text (from the word list) instead of / with the word
					const md = this.language.wordMetaData(this.hintWord) || {};
					let w = md.text || null;
					if (w && w.length > 30)
						w = w.slice(0, 30) + ' ...';
					if (!w)
						w = this.hintWord;
					if (UserPrefs.cheat(CHEAT_TEXT_HINT_MODE_2))
						this.scoreWidget.setMessage(this.wordValidator.wordForHintWord(w));
					else {
						this.scoreWidget.setMessage1(this.wordValidator.wordForHintWord(this.hintWord));
						this.scoreWidget.setMessage2(this.wordValidator.wordForHintWord(w));
					}
				} else
					this.updateHintWord();
			}
			if (this.autorun)
				this.autorunSpellHint();
		}
		if (this.hintIndex - hintIndexOffset >= 0) {
			const piece = this.piecesHint[this.hintIndex - hintIndexOffset];
			if (!piece || !piece.cell || piece.cell.board !== this.boardOfCell(piece.cell))
				this.resetHint();
			else {
				const last = ++this.hintIndex >= this.piecesHint.length + hintIndexOffset;
				if (this.showHintPieces) {
					piece.hinted(last);
					if (last) {
						this.soundTheme.pieceHintedLast();
						this.resetHint();
					} else
						this.soundTheme.pieceHinted();
				} else
					this.resetHint();
				this.idle = 0;
				this.idleToHintGrace = this.betweenHintDelay;
			}
		} else
			this.hintIndex++;
	}

	// the board a cell belongs to, when it is (part of) the level's board
	boardOfCell(cell) {
		const b = cell.board;
		if (b === this.board)
			return b;
		if (this.board.boards && this.board.boards.some(e => e.board === b))
			return b;
		return null;
	}

	gameWonAlert() {
		if (this.state === STOPPED || this.state === DEALLOCATED)
			return;
		this.updateProgress();
		this.dispenser.stopDispensing();
		this.scoreWidget.commitScore();
		this.logic.onGameWon();
		this.scoreWidget.setPlayState(PS_NONE);
		this.scoreWidget.setGameAction(GA_NONE);
		this.stopTickTimer();
		if (!this.alertAddCandidates())
			this.gameWonAlertPart2();
	}

	gameWonAlertPart2() {
		if (!this.showSummarySplash) {
			this.gameWonAlertPart3();
			return;
		}
		const panel = new SplashPanel();
		this.summarySplashPanel = panel;
		panel.delegate = this;
		panel.title = this.title;
		const sdb = ScoresDatabase;
		let score = 0;
		const validWords = [];
		for (const word of [...this.selectedWords.keys()].sort()) {
			const info = this.selectedWords.get(word);
			if (info.type === WI_ADDED || info.type === WI_VALID) {
				Wallet.addHintBlackWord(word);
				validWords.push(this.wordValidator.wordForHintWord(word));
				score += info.scoreContrib;
			}
		}
		const maxScore = sdb.maxScoreForLevel(this.uuid, this.language.uuid);
		const newRecord = score > maxScore;
		if (score)
			panel.title = `${newRecord ? 'New Level Record' : 'Level Score'} : ${sdb.format(score)}`;
		else
			panel.title = 'Level Passed';
		if (newRecord)
			this.timers.after(0.3, () => this.soundTheme.decorationExtra(DECORATOR_COIN));
		panel.buttonText = 'Next Level';
		panel.text = `Words You Just Spelled:\n\n${validWords.join(', ')}`;
		this.scoreWidget.setMessage('');
		panel.show();
	}

	gameWonAlertPart3() {
		if (this.eventsTarget)
			this.eventsTarget.passedLevel(this, this.showSummarySplash ? null : 'Very Nice!', null);
		else {
			const panel = new SplashPanel();
			panel.title = 'Very Nice!';
			panel.text = 'No More Symbols';
			panel.buttonText = 'OK';
			panel.show();
		}
	}

	gameOverAlert() {
		if (this.state === STOPPED || this.state === DEALLOCATED)
			return;
		this.updateProgress();
		this.dispenser.stopDispensing();
		this.scoreWidget.commitScore();
		this.logic.onGameOver();
		this.scoreWidget.setPlayState(PS_NONE);
		this.scoreWidget.setGameAction(GA_NONE);
		this.stopTickTimer();
		if (!this.alertAddCandidates())
			this.gameOverAlertPart2();
	}

	gameOverAlertPart2() {
		if (!this.showSummarySplash) {
			this.gameOverAlertPart3();
			return;
		}
		const wordLimit = 20;
		const panel = new SplashPanel();
		this.summarySplashPanel = panel;
		panel.delegate = this;
		const r = this.logic.generateBoardWordSet(this.board, this.wordValidator, this.minWordSize, 0, this.blackList);
		const ws = r.words;
		panel.title = 'Level Failed!';
		let boardWords = [];
		let notAllDisplayed = false;
		if (ws.size <= wordLimit)
			boardWords = ws.elems.map(i => this.language.getWordByIndex(i));
		else {
			for (let n = 0; n < wordLimit * 2; n++) {
				const word = this.language.getWordByIndex(ws.elems[randInt(ws.size)]);
				if (!boardWords.includes(word))
					boardWords.push(word);
				if (boardWords.length >= wordLimit)
					break;
			}
			notAllDisplayed = true;
		}
		boardWords.sort();
		let text = boardWords.map(w => this.wordValidator.wordForHintWord(w)).join(', ');
		if (notAllDisplayed)
			text += ' ...';
		text += '\n';
		if (!this.logic.includesRole('Disable!'))
			text += `[${ws.size} words on board]`;
		else
			text += `[at least ${ws.size} words on board]`;
		panel.text = `Words On Board:\n\n${text}`;
		panel.buttonText = 'Try Again';
		this.scoreWidget.setMessage('');
		panel.show();
	}

	gameOverAlertPart3() {
		if (this.eventsTarget)
			this.eventsTarget.failedLevel(this, this.showSummarySplash ? null : 'Board Full!', null);
		else {
			const panel = new SplashPanel();
			panel.title = 'Game Over';
			panel.text = 'Board Full';
			panel.buttonText = 'OK';
			panel.show();
		}
	}

	stopTickTimer() {
		if (this.tickTimer !== null && this.tickTimer !== undefined) {
			this.timers.cancel(this.tickTimer);
			this.tickTimer = null;
		}
	}

	pauseGame() {
		this.state = PAUSED;
		this.grace = this.pausedGrace;
		this.dispenser && this.dispenser.stopDispensing();
		this.scoreWidget && this.scoreWidget.commitScore();
	}

	suspendGame() {
		if (!this.stateWhenSuspended)
			this.stateWhenSuspended = [];
		this.stateWhenSuspended.unshift(this.state);
		this.state = SUSPENDED;
		this.dispenser.stopDispensing();
		this.scoreWidget.commitScore();
		if (this.allowPlayPause)
			this.scoreWidget.setPlayState(PS_PAUSED);
		this.board.setPiecesSelectable(false);
	}

	suspendGameWithAutomaticResumeAfter(seconds) {
		if (this.state !== SUSPENDED && this.state !== DISPENSER_DONE) {
			this.suspendGame();
			this.board.setPiecesSelectable(true);
			if (this.autorun)
				seconds = 1;
			this.timers.after(seconds, () => {
				if (this.state === SUSPENDED)
					this.resumeGame();
			});
		}
	}

	resumeGame() {
		if (!this.stateWhenSuspended || !this.stateWhenSuspended.length)
			return;
		this.state = this.stateWhenSuspended.shift();
		if (this.state !== SUSPENDED) {
			if (this.state !== DISPENSER_DONE && this.state !== PAUSED && this.state !== GAME_OVER && this.state !== GAME_WON)
				this.dispenser.resumeDispensing();
			if (this.allowPlayPause && this.state !== GAME_OVER && this.state !== GAME_WON)
				this.scoreWidget.setPlayState(PS_PLAYING);
			this.board.setPiecesSelectable(true);
		}
	}

	stopGame() {
		if (this.state === INIT || this.state === LOADED) {
			this.state = STOPPED;
			this.timers.kill();
			return;
		}
		for (const p of [this.helpSplashPanel, this.textSplashPanel, this.summarySplashPanel])
			if (p)
				p.abort();
		this.summarySplashPanel = null;
		ActionSheet.dismissAll();
		this.pauseGame();
		this.state = STOPPED;
		this.timers.kill();
		this.scoreWidget.commitScore();
		this.scoreWidget.setPlayState(PS_NONE);
		this.scoreWidget.setGameAction(GA_NONE);
		if (window.speechSynthesis)
			window.speechSynthesis.cancel();
	}

	// ------------------------------------------------ pieces

	onPieceDispensed(piece) {
		if (this.state === STOPPED)
			return;
		const originalSymbol = piece.props.OriginalSymbol;
		if (originalSymbol && originalSymbol.charAt(0) === JOKER_CHAR) {
			if (this.boardWordCount() === 0) {
				this.dispenser.stopDispensing();
				this.onNoMorePieces();
				return;
			}
		}
		const hints = piece.props.hints;
		if (hints && hints.WordSymbolIndex !== undefined) {
			const word = hints.Word;
			if (!hints.WordDispensingIndex) {
				this.wordValidator.wordDispensed(word);
				if (this.showWordImageOnDispensed) {
					const image = this.language.wordImage(word);
					if (image)
						this.view && this.view.showHintImage(image, this.flashEnvelope());
				}
				if (this.speakWordOnDispensed)
					this.speak(word);
			}
			this.idle = 0;
			this.idleToHintGrace = this.showHintDelay;
		}
		this.logic.pieceDispensed(piece);
		this.soundTheme.pieceDispensed();
		this.updateProgress();
	}

	pieceSelected(piece) {
		if (this.state === STOPPED || this.state === GAME_OVER || this.state === GAME_WON)
			return;
		if (this.autoMaxWordSizeBehavior !== AutoMaxWordSizeBehaviorNone && this.currentWordPieces.length >= this.language.maxWordSize()) {
			if (this.autoMaxWordSizeBehavior === AutoMaxWordSizeBehaviorTerminate)
				this.pieceReselected(this.currentWordPieces[this.currentWordPieces.length - 1]);
			else if (this.autoMaxWordSizeBehavior === AutoMaxWordSizeBehaviorReset)
				this.resetCurrentWordPieces();
		}
		this.idle = 0;
		this.idleToHintGrace = this.betweenHintDelay;
		this.resetHint();
		this.logic.pieceSelected(piece);
		this.soundTheme.pieceSelected();
		if (this.state === PAUSED || this.state === HINTING) {
			this.state = PAUSED;
			this.grace = this.pausedGrace;
		}
		this.currentWordPieces.push(piece);
		this.updateCurrentWord();
		this.updateProgress();
	}

	pieceClicked(piece) { }

	updateCurrentWord() {
		this.scoreWidget.setMessage(this.wordValidator.wordForHintWord(this.getCurrentWord()));
	}

	pieceReselected(piece) {
		if (this.state === STOPPED || this.state === GAME_OVER || this.state === GAME_WON)
			return;
		this.idle = 0;
		this.idleToHintGrace = this.betweenHintDelay;
		this.resetHint();
		if (this.state === PAUSED || this.state === HINTING) {
			this.state = PAUSED;
			this.grace = this.pausedGrace;
		}
		const pieces = this.currentWordPieces;
		if (pieces.length > 0 && (!this.allowReselectPartialDeselect || pieces[pieces.length - 1] === piece)) {
			let word = this.getCurrentWord();
			const wordTooShort = this.minWordSize && word.length < this.minWordSize;
			const wordContainsJoker = containsJoker(word);
			const jokerWords = this.getCurrentWordJokerWords();
			const validatorWord = this.wordValidator.isValidWord(word, this.blackList, jokerWords);
			let wordValid = validatorWord !== null && !wordTooShort;
			if (wordValid) {
				word = validatorWord;
				if (wordContainsJoker && jokerWords.size && (jokerWords.size > 1 || !jokerWords.has(word)))
					wordValid = false;
			}
			if (!wordValid) {
				if (word.length === 1 && Wallet.hasSteppedWalletItem(DECORATOR_BOMB)) {
					if (piece.hasDecorator(DECORATOR_BOMB)) {
						Wallet.incrWalletItemValueByStep(DECORATOR_BOMB, -1);
						wordValid = true;
					}
				} else if (word.length === 3 && Wallet.hasSteppedWalletItem(DECORATOR_APPLE)) {
					const allApples = pieces.every(p => p.hasDecorator(DECORATOR_APPLE) && !pieceIsJoker(p) && p instanceof SymbolPiece);
					if (allApples) {
						Wallet.incrWalletItemValueByStep(DECORATOR_APPLE, -1);
						this.scoreWidget.updateWallet();
						for (const p of pieces) {
							p.deselect();
							p.removeDecorator(DECORATOR_APPLE);
							p.setText(JOKER_CHAR);
						}
						this.resetCurrentWordPieces();
						this.soundTheme.decorationExtra(DECORATOR_APPLE);
					}
				}
			}
			let info = this.selectedWords.get(word);
			if (wordContainsJoker && !wordValid) {
				// nothing
			} else if (!info) {
				info = { type: wordValid ? WI_VALID : WI_INVALID, count: 1, scoreContrib: 0, scoreContribFancy: false };
				this.selectedWords.set(word, info);
			} else
				info.count++;

			if (wordContainsJoker && !wordValid) {
				this.resetCurrentWordPieces();
				this.logic.invalidWordSelected(word);
				this.soundTheme.wordInvalid();
				this.idleToHintGrace = this.showHintDelay;
			} else if (!this.allowDupWords && ((info.type === WI_VALID && info.count > 1) || info.type === WI_BLACKLISTED)) {
				this.resetCurrentWordPieces();
				this.logic.invalidWordSelected(word);
				this.soundTheme.wordBlackListed();
				this.scoreWidget.setMessage1(word);
				this.scoreWidget.setMessage2('Word Already Used!');
				this.idleToHintGrace = this.showHintDelay;
			} else if (info.type === WI_VALID || info.type === WI_ADDED) {
				this.logic.validWordSelected(word);
				this.wordValidator.wordCompleted(word);
				this.soundTheme.wordValid(this.speakRewardWord ? word : null, this.language);
				if (this.replayValidWord) {
					for (const p of pieces)
						p.deselect();
					this.replayIndex = -5;
					this.state = REPLAYING;
					this.onReplayTick();
				} else {
					this.scoreWord(info);
					this.processValidWord(word, wordContainsJoker);
					this.idleToHintGrace = this.showHintDelay;
				}
			} else if (info.type === WI_INVALID) {
				if (wordTooShort) {
					this.resetCurrentWordPieces();
					this.logic.invalidWordSelected(word);
					this.soundTheme.wordInvalid();
					this.scoreWidget.setMessage1(word);
					this.scoreWidget.setMessage2('Word Too Short!');
					this.idleToHintGrace = this.showHintDelay;
				} else if (this.allowAddWords && askToAddWordsGlobal && this.askToAddWordsLevel && info.count === 2) {
					this.suspendGame();
					this.alertInvalidWordCandidate(word);
				} else {
					this.resetCurrentWordPieces();
					this.logic.invalidWordSelected(word);
					this.soundTheme.wordInvalid();
					this.idleToHintGrace = this.showHintDelay;
				}
			}
		} else {
			const index = pieces.indexOf(piece);
			if (index >= 0)
				while (pieces.length > index)
					pieces.pop().reset();
			this.updateCurrentWord();
			this.logic.wordSelectionCanceled();
			this.soundTheme.wordReset();
		}
	}

	// ------------------------------------------------ autorun (port of the autorun parts of onTimer)

	autorunSpellHint() {
		const hint = this.piecesHint;
		if (!hint || !hint.length)
			return;
		let useJokers = !this.logic.includesRole('Disable!');
		if (useJokers && hint.some(p => pieceIsJoker(p)))
			useJokers = false;
		if (useJokers) {
			const joker = this.board.allPieces().find(p => pieceIsJoker(p) && this.jokerValidForWord(p, this.hintWord));
			if (joker && randInt(2))
				hint[randInt(hint.length)] = joker;
		}
		this.logic.wordSelectionCanceled();
		this.resetCurrentWordPieces();
		const hintWord = this.hintWord;
		hint.forEach((piece, n) => {
			const last = n === hint.length - 1;
			this.timers.after(AUTORUN_CLICK_DELAY * (n + 1), () => this.autorunClickPiece(piece, last, useJokers ? 0.5 : 0.0, hintWord));
		});
	}

	autorunClickPiece(piece, last, forceJokerProb, hintWord) {
		if (this.state === STOPPED || this.state === DEALLOCATED)
			return;
		const forceJoker = Math.random() < forceJokerProb;
		if (!forceJoker && !piece.selected() && !piece.disabled && piece.cell)
			piece.clicked();
		else {
			let found = null;
			for (const p of this.board.allPieces()) {
				if (!forceJoker && p === piece)
					continue;
				const candidate = piece.sameContentAs(p) || (pieceIsJoker(p) && this.jokerValidForWord(p, hintWord));
				if (candidate && !p.selected() && !p.disabled) {
					found = p;
					break;
				}
			}
			piece = found;
			if (piece)
				piece.clicked();
		}
		if (piece && last)
			this.timers.after(AUTORUN_CLICK_DELAY, () => {
				if (this.state !== STOPPED && this.state !== DEALLOCATED && piece.cell)
					piece.clicked();
			});
	}

	// keyboard backspace (web addition): un-select the last selected piece only
	removeLastPiece() {
		const pieces = this.currentWordPieces;
		if (!pieces || !pieces.length || this.state === STOPPED)
			return;
		pieces.pop().reset();
		this.updateCurrentWord();
		this.logic.wordSelectionCanceled();
		const dis = this.logic.getIncludedRole ? this.logic.getIncludedRole('Disable!') : null;
		if (dis && pieces.length)
			dis.crossActivate(dis.progressive ? pieces[pieces.length - 1] : pieces[0]);
		this.soundTheme.wordReset();
	}

	scoreWord(info) {
		if (this.autorun && !this.autorunAccumulateScore)
			return;		// autorun plays don't count unless "aras" is on
		const count = this.currentWordPiecesNonJokerCount();
		const score = count ? Math.pow(2, count) : 0;
		let finalScore = this.logic.scoreSuggested(score, this.currentWordPieces);
		if (score !== finalScore)
			info.scoreContribFancy = true;
		finalScore = Math.round(finalScore * this.scoreFactor);
		info.scoreContrib += finalScore;
		this.validWordCount++;
		this.scoreWidget.addToScore(finalScore);
	}

	processValidWord(word, showWord) {
		let removedJokerWord = false;
		this.showHintPieces = false;
		if (this.jokerImageHints)
			removedJokerWord = this.removeAllJokerHints(word);
		for (const p of this.logic.eliminationSuggested(this.currentWordPieces))
			p.eliminate();
		this.currentWordPieces = [];
		if (this.autoValidWordWipe)
			this.clearBoard();
		if (!this.allowDupWords) {
			const index = this.language.wordIndex(word);
			if (index >= 0) {
				this.blackList.add(index);
				this.hintBlackList.add(index);
			}
		}
		const boardWasEmpty = this.board.isEmpty();
		const md = this.language.wordMetaData(word) || {};
		if (this.showWordImageOnValid && this.showRewardImage && md.image) {
			if (!this.jokerImageRewards)
				this.view && this.view.showHintImage(md.image, this.flashEnvelope());
			else if (!removedJokerWord) {
				const piece = new SymbolPiece(JOKER_CHAR);
				piece.image = md.image;
				piece.props.JokerHint = true;
				piece.props.JokerHintWord = word;
				piece.props.JokerHintWord1 = this.wordValidator.wordForHintWord(word);
				piece.props.JokerRewardTime = nowSecs();
				if (this.hintBoard)
					this.hintBoard.placePiece(piece, 0);
				else if (this.logic.willAcceptPiece())
					this.logic.pieceDispensed(piece);
				piece.examine();
			}
		}
		if (showWord)
			this.scoreWidget.setMessage(word);
		if (this.showRewardText && md.text && UserPrefs.cheat(CHEAT_TEXT_HINT_MODE_1)) {
			let w = md.text;
			if (w.length > 30)
				w = w.slice(0, 30) + ' ...';
			this.scoreWidget.setMessage1(this.wordValidator.wordForHintWord(word));
			this.scoreWidget.setMessage2(this.wordValidator.wordForHintWord(w));
		} else if (this.showRewardText && md.text) {
			const panel = new SplashPanel();
			panel.title = md.textTitle || word;
			panel.text = md.text;
			if (md.image)
				panel.icon = md.image;
			panel.delegate = this;
			if (md.props && md.props['splash-text-font-size'])
				panel.textFontSize = toFloat(md.props['splash-text-font-size'], 14);
			this.textSplashPanel = panel;
			this.timers.after(0.1, () => panel.show());
		}
		if (this.state === PAUSED && this.pauseOnWordCount > 0) {
			this.pauseOnWordCount += this.pauseOnWordCountIncrement;
			this.state = PLAYING;
			this.gameOverGraceLeft = Math.max(this.grace, this.gameOverGraceLeft);
			this.dispenser.resumeDispensing();
			if (this.allowPlayPause)
				this.scoreWidget.setPlayState(PS_PLAYING);
		}
		if (this.state === BOARD_FULL) {
			this.state = PLAYING;
			this.gameOverGraceLeft = Math.max(this.grace, this.gameOverGraceLeft);
			this.scoreWidget.setProgress2(0);
			this.dispenser.resumeDispensing();
		} else if (this.state === DISPENSER_DONE) {
			if (boardWasEmpty) {
				this.state = GAME_WON;
				this.clearBoard();
				this.soundTheme.passedLevel();
				this.timers.after(0.4, () => this.gameWonAlert());
			}
		} else if (this.state === PAUSED) {
			if (boardWasEmpty || this.board.allPieces().length <= 1) {
				for (const p of this.board.allPieces())
					p.eliminate();
				this.state = PLAYING;
				this.dispenser.resumeDispensing();
				if (this.allowPlayPause)
					this.scoreWidget.setPlayState(PS_PLAYING);
			}
		}
		this.gameOverGraceLeft += word.length * 3;
		if (this.gameOverGraceLeft > this.gameOverGrace)
			this.gameOverGraceLeft = this.gameOverGrace;
	}

	getCurrentWord() {
		return this.currentWordPieces.map(p => p.text).join('');
	}

	getCurrentWordJokerWords() {
		const words = new Set();
		for (const p of this.currentWordPieces) {
			if (p.props.JokerHintWord)
				words.add(p.props.JokerHintWord);
			if (p.props.JokerHintWord1)
				words.add(p.props.JokerHintWord1);
		}
		return words;
	}

	jokerValidForWord(p, w) {
		if (p.props.JokerHintWord && p.props.JokerHintWord !== w)
			return false;
		if (p.props.JokerHintWord1 && p.props.JokerHintWord1 !== w)
			return false;
		return true;
	}

	getCurrentScore() {
		return this.scoreWidget.score();
	}

	resetCurrentWordPieces() {
		for (const p of this.currentWordPieces)
			p.reset();
		this.currentWordPieces = [];
		this.updateCurrentWord();
	}

	// ------------------------------------------------ hints

	generateHint() {
		if (this.state === INIT || !this.wordValidator)
			return;
		let hintGenerated = false;
		let usedMaxLimit = this.hintMaxWordSize !== 0;
		let r = this.logic.generateBoardWordSet(this.board, this.wordValidator, this.minWordSize, this.hintMaxWordSize, this.hintBlackList);
		if ((!r.words || !r.words.size) && this.hintMaxWordSize) {
			r = this.logic.generateBoardWordSet(this.board, this.wordValidator, this.minWordSize, 0, this.blackList);
			usedMaxLimit = false;
		}
		const ws = r.words;
		const pieces = r.pieces.slice();
		if (ws) {
			this.hintWordCount = ws.size;
			this.hintWordCountAtleast = usedMaxLimit || this.logic.includesRole('Disable!');
			this.resetHint();
			if (ws.size) {
				hintGenerated = true;
				let wordIndex = ws.elems[randInt(ws.size)];
				if (ws.size > 1 && wordIndex === this.lastGeneratedHintWordIndex)
					for (let n = 0; n < 5 && wordIndex === this.lastGeneratedHintWordIndex; n++)
						wordIndex = ws.elems[randInt(ws.size)];
				this.lastGeneratedHintWordIndex = wordIndex;
				this.hintWord = this.wordValidator.getValidWordByIndex(wordIndex);
				const hintPieces = [];
				let startingCharIndex = 0;
				let firstPiece = pieces[0];
				if (firstPiece && firstPiece.text === this.hintWord.charAt(0)) {
					hintPieces.push(firstPiece);
					startingCharIndex = 1;
				} else
					firstPiece = null;
				let ok = true;
				for (let ci = startingCharIndex; ci < this.hintWord.length; ci++) {
					const num = pieces.length;
					if (!num) {
						ok = false;
						break;
					}
					const ofs = randInt(num);
					let hintPiece = null;
					for (let n = 0; n < num; n++) {
						const idx = (n + ofs) % num;
						const piece = pieces[idx];
						if (!piece || piece === firstPiece)
							continue;
						const o = piece.props.OriginalSymbol;
						const sym = o !== undefined && o !== null ? o : piece.text;
						if (sym.length && sym.charAt(0) === this.hintWord.charAt(ci)) {
							hintPiece = piece;
							pieces.splice(idx, 1);
							break;
						}
					}
					if (hintPiece)
						hintPieces.push(hintPiece);
					else {
						ok = false;
						break;
					}
				}
				if (!ok)
					this.resetHint();
				else if (hintPieces.length)
					this.piecesHint = hintPieces;
			}
		}
		if (!hintGenerated)
			this.scoreWidget.setMessage('');
		else if (this.showHintWord && this.manualHint)
			this.updateHintWord();
		if (!hintGenerated && this.state === BOARD_FULL)
			this.boardFullNoHint = true;
		this.idleToHintGrace = hintGenerated ? this.betweenHintDelay : this.showHintDelay;
	}

	resetHint() {
		this.hintIndex = 0;
		this.piecesHint = null;
		this.hintWord = null;
	}

	score() {
		return this.scoreWidget.score();
	}

	targetFullness() {
		return 1.0 - this.board.freeCellCount() / this.board.cellCount();
	}

	targetProgress() {
		return Math.min(1.0, this.validWordCount / 10.0);
	}

	targetLanguage() {
		return this.language;
	}

	onReplayTick() {
		if (this.replayIndex >= 0 && this.replayIndex < this.currentWordPieces.length) {
			const piece = this.currentWordPieces[this.replayIndex];
			const prev = this.replayIndex >= 1 ? this.currentWordPieces[this.replayIndex - 1] : null;
			if (prev)
				prev.deselect();
			if (piece)
				piece.select();
		}
		this.replayIndex++;
	}

	onScoreWidgetTouched(tapCount) {
		if (this.state === STOPPED)
			return;
		switch (tapCount) {
			case 1:
				this.soundTheme.wordReset();
				this.resetHint();
				this.resetCurrentWordPieces();
				this.logic.wordSelectionCanceled();
				break;
			case 2:
			case 22:
				if (this.state === PAUSED || this.state === SUSPENDED || this.state === GAME_WON || this.state === GAME_OVER)
					break;
				this.fullHint = tapCount === 22;
				if (!this.hintPending) {
					this.hintPending = true;
					if (this.showHintWordCount) {
						this.scoreWidget.setMessage1('...');
						this.scoreWidget.setMessage2('');
					} else
						this.scoreWidget.setMessage('...');
					this.manualHint = true;
					this.timers.after(0.05, () => {
						this.generateHint();
						this.hintPending = false;
					});
				}
				break;
			case 3:
				if (this.state === GAME_WON || this.state === GAME_OVER)
					break;
				if (this.state !== SUSPENDED) {
					this.suspendGame();
					this.view && this.view.updatePauseCurtain();
					this.scoreWidget.setMessage('paused');
				} else {
					this.resumeGame();
					this.view && this.view.updatePauseCurtain();
					this.scoreWidget.setMessage('');
				}
				break;
		}
	}

	// ------------------------------------------------ adding words to the language

	alertInvalidWordCandidate(word) {
		this.addWordCandidate = word;
		ActionSheet.show(null, [
			{ label: `Add Word '${word}' As Valid`, style: 'destructive', handler: () => this.alertInvalidWordCandidateClicked(0) },
			{ label: 'Not In This Level', handler: () => this.alertInvalidWordCandidateClicked(1) },
			{ label: 'Disable Adding Words', handler: () => this.alertInvalidWordCandidateClicked(2) },
			{ label: 'Cancel', style: 'cancel', handler: () => this.alertInvalidWordCandidateClicked(3) }
		]);
	}

	alertInvalidWordCandidateClicked(buttonIndex) {
		if (this.state === STOPPED)
			return;
		if (this.addWordCandidate) {
			const word = this.addWordCandidate;
			if (buttonIndex === 0) {
				const info = this.selectedWords.get(word);
				if (info) {
					info.type = WI_ADDED;
					this.logic.validWordSelected(word);
					this.wordValidator.wordCompleted(word);
					this.soundTheme.wordValid(word, this.language);
					this.scoreWord(info);
					this.processValidWord(word, false);
				}
			} else {
				if (buttonIndex === 1)
					this.askToAddWordsLevel = false;
				else if (buttonIndex === 2)
					askToAddWordsGlobal = false;
				this.resetCurrentWordPieces();
				this.logic.invalidWordSelected(word);
				this.soundTheme.wordInvalid();
			}
			this.addWordCandidate = null;
			this.resumeGame();
		} else if (!this.commitWordCandidate) {
			if (buttonIndex === 0) {
				for (const word of this.commitWords)
					this.language.addWord(word);
				this.languageChanged();
			} else if (buttonIndex === 1) {
				this.alertApproveWord();
				return;
			}
			this.afterCommit();
		} else {
			if (buttonIndex === 0) {
				this.language.addWord(this.commitWordCandidate);
				this.languageChanged();
			}
			if (this.commitWords.length) {
				this.alertApproveWord();
				return;
			}
			this.afterCommit();
		}
	}

	afterCommit() {
		this.commitWordCandidate = null;
		if (this.state === GAME_WON)
			this.gameWonAlertPart2();
		else if (this.state === GAME_OVER)
			this.gameOverAlertPart2();
	}

	languageChanged() {
		LanguageManager.clearCache(this.language.uuid);
		if (this.seq)
			this.seq.invalidateLanguage();
	}

	alertApproveWord() {
		this.addWordCandidate = null;
		this.commitWordCandidate = this.commitWords.shift();
		ActionSheet.show(null, [
			{ label: `Add Word '${this.commitWordCandidate}' As Valid`, style: 'destructive', handler: () => this.alertInvalidWordCandidateClicked(0) },
			{ label: 'Cancel', style: 'cancel', handler: () => this.alertInvalidWordCandidateClicked(1) }
		]);
		return true;
	}

	alertAddCandidates() {
		this.commitWords = [];
		for (const [word, info] of this.selectedWords)
			if (info.type === WI_ADDED)
				this.commitWords.push(word);
		const count = this.commitWords.length;
		if (!count)
			return false;
		this.addWordCandidate = null;
		this.commitWordCandidate = null;
		ActionSheet.show(null, [
			{ label: `Commit ${count} New Word${count > 1 ? 's' : ''}`, style: 'destructive', handler: () => this.alertInvalidWordCandidateClicked(0) },
			{ label: 'Approve One By One', style: 'destructive', handler: () => this.alertInvalidWordCandidateClicked(1) },
			{ label: 'Cancel', style: 'cancel', handler: () => this.alertInvalidWordCandidateClicked(2) }
		]);
		return true;
	}

	// ------------------------------------------------ helpers

	flashEnvelope() {
		return {
			attack: { duration: this.flashAttackDuration, alpha: this.flashAttackAlpha },
			sustain: { duration: this.flashSustainDuration, alpha: this.flashSustainAlpha },
			decay: { duration: this.flashDecayDuration, alpha: this.flashDecayAlpha }
		};
	}

	buildRushSymbolsForDispenser() {
		if (!this.rushSymbols && !this.rushWords)
			return '';
		let symbols = this.rushSymbols || '';
		if (this.rushWords) {
			const minSize = Math.max(this.rushMinWordSize, this.minWordSize);
			const maxSize = this.rushMaxWordSize >= minSize ? this.rushMaxWordSize : minSize + 2;
			const bl = this.blackList.clone();
			for (let i = 0; i < this.rushWords; i++) {
				const word = this.language.getRandomWord(minSize, maxSize, bl);
				if (!word)
					break;
				bl.add(this.language.wordIndex(word));
				symbols += word;
			}
		}
		return symbols;
	}

	splashDidShow(panel) {
		if (panel === this.helpSplashPanel && this.state !== START_SPLASH)
			this.suspendGame();
		if (panel === this.textSplashPanel)
			this.suspendGame();
	}

	splashDidFinish(panel) {
		if (this.state === STOPPED)
			return;
		if (panel === this.summarySplashPanel) {
			this.summarySplashPanel = null;
			if (this.state === GAME_OVER)
				this.gameOverAlertPart3();
			else
				this.gameWonAlertPart3();
			return;
		}
		if (this.state === START_SPLASH)
			this.startGame();
		else if (this.state === SUSPENDED)
			this.resumeGame();
	}

	speak(word) {
		const url = this.language.wordSoundUrl(word);
		if (url)
			TextSpeaker.play(url);
		else
			TextSpeaker.speak(this.wordValidator.wordForHintWord(word), this.language.voiceLanguage || TextSpeaker.DEFAULT_LANG);
	}

	currentWordPiecesNonJokerCount() {
		return this.currentWordPieces.filter(p => !pieceIsJoker(p)).length;
	}

	removeAllJokerHints(word) {
		let eliminatedWord = false;
		const pieces = this.board.allPieces();
		if (this.hintBoard)
			pieces.push(...this.hintBoard.allPieces());
		const queue = [];
		for (const p of pieces)
			if (p.props.JokerHint) {
				if (word) {
					if (word === p.props.JokerHintWord)
						eliminatedWord = true;
					else if (this.wordValidator.wordForHintWord(word) === p.props.JokerHintWord1)
						eliminatedWord = true;
				}
				queue.push(p);
			}
		for (const p of queue)
			p.eliminate();
		return eliminatedWord;
	}

	validSelectedWords() {
		const words = new Set();
		for (const [word, info] of this.selectedWords || [])
			if (info.type === WI_ADDED || info.type === WI_VALID || info.type === WI_BLACKLISTED)
				words.add(word);
		return words;
	}

	validSelectedWordCount() {
		return this.validSelectedWords().size;
	}

	languageWordCount() {
		return !this.minWordSize ? this.language.wordCount() : this.language.getWordCount(this.minWordSize, 0);
	}

	// the original computed this on a thread: the first call returns -1 (pending), the next one the count
	boardWordCount() {
		if (this.boardWordCountPending) {
			this.boardWordCountPending = false;
			const r = this.logic.generateBoardWordSet(this.board, this.wordValidator, this.minWordSize, 0, this.blackList);
			return r.words.size;
		}
		this.boardWordCountPending = true;
		return -1;
	}

	clearBoard() {
		for (const p of this.board.allPieces())
			p.eliminate();
	}

	spelledWord(word) {
		return word + ', ' + word.split('').map(c => c + '. ').join('') + '. ' + word;
	}

	shaken() {
		if (this.scoreWidget.gameAction === GA_HINT)
			this.scoreWidget.pressGameAction();
	}

	updateHintWord() {
		if (!this.hintWord)
			return;
		if (!this.showHintWordCount)
			this.scoreWidget.setMessage(this.wordValidator.wordForHintWord(this.hintWord));
		else {
			this.scoreWidget.setMessage1(this.wordValidator.wordForHintWord(this.hintWord));
			this.scoreWidget.setMessage2(this.hintWordCountAtleast ? `at least ${this.hintWordCount} words on board` : `${this.hintWordCount} words on board`);
		}
	}

	remainingCount() {
		return this.language.getWordCount(this.minWordSize, 0) - this.blackList.count();
	}

	addWordToBlackList(word, addToBlackList, addToHintBlackList) {
		const index = this.language.wordIndex(word);
		if (index >= 0) {
			if (addToBlackList)
				this.blackList.add(index);
			if (addToHintBlackList)
				this.hintBlackList.add(index);
		}
		// (the original recorded words of other languages too, inflating the level end word counts)
		if (addToBlackList && index >= 0)
			this.selectedWords.set(word, { type: WI_BLACKLISTED, count: 1, scoreContrib: 0 });
	}

	showHelpSplash() {
		const panel = this.helpSplashPanel;
		if (!panel)
			return;
		const orgText = panel.text || '';
		if (orgText.includes('[%remaining]') && this.blackList)
			panel.text = orgText.split('[%remaining]').join(String(this.remainingCount()));
		panel.show();
		panel.text = orgText;
	}

	dispose() {
		this.state = DEALLOCATED;
		this.timers.kill();
		if (this.dispenser)
			this.dispenser.stopDispensing();
		if (this.view)
			this.view.dispose();
	}
}

// a formula may be given indirectly (port of FormulaEvaluator): "!<file>" names a file in the current skin's
// folder, "http(s)://..." a URL to fetch it from. "=<tcl>" (a Tcl script) is not supported.
async function evalFormula(formula) {
	formula = String(formula || '');
	const f = formula.trim();
	try {
		if (f.startsWith('!')) {
			const brand = BrandManager.currentBrand();
			const text = brand.item ? await brand.item.text(f.slice(1)) : null;
			return text ? evalFormula(text) : '';
		}
		if (/^https?:\/\//i.test(f)) {
			const r = await fetch(f);
			return r.ok ? evalFormula(await r.text()) : '';
		}
		if (f.startsWith('=')) {
			console.warn('board formula scripts (Tcl) are not supported:', f.slice(0, 60));
			return '';
		}
	} catch (e) {
		console.warn('board formula failed', e);
		return '';
	}
	return formula;
}

// ---------------------------------------------------------------- parametric (props driven) level

export class ParametricGameLevel extends GameLevel {
	constructor(props) {
		super();
		this.props = props || {};
		this.upl = new UserPrefsUPL();
		this.loadFromProps(this.props);
		if (this.upl.hasKey(this.ukey('lang_game')) || dictHas(this.props, 'lang_game'))
			this.loadDefaultLanguage = false;
	}

	loadFromProps(props) {
		this.uuid = props.uuid || '';
		this.title = props.name || '';
		this.shortDescription = props.description || '';
		this.helpSplashPanel = SplashPanel.fromProps(props['help-splash'], this);
	}

	ukey(key) {
		return `${this.uuid}/${key}`;
	}

	rebuildUPL() {
		let upl = new UserPrefsUPL();
		const layers = this.language && this.language.props ? this.language.props['game-props-layers'] : null;
		if (Array.isArray(layers))
			for (const layer of layers)
				for (const key of String(layer.key || '').split(','))
					if (key === '[All]' || key === this.uuid)
						upl = new UUIDPropsUPL(this.uuid, layer.props, upl);
		return upl;
	}

	// value of a level parameter, by precedence: language layers, user prefs, level prefs-data, level props
	param(key) {
		const ukey = this.ukey(key);
		if (this.upl.hasKey(ukey))
			return this.upl.getObject(ukey, undefined);
		const v = this.props[key];
		return v === undefined ? undefined : v;
	}
	has(key) {
		return this.param(key) !== undefined;
	}
	bool(key, def) {
		return toBool(this.param(key), def);
	}
	int(key, def) {
		return toInt(this.param(key), def);
	}
	float(key, def) {
		return toFloat(this.param(key), def);
	}
	str(key, def) {
		const v = this.param(key);
		return v === undefined || v === null ? def : String(v);
	}
	// apply a parameter if present
	apply(key, kind, fn) {
		const v = this.param(key);
		if (v === undefined || v === null)
			return;
		switch (kind) {
			case 'bool': fn(toBool(v)); break;
			case 'int': fn(toInt(v)); break;
			case 'float': fn(toFloat(v)); break;
			default: fn(String(v)); break;
		}
	}

	async loadGame() {
		if (this.state !== INIT)
			return;
		if (!this.loadDefaultLanguage)
			this.language = this.seq ? this.seq.language : null;
		await super.loadGame();
		await this.loadCode();
		this.state = LOADED;
	}

	async loadCode() {
		this.upl = this.rebuildUPL();
		let langChanged = false;
		if (this.has('lang_game')) {
			const langGame = this.str('lang_game', '');
			if (langGame === '[Game]')
				this.language = this.seq.language;
			else if (langGame === '[Global]')
				this.language = await LanguageManager.getNamedLanguage('');
			else if (langGame === '[List]') {
				this.language = LanguageManager.listFromString(this.str('lang_word_list', ''));
			} else
				this.language = await LanguageManager.getNamedLanguage(langGame);
			langChanged = true;
		}
		if (!this.language)
			this.language = this.seq ? this.seq.language : await LanguageManager.getNamedLanguage(null);
		if (this.bool('lang_tutorial', false)) {
			const page = this.int('lang_tutorial_page', 0);
			const pages = this.int('lang_tutorial_pages', 1);
			if (!page)
				this.language = LanguageManager.tutorialLanguageFor(this.language);
			else
				this.language = LanguageManager.tutorialPageLanguageFor(this.language, page, pages);
			langChanged = true;
		}
		if (langChanged)
			this.upl = this.rebuildUPL();

		this.apply('allow_play_pause', 'bool', v => this.allowPlayPause = v);
		this.apply('allow_show_hint', 'bool', v => this.allowShowHint = v);
		this.apply('allow_add_words', 'bool', v => this.allowAddWords = v);
		this.apply('allow_dup_words', 'bool', v => this.allowDupWords = v);
		this.apply('valid_min_word_size', 'int', v => this.minWordSize = v);
		this.apply('score_factor', 'float', v => this.scoreFactor = v);
		this.apply('game_over_grace', 'int', v => this.gameOverGrace = v);
		this.apply('game_won_grace', 'int', v => this.gameWonGrace = v);
		this.apply('show_summary_splash', 'bool', v => this.showSummarySplash = v);
		this.apply('auto_max_word_size_behavior', 'int', v => this.autoMaxWordSizeBehavior = v);
		this.apply('auto_valid_word_wipe', 'bool', v => this.autoValidWordWipe = v);
		this.apply('show_language_background', 'bool', v => this.showLanguageBackground = v);
		this.apply('board_full_warn_budget', 'int', v => this.boardFullWarnBudget = v);
		this.apply('board_full_warn_cost', 'int', v => this.boardFullWarnCost = v);
		this.apply('pause_on_word_count', 'int', v => this.pauseOnWordCount = v);
		this.apply('pause_on_word_count_increment', 'int', v => this.pauseOnWordCountIncrement = v);
		this.apply('replay_valid_word', 'bool', v => this.replayValidWord = v);
		this.apply('show_word_image_on_dispensed', 'bool', v => this.showWordImageOnDispensed = v);
		this.apply('speak_word_on_dispensed', 'bool', v => this.speakWordOnDispensed = v);

		if (this.bool('board_override', false)) {
			const rows = this.int('board_rows', 6);
			const columns = this.int('board_columns', 6);
			const formula = await evalFormula(this.str('board_formula', ''));
			const board = (formula.trim().length && boardByFormula(formula)) || new GridBoard(formula.trim().length ? 6 : columns, formula.trim().length ? 6 : rows);
			this.board = board;
			board.level = this;
			const hintFormula = await evalFormula(this.str('hint_board_formula', ''));
			if (hintFormula.trim().length && boardByFormula(hintFormula)) {
				this.hintBoard = boardByFormula(hintFormula);
				this.hintBoard.level = this;
			}
		}

		if (this.bool('dispenser_word_by_word', false)) {
			const pd = new GridBoardPieceDispenserWords(new WordListWordDispenser(this.language.getAllWords(), this.bool('dispenser_reorder', false)));
			pd.dispensingTickPeriod = 0.5;
			pd.interWordTickPeriod = 0.5;
			pd.scrambleWordSymbols = this.bool('dispenser_scramble', false);
			this.dispenser = pd;
		}
		const sdInit = () => {
			const sd = new AuctionSymbolDispenser(this.board);
			sd.setAlphabet(this.language.alphabet);
			sd.setSymbolCount(100);
			return sd;
		};
		// the default dispenser was built against the default board/language: rebuild it for this level's
		if (this.dispenser instanceof GridBoardPieceDispenserSymbols) {
			const old = this.dispenser.symbolDispenser;
			const sd = sdInit();
			sd.setSymbolCount(old ? old.symbolCount : 100);
			this.dispenser.setSymbolDispenser(sd);
		}
		const d = this.dispenser;
		this.apply('dispenser_tick_period', 'float', v => d.setDispensingTickPeriod(v));
		this.apply('dispenser_fullness_factor', 'float', v => d.setBoardFullnessTickPeriodFactor(v));
		this.apply('dispenser_fullness_curve', 'float', v => d.setBoardFullnessTickPeriodCurve(v));
		this.apply('dispenser_progress_factor', 'float', v => d.setBoardProgressTickPeriodFactor(v));
		this.apply('dispenser_self_progress_factor', 'float', v => d.setDispenserProgressTickPeriodFactor(v));
		if (d.symbolDispenser) {
			this.apply('dispenser_symbol_count', 'int', v => d.symbolDispenser.setSymbolCount(v));
			d.symbolDispenser.setAlphabet(this.language.alphabet);
		}
		if (d.setJokerProb)
			this.apply('dispenser_joker_prob', 'float', v => d.setJokerProb(v));

		const logics = new CompoundGameBoardLogic(this.board);
		logics.add(new RandomPlacementGBL(this.board));
		if (this.bool('logic_random', false)) {
			const l = new RandomPlacementGBL(this.board);
			l.pauseAtWordEnd = this.bool('logic_word_end_pause', false);
			l.alwaysRandomPlacement = true;
			logics.add(l);
		}
		if (this.bool('logic_line', false)) {
			const l = new RandomPlacementGBL(this.board);
			l.alwaysRandomPlacement = false;
			l.pauseAtWordEnd = true;
			logics.add(l);
		}
		if (this.bool('logic_nudge', false) && this.board instanceof GridBoard) {
			const orderName = this.str('logic_board_order', '');
			let order;
			if (orderName === 'Spiral')
				order = new SpiralBoardOrder(this.board);
			else if (orderName === 'Chaos')
				order = new RandomBoardOrder(this.board);
			else if (orderName === '[List]')
				order = new ListBoardOrder(this.board, this.str('logic_order_list', null));
			else
				order = new SnakeBoardOrder(this.board);
			logics.add(new OrderNudgeGBL(this.board, order));
		}
		if (this.bool('logic_fader', false)) {
			const l = new PieceFaderGBL(this.board);
			l.fadePace = this.float('logic_fader_pace', 8.0);
			l.resetFadeOnValidWord = this.bool('logic_fader_valid_resets', true);
			logics.add(l);
		}
		if (this.bool('logic_disabler', false)) {
			const l = new CrossPieceDisabler(this.board);
			l.progressive = this.bool('logic_disabler_progressive', false);
			l.highlight = this.bool('logic_disabler_highlight', false);
			l.type = this.int('logic_disabler_pattern', 0);
			logics.add(l);
		}
		if (this.bool('logic_decorator', false)) {
			const l = new PieceDecoratorGBL(this.board);
			if (l.decorations) {
				if (this.has('logic_decorator_apple_prob'))
					l.setDecoration(DECORATOR_APPLE, this.float('logic_decorator_apple_prob', 0.1));
				if (this.has('logic_decorator_coin_prob'))
					l.setDecoration(DECORATOR_COIN, this.float('logic_decorator_coin_prob', 0.05));
				if (this.has('logic_decorator_bomb_prob'))
					l.setDecoration(DECORATOR_BOMB, this.float('logic_decorator_bomb_prob', 0.05));
			}
			logics.add(l);
		}
		if (this.bool('logic_viewtrans', false)) {
			const l = new ViewTransformerGBL(this.board);
			this.apply('logic_viewtrans_slices', 'int', v => l.rotationSlices = v);
			this.apply('logic_viewtrans_event', 'str', v => l.rotationEvent = v);
			this.apply('logic_viewtrans_reset_at_end', 'bool', v => l.resetAtEnd = v);
			logics.add(l);
		}
		if (logics.count())
			this.logic = logics;

		this.apply('show_hint_delay', 'int', v => this.showHintDelay = v);
		this.apply('between_hint_delay', 'int', v => this.betweenHintDelay = v);
		this.apply('speak_hint_word', 'bool', v => this.speakHintWord = v);
		this.apply('show_hint_word', 'bool', v => this.showHintWord = v);
		this.apply('show_hint_image', 'bool', v => this.showHintImage = v);
		this.apply('show_hint_text', 'bool', v => this.showHintText = v);
		this.apply('show_hint_pieces', 'bool', v => this.showHintPieces = v);
		this.apply('hint_max_word_size', 'int', v => this.hintMaxWordSize = v);
		this.apply('joker_image_hints', 'bool', v => this.jokerImageHints = v);
		this.apply('joker_image_rewards', 'bool', v => this.jokerImageRewards = v);
		this.apply('level_end_menu', 'bool', v => this.levelEndMenu = v);
		this.apply('lem_continue_threshold', 'int', v => this.levelEndContinueRemainingWordCountThreshold = v);
		this.apply('show_reward_image', 'bool', v => this.showRewardImage = v);
		this.apply('show_reward_text', 'bool', v => this.showRewardText = v);
		this.apply('speak_reward_word', 'bool', v => this.speakRewardWord = v);
		this.apply('flash_attack_duration', 'float', v => this.flashAttackDuration = v);
		this.apply('flash_attack_alpha', 'float', v => this.flashAttackAlpha = v);
		this.apply('flash_sustain_duration', 'float', v => this.flashSustainDuration = v);
		this.apply('flash_sustain_alpha', 'float', v => this.flashSustainAlpha = v);
		this.apply('flash_decay_duration', 'float', v => this.flashDecayDuration = v);
		this.apply('flash_decay_alpha', 'float', v => this.flashDecayAlpha = v);
		this.apply('rush_symbols', 'str', v => this.rushSymbols = v);
		this.apply('rush_words', 'int', v => this.rushWords = v);
		this.apply('rush_min_word_size', 'int', v => this.rushMinWordSize = v);
		this.apply('rush_max_word_size', 'int', v => this.rushMaxWordSize = v);
		this.apply('rush_dispensing_factor', 'float', v => this.rushDispensingFactor = v);
	}
}
