import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCharacter } from '@shared/domain/characters';
import { routes } from '@renderer/app/routes';
import { Button } from '@renderer/components/Button';
import { Icon } from '@renderer/components/Icon';
import { cx } from '@renderer/lib/cx';
import { FolderArt } from '@renderer/features/characters/FolderArt';
import { useLibrary } from '@renderer/store/hooks';
import { useLibraryStore } from '@renderer/store/libraryStore';
import { selectFolderSummaries, type FolderSummary } from '@renderer/store/selectors';
import { FolderNameDialog } from './dialogs';
import { VideoDate } from './VideoDate';
import styles from './LibraryPage.module.css';

/** Home screen: asks for a first video, then shows every matchup and custom folder. */
export function LibraryPage() {
  const library = useLibrary();
  const navigate = useNavigate();
  const createFolder = useLibraryStore((state) => state.createFolder);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const summaries = useMemo(() => selectFolderSummaries(library), [library]);
  const matchups = summaries.filter((summary) => summary.folder.kind === 'matchup');
  const custom = summaries.filter((summary) => summary.folder.kind === 'custom');
  const isEmpty = library.videos.length === 0;

  return (
    <div className={styles.page}>
      {isEmpty && (
        <section className={styles.hero} aria-labelledby="hero-title">
          <p className={styles.kicker}>Heaven or hell</p>
          <h1 id="hero-title">
            Let&rsquo;s <em>review</em>
          </h1>
          <p className={styles.lead}>
            Add a recording from your Videos folder, file it under the matchup you played, mark the moments that
            matter, then break them down frame by frame.
          </p>
          <Button variant="primary" size="lg" icon="plus" onClick={() => void navigate(routes.import())}>
            Add your first video
          </Button>
        </section>
      )}

      <section aria-labelledby="matchups-title">
        <div className={styles.sectionHeader}>
          <h2 id="matchups-title">Matchups</h2>
          <p>{library.videos.length === 1 ? '1 video' : `${library.videos.length} videos`} in your library</p>
          <Button icon="notebook" onClick={() => void navigate(routes.sessionNotes())}>
            Session notes
          </Button>
        </div>
        <ul className={styles.matchups}>
          {matchups.map((summary) => (
            <li key={summary.folder.id}>
              <MatchupCard summary={summary} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="folders-title">
        <div className={styles.sectionHeader}>
          <h2 id="folders-title">Your folders</h2>
          <p>For anything that is not a single matchup: tournaments, tech, sets to study.</p>
          <Button icon="plus" onClick={() => setIsCreatingFolder(true)}>
            New folder
          </Button>
        </div>
        {custom.length === 0 ? (
          <p className={styles.noFolders}>No custom folders yet.</p>
        ) : (
          <ul className={styles.folders}>
            {custom.map(({ folder, videoCount }) => (
              <li key={folder.id}>
                <Link to={routes.folder(folder.id)} className={styles.folderCard}>
                  <Icon name="folder" size={22} />
                  <span className={styles.folderName}>{folder.name}</span>
                  <span className={styles.count}>{videoCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isCreatingFolder && (
        <FolderNameDialog
          title="New folder"
          submitLabel="Create folder"
          onSubmit={createFolder}
          onClose={() => setIsCreatingFolder(false)}
        />
      )}
    </div>
  );
}

function MatchupCard({ summary }: { summary: FolderSummary }) {
  const { folder, videoCount, latestRecordedAt } = summary;
  const character = getCharacter(folder.characterId);

  return (
    <Link
      to={routes.folder(folder.id)}
      className={cx(styles.matchupCard, videoCount === 0 && styles.unused)}
      aria-label={`vs. ${folder.name}, ${videoCount === 1 ? '1 video' : `${videoCount} videos`}`}
    >
      <FolderArt folder={folder} className={styles.portrait} />
      {videoCount > 0 && <span className={styles.countBadge}>{videoCount}</span>}
      <span className={styles.caption}>
        <span className={styles.versus}>vs</span>
        <span className={styles.characterName}>{folder.name}</span>
        <span className={styles.meta}>
          {latestRecordedAt ? <VideoDate recordedAt={latestRecordedAt} /> : (character?.battleType ?? '')}
        </span>
      </span>
    </Link>
  );
}
