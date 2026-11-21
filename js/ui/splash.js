// SpellMaze - splash panels (port of SplashPanel/SplashPanelView) and iOS style action sheets

import { el, escapeHtml, toBool } from '../util.js';
import { Stage, STAGE_W, NAV_H, CONTENT_H } from './stage.js';
import { BrandManager } from '../brand.js';
import { SoundTheme } from '../sound.js';
import { UserPrefs, CHEAT_AUTORUN } from '../prefs.js';

const TOP_PORTION = 0.12;
const BOTTOM_PORTION = 0.12;

const openPanels = new Set();

export class SplashPanel {
	constructor() {
		this.title = '';
		this.text = '';
		this.icon = null;
		this.delegate = null;
		this.width = 240;
		this.height = 310;
		this.autoShow = false;
		this.minShowTime = 0.33;
		this.textFontSize = 14;
		this.buttonText = null;
		this.props = {};
		this.root = null;
	}

	static fromProps(props, owner, item) {
		if (!props || typeof props !== 'object')
			return null;
		const p = new SplashPanel();
		p.title = props.title || '';
		p.text = props.text || '';
		p.autoShow = toBool(props['auto-show'], false);
		if (props.__iconUrl)
			p.icon = props.__iconUrl;
		else if (props.icon && item)
			p.icon = item.url(props.icon);
		p.delegate = owner || null;
		return p;
	}

	get shown() {
		return !!this.root;
	}

	show() {
		if (this.root)
			return;
		const brand = BrandManager.currentBrand();
		const font = brand.globalFont();
		const textColor = brand.globalTextColor();
		const gridColor = brand.globalGridColor();
		const dim = el('div', 'splash-dim', Stage.overlayLayer);
		const panel = el('div', 'splash', dim);
		const x = (STAGE_W - this.width) / 2;
		const y = NAV_H + ((Stage.contentH || CONTENT_H) - this.height) / 2;
		Object.assign(panel.style, {
			left: x + 'px', top: y + 'px', width: this.width + 'px', height: this.height + 'px',
			backgroundColor: brand.globalColor('splash-background', 'rgb(0,0,0)'),
			borderColor: gridColor, color: textColor, fontFamily: font
		});
		const top = Math.round(this.height * TOP_PORTION);
		const title = el('div', 'splash-title', panel);
		Object.assign(title.style, { height: top + 'px', lineHeight: top + 'px', borderBottomColor: gridColor });
		title.textContent = this.title || '';
		let bottom;
		if (this.icon) {
			const icon = el('img', 'splash-icon', panel);
			icon.src = this.icon;
			icon.draggable = false;
			bottom = 150 + 12;
			icon.style.bottom = '6px';
		} else {
			bottom = Math.round(this.height * BOTTOM_PORTION);
			const ins = el('div', 'splash-instructions', panel);
			Object.assign(ins.style, { height: bottom + 'px', lineHeight: bottom + 'px' });
			if (this.buttonText) {
				const b = el('span', 'splash-button', ins);
				b.textContent = this.buttonText;
			} else
				ins.textContent = 'Tap to Continue ...';
		}
		const textMargin = 6;
		const text = el('div', 'splash-text', panel);
		Object.assign(text.style, {
			top: (top + textMargin) + 'px', left: textMargin + 'px', width: (this.width - 2 * textMargin) + 'px',
			height: (this.height - bottom - top - 2 * textMargin) + 'px', fontSize: (this.textFontSize || 14) + 'px'
		});
		text.innerHTML = formatSplashText(this.text || '');
		if (this.icon && this.buttonText) {
			const b = el('div', 'splash-button-float', panel);
			b.textContent = this.buttonText;
		}
		this.root = dim;
		this.shownAt = Date.now();
		openPanels.add(this);
		panel.style.transform = 'scale(0.6)';
		panel.style.opacity = '0';
		panel.getBoundingClientRect();
		panel.style.transition = 'transform 0.2s, opacity 0.2s';
		panel.style.transform = 'scale(1.05)';
		panel.style.opacity = '1';
		setTimeout(() => { panel.style.transform = ''; }, 200);
		dim.addEventListener('pointerdown', ev => {
			ev.preventDefault();
			ev.stopPropagation();
			this.onTouched();
		});
		if (this.delegate && this.delegate.splashDidShow)
			this.delegate.splashDidShow(this);
		// in autorun mode panels close by themselves
		if (UserPrefs.cheat(CHEAT_AUTORUN)) {
			const root = this.root;
			setTimeout(() => { if (this.root === root) this.hide(); }, 2600);
		}
	}

	onTouched() {
		if (!UserPrefs.cheat(CHEAT_AUTORUN) && (Date.now() - this.shownAt) / 1000 < this.minShowTime)
			return;
		SoundTheme.clicked();
		this.hide();
	}

	hide() {
		if (!this.root)
			return;
		const r = this.root;
		this.root = null;
		openPanels.delete(this);
		r.style.transition = 'opacity 0.2s';
		r.style.opacity = '0';
		setTimeout(() => r.remove(), 220);
		if (this.delegate && this.delegate.splashDidFinish)
			this.delegate.splashDidFinish(this);
	}

	abort() {
		this.delegate = null;
		this.hide();
	}

	toggle() {
		if (this.shown)
			this.hide();
		else
			this.show();
	}

	static abortAll() {
		for (const p of [...openPanels])
			p.abort();
	}
}

function formatSplashText(text) {
	// the original help texts use lines holding a single '-' as paragraph separators
	const lines = text.split('\n').map(l => l.trim());
	let html = '';
	for (const line of lines) {
		if (line === '-')
			html += '<div class="splash-sep"></div>';
		else if (!line.length)
			html += '<div class="splash-gap"></div>';
		else
			html += `<div>${escapeHtml(line)}</div>`;
	}
	return html;
}

// ---------------------------------------------------------------- action sheets

const openSheets = new Set();

export const ActionSheet = {
	// buttons: [{label, style: 'default'|'destructive'|'cancel', handler}]
	show(title, buttons) {
		const dim = el('div', 'sheet-dim', Stage.overlayLayer);
		const sheet = el('div', 'sheet', dim);
		if (title) {
			const t = el('div', 'sheet-title', sheet);
			t.textContent = title;
		}
		const close = (b) => {
			if (!dim.isConnected)
				return;
			openSheets.delete(entry);
			sheet.style.transform = 'translateY(100%)';
			dim.style.opacity = '0';
			setTimeout(() => dim.remove(), 250);
			if (b && b.handler)
				b.handler();
		};
		const entry = { dim, close };
		const normal = buttons.filter(b => b.style !== 'cancel');
		const cancel = buttons.filter(b => b.style === 'cancel');
		for (const b of [...normal, ...cancel]) {
			const e = el('div', 'sheet-button' + (b.style === 'destructive' ? ' destructive' : '') + (b.style === 'cancel' ? ' cancel' : ''), sheet);
			e.textContent = b.label;
			e.addEventListener('click', ev => {
				ev.stopPropagation();
				SoundTheme.clicked();
				close(b);
			});
		}
		openSheets.add(entry);
		sheet.style.transform = 'translateY(100%)';
		sheet.getBoundingClientRect();
		sheet.style.transition = 'transform 0.25s ease-out';
		sheet.style.transform = '';
		dim.addEventListener('pointerdown', ev => ev.stopPropagation());
		return entry;
	},
	dismissAll() {
		for (const e of [...openSheets]) {
			openSheets.delete(e);
			e.dim.remove();
		}
	}
};
