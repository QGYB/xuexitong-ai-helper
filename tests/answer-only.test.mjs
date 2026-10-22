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

test('destroying a controller keeps one visible inert status panel until another controller binds',async()=>{
  const h=harness(),first=h.inject(),button=answerButton(h),panel=button.parentElement;
  first.destroy();assert.equal(h.doc.querySelector('#xuexitong-independent-status'),panel);
  assert.equal(button.disabled,true);button.click();assert.equal(h.win.app,first);
  const second=h.inject();await h.flush();assert.equal(h.doc.querySelector('#xuexitong-independent-status'),panel);
  assert.equal(h.doc.querySelectorAll('#xuexitong-independent-status').length,1);assert.equal(answerButton(h).disabled,false);assert.notEqual(first,second);
});

test('standalone still requires a healthy authenticated service and V3 exposes no answer button',async()=>{
  const doc=document(),q=quiz(doc);let calls=0;
  const h=harness({doc,health:async()=>({ok:false,status:403}),fetch:async()=>{calls++;throw Error('unauthorized');}});
  h.inject();answerButton(h).click();await h.advance(15);assert.equal(calls,0);assert.equal(q.submit.clicks,0);assert.equal(h.win.app.status,'stopped');
  const player=harness({mode:'v3'});player.inject();assert.equal(player.doc.querySelector('#xuexitong-answer-current'),null);
});

