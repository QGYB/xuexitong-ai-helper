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
    const doc = document(); const q = quiz(doc); const h = harness({ doc, config: { quizRetryLimit: 0 }, fetch: async () => response }); const app = h.inject(); await h.advance(15);
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
  const h = harness({ doc, config: { requestTimeoutMs: 10, quizRetryLimit: 0 }, fetch: (url, options) => { signal = options.signal; return new Promise(() => {}); } }); const app = h.inject(); await h.advance(30);
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
    const doc = document(); const q = quiz(doc); const h = harness({ doc, config: { quizRetryLimit: 0 }, fetch: async () => ({ ok: true, status: 200, json: async () => { if (body === null) throw new Error('bad JSON'); return body; } }) });
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

function extractionDump(h) {
  return h.logs.filter(args => String(args[0]).includes('测验提取诊断')).map(args => JSON.parse(args[1]));
}

test('unusable choices dump individual control evidence before stopping', async () => {
  const doc = document(); const q = quiz(doc, { labels: ['A. 北京选项文字很长用于确认诊断只输出前二十个字符而不是全部内容', 'B. 上海'] });
  q.controls[0].disabled = true; q.controls[1].setAttribute('aria-disabled', 'true');
  let calls = 0; const h = harness({ doc, config: { quizRetryLimit: 0 }, fetch: async () => { calls++; throw Error('must not request'); } });
  const app = h.inject(); await h.advance(10);
  assert.equal(app.status, 'stopped'); assert.equal(calls, 0); assert.equal(q.submit.clicks, 0);
  const dumps = extractionDump(h); assert.equal(dumps.length, 1);
  assert.equal(dumps[0].questionIndex, 1); assert.equal(dumps[0].controls.length, 2);
  assert.equal(dumps[0].controls[0].type, 'radio'); assert.equal(dumps[0].controls[0].id, 'o0');
  assert.equal(dumps[0].controls[0].disabled, true); assert.equal(dumps[0].controls[1].ariaDisabled, 'true');
  assert.equal(dumps[0].controls[0].visible, true); assert.ok(dumps[0].controls[0].optionTarget);
  assert.equal([...dumps[0].controls[0].text].length, 20);
});

for (const caption of ['重新作答', '重做', '继续作答']) {
  test(`disabled quiz enters editable state through ${caption} exactly once`, async () => {
    const doc = document(); const q = quiz(doc); q.controls.forEach(c => { c.disabled = true; });
    const retry = el('button', {}, caption); doc.body.append(retry); const requests = [];
    const h = harness({ doc, fetch: async (url, options) => { requests.push(JSON.parse(options.body)); return { ok: true, status: 200, json: async () => ({ answers: [{ id: 1, letters: ['A'] }] }) }; } });
    retry.onClick = () => h.win.setTimeout(() => q.controls.forEach(c => { c.disabled = false; }), 8);
    h.inject(); await h.advance(30);
    assert.equal(retry.clicks, 1); assert.equal(requests.length, 1); assert.equal(q.controls[0].checked, true); assert.equal(q.submit.clicks, 1);
  });
}

test('retry that never unlocks is bounded and never clicks repeatedly or submits', async () => {
  const doc = document(); const q = quiz(doc); q.controls.forEach(c => { c.disabled = true; });
  const retry = el('button', {}, '重新作答'); doc.body.append(retry);
  const h = harness({ doc, config: { quizLoadTimeoutMs: 15 } }); const app = h.inject(); await h.advance(30);
  assert.equal(retry.clicks, 1); assert.equal(app.status, 'stopped'); assert.equal(q.submit.clicks, 0); assert.ok(extractionDump(h).length);
});

test('inspection cannot restart a quiz and disabled retry controls are not clicked', async () => {
  for (const disabled of [false, true]) {
    const doc = document(); const q = quiz(doc); q.controls.forEach(c => { c.disabled = true; });
    const retry = el('button', {}, '重新作答'); retry.disabled = disabled; doc.body.append(retry);
    const h = harness({ doc, config: { quizRetryLimit: 0 } }); const app = h.inject(); app.inspectQuiz(); assert.equal(retry.clicks, 0);
    if (disabled) { await h.advance(10); assert.equal(retry.clicks, 0); assert.equal(app.status, 'stopped'); }
    else app.stop();
  }
});

