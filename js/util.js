// SpellMaze - general utilities

export function randInt(n) {
	return n > 0 ? Math.floor(Math.random() * n) : 0;
}

export function randomElement(arr) {
	return arr.length ? arr[randInt(arr.length)] : undefined;
}

export function shuffle(arr) {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = randInt(i + 1);
		const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
	}
	return arr;
}

export function clamp(v, lo, hi) {
	return v < lo ? lo : (v > hi ? hi : v);
}

export function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatNumber(n) {
	const neg = n < 0;
	let s = String(Math.abs(Math.round(n)));
	let out = '';
	while (s.length > 3) {
		out = ',' + s.slice(-3) + out;
		s = s.slice(0, -3);
	}
	return (neg ? '-' : '') + s + out;
}

export function nowSecs() {
	return Math.floor(Date.now() / 1000);
}

export function createUUID() {
	if (crypto && crypto.randomUUID)
		return crypto.randomUUID().toUpperCase();
	const h = '0123456789ABCDEF';
	let s = '';
	for (let i = 0; i < 36; i++)
		s += (i === 8 || i === 13 || i === 18 || i === 23) ? '-' : h[randInt(16)];
	return s;
}

export function isUUID(s) {
	return typeof s === 'string' && /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(s);
}

// path based access into nested dictionaries (like NSDictionary(TypedAccess) leafDictionaryForKey)
export function leafLookup(dict, key) {
	if (!dict || key === undefined || key === null)
		return { dict: null, leaf: key };
	const comps = String(key).split('/').filter(c => c.length);
	if (!comps.length)
		return { dict, leaf: key };
	let d = dict;
	while (comps.length > 1) {
		d = (d && typeof d === 'object') ? d[comps[0]] : undefined;
		comps.shift();
	}
	return { dict: (d && typeof d === 'object') ? d : null, leaf: comps[0] };
}

export function dictHas(dict, key) {
	const { dict: d, leaf } = leafLookup(dict, key);
	return !!d && Object.prototype.hasOwnProperty.call(d, leaf) && d[leaf] !== undefined && d[leaf] !== null;
}

export function dictGet(dict, key, def) {
	const { dict: d, leaf } = leafLookup(dict, key);
	if (d && Object.prototype.hasOwnProperty.call(d, leaf) && d[leaf] !== undefined && d[leaf] !== null)
		return d[leaf];
	return def;
}

export function toBool(v, def = false) {
	if (v === undefined || v === null)
		return def;
	if (typeof v === 'boolean')
		return v;
	if (typeof v === 'number')
		return v !== 0;
	if (typeof v === 'string') {
		const s = v.trim().toLowerCase();
		if (s === 'yes' || s === 'true' || s === 'y' || s === 't')
			return true;
		const n = parseFloat(s);
		return !isNaN(n) && n !== 0;
	}
	return !!v;
}

export function toInt(v, def = 0) {
	if (v === undefined || v === null)
		return def;
	if (typeof v === 'boolean')
		return v ? 1 : 0;
	const n = parseInt(v, 10);
	return isNaN(n) ? (typeof v === 'number' ? Math.trunc(v) : def) : n;
}

export function toFloat(v, def = 0) {
	if (v === undefined || v === null)
		return def;
	if (typeof v === 'boolean')
		return v ? 1 : 0;
	const n = parseFloat(v);
	return isNaN(n) ? def : n;
}

export function deepCopy(v) {
	if (v === null || typeof v !== 'object')
		return v;
	if (v instanceof Uint8Array || v instanceof Date)
		return v;
	if (Array.isArray(v))
		return v.map(deepCopy);
	const o = {};
	for (const k of Object.keys(v))
		o[k] = deepCopy(v[k]);
	return o;
}

// a set of timers that can be cancelled all at once (used per game level, like NSObject cancelPreviousPerformRequests)
export class TimerGroup {
	constructor() {
		this.timeouts = new Set();
		this.intervals = new Set();
		this.dead = false;
	}
	after(secs, fn) {
		if (this.dead)
			return null;
		const id = setTimeout(() => {
			this.timeouts.delete(id);
			if (!this.dead)
				fn();
		}, Math.max(0, secs * 1000));
		this.timeouts.add(id);
		return id;
	}
	every(secs, fn) {
		if (this.dead)
			return null;
		const id = setInterval(() => { if (!this.dead) fn(); }, Math.max(1, secs * 1000));
		this.intervals.add(id);
		return id;
	}
	cancel(id) {
		if (id === null || id === undefined)
			return;
		if (this.timeouts.has(id)) {
			clearTimeout(id);
			this.timeouts.delete(id);
		}
		if (this.intervals.has(id)) {
			clearInterval(id);
			this.intervals.delete(id);
		}
	}
	clear() {
		for (const id of this.timeouts)
			clearTimeout(id);
		for (const id of this.intervals)
			clearInterval(id);
		this.timeouts.clear();
		this.intervals.clear();
	}
	kill() {
		this.clear();
		this.dead = true;
	}
}

export function el(tag, cls, parent, style) {
	const e = document.createElement(tag);
	if (cls)
		e.className = cls;
	if (style)
		Object.assign(e.style, style);
	if (parent)
		parent.appendChild(e);
	return e;
}

export function setFrame(e, x, y, w, h) {
	e.style.left = x + 'px';
	e.style.top = y + 'px';
	if (w !== undefined)
		e.style.width = w + 'px';
	if (h !== undefined)
		e.style.height = h + 'px';
}

// position of an element relative to the stage root (sum of offsets, ignoring transforms - like UIView frames)
export function stagePos(e) {
	let x = 0, y = 0;
	while (e && !e.classList.contains('stage')) {
		x += e.offsetLeft;
		y += e.offsetTop;
		e = e.offsetParent;
	}
	return { x, y };
}

export function escapeHtml(s) {
	return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
