/** Narrowest the side panel can be dragged. */
export const SIDEBAR_MIN_WIDTH = 320;
/** Room the player always keeps, so its controls stay usable. */
export const PLAYER_MIN_WIDTH = 640;
/** How far one arrow key press moves the divider. */
export const SIDEBAR_KEY_STEP = 24;

const STORAGE_KEY = 'vod-reviewer:sidebar-width';

export function maxSidebarWidth(bodyWidth: number): number {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.floor(bodyWidth - PLAYER_MIN_WIDTH));
}

export function clampSidebarWidth(width: number, bodyWidth: number): number {
  return Math.round(Math.min(maxSidebarWidth(bodyWidth), Math.max(SIDEBAR_MIN_WIDTH, width)));
}

/** The width the user last chose, or `null` to use the default that follows the window. */
export function readStoredSidebarWidth(): number | null {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored >= SIDEBAR_MIN_WIDTH ? stored : null;
  } catch {
    return null;
  }
}

export function storeSidebarWidth(width: number | null): void {
  try {
    if (width === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // Without storage the width still applies until the app is closed.
  }
}
