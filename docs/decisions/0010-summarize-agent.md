# 0010 - Summarize sessions with the Copilot CLI behind an app-hosted MCP endpoint

> **Later change:** summaries are now per video, not per session, the entity is
> `VideoSummary`, the read tool is `get_review_notes` and the view is called Review notes.
> See [0013](0013-notes-per-video.md). The harness itself is unchanged.

## Context

Review notes are raw observations. The valuable step - spotting what repeats, deciding
what to practise, finding footage of the matchup played well - is exactly what a language
model is good at, and the user already pays for GitHub Copilot. The request was a
Summarize button that opens a terminal, runs a `/summarize` skill on a small model, uses
outside resources, and puts the result back into the app.

## Decision

- The agent is the **GitHub Copilot CLI**, started in a new terminal window in
  non-interactive mode with the prompt `/summarize`. The skill ships with the app.
- The app hosts a **Model Context Protocol endpoint on loopback** for the duration of the
  session and gives each run three tools: read the session, search YouTube, save the
  summary. The protocol subset needed (four methods) is implemented by hand in ~200 lines
  rather than through an SDK.
- The agent's tools are **whitelisted**: those three, `web_fetch` and `skill`.
- The model defaults to **`claude-haiku-4.5`** and is a setting.
- The result is a new entity, `SessionSummary`, one per review session, stored as
  markdown and shown in a **Session notes** view grouped by character.

Alternatives considered:

- *Call a model API from the app.* Needs an API key and billing of its own, and gives up
  the CLI's web access and the user's existing subscription.
- *Exchange files with the agent* (write a request file, watch for an output file). This
  was the first prototype. It worked, but it needs write permission for the agent, a file
  watcher, and offers no way to give the agent a search tool.
- *Let the agent search the web itself.* The CLI has no search tool in this mode; left to
  improvise, the small model handed the job to a larger sub-agent (several times the cost)
  which then failed to parse YouTube.
- *Interactive mode.* Would allow follow-up questions, but needs a human to answer
  folder-trust and permission prompts before anything happens.

## Consequences

- Summaries need the Copilot CLI installed and signed in, and currently Windows (the
  launcher is a batch file). Everything else in the app works without it.
- A run takes about 30-45 seconds and 4-5 AI credits with the default model.
- YouTube search reads the public result page. If YouTube changes that page, searches
  fail with a clear error and the agent falls back to suggesting search phrases; the
  parser is isolated in one file with tests.
- The quality ceiling is the small model's. It follows the structure reliably; its
  matchup claims are only as good as the pages it read, which is why the skill tells it
  to state only what the notes or its research support.
- The library schema moved to version 2 (summaries, plus the player-character and
  summary-model settings) with an automatic migration from version 1.

See [agent-harness.md](../agent-harness.md) for how it works. A fourth tool, rame_data,
was added later: [ADR 0012](0012-frame-data.md).
