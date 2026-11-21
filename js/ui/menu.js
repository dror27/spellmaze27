// SpellMaze - main menu (port of MainMenuViewController / MainMenuWidget)

import { el, setFrame, TimerGroup } from '../util.js';
import { Stage, Screen, STAGE_W, CONTENT_H } from './stage.js';
import { GridBoard, CompoundBoard, boardByFormula } from '../board.js';
import { SymbolPiece, SYMBOL_PIECE_POS_COLOR_HINT, ASSETS } from '../piece.js';
import { BrandManager } from '../brand.js';
import { SoundTheme, TextSpeaker } from '../sound.js';
import { UserPrefs, PK_LANG_DEFAULT, PK_LANG_DEFAULT_PREV } from '../prefs.js';
import { Folders, DF_LANGUAGES } from '../folders.js';
import { GameManager } from '../sequence.js';
import { LanguageManager } from '../language.js';
import { withLoading } from './loading.js';

const PIECE_ENTRY_KEY = 'MainMenuWidget_EntryKey';
const PIECE_GAME_UUID = 'MainMenuWidget_GameUUID';
const PIECE_GAME_SELECTION = 'MainMenuWidget_GameSelection';

export function languageIcon(uuid) {
	if (uuid) {
		const item = Folders.find(DF_LANGUAGES, uuid);
		if (item && item.props['item-icon']) {
			const url = item.url(item.props['item-icon']);
			if (url)
				return url;
		}
	}
	return ASSETS + 'ProgramIcon1.png';
}

class MainMenuWidget {
	constructor(controller) {
		this.controller = controller;
		this.entries = [];
		this.cellSize = 48;
		this.timers = new TimerGroup();
		this.tickCounter = 0;
		this.tickTimer = null;
		this.disabled = false;
	}

	addEntry(text, action) {
		this.entries.push({ text, action, index: this.entries.length });
	}

	viewWithFrame(frame) {
		this.root = el('div', 'mainmenu');
		setFrame(this.root, frame.x, frame.y, frame.w, frame.h);
		this.mainBoard = new CompoundBoard();
		for (const entry of this.entries) {
			const width = entry.text.length;
			entry.board = new GridBoard(width, 1);
			let cellWidth = this.cellSize;
			if (width > 6)
				cellWidth = Math.floor(cellWidth * 6 / width);
			const h = this.cellSize + 1, w = width * cellWidth + 1;
			entry.frame = { x: Math.round((frame.w - w) / 2), y: Math.round((entry.index + 0.5) * (this.cellSize * 1.8)), w, h };
			this.mainBoard.addBoard(entry.board, entry.frame);
		}
		this.root.appendChild(this.mainBoard.viewWithFrame({ x: 0, y: 0, w: frame.w, h: frame.h }));
		this.placeGameSelection();
		this.placePrefButton();
		return this.root;
	}

	paintEntries() {
		let row = 0;
		for (const entry of this.entries) {
			for (let index = 0; index < entry.text.length; index++) {
				const piece = new SymbolPiece(entry.text.charAt(index));
				piece.eventsTarget = this;
				piece.props[PIECE_ENTRY_KEY] = entry;
				piece.props[SYMBOL_PIECE_POS_COLOR_HINT] = row * 100 + index;
				entry.board.placePiece(piece, index);
			}
			row++;
		}
	}

