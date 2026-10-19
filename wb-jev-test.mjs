// Jev 连通性自测：读取 config.json，发送一道测试题
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetch, ProxyAgent } from 'undici';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const config = JSON.parse(readFileSync(HERE + 'config.json', 'utf8'));
const KEY = config.jev?.apiKey || process.env.JEV_API_KEY || '';
if (!KEY) { console.error('config.json 中未配置 jev.apiKey'); process.exit(1); }
const dispatcher = new ProxyAgent(config.jev?.proxy || 'http://127.0.0.1:7897');

const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
        model: config.jev?.model || 'jev-latest',
        state: '这道单选题问：中国的首都是哪里？',
        questions: {
            ans: { type: 'choice', instructions: '选出正确答案选项', criteria: { A: '上海', B: '北京', C: '广州', D: '深圳' } },
        },
    }),
    dispatcher,
    signal: AbortSignal.timeout(30000),
});
console.log('HTTP', res.status);
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
const choice = data.answers?.ans?.choice;
console.log(choice === 'B' ? '\n✅ Jev 链路正常' : `\n⚠️ 返回了 ${choice}，请人工核对`);
