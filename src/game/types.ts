export const SIZE = 8
export const COLORS = 6
export type Special = 'none' | 'row' | 'col' | 'bomb' | 'rainbow'
export interface Tile { id: number; color: number; special: Special }
export type Board = (Tile | null)[]
export interface Level {
  id: number; moves: number; scoreTarget: number; collectColor: number;
  collectTarget: number; ice: number[]; title: string; tutorial?: string
}
export interface GameState {
  levelId: number; board: Board; ice: number[]; moves: number; score: number;
  collected: number[]; tools: { hammer: number; shuffle: number };
  rng: number; nextId: number; status: 'playing' | 'won' | 'lost'
}
export interface Snapshot { board: Board; ice: number[] }
export interface Frame {
  kind: 'swap' | 'revert' | 'clear' | 'fall' | 'shuffle';
  before: Snapshot; after: Snapshot; affected: number[];
  points: number; cascade: number; specials: { index: number; special: Special }[]
}
export type Action = { type: 'swap'; from: number; to: number } |
  { type: 'hammer'; index: number } | { type: 'shuffle' }
export interface Result { state: GameState; frames: Frame[]; accepted: boolean }
export interface Move { from: number; to: number }
