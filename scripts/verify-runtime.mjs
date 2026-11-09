import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {loadConfig} from './dev-config.mjs';
import {controlRequest} from './preview-control.mjs';

// Run a real DSH host without sending any model request or printing launch tokens.
const config=await loadConfig();
const child=spawn(process.execPath,[join(config.root,'scripts/dev.mjs')],{
 cwd:config.root,env:config.env,stdio:['ignore','pipe','pipe'],
});
let log='',exited=false;
child.stdout.on('data',chunk=>{log+=chunk;});
child.stderr.on('data',chunk=>{log+=chunk;});
const closed=new Promise(resolve=>child.once('close',code=>{exited=true;resolve(code);}));
let launchUrl;
try{
 await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{clearInterval(poll);reject(new Error('DSH did not become ready within 30 seconds.'));},30000);
  const poll=setInterval(()=>{
   launchUrl=log.match(/dsh web:\s*(http:\/\/127\.0\.0\.1:\d+\/\S*)/)?.[1];
   if(launchUrl||exited){clearInterval(poll);clearTimeout(timeout);launchUrl?resolve():reject(new Error('DSH exited before becoming ready.'));}
  },100);
  child.once('error',error=>{clearInterval(poll);clearTimeout(timeout);reject(error);});
 });
 const base=new URL(launchUrl).origin;
 const unauthenticated=await fetch(base,{redirect:'manual',signal:AbortSignal.timeout(5000)});
 assert.equal(unauthenticated.status,401,'Index must require authentication');
 const login=await fetch(launchUrl,{redirect:'manual',signal:AbortSignal.timeout(5000)});
 assert.equal(login.status,303);
 const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
 assert.ok(cookie,'DSH must issue a browser session cookie');
 const page=await fetch(base,{headers:{cookie},signal:AbortSignal.timeout(5000)});
 assert.equal(page.status,200);
 const html=await page.text();
 assert.ok(html.includes('dsh-treechat'),'Authenticated HTML must advertise TreeChat');
 const response=await fetch(base+'/api/pluginInventory/list',{
  method:'POST',headers:{cookie,origin:base,'content-type':'application/json'},
  body:JSON.stringify({type:'client-request',rpcId:'treechat-install-check',method:'pluginInventory/list',payload:{args:{}}}),
  signal:AbortSignal.timeout(10000),
 });
 assert.equal(response.status,200);
 const envelope=await response.json();
 assert.equal(envelope.result?.ok,true,JSON.stringify(envelope.result));
 const inventory=envelope.result.value;
 const installed=inventory.entries.filter(entry=>/dsh-treechat|dsh-3d/.test(entry.moduleName));
 assert.ok(installed.some(entry=>entry.moduleName==='dsh-treechat'),'TreeChat must be in the live inventory');
 for(const entry of installed){assert.equal(entry.enabled,true);assert.equal(entry.fiberPhase,'active',JSON.stringify(entry));}
 const failures=inventory.entries.filter(entry=>entry.enabled&&entry.fiberPhase==='failed');
 assert.deepEqual(failures,[],'Enabled host plugins must not fail');
 assert.equal((await controlRequest(config,'ping')).pid,child.pid);
 console.log(JSON.stringify({dsh:'0.2.1-alpha.2',port:config.port,http:'passed',authentication:'passed',plugins:installed.map(({moduleName,enabled,fiberPhase})=>({moduleName,enabled,fiberPhase})),control:'passed',realModel:'skipped'},null,2));
 await controlRequest(config,'stop');
 const timeout=setTimeout(()=>child.kill('SIGKILL'),10000);
 try{assert.equal(await closed,0,'Managed stop must exit cleanly');}finally{clearTimeout(timeout);}
 console.log('Managed shutdown: passed. No model request was made.');
}finally{
 if(!exited){child.kill('SIGTERM');const timeout=setTimeout(()=>child.kill('SIGKILL'),5000);await closed;clearTimeout(timeout);}
}
