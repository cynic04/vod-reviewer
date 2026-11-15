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
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { simpleParser } from 'mailparser';
import { _electron as electron } from 'playwright-core';
import { SMTPServer } from 'smtp-server';

const ROOT = path.resolve(import.meta.dirname, '..');
const WORK_DIR = path.join(ROOT, '.e2e');
const VIDEOS_DIR = path.join(WORK_DIR, 'videos');
const USER_DATA_DIR = path.join(WORK_DIR, 'user-data');
const SCREENS_DIR = path.join(WORK_DIR, 'screens');
const SAMPLE_NAME = 'ranked-set.mp4';
const SAMPLE_FPS = 30;
const SAMPLE_AGE_DAYS = 20;
const MOVE_IMAGE = 'GGST Sol Badguy 236K.png';
const HITBOX_IMAGE = 'GGST Sol 236K Hitbox.png';
const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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

  // Frame data normally comes from Dustloop; a saved copy keeps the test off the network.
  const move = (fields) => ({
    ...{ input: '', name: '', type: 'normal', damage: '30', guard: 'All', startup: '', active: '3', recovery: '10' },
    ...{ onBlock: '', onHit: '', level: '2', counter: 'Mid', invuln: '', notes: '', images: [], hitboxes: [] },
    ...fields,
  });
  await mkdir(path.join(USER_DATA_DIR, 'frame-data'), { recursive: true });
  await writeFile(
    path.join(USER_DATA_DIR, 'frame-data', 'sol.json'),
    JSON.stringify({
      version: 2,
      fetchedAt: new Date().toISOString(),
      moves: [
        move({ input: '5P', startup: '5', onBlock: '-2', onHit: '+1' }),
        move({ input: 'c.S', startup: '7', onBlock: '+3', onHit: '+13' }),
        move({
          ...{ input: '236K', name: 'Bandit Revolver (1)', type: 'special', startup: '12', onBlock: '-13', invuln: '6-26 Airborne' },
          ...{ images: [MOVE_IMAGE], hitboxes: [HITBOX_IMAGE] },
        }),
      ],
    }),
  );

  // Its pictures are kept under a hash of their name; save them so none is downloaded.
  await mkdir(path.join(USER_DATA_DIR, 'frame-data', 'images'), { recursive: true });
  for (const name of [MOVE_IMAGE, HITBOX_IMAGE]) {
    const hash = createHash('sha256').update(name).digest('hex').slice(0, 32);
    await writeFile(path.join(USER_DATA_DIR, 'frame-data', 'images', `${hash}.png`), Buffer.from(ONE_PIXEL_PNG, 'base64'));
  }

  // Backdate it so the "old video" highlight has something to highlight.
  const recordedAt = new Date(Date.now() - SAMPLE_AGE_DAYS * 24 * 60 * 60 * 1000);
  await utimes(samplePath, recordedAt, recordedAt);
}

