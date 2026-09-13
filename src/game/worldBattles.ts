import type { Point } from './types';
import type { BattleState } from './battle/types';
import type { BattleArrival } from './battle/reinforcements';
import type { BattleCombatant } from './battle/types';

export type BattleId = `battle-${number}`;
export type BattleMemberStage = 'traveling' | 'waiting' | 'participating';
export type BattleRepresentative = Pick<BattleCombatant, 'id' | 'kind'>;
export type BattleSummary = {
  id: BattleId;
  tile: Point;
  adventurers: number;
  goblins: number;
  playerParticipating: boolean;
  /** Decorative map representatives, derived from admitted living combatants. */
  representatives: { allied: BattleRepresentative | null; opposing: BattleRepresentative | null };
  /** False when one side has no living participant or the combat is finished. */
  clashing: boolean;
};
export type WorldBattle = {
  id: BattleId;
  tile: Point;
  battle: BattleState;
  arrivals: BattleArrival[];
  aiWait: number;
};
const tileKey = (point: Point) => `${point.col},${point.row}`;

/** The only owner of a world actor's battle commitment.  Keeping this small
 * registry independent from controller/UI makes concurrent fights explicit. */
export function createWorldBattleRegistry() {
  let next = 1;
  const battles = new Map<BattleId, WorldBattle>();
  const byTile = new Map<string, BattleId>();
  const membership = new Map<string, { battleId: BattleId; stage: BattleMemberStage }>();
  const create = (tile: Point, battle: BattleState): WorldBattle => {
    const existing = byTile.get(tileKey(tile));
    if (existing) return battles.get(existing)!;
    const id = `battle-${next++}` as BattleId;
    const value: WorldBattle = { id, tile: { ...tile }, battle, arrivals: [], aiWait: 0 };
    battles.set(id, value); byTile.set(tileKey(tile), id);
    for (const actorId of Object.keys(battle.combatants)) membership.set(actorId, { battleId: id, stage: 'participating' });
    return value;
  };
  const remove = (id: BattleId) => {
    const battle = battles.get(id); if (!battle) return undefined;
    battles.delete(id); byTile.delete(tileKey(battle.tile));
    for (const [actorId, value] of membership) if (value.battleId === id) membership.delete(actorId);
    return battle;
  };
  const queue = (id: BattleId, arrival: BattleArrival, stage: BattleMemberStage = 'waiting') => {
    const battle = battles.get(id); if (!battle || membership.has(arrival.id)) return false;
    battle.arrivals.push(arrival); membership.set(arrival.id, { battleId: id, stage }); return true;
  };
  const setStage = (actorId: string, stage: BattleMemberStage) => { const value = membership.get(actorId); if (value) value.stage = stage; };
  const release = (actorId: string) => membership.delete(actorId);
  const summaries = (): BattleSummary[] => [...battles.values()].map((value) => {
    let adventurers = 0;
    let goblins = 0;
    let firstAdventurer: BattleRepresentative | null = null;
    let player: BattleRepresentative | null = null;
    let firstGoblin: BattleRepresentative | null = null;
    // Object insertion order is the admission order. It remains stable across
    // turns, unlike turnOrder, so a surviving representative never flickers.
    for (const combatant of Object.values(value.battle.combatants)) {
      if (combatant.hp <= 0) continue;
      const representative = { id: combatant.id, kind: combatant.kind };
      if (combatant.side === 'player') {
        if (combatant.kind === 'adventurer') {
          adventurers += 1;
          firstAdventurer ??= representative;
        } else if (combatant.kind === 'player') player ??= representative;
      } else if (combatant.side === 'goblin') {
        goblins += 1;
        firstGoblin ??= representative;
      }
    }
    const allied = firstAdventurer ?? player;
    const opposing = firstGoblin;
    return {
      id: value.id,
      tile: { ...value.tile },
      adventurers,
      goblins,
      playerParticipating: Boolean(value.battle.combatants.player?.hp > 0),
      representatives: { allied, opposing },
      clashing: value.battle.outcome === null && value.battle.phase !== 'finished' && Boolean(allied && opposing)
    };
  });
  return { create, remove, queue, setStage, release, get: (id: BattleId) => battles.get(id), at: (tile: Point) => { const id = byTile.get(tileKey(tile)); return id ? battles.get(id) : undefined; }, all: () => [...battles.values()], membership: (actorId: string) => membership.get(actorId), summaries };
}
export type WorldBattleRegistry = ReturnType<typeof createWorldBattleRegistry>;
