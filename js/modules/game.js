/**
 * game.js — Core game logic engine
 * Manages timing, scoring, note judgment, and session state
 * Kabert Studio – LMKE
 */

export const GRADE = Object.freeze({
  PERFECT: 'perfect',
  GREAT:   'great',
  GOOD:    'good',
  MISS:    'miss',
});

const POINTS = { perfect: 300, great: 200, good: 100, miss: 0 };

export class GameEngine {
  constructor(config = {}) {
    this.toleranceCents   = config.toleranceCents  ?? 30;
    this.perfectThreshold = 15;  // cents
    this.greatThreshold   = 30;  // cents

    this._reset();
  }

  _reset() {
    this.score       = 0;
    this.combo       = 0;
    this.maxCombo    = 0;
    this.perfect     = 0;
    this.great       = 0;
    this.good        = 0;
    this.miss        = 0;
    this.totalNotes  = 0;
    this.startTime   = null;
    this.elapsed     = 0;        // seconds
    this.running     = false;
    this.finished    = false;

    /** Pending note windows: { note, graded } */
    this._noteWindows = [];
    this._gradedIds   = new Set();
  }

  /** Prepare engine with loaded note list */
  init(notes, totalDurationSecs) {
    this._reset();
    this.totalNotes      = notes.length;
    this.durationSecs    = totalDurationSecs;
    this._notes          = notes;
  }

  /** Begin playback */
  start() {
    this.startTime = performance.now() / 1000;
    this.running   = true;
  }

  /** Pause – returns elapsed time */
  pause() {
    if (!this.running) return this.elapsed;
    this.running    = false;
    this._pauseAt   = performance.now() / 1000;
    return this.elapsed;
  }

  /** Resume after pause */
  resume() {
    if (this.running) return;
    const now = performance.now() / 1000;
    this.startTime += now - this._pauseAt;
    this.running = true;
  }

  /** Returns current song time in seconds */
  getTime() {
    if (!this.running) return this.elapsed;
    const now = performance.now() / 1000;
    this.elapsed = now - this.startTime;
    return this.elapsed;
  }

  /** Called by pitch detector on each new result */
  evaluate(pitchResult) {
    if (!this.running) return null;
    const now = this.getTime();

    // Find the active expected note
    const expected = this._getActiveNote(now);
    if (!expected) return null;

    const id = expected.time + '_' + expected.midi;
    if (this._gradedIds.has(id)) return null;

    let grade;

    if (!pitchResult.confident) {
      // No signal – will be judged miss at note end
      return null;
    }

    const detectedMidi = pitchResult.midi;
    if (detectedMidi === null) return null;

    if (detectedMidi !== expected.midi) {
      // Wrong note – but we only penalise at note expiry
      return null;
    }

    const absCents = Math.abs(pitchResult.cents);
    if (absCents <= this.perfectThreshold) {
      grade = GRADE.PERFECT;
    } else if (absCents <= this.greatThreshold) {
      grade = GRADE.GREAT;
    } else if (absCents <= this.toleranceCents) {
      grade = GRADE.GOOD;
    } else {
      grade = GRADE.GOOD; // still on pitch, just slightly off
    }

    this._applyGrade(expected, id, grade);
    return { note: expected, grade };
  }

  /** Tick – should be called every frame to expire missed notes */
  tick() {
    if (!this.running) return [];
    const now    = this.getTime();
    const missed = [];

    for (const note of this._notes) {
      const id      = note.time + '_' + note.midi;
      const expires = note.time + Math.max(note.duration, 0.15) + 0.1;
      if (expires > now) continue;
      if (this._gradedIds.has(id)) continue;

      // Note expired without being hit → miss
      this._applyGrade(note, id, GRADE.MISS);
      missed.push({ note, grade: GRADE.MISS });
    }

    // Check if song finished
    if (!this.finished && now > this.durationSecs + 1.5) {
      this.finished = true;
    }

    return missed;
  }

  _getActiveNote(time) {
    for (const note of this._notes) {
      const id = note.time + '_' + note.midi;
      if (this._gradedIds.has(id)) continue;
      if (time >= note.time && time < note.time + Math.max(note.duration, 0.15)) {
        return note;
      }
    }
    return null;
  }

  _applyGrade(note, id, grade) {
    this._gradedIds.add(id);
    note.hit = grade;

    const pts = POINTS[grade] ?? 0;
    if (grade !== GRADE.MISS) {
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    } else {
      this.combo = 0;
    }

    // Combo multiplier
    const mult = this._comboMultiplier();
    this.score += pts * mult;

    this[grade]++;
  }

  _comboMultiplier() {
    if (this.combo >= 100) return 4;
    if (this.combo >= 50)  return 3;
    if (this.combo >= 20)  return 2;
    return 1;
  }

  getAccuracy() {
    const graded = this.perfect + this.great + this.good + this.miss;
    if (graded === 0) return 100;
    return Math.round(
      ((this.perfect * 1 + this.great * 0.75 + this.good * 0.5) / graded) * 100
    );
  }

  getRank() {
    const acc = this.getAccuracy();
    if (acc >= 95 && this.miss === 0) return 'S+';
    if (acc >= 90) return 'S';
    if (acc >= 80) return 'A';
    if (acc >= 70) return 'B';
    if (acc >= 60) return 'C';
    return 'D';
  }

  getSessionData() {
    return {
      score:    Math.round(this.score),
      accuracy: this.getAccuracy(),
      maxCombo: this.maxCombo,
      perfect:  this.perfect,
      great:    this.great,
      good:     this.good,
      miss:     this.miss,
      time:     Math.round(this.elapsed),
      rank:     this.getRank(),
    };
  }
}
