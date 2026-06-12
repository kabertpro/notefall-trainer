/**
 * renderer.js — NoteFall Canvas 2D rendering engine
 * Synthesia-style falling notes + piano keyboard + effects
 * Kabert Studio – LMKE
 */

const PIANO_NOTE_COUNT  = 88;   // A0 (MIDI 21) → C8 (MIDI 108)
const PIANO_START_MIDI  = 21;
const LOOK_AHEAD_SECS   = 4;    // seconds of notes visible above hit line
const HIT_LINE_RATIO    = 0.88; // hit line at 88% height

export class NoteFallRenderer {
  constructor(canvasId, pianoCanvasId) {
    this.canvas      = document.getElementById(canvasId);
    this.pianoCanvas = document.getElementById(pianoCanvasId);
    this.ctx         = this.canvas.getContext('2d');
    this.pianoCtx    = this.pianoCanvas.getContext('2d');

    this.notes       = [];        // All MIDI notes from engine
    this.currentTime = 0;
    this.speed       = 1;
    this.showEffects = true;
    this.activeMidi  = null;      // Highlighted piano key
    this.particles   = [];        // Hit particle effects

    this._raf      = null;
    this._running  = false;
    this._lastTs   = null;

    this._keyboardLayout = this._buildKeyboard();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  // ── Public API ──────────────────────────────────────────────────────────

  start(notes) {
    this.notes = notes;
    this._running = true;
    this._lastTs  = null;
    this._raf     = requestAnimationFrame(ts => this._frame(ts));
  }

  stop() {
    this._running = false;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  setTime(t)         { this.currentTime = t; }
  setSpeed(s)        { this.speed = s; }
  setActiveMidi(m)   { this.activeMidi = m; }
  setShowEffects(v)  { this.showEffects = v; }

  spawnHitEffect(x, y, grade) {
    if (!this.showEffects) return;
    const colors = { perfect:'#69ff47', great:'#00e5ff', good:'#ffea00', miss:'#ff4081' };
    const color  = colors[grade] || '#fff';
    for (let i = 0; i < (grade === 'miss' ? 4 : 12); i++) {
      const angle = (Math.PI * 2 * i) / 12;
      const speed = 1.5 + Math.random() * 2.5;
      this.particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1,
        life: 1, color, size: 3 + Math.random() * 3,
      });
    }
  }

  // ── Internal ────────────────────────────────────────────────────────────

  _frame(ts) {
    if (!this._running) return;
    this._raf = requestAnimationFrame(t => this._frame(t));
    this._render();
  }

  _render() {
    this._drawBackground();
    this._drawGridLines();
    this._drawNotes();
    this._drawHitLine();
    this._drawParticles();
    this._drawPiano();
  }

