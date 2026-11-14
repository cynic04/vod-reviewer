import type { VodReviewerApi } from '@shared/ipc/contract';

declare global {
  interface Window {
    /** Injected by the preload script. */
    readonly vodReviewer: VodReviewerApi;
  }
}
