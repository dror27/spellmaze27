// SpellMaze - the score/message panel at the bottom of the game (port of ScoreWidget / ScoreWidgetView)

import { el, setFrame, formatNumber } from '../util.js';
import { BrandManager } from '../brand.js';
import { UserPrefs, PK_SCORE, CHEAT_PLAY_PAUSE_AT_WILL, CHEAT_SHOW_HINTS_AT_WILL } from '../prefs.js';
import { Wallet } from '../wallet.js';
import { decoratorImage, fitFontSize } from '../piece.js';
import { SoundTheme } from '../sound.js';

export const PS_NONE = 0, PS_PLAYING = 1, PS_PAUSED = 2;
export const GA_NONE = 0, GA_HINT = 1;

const WALLET_ITEM = 24, WALLET_PAD = 2;

function iconSVG(kind, color) {
	if (kind === 'pause')
		return `<svg width="24" height="24"><rect x="4" y="4" width="7" height="18" fill="${color}"/><rect x="14" y="4" width="7" height="18" fill="${color}"/></svg>`;
	if (kind === 'play')
		return `<svg width="24" height="24"><polygon points="4,4 21,13 4,22" fill="${color}"/></svg>`;
	// hint: a ten pointed star
	const pts = [];
	for (let i = 0; i < 10; i++) {
		const a = Math.PI * 2 / 10 * i;
		const r = (i % 2) ? 6 : 12;
		pts.push(`${(12 + Math.sin(a) * r).toFixed(2)},${(12 + Math.cos(a) * r).toFixed(2)}`);
	}
	return `<svg width="24" height="24"><polygon points="${pts.join(' ')}" fill="${color}"/></svg>`;
}

export class ScoreWidget {
	constructor() {
		this.eventsTarget = null;
		this.allowPlayPause = false;
		this.allowShowHint = false;
		this.scoreDisplayOffset = -1;		// no score display until set
		this._progress = 0;
		this._progress2 = 0;
		this._progress3 = 0;
		this.message = '';
		this.message1 = '';
		this.message2 = '';
		this.playState = PS_NONE;
		this.gameAction = GA_NONE;
		this.root = null;
		this.walletVersion = -1;
	}