test('hidden native choices use visible li and skin containers even with a hidden inner label', async () => {
  for (const [tag, attrs] of [['li', {}], ['div', { class: 'answerBg' }], ['div', { class: 'option' }], ['div', { 'data-option': 'A' }]]) {
    const doc = document(); const q = quiz(doc); q.box.querySelectorAll('label').forEach(label => label.remove());
    q.controls.forEach((control, index) => {
      control.remove(); control.isConnected = true; control.style.display = 'none';
      const container = el(tag, attrs, index ? 'B. 上海' : 'A. 北京');
      const hiddenLabel = el('label'); hiddenLabel.hidden = true; hiddenLabel.append(control); container.append(hiddenLabel);
      container.onClick = () => control.click(); q.box.append(container);
    });
    const h = harness({ doc }); h.inject(); await h.advance(20);
    assert.equal(q.controls[0].checked, true); assert.equal(q.submit.clicks, 1);
  }
});

test('unwrapped miscellaneous checkboxes do not change quiz choices or answer cardinality', async () => {
  const doc = document(); const q = quiz(doc); const extras = Array.from({ length: 9 }, (_, i) => el('input', { type: 'checkbox', id: `setting${i}` }));
  extras.forEach(c => { c.disabled = true; q.box.append(c); }); let payload;
  const h = harness({ doc, fetch: async (url, options) => { payload = JSON.parse(options.body); return { ok: true, status: 200, json: async () => ({ answers: [{ id: 1, letters: ['A'] }] }) }; } });
  h.inject(); await h.advance(20);
  assert.equal(payload?.questions[0].options.length, 2); assert.equal(q.submit.clicks, 1); assert.ok(extras.every(c => c.clicks === 0));
});

test('read-only quiz with a current grade or completed marker takes completion without redoing', async () => {
  for (const marker of ['本次成绩：100', '已完成']) {
    const doc = document(); const q = quiz(doc); q.controls.forEach(c => { c.disabled = true; });
    const retry = el('button', {}, '重新作答'); const next = el('button', { id: 'prevNextFocusNext' }, '下一节');
    doc.body.append(el('div', { class: 'mark_title' }, marker), retry, next); let calls = 0;
    const h = harness({ doc, fetch: async () => { calls++; throw Error('must not answer completed work'); } }); h.inject(); await h.advance(20);
    assert.equal(next.clicks, 1); assert.equal(retry.clicks, 0); assert.equal(calls, 0); assert.equal(q.submit.clicks, 0);
  }
});

test('unsupported mixed text question dumps its structure without answering supported rows', async () => {
  const doc = document(); const q = quiz(doc); const fill = el('div', { class: 'TiMu' });
  fill.append(el('div', { class: 'Zy_TItle', 'data-type': '简答题' }, '2.（简答题）说明原因'), el('textarea', { id: 'essay' })); doc.body.append(fill);
  let calls = 0; const h = harness({ doc, fetch: async () => { calls++; throw Error('must not answer partial quiz'); } });
  const app = h.inject(); await h.advance(10);
  assert.equal(app.status, 'stopped'); assert.equal(calls, 0); assert.equal(q.submit.clicks, 0);
  assert.ok(extractionDump(h).some(dump => dump.questionIndex === 2 && dump.otherControls.some(c => c.type === 'textarea')));
});

test('a submitted quiz waits for grading when the platform disables choices and offers redo', async () => {
  const doc = document(); const q = quiz(doc); const retry = el('button', {}, '重新作答'); const next = el('button', { id: 'prevNextFocusNext' }, '下一节');
  doc.body.append(retry, next); const h = harness({ doc });
  q.submit.onClick = () => { q.controls.forEach(c => { c.disabled = true; }); h.win.setTimeout(() => doc.body.append(el('div', { class: 'score' }, '本次成绩：100')), 12); };
  h.inject(); await h.advance(30);
  assert.equal(q.submit.clicks, 1); assert.equal(retry.clicks, 0); assert.equal(next.clicks, 1);
});

test('disabled choices during an in-flight answer never trigger redo or accept late answers', async () => {
  const doc = document(); const q = quiz(doc); const retry = el('button', {}, '重新作答'); doc.body.append(retry); let resolve;
  const h = harness({ doc, fetch: () => new Promise(r => { resolve = r; }) }); h.inject(); await h.advance(5);
  q.controls.forEach(c => { c.disabled = true; }); await h.advance(5);
  resolve({ ok: true, status: 200, json: async () => ({ answers: [{ id: 1, letters: ['A'] }] }) }); await h.advance(10);
  assert.equal(retry.clicks, 0); assert.equal(q.submit.clicks, 0); assert.equal(q.controls[0].checked, false);
});

