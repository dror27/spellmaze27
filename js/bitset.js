// SpellMaze - bitset based word sets (replaces the CSet sorted-integer-set library of the original)

export class Bitset {
	constructor(size, words) {
		this.size = size;
		this.words = words || new Uint32Array((size + 31) >>> 5);
		this.version = 0;
	}
	static full(size) {
		const b = new Bitset(size);
		b.words.fill(0xFFFFFFFF);
		const extra = (b.words.length << 5) - size;
		if (extra > 0 && b.words.length)
			b.words[b.words.length - 1] = 0xFFFFFFFF >>> extra;
		return b;
	}
	clone() {
		const b = new Bitset(this.size, new Uint32Array(this.words));
		return b;
	}
	add(i) {
		if (i < 0 || i >= this.size)
			return;
		const w = i >>> 5, m = 1 << (i & 31);
		if (!(this.words[w] & m)) {
			this.words[w] |= m;
			this.version++;
		}
	}
	remove(i) {
		if (i < 0 || i >= this.size)
			return;
		const w = i >>> 5, m = 1 << (i & 31);
		if (this.words[w] & m) {
			this.words[w] &= ~m;
			this.version++;
		}
	}
	has(i) {
		if (i < 0 || i >= this.size)
			return false;
		return (this.words[i >>> 5] & (1 << (i & 31))) !== 0;
	}
	clear() {
		this.words.fill(0);
		this.version++;
	}
	orWith(other) {
		const a = this.words, b = other.words, n = Math.min(a.length, b.length);
		for (let i = 0; i < n; i++)
			a[i] |= b[i];
		this.version++;
		return this;
	}
	andWith(other) {
		const a = this.words, b = other.words, n = Math.min(a.length, b.length);
		for (let i = 0; i < n; i++)
			a[i] &= b[i];
		for (let i = n; i < a.length; i++)
			a[i] = 0;
		this.version++;
		return this;
	}
	andNotWith(other) {
		const a = this.words, b = other.words, n = Math.min(a.length, b.length);
		for (let i = 0; i < n; i++)
			a[i] &= ~b[i];
		this.version++;
		return this;
	}
	count() {
		let c = 0;
		const a = this.words;
		for (let i = 0; i < a.length; i++) {
			let v = a[i];
			v = v - ((v >>> 1) & 0x55555555);
			v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
			c += (((v + (v >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
		}
		return c;
	}
	toArray() {
		const out = [];
		const a = this.words;
		for (let i = 0; i < a.length; i++) {
			let v = a[i];
			while (v) {
				const t = v & -v;
				const bit = 31 - Math.clz32(t);
				out.push((i << 5) + bit);
				v ^= t;
			}
		}
		return out;
	}
}

// an immutable, sorted list of word indices (what the original code calls a word set / CSetWrapper)
export class WordSet {
	constructor(elems) {
		this.elems = elems || [];
	}
	get size() {
		return this.elems.length;
	}
	static fromBitset(b) {
		return new WordSet(b.toArray());
	}
	static union(sets) {
		const s = new Set();
		for (const ws of sets)
			for (const e of ws.elems)
				s.add(e);
		return new WordSet([...s].sort((a, b) => a - b));
	}
	static intersect(sets) {
		if (!sets.length)
			return new WordSet([]);
		let cur = new Set(sets[0].elems);
		for (let i = 1; i < sets.length; i++) {
			const other = new Set(sets[i].elems);
			cur = new Set([...cur].filter(e => other.has(e)));
		}
		return new WordSet([...cur].sort((a, b) => a - b));
	}
}
