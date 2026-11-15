import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { protocol } from 'electron';
import type { Library } from '@shared/domain/schema';
import { MEDIA_HOST_MOVE_IMAGE, MEDIA_HOST_PREVIEW, MEDIA_HOST_VIDEO, MEDIA_SCHEME } from '@shared/media';
import { isInside, isSupportedVideoFile, videoMimeType } from '../videos/paths';
import { parseRangeHeader } from './range';

export interface MediaProtocolDependencies {
  getLibrary: () => Library;
  getVideosRoot: () => string;
  /** Resolves a move picture to a local file, downloading it first if needed. */
  getMoveImage: (fileName: string) => Promise<{ filePath: string; mimeType: string }>;
}

/** Move pictures are small and never change under a given name, so they are sent whole and cached. */
async function serveMoveImage(url: URL, deps: MediaProtocolDependencies): Promise<Response> {
  try {
    const { filePath, mimeType } = await deps.getMoveImage(url.searchParams.get('file') ?? '');
    return new Response(await readFile(filePath), {
      headers: { 'Content-Type': mimeType, 'Cache-Control': 'max-age=604800, immutable' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

/** Must run before the app is ready. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true },
    },
  ]);
}

/**
 * Maps a media URL to a file the renderer is allowed to read: either a video that is in
 * the library, or a supported video file inside the videos root (for import previews).
 */
function resolveFilePath(url: URL, deps: MediaProtocolDependencies): string | null {
  if (url.hostname === MEDIA_HOST_VIDEO) {
    const videoId = decodeURIComponent(url.pathname.slice(1));
    return deps.getLibrary().videos.find((video) => video.id === videoId)?.filePath ?? null;
  }

  if (url.hostname === MEDIA_HOST_PREVIEW) {
    const filePath = url.searchParams.get('path');
    if (filePath === null || !isSupportedVideoFile(filePath)) return null;
    return isInside(deps.getVideosRoot(), filePath) ? filePath : null;
  }

  return null;
}

/**
 * Serves local video files with HTTP range support, which is what lets the `<video>`
 * element seek instantly inside multi-gigabyte recordings.
 */
export function handleMediaRequests(deps: MediaProtocolDependencies): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.hostname === MEDIA_HOST_MOVE_IMAGE) return serveMoveImage(url, deps);

    const filePath = resolveFilePath(url, deps);
    if (filePath === null) return new Response('Not found', { status: 404 });

    let size: number;
    try {
      const stats = await stat(filePath);
      if (!stats.isFile()) return new Response('Not found', { status: 404 });
      size = stats.size;
    } catch {
      return new Response('Not found', { status: 404 });
    }

    const range = parseRangeHeader(request.headers.get('range'), size);
    if (range === 'unsatisfiable') {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }

    const headers = new Headers({
      'Content-Type': videoMimeType(filePath),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    });

    if (range === null) {
      headers.set('Content-Length', String(size));
      if (size === 0) return new Response(null, { status: 200, headers });
      return new Response(toWebStream(filePath), { status: 200, headers });
    }

    headers.set('Content-Length', String(range.end - range.start + 1));
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    return new Response(toWebStream(filePath, range.start, range.end), { status: 206, headers });
  });
}

function toWebStream(filePath: string, start?: number, end?: number): ReadableStream<Uint8Array> {
  const stream = createReadStream(filePath, { start, end });
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}
