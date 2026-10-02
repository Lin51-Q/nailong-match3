export class AudioPlayer {
  private context?: AudioContext
  muted = false
  async unlock(): Promise<void> {
    try { this.context ??= new AudioContext(); if (!document.hidden) await this.context.resume() } catch { /* Sound is optional. */ }
  }
  suspend(): void { void this.context?.suspend().catch(() => {}) }
  play(kind: 'swap' | 'clear' | 'won' | 'lost', cascade = 1): void {
    if (this.muted || document.hidden || this.context?.state !== 'running') return
    const ctx = this.context
    const notes = kind === 'won' ? [523, 659, 784, 1047] : kind === 'lost' ? [392, 330, 262] :
      kind === 'swap' ? [260] : [440 + Math.min(cascade, 5) * 85, 660 + Math.min(cascade, 5) * 85]
    notes.forEach((frequency, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain(), start = ctx.currentTime + i * .07
      osc.type = kind === 'clear' ? 'sine' : 'triangle'; osc.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(.065, start + .012)
      gain.gain.exponentialRampToValueAtTime(.0001, start + .15)
      osc.connect(gain); gain.connect(ctx.destination); osc.start(start); osc.stop(start + .17)
    })
  }
}
