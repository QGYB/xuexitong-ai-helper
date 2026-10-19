// Shared local protocol and answer policy. Importing this module starts no service.
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';

export const SERVICE = 'xuexitong-ai-helper';
export const PROTOCOL = 1;
export const PORT = 37841;
export const SYSTEM_PROMPT = '按题意回答全部题目。题干或选项可能经过网页防复制处理，请结合上下文还原最可能的原句。每题给非空答案，只用该题提供的选项字母且不可重复；单选和判断选一个，多选列出所有正确项。id须对应题号。只输出JSON：{"answers":[{"id":1,"letters":["A"]}]}。';
export const allowedOrigin = origin => /^https:\/\/([a-z0-9-]+\.)*chaoxing\.com$/i.test(origin || '');

export function loadConfig(file, {required = true} = {}) {
    if (!existsSync(file)) {
        if (!required) return {};
        throw new Error(`未找到配置文件 ${file.split(/[\\/]/).at(-1)}，请复制对应 example 文件并填写`);
    }
    let value;
    try { value = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
    catch { throw new Error(`配置文件 ${file.split(/[\\/]/).at(-1)} 必须是有效 JSON`); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('配置文件必须是 JSON 对象');
    return value;
}

export function validQuestions(questions) {
    return Array.isArray(questions) && questions.length >= 1 && questions.length <= 30 &&
        questions.every((q, i) => q && Number.isInteger(q.id) && q.id === i + 1 &&
            ['单选题', '多选题', '判断题'].includes(q.type) &&
            typeof q.question === 'string' && q.question.trim().length > 0 && q.question.length <= 500 &&
            Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 8 &&
            q.options.every(o => o && typeof o.letter === 'string' && /^[A-H]$/.test(o.letter) &&
                typeof o.text === 'string' && o.text.trim().length > 0 && o.text.length <= 500) &&
            new Set(q.options.map(o => o.letter)).size === q.options.length);
}

export function parseAnswers(text) {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 1_000_000) throw new Error('模型答案内容无效或过大');
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('模型返回内容中没有 JSON');
    let data;
    try { data = JSON.parse(cleaned.slice(start, end + 1)); }
    catch { throw new Error('模型答案不是有效 JSON'); }
    if (!data || !Array.isArray(data.answers)) throw new Error('模型答案缺少 answers 数组');
    return data.answers;
}

export function validateAnswers(questions, answers) {
    if (!Array.isArray(answers) || answers.length !== questions.length) throw new Error('模型答案数量不完整');
    const expected = new Map(questions.map(q => [q.id, q]));
    const found = new Map();
    for (const a of answers) {
        if (!a || !Number.isInteger(a.id) || !expected.has(a.id) || found.has(a.id)) throw new Error('模型答案题号无效或重复');
        const q = expected.get(a.id);
        if (!Array.isArray(a.letters) || !a.letters.length || a.letters.length > q.options.length ||
            (q.type !== '多选题' && a.letters.length !== 1) || new Set(a.letters).size !== a.letters.length ||
            a.letters.some(l => typeof l !== 'string' || !q.options.some(o => o.letter === l))) {
            throw new Error(`第 ${q.id} 题模型答案选项无效`);
        }
        found.set(a.id, {id:a.id, letters:[...a.letters]});
    }
    return questions.map(q => found.get(q.id));
}

function probability(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1; }

export function createAnswerResolver({jevCall, fallback, confidenceFloor = 0.6, noulProbabilityFloor = 0.6}) {
    if (!probability(confidenceFloor)) throw new Error('jev.confidenceFloor 必须在 0 到 1 之间');
    if (!probability(noulProbabilityFloor) || noulProbabilityFloor <= 0.5) throw new Error('jev.noulProbabilityFloor 必须大于 0.5 且不大于 1');
    return async (questions, {signal} = {}) => {
        const accepted = [], remaining = [];
        for (const q of questions) {
            signal?.throwIfAborted();
            if (!jevCall) { remaining.push(q); continue; }
            try {
                let letters;
                if (q.type === '多选题') {
                    const schema = Object.fromEntries(q.options.map(o => [o.letter, {type:'noul', instructions:`选项 ${o.letter}“${o.text}”是否是本题正确答案之一？`} ]));
                    const state = q.question + '\n（多选题）\n' + q.options.map(o => `${o.letter}. ${o.text}`).join('\n');
                    const answers = await jevCall(state, schema, {signal});
                    letters = [];
                    for (const o of q.options) {
                        const a = answers?.[o.letter];
                        if (a?.type !== 'noul' || !probability(a.noul)) throw new Error('Jev 多选响应不完整');
                        if (a.noul > 1 - noulProbabilityFloor && a.noul < noulProbabilityFloor) throw new Error('Jev 多选概率处于不确定区间');
                        if (a.noul >= noulProbabilityFloor) letters.push(o.letter);
                    }
                    if (!letters.length) throw new Error('Jev 多选没有给出正确项');
                } else {
                    const criteria = Object.fromEntries(q.options.map(o => [o.letter, o.text]));
                    const answers = await jevCall(q.question, {ans:{type:'choice', instructions:'选出正确答案选项', criteria}}, {signal});
                    const a = answers?.ans;
                    if (!a || !Object.hasOwn(criteria, a.choice) || !probability(a.confidence) || a.confidence < confidenceFloor) {
                        throw new Error('Jev 单选/判断响应不完整或置信度不足');
                    }
                    letters = [a.choice];
                }
                accepted.push({id:q.id, letters});
            } catch (error) {
                signal?.throwIfAborted();
                remaining.push(q);
            }
        }
        if (remaining.length) {
            if (!fallback) throw new Error(`未配置兜底 API：第 ${remaining.map(q => q.id).join('、')} 题需要人工处理`);
            signal?.throwIfAborted();
            accepted.push(...validateAnswers(remaining, await fallback(remaining, {signal})));
        }
        return validateAnswers(questions, accepted);
    };
}

export async function retryAnswers(call, questions, {signal} = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
        signal?.throwIfAborted();
        try { return validateAnswers(questions, parseAnswers(await call({jsonObject:attempt === 0, signal}))); }
        catch (error) {
            signal?.throwIfAborted();
            if (attempt === 1 || (error.status >= 400 && error.status < 500 && ![400,422,429].includes(error.status))) throw error;
        }
    }
}

