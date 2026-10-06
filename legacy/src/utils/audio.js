/* ==========================================================================
   ASCEND AUDIO ENGINE (Native Web Audio API Synth-wave Generator)
   ========================================================================== */

import { db } from './db.js';

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Play a synthesized tone with customizable frequency, type, and volume envelope
function playTone({
  frequency,
  type = 'sine',
  duration = 0.15,
  gainStart = 0.1,
  frequencyEnd = null,
  delay = 0
}) {
  if (!db.isSoundEnabled()) return;

  try {
    const ctx = getAudioContext();
    const time = ctx.currentTime + delay;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, time);

    if (frequencyEnd) {
      osc.frequency.exponentialRampToValueAtTime(frequencyEnd, time + duration);
    }

    gainNode.gain.setValueAtTime(gainStart, time);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + duration);
  } catch (e) {
    console.warn("Web Audio failed to play sound:", e);
  }
}

export const audio = {
  // Classic Retro positive chime: C5 -> E5 -> G5
  playComplete() {
    playTone({ frequency: 523.25, type: 'sine', duration: 0.1, gainStart: 0.15 }); // C5
    playTone({ frequency: 659.25, type: 'sine', duration: 0.1, gainStart: 0.15, delay: 0.08 }); // E5
    playTone({ frequency: 783.99, type: 'sine', duration: 0.2, gainStart: 0.15, delay: 0.16 }); // G5
  },

  // Triumphant RPG level up arpeggio: C4 -> C5 -> G5 -> C6 (exponentially sweeps upward)
  playLevelUp() {
    const tones = [
      { f: 261.63, d: 0.0, len: 0.15, type: 'triangle' }, // C4
      { f: 329.63, d: 0.08, len: 0.15, type: 'triangle' }, // E4
      { f: 392.00, d: 0.16, len: 0.15, type: 'triangle' }, // G4
      { f: 523.25, d: 0.24, len: 0.2, type: 'triangle' }, // C5
      { f: 659.25, d: 0.32, len: 0.2, type: 'sine' }, // E5
      { f: 783.99, d: 0.40, len: 0.25, type: 'sine' }, // G5
      { f: 1046.50, d: 0.48, len: 0.4, type: 'sine', end: 1567.98 } // C6 with slide to G6
    ];

    tones.forEach(t => {
      playTone({
        frequency: t.f,
        type: t.type,
        duration: t.len,
        gainStart: 0.2,
        frequencyEnd: t.end,
        delay: t.d
      });
    });
  },

  // Celestial synth-chord slide: Warm and satisfying
  playAchievement() {
    const chords = [
      { f: 587.33, d: 0.0 }, // D5
      { f: 739.99, d: 0.03 }, // F#5
      { f: 880.00, d: 0.06 }, // A5
      { f: 1174.66, d: 0.09 } // D6
    ];

    chords.forEach(c => {
      playTone({
        frequency: c.f,
        type: 'sine',
        duration: 0.6,
        gainStart: 0.15,
        delay: c.d
      });
    });
  },

  // Soft UI click
  playClick() {
    playTone({
      frequency: 180,
      frequencyEnd: 60,
      type: 'sine',
      duration: 0.06,
      gainStart: 0.08
    });
  },

  // Initialize event listeners for global play triggers
  init() {
    // Listen for custom trigger events
    window.addEventListener('play-sound', (e) => {
      const type = e.detail && e.detail.type;
      switch (type) {
        case 'complete':
          this.playComplete();
          break;
        case 'levelup':
          this.playLevelUp();
          break;
        case 'achievement':
          this.playAchievement();
          break;
        case 'click':
          this.playClick();
          break;
      }
    });

    // Touch/Click gesture listener to wake up AudioContext (standard mobile Safari/Chrome requirement)
    const wakeAudio = () => {
      getAudioContext();
      window.removeEventListener('click', wakeAudio);
      window.removeEventListener('touchstart', wakeAudio);
    };
    window.addEventListener('click', wakeAudio);
    window.addEventListener('touchstart', wakeAudio);
  }
};
export default audio;
