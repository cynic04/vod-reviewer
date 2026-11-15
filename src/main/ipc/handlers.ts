import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc/contract';
import type { AgentHarness } from '../agent/harness';
import type { EmailService } from '../email/service';
import type { FrameDataService } from '../framedata/service';
import { DomainError, notFound } from '../library/errors';
import * as operations from '../library/operations';
import type { LibraryService } from '../library/service';
import { browseDirectory } from '../videos/browser';
import { isInside, isSupportedVideoFile } from '../videos/paths';

export type IpcHandlers = {
  [C in IpcChannel]: (request: IpcRequest<C>) => IpcResponse<C> | Promise<IpcResponse<C>>;
};

/** Everything the handlers need from the outside world, so they can be exercised without Electron. */
export interface IpcHandlerDependencies {
  library: LibraryService;
  getVideosRoot: () => string;
  /** Opens the OS folder picker. Resolves to `null` when dismissed. */
  chooseDirectory: (defaultPath: string) => Promise<string | null>;
  showItemInFolder: (filePath: string) => void;
  agent: Pick<AgentHarness, 'requestSummary' | 'removeSummary'>;
  email: Pick<EmailService, 'configure' | 'remove' | 'sendTest' | 'sendSummary'>;
  frameData: Pick<FrameDataService, 'get'>;
}

export function createIpcHandlers(deps: IpcHandlerDependencies): IpcHandlers {
  const { library } = deps;
  const ctx = library.context;

  return {
    'library:get': () => library.library,

    'settings:update': (patch) => library.update((current) => operations.updateSettings(current, patch)),

    'settings:chooseVideosRoot': async () => {
      const videosRoot = await deps.chooseDirectory(deps.getVideosRoot());
      if (videosRoot === null) return null;
      return library.update((current) => operations.updateSettings(current, { videosRoot }));
    },

    'videos:browse': ({ directory }) =>
      browseDirectory(deps.getVideosRoot(), directory, library.library.videos),

    'videos:import': async ({ filePath, folderId }) => {
      const resolved = path.resolve(filePath);
      if (!isSupportedVideoFile(resolved)) {
        throw new DomainError('INVALID_REQUEST', 'That file is not a supported video format.');
      }
      if (!isInside(deps.getVideosRoot(), resolved)) {
        throw new DomainError('FORBIDDEN', 'Videos can only be imported from your videos folder.');
      }

      const stats = await stat(resolved).catch(() => null);
      if (!stats?.isFile()) throw new DomainError('NOT_FOUND', 'That video file no longer exists.');

      return library.mutate((current) => {
        const result = operations.importVideo(
          current,
          {
            filePath: resolved,
            fileName: path.basename(resolved),
            fileSizeBytes: stats.size,
            recordedAt: stats.mtime.toISOString(),
            folderId,
          },
          ctx,
        );
        return { library: result.library, result };
      });
    },

    'videos:update': (request) => library.update((current) => operations.updateVideo(current, request)),

    'videos:remove': ({ id }) => library.update((current) => operations.removeVideo(current, id)),

    'videos:showInFolder': ({ id }) => {
      const video = library.library.videos.find((candidate) => candidate.id === id);
      if (!video) throw notFound('Video', id);
      deps.showItemInFolder(video.filePath);
      return null;
    },

    'folders:create': ({ name }) => library.update((current) => operations.createFolder(current, name, ctx)),

    'folders:rename': ({ id, name }) =>
      library.update((current) => operations.renameFolder(current, id, name)),

    'folders:remove': ({ id }) => library.update((current) => operations.removeFolder(current, id)),

    'timestamps:create': (request) =>
      library.mutate((current) => {
        const result = operations.createTimestamp(current, request, ctx);
        return { library: result.library, result };
      }),

    'timestamps:update': (request) =>
      library.update((current) => operations.updateTimestamp(current, request)),

    'timestamps:remove': ({ id }) => library.update((current) => operations.removeTimestamp(current, id)),

    'notes:create': (request) =>
      library.mutate((current) => {
        const result = operations.createNote(current, request, ctx);
        return { library: result.library, result };
      }),

    'notes:update': ({ id, body }) =>
      library.update((current) => operations.updateNote(current, id, body, ctx)),

    'notes:remove': ({ id }) => library.update((current) => operations.removeNote(current, id)),

    'summaries:request': ({ sessionId }) => deps.agent.requestSummary(sessionId),

    'summaries:remove': ({ id }) => deps.agent.removeSummary(id),

    'email:configure': (request) => deps.email.configure(request),

    'email:remove': () => deps.email.remove(),

    'email:sendTest': () => deps.email.sendTest(),

    'email:sendSummary': ({ summaryId }) => deps.email.sendSummary(summaryId),

    'frameData:get': ({ characterId, refresh }) => deps.frameData.get(characterId, { refresh }),
  };
}
