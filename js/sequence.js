// SpellMaze - level sequences (games) and the game manager (port of GameLevelSequence / GameManager)

import { Folders, DF_LANGUAGES, DF_GAMES, DF_LEVELS } from './folders.js';
import { LanguageManager } from './language.js';
import {
	UserPrefs, UUIDPropsUPL, PK_LEVEL_SET, PK_LANG_DEFAULT, PK_LANG_DEFAULT_PREV, PK_LAST_LEVEL
} from './prefs.js';
import { ParametricGameLevel, DISPENSER_DONE,
	PassedLevelEndMenuContext_NextLevel, PassedLevelEndMenuContext_RepeatLevel,
	PassedLevelEndMenuContext_ContinueLevel, PassedLevelEndMenuContext_StopPlaying } from './gamelevel.js';
import { ScoresDatabase } from './scores.js';
import { SplashPanel, ActionSheet } from './ui/splash.js';
import { CHEAT_AUTORUN, CHEAT_AUTORUN_LEVEL_LOOP, CHEAT_AUTORUN_GAME_LOOP } from './prefs.js';
import { deepCopy, toBool } from './util.js';

export const GM_DEFAULT_GAME = '6F161DAF-6349-2774-9B9B-A9C5DA906534';
export const GM_DEFAULT_GAME_PIC = '1A767972-BDA0-B6B3-6945-CDA6488213BF';

class ParametricGameLevelFactory {
	constructor(props) {
		this.props = props;
		this.uuid = props.uuid;
		this.seq = null;
	}
	createGameLevel() {
		const level = new ParametricGameLevel(this.props);
		level.props = this.props;
		level.seq = this.seq;
		return level;
	}
	get title() {
		return this.props.name || '';
	}
	get shortDescription() {
		return this.props.description || '';
	}
}

export class GameLevelSequence {
	constructor() {
		this.levels = [];
		this.level = null;
		this.currentLevel = 0;
		this.title = '';
		this.shortDescription = '';
		this.uuid = '';
		this.language = null;
		this.helpSplashPanel = null;
		this.props = {};
		this.upl = null;
		this.eventsTarget = null;
		this.languageInvalidated = false;
		this.view = null;		// the container element levels are shown in (set by the play screen)
		this.levelFrame = null;
	}

	addLevel(factory) {
		this.levels.push(factory);
	}

	levelCount() {
		return this.levels.length;
	}

	levelUUIDAtIndex(i) {
		return this.levels[i].uuid;
	}

	allLevelUUIDs() {
		return this.levels.map(f => f.uuid);
	}

	levelAtIndex(i) {
		return this.levels[i].createGameLevel();
	}

	findHasUUID(uuid) {
		return this.levels.find(f => f.uuid === uuid) || null;
	}

	levelPassed(i) {
		return UserPrefs.levelPassed(this.levels[i].uuid, this.language.uuid);
	}

	levelExhausted(i) {
		return UserPrefs.levelExhausted(this.levels[i].uuid, this.language.uuid);
	}

	async start() {
		const lastLevelUUID = UserPrefs.getString(PK_LAST_LEVEL, '');
		let lastLevelIndex = -1, lastResortIndex = -1;
		for (let index = 0; index < this.levels.length; index++) {
			const uuid = this.levels[index].uuid;
			if (!UserPrefs.levelEnabled(uuid))
				continue;
			if (!this.levelPassed(index))
				return this.startLevel(index);
			lastResortIndex = index;
			if (uuid === lastLevelUUID)
				lastLevelIndex = index;
		}
		if (lastLevelIndex >= 0)
			return this.startLevel(lastLevelIndex);
		if (lastResortIndex >= 0)
			return this.startLevel(lastResortIndex);
		return this.startLevel(0);
	}

	async startLevel(index) {
		this.currentLevel = index;
		this.discardCurrentLevel();
		await this.startCurrentLevel(false);
	}

