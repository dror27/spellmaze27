// SpellMaze - the game level view (port of GameLevelView)

import { el, setFrame } from '../util.js';
import { BrandManager } from '../brand.js';
import { GridBoard } from '../board.js';
import { ASSETS } from '../piece.js';
import { STAGE_W, Stage } from './stage.js';

export class GameLevelView {
	constructor(frame, model) {
		this.model = model;
		this.frame = frame;
		const brand = BrandManager.currentBrand();
		const r = el('div', 'gamelevel');
		this.root = r;
		setFrame(r, frame.x, frame.y, frame.w, frame.h);
		this.showSymbolsLeftCounter = brand.globalBoolean('skin/props/show-symbols-left-counter', false);

		if (model.showLanguageBackground) {
			const bg = model.language.backgroundImage();
			if (bg) {
				const img = el('img', 'language-background', r);
				img.src = bg;
				setFrame(img, 0, 0, frame.w, frame.h);
				img.getBoundingClientRect();
				img.style.transition = 'opacity 10s';
				img.style.opacity = '0.25';
			}
		}

		const cellColumns = 6, cellRows = 6;
		const cellWidth = 288 / cellColumns, cellHeight = 288 / cellRows;
		r.appendChild(model.dispenser.viewWithFrame({ x: 68, y: 2, w: cellWidth + 1, h: cellHeight + 1 }));

		const boardRect = { x: 16, y: cellHeight + 8, w: cellColumns * cellWidth + 1, h: cellRows * cellHeight + 1 };
		if (!model.hintBoard)
			r.appendChild(model.board.viewWithFrame(boardRect));
		else {
			let br = model.board.suggestedFrame;
			if (!br || !br.w)
				br = boardRect;
			const rect = { x: 16, y: cellHeight + 8, w: br.w + 1, h: br.h + 1 };
			r.appendChild(model.board.viewWithFrame(rect));
			const hr = model.hintBoard.suggestedFrame;
			r.appendChild(model.hintBoard.viewWithFrame({ x: rect.x + hr.x, y: rect.y + hr.y, w: hr.w, h: hr.h }));
		}

		r.appendChild(model.scoreWidget.viewWithFrame({ x: 16, y: 360 - 13, w: 289, h: 48 }));

		if (this.showSymbolsLeftCounter) {
			this.symbolsLeft = el('div', 'symbols-left', r);
			setFrame(this.symbolsLeft, 86, 32, 46, 20);
			this.symbolsLeft.style.color = brand.globalGridColor();
			this.symbolsLeft.style.font = `bold 16px ${brand.globalFont()}`;
		}

		this.polaroidMargin = 3;
		this.polaroidMarginBottom = 0;
		this.hintImageFrame = null;

		const curtain = brand.globalImage('pause-curtain') || ASSETS + 'PauseCurtain.png';
		this.pauseCurtain = el('img', 'pause-curtain');
		this.pauseCurtain.src = curtain;
		this.pauseCurtain.draggable = false;
		// the curtain covers the whole content area (which may be taller than the original layout)
		this.curtainH = Math.max(460, (Stage.contentH || 416) + 32);
		setFrame(this.pauseCurtain, 0, -this.curtainH, STAGE_W, this.curtainH);
		this.pauseCurtainShown = false;
	}

	updateSymbolsLeft(text) {
		if (this.symbolsLeft)
			this.symbolsLeft.textContent = text;
	}

	showHintImage(url, envelope) {
		let frame = this.hintImageFrame;
		if (!frame) {
			const board = this.model.board;
			if (board instanceof GridBoard && board.view) {
				let sizeCols = 3, sizeRows = 3;
				const aspect = this.model.language.props ? this.model.language.props['image-aspect'] : null;
				if (aspect) {
					const comps = String(aspect).split('x');
					if (comps.length >= 1)
						sizeCols = parseInt(comps[0], 10) || 3;
					if (comps.length >= 2)
						sizeRows = parseInt(comps[1], 10) || 3;
				}
				while (sizeCols >= board.width)
					sizeCols--;
				while (sizeRows >= board.height)
					sizeRows--;
				sizeCols = Math.max(1, sizeCols);
				sizeRows = Math.max(1, sizeRows);
				const v = board.view;
				const r1 = v.cellRectAt(0, board.height - sizeRows);
				const r1a = v.cellRectAt(1, board.height - sizeRows + 1);
				const r2 = v.cellRectAt(sizeCols - 1, board.height - 1);
				const pad = Math.min(r1a.x - (r1.x + r1.w), r1a.y - (r1.y + r1.h));
				const width = r2.x - r1.x + r2.w + sizeCols * pad;
				const height = r2.y - r1.y + r2.h + sizeRows * pad;
				frame = {
					x: r1.x - (sizeCols / 2.0) * pad + v.frame.x,
					y: r1.y - (sizeRows / 2.0) * pad + v.frame.y,
					w: width, h: height
				};
			} else
				frame = { x: 9, y: 241, w: 112, h: 112 };
			this.hintImageFrame = frame;
		}
		const m = this.polaroidMargin;
		const hint = el('div', 'hint-polaroid', this.root);
		const hf = { x: frame.x - m, y: frame.y - m, w: frame.w + 2 * m, h: frame.h + 2 * m + this.polaroidMarginBottom };
		setFrame(hint, hf.x, hf.y, hf.w, hf.h);
		hint.style.backgroundColor = BrandManager.currentBrand().globalColor('hint-polaroid-frame', '#ffffff');
		const img = el('img', '', hint);
		img.src = url;
		setFrame(img, m, m, frame.w, frame.h);
		img.style.objectFit = 'cover';
		const offX = -hf.w - hf.x;
		hint.style.opacity = '0';
		hint.style.transform = `translateX(${offX}px)`;
		hint.getBoundingClientRect();
		const a = envelope.attack, s = envelope.sustain, d = envelope.decay;
		hint.style.transition = `transform ${a.duration}s, opacity ${a.duration}s`;
		hint.style.opacity = String(a.alpha);
		hint.style.transform = '';
		setTimeout(() => {
			hint.style.transition = `opacity ${s.duration}s`;
			hint.style.opacity = String(s.alpha);
			setTimeout(() => {
				hint.style.transition = `transform ${d.duration}s, opacity ${d.duration}s`;
				hint.style.opacity = String(d.alpha);
				hint.style.transform = `translateX(${offX}px)`;
				setTimeout(() => hint.remove(), d.duration * 1000 + 50);
			}, s.duration * 1000);
		}, a.duration * 1000);
	}

	updatePauseCurtain() {
		const state = this.model.state;
		const c = this.pauseCurtain;
		if (state === 'PAUSED' || state === 'SUSPENDED') {
			if (!this.pauseCurtainShown) {
				this.root.appendChild(c);
				const sw = this.model.scoreWidget.root;
				if (sw)
					this.root.appendChild(sw);		// bring score widget to front
				this.pauseCurtainShown = true;
				c.style.transition = 'none';
				c.style.transform = '';
				c.getBoundingClientRect();
				c.style.transition = 'transform 0.2s';
				c.style.transform = `translateY(${this.curtainH - 32 - (Stage.layoutTop || 0)}px)`;
			}
		} else if (this.pauseCurtainShown) {
			c.style.transition = 'transform 0.2s';
			c.style.transform = '';
			setTimeout(() => {
				c.remove();
				this.pauseCurtainShown = false;
			}, 220);
		}
	}

	dispose() {
		this.root.remove();
	}
}