export function abortable(promise, signal) {
    if (!signal) return promise;
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const onAbort = () => reject(signal.reason || new Error('请求已取消'));
        signal.addEventListener('abort', onAbort, {once:true});
        Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
}

export async function readJsonBody(req, maxBytes = 100_000) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > maxBytes) { const error = new Error('请求内容过大'); error.status = 413; throw error; }
        chunks.push(buffer);
    }
    try { return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(Buffer.concat(chunks))); }
    catch { const error = new Error('请求内容必须是有效 UTF-8 JSON'); error.status = 400; throw error; }
}

const isLoopback = address => ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address);
const loopbackHost = host => /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i.test(host || '');

export function createLocalService({consoleSource, v3Source = '', requestAnswers, mode = 'openai', token = randomBytes(24).toString('hex'), requestTimeoutMs = 840_000}) {
    const placeholder = "const LOCAL_TOKEN = '__LOCAL_TOKEN__';";
    if (typeof consoleSource !== 'string' || consoleSource.split(placeholder).length !== 2) throw new Error('控制台模板需要唯一 LOCAL_TOKEN 占位符');
    const consoleScript = consoleSource.replace(placeholder, () => `const LOCAL_TOKEN = '${token}';`);
    const sessionId = randomBytes(16).toString('hex');
    const identity = {service:SERVICE, protocol:PROTOCOL, sessionId, mode};
    let busy = false;
    const send = (res, status, data, origin) => {
        if (res.destroyed || res.writableEnded) return;
        res.writeHead(status, {
            'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store',
            'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'none'",
            ...(origin ? {'Access-Control-Allow-Origin':origin, Vary:'Origin'} : {}),
        });
        res.end(JSON.stringify(data));
    };
    const server = createServer(async (req, res) => {
        const origin = req.headers.origin;
        if (!isLoopback(req.socket.remoteAddress) || !loopbackHost(req.headers.host)) { send(res,403,{error:'Loopback only'}); return; }
        // Fetch Metadata protects browser requests even when no-cors omits Origin.
        const bootstrap = origin === undefined && req.headers['sec-fetch-site'] === undefined && req.headers['sec-fetch-dest'] === undefined;
        if (req.method === 'GET' && req.url === '/script') {
            if (!bootstrap) { send(res,403,{error:'Script bootstrap is for the local runner only'}); return; }
            send(res,200,{...identity, consoleScript, v3Script:v3Source}); return;
        }
        if (req.method === 'GET' && req.url === '/health' && bootstrap) { send(res,200,{ok:true,...identity}); return; }
        if (!allowedOrigin(origin)) { send(res,403,{error:'Origin not allowed'}); return; }
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {'Access-Control-Allow-Origin':origin, 'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers':'Content-Type, X-Xuexitong-Token','Access-Control-Allow-Private-Network':'true',
                'Access-Control-Max-Age':'600', Vary:'Origin','Cache-Control':'no-store'});
            res.end(); return;
        }
        if (req.headers['x-xuexitong-token'] !== token) { send(res,403,{error:'本地令牌不匹配，请刷新课程页重新注入'},origin); return; }
        if (req.method === 'GET' && req.url === '/health') { send(res,200,{ok:true,...identity},origin); return; }
        if (req.method !== 'POST' || req.url !== '/answer') { send(res,404,{error:'未找到接口'},origin); return; }
        if (busy) { send(res,429,{error:'上一批题目仍在处理，请稍后重试'},origin); return; }
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) { send(res,415,{error:'仅接受 JSON'},origin); return; }
        busy = true;
        const client = new AbortController();
        const signal = AbortSignal.any([client.signal, AbortSignal.timeout(requestTimeoutMs)]);
        const disconnected = () => { if (!res.writableEnded) client.abort(new Error('客户端已断开')); };
        req.once('aborted', disconnected); res.once('close', disconnected);
        try {
            const data = await abortable(readJsonBody(req), signal);
            if (!validQuestions(data?.questions)) { const error = new Error('题目格式不正确'); error.status = 400; throw error; }
            const answers = validateAnswers(data.questions, await abortable(requestAnswers(data.questions,{signal}),signal));
            send(res,200,{answers},origin);
        } catch (error) {
            const code = error?.code || error?.error?.code;
            const message = typeof code === 'string' && code.startsWith('quota_') ? `云服务额度不足或被限流（${code}）` : error.message;
            send(res,error.status >= 400 && error.status <= 499 ? error.status : 502,{error:message || '答题服务失败'},origin);
        } finally {
            req.off('aborted',disconnected); res.off('close',disconnected); busy = false;
        }
    });
    server.requestTimeout = 30_000;
    server.headersTimeout = 10_000;
    return {server, token, sessionId};
}
