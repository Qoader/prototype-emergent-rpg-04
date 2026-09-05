import { describe, expect, it } from 'vitest';
import { cameraForPlayer } from './camera';

describe('camera geometry', () => {
  it('centers the player while clamping world edges', () => {
    expect(cameraForPlayer({ x: 0.5, y: 0.5 }, { width: 100, height: 100 }, { width: 480, height: 480 }, 48)).toEqual({ x: 0, y: 0 });
    expect(cameraForPlayer({ x: 50, y: 50 }, { width: 100, height: 100 }, { width: 480, height: 480 }, 48)).toEqual({ x: -2160, y: -2160 });
  });
});
