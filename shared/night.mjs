export function isNight(now,schedule){
 if(!schedule?.enabled)return false;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
 const current=parts.hour+':'+parts.minute;
 return schedule.start>schedule.end?current>=schedule.start||current<schedule.end:current>=schedule.start&&current<schedule.end;
}
