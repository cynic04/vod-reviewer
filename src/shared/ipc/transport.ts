/**
 * Every request travels over this one Electron IPC channel as `(channel, request)`.
 * The main process is the only place that decides which logical channels exist.
 *
 * Kept free of runtime imports on purpose: the sandboxed preload script bundles this file
 * and cannot load third-party modules.
 */
export const IPC_INVOKE_CHANNEL = 'vod-reviewer:invoke';

/** Main-to-renderer push carrying a fresh library snapshot. */
export const LIBRARY_CHANGED_CHANNEL = 'vod-reviewer:library-changed';

/** Main-to-renderer push carrying a Notice. */
export const NOTICE_CHANNEL = 'vod-reviewer:notice';
