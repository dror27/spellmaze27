// SpellMaze - the phone-shaped stage and a minimal UINavigationController

import { el } from '../util.js';
import { BrandManager } from '../brand.js';

export const STAGE_W = 320;
export const STAGE_H = 460;
export const NAV_H = 44;
export const CONTENT_H = STAGE_H - NAV_H;
export const STAGE_MAX_H = 720;

// scale factor for original 320 point wide layouts (ViewController adjWidth)
export function AW(v) {
	return v;
}

class StageImpl {
	init(container) {
		this.container = container;
		this.root = el('div', 'stage', container);
		this.navbar = el('div', 'navbar', this.root);
		this.backButton = el('div', 'nav-button nav-back', this.navbar);
		this.titleEl = el('div', 'nav-title', this.navbar);
		this.rightButton = el('div', 'nav-button nav-right', this.navbar);
		this.content = el('div', 'screens', this.root);
		this.fxLayer = el('div', 'fx-layer', this.root);
		this.overlayLayer = el('div', 'overlay-layer', this.root);
		this.stack = [];
		this.flipped = null;
		this.backButton.addEventListener('click', () => {
			const s = this.topScreen();
			if (s && s.leftButton && s.leftButton.action)
				s.leftButton.action();
			else
				this.pop();
		});
		this.rightButton.addEventListener('click', () => {
			const s = this.topScreen();
			if (s && s.rightButton && s.rightButton.action)
				s.rightButton.action();
		});
		window.addEventListener('resize', () => this.layout());
		this.layout();
	}

	layout() {
		const W = window.innerWidth, H = window.innerHeight;
		// on tall (phone) screens the stage grows to use the extra height; the original 416 point high
		// layouts are then centered vertically within the content area
		const stageH = Math.max(STAGE_H, Math.min(STAGE_MAX_H, Math.floor(STAGE_W * H / W)));
		this.stageH = stageH;
		this.contentH = stageH - NAV_H;
		this.layoutTop = Math.floor((this.contentH - CONTENT_H) / 2);
		const s = Math.min(W / STAGE_W, H / stageH);
		this.scale = s;
		const st = this.root.style;
		st.setProperty('--stage-h', stageH + 'px');
		st.setProperty('--content-h', this.contentH + 'px');
		st.setProperty('--layout-top', this.layoutTop + 'px');
		st.transform = `scale(${s})`;
		st.left = Math.round((W - STAGE_W * s) / 2) + 'px';
		st.top = Math.round((H - stageH * s) / 2) + 'px';
	}

	topScreen() {
		return this.flipped || this.stack[this.stack.length - 1] || null;
	}

	updateNavBar() {
		const top = this.topScreen();
		if (!top)
			return;
		this.titleEl.textContent = top.title || '';
		const prev = this.flipped ? null : this.stack[this.stack.length - 2];
		if (top.leftButton) {
			this.backButton.textContent = top.leftButton.label;
			this.backButton.style.display = '';
		} else if (prev && !top.hideBack) {
			this.backButton.textContent = prev.backTitle || prev.title || 'Back';
			this.backButton.style.display = '';
		} else
			this.backButton.style.display = 'none';
		if (top.rightButton) {
			this.rightButton.textContent = top.rightButton.label;
			this.rightButton.className = 'nav-button nav-right' + (top.rightButton.done ? ' nav-done' : '');
			this.rightButton.style.display = '';
		} else
			this.rightButton.style.display = 'none';
	}

	setTitle(screen, title) {
		screen.title = title;
		if (this.topScreen() === screen)
			this.updateNavBar();
	}

	setLeftButton(screen, button) {
		screen.leftButton = button;
		if (this.topScreen() === screen)
			this.updateNavBar();
	}

	setRightButton(screen, button) {
		screen.rightButton = button;
		if (this.topScreen() === screen)
			this.updateNavBar();
	}

	mount(screen) {
		if (!screen.el.parentElement)
			this.content.appendChild(screen.el);
	}

	slide(elIn, elOut, forward) {
		const d = 0.35;
		const W = STAGE_W;
		if (elIn) {
			elIn.style.transition = 'none';
			elIn.style.transform = `translateX(${forward ? W : -W * 0.3}px)`;
		}
		if (elIn)
			elIn.getBoundingClientRect();
		if (elIn) {
			elIn.style.transition = `transform ${d}s ease-out`;
			elIn.style.transform = '';
		}
		if (elOut) {
			elOut.style.transition = `transform ${d}s ease-out`;
			elOut.style.transform = `translateX(${forward ? -W * 0.3 : W}px)`;
		}
		return new Promise(r => setTimeout(r, d * 1000));
	}

