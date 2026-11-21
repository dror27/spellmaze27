// SpellMaze - a small "loading" indicator shown while slow async operations run

import { el } from '../util.js';
import { Stage } from './stage.js';
import { SplashPanel } from './splash.js';

export async function withLoading(fn, label = 'Loading ...') {
	let indicator = null;
	const t = setTimeout(() => {
		indicator = el('div', 'loading', Stage.overlayLayer);
		el('div', 'loading-box', indicator).textContent = label;
	}, 150);
	try {
		return await fn();
	} catch (e) {
		console.error(e);
		const p = new SplashPanel();
		p.title = 'Error';
		p.text = String(e && e.message ? e.message : e);
		p.show();
		return null;
	} finally {
		clearTimeout(t);
		if (indicator)
			indicator.remove();
	}
}
