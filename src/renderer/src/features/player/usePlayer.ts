import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefCallback } from 'react';
import { frameIndexAt, stepFrames as stepFramesFrom } from '@shared/domain/frames';

export const PLAYBACK_RATES = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2] as const;

export interface PlayerState {
  /** Metadata is loaded: the duration is known and seeking works. */
  isReady: boolean;
  isPlaying: boolean;
  duration: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  /** Set when the file could not be loaded or decoded. */
  error: string | null;
}

export interface Player {
  /** Attach to the `<video>` element this player drives. */
  attachVideo: RefCallback<HTMLVideoElement>;
  /** The attached element, for hooks that need to observe it directly. */
  video: HTMLVideoElement | null;
  state: PlayerState;
  frameRate: number;

  /**
   * The playhead moves far too often to live in React state. Read it with
   * `useCurrentTime(player)` / `useCurrentFrame(player)`, which re-render only their caller.
   */
  getCurrentTime: () => number;
  subscribeToTime: (listener: () => void) => () => void;

  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (timeSeconds: number) => void;
  seekBy: (deltaSeconds: number) => void;
  /** Pauses and moves by whole frames; negative values step backwards. */
  stepFrames: (deltaFrames: number) => void;
  setPlaybackRate: (rate: number) => void;
  /** Moves through {@link PLAYBACK_RATES}; `1` is faster, `-1` slower. */
  cyclePlaybackRate: (direction: 1 | -1) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
}

const INITIAL_STATE: PlayerState = {
  isReady: false,
  isPlaying: false,
  duration: 0,
  playbackRate: 1,
  volume: 1,
  isMuted: false,
  error: null,
};

const STATE_EVENTS = [
  'loadedmetadata',
  'durationchange',
  'emptied',
  'play',
  'pause',
  'ended',
  'ratechange',
  'volumechange',
  'error',
] as const;

const TIME_EVENTS = ['timeupdate', 'seeking', 'seeked', 'loadedmetadata', 'emptied'] as const;

function describeMediaError(error: MediaError | null): string | null {
  if (!error) return null;
  if (error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return 'This video could not be opened. The file may have been moved or deleted, or it uses a format that is not supported.';
  }
  if (error.code === MediaError.MEDIA_ERR_DECODE) {
    return 'This video could not be decoded. It may be corrupt or use an unsupported codec.';
  }
  return 'Playback failed unexpectedly.';
}

function readState(video: HTMLVideoElement): PlayerState {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  return {
    isReady: video.readyState >= HTMLMediaElement.HAVE_METADATA && duration > 0,
    isPlaying: !video.paused && !video.ended,
    duration,
    playbackRate: video.playbackRate,
    volume: video.volume,
    isMuted: video.muted,
    error: describeMediaError(video.error),
  };
}

/**
 * Wraps an `HTMLVideoElement` in a React-friendly controller: discrete playback state as
 * React state, the playhead as an external store, and frame-accurate transport actions.
 */
