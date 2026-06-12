/**
 * main.js — NoteFall Trainer application entry point
 * Orchestrates all modules: Splash, Menu, Game, Audio, Rendering
 * Kabert Studio – LMKE
 */

import { MidiEngine }       from './modules/midi.js';
import { PitchDetector }    from './modules/pitch.js';
import { NoteFallRenderer, ParticleField } from './modules/renderer.js';
import { GameEngine }       from './modules/game.js';
import { StatsManager, ConfigStore } from './modules/stats.js';

// ── Module instances ──────────────────────────────────────────────────────
const midi     = new MidiEngine();
const pitch    = new PitchDetector();
const stats    = new StatsManager();
const cfg      = new ConfigStore();

let renderer   = null;   // Created when game screen appears
let game       = null;
let menuParticles   = null;
let splashParticles = null;
let gameLoopId = null;

// ── Splash screen ─────────────────────────────────────────────────────────
(function initSplash() {
  const splash     = document.getElementById('splash-screen');
  const fill       = document.getElementById('loading-fill');
  const loadTxt    = document.getElementById('loading-text');
  const skipBtn    = document.getElementById('skip-btn');

  const messages = [
    'Cargando motor de audio…',
    'Inicializando detector de tono…',
    'Preparando notas…',
    'Listo para entrenar',
  ];

  splashParticles = new ParticleField('particles-canvas');
  splashParticles.start();

  let step = 0;
  const advance = () => {
    if (step >= messages.length) return;
    fill.style.width    = `${((step + 1) / messages.length) * 100}%`;
    loadTxt.textContent = messages[step];
    step++;
  };

  const timings = [400, 800, 600, 500];
  let delay = 0;
  timings.forEach((t, i) => {
    delay += t;
    setTimeout(() => { advance(); if (i === timings.length - 1) setTimeout(goToMenu, 700); }, delay);
  });

  skipBtn.addEventListener('click', goToMenu);

  function goToMenu() {
    splash.classList.add('fade-out');
    splashParticles.stop();
    setTimeout(() => {
      splash.classList.add('hidden');
      showScreen('main-menu');
    }, 800);
  }
})();

// ── Screen management ─────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');

  if (id === 'main-menu') {
    if (!menuParticles) {
      menuParticles = new ParticleField('menu-particles');
    }
    menuParticles.start();
  } else {
    menuParticles?.stop();
  }
}

function showModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
}
function hideModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

// ── Main menu buttons ─────────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', () => {
  if (!midi.notes.length) {
    alert('Por favor carga primero un archivo MIDI.');
    return;
  }
  startGame();
});

document.getElementById('btn-load-midi').addEventListener('click', () => {
  document.getElementById('midi-file-input').click();
});

document.getElementById('midi-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const info = await midi.loadFile(file);
    showMidiPreview(info);
  } catch (err) {
    alert('Error al leer el archivo MIDI: ' + err.message);
  }
  e.target.value = '';
});

function showMidiPreview(info) {
  const el = document.getElementById('midi-info-preview');
  el.innerHTML = `
    <div class="mp-title">♪ ${info.name || 'Sin nombre'}</div>
    <div class="mp-row"><span>BPM</span><span class="mp-val">${info.bpm}</span></div>
    <div class="mp-row"><span>Duración</span><span class="mp-val">${info.duration}s</span></div>
    <div class="mp-row"><span>Pistas</span><span class="mp-val">${info.tracks}</span></div>
    <div class="mp-row"><span>Notas totales</span><span class="mp-val">${info.totalNotes}</span></div>
    <div class="mp-row"><span>Compás</span><span class="mp-val">${info.timeSignature}</span></div>
  `;
  el.classList.remove('hidden');
}

document.getElementById('btn-config').addEventListener('click', () => {
  loadConfigUI();
  showModal('config-modal');
});
document.getElementById('btn-stats').addEventListener('click', () => {
  loadStatsUI();
  showModal('stats-modal');
});
document.getElementById('btn-help').addEventListener('click', ()    => showModal('help-modal'));
document.getElementById('btn-credits').addEventListener('click', () => showModal('credits-modal'));

// Modal close buttons
['config','stats','help','credits'].forEach(name => {
  document.getElementById(`btn-${name}-close`)?.addEventListener('click', () => hideModal(`${name}-modal`));
});

// ── Config UI ─────────────────────────────────────────────────────────────
function loadConfigUI() {
  const c = cfg.getAll();
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('cfg-sensitivity', c.sensitivity);
  set('cfg-tolerance',   c.toleranceCents);
  set('cfg-speed',       c.speed);
  set('cfg-metronome',   c.metronomeVol);
  set('cfg-theme',       c.theme);
  document.getElementById('cfg-effects').checked = c.effects;
  updateCfgLabels();
}

