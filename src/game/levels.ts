import { SIZE } from './types'
import type { Level } from './types'
const centerOrder = Array.from({ length: SIZE * SIZE }, (_, i) => i).sort((a, b) => {
  const d = (i: number) => (Math.floor(i / SIZE) - 3.5) ** 2 + (i % SIZE - 3.5) ** 2
  return d(a) - d(b) || a - b
})
const titles = ['奶龙初来乍到', '小手一划，快乐到家', '这波我熟！', '连消有点东西', '快乐五连发',
  '今天想吃这一口', '表情收集大师', '奶龙的小心思', '快乐精准投喂', '这口必须安排',
  '冰冰凉，心飞扬', '把冰块都奶化', '破冰行动', '火箭发射！', '奶龙不怕冷',
  '两手都要抓', '奶力全开', '这波双倍快乐', '最后一点小倔强', '奶龙毕业快乐']
export const LEVELS: Level[] = Array.from({ length: 20 }, (_, i) => {
  const n = i + 1
  const iceCount = n < 11 ? 0 : n < 16 ? 8 + 2 * (n - 11) : 12 + 2 * (n - 16)
  const ice = Array<number>(64).fill(0)
  centerOrder.slice(0, iceCount).forEach((cell, j) => { ice[cell] = n >= 19 && j < 4 ? 2 : 1 })
  return { id: n, moves: n <= 5 ? 24 : n <= 10 ? 28 : n <= 15 ? 30 : 36,
    scoreTarget: n <= 5 ? 600 + 200 * (n - 1) : 0,
    collectColor: (n - 1) % 6,
    collectTarget: n <= 5 || (n >= 11 && n <= 15) ? 0 : n <= 10 ? 16 + 2 * (n - 6) : 20 + 2 * (n - 16),
    ice, title: titles[i],
    tutorial: n === 1 ? '点击两只相邻奶龙，或滑动交换。横竖凑够三只就能消除；四连、五连有惊喜！' :
      n === 6 ? '这一关收集指定表情。普通消除、火箭和炸弹都能帮你收集，盯住上方目标！' :
      n === 11 ? '消除冰块所在格的奶龙，就能破冰。冰块跟着格子，不会跟着奶龙掉落。' : undefined }
})
export function getLevel(id: number): Level {
  const level = LEVELS[id - 1]
  if (!level) throw new Error('关卡不存在')
  return level
}
export function stars(state: { levelId: number; moves: number }): number {
  const ratio = state.moves / getLevel(state.levelId).moves
  return ratio >= .5 ? 3 : ratio >= .25 ? 2 : 1
}