test('disabled choices beside editable unsupported work and an old score cannot count as completed', async () => {
  const doc = document(); const q = quiz(doc); q.controls.forEach(c => { c.disabled = true; });
  const fill = el('div', { class: 'TiMu' }); fill.append(el('div', { class: 'Zy_TItle' }, '2.（简答题）原因'), el('textarea'));
  const next = el('button', { id: 'prevNextFocusNext' }, '下一节'); doc.body.append(fill, el('div', { class: 'score' }, '本次成绩：60'), next);
  const h = harness({ doc }); h.inject(); await h.advance(20); assert.equal(next.clicks, 0); assert.equal(q.submit.clicks, 0);
});

test('unrelated native aria checkbox cannot enter the semantic option fallback', async () => {
  const doc = document(); const q = quiz(doc); q.controls.forEach(c => c.remove()); q.box.querySelectorAll('label').forEach(c => c.remove());
  const choices = ['A. 北京', 'B. 上海'].map(word => el('div', { role: 'radio', 'aria-checked': 'false' }, word));
  choices.forEach(control => { control.onClick = () => choices.forEach(c => c.setAttribute('aria-checked', String(c === control))); q.box.append(control); });
  q.box.append(el('input', { type: 'checkbox', 'aria-checked': 'false' }));
  const h = harness({ doc }); h.inject(); await h.advance(20); assert.equal(q.submit.clicks, 1); assert.equal(choices[0].getAttribute('aria-checked'), 'true');
});

test('an unparsed question without controls cannot inherit completion from disabled neighbouring choices', async () => {
  const doc = document(); const q = quiz(doc); q.controls.forEach(c => { c.disabled = true; });
  const unknown = el('div', { class: 'TiMu' }); unknown.append(el('div', { class: 'Zy_TItle' }, '2.（简答题）未加载的输入区'));
  const next = el('button', { id: 'prevNextFocusNext' }, '下一节'); doc.body.append(unknown, el('div', { class: 'score' }, '本次成绩：60'), next);
  const h = harness({ doc }); h.inject(); await h.advance(20); assert.equal(next.clicks, 0); assert.equal(q.submit.clicks, 0);
});

function mirroredQuiz({ duplicate = false } = {}) {
  const doc = document(); const labels = ['A\n媚叔', 'B\n隐世', 'C\n富民', 'D\n帝力']; const q = quiz(doc, { labels });
  q.box.querySelectorAll('label').forEach(label => label.remove());
  q.controls.forEach((control, index) => {
    control.remove(); control.isConnected = true; control.id = ''; control.attrs.id = ''; control.style.display = 'none';
    const hidden = el('li', {}, labels[index]); hidden.hidden = true; hidden.append(control); q.box.append(hidden);
    const rendered = el('li', {}, labels[index].replace('\n', '. ')); rendered.onClick = () => control.click(); q.box.append(rendered);
    if (duplicate && index === 0) q.box.append(el('li', {}, labels[index]));
  });
  return { doc, q };
}

test('hidden unnamed radios map to unique visible mirrored choices from the screenshot shape', async () => {
  const { doc, q } = mirroredQuiz(); let payload;
  const h = harness({ doc, fetch: async (url, options) => { payload = JSON.parse(options.body); return { ok: true, status: 200, json: async () => ({ answers: [{ id: 1, letters: ['A'] }] }) }; } });
  h.inject(); await h.advance(20); assert.equal(q.submit.clicks, 1); assert.equal(q.controls[0].checked, true);
  assert.deepEqual(payload.questions[0].options.map(option => option.text), ['媚叔', '隐世', '富民', '帝力']);
});

test('ambiguous visible mirrored choices never receive an arbitrary click', async () => {
  const { doc, q } = mirroredQuiz({ duplicate: true }); const h = harness({ doc, config: { quizRetryLimit: 0 } });
  const app = h.inject(); await h.advance(15); assert.equal(app.status, 'stopped'); assert.equal(q.submit.clicks, 0); assert.ok(q.controls.every(c => c.clicks === 0));
  const dump = extractionDump(h)[0]; assert.ok(dump.controls[0].containers.some(container => container.hidden));
});

