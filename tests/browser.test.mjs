import test from 'node:test';
import assert from 'node:assert/strict';
import { document, el, quiz, harness } from './dom.mjs';

test('route and runner guards have no DOM or timer effects', () => {
  for (const url of ['http://mooc1.chaoxing.com/mycourse/studentstudy', 'https://evilchaoxing.com/mycourse/studentstudy', 'https://mooc1.chaoxing.com/wrong']) {
    const h = harness({ url }); h.inject(); assert.equal(h.timers.size, 0); assert.equal(h.doc.body.children.length, 0);
  }
  const h = harness({ mode: 'v3', driver: 'console' }); h.inject(); assert.equal(h.timers.size, 0); assert.equal(h.win.__xuexitongPlayerV3, undefined);
});
test('replacement and pagehide cancel playback work', async () => {
  const h = harness(); const video = el('video'); video.paused = true; video.play = async () => { video.paused = false; }; h.doc.body.append(video);
  const first = h.inject(); await h.advance(); assert.equal(video.paused, false);
  const second = h.inject(); assert.notEqual(second, first); assert.equal(first.status, 'stopped'); h.pagehide(); assert.equal(h.timers.size, 0);
});
test('typed quiz request selects and submits once', async () => {
  const doc = document(); const q = quiz(doc); const calls = [];
  const h = harness({ doc, fetch: async (url, options) => { calls.push({ url, ...options }); return { ok: true, status: 200, json: async () => ({ answers: [{ id: 1, letters: ['A'] }] }) }; } });
  h.inject(); await h.advance(25); assert.equal(calls.length, 1); const body = JSON.parse(calls[0].body);
  assert.deepEqual(body.questions, [{ id: 1, type: '单选题', question: '首都在哪？', options: [{ letter: 'A', text: '北京' }, { letter: 'B', text: '上海' }] }]);
  assert.equal(q.controls[0].checked, true); assert.equal(q.controls[1].checked, false); assert.equal(q.submit.clicks, 1);
});
test('429 and incomplete answer sets stop without submission', async () => {
  for (const response of [{ ok: false, status: 429 }, { ok: true, status: 200, json: async () => ({ answers: [] }) }]) {
    const doc = document(); const q = quiz(doc); const h = harness({ doc, fetch: async () => response }); const app = h.inject(); await h.advance(15);
    assert.equal(q.submit.clicks, 0); assert.equal(app.status, 'stopped');
  }
});
test('question edits during request invalidate answers', async () => {
  const doc = document(); const q = quiz(doc); let resolve;
  const h = harness({ doc, fetch: () => new Promise(r => { resolve = r; }) }); h.inject(); await h.advance();
  q.box.children[0].text = '1. （单选题）题目改变'; resolve({ ok: true, status: 200, json: async () => ({ answers: [{ id: 1, letters: ['A'] }] }) }); await h.flush();
  assert.equal(q.controls[0].checked, false); assert.equal(q.submit.clicks, 0);
});
test('hidden scores cannot advance an unresolved quiz and deadline stops', async () => {
  const doc = document(); quiz(doc); const score = el('div', { class: 'score' }, '本次成绩100'); score.hidden = true;
  const next = el('button', { id: 'prevNextFocusNext' }, '下一节'); doc.body.append(score, next);
  const h = harness({ mode: 'v3', doc }); const app = h.inject(); await h.advance(90); assert.equal(next.clicks, 0); assert.equal(app.status, 'stopped');
});

test('multiple choice deselects extras without toggling selected correct options', async () => {
  const doc = document(); const q = quiz(doc, { type: '多选题', title: '1. 【多选题】选择城市', labels: ['A. 北京', 'B. 上海', 'C. 广州'] });
  q.controls[0].checked = true; q.controls[2].checked = true;
  const h = harness({ doc, fetch: async () => ({ ok: true, status: 200, json: async () => ({ answers: [{ id: 1, letters: ['A', 'B'] }] }) }) });
  h.inject(); await h.advance(15); assert.deepEqual(q.controls.map(c => c.checked), [true, true, false]); assert.equal(q.controls[0].clicks, 0); assert.equal(q.submit.clicks, 1);
});

