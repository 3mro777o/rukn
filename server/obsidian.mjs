import {readFileSync,writeFileSync,renameSync,existsSync,readdirSync,statSync,watch} from 'node:fs';
import {join,relative,dirname,basename,sep} from 'node:path';
import {createHash} from 'node:crypto';
const TASK=/^(\s*[-*+] \[)(.)(\] )(.*)$/;
const hash=s=>createHash('sha1').update(s).digest('hex').slice(0,8);
// Obsidian Tasks plugin metadata; the description is everything before the first signifier.
const SIGNIFIER=/[🔺⏫🔼🔽⏬📅⏳🛫✅➕❌🔁🆔⛔]/u;
const PRIORITY={'🔺':5,'⏫':4,'🔼':3,'🔽':1,'⏬':0};
const DATE=(emoji,text)=>text.match(new RegExp(emoji+'\\uFE0F?\\s*(\\d{4}-\\d{2}-\\d{2})','u'))?.[1]||null;
export function parseTask(text){
 const at=text.search(SIGNIFIER);const title=(at<0?text:text.slice(0,at)).trim();const meta=at<0?'':text.slice(at);
 const p=Object.keys(PRIORITY).find(e=>meta.includes(e));
 return {title,meta,priority:p?PRIORITY[p]:2,due:DATE('📅',meta),scheduled:DATE('⏳',meta),start:DATE('🛫',meta),recurring:meta.includes('🔁')};
}
const berlinToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'}).format(new Date());

// Tasks are `- [ ]` lines in Markdown files: every source is a file or a folder (read with its subfolders).
// Everything else in those files is left untouched. Files are named relative to the sources' common parent.
// An id is file hash + line number + line hash, so an edit made in Obsidian meanwhile is detected instead of overwritten.
const commonParent=paths=>paths.map(dirname).reduce((a,b)=>{const x=a.split(sep),y=b.split(sep);let i=0;while(i<x.length&&x[i]===y[i])i++;return x.slice(0,i).join(sep)||sep;});
export function createObsidianTasks({sources,defaultFile,exclude=[]},onChange){
 // A single folder source names files inside it; several sources are named from their common parent.
 const folder=sources.length===1&&existsSync(sources[0])&&statSync(sources[0]).isDirectory()?sources[0]:commonParent(sources);
 const files=()=>{const out=new Set();const walk=dir=>{for(const e of readdirSync(dir,{withFileTypes:true})){if(e.name.startsWith('.')||e.name.includes('.sync-conflict-'))continue;const p=join(dir,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith('.md'))out.add(relative(folder,p));}};
  for(const s of sources){if(!existsSync(s))continue;if(statSync(s).isDirectory())walk(s);else out.add(relative(folder,s));}
  return [...out].filter(f=>!exclude.includes(join(folder,f))).sort();};
 const full=rel=>join(folder,rel);
 const read=rel=>existsSync(full(rel))?readFileSync(full(rel),'utf8'):'';
 const write=(rel,text)=>{const p=full(rel);writeFileSync(p+'.rukn.tmp',text);renameSync(p+'.rukn.tmp',p);};
 const fileId=rel=>hash(rel).slice(0,6);
 function list(selected=files()){
  return selected.flatMap(rel=>read(rel).split('\n').flatMap((line,i)=>{
   const m=line.match(TASK);if(!m||m[2]==='-')return [];const t=parseTask(m[4]);if(!t.title)return [];
   return [{id:`${fileId(rel)}.${i}-${hash(line)}`,file:rel,done:m[2]!==' ',...t,meta:undefined}];
  }));
 }
 function change(id,fn){
  const [fh,rest]=String(id).split('.');const rel=files().find(f=>fileId(f)===fh);if(!rel||!rest)return 0;
  const all=read(rel).split('\n');const [i,h]=rest.split('-');const n=Number(i);
  let at=all[n]!==undefined&&hash(all[n])===h&&TASK.test(all[n])?n:-1;
  if(at<0){const matches=all.flatMap((l,j)=>hash(l)===h&&TASK.test(l)?[j]:[]);if(matches.length===1)at=matches[0];}
  if(at<0)return 0;fn(all,at);write(rel,all.join('\n'));return 1;
 }
 let timer;const changed=(_e,file)=>{if(String(file).endsWith('.md')){clearTimeout(timer);timer=setTimeout(onChange,150);}};
 const watchers=sources.filter(existsSync).map(s=>statSync(s).isDirectory()?watch(s,{recursive:true},changed):watch(dirname(s),(e,f)=>{if(f===basename(s))changed(e,f);}));
 const relDefault=relative(folder,defaultFile);
 return {
  files,list,
  add(title,target=relDefault){const rel=target;const text=read(rel);write(rel,text+(text&&!text.endsWith('\n')?'\n':'')+`- [ ] ${title.replace(/\s+/g,' ')}\n`);return list([rel]).at(-1)?.id;},
  // Completing stamps ✅ date like the Tasks plugin; editing the title keeps the metadata.
  update:(id,{done,title})=>change(id,(all,i)=>{all[i]=all[i].replace(TASK,(_,a,c,b,text)=>{
   let mark=c;if(done!==undefined){mark=done?'x':' ';text=text.replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/u,'');if(done)text=text.trimEnd()+` ✅ ${berlinToday()}`;}
   if(title!==undefined){const t=parseTask(text);text=title.replace(/\s+/g,' ')+(t.meta?' '+t.meta:'');}
   return a+mark+b+text;});}),
  remove:id=>change(id,(all,i)=>all.splice(i,1)),
  defaultFile:relDefault,
  close(){clearTimeout(timer);for(const w of watchers)w.close();},
  label:sources.map(s=>basename(s).replace(/\.md$/,'')).join('، ')
 };
}

