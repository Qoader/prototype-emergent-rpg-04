import { describe, expect, it } from 'vitest';
import { createSearchCueView } from './searchCueRendering';

describe('search cue rendering', () => {
  it('culls against the chest footprint and recreates it after viewport reentry', () => {
    const cues = createSearchCueView();
    const tile = { col: 1, row: 1 };
    // The tile begins at x=48, but its chest starts at x=77; this viewport
    // intersects only the tile, proving culling does not use tile bounds.
    cues.update([tile], { left: 48, top: 48, right: 60, bottom: 60 });
    expect(cues.view.children).toHaveLength(0);
    cues.update([tile], { left: 77, top: 79, right: 93, bottom: 93 });
    expect(cues.view.children).toHaveLength(1);
    const first = cues.view.children[0];
    cues.update([tile], { left: 0, top: 0, right: 10, bottom: 10 });
    expect(first.destroyed).toBe(true);
    expect(cues.view.children).toHaveLength(0);
    cues.update([tile], { left: 77, top: 79, right: 93, bottom: 93 });
    expect(cues.view.children).toHaveLength(1);
    cues.destroy();
    cues.destroy();
  });
});
