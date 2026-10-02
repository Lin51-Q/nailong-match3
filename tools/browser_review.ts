import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { platform, release, cpus } from 'node:os'
import { applyAction, createGame } from '../src/game/engine'
import { chooseAction } from './strategy'
import { freshSave, SAVE_KEY } from '../src/storage'
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:1000}})
const errors:string[]=[]
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()}: ${r.url()}`)})
await page.addInitScript(({key,save})=>localStorage.setItem(key,JSON.stringify(save)),{key:SAVE_KEY,save:{...freshSave(),unlocked:20,muted:true,reducedMotion:false,seenTutorials:[1,6,11]}})
await page.goto('http://127.0.0.1:4173/nailong-match3/?seed=100');await page.locator('[data-action="start"]:enabled').waitFor()
await page.locator('[data-action="start"]').click()
// String evaluation avoids the TypeScript runner injecting closure helpers into browser code.
const frames=page.evaluate<number[]>(`new Promise(resolve => {
  const times=[]; let previous=performance.now(), start=previous;
  function tick(t) { times.push(t-previous); previous=t; if(t-start>=8000)resolve(times);else requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
})`)
let s=createGame(20,100)
for(let turn=0;turn<7&&s.status==='playing';turn++){
  const action=chooseAction(s),box=await page.locator('#board').boundingBox()
  if(action.type==='swap')for(const i of [action.from,action.to])await page.mouse.click(box!.x+(i%8+.5)*box!.width/8,box!.y+(Math.floor(i/8)+.5)*box!.height/8)
  else if(action.type==='hammer'){await page.locator('[data-action="hammer"]').click();await page.mouse.click(box!.x+(action.index%8+.5)*box!.width/8,box!.y+(Math.floor(action.index/8)+.5)*box!.height/8)}
  else await page.locator('[data-action="shuffle"]').click()
  s=applyAction(s,action).state
  if(s.status==='playing')await page.locator('[data-cell="0"]:enabled').waitFor()
  else await page.locator('#modal').waitFor()
}
const deltas=(await frames).filter(t=>t>0),ordered=deltas.slice().sort((a,b)=>a-b)
const mean=deltas.reduce((a,b)=>a+b,0)/deltas.length
const metrics={device:'Development computer, headless Chromium; this is not a physical phone measurement',os:`${platform()} ${release()}`,cpu:cpus()[0].model,browser:browser.version(),viewport:'1440x1000',sampleFrames:deltas.length,sampleMilliseconds:+deltas.reduce((a,b)=>a+b,0).toFixed(1),meanFrameMs:+mean.toFixed(2),p95FrameMs:+ordered[Math.floor(ordered.length*.95)].toFixed(2),estimatedFPS:+(1000/mean).toFixed(1),gameplayActions:7,pageErrors:errors}
mkdirSync('docs',{recursive:true});writeFileSync('docs/performance.json',JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics,null,2))
await browser.close()
