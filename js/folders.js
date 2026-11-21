// SpellMaze - virtual file system over the original data layouts.
//
// The original app kept its content as UUID folders under domain folders:
//     <Root>/<Domain>/<UUID>/props.plist (+ words.txt, images/..., etc.)
// where Domain is one of Ontologies, Games, Levels, Brands, Catalogs.
// Content was distributed as zip files holding a single <UUID>/ folder.
//
// This module supports both:
//   - folder roots (e.g. data/Builtin/<PROGRAM_UUID>), described by a files.txt listing
//   - zip files, either in the <UUID>/... layout (domain detected or given) or in the <Domain>/<UUID>/... layout
//   - zip files imported by the user (persisted in IndexedDB)

import { parsePlist } from './plist.js';
import { readZip } from './zip.js';
import { isUUID } from './util.js';

export const DF_LANGUAGES = 'Ontologies';
export const DF_LEVELS = 'Levels';
export const DF_GAMES = 'Games';
export const DF_BRANDS = 'Brands';
export const DF_CATALOGS = 'Catalogs';
export const DOMAINS = [DF_LANGUAGES, DF_LEVELS, DF_GAMES, DF_BRANDS, DF_CATALOGS];

const utf8 = new TextDecoder('utf-8');

const MIME = {
	jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
	mp3: 'audio/mpeg', wav: 'audio/wav', aif: 'audio/aiff', aiff: 'audio/aiff', m4a: 'audio/mp4', caf: 'audio/x-caf',
	txt: 'text/plain', plist: 'application/xml', svg: 'image/svg+xml'
};

function mimeOf(path) {
	const ext = path.split('.').pop().toLowerCase();
	return MIME[ext] || 'application/octet-stream';
}

function joinPath(a, b) {
	if (!a)
		return b;
	if (!b)
		return a;
	return a.replace(/\/+$/, '') + '/' + b.replace(/^\/+/, '');
}

function normalizePath(p) {
	const out = [];
	for (const c of p.split('/')) {
		if (!c || c === '.')
			continue;
		if (c === '..')
			out.pop();
		else
			out.push(c);
	}
	return out.join('/');
}

// ---------------------------------------------------------------- sources

class FolderSource {
	constructor(name, baseUrl, files) {
		this.name = name;
		this.baseUrl = baseUrl.replace(/\/+$/, '') + '/';
		this.files = new Set(files.map(normalizePath));
		this.kind = 'folder';
	}
	has(path) {
		return this.files.has(normalizePath(path));
	}
	list() {
		return [...this.files];
	}
	url(path) {
		path = normalizePath(path);
		if (!this.files.has(path))
			return null;
		return this.baseUrl + path.split('/').map(encodeURIComponent).join('/');
	}
	async bytes(path) {
		const url = this.url(path);
		if (!url)
			return null;
		const resp = await fetch(url);
		if (!resp.ok)
			return null;
		return new Uint8Array(await resp.arrayBuffer());
	}
	async text(path) {
		const b = await this.bytes(path);
		return b ? utf8.decode(b) : null;
	}
}

class ZipSource {
	constructor(name, entries) {
		this.name = name;
		this.entries = new Map();
		for (const [k, v] of entries)
			this.entries.set(normalizePath(k), v);
		this.urls = new Map();
		this.kind = 'zip';
	}
	has(path) {
		return this.entries.has(normalizePath(path));
	}
	list() {
		return [...this.entries.keys()];
	}
	url(path) {
		path = normalizePath(path);
		if (this.urls.has(path))
			return this.urls.get(path);
		const data = this.entries.get(path);
		if (!data)
			return null;
		const url = URL.createObjectURL(new Blob([data], { type: mimeOf(path) }));
		this.urls.set(path, url);
		return url;
	}
	async bytes(path) {
		return this.entries.get(normalizePath(path)) || null;
	}
	async text(path) {
		const b = this.entries.get(normalizePath(path));
		return b ? utf8.decode(b) : null;
	}
	release() {
		for (const u of this.urls.values())
			URL.revokeObjectURL(u);
		this.urls.clear();
	}
}

