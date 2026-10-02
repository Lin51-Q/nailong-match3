import { expect, it } from 'vitest'
import { freshSave, readSave, recordWin, writeSave } from '../src/storage'
import { createGame } from '../src/game/engine'
it('restores saved progress, sound, motion and tutorials',()=>{
  const save={...freshSave(),unlocked:6,muted:true,reducedMotion:true,seenTutorials:[1,6]}
  let raw='';expect(writeSave(save,{setItem:(_,v)=>{raw=v}})).toBe(true)
  expect(readSave({getItem:()=>raw})).toEqual(save)
})
it('invalid JSON, invalid schema and denied reads fall back safely',()=>{
  for(const raw of ['{broken','null','{"version":2}','{"version":1,"unlocked":900,"results":{}}'])
    expect(readSave({getItem:()=>raw}).unlocked).toBe(1)
  expect(readSave({getItem:()=>{throw new Error('denied')}}).unlocked).toBe(1)
  expect(writeSave(freshSave(),{setItem:()=>{throw new Error('quota')}})).toBe(false)
})
it('filters invalid records and keeps independently best score and stars',()=>{
  const save=freshSave(),s=createGame(1,1);s.status='won';s.score=1000;s.moves=12
  const first=recordWin(save,s);expect(first.unlocked).toBe(2)
  s.score=1600;s.moves=1
  const next=recordWin(first,s);expect(next.results[1]).toEqual({score:1600,stars:3})
  const raw=JSON.stringify({...next,results:{...next.results,'30':{score:5,stars:3},'2':{score:-1,stars:1}}})
  expect(readSave({getItem:()=>raw}).results).toEqual(next.results)
  s.status='lost';expect(recordWin(next,s)).toBe(next)
})
