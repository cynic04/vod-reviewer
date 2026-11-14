import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { Library } from '@shared/domain/schema';
import type { Notice, VodReviewerApi } from '@shared/ipc/contract';
import { IPC_INVOKE_CHANNEL, LIBRARY_CHANGED_CHANNEL, NOTICE_CHANNEL } from '@shared/ipc/transport';

/**
 * The only bridge between the sandboxed renderer and the main process. It forwards
 * requests and relays library updates, nothing else; the main process validates the
 * channel and the payload.
 */
const api: VodReviewerApi = {
  invoke: (channel, ...args) => ipcRenderer.invoke(IPC_INVOKE_CHANNEL, channel, args[0]),
  onLibraryChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, library: Library): void => listener(library);
    ipcRenderer.on(LIBRARY_CHANGED_CHANNEL, handler);
    return () => ipcRenderer.removeListener(LIBRARY_CHANGED_CHANNEL, handler);
  },
  onNotice: (listener) => {
    const handler = (_event: IpcRendererEvent, notice: Notice): void => listener(notice);
    ipcRenderer.on(NOTICE_CHANNEL, handler);
    return () => ipcRenderer.removeListener(NOTICE_CHANNEL, handler);
  },
};

contextBridge.exposeInMainWorld('vodReviewer', api);