/** A local mail server standing in for Gmail: accepts one account and hands back what it receives. */
async function startMailServer() {
  const inbox = [];
  const waiting = [];
  const server = new SMTPServer({
    disabledCommands: ['STARTTLS'],
    onAuth: (auth, _session, callback) =>
      auth.username === 'sender@example.com' && auth.password === 'e2e-app-password'
        ? callback(null, { user: 'e2e' })
        : callback(new Error('Invalid login')),
    onData: (stream, _session, callback) => {
      simpleParser(stream).then((mail) => {
        const waiter = waiting.shift();
        if (waiter) waiter(mail);
        else inbox.push(mail);
        callback();
      }, callback);
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.server.address().port,
    nextMail: () => (inbox.length > 0 ? Promise.resolve(inbox.shift()) : new Promise((resolve) => waiting.push(resolve))),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

const readLibrary = async () => JSON.parse(await readFile(path.join(USER_DATA_DIR, 'library.json'), 'utf8'));

async function main() {
  await prepareFixtures();

  // Set VOD_REVIEWER_E2E_EXECUTABLE to test a packaged build, e.g.
  // "dist/win-unpacked/VOD Reviewer.exe", instead of the app in this repository.
  const packagedExecutable = process.env.VOD_REVIEWER_E2E_EXECUTABLE;
  // A packaged build refuses mail servers without TLS, so email is only exercised unpackaged.
  const mailServer = packagedExecutable ? null : await startMailServer();
  const app = await electron.launch({
    ...(packagedExecutable ? { executablePath: path.resolve(packagedExecutable), args: [] } : { args: [ROOT] }),
    env: {
      ...process.env,
      VOD_REVIEWER_USER_DATA: USER_DATA_DIR,
      VOD_REVIEWER_VIDEOS_ROOT: VIDEOS_DIR,
      // The app prepares summarize runs but starts no Copilot CLI; this test plays the agent.
      VOD_REVIEWER_AGENT_DRY_RUN: '1',
      VOD_REVIEWER_SMTP_ALLOW_INSECURE: '1',
    },
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

    if (mailServer) {
      step('   email: connect an account and receive the test message');
      await page.getByRole('button', { name: 'Settings' }).click();
      await page.getByRole('button', { name: 'Set up' }).click();
      const setup = page.getByRole('dialog', { name: 'Email setup' });
      assert.equal(await setup.getByLabel('Send summaries to').inputValue(), 'firegate0@gmail.com', 'recipient is prefilled');
      await setup.getByLabel('Send summaries to').fill('me@example.com');
      await setup.getByLabel('Sending account').selectOption('other');
      await setup.getByLabel('Account address').fill('sender@example.com');
      await setup.getByLabel('SMTP server').fill('127.0.0.1');
      await setup.getByLabel('Port').fill(String(mailServer.port));
      await setup.getByLabel('Password').fill('e2e-app-password');
      await screenshot('04a-email-setup');
      await setup.getByRole('button', { name: 'Save and send test' }).click();
      await setup.getByText('A test email is on its way to me@example.com').waitFor();
      assert.equal((await mailServer.nextMail()).subject, 'VOD Reviewer: email is set up');
      await setup.getByRole('button', { name: 'Close' }).click();
      await page.getByText('Summaries go to me@example.com').waitFor();
      await page.getByRole('button', { name: 'Done' }).click();
      const stored = await readFile(path.join(USER_DATA_DIR, 'library.json'), 'utf8');
      assert.ok(!stored.includes('e2e-app-password'), 'the password is not in the library file');
      assert.ok(!(await readFile(path.join(USER_DATA_DIR, 'email-credentials.bin'))).includes('e2e-app-password'), 'the stored password is encrypted');
    }

    step('   summarize: the harness briefs the agent and shows the summary it hands in');
    await page.getByRole('button', { name: 'Summarize', exact: true }).click();
    await page.getByText('Copilot is summarizing this session').waitFor();
    const agentDir = path.join(USER_DATA_DIR, 'agent');
    const runFiles = await readdir(path.join(agentDir, 'runs'));
    const launcher = await readFile(path.join(agentDir, 'runs', runFiles.find((file) => file.endsWith('.cmd'))), 'utf8');
    assert.match(launcher, /copilot --prompt \/summarize --model claude-haiku-4\.5 /, 'launcher runs the skill on a small model');
    assert.match(await readFile(path.join(agentDir, '.github/skills/summarize/SKILL.md'), 'utf8'), /^---\r?\nname: summarize/);
    const mcpConfig = JSON.parse(await readFile(path.join(agentDir, 'runs', runFiles.find((file) => file.endsWith('.mcp.json'))), 'utf8'));
    const agentEndpoint = mcpConfig.mcpServers['vod-reviewer'].url;
    let rpcId = 0;
    const rpc = async (method, params) => {
      const response = await fetch(agentEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: (rpcId += 1), method, params }),
      });
      return (await response.json()).result;
    };
    const callTool = async (name, args = {}) => (await rpc('tools/call', { name, arguments: args })).content[0].text;
    await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'e2e', version: '0' } });
    assert.deepEqual(
      (await rpc('tools/list')).tools.map((tool) => tool.name),
      ['get_review_session', 'frame_data', 'youtube_search', 'save_summary'],
    );
    const brief = JSON.parse(await callTool('get_review_session'));
    assert.equal(brief.matchup.opponent, 'Sol Badguy');
    assert.equal(brief.notes[0].text, 'Dropped the combo after 6P - practise the route');
    assert.match(
      await callTool('frame_data', { character: 'opponent', moves: 'Bandit Revolver' }),
      /236K \(Bandit Revolver \(1\)\): startup 12, active 3, recovery 10, on block -13/,
    );
    await callTool('save_summary', {
      markdown: '## Overview\n\nYou drop the 6P route under pressure.\n\n## Study material\n\n- [Combo guide](https://www.youtube.com/watch?v=e2eVideo001) - the route.\n\n<script>window.pwned = true</script>',
    });
    if (mailServer) {
      // Saving a summary emails it without anyone asking.
      const automatic = await mailServer.nextMail();
      assert.match(automatic.subject, /^VOD review: vs\. Sol Badguy - ranked-set \(/);
      assert.equal(automatic.to.text, 'me@example.com');
      assert.match(automatic.html, /Overview<\/h2>/);
      assert.match(automatic.html, /Dropped the combo after 6P - practise the route/, 'the notes are included');
      assert.match(automatic.html, /i\.ytimg\.com\/vi\/e2eVideo001\/mqdefault\.jpg/, 'linked videos become cards');
      assert.ok(!automatic.html.includes('<script>'), 'HTML in a summary is not sent as HTML');
      assert.equal(automatic.attachments[0]?.contentId, '<portrait@vod-reviewer>', 'the character portrait is embedded');
      assert.ok(automatic.attachments[0].size > 10_000);
      await page.getByText('Summary emailed to me@example.com.').waitFor();
    }

    // The agent's save reaches the open window without any request from it.
    await page.getByRole('link', { name: 'View summary' }).click();
    await page.getByRole('heading', { name: 'Session notes', level: 1 }).waitFor();
    // Session cards start collapsed: only the header shows until one is opened.
    const sessionToggle = page.getByRole('button', { name: 'Show session notes for ranked-set' });
    assert.equal(await sessionToggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.getByRole('heading', { name: 'Overview' }).count(), 0, 'summary is hidden while collapsed');
    await sessionToggle.click();
    await page.getByRole('heading', { name: 'Overview' }).waitFor();
    const studyLink = page.getByRole('link', { name: 'Combo guide' });
    assert.equal(await studyLink.getAttribute('target'), '_blank', 'links open outside the app');
    assert.equal(await page.evaluate(() => window.pwned), undefined, 'HTML in a summary is not executed');
    await screenshot('05a-session-notes');
    if (mailServer) {
      await page.getByRole('button', { name: 'Email', exact: true }).click();
      assert.match((await mailServer.nextMail()).text, /## Overview/, 'sent on request, with a plain-text alternative');
    }
    await page.getByRole('link', { name: 'Session notes', exact: true }).click();
    // On the page for all matchups, each character is a group that starts collapsed.
    const characterGroup = page.getByRole('heading', { name: 'vs. Sol Badguy', level: 2 }).getByRole('button');
    assert.equal(await characterGroup.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.getByRole('link', { name: 'ranked-set', exact: true }).count(), 0, 'sessions are hidden while collapsed');
    await characterGroup.click();
    assert.equal(await characterGroup.getAttribute('aria-expanded'), 'true');
    await screenshot('05b-session-notes-all');
    await page.getByRole('link', { name: 'ranked-set', exact: true }).click();
    await waitForPlayer();

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

    step('   notes fold away under the timestamp they belong to');
    await page.getByRole('tab', { name: /Notes/ }).click();
    const noteGroup = page.getByRole('button', { name: /Round 2 - lost neutral\s*1$/ });
    const groupedNote = page.getByRole('listitem').getByText('Dropped the combo after 6P');
    await groupedNote.waitFor();
    assert.equal(await noteGroup.getAttribute('aria-expanded'), 'true');
    await noteGroup.click();
    await groupedNote.waitFor({ state: 'detached' });
    assert.equal(await noteGroup.getAttribute('aria-expanded'), 'false');
    await page.getByRole('button', { name: 'Expand all' }).click();
    await groupedNote.waitFor();

    step('   frame data: the opponent\'s moves, searchable, with details on demand');
    await page.keyboard.press('f');
    const frames = page.getByRole('tabpanel', { name: 'Frames' });
    assert.equal(await frames.getByLabel('Character').inputValue(), 'sol', 'opens on the opponent');
    // Active and recovery are columns only when the sidebar is wide enough.
    await frames.getByRole('row', { name: /c\.S 7 (3 10 )?\+3 \+13/ }).waitFor();
    assert.equal(await frames.getByRole('button', { expanded: false }).count(), 3);
    await frames.getByRole('searchbox').fill('bandit');
    assert.equal(await frames.getByRole('button', { expanded: false }).count(), 1, 'search narrows the list');
    await frames.getByRole('button', { name: /236K/ }).click();
    await frames.getByText('6-26 Airborne').waitFor();
    const picture = frames.getByRole('img', { name: '236K Bandit Revolver (1)', exact: true });
    await picture.waitFor();
    assert.ok(await picture.evaluate((image) => image.complete && image.naturalWidth > 0), 'the move picture loads');
    await frames.getByRole('button', { name: 'Hitbox' }).click();
    const hitbox = frames.getByRole('img', { name: 'Hitboxes of 236K Bandit Revolver (1)' });
    await hitbox.waitFor();
    await page.waitForFunction((image) => image.complete && image.naturalWidth > 0, await hitbox.elementHandle());
    await screenshot('05c-frame-data');
    await page.getByRole('tab', { name: /Notes/ }).click();

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
    assert.deepEqual([emptied.notes, emptied.timestamps, emptied.sessions, emptied.summaries], [[], [], [], []]);
    await readFile(path.join(VIDEOS_DIR, SAMPLE_NAME));

    assert.deepEqual(errors, [], 'no errors were logged by the renderer');
    console.log('\nSmoke test passed.');
  } finally {
    await app.close();
    await mailServer?.close();
  }
}

await main();
