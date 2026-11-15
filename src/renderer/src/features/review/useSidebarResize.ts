import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import {
  clampSidebarWidth,
  maxSidebarWidth,
  readStoredSidebarWidth,
  SIDEBAR_KEY_STEP,
  SIDEBAR_MIN_WIDTH,
  storeSidebarWidth,
} from './sidebarWidth';

interface SidebarResize {
  bodyRef: RefObject<HTMLDivElement | null>;
  sidebarRef: RefObject<HTMLElement | null>;
  /** The chosen width, or `null` while the default is in use. */
  width: number | null;
  dragging: boolean;
  /** Spread onto the divider element. */
  separatorProps: {
    role: 'separator';
    tabIndex: 0;
    'aria-orientation': 'vertical';
    'aria-valuemin': number;
    'aria-valuemax': number;
    'aria-valuenow': number;
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLElement>) => void;
    onLostPointerCapture: () => void;
    onDoubleClick: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  };
}

/**
 * Lets the divider between the player and the side panel be dragged, or moved with the
 * arrow keys. The chosen width is remembered on this computer; double-click returns to
 * the default.
 */
export function useSidebarResize(): SidebarResize {
  const bodyRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState<number | null>(readStoredSidebarWidth);
  const [dragging, setDragging] = useState(false);
  const [measured, setMeasured] = useState({ body: 0, sidebar: SIDEBAR_MIN_WIDTH });

  useEffect(() => {
    const body = bodyRef.current;
    const sidebar = sidebarRef.current;
    if (!body || !sidebar) return;
    const observer = new ResizeObserver(() => {
      setMeasured({ body: body.clientWidth, sidebar: sidebar.offsetWidth });
    });
    observer.observe(body);
    observer.observe(sidebar);
    return () => observer.disconnect();
  }, []);

  const resizeTo = useCallback((requested: number, remember: boolean): void => {
    const body = bodyRef.current;
    if (!body) return;
    const next = clampSidebarWidth(requested, body.clientWidth);
    setWidth(next);
    if (remember) storeSidebarWidth(next);
  }, []);

  const widthUnderPointer = (event: PointerEvent<HTMLElement>): number =>
    (bodyRef.current?.getBoundingClientRect().right ?? 0) - event.clientX;

  return {
    bodyRef,
    sidebarRef,
    width,
    dragging,
    separatorProps: {
      role: 'separator',
      tabIndex: 0,
      'aria-orientation': 'vertical',
      'aria-valuemin': SIDEBAR_MIN_WIDTH,
      'aria-valuemax': maxSidebarWidth(measured.body),
      'aria-valuenow': measured.sidebar,
      onPointerDown: (event) => {
        if (event.button !== 0) return;
        // Keeps the drag from selecting text, and from being lost over the video.
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus();
        setDragging(true);
      },
      onPointerMove: (event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        resizeTo(widthUnderPointer(event), false);
      },
      onPointerUp: (event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        resizeTo(widthUnderPointer(event), true);
      },
      onLostPointerCapture: () => setDragging(false),
      onDoubleClick: () => {
        setWidth(null);
        storeSidebarWidth(null);
      },
      onKeyDown: (event) => {
        const current = sidebarRef.current?.offsetWidth ?? SIDEBAR_MIN_WIDTH;
        const targets: Record<string, number> = {
          ArrowLeft: current + SIDEBAR_KEY_STEP,
          ArrowRight: current - SIDEBAR_KEY_STEP,
          Home: SIDEBAR_MIN_WIDTH,
          End: Number.POSITIVE_INFINITY,
        };
        const target = targets[event.key];
        if (target === undefined) return;
        // The arrow keys also seek the video; here they belong to the divider.
        event.preventDefault();
        event.stopPropagation();
        resizeTo(target, true);
      },
    },
  };
}
