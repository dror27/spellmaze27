// SpellMaze - preferences (a much reduced port of PrefMainPageBuilder & friends, plus data import)

import { el, escapeHtml } from '../util.js';
import { Stage, Screen } from './stage.js';
import { ActionSheet, SplashPanel } from './splash.js';
import {
	UserPrefs, PK_SOUND_ENABLED, PK_TTS_ENABLED, PK_LANG_DEFAULT, PK_GAME_SPEED, PK_LEVEL_SET, PK_BRAND,
	CHEAT_ENABLE_ALL_LEVELS, CHEAT_REPEAT_WORDS_IN_LEVEL, CHEAT_PLAY_PAUSE_AT_WILL, CHEAT_SHOW_HINTS_AT_WILL,
	CHEAT_DISABLE_ALL_DECORATIONS, CHEAT_LEVEL_END_MENU, CHEAT_SPEAK_LETTER_SPELLING, CHEAT_WIDE_CELLS,
	CHEAT_OLD_IMAGE_HINTS, CHEAT_TEXT_HINT_MODE_1, CHEAT_TEXT_HINT_MODE_2, CHEAT_AUTORUN, CHEAT_AUTORUN_LEVEL_LOOP,
	CHEAT_AUTORUN_GAME_LOOP, CHEAT_AUTORUN_ACCUMULATE_SCORE, CHEAT_CODES, CHEAT_INFO, nickCodes
} from '../prefs.js';
import { Folders, ZipStore, DF_LANGUAGES, DF_GAMES, DF_BRANDS } from '../folders.js';
import { LanguageManager } from '../language.js';
import { GameManager } from '../sequence.js';
import { BrandManager, BM_DEFAULT_BRAND } from '../brand.js';
import { resetColorTables } from '../piece.js';
import { languageIcon } from './menu.js';
import { Wallet } from '../wallet.js';
import { SoundTheme, TextSpeaker } from '../sound.js';
import { withLoading } from './loading.js';
import { parsePlist } from '../plist.js';
import { PK_IDENTITY_NICK, userIdentity } from '../scorescomm.js';

export const VERSION = '2.7 (web)';

export class PrefsScreen extends Screen {
	constructor(onDone) {
		super('Preferences');
		this.onDone = onDone;
		this.rightButton = { label: 'Done', done: true, action: () => this.done() };
		this.pages = [];
		this.el.classList.add('prefs-screen');
	}

	build() {
		this.showPage(p => this.mainPage(p), 'Preferences');
	}

	done() {
		if (this.pages.length > 1) {
			this.pages = [this.pages[0]];
		}
		this.onDone();
	}

	showPage(builder, title) {
		this.pages.push({ builder, title });
		this.render();
	}

	back() {
		this.pages.pop();
		this.render();
	}

	render() {
		const page = this.pages[this.pages.length - 1];
		this.el.innerHTML = '';
		const scroll = el('div', 'prefs-scroll', this.el);
		page.builder(scroll);
		Stage.setTitle(this, page.title);
		Stage.setLeftButton(this, this.pages.length > 1 ? { label: this.pages[this.pages.length - 2].title, action: () => this.back() } : null);
	}

	refresh() {
		const top = this.el.querySelector('.prefs-scroll');
		const st = top ? top.scrollTop : 0;
		this.render();
		const n = this.el.querySelector('.prefs-scroll');
		if (n)
			n.scrollTop = st;
	}

	// ------------------------------------------------ building blocks

	section(parent, comment, title) {
		if (title)
			el('div', 'prefs-section-title', parent).textContent = title;
		const s = el('div', 'prefs-section', parent);
		if (comment) {
			const c = document.createElement('div');
			c.className = 'prefs-comment';
			c.textContent = comment;
			s.after(c);
		}
		return s;
	}

