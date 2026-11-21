// SpellMaze - symbol pieces and their views (port of SymbolPiece / SymbolPieceView / *PieceDecorator)

import { BrandManager } from './brand.js';
import { JOKER_CHAR } from './language.js';
import { el, stagePos, randInt, toBool } from './util.js';
import {
	DECORATOR_APPLE, DECORATOR_BOMB, DECORATOR_COIN, DECORATOR_CHECKED, DECORATOR_CHECKED2, DECORATOR_DIGIT
} from './wallet.js';

export const SYMBOL_PIECE_POS_COLOR_HINT = 'SYMBOL_PIECE_POS_COLOR_HINT';
export const ASSETS = 'assets/images/';

const ANIM_DURATION = 0.2;

// ---------------------------------------------------------------- color tables

let colorTable = null, textColorTable = null;
let customColorsOffset = 0;

export function resetColorTables() {
	colorTable = null;
	textColorTable = null;
	imageCache.clear();
}

function initColorTable() {
	if (colorTable)
		return;
	colorTable = [];
	textColorTable = [];
	const brand = BrandManager.currentBrand();
	customColorsOffset = brand.globalInteger('skin/props/piece-colors-offset', 0);
	const customColors = brand.globalInteger('skin/props/piece-custom-colors', 0);
	if (customColors) {
		for (let index = 0; index < customColors; index++) {
			colorTable.push(brand.globalColor(`piece-custom-color-${index}`, 'rgb(255,0,0)'));
			textColorTable.push(brand.globalColor(`piece-custom-text-color-${index}`, 'rgb(0,0,0)'));
		}
	} else {
		const blackPiece = brand.globalBoolean('skin/props/dark-pref-button', false);
		for (let r = 0; r <= 1; r += 0.5)
			for (let g = 0; g <= 1; g += 0.5)
				for (let b = 0; b <= 1; b += 0.5) {
					const energy = r + g + b;
					if (energy <= 0)
						continue;
					if (blackPiece && energy >= 3.0) {
						colorTable.push('rgb(0,0,0)');
						textColorTable.push('rgb(255,255,255)');
					} else {
						colorTable.push(`rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`);
						textColorTable.push(energy > 0.5 ? 'rgb(0,0,0)' : 'rgb(255,255,255)');
					}
				}
		[colorTable[25], colorTable[7]] = [colorTable[7], colorTable[25]];
		[textColorTable[25], textColorTable[7]] = [textColorTable[7], textColorTable[25]];
	}
}

export function getStringIndex(s) {
	s = s || '';
	if (s === JOKER_CHAR && BrandManager.currentBrand().globalColor('joker-custom-color', null))
		return -1;
	if (s.endsWith('/')) {
		const comps = s.split('/');
		return getStringIndex(comps[Math.max(comps.length, 2) - 2]);
	}
	let index = 0;
	for (let n = 0; n < s.length; n++)
		index += s.charCodeAt(n);
	return index;
}

function chessColor(piece, kind) {
	const num = piece && piece.props[SYMBOL_PIECE_POS_COLOR_HINT];
	if (num === undefined)
		return null;
	const brand = BrandManager.currentBrand();
	const mod = brand.globalInteger('skin/props/chess-colors-mod', 0);
	if (mod <= 1)
		return null;
	const row = Math.floor(num / 100), col = num % 100;
	const index = (col + (row % mod)) % mod;
	return brand.globalColor(`chess-${kind}color-${index}`, null);
}

export function colorForIndex(index, piece) {
	initColorTable();
	if (index < 0) {
		const c = BrandManager.currentBrand().globalColor('joker-custom-color', null);
		if (c)
			return c;
		index = 0;
	}
	return chessColor(piece, '') || colorTable[(index + customColorsOffset) % colorTable.length];
}

export function textColorForIndex(index, piece) {
	initColorTable();
	if (index < 0) {
		const c = BrandManager.currentBrand().globalColor('joker-custom-text-color', null);
		if (c)
			return c;
		index = 0;
	}
	return chessColor(piece, 'text-') || textColorTable[(index + customColorsOffset) % textColorTable.length];
}

