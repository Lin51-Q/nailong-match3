import { stars } from './game/levels'
import type { GameState } from './game/types'
export const SAVE_KEY = 'nailong-match3.save.v1'
export interface Save {
  version: 1; unlocked: number; results: Record<string, { score: number; stars: number }>;
  muted: boolean; reducedMotion: boolean; seenTutorials: number[]
}
export const freshSave = (): Save => ({ version: 1, unlocked: 1, results: {}, muted: false,
  reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  seenTutorials: [] })
function integer(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
}
export function readSave(storage?: Pick<Storage, 'getItem'>): Save {
  const fallback = freshSave()
  try {
    const raw = (storage ?? localStorage).getItem(SAVE_KEY)
    if (!raw) return fallback
    const data = JSON.parse(raw) as Save
    if (data.version !== 1 || !integer(data.unlocked, 1, 20) || typeof data.results !== 'object' || !data.results) return fallback
    const results: Save['results'] = {}
    for (const [id, value] of Object.entries(data.results)) {
      if (integer(Number(id), 1, 20) && value && integer(value.score, 0, Number.MAX_SAFE_INTEGER) && integer(value.stars, 1, 3)) results[id] = value
    }
    return { ...fallback, unlocked: data.unlocked, results, muted: data.muted === true,
      reducedMotion: typeof data.reducedMotion === 'boolean' ? data.reducedMotion : fallback.reducedMotion,
      seenTutorials: Array.isArray(data.seenTutorials) ? data.seenTutorials.filter(n => integer(n, 1, 20)) : [] }
  } catch { return fallback }
}
export function writeSave(save: Save, storage?: Pick<Storage, 'setItem'>): boolean {
  try { (storage ?? localStorage).setItem(SAVE_KEY, JSON.stringify(save)); return true } catch { return false }
}
export function recordWin(save: Save, game: GameState): Save {
  if (game.status !== 'won') return save
  const result = save.results[game.levelId]
  return { ...save, unlocked: Math.max(save.unlocked, Math.min(20, game.levelId + 1)),
    results: { ...save.results, [game.levelId]: { score: Math.max(result?.score ?? 0, game.score),
      stars: Math.max(result?.stars ?? 0, stars(game)) } } }
}
