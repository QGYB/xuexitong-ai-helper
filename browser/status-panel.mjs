// Serialized into each top-level document. This UI has no credentials or service access.
export function installStatusPanel({withAnswer = true} = {}) {
  const host = window, doc = host.document;
  if (host !== host.top) return null;
  if (host.__WBStatusPanel) { host.__WBStatusPanel.ensure(); return host.__WBStatusPanel; }
  const status = doc.createElement('div');
  status.id = 'xuexitong-independent-status';
  status.setAttribute('role', 'group'); status.setAttribute('aria-label', '学习助手');
  status.style.cssText = 'position:fixed!important;bottom:8px!important;right:8px!important;z-index:2147483647!important;display:flex!important;visibility:visible!important;opacity:1!important;align-items:center;gap:8px;background:#fff;color:#222;border:1px solid #777;border-radius:6px;padding:8px;max-width:calc(100vw - 16px);box-sizing:border-box;font:13px sans-serif';
  const message = doc.createElement('span');
  message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
  message.style.cssText = 'min-width:0;max-width:360px;overflow-wrap:anywhere;';
  message.textContent = '学习助手已就绪，进入章节学习页后可答题';
  const button = withAnswer ? doc.createElement('button') : null;
  let owner = null;
  if (button) {
    button.id = 'xuexitong-answer-current'; button.type = 'button'; button.textContent = '一键开始做题';
    button.title = '进入章节学习页后，点击处理当前测验，完成后停留';
    button.style.cssText = 'flex-shrink:0;white-space:nowrap;border:1px solid #16825d;border-radius:4px;background:#16825d;color:#fff;padding:6px 10px;font:inherit;cursor:pointer;';
    button.disabled = true; button.style.opacity = '0.6'; status.append(button);
  }
  status.append(message);
  function ensure() {
    const root = doc.documentElement || doc.body;
    if (root && !doc.contains(status)) root.append(status);
  }
  const panel = {
    status, message, button, ensure,
    bind(handler) { owner = handler; if (button) button.onclick = handler; },
    update(handler, text, disabled) {
      if (owner !== handler) return;
      message.textContent = text;
      if (button) { button.disabled = disabled; button.style.opacity = disabled ? '0.6' : '1'; }
      ensure();
    },
    release(handler) {
      if (owner !== handler) return;
      owner = null;
      if (button) { button.onclick = null; button.disabled = true; button.style.opacity = '0.6'; }
    }
  };
  host.__WBStatusPanel = panel;
  if (host.MutationObserver) new host.MutationObserver(ensure).observe(doc, {childList:true, subtree:true});
  host.addEventListener('DOMContentLoaded', ensure, {once:true});
  ensure();
  return panel;
}
