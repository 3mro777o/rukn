import {readFileSync,existsSync,watch,mkdirSync,writeFileSync,renameSync,readdirSync,statSync,unlinkSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

// Forecast: DWD ICON (2 km ICON-D2 over Germany) via Open-Meteo. "Now": measured by the nearest DWD station via Bright Sky.
// No accounts. Cached 15 minutes; the last good data is kept when a refresh fails.
export function createWeather({lat=53.46,lon=9.98}={}){
 let data=null,until=0,pending=null;
 const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=Europe%2FBerlin&forecast_hours=25&models=icon_seamless`
  +'&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m'
  +'&hourly=temperature_2m,precipitation_probability,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&forecast_days=1';
 return {async get(){
  if(Date.now()<until)return data;
  pending??=(async()=>{try{const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`HTTP ${r.status}`);const j=await r.json();
   const obs=await fetch(`https://api.brightsky.dev/current_weather?lat=${lat}&lon=${lon}`,{signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():null).catch(()=>null);
   const o=obs?.weather,station=obs?.sources?.[0]?.station_name||null;
   data={station:o?.temperature!=null?station:null,current:{temp:o?.temperature??j.current.temperature_2m,feels:j.current.apparent_temperature,code:j.current.weather_code,day:!!j.current.is_day,wind:o?.wind_speed_10??j.current.wind_speed_10m,humidity:o?.relative_humidity??j.current.relative_humidity_2m},
    hours:j.hourly.time.map((t,i)=>({time:t.slice(11,16),temp:j.hourly.temperature_2m[i],rain:j.hourly.precipitation_probability[i],code:j.hourly.weather_code[i],day:!!j.hourly.is_day[i]})),
    max:j.daily.temperature_2m_max[0],min:j.daily.temperature_2m_min[0],fetchedAt:new Date().toISOString()};
   until=Date.now()+15*60000;}catch(e){console.error('Weather refresh failed:',e.message);until=Date.now()+60000;}finally{pending=null;}})();
  await pending;return data;
 }};
}

// Colors of the active Omarchy theme; the watcher reports theme switches.
const OMARCHY=process.env.OMARCHY_DIR||join(homedir(),'.local/state/omarchy/current');
export function createOmarchyTheme(onChange,dir=OMARCHY){
 const file=join(dir,'theme/colors.toml');
 const read=()=>{try{return Object.fromEntries([...readFileSync(file,'utf8').matchAll(/^(\w+)\s*=\s*"(#[0-9a-fA-F]{6})"/gm)].map(m=>[m[1],m[2].toLowerCase()]));}catch{return null;}};
 let timer;const watcher=existsSync(dir)?watch(dir,{recursive:true},()=>{clearTimeout(timer);timer=setTimeout(onChange,300);}):null;
 return {read,close(){clearTimeout(timer);watcher?.close();}};
}

// Immich "on this day" memories. The API key stays on the server; photos are proxied.
// Cache on disk: today's list (survives restarts) and every photo fetched, kept 14 days.
export function createImmich({url,apiKey}={},cacheDir){
 if(!url||!apiKey)return null;
 const base=url.replace(/\/$/,'');const headers={'x-api-key':apiKey,Accept:'application/json'};
 const dir=join(cacheDir,'memories');mkdirSync(dir,{recursive:true});
 const listFile=join(dir,'list.json');const atomic=(f,data)=>{writeFileSync(f+'.tmp',data);renameSync(f+'.tmp',f);};
 let cache={date:'',until:0,data:[]};try{cache={...JSON.parse(readFileSync(listFile,'utf8')),until:0};}catch{}
 const prune=()=>{const old=Date.now()-14*864e5;for(const f of readdirSync(dir))if(f!=='list.json'&&statSync(join(dir,f)).mtimeMs<old)unlinkSync(join(dir,f));};
 return {
  async memories(){
   const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'}).format(new Date());
   if(cache.date===date&&Date.now()<cache.until)return cache.data;
   try{
    const r=await fetch(`${base}/api/memories?for=${date}&type=on_this_day`,{headers,signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error(`Immich HTTP ${r.status}`);
    const data=(await r.json()).filter(m=>!m.hideAt||Date.parse(m.hideAt)>Date.now()).map(m=>({year:m.data?.year,assets:m.assets.filter(a=>a.type==='IMAGE'&&a.visibility!=='hidden').map(a=>({id:a.id,date:a.localDateTime}))})).filter(m=>m.assets.length).sort((a,b)=>b.year-a.year);
    cache={date,until:Date.now()+3600000,data};atomic(listFile,JSON.stringify({date,data}));prune();return data;
   }catch(e){if(cache.date===date)return cache.data;throw e;}
  },
  // Returns the cached file path, fetching the photo once.
  async photo(id,size){
   for(const ext of ['webp','jpg'])if(existsSync(join(dir,`${id}-${size}.${ext}`)))return join(dir,`${id}-${size}.${ext}`);
   const r=await fetch(`${base}/api/assets/${id}/thumbnail?size=${size}`,{headers:{'x-api-key':apiKey},signal:AbortSignal.timeout(20000)});
   if(!r.ok)throw Object.assign(Error(`Immich HTTP ${r.status}`),{status:r.status});
   const f=join(dir,`${id}-${size}.${r.headers.get('content-type')?.includes('webp')?'webp':'jpg'}`);atomic(f,Buffer.from(await r.arrayBuffer()));return f;
  }
 };
}
