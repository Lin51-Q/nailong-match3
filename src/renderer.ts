import type { Frame, Move, Snapshot, Tile } from './game/types'
import { EXPRESSIONS } from './resources'
const SPECIAL_LABELS = { none: '', row: '↔', col: '↕', bomb: '✹', rainbow: '✦' }
const ease = (t: number) => 1 - (1 - t) ** 3
export class BoardRenderer {
  private ctx: CanvasRenderingContext2D
  private raf = 0
  private observer: ResizeObserver
  state: Snapshot
  selected = -1
  hint?: Move
  reducedMotion = false
  paused = false
  frame?: Frame
  progress = 0
  hammerMode = false
  private canvas: HTMLCanvasElement
  private images: Map<string, HTMLImageElement>
  constructor(canvas: HTMLCanvasElement, images: Map<string, HTMLImageElement>, initial: Snapshot) {
    this.canvas = canvas; this.images = images
    this.ctx = canvas.getContext('2d')!
    this.state = initial
    this.observer = new ResizeObserver(() => {
      const dpr = Math.min(devicePixelRatio || 1, 2)
      const size = Math.max(1, canvas.getBoundingClientRect().width)
      canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr)
    })
    this.observer.observe(canvas)
    const tick = (time: number) => { this.draw(time); this.raf = requestAnimationFrame(tick) }
    this.raf = requestAnimationFrame(tick)
  }
  destroy(): void { cancelAnimationFrame(this.raf); this.observer.disconnect() }
  cellAt(x: number, y: number): number {
    const r = this.canvas.getBoundingClientRect()
    if (x < r.left || x >= r.right || y < r.top || y >= r.bottom) return -1
    return Math.floor((y - r.top) / r.height * 8) * 8 + Math.floor((x - r.left) / r.width * 8)
  }
  private drawTile(tile: Tile, x: number, y: number, scale = 1, alpha = 1): void {
    const ctx = this.ctx, e = EXPRESSIONS[tile.color]
    ctx.save(); ctx.translate(x + 32, y + 32); ctx.scale(scale, scale); ctx.globalAlpha = alpha
    ctx.fillStyle = e.color; ctx.beginPath(); ctx.roundRect(-28, -25, 56, 55, 13); ctx.fill()
    ctx.fillStyle = e.pale; ctx.beginPath(); ctx.roundRect(-28, -28, 56, 54, 13); ctx.fill()
    ctx.strokeStyle = `${e.color}b0`; ctx.lineWidth = 1.5; ctx.stroke()
    const id = tile.special === 'rainbow' ? 'rainbow' : e.id
    ctx.save(); ctx.beginPath(); ctx.roundRect(-27, -27, 54, 52, 12); ctx.clip()
    ctx.drawImage(this.images.get(id)!, -26, -28, 54, 54); ctx.restore()
    ctx.fillStyle = '#fffdf3'; ctx.beginPath(); ctx.arc(18, 18, 8, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#433545'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(e.mark, 18, 18)
    if (tile.special !== 'none') {
      ctx.fillStyle = tile.special === 'rainbow' ? '#e95273' : '#342d44'
      ctx.beginPath(); ctx.roundRect(-28, -28, 23, 20, [12, 4, 8, 4]); ctx.fill()
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 17px sans-serif'; ctx.fillText(SPECIAL_LABELS[tile.special], -16, -18)
    }
    ctx.restore()
  }
  private draw(time: number): void {
    const ctx = this.ctx
    ctx.setTransform(this.canvas.width / 512, 0, 0, this.canvas.height / 512, 0, 0)
    ctx.clearRect(0, 0, 512, 512)
    const f = this.frame, p = ease(this.progress)
    if (f && f.kind === 'clear' && !this.reducedMotion && f.specials.length) ctx.translate(Math.sin(p * Math.PI * 10) * (1-p) * 2, 0)
    for (let i = 0; i < 64; i++) {
      ctx.fillStyle = (Math.floor(i / 8) + i % 8) % 2 ? '#f2e7cb' : '#f7edd6'
      ctx.beginPath(); ctx.roundRect(i % 8 * 64 + 2, Math.floor(i / 8) * 64 + 2, 60, 60, 14); ctx.fill()
    }
    if (f && ['swap', 'revert', 'fall', 'shuffle'].includes(f.kind)) {
      const old = new Map(f.before.board.flatMap((t, i) => t ? [[t.id, i] as const] : []))
      f.after.board.forEach((tile, i) => {
        if (!tile) return
        const from = old.get(tile.id), destX = i % 8 * 64, destY = Math.floor(i / 8) * 64
        const oldX = from === undefined ? destX : from % 8 * 64
        const oldY = from === undefined ? destY - 512 : Math.floor(from / 8) * 64
        this.drawTile(tile, oldX + (destX-oldX)*p, oldY + (destY-oldY)*p,
          f.kind === 'shuffle' ? .82 + Math.abs(p-.5)*.36 : 1)
      })
    } else if (f?.kind === 'clear') {
      f.before.board.forEach((tile, i) => {
        if (!tile) return
        const hit = f.affected.includes(i)
        this.drawTile(hit ? tile : f.after.board[i] ?? tile, i % 8 * 64, Math.floor(i / 8)*64,
          hit ? Math.max(.01, 1-p) : 1, hit ? 1-p : 1)
      })
      if (!this.reducedMotion) {
        for (const i of f.affected) {
          const e = EXPRESSIONS[f.before.board[i]!.color]
          for (let j = 0; j < 5; j++) {
            const angle = j / 5 * Math.PI*2 + i
            ctx.fillStyle = e.color; ctx.globalAlpha = 1-p
            ctx.beginPath(); ctx.arc(i%8*64+32 + Math.cos(angle)*p*35,
              Math.floor(i/8)*64+32 + Math.sin(angle)*p*35, 4*(1-p), 0, Math.PI*2); ctx.fill()
          }
        }
        ctx.globalAlpha = 1
        for (const effect of f.specials) {
          const x = effect.index % 8 * 64 + 32, y = Math.floor(effect.index / 8)*64+32
          ctx.strokeStyle = `rgba(255,255,255,${1-p})`; ctx.lineWidth = 8*(1-p)+2; ctx.beginPath()
          if (effect.special === 'row') { ctx.moveTo(x-p*512,y); ctx.lineTo(x+p*512,y) }
          else if (effect.special === 'col') { ctx.moveTo(x,y-p*512); ctx.lineTo(x,y+p*512) }
          else ctx.arc(x,y,Math.max(1,p*110),0,Math.PI*2)
          ctx.stroke()
        }
      }
      if (f.points) {
        ctx.globalAlpha = 1-p*.8; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#453047'; ctx.lineWidth = 5
        ctx.textAlign = 'center'; ctx.font = '900 35px sans-serif'
        ctx.strokeText(`+${f.points}`, 256, 262-p*30); ctx.fillText(`+${f.points}`, 256, 262-p*30); ctx.globalAlpha = 1
      }
    } else this.state.board.forEach((t,i) => { if (t) this.drawTile(t,i%8*64,Math.floor(i/8)*64) })
    const ice = f ? f.after.ice : this.state.ice
    ice.forEach((layers,i) => {
      if (!layers) return
      const x=i%8*64+4,y=Math.floor(i/8)*64+4
      ctx.fillStyle = layers===2 ? '#68cde865' : '#b5eff842'; ctx.strokeStyle = '#8dd7ed'; ctx.lineWidth = layers===2 ? 3 : 2
      ctx.beginPath(); ctx.roundRect(x,y,56,56,12); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = '#ffffffba'; ctx.lineWidth = 2; ctx.beginPath();ctx.moveTo(x+7,y+19);ctx.lineTo(x+20,y+6);ctx.stroke()
      ctx.fillStyle = '#226185';ctx.font='bold 12px sans-serif';ctx.textAlign='left';ctx.fillText(layers===2?'❄2':'❄',x+4,y+49)
    })
    if (!f && !this.paused) {
      const highlight = this.selected >= 0 ? [this.selected] : this.hint ? [this.hint.from,this.hint.to] : []
      ctx.strokeStyle = this.hammerMode ? '#df6044' : '#433146'; ctx.lineWidth = 3
      ctx.globalAlpha = this.hint && this.selected<0 && !this.reducedMotion ? .55+.45*Math.sin(time/180)**2 : 1
      highlight.forEach(i => {ctx.beginPath();ctx.roundRect(i%8*64+2,Math.floor(i/8)*64+2,60,60,14);ctx.stroke()})
      ctx.globalAlpha=1
    }
  }
}
