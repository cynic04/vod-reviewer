# Design system

The interface borrows its look from Guilty Gear -Strive-'s menus: ink black, bone white,
one loud red, yellow for emphasis, heavy italic display type and slanted cuts.

## Colour

All colours are CSS custom properties in
[`src/renderer/src/styles/tokens.css`](../src/renderer/src/styles/tokens.css). Components
only ever use the **semantic** tokens, so a theme is nothing more than a different set of
values for them.

### Palette

| Token | Value | Use |
| --- | --- | --- |
| `--red-500` | `#e8262a` | The signature red: primary actions, progress, accents |
| `--red-400` / `--red-600` / `--red-700` | `#ff4747` / `#c8161d` / `#9c0f15` | Hover, light-theme accent, stripes |
| `--yellow-500` / `--yellow-400` | `#f5c518` / `#ffd53d` | Emphasis: old-video highlight, focus points, selection |
| `--ink-950` ... `--ink-600` | `#0b0b0d` ... `#34343d` | Dark surfaces |
| `--bone-50` ... `--bone-300` | `#fbf9f4` ... `#d2cab8` | Light surfaces (warm, like the game's paper white) |

### Semantic tokens

| Token | Dark | Light |
| --- | --- | --- |
| `--color-bg` | ink 950 | bone 100 |
| `--color-surface` / `--color-surface-raised` | ink 800 / 700 | bone 50 / 200 |
| `--color-border` | ink 600 | bone 300 |
| `--color-text` / `--color-text-muted` | `#f4f1ea` / `#a8a399` | ink 900 / `#5f5a50` |
| `--color-accent` | red 500 | red 600 |
| `--color-highlight-text` | yellow 400 | `#8a5a00` |
| `--color-focus-ring` | yellow 400 | red 600 |

Things that are the same in both themes, by design:

- **The top bar** is always ink with a red rule, like a fixed piece of game HUD.
- **The video stage** is always black.
- **Character portraits** keep a dark caption gradient with white text; the art is dark.
- **The old-video highlight** is always yellow with ink text (see below).

### Light and dark mode

The theme is `system`, `light` or `dark` (Settings, or the sun/moon button in the top
bar). `useTheme` resolves it against the OS preference and sets `data-theme` on `<html>`,
which swaps the semantic tokens. The preference is stored in `library.json`.

## Typography

No fonts are bundled or downloaded; the app uses what Windows ships.

| Role | Stack | Treatment |
| --- | --- | --- |
| Display (headings, buttons, tabs) | Impact, Haettenschweiler, Arial Narrow Bold | Italic, uppercase, slight tracking |
| Body | Bahnschrift, Segoe UI, system-ui | Regular |
| Numbers (timecodes, frame counts, paths) | Cascadia Mono, Consolas | Tabular figures, so digits do not jitter during playback |

## Shape

- **The slant.** Primary buttons, the stepper, the play button and badges are cut into
  parallelograms with `clip-path`. It is the most recognisable Strive shape.
- **Hard edges.** Radii are 2-4px at most. Rules under headings are 3px and solid.
- **Left rules.** List items (notes, timestamps, selected files) carry a 3px left border
  that turns red when active.

## Conventions

- **Yellow means "look here".** It marks focus points on the timeline and in lists, the
  selected folder in the picker, the zoom badge, and videos that are old.
- **Old videos.** A video's date is shown with its age. Past the threshold (15 days by
  default, configurable) the age turns into a yellow slanted badge. It also carries hidden
  "Old video:" text so the meaning does not depend on colour.
- **Unused matchups step back.** On the library screen, matchups without footage are
  greyscale and dimmed; the ones with videos are in colour with a red count badge.
- **Timeline markers.** Yellow triangle = focus point, red triangle = timestamp added in
  review, small square = note. All are real buttons and can be reached by keyboard.
- **Long-form text.** AI summaries are the only prose in the app. They are set in the
  body face at a 74-character measure with 1.65 line height; section headings keep the
  display face, pattern headings switch to bold body text with a red rule so that a
  summary reads as a document rather than as more UI.
- **Hover on matchup cards.** The card lifts, the portrait regains its colour, and a red
  frame fades in over a quarter of a second. The frame is an overlay drawn above the
  caption, not a CSS outline, which the caption would cover.
- **Email.** Summary emails use the same palette in a form mail clients accept: an ink
  header with the red rule and the opponent's portrait, a bone-white body, ink video cards
  with yellow calls to action. Fonts fall back to what phones have (Arial Black for
  display, the system sans for text), and the layout is a single fluid column up to 640px.
- **Frame advantage.** In the frame data table, plus frames are green (`--color-plus`,
  the one colour outside the game's palette, used only here) and minus frames red. The
  sign is always in the text, so the colour is an aid and not the message. Numbers are
  monospaced so columns line up.
- **Move pictures.** Shown inside the opened row at the panel's width, at most 300px
  tall, on the darkest ink in both themes: the art and the hitbox overlays are drawn for
  a dark page. The Move / Hitbox switch is a small two-part toggle in the accent red.
- **Time is always clickable.** Anywhere a timecode appears as a chip, clicking it seeks
  the video there.

## Accessibility

- Every control has an accessible name; icon-only buttons have `aria-label` and a tooltip.
- Dialogs use the native `<dialog>` element (focus trap, Escape, inert background).
- Visible focus rings everywhere; rings are drawn inside clipped (slanted) elements,
  because `clip-path` would otherwise cut an outline off.
- The scrubber is a `role="slider"` with a spoken value; tabs and the folder picker use
  the tab and radio-group patterns.
- `prefers-reduced-motion` disables transitions.
- Shortcuts never fire while typing or while a dialog is open.

## Styling approach

Plain CSS with CSS Modules (one `.module.css` beside each component) plus the global
token file. There is no CSS framework and no runtime styling library: the visual language
is small and specific, and tokens + modules keep it explicit and dependency-free.
