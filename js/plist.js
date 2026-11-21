// SpellMaze - Apple property list parser (XML and binary 'bplist00' formats) and XML writer

const textDecoder = new TextDecoder('utf-8');

export function parsePlist(data) {
	let bytes = null;
	if (typeof data === 'string') {
		return parseXmlPlist(data);
	}
	if (data instanceof ArrayBuffer)
		bytes = new Uint8Array(data);
	else
		bytes = data;
	if (bytes.length >= 8 && textDecoder.decode(bytes.subarray(0, 6)) === 'bplist')
		return parseBinaryPlist(bytes);
	return parseXmlPlist(textDecoder.decode(bytes));
}

// ---------------------------------------------------------------- XML

function parseXmlPlist(text) {
	// strip a leading BOM
	if (text.charCodeAt(0) === 0xFEFF)
		text = text.slice(1);
	const doc = new DOMParser().parseFromString(text, 'application/xml');
	const err = doc.getElementsByTagName('parsererror');
	if (err.length) {
		// be lenient: try to repair unescaped ampersands, which are common in hand edited files
		const repaired = text.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
		if (repaired !== text)
			return parseXmlPlist(repaired);
		throw new Error('plist XML parse error: ' + err[0].textContent);
	}
	const root = doc.documentElement;
	let node = root.tagName === 'plist' ? firstElementChild(root) : root;
	if (!node)
		return {};
	return xmlValue(node);
}

function firstElementChild(n) {
	for (let c = n.firstChild; c; c = c.nextSibling)
		if (c.nodeType === 1)
			return c;
	return null;
}

function xmlValue(node) {
	switch (node.tagName) {
		case 'dict': {
			const obj = {};
			let key = null;
			for (let c = node.firstChild; c; c = c.nextSibling) {
				if (c.nodeType !== 1)
					continue;
				if (c.tagName === 'key')
					key = c.textContent;
				else if (key !== null) {
					obj[key] = xmlValue(c);
					key = null;
				}
			}
			return obj;
		}
		case 'array': {
			const arr = [];
			for (let c = node.firstChild; c; c = c.nextSibling)
				if (c.nodeType === 1)
					arr.push(xmlValue(c));
			return arr;
		}
		case 'string':
			return node.textContent;
		case 'integer':
			return parseInt(node.textContent.trim(), 10) || 0;
		case 'real':
			return parseFloat(node.textContent.trim()) || 0;
		case 'true':
			return true;
		case 'false':
			return false;
		case 'date':
			return new Date(node.textContent.trim());
		case 'data': {
			const b64 = node.textContent.replace(/\s+/g, '');
			const bin = atob(b64);
			const u = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i++)
				u[i] = bin.charCodeAt(i);
			return u;
		}
		default:
			return node.textContent;
	}
}

// ---------------------------------------------------------------- binary

function parseBinaryPlist(bytes) {
	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const trailer = bytes.length - 32;
	const offsetSize = dv.getUint8(trailer + 6);
	const refSize = dv.getUint8(trailer + 7);
	const numObjects = readUInt(dv, trailer + 8, 8);
	const topObject = readUInt(dv, trailer + 16, 8);
	const offsetTableOffset = readUInt(dv, trailer + 24, 8);
	const offsets = new Array(numObjects);
	for (let i = 0; i < numObjects; i++)
		offsets[i] = readUInt(dv, offsetTableOffset + i * offsetSize, offsetSize);

	function readLength(info, pos) {
		if (info !== 0xF)
			return { len: info, pos };
		const marker = dv.getUint8(pos);
		const sz = 1 << (marker & 0xF);
		return { len: readUInt(dv, pos + 1, sz), pos: pos + 1 + sz };
	}

	function readObject(ref) {
		let pos = offsets[ref];
		const marker = dv.getUint8(pos);
		const type = marker >> 4, info = marker & 0xF;
		pos++;
		switch (type) {
			case 0x0:
				return info === 0x9 ? true : (info === 0x8 ? false : null);
			case 0x1: {
				const sz = 1 << info;
				if (sz === 8)
					return Number(dv.getBigInt64(pos));
				return readUInt(dv, pos, sz);
			}
			case 0x2:
				return info === 2 ? dv.getFloat32(pos) : dv.getFloat64(pos);
			case 0x3:
				return new Date((978307200 + dv.getFloat64(pos)) * 1000);
			case 0x4: {
				const r = readLength(info, pos);
				return bytes.slice(r.pos, r.pos + r.len);
			}
			case 0x5: {
				const r = readLength(info, pos);
				let s = '';
				for (let i = 0; i < r.len; i++)
					s += String.fromCharCode(bytes[r.pos + i]);
				return s;
			}
			case 0x6: {
				const r = readLength(info, pos);
				let s = '';
				for (let i = 0; i < r.len; i++)
					s += String.fromCharCode(dv.getUint16(r.pos + i * 2));
				return s;
			}
			case 0x8:
				return readUInt(dv, pos, info + 1);
			case 0xA: {
				const r = readLength(info, pos);
				const arr = [];
				for (let i = 0; i < r.len; i++)
					arr.push(readObject(readUInt(dv, r.pos + i * refSize, refSize)));
				return arr;
			}
			case 0xD: {
				const r = readLength(info, pos);
				const obj = {};
				for (let i = 0; i < r.len; i++) {
					const k = readObject(readUInt(dv, r.pos + i * refSize, refSize));
					const v = readObject(readUInt(dv, r.pos + (r.len + i) * refSize, refSize));
					obj[k] = v;
				}
				return obj;
			}
			default:
				return null;
		}
	}
	return readObject(topObject);
}

function readUInt(dv, pos, size) {
	let v = 0;
	for (let i = 0; i < size; i++)
		v = v * 256 + dv.getUint8(pos + i);
	return v;
}

// ---------------------------------------------------------------- writer (used for exporting)

export function toXmlPlist(value) {
	const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
		'<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
		'<plist version="1.0">'];
	write(value, 0);
	lines.push('</plist>');
	return lines.join('\n') + '\n';

	function esc(s) {
		return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}
	function write(v, depth) {
		const ind = '\t'.repeat(depth);
		if (v === true)
			lines.push(ind + '<true/>');
		else if (v === false)
			lines.push(ind + '<false/>');
		else if (typeof v === 'number')
			lines.push(ind + (Number.isInteger(v) ? `<integer>${v}</integer>` : `<real>${v}</real>`));
		else if (typeof v === 'string')
			lines.push(ind + `<string>${esc(v)}</string>`);
		else if (Array.isArray(v)) {
			lines.push(ind + '<array>');
			for (const e of v)
				write(e, depth + 1);
			lines.push(ind + '</array>');
		} else if (v && typeof v === 'object') {
			lines.push(ind + '<dict>');
			for (const k of Object.keys(v)) {
				if (v[k] === undefined || v[k] === null)
					continue;
				lines.push(ind + '\t' + `<key>${esc(k)}</key>`);
				write(v[k], depth + 1);
			}
			lines.push(ind + '</dict>');
		}
	}
}