export function usePlayer(frameRate: number): Player {
  // The element is kept twice on purpose: as state, so effects re-subscribe when it is
  // attached, and in a ref, because driving playback means mutating it imperatively.
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const element = useRef<HTMLVideoElement | null>(null);
  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    element.current = node;
    setVideo(node);
  }, []);
  const [state, setState] = useState<PlayerState>(INITIAL_STATE);
  const timeListeners = useRef(new Set<() => void>());

  useEffect(() => {
    if (!video) return;
    const sync = (): void => setState(readState(video));
    for (const event of STATE_EVENTS) video.addEventListener(event, sync);
    return () => {
      for (const event of STATE_EVENTS) video.removeEventListener(event, sync);
    };
  }, [video]);

  useEffect(() => {
    if (!video) return;
    const listeners = timeListeners.current;
    const notify = (): void => listeners.forEach((listener) => listener());

    // `timeupdate` only fires a few times per second, so follow the playhead with
    // animation frames while the video is actually playing.
    let frameRequest = 0;
    const tick = (): void => {
      notify();
      frameRequest = requestAnimationFrame(tick);
    };
    const startTicking = (): void => {
      cancelAnimationFrame(frameRequest);
      frameRequest = requestAnimationFrame(tick);
    };
    const stopTicking = (): void => {
      cancelAnimationFrame(frameRequest);
      notify();
    };

    for (const event of TIME_EVENTS) video.addEventListener(event, notify);
    video.addEventListener('play', startTicking);
    video.addEventListener('pause', stopTicking);
    video.addEventListener('ended', stopTicking);
    if (!video.paused) startTicking();

    return () => {
      cancelAnimationFrame(frameRequest);
      for (const event of TIME_EVENTS) video.removeEventListener(event, notify);
      video.removeEventListener('play', startTicking);
      video.removeEventListener('pause', stopTicking);
      video.removeEventListener('ended', stopTicking);
    };
  }, [video]);

  const getCurrentTime = useCallback(() => element.current?.currentTime ?? 0, []);

  const subscribeToTime = useCallback((listener: () => void) => {
    const listeners = timeListeners.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const actions = useMemo(() => {
    const durationOf = (target: HTMLVideoElement): number =>
      Number.isFinite(target.duration) ? target.duration : 0;

    const seek = (timeSeconds: number): void => {
      const target = element.current;
      if (target) target.currentTime = Math.min(Math.max(0, timeSeconds), durationOf(target));
    };

    const play = (): void => {
      // Rejects when playback is interrupted (e.g. an immediate pause); `error` covers real failures.
      void element.current?.play().catch(() => undefined);
    };

    const setPlaybackRate = (rate: number): void => {
      if (element.current) element.current.playbackRate = rate;
    };

    return {
      play,
      pause: (): void => element.current?.pause(),
      togglePlay: (): void => {
        const target = element.current;
        if (!target) return;
        if (target.paused || target.ended) play();
        else target.pause();
      },
      seek,
      seekBy: (deltaSeconds: number): void => {
        if (element.current) seek(element.current.currentTime + deltaSeconds);
      },
      stepFrames: (deltaFrames: number): void => {
        const target = element.current;
        if (!target) return;
        target.pause();
        target.currentTime = stepFramesFrom(target.currentTime, deltaFrames, frameRate, durationOf(target));
      },
      setPlaybackRate,
      cyclePlaybackRate: (direction: 1 | -1): void => {
        const target = element.current;
        if (!target) return;
        const current = PLAYBACK_RATES.findIndex((rate) => rate >= target.playbackRate);
        const index = current === -1 ? PLAYBACK_RATES.length - 1 : current;
        const next = PLAYBACK_RATES[Math.min(PLAYBACK_RATES.length - 1, Math.max(0, index + direction))];
        if (next !== undefined) setPlaybackRate(next);
      },
      setVolume: (volume: number): void => {
        const target = element.current;
        if (!target) return;
        target.volume = Math.min(1, Math.max(0, volume));
        target.muted = false;
      },
      toggleMute: (): void => {
        if (element.current) element.current.muted = !element.current.muted;
      },
    };
  }, [frameRate]);

  return useMemo(
    () => ({ attachVideo, video, state, frameRate, getCurrentTime, subscribeToTime, ...actions }),
    [attachVideo, video, state, frameRate, getCurrentTime, subscribeToTime, actions],
  );
}

type TimeSource = Pick<Player, 'getCurrentTime' | 'subscribeToTime'>;

/** The playhead position in seconds. Re-renders the caller on every displayed frame while playing. */
export function useCurrentTime(player: TimeSource): number {
  return useSyncExternalStore(player.subscribeToTime, player.getCurrentTime);
}

/** The index of the frame on screen. Re-renders the caller only when it changes. */
export function useCurrentFrame(player: TimeSource & Pick<Player, 'frameRate'>): number {
  return useSyncExternalStore(player.subscribeToTime, () => frameIndexAt(player.getCurrentTime(), player.frameRate));
}

/**
 * The id of the last item at or before the playhead, or `null` before the first one.
 * `items` must be sorted by time. Re-renders the caller only when the answer changes.
 */
export function useActiveItemId(
  player: TimeSource,
  items: readonly { id: string; timeSeconds: number }[],
): string | null {
  return useSyncExternalStore(player.subscribeToTime, () => {
    const time = player.getCurrentTime() + 1e-3;
    let active: string | null = null;
    for (const item of items) {
      if (item.timeSeconds > time) break;
      active = item.id;
    }
    return active;
  });
}
