import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHARACTERS, getCharacter } from '@shared/domain/characters';
import {
  advantageSign,
  isMoveImageName,
  moveMatches,
  type CharacterFrameData,
  type FrameDataMove,
} from '@shared/domain/frameData';
import {
  cleanWikiText,
  createDustloopFetcher,
  createDustloopImageFetcher,
  dustloopFrameDataUrl,
  parseMoves,
  wikiCharacterName,
} from './dustloop';
import { describePunish, formatFrameData, guaranteedAdvantage } from './format';
import { FrameDataService } from './service';

const row = (fields: Record<string, string | null>): { title: Record<string, string | null> } => ({ title: fields });

/** A trimmed copy of what Dustloop's API returns for Sol. */
const SOL_RESPONSE = {
  cargoquery: [
    row({ input: '623S', name: 'S Volcanic Viper', type: 'special', startup: '9', onBlock: '-40', invuln: '1-11 Full<br>12-40 Airborne' }),
    row({ input: '2K', name: '', type: 'normal', startup: '6', onBlock: '-2', guard: 'Low' }),
    row({ input: '632146H', name: 'Tyrant Rave', type: 'super', startup: '7+2', onBlock: '-44' }),
    row({ input: '5P', name: '', type: 'normal', startup: '5', onBlock: '-2', notes: 'Hitstop: 11F;Can be jump cancelled' }),
    row({
      input: '236K',
      name: 'Bandit Revolver (1)',
      type: 'special',
      startup: '12',
      onBlock: '-13',
      images: 'GGST Sol Badguy 236K.png',
      hitboxes: 'GGST Sol 236K Hitbox.png; GGST Sol 236K 2 Hitbox.png;../../secret.png;http://evil.example/x.png',
    }),
    row({ input: '6D or 4D', name: 'Ground Throw', type: 'other', startup: '2', onBlock: null }),
    row({ input: 'j.H', name: '', type: 'Normal', startup: '11', onBlock: '+7 (IAD)' }),
    row({ input: '', name: '', type: 'normal' }),
  ],
};

describe('Dustloop frame data', () => {
  it('parses moves, cleans wiki markup, and orders them the way players read a move list', () => {
    const moves = parseMoves(SOL_RESPONSE);

    expect(moves.map((move) => move.input)).toEqual(['5P', '2K', 'j.H', '236K', '623S', '632146H', '6D or 4D']);
    expect(moves[0]).toMatchObject({ input: '5P', type: 'normal', startup: '5', notes: 'Hitstop: 11F; Can be jump cancelled' });
    expect(moves[2]?.type).toBe('normal');
    expect(moves[4]?.invuln).toBe('1-11 Full; 12-40 Airborne');
    // Fields the wiki leaves out come back as empty text, never as null.
    expect(moves[6]).toMatchObject({ name: 'Ground Throw', onBlock: '', damage: '' });
  });

  it('keeps the file names of a move\'s pictures, dropping anything that is not a plain image name', () => {
    const revolver = parseMoves(SOL_RESPONSE).find((move) => move.input === '236K');
    expect(revolver?.images).toEqual(['GGST Sol Badguy 236K.png']);
    expect(revolver?.hitboxes).toEqual(['GGST Sol 236K Hitbox.png', 'GGST Sol 236K 2 Hitbox.png']);
    expect(parseMoves(SOL_RESPONSE)[0]).toMatchObject({ images: [], hitboxes: [] });

    expect(isMoveImageName('GGST Jack-O j.236[S] (2).png')).toBe(true);
    for (const name of ['..\\x.png', 'a/b.png', 'x.svg', 'x.png.exe', '', ' leading.png']) {
      expect(isMoveImageName(name)).toBe(false);
    }
  });

  it('downloads a picture only from where Dustloop says it is, and only from Dustloop', async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const requested: string[] = [];
    const wiki = (thumburl: string): typeof fetch =>
      ((url: URL) => {
        requested.push(url.href);
        return Promise.resolve(
          url.pathname.endsWith('api.php')
            ? new Response(JSON.stringify({ query: { pages: { 1: { imageinfo: [{ thumburl, url: thumburl }] } } } }))
            : new Response(png, { headers: { 'content-type': 'image/png' } }),
        );
      }) as typeof fetch;
    const good = 'https://www.dustloop.com/wiki/images/thumb/a/ab/X.png/480px-X.png';

    expect((await createDustloopImageFetcher('test', wiki(good))('GGST Sol Badguy 5P.png')).bytes).toEqual(png);
    expect(requested[0]).toContain('titles=File%3AGGST+Sol+Badguy+5P.png');
    expect(requested[1]).toBe(good);

    await expect(createDustloopImageFetcher('test', wiki('https://evil.example/x.png'))('GGST Sol Badguy 5P.png')).rejects.toThrow(
      /unexpected image location/,
    );
    await expect(createDustloopImageFetcher('test', wiki(good))('../x.png')).rejects.toThrow(/Not a move image name/);
    const missing = (() => Promise.resolve(new Response('{"query":{"pages":{"-1":{"missing":""}}}}'))) as typeof fetch;
    await expect(createDustloopImageFetcher('test', missing)('GGST Nope.png')).rejects.toThrow(/no image named/);
  });

  it('reduces wiki text to plain text', () => {
    expect(cleanWikiText("[[GGST/Sol Badguy#6P|6P]] is '''great''' &amp; safe<br/>{{clr|1|P}}  really")).toBe(
      '6P is great & safe; really',
    );
  });

  it('rejects anything that is not a query result', () => {
    expect(() => parseMoves({ error: { code: 'internal_api_error' } })).toThrow(/unexpected format/);
  });

  it('asks for a character by the name the wiki uses', async () => {
    const requested: URL[] = [];
    const fetchPage = ((url: URL) => {
      requested.push(url);
      return Promise.resolve(new Response(JSON.stringify(SOL_RESPONSE)));
    }) as typeof fetch;
    const jackO = getCharacter('jko');
    if (!jackO) throw new Error('fixture');

    const moves = await createDustloopFetcher('test', fetchPage)(jackO);

    expect(moves).toHaveLength(7);
    expect(requested[0]?.searchParams.get('where')).toBe('chara="Jack-O"');
    expect(requested[0]?.searchParams.get('tables')).toBe('MoveData_GGST');
    expect(dustloopFrameDataUrl(jackO)).toBe('https://www.dustloop.com/w/GGST/Jack-O/Frame_Data');
    // No roster name can break out of the quoted query value.
    expect(CHARACTERS.every((character) => !wikiCharacterName(character).includes('"'))).toBe(true);
  });

  it('reports a character the wiki has nothing for, and a failing server', async () => {
    const sol = getCharacter('sol');
    if (!sol) throw new Error('fixture');
    const empty = (() => Promise.resolve(new Response('{"cargoquery":[]}'))) as typeof fetch;
    const down = (() => Promise.resolve(new Response('', { status: 503 }))) as typeof fetch;

    await expect(createDustloopFetcher('test', empty)(sol)).rejects.toThrow(/no frame data for Sol Badguy/);
    await expect(createDustloopFetcher('test', down)(sol)).rejects.toThrow(/answered 503/);
  });
});

