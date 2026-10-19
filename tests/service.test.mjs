import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {Readable} from 'node:stream';
import {get as httpGet} from 'node:http';
import vm from 'node:vm';
const coreURL=new URL('../wb-service-core.mjs',import.meta.url);
const core=existsSync(coreURL)?await import(coreURL):null;
const single={id:1,type:'单选题',question:'synthetic 题',options:[{letter:'A',text:'one'},{letter:'B',text:'two'}]};
const multi={...single,type:'多选题'};
function resolver(options){
  if(core)return core.createAnswerResolver(options);
  const src=readFileSync(new URL('../wb-answer-service.mjs',import.meta.url),'utf8');
  const code=src.slice(src.indexOf('async function jevAnswers'),src.indexOf('function send'));
  const box=vm.createContext({console:{log(){},warn(){}},JEV_KEY:'synthetic',CONFIDENCE_FLOOR:options.confidenceFloor??0.6,jevCall:options.jevCall,FB:{},fetch(){throw new Error('No network');},AbortSignal});
  vm.runInContext(code,box);
  box.llmFallback=options.fallback??(async()=>{throw new Error('No fallback configured');});
  return q=>box.requestAnswers(q);
}
test('official noul probabilities answer multi-select without fallback',async()=>{
  let fallbacks=0;const answer=resolver({jevCall:async()=>({A:{type:'noul',noul:0.99},B:{type:'noul',noul:0.01}}),fallback:async()=>{fallbacks++;return[{id:1,letters:['B']}];}});
  assert.deepEqual(JSON.parse(JSON.stringify(await answer([multi]))),[{id:1,letters:['A']}]);assert.equal(fallbacks,0);
});
test('missing or uncertain noul option must use fallback',async()=>{
  for(const result of [{A:{type:'noul',noul:0.99}},{A:{type:'noul',noul:0.51},B:{type:'noul',noul:0.01}}]){
    let count=0;const answer=resolver({jevCall:async()=>result,fallback:async()=>{count++;return[{id:1,letters:['B']}];}});
    await answer([multi]);assert.equal(count,1);
  }
});
test('incomplete fallback cannot reuse a low-confidence Jev answer',async()=>{
  const answer=resolver({jevCall:async()=>({ans:{type:'choice',choice:'A',confidence:0.2}}),fallback:async()=>[]});
  await assert.rejects(answer([single]),/答案|answer|完整|数量|missing/i);
});
test('a valid fallback replaces a low-confidence choice once',async()=>{
  const answer=resolver({jevCall:async()=>({ans:{type:'choice',choice:'A',confidence:0.2}}),fallback:async()=>[{id:1,letters:['B']}]});
  assert.deepEqual(JSON.parse(JSON.stringify(await answer([single]))),[{id:1,letters:['B']}]);
});
test('string/duplicate/foreign IDs and invalid letters are rejected',async()=>{
  for(const output of [[{id:'1',letters:['A']}],[{id:1,letters:['A']},{id:1,letters:['B']}],[{id:2,letters:['A']}],[{id:1,letters:['C']}],[{id:1,letters:[]}]]){
    const answer=resolver({jevCall:null,fallback:async()=>output});
    await assert.rejects(answer([single]));
  }
});
test('Jev-only rejects low/missing/nonfinite confidence',async()=>{
  for(const confidence of [0.2,undefined,NaN,Infinity]){
    const answer=resolver({jevCall:async()=>({ans:{type:'choice',choice:'A',confidence}})});await assert.rejects(answer([single]));
  }
});
test('UTF8 chunks preserve Chinese text',async()=>{
  const raw=Buffer.from(JSON.stringify({questions:[single]}));const index=raw.lastIndexOf(Buffer.from('题'));
  const req=Readable.from([raw.subarray(0,index+1),raw.subarray(index+1)]);
  let data;if(core)data=await core.readJsonBody(req);else{let text='';for await(const c of req)text+=c.toString('utf8');data=JSON.parse(text);}
  assert.equal(data.questions[0].question,single.question);
});
test('runtime script is generated in memory; template remains a placeholder',()=>{
  if(!core){assert.fail('Old service rewrites the tracked console source');}
  const template="const LOCAL_TOKEN = '__LOCAL_TOKEN__';";const local=core.createLocalService({consoleSource:template,v3Source:'/* v3 */',requestAnswers:async()=>[],token:'a'.repeat(48)});
  assert.equal(template,"const LOCAL_TOKEN = '__LOCAL_TOKEN__';");assert.equal(typeof local.sessionId,'string');local.server.close();
});
test('real loopback health/script and browser auth reject cross-site bootstrap',async t=>{
  if(!core){assert.fail('Old service rejects unauthenticated Node health and has no /script');}
  const local=core.createLocalService({consoleSource:"const LOCAL_TOKEN = '__LOCAL_TOKEN__';",v3Source:'/* v3 */',requestAnswers:async q=>q.map(x=>({id:x.id,letters:['A']})),token:'b'.repeat(48)});
  await new Promise((resolve,reject)=>{local.server.once('error',reject);local.server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise(resolve=>local.server.close(resolve)));
  const base=`http://127.0.0.1:${local.server.address().port}`;
  const health=await fetch(base+'/health');assert.equal(health.status,200);const h=await health.json();assert.equal(h.service,'xuexitong-ai-helper');assert.equal(h.protocol,1);
  const scripts=await fetch(base+'/script');assert.equal(scripts.status,200);assert.match(scripts.headers.get('cache-control'),/no-store/);assert.equal(scripts.headers.get('x-content-type-options'),'nosniff');assert.equal(scripts.headers.get('access-control-allow-origin'),null);
  const s=await scripts.json();assert.equal(s.sessionId,h.sessionId);assert.ok(s.consoleScript.includes('b'.repeat(48)));
  for(const headers of [{Origin:'https://evil.test'},{'Sec-Fetch-Site':'cross-site'},{Origin:'https://mooc1.chaoxing.com'}])assert.equal((await fetch(base+'/script',{headers})).status,403,JSON.stringify(headers));
  const badHost=await new Promise((resolve,reject)=>httpGet(base+'/script',{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode);}).once('error',reject));assert.equal(badHost,403);
  for(const origin of ['null','https://chaoxing.com.evil.test','http://mooc1.chaoxing.com'])assert.equal((await fetch(base+'/health',{headers:{Origin:origin,'X-Xuexitong-Token':'b'.repeat(48)}})).status,403);
  assert.equal((await fetch(base+'/health',{headers:{Origin:'https://mooc1.chaoxing.com'}})).status,403);
  const result=await fetch(base+'/answer',{method:'POST',headers:{Origin:'https://mooc1.chaoxing.com','X-Xuexitong-Token':'b'.repeat(48),'Content-Type':'application/json'},body:JSON.stringify({questions:[single]})});assert.equal(result.status,200);assert.deepEqual(await result.json(),{answers:[{id:1,letters:['A']}]});
});
test('question validation rejects nulls and body limits are measured in bytes',async()=>{
  if(!core){assert.fail('Core input guards not available');}
  for(const value of [null,[null],[{...single,options:[null,null]}]])assert.equal(core.validQuestions(value),false);
  await assert.rejects(core.readJsonBody(Readable.from([Buffer.alloc(100001)])),/大|limit|size/i);
});
test('a stalled answer deadline releases the global busy gate',async t=>{
  assert.ok(core);
  let calls=0;
  const local=core.createLocalService({consoleSource:"const LOCAL_TOKEN = '__LOCAL_TOKEN__';",requestTimeoutMs:30,requestAnswers:async()=>{calls++;if(calls===1)return new Promise(()=>{});return[{id:1,letters:['A']}];},token:'c'.repeat(48)});
  await new Promise(resolve=>local.server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>local.server.close(resolve)));
  const url=`http://127.0.0.1:${local.server.address().port}/answer`;
  const options={method:'POST',headers:{Origin:'https://mooc1.chaoxing.com','X-Xuexitong-Token':local.token,'Content-Type':'application/json'},body:JSON.stringify({questions:[single]})};
  const first=fetch(url,options);while(!calls)await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await fetch(url,options)).status,429);assert.equal((await first).status,502);assert.equal((await fetch(url,options)).status,200);
});
test('service restart rotates tokens without modifying a template or accepting the old token',async t=>{
  const make=()=>core.createLocalService({consoleSource:"const LOCAL_TOKEN = '__LOCAL_TOKEN__';",requestAnswers:async()=>[]});
  const one=make(),two=make();assert.notEqual(one.token,two.token);assert.notEqual(one.sessionId,two.sessionId);
  await new Promise(resolve=>two.server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>two.server.close(resolve)));
  const url=`http://127.0.0.1:${two.server.address().port}/health`;
  assert.equal((await fetch(url,{headers:{Origin:'https://mooc1.chaoxing.com','X-Xuexitong-Token':one.token}})).status,403);
  assert.equal((await fetch(url,{headers:{Origin:'https://mooc1.chaoxing.com','X-Xuexitong-Token':two.token}})).status,200);
});
