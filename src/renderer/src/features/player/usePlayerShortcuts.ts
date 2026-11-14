import { useEffect } from 'react';
import type { Player } from './usePlayer';
import type { ZoomPan } from './useZoomPan';

/** Shortcuts shown in the help popover, in display order. Keep in sync with the handler below. */
export const PLAYER_SHORTCUTS: readonly { keys: string; action: string }[] = [
  { keys: 'Space', action: 'Play / pause' },
  { keys: ', / .', action: 'Previous / next frame' },
  { keys: 'Shift + , / .', action: 'Back / forward 10 frames' },
  { keys: 'Left / Right', action: 'Back / forward 1 second' },
  { keys: 'Shift + Left / Right', action: 'Back / forward 5 seconds' },
  { keys: '[ / ]', action: 'Slower / faster' },
  { keys: '+ / -', action: 'Zoom in / out' },
  { keys: '0', action: 'Reset zoom' },
];

export type ShortcutMap = Readonly<Record<string, () => void>>;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Space belongs to a focused button or link: it activates that control. */
function ownsSpaceKey(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, a, summary') !== null;
}

/**
 * Global keyboard shortcuts for the player. Ignored while typing and while a dialog is
 * open. `extra` adds screen-specific shortcuts, keyed by lower-cased `KeyboardEvent.key`.
 */
export function usePlayerShortcuts(player: Player, zoom: ZoomPan, extra?: ShortcutMap): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target) || document.querySelector('dialog[open]')) return;

      const key = event.key.toLowerCase();
      if (key === ' ' && ownsSpaceKey(event.target)) return;
      const handlers: Record<string, () => void> = {
        ' ': player.togglePlay,
        k: player.togglePlay,
        ',': () => player.stepFrames(-1),
        '.': () => player.stepFrames(1),
        '<': () => player.stepFrames(-10),
        '>': () => player.stepFrames(10),
        arrowleft: () => player.seekBy(event.shiftKey ? -5 : -1),
        arrowright: () => player.seekBy(event.shiftKey ? 5 : 1),
        '[': () => player.cyclePlaybackRate(-1),
        ']': () => player.cyclePlaybackRate(1),
        '+': zoom.zoomIn,
        '=': zoom.zoomIn,
        '-': zoom.zoomOut,
        '0': zoom.reset,
        ...extra,
      };

      const handler = handlers[key];
      if (!handler) return;
      event.preventDefault();
      handler();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [player, zoom, extra]);
}