describe('frame data helpers', () => {
  it('reads which side is ahead from the text Dustloop gives', () => {
    expect(advantageSign('+3')).toBe('plus');
    expect(advantageSign('-13')).toBe('minus');
    expect(advantageSign('±0')).toBe('even');
    expect(advantageSign('0')).toBe('even');
    expect(advantageSign('KD +37 (IAD)')).toBe('plus');
    expect(advantageSign('-4~+2')).toBe('minus');
    expect(advantageSign('')).toBeNull();
    expect(advantageSign('Until Landing')).toBeNull();
  });

  it('matches moves by input or name, ignoring case and spaces', () => {
    const move = { input: '236K', name: 'Bandit Revolver (1)' } as FrameDataMove;
    expect(moveMatches(move, 'banditrevolver')).toBe(true);
    expect(moveMatches(move, ' 236k ')).toBe(true);
    expect(moveMatches(move, '')).toBe(true);
    expect(moveMatches(move, 'gun flame')).toBe(false);
  });
});

describe('punish advice for the agent', () => {
  const frameData = (characterId: string, moves: Partial<FrameDataMove>[]): CharacterFrameData => ({
    characterId,
    fetchedAt: '2026-11-15T00:00:00.000Z',
    isStale: false,
    sourceUrl: '',
    moves: moves.map((fields) => ({ ...parseMoves({ cargoquery: [row({ input: 'x', type: 'normal' })] })[0], ...fields }) as FrameDataMove),
  });
  const millia = frameData('mll', [
    { input: '5K', startup: '7' },
    { input: '5P', startup: '5' },
    { input: 'c.S', startup: '7' },
    { input: '2D', startup: '10' },
    { input: 'j.P', startup: '5' },
    { input: '6D or 4D', name: 'Ground Throw', type: 'other', startup: '2' },
    { input: '236S', name: 'Tandem Top', type: 'special', startup: '15~29' },
  ]);
  const blocked = (onBlock: string): FrameDataMove => ({ ...millia.moves[0], input: '236KK', onBlock }) as FrameDataMove;

  it('takes the advantage a defender can rely on from a range', () => {
    expect(guaranteedAdvantage('-11~-14')).toBe(-11);
    expect(guaranteedAdvantage('-4~+2')).toBe(2);
    expect(guaranteedAdvantage('-17[-15]')).toBe(-15);
    expect(guaranteedAdvantage('±0')).toBe(0);
    expect(guaranteedAdvantage('')).toBeNull();
  });

  it('lists the grounded moves that are fast enough, fastest first', () => {
    expect(describePunish(blocked('-11~-14'), millia)).toBe(
      'Punishable by frames (gap 11f): Millia Rage can use 5P (5f), 5K (7f), c.S (7f), 2D (10f). Lower startup is faster. Range and pushback are not accounted for.',
    );
    // Air moves, throws and moves without a single startup value are never offered.
    expect(describePunish(blocked('-40'), millia)).not.toMatch(/j\.P|Throw|236S/);
  });

  it('says when a move is safe or plus instead of suggesting a punish', () => {
    expect(describePunish(blocked('-4'), millia)).toBe(
      "Not punishable by frames: Millia Rage's fastest ground move is 5P (5f) and the gap is only 4f.",
    );
    expect(describePunish(blocked('+3'), millia)).toMatch(/^Plus on block: no punish/);
    expect(describePunish(blocked(''), millia)).toBeNull();
  });

  it('adds the advice under each move only when a defender is given', () => {
    const sol = frameData('sol', [{ input: '236KK', name: 'Bandit Revolver (2)', type: 'special', startup: '6', onBlock: '-11~-14' }]);
    expect(formatFrameData(sol, undefined)).not.toContain('->');
    expect(formatFrameData(sol, undefined, millia)).toContain('\n  -> Punishable by frames (gap 11f): Millia Rage can use 5P (5f)');
  });
});

