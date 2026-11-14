import { useCallback, useEffect } from 'react';
import type { Video } from '@shared/domain/schema';
import { videoMediaUrl } from '@shared/media';
import { useLibraryStore } from '@renderer/store/libraryStore';
import { reportError } from '@renderer/store/toastStore';
import { useFrameRateDetection } from './useFrameRateDetection';
import { usePlayer, type Player } from './usePlayer';
import { useZoomPan, type ZoomPan } from './useZoomPan';

export interface VideoWorkspace {
  src: string;
  player: Player;
  zoom: ZoomPan;
  /** Records a frame rate the user picked by hand, which detection will not override. */
  setFrameRate: (frameRate: number) => void;
}

/**
 * Everything a screen needs to play a library video: the player, zoom, and the
 * housekeeping that keeps the stored duration and frame rate in step with the file.
 */
export function useVideoWorkspace(video: Video): VideoWorkspace {
  const updateVideo = useLibraryStore((state) => state.updateVideo);
  const player = usePlayer(video.frameRate);
  const zoom = useZoomPan(player.togglePlay);

  const { id, durationSeconds, frameRateSource } = video;
  const { isReady, duration } = player.state;

  // The duration is only known once the browser has read the file's metadata.
  useEffect(() => {
    if (!isReady || Math.abs((durationSeconds ?? 0) - duration) < 0.01) return;
    void updateVideo(id, { durationSeconds: duration }).catch(reportError);
  }, [id, durationSeconds, isReady, duration, updateVideo]);

  const onFrameRateDetected = useCallback(
    (frameRate: number) => {
      void updateVideo(id, { frameRate, frameRateSource: 'detected' }).catch(reportError);
    },
    [id, updateVideo],
  );
  useFrameRateDetection(player.video, frameRateSource === 'default', onFrameRateDetected);

  const setFrameRate = useCallback(
    (frameRate: number) => {
      void updateVideo(id, { frameRate, frameRateSource: 'manual' }).catch(reportError);
    },
    [id, updateVideo],
  );

  return { src: videoMediaUrl(id), player, zoom, setFrameRate };
}