test('visible labels can operate hidden native inputs', async () => {
  const doc = document(); const q = quiz(doc); q.controls.forEach(c => { c.style.display = 'none'; });
  for (const label of q.box.querySelectorAll('label')) label.onClick = () => q.controls.find(c => c.id === label.getAttribute('for')).click();
  const h = harness({ doc }); h.inject(); await h.advance(15); assert.equal(q.controls[0].checked, true); assert.equal(q.submit.clicks, 1);
});

test('semantic custom choices expose verifiable selected state', async () => {
  const doc = document(); const box = el('div', { class: 'TiMu' }); box.append(el('div', { class: 'Zy_TItle' }, '1.（判断题）天空是蓝色'));
  const choices = ['正确', '错误'].map((word, i) => {
    const c = el('div', { role: 'radio', 'aria-checked': 'false' }); c.append(el('span', {}, String.fromCharCode(65 + i)), el('span', {}, word));
    c.onClick = () => choices.forEach(x => x.setAttribute('aria-checked', String(x === c))); box.append(c); return c;
  });
  const submit = el('button', {}, '提交'); doc.body.append(box, submit); const h = harness({ doc }); h.inject(); await h.advance(15);
  assert.equal(choices[0].getAttribute('aria-checked'), 'true'); assert.equal(submit.clicks, 1);
});

test('declared question count blocks incomplete parsing', async () => {
  const doc = document(); const q = quiz(doc); doc.body.append(el('div', {}, '题量：2')); const h = harness({ doc, config: { quizLoadTimeoutMs: 10 } }); const app = h.inject(); await h.advance(25);
  assert.equal(q.submit.clicks, 0); assert.equal(app.status, 'stopped');
});

test('delayed partial quiz becomes complete before bounded load deadline', async () => {
  const doc = document(); const q = quiz(doc); const count = el('div', {}, '题量：2'); doc.body.append(count);
  const h = harness({ doc, config: { quizLoadTimeoutMs: 30 } }); const app = h.inject(); await h.advance(5); assert.equal(q.submit.clicks, 0); assert.equal(app.status, 'running');
  count.text = '题量：1'; await h.advance(10); assert.equal(q.submit.clicks, 1);
});

test('pending health bootstrap replacement and failure never start stale work', async () => {
  const doc = document(); const q = quiz(doc); const pending = [];
  const h = harness({ doc, health: (url, options) => new Promise(resolve => pending.push({ resolve, options })) });
  const first = h.inject(); await h.flush(); const second = h.inject(); await h.flush(); assert.equal(pending[0].options.signal.aborted, true);
  pending[0].resolve({ ok: true, status: 200 }); pending[1].resolve({ ok: false, status: 401 }); await h.advance(20);
  assert.equal(first.status, 'stopped'); assert.equal(second.status, 'stopped'); assert.equal(q.submit.clicks, 0); assert.equal(h.timers.size, 0);
});

test('hidden and inaccessible frames ignored; newly visible frame is discovered', async () => {
  const doc = document(); const frame = el('iframe'); frame.hidden = true; frame.contentDocument = document('https://mooc1.chaoxing.com/knowledge/cards?chapterId=1'); const q = quiz(frame.contentDocument);
  const inaccessible = el('iframe'); Object.defineProperty(inaccessible, 'contentDocument', { get() { throw new Error('cross origin'); } }); doc.body.append(frame, inaccessible);
  const h = harness({ doc }); h.inject(); await h.advance(10); assert.equal(q.submit.clicks, 0); frame.hidden = false; await h.advance(10); assert.equal(q.submit.clicks, 1);
});

test('active outline identity changes invalidate pending same-URL answers', async () => {
  const doc = document(); const q = quiz(doc); const active = el('div', { class: 'posCatalog_active', 'data-chapterid': 'one' }); doc.body.append(active); let resolve;
  const h = harness({ doc, fetch: () => new Promise(r => { resolve = r; }) }); h.inject(); await h.advance(); active.setAttribute('data-chapterid', 'two');
  resolve({ ok: true, status: 200, json: async () => ({ answers: [{ id: 1, letters: ['A'] }] }) }); await h.flush(); assert.equal(q.submit.clicks, 0); assert.equal(q.controls[0].checked, false);
});