// Reminders: one per line in a Markdown file, written by hand in Obsidian.
//   - 2026-10-22 14:00 Call the dentist      once
//   - 09:00 Vitamins                          every day
//   - الجمعة،السبت 10:00 Laundry             on these weekdays
const DAYS=[['sun','sunday','الأحد','الاحد'],['mon','monday','الاثنين','الإثنين'],['tue','tuesday','الثلاثاء'],['wed','wednesday','الأربعاء','الاربعاء'],['thu','thursday','الخميس'],['fri','friday','الجمعة'],['sat','saturday','السبت']];
export function parseReminders(text){
 // Lines inside <!-- comments --> are examples, not reminders; blanking them keeps line numbers stable.
 return text.replace(/<!--[\s\S]*?-->/g,m=>m.replace(/[^\n]/g,'')).split('\n').flatMap((raw,i)=>{
  const line=raw.trim();if(!/^[-*] /.test(line)||/^[-*] \[[xX]\]/.test(line))return [];
  const body=line.replace(/^[-*] (\[ \] )?/,'');
  let m=body.match(/^(\d{4}-\d{2}-\d{2})\s+([01]?\d|2[0-3]):([0-5]\d)\s+(.+)$/);
  if(m)return [{id:`r${i}-${hash(raw)}`,date:m[1],time:`${m[2].padStart(2,'0')}:${m[3]}`,text:m[4]}];
  m=body.match(/^(?:([^\d\s][^\s]*)\s+)?([01]?\d|2[0-3]):([0-5]\d)\s+(.+)$/);if(!m)return [];
  let days=null;
  if(m[1]){days=m[1].toLowerCase().split(/[,،]/).map(d=>DAYS.findIndex(names=>names.includes(d.trim())));if(days.some(d=>d<0)){if(!/^(daily|يوميا|يوميًا|كل-يوم)$/.test(m[1]))return [];days=null;}}
  return [{id:`r${i}-${hash(raw)}`,days,time:`${m[2].padStart(2,'0')}:${m[3]}`,text:m[4]}];
 });
}
export const REMINDER_TEMPLATE=`# تذكيرات

سطر لكل تذكير يبدأ بشرطة. اللوحة تُظهر إشعارًا بصوت في وقته (توقيت هامبورغ).

<!-- أمثلة (انسخ السطر خارج هذا التعليق ليعمل):
- 09:00 تذكير يومي
- الجمعة 12:30 تذكير أسبوعي
- السبت،الأحد 10:00 أكثر من يوم
- 2026-12-31 23:00 تذكير لمرة واحدة
- [x] 10:00 تذكير موقوف
أيام الأسبوع بالعربي أو الإنجليزي: الأحد الاثنين الثلاثاء الأربعاء الخميس الجمعة السبت / sun mon tue wed thu fri sat -->
`;