	placeGameSelection() {
		const seq = GameManager.cachedSequence();
		const current = seq ? seq.language.uuid : LanguageManager.defaultLanguageUUID();
		const uuids = [current];
		const prev = UserPrefs.getString(PK_LANG_DEFAULT_PREV, null);
		if (prev && prev !== current && Folders.find(DF_LANGUAGES, prev))
			uuids.push(prev);
		else {
			const other = Folders.list(DF_LANGUAGES).find(i => i.uuid !== current);
			if (other)
				uuids.push(other.uuid);
		}
		const key = uuids.join(',');
		if (this.gameSelectionBoard && key === this.gameSelectionUUIDs)
			return;
		if (this.gameSelectionBoard)
			this.gameSelectionBoard.view.root.remove();
		this.gameSelectionUUIDs = key;
		const board = boardByFormula('0 0 90 90 3 1');
		this.gameSelectionBoard = board;
		const f = board.suggestedFrame;
		const frame = { x: Math.round((STAGE_W - f.w) / 2), y: 300, w: f.w, h: f.h };
		this.root.appendChild(board.viewWithFrame(frame));
		uuids.forEach((uuid, i) => {
			const piece = new SymbolPiece('');
			piece.image = languageIcon(uuid);
			piece.eventsTarget = this;
			piece.props[PIECE_GAME_UUID] = uuid;
			board.placePiece(piece, i);
		});
		const piece = new SymbolPiece('');
		piece.image = ASSETS + 'ProgramIcon1.png';
		piece.eventsTarget = this;
		piece.props[PIECE_GAME_SELECTION] = true;
		board.placePiece(piece, 2);
	}

	placePrefButton() {
		const b = el('div', 'info-button', this.root);
		setFrame(b, STAGE_W - 20 - 25, 390 - 25, 25, 25);
		b.textContent = 'i';
		b.title = 'Preferences';
		b.addEventListener('click', () => this.doPref());
	}

	doPref() {
		if (this.disabled)
			return;
		SoundTheme.pieceSelected();
		this.disabled = true;
		this.controller.flipAction();
	}

	reset() {
		for (const p of this.mainBoard.allPieces())
			p.deselect();
		if (this.gameSelectionBoard)
			for (const p of this.gameSelectionBoard.allPieces())
				p.deselect();
	}

	willAppear() {
		this.placeGameSelection();
	}

	appeared() {
		this.disabled = false;
		const seq = GameManager.cachedSequence();
		this.tickWaveImage = languageIcon(seq ? seq.language.uuid : LanguageManager.defaultLanguageUUID());
		this.startTickTimer(50);
	}

	disappeared() {
		this.disabled = true;
		this.stopTickTimer();
		this.clearWave();
	}

	startTickTimer(counter) {
		this.stopTickTimer();
		this.tickCounter = counter;
		this.tickTimer = this.timers.every(0.1, () => this.onTickTimer());
	}

	stopTickTimer() {
		if (this.tickTimer !== null)
			this.timers.cancel(this.tickTimer);
		this.tickTimer = null;
	}

	clearWave() {
		for (const p of this.mainBoard.allPieces()) {
			p.deselect();
			if (p.image)
				p.setImage(null);
		}
	}

	onTickTimer() {
		this.tickCounter--;
		if (this.tickCounter === 0)
			SoundTheme.pieceHinted();
		if (this.tickCounter < 0) {
			const index = -this.tickCounter - 1;
			this.clearWave();
			if (index < this.mainBoard.cellCount()) {
				const p = this.mainBoard.pieceAt(index);
				if (p) {
					p.setImage(this.tickWaveImage);
					p.select();
				}
			} else
				this.tickCounter = 100;
		}
	}

	pieceSelected(piece) {
		if (this.disabled) {
			piece.deselect();
			return;
		}
		this.stopTickTimer();
		this.clearWave();
		if (piece.props[PIECE_GAME_SELECTION]) {
			this.timers.after(0.5, () => this.doPref());
			return;
		}
		let entry;
		if (piece.props[PIECE_GAME_UUID]) {
			UserPrefs.setString(PK_LANG_DEFAULT, piece.props[PIECE_GAME_UUID]);
			entry = this.entries[0];
		} else
			entry = piece.props[PIECE_ENTRY_KEY];
		SoundTheme.pieceSelected();
		for (const p of this.mainBoard.allPieces()) {
			if (p.cell && p.cell.board === entry.board)
				p.select();
			else
				p.deselect();
		}
		this.disabled = true;
		TextSpeaker.speak(entry.text, 'en');
		this.timers.after(0.5, () => entry.action());
	}

	pieceReselected(piece) { }
	pieceClicked(piece) { }
}

