import { useId, useMemo, useState } from 'react';
import type { Folder } from '@shared/domain/schema';
import { cx } from '@renderer/lib/cx';
import { folderLabel } from '@renderer/features/characters/characters';
import { FolderArt } from '@renderer/features/characters/FolderArt';
import { useLibrary } from '@renderer/store/hooks';
import styles from './FolderPicker.module.css';

interface FolderPickerProps {
  value: string | null;
  onChange: (folderId: string) => void;
}

/** Chooses the folder a video lives in: a matchup, picked by portrait, or a custom folder. */
export function FolderPicker({ value, onChange }: FolderPickerProps) {
  const { folders } = useLibrary();
  const [query, setQuery] = useState('');
  const searchId = useId();

  const { matchups, custom } = useMemo(() => {
    const wanted = query.trim().toLowerCase();
    const visible = folders.filter((folder) => folder.name.toLowerCase().includes(wanted));
    return {
      matchups: visible.filter((folder) => folder.kind === 'matchup'),
      custom: visible.filter((folder) => folder.kind === 'custom'),
    };
  }, [folders, query]);

  return (
    <div className={styles.picker}>
      <label htmlFor={searchId} className="visually-hidden">
        Filter folders
      </label>
      <input
        id={searchId}
        type="search"
        value={query}
        placeholder="Filter by character or folder name"
        onChange={(event) => setQuery(event.target.value)}
      />

      <div role="radiogroup" aria-label="Folder" className={styles.groups}>
        {matchups.length > 0 && (
          <div className={styles.matchups}>
            {matchups.map((folder) => (
              <FolderOption key={folder.id} folder={folder} selected={folder.id === value} onSelect={onChange} />
            ))}
          </div>
        )}

        {custom.length > 0 && (
          <div className={styles.custom}>
            <h3>Your folders</h3>
            <div className={styles.customList}>
              {custom.map((folder) => (
                <FolderOption key={folder.id} folder={folder} selected={folder.id === value} onSelect={onChange} />
              ))}
            </div>
          </div>
        )}

        {matchups.length === 0 && custom.length === 0 && (
          <p className={styles.noMatch}>Nothing matches &ldquo;{query.trim()}&rdquo;.</p>
        )}
      </div>
    </div>
  );
}

interface FolderOptionProps {
  folder: Folder;
  selected: boolean;
  onSelect: (folderId: string) => void;
}

function FolderOption({ folder, selected, onSelect }: FolderOptionProps) {
  const isMatchup = folder.kind === 'matchup';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={folderLabel(folder)}
      className={cx(isMatchup ? styles.matchup : styles.customOption, selected && styles.selected)}
      onClick={() => onSelect(folder.id)}
    >
      {isMatchup && <FolderArt folder={folder} />}
      <span className={styles.name}>{folder.name}</span>
    </button>
  );
}
