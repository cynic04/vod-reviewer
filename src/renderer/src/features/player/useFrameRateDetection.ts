import { useEffect } from 'react';
import { estimateFrameRate } from '@shared/domain/frames';

const SAMPLES_NEEDED = 45;

/**
 * Measures the frame rate of a video while it plays, using the media time of consecutive
 * presented frames, and reports it once through `onDetected`.
 *
 * The browser does not expose a video's frame rate, and frame stepping is only exact
 * when it is known - a 30fps clip stepped at 60fps shows every frame twice.
 */
export function useFrameRateDetection(
  video: HTMLVideoElement | null,
  enabled: boolean,
  onDetected: (frameRate: number) => void,
): void {
  useEffect(() => {
    if (!video || !enabled) return;

    const samples: number[] = [];
    let previous: { mediaTime: number; presentedFrames: number } | null = null;
    let request = 0;

    const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
      // Only trust gaps between frames that were presented back to back at normal speed
      // or slower; anything else may hide skipped frames.
      const isConsecutive = previous !== null && metadata.presentedFrames === previous.presentedFrames + 1;
      if (previous && isConsecutive && !video.paused && !video.seeking && video.playbackRate <= 1) {
        samples.push(metadata.mediaTime - previous.mediaTime);
      }
      previous = { mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames };

      if (samples.length >= SAMPLES_NEEDED) {
        const frameRate = estimateFrameRate(samples);
        if (frameRate !== null) {
          onDetected(frameRate);
          return;
        }
        samples.length = 0;
      }
      request = video.requestVideoFrameCallback(onFrame);
    };

    request = video.requestVideoFrameCallback(onFrame);
    return () => video.cancelVideoFrameCallback(request);
  }, [video, enabled, onDetected]);
}
