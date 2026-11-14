import { contextBridge, ipcRenderer } from 'electron';
import type { VodReviewerApi } from '@shared/ipc/contract';
import { IPC_INVOKE_CHANNEL } from '@shared/ipc/transport';

/**
 * The only bridge between the sandboxed renderer and the main process. It forwards
 * requests and nothing else; the main process validates the channel and the payload.
 */
const api: VodReviewerApi = {
  invoke: (channel, ...args) => ipcRenderer.invoke(IPC_INVOKE_CHANNEL, channel, args[0]),
};

contextBridge.exposeInMainWorld('vodReviewer', api);
