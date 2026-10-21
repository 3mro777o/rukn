import React, {useEffect,useRef,useState} from 'react';

// Faces are full screens the dashboard switches between; widgets are the pieces the home face is built from.
// To add a face: write a component taking Ctx, then add it to FACES and to `faceNames` in main.tsx.
export type Todo={id:string;title:string;done:boolean;file?:string;priority?:number;due?:string|null;scheduled?:string|null;recurring?:boolean};
export type Reminder={id:string;time:string;text:string;date?:string;days?:number[]|null};
export type Hour={time:string;temp:number;rain:number;code:number;day:boolean};
export type Weather={station:string|null;current:{temp:number;feels:number;code:number;day:boolean;wind:number;humidity:number};hours:Hour[];max:number;min:number};
export type Memory={year:number;assets:{id:string;date:string}[]};
export type Prayer={key:string;time:string;at:number};
export type Prayers={date:string;today:Prayer[];next:Prayer|null;jumua:string[];stale:boolean;source:string};
export type Lang='ar'|'en';
export type Ctx={openView:(face:string)=>void;taskFilter:string;setTaskFilter:(id:string)=>void;homeFilter:string;
 now:Date;lang:Lang;connected:boolean;busy:boolean;
 todos:Todo[];taskFolder:string|null;taskAll:boolean;reminders:Reminder[];weather:Weather|null;openWeather:()=>void;memories:Memory[]|null;prayed:Record<string,Record<string,string>>;setPrayed:(date:string,prayer:string,status:string|null)=>void;memIndex:number;setMemIndex:(i:number)=>void;openMemories:()=>void;sides:Record<string,'right'|'left'>;notes:{files:string[];visible:string[];toggle:(file:string)=>void}|null;
 prayers:Prayers|null;prayerFailed:boolean;next:Prayer|null;active:Prayer|null;sunrise:Prayer|null;
 adhanPlaying:boolean;stopAdhan:()=>void;
 mutate:(path:string,method:string,body?:unknown)=>Promise<boolean>;
};

const PRAYER_NAMES={ar:{fajr:'الفجر',sunrise:'الشروق',dhuhr:'الظهر',asr:'العصر',maghrib:'المغرب',isha:'العشاء'},en:{fajr:'Fajr',sunrise:'Sunrise',dhuhr:'Dhuhr',asr:'Asr',maghrib:'Maghrib',isha:'Isha'}} as const;
export const prayerName=(lang:Lang,key:string)=>(PRAYER_NAMES[lang] as Record<string,string>)[key]||key;
const locale=(lang:Lang)=>lang==='ar'?'ar-u-nu-latn':'en-GB';
const TZ='Europe/Berlin';
export const timeText=(now:Date,lang:Lang)=>now.toLocaleTimeString(locale(lang),{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:TZ});
const dateText=(now:Date,lang:Lang)=>now.toLocaleDateString(locale(lang),{weekday:'long',day:'numeric',month:'long',timeZone:TZ});
const hijriText=(now:Date,lang:Lang)=>{try{return new Intl.DateTimeFormat(`${lang==='ar'?'ar':'en'}-u-ca-islamic-umalqura-nu-latn`,{day:'numeric',month:'long',year:'numeric',timeZone:TZ}).format(now);}catch{return '';}};
const minutesOf=(hhmm:string)=>{const [h,m]=hhmm.split(':').map(Number);return h*60+m;};
const berlinMinutes=(now:Date)=>minutesOf(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:TZ}).format(now));
export function countdown(ms:number,lang:Lang){
 const total=Math.max(0,Math.ceil(ms/60000)),h=Math.floor(total/60),m=total%60;
 if(!h)return lang==='ar'?`${m} دقيقة`:`${m} min`;
 return `${h}:${String(m).padStart(2,'0')}`;
}

/* ───────── Widgets ───────── */

function ClockBlock({c,size}:{c:Ctx;size:'face'|'widget'}){
 return <div className={'clock-block '+size}>
  <time className="clock-time" dir="ltr">{timeText(c.now,c.lang)}</time>
  <p className="clock-date">{dateText(c.now,c.lang)}</p>
  <p className="clock-hijri">{hijriText(c.now,c.lang)}</p>
 </div>;
}

function NextPrayer({c}:{c:Ctx}){
 if(c.active)return <div className="next-prayer now"><span>{c.lang==='ar'?'حان الآن وقت':'Now'}</span><strong>{prayerName(c.lang,c.active.key)}</strong></div>;
 if(!c.next)return <div className="next-prayer"><span>{c.prayerFailed?(c.lang==='ar'?'المواقيت غير متاحة الآن':'Prayer times unavailable'):(c.lang==='ar'?'جاري تحميل المواقيت':'Loading prayer times')}</span></div>;
 return <div className="next-prayer">
  <span>{c.lang==='ar'?'الصلاة القادمة':'Next prayer'}</span>
  <strong>{prayerName(c.lang,c.next.key)}</strong>
  <em dir="ltr">{c.next.time}</em>
  <b>{c.lang==='ar'?'بعد ':'in '}<bdi>{countdown(c.next.at-c.now.getTime(),c.lang)}</bdi></b>
  {c.sunrise&&<SunriseLine c={c}/>}
 </div>;
}

function SunriseLine({c}:{c:Ctx}){
 if(!c.sunrise)return null;
 return <small className="sunrise-line">{c.lang==='ar'?'الشروق ':'Sunrise '}<time dir="ltr">{c.sunrise.time}</time>{c.lang==='ar'?'، بعد ':', in '}<bdi>{countdown(c.sunrise.at-c.now.getTime(),c.lang)}</bdi></small>;
}

