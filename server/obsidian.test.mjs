import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createObsidianTasks,parseTask,parseReminders,nextRecurrence,REMINDER_TEMPLATE} from './obsidian.mjs';
test('reads, adds, toggles, renames and removes tasks across a folder without touching other lines',()=>{
 const base=mkdtempSync(join(tmpdir(),'rukn-md-'));const dir=join(base,'X');mkdirSync(dir);const file=join(dir,'todo.md');mkdirSync(join(dir,'sub'));
 writeFileSync(file,'# Notes\nfree text\n- [ ] شراء خبز ⏫ 📅 2026-10-25\n  - [x] nested done ✅ 2026-10-01\n- plain bullet');
 writeFileSync(join(dir,'sub','other.md'),'- [ ] in subfolder 🔽\n');
 const tasks=createObsidianTasks({sources:[dir],defaultFile:file},()=>{});
 try{
  assert.deepEqual(tasks.files(),['sub/other.md','todo.md']);
  assert.deepEqual(tasks.list().map(t=>[t.file,t.title,t.done,t.priority,t.due]),[['sub/other.md','in subfolder',false,1,null],['todo.md','شراء خبز',false,4,'2026-10-25'],['todo.md','nested done',true,2,null]]);
  assert.equal(tasks.list(['sub/other.md']).length,1);
  tasks.add('Call  dentist');tasks.add('there','sub/other.md');
  const [bread,nested,call]=tasks.list(['todo.md']);
  assert.equal(call.title,'Call dentist');
  assert.equal(tasks.update(bread.id,{done:true}),1);
  assert.equal(tasks.update(bread.id,{done:false}),0,'stale id after the line changed');
  assert.equal(tasks.remove(nested.id),1);
  const fresh=tasks.list(['todo.md'])[0];assert.equal(tasks.update(fresh.id,{title:'شراء خبز وحليب'}),1);
  assert.match(readFileSync(file,'utf8'),/^- \[x\] شراء خبز وحليب ⏫ 📅 2026-10-25 ✅ \d{4}-\d{2}-\d{2}\n- plain bullet\n- \[ \] Call dentist\n$/m);
  const undo=tasks.list(['todo.md'])[0];tasks.update(undo.id,{done:false});assert.doesNotMatch(readFileSync(file,'utf8'),/✅/);
  assert.equal(readFileSync(join(dir,'sub','other.md'),'utf8'),'- [ ] in subfolder 🔽\n- [ ] there\n');
  // A line inserted above in Obsidian shifts numbers; the hash still finds the task.
  writeFileSync(file,'new top line\n'+readFileSync(file,'utf8'));
  assert.equal(tasks.update(call.id,{done:true}),1);
 }finally{tasks.close();rmSync(base,{recursive:true,force:true});}
});
test('combines file and folder sources',()=>{
 const base=mkdtempSync(join(tmpdir(),'rukn-src-'));mkdirSync(join(base,'a'));mkdirSync(join(base,'b'));
 writeFileSync(join(base,'a','one.md'),'- [ ] one\n');writeFileSync(join(base,'b','two.md'),'- [ ] two\n');writeFileSync(join(base,'b','skip.md'),'- [ ] skip\n');
 const tasks=createObsidianTasks({sources:[join(base,'a'),join(base,'b','two.md')],defaultFile:join(base,'a','one.md')},()=>{});
 try{assert.deepEqual(tasks.files(),['a/one.md','b/two.md']);assert.deepEqual(tasks.list().map(t=>t.title),['one','two']);}
 finally{tasks.close();rmSync(base,{recursive:true,force:true});}
});
test('parses Tasks plugin metadata',()=>{
 assert.deepEqual(parseTask('Pay rent 🔺 🔁 every month 📅 2026-11-01 ⏳ 2026-10-30'),{title:'Pay rent',meta:'🔺 🔁 every month 📅 2026-11-01 ⏳ 2026-10-30',priority:5,due:'2026-11-01',scheduled:'2026-10-30',start:null,recurring:true});
 assert.equal(parseTask('plain').priority,2);
});
test('parses reminder lines',()=>{
 assert.deepEqual(parseReminders(REMINDER_TEMPLATE),[],'template examples stay inactive');
 const r=parseReminders('# t\n- 9:05 Vitamins\n- الجمعة،sat 12:30 Laundry\n- 2026-10-22 14:00 Dentist\n- [x] 10:00 off\n- daily 07:00 Walk\n- someday 10:00 bad\ntext 10:00 no dash');
 assert.deepEqual(r.map(({id,...x})=>x),[{days:null,time:'09:05',text:'Vitamins'},{days:[5,6],time:'12:30',text:'Laundry'},{date:'2026-10-22',time:'14:00',text:'Dentist'},{days:null,time:'07:00',text:'Walk'}]);
});
test('completing a recurring task adds the next one above it, like the Tasks plugin',()=>{
 assert.equal(nextRecurrence('Quran 🔁 every day'),'Quran 🔁 every day');
 assert.equal(nextRecurrence('Bills 🔁 every month on the 15th ⏳ 2026-10-10 📅 2026-10-15','2026-10-21'),'Bills 🔁 every month on the 15th ⏳ 2026-11-10 📅 2026-11-15');
 assert.equal(nextRecurrence('Run 🔁 every 2 days when done 📅 2026-10-01','2026-10-21'),'Run 🔁 every 2 days when done 📅 2026-10-23');
 assert.equal(nextRecurrence('Gym 🔁 every week on Monday, Friday 📅 2026-10-23'),'Gym 🔁 every week on Monday, Friday 📅 2026-10-26');
 assert.equal(nextRecurrence('Odd 🔁 sometimes maybe 📅 2026-10-23'),null);
 const dir=mkdtempSync(join(tmpdir(),'rukn-rec-'));const file=join(dir,'t.md');
 writeFileSync(file,'# x\n  - [ ] Water plants 🔁 every 3 days 📅 2026-10-21\n- [ ] once\n');
 const tasks=createObsidianTasks({sources:[dir],defaultFile:file},()=>{});
 try{
  const [plant,once]=tasks.list();
  assert.equal(tasks.update(plant.id,{done:true}),1);tasks.update(once.id,{done:true});
  const lines=readFileSync(file,'utf8').split('\n');
  assert.equal(lines[1],'  - [ ] Water plants 🔁 every 3 days 📅 2026-10-24');
  assert.match(lines[2],/^  - \[x\] Water plants 🔁 every 3 days 📅 2026-10-21 ✅ \d{4}-\d{2}-\d{2}$/);
  assert.match(lines[3],/^- \[x\] once ✅/);assert.equal(lines.length,5);
 }finally{tasks.close();rmSync(dir,{recursive:true});}
});