test('display contents labels with visible children remain valid click targets', async () => {
  const doc = document(); const q = quiz(doc); q.box.querySelectorAll('label').forEach(label => label.remove());
  q.controls.forEach((control, index) => {
    control.remove(); control.isConnected = true; control.style.display = 'none';
    const label = el('label'); label.style.display = 'contents'; label.getClientRects = () => [];
    label.append(control, el('span', {}, index ? 'B. 上海' : 'A. 北京')); label.onClick = () => control.click(); q.box.append(label);
  });
  const h = harness({ doc }); h.inject(); await h.advance(20); assert.equal(q.submit.clicks, 1); assert.equal(q.controls[0].checked, true);
});

test('answer HTTP errors retry current quiz then submit exactly once', async () => {
  for (const status of [429, 502]) {
    const doc = document(); const q = quiz(doc); let calls = 0;
    const h = harness({ doc, config: { quizRetryLimit: 2, quizRetryDelayMs: 5 }, fetch: async () => ++calls === 1 ? { ok: false, status } : { ok: true, status: 200, json: async () => ({ answers: [{ id: 1, letters: ['A'] }] }) } });
    h.inject(); await h.advance(30); assert.equal(calls, 2); assert.equal(q.submit.clicks, 1);
  }
});

test('repeated transient answer failures exhaust retries without selecting or submitting', async () => {
  const doc = document(); const q = quiz(doc); let calls = 0;
  const h = harness({ doc, config: { quizRetryLimit: 2, quizRetryDelayMs: 5 }, fetch: async () => { calls++; return { ok: false, status: 502 }; } });
  const app = h.inject(); await h.advance(35); assert.equal(calls, 3); assert.equal(app.status, 'stopped'); assert.equal(q.submit.clicks, 0); assert.equal(q.controls[0].checked, false);
});

test('timed-out answer aborts, retries, and ignores the first late response', async () => {
  const doc = document(); const q = quiz(doc); let calls = 0; let firstResolve; let firstSignal;
  const h = harness({ doc, config: { quizRetryLimit: 1, quizRetryDelayMs: 5, requestTimeoutMs: 8 }, fetch: (url, options) => {
    calls++; if(calls===1){firstSignal=options.signal;return new Promise(resolve=>{firstResolve=resolve;});}
    return Promise.resolve({ok:true,status:200,json:async()=>({answers:[{id:1,letters:['B']}]})});
  } });
  h.inject(); await h.advance(35); assert.equal(firstSignal.aborted,true); assert.equal(calls,2); assert.equal(q.submit.clicks,1); assert.equal(q.controls[1].checked,true);
  firstResolve({ok:true,status:200,json:async()=>({answers:[{id:1,letters:['A']}]})}); await h.flush(); assert.equal(q.controls[0].checked,false); assert.equal(q.submit.clicks,1);
});

test('temporarily missing choice targets recover through bounded extraction retry', async () => {
  const {doc,q}=mirroredQuiz(); const mirrors=q.box.querySelectorAll('li').filter(node=>!node.hidden); mirrors.forEach(node=>{node.hidden=true;});
  const h=harness({doc,config:{quizRetryLimit:2,quizRetryDelayMs:5}});h.inject();await h.advance(5);mirrors.forEach(node=>{node.hidden=false;});await h.advance(25);assert.equal(q.submit.clicks,1);
});

test('a click or submit failure after applying answers is never automatically repeated',async()=>{
 const doc=document();const q=quiz(doc);let calls=0;q.submit.onClick=()=>{throw Error('submit interrupted');};
 const h=harness({doc,config:{quizRetryLimit:3,quizRetryDelayMs:5},fetch:async()=>{calls++;return{ok:true,status:200,json:async()=>({answers:[{id:1,letters:['A']}]})};}});
 const app=h.inject();await h.advance(35);assert.equal(calls,1);assert.equal(q.submit.clicks,1);assert.equal(app.status,'stopped');
});

