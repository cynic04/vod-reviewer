/**
 * Downloads the character-select portrait of every Guilty Gear -Strive- character from
 * the official site into src/renderer/src/assets/characters/<id>.jpg.
 *
 * The portraits are committed, so this only needs to run again when the roster grows:
 *   1. add the character to src/shared/domain/characters.ts
 *   2. npm run fetch:characters
 *
 * Artwork (c) ARC SYSTEM WORKS. This repository is private and is not distributed.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROSTER_URL = 'https://www.guiltygear.com/ggst/en/character/';
const ROSTER_FILE = path.resolve(import.meta.dirname, '../src/shared/domain/characters.ts');
const OUTPUT_DIR = path.resolve(import.meta.dirname, '../src/renderer/src/assets/characters');
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (vod-reviewer character art fetcher)' };

async function fetchOk(url) {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response;
}

/** Character ids as declared in the app's roster, so the two can never silently disagree. */
async function readRosterIds() {
  const source = await readFile(ROSTER_FILE, 'utf8');
  return [...source.matchAll(/\{ id: '([a-z]+)'/g)].map((match) => match[1]);
}

/** Maps each character slug on the official roster page to its portrait URL. */
async function readOfficialPortraits() {
  const html = await (await fetchOk(ROSTER_URL)).text();
  const entries = html.matchAll(/character\/([a-z]+)\/"[\s\S]*?<img\s+src="([^"]+)"/g);
  return new Map([...entries].map(([, slug, src]) => [slug, new URL(src, ROSTER_URL).href]));
}

const [rosterIds, portraits] = await Promise.all([readRosterIds(), readOfficialPortraits()]);
await mkdir(OUTPUT_DIR, { recursive: true });

const missing = rosterIds.filter((id) => !portraits.has(id));
const unknown = [...portraits.keys()].filter((slug) => !rosterIds.includes(slug));

for (const id of rosterIds) {
  const url = portraits.get(id);
  if (!url) continue;
  const image = Buffer.from(await (await fetchOk(url)).arrayBuffer());
  await writeFile(path.join(OUTPUT_DIR, `${id}.jpg`), image);
  console.log(`${id.padEnd(5)} ${String(image.length).padStart(7)} bytes  ${url}`);
}

if (unknown.length > 0) {
  console.warn(`\nOn the official site but not in characters.ts: ${unknown.join(', ')}`);
}
if (missing.length > 0) {
  console.error(`\nNo portrait found for: ${missing.join(', ')}`);
  process.exitCode = 1;
}
