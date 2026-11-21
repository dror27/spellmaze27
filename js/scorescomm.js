// SpellMaze - shared score board client (port of ScoresComm). The server lives in scores-server/.

import { Folders } from './folders.js';
import { UserPrefs, PK_IDENTITY_UUID, scoreAffectingCheats } from './prefs.js';
import { ScoresDatabase } from './scores.js';
import { GameManager } from './sequence.js';
import { createUUID } from './util.js';

export const NSEP_VERSION = '0.3';
export const PK_NSEP_RESPONSE = 'nsep-response-0';
export const PK_IDENTITY_NICK = 'pref_scoring_nickname';
export const PK_IDENTITY_ICON = 'pref_scoring_icon';

export const SCORES_TYPE_GLOBAL = 'global';
export const SCORES_TYPE_GAME = 'game_language';
export const SCORES_TYPE_MY_GLOBAL = 'my_global';
export const SCORES_TYPE_MY_GAME = 'my_game_language';

export function userIdentity() {
	let uuid = UserPrefs.getString(PK_IDENTITY_UUID, null);
	if (!uuid) {
		uuid = createUUID();
		UserPrefs.setString(PK_IDENTITY_UUID, uuid);
	}
	return uuid;
}

export function userNick() {
	const nick = UserPrefs.getString(PK_IDENTITY_NICK, '').split('/')[0].trim();
	return nick || `Player-${userIdentity().slice(0, 4)}`;
}

export function scoresAvailable() {
	return !!Folders.scoresUrl;
}

export class ScoresComm {
	constructor() {
		this.type = this.typeOrder()[0];
	}
	typeOrder() {
		const order = UserPrefs.getArray('scores-order', null);
		return order && order.length ? order : [SCORES_TYPE_GAME, SCORES_TYPE_MY_GAME, SCORES_TYPE_GLOBAL, SCORES_TYPE_MY_GLOBAL];
	}
	advanceTypeToNext() {
		const order = this.typeOrder();
		const index = order.indexOf(this.type);
		this.type = order[index >= 0 && index < order.length - 1 ? index + 1 : 0];
	}
	isOnFirstType() {
		return this.typeOrder().indexOf(this.type) === 0;
	}
	title(seq) {
		if (this.type.includes('global'))
			return 'SpellMaze';
		return seq ? seq.title : '';
	}
	subTitle() {
		const order = this.typeOrder();
		const index = order.indexOf(this.type);
		return `${index + 1}/${order.length} - ${this.type.startsWith('my_') ? 'Your Scores' : 'High Scores'}`;
	}
	buildRequest(seq) {
		const game = seq.uuid, language = seq.language.uuid;
		const sdb = ScoresDatabase;
		return {
			version: NSEP_VERSION,
			program: '1329C440-7782-4F3D-A39C-0C9F5E482C38',
			game,
			'game-toplevel': seq.indexOfHighestPassedLevel(),
			language,
			identity: userIdentity(),
			'identity-nick': userNick(),
			'identity-icon': UserPrefs.getString(PK_IDENTITY_ICON, ''),
			locale: navigator.language || '',
			'query-type': this.type,
			// scores made with score-affecting cheats are kept off the shared board (the board is still shown)
			'games-scores': scoreAffectingCheats().length ? [] : [
				{ type: 'global', score: sdb.boardGlobalScore() },
				{ type: 'game', score: sdb.boardBestScoreForGame(seq, null) },
				{ type: 'language', score: sdb.boardScoreForLanguage(language) },
				{ type: 'game_language', score: sdb.boardBestScoreForGame(seq, language) }
			]
		};
	}
	// returns the response (with title/sub-title added) or throws
	async fetchScoreResponse(seq) {
		if (!Folders.scoresUrl)
			throw new Error('no score board server configured');
		const resp = await fetch(Folders.scoresUrl.replace(/\/+$/, '') + '/v1/scores', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(this.buildRequest(seq))
		});
		const data = await resp.json();
		if (!resp.ok || data.error)
			throw new Error(data.error || `HTTP ${resp.status}`);
		data.title = this.title(seq);
		data['sub-title'] = this.subTitle();
		const cheats = scoreAffectingCheats();
		if (cheats.length)
			data['sub-title'] += ` - not sent: cheats on (${cheats.join(', ')})`;
		return data;
	}
}

// report the scores in the background (after passing a level), so the board stays current
let reporting = false;
export async function reportScoresQuietly() {
	if (!Folders.scoresUrl || reporting || scoreAffectingCheats().length)
		return;
	reporting = true;
	try {
		const seq = GameManager.cachedSequence() || await GameManager.currentGameLevelSequence();
		const comm = new ScoresComm();
		await comm.fetchScoreResponse(seq);
	} catch (e) {
		console.warn('score report failed:', e.message);
	} finally {
		reporting = false;
	}
}
