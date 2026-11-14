import { Icon } from '@renderer/components/Icon';
import { PLAYER_SHORTCUTS } from '@renderer/features/player/usePlayerShortcuts';
import styles from './ShortcutHelp.module.css';

interface ShortcutHelpProps {
  /** Screen-specific shortcuts, listed after the player's own. */
  extra?: readonly { keys: string; action: string }[];
}

/** A disclosure listing the keyboard shortcuts available on the current screen. */
export function ShortcutHelp({ extra = [] }: ShortcutHelpProps) {
  return (
    <details className={styles.help}>
      <summary>
        <Icon name="keyboard" size={16} /> Shortcuts
      </summary>
      <dl className={styles.list}>
        {[...PLAYER_SHORTCUTS, ...extra].map((shortcut) => (
          <div key={shortcut.keys}>
            <dt>
              <kbd>{shortcut.keys}</kbd>
            </dt>
            <dd>{shortcut.action}</dd>
          </div>
        ))}
        <div>
          <dt>
            <kbd>Scroll</kbd>
          </dt>
          <dd>Zoom towards the cursor</dd>
        </div>
      </dl>
    </details>
  );
}
