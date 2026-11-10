import {readFile,mkdir,open,rename,unlink} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import Core from './src/core.cjs';

// One authenticated DSH home owns the graph. Parent/session ids bind each
// branch to its conversation; promotion never changes those identities.
export function createGraphServer(filename){
 let queue=Promise.resolve();
 async function read(){
  try{
   const doc=JSON.parse(await readFile(filename,'utf8'));
   if(doc.version!==1||!Number.isSafeInteger(doc.revision))throw new Error('Invalid graph envelope');
   return {...doc,graph:Core.validateGraph(doc.graph)};
  }catch(error){if(error.code==='ENOENT')return {version:1,revision:0,graph:Core.emptyGraph()};throw error;}
 }
 async function save(doc){
  await mkdir(dirname(filename),{recursive:true});
  const temp=filename+'.'+randomUUID()+'.tmp';
  try{const file=await open(temp,'wx',0o600);try{await file.writeFile(JSON.stringify(doc));await file.sync();}finally{await file.close();}await rename(temp,filename);}
  finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 }
 async function update(op){
  const doc=await read(),branches={...doc.graph.branches};
  if(op.type==='migrate'){
   const incoming=Core.validateGraph(op.graph);
   for(const [id,branch] of Object.entries(incoming.branches))if(!Object.hasOwn(branches,id))branches[id]=branch;
  }else if(op.type==='add'){
   const branch=Core.validateGraph({version:1,branches:{[op.branch?.sessionId]:op.branch}}).branches[op.branch.sessionId];
   const old=branches[branch.sessionId];
   if(old&&JSON.stringify(old)!==JSON.stringify(branch))throw new Error('分支已存在，请刷新后重试');
   branches[branch.sessionId]=branch;
  }else if(['rename','promote','demote'].includes(op.type)){
   const branch=Object.hasOwn(branches,op.id)?branches[op.id]:null;
   if(!branch)throw new Error('分支不存在');
   if(JSON.stringify(branch)!==JSON.stringify(op.expected))throw new Error('其他窗口已修改此分支，请重试');
   branches[op.id]={...branch,...(op.type==='rename'?{title:op.title}:{promoted:op.type==='promote'})};
  }else throw new Error('不支持的树操作');
  const graph=Core.validateGraph({version:1,branches});
  if(JSON.stringify(graph)===JSON.stringify(doc.graph))return doc;
  const next={version:1,revision:doc.revision+1,graph};await save(next);return next;
 }
 return {async fetch(request){
  try{
   if(request.method==='GET')return Response.json(await read(),{headers:{'cache-control':'no-store'}});
   if(request.method!=='POST')return new Response(null,{status:405});
   const body=await request.text();if(body.length>8*1024*1024)return Response.json({error:'树数据过大'},{status:413});
   const op=JSON.parse(body);
   const task=queue.then(()=>update(op));queue=task.catch(()=>{});
   return Response.json(await task,{headers:{'cache-control':'no-store'}});
  }catch{return Response.json({error:'分支树保存或读取失败，请重试；原有服务端数据已保留。'},{status:409});}
 }};
}