export class MainMenuScreen extends Screen {
	constructor() {
		super('SpellMaze');
		this.backTitle = 'SpellMaze';
		this.widget = new MainMenuWidget(this);
		this.widget.addEntry('PLAY', () => this.doPlay());
		this.widget.addEntry('LEVEL', () => this.doLevel());
		this.widget.addEntry('CONF', () => this.flipAction());
	}

	build() {
		Stage.applyBrandBackground(this.el, ['background-menu', 'background']);
		this.el.appendChild(this.widget.viewWithFrame({ x: 0, y: 0, w: STAGE_W, h: CONTENT_H }));
		this.widget.paintEntries();
		const label = el('div', 'copyright', this.widget.root);
		setFrame(label, 35, 390, STAGE_W - 70, 25);
		label.textContent = 'Copyright © 2020 Dror Kessler';
		label.style.color = BrandManager.currentBrand().globalTextColor();
		label.getBoundingClientRect();
		label.style.transition = 'opacity 2s';
		label.style.opacity = '1';
		this.copyright = label;
		BrandManager.addDelegate(() => this.brandDidChange());
	}

	brandDidChange() {
		Stage.applyBrandBackground(this.el, ['background-menu', 'background']);
		if (this.copyright)
			this.copyright.style.color = BrandManager.currentBrand().globalTextColor();
		// rebuild the menu pieces with the new skin
		const old = this.widget;
		old.disappeared();
		const w = new MainMenuWidget(this);
		for (const e of old.entries)
			w.addEntry(e.text, e.action);
		this.widget = w;
		old.root.replaceWith(w.viewWithFrame({ x: 0, y: 0, w: STAGE_W, h: CONTENT_H }));
		w.paintEntries();
		if (this.copyright)
			w.root.appendChild(this.copyright);
		w.disabled = true;
	}

	async refreshTitle() {
		try {
			const seq = await GameManager.currentGameLevelSequence();
			const t = seq.title || '';
			Stage.setTitle(this, t.length ? (t.length <= 17 ? `SpellMaze - ${t}` : t) : 'SpellMaze');
			this.widget.tickWaveImage = languageIcon(seq.language.uuid);
			this.widget.placeGameSelection();
		} catch (e) {
			console.error(e);
			Stage.setTitle(this, 'SpellMaze');
		}
	}

	willAppear() {
		this.widget.willAppear();
	}

	didAppear() {
		this.widget.reset();
		this.widget.appeared();
		this.refreshTitle();
	}

	willDisappear() {
		this.title = 'SpellMaze';
	}

	didDisappear() {
		this.widget.disappeared();
	}

	async doPlay() {
		this.widget.reset();
		const seq = await withLoading(() => GameManager.currentGameLevelSequence());
		if (!seq)
			return this.reenable();
		if (!GameManager.gameReady(seq, { splashDidFinish: () => this.reenable() }))
			return;
		if (toBoolProp(seq.props['show-levels-onces-on-play']) &&
			!UserPrefs.getBoolean(UserPrefs.keyForUuid('levels-menu-entered', seq.uuid), false))
			return this.doLevel();
		const { PlayScreen } = await import('./play.js');
		Stage.push(new PlayScreen(seq, -1));
	}

	async doLevel() {
		this.widget.reset();
		const seq = await withLoading(() => GameManager.currentGameLevelSequence());
		if (!seq)
			return this.reenable();
		if (!GameManager.gameReady(seq, { splashDidFinish: () => this.reenable() }))
			return;
		UserPrefs.setBoolean(UserPrefs.keyForUuid('levels-menu-entered', seq.uuid), true);
		const { LevelSelectorScreen } = await import('./levels.js');
		Stage.push(new LevelSelectorScreen(seq));
	}

	reenable() {
		this.widget.reset();
		this.widget.disabled = false;
		this.widget.startTickTimer(50);
	}

	async flipAction() {
		this.widget.reset();
		const { PrefsScreen } = await import('./prefs.js');
		const prefs = new PrefsScreen(() => Stage.unflip());
		Stage.flip(prefs);
	}
}

function toBoolProp(v) {
	return v === true || v === 1 || v === 'true' || v === 'YES';
}