// ---------------------------------------------------------------- items

export class FolderItem {
	constructor(domain, uuid, source, base, props, origin, priority) {
		this.domain = domain;
		this.uuid = uuid;
		this.source = source;
		this.base = base;			// path prefix of the item's folder within its source (ends without '/')
		this.props = props || {};
		this.origin = origin;		// 'builtin' | 'manifest' | 'imported'
		this.priority = priority;
	}
	path(rel) {
		return normalizePath(joinPath(this.base, rel));
	}
	has(rel) {
		return this.source.has(this.path(rel));
	}
	url(rel) {
		if (!rel)
			return null;
		return this.source.url(this.path(rel));
	}
	async text(rel) {
		return this.source.text(this.path(rel));
	}
	async bytes(rel) {
		return this.source.bytes(this.path(rel));
	}
	// list relative paths below a sub folder of this item
	list(prefix) {
		const full = this.path(prefix || '') + '/';
		const out = [];
		for (const p of this.source.list())
			if (p.startsWith(full))
				out.push(p.slice(this.base ? this.base.length + 1 : 0));
		return out;
	}
	hasFolder(prefix) {
		const full = this.path(prefix) + '/';
		for (const p of this.source.list())
			if (p.startsWith(full))
				return true;
		return false;
	}
	get name() {
		return this.props.name || this.uuid;
	}
}

// ---------------------------------------------------------------- registry

function detectDomain(source, base, props) {
	if (source.has(joinPath(base, 'words.txt')))
		return DF_LANGUAGES;
	if (!props)
		return null;
	if (Array.isArray(props.levels))
		return DF_GAMES;
	if (props.global && typeof props.global === 'object')
		return DF_BRANDS;
	if (props.items && typeof props.items === 'object' && !Array.isArray(props.items))
		return DF_CATALOGS;
	if (props['prefs-data'])
		return DF_LEVELS;
	if (props['game-props'] || props['tutorial-words'])
		return DF_LANGUAGES;
	return null;
}

class FoldersRegistry {
	constructor() {
		this.items = [];			// all registered items
		this.sources = [];
		this.nextPriority = 1;
		this.errors = [];
		this.listeners = new Set();
		this.moreSites = [];
		this.scoresUrl = null;
	}

	onChange(fn) {
		this.listeners.add(fn);
	}

	fireChange() {
		for (const fn of this.listeners)
			try { fn(); } catch (e) { console.error(e); }
	}

