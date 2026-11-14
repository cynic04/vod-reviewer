import { create } from 'zustand';
import type { Library, Note, SessionSummary, Timestamp, Video } from '@shared/domain/schema';
import type { IpcRequest } from '@shared/ipc/contract';
import { errorMessage, invoke } from '@renderer/lib/api';

/**
 * The renderer's copy of the library. The main process owns the data: every action asks
 * it to make a change and then swaps in the snapshot it answers with, so the UI can
 * never show something that was not actually saved.
 *
 * Actions reject with an `ApiError` when the main process refuses a change.
 */
interface LibraryState {
  library: Library | null;
  loadError: string | null;

  load: () => Promise<void>;

  updateSettings: (patch: IpcRequest<'settings:update'>) => Promise<void>;
  chooseVideosRoot: () => Promise<boolean>;

  importVideo: (request: IpcRequest<'videos:import'>) => Promise<Video>;
  updateVideo: (id: string, patch: IpcRequest<'videos:update'>['patch']) => Promise<void>;
  removeVideo: (id: string) => Promise<void>;

  createFolder: (name: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  removeFolder: (id: string) => Promise<void>;

  createTimestamp: (request: IpcRequest<'timestamps:create'>) => Promise<Timestamp>;
  updateTimestamp: (id: string, patch: IpcRequest<'timestamps:update'>['patch']) => Promise<void>;
  removeTimestamp: (id: string) => Promise<void>;

  createNote: (request: IpcRequest<'notes:create'>) => Promise<Note>;
  updateNote: (id: string, body: string) => Promise<void>;
  removeNote: (id: string) => Promise<void>;

  /** Starts the summarize agent for a session; the summary arrives later as a pushed update. */
  requestSummary: (sessionId: string) => Promise<SessionSummary>;
  /** Cancels a pending summary or deletes a finished one. */
  removeSummary: (id: string) => Promise<void>;
}

let isSubscribedToPushes = false;

export const useLibraryStore = create<LibraryState>((set) => {
  const replace = (library: Library): void => set({ library });

  return {
    library: null,
    loadError: null,

    load: async () => {
      set({ loadError: null });
      if (!isSubscribedToPushes) {
        // Changes that did not start in this window, such as the agent saving a summary.
        window.vodReviewer.onLibraryChanged(replace);
        isSubscribedToPushes = true;
      }
      try {
        set({ library: await invoke('library:get') });
      } catch (error) {
        set({ loadError: errorMessage(error) });
      }
    },

    updateSettings: async (patch) => replace(await invoke('settings:update', patch)),

    chooseVideosRoot: async () => {
      const library = await invoke('settings:chooseVideosRoot');
      if (library === null) return false;
      replace(library);
      return true;
    },

    importVideo: async (request) => {
      const { library, video } = await invoke('videos:import', request);
      replace(library);
      return video;
    },
    updateVideo: async (id, patch) => replace(await invoke('videos:update', { id, patch })),
    removeVideo: async (id) => replace(await invoke('videos:remove', { id })),

    createFolder: async (name) => replace(await invoke('folders:create', { name })),
    renameFolder: async (id, name) => replace(await invoke('folders:rename', { id, name })),
    removeFolder: async (id) => replace(await invoke('folders:remove', { id })),

    createTimestamp: async (request) => {
      const { library, timestamp } = await invoke('timestamps:create', request);
      replace(library);
      return timestamp;
    },
    updateTimestamp: async (id, patch) => replace(await invoke('timestamps:update', { id, patch })),
    removeTimestamp: async (id) => replace(await invoke('timestamps:remove', { id })),

    createNote: async (request) => {
      const { library, note } = await invoke('notes:create', request);
      replace(library);
      return note;
    },
    updateNote: async (id, body) => replace(await invoke('notes:update', { id, body })),
    removeNote: async (id) => replace(await invoke('notes:remove', { id })),

    requestSummary: async (sessionId) => {
      const { library, summary } = await invoke('summaries:request', { sessionId });
      replace(library);
      return summary;
    },
    removeSummary: async (id) => replace(await invoke('summaries:remove', { id })),
  };
});
