import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { applyAction, createGame, findLegalMoves } from '../src/game/engine'
import { freshSave, SAVE_KEY } from '../src/storage'
import { chooseAction } from '../tools/strategy'
import type { Action, GameState } from '../src/game/types'
const screenshotRoot=process.env.PUBLIC_GAME_URL?'docs/public-screenshots':'docs/screenshots'

async function prepare(page:Page,unlocked=1,motion=true):Promise<void>{
  await page.addInitScript(({key,save})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(save))},{key:SAVE_KEY,save:{...freshSave(),unlocked,reducedMotion:motion,seenTutorials:[1,6,11]}})
  await page.goto('./?seed=12345')
  await expect(page.locator('[data-action="start"]')).toBeEnabled()
}
async function clickCell(page:Page,i:number):Promise<void>{
  const box=await page.locator('#board').boundingBox();if(!box)throw new Error('Missing canvas')
  const x=box.x+(i%8+.5)*box.width/8,y=box.y+(Math.floor(i/8)+.5)*box.height/8
  if(test.info().project.name.endsWith('mobile'))await page.touchscreen.tap(x,y)
  else await page.mouse.click(x,y)
}
async function playAction(page:Page,action:Action):Promise<void>{
  if(action.type==='swap'){await clickCell(page,action.from);await clickCell(page,action.to)}
  else if(action.type==='hammer'){await page.locator('[data-action="hammer"]').click();await clickCell(page,action.index)}
  else await page.locator('[data-action="shuffle"]').click()
}
async function expectState(page:Page,s:GameState):Promise<void>{
  if(s.status==='playing')await expect(page.locator('[data-cell="0"]')).toBeEnabled()
  else await expect(page.locator('#modal')).toBeVisible()
  await expect(page.locator('#moves')).toHaveText(String(s.moves))
  await expect(page.locator('#score')).toHaveText(s.score.toLocaleString('zh-CN'))
}
test('home, tutorial, levels and asset paths are usable',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.url())})
  await page.goto('./?seed=12345');await expect(page.locator('[data-action="start"]')).toBeEnabled()
  await expect(page).toHaveTitle(/奶龙消消乐/)
  await expect(page.locator('h1')).toContainText('消消乐')
  await page.screenshot({path:`${screenshotRoot}/${info.project.name}-home.png`,fullPage:true})
  await page.locator('[data-action="levels"]').click();await expect(page.locator('.level-card')).toHaveCount(20)
  await expect(page.locator('[data-level="2"]')).toBeDisabled()
  await page.locator('[data-level="1"] .level-title').click()
  await expect(page.locator('#modal')).toContainText('划一下，快乐三连')
  await page.locator('[data-action="tutorial-done"]').click();await expect(page.locator('#modal')).not.toBeVisible()
  await expect(page.locator('#moves')).toHaveText('24');expect(errors).toEqual([])
})
test('real pointer exchange, input lock, free hammer and shuffle',async({page},info)=>{
  await prepare(page,20,false);await page.locator('[data-action="start"]').click()
  let s=createGame(20,12345),action:Action={type:'swap',...findLegalMoves(s)[0]}
  await playAction(page,action);await expect(page.locator('[data-action="shuffle"]')).toBeDisabled()
  // Extra taps during animation must be ignored.
  await clickCell(page,0);await clickCell(page,1)
  s=applyAction(s,action).state;await expectState(page,s)
  action={type:'hammer',index:27};await playAction(page,action);s=applyAction(s,action).state;await expectState(page,s)
  await expect(page.locator('[data-action="hammer"]')).toBeDisabled()
  action={type:'shuffle'};await playAction(page,action);s=applyAction(s,action).state;await expectState(page,s)
  await expect(page.locator('[data-action="shuffle"]')).toBeDisabled()
  const dims=await page.locator('#board').boundingBox();expect(dims!.width).toBeCloseTo(dims!.height,0)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:`${screenshotRoot}/${info.project.name}-game.png`,fullPage:true})
})
test('restart cancels an old animation and pause resumes safely',async({page})=>{
  await prepare(page,1,false);await page.locator('[data-action="start"]').click()
  await playAction(page,{type:'swap',...findLegalMoves(createGame(1,12345))[0]})
  await page.locator('[data-action="pause"]').click();await expect(page.locator('#modal')).toContainText('奶龙也要歇一歇')
  await page.locator('[data-action="retry"]').click();await expect(page.locator('#moves')).toHaveText('24')
  await page.waitForTimeout(1200);await expect(page.locator('#score')).toHaveText('0')
  await page.locator('[data-action="pause"]').click();await page.locator('#modal .primary-button[data-action="close"]').click()
  await expect(page.locator('#modal')).not.toBeVisible();await expect(page.locator('[data-action="hammer"]')).toBeEnabled()
})
test('sound, motion and broken storage survive refresh',async({page})=>{
  await page.goto('./');await expect(page.locator('[data-action="start"]')).toBeEnabled()
  await page.getByRole('button',{name:'关闭声音',exact:true}).click()
  await page.locator('[data-action="help"]').click();await page.locator('#motion-setting').check();await page.locator('#modal .primary-button[data-action="close"]').click()
  await page.reload();await expect(page.getByRole('button',{name:'开启声音',exact:true})).toBeVisible()
  await expect(page.locator('body')).toHaveAttribute('data-motion','reduced')
  await page.evaluate(key=>localStorage.setItem(key,'{broken'),SAVE_KEY);await page.reload()
  await expect(page.locator('[data-action="start"]')).toBeEnabled()
})
test('image load failure has a working retry and denied storage does not block play',async({page})=>{
  await page.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new Error('denied')}})
  await page.route('**/assets/think.webp',route=>route.abort())
  await page.goto('./');await expect(page.locator('[data-action="reload-assets"]')).toBeVisible()
  await expect(page.locator('[data-action="start"]')).toBeDisabled()
  await page.unroute('**/assets/think.webp');await page.locator('[data-action="reload-assets"]').click()
  await expect(page.locator('[data-action="start"]')).toBeEnabled();await page.locator('[data-action="start"]').click()
  await page.locator('[data-action="tutorial-done"]').click();await expect(page.locator('#board')).toBeVisible()
})
test('drag exchange follows one adjacent cell and touch swipe works',async({page},info)=>{
  await prepare(page,20);await page.locator('[data-action="start"]').click()
  const s=createGame(20,12345),move=findLegalMoves(s)[0],b=(await page.locator('#board').boundingBox())!
  const point=(i:number)=>({x:b.x+(i%8+.5)*b.width/8,y:b.y+(Math.floor(i/8)+.5)*b.height/8})
  const from=point(move.from),to=point(move.to)
  if(info.project.name==='chromium-mobile'){
    const client=await page.context().newCDPSession(page)
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]})
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...to,id:1}]})
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    await client.detach()
  }else{
    await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:4});await page.mouse.up()
  }
  await expectState(page,applyAction(s,{type:'swap',...move}).state)
})
test('failed level shows retry and replenishes both free tools',async({page},info)=>{
  await prepare(page,10);await page.locator('[data-action="start"]').click()
  let s=createGame(10,12345)
  while(s.status==='playing'){
    const color=getLevelColor(s)
    const trials=findLegalMoves(s).map(move=>({action:{type:'swap',...move} as Action,result:applyAction(s,{type:'swap',...move})}))
    trials.sort((a,b)=>a.result.state.collected[color]-b.result.state.collected[color]||a.result.state.score-b.result.state.score)
    const next=trials[0];await playAction(page,next.action);s=next.result.state;await expectState(page,s)
  }
  expect(s.status).toBe('lost');await expect(page.locator('#modal')).toContainText('差一点点，再奶一次')
  await page.screenshot({path:`${screenshotRoot}/${info.project.name}-loss.png`,fullPage:true})
  await page.locator('#modal [data-action="retry"]').click();await expect(page.locator('#moves')).toHaveText('28')
  await expect(page.locator('[data-action="hammer"]')).toBeEnabled();await expect(page.locator('[data-action="shuffle"]')).toBeEnabled()
})
function getLevelColor(s:GameState):number{return (s.levelId-1)%6}
for(const id of [1,5,10,15,20])test(`complete level ${id} through the visible board and preserve result`,async({page},info)=>{
  let seed=100,s=createGame(id,seed)
  for(;seed<200;seed++){
    s=createGame(id,seed)
    for(let turns=0;s.status==='playing'&&turns<60;turns++)s=applyAction(s,chooseAction(s)).state
    if(s.status==='won')break
  }
  expect(seed).toBeLessThan(200)
  await prepare(page,id);await page.goto(`./?seed=${seed}`);await expect(page.locator('[data-action="start"]')).toBeEnabled()
  await page.locator('[data-action="start"]').click();s=createGame(id,seed)
  while(s.status==='playing'){
    const action=chooseAction(s);await playAction(page,action);s=applyAction(s,action).state;await expectState(page,s)
  }
  await expect(page.locator('#modal')).toContainText(id===20?'奶龙毕业快乐':'这波，真的熟')
  if(id===1||id===20)await page.screenshot({path:`${screenshotRoot}/${info.project.name}-win-${id}.png`,fullPage:true})
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),SAVE_KEY)
  expect(saved.results[id].score).toBe(s.score);expect(saved.unlocked).toBe(Math.min(20,id+1))
  await page.locator('#modal [data-action="home"]').click();await expect(page.locator('h1')).toBeVisible()
  await page.reload();await expect(page.locator('h1')).toBeVisible()
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).results,SAVE_KEY)).toEqual(saved.results)
})
