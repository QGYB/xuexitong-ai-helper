import vm from 'node:vm';
import fs from 'node:fs';

export class Element {
  constructor(tag, attrs = {}, text = '') {
    this.tagName = tag.toUpperCase(); this.attrs = attrs; this.text = text;
    this.children = []; this.parentElement = null; this.style = {}; this.hidden = false;
    this.checked = false; this.disabled = false; this.clicks = 0; this.isConnected = true;
    this.id = attrs.id || ''; this.type = attrs.type || ''; this.name = attrs.name || '';
    this.value = attrs.value || ''; this.ownerDocument = null;
  }
  append(...children) { for (const child of children) { child.parentElement = this; child.attach(this.ownerDocument); this.children.push(child); } return this; }
  attach(doc) { this.ownerDocument = doc; this.children.forEach(c => c.attach(doc)); }
  get textContent() { return this.text + this.children.map(c => c.textContent).join('\n'); }
  get innerText() { return this.textContent; }
  getAttribute(key) { return this.attrs[key] ?? null; }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  matches(selector) {
    return selector.split(',').some(s => {
      s = s.trim(); if (!s) return false;
      const attrs = [...s.matchAll(/\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\]/g)];
      if (attrs.some(([, key, val]) => this.getAttribute(key) === null || (val !== undefined && this.getAttribute(key) !== val))) return false;
      const base = s.replace(/\[[^\]]+\]/g, '');
      const tag = base.match(/^[a-zA-Z]+/)?.[0];
      if (tag && tag.toUpperCase() !== this.tagName) return false;
      const id = base.match(/#([\w-]+)/)?.[1]; if (id && this.id !== id) return false;
      const classes = [...base.matchAll(/\.([\w-]+)/g)].map(m => m[1]);
      return classes.every(c => (this.attrs.class || '').split(/\s+/).includes(c));
    });
  }
  querySelectorAll(selector) { return this.children.flatMap(c => [...(c.matches(selector) ? [c] : []), ...c.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { for (let e = this; e; e = e.parentElement) if (e.matches(selector)) return e; return null; }
  contains(el) { return this === el || this.children.some(c => c.contains(el)); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this); this.isConnected = false; }
  getClientRects() { return this.hidden || this.style.display === 'none' ? [] : [{}]; }
  dispatchEvent() { return true; }
  click() {
    this.clicks++;
    if (this.type === 'checkbox') this.checked = !this.checked;
    if (this.type === 'radio') {
      for (const c of this.ownerDocument.querySelectorAll('input')) if (c.type === 'radio' && c.name === this.name) c.checked = false;
      this.checked = true;
    }
    this.onClick?.();
  }
}
export const el = (tag, attrs, text) => new Element(tag, attrs, text);
export function document(url = 'https://mooc1.chaoxing.com/mycourse/studentstudy?courseId=1&chapterId=1') {
  const doc = el('html'); doc.attach(doc); doc.URL = url; doc.readyState = 'complete';
  doc.body = el('body'); doc.append(doc.body); doc.createElement = tag => { const e = el(tag); e.attach(doc); return e; };
  return doc;
}
export function quiz(doc, { type = '单选题', title = '1. （单选题）首都在哪？', labels = ['A. 北京', 'B. 上海'], complete = false } = {}) {
  const box = el('div', { class: 'TiMu' });
  box.append(el('div', { class: 'Zy_TItle', 'data-type': type }, title));
  const controls = labels.map((label, i) => {
    const input = el('input', { type: type === '多选题' ? 'checkbox' : 'radio', name: 'q1', id: `o${i}` });
    const lab = el('label', { for: input.id }, label); box.append(input, lab); return input;
  });
  const submit = el('button', { 'data-action': 'submit' }, '提交'); doc.body.append(box, submit);
  if (complete) doc.body.append(el('div', { class: 'score' }, '本次成绩：100'));
  return { box, controls, submit };
}
export function harness({ mode = 'console', doc = document(), fetch, health, driver, url = doc.URL, config = {} } = {}) {
  const timers = new Map(); let next = 1; let now = 0; const logs = []; const listeners = {};
  const location = new URL(url);
  const win = { document: doc, location, console: { log: (...x) => logs.push(x), warn: (...x) => logs.push(x), error: (...x) => logs.push(x) },
    setTimeout(fn, ms = 0) { const id = next++; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); }, addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    removeEventListener(name, fn) { listeners[name] = (listeners[name] || []).filter(x => x !== fn); },
    getComputedStyle: e => ({ display: e.style.display || 'block', visibility: e.style.visibility || 'visible' }),
    Event: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    fetch: async (url, options) => url.endsWith('/health') ? health ? health(url, options) : { ok: true, status: 200 } : fetch ? fetch(url, options) : ({ ok: true, status: 200, json: async () => ({ answers: [{ id: 1, letters: ['A'] }] }) }),
    AbortController, URL, __WB_DRIVER: driver, __XUEXITONG_CONFIG__: { tickMs: 5, transitionTimeoutMs: 60, quizWarnMs: 40, quizStopMs: 80, ...config } };
  win.window = win; win.top = win; doc.defaultView = win;
  const context = vm.createContext({ ...win, window: win, Date: class extends Date { static now() { return now; } } });
  function inject(m = mode) { vm.runInContext(fs.readFileSync(new URL(m === 'console' ? '../deepseek-console/xuexitong-console.js' : '../xuexitong_v3.user.js', import.meta.url), 'utf8').replace("const LOCAL_TOKEN = '__LOCAL_TOKEN__';", "const LOCAL_TOKEN = 'synthetic-test-token';"), context); return m === 'console' ? win.__xuexitongConsoleDeepSeek : win.__xuexitongPlayerV3; }
  async function flush() { for (let i = 0; i < 25; i++) await Promise.resolve(); }
  async function advance(ms = 5) {
    await flush();
    const end = now + ms; let count = 0;
    while (true) {
      const hit = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!hit) break; if (++count > 1000) throw new Error('timer loop');
      now = hit[1].at; timers.delete(hit[0]); hit[1].fn(); await flush();
    }
    now = end; await flush();
  }
  return { win, doc, timers, logs, inject, advance, flush, pagehide() { (listeners.pagehide || []).forEach(fn => fn()); } };
}
