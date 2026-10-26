/* Generated from browser sources by scripts/build-browser.mjs. */
(() => {
'use strict';
const LOCAL_TOKEN = '__LOCAL_TOKEN__';
function installStatusPanel({withAnswer = true} = {}) {
  const host = window;
  let doc = host.document;
  if (host !== host.top) return null;
  if (host.__WBStatusPanel?.version === 4 && host.__WBStatusPanel.status.ownerDocument === doc) { host.__WBStatusPanel.ensure(); return host.__WBStatusPanel; }
  host.__WBStatusPanel?.dispose?.();
  const status = doc.createElement('div');
  status.id = 'xuexitong-independent-status';
  status.setAttribute('role', 'group'); status.setAttribute('aria-label', '学习助手');
  status.style.cssText = 'position:fixed!important;bottom:8px!important;right:8px!important;z-index:2147483647!important;display:flex!important;flex-wrap:wrap;visibility:visible!important;opacity:1!important;align-items:center;gap:8px;background:#fff;color:#222;border:1px solid #777;border-radius:6px;padding:8px;max-width:calc(100vw - 16px);box-sizing:border-box;font:13px sans-serif';
  const message = doc.createElement('span');
  message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
  message.style.cssText = 'min-width:0;max-width:360px;overflow-wrap:anywhere;';
  message.textContent = '学习助手已就绪，进入章节学习页后可答题';
  const button = withAnswer ? doc.createElement('button') : null;
  const detectedMode = /^\/exam-ans\//.test(host.location.pathname) ? 'exam' : 'course';
  let owner = null, observer, selectedMode = detectedMode, boundMode = null, onModeChange = null, onRestart = null, canRestart = null, restartAt = -Infinity;
  const restartButton = doc.createElement('button');
  restartButton.id = 'xuexitong-restart-current'; restartButton.type = 'button'; restartButton.textContent = '重新启动'; restartButton.disabled = true;
  restartButton.style.cssText = 'flex-shrink:0;white-space:nowrap;border:1px solid #777;border-radius:4px;background:#f5f5f5;color:#222;padding:6px 10px;font:inherit;cursor:pointer;';
  function restartAllowed() {
    try { return Boolean(owner && onRestart && selectedMode === boundMode && (!canRestart || canRestart())); } catch { return false; }
  }
  function syncRestart() {
    restartButton.disabled = !restartAllowed(); restartButton.style.opacity = restartButton.disabled ? '0.6' : '1';
    restartButton.title = restartButton.disabled ? '当前页面未就绪、模式不符或正在确认测验提交，暂不能重启' : '重新启动当前页的学习助手，保留当前课程位置、登录和答题方式';
  }
  restartButton.onclick = () => {
    if (!restartAllowed() || Date.now() - restartAt < 500) return;
    restartAt = Date.now(); onRestart(); syncRestart();
  };
  if (button) {
    button.id = 'xuexitong-answer-current'; button.type = 'button'; button.textContent = '一键开始做题';
    button.title = '进入章节学习页后，点击处理当前测验，完成后停留';
    button.style.cssText = 'flex-shrink:0;white-space:nowrap;border:1px solid #16825d;border-radius:4px;background:#16825d;color:#fff;padding:6px 10px;font:inherit;cursor:pointer;';
    button.disabled = true; button.style.opacity = '0.6'; status.append(button);
  }
  const modeButton = withAnswer ? doc.createElement('button') : null;
  const modeName = mode => mode === 'exam' ? '考试答题' : '章节测验';
  function syncMode() {
    if (modeButton) modeButton.textContent = `模式：${modeName(selectedMode)}`;
    if (button && (!owner || selectedMode !== boundMode)) button.disabled = true;
    syncRestart();
  }
  if (modeButton) {
    modeButton.id = 'xuexitong-answer-mode'; modeButton.type = 'button';
    modeButton.title = '切换章节测验 / 考试答题；切换时停止正在进行的答题';
    modeButton.style.cssText = 'flex-shrink:0;white-space:nowrap;border:1px solid #777;border-radius:4px;background:#f5f5f5;color:#222;padding:6px 10px;font:inherit;cursor:pointer;';
    modeButton.onclick = () => {
      selectedMode = selectedMode === 'course' ? 'exam' : 'course';
      onModeChange?.();
      syncMode();
      if (button) button.disabled = !owner || selectedMode !== boundMode;
      message.textContent = selectedMode === boundMode ? `已切换至${modeName(selectedMode)}，点击一键开始做题` : `已选择${modeName(selectedMode)}；当前页面不属于此模式，请切换模式或打开对应页面`;
    };
    status.append(modeButton); syncMode();
  }
  status.append(restartButton,message);
  function ensure() {
    // Popup navigation may reuse its initial about:blank Window with a new Document.
    if (host.document !== doc) {
      doc = host.document; owner = null; boundMode = null; onModeChange = null; onRestart = null; canRestart = null;
      observer?.disconnect(); observer?.observe(doc, {childList:true, subtree:true});
      if (button) { button.onclick = null; button.disabled = true; button.style.opacity = '0.6'; }
      message.textContent = '学习助手已就绪，进入章节学习页后可答题';
      syncRestart();
    }
    const root = doc.documentElement || doc.body;
    if (root && !doc.contains(status)) root.append(status);
  }
  const panel = {
    version:4, status, message, button, modeButton, restartButton, ensure, get selectedMode() { return selectedMode; },
    dispose() {
      owner = null; onRestart = null; canRestart = null; restartButton.onclick = null; restartButton.disabled = true;
      observer?.disconnect();
      host.removeEventListener?.('DOMContentLoaded', ensure); host.removeEventListener?.('pageshow', ensure);
      status.remove();
    },
    bind(handler, options = {}) { owner = handler; boundMode = options.mode || 'course'; onModeChange = options.onModeChange || null; onRestart = options.onRestart || null; canRestart = options.canRestart || null; if (button) button.onclick = handler; syncMode(); },
    update(handler, text, disabled) {
      if (owner !== handler) return;
      const mismatch = selectedMode !== boundMode;
      message.textContent = mismatch ? `已选择${modeName(selectedMode)}；当前页面不属于此模式，请切换模式或打开对应页面` : text;
      if (button) { button.disabled = disabled || mismatch; button.style.opacity = button.disabled ? '0.6' : '1'; }
      syncRestart();
      ensure();
    },
    release(handler) {
      if (owner !== handler) return;
      owner = null; boundMode = null; onModeChange = null; onRestart = null; canRestart = null; syncRestart();
      if (button) { button.onclick = null; button.disabled = true; button.style.opacity = '0.6'; }
    }
  };
  host.__WBStatusPanel = panel;
  if (host.MutationObserver) { observer = new host.MutationObserver(ensure); observer.observe(doc, {childList:true, subtree:true}); }
  host.addEventListener('DOMContentLoaded', ensure);
  host.addEventListener('pageshow', ensure);
  ensure();
  return panel;
}
function assertCompleteAnswerText(nodes,values) {
    if(nodes.some(node=>node?.querySelector('img,canvas,svg,math,mjx-container')))throw new Error('题目含图片或公式，当前文字接口无法完整提取，请手动核对');
    if(values.some(value=>/[\uFFFD\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u.test(value)))throw new Error('题干或选项有乱码，已停止自动作答');
    if(new Set(values.slice(1).map(value=>value.replace(/\s+/g,' ').trim())).size!==values.length-1)throw new Error('存在无法区分的重复选项，已停止自动作答');
}
async function traceAnswerApplication(requestId,rows) {
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
function createVideoQuizAdapter({mode,token,configs,dom,readEntries,taskKey,isAlive,onMessage,onFailure,onComplete,onResume,decodeAnswers}) {
  const host=window,{all,visible,visibleOption,optionTarget,controlLabel}=dom;
  let record=null,timer=null,controller=null;
  const text=node=>String(node?.innerText??node?.textContent??'').replace(/\s+/g,' ').trim();
  const enabled=node=>visible(node)&&!node.disabled&&node.getAttribute('aria-disabled')!=='true'&&!/(?:^|\s)disabled(?:\s|$)/.test(node.getAttribute('class')||'');
  function find(entries){
    const popups=entries.flatMap(entry=>all(entry.doc,'.ans-videoquiz').filter(visible).map(popup=>({entry,popup})));
    if(popups.length>1)throw new Error('存在多个可见视频弹题，无法确认当前题目，已停止');
    if(!popups.length)return null;
    const found=popups[0],videos=all(found.entry.doc,'video').filter(visible);
    if(videos.length!==1)throw new Error('无法唯一确认视频弹题所属播放器，已停止');
    return {...found,video:videos[0]};
  }
  function baseCurrent(snapshot){
    return isAlive()&&readEntries().some(entry=>entry.doc===snapshot.entry.doc&&entry.slot===snapshot.entry.slot&&entry.task===snapshot.entry.task&&
      taskKey(entry.doc)===snapshot.entry.task&&all(entry.doc,'video').includes(snapshot.video)&&visible(snapshot.video));
  }
  function extract(found){
    const {entry,popup,video}=found,items=all(popup,'.tkItem');
    const incomplete=()=>{const error=new Error('视频弹题尚未完整显示');error.incomplete=true;throw error;};
    if(!items.length||items.some(item=>!visible(item)))incomplete();
    if(items.length>30)throw new Error('视频弹题超过30道，已停止');
    const captions=all(popup,'.tkTopic_title').filter(visible);
    if(!captions.length||!text(captions[0]))incomplete();
    if(captions.length!==1)throw new Error('视频弹题题型标记不唯一，已停止');
    const type=['单选题','多选题','判断题'].find(value=>text(captions[0]).includes(value));
    if(!type)throw new Error('视频弹题题型不支持，仅支持单选、多选和判断');
    if(type==='多选题'&&all(popup,'#videoquiz-submit').filter(visible).length!==1)throw new Error('视频多选弹题缺少独立提交按钮，已停止以免提交不完整答案');
    const rows=items.map((item,index)=>{
      const titles=all(item,'.tkItem_title').filter(visible),options=all(item,'.ans-videoquiz-opt');
      if(!titles.length||!text(titles[0])||options.length<2||options.some(option=>!visibleOption(option)))incomplete();
      if(titles.length!==1||options.length<2||options.length>8||options.some(option=>!visibleOption(option)))throw new Error('视频弹题题干或选项不完整，已停止');
      if(all(item,'textarea,input[type="text"],[contenteditable="true"]').length)throw new Error('视频弹题包含未支持的输入题型，已停止');
      const controls=options.map(option=>{
        const inputs=all(option,'input[type="radio"],input[type="checkbox"]');
        if(inputs.length!==1||inputs[0].type!==(type==='多选题'?'checkbox':'radio')||inputs[0].disabled||inputs[0].getAttribute('aria-disabled')==='true'||!optionTarget(inputs[0],item))throw new Error('视频弹题选项不可操作或类型不符，已停止');
        return inputs[0];
      });
      if(type==='判断题'&&controls.length!==2)throw new Error('视频判断题必须恰有两个选项');
      const wire={id:index+1,type,question:text(titles[0]),options:controls.map((control,i)=>({letter:'ABCDEFGH'[i],text:controlLabel(control,item).replace(/^[A-H](?:\s*[.、．:：)）]\s*|\s*\n\s*)/i,'').replace(/\s+/g,' ').trim()}))};
      if(!wire.question||wire.question.length>500||wire.options.some(o=>!o.text||o.text.length>500))throw new Error('视频弹题文字不完整或过长，已停止');
      assertCompleteAnswerText([titles[0],...options],[wire.question,...wire.options.map(o=>o.text)]);
      return {box:item,controls,targets:controls.map(control=>optionTarget(control,item)),wire};
    });
    return {entry,popup,video,rows,signature:JSON.stringify(rows.map(row=>row.wire))};
  }
  function same(snapshot,allowClosed=false){
    if(!baseCurrent(snapshot))return false;
    let current;try{current=find(readEntries());}catch{return false;}
    if(!current)return allowClosed&&!visible(snapshot.popup);
    if(current.popup!==snapshot.popup||current.video!==snapshot.video||current.entry.doc!==snapshot.entry.doc)return false;
    try{const next=extract(current);return next.signature===snapshot.signature&&next.rows.every((row,i)=>row.box===snapshot.rows[i].box&&row.controls.every((control,j)=>control===snapshot.rows[i].controls[j]&&row.targets[j]===snapshot.rows[i].targets[j]));}catch{return false;}
  }
  function clearRequest(){host.clearTimeout(timer);timer=null;controller=null;}
  function stop(){controller?.abort();clearRequest();}
  function fail(message){onFailure(message);}
  async function answer(snapshot){
    const current=record;current.phase='requesting';current.attempts++;controller=new host.AbortController();const abort=controller;
    onMessage('正在回答当前视频弹题，等待答案期间保持暂停');
    try{
      const timeout=new Promise((_,reject)=>{timer=host.setTimeout(()=>{const error=new Error('视频弹题答题请求超时');error.retryable=true;abort.abort();reject(error);},Math.min(900000,Math.max(1,Number(configs.requestTimeoutMs)||900000)));});
      const request=(async()=>{
        let response;try{response=await host.fetch('http://127.0.0.1:37841/answer',{method:'POST',headers:{'Content-Type':'application/json','X-Xuexitong-Token':token},body:JSON.stringify({questions:snapshot.rows.map(row=>row.wire)}),signal:abort.signal});}
        catch{const error=new Error('无法连接视频弹题答题服务');error.retryable=true;throw error;}
        if(!response.ok||response.status!==200){const error=new Error(`视频弹题答题服务返回 HTTP ${Number(response.status)||'未知'}`);error.retryable=[408,425,429].includes(response.status)||response.status>=500;throw error;}
        try{current.requestId=response.headers?.get?.('X-Xuexitong-Request-Id')||null;}catch{}
        try{return await response.json();}catch{const error=new Error('视频弹题答案不是有效JSON');error.retryable=true;throw error;}
      })();
      const payload=await Promise.race([request,timeout]);
      if(!isAlive()||record!==current)return;
      if(!same(snapshot))throw new Error('请求期间视频弹题或章节已改变，已取消旧答案');
      const answers=decodeAnswers(payload,snapshot);
      current.applied=true;current.phase='applying';
      for(const row of snapshot.rows)for(let i=0;i<row.controls.length;i++){
        const want=answers.get(row.wire.id).includes('ABCDEFGH'[i]),control=row.controls[i];
        if(control.checked===want||(row.wire.type!=='多选题'&&!want))continue;
        if(!same(snapshot))throw new Error('应用答案期间视频弹题已改变，已停止');
        row.targets[i].click();
      }
      if(!same(snapshot,true)||snapshot.rows.some(row=>row.controls.some((control,i)=>control.checked!==answers.get(row.wire.id).includes('ABCDEFGH'[i]))))throw new Error('页面未确认视频弹题的选中状态，已停止提交');
      if(host.__WB_ANSWER_DIAGNOSTICS__===true&&typeof traceAnswerApplication==='function')void traceAnswerApplication(current.requestId,snapshot.rows.map(row=>({wire:row.wire,returned:answers.get(row.wire.id),observed:row.controls.map((control,i)=>({letter:'ABCDEFGH'[i],selected:control.checked===true,storedValue:control.value||null}))})));
      current.phase='waiting';current.waitStarted=Date.now();
      if(visible(snapshot.popup)){
        const buttons=all(snapshot.popup,'#videoquiz-submit').filter(enabled);
        if(buttons.length!==1)throw new Error('未找到唯一可用的视频弹题提交按钮，请手动确认');
        current.submitted=true;buttons[0].click();
      }
      onMessage('视频弹题答案已应用，等待平台确认后继续视频');
    }catch(error){
      if(!isAlive()||record!==current)return;
      const limit=Math.min(5,Math.max(0,Number(configs.quizRetryLimit)||0));
      if(error.retryable&&!current.applied&&same(snapshot)&&current.attempts<=limit){current.phase='ready';current.nextAt=Date.now()+Math.min(30000,Math.max(1,Number(configs.quizRetryDelayMs)||3000));onMessage(`${error.message}，稍后重试视频弹题（${current.attempts}/${limit}）`);}
      else fail(error.message||'视频弹题处理失败');
    }finally{clearRequest();}
  }
  async function reconcile(entries){
    let found;try{found=find(entries);}catch(error){fail(error.message);return true;}
    if(!found){
      if(!record)return false;
      const old=record;record=null;
      if(baseCurrent(old)){
        onComplete();if(isAlive()){onMessage('视频弹题已关闭，继续当前视频');await onResume(old.video);}
        return true;
      }
      return false;
    }
    if(!record||record.popup!==found.popup||record.video!==found.video||record.entry.task!==found.entry.task){
      if(record&&record.phase==='requesting'){fail('视频弹题切换，已取消旧请求');return true;}
      record={...found,start:Date.now(),phase:'ready',attempts:0,nextAt:0,applied:false,submitted:false,continued:false};
    }
    if(typeof found.video.pause==='function'&&!found.video.paused)found.video.pause();
    if(Date.now()-record.start>=Math.min(900000,Math.max(1,Number(configs.quizStopMs)||900000))){fail('视频弹题等待超时，未关闭或跳过题目');return true;}
    if(mode!=='console'){onMessage('视频弹题待手动作答，关闭后继续当前视频');return true;}
    if(record.phase==='waiting'){
      if(!baseCurrent(record)){fail('视频弹题所属任务已改变，已停止');return true;}
      const negative=all(found.popup,'#spanNot,#spanNotBack,#spanNotBackPoint,.spanNot,.spanNotBack').some(node=>visible(node)&&/真遗憾|回答错误|答错|不正确/.test(text(node)));
      if(negative){record.phase='rejected';fail('视频弹题反馈未通过，请人工核对答案');return true;}
      const continuation=all(found.popup,'#videoquiz-continue,.ans-videoquiz-continue').filter(enabled);
      if(continuation.length>1){fail('视频弹题继续按钮不唯一，已停止');return true;}
      if(continuation.length===1&&!record.continued){record.continued=true;continuation[0].click();onMessage('已请求继续学习，等待视频弹题关闭');}
      if(all(found.popup,'#videoquiz-submit').some(enabled)){
        let next;try{next=extract(found);}catch{return true;}
        if(next.signature!==record.snapshot.signature){record={...found,start:Date.now(),phase:'ready',attempts:0,nextAt:0,applied:false,submitted:false,continued:false,snapshot:next};await answer(next);}
      }
      return true;
    }
    let snapshot;try{snapshot=extract(found);}catch(error){if(error.incomplete){if(Date.now()-record.start>=Math.min(120000,Math.max(1,Number(configs.quizLoadTimeoutMs)||120000)))fail('视频弹题加载超时，未选择或提交');else onMessage(error.message);return true;}fail(error.message);return true;}
    if(record.snapshot&&record.snapshot.signature!==snapshot.signature){fail('重试期间视频题目内容已改变，已停止');return true;}
    record.snapshot=snapshot;
    if(Date.now()>=record.nextAt)await answer(snapshot);
    return true;
  }
  return {reconcile,stop,get canRestart(){return !record?.applied||record?.phase!=='waiting';},inspect(entries){const found=find(entries);return found?extract(found).rows.map(row=>row.wire):null;}};
}
/* Independently authored course controller. This function is embedded by the builder. */
function createCourseController(mode, token, initialFlow = 'auto') {
  const host = window;
  const here = host.location;
  if (host.top !== host || here.protocol !== 'https:' ||
      !/(^|\.)chaoxing\.com$/i.test(here.hostname) ||
      !/^\/(?:mooc2-ans\/)?mycourse\/studentstudy\/?$/.test(here.pathname)) return;
  if (mode === 'v3' && host.__WB_DRIVER === 'console') return;

  for (const key of ['__xuexitongConsoleDeepSeek', '__xuexitongPlayerV3']) {
    const old = host[key];
    if (old && typeof old.destroy === 'function') old.destroy();
  }
  const configs = Object.assign({
    autoplay: true, retryInterval: 2000, maxRetries: 10, videoCheckInterval: 1000,
    guardNoProgressMs: 7000, guardResumeCooldownMs: 1500,
    tickMs: 1000, playRetryLimit: 10, playbackRate: mode === 'v3' ? 1.5 : null,
    requestTimeoutMs: 900000, transitionTimeoutMs: 45000, quizLoadTimeoutMs: 120000,
    quizWarnMs: 600000, quizStopMs: 900000, quizRetryLimit: 3, quizRetryDelayMs: 3000,
    emptyChapterSettleMs: 5000
  }, host.__XUEXITONG_CONFIG__ || {});
  if (configs.quizCompletionWarningMs !== undefined) configs.quizWarnMs = configs.quizCompletionWarningMs;
  if (configs.quizCompletionTimeoutMs !== undefined) configs.quizStopMs = configs.quizCompletionTimeoutMs;
  for (const [alias, name] of [['quizCompletionWarningMs', 'quizWarnMs'], ['quizCompletionTimeoutMs', 'quizStopMs']]) {
    Object.defineProperty(configs, alias, { enumerable: true, configurable: true, get() { return configs[name]; }, set(value) { configs[name] = value; } });
  }
  if (host.__XUEXITONG_CONFIG__?.videoCheckInterval !== undefined && host.__XUEXITONG_CONFIG__?.tickMs === undefined) configs.tickMs = configs.videoCheckInterval;
  if (host.__XUEXITONG_CONFIG__?.playRetryLimit !== undefined && host.__XUEXITONG_CONFIG__?.maxRetries === undefined) configs.maxRetries = configs.playRetryLimit;
  const state = {
    alive: true, busy: false, timer: null, abort: null, requestTimer: null,
    destroyed: false, flow: initialFlow === 'answer-only' ? 'answer-only' : 'auto', answerScope: null, answerTabOpened: false,
    quiz: null, quizRetry: null, transition: null, video: null, playAttempts: 0,
    pageStarted: Date.now(), warned: false, message: '', status: 'starting',
    ready: mode === 'v3', lastProgress: Date.now(), lastTime: null, lastPlayAt: -Infinity, pendingTimers: new Set()
  };
  const visited = new WeakMap();
  const quizRetries = new WeakMap();
  const letters = 'ABCDEFGH';
  const questionSelector = '.TiMu,.question-item,[data-question-id],[data-question]';
  const scoreSelector = '.score,.mark_score,.mark_title,.totalScore,.resultScore,[data-quiz-complete],.Zy_mark,.achievement';
  const tabSelector = '[role="tab"],.tab,.tab-item,.tabItem,.ans-job-icon,.knowledgeTab,.tabtags,a,button,li';
  const dialogSelector = '[role="dialog"],[role="alertdialog"],.layui-layer-dialog,.dialog,.modal,.el-message-box,#workpop,#popcontent';
  const clean = value => String(value || '').replace(/\r/g, '').replace(/[\t\f\v ]+/g, ' ').replace(/ *\n */g, '\n').trim();
  const textOf = node => clean(node?.innerText ?? node?.textContent ?? '');
  const all = (root, selector) => Array.from(root.querySelectorAll(selector));

  function rendered(node, accessibilityHidden) {
    if (!node || node.isConnected === false) return false;
    for (let n = node; n && n.nodeType !== 9; n = n.parentElement) {
      if (n.hidden || (!accessibilityHidden && n.getAttribute?.('aria-hidden') === 'true')) return false;
      const view = n.ownerDocument?.defaultView || host;
      const style = view.getComputedStyle?.(n);
      if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return false;
    }
    return typeof node.getClientRects !== 'function' || node.getClientRects().length > 0;
  }
  function visible(node) { return rendered(node, false); }
  // The platform hides its painted option list from accessibility APIs.
  // CSS visibility and actual layout still determine whether choices can be clicked.
  function visibleOption(node) { return rendered(node, true); }
  function locationKey(url) {
    try {
      const u = new URL(url, here.href);
      return ['courseId','courseid','clazzid','clazzId','chapterId','chapterid','knowledgeid','knowledgeId','jobid','jobId','workId','workid','taskId','taskid']
        .map(key => u.searchParams.has(key) ? `${key}=${u.searchParams.get(key)}` : '').filter(Boolean).sort().join('&');
    } catch { return ''; }
  }
  function taskKey(doc) {
    const values = all(doc, 'input[name="chapterId"],input[name="knowledgeId"],input[name="jobid"],input[name="workId"],[data-current-task]')
      .map(e => `${e.name || 'task'}=${e.value || e.getAttribute('data-current-task') || ''}`).join('&');
    const active = all(host.document, '.posCatalog_active,[aria-current="true"]')
      .filter(visible).map(e => ['id', 'data-id', 'data-chapterid', 'data-knowledgeid', 'href'].map(k => e.getAttribute(k) || '').join(':')).join(';');
    return `${locationKey(here.href)}|${locationKey(doc.URL || '')}|${values}|${active}`;
  }
  function documents() {
    const found = []; const seen = new Set();
    function walk(doc, slot, frame = null, parent = null) {
      if (!doc || seen.has(doc)) return;
      const entry = { doc, slot, frame, parent, task: taskKey(doc) };
      seen.add(doc); found.push(entry);
      for (const child of all(doc, 'iframe,frame')) {
        if (!visible(child)) continue;
        try { walk(child.contentDocument, child, child, entry); } catch { /* Cross-origin frames are deliberately ignored. */ }
      }
    }
    walk(host.document, host.document);
    return found;
  }
  function diagnostic(message, level = 'log') {
    panel.update(answerCurrentQuiz, message, state.alive && state.flow === 'answer-only');
    if (state.message === message) return;
    state.message = message;
    host.console[level](`[学习助手] ${message}`);
  }
  function stop(reason = '已停止') {
    state.alive = false; state.status = 'stopped';
    videoQuizzes.stop();
    host.clearTimeout(state.timer); host.clearTimeout(state.requestTimer);
    state.timer = null; state.requestTimer = null;
    for (const timer of state.pendingTimers) host.clearTimeout(timer);
    state.pendingTimers.clear();
    state.abort?.abort(); state.abort = null;
    diagnostic(reason);
    return api;
  }
  function fail(message) { stop(message); }
  function deadline(start, description) {
    const elapsed = Date.now() - start;
    const end = Math.min(900000, Math.max(1, Number(configs.quizStopMs) || 900000));
    if (elapsed >= end) { fail(`${description}超时，已停止；未跳过任务`); return false; }
    if (elapsed >= Math.min(end, Number(configs.quizWarnMs) || 600000) && !state.warned) {
      state.warned = true; diagnostic(`${description}仍未完成，请检查页面`, 'warn');
    }
    return true;
  }
  function typeOf(box, title) {
    const marker = box.getAttribute('data-type') || title?.getAttribute('data-type') || textOf(title);
    return ['多选题', '单选题', '判断题'].find(t => marker.includes(t)) || '';
  }
  const optionContainerSelector = 'label,li,.answerBg,.option,[data-option]';
  function optionContainers(control, box) {
    const containers = [];
    for (let node = control.parentElement; node && node !== box && box.contains(node); node = node.parentElement) {
      if (node.matches(optionContainerSelector)) containers.push(node);
    }
    if (control.id) containers.push(...all(box, 'label').filter(label => label.getAttribute('for') === control.id));
    return [...new Set(containers)];
  }
  function controlLabel(control, box) {
    if (!control.matches('input') && control.matches('[role="radio"],[role="checkbox"],[aria-checked]')) return textOf(control);
    const containers = optionContainers(control, box);
    return textOf(containers.find(visibleOption) || containers[0]);
  }
  function optionTarget(control, box) {
    if (visibleOption(control)) return control;
    const rendered = node => visibleOption(node) ||
      ((node.ownerDocument?.defaultView || host).getComputedStyle?.(node)?.display === 'contents' && all(node, '*').some(visibleOption));
    const direct = optionContainers(control, box).find(rendered);
    if (direct) return direct;
    // Some skins keep native inputs in a hidden list and render a second list.
    // Require a unique full-label match inside this question; never click a
    // generic ancestor or choose between ambiguous duplicated labels.
    const key = value => clean(value).replace(/\s+/g, ' ').replace(/^([A-H])(?:[.、．:：)）]|\s)*\s*/i, '$1 ').trim();
    const wanted = key(controlLabel(control, box));
    if (!wanted) return null;
    const matches = all(box, optionContainerSelector).filter(node => !node.contains(control) && rendered(node) &&
      !all(node, 'input[type="radio"],input[type="checkbox"]').length && key(textOf(node)) === wanted);
    const leaves = matches.filter(node => !matches.some(other => other !== node && node.contains(other)));
    return leaves.length === 1 ? leaves[0] : null;
  }
  function extract(entry, allowRetry = false) {
    const everyBox = all(entry.doc, questionSelector);
    const boxes = everyBox.filter(visible);
    const outer = boxes.filter(box => !boxes.some(other => other !== box && other.contains(box)));
    if (!outer.length) return null;
    if (outer.length > 30) throw new Error('题目超过30道，已停止');
    const declared = textOf(entry.doc.body).match(/题量\s*[:：]\s*(\d+)/);
    if ((declared && Number(declared[1]) !== outer.length) || everyBox.some(box => !visible(box))) {
      const error = new Error('题目尚未全部显示，等待页面加载'); error.incomplete = true; throw error;
    }
    const disabled = control => control.disabled || control.getAttribute('aria-disabled') === 'true';
    const choices = outer.map(box => {
      const native = all(box, 'input[type="radio"],input[type="checkbox"]');
      const eligible = native.filter(control => optionContainers(control, box).length > 0);
      const semantic = all(box, '[role="radio"],[role="checkbox"],[aria-checked]').filter(control => !control.matches('input'));
      const controls = eligible.length ? eligible : semantic.filter(c => !semantic.some(other => other !== c && other.contains(c)));
      const other = all(box, 'textarea,input[type="text"],[contenteditable="true"]');
      return { box, native, controls, other };
    });
    function dump({ box, native, controls }, index, reason) {
      const describe = control => {
        const target = optionTarget(control, box);
        return {
          type: control.type || control.getAttribute('role') || control.tagName.toLowerCase(), id: control.id || '',
          disabled: Boolean(control.disabled), ariaDisabled: control.getAttribute('aria-disabled'), visible: visible(control),
          optionTarget: target ? { tag: target.tagName.toLowerCase(), id: target.id || '', visible: visible(target) } : null,
          text: Array.from(controlLabel(control, box) || textOf(control)).slice(0, 20).join(''), included: controls.includes(control),
          containers: optionContainers(control, box).slice(0, 6).map(node => ({
            tag: node.tagName.toLowerCase(), id: node.id || '', className: node.getAttribute('class') || '',
            hidden: Boolean(node.hidden), ariaHidden: node.getAttribute('aria-hidden'), visible: visible(node),
            display: (node.ownerDocument?.defaultView || host).getComputedStyle?.(node)?.display || '',
            visibility: (node.ownerDocument?.defaultView || host).getComputedStyle?.(node)?.visibility || ''
          }))
        };
      };
      host.console.warn('[学习助手] 测验提取诊断', JSON.stringify({
        questionIndex: index + 1, reason,
        controls: [...new Set([...native, ...controls])].map(describe),
        otherControls: all(box, 'textarea,input[type="text"],[contenteditable="true"]').map(describe)
      }));
    }
    const flattened = choices.flatMap(choice => choice.controls);
    const disabledChoice = choice => choice.controls.length + choice.other.length > 0 &&
      choice.controls.every(disabled) && choice.other.every(disabled);
    const readOnly = flattened.length > 0 && choices.every(disabledChoice);
    const activeRecord = state.quiz?.doc === entry.doc && state.quiz?.task === entry.task ? state.quiz : null;
    // Only a fully read-only quiz may use an existing result as completion.
    // Live questions beside an old score retain the existing fail-closed guard.
    const reviewOnly = choices.every(choice => disabledChoice(choice) || (!choice.controls.length && !choice.other.length &&
      (all(choice.box, 'li[role="option"]').length >= 2 || all(choice.box, '.newAnswerBx').some(result =>
        visible(result) && all(result, '.answerCon').some(node => visible(node) && textOf(node)) &&
        all(result, '.scoreNum').some(node => visible(node) && /^\d+(?:\.\d+)?$/.test(textOf(node))))))) && !submitControl(entry.doc);
    if ((readOnly || reviewOnly) && (completion(entry) || activeRecord?.submitted)) return null;
    const pending = quizRetries.get(entry.doc);
    const retried = pending?.task === entry.task;
    if (allowRetry && mode === 'console' && !activeRecord?.requested && !activeRecord?.submitted) {
      const retry = readOnly && all(entry.doc, 'button,a,[role="button"],input[type="button"],input[type="submit"]')
        .find(node => visible(node) && !disabled(node) && /^(?:重新作答|重做|继续作答)$/.test(textOf(node) || clean(node.value)));
      if (retry && !retried) {
        choices.forEach((choice, index) => dump(choice, index, '所有选项禁用，尝试进入重新作答状态'));
        quizRetries.set(entry.doc, { task: entry.task });
        retry.click();
        const error = new Error('已点击重新作答，等待可操作选项'); error.incomplete = true; throw error;
      }
      if (retried && choices.some(choice => choice.controls.length < 2 || choice.controls.some(c => disabled(c) || !optionTarget(c, choice.box)))) {
        const error = new Error('重新作答尚未就绪，等待页面加载'); error.incomplete = true; throw error;
      }
    }
    const rows = choices.map((choice, i) => {
      const { box, controls } = choice;
      const reject = (message, retryable = false) => { dump(choice, i, message); const error = new Error(message); error.retryable = retryable; throw error; };
      const title = all(box, '.Zy_TItle,.question-title,.stem,[data-stem],legend').find(visible);
      const type = typeOf(box, title);
      if (!type || !title) reject('无法识别题型或题干（仅支持单选、多选和判断题），已停止');
      const question = textOf(title).replace(/^\s*\d+\s*[.、．)）]\s*/, '')
        .replace(/^[（(【\[]?\s*(?:单选题|多选题|判断题)\s*[）)】\]]?\s*[:：]?\s*/, '').trim();
      if (controls.length < 2 || controls.length > 8 || controls.some(c => !optionTarget(c, box) || disabled(c))) reject('选项不完整或不可操作', true);
      if (controls.some((c, index) => {
        const role = c.type || c.getAttribute('role');
        return (role && role !== (type === '多选题' ? 'checkbox' : 'radio')) ||
          (!c.type && !['true','false'].includes(c.getAttribute('aria-checked')) && !legacyChoice(c, box, letters[index]));
      })) reject('选项类型或选中状态不明确，已停止');
      if (type === '判断题' && controls.length !== 2) reject('判断题必须恰有两个选项');
      const options = controls.map((control, index) => ({ letter: letters[index], text: controlLabel(control, box).replace(/^[A-H](?:\s*[.、．:：)）]\s*|\s*\n\s*)/i, '').trim() }));
      if (!question || question.length > 500 || options.some(o => !o.text || o.text.length > 500)) reject('题干或选项超出支持范围');
      assertCompleteAnswerText([title,...controls.map(c=>optionTarget(c,box))],[question,...options.map(o=>o.text)]);
      return { box, controls, targets: controls.map(c => optionTarget(c, box)), wire: { id: i + 1, type, question, options } };
    });
    if (retried) quizRetries.delete(entry.doc);
    return { entry, rows, signature: JSON.stringify(rows.map(r => r.wire)) };
  }
  function unchanged(snapshot) {
    if (!state.alive) return false;
    const entry = documents().find(d => d.doc === snapshot.entry.doc && d.slot === snapshot.entry.slot);
    if (!entry || entry.task !== snapshot.entry.task) return false;
    try {
      const current = extract(entry);
      return current?.signature === snapshot.signature && current.rows.length === snapshot.rows.length &&
        current.rows.every((row, i) => row.box === snapshot.rows[i].box && row.controls.every((c, j) => c === snapshot.rows[i].controls[j] && row.targets[j] === snapshot.rows[i].targets[j]));
    } catch { return false; }
  }
  function gradeSnapshot(entry) {
    return new Map(all(entry.doc, scoreSelector).map(node => [node, { text: textOf(node), visible: visible(node) }]));
  }
  function completion(entry, before = null) {
    return all(entry.doc, scoreSelector).some(node => {
      if (!visible(node)) return false;
      const text = textOf(node);
      const valid = node.getAttribute('data-quiz-complete') === 'true' || (!/尚未|未公布|待批|待评|未完成|未提交|正在/.test(text) &&
        (/(?:本次成绩|得分|成绩)\s*[:：]?\s*\d+(?:\.\d+)?(?:\s*分)?/.test(text) || /^(?:(?:章节)?测验\s*)?已完成$/.test(text)));
      if (!valid) return false;
      if (!before) return true;
      const prior = before.get(node);
      return !prior || !prior.visible || prior.text !== text;
    });
  }
  function explicitCompletion(entry) {
    return all(entry.doc, '[data-quiz-complete="true"]').some(visible);
  }
  function quizEntry(entries) {
    for (const entry of [...entries].reverse()) {
      if (all(entry.doc, questionSelector).some(visible)) return entry;
    }
    if (state.quiz) {
      return entries.find(e => e.slot === state.quiz.slot && e.task === state.quiz.task && completion(e)) || null;
    }
    return entries.find(e => /(?:work|quiz|exam)/i.test(e.doc.URL || '') && completion(e)) || null;
  }
  function courseScope() {
    const url = new URL(here.href);
    const keys = ['courseId','courseid','clazzid','clazzId','chapterId','chapterid','knowledgeid','knowledgeId'];
    const location = keys.filter(key => url.searchParams.has(key)).map(key => `${key}=${url.searchParams.get(key)}`).join('&');
    const anchors = all(host.document, '.posCatalog_active,[aria-current="true"]').filter(node => visible(node) &&
      (node.matches('.posCatalog_active') || node.closest('#coursetree,.chapter_item,[data-task-id]')));
    const active = anchors.map(node => ['id','data-id','data-chapterid','data-knowledgeid','href'].map(key => node.getAttribute(key) || '').join(':')).join(';');
    return { key: `${location}|${active}`, anchors };
  }
  function sameCourseScope() {
    const current = courseScope(), before = state.answerScope;
    return before && current.key === before.key && current.anchors.length === before.anchors.length && current.anchors.every((node, i) => node === before.anchors[i]);
  }
  function currentTab(entries, target = 'quiz') {
    const expected = '[role="tab"],.tab,.tab-item,.tabItem,.knowledgeTab,.tabtags,.prev_white';
    const matches = node => (target === 'quiz' ? /^(?:\d+\s*)?(?:章节测验|测验)(?:\s*\(.*\))?$/ : /^(?:\d+\s*)?视频$/).test(textOf(node));
    for (const selector of [expected, tabSelector]) {
      for (const entry of entries) {
        const match = all(entry.doc, selector).find(e => visible(e) && matches(e));
        if (match) return match;
      }
    }
    return null;
  }
  function emptyChapter(entries) {
    // Empty is an explicit page state, never inferred just from a missing player.
    const ignored = '#xuexitong-independent-status,#coursetree,.posCatalog_select,.chapter_item,[data-task-id],nav,aside,[role="navigation"],.discussion,.discuss,.notes,.noteList';
    for (const entry of entries) {
      if (entry.doc.readyState !== 'complete') return null;
      for (const frame of all(entry.doc, 'iframe,frame').filter(visible)) {
        const child = entries.find(e => e.frame === frame);
        if (!child || !child.doc.URL || /^about:blank(?:[?#]|$)/.test(child.doc.URL)) return null;
      }
      if (all(entry.doc, `video,audio,object,embed,canvas,${questionSelector}`).some(visible)) return null;
      if (all(entry.doc, '[aria-busy="true"],[data-loading="true"],.loading,.loading-mask,.el-loading-mask').some(visible)) return null;
      if (all(entry.doc, 'p,span,div').some(node => visible(node) && !node.children.length && !node.closest(ignored) && /加载失败|加载错误|网络异常|正在加载|加载中|请先登录|访问受限|权限不足/.test(textOf(node)))) return null;
    }
    if (currentTab(entries) || currentTab(entries, 'video')) return null;
    const active = [...new Set(all(host.document, '.posCatalog_active,[aria-current="true"]').filter(node => visible(node) &&
      (node.matches('.posCatalog_active') || node.closest('#coursetree,.chapter_item,[data-task-id]')))
      .map(node => node.closest('.posCatalog_select,.chapter_item,[data-task-id]') || node))];
    if (active.length > 1) return null;
    const row = active[0] || null;
    let counts = row ? all(row, '.catalog_points,[data-task-count],.jobCount,.taskCount').filter(visible) : [];
    if (row && !counts.length) counts = all(row, 'span,em,i,b').filter(node => visible(node) && !node.children.length && /^\d+$/.test(textOf(node)));
    const values = counts.map(node => node.getAttribute('data-task-count') ?? textOf(node));
    if (values.some(value => !/^0$/.test(value.trim()))) return null;
    for (const entry of [...entries].reverse()) {
      const marker = all(entry.doc, 'div,p,span').reverse().find(node => visible(node) && !node.closest(ignored) && /^(?:暂无内容|本章节暂无内容|暂无学习内容)$/.test(textOf(node)));
      if (!marker) continue;
      return {doc:entry.doc,marker,task:`${taskKey(host.document)}|${entry.task}`,active:row,counts:values.join('|'),
        heading:all(entry.doc, 'h1,h2,h3').filter(node => visible(node) && !node.closest(ignored)).map(textOf).join('|')};
    }
    return null;
  }
  function sameEmpty(before, after) {
    return before && after && before.doc === after.doc && before.marker === after.marker && before.task === after.task && before.active === after.active && before.heading === after.heading && before.counts === after.counts;
  }
  function content(entries) {
    const empty = emptyChapter(entries);
    return entries.map(e => ({ doc: e.doc, slot: e.slot, task: e.task,
      empty:empty?.doc === e.doc ? empty : null,
      video: all(e.doc, 'video').filter(visible),
      questions: all(e.doc, questionSelector).filter(visible).map(q => ({ node: q, text: textOf(q) })) }));
  }
  function fresh(before, after) {
    return after.some(now => {
      const old = before.find(e => e.slot === now.slot);
      if (!old) return now.video.length > 0 || now.questions.length > 0 || Boolean(now.empty);
      if (now.doc !== old.doc) return now.video.length > 0 || now.questions.length > 0 || Boolean(now.empty) || /work|quiz/i.test(now.doc.URL || '');
      if (now.empty && (!old.empty || now.empty.marker !== old.empty.marker ||
          (now.empty.task !== old.empty.task && now.empty.active !== old.empty.active && now.empty.heading !== old.empty.heading))) return true;
      if (now.video.some(v => !old.video.includes(v))) return true;
      return now.questions.some(q => !old.questions.some(prior => prior.node === q.node && prior.text === q.text));
    });
  }
  function transition(node, entries, kind) {
    if (!state.alive || state.transition || !visible(node) || node.disabled) return false;
    state.transition = { before: content(entries), start: Date.now(), kind };
    node.click(); diagnostic(kind === 'quiz' ? '已打开章节测验，等待当前内容' : '已请求下一任务，等待新内容');
    return true;
  }
  function nextControl(entries) {
    for (const entry of entries) {
      const button = all(entry.doc, '#prevNextFocusNext,#right1,.nextChapter').find(e => visible(e) && !e.disabled && e.getAttribute('aria-disabled') !== 'true');
      if (button) return button;
      const labelled = all(entry.doc, 'a,button,[role="button"]').filter(node => visible(node) && !node.disabled && node.getAttribute('aria-disabled') !== 'true' &&
        !/(?:^|\s)disabled(?:\s|$)/.test(node.getAttribute('class') || '') && !node.closest('#xuexitong-independent-status,#coursetree') && textOf(node).replace(/\s+/g, '') === '下一节');
      if (labelled.length === 1) return labelled[0];
      const tree = entry.doc.querySelector('#coursetree');
      if (tree) {
        const tasks = all(tree, '.posCatalog_select').filter(e => !e.closest('.firstLayer'));
        const current = tasks.findIndex(e => e.matches('.posCatalog_active') || e.querySelector('.posCatalog_active') || e.getAttribute('aria-current') === 'true');
        if (current >= 0 && current + 1 < tasks.length) {
          const next = tasks[current + 1]; const target = all(next, '.posCatalog_name').find(visible);
          if (target && !target.disabled) {
            const href = target.getAttribute('href');
            if (!href) return target;
            try {
              const destination = new URL(href, here.href); const currentCourse = new URL(here.href).searchParams.get('courseId');
              if (/(^|\.)chaoxing\.com$/i.test(destination.hostname) && /studentstudy/.test(destination.pathname) && (!currentCourse || destination.searchParams.get('courseId') === currentCourse)) return target;
            } catch { /* Reject malformed task links. */ }
          }
        }
      }
      const links = all(entry.doc, '.posCatalog_name,.chapter_item,[data-task-id]');
      const index = links.findIndex(e => e.getAttribute('aria-current') === 'true' || /(?:^|\s)(?:current|active|posCatalog_active)(?:\s|$)/.test(e.getAttribute('class') || '') || e.closest('.posCatalog_active'));
      if (index < 0 || index + 1 >= links.length) continue;
      const candidate = links[index + 1];
      const link = candidate.matches('a') ? candidate : candidate.querySelector('a');
      if (!link || !visible(link)) continue;
      try {
        const dest = new URL(link.getAttribute('href'), here.href);
        const course = new URL(here.href).searchParams.get('courseId');
        if (/(^|\.)chaoxing\.com$/i.test(dest.hostname) && /studentstudy/.test(dest.pathname) &&
            (!course || dest.searchParams.get('courseId') === course)) return link;
      } catch { /* Unknown outline destinations require manual navigation. */ }
    }
    return null;
  }
  function advanceTask(entries) {
    if (state.transition) return;
    const key = `${taskKey(host.document)}|${state.quiz?.signature || ''}`;
    const anchor = state.quiz?.doc || state.video || host.document;
    if (visited.get(anchor) === key) return;
    const next = nextControl(entries);
    if (!next) { diagnostic('未找到可确认的下一任务，请手动检查课程目录'); return; }
    visited.set(anchor, key); transition(next, entries, 'next');
  }
  function validateAnswers(payload, snapshot) {
    if (!payload || !Array.isArray(payload.answers) || payload.answers.length !== snapshot.rows.length) throw new Error('答案数量不匹配');
    const answers = new Map();
    for (const answer of payload.answers) {
      if (!Number.isInteger(answer.id) || answers.has(answer.id)) throw new Error('答案题号重复或无效');
      const row = snapshot.rows[answer.id - 1];
      if (!row || !Array.isArray(answer.letters) || !answer.letters.length || new Set(answer.letters).size !== answer.letters.length ||
          answer.letters.some(letter => !row.wire.options.some(o => o.letter === letter)) ||
          (row.wire.type !== '多选题' && answer.letters.length !== 1)) throw new Error('答案选项无效');
      answers.set(answer.id, answer.letters);
    }
    return answers;
  }
  function legacyChoice(control, box, expectedLetter = null) {
    if (!control.matches('li[role="radio"],li[role="checkbox"]')) return null;
    const qid = control.getAttribute('qid');
    if (!/^\d+$/.test(qid || '')) return null;
    const multiple = control.getAttribute('role') === 'checkbox' && control.getAttribute('qtype') === '1';
    const markers = all(control, '.num_option,.num_option_dx').filter(node =>
      (node.matches('.num_option') && node.getAttribute('name') === `answer${qid}`) ||
      (multiple && node.matches('.num_option_dx') && node.getAttribute('name') === `answercheck${qid}`));
    if (markers.length !== 1) return null;
    const marker = markers[0];
    const storedValue = marker?.getAttribute('data');
    const judgment = control.getAttribute('qtype') === '3';
    const letter = judgment ? storedValue === 'true' ? 'A' : storedValue === 'false' ? 'B' : null : storedValue;
    const input = all(box, 'input[type="hidden"]').filter(node => node.name === `answer${qid}`);
    if (!/^[A-H]$/.test(letter || '') || (expectedLetter && letter !== expectedLetter) || input.length !== 1 ||
        !(judgment ? /^(?:true|false)?$/ : /^[A-H,\s]*$/).test(input[0].value || '')) return null;
    return { input: input[0], letter, storedValue, judgment };
  }
  function selected(control) {
    if (control.matches('input')) return control.checked === true;
    const legacy = legacyChoice(control, control.closest(questionSelector));
    return legacy ? legacy.judgment ? legacy.input.value === legacy.storedValue : legacy.input.value.includes(legacy.letter) : control.getAttribute('aria-checked') === 'true';
  }
  function applyAnswers(snapshot, answers) {
    for (const row of snapshot.rows) {
      const desired = answers.get(row.wire.id);
      for (let i = 0; i < row.controls.length; i++) {
        if (!unchanged(snapshot) || completion(snapshot.entry)) throw new Error('题目、任务或成绩状态已改变，已取消旧答案');
        const control = row.controls[i]; const want = desired.includes(letters[i]);
        if (selected(control) === want) continue;
        if (row.wire.type !== '多选题' && !want) continue;
        row.targets[i].click();
      }
    }
    if (!unchanged(snapshot) || completion(snapshot.entry)) throw new Error('题目或成绩状态已改变，已取消提交');
    for (const row of snapshot.rows) {
      if (row.controls.some((c, i) => selected(c) !== answers.get(row.wire.id).includes(letters[i]))) throw new Error('页面未确认选中状态，已取消提交');
    }
  }
  function submitControl(doc) {
    return all(doc, 'button,input[type="submit"],a,[role="button"]')
      .find(node => visible(node) && !node.disabled && /^(?:提交|提交答案|交卷|提交作业|提交测验)$/.test(textOf(node) || node.value));
  }
  function retryQuiz(entry, message) {
    const record = state.quiz?.doc === entry.doc && state.quiz?.task === entry.task ? state.quiz : null;
    if (!state.alive || record?.submitted || record?.answerApplied) return false;
    const limit = Math.min(5, Math.max(0, Math.floor(Number(configs.quizRetryLimit) || 0)));
    let retry = state.quizRetry;
    if (!retry || retry.doc !== entry.doc || retry.task !== entry.task) retry = { doc: entry.doc, task: entry.task, attempts: 0, nextAt: 0 };
    if (record?.signature && !retry.signature) retry.signature = record.signature;
    if (retry.attempts >= limit) return false;
    retry.attempts++;
    const wait = Math.min(30000, Math.max(1, Number(configs.quizRetryDelayMs) || 3000));
    retry.nextAt = Date.now() + wait; state.quizRetry = retry;
    if (record) record.requested = false;
    diagnostic(`${message}；${wait}毫秒后自动重试（${retry.attempts}/${limit}）`, 'warn');
    return true;
  }
  async function answerQuiz(record, snapshot) {
    record.requested = true;
    state.abort = new host.AbortController();
    const controller = state.abort;
    const timeout = new Promise((resolve, reject) => {
      state.requestTimer = host.setTimeout(() => {
        const error = new Error('答题请求超时，未提交'); error.retryable = true;
        controller.abort(); reject(error);
      }, Math.min(900000, Math.max(1, Number(configs.requestTimeoutMs) || 900000)));
    });
    try {
      const request = async () => {
        let response;
        try {
          response = await host.fetch('http://127.0.0.1:37841/answer', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Xuexitong-Token': token },
            body: JSON.stringify({ questions: snapshot.rows.map(r => r.wire) }), signal: controller.signal
          });
        } catch (error) { const failure = new Error('无法连接本地答题服务'); failure.retryable = true; throw failure; }
        if (!response.ok || response.status !== 200) {
          const error = new Error(`本地答题服务返回状态 ${Number(response.status) || '未知'}`);
          error.retryable = [408, 425, 429].includes(response.status) || (response.status >= 500 && response.status <= 599); throw error;
        }
        try { record.requestId=response.headers?.get?.('X-Xuexitong-Request-Id')||null; } catch { /* Optional diagnostic header. */ }
        try { return await response.json(); }
        catch { const error = new Error('答题响应不是有效JSON'); error.retryable = true; throw error; }
      };
      const payload = await Promise.race([request(), timeout]);
      if (!state.alive) return;
      if (!unchanged(snapshot)) throw new Error('请求期间题目或任务已改变，已取消');
      const answers = validateAnswers(payload, snapshot);
      record.answerApplied = true;
      applyAnswers(snapshot, answers);
      if(host.__WB_ANSWER_DIAGNOSTICS__===true)void traceAnswerApplication(record.requestId,snapshot.rows.map(row=>({wire:row.wire,returned:answers.get(row.wire.id),observed:row.controls.map((control,i)=>{const legacy=legacyChoice(control,row.box,letters[i]);return {letter:letters[i],selected:selected(control),storedValue:legacy?.storedValue||legacy?.letter||control.value||null};})})));
      const submit = submitControl(snapshot.entry.doc);
      if (!submit || !unchanged(snapshot) || completion(snapshot.entry)) throw new Error('当前测验或成绩状态不允许提交');
      record.dialogsBefore = new Set(submissionDialogs(snapshot.entry).filter(visible));
      record.gradesBeforeSubmit = gradeSnapshot(snapshot.entry);
      record.submitted = true; record.submitTime = Date.now(); submit.click();
      state.quizRetry = null;
      diagnostic('答案已选择并提交，等待当前测验确认和成绩');
    } catch (error) {
      if (state.alive) {
        const message = error instanceof Error ? error.message : '答题请求失败';
        if (!error?.retryable || !unchanged(snapshot) || !retryQuiz(snapshot.entry, message)) fail(message);
      }
    } finally {
      host.clearTimeout(state.requestTimer); state.requestTimer = null; state.abort = null;
    }
  }
  function submissionDialogs(entry) {
    const nodes = [];
    // The platform places work confirmations in the parent course document.
    // Only this quiz's own document and ancestor chain can supply a dialog.
    for (let current = entry; current; current = current.parent) nodes.push(...all(current.doc, current === entry ? dialogSelector : '#workpop'));
    return nodes;
  }
  function confirmSubmission(record, entry) {
    if (!record.submitted || record.confirmed || entry.doc !== record.doc || entry.task !== record.task || !unchanged(record.snapshot)) return;
    const dialog = submissionDialogs(entry)
      .find(d => visible(d) && !record.dialogsBefore.has(d) && /提交|交卷|未作答|请选择|请作答|答完/.test(textOf(d)) &&
        (d.ownerDocument === entry.doc || (d.id === 'workpop' && all(d, '#popcontent').some(prompt =>
          visible(prompt) && /^(?:确认|确定)提交(?:答案|作业|测验|试卷)?[?？]?$/.test(textOf(prompt))))));
    if (!dialog) return;
    if (/未作答|请选择|请作答|答完/.test(textOf(dialog))) { fail('页面提示仍有未完成题目，已停止确认'); return; }
    let button = all(dialog, 'button,a,[role="button"],#popok').find(e => visible(e) && /^(?:确定|确认|提交|确认提交)$/.test(textOf(e)));
    if (!button && dialog.id === 'popcontent' && dialog.parentElement && !dialog.parentElement.matches('body,html')) {
      button = Array.from(dialog.parentElement.children).find(e => e.id === 'popok' && visible(e) && /^(?:确定|确认|提交|确认提交)$/.test(textOf(e)));
    }
    if (button && unchanged(record.snapshot)) { record.confirmed = true; button.click(); }
  }
  async function handleQuiz(entry, entries) {
    if (state.quizRetry && (state.quizRetry.doc !== entry.doc || state.quizRetry.task !== entry.task)) state.quizRetry = null;
    if (state.quizRetry && Date.now() < state.quizRetry.nextAt) return;
    let snapshot;
    try { snapshot = extract(entry, true); state.loading = null; }
    catch (error) {
      if (!error.incomplete) { if (!error.retryable || state.quiz?.requested || !retryQuiz(entry, error.message)) fail(error.message); return; }
      if (!state.loading || state.loading.doc !== entry.doc || state.loading.task !== entry.task) state.loading = { doc: entry.doc, task: entry.task, start: Date.now() };
      if (Date.now() - state.loading.start >= Math.min(120000, Math.max(1, Number(configs.quizLoadTimeoutMs) || 120000))) { fail('完整题目加载超时，已停止；未提交或跳过'); return; }
      const boxes = all(entry.doc, questionSelector).filter(visible);
      boxes[boxes.length - 1]?.scrollIntoView?.({ block: 'end', behavior: 'instant' });
      diagnostic('题目尚未全部显示，正在等待完整测验'); return;
    }
    if (snapshot && state.quizRetry?.signature && snapshot.signature !== state.quizRetry.signature) {
      fail('重试等待期间题目内容已改变，已取消自动答题'); return;
    }
    const existing = state.quiz;
    const continuing = existing && existing.slot === entry.slot && existing.task === entry.task;
    if (!continuing) {
      state.quiz = { doc: entry.doc, slot: entry.slot, task: entry.task, start: Date.now(), signature: snapshot?.signature || '', snapshot, requested: false, submitted: false, content: content(entries), videoNodes: entries.flatMap(e => all(e.doc, 'video')), gradesAtEntry: gradeSnapshot(entry) };
      state.warned = false;
    } else if (snapshot && existing.snapshot && (snapshot.signature !== existing.signature || entry.doc !== existing.doc)) {
      if (existing.requested || existing.submitted) { fail('测验内容在处理中改变，请重新运行确认当前题目'); return; }
      existing.snapshot = snapshot; existing.signature = snapshot.signature; existing.doc = entry.doc;
    }
    const record = state.quiz;
    if (snapshot && !record.requested && !record.submitted) {
      record.snapshot = snapshot; record.signature = snapshot.signature; record.doc = entry.doc;
    }
    // A score must be on the current visible task, never a hidden historical frame.
    if (completion(entry)) {
      if (snapshot && !record.submitted && !explicitCompletion(entry) && !completion(entry, record.gradesAtEntry)) {
        diagnostic('当前页同时显示题目和旧成绩，等待明确完成状态'); deadline(record.start, '测验状态确认'); return;
      }
      if (!record.submitted || completion(entry, record.gradesBeforeSubmit)) {
        record.done = true;
        if (state.flow === 'answer-only') stop('当前测验已完成，已停留在本节');
        else { diagnostic('当前测验已显示新的成绩，准备下一任务'); advanceTask(entries); }
        return;
      }
    }
    if (!deadline(record.start, '测验等待')) return;
    confirmSubmission(record, entry);
    if (mode === 'console' && snapshot && !record.requested) await answerQuiz(record, snapshot);
    else diagnostic(record.submitted ? '等待当前测验成绩' : '等待手动完成当前测验');
  }
  async function playVideo(video) {
    if (state.video !== video) { state.video = video; state.playAttempts = 0; state.lastTime = null; state.lastProgress = Date.now(); state.lastPlayAt = -Infinity; }
    if (configs.autoplay === false) return;
    if (configs.playbackRate !== null && Number.isFinite(Number(configs.playbackRate))) video.playbackRate = Math.max(0.25, Math.min(4, Number(configs.playbackRate)));
    if (state.lastTime !== video.currentTime) {
      if (Number.isFinite(state.lastTime) && Number.isFinite(video.currentTime) && video.currentTime > state.lastTime) state.playAttempts = 0;
      state.lastTime = video.currentTime; state.lastProgress = Date.now();
    }
    const stalled = Date.now() - state.lastProgress >= Math.max(1, Number(configs.guardNoProgressMs) || 7000);
    if ((!video.paused && !stalled) || video.ended) return;
    if (Date.now() - state.lastPlayAt < Math.max(1, Number(configs.guardResumeCooldownMs) || 1500)) return;
    if (state.playAttempts >= Math.max(1, Number(configs.maxRetries ?? configs.playRetryLimit) || 10)) { fail('视频播放重试次数已用尽，请手动处理播放限制'); return; }
    state.playAttempts++;
    state.lastPlayAt = Date.now();
    const task = taskKey(video.ownerDocument);
    const stillCurrent = () => state.alive && state.flow === 'auto' && state.video === video && taskKey(video.ownerDocument) === task && visible(video) && documents().some(e => all(e.doc, 'video').includes(video));
    const boundedPlay = async () => {
      let timer;
      try {
        await Promise.race([Promise.resolve(video.play()), new Promise((resolve, reject) => {
          timer = host.setTimeout(() => reject(new Error('play timeout')), Math.max(1, Number(configs.retryInterval) || 2000));
          state.pendingTimers.add(timer);
        })]);
      } finally { host.clearTimeout(timer); state.pendingTimers.delete(timer); }
    };
    try { await boundedPlay(); }
    catch {
      if (!stillCurrent()) return;
      video.muted = true;
      try { await boundedPlay(); } catch { if (stillCurrent()) diagnostic('浏览器阻止播放，将在有限次数内重试', 'warn'); }
    }
    if (stillCurrent()) state.lastProgress = Date.now();
  }
  async function reconcile() {
    if (!state.alive || !state.ready || state.busy) return;
    state.busy = true;
    try {
      if (state.flow === 'answer-only' && !sameCourseScope()) {
        fail('单独答题期间章节已改变，已取消；请在目标章节重新开始'); return;
      }
      const entries = documents();
      if (await videoQuizzes.reconcile(entries)) return;
      const empty = emptyChapter(entries);
      if (!sameEmpty(state.empty?.proof, empty)) state.empty = empty ? {proof:empty,start:Date.now()} : null;
      if (state.transition) {
        if (!fresh(state.transition.before, content(entries))) {
          if (Date.now() - state.transition.start >= Math.max(1, Number(configs.transitionTimeoutMs) || 45000)) fail('任务切换后未发现新内容，已停止；未跳过任务');
          return;
        }
        state.transition = null; state.quiz = null; state.video = null; state.playAttempts = 0; state.pageStarted = Date.now(); state.warned = false;
      }
      const entry = quizEntry(entries);
      if (entry) { await handleQuiz(entry, entries); return; }
      if (state.flow === 'answer-only') {
        if (state.answerTabOpened) {
          if (Date.now() - state.pageStarted >= Math.min(120000, Math.max(1, Number(configs.quizLoadTimeoutMs) || 120000))) {
            fail('当前章节测验加载超时，未答题或切换章节'); return;
          }
          diagnostic('正在等待当前章节测验加载'); return;
        }
        const tab = currentTab(entries);
        if (!tab || !transition(tab, entries, 'quiz')) { fail('未找到可打开的当前章节测验，请打开测验后再点一键开始做题'); return; }
        state.answerTabOpened = true; return;
      }
      if (state.quiz && !state.quiz.done) {
        const freshPlayer = entries.some(e => {
          let course = e;
          while (course && course.slot !== state.quiz.slot) course = course.parent;
          return course && course.doc !== state.quiz.doc && course.task !== state.quiz.task &&
            all(e.doc, 'video').some(v => visible(v) && !state.quiz.videoNodes.includes(v));
        });
        if (freshPlayer && fresh(state.quiz.content, content(entries))) {
          state.quiz = null; state.video = null; state.pageStarted = Date.now(); state.warned = false;
          diagnostic('检测到手动切换的新任务，恢复当前视频');
        } else { deadline(state.quiz.start, '测验等待'); return; }
      }
      const video = entries.flatMap(e => all(e.doc, 'video')).find(visible);
      if (video) {
        if (video.ended) {
          const tab = currentTab(entries);
          if (tab) transition(tab, entries, 'quiz'); else advanceTask(entries);
        } else { diagnostic('正在播放当前视频'); await playVideo(video); }
        return;
      }
      if (!deadline(state.pageStarted, '当前任务识别')) return;
      const videoTab = currentTab(entries, 'video');
      if (videoTab) { transition(videoTab, entries, 'video'); return; }
      if (state.empty) {
        const settle = Math.max(1, Number(configs.emptyChapterSettleMs) || 5000);
        if (Date.now() - state.empty.start < settle) { diagnostic('当前章节显示暂无内容，正在确认加载和任务状态'); return; }
        if (!state.empty.confirmed) { state.empty.confirmed = true; diagnostic('已确认当前章节暂无内容，继续下一节'); }
        advanceTask(entries); return;
      }
      diagnostic('未识别可播放视频或当前测验，请检查页面；任务保持等待');
    } catch (error) { fail(error instanceof Error ? error.message : '页面处理失败'); }
    finally { state.busy = false; }
  }
  function schedule() {
    if (!state.alive || state.timer !== null) return;
    state.timer = host.setTimeout(async () => {
      state.timer = null; await reconcile(); schedule();
    }, Math.max(1, Number(configs.tickMs) || 1000));
  }
  function run(overrides) {
    if (overrides && typeof overrides === 'object') Object.assign(configs, overrides);
    if (!state.alive) return api;
    schedule(); return api;
  }
  function answerCurrentQuiz() {
    if (mode !== 'console' || state.destroyed || host.app !== api) return api;
    if (panel.selectedMode !== 'course') { diagnostic('请切换到章节测验模式'); return api; }
    if (state.alive && state.flow === 'answer-only') return api;
    if (!state.alive) return createCourseController(mode, token, 'answer-only');
    if (state.transition?.kind === 'next') { diagnostic('任务正在切换，请加载完成后再点一键开始做题'); return api; }
    state.flow = 'answer-only'; state.answerScope = courseScope(); state.answerTabOpened = false;
    state.pageStarted = Date.now(); state.warned = false;
    diagnostic('正在单独处理当前章节测验，完成后停留');
    return run();
  }
  function restartCurrent() {
    if (state.destroyed || host.app !== api || !videoQuizzes.canRestart || (state.quiz?.submitted && !state.quiz.done)) return api;
    return createCourseController(mode, token, state.flow);
  }
  const videoQuizzes = createVideoQuizAdapter({mode,token,configs,dom:{all,visible,visibleOption,optionTarget,controlLabel},readEntries:documents,taskKey,
    isAlive:()=>state.alive,onMessage:diagnostic,onFailure:fail,decodeAnswers:validateAnswers,onResume:playVideo,
    onComplete:()=>{state.playAttempts=0;state.lastProgress=Date.now();state.lastTime=null;if(state.flow==='answer-only')stop('当前视频弹题已完成，已停留在本节');}});
  const onHide = () => { state.destroyed = true; stop('页面已离开，已取消所有工作'); panel.release(answerCurrentQuiz); };
  const api = {
    configs, get status() { return state.status; }, get message() { return state.message; },
    inspectQuiz() { const entries=documents();try{const popup=videoQuizzes.inspect(entries);if(popup)return popup;}catch(error){return {error:error.message};}const entry = quizEntry(entries); if (!entry) return null; try { const snapshot = extract(entry); return snapshot?.rows.map(row => row.wire) || []; } catch (error) { return { error: error.message }; } },
    run, play: run, answerCurrentQuiz, restart:restartCurrent,
    nextUnit() { if (state.alive) { reconcile(); schedule(); } return api; },
    stop,
    destroy() { state.destroyed = true; stop('控制器已替换或销毁'); host.removeEventListener('pagehide', onHide); panel.release(answerCurrentQuiz); }
  };
  if (mode === 'console') { host.__WB_DRIVER = 'console'; host.__xuexitongConsoleDeepSeek = api; }
  else host.__xuexitongPlayerV3 = api;
  host.app = api;
  host.addEventListener('pagehide', onHide);
  const panel = installStatusPanel({withAnswer:mode === 'console'});
  panel.bind(answerCurrentQuiz, {mode:'course',onModeChange:()=>stop('已切换答题模式'),onRestart:restartCurrent,
    canRestart:()=>!state.destroyed && (!state.alive || state.ready) && videoQuizzes.canRestart && !(state.quiz?.submitted && !state.quiz.done)});
  if (state.flow === 'answer-only') state.answerScope = courseScope();
  diagnostic('控制器已启动');
  if (mode === 'console') {
    if (!token || /^__.*__$/.test(token)) { stop('请通过本地服务注入有效会话令牌'); return api; }
    state.abort = new host.AbortController();
    state.requestTimer = host.setTimeout(() => fail('本地服务健康检查超时'), 5000);
    host.fetch('http://127.0.0.1:37841/health', { method: 'GET', headers: { 'X-Xuexitong-Token': token }, signal: state.abort.signal })
      .then(response => {
        if (!state.alive) return;
        if (!response.ok || response.status !== 200) { fail('本地服务健康检查失败'); return; }
        host.clearTimeout(state.requestTimer); state.requestTimer = null; state.abort = null;
        state.ready = true; state.status = 'running'; panel.update(answerCurrentQuiz,state.message,state.flow === 'answer-only'); run();
      }).catch(() => { if (state.alive) fail('无法连接本地答题服务'); });
    return api;
  }
  state.status = 'running';
  return run();
}

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
    assertCompleteAnswerText([title,...nodes.map(node=>node.querySelector('.answer_p'))],[question,...choices.map(c=>c.text)]);
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
          try{state.requestId=response.headers?.get?.('X-Xuexitong-Request-Id')||null;}catch{}
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
      if(host.__WB_ANSWER_DIAGNOSTICS__===true)void traceAnswerApplication(state.requestId,[{wire:s.wire,returned:picked,observed:s.choices.map(c=>({letter:c.letter,selected:s.selected().has(c.value),storedValue:c.value}))}]);
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
  function restart(){if(state.destroyed||host.app!==api)return api;return createManualExamController(token);}
  const onHide=()=>{
    state.destroyed=true;state.active=false;state.generation++;
    host.clearTimeout(state.timer);host.clearTimeout(state.requestTimer);state.controller?.abort();panel.release(toggle);
  };
  const api={get status(){return state.status;},get message(){return state.message;},answerCurrentQuiz:toggle,run:start,stop,restart,
    inspectQuiz(){try{return [snapshot().wire];}catch(error){return {error:error.message};}},
    destroy(){stop('答题控制器已替换');state.destroyed=true;host.removeEventListener('pagehide',onHide);panel.release(toggle);}};
  host.__WB_DRIVER='console';host.__xuexitongConsoleDeepSeek=api;host.app=api;
  panel.bind(toggle,{mode:'exam',onModeChange:()=>stop('已切换答题模式'),onRestart:restart,canRestart:()=>!state.destroyed});
  host.addEventListener('pagehide',onHide);
  message('考试答题引擎已接入，点击一键开始做题；最终交卷需手动确认');
  let resume;
  try{resume=JSON.parse(storage('getItem'));}catch{}
  storage('removeItem');
  if(resume?.identity===identity&&resume.nextStart===startIndex&&resume.until>Date.now()&&resume.until<=Date.now()+180000&&
     Array.isArray(resume.seen)&&resume.seen.length<500&&resume.seen.every(qid=>/^\d+$/.test(qid))&&new Set(resume.seen).size===resume.seen.length)start(resume.seen);
  return api;
}

if (/^\/exam-ans\/exam\/test\/reVersionTestStartNew\/?$/.test(window.location.pathname)) createManualExamController(LOCAL_TOKEN);
else createCourseController('console', LOCAL_TOKEN);
})();