// ---------------------------------------------------------------- piece masks
// brand masks follow CGImageMaskCreate semantics (black paints, white masks out): convert them to alpha masks

const alphaMasks = new Map();		// url -> dataURL | Promise

function alphaMask(url, apply) {
	const cached = alphaMasks.get(url);
	if (typeof cached === 'string')
		return apply(cached);
	if (cached) {
		cached.then(apply);
		return;
	}
	const p = new Promise(resolve => {
		const img = new Image();
		img.onload = () => {
			const c = document.createElement('canvas');
			c.width = img.naturalWidth;
			c.height = img.naturalHeight;
			const g = c.getContext('2d');
			g.drawImage(img, 0, 0);
			const d = g.getImageData(0, 0, c.width, c.height);
			const px = d.data;
			for (let i = 0; i < px.length; i += 4) {
				const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
				px[i] = px[i + 1] = px[i + 2] = 0;
				px[i + 3] = Math.round((255 - lum) * px[i + 3] / 255);
			}
			g.putImageData(d, 0, 0);
			const url2 = c.toDataURL();
			alphaMasks.set(url, url2);
			resolve(url2);
		};
		img.onerror = () => resolve(null);
		img.src = url;
	});
	alphaMasks.set(url, p);
	p.then(apply);
}

// ---------------------------------------------------------------- text fitting

const measureCanvas = document.createElement('canvas').getContext('2d');
export function fitFontSize(text, width, height, maxSize, font, bold = true) {
	let size = maxSize;
	measureCanvas.font = `${bold ? 'bold ' : ''}${size}px ${font}`;
	const w = measureCanvas.measureText(text).width;
	if (w > width && w > 0)
		size = Math.max(6, Math.floor(size * width / w));
	return size;
}

// ---------------------------------------------------------------- decorators

const imageCache = new Map();

function shapeDecorationImage(fill, lines, text) {
	const key = 'shape:' + fill + JSON.stringify(lines) + (text || '');
	if (imageCache.has(key))
		return imageCache.get(key);
	const radius = 12, scale = 2;
	const c = document.createElement('canvas');
	c.width = c.height = radius * 2 * scale;
	const g = c.getContext('2d');
	g.scale(scale, scale);
	g.fillStyle = fill;
	g.strokeStyle = '#fff';
	g.lineWidth = 2.5;
	g.beginPath();
	g.arc(radius, radius, radius - 3, 0, Math.PI * 2);
	g.fill();
	g.beginPath();
	g.arc(radius, radius, radius - 2, 0, Math.PI * 2);
	g.stroke();
	g.strokeStyle = '#fff';
	g.lineWidth = 4;
	g.lineCap = 'butt';
	g.lineJoin = 'miter';
	for (const pts of lines) {
		g.beginPath();
		pts.forEach(([x, y], i) => {
			const px = x * radius + radius, py = y * radius + radius;
			if (i === 0)
				g.moveTo(px, py);
			else
				g.lineTo(px, py);
		});
		g.stroke();
	}
	if (text) {
		g.fillStyle = '#fff';
		g.font = 'bold 14px Helvetica, Arial, sans-serif';
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.fillText(text, radius, radius + 1);
	}
	const url = c.toDataURL();
	imageCache.set(key, url);
	return url;
}

export function decoratorImage(name) {
	const brand = BrandManager.currentBrand();
	switch (name) {
		case DECORATOR_APPLE:
			return brand.globalImage('decorator-apple') || ASSETS + 'Decoration_Apple.gif';
		case DECORATOR_BOMB:
			return brand.globalImage('decorator-bomb') || ASSETS + 'Decoration_Bomb.gif';
		case DECORATOR_COIN:
			return brand.globalImage('decorator-coin') || ASSETS + 'Decoration_Coin.gif';
		case DECORATOR_CHECKED:
			return shapeDecorationImage(brand.globalColor('checked-decorator', 'rgb(0,128,0)'), [[[-0.5, 0], [-0.2, 0.3], [0.5, -0.4]]]);
		case DECORATOR_CHECKED2:
			return shapeDecorationImage(brand.globalColor('checked-decorator', 'rgb(0,128,0)'), [[[-0.5, 0], [0.5, 0]], [[0, -0.5], [0, 0.5]]]);
		case DECORATOR_DIGIT:
			return shapeDecorationImage(brand.globalColor('digit-decorator', 'rgb(0,0,128)'), [], '5');
		default:
			return null;
	}
}

