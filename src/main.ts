import './style.css'
import { applyAction, createGame, findLegalMoves, snapshot } from './game/engine'
import { getLevel, LEVELS, stars } from './game/levels'
import type { Action, Frame, GameState } from './game/types'
import { EXPRESSIONS, assetUrl, loadResources } from './resources'
import { readSave, recordWin, writeSave } from './storage'
import { AudioPlayer } from './audio'
import { BoardRenderer } from './renderer'

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `<header class="site-header"><button class="brand" data-action="home" aria-label="返回首页"><span class="brand-symbol">✦</span><span>奶龙俱乐部<small>NAILONG CLUB</small></span></button><nav><button class="icon-button" data-action="sound" aria-label="切换声音"></button><button class="text-button" data-action="help">怎么玩 <span>↗</span></button></nav></header><main id="view"></main><footer class="site-footer"><span>快乐不用下载，奶一下就好。</span><span>20 关 · 免费玩 · 本机存档</span></footer><div id="toast" role="status" aria-live="polite"></div><dialog id="modal"></dialog>`
const view = document.querySelector<HTMLElement>('#view')!
const modal = document.querySelector<HTMLDialogElement>('#modal')!
const audio = new AudioPlayer()
let save = readSave(), images: Map<string, HTMLImageElement> | undefined
let resourceError = false, screen: 'home' | 'levels' | 'game' = 'home'
let game: GameState | undefined, renderer: BoardRenderer | undefined
let busy = false, paused = false, session = 0, lastInteraction = performance.now(), hammer = false
let toastTimer = 0, modalCanClose = true, previousFocus: HTMLElement | null = null
let saveWarningShown = false
audio.muted = save.muted
document.body.dataset.motion = save.reducedMotion ? 'reduced' : 'full'

