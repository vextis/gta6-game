// All of Solmar Heat's sound is synthesised with WebAudio — engine hum, two-tone sirens, gunshots,
// punches, cash and jingles — so the game ships no audio files and stays silent until the first
// key press or click creates the context, as browsers require.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.musicTimer = 0;
    this.chordIndex = 0;
  }

  /** Create the context on the first user gesture; safe to call every frame. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    this.ctx = new AudioCtor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  /** A short oscillator blip with an exponential decay envelope. */
  blip(freq, seconds, type = 'square', volume = 0.2, slideTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + seconds);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  /** Filtered noise burst — gunshots, impacts, splashes of static. */
  noise(seconds, volume = 0.3, filterFreq = 1200) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(t);
  }

  punch() { this.noise(0.08, 0.25, 500); }
  gunshot() { this.noise(0.14, 0.4, 2600); this.blip(160, 0.08, 'sawtooth', 0.12, 60); }
  dryFire() { this.blip(900, 0.04, 'square', 0.08); }
  cash() { this.blip(880, 0.07, 'square', 0.16); setTimeout(() => this.blip(1320, 0.1, 'square', 0.16), 55); }
  pickup() { this.blip(520, 0.09, 'triangle', 0.2, 780); }
  doorSlam() { this.noise(0.07, 0.2, 700); }
  crash(strength = 1) { this.noise(0.22, 0.22 * strength, 900); }
  hurt() { this.blip(220, 0.12, 'sawtooth', 0.18, 110); }
  missionDone() {
    [523, 659, 784, 1047].forEach((freq, i) => setTimeout(() => this.blip(freq, 0.16, 'triangle', 0.2), i * 85));
  }
  missionFail() {
    [392, 330, 262].forEach((freq, i) => setTimeout(() => this.blip(freq, 0.18, 'triangle', 0.18), i * 110));
  }
  busted() {
    [660, 660, 494].forEach((freq, i) => setTimeout(() => this.blip(freq, 0.2, 'square', 0.16), i * 150));
  }

  /** Continuous engine note while the player drives; speed 0..1 shapes pitch and volume. */
  setEngine(on, speedRatio) {
    if (!this.ctx) return;
    if (on && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineGain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    }
    if (this.engineOsc) {
      const target = on ? 0.05 + speedRatio * 0.05 : 0;
      this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
      this.engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, this.ctx.currentTime, 0.08);
      if (!on && target === 0) {
        const osc = this.engineOsc;
        const gain = this.engineGain;
        this.engineOsc = null;
        this.engineGain = null;
        setTimeout(() => { try { osc.stop(); gain.disconnect(); } catch { /* already stopped */ } }, 350);
      }
    }
  }

  /** Two-tone siren that fades with the nearest police car's distance (0 = silent, 1 = on top). */
  setSiren(level) {
    if (!this.ctx) return;
    if (level > 0.02 && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenLfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 830;
      this.sirenLfo.frequency.value = 0.9;
      lfoGain.gain.value = 160;
      this.sirenLfo.connect(lfoGain).connect(this.sirenOsc.frequency);
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
      this.sirenLfo.start();
    }
    if (this.sirenOsc) {
      this.sirenGain.gain.setTargetAtTime(level * 0.045, this.ctx.currentTime, 0.15);
      if (level <= 0.02) {
        const osc = this.sirenOsc;
        const lfo = this.sirenLfo;
        const gain = this.sirenGain;
        this.sirenOsc = null;
        this.sirenLfo = null;
        this.sirenGain = null;
        setTimeout(() => { try { osc.stop(); lfo.stop(); gain.disconnect(); } catch { /* already stopped */ } }, 500);
      }
    }
  }

  /** A lazy four-chord synth pad loop — the Port Solana afternoon — advanced once a frame. */
  updateMusic(dt, playing) {
    if (!this.ctx || !playing) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 2.4;
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 196, 246.9]];
    const chord = chords[this.chordIndex % chords.length];
    this.chordIndex += 1;
    for (const freq of chord) {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq / 2;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.028, t + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      osc.connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + 2.45);
    }
  }
}