test('retry refreshes replaced identical option nodes before confirming submission',async()=>{
 const doc=document();const q=quiz(doc);let calls=0;const dialog=el('div',{role:'dialog'},'确认提交？');dialog.hidden=true;const confirm=el('button',{},'确定');dialog.append(confirm);doc.body.append(dialog);q.submit.onClick=()=>{dialog.hidden=false;};
 const h=harness({doc,config:{quizRetryLimit:1,quizRetryDelayMs:5},fetch:async()=>{
  if(++calls===1){h.win.setTimeout(()=>{q.controls=q.controls.map((old,index)=>{old.remove();const control=el('input',{type:'radio',id:`o${index}`,name:'q1'});q.box.append(control);return control;});},1);return{ok:false,status:502};}
  return{ok:true,status:200,json:async()=>({answers:[{id:1,letters:['A']}]})};
 }});h.inject();await h.advance(35);assert.equal(calls,2);assert.equal(q.controls[0].checked,true);assert.equal(q.submit.clicks,1);assert.equal(confirm.clicks,1);
});

function legacyAriaQuiz({ hidden = false, type = '单选题', stale = false, letters: optionLetters = ['A', 'B'] } = {}) {
  const doc = document(); const q = quiz(doc, { type });
  q.controls.forEach(c => c.remove()); q.box.querySelectorAll('label').forEach(c => c.remove());
  const list = el('ul', { class: 'Zy_ulTop', 'aria-hidden': 'true' }); list.hidden = hidden;
  const answer = el('input', { type: 'hidden', name: 'answer123', id: 'answer123', value: '' }); q.box.append(answer, list);
  const controls = optionLetters.map((letter, i) => {
    const judgment = type === '判断题';
    const li = el('li', { role: type === '多选题' ? 'checkbox' : 'radio', qid: '123', qtype: type === '多选题' ? '1' : judgment ? '3' : '0' });
    li.append(el('span', { class: 'num_option', name: 'answer123', data: judgment ? String(i === 0) : letter }, letter), el('a', {}, judgment ? i ? '错' : '对' : ['北京', '上海', '杭州', '深圳'][i]));
    li.onClick = () => { if (stale) return;
      if (judgment) { answer.value = String(i === 0); controls.forEach((c,j) => c.setAttribute('aria-checked', String(i === j))); return; }
      const picked = type === '多选题' ? new Set(answer.value) : new Set();
      if (picked.has(letter)) picked.delete(letter); else picked.add(letter);
      answer.value = [...picked].sort().join(''); controls.forEach((c, j) => c.setAttribute('aria-checked', String(picked.has(optionLetters[j])))); };
    list.append(li); return li;
  });
  return { doc, q, controls, answer };
}

test('rendered legacy list options ignore accessibility hiding and verify actual answer state', async () => {
  for (const type of ['单选题', '多选题']) {
    const { doc, q, controls, answer } = legacyAriaQuiz({ type });
    const h = harness({ doc }); h.inject(); await h.advance(20);
    assert.equal(q.submit.clicks, 1); assert.equal(answer.value, 'A'); assert.equal(controls[0].getAttribute('aria-checked'), 'true');
  }
});

test('legacy list hidden visually remains unusable despite known answer metadata', async () => {
  const { doc, q, controls } = legacyAriaQuiz({ hidden: true });
  const h = harness({ doc, config: { quizRetryLimit: 0 } }); const app = h.inject(); await h.advance(20);
  assert.equal(app.status, 'stopped'); assert.equal(q.submit.clicks, 0); assert.ok(controls.every(c => c.clicks === 0));
});

test('legacy list selection must change the linked answer state before submitting', async () => {
  const { doc, q } = legacyAriaQuiz({ stale: true });
  const h = harness({ doc }); const app = h.inject(); await h.advance(20);
  assert.equal(app.status, 'stopped'); assert.equal(q.submit.clicks, 0);
});

test('current submission confirms the platform popup in its ancestor course document once', async () => {
  const doc = document(); const frame = el('iframe'); frame.contentDocument = document('https://mooc1.chaoxing.com/work?chapterId=1'); doc.body.append(frame);
  const q = quiz(frame.contentDocument); const popup = el('div', { id: 'workpop' }); popup.hidden = true;
  const prompt = el('p', { id: 'popcontent' }, '确认提交？'); const bottom = el('div'); const confirm = el('a', { id: 'popok', role: 'button' }, '提交');
  bottom.append(confirm); popup.append(prompt, bottom); doc.body.append(popup); q.submit.onClick = () => { popup.hidden = false; };
  const h = harness({ doc }); h.inject(); await h.advance(30); assert.equal(confirm.clicks, 1); assert.equal(q.submit.clicks, 1);
});