	viewWithFrame(frame) {
		if (this.root)
			return this.root;
		const brand = BrandManager.currentBrand();
		this.font = brand.globalFont();
		this.textColor = brand.globalTextColor();
		const r = el('div', 'scorewidget');
		this.root = r;
		this.frame = frame;
		setFrame(r, frame.x, frame.y, frame.w, frame.h);
		Object.assign(r.style, {
			backgroundColor: brand.globalBackgroundColor(),
			border: `${brand.globalGridLineWidth()}px solid ${brand.globalGridColor()}`,
			color: this.textColor, fontFamily: this.font
		});
		const innerW = frame.w - 4 - 64, innerX = 2 + 32;
		const bar = (cls, color, image, y) => {
			const b = el('div', 'score-progress ' + cls, r);
			setFrame(b, 4 - 1, y - 1, 0, (frame.h - 8) / 2);
			if (image) {
				b.style.backgroundImage = `url("${image}")`;
				b.style.backgroundRepeat = 'no-repeat';
			} else
				b.style.backgroundColor = color;
			return b;
		};
		this.bar1 = bar('p1', brand.globalColor('score-progress1', 'rgba(77,255,77,0.4)'), brand.globalImage('score-progress-1'), 4);
		const y2 = 4 + (frame.h - 8) / 2;
		this.bar2 = bar('p2', brand.globalColor('score-progress2', 'rgba(255,77,77,0.4)'), brand.globalImage('score-progress-2'), y2);
		this.bar3 = bar('p3', brand.globalColor('score-progress3', 'rgba(77,77,255,0.4)'), brand.globalImage('score-progress-3'), y2);

		const label = (cls, x, y, w, h, size, bold) => {
			const l = el('div', 'score-label ' + cls, r);
			setFrame(l, x - 1, y - 1, w, h);
			l.style.font = `${bold ? 'bold ' : ''}${size}px ${this.font}`;
			l.style.lineHeight = h + 'px';
			l.dataset.size = size;
			l.dataset.bold = bold ? '1' : '';
			return l;
		};
		const fh = frame.h - 4;
		this.scoreEl = label('score', innerX, 2, innerW, fh, 32, false);
		this.messageEl = label('message', innerX, 2, innerW, fh, 32, true);
		const h1 = Math.round(frame.h * 2 / 3);
		this.message1El = label('message1', innerX, 0, innerW, h1, 24, true);
		this.message2El = label('message2', innerX, h1 - 2, innerW, frame.h - h1, 14, false);
		for (const e of [this.messageEl, this.message1El, this.message2El])
			e.style.opacity = '0';

		this.walletEl = el('div', 'wallet', r);
		setFrame(this.walletEl, WALLET_ITEM / 4 - 1, -(WALLET_ITEM / 2) - 1, frame.w - WALLET_ITEM / 2, WALLET_ITEM);

		this.playBtn = el('div', 'score-button play', r);
		setFrame(this.playBtn, 3 - 1, 3 - 1, 32, frame.h - 3 - 2);
		this.playBtn.style.opacity = '0';
		this.playBtn.addEventListener('pointerdown', ev => {
			ev.stopPropagation();
			ev.preventDefault();
			if (this.playBtn.style.opacity === '0')
				return this.onTouched(1);
			this.playStateTouched();
		});
		this.hintBtn = el('div', 'score-button hint', r);
		setFrame(this.hintBtn, frame.w - 3 - 32 - 1, 3 - 1, 32, frame.h - 3 - 2);
		this.hintBtn.style.opacity = '0';
		this.hintBtn.innerHTML = brand.globalImage('button-hint') ? `<img src="${brand.globalImage('button-hint')}">` : iconSVG('hint', this.textColor);
		this.hintBtn.addEventListener('pointerdown', ev => {
			ev.stopPropagation();
			ev.preventDefault();
			if (this.hintBtn.style.opacity === '0')
				return this.onTouched(1);
			this.gameActionTouched();
		});
		r.addEventListener('pointerdown', ev => {
			ev.preventDefault();
			this.onTouched(1);
		});
		this.updateScore();
		this.updateProgress();
		this.updatePlayState();
		this.updateGameAction();
		return r;
	}

	// ------------------------------------------------ model

	score() {
		return UserPrefs.getInteger(PK_SCORE, 0);
	}
	addToScore(incr) {
		const s = this.score() + incr;
		UserPrefs.setInteger(PK_SCORE, s);
		this.updateScore();
	}
	commitScore() { }
	progress() { return this._progress; }
	setProgress(v) {
		this._progress = v;
		this.updateProgress();
	}
	setProgress2(v) {
		this._progress2 = v;
		this.updateProgress();
	}
	setProgress3(v) {
		this._progress3 = v;
		this.updateProgress();
	}
	setMessage(m) {
		this.message = m || '';
		this.updateMessage();
	}
	setMessage1(m) {
		this.message1 = m || '';
		this.updateMessage12();
	}
	setMessage2(m) {
		this.message2 = m || '';
		this.updateMessage12();
	}
	setScoreDisplayOffset(v) {
		this.scoreDisplayOffset = v;
	}
	setPlayState(s) {
		this.playState = s;
		this.updatePlayState();
	}
	setGameAction(a) {
		this.gameAction = a;
		this.updateGameAction();
	}
	onTouched(tapCount) {
		this.updateScore();
		if (this.eventsTarget && this.eventsTarget.onScoreWidgetTouched)
			this.eventsTarget.onScoreWidgetTouched(tapCount);
	}
	pressPlayAction() {
		this.playStateTouched();
	}
	pressGameAction() {
		this.gameActionTouched();
	}

	// ------------------------------------------------ view

	fit(e, text) {
		if (!e)
			return;
		e.textContent = text;
		const size = parseFloat(e.dataset.size);
		const fitted = fitFontSize(text, parseFloat(e.style.width) - 2, parseFloat(e.style.height), size, this.font, !!e.dataset.bold);
		e.style.fontSize = fitted + 'px';
	}

	show(which) {
		const all = { score: this.scoreEl, message: this.messageEl, m12: null };
		this.scoreEl.style.opacity = which === 'score' ? '1' : '0';
		this.messageEl.style.opacity = which === 'message' ? '1' : '0';
		this.message1El.style.opacity = which === 'm12' ? '1' : '0';
		this.message2El.style.opacity = which === 'm12' ? '1' : '0';
	}

