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

const BPM = 112;
const STEP = (60 / BPM) / 2;             // one eighth note, in seconds
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// C - G - Am - F. Four bars of eight eighth-notes each.
const CHORDS = [
  { root: 48, tones: [60, 64, 67, 72] },   // C
  { root: 43, tones: [55, 59, 62, 67] },   // G
  { root: 45, tones: [57, 60, 64, 69] },   // Am
  { root: 41, tones: [53, 57, 60, 65] },   // F
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
    /* ============================================================
       WE SHARE THE PHONE'S AUDIO. WE DO NOT TAKE IT.

       This asked for the "playback" session, so that the ring/
       silent switch could not mute the game. What playback also
       means is EXCLUSIVE: iOS stops whatever else is playing the
       moment the context starts, so opening the game killed the
       music or the video the player already had on - and on
       Android the same is true of the audio focus a running
       context takes.

       A bouncing-ball game is not what anyone stops their music
       for. "ambient" mixes with other apps instead: their audio
       keeps playing, ours plays over it, and the cost is that
       the silent switch mutes us - which is the correct way
       round for a game whose sound is decoration.
       ============================================================ */
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'ambient';
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

  /* A tone whose pitch moves: up to `f1` in the first third, then on to `f2`.
     A fast bend is what makes a hit read as a cartoon "boing". */
  private sweep(dest: AudioNode, f0: number, f1: number, f2: number, t: number,
                dur: number, peak: number, type: OscillatorType = 'triangle'): void {
    const c = this.ctx!;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.3);
    o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.03);
  }

  /* A struck chord, marimba-style: a triangle body that dies away at once, and
     a faint high partial for the mallet. No sustain, so the notes stay
     separate even through the shared delay. */
  private pluck(freqs: number[], t: number): void {
    for (const f of freqs) {
      this.tone(this.music!, f, t, 0.24, 0.08, 'triangle');
      this.tone(this.music!, f * 4, t, 0.05, 0.015, 'sine');
    }
  }

  /* Schedule every eighth note that falls inside the lookahead window. Timer
     callbacks are far too jittery to sound on directly, so they only ever
     hand exact start times to the audio clock. */
  private scheduleStep(i: number, t: number): void {
    const bar = Math.floor(i / 8) % 4, beat = i % 8;
    const ch = CHORDS[bar];
    // off-beat chord stabs - the bounce in the loop
    if (beat === 2 || beat === 6) this.pluck(ch.tones.slice(0, 3).map(mtof), t);
    // a short hopping bass, pitched high enough for a phone speaker
    if (beat === 0 || beat === 3 || beat === 4 || beat === 6)
      this.tone(this.music!, mtof(ch.root), t, beat === 0 ? 0.26 : 0.16, 0.28, 'triangle');
    if (ARP.indexOf(beat) !== -1) {
      const m = ch.tones[(i * 3 + beat) % ch.tones.length] + 12;
      this.tone(this.music!, mtof(m), t, 0.20, 0.10, 'triangle');
      if (beat === 0) this.tone(this.music!, mtof(m + 12), t, 0.10, 0.02, 'sine');   // sparkle
    }
    if (beat % 2 === 1) this.noise(this.music!, t, 0.035, 0.030, 7000);
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
      the context is actually running (iOS can refuse the first).

      A MUTED GAME BUILDS NOTHING. The context used to be constructed on the
      first tap whether or not the player had turned the sound off, and a
      live context holds the audio focus even at zero gain - so muting in
      Settings still stopped whatever else the phone was playing. Nothing to
      hear means nothing to hold. */
  unlock = (): void => {
    if (this.isMuted) return;
    if (this.ensure()) this.resumeCtx();
  };

  /** For everything that is NOT a gesture - coming back from the background, a
      bfcache restore, a sound effect finding the context asleep. It nudges a
      context that already exists and never builds one. */
  nudge = (): void => { if (this.ctx && !this.isMuted) this.resumeCtx(); };

  /** Backgrounding: drop the scheduler so we do not wake up owing the audio
      clock a burst of notes that all fire at once - and SUSPEND, so a game
      sitting in another tab is not still holding the phone's audio while the
      player watches something else. nudge() on the way back resumes it. */
  pause = (): void => {
    this.stopMusic();
    try { this.ctx?.suspend(); } catch { /* ignore */ }
  };

  /* Mute SUSPENDS the context, it does not just turn it down. A suspended
     context gives the audio focus back, so muting the game really does hand
     the phone's sound to whatever else wants it; a context left running at
     zero gain is inaudible to the player and still owns the output. The gain
     ramp stays so that unmuting fades in rather than snapping. */
  toggle(): boolean {
    this.isMuted = !this.isMuted;
    try { localStorage.setItem(MUTE_KEY, this.isMuted ? '1' : '0'); } catch { /* blocked */ }
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime, 0.02);
    if (this.isMuted) {
      this.stopMusic();
      /* after the ramp, so the last note is faded out rather than cut */
      try { setTimeout(() => { if (this.isMuted) this.ctx?.suspend(); }, 120); }
      catch { /* ignore */ }
    } else {
      /* toggle() is only ever reached from a tap on the mute row, so this is
         inside a gesture and may construct the context if it is the first */
      this.unlock();
    }
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
    if (kind === 'obstacle') {                 // a cartoon boing: pitch springs up, then sags
      this.sweep(this.sfx!, 220, 540, 260, t, 0.11, 0.28, 'triangle');
      this.sweep(this.sfx!, 110, 270, 130, t, 0.11, 0.06, 'square');
      this.sweep(this.sfx!, 130, 130, 60, t, 0.08, 0.20, 'sine');   // the thump under it
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

  /* SFX 3 - one coin landing in the counter. `i` is its place in the run,
     which walks the pitch up a semitone at a time: a cascade of eight then
     reads as a count-up rather than as the same note struck eight times.
     Capped so a big payout does not climb out of the register. */
  coin(i = 0): void {
    if (this.isMuted) return;
    // fired by an animation frame, not by a tap - so nudge, never construct
    if (!this.ctx || this.ctx.state !== 'running') { this.nudge(); return; }
    const t = this.ctx.currentTime;
    const f = 1245 * Math.pow(2, Math.min(i, 7) / 12);
    this.tone(this.sfx!, f, t, 0.075, 0.105, 'triangle');
    this.tone(this.sfx!, f * 2, t, 0.04, 0.04, 'sine');
    this.tone(this.sfx!, f * 3, t, 0.025, 0.022, 'sine');   // bell partial - the toy "ting"
    this.noise(this.sfx!, t, 0.02, 0.028, 8000);
  }

  /** The target closing over the ball - a quick falling gulp. The fanfare
      itself waits for the win card, in step with the confetti. */
  capture(): void {
    if (this.isMuted) return;
    if (!this.ctx || this.ctx.state !== 'running') { this.nudge(); return; }
    this.sweep(this.sfx!, 700, 520, 250, this.ctx.currentTime, 0.12, 0.18, 'sine');
  }

  /** SFX 2 - the level is cleared: a quick run up, then a "ta-da" chord. */
  win(): void {
    if (this.isMuted) return;
    if (!this.ctx || this.ctx.state !== 'running') { this.nudge(); return; }
    const t = this.ctx.currentTime, run = [72, 76, 79, 84];   // C major, up
    for (let i = 0; i < run.length; i++)
      this.tone(this.sfx!, mtof(run[i]), t + i * 0.06, 0.16, 0.18, 'triangle');
    const hit = t + run.length * 0.06 + 0.04;
    for (const m of [84, 88, 91])                              // the "da!"
      this.tone(this.sfx!, mtof(m), hit, 0.55, 0.10, 'triangle');
    // sparkle on top: a thin square, then a higher sine glint
    this.tone(this.sfx!, mtof(96), hit, 0.22, 0.03, 'square');
    this.tone(this.sfx!, mtof(100), hit + 0.08, 0.30, 0.04, 'sine');
    this.noise(this.sfx!, hit, 0.35, 0.04, 7000);
  }
}

export const Sound = new SoundEngine();