test('same-task replacement grading document advances once; unrelated score cannot', async () => {
  for (const unrelated of [false, true]) {
    const doc = document(); const frame = el('iframe'); frame.contentDocument = document('https://mooc1.chaoxing.com/work?chapterId=1&workId=1'); const q = quiz(frame.contentDocument);
    const next = el('button', { id: 'prevNextFocusNext' }, '下一节'); doc.body.append(frame, next);
    const h = harness({ doc }); q.submit.onClick = () => { const grade = document(`https://mooc1.chaoxing.com/work/result?chapterId=1&workId=${unrelated ? 2 : 1}`); grade.body.append(el('div', { class: 'mark_title' }, '本次成绩：100')); frame.contentDocument = grade; };
    h.inject(); await h.advance(25); assert.equal(next.clicks, unrelated ? 0 : 1);
  }
});

test('same questions on consecutive quiz tasks cause distinct requests and submissions', async () => {
  const doc = document(); const frame = el('iframe'); const next = el('button', { id: 'prevNextFocusNext' }, '下一节'); doc.body.append(frame, next); let requests = 0; const submissions = [];
  function install(id) {
    frame.contentDocument = document(`https://mooc1.chaoxing.com/work?chapterId=${id}&workId=${id}`); const q = quiz(frame.contentDocument); submissions.push(q.submit);
    q.submit.onClick = () => { const grade = document(`https://mooc1.chaoxing.com/work/result?chapterId=${id}&workId=${id}`); grade.body.append(el('div', { class: 'mark_title' }, '本次成绩：100')); frame.contentDocument = grade; };
  }
  install(1); next.onClick = () => { if (next.clicks === 1) install(2); };
  const h = harness({ doc, fetch: async () => { requests++; return { ok: true, status: 200, json: async () => ({ answers: [{ id: 1, letters: ['A'] }] }) }; } }); h.inject(); await h.advance(35);
  assert.equal(requests, 2); assert.deepEqual(submissions.map(s => s.clicks), [1, 1]); assert.equal(next.clicks, 2);
});

test('request deadline aborts and unknown pages never advance', async () => {
  const doc = document(); const q = quiz(doc); let signal;
  const h = harness({ doc, config: { requestTimeoutMs: 10 }, fetch: (url, options) => { signal = options.signal; return new Promise(() => {}); } }); const app = h.inject(); await h.advance(30);
  assert.equal(signal.aborted, true); assert.equal(app.status, 'stopped'); assert.equal(q.submit.clicks, 0);
  const unknown = document(); const next = el('button', { id: 'prevNextFocusNext' }, '下一节'); unknown.body.append(next); const u = harness({ doc: unknown, mode: 'v3' }); const player = u.inject(); await u.advance(90); assert.equal(next.clicks, 0); assert.equal(player.status, 'stopped');
});

test('stale control replacement cannot receive answers', async () => {
  const doc = document(); const q = quiz(doc); let resolve;
  const h = harness({ doc, fetch: () => new Promise(r => { resolve = r; }) }); h.inject(); await h.advance();
  q.controls[0].remove(); q.box.append(el('input', { type: 'radio', id: 'o0', name: 'q1' }));
  resolve({ ok: true, status: 200, json: async () => ({ answers: [{ id: 1, letters: ['A'] }] }) }); await h.flush(); assert.equal(q.submit.clicks, 0);
});

test('stop aborts request and late answers cannot select', async () => {
  const doc = document(); const q = quiz(doc); let resolve; let signal;
  const h = harness({ doc, fetch: (url, options) => { signal = options.signal; return new Promise(r => { resolve = r; }); } }); const app = h.inject(); await h.advance(); app.stop();
  assert.equal(signal.aborted, true); resolve({ ok: true, status: 200, json: async () => ({ answers: [{ id: 1, letters: ['A'] }] }) }); await h.flush(); assert.equal(q.controls[0].checked, false); assert.equal(h.timers.size, 0);
});

