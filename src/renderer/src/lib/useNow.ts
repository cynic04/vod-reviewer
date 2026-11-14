import { useSyncExternalStore } from 'react';

/**
 * The current time as render-safe state. Components must not call `new Date()` while
 * rendering; this ticks every few minutes so "days ago" labels roll over on their own
 * in a window that is left open overnight.
 */
const TICK_INTERVAL_MS = 5 * 60 * 1000;

let now = new Date();
let timer: number | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === undefined) {
    now = new Date();
    timer = window.setInterval(() => {
      now = new Date();
      listeners.forEach((notify) => notify());
    }, TICK_INTERVAL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useNow(): Date {
  return useSyncExternalStore(subscribe, () => now);
}
