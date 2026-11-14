import { describe, expect, it } from 'vitest';
import { IDENTITY_VIEW, MAX_ZOOM, panBy, zoomAt, type StagePoint, type ZoomView } from './zoom';

/** Where a point of the un-zoomed picture ends up on the stage under a view. */
const project = (view: ZoomView, content: StagePoint): StagePoint => ({
  x: view.x + content.x * view.scale,
  y: view.y + content.y * view.scale,
});

describe('zoom and pan', () => {
  it('keeps the content under the cursor fixed while zooming', () => {
    const cursor = { x: 0.7, y: 0.4 };
    const zoomed = zoomAt(IDENTITY_VIEW, 2, cursor);
    expect(zoomed.scale).toBe(2);
    expect(project(zoomed, cursor).x).toBeCloseTo(cursor.x);
    expect(project(zoomed, cursor).y).toBeCloseTo(cursor.y);
  });

  it('never zooms out past the full picture and re-centres on the way out', () => {
    const zoomed = zoomAt(IDENTITY_VIEW, 4, { x: 1, y: 1 });
    expect(zoomAt(zoomed, 0.01, { x: 0, y: 0 })).toEqual(IDENTITY_VIEW);
  });

  it('caps the zoom level', () => {
    expect(zoomAt(IDENTITY_VIEW, 100, { x: 0.5, y: 0.5 }).scale).toBe(MAX_ZOOM);
  });

  it('cannot pan the picture off the stage', () => {
    const zoomed = zoomAt(IDENTITY_VIEW, 2, { x: 0.5, y: 0.5 });
    expect(panBy(zoomed, 5, 5)).toMatchObject({ x: 0, y: 0 });
    expect(panBy(zoomed, -5, -5)).toMatchObject({ x: -1, y: -1 });
    expect(panBy(IDENTITY_VIEW, 0.3, -0.3)).toEqual(IDENTITY_VIEW);
  });
});
