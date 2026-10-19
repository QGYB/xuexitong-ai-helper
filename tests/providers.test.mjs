import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startService as startOpenAI} from '../wb-answer-service.mjs';
import {startService as startWorkBuddy} from '../wb-answer-service.workbuddy.mjs';
import {getScripts,probeService} from '../wb-runner-runtime.mjs';
const single={id:1,type:'单选题',question:'合成题',options:[{letter:'A',text:'one'},{letter:'B',text:'two'}]};
const template="const LOCAL_TOKEN = '__LOCAL_TOKEN__';";
function fixture(t,config={},publicConfig){
  const dir=mkdtempSync(join(tmpdir(),'xuexitong-provider-'));mkdirSync(join(dir,'deepseek-console'));
  writeFileSync(join(dir,'deepseek-console/xuexitong-console.js'),template);writeFileSync(join(dir,'xuexitong_v3.user.js'),'/* synthetic v3 */');
  writeFileSync(join(dir,'config.json'),JSON.stringify(config));
  if(publicConfig)writeFileSync(join(dir,'wb-public-config.json'),JSON.stringify(publicConfig));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir+'/';
}
async function running(t,start,options){
  const local=await start({env:{},...options,port:0});t.after(()=>new Promise(resolve=>local.server.close(resolve)));
  const base=`http://127.0.0.1:${local.server.address().port}`;
  const answer=async questions=>{
    const res=await fetch(base+'/answer',{method:'POST',headers:{Origin:'https://mooc1.chaoxing.com','X-Xuexitong-Token':local.token,'Content-Type':'application/json'},body:JSON.stringify({questions})});
    return {status:res.status,body:await res.json()};
  };
  return {local,base,answer};
}
test('OpenAI provider retries malformed/incomplete JSON and a 5xx; no template writes',async t=>{
  for(const first of ['malformed','incomplete','http502','http400'])await t.test(first,async t=>{
    const dir=fixture(t,{fallback:{apiKey:'synthetic-fixture',model:'synthetic',baseUrl:'https://example.invalid'}});const calls=[];
    const {answer}=await running(t,startOpenAI,{directory:dir,fetchImpl:async(_url,init)=>{
      calls.push(JSON.parse(init.body));
      if(calls.length===1){if(first.startsWith('http'))return{ok:false,status:Number(first.slice(4))};return{ok:true,json:async()=>({choices:[{message:{content:first==='malformed'?'bad':'{"answers":[]}'}}]})};}
      return {ok:true,json:async()=>({choices:[{message:{content:'{"answers":[{"id":1,"letters":["A"]}]}'}}]})};
    }});
    assert.deepEqual(await answer([single]),{status:200,body:{answers:[{id:1,letters:['A']}]}});assert.equal(calls.length,2);
    assert.deepEqual(calls[0].response_format,{type:'json_object'});assert.equal(calls[1].response_format,undefined);assert.equal(readFileSync(dir+'deepseek-console/xuexitong-console.js','utf8'),template);
  });
});
test('OpenAI authentication failures do not retry or leak upstream response bodies',async t=>{
  let count=0;const dir=fixture(t,{fallback:{apiKey:'synthetic-fixture',model:'synthetic'}});
  const {answer}=await running(t,startOpenAI,{directory:dir,fetchImpl:async()=>{count++;return{ok:false,status:401,text:async()=>'DO-NOT-LEAK'};}});
  const result=await answer([single]);assert.equal(count,1);assert.match(result.body.error,/401/);assert.ok(!JSON.stringify(result).includes('DO-NOT-LEAK'));
});
test('Jev-only provider uses configured model, official Noul, and direct connection',async t=>{
  const calls=[];const dir=fixture(t,{jev:{apiKey:'synthetic-fixture',proxy:'',model:'synthetic-model'}});
  const {answer}=await running(t,startOpenAI,{directory:dir,jevFetch:async(_url,init)=>{calls.push(init);return{ok:true,json:async()=>({answers:{A:{type:'noul',noul:0.99},B:{type:'noul',noul:0.01}}})};}});
  assert.equal((await answer([{...single,type:'多选题'}])).status,200);assert.equal(calls[0].dispatcher,undefined);assert.equal(JSON.parse(calls[0].body).model,'synthetic-model');
});
test('WorkBuddy initializes with actual public keys, retries stream JSON and selects allowed model',async t=>{
  const publicConfig={endpoint:'https://synthetic.example.invalid',publishableKey:'synthetic-public',resourceId:'unused',oauthRelayBaseUrl:'unused'};
  const dir=fixture(t,{},publicConfig);let received,models=0,streams=0;
  const {answer}=await running(t,startWorkBuddy,{directory:dir,createCloud:options=>{received=options;return{llm:{models:{list:async()=>{models++;return[{id:'disabled',disabled:true},{id:'deepseek-v4-flash',enabled:true}];}},chat:{completions:{create:async function*(args){streams++;assert.equal(args.model,'deepseek-v4-flash');assert.ok(args.signal instanceof AbortSignal);yield{choices:[{delta:{content:streams===1?'bad':'{"answers":[{"id":1,"letters":["B"]}]}'}}]};}}}}};}});
  assert.deepEqual(await answer([single]),{status:200,body:{answers:[{id:1,letters:['B']}]}});assert.deepEqual(received,{endpoint:publicConfig.endpoint,publishableKey:publicConfig.publishableKey});assert.equal(models,1);assert.equal(streams,2);assert.equal(readFileSync(dir+'deepseek-console/xuexitong-console.js','utf8'),template);
});
test('WorkBuddy respects configured Jev model without listing cloud models unnecessarily',async t=>{
  const dir=fixture(t,{jev:{apiKey:'synthetic-fixture',proxy:'',model:'synthetic-model'}},{endpoint:'https://synthetic.example.invalid',publishableKey:'synthetic-public'});let listed=0;
  const {answer}=await running(t,startWorkBuddy,{directory:dir,createCloud:()=>({llm:{models:{list:async()=>{listed++;throw new Error('must not call');}}}}),jevFetch:async(_url,init)=>{assert.equal(JSON.parse(init.body).model,'synthetic-model');return{ok:true,json:async()=>({answers:{ans:{type:'choice',choice:'A',confidence:0.95}}})};}});
  assert.equal((await answer([single])).status,200);assert.equal(listed,0);
});
test('real runner protocol obtains current session from both service modes',async t=>{
  for(const [mode,start,config,publicConfig,extras] of [
    ['openai',startOpenAI,{jev:{apiKey:'synthetic-fixture',proxy:''}},undefined,{}],
    ['workbuddy',startWorkBuddy,{}, {endpoint:'https://synthetic.example.invalid',publishableKey:'synthetic-public'},{createCloud:()=>({llm:{}})}],
  ])await t.test(mode,async t=>{
    const dir=fixture(t,config,publicConfig);const {base,local}=await running(t,start,{directory:dir,...extras});
    const fetchImpl=(url,init)=>fetch(url.replace('http://127.0.0.1:37841',base),init);
    assert.equal((await probeService({mode,fetchImpl})).sessionId,local.sessionId);
    const scripts=await getScripts({mode,fetchImpl});assert.equal(scripts.sessionId,local.sessionId);assert.ok(scripts.consoleScript.includes(local.token));
  });
});
test('both variants accept only the explicitly supplied environment in isolated tests',async t=>{
  for(const [start,publicConfig,extras] of [
    [startOpenAI,undefined,{}],
    [startWorkBuddy,{endpoint:'https://synthetic.example.invalid',publishableKey:'synthetic-public'},{createCloud:()=>({llm:{}})}],
  ])await t.test(start===startOpenAI?'openai':'workbuddy',async t=>{
    const dir=fixture(t,{},publicConfig);let calls=0;
    const {answer}=await running(t,start,{directory:dir,...extras,env:{JEV_API_KEY:'synthetic-env-fixture',JEV_PROXY:''},jevFetch:async()=>{calls++;return{ok:true,json:async()=>({answers:{ans:{type:'choice',choice:'A',confidence:0.9}}})};}});
    assert.equal((await answer([single])).status,200);assert.equal(calls,1);
  });
});
