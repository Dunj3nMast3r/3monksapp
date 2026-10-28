// Alerts for the station queues: chime, vibration and keeping the screen awake.
// Chimes are synthesised with Web Audio, so no sound files are needed.

// Distinct note pairs so neighbouring stations can tell their chime apart
const CHIMES = {
    SHOT: [880, 1320],
    BLEND: [523, 784],
    ALL: [659, 988],
    REMINDER: [440, 440, 440],
};

let audioContext = null;

const getAudioContext = () => {
    if (!audioContext) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        audioContext = new Ctx();
    }
    return audioContext;
};

// Browsers only allow sound after the user has touched the page; call this from a tap
export const unlockAudio = async () => {
    const ctx = getAudioContext();
    if (!ctx) return false;
    try {
        if (ctx.state === 'suspended') await ctx.resume();
    } catch (_) { /* stays locked */ }
    return ctx.state === 'running';
};

export const isAudioUnlocked = () => audioContext?.state === 'running';

export const playChime = (kind) => {
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== 'running') return;
    const notes = CHIMES[kind] || CHIMES.ALL;
    notes.forEach((freq, i) => {
        const start = ctx.currentTime + i * 0.22;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.4);
    });
};

export const vibrate = (pattern = [200, 100, 200]) => {
    try {
        if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (_) { /* not supported */ }
};

// Keeps the station tablet's screen on while the queue is open
export const requestWakeLock = async () => {
    try {
        if ('wakeLock' in navigator) return await navigator.wakeLock.request('screen');
    } catch (_) { /* denied or not supported */ }
    return null;
};