test('ancestor popup already visible before submitting cannot be confirmed', async () => {
  const doc = document(); const frame = el('iframe'); frame.contentDocument = document('https://mooc1.chaoxing.com/work?chapterId=1'); doc.body.append(frame); quiz(frame.contentDocument);
  const popup = el('div', { id: 'workpop' }, '确认提交？'); const confirm = el('a', { id: 'popok' }, '提交'); popup.append(confirm); doc.body.append(popup);
  const h = harness({ doc }); h.inject(); await h.advance(20); assert.equal(confirm.clicks, 0);
});

test('graded review with retained noninteractive options recognizes achievement and never answers again', async () => {
  const doc = document(); const box = el('div', { class: 'TiMu newTiMu ans-cc' }); box.append(el('div', { class: 'Zy_TItle' }, '1. 单选题 首都在哪？'));
  const list = el('ul', { 'aria-hidden': 'true' }); list.append(el('li', { role: 'option' }, 'A、北京'), el('li', { role: 'option' }, 'B、上海')); box.append(list);
  const next = el('button', { id: 'prevNextFocusNext' }, '下一节'); doc.body.append(box, el('span', { class: 'achievement' }, '本次成绩66.6分'), next);
  let calls = 0; const h = harness({ doc, fetch: async () => { calls++; throw Error('must not answer review'); } }); h.inject(); await h.advance(20);
  assert.equal(calls, 0); assert.equal(next.clicks, 1);
});

test('legacy judgment uses boolean stored values while the answer protocol uses letters', async () => {
  for (const [letter, value] of [['A', 'true'], ['B', 'false']]) {
    const { doc, q, answer } = legacyAriaQuiz({ type: '判断题' }); let payload;
    const h = harness({ doc, fetch: async (url, options) => { payload = JSON.parse(options.body); return { ok: true, status: 200, json: async () => ({ answers: [{ id: 1, letters: [letter] }] }) }; } });
    h.inject(); await h.advance(20); assert.equal(answer.value, value); assert.equal(q.submit.clicks, 1);
    assert.equal(payload.questions[0].type, '判断题'); assert.deepEqual(payload.questions[0].options.map(o => o.text), ['对', '错']);
  }
});

test('legacy judgment preserves an already selected false answer without toggling it', async () => {
  const { doc, q, answer, controls } = legacyAriaQuiz({ type: '判断题' }); answer.value = 'false';
  const h = harness({ doc, fetch: async () => ({ ok: true, status: 200, json: async () => ({ answers: [{ id: 1, letters: ['B'] }] }) }) });
  h.inject(); await h.advance(20); assert.equal(q.submit.clicks, 1); assert.equal(answer.value, 'false'); assert.ok(controls.every(c => c.clicks === 0));
});

test('legacy multiple choice selects all requested letters and clears only the incorrect previous choice', async () => {
  const { doc, q, answer, controls } = legacyAriaQuiz({ type: '多选题', letters: ['A','B','C','D'] }); answer.value = 'BC';
  const h = harness({ doc, fetch: async () => ({ ok: true, status: 200, json: async () => ({ answers: [{ id: 1, letters: ['A','C'] }] }) }) });
  h.inject(); await h.advance(20); assert.equal(q.submit.clicks, 1); assert.equal(answer.value, 'AC');
  assert.deepEqual(controls.map(c => c.clicks), [1,1,0,0]);
});

test('legacy multiple choice with comma-separated values preserves existing correct selections', async () => {
  const { doc, q, answer, controls } = legacyAriaQuiz({ type: '多选题', letters: ['A','B','C','D'] }); answer.value = 'A,C';
  const h = harness({ doc, fetch: async () => ({ ok: true, status: 200, json: async () => ({ answers: [{ id: 1, letters: ['A','C'] }] }) }) });
  h.inject(); await h.advance(20); assert.equal(q.submit.clicks, 1); assert.equal(answer.value, 'A,C'); assert.ok(controls.every(c => c.clicks === 0));
});

