import {readFileSync,writeFileSync,renameSync} from 'node:fs';
export const MOSQUE_URL='https://admin.mawaqit.net/en/m-el-iman-moschee-hamburg';
const clock=/^([01]\d|2[0-3]):[0-5]\d$/;
export function parseMosque(html){
 const match=html.match(/confData\s*=\s*(\{[\s\S]*?\});\s*\n/);
 if(!match)throw Error('Mosque data missing');
 const data=JSON.parse(match[1]);
 if(data.timezone!=='Europe/Berlin'||!Array.isArray(data.calendar)||data.calendar.length!==12)throw Error('Invalid mosque calendar');
 for(const month of data.calendar)for(const row of Object.values(month))if(!Array.isArray(row)||row.length!==6||!row.every(t=>clock.test(t)))throw Error('Invalid prayer times');
 return {name:data.name,timezone:data.timezone,calendar:data.calendar,jumua:[data.jumua,data.jumua2,data.jumua3].filter(x=>clock.test(x)),source:MOSQUE_URL};
}
export function dateInBerlin(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));return `${parts.year}-${parts.month}-${parts.day}`;
}
export function atBerlin(date,time){
 const target=Date.parse(`${date}T${time}:00Z`);let result=target;
 for(let i=0;i<3;i++){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(result)).map(x=>[x.type,x.value]));const displayed=Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);result+=target-displayed;}
 return result;
}
export function prayerView(data,now=new Date()){
 if(!data||new Date(data.fetchedAt).getUTCFullYear()!==now.getUTCFullYear())return null;
 const date=dateInBerlin(now);const tomorrow=new Date(`${date}T12:00:00Z`);tomorrow.setUTCDate(tomorrow.getUTCDate()+1);const nextDate=tomorrow.toISOString().slice(0,10);
 const keys=['fajr','sunrise','dhuhr','asr','maghrib','isha'];
 const rows=day=>{const [,month,dayOfMonth]=day.split('-').map(Number);return data.calendar[month-1]?.[String(dayOfMonth)]?.map((time,i)=>({key:keys[i],time,at:atBerlin(day,time)}))||[];};
 const today=rows(date), next=[...today,...(date.slice(0,4)===nextDate.slice(0,4)?rows(nextDate):[])].find(p=>p.key!=='sunrise'&&p.at>now.getTime());
 return {name:data.name,timezone:data.timezone,date,today,next:next||null,jumua:data.jumua,source:data.source,fetchedAt:data.fetchedAt,stale:now.getTime()-Date.parse(data.fetchedAt)>24*3600000};
}
export function createPrayerService(cachePath){
 let data=null,pending=null,retryAfter=0;
 try{const cached=JSON.parse(readFileSync(cachePath,'utf8'));data={...parseMosque(`confData = ${JSON.stringify({...cached,jumua:cached.jumua?.[0],jumua2:cached.jumua?.[1],jumua3:cached.jumua?.[2]})};\n`),fetchedAt:cached.fetchedAt};}catch{}
 async function refresh(){
  if(pending)return pending;
  if(Date.now()<retryAfter)return;
  pending=(async()=>{try{const response=await fetch(MOSQUE_URL,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Rukn home dashboard'}});if(!response.ok)throw Error(`Mawaqit HTTP ${response.status}`);const parsed=parseMosque(await response.text());data={...parsed,fetchedAt:new Date().toISOString()};writeFileSync(cachePath+'.tmp',JSON.stringify(data));renameSync(cachePath+'.tmp',cachePath);retryAfter=Date.now()+6*3600000;}catch(error){retryAfter=Date.now()+5*60000;console.error('Prayer refresh failed:',error.message);}finally{pending=null;}})();return pending;
 }
 void refresh();const timer=setInterval(()=>void refresh(),60000);timer.unref();
 return {async get(){if(!data)await refresh();return prayerView(data);},close:()=>clearInterval(timer)};
}
