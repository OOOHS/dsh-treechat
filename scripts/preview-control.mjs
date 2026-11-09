import net from 'node:net';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chmod,mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
export function controlEndpoint(config,platform=process.platform){
 const id=createHash('sha256').update(JSON.stringify([config.root,config.home,config.port])).digest('hex').slice(0,24);
 return platform==='win32'?String.raw`\\.\pipe\treechat-${id}`:join(tmpdir(),`treechat-${id}.sock`);
}
export function controlReply(request,token,pid=process.pid){
 const received=Buffer.from(typeof request?.token==='string'?request.token:''),expected=Buffer.from(token);
 if(received.length!==expected.length||!timingSafeEqual(received,expected))return{ok:false,error:'invalid token'};
 if(request.command==='ping')return{ok:true,pid};
 if(request.command==='stop')return{ok:true};
 return{ok:false,error:'invalid command'};
}
export async function controlRequest(config,command,{timeoutMs=3000}={}){
 const state=JSON.parse(await readFile(join(config.root,'.runtime/preview-process.json'),'utf8'));
 const tcp=state.endpoint?.host==='127.0.0.1'&&Number.isInteger(state.endpoint.port)&&state.endpoint.port>0&&state.endpoint.port<=65535;
 if(state.root!==config.root||state.home!==config.home||state.port!==config.port||(!tcp&&state.endpoint!==controlEndpoint(config)))throw new Error('预览记录与当前项目不匹配，未操作进程。');
 return new Promise((resolve,reject)=>{
  const socket=net.createConnection(tcp?{host:'127.0.0.1',port:state.endpoint.port}:state.endpoint);let text='',settled=false;
  const timer=setTimeout(()=>socket.destroy(new Error('预览控制连接超时。')),timeoutMs);
  const done=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);socket.destroy();error?reject(error):resolve(result);};
  socket.once('connect',()=>socket.write(JSON.stringify({token:state.token,command})+'\n'));
  socket.on('data',chunk=>{text+=chunk;if(text.length>4096)return done(new Error('预览控制响应过长。'));if(text.includes('\n')){try{const result=JSON.parse(text.trim());result.ok?done(null,result):done(new Error(result.error||'预览控制失败。'));}catch(e){done(e);}}});
  socket.once('error',error=>done(error));socket.once('end',()=>{if(!text.includes('\n'))done(new Error('预览控制连接已关闭。'));});
 });
}
export async function startControl(config,onStop){
 const useTcp=config.env?.TREECHAT_CONTROL_TRANSPORT==='tcp';
 let endpoint=useTcp?{host:'127.0.0.1',port:0}:controlEndpoint(config);
 const token=randomBytes(24).toString('hex'),statePath=join(config.root,'.runtime/preview-process.json');
 if(existsSync(statePath)){
  try{await controlRequest(config,'ping');throw new Error('预览已经运行，请使用 npm run restart。');}
  catch(error){if(!['ENOENT','ECONNREFUSED'].includes(error.code))throw error;}
 }
 if(!useTcp&&process.platform!=='win32'&&existsSync(endpoint))await new Promise((resolve,reject)=>{
  const probe=net.createConnection(endpoint);
  probe.once('connect',()=>{probe.destroy();reject(new Error('预览已经运行，请使用 npm run restart。'));});
  probe.once('error',async error=>{if(!['ENOENT','ECONNREFUSED'].includes(error.code))return reject(error);try{await unlink(endpoint);}catch(e){if(e.code!=='ENOENT')return reject(e);}resolve();});
 });
 const server=net.createServer(socket=>{
  let text='',handled=false;socket.setTimeout(3000,()=>socket.destroy());
  socket.on('data',chunk=>{
   if(handled)return;text+=chunk;if(text.length>4096){socket.destroy();return;}if(!text.includes('\n'))return;handled=true;
   let request;try{request=JSON.parse(text.trim());}catch{socket.end('{"ok":false,"error":"invalid request"}\n');return;}
   const reply=controlReply(request,token);
   socket.end(JSON.stringify(reply)+'\n',()=>{if(reply.ok&&request.command==='stop')onStop();});
  });
  socket.on('error',()=>{});
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(endpoint,resolve);});
 try{
  if(useTcp)endpoint={host:'127.0.0.1',port:server.address().port};
  else if(process.platform!=='win32')await chmod(endpoint,0o600);
  await mkdir(join(config.root,'.runtime'),{recursive:true});
  await writeFile(statePath,JSON.stringify({version:1,pid:process.pid,root:config.root,home:config.home,port:config.port,endpoint,token},null,2),{mode:0o600});
  if(process.platform!=='win32')await chmod(statePath,0o600);
 }catch(error){await new Promise(resolve=>server.close(resolve));throw error;}
 return async()=>{await new Promise(resolve=>server.close(resolve));try{const state=JSON.parse(await readFile(statePath,'utf8'));if(state.token===token)await unlink(statePath);}catch(e){if(e.code!=='ENOENT')throw e;}};
}
export async function restartManaged(config,{credentials,stop,start,hasLegacy=false,allowMissing=false}){
 if(!allowMissing&&!credentials.available)throw new Error('尚未配置 DeepSeek 凭据，已保留当前预览。请先在当前服务的“设置 → 模型”保存密钥。首次配置可直接 npm run dev。');
 if(hasLegacy)throw new Error('旧版预览仍在运行，请先在其终端按 Ctrl+C；新版不会按端口结束未知程序。');
 await stop();return start();
}