test('mixed graded review recognizes judgment answer blocks without rendering any choices', async () => {
  const doc = document();
  for (const type of ['单选题','判断题','多选题']) {
    const box = el('div', { class: 'TiMu' }); box.append(el('div', { class: 'Zy_TItle' }, `${type} 合成题`));
    if (type === '判断题') { const result = el('div', { class: 'newAnswerBx' }); result.append(el('div', { class: 'answerCon' }, '错'), el('span', { class: 'scoreNum' }, '50.0')); box.append(result); }
    else { const list = el('ul', { 'aria-hidden':'true' }); list.append(el('li', {role:'option'}, 'A、甲'), el('li', {role:'option'}, 'B、乙')); box.append(list); }
    doc.body.append(box);
  }
  const next = el('button', { id: 'prevNextFocusNext' }, '下一节'); doc.body.append(el('span', { class: 'achievement' }, '本次成绩50分'), next);
  let calls = 0; const h = harness({ doc, fetch: async () => { calls++; throw Error('must not reanswer review'); } }); h.inject(); await h.advance(20);
  assert.equal(calls, 0); assert.equal(next.clicks, 1);
});

test('an old incomplete answer block without per-question grade cannot complete an unresolved question', async () => {
  const doc = document(); const box = el('div', { class: 'TiMu' }); box.append(el('div', { class: 'Zy_TItle' }, '判断题 合成题'));
  const result = el('div', { class: 'newAnswerBx' }); result.append(el('div', { class: 'answerCon' }, '错')); box.append(result);
  const next = el('button', { id:'prevNextFocusNext' }, '下一节'); doc.body.append(box, el('span', {class:'achievement'}, '本次成绩50分'), next);
  const h = harness({ doc, config: { quizRetryLimit: 0 } }); h.inject(); await h.advance(20); assert.equal(next.clicks, 0);
});

test('question content changed while waiting for an answer retry cancels automatic answering', async () => {
  const doc = document(); const q = quiz(doc); let calls = 0;
  const h = harness({ doc, config: { quizRetryLimit: 1, quizRetryDelayMs: 15 }, fetch: async () => {
    calls++; return calls === 1 ? { ok:false, status:502 } : { ok:true, status:200, json:async()=>({ answers:[{id:1,letters:['A']}] }) };
  } });
  const app = h.inject(); await h.advance(7); q.box.querySelector('.Zy_TItle').text = '1. （单选题）重试等待时换成另一题？';
  await h.advance(35); assert.equal(app.status, 'stopped'); assert.equal(calls, 1); assert.equal(q.submit.clicks, 0); assert.ok(q.controls.every(c => !c.checked));
});

for (const id of ['', 'workpop']) {
  test(`new unrelated ancestor confirmation is ignored even after submission (${id || 'generic dialog'})`, async () => {
    const doc = document(); const frame = el('iframe'); frame.contentDocument = document('https://mooc1.chaoxing.com/work?chapterId=1'); doc.body.append(frame); const q = quiz(frame.contentDocument);
    const popup = el('div', id ? { id } : { role:'dialog' }); popup.hidden = true;
    popup.append(el('p', { id:'popcontent' }, '确认提交其他课程的信息？')); const confirm = el('button', { id:'popok' }, '确定'); popup.append(confirm); doc.body.append(popup);
    q.submit.onClick = () => { popup.hidden = false; };
    const h = harness({ doc }); h.inject(); await h.advance(25); assert.equal(q.submit.clicks, 1); assert.equal(confirm.clicks, 0);
  });
}

for (const editable of [false,true]) {
  test(`mixed disabled/native and judgment review ${editable ? 'rejects an editable question' : 'advances only when all rows are read only'}`, async () => {
    const doc = document(); const q = quiz(doc); q.controls.forEach(c => { c.disabled = !editable; }); q.submit.remove();
    const judgment = el('div', { class:'TiMu' }); judgment.append(el('div', {class:'Zy_TItle'}, '判断题 合成题'));
    const result = el('div', {class:'newAnswerBx'}); result.append(el('div', {class:'answerCon'}, '错'),el('span',{class:'scoreNum'},'50.0')); judgment.append(result);
    const next = el('button', { id:'prevNextFocusNext' }, '下一节'); doc.body.append(judgment,el('span',{class:'achievement'},'本次成绩50分'),next);
    let calls = 0; const h = harness({ doc, config:{quizRetryLimit:0}, fetch:async()=>{calls++;throw Error('must not answer');} }); h.inject(); await h.advance(20);
    assert.equal(calls,0); assert.equal(next.clicks,editable?0:1);
  });
}