	row(section, label, opts = {}) {
		const r = el('div', 'prefs-row' + (opts.action ? ' clickable' : ''), section);
		if (opts.icon) {
			const i = el('img', 'prefs-icon', r);
			i.src = opts.icon;
		}
		const l = el('div', 'prefs-label', r);
		l.textContent = label;
		if (opts.sub) {
			const s = el('div', 'prefs-sub', l);
			s.textContent = opts.sub;
		}
		if (opts.value !== undefined) {
			const v = el('div', 'prefs-value', r);
			v.textContent = opts.value;
		}
		if (opts.checked)
			el('div', 'prefs-check', r).textContent = '✓';
		if (opts.disclosure)
			el('div', 'prefs-disclosure', r).textContent = '›';
		if (opts.destructive)
			r.classList.add('destructive');
		if (opts.action)
			r.addEventListener('click', () => {
				SoundTheme.clicked();
				opts.action();
			});
		return r;
	}

	toggle(section, label, key, def) {
		const r = this.row(section, label);
		const sw = el('div', 'switch' + (UserPrefs.getBoolean(key, def) ? ' on' : ''), r);
		el('div', 'knob', sw);
		r.addEventListener('click', () => {
			const v = !UserPrefs.getBoolean(key, def);
			UserPrefs.setBoolean(key, v);
			sw.classList.toggle('on', v);
			SoundTheme.clicked();
		});
		return r;
	}

	// ------------------------------------------------ pages

	mainPage(p) {
		const logo = el('div', 'prefs-logo', p);
		const img = el('img', '', logo);
		img.src = 'assets/images/ProgramIcon1.png';
		const home = el('div', 'prefs-comment', p);
		home.innerHTML = 'A SpellMaze Game<br>by Dror Kessler<br>Copyright © 2026';

		let s = this.section(p, 'Setup how the game sounds');
		this.toggle(s, 'Sound Effects', PK_SOUND_ENABLED, true);
		const tts = this.toggle(s, 'Speaker Voice', PK_TTS_ENABLED, true);
		if (!TextSpeaker.available())
			tts.querySelector('.prefs-label').append(' (not supported by this browser)');

		if (Folders.scoresUrl) {
			s = this.section(p, 'Setup your identity (shown on the shared score board)');
			this.textRow(s, 'Nickname', PK_IDENTITY_NICK, `Player-${userIdentity().slice(0, 4)}`, 20);
		}

		s = this.section(p, "Setup what game you're playing");
		const langUUID = LanguageManager.defaultLanguageUUID();
		const lang = Folders.find(DF_LANGUAGES, langUUID);
		this.row(s, 'Game', { value: lang ? lang.name : '?', disclosure: true, action: () => this.showPage(q => this.languagesPage(q), 'Game') });
		this.speedRow(s);

		s = this.section(p, null);
		const levelSet = UserPrefs.getString(PK_LEVEL_SET, '');
		const game = levelSet ? Folders.find(DF_GAMES, levelSet) : null;
		this.row(s, 'Game Type', { value: game ? game.name : '[Default]', disclosure: true, action: () => this.showPage(q => this.gamesPage(q), 'Game Type') });
		const brand = BrandManager.currentBrand();
		this.row(s, 'Skin', { value: brand.name, disclosure: true, action: () => this.showPage(q => this.brandsPage(q), 'Skin') });

		s = this.section(p, 'Load additional games, levels and skins (SpellMaze .zip files)');
		this.row(s, 'Import Zip Files ...', { action: () => this.importZips() });
		this.row(s, 'Manage Imported Files', { disclosure: true, action: () => this.showPage(q => this.importedPage(q), 'Imported') });

		s = this.section(p, null);
		this.row(s, 'Advanced Settings', { disclosure: true, action: () => this.showPage(q => this.advancedPage(q), 'Advanced') });
		this.row(s, 'Cheat Codes', { sub: 'Hidden options for practice and demos', disclosure: true, action: () => this.showPage(q => this.cheatCodesPage(q), 'Cheat Codes') });

		el('div', 'prefs-footer', p).textContent = `SpellMaze, Version ${VERSION}`;
	}

