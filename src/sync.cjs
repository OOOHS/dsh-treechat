'use strict';
const C=require('./core.cjs');

function createServerGraphStore(storage,request){
 let state=C.emptyGraph(),revision=-1,error=null,loaded=false,pendingMigration=null;
 const listeners=new Set();
 function notify(){state={...state};for(const fn of listeners)fn();}
 function accept(doc){
  if(doc.revision<revision)return;
  const graph=C.validateGraph(doc.graph);
  if(JSON.stringify(graph)!==JSON.stringify(state)||error){state=graph;error=null;revision=doc.revision;notify();}
  else revision=doc.revision;
 }
 // Read old records only. Never destroy the original browser backup.
 let legacyError=null;
 try{const raw=storage.getItem(C.STORAGE_KEY);if(raw){pendingMigration=C.validateGraph(JSON.parse(raw));state=pendingMigration;}}
 catch{legacyError='旧浏览器分支记录无法读取，原始数据已保留。';}
 async function refresh(){
  try{
   const doc=await request();
   if(pendingMigration){accept(await request({type:'migrate',graph:pendingMigration}));pendingMigration=null;}
   else accept(doc);
   loaded=true;
   if(legacyError){error=legacyError;notify();}
  }catch(e){error=e.message||'分支树尚未同步到服务端';notify();throw e;}
 }
 let queue=Promise.resolve();
 function mutate(op){
  const task=queue.then(async()=>{
   await refresh();
   const operation={...op};
   if(operation.id)operation.expected=state.branches[operation.id];
   try{accept(await request(operation));}catch(e){error=e.message;notify();throw e;}
  });queue=task.catch(()=>{});return task;
 }
 return {
  getSnapshot:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},get error(){return error;},
  refresh,async ensureWritable(){await refresh();if(!loaded)throw new Error('正在读取分支树，请重试');},
  add:branch=>mutate({type:'add',branch}),rename:(id,title)=>mutate({type:'rename',id,title}),
  promote:id=>mutate({type:'promote',id}),demote:id=>mutate({type:'demote',id})
 };
}
async function graphRequest(operation){
 const response=await fetch('/api/treechat/graph',{
  method:operation?'POST':'GET',credentials:'same-origin',cache:'no-store',
  ...(operation?{headers:{'content-type':'application/json'},body:JSON.stringify(operation)}:{}),
  signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw new Error('分支树同步失败，请检查连接后重试');
 return response.json();
}
module.exports={createServerGraphStore,graphRequest};
