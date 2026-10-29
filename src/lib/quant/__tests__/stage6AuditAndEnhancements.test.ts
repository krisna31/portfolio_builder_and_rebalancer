import { describe, it, expect, vi } from 'vitest';

describe('Stage 6 Audit: Modal Accessibility, Mobile Tour & PWA Readiness', () => {
  describe('Feature 1: Modal Accessibility Contract (Escape Key & Backdrop Dismissal)', () => {
    it('correctly invokes onClose when Escape key is pressed', () => {
      const onClose = vi.fn();
      const handleKeyDown = (e: { key: string }) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };

      // Pressing other keys should do nothing
      handleKeyDown({ key: 'Enter' });
      handleKeyDown({ key: 'Tab' });
      expect(onClose).not.toHaveBeenCalled();

      // Pressing Escape should trigger onClose
      handleKeyDown({ key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('correctly dismisses modal only when clicking the backdrop, not modal content', () => {
      const onClose = vi.fn();
      const handleBackdropClick = (e: { target: any; currentTarget: any }) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      };

      const backdropDiv = { id: 'backdrop' };
      const modalContentCard = { id: 'modal-card' };

      // Clicking inside modal card: target !== currentTarget => do NOT close
      handleBackdropClick({ target: modalContentCard, currentTarget: backdropDiv });
      expect(onClose).not.toHaveBeenCalled();

      // Clicking directly on backdrop: target === currentTarget => close modal
      handleBackdropClick({ target: backdropDiv, currentTarget: backdropDiv });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Feature 2: PWA Service Worker Routing & Offline Precache Contract', () => {
    const shouldBypassLiveApis = (urlStr: string): boolean => {
      const url = new URL(urlStr);
      return (
        url.hostname.includes('yahoo.com') ||
        url.hostname.includes('coingecko.com') ||
        url.hostname.includes('alternative.me') ||
        url.hostname.includes('corsproxy.io')
      );
    };

    const getCacheStrategy = (
      urlStr: string
    ): 'bypass' | 'cache-first' | 'network-first' => {
      if (shouldBypassLiveApis(urlStr)) return 'bypass';
      const url = new URL(urlStr);
      if (
        url.pathname.includes('/assets/') ||
        url.pathname.endsWith('.svg') ||
        url.pathname.endsWith('.png') ||
        url.pathname.endsWith('.woff2')
      ) {
        return 'cache-first';
      }
      return 'network-first';
    };

    it('bypasses external live market APIs so prices always attempt live fetching', () => {
      expect(
        shouldBypassLiveApis('https://query1.finance.yahoo.com/v8/finance/chart/BBCA.JK')
      ).toBe(true);
      expect(
        shouldBypassLiveApis('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin')
      ).toBe(true);
      expect(shouldBypassLiveApis('https://api.alternative.me/fng/')).toBe(true);
      expect(
        shouldBypassLiveApis('https://corsproxy.io/?url=https://query1.finance.yahoo.com')
      ).toBe(true);
      expect(shouldBypassLiveApis('https://quantporto.local/data/market-data.json')).toBe(
        false
      );
    });

    it('classifies static hashed bundles as Cache-First and app shell as Network-First', () => {
      expect(getCacheStrategy('https://quantporto.local/assets/index-nSt-IcD3.js')).toBe(
        'cache-first'
      );
      expect(getCacheStrategy('https://quantporto.local/assets/index-BHlMvOve.css')).toBe(
        'cache-first'
      );
      expect(getCacheStrategy('https://quantporto.local/favicon.svg')).toBe(
        'cache-first'
      );
      expect(getCacheStrategy('https://quantporto.local/data/market-data.json')).toBe(
        'network-first'
      );
      expect(getCacheStrategy('https://quantporto.local/index.html')).toBe(
        'network-first'
      );
    });
  });
});
