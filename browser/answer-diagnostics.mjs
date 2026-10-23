// Serialized into both standalone scripts; contains no credentials or API calls.
export function assertCompleteAnswerText(nodes,values) {
    if(nodes.some(node=>node?.querySelector('img,canvas,svg,math,mjx-container')))throw new Error('题目含图片或公式，当前文字接口无法完整提取，请手动核对');
    if(values.some(value=>/[\uFFFD\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u.test(value)))throw new Error('题干或选项有乱码，已停止自动作答');
    if(new Set(values.slice(1).map(value=>value.replace(/\s+/g,' ').trim())).size!==values.length-1)throw new Error('存在无法区分的重复选项，已停止自动作答');
}
export async function traceAnswerApplication(requestId,rows) {
    const host=window;if(host.__WB_ANSWER_DIAGNOSTICS__!==true)return;
    try{
        if(!host.crypto?.subtle||!host.TextEncoder)return;
        const hash=async text=>Array.from(new Uint8Array(await host.crypto.subtle.digest('SHA-256',new host.TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');
        const id=typeof requestId==='string'&&/^[a-f0-9-]{36}$/i.test(requestId)?requestId:null;
        for(const {wire,returned,observed} of rows){
            const event={requestId:id,questionId:wire.id,questionHash:await hash(JSON.stringify([wire.type,wire.question,wire.options.map(o=>[o.letter,o.text])])),type:wire.type,
                returnedLetters:returned.filter(letter=>/^[A-H]$/.test(letter)),options:[]};
            for(const option of wire.options){
                const actual=observed.find(item=>item.letter===option.letter);
                event.options.push({letter:option.letter,textHash:await hash(option.text),expectedSelected:returned.includes(option.letter),observedSelected:actual?.selected===true,
                    storedValue:typeof actual?.storedValue==='string'&&/^(?:[A-H]{1,8}|true|false)$/.test(actual.storedValue)?actual.storedValue:null});
            }
            host.console.log('[学习助手][答题核对]',JSON.stringify(event));
        }
    }catch{ /* Diagnostic failures never change answer application or submission. */ }
}
