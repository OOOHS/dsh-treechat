import {readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {projectRoot} from './dev-config.mjs';
const files=(await readdir(join(projectRoot,'test'))).filter(name=>/\.test\.(?:cjs|mjs)$/.test(name)).sort().map(name=>join(projectRoot,'test',name));
const child=spawn(process.execPath,['--test',...files,...process.argv.slice(2)],{cwd:projectRoot,env:{...process.env,DSH_TEST_ROOT:projectRoot},stdio:'inherit'});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;});
