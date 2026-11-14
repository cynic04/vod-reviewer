import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { getCharacter } from '@shared/domain/characters';
import type { Folder, Video } from '@shared/domain/schema';
import { formatDuration } from '@shared/domain/time';
import { videoMediaUrl } from '@shared/media';
import { routes } from '@renderer/app/routes';
import { Button, IconButton } from '@renderer/components/Button';
import { EmptyState } from '@renderer/components/EmptyState';
import { Icon } from '@renderer/components/Icon';
import { invoke } from '@renderer/lib/api';
import { formatFileSize } from '@renderer/lib/dates';
import { folderLabel } from '@renderer/features/characters/characters';
import { FolderArt } from '@renderer/features/characters/FolderArt';
import { useLibrary } from '@renderer/store/hooks';
import { useLibraryStore } from '@renderer/store/libraryStore';
import {
  selectAnnotationCounts,
  selectFolder,
  selectVideosInFolder,
  type AnnotationCounts,
} from '@renderer/store/selectors';
import { reportError } from '@renderer/store/toastStore';
import { ConfirmDialog, EditVideoDialog, FolderNameDialog } from './dialogs';
import { VideoDate } from './VideoDate';
import styles from './FolderPage.module.css';

const NO_ANNOTATIONS: AnnotationCounts = { notes: 0, timestamps: 0 };

type FolderDialog = { kind: 'rename' } | { kind: 'deleteFolder' } | { kind: 'edit' | 'remove'; video: Video };

/** The videos filed under one matchup or custom folder, newest first. */
export function FolderPage() {
  const { folderId } = useParams();
  const folder = selectFolder(useLibrary(), folderId);
  if (!folder) return <Navigate to={routes.library()} replace />;
  return <FolderContents folder={folder} />;
}

function FolderContents({ folder }: { folder: Folder }) {
  const library = useLibrary();
  const navigate = useNavigate();
  const renameFolder = useLibraryStore((state) => state.renameFolder);
  const removeFolder = useLibraryStore((state) => state.removeFolder);
  const removeVideo = useLibraryStore((state) => state.removeVideo);
  const [dialog, setDialog] = useState<FolderDialog | null>(null);

  const videos = useMemo(() => selectVideosInFolder(library, folder.id), [library, folder.id]);
  const counts = useMemo(() => selectAnnotationCounts(library), [library]);
  const character = getCharacter(folder.characterId);
  const closeDialog = (): void => setDialog(null);
  const addVideo = (): void => void navigate(`${routes.import()}?folder=${encodeURIComponent(folder.id)}`);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to={routes.library()} className={styles.back}>
          <Icon name="arrowLeft" size={16} /> All matchups
        </Link>
        <div className={styles.title}>
          <FolderArt folder={folder} className={styles.art} />
          <div className={styles.heading}>
            <h1>{folderLabel(folder)}</h1>
            <p>
              {character && <span className={styles.battleType}>{character.battleType}</span>}
              {videos.length === 1 ? '1 video' : `${videos.length} videos`}
            </p>
          </div>
          <div className={styles.actions}>
            {folder.kind === 'custom' && (
              <>
                <IconButton icon="edit" label="Rename folder" onClick={() => setDialog({ kind: 'rename' })} />
                <IconButton icon="trash" label="Delete folder" onClick={() => setDialog({ kind: 'deleteFolder' })} />
              </>
            )}
            <Button variant="primary" icon="plus" onClick={addVideo}>
              Add video
            </Button>
          </div>
        </div>
      </header>

      {videos.length === 0 ? (
        <EmptyState
          icon="film"
          title="No videos here yet"
          action={
            <Button variant="primary" icon="plus" onClick={addVideo}>
              Add a video
            </Button>
          }
        >
          {character
            ? `Add a recording of a set against ${character.name} to start studying the matchup.`
            : 'Add a recording to this folder to start reviewing it.'}
        </EmptyState>
      ) : (
        <ul className={styles.videos}>
          {videos.map((video) => (
            <li key={video.id}>
              <VideoRow
                video={video}
                counts={counts.get(video.id) ?? NO_ANNOTATIONS}
                onEdit={() => setDialog({ kind: 'edit', video })}
                onRemove={() => setDialog({ kind: 'remove', video })}
              />
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === 'rename' && (
        <FolderNameDialog
          title="Rename folder"
          initialName={folder.name}
          submitLabel="Rename"
          onSubmit={(name) => renameFolder(folder.id, name)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'deleteFolder' && (
        <ConfirmDialog
          title="Delete folder"
          message={`Delete "${folder.name}"? A folder can only be deleted once it is empty.`}
          confirmLabel="Delete folder"
          onConfirm={async () => {
            await removeFolder(folder.id);
            await navigate(routes.library());
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'edit' && <EditVideoDialog video={dialog.video} onClose={closeDialog} />}
      {dialog?.kind === 'remove' && (
        <ConfirmDialog
          title="Remove video"
          message={`Remove "${dialog.video.title}" from your library? Its notes and timestamps will be deleted. The video file itself stays on your disk.`}
          confirmLabel="Remove video"
          onConfirm={() => removeVideo(dialog.video.id)}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}

interface VideoRowProps {
  video: Video;
  counts: AnnotationCounts;
  onEdit: () => void;
  onRemove: () => void;
}

function VideoRow({ video, counts, onEdit, onRemove }: VideoRowProps) {
  // A media fragment makes the browser show that moment as the poster frame.
  const thumbnailTime = video.durationSeconds === null ? 1 : Math.min(5, video.durationSeconds / 2);

  return (
    <article className={styles.row}>
      <Link to={routes.review(video.id)} className={styles.thumbnail} tabIndex={-1} aria-hidden="true">
        <video src={`${videoMediaUrl(video.id)}#t=${thumbnailTime.toFixed(2)}`} preload="metadata" muted />
        {video.durationSeconds !== null && (
          <span className={styles.duration}>{formatDuration(video.durationSeconds)}</span>
        )}
      </Link>

      <div className={styles.details}>
        <h2>
          <Link to={routes.review(video.id)}>{video.title}</Link>
        </h2>
        <VideoDate recordedAt={video.recordedAt} className={styles.date} />
        <p className={styles.stats}>
          <span>
            <Icon name="note" size={14} /> {counts.notes === 1 ? '1 note' : `${counts.notes} notes`}
          </span>
          <span>
            <Icon name="flag" size={14} />{' '}
            {counts.timestamps === 1 ? '1 timestamp' : `${counts.timestamps} timestamps`}
          </span>
          <span>{formatFileSize(video.fileSizeBytes)}</span>
        </p>
      </div>

      <div className={styles.rowActions}>
        <Link to={routes.focus(video.id)} className={styles.iconLink} aria-label="Edit focus points" title="Edit focus points">
          <Icon name="flag" />
        </Link>
        <IconButton icon="edit" label="Rename or move" onClick={onEdit} />
        <IconButton
          icon="external"
          label="Show file in folder"
          onClick={() => void invoke('videos:showInFolder', { id: video.id }).catch(reportError)}
        />
        <IconButton icon="trash" label="Remove from library" onClick={onRemove} />
        <Link to={routes.review(video.id)} className={styles.review}>
          Review <Icon name="arrowRight" size={16} />
        </Link>
      </div>
    </article>
  );
}
