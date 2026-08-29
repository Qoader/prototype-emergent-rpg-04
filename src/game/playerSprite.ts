import { Container, Graphics } from 'pixi.js';
import type { Facing } from './movement';

export type PlayerAnimation = 'idle' | 'walk';
export type PlayerSprite = { view: Container; setFrame: (animation: PlayerAnimation, facing: Facing, index: number) => void };

const directions: Facing[] = ['south', 'west', 'east', 'north'];
const key = (animation: PlayerAnimation, facing: Facing, index: number) => `${animation}:${facing}:${index}`;

function frame(animation: PlayerAnimation, facing: Facing, index: number): Graphics {
  const g = new Graphics();
  const bob = animation === 'idle' ? (index ? -1 : 0) : index % 2;
  const step = animation === 'walk' ? ([0, 1, 0, -1][index] ?? 0) : 0;
  const skin = '#f2b38f'; const hair = '#3c2630'; const coat = '#4c6f8a'; const trim = '#d9b36c'; const boot = '#3a2c32';
  // The logical frame is 48x48, centered on x=0, with the feet on y=0.
  if (facing === 'north') {
    g.rect(-10, -46 + bob, 20, 12).fill(hair).rect(-8, -36 + bob, 16, 10).fill(skin);
    g.rect(-16, -26 + bob, 32, 18).fill(coat).rect(-22, -26 + bob, 6, 14).fill(trim).rect(16, -26 + bob, 6, 14).fill(trim);
  } else {
    g.rect(-10, -46 + bob, 20, 12).fill(hair).rect(-8, -36 + bob, 16, 10).fill(skin);
    if (facing === 'south') g.rect(-5, -32 + bob, 2, 2).fill('#14213d').rect(3, -32 + bob, 2, 2).fill('#14213d');
    if (facing === 'east') g.rect(3, -32 + bob, 2, 2).fill('#14213d');
    if (facing === 'west') g.rect(-5, -32 + bob, 2, 2).fill('#14213d');
    g.rect(-16, -26 + bob, 32, 18).fill(coat).rect(-22, -24 + bob, 6, 14).fill(trim).rect(16, -24 + bob, 6, 14).fill(trim);
  }
  g.rect(-12, -8 + bob, 10, 8 + Math.max(0, step)).fill(boot).rect(2, -8 + bob, 10, 8 + Math.max(0, -step)).fill(boot);
  g.rect(-22, -20 + bob, 6, 4).fill(trim).rect(16, -20 + bob, 6, 4).fill(trim);
  return g;
}

export function createPlayerSprite(): PlayerSprite {
  const view = new Container(); const shadow = new Graphics().ellipse(0, 0, 16, 5).fill({ color: '#18232a', alpha: 0.35 }); view.addChild(shadow);
  const frames = new Map<string, Graphics>();
  for (const facing of directions) for (let index = 0; index < 4; index++) { const g = frame('walk', facing, index); g.visible = false; frames.set(key('walk', facing, index), g); view.addChild(g); }
  for (const facing of directions) for (let index = 0; index < 2; index++) { const g = frame('idle', facing, index); g.visible = false; frames.set(key('idle', facing, index), g); view.addChild(g); }
  const setFrame = (animation: PlayerAnimation, facing: Facing, index: number) => { for (const child of frames.values()) child.visible = false; frames.get(key(animation, facing, index % (animation === 'walk' ? 4 : 2)))!.visible = true; };
  setFrame('idle', 'south', 0);
  return { view, setFrame };
}
