import test from 'node:test';
import assert from 'node:assert/strict';
import {document,el,quiz,harness} from './dom.mjs';

function answerButton(h) {
  const panel=h.doc.querySelector('#xuexitong-independent-status');
  const button=panel?.querySelector('#xuexitong-answer-current');
  assert.ok(button,'course status panel must provide the standalone answer button');
  return button;
}
const finish=(doc,q)=>{q.submit.onClick=()=>doc.body.append(el('div',{class:'achievement'},'本次成绩100分'));};

test('answer button remains to the left of live status text after messages change', async()=>{
  const h=harness();h.inject();const button=answerButton(h),panel=button.parentElement;
  assert.equal(button.textContent,'一键开始做题');assert.equal(panel.children[0],button);
  const message=panel.querySelector('[role="status"]');assert.ok(message);assert.notEqual(message,button);
  button.click();await h.advance(15);
  assert.equal(panel.children[0],button);assert.equal(button.isConnected,true);assert.equal(button.disabled,false);
  assert.match(message.textContent,/测验/);
});

test('answer-only opens the current quiz without playing video and stays after submission', async()=>{
  const doc=document(),frame=el('iframe'),video=el('video'),tab=el('button',{role:'tab'},'章节测验'),next=el('button',{id:'prevNextFocusNext'},'下一节');
  video.currentTime=12;video.paused=true;video.ended=false;let plays=0,calls=0,q;
  video.play=async()=>{plays++;};frame.contentDocument=document('https://mooc1.chaoxing.com/video?chapterId=1');frame.contentDocument.body.append(video);
  tab.onClick=()=>{frame.contentDocument=document('https://mooc1.chaoxing.com/work?chapterId=1');q=quiz(frame.contentDocument);finish(frame.contentDocument,q);};
  doc.body.append(frame,tab,next);
  const h=harness({doc,fetch:async()=>{calls++;return{ok:true,status:200,json:async()=>({answers:[{id:1,letters:['A']}]})};}});
  const app=h.inject(),button=answerButton(h);button.click();button.click();app.answerCurrentQuiz();await h.advance(35);
  assert.equal(plays,0);assert.equal(tab.clicks,1);assert.equal(calls,1);assert.equal(q.submit.clicks,1);assert.equal(next.clicks,0);
  assert.equal(app.status,'stopped');assert.match(app.message,/停留/);assert.equal(button.disabled,false);
});

for(const [type,labels,letters,want] of [
  ['单选题',['A. 北京','B. 上海'],['B'],[false,true]],
  ['多选题',['A. 北京','B. 上海','C. 杭州'],['A','C'],[true,false,true]],
  ['判断题',['正确','错误'],['A'],[true,false]]
])test(`standalone ${type} can start from a stopped controller and never advances`,async()=>{
  const doc=document(),q=quiz(doc,{type,labels}),next=el('button',{id:'prevNextFocusNext'},'下一节');doc.body.append(next);finish(doc,q);
  const h=harness({doc,fetch:async()=>({ok:true,status:200,json:async()=>({answers:[{id:1,letters}]})})});
  const old=h.inject();old.stop('用户暂停');answerButton(h).click();await h.advance(25);
  assert.notEqual(h.win.app,old);assert.deepEqual(q.controls.map(c=>c.checked),want);assert.equal(q.submit.clicks,1);assert.equal(next.clicks,0);
  assert.equal(h.win.app.status,'stopped');assert.equal(doc.querySelectorAll('#xuexitong-independent-status').length,1);
});

test('switching an in-flight automatic answer to standalone never repeats the request',async()=>{
  const doc=document(),q=quiz(doc),next=el('button',{id:'prevNextFocusNext'},'下一节');doc.body.append(next);finish(doc,q);
  let calls=0,resolve;const h=harness({doc,fetch:()=>{calls++;return new Promise(r=>{resolve=r;});}});
  const app=h.inject();await h.advance(6);assert.equal(calls,1);
  answerButton(h).click();app.answerCurrentQuiz();
  resolve({ok:true,status:200,json:async()=>({answers:[{id:1,letters:['A']}]})});await h.advance(20);
  assert.equal(calls,1);assert.equal(q.submit.clicks,1);assert.equal(next.clicks,0);assert.equal(app.status,'stopped');
});