	// scan a source for <Domain>/<UUID>/ and <UUID>/ folders and register items
	async registerSource(source, origin, forcedDomain, priority) {
		const roots = new Map();		// base -> domain (or null for detection)
		for (const p of source.list()) {
			const comps = p.split('/');
			for (let i = 0; i < comps.length - 1; i++) {
				if (!isUUID(comps[i]))
					continue;
				const base = comps.slice(0, i + 1).join('/');
				if (roots.has(base))
					break;
				const parent = i > 0 ? comps[i - 1] : null;
				if (parent && DOMAINS.includes(parent))
					roots.set(base, parent);
				else if (i === 0 || (parent && !isUUID(parent)))
					roots.set(base, forcedDomain || null);
				break;
			}
		}
		// nested items (e.g. Games/<uuid>/Levels/<uuid>) are registered too (they are found by the loop above
		// only for their first UUID component, so do a second pass for nested domain folders)
		for (const p of source.list()) {
			const comps = p.split('/');
			for (let i = 1; i < comps.length - 1; i++) {
				if (isUUID(comps[i]) && DOMAINS.includes(comps[i - 1])) {
					const base = comps.slice(0, i + 1).join('/');
					if (!roots.has(base))
						roots.set(base, comps[i - 1]);
				}
			}
		}
		// a zip holding a single item's files at its root (no <UUID>/ folder): use the props' uuid or the file name
		if (!roots.size && source.has('props.plist')) {
			let uuid = null;
			try {
				const props = parsePlist(await source.bytes('props.plist'));
				uuid = props && isUUID(props.uuid) ? props.uuid : null;
			} catch (e) { }
			const stem = String(source.name || '').split('/').pop().replace(/\.zip$/i, '');
			if (!uuid && isUUID(stem))
				uuid = stem;
			if (uuid)
				roots.set('', forcedDomain || null);
			source.rootUUID = uuid;
		}
		const loaded = [];
		await Promise.all([...roots.entries()].map(async ([base, domain]) => {
			let props = null;
			const propsPath = joinPath(base, 'props.plist');
			if (source.has(propsPath)) {
				try {
					const bytes = await source.bytes(propsPath);
					props = parsePlist(bytes);
				} catch (e) {
					console.error('failed parsing', source.name, propsPath, e);
					this.errors.push(`${source.name}: ${propsPath}: ${e.message}`);
				}
			}
			if (!domain)
				domain = detectDomain(source, base, props);
			if (!domain)
				return;
			if (!props && domain !== DF_LANGUAGES)
				return;
			const uuid = (base === '' ? source.rootUUID : base.split('/').pop()).toUpperCase();
			const item = new FolderItem(domain, uuid, source, base, props || {}, origin, priority);
			const comps = base.split('/');
			item.nested = comps.length >= 4 && isUUID(comps[comps.length - 3]) ? comps[comps.length - 3].toUpperCase() : null;
			loaded.push(item);
		}));
		this.items.push(...loaded);
		this.items.sort((a, b) => b.priority - a.priority);
		return loaded;
	}

