import { AUDIO_LAYERS, AudioLayer, AudioSettings } from '@virtual-cafe/shared';

/**
 * The café soundscape (SPEC 6).
 *
 * Six layers, each on its own gain node, so muting the music never touches the
 * espresso machine and lowering the room never touches a colleague's voice.
 *
 * Everything here is synthesised at runtime rather than streamed from files.
 * That is a deliberate licensing decision (SPEC 15.4): generated audio is
 * original by construction, so the MVP ships with a complete soundscape and no
 * rights ambiguity. Swapping in licensed stems later means replacing the
 * generators behind these same gain nodes — `registerBuffer` exists for that.
 *
 * The crowd layer is a wordless murmur, never a replay of anybody's
 * microphone: the spec forbids faking strangers' conversations (SPEC 6.2).
 */

type UiSound = 'join' | 'sit' | 'stand' | 'mic_on' | 'mic_off' | 'notify' | 'error';

const SCHEDULE_INTERVAL_MS = 250;
const LOOKAHEAD_SECONDS = 0.6;

/** A warm, low-dynamic chord cycle — jazz-adjacent, deliberately uneventful. */
const CHORD_PROGRESSION = [
  [146.83, 220.0, 277.18, 329.63], // Dm9-ish
  [130.81, 196.0, 246.94, 329.63], // Cmaj9-ish
  [174.61, 220.0, 261.63, 349.23], // Fmaj7-ish
  [164.81, 196.0, 246.94, 293.66], // Em7-ish
];

/** Pentatonic top notes so random melody choices never clash. */
const MELODY_NOTES = [587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];

/** Background music file served from apps/web/public. */
const BGM_URL = '/audio/bgm.mp3';

