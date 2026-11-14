import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cx } from '@renderer/lib/cx';
import { IconButton } from './Button';
import styles from './Dialog.module.css';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Action buttons, right-aligned under the content. */
  footer?: ReactNode;
  width?: 'md' | 'lg';
}

/**
 * Modal dialog on top of the native `<dialog>` element, which provides the focus trap,
 * Escape handling and inert background for free. Render it only while it should be open.
 * Put `data-autofocus` on the element that should receive focus when it opens.
 */
export function Dialog({ title, onClose, children, footer, width = 'md' }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    // `showModal` focuses the first focusable element (the close button); move focus to
    // the field the dialog is about when it marks one.
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={cx(styles.dialog, styles[width])}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click that lands on the dialog element itself is a click on the backdrop.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.panel}>
        <header className={styles.header}>
          <h2 id={titleId}>{title}</h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </dialog>
  );
}
