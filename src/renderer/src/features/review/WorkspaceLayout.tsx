import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Folder, Video } from '@shared/domain/schema';
import { routes } from '@renderer/app/routes';
import { Icon } from '@renderer/components/Icon';
import { folderLabel } from '@renderer/features/characters/characters';
import { FolderArt } from '@renderer/features/characters/FolderArt';
import { VideoDate } from '@renderer/features/library/VideoDate';
import styles from './WorkspaceLayout.module.css';

interface WorkspaceLayoutProps {
  video: Video;
  folder: Folder | undefined;
  /** Shown above the header, e.g. the import stepper. */
  banner?: ReactNode;
  /** Buttons on the right of the header. */
  actions?: ReactNode;
  /** The player. */
  children: ReactNode;
  sidebar: ReactNode;
}

/** Shared frame of the focus and review screens: video heading, player, and a side panel. */
export function WorkspaceLayout({ video, folder, banner, actions, children, sidebar }: WorkspaceLayoutProps) {
  return (
    <div className={styles.workspace}>
      {banner && <div className={styles.banner}>{banner}</div>}

      <header className={styles.header}>
        {folder && (
          <Link to={routes.folder(folder.id)} className={styles.back} aria-label={`Back to ${folderLabel(folder)}`}>
            <Icon name="arrowLeft" />
            <FolderArt folder={folder} className={styles.art} />
          </Link>
        )}
        <div className={styles.heading}>
          <h1 title={video.title}>{video.title}</h1>
          <p>
            {folder && <span className={styles.matchup}>{folderLabel(folder)}</span>}
            <VideoDate recordedAt={video.recordedAt} />
          </p>
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>

      <div className={styles.body}>
        {children}
        <aside className={styles.sidebar}>{sidebar}</aside>
      </div>
    </div>
  );
}
