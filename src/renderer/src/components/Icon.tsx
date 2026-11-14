import type { SVGProps } from 'react';

/** 24x24 stroke icons, drawn inline so the app ships no icon font or network request. */
const ICON_PATHS = {
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z',
  frameBack: 'M17 5v14l-9-7zM6 5v14',
  frameForward: 'M7 5v14l9-7zM18 5v14',
  rewind: 'M12 6v12l-8-6zM21 6v12l-8-6z',
  forward: 'M12 6v12l8-6zM3 6v12l8-6z',
  zoomIn: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 20 20M10.5 8v5M8 10.5h5',
  zoomOut: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 20 20M8 10.5h5',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  volume: 'M4 9.5v5h3.5L12 18V6L7.5 9.5zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  muted: 'M4 9.5v5h3.5L12 18V6L7.5 9.5zM16 9.5l5 5M21 9.5l-5 5',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7M10 10.5v6M14 10.5v6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  folder: 'M3 6.5h6l2 2.5h10v10.5H3z',
  folderOpen: 'M3 19.5v-13h6l2 2.5h9V12M3 19.5 6 12h16l-3 7.5z',
  film: 'M4 4.5h16v15H4zM8 4.5v15M16 4.5v15M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4',
  flag: 'M6 21V4M6 4.5h12l-2.5 4 2.5 4H6',
  note: 'M5 4h14v11l-5 5H5zM14 20v-5h5M8.5 9h7M8.5 12.5h4',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3 7 7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 4.5v5M8 14.5v5',
  arrowLeft: 'M11 5l-7 7 7 7M4 12h16',
  arrowRight: 'M13 5l7 7-7 7M20 12H4',
  arrowUp: 'M5 11l7-7 7 7M12 4v16',
  check: 'M4.5 12.5l5 5 10-11',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
} as const;

export type IconName = keyof typeof ICON_PATHS;

const FILLED_ICONS: ReadonlySet<IconName> = new Set(['play', 'pause', 'rewind', 'forward']);

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

/** Decorative by default; give the surrounding control an accessible name. */
export function Icon({ name, size = 18, ...rest }: IconProps) {
  const filled = FILLED_ICONS.has(name);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