const SALAH=['fajr','dhuhr','asr','maghrib','isha'];
// حاضر = on time, آخر الوقت = at the end of its time, قضاء = made up later.
export const STATUS:Record<string,{ar:string;en:string}>={ontime:{ar:'حاضر',en:'On time'},late:{ar:'آخر الوقت',en:'Late'},qada:{ar:'قضاء',en:'Made up'}};
// The last seven days as columns of five dots, colored by status.
function PrayerWeek({c}:{c:Ctx}){
 const days=Array.from({length:7},(_,i)=>{const d=new Date(c.now.getTime()-(6-i)*864e5);return {date:berlinDay(d),name:d.toLocaleDateString(c.lang==='ar'?'ar':'en-GB',{weekday:'short',timeZone:TZ})};});
 const today=Object.keys(c.prayed[days[6].date]||{}).length;
 return <div className="pray-week" aria-label={c.lang==='ar'?'صلوات آخر سبعة أيام':'Prayers in the last seven days'}>
  <p>{c.lang==='ar'?`اليوم ${today} من 5`:`Today ${today} of 5`}<span className="legend">{Object.entries(STATUS).map(([k,v])=><span key={k}><i className={k}/>{v[c.lang]}</span>)}</span></p>
  <ol>{days.map((d,i)=>{const done=c.prayed[d.date]||{};return <li key={d.date} className={i===6?'today':''} title={d.date}>
   <span>{d.name.replace(/^ال/,'')}</span>{SALAH.map(k=><i key={k} className={done[k]||''}/>)}</li>;})}</ol>
 </div>;
}

