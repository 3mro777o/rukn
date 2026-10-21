export type NightSchedule={enabled:boolean;start:string;end:string};
export function isNight(now:Date,schedule:NightSchedule):boolean;
