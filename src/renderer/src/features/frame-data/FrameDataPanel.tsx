import { Fragment, useEffect, useId, useMemo, useState } from "react";
import { CHARACTERS, getCharacter } from "@shared/domain/characters";
import {
  advantageSign,
  moveMatches,
  type FrameDataMove,
  type MoveType,
} from "@shared/domain/frameData";
import { moveImageUrl } from "@shared/media";
import { Button, IconButton } from "@renderer/components/Button";
import { Icon } from "@renderer/components/Icon";
import { cx } from "@renderer/lib/cx";
import { formatDate } from "@renderer/lib/dates";
import { useLibrary } from "@renderer/store/hooks";
import { useFrameData } from "./useFrameData";
import styles from "./FrameDataPanel.module.css";

const TYPE_LABELS: Record<MoveType, string> = {
  normal: "Normals",
  special: "Specials",
  super: "Overdrives",
  other: "Universal",
};

type DetailField = Exclude<keyof FrameDataMove, "images" | "hitboxes" | "type">;

/** How many pictures of one kind a row shows; a few moves have a dozen. */
const MAX_PICTURES = 4;

const DETAILS: readonly { key: DetailField; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "recovery", label: "Recovery" },
  { key: "damage", label: "Damage" },
  { key: "guard", label: "Guard" },
  { key: "level", label: "Level" },
  { key: "counter", label: "Counter hit" },
  { key: "invuln", label: "Invulnerability" },
  { key: "notes", label: "Notes" },
];

/** Panel width from which the table has room for the active and recovery columns. */
const FULL_TABLE_MIN_WIDTH = 380;

/** Whether an element is at least `minWidth` wide, tracked as it is resized. */
function useIsAtLeast(
  minWidth: number,
): [attach: (element: HTMLElement | null) => void, isAtLeast: boolean] {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [isAtLeast, setIsAtLeast] = useState(false);

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setIsAtLeast(entry.contentRect.width >= minWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, minWidth]);

  return [setElement, isAtLeast];
}

interface FrameDataPanelProps {
  /** The character the video's matchup is against, if it is filed under one. */
  opponentCharacterId: string | null;
}

/**
 * Frame data for the matchup on screen, from Dustloop: the opponent's moves by default,
 * the player's own or anyone else's one pick away.
 */
