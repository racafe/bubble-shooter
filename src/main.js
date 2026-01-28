import Phaser from 'phaser';
import QRCode from 'qrcode';

// Configuration
const GAME_HOSTNAME = window.location.hostname;
const IS_SSL = window.location.protocol === 'https:';

// WebSocket hostname: localhost in dev, ws.<domain> in production
const WS_HOSTNAME = GAME_HOSTNAME === 'localhost' ? 'localhost' : `ws.${GAME_HOSTNAME}`;

// In dev we talk to ws://localhost:3000, in production to wss://ws.<domain> (default 443)
const WS_URL = IS_SSL
  ? `wss://${WS_HOSTNAME}`
  : `ws://${WS_HOSTNAME}:3000`;

// Controller is served from the main site (same origin) in production,
// and from Vite dev server in development.
// Use extension-less path in production so we don't rely on any .html
// redirects that might drop query parameters (room code).
const CONTROLLER_BASE_URL = GAME_HOSTNAME === 'localhost'
  ? `http://${GAME_HOSTNAME}:5173/controller.html`
  : `https://${GAME_HOSTNAME}/controller`;

// Sound Manager using Web Audio API for procedural sound generation
class SoundManager {
  constructor() {
    this.audioContext = null;
    this.masterGain = null;
    this.initialized = false;
  }

  // Initialize audio context (must be called after user interaction)
  init() {
    if (this.initialized) return;

    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.3; // Master volume
      this.masterGain.connect(this.audioContext.destination);
      this.initialized = true;
    } catch {
      // Web Audio API not supported, sounds will be silently disabled
    }
  }

  // Resume audio context if suspended (required for some browsers)
  resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  // Play shoot sound - quick "whoosh" effect
  playShoot() {
    if (!this.initialized) return;
    this.resume();

    const now = this.audioContext.currentTime;

    // Create noise for whoosh
    const bufferSize = this.audioContext.sampleRate * 0.15;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = this.audioContext.createBufferSource();
    noise.buffer = buffer;

    // Bandpass filter for whoosh character
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2000, now);
    filter.frequency.exponentialRampToValueAtTime(800, now + 0.1);
    filter.Q.value = 1;

    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 0.15);
  }

  // Play bounce sound - quick "thunk"
  playBounce() {
    if (!this.initialized) return;
    this.resume();

    const now = this.audioContext.currentTime;

    const osc = this.audioContext.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.05);

    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  // Play stick sound - soft "plop"
  playStick() {
    if (!this.initialized) return;
    this.resume();

    const now = this.audioContext.currentTime;

    const osc = this.audioContext.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);

    const osc2 = this.audioContext.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(600, now);
    osc2.frequency.exponentialRampToValueAtTime(300, now + 0.08);

    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.12);
    osc2.stop(now + 0.1);
  }

  // Play pop sound - pitch varies with combo size (higher pitch for larger combos)
  playPop(comboSize = 3) {
    if (!this.initialized) return;
    this.resume();

    const now = this.audioContext.currentTime;

    // Base frequency increases with combo size
    const baseFreq = 400 + (comboSize - 3) * 80;

    const osc = this.audioContext.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 2, now + 0.02);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, now + 0.1);

    // Add harmonics for richer sound
    const osc2 = this.audioContext.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(baseFreq * 1.5, now);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 0.75, now + 0.08);

    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.15);
    osc2.stop(now + 0.1);
  }

  // Play falling sound - descending "whooo"
  playFall() {
    if (!this.initialized) return;
    this.resume();

    const now = this.audioContext.currentTime;

    const osc = this.audioContext.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.3);

    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  // Play warning sound - urgent beep sequence
  playWarning() {
    if (!this.initialized) return;
    this.resume();

    const now = this.audioContext.currentTime;

    // Two quick beeps
    for (let i = 0; i < 2; i++) {
      const offset = i * 0.15;

      const osc = this.audioContext.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, now + offset);

      const gain = this.audioContext.createGain();
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(0.2, now + offset + 0.02);
      gain.gain.linearRampToValueAtTime(0.2, now + offset + 0.08);
      gain.gain.linearRampToValueAtTime(0, now + offset + 0.1);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now + offset);
      osc.stop(now + offset + 0.1);
    }
  }

  // Play game over sound - sad descending tones
  playGameOver() {
    if (!this.initialized) return;
    this.resume();

    const now = this.audioContext.currentTime;

    // Three descending notes
    const notes = [440, 349, 262]; // A4, F4, C4
    const durations = [0.3, 0.3, 0.6];

    let time = 0;
    for (let i = 0; i < notes.length; i++) {
      const osc = this.audioContext.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(notes[i], now + time);

      const gain = this.audioContext.createGain();
      gain.gain.setValueAtTime(0.3, now + time);
      gain.gain.setValueAtTime(0.3, now + time + durations[i] * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.01, now + time + durations[i]);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now + time);
      osc.stop(now + time + durations[i]);

      time += durations[i];
    }
  }
}

// Global sound manager instance
const soundManager = new SoundManager();

// Music Manager for procedural background music
class MusicManager {
  constructor() {
    this.audioContext = null;
    this.masterGain = null;
    this.initialized = false;
    this.isPlaying = false;
    this.isMuted = false;
    this.currentTempo = 120; // BPM
    this.baseTempo = 120;
    this.isTenseMode = false;

    // Oscillators and nodes for music
    this.bassOsc = null;
    this.melodyOsc = null;
    this.harmonyOsc = null;
    this.noiseSource = null;

    // Timing
    this.nextNoteTime = 0;
    this.currentBeat = 0;
    this.scheduleAheadTime = 0.1;
    this.lookahead = 25; // ms
    this.timerID = null;

    // Music patterns - upbeat cartoon style (pentatonic scale for playful feel)
    // C pentatonic: C, D, E, G, A
    this.normalBassPattern = [130.81, 130.81, 164.81, 196.00, 164.81, 130.81, 196.00, 164.81]; // C3-based
    this.normalMelodyPattern = [523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25, 783.99]; // C5-based

    // Tense patterns - minor feel, faster rhythm
    this.tenseBassPattern = [130.81, 155.56, 130.81, 196.00, 155.56, 130.81, 155.56, 196.00]; // With Eb (minor 3rd)
    this.tenseMelodyPattern = [523.25, 622.25, 523.25, 783.99, 622.25, 523.25, 622.25, 783.99]; // With Eb5

    // Load mute preference from localStorage
    this.loadMutePreference();
  }

  loadMutePreference() {
    try {
      const stored = localStorage.getItem('bubbleShooterMusicMuted');
      if (stored !== null) {
        this.isMuted = stored === 'true';
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  saveMutePreference() {
    try {
      localStorage.setItem('bubbleShooterMusicMuted', this.isMuted.toString());
    } catch {
      // Ignore localStorage errors
    }
  }

  init() {
    if (this.initialized) return;

    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : 0.15; // Lower volume for background music
      this.masterGain.connect(this.audioContext.destination);
      this.initialized = true;
    } catch {
      // Web Audio API not supported
    }
  }

  resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  setMuted(muted) {
    this.isMuted = muted;
    this.saveMutePreference();

    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(
        muted ? 0 : 0.15,
        this.audioContext.currentTime
      );
    }
  }

  toggleMute() {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  // Update tempo based on score (higher score = slightly faster)
  updateTempo(score) {
    // Increase tempo by 1 BPM per 100 points, max 150 BPM
    const tempoBonus = Math.floor(score / 100);
    this.currentTempo = Math.min(this.baseTempo + tempoBonus, 150);
  }

  // Switch between normal and tense mode
  setTenseMode(tense) {
    if (this.isTenseMode !== tense) {
      this.isTenseMode = tense;
      // Tense mode also increases base tempo by 20 BPM
      this.baseTempo = tense ? 140 : 120;
    }
  }

  start() {
    if (!this.initialized || this.isPlaying) return;

    this.resume();
    this.isPlaying = true;
    this.currentBeat = 0;
    this.nextNoteTime = this.audioContext.currentTime;

    // Start the scheduler
    this.scheduler();
  }

  stop() {
    this.isPlaying = false;

    if (this.timerID) {
      clearTimeout(this.timerID);
      this.timerID = null;
    }
  }

  scheduler() {
    if (!this.isPlaying) return;

    // Schedule notes ahead of time
    while (this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.currentBeat, this.nextNoteTime);
      this.advanceNote();
    }

    // Call again
    this.timerID = setTimeout(() => this.scheduler(), this.lookahead);
  }

  advanceNote() {
    // Move to next beat
    const secondsPerBeat = 60.0 / this.currentTempo;
    this.nextNoteTime += secondsPerBeat * 0.5; // Eighth notes
    this.currentBeat = (this.currentBeat + 1) % 8;
  }

  scheduleNote(beat, time) {
    const bassPattern = this.isTenseMode ? this.tenseBassPattern : this.normalBassPattern;
    const melodyPattern = this.isTenseMode ? this.tenseMelodyPattern : this.normalMelodyPattern;

    const duration = 60.0 / this.currentTempo * 0.4;

    // Bass note (every beat)
    this.playBassNote(bassPattern[beat], time, duration);

    // Melody note (on beats 0, 2, 4, 6 for normal, every beat for tense)
    if (this.isTenseMode || beat % 2 === 0) {
      this.playMelodyNote(melodyPattern[beat], time, duration * 0.8);
    }

    // Harmony on beats 0 and 4
    if (beat === 0 || beat === 4) {
      this.playHarmonyChord(bassPattern[beat], time, duration * 2);
    }

    // Percussion-like sound on off-beats in tense mode
    if (this.isTenseMode && beat % 2 === 1) {
      this.playPercussion(time, duration * 0.5);
    }
  }

  playBassNote(freq, time, duration) {
    const osc = this.audioContext.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq / 2, time); // One octave lower

    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

    // Low-pass filter for warmer bass
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, time);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + duration);
  }

  playMelodyNote(freq, time, duration) {
    const osc = this.audioContext.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    // Add slight vibrato for cartoon feel
    const vibrato = this.audioContext.createOscillator();
    vibrato.frequency.setValueAtTime(5, time);
    const vibratoGain = this.audioContext.createGain();
    vibratoGain.gain.setValueAtTime(3, time);
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);

    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    vibrato.start(time);
    osc.stop(time + duration);
    vibrato.stop(time + duration);
  }

  playHarmonyChord(rootFreq, time, duration) {
    // Play a simple fifth harmony
    const freqs = [rootFreq, rootFreq * 1.5]; // Root and fifth

    for (const freq of freqs) {
      const osc = this.audioContext.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);

      const gain = this.audioContext.createGain();
      gain.gain.setValueAtTime(0.08, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(time);
      osc.stop(time + duration);
    }
  }

  playPercussion(time, duration) {
    // Create a short noise burst for hi-hat like sound
    const bufferSize = this.audioContext.sampleRate * 0.05;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = this.audioContext.createBufferSource();
    noise.buffer = buffer;

    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(8000, time);

    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(0.15, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + duration);
  }
}

// Global music manager instance
const musicManager = new MusicManager();

// All bubble colors available in the game (8 total)
const ALL_BUBBLE_COLORS = [
  0xff3333, // Red - bright pure red
  0x33cc33, // Green - distinct green
  0xffff00, // Yellow - bright yellow
  0x3366ff, // Blue - medium blue
  0xff00ff, // Magenta (5th color - unlocked at 500 points)
  0xff9900, // Orange (6th color - unlocked at 1500 points)
  0x00ffff, // Cyan (7th color - unlocked at 3000 points)
  0xcc66ff, // Violet (8th color - unlocked at 5000 points)
];

// Color progression thresholds
const COLOR_THRESHOLDS = [
  { colors: 4, score: 0 },      // Start with 4 colors
  { colors: 5, score: 500 },    // 5th color at 500 points
  { colors: 6, score: 1500 },   // 6th color at 1500 points
  { colors: 7, score: 3000 },   // 7th color at 3000 points
  { colors: 8, score: 5000 },   // 8th color at 5000 points
];

// Color names for visual indicator
const COLOR_NAMES = [
  'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Orange', 'Cyan', 'Violet'
];

// Physics constants
const BUBBLE_SPEED = 800;
const BUBBLE_RADIUS = 20;
const FALL_GRAVITY = 800; // Gravity for falling bubbles

