import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
// Widgets shown on the home face, in order. Faces: home, clock, prayer, tasks.
export const WIDGETS=['clock','prayers','tasks','next','hijri','weather','reminders','memories'];
export const DEFAULT_LAYOUT={home:['clock','next','prayers','tasks'],auto:true,returnAfter:60,prayerBefore:10,prayerAfter:20,theme:'lapis',accent:'',hiddenFiles:[],sides:{},panel:['next','prayers','reminders','weather'],swipes:{left:'tasks',right:'memories',up:'prayer',down:'panel'},followOmarchy:false,reminderSound:'chime'};
export function createStore(path){
 const db=new DatabaseSync(path);
 db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS todos(id TEXT PRIMARY KEY,title TEXT NOT NULL,done INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS prayed(date TEXT NOT NULL,prayer TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(date,prayer)); INSERT OR IGNORE INTO settings VALUES('blackout','false'); INSERT OR IGNORE INTO settings VALUES('night','{"enabled":false,"start":"23:00","end":"07:00"}');`);
 // Older databases lack the status column; rows from before it were on time.
 if(!db.prepare('PRAGMA table_info(prayed)').all().some(c=>c.name==='status'))db.exec("ALTER TABLE prayed ADD COLUMN status TEXT NOT NULL DEFAULT 'ontime'");
 const get=key=>{const row=db.prepare('SELECT value FROM settings WHERE key=?').get(key);return row&&JSON.parse(row.value);};
 return {night:()=>JSON.parse(db.prepare("SELECT value FROM settings WHERE key='night'").get().value),
 setNight:value=>db.prepare("UPDATE settings SET value=? WHERE key='night'").run(JSON.stringify(value)),
 layout:()=>({...DEFAULT_LAYOUT,...get('layout')}),
 // Prayer log: one row per prayed prayer and Hamburg date; status ontime (حاضر), late (آخر الوقت) or qada (قضاء). null clears it.
 setPrayed:(date,prayer,status)=>status?db.prepare('INSERT INTO prayed(date,prayer,at,status) VALUES(?,?,?,?) ON CONFLICT(date,prayer) DO UPDATE SET status=excluded.status,at=excluded.at').run(date,prayer,Date.now(),status):db.prepare('DELETE FROM prayed WHERE date=? AND prayer=?').run(date,prayer),
 prayedSince:date=>db.prepare('SELECT date,prayer,status FROM prayed WHERE date>=? ORDER BY date').all(date).reduce((out,r)=>((out[r.date]??={})[r.prayer]=r.status,out),{}),
 setLayout:value=>db.prepare("INSERT INTO settings VALUES('layout',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(value)),
 state:()=>({layout:{...DEFAULT_LAYOUT,...get('layout')},night:JSON.parse(db.prepare("SELECT value FROM settings WHERE key='night'").get().value),todos:db.prepare('SELECT * FROM todos ORDER BY created DESC,id').all().map(t=>({...t,done:!!t.done})),blackout:db.prepare("SELECT value FROM settings WHERE key='blackout'").get().value==='true'}),
 add(title){const id=randomUUID();db.prepare('INSERT INTO todos VALUES(?,?,0,?)').run(id,title,Date.now());return id;},
 update:(id,{done,title})=>db.prepare('UPDATE todos SET done=COALESCE(?,done),title=COALESCE(?,title) WHERE id=?').run(done===undefined?null:Number(done),title??null,id).changes,
 remove:id=>db.prepare('DELETE FROM todos WHERE id=?').run(id).changes,
 blackout:value=>db.prepare("UPDATE settings SET value=? WHERE key='blackout'").run(String(value)),close:()=>db.close()};
}
