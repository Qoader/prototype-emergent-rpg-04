import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
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
});
