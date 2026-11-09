import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadConfig,linkDirectory,credentialStatus,readOptional} from './dev-config.mjs';
import {startControl} from './preview-control.mjs';
const config=await loadConfig(),{root,profile,runtime,port,env}=config;
await mkdir(join(profile,'node_modules'),{recursive:true});
await linkDirectory(dirname(runtime),join(profile,'node_modules/@deepseek-ai'));
await linkDirectory(root,join(profile,'node_modules/dsh-treechat'));
const packagePath=join(profile,'package.json'),old=JSON.parse(await readOptional(packagePath)||'{}');
const bundles=[...new Set([...(old.dsh?.profile?.bundles||[]),'@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','dsh-treechat'])];
await writeFile(packagePath,JSON.stringify({...old,name:old.name||'treechat-dev',private:true,dependencies:{...old.dependencies,'dsh-treechat':pathToFileURL(root).href},dsh:{...old.dsh,profile:{...old.dsh?.profile,bundles}}},null,2));
try{await writeFile(join(profile,'cordis.patch.yml'),'- id: hmr\n  disabled: true\n- id: client-hmr\n  disabled: true\n',{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
const overlays=env.TREECHAT_DEV_PATCH?['--patch',resolve(root,env.TREECHAT_DEV_PATCH)]:[];
if(env.TREECHAT_MOCK==='1'){
 const patch=join(root,'.runtime/mock.patch.yml');await writeFile(patch,`- insert:\n  - id: treechat-test-model\n    name: ${JSON.stringify(join(root,'test-support/mock-model.mjs'))}\n`);
 overlays.push('--patch',patch);env.TREECHAT_TEST_LOG=join(root,'.runtime/model-requests.jsonl');console.log('TreeChat: TEST MODEL enabled. This is not a live model response.');
}else if(!(await credentialStatus(config)).available)console.log('DeepSeek 尚未配置：服务启动后，请在“设置 → 模型”中连接模型。');
let child,stopping=false;const stop=()=>{if(stopping)return;stopping=true;if(child)child.kill('SIGTERM');};
const closeControl=await startControl(config,stop);
try{
 child=spawn(process.execPath,[join(runtime,'lib/bin.js'),'--profile','web',...overlays,'--port',String(port),'--no-open',...process.argv.slice(2)],{cwd:root,env,stdio:'inherit'});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
 await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code??(stopping?0:1);resolve();});});
}finally{await closeControl();}