test('invalid answer IDs, letters, duplicates, cardinality and JSON prevent submit', async () => {
  const bodies = [{ answers: [{ id: 2, letters: ['A'] }] }, { answers: [{ id: 1, letters: ['Z'] }] }, { answers: [{ id: 1, letters: ['A', 'A'] }] }, { answers: [{ id: 1, letters: ['A', 'B'] }] }, null];
  for (const body of bodies) {
    const doc = document(); const q = quiz(doc); const h = harness({ doc, fetch: async () => ({ ok: true, status: 200, json: async () => { if (body === null) throw new Error('bad JSON'); return body; } }) });
    const app = h.inject(); await h.advance(15); assert.equal(q.submit.clicks, 0); assert.equal(app.status, 'stopped');
  }
});

test('new scoped submit confirmation is clicked once; incomplete warning blocks', async () => {
  for (const warning of [false, true]) {
    const doc = document(); const q = quiz(doc); const dialog = el('div', { role: 'dialog' }, warning ? '提交失败，请作答' : '确认提交答案？'); dialog.hidden = true;
    const confirm = el('button', {}, '确定'); dialog.append(confirm); doc.body.append(dialog); q.submit.onClick = () => { dialog.hidden = false; };
    const h = harness({ doc }); const app = h.inject(); await h.advance(25); assert.equal(confirm.clicks, warning ? 0 : 1); if (warning) assert.equal(app.status, 'stopped');
  }
});

test('ended video discovers expected, textual, and accessible-frame quiz tabs before next', async () => {
  for (const kind of ['expected', 'textual', 'frame']) {
    const doc = document(); const video = el('video'); video.ended = true; doc.body.append(video); const next = el('button', { id: 'prevNextFocusNext' }, '下一节'); doc.body.append(next);
    const targetDoc = kind === 'frame' ? document('https://mooc1.chaoxing.com/knowledge/cards?chapterId=1') : doc;
    const tab = el(kind === 'textual' ? 'button' : 'li', kind === 'expected' ? { class: 'prev_white' } : {}, '2章节测验'); targetDoc.body.append(tab);
    if (kind === 'frame') { const frame = el('iframe'); frame.contentDocument = targetDoc; doc.body.append(frame); }
    const h = harness({ doc, mode: 'v3' }); h.inject(); await h.advance(10); assert.equal(tab.clicks, 1); assert.equal(next.clicks, 0);
  }
});

test('initial learning target enters numbered video tab', async () => {
  const doc = document(); const tab = el('li', { class: 'prev_white' }, '2视频'); doc.body.append(el('h2', {}, '学习目标'), tab);
  const h = harness({ doc, mode: 'v3' }); h.inject(); await h.advance(10); assert.equal(tab.clicks, 1);
});

test('URL/title-only navigation cannot count old player as a fresh task', async () => {
  const doc = document(); const video = el('video'); video.ended = true; doc.body.append(video); const next = el('button', { id: 'prevNextFocusNext' }, '下一节'); doc.body.append(next);
  const h = harness({ doc, mode: 'v3' }); next.onClick = () => { h.win.location.search = '?chapterId=2'; doc.URL = h.win.location.href; };
  const app = h.inject(); await h.advance(75); assert.equal(next.clicks, 1); assert.equal(app.status, 'stopped');
});

test('fresh consecutive videos advance once each', async () => {
  const doc = document(); let video = el('video'); video.ended = true; doc.body.append(video); const next = el('button', { id: 'prevNextFocusNext' }, '下一节'); doc.body.append(next);
  const h = harness({ doc, mode: 'v3' }); next.onClick = () => { if (next.clicks === 1) { video.remove(); video = el('video'); video.ended = true; doc.body.append(video); h.win.location.search = '?courseId=1&chapterId=2'; } };
  h.inject(); await h.advance(20); assert.equal(next.clicks, 2);
});