	updateScore() {
		if (!this.root)
			return;
		if (this.scoreDisplayOffset !== -1) {
			const n = this.score() + this.scoreDisplayOffset;
			this.fit(this.scoreEl, n ? formatNumber(n) : '');
			this.show(n < 0 ? 'none' : 'score');
		}
		this.updateWallet();
	}

	updateWallet() {
		if (!this.root || Wallet.version === this.walletVersion)
			return;
		this.walletVersion = Wallet.version;
		this.walletEl.innerHTML = '';
		let x = parseFloat(this.walletEl.style.width);
		for (const name of Wallet.allWalletItems()) {
			const step = Wallet.walletItemDisplayStepSize(name);
			let value = Math.floor(Wallet.walletItemValue(name) / step);
			const image = decoratorImage(name);
			if (!image)
				continue;
			for (let count = 0; value > 0 && count < 5; value -= step, count++) {
				const ix = x - WALLET_ITEM;
				if (ix < 0)
					break;
				x -= WALLET_ITEM + WALLET_PAD;
				const img = el('img', 'wallet-item', this.walletEl);
				img.src = image;
				setFrame(img, ix, 0, WALLET_ITEM, WALLET_ITEM);
			}
		}
	}

	updateProgress() {
		if (!this.root)
			return;
		const w = this.frame.w - 8;
		this.bar1.style.width = Math.max(0, Math.min(1, this._progress)) * w + 'px';
		if (this._progress3 <= 0) {
			this.bar2.style.width = Math.max(0, Math.min(1, this._progress2)) * w + 'px';
			this.bar3.style.width = '0px';
		} else {
			this.bar2.style.width = '0px';
			this.bar3.style.width = Math.max(0, Math.min(1, this._progress3)) * w + 'px';
		}
	}

	updateMessage() {
		if (!this.root)
			return;
		this.fit(this.messageEl, this.message);
		this.show('message');
	}

	updateMessage12() {
		if (!this.root)
			return;
		this.fit(this.message1El, this.message1);
		this.fit(this.message2El, this.message2);
		this.show('m12');
	}

	updatePlayState() {
		if (!this.root)
			return;
		if (!this.allowPlayPause && !UserPrefs.cheat(CHEAT_PLAY_PAUSE_AT_WILL))
			return;
		const brand = BrandManager.currentBrand();
		switch (this.playState) {
			case PS_NONE:
				this.playBtn.style.opacity = '0';
				break;
			case PS_PLAYING: {
				this.playBtn.style.opacity = '1';
				const img = brand.globalImage('button-pause');
				this.playBtn.innerHTML = img ? `<img src="${img}">` : iconSVG('pause', this.textColor);
				this.animateSelection(this.playBtn);
				break;
			}
			case PS_PAUSED: {
				this.playBtn.style.opacity = '1';
				const img = brand.globalImage('button-play');
				this.playBtn.innerHTML = img ? `<img src="${img}">` : iconSVG('play', this.textColor);
				this.animateSelection(this.playBtn);
				break;
			}
		}
	}

	updateGameAction() {
		if (!this.root)
			return;
		if (this.gameAction === GA_HINT && (this.allowShowHint || UserPrefs.cheat(CHEAT_SHOW_HINTS_AT_WILL))) {
			this.hintBtn.style.opacity = '1';
			this.animateSelection(this.hintBtn);
		} else
			this.hintBtn.style.opacity = '0';
	}

	playStateTouched() {
		this.animateSelection(this.playBtn);
		SoundTheme.pieceSelected();
		this.onTouched(3);
	}

	gameActionTouched() {
		this.animateSelection(this.hintBtn);
		SoundTheme.pieceSelected();
		this.onTouched(2);
	}

	animateSelection(e) {
		const icon = e.firstElementChild;
		if (!icon)
			return;
		icon.style.transition = 'transform 0.2s';
		icon.style.transform = 'scale(1.6)';
		setTimeout(() => {
			icon.style.transition = 'transform 0.4s';
			icon.style.transform = '';
		}, 200);
	}
}
