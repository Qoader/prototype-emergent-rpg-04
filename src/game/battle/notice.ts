import type { BattleEvent, BattleNotice } from './types';

export const initialBattleNotice = (): BattleNotice => ({ message: 'Battle begins. Your turn.', revision: 0, role: 'status' });

/** Purely formats committed events. Animation frames, rejected commands and empty batches do not revise it. */
export function reduceBattleNotice(previous: BattleNotice, events: readonly BattleEvent[]): BattleNotice {
  let message = previous.message;
  for (const event of events) {
    if (event.kind === 'move') message = `${event.actorId === 'player' ? 'You move' : event.actorId.startsWith('adventurer-') ? 'An adventurer moves' : 'Goblin moves'} ${event.cost} tile${event.cost === 1 ? '' : 's'} (cost ${event.cost} MP).`;
    if (event.kind === 'attack') {
      const actor = event.actorId === 'player' ? 'You attack' : event.actorId.startsWith('adventurer-') ? 'An adventurer attacks' : 'Goblin attacks';
      const target = event.targetId === 'player' ? 'you' : event.targetId.startsWith('adventurer-') ? 'an adventurer' : 'the goblin';
      message = `${actor} ${target} for ${event.damage} damage.`;
    }
    // A bare handoff should not erase the useful last action summary.
    if (event.kind === 'turn-start' && !events.some((item) => item.kind !== 'turn-start')) continue;
    if (event.kind === 'finished') {
      const outcome = event.outcome === 'victory' ? 'Victory!' : 'Defeat.';
      message = events.some((item) => item.kind === 'attack') ? `${message} ${outcome}` : outcome;
    }
    if (event.kind === 'combatant-joined') message = `${event.actorId.startsWith('adventurer-') ? 'An adventurer' : 'A goblin'} joins the battle and acts next round.`;
  }
  if (events.some((event) => event.kind === 'attack') && events.some((event) => event.kind === 'turn-start')) {
    const turn = events.find((event) => event.kind === 'turn-start');
    message += ` ${turn?.actorId === 'player' ? 'Your turn.' : 'Goblin turn.'}`;
  }
  return message === previous.message ? previous : { message, revision: previous.revision + 1, role: 'status' };
}