test('V3 speed default, console platform default, muted fallback and finite retry', async () => {
  for (const mode of ['console', 'v3']) {
    const doc = document(); const video = el('video'); video.paused = true; video.playbackRate = 1; let attempts = 0;
    video.play = async () => { attempts++; throw new Error('autoplay'); }; doc.body.append(video);
    const h = harness({ doc, mode, config: { maxRetries: 2, guardResumeCooldownMs: 5 } }); const app = h.inject(); await h.advance(30);
    assert.equal(video.playbackRate, mode === 'v3' ? 1.5 : 1); assert.equal(video.muted, true); assert.equal(attempts, 4); assert.equal(app.status, 'stopped');
  }
});

test('preexisting visible grade beside live questions blocks all answering and advancement', async () => {
  const doc = document(); const q = quiz(doc); const score = el('div', { class: 'score' }, '本次成绩：60'); const next = el('button', { id: 'prevNextFocusNext' }, '下一节'); doc.body.append(score, next); let requests = 0;
  const h = harness({ doc, fetch: async () => { requests++; return { ok: true, status: 200, json: async () => ({ answers: [{ id: 1, letters: ['A'] }] }) }; } }); h.inject(); await h.advance(25);
  assert.equal(requests, 0); assert.equal(q.submit.clicks, 0); assert.equal(next.clicks, 0); assert.equal(q.controls[0].checked, false);
});

test('native newly shown popup supports sibling confirmation and blocks incomplete warnings', async () => {
  for (const incomplete of [false, true]) {
    const doc = document(); const q = quiz(doc); const wrapper = el('div'); wrapper.hidden = true;
    const message = el('div', { id: 'popcontent' }, incomplete ? '提交失败，请作答后提交' : '确认提交答案？'); const confirm = el('button', { id: 'popok' }, '确定'); wrapper.append(message, confirm); doc.body.append(wrapper);
    q.submit.onClick = () => { wrapper.hidden = false; }; const h = harness({ doc }); h.inject(); await h.advance(25); assert.equal(confirm.clicks, incomplete ? 0 : 1);
  }
});

test('aria-checked options without roles retain verifiable semantics', async () => {
  const doc = document(); const box = el('div', { class: 'TiMu' }); box.append(el('div', { class: 'Zy_TItle' }, '1.（单选题）首都在哪？'));
  const choices = ['北京', '上海'].map((word, i) => {
    const c = el('div', { 'aria-checked': 'false' }); c.append(el('span', {}, String.fromCharCode(65 + i)), el('span', {}, word));
    c.onClick = () => choices.forEach(x => x.setAttribute('aria-checked', String(x === c))); box.append(c); return c;
  }); const submit = el('button', {}, '提交'); doc.body.append(box, submit); const h = harness({ doc }); h.inject(); await h.advance(15);
  assert.equal(choices[0].getAttribute('aria-checked'), 'true'); assert.equal(submit.clicks, 1);
});

test('outline navigates current task to next clickable task span while excluding firstLayer', async () => {
  const doc = document(); const tree = el('div', { id: 'coursetree' }); const heading = el('div', { class: 'posCatalog_select firstLayer' }); const headingSpan = el('span', { class: 'posCatalog_name' }, '章节'); heading.append(headingSpan);
  const current = el('div', { class: 'posCatalog_select posCatalog_active', 'data-chapterid': '1' }); current.append(el('span', { class: 'posCatalog_name' }, '当前任务'));
  const target = el('div', { class: 'posCatalog_select', 'data-chapterid': '2' }); const span = el('span', { class: 'posCatalog_name' }, '下一任务'); target.append(span); tree.append(heading, current, target);
  const video = el('video'); video.ended = true; doc.body.append(tree, video); const h = harness({ doc, mode: 'v3' }); h.inject(); await h.advance(15);
  assert.equal(span.clicks, 1); assert.equal(headingSpan.clicks, 0);
});

test('pending grade text is not a completed numeric grade', async () => {
  const doc = document(); const frame = el('iframe'); frame.contentDocument = document('https://mooc1.chaoxing.com/work?chapterId=1'); frame.contentDocument.body.append(el('div', { class: 'score' }, '成绩尚未公布'));
  const next = el('button', { id: 'prevNextFocusNext' }, '下一节'); doc.body.append(frame, next); const h = harness({ doc, mode: 'v3' }); h.inject(); await h.advance(20); assert.equal(next.clicks, 0);
});

