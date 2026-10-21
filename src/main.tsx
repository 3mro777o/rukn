import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import {isNight,type NightSchedule} from '../shared/night.mjs';
import {THEMES,ACCENTS,applyTheme} from './themes';
import {gesture,FACES,WIDGETS,WeatherSheet,MemoriesSheet,PullPanel,NoteChips,sideOf,prayerName,type Ctx,type Lang,type Prayers,type Todo,type Reminder,type Weather,type Memory} from './faces';
import {SOUNDS,playSound,unlockAudio} from './sounds';

type Layout={home:string[];auto:boolean;returnAfter:number;prayerBefore:number;prayerAfter:number;theme:string;accent:string;hiddenFiles:string[];sides:Record<string,'right'|'left'>;panel:string[];swipes:Record<Dir,string>;followOmarchy:boolean;reminderSound:string};
type State={night:NightSchedule;todos:Todo[];blackout:boolean;version:string;layout:Layout;prayed:Record<string,Record<string,string>>;tasks:{folder:string;files:string[];visible:string[]}|null;reminders:Reminder[];reminderFile:string|null;omarchy:Record<string,string>|null;immich:boolean};
// One home screen; every other view opens from it by a swipe (mapped in Settings) or by tapping its widget.
type Dir='left'|'right'|'up'|'down';
const DIRS:Dir[]=['up','down','left','right'];
const faceNames:Record<string,{ar:string;en:string}>={home:{ar:'الرئيسية',en:'Home'},clock:{ar:'الساعة',en:'Clock'},prayer:{ar:'الصلاة',en:'Prayer'},tasks:{ar:'المهام',en:'Tasks'},memories:{ar:'الذكريات',en:'Memories'},panel:{ar:'اللوحة السريعة',en:'Quick panel'},none:{ar:'لا شيء',en:'Nothing'}};
const dirNames:Record<Dir,{ar:string;en:string}>={up:{ar:'اسحب لأعلى',en:'Swipe up'},down:{ar:'اسحب لأسفل',en:'Swipe down'},left:{ar:'اسحب لليسار',en:'Swipe left'},right:{ar:'اسحب لليمين',en:'Swipe right'}};
// Finger direction of a swipe, or null for a tap or a diagonal.
const dirOf=(dx:number,dy:number):Dir|null=>Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.5?(dx<0?'left':'right'):Math.abs(dy)>80&&Math.abs(dy)>Math.abs(dx)*1.5?(dy<0?'up':'down'):null;
const read=(key:string,fallback:string)=>{try{return localStorage.getItem(key)??fallback;}catch{return fallback;}};
const store=(key:string,value:string)=>{try{localStorage.setItem(key,value);}catch{}};

