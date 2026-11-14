import { useState, type SyntheticEvent } from 'react';
import type { Video } from '@shared/domain/schema';
import { Button } from '@renderer/components/Button';
import { Dialog } from '@renderer/components/Dialog';
import { errorMessage } from '@renderer/lib/api';
import { useLibraryStore } from '@renderer/store/libraryStore';
import { FolderPicker } from './FolderPicker';
import styles from './dialogs.module.css';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  /** Rejections are shown inside the dialog, which then stays open. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose }: ConfirmDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const confirm = (): void => {
    setIsBusy(true);
    onConfirm()
      .then(onClose)
      .catch((reason: unknown) => {
        setError(errorMessage(reason));
        setIsBusy(false);
      });
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={isBusy} onClick={confirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{message}</p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

interface FolderNameDialogProps {
  title: string;
  initialName?: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}

/** Asks for a folder name; used both to create and to rename custom folders. */
export function FolderNameDialog({ title, initialName = '', submitLabel, onSubmit, onClose }: FolderNameDialogProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const formId = 'folder-name-form';

  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    onSubmit(name.trim())
      .then(onClose)
      .catch((reason: unknown) => setError(errorMessage(reason)));
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={name.trim() === ''}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={submit}>
        <label htmlFor="folder-name">Folder name</label>
        <input
          id="folder-name"
          type="text"
          value={name}
          maxLength={80}
          data-autofocus
          placeholder="e.g. Tournament sets"
          onChange={(event) => setName(event.target.value)}
        />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

interface EditVideoDialogProps {
  video: Video;
  onClose: () => void;
}

/** Renames a video and moves it between folders. */
export function EditVideoDialog({ video, onClose }: EditVideoDialogProps) {
  const updateVideo = useLibraryStore((state) => state.updateVideo);
  const [title, setTitle] = useState(video.title);
  const [folderId, setFolderId] = useState(video.folderId);
  const [error, setError] = useState<string | null>(null);
  const formId = 'edit-video-form';

  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    updateVideo(video.id, { title: title.trim(), folderId })
      .then(onClose)
      .catch((reason: unknown) => setError(errorMessage(reason)));
  };

  return (
    <Dialog
      title="Edit video"
      width="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={title.trim() === ''}>
            Save
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={submit}>
        <label htmlFor="video-title">Title</label>
        <input
          id="video-title"
          type="text"
          value={title}
          maxLength={160}
          data-autofocus
          onChange={(event) => setTitle(event.target.value)}
        />
        <p className={styles.path} title={video.filePath}>
          {video.filePath}
        </p>

        <span className={styles.legend}>Folder</span>
        <FolderPicker value={folderId} onChange={setFolderId} />

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
