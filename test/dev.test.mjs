import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,symlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {loadConfig,credentialStatus,linkDirectory} from '../scripts/dev-config.mjs';
import {startControl,controlRequest,controlEndpoint,controlReply,restartManaged} from '../scripts/preview-control.mjs';
const require=createRequire(import.meta.url);
const runtime=dirname(require.resolve('@deepseek-ai/dsh/package.json'));
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'treechat-test-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}

test('a relocated project resolves its installed host and reuses the previous native profile',async t=>{
  const root=await fixture(t);await mkdir(join(root,'.runtime/native-home'),{recursive:true});
  await writeFile(join(root,'.env'),'PORT=3199\nDEEPSEEK_API_KEY=test-key\n');
  const config=await loadConfig({root,env:{DSH_RUNTIME:runtime,PORT:'3200'}});
  assert.equal(config.home,join(root,'.runtime/native-home'));assert.equal(config.port,3200);
  assert.equal(config.env.DSH_HOME,config.home);assert.equal((await credentialStatus(config)).available,true);
});

test('a provided env file remains available to the restarted host without exposing values',async t=>{
  const root=await fixture(t);await writeFile(join(root,'private.env'),'DEEPSEEK_API_KEY=example-not-a-real-key\nPORT=3201');
  const config=await loadConfig({root,env:{DSH_RUNTIME:runtime,TREECHAT_ENV_FILE:'private.env'}});
  assert.deepEqual(await credentialStatus(config),{available:true,source:'environment'});
  assert.equal(config.port,3201);assert.equal(JSON.stringify(await credentialStatus(config)).includes('example-not-a-real-key'),false);
});

test('stored DSH credentials are recognized after a restart without an environment key',async t=>{
  const root=await fixture(t),config=await loadConfig({root,env:{DSH_RUNTIME:runtime}});
  await mkdir(config.home,{recursive:true});
  await writeFile(join(config.home,'.credentials.yaml'),'version: 1\nrefs:\n  DEEPSEEK_API_KEY: example-not-a-real-key\n',{mode:0o600});
  assert.deepEqual(await credentialStatus(config),{available:true,source:'credential-store'});
});

test('missing credentials stop a restart before any process is contacted',async()=>{
  const calls=[];
  await assert.rejects(restartManaged({}, {credentials:{available:false},stop:()=>calls.push('stop'),start:()=>calls.push('start')}),/凭据/);
  assert.deepEqual(calls,[]);
});

test('a stop failure never launches a competing preview',async()=>{
  let started=false;
  await assert.rejects(restartManaged({}, {credentials:{available:true},stop:()=>{throw new Error('ownership mismatch');},start:()=>{started=true;}}),/ownership mismatch/);
  assert.equal(started,false);
});

test('preview control rejects missing, wrong and malformed tokens before executing commands',()=>{
  for(const request of [null,{}, {token:'wrong',command:'stop'}, {token:42,command:'stop'}])assert.deepEqual(controlReply(request,'private-token'),{ok:false,error:'invalid token'});
  assert.deepEqual(controlReply({token:'private-token',command:'ping'},'private-token',123),{ok:true,pid:123});
  assert.deepEqual(controlReply({token:'private-token',command:'stop'},'private-token'),{ok:true});
  assert.deepEqual(controlReply({token:'private-token',command:'kill'},'private-token'),{ok:false,error:'invalid command'});
});

test('preview management authenticates its own endpoint and rejects a bad token',async t=>{
  const root=await fixture(t),config={root,home:join(root,'home'),port:3202};let stopped=0;
  const stopObserved=Promise.withResolvers();
  let close;try{close=await startControl(config,()=>{stopped++;stopObserved.resolve();});}catch(error){if(['EPERM','EACCES'].includes(error.code)&&error.syscall==='listen'){t.skip(`Environment forbids IPC listen (${error.code}); integration not verified.`);return;}throw error;}
  t.after(close);
  const path=join(root,'.runtime/preview-process.json'),original=await readFile(path,'utf8');
  assert.equal((await controlRequest(config,'ping')).pid,process.pid);
  await writeFile(path,JSON.stringify({...JSON.parse(original),token:'wrong'}));
  await assert.rejects(controlRequest(config,'stop'),/invalid token/);assert.equal(stopped,0);
  await writeFile(path,original);await controlRequest(config,'stop');await stopObserved.promise;assert.equal(stopped,1);
});

test('a process record from another project cannot stop its preview',async t=>{
  const root=await fixture(t),config={root,home:join(root,'home'),port:3203};
  await mkdir(join(root,'.runtime'));await writeFile(join(root,'.runtime/preview-process.json'),JSON.stringify({...config,root:join(root,'other'),endpoint:controlEndpoint(config),token:'unused'}));
  await assert.rejects(controlRequest(config,'stop'),/不匹配/);
  assert.equal(controlEndpoint(config,'win32').startsWith(String.raw`\\.\pipe\treechat-`),true);
});

test('loopback TCP control authenticates requests and refuses a duplicate preview',async t=>{
  const root=await fixture(t),config={root,home:join(root,'home'),port:3204,env:{TREECHAT_CONTROL_TRANSPORT:'tcp'}};let stopped=0;
  const stopObserved=Promise.withResolvers();
  const close=await startControl(config,()=>{stopped++;stopObserved.resolve();});t.after(close);
  const path=join(root,'.runtime/preview-process.json'),original=await readFile(path,'utf8');
  assert.equal(JSON.parse(original).endpoint.host,'127.0.0.1');
  assert.equal((await controlRequest(config,'ping')).pid,process.pid);
  await assert.rejects(startControl(config,()=>{}),/已经运行/);
  await writeFile(path,JSON.stringify({...JSON.parse(original),token:'wrong'}));
  await assert.rejects(controlRequest(config,'stop'),/invalid token/);assert.equal(stopped,0);
  await writeFile(path,JSON.stringify({...JSON.parse(original),endpoint:{host:'192.0.2.1',port:1234}}));
  await assert.rejects(controlRequest(config,'stop'),/不匹配/);assert.equal(stopped,0);
  await writeFile(path,original);await controlRequest(config,'stop');await stopObserved.promise;assert.equal(stopped,1);
});

test('relocation replaces stale directory links without altering the old target',async t=>{
  const root=await fixture(t),old=join(root,'old'),current=join(root,'current'),link=join(root,'linked');
  await mkdir(old);await mkdir(current);await writeFile(join(old,'keep.txt'),'unchanged');await symlink(old,link,process.platform==='win32'?'junction':'dir');
  await linkDirectory(current,link);assert.equal(await realpath(link),await realpath(current));assert.equal(await readFile(join(old,'keep.txt'),'utf8'),'unchanged');
});
