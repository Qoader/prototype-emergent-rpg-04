import type { CapturedTileAppearance, Point } from '../types';

export type BattleSide = 'player' | 'goblin';
export type BattleCombatant = {
  id: string;
  side: BattleSide;
  position: Point;
  attack: number;
  maxHp: number;
  hp: number;
  maxAp: number;
  ap: number;
  maxMp: number;
  mp: number;
};
export type BattleOutcome = 'victory' | 'defeat';
export type BattleState = {
  width: number;
  height: number;
  combatants: Record<string, BattleCombatant>;
  turnOrder: string[];
  activeId: string;
  turn: number;
  outcome: BattleOutcome | null;
  log: BattleEvent[];
  /** Immutable terrain captured at encounter start (rendering may repeat it). */
  scene?: BattleScene;
  visual?: Record<string, { x: number; y: number; facing: string; moving: boolean; elapsed?: number }>;
};
export type BattleScene = {
  appearance: CapturedTileAppearance;
};
export type BattleCommand =
  | { kind: 'move'; actorId: string; destination: Point }
  | { kind: 'attack'; actorId: string; targetId: string }
  | { kind: 'end-turn'; actorId: string };
export type BattleEvent =
  | { kind: 'move'; actorId: string; from: Point; to: Point; cost: number; path: Point[] }
  | { kind: 'attack'; actorId: string; targetId: string; damage: number; remainingHp: number }
  | { kind: 'turn-start'; actorId: string; turn: number }
  | { kind: 'finished'; outcome: BattleOutcome };
export type BattleTransition = { state: BattleState; events: BattleEvent[] } | { state: BattleState; error: string; events: [] };
