import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.mjs';
const data=resolve(process.env.DATA_DIR||'data');mkdirSync(data,{recursive:true});
const configPath=resolve(data,'config.json');
const config=existsSync(configPath)?JSON.parse(readFileSync(configPath,'utf8')):{};
const {app,close}=createApp(resolve(data,'rukn.sqlite'),undefined,config);
const server=app.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',(error)=>{if(error){console.error('Could not start Rukn:',error.message);close();process.exitCode=1;return;}console.log(`Rukn listening on port ${process.env.PORT||3000}`);});
for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{close();server.close(()=>process.exit(0));});
