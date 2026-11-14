/**
 * Every request travels over this one Electron IPC channel as `(channel, request)`.
 * The main process is the only place that decides which logical channels exist.
 *
 * Kept free of runtime imports on purpose: the sandboxed preload script bundles this file
 * and cannot load third-party modules.
 */
export const IPC_INVOKE_CHANNEL = 'vod-reviewer:invoke';
