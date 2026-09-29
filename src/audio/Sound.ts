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

const MUTE_KEY = "gtb.muted.v1";

/* ============================================================
   WEATHER VOLUMES - change these to taste.
   1 = as designed, 0.5 = half as loud, 2 = twice as loud, 0 = off.
   ============================================================ */
const RAIN_VOLUME = 0.2; // the rain loop on storm levels (61-80)
const THUNDER_VOLUME = 0.3; // the rumble of every lightning strike
const CRACK_VOLUME = 0.3; // the crack when a strike hits the ball
const FIRE_VOLUME = 0.2; // the fire crackle on fire levels (21-60)
const BURN_VOLUME = 0.4; // the whoosh when the ball touches fire
const WATER_VOLUME = 0.3; // the underwater bubbling on levels 81-100
const PINCH_VOLUME = 0.5; // the snip when a crab gets the ball

const MUSIC_VOLUME = 1; // every world's score, relative to the effects
const BED_VOLUME = 1; // each world's background bed (birds, wind, rumble, hum)

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/* ============================================================
   THE WORLD SCORES

   Every world has its own loop, all built from the same few
   synthesised voices - four bars of eight eighth-notes, a chord
   per bar - so nothing is downloaded and the whole score costs
   a few hundred bytes. What changes per world is tempo, harmony,
   the lead's voice, how busy the arp is, and the percussion:

     1  Sunny Meadows  - the bouncy marimba loop (C G Am F)
     6  Lava Land      - driving A minor, taiko drums
     3  Windy Peaks    - airy F major, soft pads, sparse bells
     4  Thunder Sky    - tense D minor, a pulsing bass
     9  Coral Reef     - slow dreamy Eb, pads, sine lead
     7  Ancient Egypt  - a Hijaz-scale oud melody over a D drone,
                         darbuka doum-tek
     12 Outer Space    - slow Lydian pads and a floating arp

   Under each score a world can lay a BED - birds, wind, a lava
   rumble, a desert breeze, a space hum - on the ambience bus,
   separate from the level's own weather (rain, fire, water).
   A new world's score takes over at the next bar line.
   ============================================================ */
