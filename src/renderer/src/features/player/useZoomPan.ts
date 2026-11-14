import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type RefCallback } from 'react';
import {
  IDENTITY_VIEW,
  STAGE_CENTER,
  ZOOM_STEP,
  isZoomed,
  panBy,
  zoomAt,
  type StagePoint,
  type ZoomView,
} from './zoom';

/** Pointer travel, in pixels, below which a press counts as a click rather than a drag. */
const CLICK_TOLERANCE_PX = 4;
const WHEEL_SENSITIVITY = 0.0015;

interface Drag {
  pointerId: number;
  lastX: number;
  lastY: number;
  travelled: number;
}

export interface ZoomPan {
  view: ZoomView;
  isPanning: boolean;
  /** Attach to the element that clips the zoomed content. */
  attachViewport: RefCallback<HTMLElement>;
  pointerHandlers: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  };
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

/**
 * Wheel-to-zoom (towards the cursor) and drag-to-pan for a viewport element.
 * A press that does not move is reported through `onClick`, so the same surface can
 * still be clicked to play or pause.
 */
export function useZoomPan(onClick?: () => void): ZoomPan {
  const [view, setView] = useState<ZoomView>(IDENTITY_VIEW);
  const [isPanning, setIsPanning] = useState(false);
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    if (!viewport) return;

    // Registered natively because React's wheel listeners are passive and cannot
    // stop the page from scrolling.
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const bounds = viewport.getBoundingClientRect();
      const point: StagePoint = {
        x: (event.clientX - bounds.left) / bounds.width,
        y: (event.clientY - bounds.top) / bounds.height,
      };
      setView((current) => zoomAt(current, Math.exp(-event.deltaY * WHEEL_SENSITIVITY), point));
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [viewport]);

  const endDrag = useCallback((event: PointerEvent<HTMLElement>): Drag | null => {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) return null;
    drag.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    return current;
  }, []);

  const pointerHandlers = useMemo<ZoomPan['pointerHandlers']>(
    () => ({
      onPointerDown: (event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY, travelled: 0 };
      },
      onPointerMove: (event) => {
        const current = drag.current;
        if (current?.pointerId !== event.pointerId) return;

        const deltaX = event.clientX - current.lastX;
        const deltaY = event.clientY - current.lastY;
        current.lastX = event.clientX;
        current.lastY = event.clientY;
        current.travelled += Math.abs(deltaX) + Math.abs(deltaY);
        if (current.travelled <= CLICK_TOLERANCE_PX) return;

        const bounds = event.currentTarget.getBoundingClientRect();
        setIsPanning(true);
        setView((view) => panBy(view, deltaX / bounds.width, deltaY / bounds.height));
      },
      onPointerUp: (event) => {
        const finished = endDrag(event);
        if (finished && finished.travelled <= CLICK_TOLERANCE_PX) onClick?.();
      },
      onPointerCancel: (event) => {
        endDrag(event);
      },
    }),
    [endDrag, onClick],
  );

  const zoomIn = useCallback(() => setView((current) => zoomAt(current, ZOOM_STEP, STAGE_CENTER)), []);
  const zoomOut = useCallback(() => setView((current) => zoomAt(current, 1 / ZOOM_STEP, STAGE_CENTER)), []);
  const reset = useCallback(() => setView(IDENTITY_VIEW), []);

  return useMemo(
    () => ({
      view,
      isPanning: isPanning && isZoomed(view),
      attachViewport: setViewport,
      pointerHandlers,
      zoomIn,
      zoomOut,
      reset,
    }),
    [view, isPanning, pointerHandlers, zoomIn, zoomOut, reset],
  );
}
