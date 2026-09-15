import { describe, expect, it } from 'vitest';
import { createInventoryService } from './store';

describe('ground transfers', () => {
  it('leaves ground untouched when the complete requested quantity cannot fit', () => {
    const service = createInventoryService();
    const player = service.register('player', 500, [{ id: 'ration', quantity: 1 }]);
    const npc = service.register('npc', 5000, [{ id: 'stone', quantity: 2 }]);
    service.drop('npc', { col: 1, row: 1 }, 'stone', 2);
    expect(service.takeGround('player', { col: 1, row: 1 }, 'stone', 1)).toEqual({
      ok: false,
      error: 'over-capacity'
    });
    expect(service.groundAt({ col: 1, row: 1 })).toEqual([{ id: 'stone', quantity: 2 }]);
    expect(player.snapshot().stacks).toEqual([{ id: 'ration', quantity: 1 }]);
    void npc;
  });
});
