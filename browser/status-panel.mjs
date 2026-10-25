// Serialized into each top-level document. This UI has no credentials or service access.
export function installStatusPanel({withAnswer = true} = {}) {
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