class ImagePieceDecorator {
	constructor(name) {
		this.name = name;
		this.image = decoratorImage(name);
		this.xPos = 0.9;
		this.yPos = 0.1;
		this.bounce = true;
		this.imageEl = null;
		this.timer = null;
	}
	decorate(piece) {
		this.piece = piece;
		if (piece.view)
			this.attach(piece.view);
	}
	attach(view) {
		if (this.imageEl)
			this.imageEl.remove();
		if (!this.image)
			return;
		const parent = view.scaleEl;
		const w = view.width, h = view.height;
		const img = el('img', 'decorator', parent);
		img.src = this.image;
		img.draggable = false;
		const size = 24;
		img.style.left = (w * this.xPos - size / 2) + 'px';
		img.style.top = (h * this.yPos - size / 2) + 'px';
		img.style.transform = 'scale(0.5)';
		this.imageEl = img;
		requestAnimationFrame(() => {
			img.style.transition = 'transform 0.2s';
			img.style.transform = 'scale(1.3)';
			setTimeout(() => {
				img.style.transition = 'transform 0.4s';
				img.style.transform = '';
			}, 200);
		});
		if (this.bounce)
			this.scheduleBounce();
	}
	scheduleBounce() {
		clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			const img = this.imageEl;
			if (!img || !img.isConnected)
				return;
			img.style.transition = 'transform 0.2s';
			img.style.transform = 'translateY(-10px)';
			setTimeout(() => {
				img.style.transition = 'transform 0.4s';
				img.style.transform = '';
				setTimeout(() => this.scheduleBounce(), 400);
			}, 200);
		}, 5000);
	}
	undecorate() {
		clearTimeout(this.timer);
		if (this.imageEl)
			this.imageEl.remove();
		this.imageEl = null;
	}
}

// ---------------------------------------------------------------- the piece model

let pieceIdCounter = 0;

