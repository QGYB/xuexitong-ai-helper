import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {prepareCases,selectCases,evaluateCloud,summarize} from '../scripts/cloud-evaluation.mjs';
import {syntheticCases} from '../scripts/cloud-benchmark-cases.mjs';
const cases=prepareCases(syntheticCases);
test('evaluation splits are deterministic, disjoint, and independent of input order',()=>{
    const dev=selectCases(cases,{split:'dev'}),hold=selectCases(cases,{split:'holdout'});
    assert.deepEqual(selectCases(cases.toReversed()),hold);assert.equal(dev.length+hold.length,60);assert.ok(dev.every(c=>!hold.some(h=>h.id===c.id)));
});
test('invalid datasets are rejected before any inference',()=>{
    for(const sample of [{...syntheticCases[0],gold:['unknown']},{...syntheticCases[0],options:[syntheticCases[0].options[0]]}])assert.throws(()=>prepareCases([sample]));
    assert.throws(()=>prepareCases([syntheticCases[0],syntheticCases[0]]));
});
test('gold and metadata are never sent to cloud inference; paired metrics include abstentions',async()=>{
    const messages=[];let n=0;
    const cloud={llm:{models:{list:async()=>[{id:'fixture'}]},chat:{completions:{create:async function*(args){messages.push(args.messages);n++;yield {model:'fixture-version',choices:[{delta:{content:JSON.stringify({answers:n===1?[{id:1,letters:cases[0].gold}]:[]})}}]};}}}}};
    const result=await evaluateCloud({cloud,cases:cases.slice(0,1),models:['fixture'],concurrency:1});
    assert.equal(messages.length,2);for(const m of messages){const data=JSON.parse(m[1].content);assert.deepEqual(data,[cases[0].wire]);assert.equal(data[0].gold,undefined);assert.equal(data[0].suite,undefined);}
    assert.equal(result.summary[0].accuracy,1);assert.equal(result.summary[1].abstained,1);assert.equal(result.summary[1].accuracy,0);assert.equal(result.summary[1].coverage,0);assert.equal(result.summary[1].answeredAccuracy,null);
    assert.ok(!JSON.stringify(result).includes(cases[0].wire.question));
});
test('unavailable pinned candidate never falls back or invokes chat',async()=>{
    let calls=0;const cloud={llm:{models:{list:async()=>[{id:'different'}]},chat:{completions:{create:()=>{calls++;}}}}};
    await assert.rejects(evaluateCloud({cloud,cases:cases.slice(0,1),models:['fixture']}));assert.equal(calls,0);
});
test('quota stops further jobs and leaves their denominator visible',async()=>{
    let calls=0;const cloud={llm:{models:{list:async()=>[{id:'fixture'}]},chat:{completions:{create:async function*(){calls++;const e=Error('SECRET-UPSTREAM-BODY');e.code='quota_exhausted';throw e;}}}}};
    const result=await evaluateCloud({cloud,cases:cases.slice(0,2),models:['fixture'],concurrency:1});
    assert.equal(calls,1);assert.equal(result.completed,false);assert.equal(result.summary.reduce((s,r)=>s+r.notRun,0),3);assert.ok(!JSON.stringify(result).includes('SECRET-UPSTREAM'));
});
test('metrics retain failed/abstained/not-run samples and count multi wrong and missing selections',()=>{
    const base={model:'m',condition:'quality',type:'多选题',expected:['A','B'],actual:[],durationMs:10,attempts:1,usage:{}};
    const [m]=summarize([{...base,status:'answered',correct:false,actual:['A','C']},{...base,status:'failed'},{...base,status:'abstained'},{...base,status:'not-run'}]);
    assert.equal(m.total,4);assert.equal(m.accuracy,0);assert.equal(m.coverage,.25);assert.equal(m.multi.withWrongSelection,1);assert.equal(m.multi.withMissingSelection,1);
});
test('CLI defaults to offline manifest even with a nonexistent explicit config path',()=>{
    const r=spawnSync(process.execPath,['scripts/evaluate-workbuddy.mjs','--config','missing-file-never-read.json','--models','fixture'],{encoding:'utf8',windowsHide:true});
    assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).dryRun,true);
});