test('manual task handoff resumes a genuinely fresh visible player', async () => {
  const doc = document(); const frame = el('iframe'); frame.contentDocument = document('https://mooc1.chaoxing.com/work?chapterId=1'); quiz(frame.contentDocument); doc.body.append(frame);
  const h = harness({ doc, mode: 'v3' }); h.inject(); await h.advance(10);
  const playerDoc = document('https://mooc1.chaoxing.com/knowledge/cards?chapterId=2'); const video = el('video'); video.paused = true; video.play = async () => { video.paused = false; }; playerDoc.body.append(video); frame.contentDocument = playerDoc;
  await h.advance(10); assert.equal(video.paused, false);
});

test('completion deadline aliases respond to live config changes', async () => {
  const doc = document(); quiz(doc); const h = harness({ doc, mode: 'v3' }); const app = h.inject(); await h.advance(5);
  app.configs.quizCompletionWarningMs = 5; app.configs.quizCompletionTimeoutMs = 10; await h.advance(15); assert.equal(app.status, 'stopped');
});

test('submission correlated alertdialog and element message box confirm safely', async () => {
  for (const attrs of [{ role: 'alertdialog' }, { class: 'el-message-box' }]) {
    const doc = document(); const q = quiz(doc); const dialog = el('div', attrs, '确认提交？'); dialog.hidden = true; const confirm = el('button', {}, '确定'); dialog.append(confirm); doc.body.append(dialog); q.submit.onClick = () => { dialog.hidden = false; };
    const h = harness({ doc }); h.inject(); await h.advance(20); assert.equal(confirm.clicks, 1);
  }
});

test('V3 observes genuinely new external grade while retained questions stay visible', async () => {
  const doc = document(); quiz(doc); const next = el('button', { id: 'prevNextFocusNext' }, '下一节'); doc.body.append(next); const h = harness({ doc, mode: 'v3' }); h.inject(); await h.advance(10);
  doc.body.append(el('div', { class: 'mark_title' }, '本次成绩：100')); await h.advance(10); assert.equal(next.clicks, 1);
});

test('hidden old player and URL-only change cannot escape unresolved quiz wait', async () => {
  const doc = document(); const q = quiz(doc); const video = el('video'); video.hidden = true; video.paused = true; video.play = async () => { video.paused = false; }; doc.body.append(video);
  const h = harness({ doc, mode: 'v3' }); h.inject(); await h.advance(10); q.box.remove(); q.submit.remove(); video.hidden = false; h.win.location.search = '?courseId=1&chapterId=2'; doc.URL = h.win.location.href;
  await h.advance(10); assert.equal(video.paused, true);
});

test('preexisting unrelated popup is not confirmed after current submission', async () => {
  const doc = document(); const q = quiz(doc); const dialog = el('div', { role: 'alertdialog' }, '确认提交其他内容？'); const confirm = el('button', {}, '确定'); dialog.append(confirm); doc.body.append(dialog);
  const h = harness({ doc }); h.inject(); await h.advance(20); assert.equal(q.submit.clicks, 1); assert.equal(confirm.clicks, 0);
});

test('manual quiz-slot replacement discovers new player inside visible nested cards iframe', async () => {
  const doc = document(); const courseFrame = el('iframe'); courseFrame.contentDocument = document('https://mooc1.chaoxing.com/work?chapterId=1'); quiz(courseFrame.contentDocument); doc.body.append(courseFrame);
  const h = harness({ doc, mode: 'v3' }); h.inject(); await h.advance(10);
  const cards = document('https://mooc1.chaoxing.com/knowledge/cards?chapterId=2'); const playerFrame = el('iframe'); const player = document('https://mooc1.chaoxing.com/ananas/video/index.html');
  const video = el('video'); video.paused = true; video.play = async () => { video.paused = false; }; player.body.append(video); playerFrame.contentDocument = player; cards.body.append(playerFrame); courseFrame.contentDocument = cards;
  await h.advance(10); assert.equal(video.paused, false);
});
