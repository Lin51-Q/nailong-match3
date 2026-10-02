import { findLegalMoves, findMatches } from '../src/game/engine'
import { getLevel } from '../src/game/levels'
import type { Action, GameState, Tile } from '../src/game/types'
export function chooseAction(s:GameState):Action{
  const level=getLevel(s.levelId),iceLeft=s.ice.reduce((a,b)=>a+b,0)
  if(s.tools.hammer&&(iceLeft===1||s.moves<=2)){
    const ice=s.ice.findIndex(v=>v>0)
    const target=s.board.findIndex(t=>t?.color===level.collectColor)
    const special=s.board.findIndex(t=>t&&t.special!=='none')
    return{type:'hammer',index:special>=0?special:ice>=0?ice:target>=0?target:0}
  }
  const moves=findLegalMoves(s)
  if(!moves.length)return{type:'shuffle'}
  let best=moves[0],bestValue=-Infinity
  for(const move of moves){
    const b=s.board.slice();[b[move.from],b[move.to]]=[b[move.to],b[move.from]]
    const hit=new Set<number>(findMatches(b).flatMap(r=>r.cells))
    const process=(t:Tile,i:number)=>{
      if(t.special==='row')for(let c=0;c<8;c++)hit.add(Math.floor(i/8)*8+c)
      if(t.special==='col')for(let r=0;r<8;r++)hit.add(r*8+i%8)
      if(t.special==='bomb')for(let r=Math.max(0,Math.floor(i/8)-1);r<=Math.min(7,Math.floor(i/8)+1);r++)
        for(let c=Math.max(0,i%8-1);c<=Math.min(7,i%8+1);c++)hit.add(r*8+c)
      if(t.special==='rainbow'){
        const other=b[i===move.from?move.to:move.from]!
        b.forEach((tile,j)=>{if(tile!.color===other.color||other.special==='rainbow')hit.add(j)})
      }
    }
    for(const i of [move.from,move.to])if(b[i]!.special!=='none'){hit.add(i);process(b[i]!,i)}
    const processed=new Set<number>()
    for(const i of hit)if(!processed.has(i)){processed.add(i);process(b[i]!,i)}
    let value=hit.size*.2
    for(const i of hit){if(s.ice[i])value+=4;if(level.collectTarget&&s.collected[level.collectColor]<level.collectTarget&&b[i]!.color===level.collectColor)value+=2.5}
    for(const run of findMatches(b))if(run.cells.length>=4)value+=run.cells.length===4?2:5
    if(value>bestValue){bestValue=value;best=move}
  }
  return{type:'swap',...best}
}
