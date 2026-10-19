// Jev first, OpenAI-compatible fallback. No file writes or requests on import.
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {fetch as undiciFetch,ProxyAgent} from 'undici';
import {PORT,SYSTEM_PROMPT,loadConfig,createAnswerResolver,retryAnswers,createLocalService} from './wb-service-core.mjs';
const HERE = fileURLToPath(new URL('.',import.meta.url));

export async function startService({directory = HERE, port = PORT, fetchImpl = fetch, jevFetch = undiciFetch, env = process.env} = {}) {
    const config = loadConfig(directory + 'config.json');
    const jev = config.jev || {};
    const key = jev.apiKey || env.JEV_API_KEY || '';
    const proxy = jev.proxy ?? env.JEV_PROXY ?? 'http://127.0.0.1:7897';
    const dispatcher = key && proxy ? new ProxyAgent(proxy) : undefined;
    const fb = config.fallback || {};
    if (Boolean(fb.apiKey) !== Boolean(fb.model)) throw new Error('fallback.apiKey 与 fallback.model 需要同时填写或同时留空');
    if (!key && !fb.apiKey) throw new Error('至少配置 Jev 或兜底 API');
    const jevCall = key ? async (state,questions,{signal} = {}) => {
        const res = await jevFetch('https://api.typesafe.ai/v1/systemone', {
            method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
            body:JSON.stringify({model:jev.model || 'jev-latest',state,questions}),dispatcher,
            signal:AbortSignal.any([AbortSignal.timeout(30_000),...(signal ? [signal] : [])]),
        });
        if (!res.ok) { await res.body?.cancel().catch(() => {}); throw new Error(`Jev HTTP ${res.status}`); }
        return (await res.json()).answers;
    } : null;
    const fallback = fb.apiKey ? (questions,{signal} = {}) => retryAnswers(async ({jsonObject}) => {
        const body = {model:fb.model,stream:false,messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:JSON.stringify(questions)}]};
        if (jsonObject) body.response_format = {type:'json_object'};
        const base = (fb.baseUrl || 'https://api.deepseek.com').replace(/\/+$/,'');
        const res = await fetchImpl(base + '/chat/completions', {
            method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${fb.apiKey}`},
            body:JSON.stringify(body),signal:AbortSignal.any([AbortSignal.timeout(120_000),...(signal ? [signal] : [])]),
        });
        if (!res.ok) {
            await res.body?.cancel().catch(() => {});
            const error = new Error(`兜底 API HTTP ${res.status}`); error.status = res.status; throw error;
        }
        return (await res.json()).choices?.[0]?.message?.content;
    },questions,{signal}) : null;
    const requestAnswers = createAnswerResolver({jevCall,fallback,confidenceFloor:jev.confidenceFloor ?? 0.6,noulProbabilityFloor:jev.noulProbabilityFloor ?? 0.6});
    const local = createLocalService({
        consoleSource:readFileSync(directory + 'deepseek-console/xuexitong-console.js','utf8'),
        v3Source:readFileSync(directory + 'xuexitong_v3.user.js','utf8'),requestAnswers,mode:'openai',
    });
    await new Promise((resolve,reject) => {local.server.once('error',reject);local.server.listen(port,'127.0.0.1',resolve);});
    local.server.on('close',() => {dispatcher?.close().catch(() => {});});
    console.log(`本地答题服务已启动：http://127.0.0.1:${local.server.address().port}；模式 openai；${key ? 'Jev 优先' : '仅兼容 API'}${fb.apiKey ? '，兼容 API 兜底' : '，未配置兜底'}`);
    return local;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    try { await startService(); }
    catch (error) { console.error(`服务启动失败：${error.message}`); process.exitCode = 1; }
}
