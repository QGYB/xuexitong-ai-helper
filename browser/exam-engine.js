/* Independent adapter for the single-question exam view. Final paper submission stays manual. */
function createManualExamController(token) {
  const host = window, doc = host.document, url = new host.URL(host.location.href);
  if (host !== host.top || url.protocol !== 'https:' || !/(^|\.)chaoxing\.com$/i.test(url.hostname) ||
      !/^\/exam-ans\/exam\/test\/reVersionTestStartNew\/?$/.test(url.pathname)) return;
  host.__xuexitongConsoleDeepSeek?.destroy?.();
  const panel = installStatusPanel(), config = host.__XUEXITONG_CONFIG__ || {};
  const state = {active:false, destroyed:false, generation:0, timer:null, controller:null, requestTimer:null, status:'idle', message:'', seen:[]};
  const all = (root, selector) => Array.from(root.querySelectorAll(selector));
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const text = node => clean(node?.innerText ?? node?.textContent);
  const visible = node => {
    if (!node || node.isConnected === false) return false;
    for (let n=node;n&&n.nodeType!==9;n=n.parentElement) {
      const style = host.getComputedStyle(n);
      if (n.hidden || style.display==='none' || style.visibility==='hidden' || style.visibility==='collapse') return false;
    }
    return !node.getClientRects || node.getClientRects().length > 0;
  };
  const identity = ['courseId','classId','tId','id'].map(k => url.searchParams.get(k) || '').join(':');
  const startIndex = Number(url.searchParams.get('start') || 0), storageKey = 'wb-manual-exam-continuation';
  function storage(action, value) { try { return host.sessionStorage[action](storageKey, value); } catch { return null; } }
  function message(value) {
    state.message = value;
    panel.update(toggle, value, false);
    if (panel.button) panel.button.textContent = state.active ? '停止答题' : '一键开始做题';
    host.console.log('[学习助手]', value);
  }
  function stop(reason = '答题已停止，已选择的答案保留') {
    state.active=false;state.status='stopped';state.generation++;
    host.clearTimeout(state.timer);host.clearTimeout(state.requestTimer);state.timer=null;state.requestTimer=null;
    state.controller?.abort();state.controller=null;storage('removeItem');message(reason);return api;
  }
  function snapshot() {
    const boxes=all(doc,'.questionLi').filter(visible);
    if(boxes.length!==1)throw new Error('仅支持一次显示一道题的答题页面，请确认当前试卷视图');
    const box=boxes[0],qid=box.getAttribute('data'),title=box.querySelector('.mark_name');
    if(!/^\d+$/.test(qid||'')||!visible(title))throw new Error('无法识别当前题号或题干');
    const fields=all(box,'input[type="hidden"]');
    const find=name=>fields.filter(e=>e.name===name);
    // The question ID links fields; question position never determines the type.
    const kinds=find(`type${qid}`),names=find(`typeName${qid}`);
    if(kinds.length>1||names.length>1)throw new Error('当前题型字段重复');
    const normalizeType=value=>{
      const match=clean(value).match(/^(?:\d+\s*[.、．)）]\s*)?[（(【\[]?\s*(单选|多选|判断)(?:题)?(?=$|[\s,，:：)）】\]])/);
      return match?`${match[1]}题`:'';
    };
    const named=names.length?normalizeType(names[0].value):'';
    const numeric=kinds.length?{'0':'单选题','1':'多选题','3':'判断题'}[kinds[0].value]:'';
    if((names.length&&!named)||(kinds.length&&!numeric))throw new Error('当前题型尚不支持，请手动作答；支持单选、多选和判断');
    const types=new Set([named,normalizeType(text(title)),numeric].filter(Boolean));
    if(types.size!==1)throw new Error(types.size?'网页题型标记不一致，已停止':'无法读取网页题型标记，已停止');
    const type=[...types][0];
    // Multi-choice uses name="answers<qid>" with id="answer<qid>" in the exam view.
    // Accept the older singular name too, but never choose between competing fields.
    const inputs=fields.filter(e=>e.name===`answer${qid}`||e.name===`answers${qid}`);
    if(inputs.length!==1||(type!=='多选题'&&inputs[0].name!==`answer${qid}`))throw new Error('当前答案字段缺失、重复或与题型不匹配');
    const question=text(title).replace(/^\d+\s*[.、．)）]\s*/,'').replace(/^[（(][^）)]*(?:单选题|多选题|判断题)[^）)]*[）)]\s*/,'').trim();
    const nodes=all(box,'.answerBg').filter(visible);
    if(nodes.length<2||nodes.length>8||(type==='判断题'&&nodes.length!==2))throw new Error('当前题目选项不完整');
    const choices=nodes.map((node,index)=>{
      if(node.disabled||node.getAttribute('aria-disabled')==='true')throw new Error('当前选项不可操作');
      const markers=all(node,'.num_option,.num_option_dx');
      if(markers.length!==1||markers[0].getAttribute('qid')!==qid)throw new Error('选项与当前题号不匹配');
      const marker=markers[0],value=marker.getAttribute('data'),letter='ABCDEFGH'[index];
      if(!(type==='判断题'?/^(?:true|false)$/:/^[A-H]$/).test(value||''))throw new Error('无法识别选项保存值');
      if(type!=='判断题'&&text(marker)!==letter)throw new Error('显示选项顺序不明确');
      const label=text(node.querySelector('.answer_p'));
      if(!label||label.length>500)throw new Error('选项文字不完整或过长');
      return {node,marker,value,letter,text:label};
    });
    if(new Set(choices.map(c=>c.value)).size!==choices.length||!question||question.length>500)throw new Error('题干或选项映射无效');
    const input=inputs[0],allowed=choices.map(c=>c.value);
    const selected=()=>{
      const raw=clean(input.value);
      const values=type==='判断题'?(raw?[raw]:[]):raw.replace(/[,\s]/g,'').split('');
      if(values.some(v=>!allowed.includes(v))||new Set(values).size!==values.length||(type!=='多选题'&&values.length>1))throw new Error('页面已有答案状态不明确');
      return new Set(values);
    };
    selected();
    const wire={id:1,type,question,options:choices.map(({letter,text})=>({letter,text}))};
    return {box,qid,title,input,choices,selected,wire,signature:JSON.stringify(wire)};
  }
  function current(s,generation) {
    if(!state.active||state.destroyed||generation!==state.generation||host.document!==doc||host.location.href!==url.href)return false;
    try {const next=snapshot();return next.box===s.box&&next.qid===s.qid&&next.input===s.input&&next.signature===s.signature&&next.choices.every((c,i)=>c.node===s.choices[i].node&&c.marker===s.choices[i].marker);}catch{return false;}
  }
  async function request(path,body,generation) {
    const controller=new host.AbortController();state.controller=controller;
    const timeoutMs=path==='/health'?5000:Math.min(900000,Math.max(1,Number(config.requestTimeoutMs)||900000));
    let abort;
    try {
      const result=await Promise.race([
        (async()=>{
          const response=await host.fetch(`http://127.0.0.1:37841${path}`,{method:body?'POST':'GET',headers:{'X-Xuexitong-Token':token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal,redirect:'error',cache:'no-store'});
          if(generation!==state.generation)throw new Error('答题已取消');
          if(response.status!==200||!response.ok){const error=new Error(`答题服务返回 HTTP ${Number(response.status)||'未知'}`);error.retryable=[408,425,429].includes(response.status)||response.status>=500;throw error;}
          if(path==='/health')return true;
          try{return await response.json();}catch{const error=new Error('答题服务未返回有效 JSON');error.retryable=true;throw error;}
        })(),
        new Promise((_,reject)=>{abort=()=>reject(new Error('答题已取消'));controller.signal.addEventListener('abort',abort,{once:true});state.requestTimer=host.setTimeout(()=>{const error=new Error('答题服务响应超时');error.retryable=true;reject(error);controller.abort();},timeoutMs);})
      ]);
      return result;
    } catch(error) {
      if(error?.name==='TypeError')error.retryable=true;
      throw error;
    } finally {
      controller.signal.removeEventListener('abort',abort);
      if(generation===state.generation){host.clearTimeout(state.requestTimer);state.requestTimer=null;state.controller=null;}
    }
  }
  function later(fn,ms){state.timer=host.setTimeout(()=>{state.timer=null;void fn();},ms);}
  async function answer(s,generation,attempt=0) {
    try {
      if(!current(s,generation))throw new Error('当前题目已改变，已取消旧答案');
      message(`正在回答当前${s.wire.type}，已完成 ${state.seen.length} 题`);
      const payload=await request('/answer',{questions:[s.wire]},generation);
      if(!current(s,generation))throw new Error('请求期间题目已改变，已取消旧答案');
      const answers=payload?.answers,answer=answers?.[0],picked=answer?.letters;
      if(!Array.isArray(answers)||answers.length!==1||answer.id!==1||!Array.isArray(picked)||!picked.length||new Set(picked).size!==picked.length||
         picked.some(l=>!s.choices.some(c=>c.letter===l))||(s.wire.type!=='多选题'&&picked.length!==1))throw new Error('服务返回的答案无效，未选择或翻页');
      for(const choice of s.choices){
        if(!current(s,generation))throw new Error('选择答案期间题目已改变');
        const want=picked.includes(choice.letter),has=s.selected().has(choice.value);
        if(want===has||(s.wire.type!=='多选题'&&!want))continue;
        choice.node.click();
      }
      if(!current(s,generation)||s.choices.some(c=>s.selected().has(c.value)!==picked.includes(c.letter)))throw new Error('页面未保存预期选中状态，已停止翻页');
      state.seen.push(s.qid);
      const next=all(doc,'a,button').filter(n=>visible(n)&&text(n)==='下一题'&&/^\s*getTheNextQuestion\(\s*1\s*\)\s*;?\s*$/.test(n.getAttribute('onclick')||''));
      if(next.length!==1){stop('当前题已选择；未自动交卷，请检查试卷并手动交卷');return;}
      if(!Number.isSafeInteger(startIndex)||startIndex<0||state.seen.length>=500)throw new Error('题目进度超出支持范围，已停止翻页');
      const marker=JSON.stringify({identity,nextStart:startIndex+1,until:Date.now()+180000,seen:state.seen});
      storage('setItem',marker);
      if(storage('getItem')!==marker)throw new Error('浏览器未允许保存跨页答题进度，已保留当前答案，请手动翻页');
      message('当前答案已选择，正在保存并进入下一题；最终交卷需手动确认');
      next[0].click();
      later(()=>{if(state.active&&generation===state.generation)stop('下一题加载超时，请检查页面后重新开始');},Math.max(1,Number(config.transitionTimeoutMs)||45000));
    }catch(error){
      if(generation!==state.generation||!state.active)return;
      if(error.retryable&&current(s,generation)&&attempt<Math.min(3,Math.max(0,Number(config.quizRetryLimit??3)))){
        message(`${error.message}，即将重试 (${attempt+1}/3)`);later(()=>answer(s,generation,attempt+1),Math.max(1,Number(config.quizRetryDelayMs)||3000));
      }else stop(error.message||'答题失败，已停止');
    }
  }
  function start(seen=[]) {
    if(state.destroyed||host.app!==api)return api;
    if(panel.selectedMode!=='exam'){stop('请切换到考试答题模式');return api;}
    if(!token||/^__.*__$/.test(token)){stop('请通过本地服务注入有效会话令牌');return api;}
    state.active=true;state.status='running';state.seen=seen;const generation=++state.generation;
    message('正在连接答题引擎，可点击停止答题');
    void (async()=>{try{await request('/health',null,generation);if(!state.active||generation!==state.generation)return;const s=snapshot();if(seen.includes(s.qid))throw new Error('发现重复题号，已停止继续答题');await answer(s,generation);}catch(error){if(state.active&&generation===state.generation)stop(error.message||'无法连接答题引擎');}})();
    return api;
  }
  function toggle(){return state.active?stop():start();}
  const onHide=()=>{
    state.destroyed=true;state.active=false;state.generation++;
    host.clearTimeout(state.timer);host.clearTimeout(state.requestTimer);state.controller?.abort();panel.release(toggle);
  };
  const api={get status(){return state.status;},get message(){return state.message;},answerCurrentQuiz:toggle,run:start,stop,
    inspectQuiz(){try{return [snapshot().wire];}catch(error){return {error:error.message};}},
    destroy(){stop('答题控制器已替换');state.destroyed=true;host.removeEventListener('pagehide',onHide);panel.release(toggle);}};
  host.__WB_DRIVER='console';host.__xuexitongConsoleDeepSeek=api;host.app=api;
  panel.bind(toggle,{mode:'exam',onModeChange:()=>stop('已切换答题模式')});
  host.addEventListener('pagehide',onHide);
  message('考试答题引擎已接入，点击一键开始做题；最终交卷需手动确认');
  let resume;
  try{resume=JSON.parse(storage('getItem'));}catch{}
  storage('removeItem');
  if(resume?.identity===identity&&resume.nextStart===startIndex&&resume.until>Date.now()&&resume.until<=Date.now()+180000&&
     Array.isArray(resume.seen)&&resume.seen.length<500&&resume.seen.every(qid=>/^\d+$/.test(qid))&&new Set(resume.seen).size===resume.seen.length)start(resume.seen);
  return api;
}
