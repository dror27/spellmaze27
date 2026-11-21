// SpellMaze - level selector (port of LevelSelectorViewController / ItemSelectorWidget)

import { el, setFrame, TimerGroup } from '../util.js';
import { Stage, Screen, STAGE_W, CONTENT_H } from './stage.js';
import { GridBoard, boardByFormula } from '../board.js';
import { SymbolPiece, SYMBOL_PIECE_POS_COLOR_HINT } from '../piece.js';
import { SoundTheme, TextSpeaker } from '../sound.js';
import { UserPrefs } from '../prefs.js';
import { ScoresDatabase } from '../scores.js';
import { ScoreWidget } from './scorewidget.js';
import { DECORATOR_CHECKED, DECORATOR_CHECKED2 } from '../wallet.js';
import { toBool } from '../util.js';

const PIECE_ENTRY_KEY = 'ItemSelectorWidget_EntryKey';

class ItemSelectorWidget {
	constructor() {
		this.items = [];
		this.boardFormula = null;
		this.speakSelection = false;
		this.hideDisabledItems = false;
		this.painted = false;
		this.timers = new TimerGroup();
		this.tickTimer = null;
		this.tickCounter = 0;
	}

	addItem(title, shortDescription) {
		this.items.push({ title, shortDescription, index: this.items.length, enabled: false, checked: false, checked2: false, props: {}, label: null, action: null });
		return this.items.length - 1;
	}

	viewWithFrame(frame) {
		this.board = this.boardFormula ? boardByFormula(this.boardFormula) : new GridBoard(6, 6);
		if (!this.board)
			this.board = new GridBoard(6, 6);
		this.panel = new ScoreWidget();
		this.root = el('div', 'itemselector');
		setFrame(this.root, frame.x, frame.y, frame.w, frame.h);
		this.root.appendChild(this.board.viewWithFrame({ x: 16, y: 56, w: 289, h: 289 }));
		this.root.appendChild(this.panel.viewWithFrame({ x: 16, y: 360, w: 289, h: 48 }));
		return this.root;
	}

	pieceAt(index) {
		return this.board.pieceAt(index);
	}

	setItemEnabled(enabled, index) {
		const e = this.items[index];
		e.enabled = enabled;
		if (this.painted) {
			const p = this.pieceAt(index);
			if (!p)
				return;
			p.setDisabled(!enabled);
			if (this.hideDisabledItems)
				p.setHidden(!enabled);
		}
	}

	setItemChecked(checked, index) {
		const e = this.items[index];
		e.checked = checked;
		if (this.painted) {
			const p = this.pieceAt(index);
			if (!p)
				return;
			if (checked && !e.checked2)
				p.addDecorator(DECORATOR_CHECKED);
			else
				p.removeDecorator(DECORATOR_CHECKED);
		}
	}

	setItemChecked2(checked, index) {
		const e = this.items[index];
		e.checked2 = checked;
		if (this.painted) {
			const p = this.pieceAt(index);
			if (!p)
				return;
			if (checked)
				p.addDecorator(DECORATOR_CHECKED2);
			else
				p.removeDecorator(DECORATOR_CHECKED2);
		}
	}

	paintItems() {
		let index = 0;
		for (const entry of this.items) {
			if (index >= this.board.cellCount())
				break;
			const piece = new SymbolPiece(entry.label || String(entry.index + 1));
			piece.eventsTarget = this;
			piece.props[PIECE_ENTRY_KEY] = entry;
			piece.props[SYMBOL_PIECE_POS_COLOR_HINT] = Math.floor(index / 6) * 100 + index % 6;
			this.board.placePiece(piece, index++);
			if (!entry.enabled) {
				piece.setDisabled(true);
				if (this.hideDisabledItems)
					piece.setHidden(true);
			}
			if (entry.checked && !entry.checked2)
				piece.addDecorator(DECORATOR_CHECKED);
			if (entry.checked2)
				piece.addDecorator(DECORATOR_CHECKED2);
		}
		this.reset();
		this.painted = true;
		this.startTickTimer(50);
	}

	reset() {
		for (const p of this.board.allPieces())
			p.deselect();
		this.panel.setMessage('');
	}

	appeared() {
		this.startTickTimer(50);
		this.panel.updateWallet();
	}

