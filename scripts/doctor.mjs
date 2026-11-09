import {loadConfig,credentialStatus} from './dev-config.mjs';
try{
 const config=await loadConfig(),credential=await credentialStatus(config);
 const status={node:process.versions.node,platform:process.platform,dsh:'0.2.1-alpha.2',root:config.root,home:config.home,port:config.port,deepseekCredential:credential.available?'configured':'missing'};
 console.log(process.argv.includes('--json')?JSON.stringify(status,null,2):`环境就绪：Node ${status.node} / ${status.platform} / DSH ${status.dsh}\n数据目录：${status.home}\n端口：${status.port}\nDeepSeek 凭据：${credential.available?'已配置':'待配置（首次启动后在设置 → 模型中保存）'}`);
 if(process.argv.includes('--require-credentials')&&!credential.available)process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}