type Bed = "birds" | "wind" | "rumble" | "breeze" | "hum" | null;
interface Theme {
  step: number; // one eighth note, in seconds
  chords: { root: number; tones: number[] }[];
  arp: number[]; // which eighths of a bar the lead speaks on
  arpShift: number; // semitones added to the chord tone the arp plays
  melody?: (number | null)[]; // 32 steps; replaces the arp when present
  lead: OscillatorType;
  leadGain: number;
  leadDur: number;
  sparkle: boolean;
  stabs: number[]; // eighths with a struck chord
  pad: boolean; // a soft sustained chord under each bar
  bass: number[];
  bassType: OscillatorType;
  bassGain: number;
  bassDur: number;
  bassDur0: number; // the bar's first bass note
  hat: boolean;
  drum: "taiko" | "darbuka" | null;
  bed: Bed;
}
const step = (bpm: number) => 60 / bpm / 2;
const THEMES: Record<number, Theme> = {
  /* SUNNY MEADOWS - the original loop, unchanged: C - G - Am - F */
  1: {
    step: step(112),
    chords: [
      { root: 48, tones: [60, 64, 67, 72] },
      { root: 43, tones: [55, 59, 62, 67] },
      { root: 45, tones: [57, 60, 64, 69] },
      { root: 41, tones: [53, 57, 60, 65] },
    ],
    arp: [0, 2, 3, 5, 6], arpShift: 12, lead: "triangle", leadGain: 0.1, leadDur: 0.2, sparkle: true,
    stabs: [2, 6], pad: false,
    bass: [0, 3, 4, 6], bassType: "triangle", bassGain: 0.28, bassDur: 0.16, bassDur0: 0.26,
    hat: true, drum: null, bed: "birds",
  },
  /* LAVA LAND - Am - F - G - E, fast, busy arp, taiko on 1 and 3 */
  6: {
    step: step(128),
    chords: [
      { root: 45, tones: [57, 60, 64, 69] },
      { root: 41, tones: [53, 57, 60, 65] },
      { root: 43, tones: [55, 59, 62, 67] },
      { root: 40, tones: [56, 59, 64, 68] },
    ],
    arp: [0, 1, 3, 4, 6, 7], arpShift: 12, lead: "square", leadGain: 0.045, leadDur: 0.12, sparkle: false,
    stabs: [2, 6], pad: false,
    bass: [0, 1, 2, 3, 4, 5, 6, 7], bassType: "triangle", bassGain: 0.22, bassDur: 0.12, bassDur0: 0.2,
    hat: true, drum: "taiko", bed: "rumble",
  },
  /* WINDY PEAKS - F - C - Dm - Bb, open and airy: pads and sparse bells */
  3: {
    step: step(100),
    chords: [
      { root: 41, tones: [57, 60, 65, 69] },
      { root: 48, tones: [55, 60, 64, 67] },
      { root: 50, tones: [57, 62, 65, 69] },
      { root: 46, tones: [58, 62, 65, 70] },
    ],
    arp: [0, 3, 6], arpShift: 12, lead: "sine", leadGain: 0.11, leadDur: 0.45, sparkle: true,
    stabs: [], pad: true,
    bass: [0, 4], bassType: "triangle", bassGain: 0.22, bassDur: 0.3, bassDur0: 0.45,
    hat: false, drum: null, bed: "wind",
  },
  /* THUNDER SKY - Dm - Bb - Gm - A, a pulsing bass under a sparse lead */
  4: {
    step: step(96),
    chords: [
      { root: 38, tones: [57, 62, 65, 69] },
      { root: 46, tones: [58, 62, 65, 70] },
      { root: 43, tones: [55, 58, 62, 67] },
      { root: 45, tones: [57, 61, 64, 69] },
    ],
    arp: [0, 3, 5], arpShift: 12, lead: "triangle", leadGain: 0.09, leadDur: 0.3, sparkle: false,
    stabs: [4], pad: true,
    bass: [0, 1, 2, 3, 4, 5, 6, 7], bassType: "triangle", bassGain: 0.18, bassDur: 0.1, bassDur0: 0.18,
    hat: false, drum: "taiko", bed: null,
  },
  /* CORAL REEF - Eb - Cm - Ab - Bb, slow and dreamy */
  9: {
    step: step(88),
    chords: [
      { root: 39, tones: [58, 63, 67, 70] },
      { root: 48, tones: [60, 63, 67, 72] },
      { root: 44, tones: [60, 63, 68, 72] },
      { root: 46, tones: [58, 62, 65, 70] },
    ],
    arp: [0, 2, 4, 6], arpShift: 12, lead: "sine", leadGain: 0.1, leadDur: 0.35, sparkle: true,
    stabs: [], pad: true,
    bass: [0, 4], bassType: "sine", bassGain: 0.26, bassDur: 0.4, bassDur0: 0.6,
    hat: false, drum: null, bed: null,
  },
  /* ANCIENT EGYPT - a Hijaz melody (D Eb F# G A Bb C) over a D drone,
     plucked like an oud, with a darbuka doum-tek */
  7: {
    step: step(104),
    chords: [
      { root: 38, tones: [62, 66, 69] },
      { root: 39, tones: [63, 67, 70] },
      { root: 38, tones: [62, 66, 69] },
      { root: 36, tones: [60, 63, 67] },
    ],
    melody: [
      69, null, 70, 69, 66, null, 67, 66,
      63, null, 66, 63, 62, null, null, null,
      62, 63, 66, 67, 69, null, 70, 72,
      70, 69, 67, 66, 63, null, 62, null,
    ],
    arp: [], arpShift: 0, lead: "triangle", leadGain: 0.12, leadDur: 0.18, sparkle: false,
    stabs: [], pad: false,
    bass: [0], bassType: "triangle", bassGain: 0.24, bassDur: 0.8, bassDur0: 0.8,
    hat: false, drum: "darbuka", bed: "breeze",
  },
  /* OUTER SPACE - Cmaj7 - D/C - Em - D, slow Lydian pads, a floating arp */
  12: {
    step: step(84),
    chords: [
      { root: 36, tones: [60, 64, 67, 71] },
      { root: 38, tones: [62, 66, 69, 74] },
      { root: 40, tones: [64, 67, 71, 76] },
      { root: 38, tones: [62, 67, 69, 74] },
    ],
    arp: [0, 3, 5], arpShift: 12, lead: "sine", leadGain: 0.09, leadDur: 0.5, sparkle: true,
    stabs: [], pad: true,
    bass: [0], bassType: "sine", bassGain: 0.24, bassDur: 1.2, bassDur0: 1.2,
    hat: false, drum: null, bed: "hum",
  },
};

