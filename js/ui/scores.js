// SpellMaze - the shared score board screen (port of ScoresViewController / ScoreTableWidget)

import { el, setFrame, TimerGroup, formatNumber } from '../util.js';
import { Stage, Screen, STAGE_W, CONTENT_H } from './stage.js';
import { GridBoard } from '../board.js';
import { SymbolPiece, SYMBOL_PIECE_POS_COLOR_HINT } from '../piece.js';
import { SoundTheme } from '../sound.js';
import { UserPrefs } from '../prefs.js';
import { ScoreWidget } from './scorewidget.js';
import { ScoresComm, PK_NSEP_RESPONSE, NSEP_VERSION } from '../scorescomm.js';

const SCORE_SIZE = 6;

class ScoreTableWidget {
	constructor() {
		this.timers = new TimerGroup();
		this.tickTimer = null;
		this.tickCounter = 0;
	}

	viewWithFrame(frame) {
		this.root = el('div', 'scoretable');
		setFrame(this.root, frame.x, frame.y, frame.w, frame.h);
		const size = SCORE_SIZE;
		this.boardA = new GridBoard(1, size);
		this.boardB = new GridBoard(1, size);
		this.panel = new ScoreWidget();
		this.root.appendChild(this.boardA.viewWithFrame({ x: 16, y: 56 + (6 - size) * 48, w: 49, h: size * 48 + 1 }));
		this.root.appendChild(this.boardB.viewWithFrame({ x: 64, y: 56 + (6 - size) * 48, w: 241, h: size * 48 + 1 }));
		this.root.appendChild(this.panel.viewWithFrame({ x: 16, y: 360, w: 289, h: 48 }));
		return this.root;
	}

	allPieces() {
		return [...this.boardA.allPieces(), ...this.boardB.allPieces()];
	}

	reset() {
		for (const p of this.allPieces())
			p.deselect();
	}

	resetSelections(except) {
		for (const p of this.allPieces())
			if (p !== except)
				p.deselect();
	}

	paintScores(scores) {
		for (const p of this.allPieces())
			p.eliminate();
		if (!scores || scores.version !== NSEP_VERSION || !scores['score-table'])
			return;
		this.panel.setMessage1(scores.title || '');
		this.panel.setMessage2(scores['sub-title'] || '');
		const entries = scores['score-table'].entries || [];
		entries.slice(0, this.boardA.cellCount()).forEach((entry, row) => {
			const attrs = Object.assign({}, entry, { scoreText: formatNumber(entry.score || 0) });
			const icon = entry.icon && String(entry.icon).length ? String(entry.icon) : String(entry.position);
			const p1 = new SymbolPiece(icon);
			p1.eventsTarget = this;
			p1.props.attrs = attrs;
			p1.props[SYMBOL_PIECE_POS_COLOR_HINT] = row + 1;
			this.boardA.placePiece(p1, row);
			const p2 = new SymbolPiece((entry.me ? '★ ' : '') + (entry.nick || '?'));
			p2.eventsTarget = this;
			p2.props.attrs = attrs;
			p2.props[SYMBOL_PIECE_POS_COLOR_HINT] = row + 1;
			this.boardB.placePiece(p2, row);
		});
		if (!entries.length) {
			this.panel.setMessage2(`${scores['sub-title'] || ''} - no scores yet`);
		}
		this.startTickTimer(50);
	}

	pieceSelected(piece) {
		this.stopTickTimer();
		SoundTheme.pieceSelected();
		this.resetSelections(piece);
		const attrs = piece.props.attrs || {};
		this.panel.setMessage1(attrs.scoreText || '');
		this.panel.setMessage2(`Position ${attrs.position}`);
	}

	pieceReselected(piece) {
		this.startTickTimer(100);
		SoundTheme.pieceSelected();
		this.resetSelections(null);
	}

	pieceClicked() { }

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
			let index = -this.tickCounter - 1;
			const board = !(index % 2) ? this.boardA : this.boardB;
			index = Math.floor(index / 2);
			this.reset();
			if (index < this.boardA.cellCount() && this.boardA.pieceAt(index))
				board.pieceAt(index).select();
			else
				this.tickCounter = 100;
		}
	}

	dispose() {
		this.timers.kill();
	}
}

export class ScoresScreen extends Screen {
	constructor(seq) {
		super('Scores');
		this.seq = seq;
		this.comm = new ScoresComm();
		this.widget = new ScoreTableWidget();
		this.fetchToken = 0;
	}

	build() {
		Stage.applyBrandBackground(this.el, ['background-scores', 'background']);
		this.el.appendChild(this.widget.viewWithFrame({ x: 0, y: 0, w: STAGE_W, h: CONTENT_H }));
		this.widget.panel.eventsTarget = this;
		const saved = UserPrefs.getObject(PK_NSEP_RESPONSE, null);
		if (saved)
			this.widget.paintScores(saved);
		this.fetchScores();
	}

	async fetchScores() {
		const token = ++this.fetchToken;
		const panel = this.widget.panel;
		panel.setMessage1('Loading ...');
		panel.setMessage2('');
		try {
			const scores = await this.comm.fetchScoreResponse(this.seq);
			if (token !== this.fetchToken)
				return;
			if (this.comm.isOnFirstType())
				UserPrefs.setObject(PK_NSEP_RESPONSE, scores);
			this.widget.paintScores(scores);
		} catch (e) {
			if (token !== this.fetchToken)
				return;
			console.warn('scores fetch failed', e);
			const saved = this.comm.isOnFirstType() ? UserPrefs.getObject(PK_NSEP_RESPONSE, null) : null;
			if (saved)
				this.widget.paintScores(saved);
			panel.setMessage1('Score Board Unavailable');
			panel.setMessage2(navigator.onLine === false ? 'you are offline' : 'please try again later');
		}
	}

	// tapping the panel moves to the next score table
	onScoreWidgetTouched(tapCount) {
		if (tapCount === 1) {
			SoundTheme.pieceSelected();
			this.comm.advanceTypeToNext();
			this.fetchScores();
		}
	}

	get soundTheme() {
		return SoundTheme;
	}

	didAppear() {
		this.widget.startTickTimer(50);
	}

	didDisappear() {
		this.widget.stopTickTimer();
		this.fetchToken++;
	}

	dispose() {
		this.widget.dispose();
	}
}