	async startCurrentLevel(continueCurrent) {
		let initialBlackList = null;
		if (continueCurrent && this.level)
			initialBlackList = this.level.validSelectedWords();
		this.discardCurrentLevel();
		if (this.languageInvalidated) {
			this.language = await LanguageManager.getNamedLanguage(this.language.uuid);
			this.languageInvalidated = false;
		}
		const factory = this.levels[this.currentLevel];
		if (!factory)
			return;
		const level = factory.createGameLevel();
		this.level = level;
		level.initialBlackList = initialBlackList;
		const token = this.startToken = {};
		await level.loadGame();
		if (this.startToken !== token || this.level !== level)
			return;		// superseded
		if (this.view)
			this.view.appendChild(level.viewWithFrame(this.levelFrame));
		level.eventsTarget = this;
		UserPrefs.setString(PK_LAST_LEVEL, level.uuid);
		level.timers.after(0.4, () => level.startGame());
		ScoresDatabase.reportLevelStarted(level);
		if (this.eventsTarget && this.eventsTarget.levelStarted)
			this.eventsTarget.levelStarted(this, level);
	}

	stop() {
		this.startToken = null;
		if (this.level) {
			const state = this.level.state;
			this.level.stopGame();
			if (state === DISPENSER_DONE)
				ScoresDatabase.reportLevelPassed(this.level);
			else
				ScoresDatabase.reportLevelAbandoned(this.level);
			this.discardCurrentLevel();
		}
		if (this.passedLevelEndMenu)
			ActionSheet.dismissAll();
		if (this.failedSplashPanel)
			this.failedSplashPanel.abort();
	}

	passedLevel(level, message, context) {
		if (!context) {
			UserPrefs.setLevelPassed(level.uuid, level.language.uuid, true);
			if (level.languageWordCount() - level.validSelectedWordCount() <= 0)
				UserPrefs.setLevelExhausted(level.uuid, level.language.uuid, true);
			ScoresDatabase.reportLevelPassed(level);
			import('./scorescomm.js').then(m => m.reportScoresQuietly());
			if (UserPrefs.cheat(CHEAT_AUTORUN)) {
				// autorun answers the level end menu by itself
				if (level.levelEndMenu && level.languageWordCount() - level.validSelectedWordCount() > level.levelEndContinueRemainingWordCountThreshold)
					context = PassedLevelEndMenuContext_ContinueLevel;
				else if (UserPrefs.cheat(CHEAT_AUTORUN_LEVEL_LOOP))
					context = PassedLevelEndMenuContext_RepeatLevel;
				else
					context = PassedLevelEndMenuContext_NextLevel;
			} else if (level.levelEndMenu) {
				this.showPassedLevelEndMenu(level);
				return;
			}
		}
		if (UserPrefs.levelPassed(level.uuid, level.language.uuid)) {
			const openLevels = level.props['open-levels'];
			if (Array.isArray(openLevels))
				for (const uuid of openLevels)
					UserPrefs.setLevelEnabled(uuid, true);
		}
		let continueCurrent = false;
		if (!context || context === PassedLevelEndMenuContext_NextLevel) {
			this.currentLevel++;
			if (this.currentLevel < this.levels.length)
				UserPrefs.setLevelEnabled(this.levels[this.currentLevel].uuid, true);
		} else if (context === PassedLevelEndMenuContext_RepeatLevel) {
			// same level again
		} else if (context === PassedLevelEndMenuContext_ContinueLevel)
			continueCurrent = true;
		else if (context === PassedLevelEndMenuContext_StopPlaying)
			this.currentLevel = this.levels.length;
		if (this.currentLevel < this.levels.length)
			this.startCurrentLevel(continueCurrent);
		else if (UserPrefs.cheat(CHEAT_AUTORUN_GAME_LOOP))
			this.startLevel(0);
		else {
			this.discardCurrentLevel();
			if (this.eventsTarget && this.eventsTarget.sequenceFinished)
				this.eventsTarget.sequenceFinished();
		}
	}

