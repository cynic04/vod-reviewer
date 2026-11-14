/** Route patterns and the builders that produce links to them. */
export const ROUTE_PATTERNS = {
  library: '/',
  folder: '/folders/:folderId',
  import: '/import',
  focus: '/videos/:videoId/focus',
  review: '/videos/:videoId/review',
  sessionNotes: '/session-notes',
  folderSessionNotes: '/folders/:folderId/session-notes',
} as const;

export const routes = {
  library: (): string => '/',
  folder: (folderId: string): string => `/folders/${encodeURIComponent(folderId)}`,
  import: (): string => '/import',
  focus: (videoId: string): string => `/videos/${encodeURIComponent(videoId)}/focus`,
  review: (videoId: string): string => `/videos/${encodeURIComponent(videoId)}/review`,
  /** Session notes of every folder, or of one folder when given. */
  sessionNotes: (folderId?: string): string =>
    folderId === undefined ? '/session-notes' : `/folders/${encodeURIComponent(folderId)}/session-notes`,
} as const;

/** Router state passed along when the focus screen is reached from the import flow. */
export interface FocusLocationState {
  fromImport: true;
}

export function isFocusLocationState(state: unknown): state is FocusLocationState {
  return typeof state === 'object' && state !== null && 'fromImport' in state && state.fromImport === true;
}
