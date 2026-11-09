import {spawn} from 'node:child_process';
import {open,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {loadConfig,credentialStatus,readOptional} from './dev-config.mjs';
import {controlRequest,restartManaged} from './preview-control.mjs';
const config=await loadConfig(),credentials=await credentialStatus(config);
if(process.argv.includes('--check')){console.log(JSON.stringify({dsh:'0.2.1-alpha.2',home:config.home,port:config.port,credential:credentials.available?'configured':'missing'},null,2));process.exit(credentials.available?0:1);}
const current=await readOptional(join(config.root,'.runtime/preview-process.json'));
async function stop(){
 if(!current)return;
 try{await controlRequest(config,'ping');}
 catch(error){if(['ENOENT','ECONNREFUSED'].includes(error.code))return;throw error;}
 await controlRequest(config,'stop');
 for(let i=0;i<100;i++){if(await readOptional(join(config.root,'.runtime/preview-process.json'))===null)return;await new Promise(resolve=>setTimeout(resolve,100));}
 throw new Error('预览尚未退出，未强制结束，也未启动第二个实例。');
}
async function start(){
 await mkdir(join(config.root,'.runtime'),{recursive:true});const log=join(config.root,'.runtime',`preview-${Date.now()}.log`),file=await open(log,'wx',0o600);let child;
 try{child=spawn(process.execPath,[join(config.root,'scripts/dev.mjs')],{cwd:config.root,detached:true,stdio:['ignore',file.fd,file.fd],env:config.env});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});}finally{await file.close();}
 child.unref();console.log(`预览正在启动。日志：${log}`);
 for(let i=0;i<300;i++){
  const text=await readOptional(log)||'',url=text.match(/dsh web:\s*(http:\/\/127\.0\.0\.1:\d+\/\S*)/)?.[1];
  if(url){console.log(`打开预览：\n${url}`);return;}
  try{process.kill(child.pid,0);}catch(e){if(e.code==='ESRCH')throw new Error(`预览启动失败，请检查日志：${log}`);throw e;}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw new Error(`预览未在等待时间内就绪，请检查日志：${log}`);
}
const legacy=await readOptional(join(config.root,'.runtime/native-process.json'));let hasLegacy=false;
if(!current&&legacy){try{process.kill(JSON.parse(legacy).pid,0);hasLegacy=true;}catch(e){if(e.code!=='ESRCH')throw e;}}
await restartManaged(config,{credentials,stop,start,hasLegacy,allowMissing:process.argv.includes('--allow-missing-credentials')||config.env.TREECHAT_MOCK==='1'});