// Visual polish constants
const SCREEN_SHAKE_THRESHOLD = 5; // Combo size to trigger screen shake
const SCREEN_SHAKE_INTENSITY = 8;
const SCREEN_SHAKE_DURATION = 200;

// Scoring constants
const POINTS_PER_POP = 10;
const POINTS_PER_FALL = 20;

// Leaderboard constants
const LEADERBOARD_KEY = 'bubbleShooterLeaderboard';
const MAX_LEADERBOARD_ENTRIES = 10;

// Grid constants for hexagonal layout
const GRID_ROWS = 5; // Initial rows of bubbles
const BUBBLE_DIAMETER = BUBBLE_RADIUS * 2;
const ROW_HEIGHT = BUBBLE_DIAMETER * 0.866; // sqrt(3)/2 for hex packing

// Descent constants for endless mode
const INITIAL_DESCENT_INTERVAL = 20000; // 15 seconds initial interval
const MIN_DESCENT_INTERVAL = 6000; // 6 seconds minimum
const DESCENT_WARNING_TIME = 2000; // 2 second warning before descent
const DESCENT_SPEED_THRESHOLDS = [
  { score: 0, interval: 20000 },
  { score: 500, interval: 15000 },
  { score: 1000, interval: 10000 },
  { score: 2000, interval: 8000 },
  { score: 3500, interval: 7000 },
  { score: 5000, interval: 6000 },
];

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.score = 0;
    this.currentBubbleColor = null;
    this.nextBubbleColor = null;
    this.shootingBubble = null;
    this.isAiming = false;
    this.aimAngle = 90; // Default to straight up (degrees)
    this.trajectoryGraphics = null;
    // Grid system for attached bubbles
    this.gridBubbles = []; // Array of {x, y, row, col, color, sprite, shine}
    this.gridStartY = 0; // Y position of first row (set after walls created)
    this.gridStartX = 0; // X position of first bubble in row 0
    this.bubblesPerRow = 0; // Calculated based on game area width
    // Falling bubbles tracking
    this.fallingBubbles = []; // Array of bubbles falling due to disconnection
    // Connection state
    this.isPaused = false;
    this.disconnectOverlay = null;
    this.disconnectText = null;
    // Progressive color system
    this.availableColorCount = 4; // Start with 4 colors
    this.newColorIndicator = null;
    this.newColorTimeout = null;
    // Descent system for endless mode
    this.descentInterval = INITIAL_DESCENT_INTERVAL;
    this.descentTimer = null;
    this.warningTimer = null;
    this.warningIndicator = null;
    this.warningCountdown = 0;
    this.isGameOver = false;
    this.gameOverOverlay = null;
    // Leaderboard system
    this.isHighScore = false;
    this.leaderboardRank = -1;
    this.playerInitials = '';
    this.initialsInput = null;
    this.selectedLetterIndex = 0;
    this.initialsLetters = ['A', 'A', 'A'];
    // Background animation elements
    this.bgElements = [];
  }

  // Create a glossy cartoon-style bubble with multiple highlights
  createGlossyBubble(x, y, radius, color, strokeWidth = 2, strokeAlpha = 0.6) {
    const container = this.add.container(x, y);

    // Main bubble body with gradient-like effect (darker edge)
    const body = this.add.circle(0, 0, radius, color);
    body.setStrokeStyle(strokeWidth, 0xffffff, strokeAlpha);

    // Inner glow - slightly lighter center
    const innerGlow = this.add.circle(0, -radius * 0.1, radius * 0.7, color, 0.3);

    // Main highlight (top-left shine)
    const mainShine = this.add.circle(-radius * 0.3, -radius * 0.3, radius * 0.25, 0xffffff, 0.7);

    // Secondary smaller highlight
    const secondShine = this.add.circle(-radius * 0.15, -radius * 0.5, radius * 0.12, 0xffffff, 0.5);

    // Bottom reflection (subtle)
    const bottomReflect = this.add.ellipse(0, radius * 0.4, radius * 0.6, radius * 0.2, 0xffffff, 0.15);

    container.add([body, innerGlow, mainShine, secondShine, bottomReflect]);

    // Store reference to main body for color changes
    container.body = body;
    container.mainShine = mainShine;
    container.secondShine = secondShine;

    return container;
  }

  init(data) {
    // Receive WebSocket connection from WaitingScene
    this.ws = data.ws;
    
    // Reset game state for scene restart (Phaser reuses scene instances)
    this.isGameOver = false;
    this.isPaused = false;
    this.score = 0;
    this.availableColorCount = 4;
    this.descentInterval = INITIAL_DESCENT_INTERVAL;
    this.isHighScore = false;
    this.leaderboardRank = -1;
    this.playerInitials = '';
    this.selectedLetterIndex = 0;
    this.initialsLetters = ['A', 'A', 'A'];
    
    // Clear timers if they exist
    if (this.descentTimer) {
      this.descentTimer.remove();
      this.descentTimer = null;
    }
    if (this.warningTimer) {
      this.warningTimer.remove();
      this.warningTimer = null;
    }
    if (this.newColorTimeout) {
      this.newColorTimeout.remove();
      this.newColorTimeout = null;
    }
  }

  create() {
    
    // Clean up any existing sprites from previous game (scene restart)
    for (const bubble of this.gridBubbles) {
      if (bubble.sprite) bubble.sprite.destroy();
    }
    this.gridBubbles = [];
    
    for (const bubble of this.fallingBubbles) {
      if (bubble.sprite) bubble.sprite.destroy();
    }
    this.fallingBubbles = [];
    
    if (this.shootingBubble) {
      this.shootingBubble.destroy();
      this.shootingBubble = null;
    }
    
    if (this.trajectoryGraphics) {
      this.trajectoryGraphics.clear();
    }
    
    const { width, height } = this.cameras.main;

    // Create cartoon-style gradient background
    this.createGradientBackground(width, height);

    // Create visible wall boundaries
    this.createWalls(width, height);

    // Create score display in top-left corner
    this.createScoreDisplay();

    // Initialize bubble colors (using available colors based on score)
    this.currentBubbleColor = this.getRandomAvailableColor();
    this.nextBubbleColor = this.getRandomAvailableColor();

    // Create shooter and bubble displays at bottom-center
    this.createShooter(width, height);

    // Create trajectory preview graphics
    this.trajectoryGraphics = this.add.graphics();

    // Initialize the bubble grid
    this.initializeGrid(width);

    // Create initial rows of bubbles
    this.createInitialBubbles();

    // Create disconnect overlay (initially hidden)
    this.createDisconnectOverlay(width, height);

    // Create game over overlay (initially hidden)
    this.createGameOverOverlay(width, height);

    // Create descent warning indicator (initially hidden)
    this.createWarningIndicator(width, height);

    // Start the descent timer for endless mode
    this.startDescentTimer();

    // Create mute toggle button
    this.createMuteButton(width);

    // Initialize and start background music
    this.startBackgroundMusic();

    // Listen for shoot and aim commands from controller
    if (this.ws) {
      this.setupWebSocketHandlers();
    }
  }

  createMuteButton(width) {
    // Mute button in top-right corner
    const btnX = width - 50;
    const btnY = 30;

    // Button background
    const buttonShadow = this.add.graphics();
    buttonShadow.fillStyle(0x000000, 0.25);
    buttonShadow.fillRoundedRect(btnX - 28, btnY - 16, 60, 34, 10);

    const buttonBg = this.add.graphics();
    buttonBg.fillStyle(0xffffff, 0.18);
    buttonBg.fillRoundedRect(btnX - 30, btnY - 18, 60, 34, 10);
    buttonBg.lineStyle(2, 0xffffff, 0.5);
    buttonBg.strokeRoundedRect(btnX - 30, btnY - 18, 60, 34, 10);

    this.muteButton = this.add.rectangle(btnX, btnY, 60, 34, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });

    // Music icon and state text
    this.muteIcon = this.add.text(btnX, btnY, musicManager.isMuted ? '🔇' : '🎵', {
      fontSize: '20px',
      fontFamily: 'Arial, sans-serif'
    }).setOrigin(0.5);

    // Hover effects
    this.muteButton.on('pointerover', () => {
      buttonBg.clear();
      buttonBg.fillStyle(0xffffff, 0.28);
      buttonBg.fillRoundedRect(btnX - 30, btnY - 18, 60, 34, 10);
      buttonBg.lineStyle(2, 0xffffff, 0.65);
      buttonBg.strokeRoundedRect(btnX - 30, btnY - 18, 60, 34, 10);
    });

    this.muteButton.on('pointerout', () => {
      buttonBg.clear();
      buttonBg.fillStyle(0xffffff, 0.18);
      buttonBg.fillRoundedRect(btnX - 30, btnY - 18, 60, 34, 10);
      buttonBg.lineStyle(2, 0xffffff, 0.5);
      buttonBg.strokeRoundedRect(btnX - 30, btnY - 18, 60, 34, 10);
    });

    // Click to toggle mute
    this.muteButton.on('pointerdown', () => {
      const nowMuted = musicManager.toggleMute();
      this.muteIcon.setText(nowMuted ? '🔇' : '🎵');
    });
  }

  startBackgroundMusic() {
    // Initialize music manager (requires user interaction, but will work after first shoot)
    musicManager.init();
    musicManager.start();
  }

  // Check if any bubble is dangerously close to the bottom (tense mode)
  checkTenseMode() {
    const dangerThreshold = this.gameArea.bottom - ROW_HEIGHT * 3; // Within 3 rows of bottom

    for (const bubble of this.gridBubbles) {
      if (bubble.y >= dangerThreshold) {
        musicManager.setTenseMode(true);
        return;
      }
    }
    musicManager.setTenseMode(false);
  }

  setupWebSocketHandlers() {
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'shoot') {
        this.handleShoot(message.data.angle);
      } else if (message.type === 'aim') {
        this.handleAim(message.data.angle);
      } else if (message.type === 'submit_initials') {
        this.handleSubmitInitials(message.data.initials);
      } else if (message.type === 'peer_disconnected') {
        this.onControllerDisconnected();
      } else if (message.type === 'peer_connected' || message.type === 'peer_reconnected') {
        this.onControllerReconnected();
      }
    };

    this.ws.onclose = () => {
      // Server connection lost
      this.onServerDisconnected();
    };

    this.ws.onerror = () => {
      this.onServerDisconnected();
    };
  }

  createDisconnectOverlay(width, height) {
    // Semi-transparent background
    this.disconnectOverlay = this.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      0x000000,
      0.7
    );
    this.disconnectOverlay.setDepth(100);
    this.disconnectOverlay.setVisible(false);

    // Disconnect message text
    this.disconnectText = this.add.text(width / 2, height / 2 - 20, '', {
      fontSize: '28px',
      fontFamily: 'Arial, sans-serif',
      color: '#f59e0b',
      fontStyle: 'bold',
      align: 'center'
    }).setOrigin(0.5);
    this.disconnectText.setDepth(101);
    this.disconnectText.setVisible(false);

    // Subtext for additional info
    this.disconnectSubtext = this.add.text(width / 2, height / 2 + 30, '', {
      fontSize: '18px',
      fontFamily: 'Arial, sans-serif',
      color: '#888888',
      align: 'center'
    }).setOrigin(0.5);
    this.disconnectSubtext.setDepth(101);
    this.disconnectSubtext.setVisible(false);
  }

  showDisconnectOverlay(mainText, subText = '') {
    this.isPaused = true;
    this.disconnectOverlay.setVisible(true);
    this.disconnectText.setText(mainText);
    this.disconnectText.setVisible(true);
    this.disconnectSubtext.setText(subText);
    this.disconnectSubtext.setVisible(true);
  }

  hideDisconnectOverlay() {
    this.isPaused = false;
    this.disconnectOverlay.setVisible(false);
    this.disconnectText.setVisible(false);
    this.disconnectSubtext.setVisible(false);
  }

  onControllerDisconnected() {
    this.showDisconnectOverlay(
      'Controller disconnected',
      'Waiting for reconnection...'
    );
  }

  onControllerReconnected() {
    this.hideDisconnectOverlay();
  }

  onServerDisconnected() {
    this.showDisconnectOverlay(
      'Connection lost',
      'Server disconnected'
    );
  }

  // Get array of currently available colors based on score
  getAvailableColors() {
    return ALL_BUBBLE_COLORS.slice(0, this.availableColorCount);
  }

  // Get a random color from available colors
  getRandomAvailableColor() {
    const availableColors = this.getAvailableColors();
    return Phaser.Utils.Array.GetRandom(availableColors);
  }

  // Check if new colors should be unlocked based on current score
  checkColorProgression() {
    const previousCount = this.availableColorCount;

    // Find the highest threshold we've crossed
    for (const threshold of COLOR_THRESHOLDS) {
      if (this.score >= threshold.score && threshold.colors > this.availableColorCount) {
        this.availableColorCount = threshold.colors;
      }
    }

    // If we unlocked a new color, show indicator
    if (this.availableColorCount > previousCount) {
      const newColorIndex = this.availableColorCount - 1;
      const newColor = ALL_BUBBLE_COLORS[newColorIndex];
      const colorName = COLOR_NAMES[newColorIndex];
      this.showNewColorIndicator(newColor, colorName);
    }
  }

  // Show visual indicator when a new color is introduced
  showNewColorIndicator(color, colorName) {
    const { width, height } = this.cameras.main;

    // Clear any existing indicator timeout
    if (this.newColorTimeout) {
      this.newColorTimeout.remove();
    }

    // Remove existing indicator if any
    if (this.newColorIndicator) {
      this.newColorIndicator.destroy();
    }

    // Create container for the indicator
    this.newColorIndicator = this.add.container(width / 2, height / 2 - 100);
    this.newColorIndicator.setDepth(50);

    // Background panel
    const panel = this.add.rectangle(0, 0, 280, 80, 0x000000, 0.8);
    panel.setStrokeStyle(3, color, 1);

    // "NEW COLOR!" text
    const titleText = this.add.text(0, -20, 'NEW COLOR!', {
      fontSize: '22px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Color name and sample bubble
    const sampleBubble = this.add.circle(-60, 15, 15, color);
    sampleBubble.setStrokeStyle(2, 0xffffff, 0.8);

    // Add shine to sample bubble
    const shine = this.add.circle(-66, 9, 4, 0xffffff, 0.6);

    const nameText = this.add.text(0, 15, colorName, {
      fontSize: '20px',
      fontFamily: 'Arial, sans-serif',
      color: '#' + color.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0, 0.5);

    // Add all to container
    this.newColorIndicator.add([panel, titleText, sampleBubble, shine, nameText]);

    // Animate in with scale and fade
    this.newColorIndicator.setScale(0.5);
    this.newColorIndicator.setAlpha(0);

    this.tweens.add({
      targets: this.newColorIndicator,
      scale: 1,
      alpha: 1,
      duration: 300,
      ease: 'Back.easeOut'
    });

    // Pulsing glow effect on the panel
    this.tweens.add({
      targets: panel,
      alpha: 0.6,
      yoyo: true,
      repeat: 2,
      duration: 200,
      ease: 'Sine.easeInOut'
    });

    // Hide after 2.5 seconds
    this.newColorTimeout = this.time.delayedCall(2500, () => {
      if (this.newColorIndicator) {
        this.tweens.add({
          targets: this.newColorIndicator,
          scale: 0.5,
          alpha: 0,
          duration: 300,
          ease: 'Back.easeIn',
          onComplete: () => {
            if (this.newColorIndicator) {
              this.newColorIndicator.destroy();
              this.newColorIndicator = null;
            }
          }
        });
      }
    });
  }

  update() {
    // Don't update game logic when paused
    if (this.isPaused) {
      return;
    }

    // Update shooting bubble physics
    if (this.shootingBubble && this.shootingBubble.active) {
      this.updateShootingBubble();
    }

    // Update falling bubbles
    this.updateFallingBubbles();

    // Check for tense mode (bubbles near bottom)
    this.checkTenseMode();
  }

  updateShootingBubble() {
    const bubble = this.shootingBubble;
    const delta = this.game.loop.delta / 1000;

    // Move bubble first
    bubble.x += bubble.velocityX * delta;
    bubble.y += bubble.velocityY * delta;

    // Check for wall bounces (left and right)
    if (bubble.x - BUBBLE_RADIUS <= this.gameArea.left) {
      bubble.x = this.gameArea.left + BUBBLE_RADIUS;
      bubble.velocityX = Math.abs(bubble.velocityX); // Bounce right
      bubble.rotationSpeed = Math.abs(bubble.rotationSpeed); // Rotate based on direction
      soundManager.playBounce();
    } else if (bubble.x + BUBBLE_RADIUS >= this.gameArea.right) {
      bubble.x = this.gameArea.right - BUBBLE_RADIUS;
      bubble.velocityX = -Math.abs(bubble.velocityX); // Bounce left
      bubble.rotationSpeed = -Math.abs(bubble.rotationSpeed); // Rotate based on direction
      soundManager.playBounce();
    }

    // Check for ceiling collision (stick immediately)
    if (bubble.y - BUBBLE_RADIUS <= this.gameArea.top) {
      bubble.y = this.gameArea.top + BUBBLE_RADIUS;
      this.stickBubble(bubble);
      return;
    }

    // Check for collision with existing grid bubbles
    const collisionBubble = this.checkGridCollision(bubble.x, bubble.y);
    if (collisionBubble) {
      this.stickBubble(bubble);
      return;
    }

    // Rotate bubble container while moving (shine moves with it)
    bubble.rotation += bubble.rotationSpeed * delta;
  }

  checkGridCollision(x, y) {
    // Check if shooting bubble collides with any grid bubble
    const collisionDist = BUBBLE_DIAMETER * 0.9; // Slightly less than 2 radii for snug fit

    for (const gridBubble of this.gridBubbles) {
      const dist = Phaser.Math.Distance.Between(x, y, gridBubble.x, gridBubble.y);
      if (dist < collisionDist) {
        return gridBubble;
      }
    }

    return null;
  }

  stickBubble(bubble) {
    // Stop the bubble and mark it as stuck
    bubble.velocityX = 0;
    bubble.velocityY = 0;
    bubble.rotationSpeed = 0;
    bubble.active = false;

    // Find the nearest valid empty cell
    const targetCell = this.findNearestEmptyCell(bubble.x, bubble.y);

    if (targetCell && this.hasAdjacentBubble(targetCell.row, targetCell.col)) {
      // Animate snap to grid position
      this.snapBubbleToGrid(bubble, targetCell);
    } else {
      // No valid position found - shouldn't happen normally
      // Destroy the bubble (container)
      bubble.destroy();
    }

    this.shootingBubble = null;
  }

  snapBubbleToGrid(bubble, targetCell) {
    const targetPos = targetCell.pos;

    // Create snap animation using tween (bubble is a container)
    this.tweens.add({
      targets: bubble,
      x: targetPos.x,
      y: targetPos.y,
      duration: 50, // Quick snap
      ease: 'Power2',
      onComplete: () => {
        // Play stick sound
        soundManager.playStick();

        // Create the visual snap effect
        this.createSnapEffect(targetPos.x, targetPos.y);

        // Store color before destroying
        const bubbleColor = bubble.color;

        // Destroy the shooting bubble container
        bubble.destroy();

        // Add bubble to grid data structure
        const newBubble = this.addBubbleToGrid(targetCell.row, targetCell.col, bubbleColor);

        // Check for matches after bubble is placed
        if (newBubble) {
          this.checkAndPopMatches(newBubble);
        }

        // Check for game over immediately after bubble placement
        this.time.delayedCall(150, () => {
          if (!this.isGameOver && this.checkGameOver()) {
            this.triggerGameOver();
          }
        });
      }
    });
  }

  createSnapEffect(x, y) {
    // Create a satisfying visual "pop" effect when bubble snaps to grid
    const ring = this.add.circle(x, y, BUBBLE_RADIUS, 0xffffff, 0);
    ring.setStrokeStyle(3, 0xffffff, 0.8);

    // Expand and fade ring
    this.tweens.add({
      targets: ring,
      radius: BUBBLE_RADIUS * 1.5,
      alpha: 0,
      duration: 200,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        // Update stroke as ring expands
        ring.setStrokeStyle(3 * (1 - ring.alpha), 0xffffff, ring.alpha * 0.8);
      },
      onComplete: () => {
        ring.destroy();
      }
    });

    // Add small particles bursting outward
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const particle = this.add.circle(
        x + Math.cos(angle) * BUBBLE_RADIUS * 0.5,
        y + Math.sin(angle) * BUBBLE_RADIUS * 0.5,
        3,
        0xffffff,
        0.7
      );

      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * BUBBLE_RADIUS * 1.8,
        y: y + Math.sin(angle) * BUBBLE_RADIUS * 1.8,
        alpha: 0,
        scale: 0.3,
        duration: 150,
        ease: 'Quad.easeOut',
        onComplete: () => {
          particle.destroy();
        }
      });
    }
  }

  handleAim(angle) {
    // Ignore aim when paused
    if (this.isPaused) return;

    this.isAiming = true;
    this.aimAngle = angle;
    this.drawTrajectory(angle);
  }

  createGradientBackground(width, height) {
    // Add the same illustrated background as the QR screen
    const bgImage = this.add.image(width / 2, height / 2, 'bubbleShooterBg');

    // Cover scale (CSS background-size: cover)
    const imageWidth = bgImage.width;
    const imageHeight = bgImage.height;
    const scaleX = width / imageWidth;
    const scaleY = height / imageHeight;
    const scale = Math.max(scaleX, scaleY);

    bgImage.setScale(scale);
    bgImage.setDepth(-3);

    // Soft color wash for readability + depth
    // Remove existing texture if present (for game restarts)
    if (this.textures.exists('game-vibe-overlay')) {
      this.textures.remove('game-vibe-overlay');
    }
    const overlayTexture = this.textures.createCanvas('game-vibe-overlay', width, height);
    const ctx = overlayTexture.getContext();
    const overlay = ctx.createLinearGradient(0, 0, 0, height);
    overlay.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    overlay.addColorStop(0.55, 'rgba(120, 98, 180, 0.18)');
    overlay.addColorStop(1, 'rgba(173, 110, 208, 0.35)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, width, height);
    overlayTexture.refresh();

    this.add.image(width / 2, height / 2, 'game-vibe-overlay')
      .setDepth(-2);

    // Add animated background elements (floating bubbles, sparkles)
    this.createAnimatedBackgroundElements(width, height);
  }

  createAnimatedBackgroundElements(width, height) {
    // Create floating decorative bubbles in the background
    const numBubbles = 12;
    const colors = [0xffffff, 0xfce7f3, 0xe9d5ff, 0xc7d2fe];

    for (let i = 0; i < numBubbles; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const radius = 5 + Math.random() * 15;
      const alpha = 0.1 + Math.random() * 0.15;
      const color = Phaser.Utils.Array.GetRandom(colors);

      const bubble = this.add.circle(x, y, radius, color, alpha);
      bubble.setDepth(-2); // Behind game elements

      // Store for cleanup
      this.bgElements.push(bubble);

      // Gentle floating animation
      const floatDistance = 20 + Math.random() * 30;
      const floatDuration = 3000 + Math.random() * 4000;

      this.tweens.add({
        targets: bubble,
        y: bubble.y - floatDistance,
        alpha: alpha * 0.5,
        duration: floatDuration,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: Math.random() * 2000
      });

      // Gentle horizontal sway
      this.tweens.add({
        targets: bubble,
        x: bubble.x + (Math.random() - 0.5) * 40,
        duration: floatDuration * 1.3,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: Math.random() * 1000
      });
    }

    // Add subtle sparkles
    const numSparkles = 8;
    for (let i = 0; i < numSparkles; i++) {
      const x = 50 + Math.random() * (width - 100);
      const y = 80 + Math.random() * (height - 200);

      const sparkle = this.add.star(x, y, 4, 2, 5, 0xffffff, 0.3);
      sparkle.setDepth(-2);
      this.bgElements.push(sparkle);

      // Twinkling animation
      this.tweens.add({
        targets: sparkle,
        alpha: 0.05,
        scale: 0.5,
        duration: 1500 + Math.random() * 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: Math.random() * 2000
      });

      // Slow rotation
      this.tweens.add({
        targets: sparkle,
        rotation: Math.PI * 2,
        duration: 8000 + Math.random() * 4000,
        repeat: -1,
        ease: 'Linear'
      });
    }
  }

  createWalls(width, height) {
    const wallThickness = 10;
    const wallColor = 0xb9b1f5;
    const wallAlpha = 0.75;

    // Game area dimensions (leave space for UI)
    const gameTop = 60;  // Space for score
    const gameBottom = height - 100;  // Space for shooter
    const gameLeft = 20;
    const gameRight = width - 20;

    // Soft playfield panel for depth
    const panelWidth = gameRight - gameLeft + 20;
    const panelHeight = gameBottom - gameTop + 20;
    const panelX = (gameLeft + gameRight) / 2;
    const panelY = (gameTop + gameBottom) / 2;
    const panelShadow = this.add.graphics();
    panelShadow.fillStyle(0x000000, 0.2);
    panelShadow.fillRoundedRect(
      panelX - panelWidth / 2 + 4,
      panelY - panelHeight / 2 + 6,
      panelWidth,
      panelHeight,
      22
    );
    panelShadow.setDepth(-1);

    const panel = this.add.graphics();
    panel.fillStyle(0xffffff, 0.12);
    panel.fillRoundedRect(
      panelX - panelWidth / 2,
      panelY - panelHeight / 2,
      panelWidth,
      panelHeight,
      22
    );
    panel.lineStyle(2, 0xffffff, 0.25);
    panel.strokeRoundedRect(
      panelX - panelWidth / 2,
      panelY - panelHeight / 2,
      panelWidth,
      panelHeight,
      22
    );
    panel.setDepth(-1);

    // Left wall
    this.add.rectangle(
      gameLeft,
      (gameTop + gameBottom) / 2,
      wallThickness,
      gameBottom - gameTop,
      wallColor,
      wallAlpha
    ).setStrokeStyle(2, 0xffffff, 0.3);

    // Right wall
    this.add.rectangle(
      gameRight,
      (gameTop + gameBottom) / 2,
      wallThickness,
      gameBottom - gameTop,
      wallColor,
      wallAlpha
    ).setStrokeStyle(2, 0xffffff, 0.3);

    // Top wall
    this.add.rectangle(
      width / 2,
      gameTop,
      gameRight - gameLeft,
      wallThickness,
      wallColor,
      wallAlpha
    ).setStrokeStyle(2, 0xffffff, 0.3);

    // Bottom boundary line (dashed effect with multiple segments)
    const dashWidth = 20;
    const gapWidth = 10;
    let x = gameLeft + dashWidth / 2;

    while (x < gameRight) {
      this.add.rectangle(
        x,
        gameBottom,
        dashWidth,
        4,
        0xffffff,
        0.5
      );
      x += dashWidth + gapWidth;
    }

    // Store game area bounds for later use
    this.gameArea = {
      left: gameLeft + wallThickness / 2,
      right: gameRight - wallThickness / 2,
      top: gameTop + wallThickness / 2,
      bottom: gameBottom
    };
  }

  createScoreDisplay() {
    // Score background panel with rounded look
    const panelShadow = this.add.graphics();
    panelShadow.fillStyle(0x000000, 0.25);
    panelShadow.fillRoundedRect(12, 10, 160, 48, 16);

    const panel = this.add.graphics();
    panel.fillStyle(0xffffff, 0.18);
    panel.fillRoundedRect(10, 8, 160, 48, 16);
    panel.lineStyle(2, 0xffffff, 0.5);
    panel.strokeRoundedRect(10, 8, 160, 48, 16);

    // Score label with playful font
    this.add.text(20, 18, 'SCORE', {
      fontSize: '14px',
      fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
      color: '#fff6ff',
      fontStyle: 'bold'
    });

    // Score value with playful bouncy font
    this.scoreText = this.add.text(20, 35, '0', {
      fontSize: '22px',
      fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
      color: '#ffe8ff',
      fontStyle: 'bold',
      stroke: '#a855f7',
      strokeThickness: 3
    });
  }

  createShooter(width, height) {
    const shooterY = height - 50;
    const shooterX = width / 2;

    // Shooter base (semi-circle platform) with gradient-like effect
    const base = this.add.arc(shooterX, shooterY + 20, 52, 180, 0, false, 0x362a62, 0.75);
    base.setStrokeStyle(3, 0xffffff, 0.5);

    // Decorative rings on base
    this.add.arc(shooterX, shooterY + 20, 42, 180, 0, false, 0x6b5fc1, 0.4);
    this.add.arc(shooterX, shooterY + 20, 32, 180, 0, false, 0xc4b5fd, 0.3);

    // Shooter cannon/tube with metallic look
    this.shooterCannon = this.add.rectangle(
      shooterX,
      shooterY - 10,
      18,
      42,
      0x7864c8,
      0.9
    ).setStrokeStyle(2, 0xffffff, 0.6);

    // Cannon highlight
    this.add.rectangle(shooterX - 4, shooterY - 10, 3, 38, 0xffffff, 0.2);

    // Current bubble to shoot (glossy style)
    this.currentBubbleContainer = this.createGlossyBubble(
      shooterX,
      shooterY - 35,
      BUBBLE_RADIUS,
      this.currentBubbleColor,
      3, 0.8
    );

    // Store reference to body for color changes
    this.currentBubble = this.currentBubbleContainer.body;

    // Next bubble preview (smaller, to the right)
    const previewX = shooterX + 80;
    const previewY = shooterY;

    // Preview label with playful font
    this.add.text(previewX - 25, previewY - 38, 'NEXT', {
      fontSize: '12px',
      fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
      color: '#fff6ff',
      fontStyle: 'bold'
    });

    // Preview bubble background
    this.add.circle(previewX, previewY, 22, 0xffffff, 0.18)
      .setStrokeStyle(2, 0xffffff, 0.5);

    // Next bubble preview (glossy mini version)
    this.nextBubbleContainer = this.createGlossyBubble(
      previewX,
      previewY,
      15,
      this.nextBubbleColor,
      2, 0.6
    );

    // Store reference to body for color changes
    this.nextBubble = this.nextBubbleContainer.body;
  }

  initializeGrid(_width) {
    // Calculate grid parameters based on game area
    const gameAreaWidth = this.gameArea.right - this.gameArea.left;
    this.bubblesPerRow = Math.floor(gameAreaWidth / BUBBLE_DIAMETER);

    // Center the grid within the game area
    const totalGridWidth = this.bubblesPerRow * BUBBLE_DIAMETER;
    const leftPadding = (gameAreaWidth - totalGridWidth) / 2;
    this.gridStartX = this.gameArea.left + leftPadding + BUBBLE_RADIUS;
    this.gridStartY = this.gameArea.top + BUBBLE_RADIUS;
  }

  createInitialBubbles() {
    // Create GRID_ROWS of bubbles at the top using available colors
    for (let row = 0; row < GRID_ROWS; row++) {
      // Odd rows have one fewer bubble and are offset
      const isOddRow = row % 2 === 1;
      const bubblesInRow = isOddRow ? this.bubblesPerRow - 1 : this.bubblesPerRow;

      for (let col = 0; col < bubblesInRow; col++) {
        const color = this.getRandomAvailableColor();
        this.addBubbleToGrid(row, col, color);
      }
    }
  }

  getGridPosition(row, col) {
    // Calculate world position from grid row/col
    const isOddRow = row % 2 === 1;
    const xOffset = isOddRow ? BUBBLE_RADIUS : 0;

    const x = this.gridStartX + col * BUBBLE_DIAMETER + xOffset;
    const y = this.gridStartY + row * ROW_HEIGHT;

    return { x, y };
  }

  getGridCell(worldX, worldY) {
    // Convert world position to nearest grid cell
    const row = Math.round((worldY - this.gridStartY) / ROW_HEIGHT);
    const isOddRow = row % 2 === 1;
    const xOffset = isOddRow ? BUBBLE_RADIUS : 0;
    const col = Math.round((worldX - this.gridStartX - xOffset) / BUBBLE_DIAMETER);

    return { row, col };
  }

  isValidGridCell(row, col) {
    // Check if a grid cell is valid (within bounds)
    if (row < 0) return false;
    const isOddRow = row % 2 === 1;
    const maxCols = isOddRow ? this.bubblesPerRow - 1 : this.bubblesPerRow;
    return col >= 0 && col < maxCols;
  }

  getBubbleAtCell(row, col) {
    // Find bubble at specific grid cell
    return this.gridBubbles.find(b => b.row === row && b.col === col);
  }

  addBubbleToGrid(row, col, color) {
    // Check if cell is valid
    if (!this.isValidGridCell(row, col)) return null;

    // Check if cell is already occupied
    if (this.getBubbleAtCell(row, col)) return null;

    const pos = this.getGridPosition(row, col);

    // Create glossy bubble container
    const sprite = this.createGlossyBubble(pos.x, pos.y, BUBBLE_RADIUS, color);

    const bubbleData = {
      row,
      col,
      x: pos.x,
      y: pos.y,
      color,
      sprite,
      shine: null // Shine is now part of container
    };

    this.gridBubbles.push(bubbleData);
    return bubbleData;
  }

  findNearestEmptyCell(worldX, worldY) {
    // Find the best empty cell near the given position
    const cell = this.getGridCell(worldX, worldY);

    // Check the calculated cell and nearby cells for the best fit
    const candidates = [];

    // Check cells in a small area around the impact point
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const testRow = cell.row + dr;
        const testCol = cell.col + dc;

        if (this.isValidGridCell(testRow, testCol) && !this.getBubbleAtCell(testRow, testCol)) {
          const pos = this.getGridPosition(testRow, testCol);
          const dist = Phaser.Math.Distance.Between(worldX, worldY, pos.x, pos.y);
          candidates.push({ row: testRow, col: testCol, dist, pos });
        }
      }
    }

    // Return the closest valid empty cell
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.dist - b.dist);
      return candidates[0];
    }

    return null;
  }

  getNeighbors(row, col) {
    // Get all valid neighboring cells for hexagonal grid
    const isOddRow = row % 2 === 1;
    const neighbors = [];

    // Even rows: (-1,-1), (-1,0), (0,-1), (0,1), (1,-1), (1,0)
    // Odd rows:  (-1,0), (-1,1), (0,-1), (0,1), (1,0), (1,1)
    const offsets = isOddRow
      ? [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]]
      : [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];

    for (const [dr, dc] of offsets) {
      const newRow = row + dr;
      const newCol = col + dc;
      if (this.isValidGridCell(newRow, newCol)) {
        neighbors.push({ row: newRow, col: newCol });
      }
    }

    return neighbors;
  }

  hasAdjacentBubble(row, col) {
    // Check if position has at least one adjacent bubble (or is in top row)
    if (row === 0) return true; // Top row is always connected to ceiling

    const neighbors = this.getNeighbors(row, col);
    return neighbors.some(n => this.getBubbleAtCell(n.row, n.col) !== undefined);
  }

  // Find all connected bubbles of the same color using flood fill
  findConnectedBubbles(startBubble) {
    const connected = [startBubble];
    const visited = new Set([`${startBubble.row},${startBubble.col}`]);
    const queue = [startBubble];

    while (queue.length > 0) {
      const current = queue.shift();
      const neighbors = this.getNeighbors(current.row, current.col);

      for (const neighbor of neighbors) {
        const key = `${neighbor.row},${neighbor.col}`;
        if (visited.has(key)) continue;

        const bubble = this.getBubbleAtCell(neighbor.row, neighbor.col);
        if (bubble && bubble.color === startBubble.color) {
          visited.add(key);
          connected.push(bubble);
          queue.push(bubble);
        }
      }
    }

    return connected;
  }

  // Check for matches and pop if 3+ connected
  checkAndPopMatches(newBubble) {
    const connected = this.findConnectedBubbles(newBubble);

    if (connected.length >= 3) {
      // Calculate center position for score popup
      const centerX = connected.reduce((sum, b) => sum + b.x, 0) / connected.length;
      const centerY = connected.reduce((sum, b) => sum + b.y, 0) / connected.length;

      // Pop all connected bubbles
      const popScore = connected.length * POINTS_PER_POP;
      this.popBubbles(connected, connected.length);

      // After popping, check for floating bubbles
      this.time.delayedCall(100, () => {
        const floating = this.findFloatingBubbles();
        if (floating.length > 0) {
          const fallScore = floating.length * POINTS_PER_FALL;
          // Calculate center for floating score popup
          const floatCenterX = floating.reduce((sum, b) => sum + b.x, 0) / floating.length;
          const floatCenterY = floating.reduce((sum, b) => sum + b.y, 0) / floating.length;
          this.dropFloatingBubbles(floating);
          this.updateScore(fallScore, floatCenterX, floatCenterY);
        }
      });

      this.updateScore(popScore, centerX, centerY);
    }
  }

  // Pop bubbles with animation
  popBubbles(bubbles, comboSize = 3) {
    // Play pop sound with pitch based on combo size (once for the whole group)
    soundManager.playPop(comboSize);

    // Screen shake for large combos
    if (comboSize >= SCREEN_SHAKE_THRESHOLD) {
      this.triggerScreenShake(comboSize);
    }

    for (let i = 0; i < bubbles.length; i++) {
      const bubble = bubbles[i];

      // Delay each pop slightly for cascade effect
      this.time.delayedCall(i * 30, () => {
        this.createPopEffect(bubble.x, bubble.y, bubble.color);
        this.removeBubbleFromGrid(bubble);
      });
    }
  }

  // Trigger screen shake effect
  triggerScreenShake(comboSize) {
    // Intensity scales with combo size
    const intensity = SCREEN_SHAKE_INTENSITY + (comboSize - SCREEN_SHAKE_THRESHOLD) * 2;
    const duration = SCREEN_SHAKE_DURATION + (comboSize - SCREEN_SHAKE_THRESHOLD) * 30;

    this.cameras.main.shake(duration, intensity / 1000);
  }

  // Create popping effect with enhanced colorful particles
  createPopEffect(x, y, color) {
    // Central burst with glow
    const burstGlow = this.add.circle(x, y, BUBBLE_RADIUS * 1.2, 0xffffff, 0.4);
    this.tweens.add({
      targets: burstGlow,
      scale: 2,
      alpha: 0,
      duration: 250,
      ease: 'Quad.easeOut',
      onComplete: () => burstGlow.destroy()
    });

    const burst = this.add.circle(x, y, BUBBLE_RADIUS, color, 0.9);
    this.tweens.add({
      targets: burst,
      scale: 1.8,
      alpha: 0,
      duration: 200,
      ease: 'Quad.easeOut',
      onComplete: () => burst.destroy()
    });

    // Inner flash
    const flash = this.add.circle(x, y, BUBBLE_RADIUS * 0.6, 0xffffff, 0.8);
    this.tweens.add({
      targets: flash,
      scale: 0.1,
      alpha: 0,
      duration: 150,
      ease: 'Quad.easeIn',
      onComplete: () => flash.destroy()
    });

    // Colorful particle explosion - 12 particles in a ring with varied colors
    const particleCount = 12;
    const complementColor = this.getComplementaryColor(color);

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.3;
      const particleRadius = 4 + Math.random() * 4;
      // Alternate between main color and white/complement for colorful effect
      const particleColor = i % 3 === 0 ? 0xffffff : (i % 3 === 1 ? color : complementColor);

      const particle = this.add.circle(x, y, particleRadius, particleColor, 0.95);

      const distance = BUBBLE_RADIUS * 2.5 + Math.random() * BUBBLE_RADIUS;
      const targetX = x + Math.cos(angle) * distance;
      const targetY = y + Math.sin(angle) * distance;

      this.tweens.add({
        targets: particle,
        x: targetX,
        y: targetY,
        scale: 0.1,
        alpha: 0,
        duration: 300 + Math.random() * 150,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy()
      });
    }

    // Star sparkles flying upward
    for (let i = 0; i < 5; i++) {
      const sparkle = this.add.star(
        x + (Math.random() - 0.5) * BUBBLE_RADIUS,
        y + (Math.random() - 0.5) * BUBBLE_RADIUS,
        4, 2, 5,
        0xffffff,
        1
      );

      this.tweens.add({
        targets: sparkle,
        y: sparkle.y - 40 - Math.random() * 40,
        x: sparkle.x + (Math.random() - 0.5) * 30,
        alpha: 0,
        scale: 0.2,
        rotation: Math.PI,
        duration: 400 + Math.random() * 150,
        ease: 'Quad.easeOut',
        onComplete: () => sparkle.destroy()
      });
    }

    // Confetti-like small particles
    for (let i = 0; i < 6; i++) {
      const confettiColors = [color, 0xffffff, 0xffeb3b, 0xff69b4, complementColor];
      const confetti = this.add.rectangle(
        x, y,
        3 + Math.random() * 4,
        6 + Math.random() * 6,
        Phaser.Utils.Array.GetRandom(confettiColors),
        0.9
      );

      const angle = Math.random() * Math.PI * 2;
      const distance = BUBBLE_RADIUS * 1.5 + Math.random() * BUBBLE_RADIUS * 2;

      this.tweens.add({
        targets: confetti,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance + 20, // Slight downward drift
        rotation: Math.random() * Math.PI * 4,
        alpha: 0,
        scale: 0.3,
        duration: 450 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => confetti.destroy()
      });
    }
  }

  // Get a complementary color for visual variety
  getComplementaryColor(color) {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    // Simple complementary: shift hue
    return ((255 - r) << 16) | ((255 - g) << 8) | (255 - b);
  }

  // Remove bubble from grid data structure
  removeBubbleFromGrid(bubble) {
    const index = this.gridBubbles.indexOf(bubble);
    if (index > -1) {
      // Destroy container (includes all children)
      if (bubble.sprite) bubble.sprite.destroy();
      this.gridBubbles.splice(index, 1);
    }
  }

  // Find bubbles that are no longer connected to the ceiling
  findFloatingBubbles() {
    // Mark all bubbles as potentially floating
    const connected = new Set();

    // BFS from all top-row bubbles to find connected ones
    const queue = this.gridBubbles.filter(b => b.row === 0);
    for (const bubble of queue) {
      connected.add(`${bubble.row},${bubble.col}`);
    }

    while (queue.length > 0) {
      const current = queue.shift();
      const neighbors = this.getNeighbors(current.row, current.col);

      for (const neighbor of neighbors) {
        const key = `${neighbor.row},${neighbor.col}`;
        if (connected.has(key)) continue;

        const bubble = this.getBubbleAtCell(neighbor.row, neighbor.col);
        if (bubble) {
          connected.add(key);
          queue.push(bubble);
        }
      }
    }

    // Return bubbles that are not connected to ceiling
    return this.gridBubbles.filter(b => !connected.has(`${b.row},${b.col}`));
  }

  // Make floating bubbles fall with gravity
  dropFloatingBubbles(bubbles) {
    // Play falling sound once for the group
    if (bubbles.length > 0) {
      soundManager.playFall();
    }

    for (const bubble of bubbles) {
      // Remove from grid but keep sprites
      const index = this.gridBubbles.indexOf(bubble);
      if (index > -1) {
        this.gridBubbles.splice(index, 1);
      }

      // Add to falling bubbles with initial velocity (sprite is container)
      this.fallingBubbles.push({
        sprite: bubble.sprite,
        x: bubble.x,
        y: bubble.y,
        velocityY: 0,
        velocityX: (Math.random() - 0.5) * 100, // Slight horizontal spread
        rotationSpeed: (Math.random() - 0.5) * 10
      });
    }
  }

  // Update falling bubbles each frame
  updateFallingBubbles() {
    if (this.fallingBubbles.length === 0) return;

    const delta = this.game.loop.delta / 1000;
    const toRemove = [];

    for (const bubble of this.fallingBubbles) {
      // Apply gravity
      bubble.velocityY += FALL_GRAVITY * delta;

      // Update position
      bubble.x += bubble.velocityX * delta;
      bubble.y += bubble.velocityY * delta;

      // Update sprite container position and rotation
      if (bubble.sprite) {
        bubble.sprite.x = bubble.x;
        bubble.sprite.y = bubble.y;
        bubble.sprite.rotation += bubble.rotationSpeed * delta;
      }

      // Remove if off screen
      if (bubble.y > this.cameras.main.height + 50) {
        if (bubble.sprite) bubble.sprite.destroy();
        toRemove.push(bubble);
      }
    }

    // Clean up off-screen bubbles
    for (const bubble of toRemove) {
      const index = this.fallingBubbles.indexOf(bubble);
      if (index > -1) {
        this.fallingBubbles.splice(index, 1);
      }
    }
  }

  handleShoot(angle) {
    // Don't shoot if paused or already shooting
    if (this.isPaused) return;
    if (this.shootingBubble && this.shootingBubble.active) {
      return;
    }

    // Initialize and play shoot sound
    soundManager.init();
    soundManager.playShoot();

    // Clear trajectory preview
    this.trajectoryGraphics.clear();
    this.isAiming = false;

    // Calculate velocity from angle (angle is in degrees, 90 = straight up)
    const radians = Phaser.Math.DegToRad(angle);
    const velocityX = Math.cos(radians) * BUBBLE_SPEED;
    const velocityY = -Math.sin(radians) * BUBBLE_SPEED; // Negative because Y increases downward

    // Get shooter position
    const { width, height } = this.cameras.main;
    const shooterX = width / 2;
    const shooterY = height - 50 - 35; // Same as currentBubble position

    // Create glossy shooting bubble
    const shootingContainer = this.createGlossyBubble(
      shooterX,
      shooterY,
      BUBBLE_RADIUS,
      this.currentBubbleColor,
      3, 0.8
    );

    this.shootingBubble = shootingContainer;

    // Set physics properties on container
    this.shootingBubble.velocityX = velocityX;
    this.shootingBubble.velocityY = velocityY;
    this.shootingBubble.active = true;
    this.shootingBubble.color = this.currentBubbleColor;

    // Add rotation based on horizontal direction
    this.shootingBubble.rotationSpeed = velocityX > 0 ? 5 : -5;

    // Cycle colors for next shot (using available colors based on score)
    this.currentBubbleColor = this.nextBubbleColor;
    this.currentBubble.setFillStyle(this.currentBubbleColor);

    this.nextBubbleColor = this.getRandomAvailableColor();
    this.nextBubble.setFillStyle(this.nextBubbleColor);
  }

  drawTrajectory(angle) {
    this.trajectoryGraphics.clear();

    // Calculate starting position
    const { width, height } = this.cameras.main;
    const startX = width / 2;
    const startY = height - 50 - 35;

    // Calculate direction vector
    const radians = Phaser.Math.DegToRad(angle);
    let dx = Math.cos(radians);
    let dy = -Math.sin(radians);

    // Simulate trajectory with bounces
    let x = startX;
    let y = startY;
    const points = [{ x, y }];
    const maxBounces = 3;
    let bounces = 0;
    const stepSize = 10;
    const maxSteps = 200;
    let hitBubble = false;

    for (let step = 0; step < maxSteps && bounces <= maxBounces && !hitBubble; step++) {
      x += dx * stepSize;
      y += dy * stepSize;

      // Check wall bounces
      if (x - BUBBLE_RADIUS <= this.gameArea.left) {
        x = this.gameArea.left + BUBBLE_RADIUS;
        dx = Math.abs(dx);
        bounces++;
        points.push({ x, y, bounce: true });
      } else if (x + BUBBLE_RADIUS >= this.gameArea.right) {
        x = this.gameArea.right - BUBBLE_RADIUS;
        dx = -Math.abs(dx);
        bounces++;
        points.push({ x, y, bounce: true });
      }

      // Check ceiling
      if (y - BUBBLE_RADIUS <= this.gameArea.top) {
        y = this.gameArea.top + BUBBLE_RADIUS;
        points.push({ x, y });
        break;
      }

      // Check collision with grid bubbles
      if (this.checkGridCollision(x, y)) {
        hitBubble = true;
        points.push({ x, y });
        break;
      }

      // Add point for line drawing (every few steps for performance)
      if (step % 3 === 0) {
        points.push({ x, y });
      }
    }

    // Draw trajectory as dashed line
    this.trajectoryGraphics.lineStyle(2, 0xffffff, 0.5);

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      // Draw dashed segments
      const segmentLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const dashLength = 8;
      const gapLength = 6;
      const dashCount = Math.floor(segmentLength / (dashLength + gapLength));

      const dirX = (p2.x - p1.x) / segmentLength;
      const dirY = (p2.y - p1.y) / segmentLength;

      for (let d = 0; d < dashCount; d++) {
        const dashStart = d * (dashLength + gapLength);
        const dashEnd = dashStart + dashLength;

        this.trajectoryGraphics.beginPath();
        this.trajectoryGraphics.moveTo(
          p1.x + dirX * dashStart,
          p1.y + dirY * dashStart
        );
        this.trajectoryGraphics.lineTo(
          p1.x + dirX * Math.min(dashEnd, segmentLength),
          p1.y + dirY * Math.min(dashEnd, segmentLength)
        );
        this.trajectoryGraphics.strokePath();
      }

      // Draw bounce indicator
      if (p2.bounce) {
        this.trajectoryGraphics.fillStyle(0xffffff, 0.7);
        this.trajectoryGraphics.fillCircle(p2.x, p2.y, 4);
      }
    }

    // Draw target indicator at end
    const lastPoint = points[points.length - 1];
    this.trajectoryGraphics.lineStyle(2, 0xffffff, 0.6);
    this.trajectoryGraphics.strokeCircle(lastPoint.x, lastPoint.y, BUBBLE_RADIUS);
  }

  updateScore(points, x = null, y = null) {
    this.score += points;
    this.scoreText.setText(this.score.toString());

    // Animate score text
    this.tweens.add({
      targets: this.scoreText,
      scale: 1.3,
      duration: 100,
      yoyo: true,
      ease: 'Quad.easeOut'
    });

    // Show floating score popup if position provided
    if (x !== null && y !== null) {
      this.createScorePopup(points, x, y);
    }

    // Check if we've unlocked new colors
    this.checkColorProgression();

    // Update descent interval based on new score
    this.updateDescentInterval();

    // Update music tempo based on score
    musicManager.updateTempo(this.score);
  }

  // Create animated score popup that floats up and fades
  createScorePopup(points, x, y) {
    // Determine color based on points (higher = more exciting color)
    let color = '#ffffff';
    let fontSize = '20px';

    if (points >= 100) {
      color = '#ffd700'; // Gold for big scores
      fontSize = '28px';
    } else if (points >= 50) {
      color = '#4ade80'; // Green for good scores
      fontSize = '24px';
    } else if (points >= 30) {
      color = '#60a5fa'; // Blue for medium scores
      fontSize = '22px';
    }

    const popup = this.add.text(x, y, `+${points}`, {
      fontSize: fontSize,
      fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
      color: color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(80);

    // Float up and fade animation
    this.tweens.add({
      targets: popup,
      y: y - 60,
      alpha: 0,
      scale: 1.5,
      duration: 800,
      ease: 'Quad.easeOut',
      onComplete: () => popup.destroy()
    });

    // Slight wobble for playful feel
    this.tweens.add({
      targets: popup,
      x: x + (Math.random() - 0.5) * 20,
      duration: 400,
      ease: 'Sine.easeInOut'
    });
  }

  // Calculate descent interval based on current score
  getDescentIntervalForScore() {
    let interval = INITIAL_DESCENT_INTERVAL;
    for (const threshold of DESCENT_SPEED_THRESHOLDS) {
      if (this.score >= threshold.score) {
        interval = threshold.interval;
      }
    }
    return Math.max(interval, MIN_DESCENT_INTERVAL);
  }

  // Update descent interval when score changes
  updateDescentInterval() {
    const newInterval = this.getDescentIntervalForScore();
    if (newInterval !== this.descentInterval) {
      this.descentInterval = newInterval;
      // Restart timer with new interval if not in warning phase
      if (this.descentTimer && !this.warningTimer) {
        this.descentTimer.remove();
        this.startDescentTimer();
      }
    }
  }

  // Start the descent timer
  startDescentTimer() {
    if (this.isGameOver) return;

    // Calculate time until warning (interval minus warning time)
    const timeUntilWarning = this.descentInterval - DESCENT_WARNING_TIME;

    this.descentTimer = this.time.delayedCall(timeUntilWarning, () => {
      this.startWarningCountdown();
    });
  }

  // Start the 3-second warning countdown
  startWarningCountdown() {
    if (this.isGameOver || this.isPaused) {
      // Restart full timer if paused
      this.startDescentTimer();
      return;
    }

    this.warningCountdown = 3;
    this.showWarningIndicator();

    // Update countdown every second
    this.warningTimer = this.time.addEvent({
      delay: 1000,
      repeat: 2,
      callback: () => {
        this.warningCountdown--;
        this.updateWarningDisplay();

        if (this.warningCountdown <= 0) {
          this.hideWarningIndicator();
          this.descendGrid();
        }
      }
    });
  }

  // Create warning indicator UI
  createWarningIndicator(width, _height) {
    this.warningIndicator = this.add.container(width / 2, 100);
    this.warningIndicator.setDepth(60);
    this.warningIndicator.setVisible(false);

    // Warning background panel
    const warningPanel = this.add.rectangle(0, 0, 200, 60, 0xff0000, 0.8);
    warningPanel.setStrokeStyle(3, 0xffffff, 1);

    // Warning text with playful font
    this.warningText = this.add.text(0, -10, 'DESCENDING!', {
      fontSize: '18px',
      fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    // Countdown number with playful font
    this.warningCountdownText = this.add.text(0, 15, '3', {
      fontSize: '26px',
      fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    this.warningIndicator.add([warningPanel, this.warningText, this.warningCountdownText]);
  }

  // Show warning indicator with animation
  showWarningIndicator() {
    // Play warning sound
    soundManager.playWarning();

    this.warningCountdownText.setText('3');
    this.warningIndicator.setVisible(true);
    this.warningIndicator.setAlpha(0);
    this.warningIndicator.setScale(0.5);

    this.tweens.add({
      targets: this.warningIndicator,
      alpha: 1,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut'
    });

    // Pulsing animation
    this.warningPulse = this.tweens.add({
      targets: this.warningIndicator,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  // Update warning countdown display
  updateWarningDisplay() {
    if (this.warningCountdown > 0) {
      this.warningCountdownText.setText(this.warningCountdown.toString());
    }
  }

  // Hide warning indicator
  hideWarningIndicator() {
    if (this.warningPulse) {
      this.warningPulse.stop();
    }

    this.tweens.add({
      targets: this.warningIndicator,
      alpha: 0,
      scale: 0.5,
      duration: 150,
      onComplete: () => {
        this.warningIndicator.setVisible(false);
      }
    });

    this.warningTimer = null;
  }

  // Descend the entire grid by one row
  descendGrid() {
    if (this.isGameOver) return;

    // Move all existing bubbles down by one row visually
    for (const bubble of this.gridBubbles) {
      bubble.row += 1;
      const newPos = this.getGridPosition(bubble.row, bubble.col);
      bubble.y = newPos.y;
      bubble.x = newPos.x; // X might change due to odd/even row offset

      // Animate the descent (sprite is a container now)
      this.tweens.add({
        targets: bubble.sprite,
        x: newPos.x,
        y: newPos.y,
        duration: 200,
        ease: 'Quad.easeOut'
      });
    }

    // Add new row at the top (row 0)
    this.addNewTopRow();

    // Check for game over after descent
    this.time.delayedCall(250, () => {
      if (this.checkGameOver()) {
        this.triggerGameOver();
      } else {
        // Start next descent timer
        this.startDescentTimer();
      }
    });
  }

  // Add a new row of bubbles at the top
  addNewTopRow() {
    // Determine if new row 0 should be odd or even based on descent count
    // After descent, the old row 0 becomes row 1, so new row 0 follows standard pattern
    const bubblesInRow = this.bubblesPerRow; // Row 0 is always full

    for (let col = 0; col < bubblesInRow; col++) {
      const color = this.getRandomAvailableColor();
      const pos = this.getGridPosition(0, col);

      // Create glossy bubble container (start above screen)
      const sprite = this.createGlossyBubble(pos.x, pos.y - ROW_HEIGHT, BUBBLE_RADIUS, color);

      const bubbleData = {
        row: 0,
        col,
        x: pos.x,
        y: pos.y,
        color,
        sprite,
        shine: null
      };

      this.gridBubbles.push(bubbleData);

      // Animate the new bubble sliding in
      this.tweens.add({
        targets: sprite,
        y: pos.y,
        duration: 200,
        ease: 'Quad.easeOut'
      });
    }
  }

  // Check if any bubble has crossed the bottom boundary
  checkGameOver() {
    for (const bubble of this.gridBubbles) {
      if (bubble.y + BUBBLE_RADIUS >= this.gameArea.bottom) {
        return true;
      }
    }
    return false;
  }

  // Leaderboard management
  loadLeaderboard() {
    try {
      const stored = localStorage.getItem(LEADERBOARD_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Ignore localStorage errors
    }
    return [];
  }

  saveLeaderboard(leaderboard) {
    try {
      localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(leaderboard));
    } catch {
      // Ignore localStorage errors
    }
  }

  checkHighScore(score) {
    const leaderboard = this.loadLeaderboard();

    // If leaderboard has fewer than MAX entries, any score qualifies
    if (leaderboard.length < MAX_LEADERBOARD_ENTRIES) {
      return { isHighScore: true, rank: leaderboard.length };
    }

    // Check if score beats any existing entry
    for (let i = 0; i < leaderboard.length; i++) {
      if (score > leaderboard[i].score) {
        return { isHighScore: true, rank: i };
      }
    }

    return { isHighScore: false, rank: -1 };
  }

  addToLeaderboard(initials, score) {
    const leaderboard = this.loadLeaderboard();
    const entry = { initials, score, date: Date.now() };

    // Find insertion point
    let insertIndex = leaderboard.length;
    for (let i = 0; i < leaderboard.length; i++) {
      if (score > leaderboard[i].score) {
        insertIndex = i;
        break;
      }
    }

    // Insert at the correct position
    leaderboard.splice(insertIndex, 0, entry);

    // Keep only top 10
    while (leaderboard.length > MAX_LEADERBOARD_ENTRIES) {
      leaderboard.pop();
    }

    this.saveLeaderboard(leaderboard);
    return leaderboard;
  }

  // Create game over overlay
  createGameOverOverlay(width, height) {
    this.gameOverOverlay = this.add.container(width / 2, height / 2);
    this.gameOverOverlay.setDepth(150);
    this.gameOverOverlay.setVisible(false);

    // Dark overlay background
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.9);
    this.gameOverOverlay.add(overlay);
  }

  // Build the game over screen content (called when game ends)
  buildGameOverScreen() {
    const { height } = this.cameras.main;

    // Clear any previous content except the background overlay
    while (this.gameOverOverlay.list.length > 1) {
      const item = this.gameOverOverlay.list[this.gameOverOverlay.list.length - 1];
      item.destroy();
      this.gameOverOverlay.remove(item);
    }

    // Check if this is a high score
    const { isHighScore, rank } = this.checkHighScore(this.score);
    this.isHighScore = isHighScore;
    this.leaderboardRank = rank;

    // Calculate vertical positions based on screen height
    const topOffset = -height / 2 + 60;
    let yPos = topOffset;

    // Game Over text with playful font
    const gameOverText = this.add.text(0, yPos, 'GAME OVER', {
      fontSize: '46px',
      fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
      color: '#ef4444',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);
    this.gameOverOverlay.add(gameOverText);

    // Animate game over text entrance
    gameOverText.setScale(0);
    this.tweens.add({
      targets: gameOverText,
      scale: 1,
      duration: 400,
      ease: 'Back.easeOut',
      delay: 100
    });
    yPos += 60;

    // Final score label
    const scoreLabel = this.add.text(0, yPos, 'Final Score', {
      fontSize: '20px',
      fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
      color: '#aaaaaa'
    }).setOrigin(0.5);
    this.gameOverOverlay.add(scoreLabel);
    yPos += 30;

    // Final score value with playful styling
    this.finalScoreText = this.add.text(0, yPos, this.score.toString(), {
      fontSize: '52px',
      fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
      color: '#ffe66d',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);
    this.gameOverOverlay.add(this.finalScoreText);

    // Animate score counting up
    this.finalScoreText.setText('0');
    this.tweens.addCounter({
      from: 0,
      to: this.score,
      duration: 1000,
      ease: 'Quad.easeOut',
      delay: 300,
      onUpdate: (tween) => {
        this.finalScoreText.setText(Math.floor(tween.getValue()).toString());
      }
    });
    yPos += 50;

    // NEW HIGH SCORE message if applicable
    if (this.isHighScore) {
      const highScoreText = this.add.text(0, yPos, '🎉 NEW HIGH SCORE! 🎉', {
        fontSize: '26px',
        fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
        color: '#4ade80',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2
      }).setOrigin(0.5);
      this.gameOverOverlay.add(highScoreText);

      // Pulsing animation for high score text
      this.tweens.add({
        targets: highScoreText,
        scale: 1.1,
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      yPos += 45;

      // Show waiting message (initials entry is on mobile)
      const waitingText = this.add.text(0, yPos, 'Enter initials on controller...', {
        fontSize: '18px',
        fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
        color: '#f59e0b'
      }).setOrigin(0.5);
      this.gameOverOverlay.add(waitingText);

      // Pulsing animation for waiting text
      this.tweens.add({
        targets: waitingText,
        alpha: 0.5,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      yPos += 50;
    } else {
      yPos += 20;
    }

    // Leaderboard section
    this.createLeaderboardDisplay(yPos);

    // No play again button - game will restart to QR code after initials
  }

  // Create initials input for high score entry
  createInitialsInput(yPos) {
    // Reset initials state
    this.initialsLetters = ['A', 'A', 'A'];
    this.selectedLetterIndex = 0;
    this.playerInitials = '';

    // Container for initials input
    this.initialsInput = this.add.container(0, yPos);
    this.gameOverOverlay.add(this.initialsInput);

    // Instruction text
    const instructText = this.add.text(0, -25, 'Enter your initials:', {
      fontSize: '16px',
      fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
      color: '#aaaaaa'
    }).setOrigin(0.5);
    this.initialsInput.add(instructText);

    // Letter boxes
    this.letterTexts = [];
    this.letterBoxes = [];
    const boxWidth = 50;
    const spacing = 60;
    const startX = -spacing;

    for (let i = 0; i < 3; i++) {
      const x = startX + i * spacing;

      // Letter box background
      const box = this.add.rectangle(x, 10, boxWidth, 50, 0x333333, 1);
      box.setStrokeStyle(3, i === 0 ? 0x4ade80 : 0x666666);
      this.letterBoxes.push(box);
      this.initialsInput.add(box);

      // Letter text
      const letterText = this.add.text(x, 10, this.initialsLetters[i], {
        fontSize: '32px',
        fontFamily: 'monospace',
        color: '#ffffff',
        fontStyle: 'bold'
      }).setOrigin(0.5);
      this.letterTexts.push(letterText);
      this.initialsInput.add(letterText);

      // Up arrow (interactive)
      const upArrow = this.add.text(x, -22, '▲', {
        fontSize: '16px',
        fontFamily: 'Arial, sans-serif',
        color: '#888888'
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      upArrow.on('pointerdown', () => this.changeInitialLetter(i, 1));
      upArrow.on('pointerover', () => upArrow.setColor('#ffffff'));
      upArrow.on('pointerout', () => upArrow.setColor('#888888'));
      this.initialsInput.add(upArrow);

      // Down arrow (interactive)
      const downArrow = this.add.text(x, 42, '▼', {
        fontSize: '16px',
        fontFamily: 'Arial, sans-serif',
        color: '#888888'
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      downArrow.on('pointerdown', () => this.changeInitialLetter(i, -1));
      downArrow.on('pointerover', () => downArrow.setColor('#ffffff'));
      downArrow.on('pointerout', () => downArrow.setColor('#888888'));
      this.initialsInput.add(downArrow);
    }

    // Submit button
    const submitBtn = this.add.rectangle(0, 75, 120, 35, 0x4ade80, 1);
    submitBtn.setStrokeStyle(2, 0x22c55e);
    submitBtn.setInteractive({ useHandCursor: true });
    submitBtn.on('pointerdown', () => this.submitInitials());
    submitBtn.on('pointerover', () => submitBtn.setFillStyle(0x22c55e));
    submitBtn.on('pointerout', () => submitBtn.setFillStyle(0x4ade80));
    this.initialsInput.add(submitBtn);

    const submitText = this.add.text(0, 75, 'SAVE', {
      fontSize: '16px',
      fontFamily: 'Arial, sans-serif',
      color: '#000000',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.initialsInput.add(submitText);

    // Add keyboard support for initials
    this.input.keyboard.on('keydown', this.handleInitialsKeydown, this);
  }

  handleInitialsKeydown(event) {
    if (!this.isGameOver || !this.isHighScore || this.playerInitials) return;

    const key = event.key.toUpperCase();

    // Handle letter input (A-Z)
    if (/^[A-Z]$/.test(key)) {
      this.initialsLetters[this.selectedLetterIndex] = key;
      this.letterTexts[this.selectedLetterIndex].setText(key);

      // Move to next letter
      if (this.selectedLetterIndex < 2) {
        this.selectLetterIndex(this.selectedLetterIndex + 1);
      }
    }
    // Arrow keys
    else if (event.key === 'ArrowUp') {
      this.changeInitialLetter(this.selectedLetterIndex, 1);
    }
    else if (event.key === 'ArrowDown') {
      this.changeInitialLetter(this.selectedLetterIndex, -1);
    }
    else if (event.key === 'ArrowLeft' && this.selectedLetterIndex > 0) {
      this.selectLetterIndex(this.selectedLetterIndex - 1);
    }
    else if (event.key === 'ArrowRight' && this.selectedLetterIndex < 2) {
      this.selectLetterIndex(this.selectedLetterIndex + 1);
    }
    // Enter to submit
    else if (event.key === 'Enter') {
      this.submitInitials();
    }
  }

  selectLetterIndex(index) {
    // Update visual selection
    this.letterBoxes.forEach((box, i) => {
      box.setStrokeStyle(3, i === index ? 0x4ade80 : 0x666666);
    });
    this.selectedLetterIndex = index;
  }

  changeInitialLetter(index, direction) {
    if (this.playerInitials) return; // Already submitted

    let charCode = this.initialsLetters[index].charCodeAt(0);
    charCode += direction;

    // Wrap around A-Z
    if (charCode > 90) charCode = 65;
    if (charCode < 65) charCode = 90;

    this.initialsLetters[index] = String.fromCharCode(charCode);
    this.letterTexts[index].setText(this.initialsLetters[index]);

    // Select this letter box
    this.selectLetterIndex(index);
  }

  submitInitials() {
    if (this.playerInitials) return; // Already submitted

    this.playerInitials = this.initialsLetters.join('');

    // Add to leaderboard and refresh display
    const updatedLeaderboard = this.addToLeaderboard(this.playerInitials, this.score);

    // Disable initials input (visual feedback)
    this.letterBoxes.forEach(box => {
      box.setFillStyle(0x222222);
      box.setStrokeStyle(3, 0x4ade80);
    });

    // Remove keyboard listener
    this.input.keyboard.off('keydown', this.handleInitialsKeydown, this);

    // Update leaderboard display to show the entry highlighted
    this.updateLeaderboardDisplay(updatedLeaderboard);
  }

  // Create leaderboard display
  createLeaderboardDisplay(yPos) {
    const leaderboard = this.loadLeaderboard();

    // Container for leaderboard
    this.leaderboardContainer = this.add.container(0, yPos);
    this.gameOverOverlay.add(this.leaderboardContainer);

    // Leaderboard title with playful font
    const title = this.add.text(0, 0, '🏆 TOP SCORES 🏆', {
      fontSize: '22px',
      fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
      color: '#fbbf24',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);
    this.leaderboardContainer.add(title);

    // Leaderboard entries
    this.leaderboardTexts = [];
    this.buildLeaderboardEntries(leaderboard, false);
  }

  buildLeaderboardEntries(leaderboard, highlightNew) {
    // Clear existing entries
    this.leaderboardTexts.forEach(text => text.destroy());
    this.leaderboardTexts = [];

    const startY = 30;
    const lineHeight = 24;

    if (leaderboard.length === 0) {
      const emptyText = this.add.text(0, startY + 20, 'No scores yet!', {
        fontSize: '16px',
        fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
        color: '#666666'
      }).setOrigin(0.5);
      this.leaderboardContainer.add(emptyText);
      this.leaderboardTexts.push(emptyText);
      return;
    }

    for (let i = 0; i < Math.min(leaderboard.length, MAX_LEADERBOARD_ENTRIES); i++) {
      const entry = leaderboard[i];
      const y = startY + i * lineHeight;

      // Determine if this is the player's new entry
      const isPlayerEntry = highlightNew &&
        entry.initials === this.playerInitials &&
        entry.score === this.score;

      const color = isPlayerEntry ? '#4ade80' : '#ffffff';
      const rank = `${i + 1}.`.padStart(3, ' ');
      const initials = entry.initials.padEnd(4, ' ');
      const scoreStr = entry.score.toString().padStart(6, ' ');

      const entryText = this.add.text(0, y, `${rank} ${initials} ${scoreStr}`, {
        fontSize: '18px',
        fontFamily: 'monospace',
        color: color
      }).setOrigin(0.5);

      this.leaderboardContainer.add(entryText);
      this.leaderboardTexts.push(entryText);

      // Highlight animation for new entry
      if (isPlayerEntry) {
        this.tweens.add({
          targets: entryText,
          alpha: 0.5,
          duration: 300,
          yoyo: true,
          repeat: 2,
          ease: 'Sine.easeInOut'
        });
      }
    }
  }

  updateLeaderboardDisplay(leaderboard) {
    this.buildLeaderboardEntries(leaderboard, true);
  }

  // Create Play Again button
  createPlayAgainButton(yPos) {
    // Button container
    const btnContainer = this.add.container(0, yPos);
    this.gameOverOverlay.add(btnContainer);

    // Button background with rounded look
    const btnBg = this.add.rectangle(0, 0, 200, 55, 0x3b82f6, 1);
    btnBg.setStrokeStyle(4, 0x60a5fa);
    btnBg.setInteractive({ useHandCursor: true });

    // Button shine effect
    const btnShine = this.add.rectangle(0, -12, 180, 15, 0xffffff, 0.15);

    // Button text with playful font
    const btnText = this.add.text(0, 0, 'PLAY AGAIN', {
      fontSize: '24px',
      fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#2563eb',
      strokeThickness: 2
    }).setOrigin(0.5);

    btnContainer.add([btnBg, btnShine, btnText]);

    // Entrance animation
    btnContainer.setScale(0);
    this.tweens.add({
      targets: btnContainer,
      scale: 1,
      duration: 400,
      ease: 'Back.easeOut',
      delay: 500
    });

    // Gentle floating animation
    this.tweens.add({
      targets: btnContainer,
      y: yPos - 5,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 900
    });

    // Hover effects
    btnBg.on('pointerover', () => {
      btnBg.setFillStyle(0x60a5fa);
      this.tweens.add({
        targets: btnContainer,
        scale: 1.1,
        duration: 100,
        ease: 'Quad.easeOut'
      });
    });

    btnBg.on('pointerout', () => {
      btnBg.setFillStyle(0x3b82f6);
      this.tweens.add({
        targets: btnContainer,
        scale: 1,
        duration: 100,
        ease: 'Quad.easeOut'
      });
    });

    // Click to restart
    btnBg.on('pointerdown', () => {
      this.restartGame();
    });
  }

  // Restart the game without rescanning QR
  restartGame() {
    // Reset game state
    this.isGameOver = false;
    this.isPaused = false;
    this.score = 0;
    this.scoreText.setText('0');
    this.availableColorCount = 4;
    this.isHighScore = false;
    this.leaderboardRank = -1;
    this.playerInitials = '';

    // Remove keyboard listener if still attached
    this.input.keyboard.off('keydown', this.handleInitialsKeydown, this);

    // Clear all grid bubbles (containers)
    for (const bubble of this.gridBubbles) {
      if (bubble.sprite) bubble.sprite.destroy();
    }
    this.gridBubbles = [];

    // Clear falling bubbles (containers)
    for (const bubble of this.fallingBubbles) {
      if (bubble.sprite) bubble.sprite.destroy();
    }
    this.fallingBubbles = [];

    // Clear shooting bubble if any (container)
    if (this.shootingBubble) {
      this.shootingBubble.destroy();
      this.shootingBubble = null;
    }

    // Clear trajectory
    this.trajectoryGraphics.clear();

    // Hide game over overlay
    this.gameOverOverlay.setVisible(false);

    // Reset bubble colors
    this.currentBubbleColor = this.getRandomAvailableColor();
    this.nextBubbleColor = this.getRandomAvailableColor();
    this.currentBubble.setFillStyle(this.currentBubbleColor);
    this.nextBubble.setFillStyle(this.nextBubbleColor);

    // Reset descent interval
    this.descentInterval = INITIAL_DESCENT_INTERVAL;

    // Create new initial bubbles
    this.createInitialBubbles();

    // Start descent timer
    this.startDescentTimer();

    // Reset and restart background music
    musicManager.setTenseMode(false);
    musicManager.updateTempo(0);
    musicManager.start();
  }

  // Trigger game over state
  triggerGameOver() {
    this.isGameOver = true;
    this.isPaused = true;
    this.initialsReceived = false;

    // Stop background music
    musicManager.stop();

    // Play game over sound
    soundManager.playGameOver();

    // Stop all timers
    if (this.descentTimer) {
      this.descentTimer.remove();
    }
    if (this.warningTimer) {
      this.warningTimer.remove();
    }
    this.hideWarningIndicator();

    // Check if this is a high score
    const { isHighScore } = this.checkHighScore(this.score);
    this.isHighScore = isHighScore;

    // Send game over to controller for initials entry
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'game_over',
        data: { score: this.score, isHighScore }
      }));
    }

    // Desktop-side timeout: if controller doesn't respond in 25 seconds, auto-close
    this.gameOverTimeout = this.time.delayedCall(25000, () => {
      if (this.isGameOver && !this.initialsReceived) {
        // No response from controller, close without saving
        this.returnToWaitingScene();
      }
    });

    // Build the game over screen with leaderboard
    this.buildGameOverScreen();

    // Show game over overlay with animation
    this.gameOverOverlay.setVisible(true);
    this.gameOverOverlay.setAlpha(0);
    this.gameOverOverlay.setScale(0.9);

    this.tweens.add({
      targets: this.gameOverOverlay,
      alpha: 1,
      scale: 1,
      duration: 400,
      ease: 'Back.easeOut'
    });
  }

  // Handle initials submission from controller
  handleSubmitInitials(initials) {
    if (!this.isGameOver || this.initialsReceived) return;

    this.initialsReceived = true;

    // Cancel the timeout since we got a response
    if (this.gameOverTimeout) {
      this.gameOverTimeout.remove();
      this.gameOverTimeout = null;
    }

    // Save score if we have initials and it's a high score
    if (initials && this.isHighScore) {
      this.playerInitials = initials;
      this.addToLeaderboard(initials, this.score);
    }

    // Close room and restart to QR code after a short delay
    this.time.delayedCall(1500, () => {
      this.returnToWaitingScene();
    });
  }

  // Return to the waiting scene (QR code)
  returnToWaitingScene() {
    // Tell server to close the room (this notifies the controller)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'close_room' }));
    }

    // Close the WebSocket connection
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Switch back to the waiting scene
    this.scene.start('WaitingScene');
  }
}

class WaitingScene extends Phaser.Scene {
  constructor() {
    super({ key: 'WaitingScene' });
    this.ws = null;
    this.roomCode = null;
    this.qrImage = null;
    this.qrBackground = null;
    this.waitingText = null;
    this.connectedText = null;
  }

  preload() {
    // Load background image
    this.load.image('bubbleShooterBg', '/assets/bg.png');
  }

  create() {
    const { width, height } = this.cameras.main;

    // Add background image with cover sizing (maintains aspect ratio, covers entire screen)
    this.bgImage = this.add.image(width / 2, height / 2, 'bubbleShooterBg');
    
    // Get image dimensions and calculate scale to cover screen (like CSS background-size: cover)
    const imageWidth = this.bgImage.width;
    const imageHeight = this.bgImage.height;
    const scaleX = width / imageWidth;
    const scaleY = height / imageHeight;
    const scale = Math.max(scaleX, scaleY); // Use larger scale to ensure coverage
    
    this.bgImage.setScale(scale);
    this.bgImage.setDepth(-1); // Behind all other elements

    // Add semi-transparent overlay to ensure text is readable
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.3)
      .setDepth(0);

    const centerX = width / 2;
    const centerY = height / 2;

    // Title with playful font
    const title = this.add.text(centerX, 50, 'Bubble Shooter', {
      fontSize: '52px',
      fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#667eea',
      strokeThickness: 4
    }).setOrigin(0.5);

    // Title animation
    this.tweens.add({
      targets: title,
      y: 55,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // QR code placeholder - will be positioned after generation
    this.qrContainer = this.add.container(centerX, centerY - 30);

    // Waiting text below QR code area
    this.waitingText = this.add.text(centerX, centerY + 150, 'Connecting to server...', {
      fontSize: '24px',
      fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    // Room code display (initially hidden)
    this.roomCodeText = this.add.text(centerX, centerY + 190, '', {
      fontSize: '18px',
      fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    // Connected confirmation text (initially hidden)
    this.connectedText = this.add.text(centerX, centerY, 'Controller connected!', {
      fontSize: '32px',
      fontFamily: '"Comic Sans MS", "Chalkboard", cursive, sans-serif',
      color: '#4ade80',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5).setVisible(false);

    // Connect to WebSocket server
    this.connectWebSocket();
  }

  connectWebSocket() {
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      // Request a new room
      this.ws.send(JSON.stringify({ type: 'create_room' }));
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.ws.onerror = () => {
      this.waitingText.setText('Connection error. Is server running?');
      this.waitingText.setColor('#ef4444');
    };

    this.ws.onclose = () => {
      if (!this.roomCode) {
        this.waitingText.setText('Server disconnected');
        this.waitingText.setColor('#ef4444');
      }
    };
  }

  handleMessage(message) {
    switch (message.type) {
      case 'room_created':
        this.roomCode = message.data.roomCode;
        this.generateQRCode();
        break;
      case 'peer_connected':
        this.onControllerConnected();
        break;
      case 'peer_disconnected':
        this.onControllerDisconnected();
        break;
    }
  }

  async generateQRCode() {
    const controllerUrl = `${CONTROLLER_BASE_URL}?room=${this.roomCode}`;

    try {
      // Generate QR code as data URL
      const qrDataUrl = await QRCode.toDataURL(controllerUrl, {
        width: 220,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });

      // Remove existing texture if present (for game restarts)
      if (this.textures.exists('qrcode')) {
        this.textures.remove('qrcode');
      }

      // Load as Phaser texture
      this.textures.addBase64('qrcode', qrDataUrl);

      // Wait for texture to load
      this.textures.once('addtexture', () => {
        this.displayQRCode();
      });
    } catch {
      this.waitingText.setText('Failed to generate QR code');
      this.waitingText.setColor('#ef4444');
    }
  }

  displayQRCode() {
    const centerX = this.cameras.main.width / 2;
    const centerY = this.cameras.main.height / 2;

    // QR code dimensions
    const qrSize = 220; // QR code size
    const padding = 15; // White padding around QR code
    const totalSize = qrSize + (padding * 2); // Total size with padding
    const cornerRadius = 20; // Rounded corner radius
    
    // Create white rounded rectangle background with padding
    this.qrBackground = this.add.graphics();
    const bgX = centerX - totalSize / 2;
    const bgY = centerY - 30 - totalSize / 2;
    
    this.qrBackground.fillStyle(0xffffff);
    this.qrBackground.beginPath();
    this.qrBackground.moveTo(bgX + cornerRadius, bgY);
    this.qrBackground.lineTo(bgX + totalSize - cornerRadius, bgY);
    this.qrBackground.arc(bgX + totalSize - cornerRadius, bgY + cornerRadius, cornerRadius, -Math.PI / 2, 0);
    this.qrBackground.lineTo(bgX + totalSize, bgY + totalSize - cornerRadius);
    this.qrBackground.arc(bgX + totalSize - cornerRadius, bgY + totalSize - cornerRadius, cornerRadius, 0, Math.PI / 2);
    this.qrBackground.lineTo(bgX + cornerRadius, bgY + totalSize);
    this.qrBackground.arc(bgX + cornerRadius, bgY + totalSize - cornerRadius, cornerRadius, Math.PI / 2, Math.PI);
    this.qrBackground.lineTo(bgX, bgY + cornerRadius);
    this.qrBackground.arc(bgX + cornerRadius, bgY + cornerRadius, cornerRadius, Math.PI, -Math.PI / 2);
    this.qrBackground.closePath();
    this.qrBackground.fillPath();
    this.qrBackground.setDepth(1);
    
    // Add QR code image (centered on the white background)
    this.qrImage = this.add.image(centerX, centerY - 30, 'qrcode');
    this.qrImage.setDepth(2);
    
    // Create rounded rectangle mask for QR code
    const maskGraphics = this.make.graphics();
    const x = centerX - qrSize / 2;
    const y = centerY - 30 - qrSize / 2;
    maskGraphics.fillStyle(0xffffff);
    maskGraphics.beginPath();
    maskGraphics.moveTo(x + cornerRadius, y);
    maskGraphics.lineTo(x + qrSize - cornerRadius, y);
    maskGraphics.arc(x + qrSize - cornerRadius, y + cornerRadius, cornerRadius, -Math.PI / 2, 0);
    maskGraphics.lineTo(x + qrSize, y + qrSize - cornerRadius);
    maskGraphics.arc(x + qrSize - cornerRadius, y + qrSize - cornerRadius, cornerRadius, 0, Math.PI / 2);
    maskGraphics.lineTo(x + cornerRadius, y + qrSize);
    maskGraphics.arc(x + cornerRadius, y + qrSize - cornerRadius, cornerRadius, Math.PI / 2, Math.PI);
    maskGraphics.lineTo(x, y + cornerRadius);
    maskGraphics.arc(x + cornerRadius, y + cornerRadius, cornerRadius, Math.PI, -Math.PI / 2);
    maskGraphics.closePath();
    maskGraphics.fillPath();
    
    const mask = maskGraphics.createGeometryMask();
    this.qrImage.setMask(mask);

    // Update waiting text
    this.waitingText.setText('Waiting for controller...');
    this.waitingText.setColor('#ffffff');
    this.waitingText.setStroke('#000000', 4);

    // Show room code
    this.roomCodeText.setText(`Room: ${this.roomCode}`);
    this.roomCodeText.setColor('#ffffff');
    this.roomCodeText.setStroke('#000000', 4);
  }

  onControllerConnected() {
    // Hide QR code and waiting elements
    if (this.qrImage) {
      this.qrImage.setVisible(false);
    }
    if (this.qrBackground) {
      this.qrBackground.setVisible(false);
    }
    this.waitingText.setVisible(false);
    this.roomCodeText.setVisible(false);

    // Show connected confirmation
    this.connectedText.setVisible(true);

    // After brief confirmation, transition to game scene
    this.time.delayedCall(1500, () => {
      this.scene.start('GameScene', { ws: this.ws });
    });
  }

  onControllerDisconnected() {
    // Show QR code again if controller disconnects
    if (this.qrImage) {
      this.qrImage.setVisible(true);
    }
    if (this.qrBackground) {
      this.qrBackground.setVisible(true);
    }
    this.waitingText.setText('Controller disconnected. Scan to reconnect...');
    this.waitingText.setColor('#f59e0b');
    this.waitingText.setStroke('#000000', 4);
    this.waitingText.setVisible(true);
    this.roomCodeText.setVisible(true);
    this.connectedText.setVisible(false);
  }

  shutdown() {
    // Clean up WebSocket on scene shutdown
    if (this.ws) {
      this.ws.close();
    }
  }
}

class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create() {
    // Immediately transition to WaitingScene
    this.scene.start('WaitingScene');
  }
}

const config = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  parent: 'game-container',
  backgroundColor: '#1a1a2e',
  scene: [BootScene, WaitingScene, GameScene],
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
};

const game = new Phaser.Game(config);

export default game;
