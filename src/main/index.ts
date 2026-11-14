import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { app, BrowserWindow, dialog, shell } from 'electron';
import { createIpcHandlers } from './ipc/handlers';
import { registerIpcRouter } from './ipc/router';
import { JsonLibraryRepository } from './library/repository';
import { LibraryService } from './library/service';
import { handleMediaRequests, registerMediaScheme } from './media/protocol';
import { createMainWindow, isAppUrl } from './window';

/**
 * Optional overrides, used by the end-to-end smoke test to run against throwaway data:
 *   VOD_REVIEWER_USER_DATA    where library.json is stored
 *   VOD_REVIEWER_VIDEOS_ROOT  default folder of the import browser
 */
const userDataOverride = process.env.VOD_REVIEWER_USER_DATA;
if (userDataOverride) app.setPath('userData', path.resolve(userDataOverride));

registerMediaScheme();

async function bootstrap(): Promise<void> {
  const repository = new JsonLibraryRepository(path.join(app.getPath('userData'), 'library.json'));
  const library = await LibraryService.open(repository, {
    now: () => new Date(),
    newId: () => randomUUID(),
  });

  const getVideosRoot = (): string =>
    library.library.settings.videosRoot ?? process.env.VOD_REVIEWER_VIDEOS_ROOT ?? app.getPath('videos');

  handleMediaRequests({ getLibrary: () => library.library, getVideosRoot });

  registerIpcRouter(
    createIpcHandlers({
      library,
      getVideosRoot,
      chooseDirectory: async (defaultPath) => {
        const result = await dialog.showOpenDialog({
          title: 'Choose your videos folder',
          defaultPath,
          properties: ['openDirectory'],
        });
        return result.canceled ? null : (result.filePaths[0] ?? null);
      },
      showItemInFolder: (filePath) => shell.showItemInFolder(filePath),
    }),
    (event) => event.senderFrame !== null && isAppUrl(event.senderFrame.url),
  );

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}

if (!app.requestSingleInstanceLock()) {
  // A second instance would race the first one for the library file.
  app.quit();
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app
    .whenReady()
    .then(bootstrap)
    .catch((error: unknown) => {
      console.error('VOD Reviewer failed to start.', error);
      dialog.showErrorBox('VOD Reviewer failed to start', error instanceof Error ? error.message : String(error));
      app.quit();
    });
}
