import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {syntheticCases} from './cloud-benchmark-cases.mjs';
import {prepareCases,selectCases,evaluateCloud} from './cloud-evaluation.mjs';
import {availableCloudModels} from '../wb-cloud-quality.mjs';
export async function main(argv=process.argv.slice(2)){
    const options={};const flags=new Set(['--run','--list-models','--help']);
    const valued=new Set(['--config','--dataset','--models','--limit','--split','--output']);
    for(let i=0;i<argv.length;i++){
        const key=argv[i];if(flags.has(key)){options[key]=true;continue;}
        if(!valued.has(key)||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Unknown or incomplete evaluation argument');
        options[key]=argv[++i];
    }
    if(options['--help']){console.log('node scripts/evaluate-workbuddy.mjs [--dataset JSON] [--split holdout|dev|all] [--limit 60] [--models ID,ID] [--config wb-public-config.json] [--list-models | --run] [--output cloud-evaluation/result.json]\nDefault: offline manifest only. --run makes billable cloud calls; no Jev/config.json access.');return;}
    const dataset=options['--dataset']?JSON.parse(fs.readFileSync(options['--dataset'],'utf8').replace(/^\uFEFF/,'')):syntheticCases;
    const cases=selectCases(prepareCases(dataset),{split:options['--split']||'holdout',limit:Number(options['--limit']||60)});
    if(!cases.length)throw Error('No samples in selected split');
    const models=(options['--models']||'').split(',').filter(Boolean);
    if(!options['--run']&&!options['--list-models']){console.log(JSON.stringify({dryRun:true,split:options['--split']||'holdout',samples:cases.map(c=>c.id),models,maximumInferenceAttempts:cases.length*models.length*2*2}));return;}
    if(!options['--config'])throw Error('--config must explicitly point to a WorkBuddy public config file');
    const cfg=JSON.parse(fs.readFileSync(options['--config'],'utf8').replace(/^\uFEFF/,''));
    if(typeof cfg.endpoint!=='string'||!cfg.endpoint.startsWith('https://')||typeof cfg.publishableKey!=='string'||!cfg.publishableKey.trim())throw Error('Invalid WorkBuddy public config');
    const {createWorkBuddyCloud}=await import('@tencent-ai/workbuddy-cloud-sdk');
    const cloud=createWorkBuddyCloud({endpoint:cfg.endpoint,publishableKey:cfg.publishableKey});
    if(options['--list-models']){console.log(JSON.stringify(availableCloudModels(await cloud.llm.models.list(AbortSignal.timeout(30_000))).map(m=>m.id)));return;}
    if(!models.length)throw Error('--models must explicitly list candidates');
    const result=await evaluateCloud({cloud,cases,models,onProgress:p=>{if(p.completed%10===0)console.log(JSON.stringify(p));}});
    result.selection={split:options['--split']||'holdout',seed:'cloud-quality-v1',limit:Number(options['--limit']||60)};
    const output=path.resolve(options['--output']||'cloud-evaluation/result.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({completed:result.completed,summary:result.summary}));
    if(!result.completed)process.exitCode=1;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
    main().catch(()=>{console.error('Cloud evaluation failed. Check explicit dataset/config/model selection, connection, or quota; credentials and upstream error bodies are omitted.');process.exitCode=1;});
}
