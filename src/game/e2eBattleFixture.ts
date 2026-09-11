import type { WorldMap } from './types';
export function createBattleFixture(multi = true, encounterAtSpawn = true): WorldMap { const width=12,height=12; const encounter=encounterAtSpawn?{col:1,row:1}:{col:4,row:4}; return { width,height,spawn:{col:1,row:1},disableBattleResponses:true,removeGoblinsAfterBattle:!multi,tiles:Array.from({length:width*height},(_,i)=>({col:i%width,row:Math.floor(i/width),kind:'grass' as const,walkable:true,settlementId:i%width<=3&&Math.floor(i/width)<=3?'fixture-settlement':undefined})),settlements:[{id:'fixture-settlement',name:'Fixture Settlement',kind:'village',countryId:'fixture',col:1,row:1,radius:1,bounds:{left:0,top:0,right:3,bottom:3},gates:[]}],goblinNests:[{id:'fixture-nest',col:encounter.col,row:encounter.row,spawnTiles:multi?[encounter,encounter,encounter]:[encounter,{col:10,row:10},{col:10,row:9}]}]}; }

/** Browser fixture for battle-boundary NPC life and reinforcement admission. */
export function createReinforcementBattleFixture(): WorldMap {
  const width = 20;
  const height = 8;
  return {
    width,
    height,
    spawn: { col: 1, row: 1 },
    tiles: Array.from({ length: width * height }, (_, index) => ({
      col: index % width,
      row: Math.floor(index / width),
      kind: 'grass' as const,
      walkable: true
    })),
    settlements: [
      { id: 'join', name: 'Join', kind: 'village', countryId: 'fixture', col: 7, row: 1, radius: 1, bounds: { left: 6, top: 0, right: 8, bottom: 2 }, gates: [] },
      { id: 'target', name: 'Target', kind: 'village', countryId: 'fixture', col: 10, row: 1, radius: 1, bounds: { left: 9, top: 0, right: 11, bottom: 2 }, gates: [] }
    ],
    goblinNests: [
      { id: 'reinforcement-battle', col: 1, row: 1, spawnTiles: [{ col: 1, row: 1 }, { col: 16, row: 6 }, { col: 17, row: 6 }] },
      { id: 'reinforcement-remote', col: 10, row: 3, spawnTiles: [{ col: 10, row: 3 }, { col: 10, row: 4 }, { col: 11, row: 4 }] }
    ]
  };
}
