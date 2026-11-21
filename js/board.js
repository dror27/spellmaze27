// SpellMaze - boards and cells (port of GridBoard / CompoundBoard / Cell and their views)

import { BrandManager, parseColorSpec } from './brand.js';
import { el, setFrame, randInt } from './util.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export class Cell {
	constructor(board, x, y) {
		this.board = board;
		this.x = x;
		this.y = y;
		this.piece = null;
		this.el = null;			// full grid cell element (hit area)
		this.inner = null;		// inset element (CellView frame)
		this._highlight = false;
	}
	createView(rect, gridRect) {
		this.el = el('div', 'cell');
		setFrame(this.el, gridRect.x, gridRect.y, gridRect.w, gridRect.h);
		this.inner = el('div', 'cell-inner', this.el);
		setFrame(this.inner, rect.x - gridRect.x, rect.y - gridRect.y, rect.w, rect.h);
		this.rect = rect;
		this.el.addEventListener('pointerdown', ev => {
			ev.preventDefault();
			if (this.piece && this.piece.view)
				this.piece.view.click();
		});
		return this.el;
	}
	setPiece(piece) {
		if (this.piece) {
			const old = this.piece;
			old.cell = null;
			if (old.view && old.view.root.parentElement === this.inner)
				old.view.root.remove();
			this.piece = null;
		}
		if (piece) {
			this.piece = piece;
			piece.cell = this;
			if (this.inner) {
				const view = piece.viewWithFrame(this.rect.w, this.rect.h);
				view.root.style.left = '0px';
				view.root.style.top = '0px';
				const level = this.board ? this.board.level : null;
				view.fastAnimations = !!(level && level.fastGame);
				this.inner.appendChild(view.root);
				view.placed();
				view.raise(piece.isSelected);
			}
		}
	}
	abandonPiece() {
		this.piece = null;
	}
	get highlight() {
		return this._highlight;
	}
	setHighlight(h) {
		if (this._highlight === h)
			return;
		this._highlight = h;
		if (this.inner) {
			this.inner.style.transition = 'background-color 0.2s';
			this.inner.style.backgroundColor = h ? 'rgb(77,255,77)' : 'rgb(0,0,0)';
		}
	}
}

export class GridBoard {
	constructor(width, height) {
		this.width = width;
		this.height = height;
		this.cells = new Array(width * height).fill(null);
		this.piecesSelectable = true;
		this.gridColor = null;
		this.suggestedFrame = null;
		this._level = null;
		this.view = null;
	}
	get level() {
		return this._level;
	}
	set level(l) {
		this._level = l;
	}
	setPiecesSelectable(v) {
		this.piecesSelectable = v;
	}
	cellCount() {
		return this.width * this.height;
	}
	ensureCell(index) {
		index %= this.width * this.height;
		if (!this.cells[index]) {
			const cell = new Cell(this, index % this.width, Math.floor(index / this.width));
			this.cells[index] = cell;
			if (this.view)
				this.view.addCell(cell);
		}
		return this.cells[index];
	}
	cellAt(index) {
		index %= this.width * this.height;
		return this.cells[index];
	}
	cellAtXY(x, y) {
		x %= this.width;
		y %= this.height;
		return this.cells[y * this.width + x];
	}
	freeCellCount() {
		let count = 0;
		for (const c of this.cells)
			if (!c || !c.piece)
				count++;
		return count;
	}
	pieceAt(index) {
		index %= this.width * this.height;
		const c = this.cells[index];
		return c ? c.piece : null;
	}
	pieceAtXY(x, y) {
		return this.pieceAt((y % this.height) * this.width + (x % this.width));
	}
	placePiece(piece, index) {
		index %= this.width * this.height;
		const cell = this.ensureCell(index);
		const old = cell.piece;
		cell.setPiece(piece);
		return old;
	}
	placePieceXY(piece, x, y) {
		return this.placePiece(piece, (y % this.height) * this.width + (x % this.width));
	}
	randomFreeCellIndex() {
		const count = this.freeCellCount();
		if (!count)
			return -1;
		let randIndex = randInt(count);
		for (let index = 0; index < this.width * this.height; index++) {
			const c = this.cells[index];
			const empty = !c || !c.piece;
			if (!randIndex && empty)
				return index;
			if (empty)
				randIndex--;
		}
		return -1;
	}
	isEmpty() {
		return this.freeCellCount() === this.cellCount();
	}
	allPieces() {
		const out = [];
		for (const c of this.cells)
			if (c && c.piece)
				out.push(c.piece);
		return out;
	}
	allCells() {
		for (let i = 0; i < this.cells.length; i++)
			this.ensureCell(i);
		return this.cells.slice();
	}
	viewWithFrame(frame) {
		if (!this.view)
			this.view = new GridBoardView(this, frame);
		return this.view.root;
	}
}

