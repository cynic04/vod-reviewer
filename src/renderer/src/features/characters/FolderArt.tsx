import type { Folder } from '@shared/domain/schema';
import { Icon } from '@renderer/components/Icon';
import { cx } from '@renderer/lib/cx';
import { portraitUrl } from './characters';
import styles from './FolderArt.module.css';

interface FolderArtProps {
  folder: Folder;
  className?: string | undefined;
}

/**
 * The picture that stands for a folder: the character portrait for a matchup, a folder
 * glyph otherwise. Decorative - always pair it with the folder's name in text.
 */
export function FolderArt({ folder, className }: FolderArtProps) {
  const url = portraitUrl(folder.characterId);
  return (
    <span className={cx(styles.art, className)}>
      {url ? (
        <img src={url} alt="" loading="lazy" draggable={false} />
      ) : (
        <Icon name="folder" size={28} />
      )}
    </span>
  );
}
