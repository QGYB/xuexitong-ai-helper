// ==UserScript==
// @name         学习通课程播放器 V3
// @namespace    independent-course-controller
// @version      4.0.0
// @description  播放课程视频并等待当前章节测验完成
// @match        https://chaoxing.com/mycourse/studentstudy*
// @match        https://*.chaoxing.com/mycourse/studentstudy*
// @match        https://*.chaoxing.com/mooc2-ans/mycourse/studentstudy*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/* Generated from browser/course-engine.js by scripts/build-browser.mjs. */
(() => {
'use strict';
/* Independently authored course controller. This function is embedded by the builder. */
function createCourseController(mode, token) {
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
    quizWarnMs: 600000, quizStopMs: 900000, quizRetryLimit: 3, quizRetryDelayMs: 3000
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
    if (state.message === message) return;
    state.message = message;
    host.console[level](`[学习助手] ${message}`);
    const box = host.document.getElementById?.('xuexitong-independent-status');
    if (box) box.textContent = message;
  }
  function stop(reason = '已停止') {
    state.alive = false; state.status = 'stopped';
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
  function content(entries) {
    return entries.map(e => ({ doc: e.doc, slot: e.slot, task: e.task,
      video: all(e.doc, 'video').filter(visible),
      questions: all(e.doc, questionSelector).filter(visible).map(q => ({ node: q, text: textOf(q) })) }));
  }
  function fresh(before, after) {
    return after.some(now => {
      const old = before.find(e => e.slot === now.slot);
      if (!old) return now.video.length > 0 || now.questions.length > 0;
      if (now.doc !== old.doc) return now.video.length > 0 || now.questions.length > 0 || /work|quiz/i.test(now.doc.URL || '');
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
    const marker = all(control, '.num_option').find(node => node.getAttribute('name') === `answer${qid}`);
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
        try { return await response.json(); }
        catch { const error = new Error('答题响应不是有效JSON'); error.retryable = true; throw error; }
      };
      const payload = await Promise.race([request(), timeout]);
      if (!state.alive) return;
      if (!unchanged(snapshot)) throw new Error('请求期间题目或任务已改变，已取消');
      const answers = validateAnswers(payload, snapshot);
      record.answerApplied = true;
      applyAnswers(snapshot, answers);
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
        record.done = true; diagnostic('当前测验已显示新的成绩，准备下一任务'); advanceTask(entries); return;
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
    if (state.lastTime !== video.currentTime) { state.lastTime = video.currentTime; state.lastProgress = Date.now(); }
    const stalled = Date.now() - state.lastProgress >= Math.max(1, Number(configs.guardNoProgressMs) || 7000);
    if ((!video.paused && !stalled) || video.ended) return;
    if (Date.now() - state.lastPlayAt < Math.max(1, Number(configs.guardResumeCooldownMs) || 1500)) return;
    if (state.playAttempts >= Math.max(1, Number(configs.maxRetries ?? configs.playRetryLimit) || 10)) { fail('视频播放重试次数已用尽，请手动处理播放限制'); return; }
    state.playAttempts++;
    state.lastPlayAt = Date.now();
    const task = taskKey(video.ownerDocument);
    const stillCurrent = () => state.alive && state.video === video && taskKey(video.ownerDocument) === task && visible(video) && documents().some(e => all(e.doc, 'video').includes(video));
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
      const entries = documents();
      if (state.transition) {
        if (!fresh(state.transition.before, content(entries))) {
          if (Date.now() - state.transition.start >= Math.max(1, Number(configs.transitionTimeoutMs) || 45000)) fail('任务切换后未发现新内容，已停止；未跳过任务');
          return;
        }
        state.transition = null; state.quiz = null; state.video = null; state.playAttempts = 0; state.pageStarted = Date.now(); state.warned = false;
      }
      const entry = quizEntry(entries);
      if (entry) { await handleQuiz(entry, entries); return; }
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
  const onHide = () => stop('页面已离开，已取消所有工作');
  const api = {
    configs, get status() { return state.status; }, get message() { return state.message; },
    inspectQuiz() { const entry = quizEntry(documents()); if (!entry) return null; try { const snapshot = extract(entry); return snapshot?.rows.map(row => row.wire) || []; } catch (error) { return { error: error.message }; } },
    run, play: run,
    nextUnit() { if (state.alive) { reconcile(); schedule(); } return api; },
    stop,
    destroy() { stop('控制器已替换或销毁'); host.removeEventListener('pagehide', onHide); status.remove?.(); }
  };
  if (mode === 'console') { host.__WB_DRIVER = 'console'; host.__xuexitongConsoleDeepSeek = api; }
  else host.__xuexitongPlayerV3 = api;
  host.app = api;
  host.addEventListener('pagehide', onHide);
  const status = host.document.createElement('div');
  status.id = 'xuexitong-independent-status'; status.setAttribute('role', 'status');
  status.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:2147483647;background:#fff;color:#222;border:1px solid #777;padding:8px;max-width:360px;font:13px sans-serif';
  (host.document.body || host.document.documentElement).append(status);
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
        state.ready = true; state.status = 'running'; run();
      }).catch(() => { if (state.alive) fail('无法连接本地答题服务'); });
    return api;
  }
  state.status = 'running';
  return run();
}

createCourseController('v3', null);
})();