export type BounceKind = "obstacle" | "ramp";
/** The level's background weather: rain on a storm board, a crackle on a
    fire board, or nothing. */
export type Ambience = "none" | "rain" | "fire" | "water";

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  /* Ambience: its own bus straight to the master (never through the delay -
     an echoing hiss is mush), a longer noise buffer for loops and the
     thunder's rumble, and what the current level wants playing. */
  private ambBus: GainNode | null = null;
  private longNoise: AudioBuffer | null = null;
  private wantAmb: Ambience = "none";
  private amb: {
    kind: Ambience;
    srcs: AudioScheduledSourceNode[];
    timer: ReturnType<typeof setInterval> | null;
  } | null = null;
  /* kept only so the mix can be inspected at runtime - see debugMix() */
  private wetGain: GainNode | null = null;
  private fbGain: GainNode | null = null;

  private isMuted = false;
  private started = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private stepIx = 0;
  /* the world score playing, the one asked for (it takes over at the next
     bar), the shared delay it is timed to, and the world's bed */
  private theme: Theme = THEMES[1];
  private wantTheme: Theme = THEMES[1];
  private delay: DelayNode | null = null;
  private bed: {
    kind: Bed;
    srcs: AudioScheduledSourceNode[];
    timer: ReturnType<typeof setInterval> | null;
  } | null = null;
  private lastBounce = -1;

  constructor() {
    try {
      this.isMuted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      /* blocked storage */
    }
  }

  get muted(): boolean {
    return this.isMuted;
  }

  private ensure(): boolean {
    if (this.ctx) return true;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
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
      if (nav.audioSession) nav.audioSession.type = "ambient";
    } catch {
      /* not supported */
    }
    try {
      this.ctx = new AC();
    } catch {
      return false;
    }

    /* Safari parks the context in 'interrupted' (not 'suspended') after a
       call, a lock screen or another app grabbing audio, and never leaves it
       on its own. Notice that, and rebuild the beat when we come back. */
    this.ctx.onstatechange = () => {
      if (!this.ctx) return;
      if (this.ctx.state === "running") this.startMusic();
      else this.stopMusic();
    };

    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.isMuted ? 0 : 1;
    this.master.connect(c.destination);
    // one shared delay gives every layer the same room to sit in
    const delay = c.createDelay(1.0);
    delay.delayTime.value = this.theme.step * 1.5;
    this.delay = delay;
    const fb = c.createGain();
    fb.gain.value = 0.28;
    const wet = c.createGain();
    wet.gain.value = 0.3;
    this.fbGain = fb;
    this.wetGain = wet;
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(this.master);
    this.music = c.createGain();
    this.music.gain.value = 0.32 * MUSIC_VOLUME;
    this.sfx = c.createGain();
    this.sfx.gain.value = 0.85;
    this.music.connect(this.master);
    this.music.connect(delay);
    this.sfx.connect(this.master);
    this.sfx.connect(delay);
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 0.4, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.longNoise = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const ld = this.longNoise.getChannelData(0);
    for (let i = 0; i < ld.length; i++) ld[i] = Math.random() * 2 - 1;
    this.ambBus = c.createGain();
    this.ambBus.gain.value = 1;
    this.ambBus.connect(this.master);
    return true;
  }

  private tone(
    dest: AudioNode,
    freq: number,
    t: number,
    dur: number,
    peak: number,
    type: OscillatorType = "triangle",
  ): void {
    const c = this.ctx!;
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private noise(
    dest: AudioNode,
    t: number,
    dur: number,
    peak: number,
    cutoff: number,
  ): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /* A tone whose pitch moves: up to `f1` in the first third, then on to `f2`.
     A fast bend is what makes a hit read as a cartoon "boing". */
  private sweep(
    dest: AudioNode,
    f0: number,
    f1: number,
    f2: number,
    t: number,
    dur: number,
    peak: number,
    type: OscillatorType = "triangle",
  ): void {
    const c = this.ctx!;
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.3);
    o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  /* A struck chord, marimba-style: a triangle body that dies away at once, and
     a faint high partial for the mallet. No sustain, so the notes stay
     separate even through the shared delay. */
  private pluck(freqs: number[], t: number): void {
    for (const f of freqs) {
      this.tone(this.music!, f, t, 0.24, 0.08, "triangle");
      this.tone(this.music!, f * 4, t, 0.05, 0.015, "sine");
    }
  }

  /* Schedule every eighth note that falls inside the lookahead window. Timer
     callbacks are far too jittery to sound on directly, so they only ever
     hand exact start times to the audio clock. */
  private scheduleStep(i: number, t: number): void {
    const th = this.theme, out = this.music!;
    const bar = Math.floor(i / 8) % 4,
      beat = i % 8;
    const ch = th.chords[bar];
    // a soft chord held under the whole bar
    if (th.pad && beat === 0)
      for (const m of ch.tones.slice(0, 3)) this.pad(out, mtof(m), t, th.step * 8 * 1.02, 0.026);
    // struck chord stabs - the bounce in the loop
    if (th.stabs.indexOf(beat) !== -1) this.pluck(ch.tones.slice(0, 3).map(mtof), t);
    // the bass, pitched high enough for a phone speaker
    if (th.bass.indexOf(beat) !== -1)
      this.tone(out, mtof(ch.root), t, beat === 0 ? th.bassDur0 : th.bassDur, th.bassGain, th.bassType);
    // the lead: a written melody, or an arp over the chord
    if (th.melody) {
      const m = th.melody[i % 32];
      if (m) {
        this.tone(out, mtof(m), t, th.leadDur, th.leadGain, th.lead);
        this.tone(out, mtof(m) * 2, t, 0.04, th.leadGain * 0.2, "sine"); // the pluck's bite
      }
    } else if (th.arp.indexOf(beat) !== -1) {
      const m = ch.tones[(i * 3 + beat) % ch.tones.length] + th.arpShift;
      this.tone(out, mtof(m), t, th.leadDur, th.leadGain, th.lead);
      if (beat === 0 && th.sparkle) this.tone(out, mtof(m + 12), t, 0.1, 0.02, "sine");
    }
    if (th.hat && beat % 2 === 1) this.noise(out, t, 0.035, 0.03, 7000);
    if (th.drum === "taiko" && (beat === 0 || beat === 4))
      this.sweep(out, 150, 85, 55, t, 0.28, beat === 0 ? 0.2 : 0.13, "sine");
    if (th.drum === "darbuka") {
      if (beat === 0 || beat === 4) this.sweep(out, 130, 95, 75, t, 0.16, 0.16, "sine"); // doum
      if (beat === 1 || beat === 3 || beat === 6) this.noise(out, t, 0.03, 0.045, 2800); // tek
    }
  }

  /* A sustained voice: a slow swell in, held, and a slow fade out. */
  private pad(dest: AudioNode, freq: number, t: number, dur: number, peak: number): void {
    const c = this.ctx!;
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.5, dur * 0.3));
    g.gain.setValueAtTime(peak, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private pump = (): void => {
    if (!this.ctx) return;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      if (this.nextTime < this.ctx.currentTime)
        this.nextTime = this.ctx.currentTime + 0.03;
      /* a new world's score takes over on a bar line, from its own bar 1 */
      if (this.stepIx % 8 === 0 && this.wantTheme !== this.theme) {
        this.theme = this.wantTheme;
        this.stepIx = 0;
        this.delay?.delayTime.setValueAtTime(this.theme.step * 1.5, this.nextTime);
      }
      this.scheduleStep(this.stepIx, this.nextTime);
      this.nextTime += this.theme.step;
      this.stepIx = (this.stepIx + 1) % 32;
    }
  };

  private startMusic(): void {
    this.applyAmbience();
    this.applyBed();
    if (!this.ctx || this.started || this.ctx.state !== "running") return;
    this.started = true;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.stepIx = 0;
    this.theme = this.wantTheme;
    this.delay?.delayTime.setValueAtTime(this.theme.step * 1.5, this.ctx.currentTime);
    this.pump();
    this.timer = setInterval(this.pump, 25);
  }

  private stopMusic = (): void => {
    this.started = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  };

  /* Anything other than 'running' means silence, so retry on every state we
     do not want - 'suspended' before the first gesture, 'interrupted' after
     iOS has taken the audio away from us. */
  private resumeCtx(): void {
    if (!this.ctx) return;
    if (this.ctx.state !== "running") {
      try {
        this.ctx.resume()?.then(
          () => this.startMusic(),
          () => {},
        );
      } catch {
        /* ignore */
      }
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
  nudge = (): void => {
    if (this.ctx && !this.isMuted) this.resumeCtx();
  };

  /** Backgrounding: drop the scheduler so we do not wake up owing the audio
      clock a burst of notes that all fire at once - and SUSPEND, so a game
      sitting in another tab is not still holding the phone's audio while the
      player watches something else. nudge() on the way back resumes it. */
  pause = (): void => {
    this.stopMusic();
    try {
      this.ctx?.suspend();
    } catch {
      /* ignore */
    }
  };

  /* Mute SUSPENDS the context, it does not just turn it down. A suspended
     context gives the audio focus back, so muting the game really does hand
     the phone's sound to whatever else wants it; a context left running at
     zero gain is inaudible to the player and still owns the output. The gain
     ramp stays so that unmuting fades in rather than snapping. */
  toggle(): boolean {
    this.isMuted = !this.isMuted;
    try {
      localStorage.setItem(MUTE_KEY, this.isMuted ? "1" : "0");
    } catch {
      /* blocked */
    }
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(
        this.isMuted ? 0 : 1,
        this.ctx.currentTime,
        0.02,
      );
    if (this.isMuted) {
      this.stopMusic();
      /* after the ramp, so the last note is faded out rather than cut */
      try {
        setTimeout(() => {
          if (this.isMuted) this.ctx?.suspend();
        }, 120);
      } catch {
        /* ignore */
      }
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
    if (!this.ctx || this.ctx.state !== "running") {
      this.nudge();
      return;
    }
    const t = this.ctx.currentTime;
    if (t - this.lastBounce < 0.035) return; // a scatter of hits is one sound
    this.lastBounce = t;
    if (kind === "obstacle") {
      // a cartoon boing: pitch springs up, then sags
      this.sweep(this.sfx!, 220, 540, 260, t, 0.11, 0.28, "triangle");
      this.sweep(this.sfx!, 110, 270, 130, t, 0.11, 0.06, "square");
      this.sweep(this.sfx!, 130, 130, 60, t, 0.08, 0.2, "sine"); // the thump under it
    } else {
      // ramp/wall: a clean bright tick
      this.tone(this.sfx!, 880, t, 0.085, 0.2, "triangle");
      this.tone(this.sfx!, 1320, t, 0.055, 0.1, "sine");
    }
  }

  /** A BOUNCY RAMP throwing the ball: a big, bendy trampoline "boing",
      bigger than an obstacle's, so the moment the speed arrives is heard. */
  bouncy(): void {
    if (this.isMuted) return;
    if (!this.ctx || this.ctx.state !== "running") { this.nudge(); return; }
    const t = this.ctx.currentTime;
    this.sweep(this.sfx!, 160, 620, 300, t, 0.22, 0.34, "triangle");
    this.sweep(this.sfx!, 80, 310, 150, t, 0.2, 0.08, "square");
    this.sweep(this.sfx!, 110, 110, 50, t, 0.12, 0.24, "sine"); // the thump under it
  }

  /* ============================================================
     WEATHER

     Rain and a fire's crackle are LOOPS that belong to the level,
     not to a moment: setAmbience() says what the board wants, and
     applyAmbience() makes it so whenever the context is running.
     It is idempotent, so the game can simply state its wish every
     frame. Thunder and a burn are one-shot effects.
     ============================================================ */

  /** What the level wants playing. Cheap to call every frame. */
  setAmbience(kind: Ambience): void {
    if (kind === this.wantAmb) return;
    this.wantAmb = kind;
    this.applyAmbience();
  }

  private applyAmbience(): void {
    if (this.amb && this.amb.kind === this.wantAmb) return;
    if (this.amb) {
      for (const s of this.amb.srcs) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      if (this.amb.timer) clearInterval(this.amb.timer);
      this.amb = null;
    }
    const c = this.ctx;
    if (!c || c.state !== "running" || this.isMuted || this.wantAmb === "none")
      return;
    const loop = (lo: number, hi: number, gain: number) => {
      const src = c.createBufferSource();
      src.buffer = this.longNoise;
      src.loop = true;
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = lo;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = hi;
      const g = c.createGain();
      g.gain.value = gain;
      src.connect(hp);
      hp.connect(lp);
      lp.connect(g);
      g.connect(this.ambBus!);
      src.start();
      return { src, g };
    };
    if (this.wantAmb === "rain") {
      /* a bright hiss for the drops and a darker body under it, the hiss
         slowly swelling so the rain is never a flat tone */
      const hiss = loop(900, 6500, 0.0067 * RAIN_VOLUME);
      const body = loop(150, 900, 0.0053 * RAIN_VOLUME);
      const lfo = c.createOscillator(),
        depth = c.createGain();
      lfo.frequency.value = 0.13;
      depth.gain.value = 0.0023 * RAIN_VOLUME;
      lfo.connect(depth);
      depth.connect(hiss.g.gain);
      lfo.start();
      this.amb = { kind: "rain", srcs: [hiss.src, body.src, lfo], timer: null };
    } else if (this.wantAmb === "water") {
      /* UNDERWATER: a deep, muffled hum, and every so often a bubble - a
         small sine that bends upward, which is what the ear reads as "blip" */
      const hum = loop(40, 260, 0.012 * WATER_VOLUME);
      const timer = setInterval(() => {
        if (
          !this.ctx ||
          this.ctx.state !== "running" ||
          this.isMuted ||
          WATER_VOLUME <= 0
        )
          return;
        if (Math.random() < 0.18) {
          const t = this.ctx.currentTime + Math.random() * 0.05;
          const f = 300 + Math.random() * 500;
          this.sweep(
            this.ambBus!,
            f,
            f * 1.8,
            f * 2.4,
            t,
            0.07 + Math.random() * 0.05,
            (0.01 + Math.random() * 0.015) * WATER_VOLUME,
            "sine",
          );
        }
      }, 90);
      this.amb = { kind: "water", srcs: [hum.src], timer };
    } else {
      /* CRACKLE, not roar: no continuous noise at all (a filtered hiss is
         wind), only tiny sharp clicks in quick clusters - the snap of wood -
         and now and then a soft low pop. Kept well under the music. */
      const timer = setInterval(() => {
        if (
          !this.ctx ||
          this.ctx.state !== "running" ||
          this.isMuted ||
          FIRE_VOLUME <= 0
        )
          return;
        const t0 = this.ctx.currentTime;
        if (Math.random() < 0.35) {
          let t = t0 + Math.random() * 0.03;
          for (let k = 0, n = 1 + Math.floor(Math.random() * 4); k < n; k++) {
            this.noise(
              this.ambBus!,
              t,
              0.003 + Math.random() * 0.006,
              (0.008 + Math.random() * 0.014) * FIRE_VOLUME,
              2500 + Math.random() * 3000,
            );
            t += 0.006 + Math.random() * 0.022;
          }
        }
        if (Math.random() < 0.03)
          this.sweep(
            this.ambBus!,
            240,
            170,
            90,
            t0 + 0.01,
            0.06,
            0.012 * FIRE_VOLUME,
            "sine",
          );
      }, 45);
      this.amb = { kind: "fire", srcs: [], timer };
    }
  }

  /** Which world is on screen, by country id: picks its score (taking over at
      the next bar line) and its bed. Cheap to call every frame. */
  setWorld(id: number): void {
    const th = THEMES[id] ?? THEMES[1];
    if (th === this.wantTheme) return;
    this.wantTheme = th;
    this.applyBed();
  }

  /* The world's bed, on the ambience bus under the score. */
  private applyBed(): void {
    const want = this.wantTheme.bed;
    if (this.bed && this.bed.kind === want) return;
    if (this.bed) {
      for (const s of this.bed.srcs) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      if (this.bed.timer) clearInterval(this.bed.timer);
      this.bed = null;
    }
    const c = this.ctx;
    if (!c || c.state !== "running" || this.isMuted || !want || BED_VOLUME <= 0) return;
    const live = () => !!this.ctx && this.ctx.state === "running" && !this.isMuted;
    /* filtered noise whose level breathes slowly - wind, a rumble, a breeze */
    const breath = (lo: number, hi: number, gain: number, rate: number, depth: number) => {
      const src = c.createBufferSource();
      src.buffer = this.longNoise;
      src.loop = true;
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = lo;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = hi;
      const g = c.createGain();
      g.gain.value = gain * BED_VOLUME;
      const lfo = c.createOscillator(),
        d = c.createGain();
      lfo.frequency.value = rate;
      d.gain.value = depth * BED_VOLUME;
      lfo.connect(d);
      d.connect(g.gain);
      src.connect(hp);
      hp.connect(lp);
      lp.connect(g);
      g.connect(this.ambBus!);
      src.start();
      lfo.start();
      return [src, lfo];
    };
    if (want === "birds") {
      /* now and then a bird: two or three quick rising chirps */
      const timer = setInterval(() => {
        if (!live() || Math.random() > 0.035) return;
        let t = this.ctx!.currentTime + 0.02;
        const f = 2200 + Math.random() * 1400;
        for (let k = 0, n = 2 + Math.floor(Math.random() * 2); k < n; k++) {
          this.sweep(this.ambBus!, f, f * 1.3, f * 1.1, t, 0.07, 0.008 * BED_VOLUME, "sine");
          t += 0.09 + Math.random() * 0.04;
        }
      }, 120);
      this.bed = { kind: want, srcs: [], timer };
    } else if (want === "wind") {
      this.bed = { kind: want, srcs: breath(250, 1400, 0.006, 0.09, 0.004), timer: null };
    } else if (want === "rumble") {
      this.bed = { kind: want, srcs: breath(30, 160, 0.02, 0.07, 0.01), timer: null };
    } else if (want === "breeze") {
      this.bed = { kind: want, srcs: breath(400, 2200, 0.003, 0.06, 0.002), timer: null };
    } else if (want === "hum") {
      /* a slow-beating drone, and now and then a far-off twinkle */
      const g = c.createGain();
      g.gain.value = 0.012 * BED_VOLUME;
      g.connect(this.ambBus!);
      const oscs = [110, 110.6, 165].map(f => {
        const o = c.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        o.connect(g);
        o.start();
        return o;
      });
      const timer = setInterval(() => {
        if (!live() || Math.random() > 0.05) return;
        const f = 1600 + Math.random() * 1400;
        this.tone(this.music!, f, this.ctx!.currentTime + 0.02, 0.25, 0.012 * BED_VOLUME, "sine");
      }, 150);
      this.bed = { kind: want, srcs: oscs, timer };
    }
  }

  /** A lightning strike anywhere on the board: the rumble that rolls away. */
  thunder(): void {
    if (this.isMuted || THUNDER_VOLUME <= 0) return;
    if (!this.ctx || this.ctx.state !== "running") {
      this.nudge();
      return;
    }
    const c = this.ctx,
      t = c.currentTime;
    // dark noise that swells and then rolls off for two seconds
    const src = c.createBufferSource();
    src.buffer = this.longNoise;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 170;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3 * THUNDER_VOLUME, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.15 * THUNDER_VOLUME, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.ambBus!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 2.4);
    this.sweep(this.ambBus!, 70, 55, 32, t, 1.4, 0.05 * THUNDER_VOLUME, "sine"); // the weight under it
  }

  /** A strike that HIT the ball: the sharp crack, on top of the rumble. */
  crack(): void {
    if (this.isMuted || CRACK_VOLUME <= 0) return;
    if (!this.ctx || this.ctx.state !== "running") {
      this.nudge();
      return;
    }
    const t = this.ctx.currentTime;
    this.noise(this.sfx!, t, 0.18, 0.14 * CRACK_VOLUME, 1400);
    this.noise(this.sfx!, t + 0.04, 0.12, 0.08 * CRACK_VOLUME, 2600);
  }

  /** A crab got the ball: two quick claw snips, then a soft bubbly plop. */
  pinch(): void {
    if (this.isMuted || PINCH_VOLUME <= 0) return;
    if (!this.ctx || this.ctx.state !== "running") {
      this.nudge();
      return;
    }
    const t = this.ctx.currentTime;
    // snip, snip
    for (const d of [0, 0.09]) {
      this.noise(this.sfx!, t + d, 0.035, 0.24 * PINCH_VOLUME, 2600);
      this.tone(this.sfx!, 1850, t + d, 0.04, 0.08 * PINCH_VOLUME, "square");
    }
    // plop
    this.sweep(this.sfx!, 300, 520, 820, t + 0.2, 0.16, 0.14 * PINCH_VOLUME, "sine");
  }

  /** The ball touched fire: a whoosh up and a sizzle as it goes out. */
  burn(): void {
    if (this.isMuted || BURN_VOLUME <= 0) return;
    if (!this.ctx || this.ctx.state !== "running") {
      this.nudge();
      return;
    }
    const c = this.ctx,
      t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.longNoise;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.3);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45 * BURN_VOLUME, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfx!);
    src.start(t);
    src.stop(t + 0.5);
    this.noise(this.sfx!, t + 0.12, 0.55, 0.1 * BURN_VOLUME, 4500); // the sizzle
    this.sweep(this.sfx!, 320, 200, 70, t, 0.35, 0.14 * BURN_VOLUME, "sine"); // the "fwoomp"
  }

  /** The live mix, for the test suite's headroom checks. Reads the real
      nodes rather than any constant, so it cannot drift from what is heard. */
  debugMix(): {
    music: number | null;
    sfx: number | null;
    wet: number | null;
    fb: number | null;
    built: boolean;
  } {
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
    if (!this.ctx || this.ctx.state !== "running") {
      this.nudge();
      return;
    }
    const t = this.ctx.currentTime;
    const f = 1245 * Math.pow(2, Math.min(i, 7) / 12);
    this.tone(this.sfx!, f, t, 0.075, 0.105, "triangle");
    this.tone(this.sfx!, f * 2, t, 0.04, 0.04, "sine");
    this.tone(this.sfx!, f * 3, t, 0.025, 0.022, "sine"); // bell partial - the toy "ting"
    this.noise(this.sfx!, t, 0.02, 0.028, 8000);
  }

  /** The target closing over the ball - a quick falling gulp. The fanfare
      itself waits for the win card, in step with the confetti. */
  capture(): void {
    if (this.isMuted) return;
    if (!this.ctx || this.ctx.state !== "running") {
      this.nudge();
      return;
    }
    this.sweep(
      this.sfx!,
      700,
      520,
      250,
      this.ctx.currentTime,
      0.12,
      0.18,
      "sine",
    );
  }

  /** SFX 2 - the level is cleared: a quick run up, then a "ta-da" chord. */
  win(): void {
    if (this.isMuted) return;
    if (!this.ctx || this.ctx.state !== "running") {
      this.nudge();
      return;
    }
    const t = this.ctx.currentTime,
      run = [72, 76, 79, 84]; // C major, up
    for (let i = 0; i < run.length; i++)
      this.tone(this.sfx!, mtof(run[i]), t + i * 0.06, 0.16, 0.18, "triangle");
    const hit = t + run.length * 0.06 + 0.04;
    for (const m of [84, 88, 91]) // the "da!"
      this.tone(this.sfx!, mtof(m), hit, 0.55, 0.1, "triangle");
    // sparkle on top: a thin square, then a higher sine glint
    this.tone(this.sfx!, mtof(96), hit, 0.22, 0.03, "square");
    this.tone(this.sfx!, mtof(100), hit + 0.08, 0.3, 0.04, "sine");
    this.noise(this.sfx!, hit, 0.35, 0.04, 7000);
  }
}

export const Sound = new SoundEngine();