export class CafeAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private layers = new Map<AudioLayer, GainNode>();
  private reverb: ConvolverNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private scheduler: number | null = null;
  private nextChordAt = 0;
  private nextMelodyAt = 0;
  private nextAmbienceAt = 0;
  private nextMurmurAt = 0;
  private chordIndex = 0;
  private sources: AudioScheduledSourceNode[] = [];
  private settings: AudioSettings | null = null;
  private weatherOn = true;
  /** 0..1 — how hard it is raining outside; 1 when there is no live data. */
  private weatherIntensity = 1;
  /** The listener's own Focus Mode music is playing; the café music steps back. */
  private personalMusic = false;
  /** Recorded background track; while it plays, the synthesised music rests. */
  private bgm: HTMLAudioElement | null = null;
  private bgmActive = false;

  get isRunning(): boolean {
    return this.ctx?.state === 'running';
  }

  get isBlocked(): boolean {
    return this.ctx?.state === 'suspended';
  }

  /** Must be called from a user gesture — browsers block audio otherwise. */
  async start(settings: AudioSettings): Promise<void> {
    this.settings = settings;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('Trình duyệt này không hỗ trợ Web Audio API');
      this.ctx = new Ctor();
      this.build();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.applySettings(settings);
    this.startLoops();
    this.startBackgroundMusic();
  }

  /**
   * Plays `/audio/bgm.mp3` on a loop through the music gain node, so the
   * "Nhạc" slider, Mute all and the master volume still control it. If the
   * file is missing or cannot play, the generative music keeps running.
   */
  private startBackgroundMusic(): void {
    const ctx = this.ctx;
    const target = this.layers.get('music');
    if (!ctx || !target) return;
    if (!this.bgm) {
      const element = new Audio(BGM_URL);
      element.loop = true;
      element.preload = 'auto';
      element.addEventListener('error', () => {
        this.bgmActive = false;
      });
      ctx.createMediaElementSource(element).connect(target);
      this.bgm = element;
    }
    this.bgm
      .play()
      .then(() => {
        this.bgmActive = true;
      })
      .catch(() => {
        this.bgmActive = false;
      });
  }

  private build(): void {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);

    for (const layer of AUDIO_LAYERS) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.master);
      this.layers.set(layer, gain);
    }

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.4, 2.6);
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.5;
    this.reverb.connect(reverbReturn);
    reverbReturn.connect(this.master);

    this.noiseBuffer = this.makeNoise(3);
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * seconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
      }
    }
    return impulse;
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Brown-ish noise: smoother and less fatiguing than white (SPEC 19 risk).
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  private noiseSource(loop = false): AudioBufferSourceNode {
    const source = this.ctx!.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = loop;
    return source;
  }

  private track(source: AudioScheduledSourceNode): void {
    this.sources.push(source);
    source.onended = () => {
      this.sources = this.sources.filter((item) => item !== source);
    };
  }

  // ------------------------------------------------------------------- layers

  private startLoops(): void {
    if (this.scheduler !== null) return;
    const ctx = this.ctx!;
    this.nextChordAt = ctx.currentTime + 0.2;
    this.nextMelodyAt = ctx.currentTime + 2;
    this.nextAmbienceAt = ctx.currentTime + 1;
    this.nextMurmurAt = ctx.currentTime + 0.5;

    this.startRoomTone();
    this.startRain();

    this.scheduler = window.setInterval(() => this.tick(), SCHEDULE_INTERVAL_MS);
  }

  /** Continuous low rumble of a room with people in it. */
  private startRoomTone(): void {
    const ctx = this.ctx!;
    const source = this.noiseSource(true);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.22;
    source.connect(filter).connect(gain).connect(this.layers.get('ambience')!);
    source.start();
    this.track(source);
  }

  /** Rain against the window glass (SPEC 6.1 weather layer). */
  private startRain(): void {
    const ctx = this.ctx!;
    const source = this.noiseSource(true);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1400;
    band.Q.value = 0.45;
    const highShelf = ctx.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 3200;
    highShelf.gain.value = -8; // muffled, as if heard through glass
    const gain = ctx.createGain();
    gain.gain.value = 0.5;

    // Slow gusts so the rain never sits perfectly still.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.16;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();
    this.track(lfo);

    source.connect(band).connect(highShelf).connect(gain).connect(this.layers.get('weather')!);
    source.start();
    this.track(source);
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const horizon = ctx.currentTime + LOOKAHEAD_SECONDS;

    while (this.nextChordAt < horizon) {
      if (!this.bgmActive) this.scheduleChord(this.nextChordAt);
      this.nextChordAt += 8;
    }
    while (this.nextMelodyAt < horizon) {
      if (!this.bgmActive && Math.random() < 0.55) this.scheduleMelodyNote(this.nextMelodyAt);
      this.nextMelodyAt += 1.5 + Math.random() * 2.5;
    }
    while (this.nextAmbienceAt < horizon) {
      this.scheduleAmbienceOneShot(this.nextAmbienceAt);
      this.nextAmbienceAt += 2.5 + Math.random() * 6;
    }
    while (this.nextMurmurAt < horizon) {
      this.scheduleMurmur(this.nextMurmurAt);
      this.nextMurmurAt += 1.2 + Math.random() * 2.4;
    }
  }

  // -------------------------------------------------------------------- music

  private scheduleChord(at: number): void {
    const ctx = this.ctx!;
    const chord = CHORD_PROGRESSION[this.chordIndex % CHORD_PROGRESSION.length];
    this.chordIndex += 1;
    const target = this.layers.get('music')!;

    chord.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      osc.type = index === 0 ? 'sine' : 'triangle';
      osc.frequency.value = frequency;
      // A little detune keeps the pad from sounding synthetic.
      osc.detune.value = (Math.random() - 0.5) * 8;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;

      const gain = ctx.createGain();
      const peak = 0.07 / (index + 1);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 2.2);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 8.4);

      osc.connect(filter).connect(gain);
      gain.connect(target);
      gain.connect(this.reverb!);
      osc.start(at);
      osc.stop(at + 8.6);
      this.track(osc);
    });
  }

  private scheduleMelodyNote(at: number): void {
    const ctx = this.ctx!;
    const frequency = MELODY_NOTES[Math.floor(Math.random() * MELODY_NOTES.length)];
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency;

    // A second oscillator an octave up gives the attack a felt-piano edge.
    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = frequency * 2;
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.setValueAtTime(0.02, at);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.09, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 2.4);

    const target = this.layers.get('music')!;
    osc.connect(gain);
    shimmer.connect(shimmerGain).connect(gain);
    gain.connect(target);
    gain.connect(this.reverb!);
    osc.start(at);
    osc.stop(at + 2.5);
    shimmer.start(at);
    shimmer.stop(at + 0.6);
    this.track(osc);
    this.track(shimmer);
  }

  // ----------------------------------------------------------------- ambience

  private scheduleAmbienceOneShot(at: number): void {
    const roll = Math.random();
    if (roll < 0.26) this.cupClink(at);
    else if (roll < 0.44) this.espressoHiss(at);
    else if (roll < 0.56) this.grinder(at);
    else if (roll < 0.68) this.chairScrape(at);
    else if (roll < 0.8) this.door(at);
    else this.keyboard(at);
  }

  private cupClink(at: number): void {
    const ctx = this.ctx!;
    const target = this.layers.get('ambience')!;
    for (let i = 0; i < 2; i += 1) {
      const start = at + i * 0.09;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 1600 + Math.random() * 900;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.05, start + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      osc.connect(gain);
      gain.connect(target);
      gain.connect(this.reverb!);
      osc.start(start);
      osc.stop(start + 0.3);
      this.track(osc);
    }
  }

  private espressoHiss(at: number): void {
    const ctx = this.ctx!;
    const source = this.noiseSource();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(2400, at);
    band.frequency.linearRampToValueAtTime(3600, at + 2.4);
    band.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.055, at + 0.3);
    gain.gain.setValueAtTime(0.055, at + 2.0);
    gain.gain.linearRampToValueAtTime(0.0001, at + 2.8);
    source.connect(band).connect(gain);
    gain.connect(this.layers.get('ambience')!);
    gain.connect(this.reverb!);
    source.start(at);
    source.stop(at + 3);
    this.track(source);
  }

  private grinder(at: number): void {
    const ctx = this.ctx!;
    const source = this.noiseSource();
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 900;
    const peaking = ctx.createBiquadFilter();
    peaking.type = 'peaking';
    peaking.frequency.value = 220;
    peaking.gain.value = 10;
    peaking.Q.value = 3;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.06, at + 0.15);
    gain.gain.setValueAtTime(0.06, at + 1.4);
    gain.gain.linearRampToValueAtTime(0.0001, at + 1.8);
    source.connect(peaking).connect(low).connect(gain);
    gain.connect(this.layers.get('ambience')!);
    source.start(at);
    source.stop(at + 2);
    this.track(source);
  }

  private chairScrape(at: number): void {
    const ctx = this.ctx!;
    const source = this.noiseSource();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(700, at);
    band.frequency.exponentialRampToValueAtTime(320, at + 0.5);
    band.Q.value = 4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.04, at + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
    source.connect(band).connect(gain);
    gain.connect(this.layers.get('ambience')!);
    gain.connect(this.reverb!);
    source.start(at);
    source.stop(at + 0.7);
    this.track(source);
  }

  private door(at: number): void {
    const ctx = this.ctx!;
    const target = this.layers.get('ambience')!;
    // Shop bell.
    for (const frequency of [2100, 2850]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.035, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
      osc.connect(gain);
      gain.connect(target);
      gain.connect(this.reverb!);
      osc.start(at);
      osc.stop(at + 1);
      this.track(osc);
    }
    // Door thud.
    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(140, at + 0.45);
    thud.frequency.exponentialRampToValueAtTime(60, at + 0.62);
    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.0001, at + 0.45);
    thudGain.gain.exponentialRampToValueAtTime(0.05, at + 0.47);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.75);
    thud.connect(thudGain).connect(target);
    thud.start(at + 0.45);
    thud.stop(at + 0.8);
    this.track(thud);
  }

  private keyboard(at: number): void {
    const ctx = this.ctx!;
    const target = this.layers.get('ambience')!;
    const strokes = 4 + Math.floor(Math.random() * 8);
    for (let i = 0; i < strokes; i += 1) {
      const start = at + i * (0.07 + Math.random() * 0.09);
      const source = this.noiseSource();
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1800 + Math.random() * 1200;
      band.Q.value = 6;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.016, start + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.045);
      source.connect(band).connect(gain).connect(target);
      source.start(start);
      source.stop(start + 0.06);
      this.track(source);
    }
  }

  /**
   * Distant murmur: band-limited noise shaped into syllable-length swells.
   * Never intelligible, never sourced from a real microphone (SPEC 6.2).
   */
  private scheduleMurmur(at: number): void {
    const ctx = this.ctx!;
    const syllables = 2 + Math.floor(Math.random() * 4);
    const source = this.noiseSource();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 380 + Math.random() * 420;
    band.Q.value = 2.2;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 1100;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    let cursor = at;
    for (let i = 0; i < syllables; i += 1) {
      const length = 0.1 + Math.random() * 0.16;
      gain.gain.exponentialRampToValueAtTime(0.012 + Math.random() * 0.012, cursor + length * 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0012, cursor + length);
      cursor += length + 0.04;
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, cursor + 0.2);

    source.connect(band).connect(low).connect(gain);
    gain.connect(this.layers.get('crowd')!);
    gain.connect(this.reverb!);
    source.start(at);
    source.stop(cursor + 0.3);
    this.track(source);
  }

  // ----------------------------------------------------------------- UI sound

  playUi(sound: UiSound): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const at = ctx.currentTime + 0.01;
    const target = this.layers.get('ui')!;
    const tones: Record<UiSound, number[]> = {
      join: [523.25, 659.25, 783.99],
      sit: [392.0, 523.25],
      stand: [523.25, 392.0],
      mic_on: [659.25, 880.0],
      mic_off: [880.0, 587.33],
      notify: [783.99],
      error: [311.13, 233.08],
    };
    tones[sound].forEach((frequency, index) => {
      const start = at + index * 0.075;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.1, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain).connect(target);
      osc.start(start);
      osc.stop(start + 0.25);
      this.track(osc);
    });
  }

  // ----------------------------------------------------------------- settings

  applySettings(settings: AudioSettings): void {
    this.settings = settings;
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const ramp = (gain: GainNode, value: number) => {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), ctx.currentTime, 0.08);
    };

    ramp(this.master, settings.muteAll ? 0 : settings.master);

    // Focus Mode dims the room and the murmur; it never changes who can hear
    // whom, only what this listener hears (SPEC 6.2).
    const focusDamp = settings.focusMode ? 0.35 : 1;
    ramp(this.layers.get('music')!, this.personalMusic ? 0 : settings.music);
    ramp(this.layers.get('ambience')!, settings.ambience * focusDamp);
    ramp(this.layers.get('weather')!, this.weatherOn ? settings.weather * focusDamp * this.weatherIntensity : 0);
    ramp(this.layers.get('crowd')!, settings.crowd * focusDamp);
    ramp(this.layers.get('ui')!, settings.ui);
    ramp(this.layers.get('voice')!, settings.voice);
  }

  setPersonalMusicActive(active: boolean): void {
    if (active === this.personalMusic) return;
    this.personalMusic = active;
    if (this.settings) this.applySettings(this.settings);
  }

  /** Rain sound follows the real weather: silent when dry, louder in a storm. */
  setWeatherIntensity(intensity: number): void {
    const next = Math.max(0, Math.min(1, intensity));
    if (Math.abs(next - this.weatherIntensity) < 0.01) return;
    this.weatherIntensity = next;
    if (this.settings) this.applySettings(this.settings);
  }

  setWeatherEnabled(enabled: boolean): void {
    this.weatherOn = enabled;
    if (this.settings) this.applySettings(this.settings);
  }

  /** Output volume for live voice, applied to the SFU's audio elements. */
  voiceVolume(): number {
    if (!this.settings) return 1;
    if (this.settings.muteAll) return 0;
    return this.settings.voice * this.settings.master;
  }

  async dispose(): Promise<void> {
    if (this.scheduler !== null) {
      window.clearInterval(this.scheduler);
      this.scheduler = null;
    }
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
    this.bgm?.pause();
    this.bgm = null;
    this.bgmActive = false;
    await this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.layers.clear();
  }
}
