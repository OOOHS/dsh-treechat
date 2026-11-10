import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createGraphServer} from '../server.mjs';
import C from '../src/core.cjs';
import Sync from '../src/sync.cjs';

function branch(id='child',parentId='main'){
 return {sessionId:id,parentId,anchor:C.makeAnchor({sessionId:parentId,nodeKey:'assistant:1',atSeq:7,text:'讨论主题',start:0,end:4}),title:id,promoted:false,createdAt:1};
}
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'treechat-persist-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,'graph.json');let server=createGraphServer(path);
 const request=async op=>{const r=await server.fetch(new Request('http://local/api/treechat/graph',{method:op?'POST':'GET',...(op?{body:JSON.stringify(op)}:{})}));const doc=await r.json();if(!r.ok)throw new Error(doc.error);return doc;};
 return {path,request,restart(){server=createGraphServer(path);}};
}
function browser(raw=null){return {getItem:()=>raw,setItem(){throw new Error('No local writes allowed');}};}

test('old parent/child/nested graph automatically migrates, survives restart and loads in a new browser',async t=>{
 const f=await fixture(t),graph={version:1,branches:{child:branch(),nested:branch('nested','child')}};
 const raw=JSON.stringify(graph),storage=browser(raw),store=Sync.createServerGraphStore(storage,f.request);
 await store.ensureWritable();assert.deepEqual(store.getSnapshot(),graph);assert.equal(storage.getItem(),raw);
 f.restart();const fresh=Sync.createServerGraphStore(browser(),f.request);await fresh.refresh();assert.deepEqual(fresh.getSnapshot(),graph);
 assert.equal((await f.request()).revision,1);await store.refresh();assert.equal((await f.request()).revision,1);
});
test('a stale browser migration never overwrites server rename or promotion',async t=>{
 const f=await fixture(t),legacy=JSON.stringify({version:1,branches:{child:branch()}});
 const first=Sync.createServerGraphStore(browser(legacy),f.request);await first.refresh();await first.rename('child','新名称');await first.promote('child');
 const stale=Sync.createServerGraphStore(browser(legacy),f.request);await stale.refresh();assert.equal(stale.getSnapshot().branches.child.title,'新名称');assert.equal(stale.getSnapshot().branches.child.promoted,true);
});
test('concurrent additions merge without dropping another main conversation; updates persist and synchronize',async t=>{
 const f=await fixture(t),a=Sync.createServerGraphStore(browser(),f.request),b=Sync.createServerGraphStore(browser(),f.request);
 await Promise.all([a.add(branch('a','root-a')),b.add(branch('b','root-b'))]);
 await a.refresh();assert.equal(Object.keys(a.getSnapshot().branches).length,2);
 await a.rename('a','changed');await b.promote('b');await a.refresh();assert.equal(a.getSnapshot().branches.b.promoted,true);assert.equal(a.getSnapshot().branches.a.title,'changed');
});
test('stale edits to the same branch are rejected instead of overwriting newer data',async t=>{
 const f=await fixture(t);await f.request({type:'add',branch:branch()});const old=(await f.request()).graph.branches.child;
 await f.request({type:'rename',id:'child',title:'new',expected:old});
 await assert.rejects(f.request({type:'promote',id:'child',expected:old}));assert.equal((await f.request()).graph.branches.child.title,'new');
});
test('failed migration retains the browser original, reports failure, and automatically retries',async t=>{
 const f=await fixture(t),raw=JSON.stringify({version:1,branches:{child:branch()}}),storage=browser(raw);let offline=true;
 const store=Sync.createServerGraphStore(storage,async op=>{if(offline)throw new Error('offline');return f.request(op);});
 await assert.rejects(store.refresh(),/offline/);assert.equal(storage.getItem(),raw);assert.match(store.error,/offline/);
 offline=false;await store.refresh();assert.equal(store.error,null);assert.ok((await f.request()).graph.branches.child);
});
test('corrupt server documents and invalid cyclic migrations cannot overwrite saved data',async t=>{
 const f=await fixture(t);await f.request({type:'add',branch:branch()});const before=await readFile(f.path,'utf8');
 await assert.rejects(f.request({type:'migrate',graph:{version:1,branches:{child:branch('child','nested'),nested:branch('nested','child')}}}));assert.equal(await readFile(f.path,'utf8'),before);
 await writeFile(f.path,'broken');await assert.rejects(f.request({type:'add',branch:branch('other')}));assert.equal(await readFile(f.path,'utf8'),'broken');
});
test('corrupt or disabled local storage does not block an already saved server tree',async t=>{
 const f=await fixture(t);await f.request({type:'add',branch:branch()});
 const store=Sync.createServerGraphStore({getItem(){throw new Error('disabled');}},f.request);await store.refresh();assert.ok(store.getSnapshot().branches.child);assert.ok(store.error);
});
