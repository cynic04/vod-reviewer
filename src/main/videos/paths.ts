import path from 'node:path';
import { VIDEO_MIME_TYPES } from '@shared/media';

/** Key for comparing paths: normalised, and case-insensitive where the filesystem is. */
export function pathKey(filePath: string): string {
  const normalised = path.normalize(filePath);
  return process.platform === 'win32' || process.platform === 'darwin' ? normalised.toLowerCase() : normalised;
}

/** True when `target` is `root` itself or lives somewhere below it. */
export function isInside(root: string, target: string): boolean {
  const relative = path.relative(pathKey(path.resolve(root)), pathKey(path.resolve(target)));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function isSupportedVideoFile(filePath: string): boolean {
  return Object.hasOwn(VIDEO_MIME_TYPES, path.extname(filePath).toLowerCase());
}

export function videoMimeType(filePath: string): string {
  return VIDEO_MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}
