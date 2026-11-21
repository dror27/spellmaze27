// SpellMaze - minimal zip archive reader (stored + deflate), using the browser's DecompressionStream

const utf8 = new TextDecoder('utf-8');

function decodeName(bytes, isUtf8) {
	if (isUtf8)
		return utf8.decode(bytes);
	// try utf8 first, fall back to latin1 (close enough to cp437 for file names we care about)
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch (e) {
		let s = '';
		for (const b of bytes)
			s += String.fromCharCode(b);
		return s;
	}
}

async function inflateRaw(data) {
	if (typeof DecompressionStream === 'undefined')
		throw new Error('This browser does not support DecompressionStream (needed to read zip files)');
	const ds = new DecompressionStream('deflate-raw');
	const stream = new Blob([data]).stream().pipeThrough(ds);
	const buf = await new Response(stream).arrayBuffer();
	return new Uint8Array(buf);
}

// returns Map<name, Uint8Array> of all (non junk) file entries
export async function readZip(buffer) {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	// locate end of central directory
	let eocd = -1;
	for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xFFFF); i--) {
		if (dv.getUint32(i, true) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0)
		throw new Error('not a zip file (no end of central directory)');
	const count = dv.getUint16(eocd + 10, true);
	let cdOffset = dv.getUint32(eocd + 16, true);

	const result = new Map();
	const pending = [];
	let p = cdOffset;
	for (let n = 0; n < count; n++) {
		if (dv.getUint32(p, true) !== 0x02014b50)
			throw new Error('corrupt zip central directory');
		const flags = dv.getUint16(p + 8, true);
		const method = dv.getUint16(p + 10, true);
		const compSize = dv.getUint32(p + 20, true);
		const nameLen = dv.getUint16(p + 28, true);
		const extraLen = dv.getUint16(p + 30, true);
		const commentLen = dv.getUint16(p + 32, true);
		const localOffset = dv.getUint32(p + 42, true);
		const name = decodeName(bytes.subarray(p + 46, p + 46 + nameLen), (flags & 0x800) !== 0);
		p += 46 + nameLen + extraLen + commentLen;

		if (name.endsWith('/'))
			continue;
		if (name.startsWith('__MACOSX/') || name.includes('/__MACOSX/'))
			continue;
		const base = name.split('/').pop();
		if (base === '.DS_Store' || base.startsWith('._'))
			continue;

		// local header
		const lnameLen = dv.getUint16(localOffset + 26, true);
		const lextraLen = dv.getUint16(localOffset + 28, true);
		const dataStart = localOffset + 30 + lnameLen + lextraLen;
		const raw = bytes.subarray(dataStart, dataStart + compSize);
		if (method === 0)
			result.set(name, raw.slice());
		else if (method === 8)
			pending.push(inflateRaw(raw).then(d => result.set(name, d)));
		else
			console.warn('zip: unsupported compression method', method, 'for', name);
	}
	await Promise.all(pending);
	return result;
}