	textRow(s, label, key, placeholder, maxLength) {
		const r = this.row(s, label);
		const input = el('input', 'prefs-text', r);
		input.type = 'text';
		input.maxLength = maxLength || 40;
		input.placeholder = placeholder || '';
		input.value = UserPrefs.getString(key, '');
		input.autocomplete = 'off';
		input.spellcheck = false;
		const save = () => {
			const v = input.value.trim();
			if (v)
				UserPrefs.setString(key, v);
			else
				UserPrefs.remove(key);
		};
		input.addEventListener('change', save);
		input.addEventListener('blur', save);
		input.addEventListener('keydown', ev => {
			if (ev.key === 'Enter')
				input.blur();
			ev.stopPropagation();
		});
		return r;
	}

	speedRow(s) {
		const r = this.row(s, 'Speed');
		const input = el('input', 'prefs-slider', r);
		input.type = 'range';
		input.min = String(Math.log(0.25));
		input.max = String(Math.log(4.0));
		input.step = '0.01';
		input.value = String(Math.log(UserPrefs.getFloat(PK_GAME_SPEED, 1.0) || 1.0));
		const v = el('div', 'prefs-value small', r);
		const show = () => v.textContent = Math.exp(parseFloat(input.value)).toFixed(2) + 'x';
		show();
		input.addEventListener('input', show);
		input.addEventListener('change', () => {
			let speed = Math.exp(parseFloat(input.value));
			if (Math.abs(speed - 1) < 0.06)
				speed = 1;
			UserPrefs.setFloat(PK_GAME_SPEED, speed);
			show();
		});
		input.addEventListener('dblclick', () => {
			input.value = '0';
			UserPrefs.setFloat(PK_GAME_SPEED, 1.0);
			show();
		});
	}

	languagesPage(p) {
		const s = this.section(p, 'Select the game (ontology) to play');
		const current = LanguageManager.defaultLanguageUUID();
		const items = Folders.list(DF_LANGUAGES).slice().sort((a, b) => a.name.localeCompare(b.name));
		for (const item of items)
			this.row(s, item.name, {
				icon: languageIcon(item.uuid), sub: item.props.description || '', checked: item.uuid === current,
				action: () => {
					UserPrefs.setString(PK_LANG_DEFAULT, item.uuid);
					this.back();
				}
			});
		this.moreSection(p, DF_LANGUAGES, 'Games');
	}

	gamesPage(p) {
		const s = this.section(p, 'The levels to play (when the game does not define its own)');
		const current = UserPrefs.getString(PK_LEVEL_SET, '');
		this.row(s, '[Default]', { sub: 'Classic, or Learning for games with pictures', checked: !current, action: () => { UserPrefs.remove(PK_LEVEL_SET); this.back(); } });
		for (const item of Folders.list(DF_GAMES))
			this.row(s, item.name, {
				sub: item.props.description || '', checked: item.uuid === current,
				action: () => { UserPrefs.setString(PK_LEVEL_SET, item.uuid); this.back(); }
			});
		this.moreSection(p, DF_GAMES, 'Game Types');
	}

	brandsPage(p) {
		const s = this.section(p, 'How SpellMaze looks');
		const current = BrandManager.currentBrand().uuid;
		for (const item of Folders.list(DF_BRANDS)) {
			const icon = item.props.global && item.props.global.skin && item.props.global.skin.images ? item.props.global.skin.images['directory-item-icon'] : null;
			this.row(s, item.name, {
				icon: icon ? item.url(icon) : null, sub: item.props.description || '', checked: item.uuid === current,
				action: () => {
					resetColorTables();
					if (item.uuid === BM_DEFAULT_BRAND)
						UserPrefs.remove(PK_BRAND);
					else
						UserPrefs.setString(PK_BRAND, item.uuid);
					BrandManager.reload();
					resetColorTables();
					this.back();
				}
			});
		}
		this.moreSection(p, DF_BRANDS, 'Skins');
	}

	// ------------------------------------------------ "Get More ..." (port of PrefUrlDirectorySection)

	moreSection(p, domain, plural) {
		if (!Folders.moreSites.length)
			return;
		const s = this.section(p, null, `Get More ${plural}`);
		for (const site of Folders.moreSites) {
			const url = `${site.replace(/\/+$/, '')}/${domain.toLowerCase()}/directory.plist`;
			this.row(s, 'SpellMaze More', {
				sub: 'Play new games, learn new languages, enjoy!', disclosure: true,
				icon: 'assets/images/spellmaze_logo_64x64.png',
				action: () => this.showPage(q => this.directoryPage(q, url, domain), 'SpellMaze More')
			});
		}
	}

