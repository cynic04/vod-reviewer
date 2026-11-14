import { cx } from '@renderer/lib/cx';
import { useToastStore } from '@renderer/store/toastStore';
import { IconButton } from './Button';
import styles from './Toaster.module.css';

/** Renders transient messages, most importantly errors from actions that were refused. */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div className={styles.region} role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={cx(styles.toast, styles[toast.kind])} role="status">
          <p>{toast.message}</p>
          <IconButton icon="close" label="Dismiss" size={14} onClick={() => dismiss(toast.id)} />
        </div>
      ))}
    </div>
  );
}
