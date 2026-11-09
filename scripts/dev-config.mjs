import {readFile,stat,realpath,lstat,unlink,symlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
export const DSH_VERSION='0.2.1-alpha.2';
export const projectRoot=fileURLToPath(new URL('../',import.meta.url));
export async function readOptional(path){try{return await readFile(path,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function loadConfig({root=projectRoot,env=process.env}={}){
 root=resolve(root);const local=await readOptional(join(root,'.env'));let fromFile={};
 try{if(local!==null)fromFile=parseEnv(local);}catch{throw new Error('项目 .env 格式无效。');}
 if(env.TREECHAT_ENV_FILE){try{Object.assign(fromFile,parseEnv(await readFile(resolve(root,env.TREECHAT_ENV_FILE),'utf8')));}catch{throw new Error('TREECHAT_ENV_FILE 无法读取或格式无效。');}}
 const launchEnv={...fromFile,...env};
 const home=resolve(root,launchEnv.TREECHAT_HOME||(existsSync(join(root,'.runtime/native-home'))?'.runtime/native-home':'.runtime/home'));
 const port=Number(launchEnv.PORT||3082);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT 必须为 1–65535 的整数。');
 const [major,minor]=process.versions.node.split('.').map(Number);
 if(major<22||(major===22&&minor<12))throw new Error('需要 Node.js 22.12 或更新版本，推荐 Node.js 24 LTS。');
 let runtime;
 if(launchEnv.DSH_RUNTIME)runtime=resolve(root,launchEnv.DSH_RUNTIME);
 else{try{runtime=dirname(createRequire(join(root,'package.json')).resolve('@deepseek-ai/dsh/package.json'));}catch{const old=join(home,'profiles/web/node_modules/@deepseek-ai/dsh');if(existsSync(old))runtime=old;else throw new Error('尚未安装 DSH 开发依赖，请运行 npm run setup。');}}
 try{runtime=await realpath(runtime);}catch{throw new Error('找不到 DSH_RUNTIME 指向的目录。');}
 const manifest=JSON.parse(await readFile(join(runtime,'package.json'),'utf8'));
 if(manifest.name!=='@deepseek-ai/dsh'||manifest.version!==DSH_VERSION)throw new Error(`需要 DSH ${DSH_VERSION}，当前为 ${manifest.version}。`);
 return{root,home,port,runtime,profile:join(home,'profiles/web'),env:{...launchEnv,DSH_HOME:home,DSH_AGENTS_HOME:join(root,'.runtime/agents'),DSH_TELEMETRY_DISABLED:'1'}};
}
export async function credentialStatus(config){
 if(config.env.DEEPSEEK_API_KEY?.trim())return{available:true,source:'environment'};
 for(const path of [join(config.root,'.env'),join(config.home,'.env')]){const text=await readOptional(path);if(text&&parseEnv(text).DEEPSEEK_API_KEY?.trim())return{available:true,source:'env-file'};}
 const path=join(config.home,'.credentials.yaml'),text=await readOptional(path);
 if(text){
  if(process.platform!=='win32'&&((await stat(path)).mode&0o077))throw new Error('DSH 凭据文件需要仅当前用户可读写（chmod 600）。');
  let doc;try{doc=createRequire(join(config.runtime,'package.json'))('yaml').parse(text);}catch{throw new Error('DSH 凭据文件无法解析。');}
  if(typeof doc?.refs?.DEEPSEEK_API_KEY==='string'&&doc.refs.DEEPSEEK_API_KEY.trim())return{available:true,source:'credential-store'};
 }
 return{available:false,source:'none'};
}
export async function linkDirectory(target,path){
 const expected=await realpath(target);
 try{if(await realpath(path)===expected)return;if(!(await lstat(path)).isSymbolicLink())throw new Error(`开发 profile 中已有同名目录：${path}`);await unlink(path);}
 catch(e){if(e.code!=='ENOENT')throw e;try{if((await lstat(path)).isSymbolicLink())await unlink(path);}catch(e){if(e.code!=='ENOENT')throw e;}}
 await symlink(expected,path,process.platform==='win32'?'junction':'dir');
}
