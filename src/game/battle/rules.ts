import type { Point } from '../types';
import type { BattleCombatant } from './types';
export const BATTLE_GRID = { width: 10, height: 10 } as const;
export const PLAYER_BATTLE_STATS = { attack: 4, maxHp: 12, maxAp: 1, maxMp: 3 } as const;
export const GOBLIN_BATTLE_STATS = { attack: 3, maxHp: 8, maxAp: 1, maxMp: 3 } as const;
export const createCombatant = (id: string, side: 'player' | 'goblin', position: Point): BattleCombatant => {
  const stats = side === 'player' ? PLAYER_BATTLE_STATS : GOBLIN_BATTLE_STATS;
  return { id, side, position: { ...position }, ...stats, hp: stats.maxHp, ap: stats.maxAp, mp: stats.maxMp };
};