function toast(message: string): void {
  const el = document.querySelector<HTMLElement>('#toast')!
  el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el.classList.remove('visible'), 3000)
}
function persist(): void {
  if (!writeSave(save) && !saveWarningShown) { toast('浏览器无法保存进度，当前仍可正常游玩。'); saveWarningShown = true }
}
function updateSound(): void {
  const b = document.querySelector<HTMLButtonElement>('[data-action="sound"]')!
  b.textContent = save.muted ? '♫̸' : '♫'; b.setAttribute('aria-label', save.muted ? '开启声音' : '关闭声音')
  b.setAttribute('aria-pressed', String(!save.muted))
}
function stopGame(): void {
  session++; renderer?.destroy(); renderer = undefined; busy = false; paused = false; hammer = false
  if (modal.open) modal.close()
}
function showHome(): void {
  stopGame(); screen = 'home'; game = undefined
  const complete = Object.keys(save.results).length, next = save.unlocked
  view.innerHTML = `<section class="home-page"><div class="hero-copy"><div class="eyebrow"><i></i> 快乐营业中 <span>NO BAD VIBES</span></div><h1>奶龙<span>消消乐<span class="title-star">✳</span></span></h1><p class="hero-description">生活已经够难了。<br>来，把不开心<span class="underline">统统消掉。</span></p><div class="hero-actions"><button class="primary-button start-button" data-action="start" ${!images?'disabled':''}>${resourceError?'素材加载失败':!images?'奶龙集合中…':complete?'继续快乐 · 第 '+next+' 关':'开始快乐'}<span>→</span></button><button class="secondary-button" data-action="levels">选关闯关 <span>▦</span></button></div>${resourceError?'<button class="retry-load" data-action="reload-assets">重试加载图片</button>':''}<div class="home-progress"><span class="tiny-portrait"><img src="${assetUrl('smug')}" alt="得意奶龙"></span><div><b>${complete ? `已经拿下 ${complete} / 20 关` : '零压力，快乐三连'}</b><small>无体力限制 · 无需登录 · 随时再来</small></div></div></div><div class="hero-art" aria-label="奶龙消消乐游戏预览"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><div class="bubble-tag">这波我熟！<span>✦</span></div><div class="preview-board">${Array.from({length:24},(_,i)=>{const e=EXPRESSIONS[(i*5+Math.floor(i/4))%6];return `<div class="preview-tile" style="--tile-color:${e.pale};--tile-border:${e.color}"><img src="${assetUrl(e.id)}" alt=""><span>${e.mark}</span></div>`}).join('')}</div><img class="hero-dragon" src="${assetUrl('hero')}" alt="你提供的奶龙角色"><span class="sticker sticker-one">快乐 +999</span><span class="sticker sticker-two">奶力全开 ↗</span><span class="art-spark spark-one">✳</span><span class="art-spark spark-two">✦</span></div></section><section class="feature-strip"><div><span>01</span><b>三只一连，烦恼拜拜</b><small>点击或滑动交换</small></div><div><span>02</span><b>一发火箭，奶力全开</b><small>四连、五连都有惊喜</small></div><div><span>03</span><b>20 关，快乐慢慢来</b><small>进度自动存在本机</small></div></section>`
}
function showLevels(): void {
  stopGame(); screen='levels'; game=undefined
  const complete=Object.keys(save.results).length
  view.innerHTML=`<section class="levels-page"><div class="page-heading"><div><div class="eyebrow">THE HAPPY ROAD</div><h2>快乐，一关一关来<span>✦</span></h2><p>不赶时间，不限体力。今天的奶龙，由你安排。</p></div><span class="progress-stamp">${complete}<small>/ 20 关</small></span></div><div class="level-grid">${LEVELS.map(l=>{const result=save.results[l.id],locked=l.id>save.unlocked;return `<button class="level-card ${locked?'locked':''} ${result?'completed':''} ${l.id===save.unlocked?'current':''}" data-action="level" data-level="${l.id}" ${locked||!images?'disabled':''} aria-label="第${l.id}关 ${l.title}${locked?' 未解锁':''}"><div class="level-top"><span>${l.id<=5?'热身':l.id<=10?'收集':l.id<=15?'破冰':'双重挑战'}</span><span>${locked?'⌑':result?'✓':'↗'}</span></div><strong>${String(l.id).padStart(2,'0')}</strong><span class="level-title">${l.title}</span><span class="level-stars">${result?'★'.repeat(result.stars)+'☆'.repeat(3-result.stars):'☆☆☆'}</span></button>`}).join('')}</div><button class="text-button" data-action="home">← 回到首页</button></section>`
}
function goalMarkup(s: GameState): string {
  const level=getLevel(s.levelId), items: string[]=[]
  const goal=(icon:string,label:string,current:number,total:number)=>`<div class="goal"><span class="goal-icon">${icon}</span><div><div class="goal-label"><span>${label}</span><b>${Math.min(current,total)} <small>/ ${total}</small> ${current>=total?'✓':''}</b></div><div class="goal-track"><i style="width:${Math.min(100,current/total*100)}%"></i></div></div></div>`
  if(level.scoreTarget)items.push(goal('✦','快乐分数',s.score,level.scoreTarget))
  if(level.collectTarget)items.push(goal(`<img src="${assetUrl(EXPRESSIONS[level.collectColor].id)}" alt="">`,EXPRESSIONS[level.collectColor].name,s.collected[level.collectColor],level.collectTarget))
  const total=level.ice.reduce((a,b)=>a+b,0)
  if(total)items.push(goal('❄','破冰进度',total-s.ice.reduce((a,b)=>a+b,0),total))
  return items.join('')
}
function updateHUD(): void {
  if(!game||screen!=='game')return
  document.querySelector('#goals')!.innerHTML=goalMarkup(game)
  document.querySelector('#moves')!.textContent=String(game.moves)
  document.querySelector('#score')!.textContent=game.score.toLocaleString('zh-CN')
  const hb=document.querySelector<HTMLButtonElement>('[data-action="hammer"]')!,sb=document.querySelector<HTMLButtonElement>('[data-action="shuffle"]')!
  hb.disabled=busy||game.status!=='playing'||!game.tools.hammer;sb.disabled=busy||game.status!=='playing'||!game.tools.shuffle
  hb.classList.toggle('active',hammer)
  hb.innerHTML=`<span class="tool-icon">⚒</span><span>小锤子<small>${hammer?'选一只奶龙':'免费 × '+game.tools.hammer}</small></span>`
  sb.innerHTML=`<span class="tool-icon">⤨</span><span>洗牌<small>免费 × ${game.tools.shuffle}</small></span>`
  const current=game
  document.querySelector('#accessible-board')!.innerHTML=current.board.map((t,i)=>`<button type="button" role="gridcell" data-action="cell" data-cell="${i}" ${busy||current.status!=='playing'?'disabled':''} aria-label="第${Math.floor(i/8)+1}行第${i%8+1}列，${t?EXPRESSIONS[t.color].name:''}${t&&t.special!=='none'?'，'+({row:'横向火箭',col:'纵向火箭',bomb:'炸弹',rainbow:'彩虹奶龙',none:''}[t.special]):''}${current.ice[i]?'，'+current.ice[i]+'层冰':''}"></button>`).join('')
}
function startLevel(id: number): void {
  if(!images){toast('奶龙还在集合，请稍等。');return}
  if(id>save.unlocked||id<1||id>20)return
  stopGame();screen='game'
  const querySeed=Number(new URLSearchParams(location.search).get('seed'))
  game=createGame(id,querySeed||Date.now());lastInteraction=performance.now()
  const level=getLevel(id)
  view.innerHTML=`<section class="game-page"><aside class="game-sidebar"><button class="text-button" data-action="levels">← 快乐关卡</button><div class="eyebrow">LEVEL ${String(id).padStart(2,'0')} / 20</div><h2>${level.title}<span>✦</span></h2><p>奶龙说：<br>“这波我熟，你尽管消。”</p><div class="sidebar-mascot"><img src="${assetUrl('hero')}" alt="奶龙为你加油"><span>奶力全开！</span></div><div class="legend"><b>连得越多，快乐越大</b><span>四连 <i>↔</i> 火箭清一排</span><span>T / L 连 <i>✹</i> 炸弹炸九格</span><span>五连 <i>✦</i> 彩虹清同色</span></div></aside><div class="game-stage"><div class="game-top"><div><span class="stage-label">第 ${String(id).padStart(2,'0')} 关</span><strong>${level.title}</strong></div><button class="icon-button pause-button" data-action="pause" aria-label="暂停游戏">Ⅱ</button></div><div class="hud"><div id="goals" class="goals"></div><div class="moves-counter"><span>剩余步数</span><strong id="moves"></strong></div></div><div class="board-shell"><canvas id="board" aria-label="8乘8奶龙三消棋盘，可点击或滑动交换" tabindex="0"></canvas><div id="accessible-board" class="sr-only" role="grid" aria-label="键盘棋盘"></div></div><div class="board-bottom"><div class="tools"><button class="tool-button" data-action="hammer"></button><button class="tool-button" data-action="shuffle"></button></div><div class="score-counter"><span>快乐值</span><b id="score"></b></div></div><div class="game-caption" id="game-caption">横竖三只一起消 · 点击或滑动交换</div></div></section>`
  const canvas=document.querySelector<HTMLCanvasElement>('#board')!
  renderer=new BoardRenderer(canvas,images,snapshot(game));renderer.reducedMotion=save.reducedMotion
  updateHUD();installInput(canvas)
  if(level.tutorial&&!save.seenTutorials.includes(id))showModal(`<div class="modal-eyebrow">奶龙小课堂</div><img class="modal-dragon" src="${assetUrl('think')}" alt="思考奶龙"><h2>${id===1?'划一下，快乐三连':id===6?'奶龙想吃这一口':'把冰块统统奶化'}</h2><p>${level.tutorial}</p><button class="primary-button" data-action="tutorial-done" data-level="${id}">我懂了，开奶！ <span>→</span></button>`)
}
function touch(): void { lastInteraction=performance.now();if(renderer)renderer.hint=undefined;void audio.unlock() }
function selectCell(index:number): void {
  if(!game||!renderer||busy||paused||game.status!=='playing'||index<0)return
  touch()
  if(hammer){void runAction({type:'hammer',index});return}
  if(renderer.selected===index){renderer.selected=-1;return}
  const from=renderer.selected
  if(from>=0&&Math.abs(Math.floor(from/8)-Math.floor(index/8))+Math.abs(from%8-index%8)===1){void runAction({type:'swap',from,to:index});return}
  renderer.selected=index
}
function installInput(canvas:HTMLCanvasElement): void {
  let down:{x:number;y:number;index:number;id:number}|undefined
  canvas.addEventListener('pointerdown',e=>{
    if(busy||paused||!renderer||game?.status!=='playing'||(e.pointerType==='mouse'&&e.button!==0)||down)return
    touch();const index=renderer.cellAt(e.clientX,e.clientY)
    if(index<0)return
    down={x:e.clientX,y:e.clientY,index,id:e.pointerId};canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointerup',e=>{
    if(!down||e.pointerId!==down.id||!renderer)return
    const d=down;down=undefined
    const dx=e.clientX-d.x,dy=e.clientY-d.y,threshold=canvas.getBoundingClientRect().width/8*.25
    if(Math.max(Math.abs(dx),Math.abs(dy))<threshold||hammer){selectCell(d.index);return}
    const offset=Math.abs(dx)>Math.abs(dy)?Math.sign(dx):Math.sign(dy)*8,to=d.index+offset
    if(to>=0&&to<64&&Math.abs(Math.floor(d.index/8)-Math.floor(to/8))+Math.abs(d.index%8-to%8)===1)void runAction({type:'swap',from:d.index,to})
  })
  canvas.addEventListener('pointercancel',()=>{down=undefined})
  canvas.addEventListener('keydown',e=>{
    if(!renderer||busy||paused)return
    const keys:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-8,ArrowDown:8}
    if(e.key in keys){e.preventDefault();touch();const from=renderer.selected<0?0:renderer.selected,to=from+keys[e.key];if(to>=0&&to<64&&(Math.abs(keys[e.key])===8||Math.floor(to/8)===Math.floor(from/8)))renderer.selected=to}
    if(e.key==='Escape'){e.stopPropagation();renderer.selected=-1;hammer=false;renderer.hammerMode=false;updateHUD()}
    if(e.key==='Enter'||e.key===' '){e.preventDefault();showPause()}
  })
}
async function animate(f:Frame,token:number):Promise<boolean>{
  if(!renderer)return false
  const r=renderer;r.frame=f;r.progress=0
  const duration=save.reducedMotion?45:f.kind==='clear'?330:f.kind==='fall'?300:f.kind==='shuffle'?360:170
  if(f.kind==='clear')audio.play('clear',f.cascade)
  if(f.kind==='swap')audio.play('swap')
  let elapsed=0,prev=performance.now()
  return new Promise(resolve=>{
    const tick=(now:number)=>{
      if(token!==session||renderer!==r){resolve(false);return}
      if(!paused&&!document.hidden)elapsed+=Math.min(now-prev,50)
      prev=now;r.progress=Math.min(1,elapsed/duration)
      if(elapsed>=duration){r.state=f.after;r.frame=undefined;resolve(true)}else requestAnimationFrame(tick)
    };requestAnimationFrame(tick)
  })
}
async function runAction(action:Action):Promise<void>{
  if(!game||!renderer||busy||paused||game.status!=='playing')return
  touch();const token=session,result=applyAction(game,action)
  if(!result.frames.length)return
  busy=true;hammer=false;renderer.selected=-1;renderer.hammerMode=false;updateHUD()
  const caption=document.querySelector<HTMLElement>('#game-caption')!
  for(const f of result.frames){
    if(f.kind==='clear'&&f.cascade>1)caption.textContent=['','', '奶龙：这波我熟！','三连快乐，奶力全开！','这也太奶了吧！'][Math.min(f.cascade,4)]
    if(f.kind==='shuffle')caption.textContent=action.type==='shuffle'?'换个阵型，继续快乐！':'没有好走法啦，奶龙免费帮你洗牌！'
    if(!await animate(f,token))return
  }
  if(token!==session)return
  game=result.state;busy=false;lastInteraction=performance.now();updateHUD()
  if(!result.accepted)caption.textContent='差一点！凑够横竖三只再交换，不扣步数哦。'
  else if(game.status!=='playing')showResult()
}
function setPaused(value:boolean):void{paused=value;if(renderer)renderer.paused=value;if(value)audio.suspend();else{touch();void audio.unlock()}}
function showModal(content:string,canClose=true):void{
  previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null
  if(modal.open)modal.close()
  modalCanClose=canClose;modal.innerHTML=`${canClose?'<button class="modal-close" data-action="close" aria-label="关闭">×</button>':''}${content}`
  setPaused(true);modal.showModal()
}
modal.addEventListener('cancel',e=>{if(!modalCanClose)e.preventDefault()})
modal.addEventListener('close',()=>{if(!modal.open){setPaused(false);previousFocus?.focus()}})
modal.addEventListener('click',e=>{if(e.target===modal&&modalCanClose){const r=modal.getBoundingClientRect();const m=e as MouseEvent;if(m.clientX<r.left||m.clientX>r.right||m.clientY<r.top||m.clientY>r.bottom)modal.close()}})
function showPause():void{
  if(screen!=='game'||game?.status!=='playing')return
  showModal(`<div class="modal-eyebrow">TAKE A LITTLE BREAK</div><img class="modal-dragon" src="${assetUrl('happy')}" alt="休息的奶龙"><h2>奶龙也要歇一歇</h2><p>快乐不赶时间。准备好了，我们再来。</p><button class="primary-button" data-action="close">继续快乐 <span>→</span></button><div class="modal-actions"><button class="secondary-button" data-action="retry">重新开始</button><button class="secondary-button" data-action="levels">返回关卡</button></div>`)
}
function showResult():void{
  if(!game)return
  const win=game.status==='won',level=game.levelId
  if(win){save=recordWin(save,game);persist()}
  const star=win?stars(game):0
  showModal(`<div class="modal-eyebrow">${win?'HAPPINESS UNLOCKED':'ONE MORE TRY'}</div><img class="modal-dragon" src="${assetUrl(win?'laugh':'chill')}" alt="${win?'狂笑奶龙':'呆呆奶龙'}"><h2>${win?level===20?'奶龙毕业快乐！':'这波，真的熟！':'差一点点，再奶一次'}</h2>${win?`<div class="result-stars">${'★'.repeat(star)}<span>${'★'.repeat(3-star)}</span></div>`:''}<p>${win?`第 ${level} 关拿下！快乐值 <b>${game.score.toLocaleString('zh-CN')}</b>`:'免费道具会重新补满，奶龙陪你再来。'}</p><button class="primary-button" data-action="${win&&level<20?'next':'retry'}">${win&&level<20?'下一关，接着奶':'再来一局'} <span>→</span></button><div class="modal-actions"><button class="secondary-button" data-action="levels">选择关卡</button><button class="secondary-button" data-action="home">回到首页</button></div>`,false)
  void audio.unlock().then(()=>audio.play(win?'won':'lost'))
}
function showHelp():void{
  showModal(`<div class="modal-eyebrow">HOW TO GET HAPPY</div><h2>快乐说明书 <span>✦</span></h2><div class="help-list"><p><b>01 · 交换三消</b>点击两只相邻奶龙，或向上下左右滑动。横竖三只同类就消除，无效交换不扣步数。</p><p><b>02 · 连消更快乐</b>四连出火箭，T/L型出炸弹，五连出彩虹。特殊棋子和邻居一交换就发动！彩虹清除对方颜色。</p><p><b>03 · 目标要看清</b>达到分数、收集表情或破掉冰块。所有目标完成就过关，最后一步完成也算赢。</p><p><b>04 · 免费帮一把</b>每局一把小锤子、一次洗牌。不扣步数；没有有效走法会自动免费洗牌。</p><p><b>05 · 键盘也能玩</b>Tab进入棋盘的格子按钮，Enter依次选择两格。Canvas上方向键移动选择；Esc取消。</p></div><label class="setting"><span>减少动效<small>关闭震屏与粒子，缩短动画</small></span><input type="checkbox" id="motion-setting" ${save.reducedMotion?'checked':''}></label><button class="primary-button" data-action="close">懂了，快乐去！ <span>→</span></button>`)
}
document.addEventListener('click',e=>{
  const button=(e.target as Element).closest<HTMLElement>('[data-action]');if(!button||button.matches(':disabled'))return
  void audio.unlock()
  switch(button.dataset.action){
    case 'home':showHome();break
    case 'levels':showLevels();break
    case 'start':startLevel(save.unlocked);break
    case 'level':startLevel(Number(button.dataset.level));break
    case 'sound':save.muted=!save.muted;audio.muted=save.muted;if(save.muted)audio.suspend();else void audio.unlock();persist();updateSound();break
    case 'help':showHelp();break
    case 'pause':showPause();break
    case 'close':modal.close();break
    case 'retry':if(game)startLevel(game.levelId);break
    case 'next':if(game)startLevel(Math.min(20,game.levelId+1));break
    case 'tutorial-done':save.seenTutorials=[...new Set([...save.seenTutorials,Number(button.dataset.level)])];persist();modal.close();break
    case 'hammer':if(game?.tools.hammer&&!busy&&!paused&&renderer){touch();hammer=!hammer;renderer.hammerMode=hammer;updateHUD();toast(hammer?'点一只奶龙，小锤子来帮忙。':'已收起小锤子。')}break
    case 'shuffle':void runAction({type:'shuffle'});break
    case 'cell':selectCell(Number(button.dataset.cell));break
    case 'reload-assets':void preload();break
  }
})
document.addEventListener('change',e=>{
  if((e.target as HTMLElement).id==='motion-setting'){
    save.reducedMotion=(e.target as HTMLInputElement).checked
    if(renderer)renderer.reducedMotion=save.reducedMotion
    document.body.dataset.motion=save.reducedMotion?'reduced':'full';persist()
  }
})
document.addEventListener('visibilitychange',()=>{if(document.hidden)audio.suspend();else if(!paused){lastInteraction=performance.now();void audio.unlock()}})
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.open&&screen==='game')showPause()})
setInterval(()=>{
  if(game?.status==='playing'&&renderer&&!busy&&!paused&&!document.hidden&&!hammer&&performance.now()-lastInteraction>=5000)
    renderer.hint=findLegalMoves(game)[0]
},500)
async function preload():Promise<void>{
  resourceError=false;showHome()
  try{images=await loadResources();if(screen==='home')showHome();else if(screen==='levels')showLevels()}
  catch{resourceError=true;if(screen==='home')showHome();toast('图片加载失败，请检查网络后重试。')}
}
updateSound();persist();void preload()