export class GridBoardView {
	constructor(board, frame) {
		this.board = board;
		this.frame = frame;
		this.root = el('div', 'board');
		setFrame(this.root, frame.x, frame.y, frame.w, frame.h);
		this.cellWidth = (frame.w - 1) / board.width;
		this.cellHeight = (frame.h - 1) / board.height;
		this.cellMargin = BrandManager.currentBrand().globalInteger('skin/props/cell-margin', 4);
		this.drawGrid();
		for (const c of board.cells)
			if (c)
				this.addCell(c);
	}
	drawGrid() {
		const brand = BrandManager.currentBrand();
		const color = this.board.gridColor || brand.globalGridColor();
		const lw = brand.globalGridLineWidth();
		const svg = document.createElementNS(SVG_NS, 'svg');
		svg.setAttribute('class', 'grid');
		svg.setAttribute('width', this.frame.w);
		svg.setAttribute('height', this.frame.h);
		const rows = this.board.height, cols = this.board.width;
		const add = (x1, y1, x2, y2) => {
			const l = document.createElementNS(SVG_NS, 'line');
			l.setAttribute('x1', x1);
			l.setAttribute('y1', y1);
			l.setAttribute('x2', x2);
			l.setAttribute('y2', y2);
			l.setAttribute('stroke', color);
			l.setAttribute('stroke-width', lw);
			svg.appendChild(l);
		};
		for (let row = 0; row <= rows; row++)
			add(0.5, row * this.cellHeight + 0.5, cols * this.cellWidth + 0.5, row * this.cellHeight + 0.5);
		for (let col = 0; col <= cols; col++)
			add(col * this.cellWidth + 0.5, 0.5, col * this.cellWidth + 0.5, rows * this.cellHeight + 0.5);
		if (this.svg)
			this.svg.replaceWith(svg);
		else
			this.root.appendChild(svg);
		this.svg = svg;
	}
	cellRectAt(x, y) {
		const m = this.cellMargin;
		return {
			x: x * this.cellWidth + m + 1.0,
			y: y * this.cellHeight + m + 1.0,
			w: this.cellWidth - m * 2,
			h: this.cellHeight - m * 2
		};
	}
	addCell(cell) {
		const rect = this.cellRectAt(cell.x, cell.y);
		const grid = { x: cell.x * this.cellWidth, y: cell.y * this.cellHeight, w: this.cellWidth + 1, h: this.cellHeight + 1 };
		this.root.appendChild(cell.createView(rect, grid));
		if (cell.piece) {
			const p = cell.piece;
			cell.piece = null;
			cell.setPiece(p);
		}
	}
}

// ---------------------------------------------------------------- compound boards (board formulas)

