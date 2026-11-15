# 0012 - Frame data from Dustloop's Cargo API, cached locally, shown in review and given to the agent

## Context

Reviewing a match keeps raising the same question: "was that punishable?" The answer is
frame data. Until now the app sent the player to the wiki, and the summarize agent - a
small model - was told not to state frame numbers at all, because it would otherwise
quote them from memory and get them wrong.

Dustloop, the community wiki, stores every move's data in MediaWiki *Cargo* tables, and
the standard MediaWiki API can query those (`api.php?action=cargoquery`, table
`MoveData_GGST`). It returns structured rows - startup, active, recovery, on block, on
hit, guard, level, invulnerability, notes - with no key and no scraping.

## Decision

- **Source:** the Cargo API, one request per character. All 34 roster characters were
  checked against it; three need a different name on the wiki (Asuka R, Bedman, Jack-O).
- **Values stay text.** Many are not numbers: "5, 11", "Until Landing+16", "-11~-14",
  "KD +37 (IAD)". Wiki markup (line breaks, links, templates, entities) is stripped;
  nothing is parsed into numbers for storage.
- **Cached on disk**, one file per character in `%APPDATA%\vod-reviewer\frame-data\`,
  outside `library.json`: it is downloaded reference data, not the user's. A copy is used
  for a week, then refreshed on next use; the viewer has a refresh button for patch day.
  If a refresh fails, the old copy is served and marked as such, so the app works offline.
- **In the review screen:** a third sidebar tab, **Frames** (shortcut `F`). It opens on
  the opponent's moves, offers the player's own and every other character, filters by
  input or name, and expands a row for the rest of the data. Advantage is coloured by who
  is ahead. In a narrow sidebar the table shows startup, on block and on hit, and moves
  active and recovery into the row details; the column count is chosen in code from the
  panel's measured width (hiding cells with CSS breaks a table whose other rows span all
  columns).
- **For the agent:** a fourth MCP tool, `frame_data`, limited to the two characters of
  the matchup. The skill now tells it to look up the moves the notes mention, quote only
  numbers the tool returned, and add a "Frame data to know" table to the summary.
- **The tool does the arithmetic.** For each of the opponent's moves it also prints which
  of the player's grounded moves are fast enough to punish it on block (using the worst
  case of a range). This was added after a real run in which the model had the right
  numbers and still called a 6-frame move "too slow" for an 11-frame gap. Comparing
  numbers is exactly what a small model should not be trusted with and code can do.

- **Move pictures.** An opened row shows the move's picture, with a switch to its hitbox
  picture where Dustloop has one (at most four of each). The Cargo rows carry file names
  only, and the wiki's `Special:Redirect/file` refuses automated requests, so the main
  process asks the MediaWiki `imageinfo` API for a 480px-wide thumbnail URL and downloads
  that. A picture is fetched the first time its row is opened - never in bulk - and then
  kept for good in `frame-data\images\` under a hash of its file name. The renderer gets
  it from the app's own protocol (`vod-media://move-image/?file=<name>`), not from the
  network.

Alternatives considered:

- *Let the renderer load pictures straight from dustloop.com.* Simpler, but it would
  open the page's content security policy to a remote host, need the network every time,
  and hit the wiki on every view.
- *Download all of a character's pictures with the frame data.* 100-200 requests per
  character for pictures that are mostly never looked at.
- *Let the agent fetch Dustloop's frame data pages.* A page is tens of thousands of
  tokens of HTML per character, and the model would still have to read tables correctly.
- *Bundle the data with the app.* Works offline from the first second, but goes stale
  with every balance patch and would need a release to fix.
- *Store it in `library.json`.* It would bloat the user's data file with ~1,500 moves
  that can be re-downloaded at any time.

## Consequences

- The first time a character's frame data is opened the app needs the network; after
  that it does not. The same holds for each move's picture: one never opened while
  online shows "The picture could not be loaded" offline, and the numbers still work.
- The page's `img-src` policy now allows `vod-media:`. That is the app's own protocol,
  not a remote origin. The `move-image` host only accepts names that look like image file
  names, only stores what it downloaded from Dustloop's own hosts, and never uses the
  requested name as a path (files are named by hash).
- Pictures are never refreshed. If the wiki replaces one, delete `frame-data\images\`.
- The app depends on the shape of a community wiki's table. If the table or its fields
  change, the parser rejects the response with a clear error and existing copies keep
  working; the parser is one file with tests.
- Punish advice is by frames only. Range, pushback and move properties are not modelled,
  and the tool says so on every line.
- The data is Dustloop's community-maintained content (CC BY-NC-SA). The app credits and
  links the source page in the viewer, identifies itself in its User-Agent, and asks for
  each character at most about once a week. Fine for personal use; revisit the licence
  terms before distributing the app.
- Summaries still come from a small model. Frame numbers in them are now copied from the
  source and the punish comparison is computed, but the surrounding advice can still be
  wrong and should be read critically.
