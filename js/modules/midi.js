/**
 * midi.js — MIDI file loading and parsing
 * Uses @tonejs/midi (loaded via CDN as window.Midi)
 * Kabert Studio – LMKE
 */

export class MidiEngine {
  constructor() {
    /** @type {object|null} Parsed Midi object from @tonejs/midi */
    this.midi = null;
    /** Flat array of all note events, sorted by time */
    this.notes = [];
    this.bpm = 120;
    this.durationSeconds = 0;
    this.name = 'Sin título';
    this.trackColors = [
      '#7c4dff','#00e5ff','#ff4081','#69ff47',
      '#ffea00','#ff6d00','#e040fb','#00bcd4'
    ];
  }

  /**
   * Load and parse a MIDI File object.
   * @param {File} file
   * @returns {Promise<object>} info summary
   */
  async loadFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target.result;
          // @tonejs/midi is loaded globally as Midi via CDN
          const MidiClass = window.Midi || (window['@tonejs/midi'] && window['@tonejs/midi'].Midi);
          if (!MidiClass) throw new Error('Librería MIDI no disponible');
          this.midi = new MidiClass(arrayBuffer);
          this._buildNoteList();
          resolve(this._getSummary());
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Error leyendo archivo'));
      reader.readAsArrayBuffer(file);
    });
  }

  /** Internal: flatten all tracks into a single sorted note array */
  _buildNoteList() {
    this.notes = [];
    if (!this.midi) return;

    // BPM from first tempo event
    this.bpm = Math.round(this.midi.header.tempos[0]?.bpm || 120);
    this.durationSeconds = this.midi.duration;
    this.name = this.midi.name || 'Sin título';

    this.midi.tracks.forEach((track, trackIdx) => {
      const color = this.trackColors[trackIdx % this.trackColors.length];
      track.notes.forEach(n => {
        this.notes.push({
          midi:     n.midi,
          name:     n.name,          // e.g. "C4"
          octave:   n.octave,
          time:     n.time,          // seconds
          duration: n.duration,      // seconds
          velocity: n.velocity,
          trackIdx,
          color,
          hit:      null,            // null | 'perfect' | 'great' | 'good' | 'miss'
        });
      });
    });

    // Sort by start time
    this.notes.sort((a, b) => a.time - b.time);
  }

  /** Summary info for display */
  _getSummary() {
    if (!this.midi) return {};
    const tracks = this.midi.tracks.filter(t => t.notes.length > 0);
    return {
      name:      this.name,
      bpm:       this.bpm,
      duration:  this.durationSeconds.toFixed(1),
      tracks:    tracks.length,
      totalNotes:this.notes.length,
      timeSignature: this.midi.header.timeSignatures[0]
        ? `${this.midi.header.timeSignatures[0].timeSignature[0]}/${this.midi.header.timeSignatures[0].timeSignature[1]}`
        : '4/4',
    };
  }

  /** Return all notes scheduled within a time window [start, end] */
  getNotesInWindow(start, end) {
    return this.notes.filter(n => n.time >= start && n.time < end);
  }

  /** Return the active (expected) note at a given time */
  getActiveNoteAt(time) {
    return this.notes.find(n =>
      time >= n.time && time < n.time + Math.max(n.duration, 0.15)
    ) || null;
  }
}

/**
 * MIDI note number → frequency in Hz
 * Standard: A4 = 440 Hz = MIDI 69
 */
export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Frequency (Hz) → MIDI note number (float)
 */
export function freqToMidi(freq) {
  if (freq <= 0) return null;
  return 69 + 12 * Math.log2(freq / 440);
}

/**
 * MIDI float → nearest integer MIDI + cents deviation
 * @returns {{ midi: number, cents: number }}
 */
export function midiToPitchInfo(midiFloat) {
  const nearest = Math.round(midiFloat);
  const cents   = (midiFloat - nearest) * 100;
  return { midi: nearest, cents };
}

/** MIDI integer → note name string (e.g. 60 → "C4") */
export function midiToNoteName(midi) {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const octave = Math.floor(midi / 12) - 1;
  const name   = names[midi % 12];
  return `${name}${octave}`;
}