	// port of PassedLevelEndMenu
	showPassedLevelEndMenu(level) {
		const totalWords = level.languageWordCount();
		const doneWords = level.validSelectedWordCount();
		const remaining = totalWords - doneWords;
		const title = remaining ? `Completed ${doneWords} of ${totalWords} possible words` : `Completed all ${totalWords} possible words`;
		const buttons = [{ label: 'Move To Next Level', handler: () => this.passedLevel(level, null, PassedLevelEndMenuContext_NextLevel) }];
		if (remaining > level.levelEndContinueRemainingWordCountThreshold)
			buttons.push({ label: 'Play Remaining Words', handler: () => this.passedLevel(level, null, PassedLevelEndMenuContext_ContinueLevel) });
		this.passedLevelEndMenu = ActionSheet.show(title, buttons);
	}

	failedLevel(level, message, context) {
		ScoresDatabase.reportLevelFailed(level);
		import('./scorescomm.js').then(m => m.reportScoresQuietly());
		if (message && !UserPrefs.cheat(CHEAT_AUTORUN)) {
			const panel = new SplashPanel();
			panel.title = 'Level Failed';
			panel.text = message;
			panel.buttonText = 'OK';
			panel.delegate = { splashDidFinish: () => this.failedLevelBody() };
			this.failedSplashPanel = panel;
			panel.show();
		} else
			this.failedLevelBody();
	}

	failedLevelBody() {
		if (this.currentLevel < this.levels.length)
			this.startCurrentLevel(false);
		else if (UserPrefs.cheat(CHEAT_AUTORUN_GAME_LOOP))
			this.startLevel(0);
		else {
			this.discardCurrentLevel();
			if (this.eventsTarget && this.eventsTarget.sequenceFinished)
				this.eventsTarget.sequenceFinished();
		}
	}

	abortedLevel(level) {
		if (this.eventsTarget && this.eventsTarget.sequenceFinished)
			this.eventsTarget.sequenceFinished();
	}

	discardCurrentLevel() {
		if (this.level) {
			this.level.stopGame();
			this.level.dispose();
			this.level = null;
		}
	}

	invalidateLanguage() {
		this.languageInvalidated = true;
	}

	indexOfHighestPassedLevel() {
		for (let index = this.levels.length - 1; index >= 0; index--)
			if (this.levelPassed(index))
				return index;
		return -1;
	}
}

// ---------------------------------------------------------------- GameManager

let currentSequence = null;
let buildingSequence = null;

function rebuildSeqUPL(seq) {
	let upl = new UUIDPropsUPL(null, seq.props, null);
	const layers = seq.language && seq.language.props ? seq.language.props['game-props-layers'] : null;
	if (Array.isArray(layers))
		for (const layer of layers)
			for (const key of String(layer.key || '').split(','))
				if (key === '[Global]')
					upl = new UUIDPropsUPL(null, layer.props, upl);
	return upl;
}

