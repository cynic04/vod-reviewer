/**
 * Local video files are streamed to the renderer through a custom protocol instead of
 * `file://`, so the renderer never gets general filesystem access.
 *
 *   vod-media://video/<videoId>          a video that is in the library
 *   vod-media://preview/?path=<absPath>  a not-yet-imported file inside the videos root
 */
export const MEDIA_SCHEME = 'vod-media';
export const MEDIA_HOST_VIDEO = 'video';
export const MEDIA_HOST_PREVIEW = 'preview';

/** Containers Chromium can demux. Codec support (e.g. HEVC) still depends on the machine. */
export const VIDEO_MIME_TYPES: Readonly<Record<string, string>> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
};

export function videoMediaUrl(videoId: string): string {
  return `${MEDIA_SCHEME}://${MEDIA_HOST_VIDEO}/${encodeURIComponent(videoId)}`;
}

export function previewMediaUrl(filePath: string): string {
  return `${MEDIA_SCHEME}://${MEDIA_HOST_PREVIEW}/?path=${encodeURIComponent(filePath)}`;
}
