// Pomodoro engine + persistence, kept UI-agnostic so the panel component stays
// thin. The timer is driven by an ABSOLUTE end timestamp (endsAt, epoch ms)
// rather than a decrementing counter, so it survives tab throttling, sleep and
// full reloads: on resume we just recompute remaining = endsAt - now. Only the
// running/paused bookkeeping + config + the day's tally live in localStorage.

const STORE_KEY = 'timeline-pomodoro-v1';

// The three phases and their default lengths (minutes). "long" fires after every
// `longEvery` completed focus sessions instead of a short break.
export const PHASES = {
  focus: { key: 'focus', label: 'Focus', color: '#5eead4', glow: 'rgba(94,234,212,.5)' },
  short: { key: 'short', label: 'Short break', color: '#7dd3fc', glow: 'rgba(125,211,252,.5)' },
  long: { key: 'long', label: 'Long break', color: '#c084fc', glow: 'rgba(192,132,252,.5)' },
};

export const DEFAULT_CONFIG = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  longEvery: 4, // a long break after this many focus sessions
  autoStart: true, // roll straight into the next phase when one ends
  chime: true, // play a soft tone on phase end
  notify: true, // fire a browser notification on phase end
};

export function phaseLengthMin(config, phase) {
  if (phase === 'short') return config.shortMin;
  if (phase === 'long') return config.longMin;
  return config.focusMin;
}

// Which phase follows the one that just finished. After `longEvery` focus
// sessions we take a long break; every other focus → short break; any break →
// back to focus. `completedFocus` is the running count INCLUDING the one that
// just ended (so 4,8,12… trigger the long break).
export function nextPhase(justEnded, completedFocus, config) {
  if (justEnded === 'focus') {
    return completedFocus % config.longEvery === 0 ? 'long' : 'short';
  }
  return 'focus';
}

// A stable local day key (YYYY-M-D) so the tomato tally resets each morning.
export function dayKey(d = new Date()) {
  return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
}

export function loadPomodoro() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function savePomodoro(state) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    /* ignore quota / privacy-mode errors */
  }
}

export function mmss(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}

// A short, pleasant two-note chime via the Web Audio API — no asset files. Wraps
// everything in try/catch since autoplay policies can reject it before a user
// gesture has unlocked audio.
export function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = [660, 880]; // a rising perfect-ish fourth-ish ping
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = now + i * 0.16;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.45);
    });
    // Let the tail play, then release the context.
    setTimeout(() => ctx.close && ctx.close(), 1200);
  } catch (e) {
    /* audio not available */
  }
}

// Fire a browser notification if the user has granted permission. Safe no-op
// otherwise. Requesting permission is left to a user-gesture handler in the UI.
export function notify(title, body) {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body, silent: true });
    }
  } catch (e) {
    /* notifications unavailable */
  }
}
