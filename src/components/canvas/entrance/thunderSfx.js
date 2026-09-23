// Synthesized thunder + hammer sounds (Web Audio, no files to license or download).
// Browsers keep audio locked until the first click/tap/key; strikes before that are silent.

let ctx;
let out;

function getOut() {
    if (!ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        ctx = new Ctx();
        // Compressor lets the thunder run hot (loud) without clipping.
        out = ctx.createDynamicsCompressor();
        out.threshold.value = -12;
        out.ratio.value = 12;
        out.connect(ctx.destination);
        const unlock = () => ctx.resume();
        ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, unlock, { once: true }));
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx.state === 'running' ? out : null;
}

function noise(seconds) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
}

// One-shot: source -> filter -> gain envelope -> out
function burst({ seconds, type, freq, endFreq, peak, attack, delay = 0, dest }) {
    const t = ctx.currentTime + delay;
    const src = noise(seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (endFreq) filter.frequency.exponentialRampToValueAtTime(endFreq, t + seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(filter).connect(gain).connect(dest);
    src.start(t);
}

/** Loud crack + deep boom + rolling rumble. volume: 0..1 */
export function playThunder(volume) {
    const dest = volume > 0 && getOut();
    if (!dest) return;
    const master = ctx.createGain();
    master.gain.value = 2.5 * volume; // deliberately hot, the compressor tames peaks
    master.connect(dest);

    burst({ seconds: 0.5, type: 'highpass', freq: 1200, peak: 1.2, attack: 0.003, dest: master });           // crack
    burst({ seconds: 3.2, type: 'lowpass', freq: 260, endFreq: 50, peak: 2.2, attack: 0.04, dest: master }); // boom
    burst({ seconds: 4.5, type: 'lowpass', freq: 140, endFreq: 40, peak: 1.4, attack: 0.5, delay: 0.35, dest: master }); // rumble

    // Sub thump you feel more than hear
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.8);
    g.gain.setValueAtTime(1.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 1);
}

/** Short wooden "tok" for each hammer hit. */
export function playHammer(volume) {
    const dest = volume > 0 && getOut();
    if (!dest) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(820, t);
    osc.frequency.exponentialRampToValueAtTime(260, t + 0.08);
    g.gain.setValueAtTime(0.9 * volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.15);
    burst({ seconds: 0.05, type: 'bandpass', freq: 2500, peak: 0.6 * volume, attack: 0.001, dest });
}
