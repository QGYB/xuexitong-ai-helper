import test from 'node:test';
import assert from 'node:assert/strict';
import {document,el,harness} from './dom.mjs';

function popupFixture({type='判断题',labels=['A、对','B、错'],mode='console',fetch,config={},submit='close'}={}) {
  const doc=document(),frame=el('iframe'),content=document('https://mooc1.chaoxing.com/ananas/modules/video/index.html');frame.contentDocument=content;doc.body.append(frame);
  const video=el('video');video.paused=true;video.ended=false;video.currentTime=120;let plays=0;
  video.play=async()=>{plays++;video.paused=false;};video.pause=()=>{video.paused=true;};content.body.append(video);
  const popup=el('div',{class:'x-component ans-videoquiz',id:'videoquiz-1048'}),caption=el('div',{class:'tkTopic_title'},type),item=el('div',{class:'tkItem'}),stem=el('div',{class:'tkItem_title'},'合成视频弹题，保留当前播放位置。'),list=el('ul',{class:'tkItem_ul'});
  const controls=labels.map(label=>{const li=el('li',{class:'ans-videoquiz-opt'}),lab=el('label',{},label),input=el('input',{type:type==='多选题'?'checkbox':'radio',name:'ans-videoquiz-opt'});lab.append(el('span',{class:'tkRadio'}).append(input));li.append(lab);list.append(li);lab.onClick=()=>input.click();return input;});
  item.append(stem,list);popup.append(caption,item);
  const button=el('a',{id:'videoquiz-submit',class:'ans-videoquiz-submit'},'提交'),busy=el('a',{id:'videoquiz-submitting',class:'ans-videoquiz-submit'},'提交中'),continuation=el('a',{id:'videoquiz-continue',class:'ans-videoquiz-continue'},'继续学习'),back=el('a',{id:'knowledgeBack'},'知识点回看'),wrong=el('span',{id:'spanNot',class:'spanNot'},'真遗憾，再接再厉！');
  for(const node of [busy,continuation,back,wrong])node.hidden=true;
  button.onClick=()=>{if(submit==='close')popup.hidden=true;else {button.hidden=true;busy.hidden=submit==='continue';continuation.hidden=submit!=='continue';}};
  continuation.onClick=()=>{popup.hidden=true;};popup.append(button,busy,continuation,back,wrong);content.body.append(popup);
  const next=el('button',{id:'prevNextFocusNext'},'下一节');doc.body.append(next);
  const calls=[];const h=harness({doc,mode,config:{quizRetryDelayMs:5,quizRetryLimit:1,...config},fetch:async(url,options)=>{calls.push({url,options});return fetch?fetch(url,options):{ok:true,status:200,json:async()=>({answers:[{id:1,letters:['A']}]})};}});
  return {...h,content,video,popup,caption,item,stem,controls,button,busy,continuation,back,wrong,next,calls,get plays(){return plays;}};
}
for(const [type,labels,letters,want] of [
  ['单选题',['A、甲','B、乙'],['B'],[false,true]],
  ['多选题',['A、甲','B、乙','C、丙'],['A','C'],[true,false,true]],
  ['判断题',['A、错','B、对'],['A'],[true,false]],
])test(`video popup ${type} uses the existing answer protocol then resumes the same video`,async()=>{
  const h=popupFixture({type,labels,fetch:async()=>({ok:true,status:200,json:async()=>({answers:[{id:1,letters}]})})});h.inject();await h.advance(25);
  assert.equal(h.calls.length,1);const wire=JSON.parse(h.calls[0].options.body).questions[0];assert.equal(wire.type,type);assert.equal(wire.question,h.stem.textContent);assert.equal(wire.options[0].text,labels[0].slice(2));
  assert.deepEqual(h.controls.map(c=>c.checked),want);assert.equal(h.button.clicks,1);assert.equal(h.plays,1);assert.equal(h.video.currentTime,120);assert.equal(h.next.clicks,0);
});
test('video popup operates hidden native inputs through their visible labels',async()=>{
  const h=popupFixture();h.controls.forEach(c=>{c.style.display='none';});h.inject();await h.advance(20);assert.equal(h.controls[0].checked,true);assert.equal(h.button.clicks,1);assert.equal(h.plays,1);
});
test('video multi-choice removes extras while retaining already correct selections',async()=>{
  const h=popupFixture({type:'多选题',labels:['A、甲','B、乙','C、丙'],fetch:async()=>({ok:true,status:200,json:async()=>({answers:[{id:1,letters:['A','C']}]})})});h.controls[0].checked=true;h.controls[1].checked=true;
  h.inject();await h.advance(20);assert.deepEqual(h.controls.map(c=>c.checked),[true,false,true]);assert.equal(h.controls[0].clicks,0);assert.equal(h.button.clicks,1);
});
test('popup waiting for grading does not resubmit, resume or permit restart',async()=>{
  const h=popupFixture({submit:'pending'});h.inject();await h.advance(30);assert.equal(h.calls.length,1);assert.equal(h.button.clicks,1);assert.equal(h.plays,0);assert.equal(h.doc.querySelector('#xuexitong-restart-current').disabled,true);
  h.popup.hidden=true;await h.advance(10);assert.equal(h.plays,1);assert.equal(h.next.clicks,0);
});
test('popup clicks its scoped continue-learning button once after verified submission',async()=>{
  const h=popupFixture({submit:'continue'});h.inject();await h.advance(25);assert.equal(h.button.clicks,1);assert.equal(h.continuation.clicks,1);assert.equal(h.back.clicks,0);assert.equal(h.plays,1);
});
test('waiting for a video answer never consumes the playback retry budget',async()=>{
  let resolve;const h=popupFixture({config:{maxRetries:1},fetch:()=>new Promise(r=>{resolve=r;})});h.inject();await h.advance(25);assert.equal(h.plays,0);assert.equal(h.calls.length,1);
  resolve({ok:true,status:200,json:async()=>({answers:[{id:1,letters:['A']}]})});await h.advance(15);assert.equal(h.button.clicks,1);assert.equal(h.plays,1);assert.equal(h.win.app.status,'running');
});
test('a video question changed during inference rejects its old answer',async()=>{
  let resolve;const h=popupFixture({fetch:()=>new Promise(r=>{resolve=r;})});h.inject();await h.advance(5);h.stem.textContent='已经换成另一道题';resolve({ok:true,status:200,json:async()=>({answers:[{id:1,letters:['A']}]})});await h.advance(10);
  assert.equal(h.button.clicks,0);assert.ok(h.controls.every(c=>!c.checked));assert.equal(h.plays,0);assert.equal(h.win.app.status,'stopped');
});
test('pagehide aborts an in-flight video answer and ignores its late reply',async()=>{
  let resolve,signal;const h=popupFixture({fetch:(_,options)=>{signal=options.signal;return new Promise(r=>{resolve=r;});}});h.inject();await h.advance(5);h.pagehide();assert.equal(signal.aborted,true);
  resolve({ok:true,status:200,json:async()=>({answers:[{id:1,letters:['A']}]})});await h.flush();assert.equal(h.button.clicks,0);assert.equal(h.plays,0);assert.equal(h.timers.size,0);
});
test('manual restart cancels a pending popup request without allowing its old answer to apply',async()=>{
  let resolve,calls=0,signal;const h=popupFixture({fetch:(_,options)=>{calls++;if(calls===1){signal=options.signal;return new Promise(r=>{resolve=r;});}return Promise.resolve({ok:true,status:200,json:async()=>({answers:[{id:1,letters:['B']}]})});}});
  h.inject();await h.advance(5);h.doc.querySelector('#xuexitong-restart-current').click();await h.advance(25);assert.equal(signal.aborted,true);resolve({ok:true,status:200,json:async()=>({answers:[{id:1,letters:['A']}]})});await h.flush();assert.deepEqual(h.controls.map(c=>c.checked),[false,true]);assert.equal(h.button.clicks,1);
});
for(const status of [401,422])test(`video popup HTTP ${status} stops without guessing or retrying`,async()=>{
  const h=popupFixture({fetch:async()=>({ok:false,status})});h.inject();await h.advance(30);assert.equal(h.calls.length,1);assert.equal(h.button.clicks,0);assert.equal(h.plays,0);assert.equal(h.win.app.status,'stopped');
});
test('video popup transient failure retries finitely before applying an answer',async()=>{
  let calls=0;const h=popupFixture({fetch:async()=>++calls===1?{ok:false,status:502}:{ok:true,status:200,json:async()=>({answers:[{id:1,letters:['A']}]})}});h.inject();await h.advance(30);assert.equal(h.calls.length,2);assert.equal(h.button.clicks,1);assert.equal(h.plays,1);
});
test('video popup JSON parsing shares the finite request deadline',async()=>{
  const h=popupFixture({config:{requestTimeoutMs:15,quizRetryLimit:0},fetch:async()=>({ok:true,status:200,json:()=>new Promise(()=>{})})});h.inject();await h.advance(30);assert.equal(h.calls.length,1);assert.equal(h.button.clicks,0);assert.equal(h.win.app.status,'stopped');
});
test('a hidden video popup is ignored during normal video playback',async()=>{
  const h=popupFixture();h.popup.hidden=true;h.inject();await h.advance(20);assert.equal(h.calls.length,0);assert.equal(h.button.clicks,0);assert.equal(h.plays,1);
});
test('standalone V3 waits for manual popup completion and then resumes without calling AI',async()=>{
  const h=popupFixture({mode:'v3'});h.inject();await h.advance(20);assert.equal(h.calls.length,0);assert.equal(h.plays,0);h.popup.hidden=true;await h.advance(10);assert.equal(h.plays,1);
});
test('negative platform feedback pauses instead of guessing or clicking continue',async()=>{
  const h=popupFixture({submit:'pending'});h.button.onClick=()=>{h.button.hidden=true;h.wrong.hidden=false;h.continuation.hidden=false;};h.inject();await h.advance(20);assert.equal(h.button.clicks,1);assert.equal(h.continuation.clicks,0);assert.equal(h.plays,0);assert.equal(h.win.app.status,'stopped');
});
test('ambiguous simultaneous video popups are not answered',async()=>{
  const h=popupFixture();h.content.body.append(el('div',{class:'ans-videoquiz'},'另一个弹题'));h.inject();await h.advance(15);assert.equal(h.calls.length,0);assert.equal(h.plays,0);assert.equal(h.win.app.status,'stopped');
});
test('answer-only handles the current video popup and stays without playing or advancing',async()=>{
  const h=popupFixture();h.inject();h.doc.querySelector('#xuexitong-answer-current').click();await h.advance(25);assert.equal(h.button.clicks,1);assert.equal(h.plays,0);assert.equal(h.next.clicks,0);assert.equal(h.win.app.status,'stopped');
});
test('a popup that automatically closes on the verified choice needs no submit button',async()=>{
  const h=popupFixture();h.button.remove();h.controls[0].onClick=()=>{h.popup.hidden=true;};h.inject();await h.advance(20);assert.equal(h.calls.length,1);assert.equal(h.controls[0].checked,true);assert.equal(h.button.clicks,0);assert.equal(h.plays,1);
});
test('a popup stem containing unrepresented image content stops before inference',async()=>{
  const h=popupFixture();h.stem.append(el('img'));h.inject();await h.advance(20);assert.equal(h.calls.length,0);assert.equal(h.button.clicks,0);assert.equal(h.plays,0);
});
test('a player can reuse the same popup for a new question after continue-learning',async()=>{
  const h=popupFixture({submit:'continue'});h.continuation.onClick=()=>{h.continuation.hidden=true;h.button.hidden=false;h.stem.textContent='另一道视频判断题';h.controls.forEach(c=>{c.checked=false;});h.button.onClick=()=>{h.popup.hidden=true;};};
  h.inject();await h.advance(35);assert.equal(h.calls.length,2);assert.equal(h.button.clicks,2);assert.equal(h.continuation.clicks,1);assert.equal(h.plays,1);assert.equal(h.next.clicks,0);
});
test('video multi-choice without a separate submit button does not risk partial automatic submission',async()=>{
  const h=popupFixture({type:'多选题',labels:['A、甲','B、乙','C、丙']});h.button.remove();h.controls[0].onClick=()=>{h.popup.hidden=true;};h.inject();await h.advance(20);
  assert.equal(h.calls.length,0);assert.ok(h.controls.every(c=>!c.checked));assert.equal(h.plays,0);assert.equal(h.win.app.status,'stopped');
});
test('persistent video answer failures exhaust the finite retry limit without selecting or submitting',async()=>{
  const h=popupFixture({fetch:async()=>({ok:false,status:502})});h.inject();await h.advance(40);assert.equal(h.calls.length,2);assert.equal(h.button.clicks,0);assert.equal(h.plays,0);assert.equal(h.win.app.status,'stopped');
});
for(const field of ['caption','stem'])test(`video popup waits for a delayed ${field} before inference`,async()=>{
  const h=popupFixture(),original=h[field].textContent;h[field].textContent='';h.inject();await h.advance(10);assert.equal(h.calls.length,0);assert.equal(h.plays,0);assert.equal(h.win.app.status,'running');
  h[field].textContent=original;await h.advance(20);assert.equal(h.calls.length,1);assert.equal(h.button.clicks,1);assert.equal(h.plays,1);
});
test('a persistently incomplete video popup has a finite load deadline',async()=>{
  const h=popupFixture({config:{quizLoadTimeoutMs:10}});h.stem.textContent='';h.inject();await h.advance(30);assert.equal(h.calls.length,0);assert.equal(h.button.clicks,0);assert.equal(h.win.app.status,'stopped');assert.match(h.win.app.message,/加载超时/);
});