export class SymbolPiece {
	constructor(text) {
		this.id = ++pieceIdCounter;
		this.text = text !== undefined ? text : '';
		this.image = null;
		this.props = {};
		this.decorators = new Map();
		this.cell = null;
		this.isSelected = false;
		this.showSymbolText = false;
		this.view = null;
		this._eventsTarget = null;
		this._fade = 0;
		this._disabled = false;
		this._hidden = false;
	}
	get symbol() {
		return this.text ? this.text.charAt(0) : '';
	}
	set symbol(ch) {
		this.setText(ch);
	}
	setText(t) {
		this.text = t;
		if (this.view)
			this.view.updateText();
	}
	setImage(url) {
		this.image = url;
		if (this.view)
			this.view.updateText();
	}
	viewWithFrame(w, h) {
		if (!this.view) {
			this.view = new SymbolPieceView(this, w, h);
			for (const d of this.decorators.values())
				d.attach(this.view);
		} else
			this.view.resize(w, h);
		return this.view;
	}
	get eventsTarget() {
		return this._eventsTarget || (this.cell && this.cell.board ? this.cell.board.level : null);
	}
	set eventsTarget(t) {
		this._eventsTarget = t;
	}
	clicked() {
		const board = this.cell ? this.cell.board : null;
		const target = this.eventsTarget;
		if (!target)
			return;
		if (board && board.piecesSelectable) {
			if (!this.isSelected) {
				this.select();
				target.pieceSelected && target.pieceSelected(this);
			} else
				target.pieceReselected && target.pieceReselected(this);
		} else
			target.pieceClicked && target.pieceClicked(this);
	}
	disabledClicked() {
		const target = this.eventsTarget;
		if (target && target.disabledPieceClicked)
			target.disabledPieceClicked(this);
	}
	select() {
		if (!this.isSelected) {
			this.isSelected = true;
			if (this.view)
				this.view.updateSelected(true);
		}
	}
	deselect() {
		if (this.isSelected) {
			this.isSelected = false;
			if (this.view)
				this.view.updateSelected(false);
		}
	}
	reset() {
		this.deselect();
	}
	selected() {
		return this.isSelected;
	}
	hinted(last) {
		if (this.view)
			this.view.hinted(last);
	}
	eliminate() {
		if (this.cell)
			this.cell.abandonPiece();
		this.cell = null;
		for (const d of this.decorators.values())
			d.undecorate && setTimeout(() => d.undecorate(), 800);
		if (this.view)
			this.view.eliminate();
		this.eliminated = true;
	}
	examine() {
		if (this.view)
			this.view.examine();
	}
	get fade() {
		return this._fade;
	}
	setFade(f) {
		if (this._fade === f)
			return;
		this._fade = f;
		if (this.view)
			this.view.setFade(f);
	}
	get disabled() {
		return this._disabled;
	}
	setDisabled(d) {
		if (this._disabled === d)
			return;
		this._disabled = d;
		if (this.view)
			this.view.updateAlpha();
	}
	get hidden() {
		return this._hidden;
	}
	setHidden(h) {
		if (this._hidden === h)
			return;
		this._hidden = h;
		if (this.view)
			this.view.updateAlpha();
	}
	appendTo(arr) {
		arr.push(this.text);
	}
	addDecorator(name) {
		if (this.decorators.has(name))
			return;
		const dec = new ImagePieceDecorator(name);
		this.decorators.set(name, dec);
		dec.decorate(this);
	}
	removeDecorator(name) {
		const dec = this.decorators.get(name);
		if (dec) {
			dec.undecorate();
			this.decorators.delete(name);
		}
	}
	hasDecorator(name) {
		return name ? this.decorators.has(name) : this.decorators.size > 0;
	}
	sameContentAs(p) {
		return p instanceof SymbolPiece && p.text === this.text;
	}
}

// ---------------------------------------------------------------- the piece view

export class SymbolPieceView {
	constructor(model, w, h) {
		this.model = model;
		this.width = w;
		this.height = h;
		this.lastScreen = null;			// {x, y, w, h} - last known position on stage
		this.fastAnimations = false;
		this.root = el('div', 'piece');
		this.scaleEl = el('div', 'piece-scale', this.root);
		this.contentEl = el('div', 'piece-content', this.scaleEl);
		this.fadeEl = null;
		this.root.style.width = w + 'px';
		this.root.style.height = h + 'px';
		this.scaleTimer = null;
		this.updateText();
	}

	get anim2() {
		return this.fastAnimations ? 0.2 : 0.4;
	}
	get anim4() {
		return this.fastAnimations ? 0.4 : 0.8;
	}

	resize(w, h) {
		if (w === this.width && h === this.height)
			return;
		this.width = w;
		this.height = h;
		this.root.style.width = w + 'px';
		this.root.style.height = h + 'px';
		this.updateText();
		for (const d of this.model.decorators.values())
			if (d.imageEl)
				d.attach(this);
	}

