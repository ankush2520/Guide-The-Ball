import { useEffect, useSyncExternalStore } from 'react';
import { Ads, type AdPlacement } from './Ads';

/** Track 'ad_offer_shown' once each time an ad button for `placement`
    becomes visible. */
export function useAdOffer(placement: AdPlacement, visible: boolean): void {
  useEffect(() => { if (visible) Ads.offerShown(placement); }, [placement, visible]);
}

/** Whether ad buttons should be shown, as React state: re-renders the moment
    the SDK finishes starting. Use this, not Ads.available(), in components -
    a render that read Ads.available() before init resolved hid its button
    until something unrelated happened to re-render it. */
export function useAdsReady(): boolean {
  return useSyncExternalStore(Ads.subscribe, () => Ads.enabled());
}
