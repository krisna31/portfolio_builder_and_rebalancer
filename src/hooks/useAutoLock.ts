import { useEffect, useRef } from 'react';

export interface UseAutoLockOptions {
  /** Whether the auto-lock watcher is active (typically true only when authenticated) */
  isEnabled: boolean;
  /** Inactivity threshold in milliseconds (default: 15 minutes = 900,000 ms) */
  timeoutMs?: number;
  /** Callback fired when inactivity threshold is reached */
  onLock: () => void;
}

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // 15 Minutes
const THROTTLE_MS = 1000; // 1s throttle for event listeners

/**
 * useAutoLock monitors user interactions (mouse, keyboard, touch, scroll)
 * and automatically triggers an onLock callback when the user is idle beyond timeoutMs.
 */
export function useAutoLock({
  isEnabled,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onLock,
}: UseAutoLockOptions): void {
  const onLockRef = useRef(onLock);
  onLockRef.current = onLock;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!isEnabled || timeoutMs <= 0) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const resetTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        onLockRef.current();
      }, timeoutMs);
    };

    const handleUserActivity = () => {
      const now = Date.now();
      // Throttle rapid events like mousemove or scroll
      if (now - lastActivityRef.current < THROTTLE_MS) {
        return;
      }
      lastActivityRef.current = now;
      resetTimer();
    };

    // Initial timer arm
    lastActivityRef.current = Date.now();
    resetTimer();

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
    ];

    events.forEach((evt) => {
      window.addEventListener(evt, handleUserActivity, { passive: true });
    });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      events.forEach((evt) => {
        window.removeEventListener(evt, handleUserActivity);
      });
    };
  }, [isEnabled, timeoutMs]);
}
