import { getCharacter } from '@shared/domain/characters';
import { moveMatches, type CharacterFrameData, type FrameDataMove } from '@shared/domain/frameData';

const orDash = (value: string): string => (value === '' ? '-' : value);

function describeMove(move: FrameDataMove): string {
  const label = move.name === '' ? move.input : `${move.input} (${move.name})`;
  const parts = [
    `startup ${orDash(move.startup)}`,
    `active ${orDash(move.active)}`,
    `recovery ${orDash(move.recovery)}`,
    `on block ${orDash(move.onBlock)}`,
    `on hit ${orDash(move.onHit)}`,
    `guard ${orDash(move.guard)}`,
  ];
  if (move.invuln !== '') parts.push(`invuln ${move.invuln}`);
  return `${label}: ${parts.join(', ')}`;
}

const MAX_PUNISHERS = 6;

/**
 * The frame advantage a defender can rely on after blocking: for a range such as
 * "-11~-14" that is the value least in their favour. `null` when the text has no number.
 */
export function guaranteedAdvantage(onBlock: string): number | null {
  const values = [...onBlock.matchAll(/[+-]\d+|±\s*0/g)].map(([text]) => Number(text.replace(/[±\s]/g, '')));
  return values.length === 0 ? null : Math.max(...values);
}

/**
 * What blocking `move` means for a defender with the given moves, worked out here so
 * that a small model does not have to compare frame numbers itself (and get it wrong).
 */
export function describePunish(move: FrameDataMove, defender: CharacterFrameData): string | null {
  const advantage = guaranteedAdvantage(move.onBlock);
  if (advantage === null) return null;
  if (advantage >= 0) return `${advantage > 0 ? 'Plus' : 'Even'} on block: no punish, and at plus frames it is still the attacker's turn.`;

  const name = getCharacter(defender.characterId)?.name ?? 'The defender';
  const grounded = defender.moves
    .filter((candidate) => candidate.type !== 'other' && !candidate.input.startsWith('j.') && /^\d+$/.test(candidate.startup))
    .map((candidate) => ({ input: candidate.input, startup: Number(candidate.startup) }))
    .sort((a, b) => a.startup - b.startup);
  const fastest = grounded[0];
  if (!fastest) return null;

  const window = -advantage;
  const punishers = grounded.filter((candidate) => candidate.startup <= window);
  if (punishers.length === 0) {
    return `Not punishable by frames: ${name}'s fastest ground move is ${fastest.input} (${fastest.startup}f) and the gap is only ${window}f.`;
  }
  const listed = punishers.slice(0, MAX_PUNISHERS).map((candidate) => `${candidate.input} (${candidate.startup}f)`);
  return `Punishable by frames (gap ${window}f): ${name} can use ${listed.join(', ')}. Lower startup is faster. Range and pushback are not accounted for.`;
}

/**
 * Frame data as plain lines for the summarize agent. `query` is an optional
 * comma-separated list of inputs or move names; without it every move is listed. With
 * `defender`, each move also says what that character can punish it with.
 */
export function formatFrameData(
  data: CharacterFrameData,
  query: string | undefined,
  defender?: CharacterFrameData,
): string {
  const name = getCharacter(data.characterId)?.name ?? data.characterId;
  const terms = (query ?? '')
    .split(',')
    .map((term) => term.trim())
    .filter((term) => term !== '');

  const moves = terms.length === 0 ? data.moves : data.moves.filter((move) => terms.some((term) => moveMatches(move, term)));
  if (moves.length === 0) {
    const known = data.moves.map((move) => (move.name === '' ? move.input : `${move.input} ${move.name}`)).join(', ');
    return `No move of ${name} matches "${terms.join(', ')}". Their moves are: ${known}`;
  }

  return [
    `${name} frame data from Dustloop (${data.fetchedAt.slice(0, 10)}), ${moves.length} of ${data.moves.length} moves.`,
    'Values are in frames. "On block" is the attacker\'s advantage: at -N the defender can punish with any move whose startup is N or less.',
    '',
    ...moves.flatMap((move) => {
      const punish = defender ? describePunish(move, defender) : null;
      return punish === null ? [describeMove(move)] : [describeMove(move), `  -> ${punish}`];
    }),
  ].join('\n');
}
