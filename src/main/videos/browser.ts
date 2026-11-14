import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Video } from '@shared/domain/schema';
import type { DirectoryEntry, DirectoryListing, VideoFileEntry } from '@shared/ipc/contract';
import { DomainError } from '../library/errors';
import { isInside, isSupportedVideoFile, pathKey } from './paths';

const byName = (a: DirectoryEntry, b: DirectoryEntry): number =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Lists the sub-folders and video files of a directory inside `root`.
 * Refuses to list anything outside of `root`.
 */
export async function browseDirectory(
  root: string,
  directory: string | null,
  importedVideos: readonly Video[],
): Promise<DirectoryListing> {
  const resolvedRoot = path.resolve(root);
  const target = directory === null ? resolvedRoot : path.resolve(directory);
  if (!isInside(resolvedRoot, target)) {
    throw new DomainError('FORBIDDEN', 'That folder is outside of your videos folder.');
  }

  let entries: Dirent[];
  try {
    entries = await readdir(target, { withFileTypes: true });
  } catch {
    throw new DomainError('NOT_FOUND', `The folder "${target}" could not be opened.`);
  }

  const importedByPath = new Map(importedVideos.map((video) => [pathKey(video.filePath), video.id]));
  const directories: DirectoryEntry[] = [];
  const videos: VideoFileEntry[] = [];

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(target, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) directories.push({ name: entry.name, path: entryPath });
        return;
      }
      if (!entry.isFile() || !isSupportedVideoFile(entry.name)) return;
      try {
        const stats = await stat(entryPath);
        videos.push({
          name: entry.name,
          path: entryPath,
          sizeBytes: stats.size,
          modifiedAt: stats.mtime.toISOString(),
          importedVideoId: importedByPath.get(pathKey(entryPath)) ?? null,
        });
      } catch {
        // The file vanished or is not readable; leave it out of the listing.
      }
    }),
  );

  return {
    root: resolvedRoot,
    path: target,
    parent: pathKey(target) === pathKey(resolvedRoot) ? null : path.dirname(target),
    directories: directories.sort(byName),
    videos: videos.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)),
  };
}