function PrayerList({c,variant}:{c:Ctx;variant:'strip'|'column'}){
 const [picking,setPicking]=useState<string|null>(null);
 if(!c.prayers)return <p className="quiet">{c.prayerFailed?(c.lang==='ar'?'تعذّر جلب المواقيت، إعادة المحاولة تلقائيًا':'Prayer times unavailable, retrying'):(c.lang==='ar'?'جاري تحميل المواقيت…':'Loading prayer times…')}</p>;
 return <>
  <ol className={'prayer-list '+variant}>
   {c.prayers.today.map(p=>{
    const cls=(c.active?.at===p.at?'active ':'')+(c.next?.at===p.at?'next ':'')+(p.at<c.now.getTime()&&c.active?.at!==p.at?'past ':'')+(p.key==='sunrise'?'sunrise':'');
    if(variant==='strip'||p.key==='sunrise')return <li key={p.key} className={cls}>{variant==='column'&&<i className="pray-gap"/>}<span>{prayerName(c.lang,p.key)}</span><time dir="ltr">{p.time}</time></li>;
    // A prayer can be marked once its time has come; the circle opens a choice of status in the row.
    const status=c.prayed[c.prayers!.date]?.[p.key],open=p.at<=c.now.getTime(),date=c.prayers!.date;
    const pick=(v:string|null)=>{setPicking(null);c.setPrayed(date,p.key,v);};
    if(picking===p.key)return <li key={p.key} className="picking" role="group" aria-label={prayerName(c.lang,p.key)}>
     {Object.entries(STATUS).map(([k,v])=><button key={k} className={'pick '+k+(status===k?' on':'')} autoFocus={k==='ontime'} onClick={()=>pick(k)}>{v[c.lang]}</button>)}
     <button className="pick clear" aria-label={status?(c.lang==='ar'?'إزالة العلامة':'Clear'):(c.lang==='ar'?'إغلاق':'Close')} onClick={()=>status?pick(null):setPicking(null)}>×</button>
    </li>;
    return <li key={p.key} className={cls+(status?' prayed '+status:'')}>
     <button className="pray-check" disabled={!open||c.busy||!c.connected} aria-label={prayerName(c.lang,p.key)+(status?': '+STATUS[status][c.lang]:'')} aria-haspopup="true" onClick={()=>setPicking(p.key)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
     <span>{prayerName(c.lang,p.key)}</span><time dir="ltr">{p.time}</time></li>;
   })}
  </ol>
  {variant==='column'&&<PrayerWeek c={c}/>}
  {(c.prayers.stale||c.prayerFailed)&&<p className="quiet warn">{c.lang==='ar'?'جدول محفوظ، تعذّر التحديث':'Saved timetable, update failed'}</p>}
 </>;
}

// Show Obsidian Markdown as plain text: [[note|alias]] → alias, [text](url) → text, no `code`/**bold**/==highlight== marks.
export const plain=(s:string)=>s.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g,(_,a,b)=>b||a).replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/`|\*\*|__|==/g,'').trim();
const berlinDay=(d:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ}).format(d);
function dueText(due:string,c:Ctx){
 const today=berlinDay(c.now),tomorrow=berlinDay(new Date(c.now.getTime()+864e5));
 if(due===today)return c.lang==='ar'?'اليوم':'Today';if(due===tomorrow)return c.lang==='ar'?'غدًا':'Tomorrow';
 return new Date(due+'T12:00:00Z').toLocaleDateString(locale(c.lang),{day:'numeric',month:'short',timeZone:'UTC'});
}
// Tasks plugin order: open first, then priority (🔺 highest … ⏬ lowest), then due date.
export const sortTasks=(todos:Todo[])=>[...todos].sort((a,b)=>Number(a.done)-Number(b.done)||(b.priority??2)-(a.priority??2)||(a.due||'9999').localeCompare(b.due||'9999'));
const PRIORITY_LABEL:Record<number,{ar:string;en:string}>={5:{ar:'أولوية قصوى',en:'Highest priority'},4:{ar:'أولوية عالية',en:'High priority'},3:{ar:'أولوية متوسطة',en:'Medium priority'},1:{ar:'أولوية منخفضة',en:'Low priority'},0:{ar:'أدنى أولوية',en:'Lowest priority'}};

// Filters of the tasks view; everything but "all" and "done" shows open tasks only.
export const FILTERS:{id:string;ar:string;en:string;test:(t:Todo,today:string)=>boolean}[]=[
 {id:'all',ar:'الكل',en:'All',test:()=>true},
 {id:'today',ar:'اليوم',en:'Today',test:(t,d)=>!t.done&&(!!t.due&&t.due<=d||!!t.scheduled&&t.scheduled<=d)},
 {id:'upcoming',ar:'القادمة',en:'Upcoming',test:(t,d)=>!t.done&&(!!t.due&&t.due>d||!t.due&&!!t.scheduled&&t.scheduled>d)},
 {id:'nodate',ar:'بلا تاريخ',en:'No date',test:t=>!t.done&&!t.due&&!t.scheduled},
 {id:'high',ar:'أولوية عالية',en:'High priority',test:t=>!t.done&&(t.priority??2)>=4},
 {id:'repeat',ar:'متكررة',en:'Repeating',test:t=>!t.done&&!!t.recurring},
 {id:'done',ar:'المنجزة',en:'Done',test:t=>t.done},
];
export function TaskFilters({c,value,set}:{c:Ctx;value:string;set:(id:string)=>void}){
 const today=berlinDay(c.now);
 return <div className="task-filters" role="group" aria-label={c.lang==='ar'?'تصفية المهام':'Filter tasks'}>
  {FILTERS.map(f=><button key={f.id} className={value===f.id?'on':''} aria-pressed={value===f.id} onClick={()=>set(f.id)}>{f[c.lang]} <b dir="ltr">{c.todos.filter(t=>f.test(t,today)).length}</b></button>)}
 </div>;
}

// The list scrolls (swipe it up or down, or use the wheel); the rows are sorted, not paged.
export function TaskList({c,rowHeight,editing,filter='all'}:{c:Ctx;rowHeight:number;editing:boolean;filter?:string}){
 const [text,setText]=useState('');
 const test=(FILTERS.find(f=>f.id===filter)||FILTERS[0]).test;
 const shown=sortTasks(c.todos.filter(t=>test(t,berlinDay(c.now))));const left=c.todos.filter(t=>!t.done).length;
 const locked=c.busy||!c.connected;const today=berlinDay(c.now);
 return <div className="tasks" style={{['--row' as string]:rowHeight+'px'}}>
  {editing&&<form className="task-add" onSubmit={async e=>{e.preventDefault();if(text.trim()&&await c.mutate('todos','POST',{title:text}))setText('');}}>
   <input aria-label={c.lang==='ar'?'مهمة جديدة':'New task'} maxLength={240} value={text} onChange={e=>setText(e.target.value)} placeholder={c.lang==='ar'?'مهمة جديدة… (يدعم ⏫ 📅 2026-10-30)':'New task… (supports ⏫ 📅 2026-10-30)'} dir="auto"/>
   <button disabled={locked||!text.trim()}>{c.lang==='ar'?'إضافة':'Add'}</button>
  </form>}
  <ul className="task-list scrolls">
   {shown.map(t=>{const p=t.priority??2;const overdue=!t.done&&!!t.due&&t.due<today;
    const meta=[t.due&&<span key="d" className={'due'+(overdue?' late':t.due===today?' today':'')}>{dueText(t.due,c)}</span>,t.recurring&&<span key="r">{c.lang==='ar'?'متكررة':'Repeats'}</span>,c.taskAll&&t.file&&<span key="f" dir="auto">{t.file.replace(/\.md$/,'')}</span>].filter(Boolean);
    return <li key={t.id} className={(t.done?'done ':'')+'p'+p}>
    <button className="check" role="checkbox" aria-checked={t.done} disabled={locked} aria-label={plain(t.title)} onClick={()=>void c.mutate('todos/'+t.id,'PATCH',{done:!t.done})}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
    {p!==2&&<i className="prio" title={PRIORITY_LABEL[p]?.[c.lang]} aria-label={PRIORITY_LABEL[p]?.[c.lang]}/>}
    <div className="task-text">
     {editing&&!t.done?<input key={t.title} className="title" dir="auto" maxLength={240} defaultValue={t.title} disabled={locked} aria-label={c.lang==='ar'?'نص المهمة':'Task text'}
       onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.currentTarget.value=t.title;e.currentTarget.blur();}}}
       onBlur={e=>{const v=e.target.value.trim();if(!v)e.target.value=t.title;else if(v!==t.title)void c.mutate('todos/'+t.id,'PATCH',{title:v});}}/>
     :<span dir="auto">{plain(t.title)}</span>}
     {!!meta.length&&!editing&&<small>{meta}</small>}
    </div>
    {editing&&<button className="remove" disabled={locked} aria-label={(c.lang==='ar'?'حذف ':'Delete ')+t.title} onClick={()=>void c.mutate('todos/'+t.id,'DELETE')}>×</button>}
   </li>;})}
   {!!c.todos.length&&!shown.length&&<li className="empty">{c.lang==='ar'?'لا مهام في هذا الفلتر.':'No tasks in this filter.'}</li>}
   {!c.todos.length&&<li className="empty">{c.lang==='ar'?'لا مهام. أضف مهمة من تعديل المهام أو من Obsidian.':'No tasks. Add one with Edit tasks or in Obsidian.'}</li>}
  </ul>
  <div className="task-foot">
   <span>{c.lang==='ar'?`${left} متبقية من ${c.todos.length}`:`${left} of ${c.todos.length} left`}</span>
  </div>
 </div>;
}

/* Weather */
const WMO:[number[],{ar:string;en:string},string][]=[
 [[0],{ar:'صافٍ',en:'Clear'},'clear'],[[1,2],{ar:'غائم جزئيًا',en:'Partly cloudy'},'partly'],[[3],{ar:'غائم',en:'Cloudy'},'cloud'],
 [[45,48],{ar:'ضباب',en:'Fog'},'fog'],[[51,53,55,56,57],{ar:'رذاذ',en:'Drizzle'},'rain'],[[61,63,65,66,67,80,81,82],{ar:'مطر',en:'Rain'},'rain'],
 [[71,73,75,77,85,86],{ar:'ثلج',en:'Snow'},'snow'],[[95,96,99],{ar:'عاصفة رعدية',en:'Thunderstorm'},'storm'],
];
const wmo=(code:number)=>WMO.find(w=>w[0].includes(code))||WMO[2];
export function WeatherIcon({code,day}:{code:number;day:boolean}){
 const kind=wmo(code)[2];
 const sun=day?<><circle cx="12" cy="12" r="4.2" className="wi-sun"/>{[0,45,90,135,180,225,270,315].map(a=><line key={a} x1="12" y1="3.2" x2="12" y2="5.2" className="wi-sun" transform={`rotate(${a} 12 12)`}/>)}</>:<path d="M15 5.5a7 7 0 1 0 3.5 10.2A5.5 5.5 0 1 1 15 5.5z" className="wi-moon"/>;
 const cloud=(x=0,y=0)=><path transform={`translate(${x} ${y})`} d="M7.5 19h9a3.8 3.8 0 0 0 .4-7.6A5.2 5.2 0 0 0 7 12.6 3.2 3.2 0 0 0 7.5 19z" className="wi-cloud"/>;
 return <svg className="wi" viewBox="0 0 24 24" aria-hidden="true">
  {kind==='clear'&&sun}
  {kind==='partly'&&<><g transform="translate(-3 -3) scale(.8)">{sun}</g>{cloud(1.5,1)}</>}
  {(kind==='cloud'||kind==='fog')&&cloud(0,-1)}
  {kind==='fog'&&<path d="M5 21h14M7 23h10" className="wi-line"/>}
  {kind==='rain'&&<>{cloud(0,-3)}<path d="M9 19l-1 3M13 19l-1 3M17 19l-1 3" className="wi-rain"/></>}
  {kind==='snow'&&<>{cloud(0,-3)}<path d="M9 20.5h.01M13 21.5h.01M17 20.5h.01" className="wi-snow"/></>}
  {kind==='storm'&&<>{cloud(0,-3)}<path d="M13 17l-2 3h3l-2 3" className="wi-bolt"/></>}
 </svg>;
}
const deg=(n:number)=>`${Math.round(n)}°`;
function WeatherWidget({c}:{c:Ctx}){
 if(!c.weather)return <p className="quiet">{c.lang==='ar'?'جاري تحميل الطقس…':'Loading weather…'}</p>;
 const w=c.weather.current;
 return <button className="weather-now" onClick={c.openWeather} aria-haspopup="dialog" aria-label={c.lang==='ar'?'الطقس في الساعات القادمة':'Hourly forecast'}>
  <WeatherIcon code={w.code} day={w.day}/>
  <strong dir="ltr">{deg(w.temp)}</strong>
  <span><b>{wmo(w.code)[1][c.lang]}</b><em dir="ltr">↑{deg(c.weather.max)} ↓{deg(c.weather.min)}</em></span>
 </button>;
}
export function WeatherSheet({c,close}:{c:Ctx;close:()=>void}){
 const w=c.weather;const ar=c.lang==='ar';
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[close]);
 if(!w)return null;
 const temps=w.hours.map(h=>h.temp),lo=Math.min(...temps),hi=Math.max(...temps),span=Math.max(1,hi-lo);
 return <div className="pop-backdrop" onClick={close}>
  <section className="pop weather-pop" role="dialog" aria-modal="true" aria-label={ar?'الطقس':'Weather'} onClick={e=>e.stopPropagation()}>
   <header>
    <WeatherIcon code={w.current.code} day={w.current.day}/>
    <div><strong dir="ltr">{deg(w.current.temp)}</strong><span>{wmo(w.current.code)[1][c.lang]}، {ar?'هامبورغ هاربورغ':'Hamburg-Harburg'}</span></div>
    <dl><div><dt>{ar?'الإحساس':'Feels like'}</dt><dd dir="ltr">{deg(w.current.feels)}</dd></div><div><dt>{ar?'الرياح':'Wind'}</dt><dd dir="ltr">{Math.round(w.current.wind)} km/h</dd></div><div><dt>{ar?'الرطوبة':'Humidity'}</dt><dd dir="ltr">{w.current.humidity}%</dd></div></dl>
    <button className="close" autoFocus aria-label={ar?'إغلاق':'Close'} onClick={close}>×</button>
   </header>
   <ol className="hours" dir="ltr">
    {w.hours.map((h,i)=><li key={h.time+i}>
     <time>{i?h.time:(ar?'الآن':'Now')}</time>
     <WeatherIcon code={h.code} day={h.day}/>
     <span className="t" style={{['--lift' as string]:(h.temp-lo)/span}}>{deg(h.temp)}</span>
     <span className="rain" aria-label={(ar?'احتمال المطر ':'Rain chance ')+h.rain+'%'}><i style={{height:`${h.rain}%`}}/><b>{h.rain?h.rain+'%':''}</b></span>
    </li>)}
   </ol>
   <p className="hint">{ar?`الأرقام الزرقاء احتمال المطر. التوقعات من نموذج ICON-D2 لهيئة الأرصاد الألمانية DWD${w.station?`، والقراءة الحالية مقاسة في محطة ${w.station}`:''}. يتحدث كل 15 دقيقة.`:`Blue figures are the chance of rain. Forecast: DWD ICON-D2${w.station?`; current reading measured at ${w.station}`:''}. Updated every 15 minutes.`}</p>
  </section>
 </div>;
}

/* Reminders */
function RemindersWidget({c}:{c:Ctx}){
 const now=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:TZ}).format(c.now);
 const date=berlinDay(c.now),day=new Date(date+'T12:00:00Z').getUTCDay();
 const today=c.reminders.filter(r=>r.time>now&&(r.date?r.date===date:r.days?r.days.includes(day):true)).sort((a,b)=>a.time.localeCompare(b.time)).slice(0,3);
 if(!today.length)return <p className="quiet">{c.lang==='ar'?'لا تذكيرات باقية اليوم.':'No more reminders today.'}</p>;
 return <ul className="reminder-list">{today.map(r=><li key={r.id}><time dir="ltr">{r.time}</time><span dir="auto">{r.text}</span></li>)}</ul>;
}

/* Immich memories */
const yearsAgo=(year:number,lang:Lang,now:Date)=>{const n=now.getFullYear()-year;if(lang==='en')return n===1?'1 year ago':`${n} years ago`;return n===1?'قبل سنة':n===2?'قبل سنتين':n<=10?`قبل ${n} سنوات`:`قبل ${n} سنة`;};
// mode 'face': full screen, flips by itself. 'pop': the popup, flipped by hand. 'widget': a still photo that opens the popup.
// All modes share the photo index, so the popup opens on the photo the widget shows.
// Photos are scaled to fit (contain), so a portrait photo shrinks or grows with the space it gets.
// Set when a memory view used a swipe itself, so the stage does not also act on it.
export const gesture={handled:0};
// Memories gestures, like Shorts: up/down flips; a short sideways swipe flips too.
// On the full face a long sideways swipe (over 200px) is left to the stage, which changes the face.
export function flipFrom(s:{x:number;y:number}|null,e:{clientX:number;clientY:number},longChangesFace:boolean){
 if(!s)return 0;const dx=e.clientX-s.x,dy=e.clientY-s.y;
 if(Math.abs(dy)>50&&Math.abs(dy)>Math.abs(dx))return dy<0?1:-1;
 if(Math.abs(dx)>30&&!(longChangesFace&&Math.abs(dx)>200))return dx<0?1:-1;
 return 0;
}
// Warm the browser cache with the photos either side of the current one, so flipping is instant.
function usePreload(photos:{id:string}[],at:number){useEffect(()=>{for(const d of [1,-1,2]){const p=photos[(at+d+photos.length)%photos.length];if(p)new Image().src='/api/memories/photo/'+p.id;}},[at,photos.length]);}// eslint-disable-line
function Slideshow({c,mode}:{c:Ctx;mode:'face'|'pop'|'widget'}){
 const photos=(c.memories||[]).flatMap(m=>m.assets.map(a=>({...a,year:m.year})));
 const [touched,setTouched]=useState(0);const start=useRef<{x:number;y:number}|null>(null);
 const n=photos.length,at=n?((c.memIndex%n)+n)%n:0,p=photos[at];
 const go=(d:number)=>{c.setMemIndex(at+d);setTouched(Date.now());};
 usePreload(photos,at);
 useEffect(()=>{if(mode!=='face'||n<2)return;const t=setInterval(()=>c.setMemIndex(c.memIndex+1),12000);return()=>clearInterval(t);},[mode,n,touched,c.memIndex]);// eslint-disable-line
 if(c.memories===null)return <p className="quiet">{c.lang==='ar'?'اربط Immich من data/config.json لعرض الذكريات.':'Connect Immich in data/config.json to show memories.'}</p>;
 if(!n)return <p className="quiet">{c.lang==='ar'?'لا ذكريات لهذا اليوم.':'No memories for today.'}</p>;
 const caption=<figcaption><strong>{yearsAgo(p.year,c.lang,c.now)}</strong><span dir="ltr">{p.year}{n>1?`  ${at+1}/${n}`:''}</span></figcaption>;
 if(mode==='widget')return <button className="memory widget" onClick={c.openMemories} aria-haspopup="dialog" aria-label={c.lang==='ar'?'افتح الذكريات':'Open memories'}>
  <img key={p.id} src={'/api/memories/photo/'+p.id} alt="" decoding="async" draggable={false}/>{caption}
 </button>;
 return <figure className={'memory '+mode}
   onPointerDown={e=>{start.current={x:e.clientX,y:e.clientY};}}
   onPointerUp={e=>{const d=flipFrom(start.current,e,mode==='face');start.current=null;if(d){gesture.handled=Date.now();e.stopPropagation();go(d);}}}>
  <img key={p.id} src={'/api/memories/photo/'+p.id} alt="" decoding="async" draggable={false}/>
  {n>1&&<><button dir="ltr" className="mem-nav left" aria-label={c.lang==='ar'?'الصورة السابقة':'Previous photo'} onClick={()=>go(-1)}>‹</button>
   <button dir="ltr" className="mem-nav right" aria-label={c.lang==='ar'?'الصورة التالية':'Next photo'} onClick={()=>go(1)}>›</button></>}
  {caption}
 </figure>;
}
// The popup: the photo blurred behind itself, glass arrows, and a film strip of today's memories.
// Pulled down from the top of any face; swipe it up, tap below it or press Escape to close.
export function PullPanel({c,widgets,close,openSettings}:{c:Ctx;widgets:string[];close:()=>void;openSettings:()=>void}){
 const start=useRef<number|null>(null);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[close]);
 const ws=widgets.filter(w=>WIDGETS[w]);
 return <div className="pull-backdrop" onClick={close}>
  <section className="pull" role="dialog" aria-modal="true" aria-label={c.lang==='ar'?'اللوحة المنسدلة':'Pull-down panel'} onClick={e=>e.stopPropagation()}
   onPointerDown={e=>{start.current=e.clientY;}} onPointerUp={e=>{const s=start.current;start.current=null;if(s!==null&&s-e.clientY>60)close();}}>
   <div className="pull-top"><span className={'link '+(c.connected?'live':'')}/>{c.connected?(c.lang==='ar'?'السيرفر متصل':'Server connected'):(c.lang==='ar'?'جاري الاتصال بالسيرفر':'Connecting to server')}<button onClick={openSettings}>{c.lang==='ar'?'الإعدادات':'Settings'}</button></div>
   <div className="pull-grid">{ws.length?ws.map(w=><section key={w} className={'w w-'+w}>{WIDGETS[w].render(c)}</section>):<p className="quiet">{c.lang==='ar'?'اختر ما يظهر هنا من الإعدادات، تحت «السحب».':'Choose what shows here in Settings, under Gestures.'}</p>}</div>
   <button className="pull-handle" aria-label={c.lang==='ar'?'إغلاق':'Close'} onClick={close}/>
  </section>
 </div>;
}

// All of today's memories as thumbnails, grouped by year; folded into one button until opened.
function Filmstrip({c,at}:{c:Ctx;at:number}){
 const [open,setOpen]=useState(false);const strip=useRef<HTMLDivElement>(null);
 const ms=c.memories||[];const total=ms.reduce((n,m)=>n+m.assets.length,0);
 // Scroll only the strip (scrollIntoView would also scroll the page or popup).
 useEffect(()=>{const s=strip.current,on=s?.querySelector<HTMLElement>('.on');if(s&&on)s.scrollTo({left:on.offsetLeft-s.clientWidth/2+on.offsetWidth/2,behavior:open?'smooth':'auto'});},[at,open]);
 if(total<2)return null;
 let i=0;
 return <div className={'filmstrip'+(open?' open':'')} onPointerUp={e=>e.stopPropagation()}>
  <button className="film-toggle" aria-expanded={open} onClick={()=>setOpen(!open)}>{c.lang==='ar'?'كل الذكريات':'All memories'} <b dir="ltr">{total}</b><span aria-hidden="true">{open?'▾':'▴'}</span></button>
  {open&&<div className="film" ref={strip} dir="ltr">{ms.map(m=><section key={m.year} className="film-year">
   <header dir={c.lang==='ar'?'rtl':'ltr'}><strong>{m.year}</strong><span>{yearsAgo(m.year,c.lang,c.now)}</span></header>
   <ol>{m.assets.map(a=>{const k=i++;return <li key={a.id}><button className={k===at?'on':''} aria-label={`${m.year} ${k+1}`} aria-current={k===at} onClick={()=>c.setMemIndex(k)}><img src={'/api/memories/photo/'+a.id+'?size=thumbnail'} alt="" loading="lazy" draggable={false}/></button></li>;})}</ol>
  </section>)}</div>}
 </div>;
}

export function MemoriesSheet({c,close}:{c:Ctx;close:()=>void}){
 const photos=(c.memories||[]).flatMap(m=>m.assets.map(a=>({...a,year:m.year})));
 const n=photos.length,at=n?((c.memIndex%n)+n)%n:0,p=photos[at];
 const start=useRef<{x:number;y:number}|null>(null);
 const go=(d:number)=>c.setMemIndex(at+d);usePreload(photos,at);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')close();if(e.key==='ArrowRight')go(1);if(e.key==='ArrowLeft')go(-1);};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);});
 if(!p)return null;
 const src='/api/memories/photo/'+p.id;
 return <div className="mem-pop" role="dialog" aria-modal="true" aria-label={c.lang==='ar'?'الذكريات':'Memories'}>
  <img className="mem-pop-bg" src={src} alt="" aria-hidden="true"/>
  <header>
   <div><strong>{c.lang==='ar'?'في مثل هذا اليوم':'On this day'}</strong><span>{yearsAgo(p.year,c.lang,c.now)}، <bdi>{p.year}</bdi></span></div>
   <span className="count" dir="ltr">{at+1} / {n}</span>
   <button className="glass" autoFocus aria-label={c.lang==='ar'?'إغلاق':'Close'} onClick={close}>×</button>
  </header>
  <div className="mem-pop-stage" onPointerDown={e=>{start.current={x:e.clientX,y:e.clientY};}} onPointerUp={e=>{const d=flipFrom(start.current,e,false);start.current=null;if(d)go(d);}}>
   <img key={p.id} src={src} alt="" draggable={false}/>
   {n>1&&<><button dir="ltr" className="glass nav left" aria-label={c.lang==='ar'?'الصورة السابقة':'Previous photo'} onClick={()=>go(-1)}>‹</button>
    <button dir="ltr" className="glass nav right" aria-label={c.lang==='ar'?'الصورة التالية':'Next photo'} onClick={()=>go(1)}>›</button></>}
  </div>
  <Filmstrip c={c} at={at}/>
 </div>;
}

export const WIDGETS:Record<string,{ar:string;en:string;render:(c:Ctx)=>React.ReactNode}>={
 weather:{ar:'الطقس',en:'Weather',render:c=><WeatherWidget c={c}/>},
 reminders:{ar:'التذكيرات',en:'Reminders',render:c=><RemindersWidget c={c}/>},
 memories:{ar:'ذكريات Immich',en:'Immich memories',render:c=><Slideshow c={c} mode="widget"/>},
 clock:{ar:'الساعة والتاريخ',en:'Clock and date',render:c=><ClockBlock c={c} size="widget"/>},
 next:{ar:'الصلاة القادمة',en:'Next prayer',render:c=><NextPrayer c={c}/>},
 prayers:{ar:'مواقيت اليوم',en:'Today’s prayer times',render:c=><PrayerList c={c} variant="strip"/>},
 tasks:{ar:'المهام',en:'Tasks',render:c=><TaskList c={c} rowHeight={52} editing={false} filter={c.homeFilter==='same'?c.taskFilter:c.homeFilter}/>},
 hijri:{ar:'التاريخ الهجري',en:'Hijri date',render:c=><p className="hijri-widget">{hijriText(c.now,c.lang)}</p>},
};

/* ───────── Faces ───────── */

// Each widget sits in the right or left column (physical sides, whatever the language), in home order.
// A column with one widget gives it the full height.
const OPENS:Record<string,string>={clock:'clock',hijri:'clock',next:'prayer',prayers:'prayer',tasks:'tasks'};
export const sideOf=(sides:Ctx['sides'],w:string,i:number)=>sides[w]||(i===0?'right':'left');
function HomeFace({c,widgets}:{c:Ctx;widgets:string[]}){
 const ws=widgets.filter(w=>WIDGETS[w]);const dir=c.lang==='ar'?'rtl':'ltr';
 const cols=(['left','right'] as const).map(side=>ws.filter((w)=>sideOf(c.sides,w,widgets.indexOf(w))===side)).filter(l=>l.length);
 // Tapping a widget (not one of its buttons) opens its full view.
 // A drag (scrolling the list, a swipe) is not a tap.
 const down=useRef({x:0,y:0});
 const tap=(w:string)=>(e:React.MouseEvent)=>{const v=OPENS[w];const moved=Math.hypot(e.clientX-down.current.x,e.clientY-down.current.y)>10;if(v&&!moved&&!(e.target as HTMLElement).closest('button,input,select,a'))c.openView(v);};
 return <div className={'face home'+(cols.length===1?' single':'')} dir="ltr" onPointerDownCapture={e=>{down.current={x:e.clientX,y:e.clientY};}}>
  {cols.map((list,k)=>list.length===1
   ?<section key={k} dir={dir} className={'w w-'+list[0]+' hero'+(OPENS[list[0]]?' opens':'')} onClick={tap(list[0])}>{WIDGETS[list[0]].render(c)}</section>
   :<div key={k} dir={dir} className="home-side">{list.map(w=><section key={w} className={'w w-'+w+(OPENS[w]?' opens':'')} onClick={tap(w)}>{WIDGETS[w].render(c)}</section>)}</div>)}
 </div>;
}

function ClockFace({c}:{c:Ctx}){
 return <div className="face clock-face"><ClockBlock c={c} size="face"/><div className="clock-next"><NextPrayer c={c}/></div></div>;
}

// The day as a 24-hour dial: noon at the top, midnight at the bottom, the brass hand is now.
function Dial({c}:{c:Ctx}){
 const R=170,C=200;
 const at=(min:number,r:number)=>{const a=min/1440*2*Math.PI+Math.PI;return [C+r*Math.sin(a),C-r*Math.cos(a)] as const;};
 const today=c.prayers?.today||[];const find=(k:string)=>today.find(p=>p.key===k);
 const rise=find('sunrise'),set=find('maghrib');
 let day='';
 if(rise&&set){const [x1,y1]=at(minutesOf(rise.time),R),[x2,y2]=at(minutesOf(set.time),R);const span=minutesOf(set.time)-minutesOf(rise.time);day=`M${x1} ${y1}A${R} ${R} 0 ${span>720?1:0} 1 ${x2} ${y2}`;}
 const nowMin=berlinMinutes(c.now);const [hx0,hy0]=at(nowMin,R*.62),[hx,hy]=at(nowMin,R-14),[dx,dy]=at(nowMin,R);
 return  <svg className="dial" direction="ltr" viewBox="-80 -30 560 460" role="img" aria-label={c.lang==='ar'?'دائرة اليوم ومواقيت الصلاة':'Day dial with prayer times'}>
  <circle cx={C} cy={C} r={R} className="dial-night"/>
  {day&&<path d={day} className="dial-day"/>}
  {Array.from({length:24},(_,h)=>{const [x1,y1]=at(h*60,R-8),[x2,y2]=at(h*60,R-(h%6?14:22));return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} className={'tick'+(h%6?'':' major')}/>;})}
  {today.map(p=>{const m=minutesOf(p.time),[x,y]=at(m,R),[lx,ly]=at(m,R+24);const anchor=lx>C+20?'start':lx<C-20?'end':'middle';const cls=(c.next?.at===p.at?' next':'')+(c.active?.at===p.at?' active':'')+(p.key==='sunrise'?' sunrise':'');
   return <g key={p.key} className={'mark'+cls}><circle cx={x} cy={y} r={p.key==='sunrise'?5:8}/><text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle">{prayerName(c.lang,p.key)}</text></g>;})}
  <line x1={hx0} y1={hy0} x2={hx} y2={hy} className="hand"/>
  <circle cx={dx} cy={dy} r={5} className="hand-tip"/>
   </svg>;
}

function PrayerFace({c}:{c:Ctx}){
 const focus=c.active||c.next;
 return <div className="face prayer-face">
  <div className="dial-wrap">
   <Dial c={c}/>
   <div className="dial-center">
    {focus?<>
     <span>{c.active?(c.lang==='ar'?'حان الآن وقت':'It is time for'):(c.lang==='ar'?'الصلاة القادمة':'Next prayer')}</span>
     <strong>{prayerName(c.lang,focus.key)}</strong>
     {c.active?<em dir="ltr">{c.active.time}</em>:<em><bdi>{countdown(focus.at-c.now.getTime(),c.lang)}</bdi></em>}
    </>:<span>{c.lang==='ar'?'جاري تحميل المواقيت':'Loading prayer times'}</span>}
    {!c.active&&<SunriseLine c={c}/>}
    {c.adhanPlaying&&<button className="stop-adhan" onClick={c.stopAdhan}>{c.lang==='ar'?'إيقاف الأذان':'Stop adhan'}</button>}
   </div>
  </div>
  <div className="prayer-side">
   <PrayerList c={c} variant="column"/>
   <p className="mosque">{c.lang==='ar'?'مسجد الإيمان، هامبورغ':'El Iman Mosque, Hamburg'}{c.prayers?.jumua.length?(c.lang==='ar'?`. الجمعة ${c.prayers.jumua.join(' و ')}`:`. Jumuʿa ${c.prayers.jumua.join(' and ')}`):''}</p>
  </div>
 </div>;
}

function MemoriesFace({c}:{c:Ctx}){
 const n=(c.memories||[]).reduce((k,m)=>k+m.assets.length,0);
 return <div className="face memories-face"><Slideshow c={c} mode="face"/><Filmstrip c={c} at={n?((c.memIndex%n)+n)%n:0}/></div>;
}

// Notes as round chips: tap to show or hide that note's tasks.
export function NoteChips({c}:{c:Ctx}){
 if(!c.notes||c.notes.files.length<2)return null;
 return <div className="note-chips" role="group" aria-label={c.lang==='ar'?'الملاحظات المعروضة':'Shown notes'}>
  {c.notes.files.map(f=>{const on=c.notes!.visible.includes(f);return <button key={f} className={on?'on':''} aria-pressed={on} disabled={c.busy||!c.connected} onClick={()=>c.notes!.toggle(f)} dir="auto">{f.replace(/\.md$/,'')}</button>;})}
 </div>;
}

// A button showing how many notes are shown; it opens the list to pick them.
export function NotePicker({c}:{c:Ctx}){
 const [open,setOpen]=useState(false);const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;const out=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false);};const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};
  document.addEventListener('pointerdown',out);window.addEventListener('keydown',k);return()=>{document.removeEventListener('pointerdown',out);window.removeEventListener('keydown',k);};},[open]);
 if(!c.notes||c.notes.files.length<2)return null;
 return <div className="note-picker" ref={ref}>
  <button className={'note-button'+(open?' on':'')} aria-expanded={open} aria-haspopup="true" onClick={()=>setOpen(!open)}>{c.lang==='ar'?'الملاحظات':'Notes'} <b dir="ltr">{c.notes.visible.length}/{c.notes.files.length}</b></button>
  {open&&<div className="note-menu"><NoteChips c={c}/></div>}
 </div>;
}

function TasksFace({c}:{c:Ctx}){
 const [editing,setEditing]=useState(false);
 return <div className="face tasks-face">
  <header>
   <h1>{c.lang==='ar'?'المهام':'Tasks'}</h1>
   {c.taskFolder&&<span className="source" dir="auto">{c.taskFolder}</span>}
   <NotePicker c={c}/>
   <button className={'edit-toggle'+(editing?' on':'')} aria-pressed={editing} onClick={()=>setEditing(!editing)}>{editing?(c.lang==='ar'?'تم':'Done'):(c.lang==='ar'?'تعديل المهام':'Edit tasks')}</button>
  </header>
  <TaskFilters c={c} value={c.taskFilter} set={c.setTaskFilter}/>
  <TaskList c={c} rowHeight={68} editing={editing} filter={c.taskFilter}/>
 </div>;
}

export const FACES:Record<string,(p:{c:Ctx;widgets:string[]})=>React.ReactNode>={
 home:HomeFace,clock:ClockFace,prayer:PrayerFace,tasks:TasksFace,memories:MemoriesFace,
};
