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
  // The logical frame is 24x24, with the feet on y=0 and the head at y=-24.
  if (facing === 'north') {
    g.rect(8, -23 + bob, 8, 6).fill(hair).rect(9, -18 + bob, 6, 5).fill(skin);
    g.rect(7, -13 + bob, 10, 9).fill(coat).rect(5, -13 + bob, 2, 7).fill(trim).rect(17, -13 + bob, 2, 7).fill(trim);
  } else {
    g.rect(8, -23 + bob, 8, 6).fill(hair).rect(9, -18 + bob, 6, 5).fill(skin);
    if (facing === 'south') g.rect(10, -16 + bob, 1, 1).fill('#14213d').rect(14, -16 + bob, 1, 1).fill('#14213d');
    g.rect(7, -13 + bob, 10, 9).fill(coat).rect(5, -12 + bob, 2, 7).fill(trim).rect(17, -12 + bob, 2, 7).fill(trim);
  }
  g.rect(7, -4 + bob, 4, 4 + Math.max(0, step)).fill(boot).rect(13, -4 + bob, 4, 4 + Math.max(0, -step)).fill(boot);
  g.rect(4, -10 + bob, 3, 2).fill(trim).rect(17, -10 + bob, 3, 2).fill(trim);
  if (facing === 'east') g.rect(17, -20 + bob, 3, 8).fill(coat);
  if (facing === 'west') g.rect(4, -20 + bob, 3, 8).fill(coat);
  return g;
}

export function createPlayerSprite(): PlayerSprite {
  const view = new Container(); const shadow = new Graphics().ellipse(12, 0, 8, 2.5).fill({ color: '#18232a', alpha: 0.35 }); view.addChild(shadow);
  const frames = new Map<string, Graphics>();
  for (const facing of directions) for (let index = 0; index < 4; index++) { const g = frame('walk', facing, index); g.visible = false; frames.set(key('walk', facing, index), g); view.addChild(g); }
  for (const facing of directions) for (let index = 0; index < 2; index++) { const g = frame('idle', facing, index); g.visible = false; frames.set(key('idle', facing, index), g); view.addChild(g); }
  const setFrame = (animation: PlayerAnimation, facing: Facing, index: number) => { for (const child of frames.values()) child.visible = false; frames.get(key(animation, facing, index % (animation === 'walk' ? 4 : 2)))!.visible = true; };
  setFrame('idle', 'south', 0);
  return { view, setFrame };
}
