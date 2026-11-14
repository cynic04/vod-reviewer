import { cx } from '@renderer/lib/cx';
import styles from './Stepper.module.css';

/** The four stages a video goes through, from picking the file to reviewing it. */
export const WORKFLOW_STEPS = ['Pick a video', 'Choose matchup', 'Mark focus points', 'Review'] as const;

interface StepperProps {
  /** Zero-based index into {@link WORKFLOW_STEPS}. */
  current: number;
}

export function Stepper({ current }: StepperProps) {
  return (
    <ol className={styles.stepper} aria-label="Import progress">
      {WORKFLOW_STEPS.map((label, index) => {
        const state = index < current ? styles.done : index === current ? styles.current : undefined;
        return (
          <li
            key={label}
            className={cx(styles.step, state)}
            aria-current={index === current ? 'step' : undefined}
          >
            <span className={styles.number}>{index + 1}</span>
            <span className={styles.label}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
