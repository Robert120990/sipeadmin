/**
 * Web Audio API based notification chime synthesizer.
 * Generates an elegant, high-definition two-tone chime without external audio files.
 */
let audioCtx = null;

function getAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

/**
 * Play an elegant chime sound
 */
export function playNotificationSound() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;

        // --- Tone 1 (D5 ~587.33 Hz) ---
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now);

        gain1.gain.setValueAtTime(0.001, now);
        gain1.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc1.connect(gain1);
        gain1.connect(ctx.destination);

        osc1.start(now);
        osc1.stop(now + 0.25);

        // --- Tone 2 (A5 ~880.00 Hz) ---
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880.0, now + 0.12);

        gain2.gain.setValueAtTime(0.001, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.22, now + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

        osc2.connect(gain2);
        gain2.connect(ctx.destination);

        osc2.start(now + 0.12);
        osc2.stop(now + 0.65);
    } catch (err) {
        console.warn('[NotificationSound] Could not play sound:', err.message);
    }
}