test('standalone retains bounded answer retries without starting the next task',async()=>{
  const doc=document(),q=quiz(doc),next=el('button',{id:'prevNextFocusNext'},'下一节');doc.body.append(next);finish(doc,q);let calls=0;
  const h=harness({doc,config:{quizRetryDelayMs:5},fetch:async()=>++calls===1?{ok:false,status:502}:{ok:true,status:200,json:async()=>({answers:[{id:1,letters:['A']}]})}});
  h.inject();answerButton(h).click();await h.advance(35);
  assert.equal(calls,2);assert.equal(q.submit.clicks,1);assert.equal(next.clicks,0);assert.equal(h.win.app.status,'stopped');
});

test('a chapter change during standalone loading cancels instead of answering another chapter',async()=>{
  const doc=document(),active=el('div',{class:'posCatalog_active','data-chapterid':'1'}),tab=el('button',{role:'tab'},'章节测验');doc.body.append(active,tab);let calls=0;
  const h=harness({doc,fetch:async()=>{calls++;throw Error('must not answer another chapter');}});
  const app=h.inject();answerButton(h).click();await h.advance(6);active.setAttribute('data-chapterid','2');const q=quiz(doc);await h.advance(15);
  assert.equal(calls,0);assert.equal(q.submit.clicks,0);assert.equal(app.status,'stopped');assert.match(app.message,/章节|任务/);
});

test('a quiz tab is clicked once while delayed questions are loading',async()=>{
  const doc=document(),frame=el('iframe'),tab=el('button',{role:'tab'},'章节测验');frame.contentDocument=document('https://mooc1.chaoxing.com/video');doc.body.append(frame,tab);
  tab.onClick=()=>{tab.setAttribute('aria-current','true');frame.contentDocument=document('https://mooc1.chaoxing.com/work');};
  const h=harness({doc});h.inject();answerButton(h).click();await h.advance(20);assert.equal(tab.clicks,1);
  const q=quiz(frame.contentDocument);finish(frame.contentDocument,q);await h.advance(20);
  assert.equal(tab.clicks,1);assert.equal(q.submit.clicks,1);assert.equal(h.win.app.status,'stopped');
});

test('replacing an ambiguous active chapter node cancels a standalone load',async()=>{
  const doc=document(),active=el('div',{class:'posCatalog_active'}),tab=el('button',{role:'tab'},'章节测验');doc.body.append(active,tab);let calls=0;
  const h=harness({doc,fetch:async()=>{calls++;throw Error('must not answer after chapter replacement');}});
  const app=h.inject();answerButton(h).click();await h.advance(6);active.remove();doc.body.append(el('div',{class:'posCatalog_active'}));const q=quiz(doc);await h.advance(15);
  assert.equal(calls,0);assert.equal(q.submit.clicks,0);assert.equal(app.status,'stopped');
});

test('a late response from a stopped controller cannot corrupt a standalone restart',async()=>{
  const doc=document(),q=quiz(doc);finish(doc,q);let calls=0,late;
  const h=harness({doc,fetch:()=>++calls===1?new Promise(r=>{late=r;}):Promise.resolve({ok:true,status:200,json:async()=>({answers:[{id:1,letters:['B']}]})})});
  const old=h.inject();await h.advance(6);old.stop('用户暂停');answerButton(h).click();await h.advance(25);
  late({ok:true,status:200,json:async()=>({answers:[{id:1,letters:['A']}]})});await h.flush();
  assert.equal(calls,2);assert.equal(q.submit.clicks,1);assert.deepEqual(q.controls.map(c=>c.checked),[false,true]);
});

test('pagehide and replacement prevent stale buttons from restarting a controller',async()=>{
  const h=harness();const first=h.inject(),old=answerButton(h),second=h.inject();old.click();assert.equal(h.win.app,second);assert.equal(first.status,'stopped');
  const current=answerButton(h);h.pagehide();current.click();await h.advance(15);
  assert.equal(h.win.app,second);assert.equal(h.timers.size,0);assert.equal(second.status,'stopped');
});

test('standalone still requires a healthy authenticated service and V3 exposes no answer button',async()=>{
  const doc=document(),q=quiz(doc);let calls=0;
  const h=harness({doc,health:async()=>({ok:false,status:403}),fetch:async()=>{calls++;throw Error('unauthorized');}});
  h.inject();answerButton(h).click();await h.advance(15);assert.equal(calls,0);assert.equal(q.submit.clicks,0);assert.equal(h.win.app.status,'stopped');
  const player=harness({mode:'v3'});player.inject();assert.equal(player.doc.querySelector('#xuexitong-answer-current'),null);
});