export function FrameDataPanel({ opponentCharacterId }: FrameDataPanelProps) {
  const playerCharacterId = useLibrary().settings.playerCharacterId;
  const opponent = getCharacter(opponentCharacterId);
  const player = getCharacter(playerCharacterId);
  const [characterId, setCharacterId] = useState(
    opponent?.id ?? player?.id ?? CHARACTERS[0].id,
  );
  const [query, setQuery] = useState("");
  const { state, refresh } = useFrameData(characterId);
  const selectId = useId();
  const searchId = useId();
  // In a narrow sidebar there is no room for six columns: active and recovery then move
  // into each row's details, leaving what is read most - startup and the two advantages.
  const [attachPanel, hasRoomForAllColumns] =
    useIsAtLeast(FULL_TABLE_MIN_WIDTH);

  const others = CHARACTERS.filter(
    (character) => character.id !== opponent?.id && character.id !== player?.id,
  );

  return (
    <div ref={attachPanel} className={styles.panel}>
      <div className={styles.controls}>
        <label htmlFor={selectId} className="visually-hidden">
          Character
        </label>
        <select
          id={selectId}
          value={characterId}
          onChange={(event) => setCharacterId(event.target.value)}
        >
          {opponent && (
            <option value={opponent.id}>Opponent: {opponent.name}</option>
          )}
          {player && player.id !== opponent?.id && (
            <option value={player.id}>You: {player.name}</option>
          )}
          <optgroup label="Everyone else">
            {others.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </optgroup>
        </select>
        <label htmlFor={searchId} className="visually-hidden">
          Find a move
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          placeholder="Find a move: 6P, Bandit..."
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {state.status === "loading" && (
        <p className={styles.message} role="status">
          Loading frame data...
        </p>
      )}

      {state.status === "error" && (
        <div className={styles.message} role="alert">
          <p>{state.message}</p>
          <Button onClick={refresh}>Try again</Button>
        </div>
      )}

      {state.status === "ready" && (
        <>
          {/* Keyed so that expanded rows reset when another character is picked. */}
          <MoveTable
            key={state.data.characterId}
            moves={state.data.moves}
            query={query}
            showAllColumns={hasRoomForAllColumns}
          />
          <p className={styles.source}>
            <span>
              {state.data.isStale && <strong>Could not update. </strong>}
              From{" "}
              <a
                href={state.data.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Dustloop
              </a>
              , saved {formatDate(state.data.fetchedAt)}
            </span>
            <IconButton
              icon="refresh"
              label="Download the latest frame data"
              size={15}
              onClick={refresh}
            />
          </p>
        </>
      )}
    </div>
  );
}

interface MoveTableProps {
  moves: readonly FrameDataMove[];
  query: string;
  /** Whether to show active and recovery as columns; they are always in the details. */
  showAllColumns: boolean;
}

function MoveTable({ moves, query, showAllColumns }: MoveTableProps) {
  const columnCount = showAllColumns ? 6 : 4;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const visible = useMemo(
    () => moves.filter((move) => moveMatches(move, query)),
    [moves, query],
  );

  if (visible.length === 0)
    return (
      <p className={styles.message}>
        No move matches &ldquo;{query.trim()}&rdquo;.
      </p>
    );

  const toggle = (key: string): void =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Move</th>
          <th
            scope="col"
            className={styles.colNumber}
            title="Frames before the move can hit"
          >
            Start
          </th>
          {showAllColumns && (
            <>
              <th
                scope="col"
                className={styles.colNumber}
                title="Frames the move can hit for"
              >
                Act
              </th>
              <th
                scope="col"
                className={styles.colNumber}
                title="Frames of recovery after the active frames"
              >
                Rec
              </th>
            </>
          )}
          <th
            scope="col"
            className={styles.colAdvantage}
            title="Frame advantage for the attacker when blocked"
          >
            Block
          </th>
          <th
            scope="col"
            className={styles.colAdvantage}
            title="Frame advantage for the attacker on hit"
          >
            Hit
          </th>
        </tr>
      </thead>
      <tbody>
        {visible.map((move, index) => {
          const key = `${move.input}|${move.name}`;
          const isExpanded = expanded.has(key);
          const startsSection = move.type !== visible[index - 1]?.type;
          return (
            <Fragment key={key}>
              {startsSection && (
                <tr className={styles.section}>
                  <th colSpan={columnCount} scope="colgroup">
                    {TYPE_LABELS[move.type]}
                  </th>
                </tr>
              )}
              <tr className={cx(styles.move, isExpanded && styles.expanded)}>
                <th scope="row">
                  <button
                    type="button"
                    className={styles.moveToggle}
                    aria-expanded={isExpanded}
                    title="Show the move, its hitboxes and the rest of its data"
                    onClick={() => toggle(key)}
                  >
                    <Icon
                      name="chevronDown"
                      size={13}
                      className={cx(
                        styles.chevron,
                        !isExpanded && styles.chevronCollapsed,
                      )}
                    />
                    <span>
                      <span className={styles.input}>{move.input}</span>
                      {move.name !== "" && (
                        <span className={styles.name}>{move.name}</span>
                      )}
                    </span>
                  </button>
                </th>
                <td>{move.startup}</td>
                {showAllColumns && (
                  <>
                    <td>{move.active}</td>
                    <td>{move.recovery}</td>
                  </>
                )}
                <Advantage value={move.onBlock} />
                <Advantage value={move.onHit} />
              </tr>
              {isExpanded && (
                <tr className={styles.details}>
                  <td colSpan={columnCount}>
                    <div className={styles.detailsBody}>
                      <MovePictures move={move} />
                      <dl>
                        {DETAILS.filter(
                          ({ key: field }) => move[field] !== "",
                        ).map(({ key: field, label }) => (
                          <div key={field}>
                            <dt>{label}</dt>
                            <dd>{move[field]}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * The move's picture, with a switch to its hitboxes where Dustloop has them. Pictures
 * are only requested once a row is opened, and the app keeps each one after that.
 */
function MovePictures({ move }: { move: FrameDataMove }) {
  const [view, setView] = useState<"images" | "hitboxes">("images");
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  if (move.images.length === 0 && move.hitboxes.length === 0) return null;

  // With only one kind available there is nothing to switch between.
  const shown =
    move[view].length > 0 ? view : view === "images" ? "hitboxes" : "images";
  const files = move[shown]
    .slice(0, MAX_PICTURES)
    .filter((file) => !failed.has(file));
  const label = move.name === "" ? move.input : `${move.input} ${move.name}`;

  return (
    <div className={styles.pictures}>
      {move.images.length > 0 && move.hitboxes.length > 0 && (
        <div className={styles.pictureSwitch} role="group" aria-label="Picture">
          <button
            type="button"
            aria-pressed={shown === "images"}
            onClick={() => setView("images")}
          >
            Move
          </button>
          <button
            type="button"
            aria-pressed={shown === "hitboxes"}
            onClick={() => setView("hitboxes")}
          >
            Hitbox
          </button>
        </div>
      )}
      {files.length === 0 ? (
        <p className={styles.pictureMissing}>
          The picture could not be loaded.
        </p>
      ) : (
        files.map((file) => (
          <img
            key={file}
            src={moveImageUrl(file)}
            alt={shown === "hitboxes" ? `Hitboxes of ${label}` : label}
            loading="lazy"
            draggable={false}
            onError={() => setFailed((current) => new Set(current).add(file))}
          />
        ))
      )}
    </div>
  );
}

/** A frame advantage cell, coloured by who is ahead; the sign in the text carries the meaning too. */
function Advantage({ value }: { value: string }) {
  const sign = advantageSign(value);
  return (
    <td
      className={cx(
        sign === "plus" && styles.plus,
        sign === "minus" && styles.minus,
      )}
    >
      {value}
    </td>
  );
}
