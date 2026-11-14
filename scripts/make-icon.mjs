/**
 * Generates the application icon from a character portrait:
 *
 *   build/icon.ico      multi-size icon for the Windows executable and installer
 *   resources/icon.png  window/taskbar icon used when running unpackaged
 *
 *   npm run make:icon            (Millia Rage)
 *   npm run make:icon -- sol     (any character id from characters.ts)
 *
 * Runs inside Electron so its image codecs can be used instead of adding a dependency.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app, nativeImage } from 'electron';

const ROOT = path.resolve(import.meta.dirname, '..');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const PNG_SIZE = 256;

/** An .ico file is a small directory followed by one PNG per size. */
function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = header.length + images.length * 16;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

async function main() {
  const characterId = process.argv.slice(2).find((argument) => /^[a-z]+$/.test(argument)) ?? 'mll';
  const portraitPath = path.join(ROOT, 'src/renderer/src/assets/characters', `${characterId}.jpg`);
  const portrait = nativeImage.createFromPath(portraitPath);
  if (portrait.isEmpty()) throw new Error(`No portrait found at ${portraitPath}`);

  // Portraits are a pixel off square; crop to the largest centred square first.
  const { width, height } = portrait.getSize();
  const side = Math.min(width, height);
  const square = portrait.crop({
    x: Math.floor((width - side) / 2),
    y: Math.floor((height - side) / 2),
    width: side,
    height: side,
  });
  const pngAt = (size) => square.resize({ width: size, height: size, quality: 'best' }).toPNG();

  await mkdir(path.join(ROOT, 'build'), { recursive: true });
  await mkdir(path.join(ROOT, 'resources'), { recursive: true });
  await writeFile(
    path.join(ROOT, 'build/icon.ico'),
    encodeIco(ICO_SIZES.map((size) => ({ size, png: pngAt(size) }))),
  );
  await writeFile(path.join(ROOT, 'resources/icon.png'), pngAt(PNG_SIZE));
  console.log(`Icon generated from ${characterId}.jpg (${width}x${height}).`);
}

app
  .whenReady()
  .then(main)
  .then(
    () => app.exit(0),
    (error) => {
      console.error(error);
      app.exit(1);
    },
  );