export const GameManager = {
	async currentGameLevelSequence() {
		if (currentSequence)
			return currentSequence;
		if (!buildingSequence)
			buildingSequence = this.buildSequence().then(seq => {
				currentSequence = seq;
				buildingSequence = null;
				return seq;
			}, e => {
				buildingSequence = null;
				throw e;
			});
		return buildingSequence;
	},

	cachedSequence() {
		return currentSequence;
	},

	async buildSequence() {
		const language = await LanguageManager.getNamedLanguage(null);
		const langItem = Folders.find(DF_LANGUAGES, language.uuid);
		const langProps = langItem ? langItem.props : {};
		let gameUUID = null, gameProps = null, gameItem = null;
		if (langProps.game)
			gameUUID = langProps.game;
		else if (langProps['game-props']) {
			gameProps = langProps['game-props'];
			gameItem = langItem;
			gameUUID = gameProps.uuid || language.uuid;
		} else {
			const hasPictures = langItem && langItem.hasFolder('images');
			gameUUID = UserPrefs.getString(PK_LEVEL_SET, '') || (hasPictures ? GM_DEFAULT_GAME_PIC : GM_DEFAULT_GAME);
		}
		if (!gameProps) {
			gameItem = Folders.find(DF_GAMES, gameUUID);
			if (!gameItem) {
				console.warn('game not found', gameUUID, '- falling back to default');
				gameUUID = GM_DEFAULT_GAME;
				gameItem = Folders.find(DF_GAMES, gameUUID);
			}
			gameProps = gameItem ? gameItem.props : {};
		}
		const seq = new GameLevelSequence();
		seq.uuid = gameUUID;
		seq.gameItem = gameItem;
		seq.props = gameProps;
		seq.language = language;
		seq.title = langProps.name || language.name || gameProps.name || '';
		seq.gameTitle = gameProps.name || '';
		seq.upl = rebuildSeqUPL(seq);
		seq.shortDescription = seq.upl.getString('description', '');
		seq.helpSplashPanel = SplashPanel.fromProps(seq.upl.getObject('help-splash', null), null, gameItem);
		const enableAll = seq.upl.getBoolean('all-levels-open', false);
		for (const levelUUID of seq.upl.getObject('levels', []) || []) {
			let props;
			const levelItem = Folders.find(DF_LEVELS, levelUUID, gameUUID);
			if (levelItem)
				props = deepCopy(levelItem.props);
			else
				props = deepCopy(seq.upl.getObject(levelUUID, null) || {});
			props.uuid = levelUUID;
			const factory = new ParametricGameLevelFactory(props);
			factory.item = levelItem || gameItem;
			factory.seq = seq;
			seq.addLevel(factory);
		}
		if (seq.levelCount() > 0)
			UserPrefs.setLevelEnabled(seq.levelUUIDAtIndex(0), true);
		if (enableAll)
			for (let i = 0; i < seq.levelCount(); i++)
				UserPrefs.setLevelEnabled(seq.levelUUIDAtIndex(i), true);
		for (const index of seq.upl.getObject('levels-open', []) || [])
			if (index >= 0 && index < seq.levelCount())
				UserPrefs.setLevelEnabled(seq.levelUUIDAtIndex(index), true);
		// level help splash icons are relative to the level/game folder
		for (const f of seq.levels)
			if (f.props['help-splash'] && f.props['help-splash'].icon && f.item)
				f.props['help-splash'].__iconUrl = f.item.url(f.props['help-splash'].icon);
		return seq;
	},

	clearCache() {
		if (currentSequence) {
			currentSequence.stop();
		}
		currentSequence = null;
	},

	gameReady(seq, delegate) {
		const langProps = seq.language.props || {};
		const updatedOn = langProps['updated-on'];
		if (updatedOn === undefined || updatedOn !== 0)
			return true;
		const panel = new SplashPanel();
		panel.title = 'Game Not Ready';
		panel.text = langProps['please-update-message'] || '';
		panel.buttonText = 'OK';
		panel.delegate = delegate;
		panel.show();
		return false;
	}
};

// prefs keys of the form "<levelUUID>/key" resolve to the level's prefs-data
UserPrefs.setUUIDPropsResolver(uuid => {
	const seq = currentSequence || null;
	if (!seq)
		return null;
	const f = seq.findHasUUID(uuid);
	return f ? f.props : null;
});

UserPrefs.addListener(PK_LANG_DEFAULT, () => {
	const seq = currentSequence;
	const now = UserPrefs.getString(PK_LANG_DEFAULT, null);
	if (seq && seq.language && seq.language.uuid !== now)
		UserPrefs.setString(PK_LANG_DEFAULT_PREV, seq.language.uuid);
	GameManager.clearCache();
});
UserPrefs.addListener(PK_LEVEL_SET, () => GameManager.clearCache());