	updateText() {
		const m = this.model;
		const brand = BrandManager.currentBrand();
		const c = this.contentEl;
		c.innerHTML = '';
		const w = this.width, h = this.height;
		const colorIndex = getStringIndex(m.text);
		const bg = colorForIndex(colorIndex, m);
		const fg = textColorForIndex(colorIndex, m);
		this.bgColor = bg;
		const radius = brand.globalFloat('skin/props/piece-corner-radius', 0);
		c.style.borderRadius = radius > 0 ? (radius * Math.min(w, h)) + 'px' : '0';
		c.style.backgroundColor = bg;
		const font = brand.globalFont();
		if (!m.image && (m.text || '').length < 32) {
			let text = m.text || '';
			if (text.endsWith('/'))
				text = text.split('/')[0];
			const label = el('div', 'piece-label', c);
			label.textContent = text;
			const size = fitFontSize(text, w - 2, h, Math.round(8 * h / 10), font);
			label.style.font = `bold ${size}px ${font}`;
			label.style.lineHeight = h + 'px';
			label.style.color = fg;
			const shadow = brand.globalColor('piece-shadow-color', null);
			if (shadow) {
				const sx = brand.globalFloat('skin/props/piece-shadow-x', 0), sy = brand.globalFloat('skin/props/piece-shadow-y', 0);
				label.style.textShadow = `${sx}px ${sy}px 0 ${shadow}`;
			}
		} else if (m.image) {
			if (!brand.globalBoolean('skin/props/show-symbol-color', true))
				c.style.backgroundColor = 'transparent';
			const img = el('img', 'piece-image', c);
			img.draggable = false;
			img.style.objectFit = 'cover';
			img.onload = () => {
				const imageAspect = img.naturalWidth / img.naturalHeight;
				const frameAspect = w / h;
				const delta = 1.0 - imageAspect / frameAspect;
				img.style.objectFit = Math.abs(delta) < 0.34 ? 'cover' : 'contain';
			};
			img.src = m.image;
			if (m.showSymbolText && Math.min(w, h) > 40) {
				const lw = w / 3, lh = h / 3;
				const label = el('div', 'piece-label piece-label-small', c);
				label.textContent = m.text;
				Object.assign(label.style, {
					left: (lw * 2) + 'px', top: (lh * 2) + 'px', width: lw + 'px', height: lh + 'px',
					font: `bold ${Math.round(8 * lh / 10)}px ${font}`, lineHeight: lh + 'px', color: fg
				});
			}
		}
		const tableIndex = ((colorIndex < 0 ? 0 : colorIndex) + customColorsOffset) % (colorTable ? colorTable.length : 1);
		let overlay = null;
		if (brand.globalBoolean('skin/props/piece-custom-overlays', false))
			overlay = brand.globalImage(`piece-custom-overlay-${tableIndex}`);
		if (!overlay)
			overlay = brand.globalImage('piece-overlay');
		let mask = null;
		if (brand.globalBoolean('skin/props/piece-custom-masks', false))
			mask = brand.globalImage(`piece-custom-mask-${tableIndex}`);
		if (!mask)
			mask = brand.globalImage('piece-mask');
		c.style.maskImage = c.style.webkitMaskImage = '';
		if (mask)
			alphaMask(mask, url => {
				if (!url)
					return;
				c.style.webkitMaskImage = c.style.maskImage = `url("${url}")`;
				c.style.webkitMaskSize = c.style.maskSize = '100% 100%';
			});
		if (overlay) {
			const o = el('img', 'piece-overlay', c);
			o.draggable = false;
			o.src = overlay;
		}
		if (this.fadeEl) {
			c.appendChild(this.fadeEl);
			this.fadeEl.style.backgroundColor = bg;
		}
		this.updateAlpha(true);
	}

	updateAlpha(immediate) {
		const m = this.model;
		const target = m._hidden ? 0 : (m._disabled ? 0.33 : 1.0);
		this.contentEl.style.transition = immediate ? 'none' : `opacity ${ANIM_DURATION}s, transform ${ANIM_DURATION}s`;
		this.contentEl.style.opacity = String(target);
		if (m._hidden) {
			for (const d of m.decorators.values())
				if (d.imageEl)
					d.imageEl.style.opacity = '0';
		} else {
			for (const d of m.decorators.values())
				if (d.imageEl)
					d.imageEl.style.opacity = '';
		}
	}

	setFade(f) {
		if (!this.fadeEl) {
			this.fadeEl = el('div', 'piece-fade', this.contentEl);
			this.fadeEl.style.backgroundColor = this.bgColor;
			this.fadeEl.style.opacity = '0';
			this.fadeEl.getBoundingClientRect();
		}
		this.fadeEl.style.transition = `opacity ${this.anim2}s`;
		this.fadeEl.style.opacity = String(f);
	}

