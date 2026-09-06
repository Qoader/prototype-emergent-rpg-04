import { describe, expect, it } from 'vitest';
import { createCheckpointTracker } from './checkpoints';
describe('settlement checkpoints', () => {
  const settlement = { id:'s', name:'S', kind:'village' as const, countryId:'c', col:1, row:1, radius:1, bounds:{left:0,top:0,right:2,bottom:2}, gates:[] };
  const tiles = { width:3, height:3, getTile: (p:{col:number;row:number}) => ({ ...p, kind:'grass' as const, walkable:p.col !== 0 || p.row !== 0, settlementId:'s' }) };
  it('retains first tile on entry and resolves a valid fallback', () => { const tracker = createCheckpointTracker({col:1,row:1}, [settlement], tiles); tracker.visit({col:2,row:1}); expect(tracker.checkpoint?.tile).toEqual({col:1,row:1}); expect(tracker.resolve()).toEqual({col:1,row:1}); });
});
