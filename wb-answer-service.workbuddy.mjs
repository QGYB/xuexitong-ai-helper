// Jev first, WorkBuddy Cloud fallback. Two service modes share one local protocol.
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {fetch as undiciFetch,ProxyAgent} from 'undici';
import {createWorkBuddyCloud} from '@tencent-ai/workbuddy-cloud-sdk';
import {PORT,loadConfig,createAnswerResolver,createLocalService} from './wb-service-core.mjs';
import {createCloudAnswerer} from './wb-cloud-quality.mjs';
import {createAnswerDiagnostics} from './wb-answer-diagnostics.mjs';
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
    const diagnostics=createAnswerDiagnostics({directory,enabled:env.WB_DIAGNOSTICS==='1'});
    const fallback=createCloudAnswerer({cloud,model:env.WB_MODEL,diagnostics});
    const requestAnswers = createAnswerResolver({jevCall,fallback,confidenceFloor:jev.confidenceFloor ?? 0.6,noulProbabilityFloor:jev.noulProbabilityFloor ?? 0.6,
        onDecision:event=>diagnostics.record({...event,model:jev.model||'jev-latest'})});
    const local = createLocalService({consoleSource:(diagnostics.enabled?'window.__WB_ANSWER_DIAGNOSTICS__ = true;\n':'')+readFileSync(directory + 'deepseek-console/xuexitong-console.js','utf8'),
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