	async fetchDirectory(url) {
		this.directoryCache = this.directoryCache || new Map();
		if (!this.directoryCache.has(url)) {
			const r = await fetch(url, { cache: 'no-cache' });
			if (!r.ok)
				throw new Error(`HTTP ${r.status} for ${url}`);
			this.directoryCache.set(url, parsePlist(new Uint8Array(await r.arrayBuffer())));
		}
		return this.directoryCache.get(url);
	}

	async directoryPage(p, url, domain) {
		const page = this.pages[this.pages.length - 1];
		let dir;
		try {
			dir = await this.fetchDirectory(url);
		} catch (e) {
			this.row(this.section(p, null), `Could not load: ${e.message}`);
			return;
		}
		if (this.pages[this.pages.length - 1] !== page)
			return;
		if (dir.name && page.title !== dir.name) {
			page.title = dir.name;
			Stage.setTitle(this, dir.name);
		}
		const s = this.section(p, dir.comment || null);
		const items = Array.isArray(dir.items) ? dir.items : [];
		if (!items.length)
			this.row(s, 'Nothing here yet');
		for (const it of items) {
			const icon = it['item-icon'] || it.icon;
			const opts = {
				sub: String(it.comment || '').split('\n')[0], disclosure: true,
				icon: icon ? new URL(icon, url).href : null
			};
			if (it.type === 'directory')
				opts.action = () => this.showPage(q => this.directoryPage(q, new URL(it.url, url).href, domain), it.name || 'More');
			else {
				const uuid = it['leading-uuid'] || it.uuid;
				if (uuid && Folders.find(it.domain || domain, uuid))
					opts.checked = true;
				opts.action = () => this.showPage(q => this.catalogItemPage(q, it, url, domain), it.name || 'Item');
			}
			this.row(s, it.name || it.url, opts);
		}
	}

	catalogItemPage(p, it, dirUrl, domain) {
		domain = it.domain || domain;
		const uuid = (it['leading-uuid'] || it.uuid || '').toUpperCase();
		const zipUrl = new URL(it.url, dirUrl).href;
		const installed = uuid ? Folders.find(domain, uuid) : null;
		const box = el('div', 'prefs-item-box', p);
		if (it.icon) {
			const img = el('img', 'prefs-poster', box);
			img.src = new URL(it.icon, dirUrl).href;
		}
		el('div', 'prefs-item-title', box).textContent = it.name || '';
		const c = el('div', 'prefs-item-comment', box);
		for (const line of String(it.comment || '').replace(/\\n/g, '\n').split('\n'))
			el('div', '', c).textContent = line;
		if (it.version !== undefined)
			el('div', 'prefs-item-version', box).textContent = `Version ${it.version}`;
		const s = this.section(p, installed ? `Installed (${installed.origin === 'builtin' ? 'built in' : 'downloaded'})` : null);
		if (installed)
			this.row(s, `Use ${it.name}`, { action: () => this.selectItem(domain, uuid) });
		if (!installed || installed.origin !== 'builtin')
			this.row(s, installed ? 'Download Again' : 'Download', { action: () => this.downloadItem(it, zipUrl, domain, uuid) });
	}

	async downloadItem(it, zipUrl, domain, uuid) {
		const name = `${domain}/${decodeURIComponent(zipUrl.split('/').pop())}`;
		const ok = await withLoading(async () => {
			const r = await fetch(zipUrl);
			if (!r.ok)
				throw new Error(`HTTP ${r.status} for ${zipUrl}`);
			const data = await r.arrayBuffer();
			Folders.removeSource(name);
			const items = await Folders.addZip(data, name, 'imported', domain);
			if (!items.length)
				throw new Error('no SpellMaze content found in the download');
			await ZipStore.save(name, data, { domain, uuid, version: it.version, name: it.name, url: zipUrl });
			return true;
		}, 'Downloading ...');
		if (!ok)
			return;
		LanguageManager.clearCache(uuid);
		GameManager.clearCache();
		if (uuid && Folders.find(domain, uuid))
			this.selectItem(domain, uuid);
		else
			this.refresh();
	}

