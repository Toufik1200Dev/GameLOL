'use client';

/**
 * Procedural combat SFX — synthesized entirely with the WebAudio API, so there
 * are NO audio asset files to ship and everything works offline. Each effect is
 * built from short noise bursts + tone partials shaped by a fast gain envelope,
 * which is plenty for weapon fire / impacts / reload / explosion / kill cues and
 * keeps per-weapon tonal variety (gun vs sniper vs cannon vs sword).
 *
 * Volume follows the player's `masterVolume * sfxVolume` sliders. A single shared
 * AudioContext is created lazily and resumed on the first user gesture (browsers
 * block audio before that; the game's click-to-play satisfies it).
 *
 * TO USE REAL RECORDED SOUNDS INSTEAD: keep this module's `playSfx` API and swap
 * the body of each `case` for an AudioBufferSourceNode fed by a decoded file
 * (fetch → decodeAudioData, cached). Nothing else in the game needs to change.
 */
import { useSettingsStore } from '../../stores/settingsStore';

export type SfxKind =
  | 'gun' // generic automatic / pistol shot
  | 'sniper' // heavy, cracking long-range shot
  | 'cannon' // exotic projectile launcher (steampunk)
  | 'swing' // melee whoosh on attack
  | 'impactBullet' // bullet hitting a target
  | 'impactMelee' // blade clang hitting a target
  | 'reload'
  | 'explosion'
  | 'kill'
  | 'hurt'; // local player took damage

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

/** Lazily create (and resume) the shared audio graph. Safe to call every SFX. */
function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.connect(ctx.destination);
    // Pre-render 1s of white noise reused by every noisy effect.
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffer = buf;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Effective master gain from the settings sliders. */
function baseGain(): number {
  const s = useSettingsStore.getState();
  return Math.max(0, Math.min(1, s.masterVolume)) * Math.max(0, Math.min(1, s.sfxVolume));
}

/** A short noise burst through a biquad filter with an exponential decay. */
function noise(
  c: AudioContext,
  out: GainNode,
  opts: {
    type: BiquadFilterType;
    freq: number;
    q?: number;
    freqTo?: number;
    dur: number;
    gain: number;
    delay?: number;
  },
): void {
  if (!noiseBuffer) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filt = c.createBiquadFilter();
  filt.type = opts.type;
  filt.frequency.setValueAtTime(opts.freq, t0);
  if (opts.freqTo !== undefined) filt.frequency.exponentialRampToValueAtTime(Math.max(40, opts.freqTo), t0 + opts.dur);
  filt.Q.value = opts.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(opts.gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  src.connect(filt).connect(g).connect(out);
  src.start(t0);
  src.stop(t0 + opts.dur + 0.02);
}

/** A short tone (sine/triangle/etc.) with an optional pitch glide + decay. */
function tone(
  c: AudioContext,
  out: GainNode,
  opts: {
    type: OscillatorType;
    freq: number;
    freqTo?: number;
    dur: number;
    gain: number;
    delay?: number;
  },
): void {
  const t0 = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.freqTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqTo), t0 + opts.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(opts.gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.02);
}

/**
 * Play a combat sound. `gain` (0..1) is an extra multiplier used for distance
 * attenuation of remote-player sounds (1 = local/full volume).
 */
export function playSfx(kind: SfxKind, gain = 1): void {
  const c = ensure();
  if (!c || !master) return;
  const vol = baseGain() * Math.max(0, Math.min(1, gain));
  if (vol <= 0.0001) return;
  const bus = c.createGain();
  bus.gain.value = vol;
  bus.connect(master);

  switch (kind) {
    case 'gun':
      noise(c, bus, { type: 'lowpass', freq: 2200, q: 0.7, dur: 0.1, gain: 0.7 });
      tone(c, bus, { type: 'triangle', freq: 160, freqTo: 70, dur: 0.09, gain: 0.5 });
      break;
    case 'sniper':
      noise(c, bus, { type: 'highpass', freq: 1800, q: 0.6, dur: 0.06, gain: 0.9 }); // crack
      noise(c, bus, { type: 'lowpass', freq: 900, freqTo: 200, q: 0.8, dur: 0.4, gain: 0.7 }); // boom tail
      tone(c, bus, { type: 'triangle', freq: 130, freqTo: 55, dur: 0.35, gain: 0.5 });
      break;
    case 'cannon':
      tone(c, bus, { type: 'square', freq: 220, freqTo: 60, dur: 0.22, gain: 0.5 }); // clunky thunk
      noise(c, bus, { type: 'bandpass', freq: 700, freqTo: 300, q: 1.2, dur: 0.28, gain: 0.6 });
      break;
    case 'swing':
      noise(c, bus, { type: 'bandpass', freq: 1600, freqTo: 400, q: 1.4, dur: 0.2, gain: 0.55 });
      break;
    case 'impactBullet':
      noise(c, bus, { type: 'highpass', freq: 3200, q: 0.8, dur: 0.05, gain: 0.6 });
      tone(c, bus, { type: 'square', freq: 900, freqTo: 500, dur: 0.04, gain: 0.25 });
      break;
    case 'impactMelee':
      // Metallic clang: a few detuned partials + a noise transient.
      tone(c, bus, { type: 'triangle', freq: 520, dur: 0.28, gain: 0.4 });
      tone(c, bus, { type: 'triangle', freq: 780, dur: 0.24, gain: 0.28 });
      tone(c, bus, { type: 'triangle', freq: 1180, dur: 0.18, gain: 0.2 });
      noise(c, bus, { type: 'highpass', freq: 2600, q: 0.7, dur: 0.06, gain: 0.5 });
      break;
    case 'reload':
      noise(c, bus, { type: 'bandpass', freq: 1200, q: 2, dur: 0.05, gain: 0.5 });
      noise(c, bus, { type: 'bandpass', freq: 800, q: 2, dur: 0.06, gain: 0.5, delay: 0.13 });
      break;
    case 'explosion':
      noise(c, bus, { type: 'lowpass', freq: 800, freqTo: 90, q: 1, dur: 0.55, gain: 1.0 });
      tone(c, bus, { type: 'sine', freq: 90, freqTo: 40, dur: 0.5, gain: 0.6 });
      break;
    case 'kill':
      tone(c, bus, { type: 'sine', freq: 880, dur: 0.09, gain: 0.4 });
      tone(c, bus, { type: 'sine', freq: 1320, dur: 0.14, gain: 0.4, delay: 0.09 });
      break;
    case 'hurt':
      noise(c, bus, { type: 'lowpass', freq: 500, q: 0.7, dur: 0.14, gain: 0.5 });
      tone(c, bus, { type: 'sawtooth', freq: 180, freqTo: 90, dur: 0.14, gain: 0.3 });
      break;
  }
}

/** Map a weapon config to its fire-sound category. */
export function weaponFireSfx(config: {
  melee?: boolean;
  projectileSpeed?: number;
  range?: number;
  fireRate?: number;
}): SfxKind {
  if (config.melee) return 'swing';
  if ((config.projectileSpeed ?? 0) > 0) return 'cannon';
  if ((config.range ?? 0) >= 140 || (config.fireRate ?? 999) <= 70) return 'sniper';
  return 'gun';
}

/** Attempt an early audio unlock on the first user gesture (optional helper). */
export function primeAudio(): void {
  ensure();
}
