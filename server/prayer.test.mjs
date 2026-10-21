import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMosque,prayerView,atBerlin} from './prayer.mjs';
import {isNight} from '../shared/night.mjs';
const calendar=Array.from({length:12},()=>Object.fromEntries(Array.from({length:31},(_,i)=>[String(i+1),['05:50','07:30','12:30','15:30','18:30','20:30']])));
const data={name:'Test mosque',timezone:'Europe/Berlin',calendar,jumua:['13:30'],source:'test',fetchedAt:'2026-10-20T12:00:00Z'};
test('uses Berlin calendar date and selects tomorrow Fajr after Isha, excluding sunrise',()=>{
 const evening=prayerView(data,new Date('2026-10-20T21:00:00Z'));
 assert.equal(evening.date,'2026-10-20');assert.equal(evening.next.key,'fajr');assert.equal(evening.next.at,Date.parse('2026-10-21T03:50:00Z'));
 const morning=prayerView(data,new Date('2026-10-20T04:00:00Z'));assert.equal(morning.next.key,'dhuhr');
 assert.equal(prayerView(data,new Date('2027-01-01T12:00:00Z')),null);
 assert.equal(prayerView(data,new Date('2026-10-22T12:00:00Z')).stale,true);
});
test('Berlin epoch conversion follows daylight saving transitions',()=>{
 assert.equal(atBerlin('2026-10-24','05:50'),Date.parse('2026-10-24T03:50:00Z'));
 assert.equal(atBerlin('2026-10-25','05:50'),Date.parse('2026-10-25T04:50:00Z'));
 assert.equal(atBerlin('2026-03-29','05:50'),Date.parse('2026-03-29T03:50:00Z'));
});
test('rejects malformed upstream calendars, preserves Friday times',()=>{
 const raw={...data,jumua:'13:30',jumua2:'14:30'};
 const result=parseMosque(`var confData = ${JSON.stringify(raw)};\n`);assert.deepEqual(result.jumua,['13:30','14:30']);
 assert.throws(()=>parseMosque('unavailable'));
 assert.throws(()=>parseMosque(`confData = ${JSON.stringify({...raw,timezone:'UTC'})};\n`));
 const invalid=structuredClone(raw);invalid.calendar[0]['1'][0]='99:99';assert.throws(()=>parseMosque(`confData = ${JSON.stringify(invalid)};\n`));
});
test('night schedule crosses midnight, respects boundaries and Berlin DST',()=>{
 const schedule={enabled:true,start:'23:00',end:'07:00'};
 assert.equal(isNight(new Date('2026-10-20T20:59:00Z'),schedule),false);
 assert.equal(isNight(new Date('2026-10-20T21:00:00Z'),schedule),true);
 assert.equal(isNight(new Date('2026-10-21T04:59:00Z'),schedule),true);
 assert.equal(isNight(new Date('2026-10-21T05:00:00Z'),schedule),false);
 assert.equal(isNight(new Date('2026-10-26T05:59:00Z'),schedule),true);
 assert.equal(isNight(new Date('2026-10-26T06:00:00Z'),schedule),false);
 assert.equal(isNight(new Date('2026-10-21T01:00:00Z'),{...schedule,enabled:false}),false);
 const daytime={enabled:true,start:'10:00',end:'12:00'};assert.equal(isNight(new Date('2026-10-20T09:00:00Z'),daytime),true);
});
