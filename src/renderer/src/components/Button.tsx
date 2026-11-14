import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@renderer/lib/cx';
import { Icon, type IconName } from './Icon';
import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  icon?: IconName;
  trailingIcon?: IconName;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  trailingIcon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = cx(styles.button, styles[variant], styles[size], className);
  return (
    <button type={type} className={classes} {...rest}>
      {icon && <Icon name={icon} />}
      <span>{children}</span>
      {trailingIcon && <Icon name={trailingIcon} />}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Accessible name; also shown as the tooltip. */
  label: string;
  size?: number;
  active?: boolean;
}

export function IconButton({ icon, label, size, active = false, className, type = 'button', ...rest }: IconButtonProps) {
  const classes = cx(styles.iconButton, active && styles.active, className);
  return (
    <button type={type} className={classes} aria-label={label} title={label} {...rest}>
      <Icon name={icon} {...(size === undefined ? {} : { size })} />
    </button>
  );
}
