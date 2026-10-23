import {createHash,randomUUID} from 'node:crypto';
import {appendFileSync,existsSync,mkdirSync,statSync,renameSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';

export const questionHash=q=>createHash('sha256').update(JSON.stringify([q.type,q.question,q.options.map(o=>[o.letter,o.text])])).digest('hex');
const secret=/apikey_|wbpk_|sk-[a-z0-9_-]{16,}/i;
export const safeModelId=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9_.:/-]{0,119}$/i.test(value)&&!secret.test(value)?value:null;
export const requestIdentity=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value)?value:randomUUID();
export function safeUsage(value={}) {
    return Object.fromEntries(['prompt_tokens','completion_tokens','input_tokens','output_tokens','total_tokens'].filter(k=>Number.isSafeInteger(value?.[k])&&value[k]>=0).map(k=>[k,value[k]]));
}
export function createAnswerDiagnostics({directory,enabled=false,maxBytes=5_000_000}={}) {
    if(!enabled)return {enabled:false,record(){}};
    const file=join(directory,'logs','answer-diagnostics.jsonl');
    return {enabled,record({question,requestId,route,model,responseModel,attempt=1,durationMs=0,letters=[],status='success',usage={}}){
        if(!enabled)return;
        try{
            const event={time:new Date().toISOString(),requestId:requestIdentity(requestId),questionId:question.id,questionHash:questionHash(question),type:question.type,
                optionHashes:question.options.map(o=>({letter:o.letter,hash:createHash('sha256').update(o.text).digest('hex')})),
                route:route==='jev'?'jev':'cloud',model:safeModelId(model),responseModel:safeModelId(responseModel),attempt:Number.isSafeInteger(attempt)?attempt:1,
                durationMs:Number.isFinite(durationMs)?Math.max(0,Math.round(durationMs)):0,letters:Array.isArray(letters)?letters.filter(l=>/^[A-H]$/.test(l)):[],
                status:['success','input-invalid','model-unavailable','output-invalid','upstream-failed','cancelled'].includes(status)?status:'upstream-failed',usage:safeUsage(usage)};
            mkdirSync(join(directory,'logs'),{recursive:true});
            if(existsSync(file)&&statSync(file).size>=maxBytes){if(existsSync(file+'.1'))unlinkSync(file+'.1');renameSync(file,file+'.1');}
            appendFileSync(file,JSON.stringify(event)+'\n',{mode:0o600});
        }catch{ /* Optional diagnostics must never change an answer or expose an error body. */ }
    }};
}
