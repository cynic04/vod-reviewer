import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { app, BrowserWindow, dialog, shell } from 'electron';
import type { Notice } from '@shared/ipc/contract';
import { LIBRARY_CHANGED_CHANNEL, NOTICE_CHANNEL } from '@shared/ipc/transport';
import { AgentHarness } from './agent/harness';
import { assertAgentAvailable, openTerminal } from './agent/platform';
import { searchYouTube } from './agent/youtube';
import { EncryptedFileCredentialStore } from './email/credentials';
import { createSmtpSender } from './email/mailer';
import { resolvePortrait } from './email/portraits';
import { EmailService } from './email/service';
import { createDustloopFetcher, createDustloopImageFetcher } from './framedata/dustloop';
import { FrameDataService } from './framedata/service';
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
 *   VOD_REVIEWER_SMTP_ALLOW_INSECURE  allow a mail server without TLS (unpackaged builds only)
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

  const userAgent = `VOD-Reviewer/${app.getVersion()} (personal desktop app)`;
  const frameData = new FrameDataService({
    cacheDir: path.join(app.getPath('userData'), 'frame-data'),
    fetchMoves: createDustloopFetcher(userAgent),
    fetchImage: createDustloopImageFetcher(userAgent),
    now: () => new Date(),
  });

  handleMediaRequests({
    getLibrary: () => library.library,
    getVideosRoot,
    getMoveImage: (fileName) => frameData.getImage(fileName),
  });

  const sendToWindows = (channel: string, payload: unknown): void => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload);
  };
  const notify = (notice: Notice): void => sendToWindows(NOTICE_CHANNEL, notice);

  const email = new EmailService({
    library,
    credentials: new EncryptedFileCredentialStore(path.join(app.getPath('userData'), 'email-credentials.bin')),
    // Tests send to a local server without TLS; the real app always requires TLS.
    send: createSmtpSender({ allowInsecure: process.env.VOD_REVIEWER_SMTP_ALLOW_INSECURE === '1' && !app.isPackaged }),
    resolvePortrait,
  });

  const agent = new AgentHarness({
    library,
    workspaceDir: path.join(app.getPath('userData'), 'agent'),
    appVersion: app.getVersion(),
    // The dry run prepares everything but opens no terminal, so tests can play the agent.
    assertAgentAvailable: isAgentDryRun ? () => Promise.resolve() : assertAgentAvailable,
    openTerminal: isAgentDryRun ? () => Promise.resolve() : openTerminal,
    searchYouTube,
    getFrameData: (characterId) => frameData.get(characterId, { refresh: false }),
    onLibraryChanged: (snapshot) => sendToWindows(LIBRARY_CHANGED_CHANNEL, snapshot),
    // Nobody is waiting on this, so the outcome is reported to the window as a notice.
    onSummarySaved: (summaryId) => {
      if (!library.library.settings.email?.autoSend) return;
      email.sendSummary(summaryId).then(
        ({ sentTo }) => notify({ kind: 'info', message: `Summary emailed to ${sentTo}.` }),
        (error: unknown) =>
          notify({
            kind: 'error',
            message: `The summary was saved but could not be emailed. ${error instanceof Error ? error.message : ''}`.trim(),
          }),
      );
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
      email,
      frameData,
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
