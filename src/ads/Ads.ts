/* ============================================================
   ADS - the only file that talks to an ad SDK

   Two platforms, one interface, and the game never learns which
   one it is on:

     CrazyGames SDK v3   window.CrazyGames.SDK
       init()                       await SDK.init()
       available                    SDK.environment !== 'disabled'
       rewarded / midgame           SDK.ad.requestAd(type, { adStarted, adFinished, adError })
       gameplay events              SDK.game.gameplayStart() / gameplayStop()

     Poki                         window.PokiSDK
       init()                       PokiSDK.init()
       rewarded                     PokiSDK.rewardedBreak(beforeAd) -> Promise<boolean>
       midgame                      PokiSDK.commercialBreak(beforeAd) -> Promise<void>
       gameplay events              PokiSDK.gameplayStart() / gameplayStop()

   Neither platform injects its SDK for us. The build puts the
   right one's <script> in the page head (VITE_PLATFORM - see
   vite.config.ts and `npm run build:crazygames` / `build:poki`),
   and this file only looks for it.

   With NO SDK (our own site, local dev): in a dev build a
   rewarded ad "plays" for a second and succeeds, so every ad
   flow can be exercised; in production available() is false and
   every ad button hides itself.

   THE ONE RULE: rewarded() resolves true ONLY when the player
   watched to the end. A reward is granted on true and on nothing
   else - an error, an unfilled ad, a skip and an adblocker are
   all false.

   Audio is muted for the length of every ad, on both SDKs.
   ============================================================ */
import { Sound } from '../audio/Sound';
import { track } from '../analytics/track';

type Platform = 'crazygames' | 'poki' | 'dev' | 'none';

interface CrazySDK {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  ad: { requestAd(type: 'midgame' | 'rewarded',
                  cb: { adStarted?: () => void; adFinished?: () => void; adError?: (e: unknown) => void }): void };
  game: { gameplayStart(): void; gameplayStop(): void };
}
interface PokiSDK {
  init(): Promise<void>;
  gameLoadingFinished?(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(before?: () => void): Promise<void>;
  rewardedBreak(before?: () => void): Promise<boolean>;
}
declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazySDK };
    PokiSDK?: PokiSDK;
  }
}

/** Where an ad was offered from - what the analytics (Part K) records. */
export type AdPlacement = 'continue' | 'spring' | 'hint' | 'spare' | 'double' | 'wheel' | string;

class AdsImpl {
  private platform: Platform = 'none';
  private ready = false;
  private playing = false;          // gameplayStart has been sent and not yet stopped
  private busy = false;             // an ad is on screen
  /* The UI's view of available(), so every ad button appears the moment the
     SDK answers (init is async and nothing else re-renders on it) and
     disables itself for as long as an ad is on screen. */
  private listeners = new Set<() => void>();
  private notify(): void { for (const fn of [...this.listeners]) fn(); }
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  /** Find the platform's SDK and start it. Safe to call once at boot; the
      game must not wait on it - an SDK that never answers is no ads, not a
      game that never loads. */
  async init(): Promise<void> {
    await this.detect();
    this.notify();
    /* The board usually goes live BEFORE the SDK has answered, so the first
       gameplayStart() was recorded here but reached no platform. Now that one
       is known, tell it what is already true. */
    if (this.playing) { this.playing = false; this.gameplayStart(); }
  }

  private async detect(): Promise<void> {
    try {
      const cg = window.CrazyGames?.SDK;
      if (cg) {
        await cg.init();
        this.platform = 'crazygames';
        this.ready = cg.environment !== 'disabled';
        return;
      }
      const poki = window.PokiSDK;
      if (poki) {
        this.platform = 'poki';
        try { await poki.init(); this.ready = true; } catch { this.ready = false; }
        /* Poki wants to be told when loading is over; the game is playable
           as soon as it has rendered, which it has by the time this runs. */
        try { poki.gameLoadingFinished?.(); } catch { /* ignore */ }
        return;
      }
    } catch { /* an SDK that throws is an SDK that is not there */ }
    this.platform = import.meta.env?.DEV ? 'dev' : 'none';
    this.ready = this.platform === 'dev';
  }

  /** Whether an ad can be played right now (none already on screen). */
  available(): boolean { return this.ready && !this.busy; }
  /** Whether this page has ads at all - what decides if an ad BUTTON is
      shown. Unlike available() it does not flicker while an ad plays, so a
      button stays put (showing its own "Loading ad…") instead of vanishing
      and letting the card behind it rearrange under the player's finger. */
  enabled(): boolean { return this.ready; }

  /** A rewarded ad. Resolves true ONLY if it was watched to the end. */
  async rewarded(placement: AdPlacement): Promise<boolean> {
    const ok = await this.play(placement);
    track(ok ? 'ad_watched' : 'ad_failed', { placement });
    return ok;
  }

  /** Record that an ad button for `placement` was put in front of the player
      (once per showing - the UI calls it when the button appears). */
  offerShown(placement: AdPlacement): void {
    if (this.available()) track('ad_offer_shown', { placement });
  }

  private async play(_placement: AdPlacement): Promise<boolean> {
    if (!this.available()) return false;
    this.busy = true;
    this.notify();
    const wasPlaying = this.playing;
    this.gameplayStop();
    try {
      switch (this.platform) {
        case 'crazygames':
          return await new Promise<boolean>(resolve => {
            window.CrazyGames!.SDK!.ad.requestAd('rewarded', {
              adStarted: () => Sound.pause(),
              adFinished: () => resolve(true),
              adError: () => resolve(false),
            });
          });
        case 'poki':
          return await window.PokiSDK!.rewardedBreak(() => Sound.pause());
        case 'dev':
          Sound.pause();
          await new Promise(r => setTimeout(r, 1000));
          return true;
        default:
          return false;
      }
    } catch {
      return false;
    } finally {
      this.busy = false;
      this.notify();
      Sound.nudge();
      if (wasPlaying) this.gameplayStart();
    }
  }

  /** An interstitial at a natural break. Never throws, never blocks for long
      on a platform that has nothing to show - the platform throttles how
      often one actually plays. */
  async midgame(): Promise<void> {
    if (!this.available()) return;
    this.busy = true;
    this.notify();
    this.gameplayStop();
    try {
      if (this.platform === 'crazygames') {
        await new Promise<void>(resolve => {
          window.CrazyGames!.SDK!.ad.requestAd('midgame', {
            adStarted: () => Sound.pause(),
            adFinished: () => resolve(),
            adError: () => resolve(),
          });
        });
      } else if (this.platform === 'poki') {
        await window.PokiSDK!.commercialBreak(() => Sound.pause());
      }
    } catch { /* no ad is fine */ }
    finally {
      this.busy = false;
      this.notify();
      Sound.nudge();
    }
  }

  /* The platform's gameplay events: start when the board is live (planning
     or a drop in flight), stop for menus, panels and ads. Deduplicated, so
     callers can simply state what is true without tracking it themselves. */
  gameplayStart(): void {
    if (this.playing || this.busy) return;
    this.playing = true;
    try {
      if (this.platform === 'crazygames') window.CrazyGames!.SDK!.game.gameplayStart();
      else if (this.platform === 'poki') window.PokiSDK!.gameplayStart();
    } catch { /* ignore */ }
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    try {
      if (this.platform === 'crazygames') window.CrazyGames!.SDK!.game.gameplayStop();
      else if (this.platform === 'poki') window.PokiSDK!.gameplayStop();
    } catch { /* ignore */ }
  }
}

export const Ads = new AdsImpl();