	// called by the cell after the view has been attached to it
	placed() {
		const last = this.lastScreen;
		const pos = stagePos(this.root);
		const r = this.root;
		r.style.transition = 'none';
		if (last) {
			const dx = (last.x + last.w / 2) - (pos.x + this.width / 2);
			const dy = (last.y + last.h / 2) - (pos.y + this.height / 2);
			const sx = last.w / this.width, sy = last.h / this.height;
			r.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
			r.style.opacity = '1';
		} else {
			r.style.transform = '';
			r.style.opacity = '0';
		}
		r.getBoundingClientRect();		// force layout
		r.style.transition = `transform ${this.anim2}s, opacity ${this.anim2}s`;
		r.style.transform = '';
		r.style.opacity = '1';
		this.lastScreen = { x: pos.x, y: pos.y, w: this.width, h: this.height };
	}

	setScale(scale, alpha, duration) {
		const s = this.scaleEl;
		s.style.transition = `transform ${duration}s, opacity ${duration}s`;
		s.style.transform = scale === 1 ? '' : `scale(${scale})`;
		s.style.opacity = String(alpha);
	}

	raise(on) {
		const cellEl = this.root.parentElement;
		if (cellEl)
			cellEl.style.zIndex = on ? '5' : '';
	}

	updateSelected(isSelected) {
		clearTimeout(this.scaleTimer);
		this.raise(isSelected);
		this.setScale(isSelected ? 1.7 : 1.0, isSelected ? 0.8 : 1.0, ANIM_DURATION);
		this.scaleTimer = setTimeout(() => {
			const sel = this.model.isSelected;
			this.setScale(sel ? 1.4 : 1.0, sel ? 0.8 : 1.0, ANIM_DURATION);
			if (!sel)
				this.raise(false);
		}, ANIM_DURATION * 1000);
		const pos = stagePos(this.root);
		this.lastScreen = { x: pos.x, y: pos.y, w: this.width, h: this.height };
	}

	hinted(last) {
		clearTimeout(this.scaleTimer);
		this.raise(true);
		this.setScale(1.7, 0.8, ANIM_DURATION);
		this.scaleTimer = setTimeout(() => {
			const sel = this.model.isSelected;
			this.setScale(sel ? 1.4 : 1.0, sel ? 0.8 : 1.0, ANIM_DURATION);
			this.scaleTimer = setTimeout(() => {
				if (!this.model.isSelected)
					this.raise(false);
				if (last)
					this.hinted(false);
			}, ANIM_DURATION * 1000);
		}, ANIM_DURATION * 1000);
	}

	examine() {
		const c = this.contentEl;
		c.style.transition = `transform ${ANIM_DURATION}s, opacity ${ANIM_DURATION}s`;
		c.style.transform = 'scale(2)';
		this.raise(true);
		setTimeout(() => {
			c.style.transform = '';
			setTimeout(() => { if (!this.model.isSelected) this.raise(false); }, ANIM_DURATION * 1000);
		}, ANIM_DURATION * 1000);
	}

	eliminate() {
		clearTimeout(this.scaleTimer);
		const r = this.root;
		const stage = r.closest('.stage');
		if (!stage || !r.isConnected) {
			r.remove();
			return;
		}
		const fx = stage.querySelector('.fx-layer');
		const pos = stagePos(r);
		r.style.transition = 'none';
		r.style.transform = '';
		r.style.left = pos.x + 'px';
		r.style.top = pos.y + 'px';
		fx.appendChild(r);
		const W = stage.clientWidth, H = stage.clientHeight;
		const tx = (randInt(2) ? W : 0) - pos.x - this.width / 2;
		const ty = (randInt(2) ? H : 0) - pos.y - this.height / 2;
		r.getBoundingClientRect();
		r.style.transition = `transform ${this.anim4}s ease-in-out, opacity ${this.anim4}s`;
		r.style.transform = `translate(${tx}px, ${ty}px) scale(2)`;
		r.style.opacity = '0.25';
		setTimeout(() => r.remove(), this.anim4 * 1000 + 50);
	}

	click() {
		if (!this.model._disabled)
			this.model.clicked();
		else
			this.model.disabledClicked();
	}
}
