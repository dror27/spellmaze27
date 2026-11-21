// SpellMaze - the play screen (port of GameLevelSequenceViewController)

import { el } from '../util.js';
import { Stage, Screen, STAGE_W, CONTENT_H } from './stage.js';
import { SUSPENDED, INIT, LOADED, START_SPLASH, STOPPED } from '../gamelevel.js';

export class PlayScreen extends Screen {
	constructor(seq, levelIndex) {
		super('Play!');
		this.seq = seq;
		this.levelIndex = levelIndex;
		this.level = null;
		this.onVisibility = () => this.visibilityChanged();
		this.onKey = ev => this.keyDown(ev);
	}

	build() {
		Stage.applyBrandBackground(this.el, ['background-game', 'background']);
		this.container = el('div', 'play-container', this.el);
		this.seq.view = this.container;
		this.seq.levelFrame = { x: 0, y: 0, w: STAGE_W, h: CONTENT_H };
		this.seq.eventsTarget = this;
	}

	didAppear() {
		if (this.started)
			return;
		this.started = true;
		document.addEventListener('visibilitychange', this.onVisibility);
		document.addEventListener('keydown', this.onKey);
		if (this.levelIndex >= 0)
			this.seq.startLevel(this.levelIndex);
		else
			this.seq.start();
	}

	willDisappear() {
		document.removeEventListener('visibilitychange', this.onVisibility);
		document.removeEventListener('keydown', this.onKey);
		clearTimeout(this.titleTimer);
		this.seq.stop();
		if (this.seq.eventsTarget === this)
			this.seq.eventsTarget = null;
		this.level = null;
	}

	levelStarted(seq, level) {
		Stage.setTitle(this, seq.title);
		clearTimeout(this.titleTimer);
		this.titleTimer = setTimeout(() => Stage.setTitle(this, level.title), 4000);
		this.level = level;
		if (level.helpSplashPanel)
			Stage.setRightButton(this, { label: 'Help', action: () => this.helpAction() });
		else
			Stage.setRightButton(this, null);
	}

	helpAction() {
		const level = this.level;
		if (!level || !level.helpSplashPanel)
			return;
		if (level.state === INIT || level.state === LOADED || level.state === STOPPED)
			return;
		if (!level.helpSplashPanel.shown)
			level.showHelpSplash();
		else
			level.helpSplashPanel.hide();
	}

	sequenceFinished() {
		if (Stage.topScreen() === this)
			Stage.pop();
	}

	// keyboard play (a web addition): letters select pieces, Enter ends the word, Backspace removes
	// the last letter, Escape resets the word, Space asks for a hint, P pauses/resumes
	keyDown(ev) {
		const level = this.seq.level;
		if (!level || !level.board || Stage.topScreen() !== this)
			return;
		if (document.querySelector('.overlay-layer .splash, .overlay-layer .sheet')) {
			if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Escape') {
				const dim = document.querySelector('.overlay-layer .splash-dim');
				if (dim) {
					dim.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
					ev.preventDefault();
				}
			}
			return;
		}
		if (ev.ctrlKey || ev.metaKey || ev.altKey)
			return;
		const sel = level.currentWordPieces || [];
		if (ev.key === 'Enter') {
			if (sel.length)
				sel[sel.length - 1].view.click();
		} else if (ev.key === 'Backspace') {
			level.removeLastPiece();
		} else if (ev.key === 'Escape')
			level.onScoreWidgetTouched(1);
		else if (ev.key === ' ') {
			if (level.allowShowHint || level.scoreWidget.hintBtn.style.opacity === '1')
				level.scoreWidget.pressGameAction();
		} else if (ev.key === 'p' || ev.key === 'P') {
			if (level.scoreWidget.playBtn.style.opacity === '1') {
				level.scoreWidget.pressPlayAction();
				ev.preventDefault();
				return;
			}
		} else if (ev.key.length === 1) {
			const ch = ev.key.toLocaleUpperCase();
			const candidates = level.board.allPieces().filter(p => !p.isSelected && !p.disabled && !p.hidden && p.view &&
				(p.text === ch || p.text === ev.key || (ev.key === '?' && p.text === '?')));
			if (!candidates.length)
				return;
			// prefer pieces next to the previous one (helps adjacency levels), then a real letter over a joker
			const last = sel[sel.length - 1];
			const dist = p => (last && last.cell && p.cell) ? Math.max(Math.abs(p.cell.x - last.cell.x), Math.abs(p.cell.y - last.cell.y)) : 0;
			candidates.sort((a, b) => dist(a) - dist(b));
			candidates[0].view.click();
		} else
			return;
		ev.preventDefault();
	}

	// suspend the game while the page is hidden (like the app being sent to the background)
	visibilityChanged() {
		const level = this.seq.level;
		if (!level)
			return;
		if (document.hidden) {
			if (level.state !== SUSPENDED && level.state !== INIT && level.state !== LOADED && level.state !== START_SPLASH && level.state !== STOPPED) {
				level.suspendGame();
				this.suspendedByVisibility = level;
			}
		} else if (this.suspendedByVisibility === level) {
			this.suspendedByVisibility = null;
			if (level.state === SUSPENDED)
				level.resumeGame();
		}
	}
}