	async addFolderRoot(url, name) {
		const listUrl = joinPath(url, 'files.txt');
		const resp = await fetch(listUrl);
		if (!resp.ok)
			throw new Error(`cannot read ${listUrl} (run tools/make_filelist.sh)`);
		const files = (await resp.text()).split(/\r?\n/).map(s => s.trim().replace(/^\.\//, '')).filter(s => s && !s.startsWith('#') && s !== 'files.txt');
		const source = new FolderSource(name || url, url, files);
		this.sources.push(source);
		return this.registerSource(source, 'builtin', null, this.nextPriority++);
	}

	async addZip(buffer, name, origin = 'manifest', forcedDomain = null) {
		const entries = await readZip(buffer);
		const source = new ZipSource(name, entries);
		this.sources.push(source);
		const items = await this.registerSource(source, origin, forcedDomain, origin === 'imported' ? 1000000 + this.nextPriority++ : this.nextPriority++);
		if (!items.length)
			this.errors.push(`${name}: no SpellMaze content found in zip`);
		return items;
	}

	// an in-memory item (e.g. the player's own word list): files maps relative paths to text or bytes
	async addMemorySource(name, files, origin, domain, priority) {
		const enc = new TextEncoder();
		const entries = new Map();
		for (const [path, data] of Object.entries(files))
			entries.set(path, typeof data === 'string' ? enc.encode(data) : data);
		this.removeSource(name);
		const source = new ZipSource(name, entries);
		this.sources.push(source);
		return this.registerSource(source, origin, domain, priority || this.nextPriority++);
	}

	removeSource(name) {
		const src = this.sources.find(s => s.name === name);
		if (!src)
			return;
		this.items = this.items.filter(i => i.source !== src);
		this.sources = this.sources.filter(s => s !== src);
		if (src.release)
			src.release();
	}

	// manifest: one entry per line, '#' comments.
	//   <folder>                     a folder root containing <Domain>/<UUID>/... and a files.txt listing
	//   <file>.zip                   a zip file (domain auto detected)
	//   <Domain>:<file>.zip          a zip file whose <UUID>/ folders belong to the given domain
	async loadManifest(manifestUrl) {
		const resp = await fetch(manifestUrl, { cache: 'no-cache' });
		if (!resp.ok)
			throw new Error(`cannot read manifest ${manifestUrl}`);
		const baseUrl = manifestUrl.replace(/[^/]*$/, '');
		const lines = (await resp.text()).split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
		for (const line of lines) {
			try {
				let domain = null, path = line;
				const m = /^([A-Za-z]+):(.+)$/.exec(line);
				if (m && m[1].toLowerCase() === 'scores') {
					// the shared score board server (scores-server/)
					const u = m[2].trim();
					this.scoresUrl = /^[a-z]+:\/\//i.test(u) ? u : new URL(u, new URL(baseUrl, location.href)).href;
					continue;
				}
				if (m && m[1].toLowerCase() === 'more') {
					// a catalog site ("SpellMaze More"): <url>/<domain>/directory.plist
					const site = m[2].trim();
					this.moreSites.push(/^[a-z]+:\/\//i.test(site) ? site : new URL(site, new URL(baseUrl, location.href)).href);
					continue;
				}
				if (m && DOMAINS.includes(m[1])) {
					domain = m[1];
					path = m[2].trim();
				}
				const url = /^[a-z]+:\/\//i.test(path) ? path : baseUrl + path;
				if (/\.zip$/i.test(path)) {
					const r = await fetch(url);
					if (!r.ok)
						throw new Error(`HTTP ${r.status}`);
					await this.addZip(await r.arrayBuffer(), path, 'manifest', domain);
				} else
					await this.addFolderRoot(url, path);
			} catch (e) {
				console.error('manifest entry failed', line, e);
				this.errors.push(`${line}: ${e.message}`);
			}
		}
	}

	// find the highest priority item of a domain with a uuid. When a game item is given, levels nested
	// within the game's folder are preferred (FolderRoleCurrentGame)
	find(domain, uuid, gameUUID) {
		if (!uuid)
			return null;
		uuid = String(uuid).toUpperCase();
		if (gameUUID) {
			const g = String(gameUUID).toUpperCase();
			const nested = this.items.find(i => i.domain === domain && i.uuid === uuid && i.nested === g);
			if (nested)
				return nested;
		}
		return this.items.find(i => i.domain === domain && i.uuid === uuid && !i.nested) ||
			this.items.find(i => i.domain === domain && i.uuid === uuid) || null;
	}

	list(domain) {
		const seen = new Set();
		const out = [];
		for (const i of this.items) {
			if (i.domain !== domain || i.nested || seen.has(i.uuid))
				continue;
			seen.add(i.uuid);
			out.push(i);
		}
		return out;
	}
}

export const Folders = new FoldersRegistry();

// ---------------------------------------------------------------- IndexedDB store for user imported zips

const DB_NAME = 'spellmaze';
const STORE = 'zips';

function openDB() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'name' });
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export const ZipStore = {
	async list() {
		try {
			const db = await openDB();
			return await new Promise((resolve, reject) => {
				const tx = db.transaction(STORE, 'readonly');
				const req = tx.objectStore(STORE).getAll();
				req.onsuccess = () => resolve(req.result || []);
				req.onerror = () => reject(req.error);
			});
		} catch (e) {
			console.warn('IndexedDB unavailable', e);
			return [];
		}
	},
	async save(name, data, meta) {
		const db = await openDB();
		await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite');
			tx.objectStore(STORE).put({ name, data, added: Date.now(), meta: meta || null });
			tx.oncomplete = resolve;
			tx.onerror = () => reject(tx.error);
		});
	},
	async remove(name) {
		const db = await openDB();
		await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite');
			tx.objectStore(STORE).delete(name);
			tx.oncomplete = resolve;
			tx.onerror = () => reject(tx.error);
		});
	}
};

export async function loadImportedZips() {
	for (const rec of await ZipStore.list()) {
		try {
			await Folders.addZip(rec.data, rec.name, 'imported', rec.meta && rec.meta.domain ? rec.meta.domain : null);
		} catch (e) {
			console.error('failed loading imported zip', rec.name, e);
			Folders.errors.push(`${rec.name}: ${e.message}`);
		}
	}
}