	selectItem(domain, uuid) {
		if (domain === DF_LANGUAGES)
			UserPrefs.setString(PK_LANG_DEFAULT, uuid);
		else if (domain === DF_GAMES)
			UserPrefs.setString(PK_LEVEL_SET, uuid);
		else if (domain === DF_BRANDS) {
			resetColorTables();
			if (uuid === BM_DEFAULT_BRAND)
				UserPrefs.remove(PK_BRAND);
			else
				UserPrefs.setString(PK_BRAND, uuid);
			BrandManager.reload();
			resetColorTables();
		}
		// back to the domain's selection page, where the new item now shows as selected
		while (this.pages.length > 2)
			this.pages.pop();
		this.render();
	}

	async importedPage(p) {
		const s = this.section(p, 'Zip files you imported are kept in this browser');
		const recs = await ZipStore.list();
		if (!recs.length)
			this.row(s, 'No imported files');
		for (const rec of recs) {
			const items = Folders.items.filter(i => i.source.name === rec.name && !i.nested);
			const sub = items.map(i => `${i.domain}: ${i.name}`).join(', ') || 'no content';
			this.row(s, rec.meta && rec.meta.name ? rec.meta.name : rec.name, {
				sub, action: () => ActionSheet.show(`Delete ${rec.name}?`, [
					{
						label: 'Delete', style: 'destructive', handler: async () => {
							await ZipStore.remove(rec.name);
							Folders.removeSource(rec.name);
							LanguageManager.clearCache();
							GameManager.clearCache();
							this.refresh();
						}
					},
					{ label: 'Cancel', style: 'cancel' }
				])
			});
		}
		if (Folders.errors.length) {
			const e = this.section(p, null, 'Data loading problems');
			for (const msg of Folders.errors.slice(-20))
				this.row(e, msg);
		}
		// the page builder is async: re-apply the (sync) render's title
		Stage.setTitle(this, 'Imported');
	}

