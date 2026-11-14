import { describe, expect, it } from 'vitest';
import { estimateFrameRate, frameIndexAt, stepFrames, timeOfFrame } from './frames';

describe('frame stepping', () => {
  it('maps a time to the frame that is on screen', () => {
    expect(frameIndexAt(0, 60)).toBe(0);
    expect(frameIndexAt(1, 60)).toBe(60);
    expect(frameIndexAt(0.999, 60)).toBe(59);
  });

  it('round-trips every frame of a 60fps second without drifting', () => {
    for (let frame = 0; frame < 60; frame += 1) {
      expect(frameIndexAt(timeOfFrame(frame, 60), 60)).toBe(frame);
    }
  });

  it('moves exactly one frame forward and back from an arbitrary position', () => {
    const start = 12.3456;
    const frame = frameIndexAt(start, 60);
    expect(frameIndexAt(stepFrames(start, 1, 60, 100), 60)).toBe(frame + 1);
    expect(frameIndexAt(stepFrames(start, -1, 60, 100), 60)).toBe(frame - 1);
  });

  it('steps from a frame boundary reported with floating point error', () => {
    // 0.1 + 0.2 style error: 7 frames at 30fps is 0.23333333333333334.
    const boundary = 7 / 30;
    expect(frameIndexAt(stepFrames(boundary, 1, 30, 10), 30)).toBe(8);
  });

  it('clamps to the first and last frame', () => {
    expect(frameIndexAt(stepFrames(0, -5, 60, 10), 60)).toBe(0);
    expect(frameIndexAt(stepFrames(9.99, 50, 60, 10), 60)).toBe(599);
    expect(stepFrames(9.99, 50, 60, 10)).toBeLessThanOrEqual(10);
  });
});

describe('estimateFrameRate', () => {
  const samples = (rate: number, count = 30): number[] => Array.from({ length: count }, () => 1 / rate);

  it('snaps NTSC-style rates to the nearest common rate', () => {
    expect(estimateFrameRate(samples(59.94))).toBe(60);
    expect(estimateFrameRate(samples(29.97))).toBe(30);
  });

  it('ignores a few dropped frames', () => {
    expect(estimateFrameRate([...samples(60), 2 / 60, 3 / 60])).toBe(60);
  });

  it('refuses to guess from too few samples or an unknown rate', () => {
    expect(estimateFrameRate(samples(60, 5))).toBeNull();
    expect(estimateFrameRate(samples(37))).toBeNull();
  });
});