function App(){
 const [lang,setLang]=useState<Lang>(()=>read('language','ar')==='en'?'en':'ar');
 const [state,setState]=useState<State>({night:{enabled:false,start:'23:00',end:'07:00'},todos:[],blackout:false,version:'',layout:{home:['clock','next','prayers','tasks'],auto:true,returnAfter:60,prayerBefore:10,prayerAfter:20,theme:read('theme','lapis'),accent:read('accent',''),hiddenFiles:[],sides:{},panel:['next','prayers','reminders','weather'],swipes:{left:'tasks',right:'memories',up:'prayer',down:'panel'},followOmarchy:false,reminderSound:'chime'},prayed:{},tasks:null,reminders:[],reminderFile:null,omarchy:null,immich:false});
 const [connected,setConnected]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState(false);
 const [now,setNow]=useState(new Date());
 const [prayers,setPrayers]=useState<Prayers|null>(null);const [prayerFailed,setPrayerFailed]=useState(false);
 const [manual,setManual]=useState<{face:string;at:number}|null>(null);const [dismissed,setDismissed]=useState(0);const [pinned,setPinned]=useState(()=>read('pinned',''));
 const [settings,setSettings]=useState(false);const [nightOverride,setNightOverride]=useState(false);
 const [keep,setKeep]=useState(()=>read('keepAwake','true')!=='false');const [wake,setWake]=useState(false);
 const [adhanOn,setAdhanOn]=useState(()=>read('adhan','false')==='true');const [adhanReady,setAdhanReady]=useState(false);const [adhanPlaying,setAdhanPlaying]=useState(false);
 const [announce,setAnnounce]=useState<string|null>(null);const [note,setNote]=useState('');const noteTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const flash=(text:string)=>{setNote(text);clearTimeout(noteTimer.current);noteTimer.current=setTimeout(()=>setNote(''),3000);};
 const [weather,setWeather]=useState<Weather|null>(null);const [weatherOpen,setWeatherOpen]=useState(false);const [memories,setMemories]=useState<Memory[]|null>(null);const [memIndex,setMemIndex]=useState(0);const [memOpen,setMemOpen]=useState(false);
 const [alert,setAlert]=useState<Reminder|null>(null);const fired=useRef(new Set<string>());const snoozed=useRef<{r:Reminder;at:number}[]>([]);
 const audio=useRef<HTMLAudioElement|null>(null);const played=useRef(new Set<number>());
 const version=useRef('');const nextVersion=useRef('');

 useEffect(()=>{document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';store('language',lang);},[lang]);
 // Theme is shared by all screens; the last one is remembered so a reload does not flash the default.
 const omarchy=state.layout.followOmarchy?state.omarchy:null;
 useEffect(()=>{applyTheme(state.layout.theme,state.layout.accent,omarchy);store('theme',state.layout.theme);store('accent',state.layout.accent);},[state.layout.theme,state.layout.accent,JSON.stringify(omarchy)]);// eslint-disable-line
 useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{document.addEventListener('pointerdown',unlockAudio);return()=>document.removeEventListener('pointerdown',unlockAudio);},[]);
 useEffect(()=>{let alive=true;const load=()=>fetch('/api/weather').then(r=>r.ok?r.json():null).then(d=>{if(alive&&d)setWeather(d);}).catch(()=>{});load();const timer=setInterval(load,15*60000);return()=>{alive=false;clearInterval(timer);};},[]);
 useEffect(()=>{if(!state.immich)return;let alive=true;const load=()=>fetch('/api/memories').then(r=>r.ok?r.json():[]).then(d=>{if(alive)setMemories(d);}).catch(()=>{if(alive)setMemories([]);});load();const timer=setInterval(load,3600000);return()=>{alive=false;clearInterval(timer);};},[state.immich]);
 useEffect(()=>{let alive=true;const refresh=()=>fetch('/api/prayers',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{if(alive){setPrayers(data);setPrayerFailed(false);}}).catch(()=>{if(alive)setPrayerFailed(true);});void refresh();const timer=setInterval(()=>void refresh(),60000);return()=>{alive=false;clearInterval(timer);};},[]);
 useEffect(()=>{const accept=(s:State)=>{if(version.current && s.version!==version.current) nextVersion.current=s.version;version.current=s.version;setState(s);};const events=new EventSource('/api/events');events.onmessage=e=>{try{accept(JSON.parse(e.data));setConnected(true);}catch{setConnected(false);}};events.onerror=()=>setConnected(false);
 const refresh=()=>{fetch('/api/state',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(accept).catch(()=>setConnected(false));};const timer=setInterval(refresh,30000);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);return()=>{events.close();clearInterval(timer);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};},[]);
 // Reload into a new build only when nothing is in flight; a reload drops the audio unlock, so not mid-adhan either.
 useEffect(()=>{if(nextVersion.current&&!busy&&!adhanPlaying&&!document.querySelector('input:focus')) location.reload();},[state,busy,adhanPlaying,now]);

 // Wake lock: reacquired after the system releases it while the page stays visible.
 useEffect(()=>{
  store('keepAwake',String(keep));
  let lock:WakeLockSentinel|undefined;let cancelled=false;let requesting=false;let retry:ReturnType<typeof setTimeout>|undefined;
  setWake(false);
  async function acquire(){
   if(cancelled||!keep||document.hidden||requesting||(lock&&!lock.released))return;
   if(!window.isSecureContext||!navigator.wakeLock)return;
   requesting=true;
   try{
    const result=await navigator.wakeLock.request('screen');
    if(cancelled||document.hidden){await result.release();return;}
    lock=result;setWake(!result.released);
    result.addEventListener('release',()=>{if(cancelled||lock!==result)return;lock=undefined;setWake(false);if(!document.hidden)retry=setTimeout(()=>void acquire(),1000);},{once:true});
   }catch{if(!cancelled)setWake(false);}
   finally{requesting=false;}
  }
  void acquire();
  const timer=setInterval(()=>void acquire(),15000);
  for(const e of ['focus','pageshow'])window.addEventListener(e,acquire);
  document.addEventListener('visibilitychange',acquire);document.addEventListener('pointerdown',acquire);
  return()=>{cancelled=true;clearInterval(timer);clearTimeout(retry);void lock?.release();for(const e of ['focus','pageshow'])window.removeEventListener(e,acquire);document.removeEventListener('visibilitychange',acquire);document.removeEventListener('pointerdown',acquire);};
 },[keep]);

 // Safari plays sound only after a touch, so the first touch on a page with adhan enabled unlocks the audio element.
 useEffect(()=>{
  store('adhan',String(adhanOn));
  if(!adhanOn){audio.current?.pause();setAdhanReady(false);return;}
  if(!audio.current){const a=new Audio('/api/adhan');a.preload='auto';a.onplay=()=>setAdhanPlaying(true);a.onpause=a.onended=()=>setAdhanPlaying(false);audio.current=a;}
  const a=audio.current;
  const unlock=()=>{if(adhanReady)return;a.muted=true;a.play().then(()=>{a.pause();a.currentTime=0;a.muted=false;setAdhanReady(true);}).catch(()=>{a.muted=false;});};
  document.addEventListener('pointerdown',unlock);return()=>document.removeEventListener('pointerdown',unlock);
 },[adhanOn,adhanReady]);
 const stopAdhan=()=>{const a=audio.current;if(a){a.pause();a.currentTime=0;}};

 async function mutate(path:string,method:string,body:unknown={}){setBusy(true);setError(false);try{const res=await fetch('/api/'+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!res.ok)throw Error();const fresh=await fetch('/api/state',{cache:'no-store'});if(!fresh.ok)throw Error();setState(await fresh.json());return true;}catch{setError(true);return false;}finally{setBusy(false);}}

 const berlinDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const today=prayers?.date===berlinDate?prayers:null;const t=now.getTime();const L=state.layout;
 const salah=today?.today.filter(p=>p.key!=='sunrise')||[];
 const next=salah.find(p=>p.at>t)||(today?.next&&today.next.at>t?today.next:null);
 const sunrise=today?.today.find(p=>p.key==='sunrise'&&p.at>t)||null;
 const active=salah.find(p=>t>=p.at&&t<p.at+L.prayerAfter*60000)||null;
 const nearPrayer=salah.find(p=>t>=p.at-L.prayerBefore*60000&&t<p.at+L.prayerAfter*60000)||null;

 // Adhan: once per prayer, within its first minute, on devices where it is enabled.
 useEffect(()=>{
  const due=salah.find(p=>t>=p.at&&t<p.at+60000);
  if(!due||played.current.has(due.at))return;
  played.current.add(due.at);
  setAnnounce(due.key);setTimeout(()=>setAnnounce(null),5000);
  if(manual&&!FACES[pinned])setManual(null);
  if(adhanOn&&adhanReady&&audio.current){audio.current.currentTime=0;void audio.current.play().catch(()=>setAdhanReady(false));}
 },[t]); // eslint-disable-line

 // Reminders fire once per day at their minute, Hamburg time; a snooze fires again 10 minutes later on this device.
 useEffect(()=>{
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  const date=`${parts.year}-${parts.month}-${parts.day}`,time=`${parts.hour}:${parts.minute}`,day=new Date(date+'T12:00:00Z').getUTCDay();
  const ring=(r:Reminder)=>{setAlert(r);playSound(L.reminderSound);};
  for(const r of state.reminders){const key=r.id+'|'+date;if(r.time!==time||fired.current.has(key))continue;if(r.date?r.date!==date:r.days&&!r.days.includes(day))continue;fired.current.add(key);ring(r);}
  const due=snoozed.current.filter(x=>x.at<=t);if(due.length){snoozed.current=snoozed.current.filter(x=>x.at>t);ring(due[0].r);}
 },[t]); // eslint-disable-line

 // Face choice: manual (until idle for returnAfter) > pinned face > automatic by time.
 // Leaving the prayer view by hand ends automatic switching for that prayer.
 const auto=L.auto&&nearPrayer&&nearPrayer.at!==dismissed?'prayer':'home';
 useEffect(()=>{if(manual&&t-manual.at>L.returnAfter*1000)setManual(null);},[t]);// eslint-disable-line
 const base=FACES[pinned]?pinned:auto;const face=manual?.face||base;
 const show=(f:string)=>{let b=base;if(auto==='prayer'&&f!=='prayer'){setDismissed(nearPrayer!.at);if(!FACES[pinned])b='home';}setManual(f===b?null:{face:f,at:Date.now()});};
 const isPinned=face===pinned;
 const togglePin=()=>{const value=isPinned?'':face;setPinned(value);store('pinned',value);setManual(null);
  flash(value?(lang==='ar'?`صارت ${faceNames[face].ar} الشاشة الأساسية: أي شاشة تفتحها ترجع إليها بعد ${L.returnAfter} ثانية`:`${faceNames[face].en} is now the main screen: other views return here after ${L.returnAfter} s`):(lang==='ar'?'رجعت الرئيسية الشاشة الأساسية':'Home is the main screen again'));};
 // Swipes on home open the mapped view; any swipe in a view goes back home. The memories view keeps its short and vertical swipes.
 const swipe=useRef<{x:number;y:number;top:boolean;bottom:boolean}|null>(null);
 const [panelOpen,setPanelOpen]=useState(false);const [from,setFrom]=useState<Dir>('up');const [hints,setHints]=useState(0);
 const open=(target:string,dir:Dir='up')=>{if(target==='panel')setPanelOpen(true);else if(FACES[target]){setFrom(dir);show(target);}};
 // Touch is read from touch events, which keep firing while a list scrolls natively (pointer events get cancelled);
 // the mouse uses pointer events. A vertical swipe inside a task list scrolls it, unless the list is already at
 // that end: at the top a swipe down still opens the panel, at the bottom a swipe up still works.
 const begin=(x:number,y:number,target:EventTarget|null)=>{
  const list=(target as HTMLElement|null)?.closest?.('.scrolls');
  swipe.current={x,y,top:!list||list.scrollTop<=0,bottom:!list||list.scrollTop+list.clientHeight>=list.scrollHeight-2};
  if(manual)setManual({...manual,at:Date.now()});if(face==='home')setHints(Date.now());
 };
 const finish=(x:number,y:number)=>{const s=swipe.current;swipe.current=null;if(!s||Date.now()-gesture.handled<400)return;const d=dirOf(x-s.x,y-s.y);
  if(!d||(d==='down'&&!s.top)||(d==='up'&&!s.bottom))return;
  if(face==='home')open(L.swipes[d],d);else{setFrom(({left:'right',right:'left',up:'down',down:'up'} as const)[d]);show('home');}};

 useEffect(()=>{if(!settings)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setSettings(false);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[settings]);
 const scheduledNight=isNight(now,state.night);
 useEffect(()=>setNightOverride(false),[scheduledNight,state.night?.start,state.night?.end]);

 const blank=state.blackout||(scheduledNight&&!nightOverride);
 useEffect(()=>{document.documentElement.classList.toggle('blank',blank);document.querySelector('meta[name="theme-color"]')?.setAttribute('content',blank?'#000000':omarchy?.background||(THEMES[L.theme]||THEMES.lapis).colors[0]);},[blank,L.theme,omarchy?.background]);
 const notes=state.tasks?{files:state.tasks.files,visible:state.tasks.visible,toggle:(f:string)=>void mutate('layout','PATCH',{...L,hiddenFiles:L.hiddenFiles.includes(f)?L.hiddenFiles.filter(x=>x!==f):[...L.hiddenFiles.filter(x=>state.tasks!.files.includes(x)),f]})}:null;
 const one=state.tasks?.visible.length===1?state.tasks.visible[0]:'';
 const c:Ctx={openView:(f:string)=>open(f),now,lang,connected,busy,todos:state.todos,taskFolder:state.tasks?(one?one.replace(/\.md$/,''):state.tasks.folder):null,taskAll:!!state.tasks&&state.tasks.visible.length>1,sides:L.sides,notes,reminders:state.reminders,weather,openWeather:()=>setWeatherOpen(true),memories:state.immich?memories:null,prayed:state.prayed,setPrayed:(date,prayer,status)=>void mutate('prayed','PATCH',{date,prayer,status}),memIndex,setMemIndex,openMemories:()=>setMemOpen(true),prayers:today,prayerFailed,next,active,sunrise,adhanPlaying,stopAdhan,mutate};
 const Face=FACES[face];
 return <div className="shell">
  <main className="stage"
   onPointerDown={e=>{if(e.pointerType!=='touch')begin(e.clientX,e.clientY,e.target);}} onPointerUp={e=>{if(e.pointerType!=='touch')finish(e.clientX,e.clientY);}}
   onTouchStart={e=>{if(e.touches.length===1)begin(e.touches[0].clientX,e.touches[0].clientY,e.target);else swipe.current=null;}}
   onTouchEnd={e=>{const t=e.changedTouches[0];if(t)finish(t.clientX,t.clientY);}} onTouchCancel={()=>{swipe.current=null;}}>
   <div key={face} className={'view'+(face==='home'?'':' from-'+from)}><Face c={c} widgets={L.home}/></div>
  </main>
  {panelOpen&&<PullPanel c={c} widgets={L.panel} close={()=>setPanelOpen(false)} openSettings={()=>{setPanelOpen(false);setSettings(true);}}/>}
  {weatherOpen&&<WeatherSheet c={c} close={()=>setWeatherOpen(false)}/>}
  {memOpen&&<MemoriesSheet c={c} close={()=>setMemOpen(false)}/>}
  {alert&&<div className="reminder-alert" role="alertdialog" aria-modal="true" aria-label={lang==='ar'?'تذكير':'Reminder'}>
   <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/></svg>
   <time dir="ltr">{alert.time}</time>
   <strong dir="auto">{alert.text}</strong>
   <div className="row"><button className="primary" autoFocus onClick={()=>setAlert(null)}>{lang==='ar'?'تم':'Done'}</button><button onClick={()=>{snoozed.current.push({r:alert,at:Date.now()+600000});setAlert(null);}}>{lang==='ar'?'ذكّرني بعد 10 دقائق':'Remind me in 10 minutes'}</button></div>
  </div>}
  {announce&&<div className="announce" aria-live="assertive"><strong>{prayerName(lang,announce)}</strong><span>{lang==='ar'?'الآن':'Now'}</span></div>}
  {note&&<p role="status" className="toast note">{note}</p>}
  {error&&<p role="alert" className="toast">{lang==='ar'?'لم يُحفظ التغيير. تحقق من اتصال السيرفر ثم أعد المحاولة.':'Change not saved. Check the server connection and try again.'}</p>}
  {adhanOn&&!adhanReady&&<span className="adhan-hint">{lang==='ar'?'المس الشاشة لتفعيل صوت الأذان':'Touch the screen to enable adhan sound'}</span>}
  {face==='home'?<div className="corner">
    <span className={'link '+(connected?'live':'')} role="status" aria-label={connected?(lang==='ar'?'السيرفر متصل':'Server connected'):(lang==='ar'?'جاري الاتصال بالسيرفر':'Connecting to server')}/>
    <button className="gear" aria-label={lang==='ar'?'الإعدادات':'Settings'} aria-haspopup="dialog" onClick={()=>setSettings(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg></button>
   </div>
   :<div className="view-bar">
    <button className="back" aria-label={lang==='ar'?'الرئيسية':'Home'} onClick={()=>{setFrom('down');show('home');}}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7M6 9.5V20h12V9.5"/></svg></button>
    <button className={'pin'+(isPinned?' on':'')} aria-pressed={isPinned} aria-label={isPinned?(lang==='ar'?'إلغاء التثبيت':'Unpin'):(lang==='ar'?'اجعلها الشاشة الأساسية':'Make this the main screen')} onClick={togglePin}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/></svg></button>
   </div>}
  {face==='home'&&t-hints<2500&&<div className="edge-hints" aria-hidden="true">{DIRS.filter(d=>L.swipes[d]!=='none').map(d=><span key={d} className={'hint-'+d}>{faceNames[L.swipes[d]]?.[lang]}</span>)}</div>}
  {settings&&<Settings {...{c,lang,setLang,state,mutate,busy,connected,keep,setKeep,wake,adhanOn,setAdhanOn,adhanReady,audio,stopAdhan,adhanPlaying}} close={()=>setSettings(false)}/>}
  {blank&&<button className="blackout" aria-label={lang==='ar'?'المس للرجوع':'Tap to return'} onClick={()=>{setNightOverride(true);if(state.blackout)void mutate('display','PATCH',{blackout:false});}}><span>{lang==='ar'?'المس للرجوع':'Tap to return'}</span></button>}
 </div>;
}

type SettingsProps={c:Ctx;lang:Lang;setLang:(l:Lang)=>void;state:State;mutate:Ctx['mutate'];busy:boolean;connected:boolean;keep:boolean;setKeep:(v:boolean)=>void;wake:boolean;adhanOn:boolean;setAdhanOn:(v:boolean)=>void;adhanReady:boolean;audio:React.RefObject<HTMLAudioElement|null>;stopAdhan:()=>void;adhanPlaying:boolean;close:()=>void};
function Settings(p:SettingsProps){
 const ar=p.lang==='ar';const L=p.state.layout;const locked=p.busy||!p.connected;
 const [night,setNight]=useState(p.state.night);
 // Sides are saved explicitly so reordering never moves a widget to the other column.
 const saveLayout=(patch:Partial<Layout>)=>{const sides=Object.fromEntries(L.home.map((w,i)=>[w,sideOf(L.sides,w,i)]));void p.mutate('layout','PATCH',{...L,...patch,sides:{...sides,...patch.sides}});};
 const move=(i:number,d:number)=>{const home=[...L.home];[home[i],home[i+d]]=[home[i+d],home[i]];saveLayout({home});};
 const hidden=Object.keys(WIDGETS).filter(w=>!L.home.includes(w));
 const num=(key:'returnAfter'|'prayerBefore'|'prayerAfter',label:string,min:number,max:number)=><label className="field">{label}<input type="number" min={min} max={max} defaultValue={L[key]} disabled={locked} onBlur={e=>{const v=Math.round(Number(e.target.value));if(v>=min&&v<=max&&v!==L[key])saveLayout({[key]:v});}}/></label>;
 return <div className="sheet-backdrop" onClick={p.close}>
  <section className="sheet" role="dialog" aria-modal="true" aria-label={ar?'الإعدادات':'Settings'} onClick={e=>e.stopPropagation()}>
   <header><h2>{ar?'الإعدادات':'Settings'}</h2><button autoFocus className="close" aria-label={ar?'إغلاق':'Close'} onClick={p.close}>×</button></header>

   <h3>{ar?'الواجهة الرئيسية':'Home face'}</h3>
   <p className="hint">{ar?'اختر لكل ويدجت العمود الأيمن أو الأيسر، ورتّبها بالأسهم. العمود الذي فيه ويدجت واحد يأخذ طوله كاملًا.':'Put each widget in the right or left column and order them with the arrows. A column with one widget gives it the full height.'}</p>
   <ol className="widget-order">
    {L.home.map((w,i)=>{const side=sideOf(L.sides,w,i);return <li key={w}><span>{WIDGETS[w]?.[p.lang]||w}</span>
     <button className="side" disabled={locked} aria-label={(ar?'العمود: ':'Column: ')+(side==='right'?(ar?'يمين':'right'):(ar?'يسار':'left'))} onClick={()=>saveLayout({sides:{...L.sides,[w]:side==='right'?'left':'right'}})}>{side==='right'?(ar?'يمين':'Right'):(ar?'يسار':'Left')}</button>
     <button disabled={locked||i===0} aria-label={ar?'للأعلى':'Move up'} onClick={()=>move(i,-1)}>↑</button>
     <button disabled={locked||i===L.home.length-1} aria-label={ar?'للأسفل':'Move down'} onClick={()=>move(i,1)}>↓</button>
     <button disabled={locked||L.home.length===1} onClick={()=>saveLayout({home:L.home.filter(x=>x!==w)})}>{ar?'إخفاء':'Hide'}</button></li>;})}
   </ol>
   {!!hidden.length&&<div className="widget-add">{hidden.map(w=><button key={w} disabled={locked} onClick={()=>saveLayout({home:[...L.home,w]})}>+ {WIDGETS[w][p.lang]}</button>)}</div>}

   {p.state.tasks&&<>
    <h3>{ar?'المهام':'Tasks'}</h3>
    <NoteChips c={p.c}/>
    <p className="hint">{ar?'اضغط على ملاحظة لإخفاء مهامها أو إظهارها. الترتيب حسب أولوية Tasks (🔺 ⏫ 🔼 🔽 ⏬) ثم تاريخ 📅. المهام الجديدة تُضاف للملاحظة الافتراضية إذا كانت ظاهرة، وإلا لأول ملاحظة ظاهرة.':'Tap a note to hide or show its tasks. Sorted by Tasks priority (🔺 ⏫ 🔼 🔽 ⏬), then 📅 due date. New tasks go to the default note while shown, otherwise to the first shown note.'}</p>
   </>}

   <h3>{ar?'التذكيرات':'Reminders'}</h3>
   <div className="fields">
    <label className="field">{ar?'الصوت':'Sound'}<select value={L.reminderSound} disabled={locked} onChange={e=>saveLayout({reminderSound:e.target.value})}>{Object.entries(SOUNDS).map(([k,v])=><option key={k} value={k}>{v[p.lang]}</option>)}</select></label>
    <button onClick={()=>{unlockAudio();playSound(L.reminderSound,1);}}>{ar?'تجربة الصوت':'Test sound'}</button>
   </div>
   <p className="hint">{p.state.reminderFile?(ar?`اكتب التذكيرات في Obsidian داخل ${p.state.reminderFile}، سطر لكل تذكير: «- 09:00 نص» يوميًا، «- الجمعة 12:30 نص» أسبوعيًا، «- 2026-12-31 23:00 نص» مرة واحدة.`:`Write reminders in Obsidian in ${p.state.reminderFile}, one per line: "- 09:00 text" daily, "- fri 12:30 text" weekly, "- 2026-12-31 23:00 text" once.`):(ar?'التذكيرات تحتاج ربط Obsidian في data/config.json.':'Reminders need Obsidian set in data/config.json.')}</p>

   <h3>{ar?'الثيم':'Theme'}</h3>
   <label className="toggle"><input type="checkbox" checked={L.followOmarchy} disabled={locked||!p.state.omarchy} onChange={e=>saveLayout({followOmarchy:e.target.checked})}/>{ar?'اتبع ثيم Omarchy على الكمبيوتر':'Follow the Omarchy theme on the PC'}</label>
   {!p.state.omarchy&&<p className="hint">{ar?'لم يُعثر على ثيم Omarchy على السيرفر.':'No Omarchy theme found on the server.'}</p>}
   <div className={'theme-grid'+(L.followOmarchy?' muted-grid':'')}>{Object.entries(THEMES).map(([id,t])=><button key={id} className={!L.followOmarchy&&L.theme===id?'on':''} aria-pressed={!L.followOmarchy&&L.theme===id} disabled={locked} onClick={()=>saveLayout({theme:id,followOmarchy:false})}><span className="swatch" aria-hidden="true">{[0,3,5,6].map(i=><i key={i} style={{background:t.colors[i]}}/>)}</span><span dir="ltr">{t.name}</span></button>)}</div>
   <div className="accent-row" role="group" aria-label={ar?'اللون المميز':'Accent color'}>
    <button className={!L.accent?'on':''} disabled={locked} onClick={()=>saveLayout({accent:''})}>{ar?'لون الثيم':'Theme default'}</button>
    {Object.entries(ACCENTS).map(([name,hex])=><button key={hex} className={'dot'+(L.accent===hex?' on':'')} title={name} aria-label={name} aria-pressed={L.accent===hex} disabled={locked} style={{background:hex}} onClick={()=>saveLayout({accent:hex})}/>)}
   </div>
   <p className="hint">{ar?'اللون المميز للصلاة القادمة والعقرب والأزرار. يتغير على كل الشاشات المفتوحة.':'Accent for the next prayer, the dial hand and buttons. Applies to every open screen.'}</p>

   <h3>{ar?'السحب':'Gestures'}</h3>
   <p className="hint">{ar?'من الرئيسية، كل اتجاه سحب يفتح شيئًا. وفي أي شاشة، أي سحب يرجعك للرئيسية. الضغط على ويدجت يفتح شاشته أيضًا.':'From home, each swipe opens something. In any view, any swipe goes back home. Tapping a widget opens its view too.'}</p>
   <div className="fields">{DIRS.map(d=><label key={d} className="field">{dirNames[d][p.lang]}<select value={L.swipes[d]} disabled={locked} onChange={e=>saveLayout({swipes:{...L.swipes,[d]:e.target.value}})}>{['prayer','tasks','memories','clock','panel','none'].map(v=><option key={v} value={v}>{faceNames[v][p.lang]}</option>)}</select></label>)}</div>
   <p className="hint">{ar?'ما يظهر في اللوحة السريعة:':'Shown in the quick panel:'}</p>
   <div className="widget-add panel-pick">{Object.keys(WIDGETS).map(w=>{const on=L.panel.includes(w);return <button key={w} className={on?'on':''} aria-pressed={on} disabled={locked} onClick={()=>saveLayout({panel:on?L.panel.filter(x=>x!==w):[...L.panel,w]})}>{WIDGETS[w][p.lang]}</button>;})}</div>

   <h3>{ar?'التبديل التلقائي':'Automatic switching'}</h3>
   <label className="toggle"><input type="checkbox" checked={L.auto} disabled={locked} onChange={e=>saveLayout({auto:e.target.checked})}/>{ar?'اعرض واجهة الصلاة قرب وقت كل صلاة':'Show the prayer face around each prayer'}</label>
   <div className="fields">
    {num('prayerBefore',ar?'دقائق قبل الأذان':'Minutes before',0,120)}
    {num('prayerAfter',ar?'دقائق بعد الأذان':'Minutes after',0,120)}
    {num('returnAfter',ar?'العودة بعد (ثانية)':'Return after (seconds)',10,3600)}
   </div>
   <p className="hint">{ar?'الواجهة التي تفتحها بيدك ترجع بعد هذه المدة من آخر لمسة: إلى الواجهة المثبتة إن وُجدت، وإلا إلى التلقائية.':'A face you open returns after this idle time: to the pinned face if there is one, otherwise to automatic.'}</p>

   <h3>{ar?'الأذان على هذا الجهاز':'Adhan on this device'}</h3>
   <label className="toggle"><input type="checkbox" checked={p.adhanOn} onChange={e=>p.setAdhanOn(e.target.checked)}/>{ar?'تشغيل الأذان وقت كل صلاة':'Play the adhan at each prayer'}</label>
   {p.adhanOn&&<div className="row">
    <button onClick={()=>{const a=p.audio.current;if(!a)return;if(p.adhanPlaying)p.stopAdhan();else{a.currentTime=0;void a.play();}}}>{p.adhanPlaying?(ar?'إيقاف':'Stop'):(ar?'تجربة الصوت':'Test sound')}</button>
    <span className="hint">{p.adhanReady?(ar?'الصوت مفعّل':'Sound enabled'):(ar?'المس الشاشة مرة لتفعيل الصوت':'Touch the screen once to enable sound')}</span>
   </div>}
   <p className="hint">{ar?'هذا الإعداد محفوظ لهذا الجهاز فقط. على الآيباد يعمل الأذان والشاشة مفتوحة وSafari ظاهر.':'Saved for this device only. On iPad it plays while the screen is on and the page is visible.'}</p>

   <h3>{ar?'الشاشة':'Display'}</h3>
   <label className="toggle"><input type="checkbox" checked={p.keep} onChange={e=>p.setKeep(e.target.checked)}/>{ar?'إبقاء الشاشة مضاءة':'Keep screen awake'}</label>
   {p.keep&&<p className={'hint '+(p.wake?'ok':'warn')}>{p.wake?(ar?'الشاشة ستبقى مضاءة.':'The screen will stay awake.'):(ar?'غير فعّال: افتح رابط HTTPS، عطّل نمط الطاقة المنخفضة، واضبط القفل التلقائي على «مطلقًا».':'Not active: use the HTTPS link, turn off Low Power Mode, set Auto-Lock to Never.')}</p>}
   <div className="row"><button disabled={locked} onClick={()=>{void p.mutate('display','PATCH',{blackout:true});p.close();}}>{ar?'إطفاء كل الشاشات':'Blank all screens'}</button><button onClick={()=>p.setLang(ar?'en':'ar')}>{ar?'English':'العربية'}</button></div>
   <label className="toggle"><input type="checkbox" checked={night.enabled} onChange={e=>setNight({...night,enabled:e.target.checked})}/>{ar?'شاشة سوداء ليلًا':'Black screen at night'}</label>
   <div className="fields">
    <label className="field">{ar?'من':'From'}<input type="time" value={night.start} onChange={e=>setNight({...night,start:e.target.value})}/></label>
    <label className="field">{ar?'إلى':'Until'}<input type="time" value={night.end} onChange={e=>setNight({...night,end:e.target.value})}/></label>
    <button className="primary" disabled={locked||!night.start||!night.end||night.start===night.end} onClick={()=>void p.mutate('night','PATCH',night)}>{ar?'حفظ الجدول':'Save schedule'}</button>
   </div>
   <p className="hint">{ar?'بتوقيت هامبورغ. لإطفاء الإضاءة فعليًا اضبط Shortcuts على نفس الأوقات.':'Hamburg time. To dim the backlight, match these times in Shortcuts.'}</p>
   {!p.state.tasks&&<p className="hint">{ar?'المهام محفوظة في قاعدة بيانات اللوحة. اربط Obsidian من data/config.json.':'Tasks are stored in the dashboard database. Link Obsidian in data/config.json.'}</p>}
  </section>
 </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
