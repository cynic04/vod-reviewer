type ClassValue = string | false | null | undefined;

/** Joins class names, skipping falsy ones: `cx(styles.row, isActive && styles.active)`. */
export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
