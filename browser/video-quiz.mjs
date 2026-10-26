import {assertCompleteAnswerText,traceAnswerApplication} from './answer-diagnostics.mjs';

// Serialized by the browser builder. Uses the rendered player UI, never hidden answer data.
export function createVideoQuizAdapter({mode,token,configs,dom,readEntries,taskKey,isAlive,onMessage,onFailure,onComplete,onResume,decodeAnswers}) {
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
