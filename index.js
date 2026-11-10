import {createGraphServer} from './server.mjs';
import {dshHomePath} from '@deepseek-ai/dsh-home-paths';
export const name='treechat';
export const inject=['connection'];
export function apply(ctx){
 const server=createGraphServer(dshHomePath('treechat','graph.json'));
 ctx.connection.fetch.register({path:'/api/treechat/graph',methods:['GET','POST'],requestBody:'buffered',fetch:request=>server.fetch(request)});
}
