import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from './store.mjs';
test('Arabic tasks, explicit completion, removal and blackout survive restart',()=>{
 const dir=mkdtempSync(join(tmpdir(),'rukn-'));let store=createStore(join(dir,'test.sqlite'));
 try{const id=store.add('مراجعة أهداف اليوم');store.update(id,{done:true});store.update(id,{done:true});store.update(id,{title:'مراجعة أهداف اليوم'});store.blackout(true);store.setNight({enabled:true,start:'22:30',end:'06:45'});store.close();store=createStore(join(dir,'test.sqlite'));const state=store.state();assert.equal(state.todos[0].title,'مراجعة أهداف اليوم');assert.equal(state.todos[0].done,true);assert.equal(state.blackout,true);assert.deepEqual(state.night,{enabled:true,start:'22:30',end:'06:45'});assert.equal(store.update('missing',{done:true}),0);assert.equal(store.remove(id),1);assert.equal(store.state().todos.length,0);store.blackout(false);assert.equal(store.state().blackout,false);}finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('prayer log stores a status per prayer, updates and clears it',()=>{
 const dir=mkdtempSync(join(tmpdir(),'rukn-'));const store=createStore(join(dir,'p.sqlite'));
 try{store.setPrayed('2026-10-20','fajr','qada');store.setPrayed('2026-10-21','dhuhr','late');store.setPrayed('2026-10-21','dhuhr','ontime');store.setPrayed('2026-10-21','asr','late');store.setPrayed('2026-10-21','asr',null);
  assert.deepEqual(store.prayedSince('2026-10-20'),{'2026-10-20':{fajr:'qada'},'2026-10-21':{dhuhr:'ontime'}});assert.deepEqual(store.prayedSince('2026-10-21'),{'2026-10-21':{dhuhr:'ontime'}});}
 finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