	importZips() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.zip,application/zip';
		input.multiple = true;
		input.addEventListener('change', () => this.importFiles([...input.files]));
		input.click();
	}

	async importFiles(files) {
		const report = [];
		await withLoading(async () => {
			for (const f of files) {
				try {
					const data = await f.arrayBuffer();
					Folders.removeSource(f.name);
					const items = await Folders.addZip(data, f.name, 'imported');
					if (!items.length)
						throw new Error('no SpellMaze content found');
					await ZipStore.save(f.name, data);
					report.push(`${f.name}: ${items.filter(i => !i.nested).map(i => `${i.name} (${i.domain})`).join(', ')}`);
				} catch (e) {
					console.error(e);
					report.push(`${f.name}: FAILED - ${e.message}`);
				}
			}
		}, 'Importing ...');
		LanguageManager.clearCache();
		GameManager.clearCache();
		const panel = new SplashPanel();
		panel.title = 'Import';
		panel.text = report.join('\n\n');
		panel.delegate = { splashDidFinish: () => this.refresh() };
		panel.show();
	}

	advancedPage(p) {
		let s = this.section(p, 'Your progress is kept in this browser');
		this.row(s, 'Reset Levels & Scores', {
			destructive: true, action: () => ActionSheet.show('Forget all passed levels and scores?', [
				{ label: 'Reset Levels & Scores', style: 'destructive', handler: () => this.resetProgress() },
				{ label: 'Cancel', style: 'cancel' }
			])
		});
		this.row(s, 'Reset to Factory Settings', {
			destructive: true, action: () => ActionSheet.show('Reset all settings, progress and scores? (imported files are kept)', [
				{ label: 'Reset to Factory Settings', style: 'destructive', handler: () => this.factoryReset() },
				{ label: 'Cancel', style: 'cancel' }
			])
		});
		s = this.section(p, 'For testing and practice. Each can also be turned on by adding its code to your nickname (see Cheat Codes). While one that makes scoring easier is on, your scores are not sent to the shared score board.', 'Cheats');
		const cheats = [
			['Enable All Levels', CHEAT_ENABLE_ALL_LEVELS], ['Repeat Words', CHEAT_REPEAT_WORDS_IN_LEVEL],
			['Pause Levels At Will', CHEAT_PLAY_PAUSE_AT_WILL], ['Show Hint At Will', CHEAT_SHOW_HINTS_AT_WILL],
			['Disable Decorations', CHEAT_DISABLE_ALL_DECORATIONS], ['Level End Menu', CHEAT_LEVEL_END_MENU],
			['Speak Spell', CHEAT_SPEAK_LETTER_SPELLING], ['Wide Cells', CHEAT_WIDE_CELLS],
			['Old Image Hint', CHEAT_OLD_IMAGE_HINTS], ['Text Hint M1', CHEAT_TEXT_HINT_MODE_1],
			['Text Hint M2', CHEAT_TEXT_HINT_MODE_2], ['AR Mode (autorun)', CHEAT_AUTORUN],
			['AR Level Loop', CHEAT_AUTORUN_LEVEL_LOOP], ['AR Game Loop', CHEAT_AUTORUN_GAME_LOOP],
			['AR Acc. Score', CHEAT_AUTORUN_ACCUMULATE_SCORE]
		];
		const codes = nickCodes();
		for (const [label, key] of cheats) {
			const r = this.toggle(s, label, key, false);
			const sub = el('div', 'prefs-sub', r.querySelector('.prefs-label'));
			sub.textContent = `/${CHEAT_CODES[key]}` + (codes.has(CHEAT_CODES[key]) ? ' - on through your nickname' : '');
		}
	}

	cheatCodesPage(p) {
		const intro = el('div', 'prefs-comment', p);
		intro.innerHTML = 'Add codes to your nickname, each after a <b>/</b>, for example <b>Dror/eal/shaw</b>. ' +
			'Only the part before the first / is shown on the score board.';
		if (Folders.scoresUrl) {
			const s0 = this.section(p, null);
			this.row(s0, 'Nickname', { value: UserPrefs.getString(PK_IDENTITY_NICK, '') || '(not set)', disclosure: true, action: () => this.back() });
		}
		const codes = nickCodes();
		const s = this.section(p, 'Codes marked * keep your scores off the shared score board while they are on. Each cheat can also be switched on under Advanced Settings.');
		s.classList.add('prefs-wrap');
		const scoreKeys = new Set([CHEAT_ENABLE_ALL_LEVELS, CHEAT_REPEAT_WORDS_IN_LEVEL, CHEAT_PLAY_PAUSE_AT_WILL, CHEAT_SHOW_HINTS_AT_WILL, CHEAT_LEVEL_END_MENU, CHEAT_AUTORUN_ACCUMULATE_SCORE]);
		for (const [key, name, desc] of CHEAT_INFO) {
			const code = CHEAT_CODES[key];
			const r = this.row(s, `/${code}${scoreKeys.has(key) ? ' *' : ''}`, { sub: `${name}: ${desc}`, checked: UserPrefs.cheat(key) });
			if (codes.has(code))
				r.querySelector('.prefs-sub').append(' (in your nickname)');
		}
		const s2 = this.section(p, null);
		this.row(s2, 'All the details', {
			sub: 'docs/CHEAT_CODES.md on GitHub', disclosure: true,
			action: () => window.open('https://github.com/dror27/spellmaze27/blob/master/docs/CHEAT_CODES.md', '_blank', 'noopener')
		});
	}

	resetProgress() {
		for (const prefix of ['level-enabled.', 'level-passed.', 'score', 'last-level', 'reports-log'])
			UserPrefs.removeByPrefix(prefix);
		for (const k of UserPrefs.listKeys(''))
			if (k.endsWith('_levels-menu-entered'))
				UserPrefs.remove(k);
		Wallet.reset();
		GameManager.clearCache();
		this.refresh();
	}

	factoryReset() {
		UserPrefs.removeAll();
		Wallet.reset();
		LanguageManager.clearCache();
		GameManager.clearCache();
		resetColorTables();
		BrandManager.reload();
		this.pages = [this.pages[0]];
		this.refresh();
	}
}
