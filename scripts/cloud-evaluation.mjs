// Offline scoring and bounded, cloud-only paired evaluation. Never loads Jev or local runtime config.
import {createHash} from 'node:crypto';
import {validQuestions,SYSTEM_PROMPT} from '../wb-service-core.mjs';
import {createCloudAnswerer,availableCloudModels,CLOUD_SYSTEM_PROMPT,CLOUD_PROMPT_VERSION} from '../wb-cloud-quality.mjs';
import {questionHash,safeModelId,safeUsage} from '../wb-answer-diagnostics.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function prepareCases(source){
    const cases=Array.isArray(source)?source:source?.cases;
    if(!Array.isArray(cases)||!cases.length)throw Error('Dataset must contain cases');
    const seen=new Set();
    return cases.map(c=>{
        if(typeof c?.id!=='string'||!/^[a-z0-9_.:-]{1,100}$/i.test(c.id)||seen.has(c.id))throw Error('Invalid or duplicate sample ID');
        seen.add(c.id);
        const ids=c.options?.map(o=>o.id??o.letter);
        const wire={id:1,type:c.type,question:c.question,options:c.options?.map((o,i)=>({letter:String.fromCharCode(65+i),text:o.text}))};
        if(!validQuestions([wire])||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'))throw Error('Invalid sample options or question');
        const gold=c.gold?.map(id=>String.fromCharCode(65+ids.indexOf(id)));
        if(!Array.isArray(gold)||!gold.length||new Set(gold).size!==gold.length||c.gold.some(id=>!ids.includes(id))||(c.type!=='多选题'&&gold.length!==1))throw Error('Invalid gold labels');
        return {id:c.id,wire,gold:gold.sort()};
    });
}
// Stable split is independent of predictions and of input file order; options retain original order.
export function selectCases(cases,{split='holdout',limit=60,seed='cloud-quality-v1'}={}){
    if(!['all','dev','holdout'].includes(split)||!Number.isSafeInteger(limit)||limit<1)throw Error('Invalid split or limit');
    return [...cases].sort((a,b)=>hash([seed,a.id]).localeCompare(hash([seed,b.id])))
        .filter(c=>split==='all'||(parseInt(hash([seed,c.id]).slice(0,2),16)%2===0?'dev':'holdout')===split).slice(0,limit);
}
function metrics(rows){
    const answered=rows.filter(r=>r.status==='answered'),correct=answered.filter(r=>r.correct).length;
    const latencies=rows.filter(r=>r.status!=='not-run').map(r=>r.durationMs).sort((a,b)=>a-b);
    const multi=answered.filter(r=>r.type==='多选题');
    return {total:rows.length,attempted:rows.filter(r=>r.status!=='not-run').length,answered:answered.length,correct,
        abstained:rows.filter(r=>r.status==='abstained').length,failed:rows.filter(r=>r.status==='failed').length,notRun:rows.filter(r=>r.status==='not-run').length,
        accuracy:rows.length?correct/rows.length:0,coverage:rows.length?answered.length/rows.length:0,answeredAccuracy:answered.length?correct/answered.length:null,
        p50Ms:latencies.length?latencies[Math.ceil(latencies.length*.5)-1]:null,p95Ms:latencies.length?latencies[Math.ceil(latencies.length*.95)-1]:null,
        inferenceAttempts:rows.reduce((sum,r)=>sum+r.attempts,0),usage:rows.reduce((sum,r)=>{for(const [k,v] of Object.entries(r.usage))sum[k]=(sum[k]||0)+v;return sum;},{}),
        multi:{answered:multi.length,exact:multi.filter(r=>r.correct).length,withWrongSelection:multi.filter(r=>r.actual.some(l=>!r.expected.includes(l))).length,withMissingSelection:multi.filter(r=>r.expected.some(l=>!r.actual.includes(l))).length}};
}
export function summarize(rows){
    return [...new Set(rows.map(r=>JSON.stringify([r.model,r.condition])))].map(key=>{
        const [model,condition]=JSON.parse(key),group=rows.filter(r=>r.model===model&&r.condition===condition);
        return {model,condition,...metrics(group),byType:Object.fromEntries([...new Set(group.map(r=>r.type))].map(type=>[type,metrics(group.filter(r=>r.type===type))]))};
    });
}
export async function evaluateCloud({cloud,cases,models,concurrency=4,timeoutMs=30_000,onProgress}={}){
    if(!cases?.length||!Array.isArray(models)||!models.length||new Set(models).size!==models.length||models.some(m=>!safeModelId(m))||!Number.isInteger(concurrency)||concurrency<1||concurrency>8)throw Error('Invalid evaluation settings');
    const listed=availableCloudModels(await cloud.llm.models.list(AbortSignal.timeout(timeoutMs)));
    if(models.some(id=>!listed.some(m=>m.id===id)))throw Error('An explicitly requested model is unavailable');
    // Freeze catalog for the run. The SDK instance and its chat methods keep their original binding.
    const fixedCloud={llm:{models:{list:async()=>listed},chat:cloud.llm.chat}};
    const conditions=[{id:'baseline',prompt:SYSTEM_PROMPT},{id:'quality',prompt:CLOUD_SYSTEM_PROMPT}];
    const jobs=cases.flatMap(c=>models.flatMap(model=>conditions.map(condition=>({c,model,condition}))));
    const rows=new Array(jobs.length);let cursor=0,completed=0,stopReason;
    async function worker(){
        while(cursor<jobs.length){
            const i=cursor++,{c,model,condition}=jobs[i];
            const row={id:c.id,questionHash:questionHash(c.wire),type:c.wire.type,model,condition:condition.id,expected:c.gold,actual:[],correct:false,status:'not-run',durationMs:0,attempts:0,responseModel:null,usage:{}};
            rows[i]=row;if(stopReason)continue;
            const begin=performance.now();
            const events=[];
            try{
                const answers=await createCloudAnswerer({cloud:fixedCloud,model,prompt:condition.prompt,timeoutMs,diagnostics:{record:e=>events.push(e)}})([c.wire]);
                row.actual=answers[0].letters.slice().sort();row.correct=JSON.stringify(row.actual)===JSON.stringify(c.gold);row.status='answered';
            }catch(error){
                row.status=error.status===422?'abstained':'failed';
                row.error=error.status===422?'no-reliable-answer':typeof error.code==='string'&&/^quota_[a-z0-9_]{1,60}$/i.test(error.code)?error.code:'request-failed';
                if(row.error.startsWith('quota_'))stopReason='quota';
            }
            row.durationMs=Math.round(performance.now()-begin);
            row.attempts=Math.max(0,...events.map(e=>e.attempt));
            row.responseModel=safeModelId(events.at(-1)?.responseModel);
            // Each event is one completed attempt; token totals include unsuccessful attempts when supplied.
            row.usage=events.reduce((sum,e)=>{for(const [k,v] of Object.entries(safeUsage(e.usage)))sum[k]=(sum[k]||0)+v;return sum;},{});
            completed++;onProgress?.({completed,total:jobs.length,stopReason});
        }
    }
    await Promise.all(Array.from({length:concurrency},worker));
    return {protocol:'workbuddy-cloud-evaluation-v1',promptVersion:CLOUD_PROMPT_VERSION,baselinePromptHash:hash(SYSTEM_PROMPT),qualityPromptHash:hash(CLOUD_SYSTEM_PROMPT),
        datasetHash:hash(cases.map(c=>[c.id,c.wire,c.gold])),samples:cases.map(c=>({id:c.id,questionHash:questionHash(c.wire)})),
        completed:!stopReason,stopReason:stopReason||null,models,summary:summarize(rows),results:rows};
}
