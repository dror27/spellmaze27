// SpellMaze - brands (skins). Port of Brand / BrandManager

import { Folders, DF_BRANDS } from './folders.js';
import { UserPrefs, PK_BRAND } from './prefs.js';
import { dictGet, toBool, toInt, toFloat } from './util.js';

export const BM_DEFAULT_BRAND = '86D1C949-9B24-C931-E5B5-BBAF94B06901';

export function parseColorSpec(text) {
	if (text === undefined || text === null)
		return null;
	text = String(text).trim();
	const comps = text.split(',');
	if (comps.length >= 3) {
		const f = [1, 1, 1, 1];
		comps.slice(0, 4).forEach((c, i) => f[i] = parseFloat(c) || 0);
		return `rgba(${Math.round(f[0] * 255)},${Math.round(f[1] * 255)},${Math.round(f[2] * 255)},${f[3]})`;
	}
	if (comps.length === 1 && (text.length === 6 || text.length === 8) && /^[0-9a-fA-F]+$/.test(text)) {
		const i = [255, 255, 255, 255];
		for (let n = 0; n < text.length / 2; n++)
			i[n] = parseInt(text.substr(n * 2, 2), 16);
		return `rgba(${i[0]},${i[1]},${i[2]},${i[3] / 255})`;
	}
	// named colors (as in CompoundBoard colorBySpec: "<name>Color")
	if (/^[a-zA-Z]+$/.test(text))
		return text === 'clear' ? 'transparent' : text;
	return null;
}

export class Brand {
	constructor(uuid) {
		let item = Folders.find(DF_BRANDS, uuid);
		if (!item && uuid !== BM_DEFAULT_BRAND) {
			uuid = BM_DEFAULT_BRAND;
			item = Folders.find(DF_BRANDS, uuid);
		}
		this.uuid = uuid;
		this.item = item;
		this.props = item ? item.props : {};
		this.name = this.props.name || '<brand name missing>';
		this.defaultBackgroundColor = '#000000';
		this.defaultForegroundColor = 'rgba(77,255,77,0.8)';
	}

	colorProp(name, def) {
		const c = parseColorSpec(dictGet(this.props, name, null));
		return c || def;
	}
	globalBackgroundColor() {
		return this.colorProp('global/skin/colors/background', this.defaultBackgroundColor);
	}
	globalGridColor() {
		return this.colorProp('global/skin/colors/grid', this.defaultForegroundColor);
	}
	globalTextColor() {
		return this.colorProp('global/skin/colors/text', this.defaultForegroundColor);
	}
	globalColor(name, def) {
		return this.colorProp(`global/skin/colors/${name}`, def);
	}
	globalGridLineWidth() {
		return toFloat(dictGet(this.props, 'global/skin/props/grid-line-width', 1.0), 1.0);
	}
	globalString(name, def) {
		return dictGet(this.props, `global/${name}`, def);
	}
	globalInteger(name, def) {
		return toInt(dictGet(this.props, `global/${name}`, def), def);
	}
	globalFloat(name, def) {
		return toFloat(dictGet(this.props, `global/${name}`, def), def);
	}
	globalBoolean(name, def) {
		const v = UserPrefs.getObject(`${this.uuid}/${name}`, undefined);
		if (typeof v === 'boolean' || typeof v === 'number')
			return toBool(v);
		return toBool(dictGet(this.props, `global/${name}`, def), def);
	}
	globalImage(name) {
		const path = dictGet(this.props, `global/skin/images/${name}`, null);
		if (!path || !this.item)
			return null;
		return this.item.url(path);
	}
	globalFont() {
		const f = dictGet(this.props, 'global/skin/fonts/default', null);
		return f ? `"${f}", "Helvetica Neue", Helvetica, Arial, sans-serif` : '"Helvetica Neue", Helvetica, Arial, sans-serif';
	}
	globalBanner(name) {
		const path = dictGet(this.props, `global/skin/banners/${name}/image`, null);
		const image = path && this.item ? this.item.url(path) : null;
		return image ? { image, link: dictGet(this.props, `global/skin/banners/${name}/link`, null) } : null;
	}
}

export const BrandManager = {
	current: null,
	delegates: new Set(),
	currentBrand() {
		if (!this.current)
			this.current = new Brand(UserPrefs.getString(PK_BRAND, BM_DEFAULT_BRAND));
		return this.current;
	},
	reload() {
		this.current = new Brand(UserPrefs.getString(PK_BRAND, BM_DEFAULT_BRAND));
		for (const d of [...this.delegates])
			try { d(this.current); } catch (e) { console.error(e); }
	},
	addDelegate(fn) {
		this.delegates.add(fn);
	},
	removeDelegate(fn) {
		this.delegates.delete(fn);
	}
};

UserPrefs.addListener(PK_BRAND, () => BrandManager.reload());
