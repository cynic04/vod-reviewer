import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { app, BrowserWindow, dialog, shell } from 'electron';
import { LIBRARY_CHANGED_CHANNEL } from '@shared/ipc/transport';
import { AgentHarness } from './agent/harness';
import { assertAgentAvailable, openTerminal } from './agent/platform';
import { searchYouTube } from './agent/youtube';
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
 *   VOD_REVIEWER_AGENT_DRY_RUN  prepare summarize runs without starting the Copilot CLI
 */
const userDataOverride = process.env.VOD_REVIEWER_USER_DATA;
const isAgentDryRun = process.env.VOD_REVIEWER_AGENT_DRY_RUN === '1';

// Electron derives the data folder from the app's display name, which differs between a
// development run ("vod-reviewer") and the packaged app ("VOD Reviewer"). Pin it, so both
// - and every future version - share one library.
app.setPath(
  'userData',
  userDataOverride ? path.resolve(userDataOverride) : path.join(app.getPath('appData'), 'vod-reviewer'),
);

// Must match `appId` in electron-builder.yml, or Windows will not group the running
// window with its pinned taskbar shortcut.
app.setAppUserModelId('com.cynic04.vodreviewer');

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

  const agent = new AgentHarness({
    library,
    workspaceDir: path.join(app.getPath('userData'), 'agent'),
    appVersion: app.getVersion(),
    // The dry run prepares everything but opens no terminal, so tests can play the agent.
    assertAgentAvailable: isAgentDryRun ? () => Promise.resolve() : assertAgentAvailable,
    openTerminal: isAgentDryRun ? () => Promise.resolve() : openTerminal,
    searchYouTube,
    onLibraryChanged: (snapshot) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(LIBRARY_CHANGED_CHANNEL, snapshot);
      }
    },
  });
  await agent.start();
  app.on('will-quit', () => agent.stop());

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
      agent,
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
