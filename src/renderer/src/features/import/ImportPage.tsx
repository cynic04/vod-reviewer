import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { VideoFileEntry } from '@shared/ipc/contract';
import { previewMediaUrl } from '@shared/media';
import { routes, type FocusLocationState } from '@renderer/app/routes';
import { Button } from '@renderer/components/Button';
import { EmptyState } from '@renderer/components/EmptyState';
import { Icon } from '@renderer/components/Icon';
import { Stepper } from '@renderer/components/Stepper';
import { cx } from '@renderer/lib/cx';
import { formatFileSize } from '@renderer/lib/dates';
import { folderLabel } from '@renderer/features/characters/characters';
import { FolderPicker } from '@renderer/features/library/FolderPicker';
import { VideoDate } from '@renderer/features/library/VideoDate';
import { useLibrary } from '@renderer/store/hooks';
import { useLibraryStore } from '@renderer/store/libraryStore';
import { selectFolder } from '@renderer/store/selectors';
import { reportError } from '@renderer/store/toastStore';
import { useDirectoryListing } from './useDirectoryListing';
import styles from './ImportPage.module.css';

/**
 * Steps one and two of the workflow: pick a recording from the videos folder, then
 * choose the folder it belongs in. Importing hands over to the focus screen.
 */
export function ImportPage() {
  const library = useLibrary();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const importVideo = useLibraryStore((state) => state.importVideo);

  const [file, setFile] = useState<VideoFileEntry | null>(null);
  // Kept here rather than in the browser so that "Back" returns to the same directory.
  const [directory, setDirectory] = useState<string | null>(null);
  const [step, setStep] = useState<0 | 1>(0);
  const [folderId, setFolderId] = useState<string | null>(
    () => selectFolder(library, searchParams.get('folder') ?? undefined)?.id ?? null,
  );
  const [isImporting, setIsImporting] = useState(false);

  const folder = selectFolder(library, folderId ?? undefined);

  const addToLibrary = (): void => {
    if (!file || !folder) return;
    setIsImporting(true);
    importVideo({ filePath: file.path, folderId: folder.id })
      .then((video) => {
        const state: FocusLocationState = { fromImport: true };
        return navigate(routes.focus(video.id), { state });
      })
      .catch((error: unknown) => {
        reportError(error);
        setIsImporting(false);
      });
  };

  return (
    <div className={styles.page}>
      <Stepper current={step} />

      {step === 0 ? (
        <VideoBrowser
          directory={directory}
          onDirectoryChange={setDirectory}
          selected={file}
          onSelect={setFile}
          onContinue={() => setStep(1)}
        />
      ) : (
        <section className={styles.matchupStep} aria-labelledby="matchup-title">
          <header className={styles.stepHeader}>
            <div>
              <h1 id="matchup-title">Which matchup is this?</h1>
              <p>
                Filing <strong>{file?.name}</strong> - pick the character you played against, or one of your own
                folders.
              </p>
            </div>
          </header>

          <div className={styles.pickerScroll}>
            <FolderPicker value={folderId} onChange={setFolderId} />
          </div>

          <footer className={styles.stepFooter}>
            <Button variant="ghost" icon="arrowLeft" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button
              variant="primary"
              size="lg"
              trailingIcon="arrowRight"
              disabled={!folder || isImporting}
              onClick={addToLibrary}
            >
              {folder ? `Add to ${folderLabel(folder)}` : 'Choose a folder'}
            </Button>
          </footer>
        </section>
      )}
    </div>
  );
}

interface VideoBrowserProps {
  /** Directory being shown; `null` is the root of the videos folder. */
  directory: string | null;
  onDirectoryChange: (directory: string | null) => void;
  selected: VideoFileEntry | null;
  onSelect: (file: VideoFileEntry | null) => void;
  onContinue: () => void;
}

