import express from 'express';
import {createPrayerService} from './prayer.mjs';
import {createStore,WIDGETS} from './store.mjs';
import {createObsidianTasks,parseReminders,REMINDER_TEMPLATE} from './obsidian.mjs';
import {createWeather,createOmarchyTheme,createImmich} from './integrations.mjs';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync, watch } from 'node:fs';
import { resolve, dirname } from 'node:path';
const ADHAN_URL='https://mawaqit.net/static/mp3/adhan-afassy.mp3';
// config.json in the data directory, every key optional:
//  obsidianSources   files and/or folders (with subfolders) to read tasks from; default: the folder of obsidianTasks
//  obsidianTasks     Markdown file new tasks go to when all sources are shown. Without it tasks stay in SQLite.
//  obsidianReminders reminders file (default: 3-reminders.md next to obsidianTasks, created with examples)
//  weather           {lat, lon}, default Hamburg
//  immich            {url, apiKey} for "on this day" memories
export function createApp(dbPath, dist = resolve('dist'), config={}) {
 const dataDir=dirname(dbPath);
 const store=createStore(dbPath);
 const prayers=createPrayerService(resolve(dataDir,'prayer-cache.json'));
 const app=express(), clients=new Set();
 const version=existsSync(resolve(dist,'index.html'))?createHash('sha256').update(readFileSync(resolve(dist,'index.html'))).digest('hex').slice(0,16):'development';
 const sources=config.obsidianSources?.length?config.obsidianSources:config.obsidianTasks?[dirname(config.obsidianTasks)]:[];
 const remindersFile=config.obsidianReminders||(config.obsidianTasks&&resolve(dirname(config.obsidianTasks),'3-reminders.md'));
 const obsidian=config.obsidianTasks?createObsidianTasks({sources,defaultFile:config.obsidianTasks,exclude:[remindersFile]},()=>broadcast()):null;
 const tasks=obsidian||{list:()=>store.state().todos,add:t=>store.add(t),update:store.update,remove:store.remove};
 if(remindersFile&&!existsSync(remindersFile)&&existsSync(dirname(remindersFile)))writeFileSync(remindersFile,REMINDER_TEMPLATE);
 const reminderWatch=remindersFile&&existsSync(dirname(remindersFile))&&!obsidian?watch(dirname(remindersFile),()=>broadcast()):null;
 const reminders=()=>{try{return remindersFile?parseReminders(readFileSync(remindersFile,'utf8')):[];}catch{return [];}};
 const weather=createWeather(config.weather);
 const omarchy=createOmarchyTheme(()=>broadcast());
 const immich=createImmich(config.immich,dataDir);
 const state=()=>{const {todos,...rest}=store.state();const files=obsidian?.files()||[];
  // Notes are shown unless hidden, so a new note in a source folder appears by itself.
  const visible=files.filter(f=>!rest.layout.hiddenFiles.includes(f));
  const week=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'}).format(new Date(Date.now()-6*864e5));
  return {...rest,prayed:store.prayedSince(week),todos:obsidian?obsidian.list(visible):todos,tasks:obsidian?{folder:obsidian.label,files,visible}:null,reminders:reminders(),reminderFile:remindersFile?remindersFile.split('/').slice(-2).join('/'):null,omarchy:omarchy.read(),immich:!!immich,version};};
 const broadcast=()=>{const msg=`data: ${JSON.stringify(state())}\n\n`; for(const client of clients) client.write(msg);};
 app.use((req,res,next)=>{
  if(['POST','PATCH','DELETE'].includes(req.method)) {
   const origin=req.get('origin');
   if(origin && new URL(origin).host!==req.get('host')) return res.status(403).json({error:'Cross-origin request denied'});
   if(!req.is('application/json')) return res.status(415).json({error:'JSON required'});
  }
  next();
 });
 app.use(express.json({limit:'8kb'}));
 app.get('/api/state',(_req,res)=>res.set('Cache-Control','no-store').json(state()));
 app.get('/api/events',(req,res)=>{
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();clients.add(res);res.write(`data: ${JSON.stringify(state())}\n\n`);
  const timer=setInterval(()=>res.write(': heartbeat\n\n'),20000);
  req.on('close',()=>{clearInterval(timer);clients.delete(res);});
 });
 app.post('/api/todos',(req,res)=>{
  const title=typeof req.body.title==='string'?req.body.title.trim():'';
  if(!title || title.length>240) return res.status(400).json({error:'Title must contain 1–240 characters'});
  // New tasks go to the default note while it is shown, otherwise to the first shown note.
  const shown=state().tasks?.visible||[];const id=tasks.add(title,shown.includes(obsidian?.defaultFile)||!shown.length?undefined:shown[0]);broadcast();res.status(201).json({id});
 });
 app.patch('/api/todos/:id',(req,res)=>{
  const {done}=req.body;const title=typeof req.body.title==='string'?req.body.title.trim():undefined;
  if((done!==undefined&&typeof done!=='boolean')||(req.body.title!==undefined&&(!title||title.length>240))||(done===undefined&&title===undefined)) return res.status(400).json({error:'Send done (boolean) or title (1–240 characters)'});
  if(!tasks.update(req.params.id,{done,title})) return res.status(404).json({error:'Task not found'});broadcast();res.json({ok:true});
 });
 app.delete('/api/todos/:id',(req,res)=>{
  if(!tasks.remove(req.params.id)) return res.status(404).json({error:'Task not found'});broadcast();res.json({ok:true});
 });
 app.patch('/api/display',(req,res)=>{
  if(typeof req.body.blackout!=='boolean') return res.status(400).json({error:'Boolean blackout required'});
  store.blackout(req.body.blackout);broadcast();res.json({ok:true});
 });
 app.patch('/api/layout',(req,res)=>{
  const {home,auto,returnAfter,prayerBefore,prayerAfter,theme,accent,hiddenFiles,sides,panel,swipes,followOmarchy,reminderSound}=req.body;const minutes=n=>Number.isInteger(n)&&n>=0&&n<=120;
  if(!Array.isArray(home)||!home.length||home.length>WIDGETS.length||new Set(home).size!==home.length||!home.every(w=>WIDGETS.includes(w))||typeof auto!=='boolean'||!Number.isInteger(returnAfter)||returnAfter<10||returnAfter>3600||!minutes(prayerBefore)||!minutes(prayerAfter)||typeof theme!=='string'||!/^[a-z0-9-]{1,40}$/.test(theme)||typeof accent!=='string'||!/^(#[0-9a-f]{6})?$/.test(accent)||!Array.isArray(hiddenFiles)||hiddenFiles.length>200||!hiddenFiles.every(f=>typeof f==='string'&&f.length<300)||typeof sides!=='object'||!sides||Array.isArray(sides)||!Object.entries(sides).every(([w,v])=>WIDGETS.includes(w)&&(v==='right'||v==='left'))||!Array.isArray(panel)||panel.length>WIDGETS.length||!panel.every(w=>WIDGETS.includes(w))||typeof swipes!=='object'||!swipes||['left','right','up','down'].some(d=>!['prayer','tasks','memories','clock','panel','none'].includes(swipes[d]))||typeof followOmarchy!=='boolean'||!['chime','bell','soft','digital'].includes(reminderSound))return res.status(400).json({error:'Invalid layout'});
  store.setLayout({home,auto,returnAfter,prayerBefore,prayerAfter,theme,accent,hiddenFiles,sides,panel,swipes:{left:swipes.left,right:swipes.right,up:swipes.up,down:swipes.down},followOmarchy,reminderSound});broadcast();res.json({ok:true});
 });
 app.get('/api/prayers',async(_req,res)=>{const data=await prayers.get();res.set('Cache-Control','no-store');if(!data)return res.status(503).json({error:'Prayer times temporarily unavailable'});res.json(data);});
 // Put your own recording at data/adhan.mp3 to replace the default, downloaded once from Mawaqit.
 app.get('/api/adhan',async(_req,res)=>{
  const file=resolve(dataDir,'adhan.mp3');
  try{if(!existsSync(file)){const r=await fetch(ADHAN_URL,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`HTTP ${r.status}`);writeFileSync(file,Buffer.from(await r.arrayBuffer()));}res.set('Cache-Control','max-age=86400').sendFile(file);}
  catch(error){console.error('Adhan download failed:',error.message);res.status(503).json({error:'Adhan audio unavailable'});}
 });
 app.get('/api/weather',async(_req,res)=>{const data=await weather.get();res.set('Cache-Control','no-store');if(!data)return res.status(503).json({error:'Weather unavailable'});res.json(data);});
 app.get('/api/memories',async(_req,res)=>{
  if(!immich)return res.status(404).json({error:'Immich not configured'});
  try{res.set('Cache-Control','no-store').json(await immich.memories());}catch(e){console.error('Immich memories failed:',e.message);res.status(502).json({error:'Immich unavailable'});}
 });
 app.get('/api/memories/photo/:id',async(req,res)=>{
  if(!immich)return res.status(404).end();
  if(!/^[0-9a-f-]{36}$/i.test(req.params.id))return res.status(400).end();
  try{res.set('Cache-Control','private, max-age=604800, immutable').sendFile(await immich.photo(req.params.id,req.query.size==='thumbnail'?'thumbnail':'preview'));}catch(e){res.status(e.status===404?404:502).end();}
 });
 app.patch('/api/prayed',(req,res)=>{
  const {date,prayer,status}=req.body;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['fajr','dhuhr','asr','maghrib','isha'].includes(prayer)||![null,'ontime','late','qada'].includes(status))return res.status(400).json({error:'Send date (YYYY-MM-DD), prayer and status (ontime, late, qada or null)'});
  store.setPrayed(date,prayer,status);broadcast();res.json({ok:true});
 });
 app.patch('/api/night',(req,res)=>{
  const {enabled,start,end}=req.body;const time=/^([01]\d|2[0-3]):[0-5]\d$/;
  if(typeof enabled!=='boolean'||typeof start!=='string'||typeof end!=='string'||!time.test(start)||!time.test(end)||start===end)return res.status(400).json({error:'Choose valid distinct start and end times'});
  store.setNight({enabled,start,end});broadcast();res.json({ok:true});
 });
 app.use('/api',(_req,res)=>res.status(404).json({error:'Not found'}));
 app.use(express.static(dist,{setHeaders:(res,path)=>{if(path.endsWith('.html')) res.set('Cache-Control','no-store');}}));
 app.get('/',(_req,res)=>res.status(503).send('Run npm run build first.'));
 app.use((error,_req,res,_next)=>res.status(error.status===400?400:500).json({error:error.status===400?'Invalid JSON':'Server error'}));
 return {app,close:()=>{for(const client of clients) client.end();obsidian?.close();reminderWatch?.close();omarchy.close();prayers.close();store.close();}};
}
