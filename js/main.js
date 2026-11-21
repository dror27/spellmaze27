// SpellMaze - application entry point

import { Folders, loadImportedZips } from './folders.js';
import { Stage } from './ui/stage.js';
import { MainMenuScreen } from './ui/menu.js';
import { SoundTheme, unlockAudio } from './sound.js';
import { BrandManager } from './brand.js';
import { resetColorTables } from './piece.js';
import { SplashPanel } from './ui/splash.js';
import { GameManager } from './sequence.js';
import { el } from './util.js';
import { registerCustomWords } from './customwords.js';
import { ScoresDatabase } from './scores.js';

async function boot() {
	const app = document.getElementById('app');
	Stage.init(app);
	const splash = el('img', 'startup', Stage.root);
	splash.src = 'assets/images/startup.png';

	for (const ev of ['pointerdown', 'touchend', 'click', 'keydown'])
		document.addEventListener(ev, unlockAudio, true);
	// no context menus / text selection on long presses
	document.addEventListener('contextmenu', e => e.preventDefault());

	try {
		await Folders.loadManifest('data/manifest.txt');
	} catch (e) {
		console.error(e);
		Folders.errors.push(e.message);
	}
	await loadImportedZips();
	try {
		await registerCustomWords();
	} catch (e) {
		console.warn('own word list:', e);
		Folders.errors.push(`My Words: ${e.message}`);
	}
	ScoresDatabase.seedBoardLedger();
	BrandManager.reload();
	resetColorTables();
	SoundTheme.preload();

	// warm up the current game (loads the default language) while the startup image is shown
	const warm = GameManager.currentGameLevelSequence().catch(e => console.error(e));
	await Promise.race([warm, new Promise(r => setTimeout(r, 2500))]);

	const menu = new MainMenuScreen();
	await Stage.push(menu, false);
	splash.style.transition = 'opacity 0.6s';
	splash.style.opacity = '0';
	setTimeout(() => splash.remove(), 700);

	if (Folders.errors.length && !Folders.items.length) {
		const p = new SplashPanel();
		p.title = 'Data Problem';
		p.text = 'Could not load the game data:\n\n' + Folders.errors.join('\n') +
			'\n\nPlease serve this folder from a web server (e.g. "python3 -m http.server") and open it via http://';
		p.show();
	}

	// developer hook
	window.SpellMaze = { Folders, GameManager, Stage };
}

boot();
