// Jev first, WorkBuddy Cloud fallback. Two service modes share one local protocol.
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {fetch as undiciFetch,ProxyAgent} from 'undici';
import {createWorkBuddyCloud} from '@tencent-ai/workbuddy-cloud-sdk';
import {PORT,SYSTEM_PROMPT,loadConfig,createAnswerResolver,retryAnswers,createLocalService,abortable} from './wb-service-core.mjs';
const HERE = fileURLToPath(new URL('.',import.meta.url));

export async function startService({directory = HERE, port = PORT, createCloud = createWorkBuddyCloud, jevFetch = undiciFetch, env = process.env} = {}) {
    const publicConfig = loadConfig(directory + 'wb-public-config.json');
    if (typeof publicConfig.endpoint !== 'string' || !publicConfig.endpoint.startsWith('https://') ||
        typeof publicConfig.publishableKey !== 'string' || !publicConfig.publishableKey.trim()) throw new Error('WorkBuddy endpoint 和 publishableKey 需要有效配置');
    const cloud = createCloud({endpoint:publicConfig.endpoint,publishableKey:publicConfig.publishableKey});
    const config = loadConfig(directory + 'config.json',{required:false});
    const jev = config.jev || {};
    const key = jev.apiKey || env.JEV_API_KEY || '';
    const proxy = jev.proxy ?? env.JEV_PROXY ?? 'http://127.0.0.1:7897';
    const dispatcher = key && proxy ? new ProxyAgent(proxy) : undefined;
    const jevCall = key ? async (state,questions,{signal} = {}) => {
        const res = await jevFetch('https://api.typesafe.ai/v1/systemone', {
            method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
            body:JSON.stringify({model:jev.model || 'jev-latest',state,questions}),dispatcher,
            signal:AbortSignal.any([AbortSignal.timeout(30_000),...(signal ? [signal] : [])]),
        });
        if (!res.ok) { await res.body?.cancel().catch(() => {}); throw new Error(`Jev HTTP ${res.status}`); }
        return (await res.json()).answers;
    } : null;
    let selected;
    async function pickModel(signal) {
        if (env.WB_MODEL) return env.WB_MODEL;
        if (!selected) {
            selected = abortable(cloud.llm.models.list(signal),signal).then(models => {
                const usable = models.filter(m => m.disabled !== true && m.enabled !== false);
                if (!usable.length) throw new Error('云服务模型列表为空');
                const prefer = ['deepseek-v4-flash','glm-5.3-flash','deepseek-v4.1-flash','auto','default'];
                return prefer.find(id => usable.some(m => m.id === id)) || (usable.find(m => /flash|lite|mini/i.test(m.id)) || usable[0]).id;
            }).catch(error => {selected = null;throw error;});
        }
        return selected;
    }
    const fallback = (questions,{signal} = {}) => retryAnswers(async () => {
        const deadline = AbortSignal.any([AbortSignal.timeout(120_000),...(signal ? [signal] : [])]);
        const model = await pickModel(deadline);
        const iterator = cloud.llm.chat.completions.create({model,messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:JSON.stringify(questions)}],stream:true,signal:deadline})[Symbol.asyncIterator]();
        let content = '';
        try {
            while (true) {
                const {done,value} = await abortable(iterator.next(),deadline);
                if (done) break;
                const delta = value.choices?.[0]?.delta?.content;
                if (delta) content += delta;
                if (Buffer.byteLength(content) > 1_000_000) throw new Error('云模型返回内容过大');
            }
        } finally {
            // Do not await a stalled generator's return after its network request was aborted.
            Promise.resolve(iterator.return?.()).catch(() => {});
        }
        return content;
    },questions,{signal});
    const requestAnswers = createAnswerResolver({jevCall,fallback,confidenceFloor:jev.confidenceFloor ?? 0.6,noulProbabilityFloor:jev.noulProbabilityFloor ?? 0.6});
    const local = createLocalService({consoleSource:readFileSync(directory + 'deepseek-console/xuexitong-console.js','utf8'),
        v3Source:readFileSync(directory + 'xuexitong_v3.user.js','utf8'),requestAnswers,mode:'workbuddy'});
    await new Promise((resolve,reject) => {local.server.once('error',reject);local.server.listen(port,'127.0.0.1',resolve);});
    local.server.on('close',() => {dispatcher?.close().catch(() => {});});
    console.log(`本地答题服务已启动：http://127.0.0.1:${local.server.address().port}；模式 workbuddy；${key ? 'Jev 优先，云 LLM 兜底' : '仅云 LLM'}`);
    return local;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    try { await startService(); }
    catch (error) { console.error(`服务启动失败：${error.message}`); process.exitCode = 1; }
}
