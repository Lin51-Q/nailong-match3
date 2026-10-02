import { COLORS, SIZE } from './types'
import type { Action, Board, Frame, GameState, Move, Result, Snapshot, Special, Tile } from './types'
import { getLevel } from './levels'

export const snapshot = (s: Pick<GameState, 'board' | 'ice'>): Snapshot => ({
  board: s.board.map(t => t ? { ...t } : null), ice: [...s.ice],
})
const indexValid = (i: number) => Number.isInteger(i) && i >= 0 && i < SIZE * SIZE
const adjacent = (a: number, b: number) => indexValid(a) && indexValid(b) &&
  Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)) + Math.abs(a % SIZE - b % SIZE) === 1
function random(s: GameState, max: number): number {
  let x = s.rng >>> 0
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5
  s.rng = x >>> 0 || 1
  return Math.floor(s.rng / 4294967296 * max)
}
function tile(s: GameState, color = random(s, COLORS)): Tile {
  return { id: s.nextId++, color, special: 'none' }
}
const swap = (b: Board, a: number, c: number) => { [b[a], b[c]] = [b[c], b[a]] }
const colorAt = (b: Board, i: number) => b[i] && b[i]?.special !== 'rainbow' ? b[i]!.color : -1
export interface Run { cells: number[]; direction: 'row' | 'col' }
export function findMatches(b: Board): Run[] {
  const runs: Run[] = []
  for (const direction of ['row', 'col'] as const) {
    for (let line = 0; line < SIZE; line++) {
      let start = 0
      const cell = (v: number) => direction === 'row' ? line * SIZE + v : v * SIZE + line
      while (start < SIZE) {
        const color = colorAt(b, cell(start)); let end = start + 1
        while (color >= 0 && end < SIZE && colorAt(b, cell(end)) === color) end++
        if (color >= 0 && end - start >= 3) runs.push({ direction, cells: Array.from({ length: end - start }, (_, j) => cell(start + j)) })
        start = end
      }
    }
  }
  return runs
}
function canSwap(b: Board, a: number, c: number): boolean {
  if (!b[a] || !b[c]) return false
  if (b[a]!.special !== 'none' || b[c]!.special !== 'none') return true
  swap(b, a, c)
  const valid = findMatches(b).some(r => r.cells.includes(a) || r.cells.includes(c))
  swap(b, a, c)
  return valid
}
export function findLegalMoves(s: Pick<GameState, 'board'>): Move[] {
  const moves: Move[] = []
  for (let i = 0; i < 64; i++) {
    if (i % 8 < 7 && canSwap(s.board, i, i + 1)) moves.push({ from: i, to: i + 1 })
    if (i < 56 && canSwap(s.board, i, i + 8)) moves.push({ from: i, to: i + 8 })
  }
  return moves
}
function guaranteedBoard(s: GameState): void {
  // Latin-pattern board with an embedded ABA / B motif at the top-left.
  const palette = Array.from({ length: 6 }, (_, i) => i)
  for (let i = 5; i > 0; i--) { const j = random(s, i + 1); [palette[i], palette[j]] = [palette[j], palette[i]] }
  s.board = Array.from({ length: 64 }, (_, i) => tile(s, palette[(Math.floor(i / 8) * 2 + i % 8) % 6]))
  s.board[0]!.color = palette[0]; s.board[1]!.color = palette[1]; s.board[2]!.color = palette[0]; s.board[9]!.color = palette[0]
}
function generate(s: GameState): void {
  for (let attempt = 0; attempt < 100; attempt++) {
    s.board = Array<null>(64).fill(null)
    for (let i = 0; i < 64; i++) {
      const available = Array.from({ length: 6 }, (_, c) => c).filter(c =>
        !(i % 8 >= 2 && colorAt(s.board, i - 1) === c && colorAt(s.board, i - 2) === c) &&
        !(i >= 16 && colorAt(s.board, i - 8) === c && colorAt(s.board, i - 16) === c))
      s.board[i] = tile(s, available[random(s, available.length)])
    }
    if (findLegalMoves(s).length) return
  }
  guaranteedBoard(s)
}
export function createGame(levelId: number, seed: number = Date.now()): GameState {
  const level = getLevel(levelId)
  const state: GameState = { levelId, board: [], ice: [...level.ice], moves: level.moves,
    score: 0, collected: Array(6).fill(0), tools: { hammer: 1, shuffle: 1 },
    rng: seed >>> 0 || 1, nextId: 1, status: 'playing' }
  generate(state)
  return state
}
function frame(kind: Frame['kind'], before: Snapshot, s: GameState, affected: number[] = [], points = 0,
  cascade = 0, specials: Frame['specials'] = []): Frame {
  return { kind, before, after: snapshot(s), affected, points, cascade, specials }
}
function shuffleBoard(s: GameState): void {
  const original = s.board.slice()
  for (let attempt = 0; attempt < 100; attempt++) {
    s.board = original.slice()
    for (let i = 63; i > 0; i--) swap(s.board, i, random(s, i + 1))
    if (!findMatches(s.board).length && findLegalMoves(s).length) return
  }
  guaranteedBoard(s)
}
function matchGroups(runs: Run[]): Run[][] {
  const groups: Run[][] = []
  for (const run of runs) {
    let group = [run]
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i].some(a => group.some(b => a.cells.some(c => b.cells.includes(c))))) {
        group.push(...groups.splice(i, 1)[0])
      }
    }
    groups.push(group)
  }
  return groups
}
function clearWave(s: GameState, runs: Run[], seeds: number[], cascade: number, frames: Frame[],
  preferred: number[] = [], rainbowColors = new Map<number, number>(), all = false): void {
  const before = snapshot(s)
  const clear = new Set<number>(seeds)
  const creations = new Map<number, Special>()
  for (const group of matchGroups(runs)) {
    const cells = [...new Set(group.flatMap(r => r.cells))].sort((a, b) => a - b)
    cells.forEach(i => clear.add(i))
    const long = group.find(r => r.cells.length >= 5)
    const four = group.find(r => r.cells.length === 4)
    const special: Special = long ? 'rainbow' : group.length >= 2 ? 'bomb' : four ? four.direction : 'none'
    if (special !== 'none') {
      const pos = preferred.find(i => cells.includes(i) && s.board[i]?.special === 'none') ??
        cells.find(i => s.board[i]?.special === 'none')
      if (pos !== undefined) creations.set(pos, special)
    }
  }
  if (all) for (let i = 0; i < 64; i++) clear.add(i)
  const triggered = new Set<number>()
  const activated: Frame['specials'] = []
  // Iterate until no unprocessed special remains in the clear set.
  for (;;) {
    const i = [...clear].find(c => s.board[c] && s.board[c]!.special !== 'none' && !triggered.has(c))
    if (i === undefined) break
    triggered.add(i)
    const t = s.board[i]!
    activated.push({ index: i, special: t.special })
    if (t.special === 'row') for (let c = 0; c < 8; c++) clear.add(Math.floor(i / 8) * 8 + c)
    if (t.special === 'col') for (let r = 0; r < 8; r++) clear.add(r * 8 + i % 8)
    if (t.special === 'bomb') for (let r = Math.max(0, Math.floor(i / 8) - 1); r <= Math.min(7, Math.floor(i / 8) + 1); r++)
      for (let c = Math.max(0, i % 8 - 1); c <= Math.min(7, i % 8 + 1); c++) clear.add(r * 8 + c)
    if (t.special === 'rainbow') {
      const target = rainbowColors.get(i) ?? s.board.filter(t => t && t.special !== 'rainbow').reduce((acc, t) => {
        acc[t!.color]++; return acc
      }, Array<number>(6).fill(0)).reduce((best, count, color, counts) => count > counts[best] ? color : best, 0)
      s.board.forEach((t, j) => { if (t?.color === target && t.special !== 'rainbow') clear.add(j) })
    }
  }
  const affected: number[] = []
  for (const i of [...clear].sort((a,b) => a-b)) {
    if (!s.board[i] || creations.has(i)) continue
    const t = s.board[i]!
    if (t.special !== 'rainbow') s.collected[t.color]++
    s.board[i] = null
    if (s.ice[i]) s.ice[i]--
    affected.push(i)
  }
  for (const [i, special] of creations) if (s.board[i]) s.board[i] = { ...s.board[i]!, special }
  const points = affected.length * 50 * Math.min(cascade, 5)
  s.score += points
  frames.push(frame('clear', before, s, affected, points, cascade, activated))
}
function fall(s: GameState, frames: Frame[]): void {
  const before = snapshot(s)
  for (let c = 0; c < 8; c++) {
    const live: Tile[] = []
    for (let r = 7; r >= 0; r--) if (s.board[r * 8 + c]) live.push(s.board[r * 8 + c]!)
    for (let r = 7; r >= 0; r--) s.board[r * 8 + c] = live[7 - r] ?? tile(s)
  }
  frames.push(frame('fall', before, s))
}
export function goalsComplete(s: GameState): boolean {
  const level = getLevel(s.levelId)
  return s.score >= level.scoreTarget && s.collected[level.collectColor] >= level.collectTarget && s.ice.every(v => v === 0)
}
export function applyAction(input: GameState, action: Action): Result {
  if (input.status !== 'playing') return { state: input, frames: [], accepted: false }
  const s: GameState = structuredClone(input)
  const frames: Frame[] = []
  let initialSeeds: number[] = [], preferred: number[] = [], all = false
  const rainbowColors = new Map<number, number>()
  if (action.type === 'shuffle') {
    if (!s.tools.shuffle) return { state: input, frames, accepted: false }
    s.tools.shuffle--
    const before = snapshot(s); shuffleBoard(s); frames.push(frame('shuffle', before, s))
  } else {
    if (action.type === 'hammer') {
      if (!indexValid(action.index) || !s.tools.hammer || !s.board[action.index]) return { state: input, frames, accepted: false }
      s.tools.hammer--; initialSeeds = [action.index]
    } else {
      const { from, to } = action
      if (!adjacent(from, to)) return { state: input, frames, accepted: false }
      const before = snapshot(s)
      const valid = canSwap(s.board, from, to)
      swap(s.board, from, to)
      frames.push(frame('swap', before, s, [from, to]))
      if (!valid) {
        const swapped = snapshot(s); swap(s.board, from, to)
        frames.push(frame('revert', swapped, s, [from, to]))
        return { state: input, frames, accepted: false }
      }
      s.moves--
      preferred = [to, from]
      for (const [i, other] of [[to, from], [from, to]]) {
        const t = s.board[i]!
        if (t.special !== 'none') initialSeeds.push(i)
        if (t.special === 'rainbow') {
          if (s.board[other]!.special === 'rainbow') all = true
          else rainbowColors.set(i, s.board[other]!.color)
        }
      }
    }
    let runs = findMatches(s.board), cascade = 1
    while (runs.length || initialSeeds.length) {
      clearWave(s, runs, initialSeeds, cascade, frames, preferred, rainbowColors, all)
      fall(s, frames)
      initialSeeds = []; preferred = []; all = false; rainbowColors.clear()
      runs = findMatches(s.board); cascade++
      if (cascade > 100) { const before = snapshot(s); generate(s); frames.push(frame('shuffle', before, s)); break }
    }
  }
  if (goalsComplete(s)) s.status = 'won'
  else if (s.moves <= 0) s.status = 'lost'
  else if (!findLegalMoves(s).length) { const before = snapshot(s); shuffleBoard(s); frames.push(frame('shuffle', before, s)) }
  return { state: s, frames, accepted: true }
}