  _drawBackground() {
    const { ctx, canvas } = this;
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  _drawGridLines() {
    const { ctx, canvas } = this;
    const hitY = canvas.height * HIT_LINE_RATIO;

    // Subtle vertical lane dividers at octave boundaries (C notes)
    ctx.strokeStyle = 'rgba(124,77,255,0.06)';
    ctx.lineWidth = 1;
    for (let midi = PIANO_START_MIDI; midi <= 108; midi++) {
      if (midi % 12 === 0) { // C notes
        const x = this._midiToX(midi);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, hitY);
        ctx.stroke();
      }
    }

    // Horizontal time markers every second
    const pxPerSec = hitY / LOOK_AHEAD_SECS;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let s = 1; s <= LOOK_AHEAD_SECS; s++) {
      const y = hitY - s * pxPerSec;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  _drawNotes() {
    const { ctx, canvas } = this;
    const hitY       = canvas.height * HIT_LINE_RATIO;
    const pxPerSec   = hitY / LOOK_AHEAD_SECS;
    const now        = this.currentTime;
    const windowEnd  = now + LOOK_AHEAD_SECS;

    // Only draw notes visible in window
    for (const note of this.notes) {
      if (note.time > windowEnd) continue;
      if (note.time + note.duration < now - 0.5) continue;

      const noteW  = Math.max(this._noteWidth() - 2, 4);
      const x      = this._midiToX(note.midi) - noteW / 2;

      // Y: top of note block
      const topY   = hitY - (note.time + note.duration - now) * pxPerSec;
      const botY   = hitY - (note.time - now) * pxPerSec;
      const noteH  = Math.max(botY - topY, 6);

      // Color based on grade if hit, else track color
      let color = note.color;
      let alpha = 1;
      if (note.hit === 'perfect') color = '#69ff47';
      else if (note.hit === 'great') color = '#00e5ff';
      else if (note.hit === 'good')  color = '#ffea00';
      else if (note.hit === 'miss')  { color = '#ff4081'; alpha = 0.5; }

      // Glow
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = color;
      ctx.shadowBlur  = 12;

      // Rounded rect note block
      const r = Math.min(4, noteW / 2, noteH / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, topY);
      ctx.lineTo(x + noteW - r, topY);
      ctx.quadraticCurveTo(x + noteW, topY, x + noteW, topY + r);
      ctx.lineTo(x + noteW, topY + noteH - r);
      ctx.quadraticCurveTo(x + noteW, topY + noteH, x + noteW - r, topY + noteH);
      ctx.lineTo(x + r, topY + noteH);
      ctx.quadraticCurveTo(x, topY + noteH, x, topY + noteH - r);
      ctx.lineTo(x, topY + r);
      ctx.quadraticCurveTo(x, topY, x + r, topY);
      ctx.closePath();

      // Gradient fill
      const grad = ctx.createLinearGradient(x, topY, x, topY + noteH);
      grad.addColorStop(0, this._lighten(color, 0.3));
      grad.addColorStop(1, color);
      ctx.fillStyle = grad;
      ctx.fill();

      // Border
      ctx.strokeStyle = this._lighten(color, 0.6);
      ctx.lineWidth   = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawHitLine() {
    const { ctx, canvas } = this;
    const hitY = canvas.height * HIT_LINE_RATIO;

    // Glow line
    ctx.save();
    ctx.shadowColor = '#7c4dff';
    ctx.shadowBlur  = 20;
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0,   'transparent');
    grad.addColorStop(0.1, 'rgba(124,77,255,0.8)');
    grad.addColorStop(0.9, 'rgba(0,229,255,0.8)');
    grad.addColorStop(1,   'transparent');
    ctx.strokeStyle = grad;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(0, hitY);
    ctx.lineTo(canvas.width, hitY);
    ctx.stroke();
    ctx.restore();
  }

  _drawParticles() {
    if (!this.showEffects) return;
    const { ctx } = this;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= 0.04;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  _drawPiano() {
    const { pianoCtx: ctx, pianoCanvas: canvas, _keyboardLayout: keys } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const W = canvas.width;
    const H = canvas.height;
    const whitesCount = keys.filter(k => !k.isBlack).length;
    const whiteW = W / whitesCount;
    const whiteH = H;
    const blackW = whiteW * 0.6;
    const blackH = H * 0.62;

    // Background
    ctx.fillStyle = '#06060d';
    ctx.fillRect(0, 0, W, H);

    // White keys first
    keys.forEach(key => {
      if (key.isBlack) return;
      const x = key.whiteIndex * whiteW;
      const isActive = key.midi === this.activeMidi;

      const grad = ctx.createLinearGradient(x, 0, x, whiteH);
      if (isActive) {
        grad.addColorStop(0, '#c8a0ff');
        grad.addColorStop(1, '#7c4dff');
      } else {
        grad.addColorStop(0, '#e8e8ef');
        grad.addColorStop(1, '#c8c8d5');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(x + 1, 0, whiteW - 2, whiteH);

      if (isActive) {
        ctx.shadowColor = '#7c4dff';
        ctx.shadowBlur  = 16;
      }

      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth   = 1;
      ctx.strokeRect(x + 1, 0, whiteW - 2, whiteH);
      ctx.shadowBlur  = 0;
    });

    // Black keys on top
    keys.forEach(key => {
      if (!key.isBlack) return;
      const whiteKey = keys.find(k => !k.isBlack && k.midi === key.leftWhite);
      if (!whiteKey) return;
      const x  = whiteKey.whiteIndex * whiteW + whiteW - blackW / 2;
      const isActive = key.midi === this.activeMidi;

      const grad = ctx.createLinearGradient(x, 0, x, blackH);
      if (isActive) {
        grad.addColorStop(0, '#a07aff');
        grad.addColorStop(1, '#5a20c0');
      } else {
        grad.addColorStop(0, '#2a2a3a');
        grad.addColorStop(1, '#111120');
      }
      ctx.fillStyle = grad;
      ctx.save();
      if (isActive) { ctx.shadowColor = '#7c4dff'; ctx.shadowBlur = 12; }
      ctx.fillRect(x, 0, blackW, blackH);
      ctx.restore();
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  _noteWidth() {
    const whitesCount = this._keyboardLayout.filter(k => !k.isBlack).length;
    return (this.canvas.width / whitesCount) * 0.85;
  }

  _midiToX(midi) {
    const key = this._keyboardLayout.find(k => k.midi === midi);
    if (!key) return this.canvas.width / 2;
    const whitesCount = this._keyboardLayout.filter(k => !k.isBlack).length;
    const whiteW = this.canvas.width / whitesCount;
    if (!key.isBlack) {
      return key.whiteIndex * whiteW + whiteW / 2;
    } else {
      const leftKey = this._keyboardLayout.find(k => !k.isBlack && k.midi === key.leftWhite);
      if (!leftKey) return 0;
      return leftKey.whiteIndex * whiteW + whiteW;
    }
  }

  _buildKeyboard() {
    // Maps MIDI numbers to keyboard positions
    const blackPattern = [false,true,false,true,false,false,true,false,true,false,true,false];
    // leftWhite: the white key to the left of a black key (for positioning)
    const leftWhiteMap = { 1:0, 3:2, 6:5, 8:7, 10:9 }; // semitone offset

    const keys = [];
    let whiteIndex = 0;
    for (let midi = PIANO_START_MIDI; midi <= 108; midi++) {
      const semitone = midi % 12;
      const isBlack  = blackPattern[semitone];
      const key = { midi, isBlack };
      if (!isBlack) {
        key.whiteIndex = whiteIndex++;
      } else {
        const offset = leftWhiteMap[semitone];
        if (offset !== undefined) {
          key.leftWhite = midi - semitone + offset;
        }
      }
      keys.push(key);
    }
    return keys;
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    // Main canvas
    if (this.canvas) {
      const r = this.canvas.getBoundingClientRect();
      this.canvas.width  = r.width  * dpr;
      this.canvas.height = r.height * dpr;
      this.ctx.scale(dpr, dpr);
      // reset scale trick — just scale once on first call
    }
    if (this.pianoCanvas) {
      const r = this.pianoCanvas.getBoundingClientRect();
      this.pianoCanvas.width  = r.width  * dpr;
      this.pianoCanvas.height = r.height * dpr;
      this.pianoCtx.scale(dpr, dpr);
    }
  }

  _lighten(hex, amount) {
    // Simple hex lighten
    const num = parseInt(hex.replace('#',''), 16);
    const r = Math.min(255, (num >> 16) + Math.round(255 * amount));
    const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * amount));
    const b = Math.min(255, (num & 0xff) + Math.round(255 * amount));
    return `rgb(${r},${g},${b})`;
  }
}

// ── Splash/Menu particle system ─────────────────────────────────────────

export class ParticleField {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx    = this.canvas.getContext('2d');
    this.parts  = [];
    this._raf   = null;
    this._active = false;
    this._resize();
    this._populate();
    window.addEventListener('resize', () => { this._resize(); this._populate(); });
  }

  start() {
    this._active = true;
    this._raf = requestAnimationFrame(() => this._tick());
  }

  stop() {
    this._active = false;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  _populate() {
    if (!this.canvas) return;
    this.parts = [];
    const n = Math.floor((this.canvas.width * this.canvas.height) / 8000);
    const symbols = ['♪','♫','♩','♬','♭','♮','♯'];
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x:     Math.random() * this.canvas.width,
        y:     Math.random() * this.canvas.height,
        vx:    (Math.random() - 0.5) * 0.4,
        vy:   -0.3 - Math.random() * 0.5,
        alpha: 0.05 + Math.random() * 0.15,
        size:  10 + Math.random() * 16,
        sym:   symbols[Math.floor(Math.random() * symbols.length)],
        hue:   Math.random() * 60 + 250, // purples/cyans
      });
    }
  }

  _tick() {
    if (!this._active || !this.canvas) return;
    this._raf = requestAnimationFrame(() => this._tick());
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of this.parts) {
      p.x += p.vx; p.y += p.vy;
      if (p.y < -20)  p.y = canvas.height + 20;
      if (p.x < -20)  p.x = canvas.width  + 20;
      if (p.x > canvas.width + 20)  p.x = -20;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle   = `hsl(${p.hue},80%,70%)`;
      ctx.font        = `${p.size}px serif`;
      ctx.fillText(p.sym, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  _resize() {
    if (!this.canvas) return;
    this.canvas.width  = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
  }
}
