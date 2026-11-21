// SpellMaze - local scores database (port of ScoresDatabase, minus the network reporting)

import { UserPrefs, PK_SCORE } from './prefs.js';
import { nowSecs, formatNumber } from './util.js';

const REPORT_LOG_KEY = 'reports-log';
const REPORT_LOG_MAX = 500;

class ScoresDatabaseImpl {
	constructor() {
		this.currentLevelUUID = null;
		this.currentLevelStartScore = 0;
		this.currentLevelStartedAt = 0;
	}
	currentScore() {
		return UserPrefs.getInteger(PK_SCORE, 0);
	}
	reportLevelStarted(level) {
		this.currentLevelUUID = level.uuid;
		this.currentLevelStartScore = this.currentScore();
		this.currentLevelStartedAt = nowSecs();
	}
	reportLevelPassed(level) {
		const score = this.reportLevelEvent(level, 'passed');
		if (score < 0)
			return;
		const lang = level.language.uuid, seq = level.seq ? level.seq.uuid : '', luuid = level.uuid;
		const add = (key) => UserPrefs.setInteger(key, UserPrefs.getInteger(key, 0) + score);
		add(`${PK_SCORE}_${lang}`);
		add(`${PK_SCORE}_${seq}`);
		add(`${PK_SCORE}_${seq}_${lang}`);
		add(`${PK_SCORE}_${luuid}`);
		add(`${PK_SCORE}_${luuid}_${lang}`);
		const now = nowSecs();
		for (const key of [`${PK_SCORE}_${luuid}_max`, `${PK_SCORE}_${luuid}_${lang}_max`]) {
			if (score > UserPrefs.getInteger(key, 0)) {
				UserPrefs.setInteger(key, score);
				UserPrefs.setInteger(key + '_when', now);
			}
		}
		if (level.seq) {
			UserPrefs.setInteger(`${PK_SCORE}_${seq}_best`, this.calcBestGameScore(level.seq, null));
			UserPrefs.setInteger(`${PK_SCORE}_${seq}_${lang}_best`, this.calcBestGameScore(level.seq, lang));
		}
	}
	reportLevelFailed(level) {
		this.reportLevelEvent(level, 'failed');
	}
	reportLevelAbandoned(level) {
		this.reportLevelEvent(level, 'aborted');
	}
	reportLevelEvent(level, type) {
		let scoreDelta = 0;
		let report;
		const timeDelta = nowSecs() - this.currentLevelStartedAt;
		if (!level)
			report = [type, '', '', '', nowSecs(), timeDelta, 0, 0];
		else {
			if (level.uuid !== this.currentLevelUUID)
				return -1;
			scoreDelta = this.currentScore() - this.currentLevelStartScore;
			report = [type, level.uuid, level.seq ? level.seq.uuid : '', level.language.uuid,
				this.currentLevelStartedAt, timeDelta, this.currentLevelStartScore, scoreDelta];
		}
		const log = UserPrefs.getArray(REPORT_LOG_KEY, []).slice(-REPORT_LOG_MAX + 1);
		log.push(report.join(','));
		UserPrefs.setObject(REPORT_LOG_KEY, log);
		return scoreDelta;
	}
	globalScore() {
		return this.currentScore();
	}
	scoreForLanguage(lang) { return UserPrefs.getInteger(`${PK_SCORE}_${lang}`, 0); }
	scoreForGame(seq, lang) { return UserPrefs.getInteger(lang ? `${PK_SCORE}_${seq}_${lang}` : `${PK_SCORE}_${seq}`, 0); }
	bestScoreForGame(seq, lang) { return UserPrefs.getInteger(lang ? `${PK_SCORE}_${seq}_${lang}_best` : `${PK_SCORE}_${seq}_best`, 0); }
	scoreForLevel(level, lang) { return UserPrefs.getInteger(lang ? `${PK_SCORE}_${level}_${lang}` : `${PK_SCORE}_${level}`, 0); }
	maxScoreForLevel(level, lang) { return UserPrefs.getInteger(lang ? `${PK_SCORE}_${level}_${lang}_max` : `${PK_SCORE}_${level}_max`, 0); }
	calcBestGameScore(seq, langUUID) {
		let score = 0;
		for (const level of seq.allLevelUUIDs())
			score += this.maxScoreForLevel(level, langUUID);
		return score;
	}
	format(n) {
		return formatNumber(n);
	}
}

export const ScoresDatabase = new ScoresDatabaseImpl();