	async push(screen, animated = true) {
		if (this.busy)
			return;
		this.busy = true;
		const prev = this.topScreen();
		if (prev && prev.willDisappear)
			prev.willDisappear();
		if (!screen.built && screen.build) {
			screen.build();
			screen.built = true;
		}
		this.mount(screen);
		this.stack.push(screen);
		if (screen.willAppear)
			screen.willAppear();
		this.updateNavBar();
		if (prev && animated)
			await this.slide(screen.el, prev.el, true);
		if (prev) {
			prev.el.style.display = 'none';
			if (prev.didDisappear)
				prev.didDisappear();
		}
		this.busy = false;
		if (screen.didAppear)
			screen.didAppear();
	}

	async pop(animated = true) {
		if (this.busy || this.stack.length < 2)
			return;
		this.busy = true;
		const top = this.stack.pop();
		const next = this.stack[this.stack.length - 1];
		if (top.willDisappear)
			top.willDisappear();
		next.el.style.display = '';
		if (next.willAppear)
			next.willAppear();
		this.updateNavBar();
		if (animated)
			await this.slide(next.el, top.el, false);
		top.el.remove();
		if (top.didDisappear)
			top.didDisappear();
		if (top.dispose)
			top.dispose();
		this.busy = false;
		if (next.didAppear)
			next.didAppear();
	}

	async popToRoot() {
		while (this.stack.length > 1)
			await this.pop(false);
	}

	// flip the top screen over to show another one (used for the preferences)
	async flip(screen) {
		if (this.busy)
			return;
		this.busy = true;
		const under = this.stack[this.stack.length - 1];
		if (!screen.built && screen.build) {
			screen.build();
			screen.built = true;
		}
		if (under && under.willDisappear)
			under.willDisappear();
		screen.el.classList.add('flip-in');
		this.content.appendChild(screen.el);
		if (screen.willAppear)
			screen.willAppear();
		this.flipped = screen;
		await this.flipAnimation(under ? under.el : null, screen.el);
		this.updateNavBar();
		if (under) {
			under.el.style.display = 'none';
			if (under.didDisappear)
				under.didDisappear();
		}
		this.busy = false;
		if (screen.didAppear)
			screen.didAppear();
	}

	async unflip() {
		if (this.busy || !this.flipped)
			return;
		this.busy = true;
		const screen = this.flipped;
		const under = this.stack[this.stack.length - 1];
		if (screen.willDisappear)
			screen.willDisappear();
		this.flipped = null;
		if (under) {
			under.el.style.display = '';
			if (under.willAppear)
				under.willAppear();
		}
		await this.flipAnimation(screen.el, under ? under.el : null, true);
		screen.el.remove();
		if (screen.didDisappear)
			screen.didDisappear();
		if (screen.dispose)
			screen.dispose();
		this.updateNavBar();
		this.busy = false;
		if (under && under.didAppear)
			under.didAppear();
	}

	flipAnimation(outEl, inEl, reverse) {
		const d = 0.75;
		const dir = reverse ? -1 : 1;
		const c = this.content;
		c.style.perspective = '1000px';
		for (const e of [outEl, inEl])
			if (e) {
				e.style.backfaceVisibility = 'hidden';
				e.style.transition = 'none';
			}
		if (inEl)
			inEl.style.transform = `rotateY(${-180 * dir}deg)`;
		if (outEl)
			outEl.style.transform = 'rotateY(0deg)';
		c.getBoundingClientRect();
		for (const e of [outEl, inEl])
			if (e)
				e.style.transition = `transform ${d}s ease-in-out`;
		if (outEl)
			outEl.style.transform = `rotateY(${180 * dir}deg)`;
		if (inEl)
			inEl.style.transform = 'rotateY(0deg)';
		return new Promise(r => setTimeout(() => {
			for (const e of [outEl, inEl])
				if (e) {
					e.style.transition = '';
					e.style.transform = '';
					e.style.backfaceVisibility = '';
				}
			r();
		}, d * 1000 + 30));
	}

	// background color/image of the current brand
	applyBrandBackground(screenEl, imageKeys) {
		const brand = BrandManager.currentBrand();
		screenEl.style.backgroundColor = brand.globalBackgroundColor();
		let url = null;
		for (const k of imageKeys) {
			url = brand.globalImage(k);
			if (url)
				break;
		}
		screenEl.style.backgroundImage = url ? `url("${url}")` : '';
		screenEl.style.backgroundSize = url ? '100% 100%' : '';
	}
}

export const Stage = new StageImpl();

export class Screen {
	constructor(title) {
		this.title = title || '';
		this.el = el('div', 'screen');
		this.rightButton = null;
		this.built = false;
	}
}