function VideoBrowser({ directory, onDirectoryChange, selected, onSelect, onContinue }: VideoBrowserProps) {
  const navigate = useNavigate();
  const chooseVideosRoot = useLibraryStore((state) => state.chooseVideosRoot);
  const [revision, setRevision] = useState(0);
  const state = useDirectoryListing(directory, revision);

  const open = (path: string | null): void => {
    onSelect(null);
    onDirectoryChange(path);
  };

  const changeRoot = (): void => {
    chooseVideosRoot()
      .then((changed) => {
        if (!changed) return;
        open(null);
        setRevision((current) => current + 1);
      })
      .catch(reportError);
  };

  return (
    <section className={styles.browserStep} aria-labelledby="browser-title">
      <header className={styles.stepHeader}>
        <div>
          <h1 id="browser-title">Pick a video</h1>
          <p className={styles.path} title={state.status === 'ready' ? state.listing.path : undefined}>
            {state.status === 'ready' ? state.listing.path : 'Reading your videos folder...'}
          </p>
        </div>
        <Button icon="folderOpen" onClick={changeRoot}>
          Change folder
        </Button>
      </header>

      <div className={styles.browser}>
        <div className={styles.listing}>
          {state.status === 'error' && (
            <EmptyState icon="folder" title="Could not open that folder">
              {state.message}
            </EmptyState>
          )}

          {state.status === 'ready' && (
            <>
              {state.listing.parent !== null && (
                <button type="button" className={styles.entry} onClick={() => open(state.listing.parent)}>
                  <Icon name="arrowUp" />
                  <span className={styles.entryName}>Up one level</span>
                </button>
              )}
              {state.listing.directories.map((entry) => (
                <button key={entry.path} type="button" className={styles.entry} onClick={() => open(entry.path)}>
                  <Icon name="folder" />
                  <span className={styles.entryName}>{entry.name}</span>
                </button>
              ))}
              {state.listing.videos.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  className={cx(styles.entry, styles.videoEntry, entry.path === selected?.path && styles.selected)}
                  aria-pressed={entry.path === selected?.path}
                  onClick={() => onSelect(entry)}
                  onDoubleClick={() => {
                    if (entry.importedVideoId === null) onContinue();
                  }}
                >
                  <Icon name="film" />
                  <span className={styles.entryName}>{entry.name}</span>
                  {entry.importedVideoId !== null && <span className={styles.imported}>In library</span>}
                  <VideoDate recordedAt={entry.modifiedAt} className={styles.entryDate} />
                  <span className={styles.entrySize}>{formatFileSize(entry.sizeBytes)}</span>
                </button>
              ))}
              {state.listing.directories.length === 0 && state.listing.videos.length === 0 && (
                <EmptyState icon="film" title="No videos in this folder">
                  Supported formats are MP4, MKV, MOV and WebM. Use &ldquo;Change folder&rdquo; if your recordings
                  are saved somewhere else.
                </EmptyState>
              )}
            </>
          )}
        </div>

        <aside className={styles.preview} aria-label="Preview">
          {selected ? (
            <>
              {/* Keyed so the element is replaced, not re-sourced, when another file is picked. */}
              <video key={selected.path} src={previewMediaUrl(selected.path)} controls muted preload="metadata" />
              <h2 title={selected.name}>{selected.name}</h2>
              <p>
                <VideoDate recordedAt={selected.modifiedAt} /> &middot; {formatFileSize(selected.sizeBytes)}
              </p>
              {selected.importedVideoId === null ? (
                <Button variant="primary" size="lg" trailingIcon="arrowRight" onClick={onContinue}>
                  Use this video
                </Button>
              ) : (
                <>
                  <p className={styles.alreadyImported}>This video is already in your library.</p>
                  <Button
                    variant="primary"
                    size="lg"
                    trailingIcon="arrowRight"
                    onClick={() => void navigate(routes.review(selected.importedVideoId ?? ''))}
                  >
                    Open review
                  </Button>
                </>
              )}
            </>
          ) : (
            <EmptyState icon="film" title="Nothing selected">
              Choose a recording on the left to preview it.
            </EmptyState>
          )}
        </aside>
      </div>
    </section>
  );
}
