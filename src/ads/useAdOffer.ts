import { useEffect } from 'react';
import { Ads, type AdPlacement } from './Ads';

/** Track 'ad_offer_shown' once each time an ad button for `placement`
    becomes visible. */
export function useAdOffer(placement: AdPlacement, visible: boolean): void {
  useEffect(() => { if (visible) Ads.offerShown(placement); }, [placement, visible]);
}
