import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { BATTLE_RENDER_PADDING, BATTLE_TILE_SIZE, spriteFootPosition } from './battleRendering';
import { createAdventurerSprite, createGoblinSprite, createPlayerSprite } from './playerSprite';

function activeFrame(sprite: ReturnType<typeof createPlayerSprite>): Graphics {
  const frame = sprite.view.children.find((child, index) => index > 0 && child.visible);
  expect(frame).toBeInstanceOf(Graphics);
  return frame as Graphics;
}

describe('character sprites', () => {
  it('keeps the original narrow face on player and adventurer sprites', () => {
    expect(activeFrame(createPlayerSprite()).containsPoint({ x: 12, y: -37 })).toBe(false);
    expect(activeFrame(createAdventurerSprite()).containsPoint({ x: 12, y: -37 })).toBe(false);
  });

  it('uses the wider face shape for goblins', () => {
    expect(activeFrame(createGoblinSprite()).containsPoint({ x: 12, y: -37 })).toBe(true);
  });

  it('keeps every visible player and goblin frame inside the padded battle surface at board edges', () => {
    const surface = BATTLE_TILE_SIZE * 10 + BATTLE_RENDER_PADDING * 2;
    for (const sprite of [createPlayerSprite(), createGoblinSprite()]) {
      for (const animation of ['idle', 'walk'] as const)
        for (const facing of ['north', 'south', 'east', 'west'] as const)
          for (let frame = 0; frame < (animation === 'idle' ? 2 : 4); frame++) {
            sprite.setFrame(animation, facing, frame);
            const bounds = sprite.view.getLocalBounds();
            for (const pose of [
              { x: 0.5, y: 0.5 },
              { x: 9.5, y: 0.5 },
              { x: 0.5, y: 9.5 },
              { x: 9.5, y: 9.5 }
            ]) {
              const foot = spriteFootPosition({ ...pose, facing, moving: animation === 'walk' });
              expect(BATTLE_RENDER_PADDING + foot.x + bounds.minX).toBeGreaterThanOrEqual(0);
              expect(BATTLE_RENDER_PADDING + foot.y + bounds.minY).toBeGreaterThanOrEqual(0);
              expect(BATTLE_RENDER_PADDING + foot.x + bounds.maxX).toBeLessThanOrEqual(surface);
              expect(BATTLE_RENDER_PADDING + foot.y + bounds.maxY).toBeLessThanOrEqual(surface);
            }
          }
    }
  });
});
