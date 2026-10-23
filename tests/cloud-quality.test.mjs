import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createCloudAnswerer} from '../wb-cloud-quality.mjs';
import {createAnswerDiagnostics,questionHash} from '../wb-answer-diagnostics.mjs';
import {traceAnswerApplication} from '../browser/answer-diagnostics.mjs';
const question={id:1,type:'单选题',question:'PRIVATE-STEM',options:[{letter:'A',text:'PRIVATE-OPTION-ONE'},{letter:'B',text:'PRIVATE-OPTION-TWO'}]};
const cloudFor=create=>({llm:{models:{list:async()=>[{id:'deepseek-v4-flash'}]},chat:{completions:{create}}}});
test('disabled diagnostics do not need a directory or create files',()=>{
  const d=createAnswerDiagnostics();assert.equal(d.enabled,false);assert.doesNotThrow(()=>d.record({}));
});
test('a throwing diagnostics observer cannot turn a valid cloud answer into failure',async()=>{
  let calls=0;const answer=createCloudAnswerer({cloud:cloudFor(async function*(){calls++;yield {choices:[{delta:{content:'{"answers":[{"id":1,"letters":["A"]}]}'}}]};}),diagnostics:{record(){throw Error('diagnostics storage failed');}}});
  assert.deepEqual(await answer([question]),[{id:1,letters:['A']}]);assert.equal(calls,1);
});
test('a stalled cloud stream respects a finite deadline even if return never resolves',async t=>{
  // AbortSignal.timeout is unref'ed; a real socket would keep the process alive, this fake has none.
  const keepAlive=setTimeout(()=>{},1000);t.after(()=>clearTimeout(keepAlive));
  const cloud=cloudFor(()=>({[Symbol.asyncIterator](){return {next:()=>new Promise(()=>{}),return:()=>new Promise(()=>{})};}}));
  const begin=Date.now();await assert.rejects(createCloudAnswerer({cloud,timeoutMs:20})([question]));assert.ok(Date.now()-begin<500);
});
test('upstream failure bodies are not exposed and authentication errors do not retry',async()=>{
  let calls=0;const answer=createCloudAnswerer({cloud:cloudFor(async function*(){calls++;const e=Error('PRIVATE-SDK-ERROR-CONTENT');e.status=401;throw e;})});
  await assert.rejects(answer([question]),e=>e.status===401&&!e.message.includes('PRIVATE-SDK-ERROR'));assert.equal(calls,1);
});
test('upstream 422 bodies are sanitized and retried, distinct from a local refusal',async()=>{
  let calls=0;const answer=createCloudAnswerer({cloud:cloudFor(async function*(){calls++;const e=Error('PRIVATE-UPSTREAM-422');e.status=422;throw e;})});
  await assert.rejects(answer([question]),e=>e.status!==422&&!e.message.includes('PRIVATE-UPSTREAM'));assert.equal(calls,2);
});
test('diagnostics rotate bounded logs and omit question text, model credentials, and extra fields',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-diag-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const d=createAnswerDiagnostics({directory:dir,enabled:true,maxBytes:1});
  for(let i=0;i<3;i++)d.record({question,route:'cloud',model:'sk-'+'S'.repeat(35),requestId:'12345678-1234-1234-1234-123456789abc',letters:['A'],secret:'PRIVATE-CREDENTIAL',usage:{total_tokens:8,secret:'PRIVATE-USAGE'}});
  const files=fs.readdirSync(path.join(dir,'logs'));assert.equal(files.length,2);const raw=files.map(f=>fs.readFileSync(path.join(dir,'logs',f),'utf8')).join('');
  for(const text of ['PRIVATE-STEM','PRIVATE-OPTION','PRIVATE-CREDENTIAL','PRIVATE-USAGE','S'.repeat(35)])assert.ok(!raw.includes(text));
  const event=JSON.parse(raw.split('\n')[0]);assert.equal(event.model,null);assert.equal(event.questionHash,questionHash(question));
});
test('browser mapping diagnostics hash the same semantic question and expose only bounded saved values',async()=>{
  const logs=[];const win={__WB_ANSWER_DIAGNOSTICS__:true,crypto:webcrypto,TextEncoder,console:{log:(...args)=>logs.push(args)}};
  const context=vm.createContext({window:win,Uint8Array});
  const run=vm.runInContext(`(${traceAnswerApplication.toString()})`,context);
  await run('12345678-1234-1234-1234-123456789abc',[{wire:question,returned:['A'],observed:[{letter:'A',selected:true,storedValue:'D'},{letter:'B',selected:false,storedValue:'PRIVATE-STORED-VALUE'}]}]);
  assert.equal(logs.length,1);const event=JSON.parse(logs[0][1]);assert.equal(event.questionHash,questionHash(question));assert.equal(event.options[0].storedValue,'D');assert.equal(event.options[1].storedValue,null);assert.equal(event.options[0].observedSelected,true);
  assert.ok(!JSON.stringify(logs).includes('PRIVATE-'));win.__WB_ANSWER_DIAGNOSTICS__=false;await run(null,[]);assert.equal(logs.length,1);
});
