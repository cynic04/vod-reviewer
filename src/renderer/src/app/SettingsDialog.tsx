import { useState } from 'react';
import { DEFAULT_STALE_AFTER_DAYS, THEME_PREFERENCES } from '@shared/domain/constants';
import type { ThemePreference } from '@shared/domain/schema';
import { Button } from '@renderer/components/Button';
import { Dialog } from '@renderer/components/Dialog';
import { useLibrary } from '@renderer/store/hooks';
import { useLibraryStore } from '@renderer/store/libraryStore';
import { reportError } from '@renderer/store/toastStore';
import styles from './SettingsDialog.module.css';

const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'Match system',
  light: 'Light',
  dark: 'Dark',
};

interface SettingsDialogProps {
  onClose: () => void;
}

/** Appearance, the "old video" threshold, and where the import browser looks for videos. */
export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const { settings } = useLibrary();
  const updateSettings = useLibraryStore((state) => state.updateSettings);
  const chooseVideosRoot = useLibraryStore((state) => state.chooseVideosRoot);
  const [staleDraft, setStaleDraft] = useState(String(settings.staleAfterDays));

  const commitStaleAfterDays = (): void => {
    const days = Math.round(Number(staleDraft));
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      setStaleDraft(String(settings.staleAfterDays));
      return;
    }
    setStaleDraft(String(days));
    if (days !== settings.staleAfterDays) void updateSettings({ staleAfterDays: days }).catch(reportError);
  };

  return (
    <Dialog title="Settings" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      <div className={styles.settings}>
        <fieldset>
          <legend>Theme</legend>
          <div className={styles.segmented}>
            {THEME_PREFERENCES.map((theme) => (
              <label key={theme}>
                <input
                  type="radio"
                  name="theme"
                  value={theme}
                  checked={settings.theme === theme}
                  onChange={() => void updateSettings({ theme }).catch(reportError)}
                />
                <span>{THEME_LABELS[theme]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={styles.field}>
          <label htmlFor="stale-after-days">Highlight videos older than</label>
          <div className={styles.inline}>
            <input
              id="stale-after-days"
              type="number"
              min={1}
              max={3650}
              value={staleDraft}
              onChange={(event) => setStaleDraft(event.target.value)}
              onBlur={commitStaleAfterDays}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
            <span>days</span>
          </div>
          <p>Old footage is highlighted so you know it may not reflect how you play now. Default: {DEFAULT_STALE_AFTER_DAYS}.</p>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Videos folder</span>
          <div className={styles.inline}>
            <code title={settings.videosRoot ?? undefined}>{settings.videosRoot ?? 'Your system Videos folder'}</code>
            <Button icon="folderOpen" onClick={() => void chooseVideosRoot().catch(reportError)}>
              Change
            </Button>
          </div>
          <p>Where &ldquo;Add video&rdquo; looks for recordings. Videos already in your library are not affected.</p>
        </div>
      </div>
    </Dialog>
  );
}
