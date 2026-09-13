import { Container, Graphics, Text } from 'pixi.js';
import { TILE_SIZE } from './map';
import { createAdventurerSprite, createGoblinSprite, createPlayerSprite, type PlayerSprite } from './playerSprite';
import type { BattleId, BattleRepresentative, BattleSummary } from './worldBattles';

const REST_SEPARATION = 24;
const IMPACT_INWARD_DISTANCE = 6;
const FOOT_Y_FRACTION = 0.75;

export type WorldBattleAnimationSample = {
  inwardDisplacement: number;
  separation: number;
  moving: boolean;
  impact: number;
  swordOpeningDegrees: number;
  sparkAlpha: number;
};

const smoothstep = (value: number) => value * value * (3 - 2 * value);

/** Pure decorative cycle, shared by fighter and sword presentation. */
export function sampleWorldBattleAnimation(
  elapsedSeconds: number,
  phaseOffset: number,
  clashing: boolean
): WorldBattleAnimationSample {
  if (!clashing) return { inwardDisplacement: 0, separation: REST_SEPARATION, moving: false, impact: 0, swordOpeningDegrees: 20, sparkAlpha: 0 };
  // Normalize tiny floating-point remainder errors at the named keyframes:
  // e.g. 1.45 seconds should sample the same impact pose as .45 seconds.
  const phase = Math.round((((elapsedSeconds + phaseOffset) % 1 + 1) % 1) * 1_000_000) / 1_000_000;
  let inwardDisplacement = 0;
  let moving = false;
  let impact = 0;
  let sparkAlpha = 0;
  if (phase >= .2 && phase < .45) {
    inwardDisplacement = IMPACT_INWARD_DISTANCE * smoothstep((phase - .2) / .25);
    moving = true;
  } else if (phase >= .45 && phase < .55) {
    inwardDisplacement = IMPACT_INWARD_DISTANCE;
    impact = 1;
    sparkAlpha = 1 - (phase - .45) / .1;
  } else if (phase >= .55 && phase < .8) {
    inwardDisplacement = IMPACT_INWARD_DISTANCE * (1 - smoothstep((phase - .55) / .25));
    moving = true;
  }
  return {
    inwardDisplacement,
    separation: REST_SEPARATION - inwardDisplacement,
    moving,
    impact,
    swordOpeningDegrees: 20 * (1 - inwardDisplacement / IMPACT_INWARD_DISTANCE),
    sparkAlpha
  };
}

export function worldBattlePhaseOffset(id: BattleId): number {
  const number = Number(id.slice('battle-'.length));
  return ((Number.isFinite(number) ? number : 0) * .61803398875) % 1;
}

function spriteFor(representative: BattleRepresentative): PlayerSprite {
  if (representative.kind === 'goblin') return createGoblinSprite();
  return representative.kind === 'adventurer' ? createAdventurerSprite() : createPlayerSprite();
}

function createSword(flip: -1 | 1): Container {
  const sword = new Container();
  const blade = new Graphics()
    .poly([-2, 1, -2, -15, 0, -20, 2, -15, 2, 1])
    .fill('#f5e7c0')
    .stroke({ color: '#493d43', width: 1 });
  const guard = new Graphics().rect(-5, -1, 10, 3).fill('#d5aa57').stroke({ color: '#493d43', width: 1 });
  const grip = new Graphics().rect(-1.5, 2, 3, 7).fill('#70452f').stroke({ color: '#493d43', width: 1 });
  sword.addChild(blade, guard, grip);
  sword.scale.x = flip;
  return sword;
}

function createSwords(): { view: Container; left: Container; right: Container; spark: Graphics } {
  const view = new Container();
  const left = createSword(-1);
  const right = createSword(1);
  const spark = new Graphics()
    .moveTo(-6, 0).lineTo(6, 0)
    .moveTo(0, -6).lineTo(0, 6)
    .moveTo(-4, -4).lineTo(4, 4)
    .moveTo(4, -4).lineTo(-4, 4)
    .stroke({ color: '#fff3b0', width: 2 });
  spark.visible = false;
  view.addChild(left, right, spark);
  return { view, left, right, spark };
}

type CharacterResource = { representative: BattleRepresentative; sprite: PlayerSprite };

export type WorldBattleView = {
  fighters: Container;
  overlay: Container;
  update: (summary: BattleSummary, elapsedSeconds: number) => void;
  destroy: () => void;
};

/** A renderer-local Pixi projection of a single battle summary. */
export function createWorldBattleView(summary: BattleSummary): WorldBattleView {
  const fighters = new Container();
  const overlay = new Container();
  fighters.label = 'world-battle-fighters';
  overlay.label = 'world-battle-overlay';
  const swords = createSwords();
  const label = new Text({
    text: '',
    style: { fill: '#fff3b0', fontFamily: 'sans-serif', fontSize: 11, fontWeight: 'bold', stroke: { color: '#241510', width: 2 } }
  });
  label.anchor.set(.5, .5);
  overlay.addChild(swords.view, label);
  let allied: CharacterResource | undefined;
  let opposing: CharacterResource | undefined;
  let destroyed = false;
  const setCharacter = (side: 'allied' | 'opposing', representative: BattleRepresentative | null) => {
    let current = side === 'allied' ? allied : opposing;
    if (!representative) {
      if (current) { current.sprite.view.destroy({ children: true }); current = undefined; }
    } else if (!current || current.representative.kind !== representative.kind) {
      current?.sprite.view.destroy({ children: true });
      current = { representative, sprite: spriteFor(representative) };
      fighters.addChild(current.sprite.view);
    } else current.representative = representative;
    if (side === 'allied') allied = current; else opposing = current;
  };
  const update = (next: BattleSummary, elapsedSeconds: number) => {
    if (destroyed) return;
    setCharacter('allied', next.representatives.allied);
    setCharacter('opposing', next.representatives.opposing);
    const x = (next.tile.col + .5) * TILE_SIZE;
    const footY = (next.tile.row + FOOT_Y_FRACTION) * TILE_SIZE;
    fighters.position.set(x, footY);
    fighters.zIndex = footY;
    overlay.position.set(x, footY);
    const sample = sampleWorldBattleAnimation(elapsedSeconds, worldBattlePhaseOffset(next.id), next.clashing);
    const frame = Math.floor(elapsedSeconds * 10) % 4;
    if (allied) {
      allied.sprite.view.visible = true;
      allied.sprite.view.position.set(Math.round(-sample.separation), 0);
      allied.sprite.setFrame(sample.moving ? 'walk' : 'idle', 'east', sample.moving ? frame : 0);
    }
    if (opposing) {
      opposing.sprite.view.visible = true;
      opposing.sprite.view.position.set(Math.round(sample.separation), 0);
      opposing.sprite.setFrame(sample.moving ? 'walk' : 'idle', 'west', sample.moving ? frame : 0);
    }
    const opening = (45 + sample.swordOpeningDegrees) * Math.PI / 180;
    swords.left.rotation = -opening;
    swords.right.rotation = opening;
    swords.view.position.set(0, -64);
    swords.spark.visible = sample.sparkAlpha > 0;
    swords.spark.alpha = sample.sparkAlpha;
    const text = `${next.adventurers}/${next.goblins}`;
    if (label.text !== text) label.text = text;
    label.position.set(0, 13);
  };
  update(summary, 0);
  return {
    fighters,
    overlay,
    update,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      fighters.removeFromParent();
      overlay.removeFromParent();
      fighters.destroy({ children: true });
      overlay.destroy({ children: true });
    }
  };
}
