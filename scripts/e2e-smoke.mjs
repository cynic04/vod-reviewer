/**
 * End-to-end smoke test: drives the real, built Electron app through the whole workflow
 * (add video -> matchup -> focus points -> review) against throwaway data.
 *
 *   npm run build && npm run test:e2e
 *
 * To run the same test against the packaged app:
 *
 *   npm run package:dir
 *   $env:VOD_REVIEWER_E2E_EXECUTABLE = "dist/win-unpacked/VOD Reviewer.exe"; npm run test:e2e
 *
 * Nothing here touches your real library or Videos folder: the app is pointed at
 * `.e2e/` through the VOD_REVIEWER_USER_DATA and VOD_REVIEWER_VIDEOS_ROOT overrides.
 * Screenshots of each screen are written to `.e2e/screens/`.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, utimes } from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { _electron as electron } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const WORK_DIR = path.join(ROOT, '.e2e');
const VIDEOS_DIR = path.join(WORK_DIR, 'videos');
const USER_DATA_DIR = path.join(WORK_DIR, 'user-data');
const SCREENS_DIR = path.join(WORK_DIR, 'screens');
const SAMPLE_NAME = 'ranked-set.mp4';
const SAMPLE_FPS = 30;
const SAMPLE_AGE_DAYS = 20;

const step = (message) => console.log(`- ${message}`);

async function prepareFixtures() {
  await rm(WORK_DIR, { recursive: true, force: true });
  await Promise.all([VIDEOS_DIR, USER_DATA_DIR, SCREENS_DIR].map((dir) => mkdir(dir, { recursive: true })));

  // A test card with a running frame counter, deliberately NOT at the app's default 60fps.
  const samplePath = path.join(VIDEOS_DIR, SAMPLE_NAME);
  execFileSync(
    ffmpegPath,
    ['-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc=duration=8:size=1280x720:rate=${SAMPLE_FPS}`]
      .concat(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=8'])
      .concat(['-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', '-y', samplePath]),
  );

  // Backdate it so the "old video" highlight has something to highlight.
  const recordedAt = new Date(Date.now() - SAMPLE_AGE_DAYS * 24 * 60 * 60 * 1000);
  await utimes(samplePath, recordedAt, recordedAt);
}

const readLibrary = async () => JSON.parse(await readFile(path.join(USER_DATA_DIR, 'library.json'), 'utf8'));

async function main() {
  await prepareFixtures();

  // Set VOD_REVIEWER_E2E_EXECUTABLE to test a packaged build, e.g.
  // "dist/win-unpacked/VOD Reviewer.exe", instead of the app in this repository.
  const packagedExecutable = process.env.VOD_REVIEWER_E2E_EXECUTABLE;
  const app = await electron.launch({
    ...(packagedExecutable ? { executablePath: path.resolve(packagedExecutable), args: [] } : { args: [ROOT] }),
    env: { ...process.env, VOD_REVIEWER_USER_DATA: USER_DATA_DIR, VOD_REVIEWER_VIDEOS_ROOT: VIDEOS_DIR },
  });

  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    // Resize the real window rather than emulating a viewport: an emulated viewport larger
    // than the window's content area lays the page out past the window's edges, which
    // looks like buttons being cut off.
    const resizeWindow = async (width, height) => {
      await app.evaluate(({ BrowserWindow }, size) => {
        const [window] = BrowserWindow.getAllWindows();
        if (size) window.setContentSize(size.width, size.height);
        else window.setSize(...window.getMinimumSize());
      }, width ? { width, height } : null);
      await page.waitForTimeout(300);
    };
    /** Asserts that a control is completely inside the window, i.e. visible and clickable. */
    const expectFullyVisible = async (locator, description) => {
      const box = await locator.boundingBox();
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      assert.ok(
        box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1,
        `${description} is cut off at ${viewport.width}x${viewport.height}`,
      );
    };
    await resizeWindow(1440, 900);

    /** Screenshots wait for every video to have a decoded frame and for transitions to settle. */
    const screenshot = async (name) => {
      await page.waitForFunction(() =>
        [...document.querySelectorAll('video')].every((video) => video.readyState >= 2 && !video.seeking),
      );
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCREENS_DIR, `${name}.png`) });
    };
    const videoTime = () => page.evaluate(() => document.querySelector('video')?.currentTime ?? -1);
    const frameAt = async () => Math.floor((await videoTime()) * SAMPLE_FPS + 1e-6);
    const waitForPlayer = () => page.getByRole('button', { name: 'Play (Space)' }).and(page.locator(':enabled')).waitFor();
    /** The default theme follows the OS, so set it explicitly to keep the run deterministic. */
    const setTheme = async (theme) => {
      const current = await page.evaluate(() => document.documentElement.dataset.theme);
      if (current !== theme) await page.getByRole('button', { name: `Switch to ${theme} mode` }).click();
      await page.waitForFunction((wanted) => document.documentElement.dataset.theme === wanted, theme);
    };
    /** Waits for the main process to finish writing a change the UI already shows. */
    const expectLibrary = async (predicate, description) => {
      const deadline = Date.now() + 5000;
      for (;;) {
        const library = await readLibrary();
        if (predicate(library)) return library;
        assert.ok(Date.now() < deadline, `library.json never satisfied: ${description}`);
        await page.waitForTimeout(100);
      }
    };

    step('1. an empty library asks for a video');
    await page.getByRole('heading', { name: /review/i, level: 1 }).waitFor();
    assert.equal(await page.getByRole('link', { name: /^vs\. / }).count(), 34, 'one matchup card per character');
    await setTheme('dark');
    await screenshot('01-welcome-dark');
    await page.getByRole('button', { name: 'Add your first video' }).click();

    step('   pick the video from the videos folder');
    await page.getByRole('button', { name: new RegExp(SAMPLE_NAME) }).click();
    await page.locator('aside video').waitFor();
    await screenshot('02-pick-video');
    await page.getByRole('button', { name: 'Use this video' }).click();

    step('2. file it under a matchup');
    await page.getByRole('searchbox').fill('sol');
    await page.getByRole('radio', { name: 'vs. Sol Badguy' }).click();
    await screenshot('03-choose-matchup');
    await page.getByRole('button', { name: 'Add to vs. Sol Badguy' }).click();

    step('3. mark focus points');
    await page.getByRole('heading', { name: 'Focus points' }).waitFor();
    await waitForPlayer();
    await page.evaluate(() => {
      document.querySelector('video').currentTime = 3;
    });
    await page.keyboard.press('m');
    const focusLabel = page.getByRole('textbox', { name: /^Label for timestamp at 0:03/ });
    await focusLabel.fill('Round 2 - lost neutral');
    await focusLabel.press('Enter');
    await expectLibrary((l) => l.timestamps[0]?.label === 'Round 2 - lost neutral', 'labelled focus point');
    await screenshot('04-focus-points');

    step('   nothing is cut off at the smallest window size');
    await resizeWindow();
    await expectFullyVisible(page.getByRole('button', { name: 'Start review' }), 'Start review');
    await expectFullyVisible(page.getByRole('button', { name: /^Mark/ }), 'Mark focus point');
    await expectFullyVisible(page.getByRole('toolbar', { name: 'Playback controls' }), 'Playback controls');
    for (const name of ['Play (Space)', 'Next frame (.)', 'Zoom in (+)', 'Reset zoom (0)', 'Mute']) {
      await expectFullyVisible(page.getByRole('button', { name, exact: true }), name);
    }
    await page.getByRole('button', { name: 'Start review' }).click();
    await page.getByRole('tab', { name: /Notes/ }).waitFor();
    await expectFullyVisible(page.getByRole('button', { name: 'Save note' }), 'Save note');
    await expectFullyVisible(page.getByRole('tab', { name: /Timestamps/ }), 'Timestamps tab');
    await expectFullyVisible(page.getByRole('toolbar', { name: 'Playback controls' }), 'Playback controls');
    await resizeWindow(1440, 900);

    step('4. review: opens on the first focus point');
    await waitForPlayer();
    await page.waitForFunction(() => Math.abs(document.querySelector('video').currentTime - 3) < 0.05);

    step('   frame rate is detected while playing');
    await page.keyboard.press('Space');
    await expectLibrary((l) => l.videos[0]?.frameRateSource === 'detected', 'detected frame rate');
    await page.keyboard.press('Space');
    assert.equal((await readLibrary()).videos[0].frameRate, SAMPLE_FPS, 'detected the sample frame rate');

    step('   frame-by-frame stepping moves exactly one frame');
    await page.waitForFunction(() => document.querySelector('video').paused && !document.querySelector('video').seeking);
    const before = await frameAt();
    await page.keyboard.press('.');
    assert.equal(await frameAt(), before + 1, 'next frame');
    await page.keyboard.press(',');
    await page.keyboard.press(',');
    assert.equal(await frameAt(), before - 1, 'previous frame');
    await page.keyboard.press('>');
    assert.equal(await frameAt(), before + 9, 'ten frames forward');

    step('   notes are stored with their position and session');
    await page.keyboard.press('n');
    const noteTime = await videoTime();
    await page.keyboard.type('Dropped the combo after 6P - practise the route');
    await page.keyboard.press('Control+Enter');
    await page.getByRole('listitem').getByText('Dropped the combo after 6P').waitFor();
    await page.keyboard.press('Escape');
    const withNote = await expectLibrary((l) => l.notes.length === 1 && l.sessions.length === 1, 'note and session');
    assert.ok(Math.abs(withNote.notes[0].timeSeconds - noteTime) < 0.001, 'note pinned to the playhead');
    assert.equal(withNote.notes[0].sessionId, withNote.sessions[0].id, 'note belongs to the session');

    step('   timestamps jump the video when clicked');
    await page.evaluate(() => {
      document.querySelector('video').currentTime = 6;
    });
    await page.keyboard.press('m');
    await page.getByRole('button', { name: /^Jump to 0:06/ }).waitFor();
    await page.getByRole('button', { name: /^Jump to 0:03.*Round 2/ }).click();
    await page.waitForFunction(() => Math.abs(document.querySelector('video').currentTime - 3) < 0.05);
    await page.getByRole('button', { name: /^Jump to 0:06/ }).click();
    await page.waitForFunction(() => Math.abs(document.querySelector('video').currentTime - 6) < 0.05);

    step('   the scrubber seeks and the picture toggles playback');
    const stage = page.getByRole('region', { name: 'Video player' });
    const slider = page.getByRole('slider', { name: 'Seek' });
    const sliderBox = await slider.boundingBox();
    await page.mouse.click(sliderBox.x + sliderBox.width / 4, sliderBox.y + sliderBox.height / 2);
    await page.waitForFunction(() => Math.abs(document.querySelector('video').currentTime - 2) < 0.1);
    await stage.click({ position: { x: 300, y: 200 } });
    await page.waitForFunction(() => !document.querySelector('video').paused);
    await stage.click({ position: { x: 300, y: 200 } });
    await page.waitForFunction(() => document.querySelector('video').paused);

    step('   zoom in, out and reset');
    const zoomLevel = page.getByLabel('Zoom level');
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    assert.equal(await zoomLevel.textContent(), '156%');
    await stage.hover({ position: { x: 200, y: 150 } });
    await page.mouse.wheel(0, -600);
    assert.notEqual(await zoomLevel.textContent(), '156%', 'wheel zooms');
    const pictureTransform = () => page.evaluate(() => document.querySelector('video').parentElement.style.transform);
    const beforePan = await pictureTransform();
    await page.mouse.down();
    await page.mouse.move(420, 330, { steps: 4 });
    await page.mouse.up();
    assert.notEqual(await pictureTransform(), beforePan, 'dragging pans the zoomed picture');
    assert.ok(await page.evaluate(() => document.querySelector('video').paused), 'a drag is not a click');
    await page.getByRole('tab', { name: /Notes/ }).click();
    await screenshot('05-review-zoomed');
    await page.keyboard.press('0');
    assert.equal(await zoomLevel.textContent(), '100%');
    await screenshot('06-review-dark');

    step('   light theme');
    await setTheme('light');
    await screenshot('07-review-light');

    step('5. the matchup folder shows the video and highlights that it is old');
    await page.getByRole('link', { name: 'Back to vs. Sol Badguy' }).click();
    await page.getByRole('heading', { name: 'vs. Sol Badguy', level: 1 }).waitFor();
    await page.getByText(`${SAMPLE_AGE_DAYS} days ago`).waitFor();
    assert.equal(await page.getByText('Old video:').count(), 1, 'stale video is flagged');
    await page.getByText('1 note', { exact: true }).waitFor();
    await page.getByText('2 timestamps').waitFor();
    await screenshot('08-folder-light');

    await page.getByRole('link', { name: 'All matchups' }).click();
    await page.getByRole('link', { name: 'vs. Sol Badguy, 1 video' }).waitFor();
    await screenshot('09-library-light');
    await setTheme('dark');
    await screenshot('10-library-dark');

    step('6. everything was persisted to library.json');
    const library = await readLibrary();
    assert.equal(library.videos.length, 1);
    assert.equal(library.videos[0].folderId, 'matchup-sol');
    assert.ok(Math.abs(library.videos[0].durationSeconds - 8) < 0.2, 'duration recorded');
    assert.deepEqual(library.timestamps.map((t) => t.kind).sort(), ['bookmark', 'focus']);
    assert.equal(library.settings.theme, 'dark');

    step('7. settings: raising the threshold clears the "old video" highlight');
    await page.getByRole('button', { name: 'Settings' }).click();
    const threshold = page.getByRole('spinbutton', { name: 'Highlight videos older than' });
    await threshold.fill('30');
    await threshold.press('Enter');
    await expectLibrary((l) => l.settings.staleAfterDays === 30, 'stale threshold');
    await screenshot('11-settings');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('link', { name: 'vs. Sol Badguy, 1 video' }).click();
    await page.getByText(`${SAMPLE_AGE_DAYS} days ago`).waitFor();
    assert.equal(await page.getByText('Old video:').count(), 0, 'no longer flagged');

    step('8. folders: create a custom folder and move the video into it');
    await page.getByRole('link', { name: 'All matchups' }).click();
    await page.getByRole('button', { name: 'New folder' }).click();
    await page.getByRole('textbox', { name: 'Folder name' }).fill('Tournament sets');
    await page.getByRole('button', { name: 'Create folder' }).click();
    await page.getByRole('link', { name: /Tournament sets/ }).waitFor();
    await page.getByRole('link', { name: 'vs. Sol Badguy, 1 video' }).click();
    await page.getByRole('button', { name: 'Rename or move' }).click();
    await page.getByRole('textbox', { name: 'Title' }).fill('Grand finals');
    await page.getByRole('radio', { name: 'Tournament sets' }).click();
    await screenshot('12-edit-video');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('heading', { name: 'No videos here yet' }).waitFor();
    const moved = await expectLibrary((l) => l.videos[0].title === 'Grand finals', 'renamed video');
    assert.equal(moved.folders.find((f) => f.id === moved.videos[0].folderId).name, 'Tournament sets');

    step('9. removing a video deletes its notes and timestamps, never the file');
    await page.getByRole('link', { name: 'All matchups' }).click();
    await page.getByRole('link', { name: /Tournament sets/ }).click();
    await page.getByRole('button', { name: 'Remove from library' }).click();
    await page.getByRole('button', { name: 'Remove video' }).click();
    const emptied = await expectLibrary((l) => l.videos.length === 0, 'video removed');
    assert.deepEqual([emptied.notes, emptied.timestamps, emptied.sessions], [[], [], []]);
    await readFile(path.join(VIDEOS_DIR, SAMPLE_NAME));

    assert.deepEqual(errors, [], 'no errors were logged by the renderer');
    console.log('\nSmoke test passed.');
  } finally {
    await app.close();
  }
}

await main();