function updateCfgLabels() {
  const pairs = [
    ['cfg-sensitivity', 'cfg-sensitivity-val', v => v],
    ['cfg-tolerance',   'cfg-tolerance-val',   v => v + '¢'],
    ['cfg-speed',       'cfg-speed-val',        v => v + '×'],
    ['cfg-metronome',   'cfg-metronome-val',    v => v],
  ];
  pairs.forEach(([inputId, labelId, fmt]) => {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (input && label) {
      label.textContent = fmt(input.value);
      input.addEventListener('input', () => label.textContent = fmt(input.value));
    }
  });
}

document.getElementById('btn-config-save')?.addEventListener('click', () => {
  cfg.save({
    sensitivity:    parseFloat(document.getElementById('cfg-sensitivity').value),
    toleranceCents: parseInt(document.getElementById('cfg-tolerance').value),
    speed:          parseFloat(document.getElementById('cfg-speed').value),
    metronomeVol:   parseFloat(document.getElementById('cfg-metronome').value),
    theme:          document.getElementById('cfg-theme').value,
    effects:        document.getElementById('cfg-effects').checked,
  });
  // Update running pitch detector
  pitch.sensitivity = cfg.get('sensitivity');
  if (game) game.toleranceCents = cfg.get('toleranceCents');
  hideModal('config-modal');
});

// ── Stats UI ──────────────────────────────────────────────────────────────
function loadStatsUI() {
  const data = stats.getAll();
  const container = document.getElementById('stats-content');
  const rows = [
    ['Sesiones totales',     data.totalSessions],
    ['Tiempo de práctica',   stats.formatTime(data.totalPracticeMs)],
    ['Mejor puntuación',     data.bestScore.toLocaleString()],
    ['Mejor precisión',      data.bestAccuracy + '%'],
    ['Mejor combo',          data.bestCombo + '×'],
  ];
  let html = rows.map(([k,v]) =>
    `<div class="stat-row"><span class="stat-key">${k}</span><span class="stat-val">${v}</span></div>`
  ).join('');

  if (data.sessions.length > 0) {
    html += `<div class="session-list"><h3 style="color:var(--accent2);font-size:13px;margin:12px 0 6px;font-family:var(--font-display);letter-spacing:.05em">Historial reciente</h3>`;
    data.sessions.slice(0, 8).forEach(s => {
      html += `<div class="session-item">${s.date} — <strong>${s.songName || '—'}</strong> | ${s.score} pts | ${s.accuracy}% | Rango ${s.rank}</div>`;
    });
    html += `</div>`;
  } else {
    html += `<p style="color:var(--text2);font-size:13px;margin-top:12px">Aún no hay sesiones registradas.</p>`;
  }
  container.innerHTML = html;
}

// ── Game start ────────────────────────────────────────────────────────────
async function startGame() {
  showScreen('game-screen');
  hideModal('pause-modal');
  hideModal('results-modal');

  // Init renderer (lazily)
  if (!renderer) {
    renderer = new NoteFallRenderer('notefall-canvas', 'piano-canvas');
  }
  renderer.setShowEffects(cfg.get('effects'));
  renderer.setSpeed(cfg.get('speed'));

  // Reset game engine
  game = new GameEngine({ toleranceCents: cfg.get('toleranceCents') });
  game.init(midi.notes, midi.durationSeconds);

  // Update HUD
  document.getElementById('song-name-display').textContent = midi.name || '—';
  updateHUD();

  // Start renderer
  renderer.start(midi.notes);

  // Start game clock
  game.start();

  // Start audio
  pitch.sensitivity = cfg.get('sensitivity');
  try {
    await pitch.start();
  } catch (err) {
    console.warn('Micrófono no disponible:', err);
  }

  // Register pitch callback
  pitch.onResult((result) => {
    if (!game?.running) return;
    updatePitchUI(result);
    const hit = game.evaluate(result);
    if (hit) {
      triggerHitFeedback(hit.grade);
      spawnHitParticles(hit.note, hit.grade);
    }
    renderer.setActiveMidi(result.confident ? result.midi : null);
    updateHUD();
  });

  // Game loop ticker
  if (gameLoopId) clearInterval(gameLoopId);
  gameLoopId = setInterval(() => {
    if (!game?.running) return;

    renderer.setTime(game.getTime());

    const missed = game.tick();
    missed.forEach(({ note, grade }) => {
      triggerHitFeedback(grade);
      spawnHitParticles(note, grade);
    });

    updateHUD();

    if (game.finished) {
      clearInterval(gameLoopId);
      endGame();
    }
  }, 16);
}

// ── HUD updates ───────────────────────────────────────────────────────────
function updateHUD() {
  if (!game) return;
  document.getElementById('score-display').textContent    = Math.round(game.score).toLocaleString();
  document.getElementById('accuracy-display').textContent = game.getAccuracy() + '%';
  document.getElementById('combo-display').textContent    = game.combo + '×';
}

