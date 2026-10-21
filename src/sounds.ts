// Reminder sounds are synthesized, so there are no audio files to manage.
// Safari starts audio only after a touch: unlockAudio runs on every pointerdown.
let ctx:AudioContext|undefined;
export function unlockAudio(){try{ctx??=new AudioContext();if(ctx.state==='suspended')void ctx.resume();}catch{}}
export const SOUNDS={chime:{ar:'جرس ناعم',en:'Chime'},bell:{ar:'ناقوس',en:'Bell'},soft:{ar:'هادئ',en:'Soft'},digital:{ar:'رقمي',en:'Digital'}} as const;
type Note=[freq:number,start:number,dur:number,type?:OscillatorType,gain?:number];
const PATTERNS:Record<string,Note[]>={
 chime:[[880,0,.7],[1318.5,.2,1.1]],
 bell:[[523.25,0,2.4,'sine',.5],[1444,0,1.4,'sine',.18],[2826,0,.8,'sine',.08]],
 soft:[[440,0,.9,'triangle'],[554.4,.45,1.2,'triangle']],
 digital:[[1046,0,.12,'square',.12],[1046,.2,.12,'square',.12],[1046,.4,.12,'square',.12]],
};
export function playSound(name:string,repeat=3){
 if(!ctx)return false;
 const notes=PATTERNS[name]||PATTERNS.chime;
 for(let r=0;r<repeat;r++)for(const [f,start,dur,type='sine',g=.35] of notes){
  const t=ctx.currentTime+r*2+start,o=ctx.createOscillator(),v=ctx.createGain();
  o.type=type;o.frequency.value=f;v.gain.setValueAtTime(0,t);v.gain.linearRampToValueAtTime(g,t+.01);v.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(v).connect(ctx.destination);o.start(t);o.stop(t+dur+.05);
 }
 return ctx.state==='running';
}
