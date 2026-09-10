/* ============================================================
   SOUND (WebAudio, fully synthesised)

   No audio files: there is nothing to 404 on a slow network and
   nothing to bundle. A browser will not let us make noise before
   the first gesture, so the context is built lazily in unlock().

   The one rule that matters here: ONLY a real user gesture may
   CONSTRUCT the context. iOS counts construction outside one as
   an autoplay attempt, and a context created that way can be left
   unable to start for the life of the page - the failure where
   sound is silently dead forever and nothing says why.
   ============================================================ */

const MUTE_KEY = 'gtb.muted.v1';

const BPM = 92;
const STEP = (60 / BPM) / 2;             // one eighth note, in seconds
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// Am - F - C - G. Four bars of eight eighth-notes each.
const CHORDS = [
  { root: 45, tones: [57, 60, 64, 69] },   // Am
  { root: 41, tones: [53, 57, 60, 65] },   // F
  { root: 48, tones: [60, 64, 67, 72] },   // C
  { root: 43, tones: [55, 59, 62, 67] },   // G
];
/* which eighth-notes of a bar the arp speaks on - the rests are what keep it
   from turning into a nagging loop while you think */
const ARP = [0, 2, 3, 5, 6];

export type BounceKind = 'obstacle' | 'ramp';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  /* kept only so the mix can be inspected at runtime - see debugMix() */
  private wetGain: GainNode | null = null;
  private fbGain: GainNode | null = null;

  private isMuted = false;
  private started = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private stepIx = 0;
  private lastBounce = -1;

  constructor() {
    try { this.isMuted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* blocked storage */ }
  }

  get muted(): boolean { return this.isMuted; }

  private ensure(): boolean {
    if (this.ctx) return true;
    const AC = window.AudioContext ||
               (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    /* iOS defaults a page to the "ambient" session, which the ring/silent
       switch mutes outright - a game wants the playback session instead. */
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
    } catch { /* not supported */ }
    try { this.ctx = new AC(); } catch { return false; }

    /* Safari parks the context in 'interrupted' (not 'suspended') after a
       call, a lock screen or another app grabbing audio, and never leaves it
       on its own. Notice that, and rebuild the beat when we come back. */
    this.ctx.onstatechange = () => {
      if (!this.ctx) return;
      if (this.ctx.state === 'running') this.startMusic();
      else this.stopMusic();
    };

    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.isMuted ? 0 : 1;
    this.master.connect(c.destination);
    // one shared delay gives every layer the same room to sit in
    const delay = c.createDelay(1.0); delay.delayTime.value = STEP * 1.5;
    const fb = c.createGain(); fb.gain.value = 0.28;
    const wet = c.createGain(); wet.gain.value = 0.30;
    this.fbGain = fb; this.wetGain = wet;
    delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = 0.32;
    this.sfx = c.createGain(); this.sfx.gain.value = 0.85;
    this.music.connect(this.master); this.music.connect(delay);
    this.sfx.connect(this.master); this.sfx.connect(delay);
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 0.4, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  private tone(dest: AudioNode, freq: number, t: number, dur: number,
               peak: number, type: OscillatorType = 'triangle'): void {
    const c = this.ctx!;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.03);
  }

  private noise(dest: AudioNode, t: number, dur: number, peak: number, cutoff: number): void {
    const c = this.ctx!;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest); src.start(t); src.stop(t + dur + 0.02);
  }

  private pad(freqs: number[], t: number, dur: number): void {
    const c = this.ctx!;
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(520, t);
    f.frequency.linearRampToValueAtTime(900, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(520, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.55);
    g.gain.setValueAtTime(0.045, t + dur - 0.45);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(this.music!);
    for (let i = 0; i < freqs.length; i++) {
      const o = c.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = freqs[i];
      o.detune.value = (i - 1) * 6;                 // a little chorus width
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    }
  }

  /* Schedule every eighth note that falls inside the lookahead window. Timer
     callbacks are far too jittery to sound on directly, so they only ever
     hand exact start times to the audio clock. */
  private scheduleStep(i: number, t: number): void {
    const bar = Math.floor(i / 8) % 4, beat = i % 8;
    const ch = CHORDS[bar];
    if (beat === 0) this.pad(ch.tones.slice(0, 3).map(m => mtof(m + 12)), t, STEP * 8);
    if (beat === 0 || beat === 3 || beat === 6)
      this.tone(this.music!, mtof(ch.root - 12), t, beat === 0 ? 0.55 : 0.38, 0.20, 'sine');
    if (ARP.indexOf(beat) !== -1) {
      const m = ch.tones[(i * 3 + beat) % ch.tones.length] + 12;
      this.tone(this.music!, mtof(m), t, 0.42, 0.085, 'triangle');
    }
    if (beat % 2 === 1) this.noise(this.music!, t, 0.045, 0.030, 7000);
  }

  private pump = (): void => {
    if (!this.ctx) return;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      if (this.nextTime < this.ctx.currentTime) this.nextTime = this.ctx.currentTime + 0.03;
      this.scheduleStep(this.stepIx, this.nextTime);
      this.nextTime += STEP; this.stepIx = (this.stepIx + 1) % 32;
    }
  };

  private startMusic(): void {
    if (!this.ctx || this.started || this.ctx.state !== 'running') return;
    this.started = true; this.nextTime = this.ctx.currentTime + 0.1; this.stepIx = 0;
    this.pump(); this.timer = setInterval(this.pump, 25);
  }

  private stopMusic = (): void => {
    this.started = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  };

  /* Anything other than 'running' means silence, so retry on every state we
     do not want - 'suspended' before the first gesture, 'interrupted' after
     iOS has taken the audio away from us. */
  private resumeCtx(): void {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') {
      try { this.ctx.resume()?.then(() => this.startMusic(), () => {}); } catch { /* ignore */ }
    }
    this.startMusic();
  }

  /** Called from the first real gesture, and from every one after that until
      the context is actually running (iOS can refuse the first). */
  unlock = (): void => { if (this.ensure()) this.resumeCtx(); };

  /** For everything that is NOT a gesture - coming back from the background, a
      bfcache restore, a sound effect finding the context asleep. It nudges a
      context that already exists and never builds one. */
  nudge = (): void => { if (this.ctx) this.resumeCtx(); };

  /** Backgrounding: drop the scheduler so we do not wake up owing the audio
      clock a burst of notes that all fire at once. */
  pause = (): void => this.stopMusic();

  toggle(): boolean {
    this.isMuted = !this.isMuted;
    try { localStorage.setItem(MUTE_KEY, this.isMuted ? '1' : '0'); } catch { /* blocked */ }
    if (!this.isMuted) this.unlock();
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime, 0.02);
    return this.isMuted;
  }

  /** SFX 1 - the ball struck something solid. */
  bounce(kind: BounceKind): void {
    if (this.isMuted) return;
    // driven by the physics loop, not by a tap - so nudge, never construct
    if (!this.ctx || this.ctx.state !== 'running') { this.nudge(); return; }
    const t = this.ctx.currentTime;
    if (t - this.lastBounce < 0.035) return;   // a scatter of hits is one sound
    this.lastBounce = t;
    if (kind === 'obstacle') {                 // heavier, duller, with a thud
      this.tone(this.sfx!, 190, t, 0.16, 0.30, 'square');
      this.tone(this.sfx!, 96, t, 0.20, 0.22, 'sine');
      this.noise(this.sfx!, t, 0.07, 0.08, 900);
    } else {                                   // ramp/wall: a clean bright tick
      this.tone(this.sfx!, 880, t, 0.085, 0.20, 'triangle');
      this.tone(this.sfx!, 1320, t, 0.055, 0.10, 'sine');
    }
  }

  /** The live mix, for the test suite's headroom checks. Reads the real
      nodes rather than any constant, so it cannot drift from what is heard. */
  debugMix(): { music: number | null; sfx: number | null;
                wet: number | null; fb: number | null; built: boolean } {
    return {
      music: this.music ? this.music.gain.value : null,
      sfx: this.sfx ? this.sfx.gain.value : null,
      wet: this.wetGain ? this.wetGain.gain.value : null,
      fb: this.fbGain ? this.fbGain.gain.value : null,
      built: !!this.ctx,
    };
  }

  /** SFX 2 - the target swallowed the ball. */
  win(): void {
    if (this.isMuted) return;
    if (!this.ctx || this.ctx.state !== 'running') { this.nudge(); return; }
    const t = this.ctx.currentTime, notes = [69, 73, 76, 81];   // A major arpeggio
    for (let i = 0; i < notes.length; i++)
      this.tone(this.sfx!, mtof(notes[i]), t + i * 0.085, 0.42, 0.22, 'triangle');
    this.noise(this.sfx!, t, 0.25, 0.045, 5000);
  }
}

export const Sound = new SoundEngine();
