/**
 * Frame arithmetic for a constant-frame-rate video.
 *
 * `HTMLVideoElement` only exposes time in seconds, so frame stepping is done by
 * converting to a frame index and seeking to the *middle* of the target frame.
 * Aiming at the middle keeps floating point error from landing on the previous frame.
 */

/** Frame rates the detector snaps to and the UI offers. */
export const COMMON_FRAME_RATES = [24, 25, 30, 48, 50, 60, 120, 144] as const;

const FRAME_EPSILON = 1e-6;

export function frameIndexAt(timeSeconds: number, frameRate: number): number {
  return Math.max(0, Math.floor(timeSeconds * frameRate + FRAME_EPSILON));
}

export function frameCount(durationSeconds: number, frameRate: number): number {
  return Math.max(1, Math.round(durationSeconds * frameRate));
}

export function timeOfFrame(frameIndex: number, frameRate: number): number {
  return (frameIndex + 0.5) / frameRate;
}

/** Time to seek to in order to move `deltaFrames` frames from `timeSeconds`, clamped to the video. */
export function stepFrames(
  timeSeconds: number,
  deltaFrames: number,
  frameRate: number,
  durationSeconds: number,
): number {
  const lastFrame = frameCount(durationSeconds, frameRate) - 1;
  const target = Math.min(lastFrame, Math.max(0, frameIndexAt(timeSeconds, frameRate) + deltaFrames));
  return Math.min(timeOfFrame(target, frameRate), Math.max(0, durationSeconds));
}

/**
 * Estimates the frame rate from the media-time gaps between consecutively presented frames
 * and snaps it to the nearest common rate. Returns `null` when the samples are not conclusive.
 */
export function estimateFrameRate(frameDurationsSeconds: readonly number[]): number | null {
  const samples = frameDurationsSeconds.filter((d) => d > 0 && Number.isFinite(d)).sort((a, b) => a - b);
  if (samples.length < 10) return null;

  const median = samples[Math.floor(samples.length / 2)];
  if (median === undefined) return null;
  const measured = 1 / median;

  let best: number | null = null;
  for (const rate of COMMON_FRAME_RATES) {
    if (best === null || Math.abs(rate - measured) < Math.abs(best - measured)) best = rate;
  }
  if (best === null) return null;

  // Reject anything further than 4% from a known rate rather than guess.
  return Math.abs(best - measured) / best <= 0.04 ? best : null;
}
