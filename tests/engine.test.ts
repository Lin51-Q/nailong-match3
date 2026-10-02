import { describe, expect, it } from 'vitest'
import { applyAction, createGame, findLegalMoves, findMatches, goalsComplete } from '../src/game/engine'
import { LEVELS, getLevel, stars } from '../src/game/levels'
import type { GameState, Special } from '../src/game/types'
function fixture(): GameState {
  const s=createGame(20,123)
  s.board=Array.from({length:64},(_,i)=>({id:i+1,color:(Math.floor(i/8)*2+i%8)%6,special:'none' as Special}))
  s.nextId=65;s.ice.fill(0)
  return s
}
function set(s:GameState,cells:number[],color:number,special:Special='none'):void{
  cells.forEach(i=>{s.board[i]={...s.board[i]!,color,special}})
}
const clears=(s:GameState,index=63)=>applyAction(s,{type:'hammer',index}).frames.filter(f=>f.kind==='clear')

describe('initialization and levels',()=>{
  it('all 20 levels x 100 seeds are full, settled, reproducible and playable',()=>{
    for(const l of LEVELS)for(let seed=1;seed<=100;seed++){
      const s=createGame(l.id,seed)
      expect(s.board).toHaveLength(64);expect(s.board.every(Boolean)).toBe(true)
      expect(new Set(s.board.map(t=>t!.id)).size).toBe(64)
      expect(findMatches(s.board)).toHaveLength(0);expect(findLegalMoves(s).length).toBeGreaterThan(0)
      expect(s).toEqual(createGame(l.id,seed))
    }
  },30000)
  it('zero seed is normalized and out-of-range level rejected',()=>{
    expect(createGame(1,0).rng).not.toBe(0);expect(()=>getLevel(21)).toThrow()
  })
  it('level targets, center-first ice and two layers match the specification',()=>{
    expect(getLevel(5).scoreTarget).toBe(1400);expect(getLevel(10).collectTarget).toBe(24)
    expect(getLevel(11).ice.filter(Boolean)).toHaveLength(8)
    expect(getLevel(20).ice.filter(Boolean)).toHaveLength(20)
    expect(getLevel(20).ice.filter(n=>n===2)).toHaveLength(4)
    expect(getLevel(20).collectTarget).toBe(28)
  })
  it('star thresholds include exact boundaries',()=>{
    expect(stars({levelId:1,moves:12})).toBe(3);expect(stars({levelId:1,moves:6})).toBe(2);expect(stars({levelId:1,moves:5})).toBe(1)
  })
})
describe('exchanges and matching',()=>{
  it('rejects nonadjacent, wrapped, negative and fractional indices',()=>{
    const s=createGame(1,10)
    for(const [from,to] of [[0,2],[7,8],[-1,0],[0,.5]])expect(applyAction(s,{type:'swap',from,to})).toEqual({state:s,frames:[],accepted:false})
  })
  it('invalid adjacent exchange returns both animation snapshots without spending a move',()=>{
    const s=fixture();const copy=structuredClone(s),r=applyAction(s,{type:'swap',from:0,to:1})
    expect(r.accepted).toBe(false);expect(r.state).toEqual(copy);expect(r.frames.map(f=>f.kind)).toEqual(['swap','revert'])
    expect(r.frames[0].after.board[0]?.id).toBe(s.board[1]?.id);expect(r.frames[1].after.board).toEqual(s.board)
  })
  it('valid exchange spends one move, scores and does not mutate input',()=>{
    const s=createGame(20,9),copy=structuredClone(s),move=findLegalMoves(s)[0],r=applyAction(s,{type:'swap',...move})
    expect(r.accepted).toBe(true);expect(r.state.moves).toBe(s.moves-1);expect(r.state.score).toBeGreaterThan(0)
    expect(s).toEqual(copy);expect(findMatches(r.state.board)).toHaveLength(0);expect(r.state.board.every(Boolean)).toBe(true)
    expect(r.state).toEqual(applyAction(s,{type:'swap',...move}).state)
  })
  it('detects horizontal and vertical runs but not diagonal triples',()=>{
    const s=fixture();set(s,[0,9,18],5);expect(findMatches(s.board)).toHaveLength(0)
    set(s,[24,25,26],1);set(s,[7,15,23],3)
    const runs=findMatches(s.board);expect(runs.some(r=>r.direction==='row'&&r.cells.includes(24))).toBe(true)
    expect(runs.some(r=>r.direction==='col'&&r.cells.includes(7))).toBe(true)
  })
  it.each([['row',[24,25,26,27]],['col',[3,11,19,27]],['rainbow',[24,25,26,27,28]],['bomb',[24,25,26,17,9]]])('creates %s and preserves the creation cell', (kind,cells)=>{
    const s=fixture();set(s,cells as number[],kind==='col'?4:5)
    const f=clears(s)[0],pos=Math.min(...cells as number[])
    expect(f.after.board[pos]?.special).toBe(kind);expect(f.affected).not.toContain(pos)
  })
  it('five-in-line outranks a crossing match',()=>{
    const s=fixture();set(s,[24,25,26,27,28,18,10],5)
    const first=clears(s)[0];expect(first.after.board[10]?.special).toBe('rainbow')
  })
  it('prefers the swapped destination for a four-match',()=>{
    const s=fixture();set(s,[24,25,27,18],5);set(s,[26],2)
    const r=applyAction(s,{type:'swap',from:18,to:26}),f=r.frames.find(f=>f.kind==='clear')!
    expect(r.accepted).toBe(true);expect(f.after.board[26]?.special).toBe('row')
  })
  it('falls keep tile IDs, fill from above, and leave ice fixed',()=>{
    const s=fixture();s.ice[56]=2;s.ice[48]=1
    const r=applyAction(s,{type:'hammer',index:56}),f=r.frames.find(f=>f.kind==='fall')!
    expect(f.after.board[56]?.id).toBe(s.board[48]?.id);expect(f.after.ice[56]).toBe(1);expect(f.after.ice[48]).toBe(1)
    expect(new Set(r.state.board.map(t=>t!.id)).size).toBe(64)
  })
})
describe('specials, chains and tools',()=>{
  it('activates a row special by exchange even without a match',()=>{
    const s=fixture();s.board[24]!.special='row'
    const r=applyAction(s,{type:'swap',from:24,to:25}),f=r.frames.find(f=>f.kind==='clear')!
    expect(r.accepted).toBe(true);for(let i=24;i<32;i++)expect(f.affected).toContain(i)
  })
  it('row/column overlap, recursive bombs and ice are deduplicated',()=>{
    const s=fixture();s.board[27]!.special='row';s.board[28]!.special='col';s.board[12]!.special='bomb';s.ice.fill(2)
    const f=clears(s,27)[0]
    expect(new Set(f.affected).size).toBe(f.affected.length);expect(f.points).toBe(f.affected.length*50)
    expect(f.specials.map(x=>x.index)).toContain(12)
    for(const i of f.affected)expect(f.after.ice[i]).toBe(1)
    expect(f.before.ice.every(n=>n===2)).toBe(true)
  })
  it('rainbow chooses partner color and activates matching colored specials',()=>{
    const s=fixture();s.board[0]!.special='rainbow';s.board[1]!.color=3;s.board[20]!.color=3;s.board[20]!.special='bomb'
    const f=applyAction(s,{type:'swap',from:0,to:1}).frames.find(f=>f.kind==='clear')!
    expect(f.specials).toContainEqual({index:20,special:'bomb'})
    s.board.forEach((t,i)=>{if(t?.color===3&&i!==0)expect(f.affected).toContain(i===1?0:i)})
  })
  it('two rainbows remove all 64 and score once',()=>{
    const s=fixture();s.board[0]!.special='rainbow';s.board[1]!.special='rainbow'
    const f=applyAction(s,{type:'swap',from:0,to:1}).frames.find(f=>f.kind==='clear')!
    expect(f.affected).toHaveLength(64);expect(f.points).toBe(3200)
  })
  it('hammer triggers specials and is free but one-use only',()=>{
    const s=fixture();s.board[27]!.special='bomb'
    const r=applyAction(s,{type:'hammer',index:27}),f=r.frames.find(f=>f.kind==='clear')!
    expect(f.affected).toHaveLength(9);expect(r.state.moves).toBe(s.moves);expect(r.state.tools.hammer).toBe(0)
    expect(applyAction(r.state,{type:'hammer',index:0}).accepted).toBe(false)
  })
  it('shuffle preserves tile inventory, ice, score, progress and moves',()=>{
    const s=fixture();s.score=250;s.collected[3]=4;s.ice[27]=2
    const r=applyAction(s,{type:'shuffle'})
    expect(r.state.board.map(t=>t!.id).sort()).toEqual(s.board.map(t=>t!.id).sort())
    expect(r.state.ice).toEqual(s.ice);expect(r.state.moves).toBe(s.moves);expect(r.state.collected).toEqual(s.collected)
    expect(r.state.score).toBe(s.score);expect(r.state.tools.shuffle).toBe(0)
    expect(findMatches(r.state.board)).toHaveLength(0);expect(findLegalMoves(r.state).length).toBeGreaterThan(0)
  })
  it('dead boards are automatically reshuffled without spending a tool',()=>{
    const s=fixture();expect(findLegalMoves(s)).toHaveLength(0)
    s.rng=1
    const r=applyAction(s,{type:'hammer',index:63})
    expect(r.frames.some(f=>f.kind==='shuffle')).toBe(true)
    expect(findLegalMoves(r.state).length).toBeGreaterThan(0);expect(r.state.tools.shuffle).toBe(1)
  })
  it('impossible shuffle inventory falls back to a settled, playable template',()=>{
    const s=fixture();set(s,Array.from({length:64},(_,i)=>i),0);s.ice[27]=2;s.score=100
    const r=applyAction(s,{type:'shuffle'})
    expect(findMatches(r.state.board)).toHaveLength(0);expect(findLegalMoves(r.state).length).toBeGreaterThan(0)
    expect(r.state.ice[27]).toBe(2);expect(r.state.score).toBe(100);expect(r.state.moves).toBe(s.moves)
  })
  it('cascade scoring caps at five and matches unique removals, collection counts once',()=>{
    for(let seed=1;seed<=60;seed++){
      const s=createGame(20,seed),r=applyAction(s,{type:'swap',...findLegalMoves(s)[0]})
      const waves=r.frames.filter(f=>f.kind==='clear')
      expect(r.state.score).toBe(waves.reduce((sum,f)=>sum+f.affected.length*50*Math.min(f.cascade,5),0))
      const collected=Array(6).fill(0)
      for(const f of waves)for(const i of f.affected){const t=f.before.board[i]!;if(t.special!=='rainbow')collected[t.color]++}
      expect(r.state.collected).toEqual(collected)
    }
  })
})
describe('completion and snapshots',()=>{
  it('last move wins before zero-move loss, after full cascade',()=>{
    const s=createGame(1,1);s.moves=1;s.score=550
    const r=applyAction(s,{type:'swap',...findLegalMoves(s)[0]})
    expect(r.state.moves).toBe(0);expect(r.state.status).toBe('won');expect(findMatches(r.state.board)).toHaveLength(0)
  })
  it('loss only when all goals are not met, and finished games reject actions',()=>{
    const s=createGame(20,1);s.moves=1
    const r=applyAction(s,{type:'swap',...findLegalMoves(s)[0]})
    expect(r.state.status).toBe('lost');expect(applyAction(r.state,{type:'shuffle'}).accepted).toBe(false)
  })
  it('dual targets both required',()=>{
    const s=createGame(20,1);const l=getLevel(20)
    s.collected[l.collectColor]=l.collectTarget;expect(goalsComplete(s)).toBe(false)
    s.ice.fill(0);expect(goalsComplete(s)).toBe(true)
  })
  it('frames are immutable snapshots independent of the result',()=>{
    const s=createGame(20,5),r=applyAction(s,{type:'swap',...findLegalMoves(s)[0]})
    const first=structuredClone(r.frames[0].before);r.state.board[0]!.color=99;r.state.ice[0]=99
    expect(r.frames[0].before).toEqual(first);expect(s.board[0]?.color).not.toBe(99)
  })
})
