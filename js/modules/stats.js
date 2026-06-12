/**
 * stats.js — Local statistics storage using localStorage
 * Kabert Studio – LMKE
 */

const KEY = 'notefall_stats';

const DEFAULT_STATS = {
  totalSessions:   0,
  totalPracticeMs: 0,
  bestScore:       0,
  bestAccuracy:    0,
  bestCombo:       0,
  sessions:        [],  // last 20 sessions
};

export class StatsManager {
  constructor() {
    this._data = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULT_STATS, ...JSON.parse(raw) } : { ...DEFAULT_STATS };
    } catch { return { ...DEFAULT_STATS }; }
  }

  _save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this._data));
    } catch {}
  }

  /** Record a completed session */
  recordSession(songName, sessionData) {
    const d = this._data;
    d.totalSessions++;
    d.totalPracticeMs += (sessionData.time ?? 0) * 1000;
    if (sessionData.score    > d.bestScore)    d.bestScore    = sessionData.score;
    if (sessionData.accuracy > d.bestAccuracy) d.bestAccuracy = sessionData.accuracy;
    if (sessionData.maxCombo > d.bestCombo)    d.bestCombo    = sessionData.maxCombo;

    d.sessions.unshift({
      songName,
      date:     new Date().toLocaleString('es', { dateStyle:'short', timeStyle:'short' }),
      ...sessionData,
    });
    if (d.sessions.length > 20) d.sessions.length = 20;
    this._save();
  }

  getAll() { return this._data; }

  formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  }

  clear() {
    this._data = { ...DEFAULT_STATS };
    this._save();
  }
}

/** Config persistence */
const CFG_KEY = 'notefall_config';
const DEFAULT_CFG = {
  sensitivity:  0.05,
  toleranceCents: 30,
  speed:        1,
  metronomeVol: 0.3,
  theme:        'neon',
  effects:      true,
};

export class ConfigStore {
  constructor() {
    this._cfg = this._load();
    this._applyTheme();
  }

  _load() {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      return raw ? { ...DEFAULT_CFG, ...JSON.parse(raw) } : { ...DEFAULT_CFG };
    } catch { return { ...DEFAULT_CFG }; }
  }

  save(updates) {
    this._cfg = { ...this._cfg, ...updates };
    try { localStorage.setItem(CFG_KEY, JSON.stringify(this._cfg)); } catch {}
    this._applyTheme();
  }

  get(key) { return this._cfg[key]; }
  getAll() { return { ...this._cfg }; }

  _applyTheme() {
    document.body.dataset.theme = this._cfg.theme ?? 'neon';
  }
}