	disappeared() {
		this.stopTickTimer();
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

	onTickTimer() {
		this.tickCounter--;
		if (this.tickCounter === 0)
			SoundTheme.pieceHinted();
		if (this.tickCounter < 0) {
			const index = -this.tickCounter - 1;
			for (const p of this.board.allPieces())
				p.deselect();
			if (index < this.board.cellCount()) {
				const p = this.board.pieceAt(index);
				if (p)
					p.select();
			} else
				this.tickCounter = 100;
		}
	}

	pieceSelected(piece) {
		this.stopTickTimer();
		SoundTheme.pieceSelected();
		const entry = piece.props[PIECE_ENTRY_KEY];
		if (!entry)
			return;
		for (const other of this.board.allPieces())
			if (other !== piece)
				other.deselect();
		this.panel.setMessage1(entry.title);
		this.panel.setMessage2(entry.shortDescription);
		if (entry.props.ScoreDisplayOffset !== undefined)
			this.panel.setScoreDisplayOffset(entry.props.ScoreDisplayOffset);
		if (this.speakSelection)
			TextSpeaker.speak(`${entry.title} - ${entry.shortDescription}`, 'en');
	}

	pieceReselected(piece) {
		const entry = piece.props[PIECE_ENTRY_KEY];
		if (entry && entry.action)
			entry.action(entry.index);
	}

	disabledPieceClicked(piece) {
		if (!this.hideDisabledItems)
			this.pieceSelected(piece);
	}

	pieceClicked(piece) { }

	setMessage(message, sub) {
		this.panel.setMessage1(message);
		this.panel.setMessage2(sub);
	}

	dispose() {
		this.timers.kill();
	}
}

export class LevelSelectorScreen extends Screen {
	constructor(seq) {
		super('Select Level');
		this.seq = seq;
		const w = this.widget = new ItemSelectorWidget();
		w.boardFormula = seq.upl.getString('board-formula', null);
		const cellLabels = seq.upl.getObject('cell-labels', null);
		seq.levels.forEach((factory, levelIndex) => {
			const index = w.addItem(factory.title, factory.shortDescription);
			if (Array.isArray(cellLabels) && levelIndex < cellLabels.length)
				w.items[index].label = String(cellLabels[levelIndex]);
			w.items[index].action = (i) => this.doLevelSelected(i);
		});
		w.speakSelection = true;
		for (const dict of seq.upl.getObject('cell-headings', null) || []) {
			const hi = parseInt(dict.index, 10);
			if (isNaN(hi) || hi < 0)
				continue;
			const index = w.addItem(dict.name || '', dict.description || '');
			w.items[index].label = dict.label || '';
			w.items[index].action = () => { };
			w.items[index].enabled = true;
		}
		if (seq.helpSplashPanel)
			this.rightButton = { label: 'Help', action: () => seq.helpSplashPanel.toggle() };
	}

	build() {
		Stage.applyBrandBackground(this.el, ['background-levels', 'background']);
		this.el.appendChild(this.widget.viewWithFrame({ x: 0, y: 0, w: STAGE_W, h: CONTENT_H }));
		this.widget.paintItems();
	}

	willAppear() {
		const seq = this.seq;
		const w = this.widget;
		w.hideDisabledItems = toBool(seq.props['hide-disabled-levels'], false);
		const globalScore = ScoresDatabase.globalScore();
		const langUUID = seq.language.uuid;
		seq.levels.forEach((factory, i) => {
			w.setItemEnabled(UserPrefs.levelEnabled(factory.uuid), i);
			w.setItemChecked(seq.levelPassed(i), i);
			w.setItemChecked2(seq.levelExhausted(i), i);
			w.items[i].props.ScoreDisplayOffset = -globalScore + ScoresDatabase.maxScoreForLevel(factory.uuid, langUUID);
		});
		w.appeared();
		w.setMessage(seq.title, seq.shortDescription);
		w.panel.setScoreDisplayOffset(-globalScore + ScoresDatabase.bestScoreForGame(seq.uuid, langUUID));
	}

	willDisappear() {
		if (this.seq.helpSplashPanel)
			this.seq.helpSplashPanel.abort();
	}

	didDisappear() {
		this.widget.disappeared();
	}

	async doLevelSelected(levelIndex) {
		this.widget.reset();
		const { PlayScreen } = await import('./play.js');
		Stage.push(new PlayScreen(this.seq, levelIndex));
	}

	dispose() {
		this.widget.dispose();
	}
}
