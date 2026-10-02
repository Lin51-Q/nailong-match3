import { mkdirSync, writeFileSync } from 'node:fs'
import { applyAction, createGame, findMatches, findLegalMoves } from '../src/game/engine'
import { LEVELS } from '../src/game/levels'
import { chooseAction } from './strategy'
const started=performance.now(),rows=[]
for(const level of LEVELS){
  let won=0,totalMoves=0,firstWin:number|null=null,minMoves=100,maxScore=0
  for(let seed=100;seed<200;seed++){
    let game=createGame(level.id,seed),turns=0
    while(game.status==='playing'&&turns++<60){
      const result=applyAction(game,chooseAction(game))
      if(!result.accepted)throw new Error(`Rejected strategy action: ${level.id}/${seed}`)
      game=result.state
      if(findMatches(game.board).length||game.board.some(t=>!t))throw new Error('Unsettled board')
      if(game.status==='playing'&&!findLegalMoves(game).length)throw new Error('Dead board')
    }
    if(game.status==='playing')throw new Error('Simulation did not finish')
    if(game.status==='won'){won++;firstWin??=seed;totalMoves+=level.moves-game.moves;minMoves=Math.min(minMoves,level.moves-game.moves)}
    maxScore=Math.max(maxScore,game.score)
  }
  const row={level:level.id,seeds:100,won,winRate:won+'%',averageMoves:won?+(totalMoves/won).toFixed(1):null,minMoves:won?minMoves:null,firstWinSeed:firstWin,maxScore}
  rows.push(row);console.log(JSON.stringify(row))
}
mkdirSync('docs',{recursive:true})
writeFileSync('docs/simulation.json',JSON.stringify({strategy:'Greedy immediate goal coverage; uses hammer late. No foresight, no human skill estimate.',seedRange:[100,199],seconds:+((performance.now()-started)/1000).toFixed(2),results:rows},null,2))
