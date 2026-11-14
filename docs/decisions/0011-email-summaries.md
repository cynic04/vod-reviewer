# 0011 - Email summaries over SMTP from the user's own account

## Context

A summary is most useful away from the PC: on a phone between sets, or in training mode
on another machine. The request was to bundle a summary and send it by email, nicely
formatted, so that the notes and the videos it recommends can be opened on a phone.

## Decision

- **Send directly over SMTP** (nodemailer) from an account the user connects once in
  Settings: recipient, sending address, provider, password. For Gmail that means an *app
  password*. Sending is one click on a session card, or automatic when a summary is
  written (a setting, on by default).
- **The password never enters `library.json`.** It is encrypted with the operating
  system's key store through Electron's `safeStorage` (DPAPI on Windows) and kept in its
  own file, `email-credentials.bin`. Only this Windows account on this PC can decrypt it.
  The library holds the non-secret part (`settings.email`), and the app refuses to save
  that without a stored password, so "set up" always means "able to send".
- **TLS is required.** Port 465 uses implicit TLS; any other port must upgrade with
  STARTTLS or the send fails before the password is transmitted.
- **The email is hand-built HTML**: nested tables and inline styles, the only layout that
  Gmail, Apple Mail and Outlook all render the same way. It contains
  - a header in the app's ink/red with the opponent's portrait (an inline attachment);
  - the summary, rendered from markdown with the `marked` library and a custom renderer
    that writes inline-styled tags;
  - a "Watch on your phone" block: every YouTube link in the summary as a tappable card
    with its thumbnail;
  - the session's raw notes with their times;
  - a plain-text alternative.
- **The summary is treated as untrusted** here too: raw HTML in it is escaped and links
  that are not `http(s)` lose their target.

Alternatives considered:

- *A `mailto:` link.* No setup, but plain text only and limited to about two thousand
  characters - neither pretty nor big enough.
- *Open a draft (`.eml`) in the desktop mail app.* No password to store, but it depends on
  which mail app is installed, needs a click per email, and cannot send automatically.
- *A transactional email service.* Needs an account, an API key and a verified sending
  domain for the sake of mailing oneself.

## Consequences

- One-time setup, and for Gmail it requires 2-Step Verification and an app password.
- The recording itself is not attached: match recordings are gigabytes. "Videos" in the
  email are the study videos the summary links to.
- Thumbnails are remote images from YouTube; a mail client that blocks remote images
  shows the cards without pictures until images are allowed.
- The app now ships two more runtime dependencies in the main process (`nodemailer`,
  `marked`).
- The address prefilled in the setup dialog (`DEFAULT_EMAIL_ADDRESS` in
  `src/shared/domain/constants.ts`) is the owner's own. Change or blank it if this
  repository is ever shared.
- The library schema moved to version 3 (`settings.email`).
