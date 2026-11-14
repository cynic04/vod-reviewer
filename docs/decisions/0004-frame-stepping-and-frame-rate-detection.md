# 0004 - Compute frame steps from a detected frame rate

## Context

Frame-by-frame review is the core feature for a fighting game player, where a move's
start-up is counted in frames. `HTMLVideoElement` has no "next frame" API and does not
expose a video's frame rate; it only has `currentTime` in seconds.

## Decision

**Stepping.** Convert the current time to a frame index (`floor(time * fps)`), add or
subtract, and seek to the **middle** of the target frame (`(index + 0.5) / fps`). Seeking
to the exact frame boundary is unreliable: `7 / 30` is not representable in binary and can
land on either side.

**Frame rate.** Assume 60 fps (what fighting games run at), then measure. While the video
plays, `requestVideoFrameCallback` reports the media time of each presented frame; the
median gap between consecutive frames gives the rate, which is snapped to a common value
(24, 25, 30, 48, 50, 60, 120, 144) if within 4%. The result is stored on the video with
`frameRateSource: 'detected'`. The user can override it from the player
(`'manual'`), and detection never overrides a manual choice.

Rejected: parsing container metadata in the main process (a dependency per container
format) or bundling ffprobe (a ~70 MB binary) for one number.

## Consequences

- Exact single-frame steps on constant-frame-rate recordings, verified end to end against
  a generated 30 fps clip and against real 60 fps captures.
- Until a video has played for a second or two, the rate is the 60 fps default; a 30 fps
  clip would show each frame twice per step until then.
- Variable-frame-rate recordings cannot be stepped exactly by this method. Capture tools
  used for games (OBS, ShadowPlay) record at a constant rate by default.
- The displayed frame number is derived from time and rate; it matches the game's own
  frame count only if the capture rate equals the game's 60 fps.