// ── Pitch UI ──────────────────────────────────────────────────────────────
function updatePitchUI(result) {
  const noteEl   = document.getElementById('pf-note');
  const centsEl  = document.getElementById('pf-cents');
  const needleEl = document.getElementById('pf-needle');
  const statusEl = document.getElementById('pf-status');

  noteEl.textContent = result.noteName || '—';

  if (!result.confident) {
    centsEl.textContent   = '0¢';
    needleEl.style.left   = '50%';
    statusEl.textContent  = 'Esperando audio…';
    statusEl.className    = 'pf-status miss';
    return;
  }

  const cents = Math.round(result.cents);
  centsEl.textContent = (cents >= 0 ? '+' : '') + cents + '¢';

  // Needle: map -50..+50 cents to 5%..95%
  const pct = 50 + (cents / 50) * 45;
  needleEl.style.left = Math.max(5, Math.min(95, pct)) + '%';

  const abs = Math.abs(cents);
  if (abs <= 15) {
    statusEl.textContent = '✓ AFINADO';
    statusEl.className   = 'pf-status tune';
  } else if (cents < 0) {
    statusEl.textContent = '▼ GRAVE';
    statusEl.className   = 'pf-status flat';
  } else {
    statusEl.textContent = '▲ AGUDO';
    statusEl.className   = 'pf-status sharp';
  }
}

// ── Hit visual feedback ───────────────────────────────────────────────────
const HIT_LABELS = { perfect:'PERFECT!', great:'GREAT', good:'GOOD', miss:'MISS' };
let _hitTimer = null;

function triggerHitFeedback(grade) {
  const el = document.getElementById('hit-feedback');
  if (_hitTimer) clearTimeout(_hitTimer);
  el.innerHTML = `<span class="hit-label ${grade}">${HIT_LABELS[grade] || grade}</span>`;
  _hitTimer = setTimeout(() => { el.innerHTML = ''; }, 600);
}

function spawnHitParticles(note, grade) {
  if (!renderer || !cfg.get('effects')) return;
  const canvas = document.getElementById('notefall-canvas');
  const rect   = canvas.getBoundingClientRect();
  // Approximate X center of note on screen
  // (renderer._midiToX is based on canvas pixels, but close enough)
  const hitY = rect.height * 0.88;
  renderer.spawnHitEffect(rect.width / 2, hitY, grade);
}

// ── Pause / Resume ────────────────────────────────────────────────────────
document.getElementById('btn-pause')?.addEventListener('click', pauseGame);
document.getElementById('btn-resume')?.addEventListener('click', resumeGame);
document.getElementById('btn-restart')?.addEventListener('click', () => {
  hideModal('pause-modal');
  endGame(true); // soft end then restart
  setTimeout(startGame, 100);
});
document.getElementById('btn-quit-pause')?.addEventListener('click', () => {
  hideModal('pause-modal');
  quitToMenu();
});
document.getElementById('btn-quit-game')?.addEventListener('click', () => {
  pauseGame();
  showModal('pause-modal');
});

function pauseGame() {
  game?.pause();
  renderer?.stop();
  showModal('pause-modal');
}

function resumeGame() {
  hideModal('pause-modal');
  game?.resume();
  renderer?.start(midi.notes);
}

// ── End game ──────────────────────────────────────────────────────────────
function endGame(silent = false) {
  if (gameLoopId) { clearInterval(gameLoopId); gameLoopId = null; }
  renderer?.stop();
  pitch.stop();

  if (silent) return;

  const data = game?.getSessionData() || {};
  stats.recordSession(midi.name, data);

  // Fill results modal
  document.getElementById('res-score').textContent    = (data.score || 0).toLocaleString();
  document.getElementById('res-accuracy').textContent = (data.accuracy || 0) + '%';
  document.getElementById('res-combo').textContent    = data.maxCombo || 0;
  document.getElementById('res-perfect').textContent  = data.perfect  || 0;
  document.getElementById('res-great').textContent    = data.great    || 0;
  document.getElementById('res-good').textContent     = data.good     || 0;
  document.getElementById('res-miss').textContent     = data.miss     || 0;
  document.getElementById('res-time').textContent     = (data.time || 0) + 's';
  document.getElementById('rank-display').textContent = data.rank || 'D';

  const rankColors = { 'S+':'#69ff47','S':'#69ff47','A':'#00e5ff','B':'#ffea00','C':'#ff6d00','D':'#ff4081' };
  document.getElementById('rank-display').style.color = rankColors[data.rank] || '#fff';
  document.getElementById('rank-display').style.textShadow = `0 0 40px ${rankColors[data.rank] || '#fff'}`;

  showModal('results-modal');
}

document.getElementById('btn-play-again')?.addEventListener('click', () => {
  hideModal('results-modal');
  startGame();
});
document.getElementById('btn-results-menu')?.addEventListener('click', () => {
  hideModal('results-modal');
  quitToMenu();
});

function quitToMenu() {
  if (gameLoopId) { clearInterval(gameLoopId); gameLoopId = null; }
  renderer?.stop();
  pitch.stop();
  game = null;
  showScreen('main-menu');
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const pauseModal = document.getElementById('pause-modal');
    if (document.getElementById('game-screen').classList.contains('hidden')) return;
    if (!pauseModal.classList.contains('hidden')) {
      resumeGame();
    } else {
      pauseGame();
    }
  }
});
