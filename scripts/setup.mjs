import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {projectRoot} from './dev-config.mjs';
import {join} from 'node:path';
const npm=process.env.npm_execpath;if(!npm)throw new Error('请通过 npm run setup 启动环境准备。');
async function run(args){const child=spawn(process.execPath,[npm,...args],{cwd:projectRoot,stdio:'inherit'});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`环境准备中止（exit ${code}）。`)));});}
await run([existsSync(join(projectRoot,'package-lock.json'))?'ci':'install','--no-audit','--no-fund']);
await run(['run','build']);await run(['test']);await run(['run','doctor']);console.log('准备完成。运行 npm run dev 启动 TreeChat。');