export class CompoundBoard {
	constructor() {
		this.boards = [];		// {board, frame, size}
		this._level = null;
		this.view = null;
		this.suggestedFrame = null;
	}
	addBoard(board, frame) {
		this.boards.push({ board, frame, size: board.cellCount() });
	}
	get level() {
		return this._level;
	}
	set level(l) {
		this._level = l;
		for (const e of this.boards)
			e.board.level = l;
	}
	get piecesSelectable() {
		return this.boards.length ? this.boards[0].board.piecesSelectable : false;
	}
	setPiecesSelectable(v) {
		if (this.boards.length)
			this.boards[0].board.setPiecesSelectable(v);
	}
	cellCount() {
		return this.boards.reduce((s, e) => s + e.size, 0);
	}
	freeCellCount() {
		return this.boards.reduce((s, e) => s + e.board.freeCellCount(), 0);
	}
	isEmpty() {
		return this.boards.every(e => e.board.isEmpty());
	}
	locate(index) {
		for (const e of this.boards) {
			if (index < e.size)
				return { e, index };
			index -= e.size;
		}
		return null;
	}
	cellAt(index) {
		const l = this.locate(index);
		return l ? l.e.board.cellAt(l.index) : null;
	}
	ensureCell(index) {
		const l = this.locate(index);
		return l ? l.e.board.ensureCell(l.index) : null;
	}
	allCells() {
		return this.boards.flatMap(e => e.board.allCells());
	}
	pieceAt(index) {
		const l = this.locate(index);
		return l ? l.e.board.pieceAt(l.index) : null;
	}
	allPieces() {
		return this.boards.flatMap(e => e.board.allPieces());
	}
	placePiece(piece, index) {
		const l = this.locate(index);
		return l ? l.e.board.placePiece(piece, l.index) : null;
	}
	randomFreeCellIndex() {
		const count = this.boards.length;
		if (!count)
			return -1;
		const ofs = randInt(count);
		for (let i = 0; i < count; i++) {
			const bi = (i + ofs) % count;
			const e = this.boards[bi];
			if (e.board.freeCellCount() > 0) {
				let base = 0;
				for (let j = 0; j < bi; j++)
					base += this.boards[j].size;
				return base + e.board.randomFreeCellIndex();
			}
		}
		return -1;
	}
	viewWithFrame(frame) {
		if (!this.view) {
			const root = el('div', 'board compound');
			setFrame(root, frame.x, frame.y, frame.w, frame.h);
			for (const e of this.boards)
				root.appendChild(e.board.viewWithFrame(e.frame));
			this.view = { root, frame };
		}
		return this.view.root;
	}
}

// board formula: one component per line, "x y width height columns rows [gridColor]",
// in 60-unit cell coordinates (scaled by 48/60 as in the original)
export function boardByFormula(formula) {
	const comps = String(formula || '').split('\n').map(s => s.trim()).filter(s => s.length && s.charAt(0) !== '#');
	if (!comps.length)
		return null;
	if (comps.length === 1)
		return boardByComponent(comps[0]);
	const board = new CompoundBoard();
	for (const comp of comps) {
		const sub = boardByComponent(comp);
		board.addBoard(sub, sub.suggestedFrame);
	}
	return board;
}

function boardByComponent(comp) {
	let x = 0, y = 0, width = 60, height = 60, cols = 6, rows = 6, gridColor = null;
	const toks = comp.split(/\s+/);
	toks.forEach((tok, i) => {
		switch (i) {
			case 0: x = parseFloat(tok) || 0; break;
			case 1: y = parseFloat(tok) || 0; break;
			case 2: width = parseFloat(tok) || 0; break;
			case 3: height = parseFloat(tok) || 0; break;
			case 4: cols = parseInt(tok, 10) || 1; break;
			case 5: rows = parseInt(tok, 10) || 1; break;
			case 6: gridColor = parseColorSpec(tok); break;
		}
	});
	const factor = 48.0 / 60.0;
	x *= factor;
	y *= factor;
	width *= factor;
	height *= factor;
	const board = new GridBoard(cols, rows);
	board.gridColor = gridColor;
	board.suggestedFrame = { x, y, w: Math.round(width * cols + 1), h: Math.round(height * rows + 1) };
	return board;
}