function examFixture({type='单选题',stored=['B','D','C','A'],start=0,storage=new Map(),fetch,health,next=true,config={}}={}){
  const url=`https://mooc1.chaoxing.com/exam-ans/exam/test/reVersionTestStartNew?courseId=1&classId=2&tId=3&id=4&start=${start}`;
  const doc=document(url),box=el('div',{class:'questionLi',data:String(100+start)}),qid=String(100+start);
  const title=el('h3',{class:'mark_name','aria-hidden':'true'},`${start+1}. (${type}, 1.0 分) 合成题干`);
  const input=el('input',{type:'hidden',name:`answer${qid}`,value:''});
  const kind=el('input',{type:'hidden',name:`type${qid}`,value:type==='多选题'?'1':type==='判断题'?'3':'0'});
  box.append(title,input,kind);
  const choices=stored.map((value,i)=>{
    const choice=el('div',{class:'answerBg',role:type==='多选题'?'checkbox':'radio'});
    choice.append(el('span',{class:type==='多选题'?'num_option_dx':'num_option',qid,data:value},'ABCDEFGH'[i]),el('div',{class:'answer_p'},type==='判断题'?(value==='true'?'正确':'错误'):`选项${i+1}`));
    choice.onClick=()=>{if(type==='多选题'){const s=new Set(input.value);s.has(value)?s.delete(value):s.add(value);input.value=[...s].sort().join('');}else input.value=value;};box.append(choice);return choice;
  });
  doc.body.append(box);
  const nextButton=el('a',{onclick:'getTheNextQuestion(1)'},'下一题'),submit=el('button',{},'交卷');if(next)doc.body.append(nextButton);doc.body.append(submit);
  const h=harness({doc,fetch,health,config:{quizRetryDelayMs:5,...config}});
  h.win.sessionStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  return {...h,box,title,input,choices,nextButton,submit,storage};
}
test('manual exam engine is idle until the answer button is clicked and maps shuffled values',async()=>{
  let calls=0;const h=examFixture({fetch:async()=>{calls++;return {ok:true,status:200,json:async()=>({answers:[{id:1,letters:['A']}]})};}});
  const app=h.inject();assert.ok(app,'exam page must connect the answer engine');await h.advance(10);assert.equal(calls,0);
  assert.equal(answerButton(h).disabled,false);answerButton(h).click();await h.advance(10);
  assert.equal(calls,1);assert.equal(h.input.value,'B');assert.equal(h.nextButton.clicks,1);assert.equal(h.submit.clicks,0);
  answerButton(h).click();assert.equal(app.status,'stopped');assert.equal(h.timers.size,0);
});
test('manual exam multi choice verifies hidden stored values and never submits the paper',async()=>{
  const h=examFixture({type:'多选题',stored:['D','A','B','C'],next:false,fetch:async()=>({ok:true,status:200,json:async()=>({answers:[{id:1,letters:['A','C']}]})})});
  h.input.value='AB';const app=h.inject();answerButton(h).click();await h.advance(15);
  assert.equal(h.input.value,'BD');assert.equal(h.choices[2].clicks,0);assert.equal(h.choices[1].clicks,1);assert.equal(h.submit.clicks,0);assert.equal(app.status,'stopped');
});
test('manual exam judgment supports reversed displayed order',async()=>{
  const h=examFixture({type:'判断题',stored:['false','true'],next:false,fetch:async()=>({ok:true,status:200,json:async()=>({answers:[{id:1,letters:['B']}]})})});
  h.inject();answerButton(h).click();await h.advance(15);assert.equal(h.input.value,'true');assert.equal(h.submit.clicks,0);
});
test('manual exam stops late answers after the current question changes',async()=>{
  let complete;const h=examFixture({fetch:()=>new Promise(r=>{complete=r;})});const app=h.inject();assert.ok(app);answerButton(h).click();await h.advance(5);
  h.title.textContent='2. (单选题, 1.0 分) 新题干';complete({ok:true,status:200,json:async()=>({answers:[{id:1,letters:['A']}]})});await h.advance(10);
  assert.equal(h.input.value,'');assert.equal(h.nextButton.clicks,0);assert.equal(app.status,'stopped');
});
test('manual exam resumes only its expected next page after full navigation',async()=>{
  const storage=new Map(),first=examFixture({storage});const app=first.inject();assert.ok(app);answerButton(first).click();await first.advance(10);assert.equal(first.nextButton.clicks,1);first.pagehide();
  const second=examFixture({start:1,storage,next:false});const nextApp=second.inject();await second.advance(15);
  assert.equal(second.input.value,'B');assert.equal(nextApp.status,'stopped');assert.equal(second.submit.clicks,0);assert.equal(storage.size,0);
});
test('manual exam rejects invalid answers and inaccessible service without touching choices',async()=>{
  for(const bad of ['answer','health']){
    const h=examFixture({health:async()=>({ok:bad!=='health',status:bad==='health'?403:200}),fetch:async()=>({ok:true,status:200,json:async()=>({answers:[{id:1,letters:['Z']}]})})});
    const app=h.inject();assert.ok(app);answerButton(h).click();await h.advance(15);assert.equal(h.input.value,'');assert.equal(h.nextButton.clicks,0);assert.equal(app.status,'stopped');
  }
});
test('mode switch distinguishes chapter and exam pages and cancels an active request',async()=>{
  const h=examFixture({fetch:async()=>new Promise(()=>{})});const app=h.inject();
  const mode=h.doc.querySelector('#xuexitong-answer-mode');assert.ok(mode);assert.match(mode.textContent,/考试答题/);
  answerButton(h).click();await h.advance(5);mode.click();assert.equal(app.status,'stopped');assert.match(mode.textContent,/章节测验/);assert.equal(answerButton(h).disabled,true);
  mode.click();assert.match(mode.textContent,/考试答题/);assert.equal(answerButton(h).disabled,false);
  const c=harness();const chapter=c.inject(),chapterMode=c.doc.querySelector('#xuexitong-answer-mode');assert.match(chapterMode.textContent,/章节测验/);
  chapterMode.click();assert.equal(chapter.status,'stopped');assert.equal(answerButton(c).disabled,true);
});
test('manual exam JSON body parsing has the same finite deadline as the answer request',async()=>{
  const h=examFixture({config:{requestTimeoutMs:8,quizRetryLimit:0},fetch:async()=>({ok:true,status:200,json:async()=>new Promise(()=>{})})});
  const app=h.inject();answerButton(h).click();await h.advance(20);assert.equal(app.status,'stopped');assert.equal(h.input.value,'');assert.equal(h.nextButton.clicks,0);
});
test('manual exam retries transient failures without repeating next-question save',async()=>{
  let count=0;const h=examFixture({fetch:async()=>++count===1?{ok:false,status:502}:{ok:true,status:200,json:async()=>({answers:[{id:1,letters:['A']}]})}});
  h.inject();answerButton(h).click();await h.advance(20);assert.equal(count,2);assert.equal(h.nextButton.clicks,1);h.pagehide();
});
