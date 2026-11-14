/**
 * Zoom and pan maths for the video stage.
 *
 * The view is `translate(x, y) scale(scale)` applied from the top-left corner of the
 * stage. Offsets are stored as fractions of the stage size rather than pixels, so the
 * view stays correct when the window is resized.
 */

export interface ZoomView {
  scale: number;
  /** Horizontal offset as a fraction of the stage width. Always within `[1 - scale, 0]`. */
  x: number;
  /** Vertical offset as a fraction of the stage height. Always within `[1 - scale, 0]`. */
  y: number;
}

/** A position on the stage, as fractions of its width and height (`0..1`). */
export interface StagePoint {
  x: number;
  y: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
export const ZOOM_STEP = 1.25;
export const IDENTITY_VIEW: ZoomView = { scale: 1, x: 0, y: 0 };
export const STAGE_CENTER: StagePoint = { x: 0.5, y: 0.5 };

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Keeps the scale in range and the picture covering the whole stage. */
export function clampView(view: ZoomView): ZoomView {
  const scale = clamp(view.scale, MIN_ZOOM, MAX_ZOOM);
  return {
    scale,
    x: clamp(view.x, 1 - scale, 0),
    y: clamp(view.y, 1 - scale, 0),
  };
}

/** Scales the view by `factor` while keeping the content under `point` where it is. */
export function zoomAt(view: ZoomView, factor: number, point: StagePoint): ZoomView {
  const scale = clamp(view.scale * factor, MIN_ZOOM, MAX_ZOOM);
  const ratio = scale / view.scale;
  return clampView({
    scale,
    x: point.x - (point.x - view.x) * ratio,
    y: point.y - (point.y - view.y) * ratio,
  });
}

/** Moves the view by a fraction of the stage size. */
export function panBy(view: ZoomView, deltaX: number, deltaY: number): ZoomView {
  return clampView({ ...view, x: view.x + deltaX, y: view.y + deltaY });
}

export function isZoomed(view: ZoomView): boolean {
  return view.scale > MIN_ZOOM + 1e-3;
}