describe('frame data cache', () => {
  let cacheDir: string;
  let now: Date;
  let downloads: number;
  let isOnline: boolean;

  const service = (): FrameDataService =>
    new FrameDataService({
      cacheDir,
      now: () => now,
      fetchImage: () => {
        downloads += 1;
        return isOnline ? Promise.resolve({ bytes: new Uint8Array([1, 2, 3]) }) : Promise.reject(new Error('offline'));
      },
      fetchMoves: () => {
        downloads += 1;
        return isOnline ? Promise.resolve(parseMoves(SOL_RESPONSE)) : Promise.reject(new Error('offline'));
      },
    });

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), 'vod-reviewer-frames-'));
    now = new Date('2026-11-15T10:00:00.000Z');
    downloads = 0;
    isOnline = true;
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('downloads once, then serves the saved copy for a week', async () => {
    const first = await service().get('sol', { refresh: false });
    expect(first).toMatchObject({ characterId: 'sol', isStale: false, fetchedAt: '2026-11-15T10:00:00.000Z' });
    expect(first.sourceUrl).toBe('https://www.dustloop.com/w/GGST/Sol_Badguy/Frame_Data');
    expect(first.moves).toHaveLength(7);

    now = new Date('2026-11-21T10:00:00.000Z');
    expect((await service().get('sol', { refresh: false })).fetchedAt).toBe('2026-11-15T10:00:00.000Z');
    expect(downloads).toBe(1);

    now = new Date('2026-11-23T10:00:00.000Z');
    expect((await service().get('sol', { refresh: false })).fetchedAt).toBe('2026-11-23T10:00:00.000Z');
    expect(downloads).toBe(2);
  });

  it('downloads again on request, and shares one download between simultaneous requests', async () => {
    const shared = service();
    await Promise.all([shared.get('sol', { refresh: false }), shared.get('sol', { refresh: false })]);
    expect(downloads).toBe(1);

    await shared.get('sol', { refresh: true });
    expect(downloads).toBe(2);
  });

  it('falls back to an old copy when offline, and says so', async () => {
    await service().get('sol', { refresh: false });
    isOnline = false;
    now = new Date('2026-12-25T10:00:00.000Z');

    const stale = await service().get('sol', { refresh: false });
    expect(stale).toMatchObject({ isStale: true, fetchedAt: '2026-11-15T10:00:00.000Z' });
    expect(stale.moves).toHaveLength(7);
  });

  it('explains when there is nothing saved and nothing can be downloaded', async () => {
    isOnline = false;
    await expect(service().get('sol', { refresh: false })).rejects.toThrow(
      'Frame data for Sol Badguy could not be downloaded. offline',
    );
    await expect(service().get('ryu', { refresh: false })).rejects.toThrow(/does not exist/);
  });

  it('downloads a move picture once and keeps it under a name of its own choosing', async () => {
    const shared = service();
    const [first, second] = await Promise.all([
      shared.getImage('GGST Sol Badguy 5P.png'),
      shared.getImage('GGST Sol Badguy 5P.png'),
    ]);
    expect(downloads).toBe(1);
    expect(first).toEqual(second);
    expect(first.mimeType).toBe('image/png');
    expect(path.dirname(first.filePath)).toBe(path.join(cacheDir, 'images'));
    expect(path.basename(first.filePath)).toMatch(/^[0-9a-f]{32}\.png$/);
    expect([...(await readFile(first.filePath))]).toEqual([1, 2, 3]);

    isOnline = false;
    expect((await service().getImage('GGST Sol Badguy 5P.png')).filePath).toBe(first.filePath);
    await expect(service().getImage('GGST Sol Badguy 2K.png')).rejects.toThrow('offline');
    await expect(service().getImage('..\\..\\library.json')).rejects.toThrow(/does not exist/);
    await expect(service().getImage('notes.txt')).rejects.toThrow(/does not exist/);
  });

  it('ignores a damaged cache file and replaces it', async () => {
    await writeFile(path.join(cacheDir, 'sol.json'), '{ "version": 1, "moves": "broken" }', 'utf8');

    expect((await service().get('sol', { refresh: false })).moves).toHaveLength(7);
    expect(JSON.parse(await readFile(path.join(cacheDir, 'sol.json'), 'utf8'))).toMatchObject({ version: 2 });
  });
});
