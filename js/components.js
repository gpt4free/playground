const Components = (() => {
  function toast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), duration);
  }

  function modal(title, bodyHTML, buttons = []) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <h2>${title}</h2>
          <div class="modal-body">${bodyHTML}</div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
            ${buttons.map((b, i) => `<button class="btn ${b.cls || 'btn-secondary'}" data-idx="${i}">${b.label}</button>`).join('')}
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelectorAll('button[data-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
          overlay.remove();
          resolve(parseInt(btn.dataset.idx));
        });
      });
      overlay.addEventListener('click', e => {
        if (e.target === overlay) { overlay.remove(); resolve(-1); }
      });
    });
  }

  function confirm(message) {
    return modal('Confirm', `<p style="color:var(--text2)">${message}</p>`, [
      { label: 'Cancel', cls: 'btn-secondary' },
      { label: 'Confirm', cls: 'btn-primary' },
    ]).then(i => i === 1);
  }

  function renderMessage(msg, opts = {}) {
    const el = document.createElement('div');
    el.className = `msg msg-${msg.role}`;
    el.dataset.id = msg.id || '';

    const avatar = msg.role === 'user' ? '👤' : msg.role === 'system' ? '⚙️' : (opts.personaEmoji || '🤖');
    const name = msg.role === 'user' ? 'You' : msg.role === 'system' ? 'System' : (opts.personaName || 'Assistant');

    el.innerHTML = `
      <div class="msg-header">
        <span class="msg-avatar">${avatar}</span>
        <span class="msg-name">${escHtml(name)}</span>
        <span class="msg-time">${formatTime(msg.ts)}</span>
        <div class="msg-actions">
          <button class="msg-btn" data-action="copy" title="Copy">⎘</button>
          ${opts.editable ? `<button class="msg-btn" data-action="edit" title="Edit">✎</button>` : ''}
          ${opts.deletable ? `<button class="msg-btn" data-action="delete" title="Delete">✕</button>` : ''}
        </div>
      </div>
      <div class="msg-content">${renderMarkdown(msg.content)}</div>`;

    return el;
  }

  function renderMarkdown(text) {
    if (!text) return '';
    let html = escHtml(text);
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre class="code-block"><div class="code-lang">${lang || 'code'}</div><code>${code.trim()}</code><button class="copy-code-btn" onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent)">Copy</button></pre>`
    );
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    return `<p>${html}</p>`;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function modelSelector(provider, currentModel) {
    const models = provider?.fetchedModels?.length
      ? provider.fetchedModels
      : (provider?.models?.length ? provider.models : [provider?.defaultModel || 'llama-4-scout']);
    const sel = document.createElement('select');
    sel.className = 'model-select';
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === (currentModel || provider?.defaultModel)) opt.selected = true;
      sel.appendChild(opt);
    });
    return sel;
  }

  function chatInputBar(onSend, opts = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'input-bar';
    wrap.innerHTML = `
      <textarea class="chat-input" placeholder="${opts.placeholder || 'Type a message...'}" rows="1"></textarea>
      <button class="btn btn-primary send-btn">${opts.sendLabel || 'Send'}</button>`;
    const ta = wrap.querySelector('textarea');
    const btn = wrap.querySelector('button');
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    btn.addEventListener('click', send);
    function send() {
      const val = ta.value.trim();
      if (!val) return;
      ta.value = '';
      ta.style.height = 'auto';
      onSend(val);
    }
    wrap.getInput = () => ta;
    wrap.setDisabled = (v) => { ta.disabled = v; btn.disabled = v; btn.textContent = v ? '...' : (opts.sendLabel || 'Send'); };
    return wrap;
  }

  function injectStyles() {
    if (document.getElementById('components-css')) return;
    const style = document.createElement('style');
    style.id = 'components-css';
    style.textContent = `
      .msg { padding: 14px 16px; border-bottom: 1px solid var(--border); }
      .msg:last-child { border-bottom: none; }
      .msg-user { background: var(--bg); }
      .msg-assistant { background: var(--bg2); }
      .msg-system { background: var(--bg3); opacity: 0.8; }
      .msg-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
      .msg-avatar { font-size: 18px; }
      .msg-name { font-weight: 600; font-size: 14px; }
      .msg-time { font-size: 11px; color: var(--text2); margin-left: 4px; }
      .msg-actions { margin-left: auto; display: flex; gap: 2px; }
      .msg-btn { background: none; border: none; color: var(--text2); cursor: pointer; padding: 6px 8px; border-radius: 6px; font-size: 15px; min-width: 36px; min-height: 36px; display: flex; align-items: center; justify-content: center; }
      .msg-btn:active { background: var(--bg3); color: var(--text); }
      .msg-content { line-height: 1.65; word-break: break-word; }
      .msg-content p { margin: 0 0 8px; }
      .msg-content p:last-child { margin-bottom: 0; }
      .msg-content h1,.msg-content h2,.msg-content h3 { margin: 8px 0 4px; }
      .msg-content ul { padding-left: 20px; margin: 4px 0; }
      .msg-content li { margin: 2px 0; }
      .code-block { background: var(--code-bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin: 8px 0; overflow-x: auto; position: relative; -webkit-overflow-scrolling: touch; }
      .code-lang { font-size: 11px; color: var(--text2); margin-bottom: 6px; text-transform: uppercase; }
      .code-block code { font-family: 'Cascadia Code','Fira Code',monospace; font-size: 13px; white-space: pre; }
      .copy-code-btn { position: absolute; top: 8px; right: 8px; background: var(--bg3); border: 1px solid var(--border); color: var(--text2); padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; min-height: 32px; }
      .copy-code-btn:active { color: var(--text); }
      .inline-code { background: var(--code-bg); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; font-family: monospace; font-size: 13px; }
      .input-bar { display: flex; gap: 8px; padding: 10px 12px; padding-bottom: calc(10px + var(--safe-bottom)); border-top: 1px solid var(--border); background: var(--bg2); align-items: flex-end; }
      .chat-input { flex: 1; padding: 10px 12px; resize: none; line-height: 1.5; max-height: 160px; overflow-y: auto; font-size: 16px; border-radius: 10px; }
      .send-btn { flex-shrink: 0; height: 44px; padding: 0 18px; border-radius: 10px; }
      .model-select { padding: 8px 10px; font-size: 14px; border-radius: 8px; min-height: 40px; }
      .chat-toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--border); background: var(--bg2); flex-wrap: wrap; }
      .chat-toolbar .title-input { background: none; border: none; font-size: 15px; font-weight: 600; color: var(--text); flex: 1; min-width: 100px; padding: 6px; }
      .chat-toolbar .title-input:focus { background: var(--bg3); border-radius: 6px; }
      .messages-wrap { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
      .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text2); gap: 8px; padding: 24px; text-align: center; }
      .empty-state .big { font-size: 48px; }
      .empty-state h2 { font-size: 18px; color: var(--text); }
      .sidebar {
        position: fixed;
        top: var(--nav-height);
        left: 0;
        bottom: 0;
        width: 85%;
        max-width: 320px;
        background: var(--bg2);
        display: flex;
        flex-direction: column;
        z-index: 90;
        transform: translateX(-100%);
        transition: transform 0.25s ease;
        border-right: 1px solid var(--border);
      }
      .sidebar.open { transform: translateX(0); }
      .sidebar-backdrop {
        display: none;
        position: fixed;
        inset: 0;
        top: var(--nav-height);
        background: rgba(0,0,0,0.5);
        z-index: 89;
      }
      .sidebar-backdrop.open { display: block; }
      .sidebar-header { padding: 14px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
      .sidebar-header h3 { flex: 1; font-size: 15px; }
      .sidebar-list { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
      .sidebar-item { padding: 14px 16px; cursor: pointer; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
      .sidebar-item:active { background: var(--bg3); }
      .sidebar-item.active { background: var(--bg3); border-left: 3px solid var(--accent); }
      .sidebar-item .item-title { flex: 1; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sidebar-item .item-sub { font-size: 12px; color: var(--text2); }
      .sidebar-item .item-del { color: var(--text2); background: none; border: none; cursor: pointer; padding: 6px 8px; border-radius: 6px; min-width: 36px; min-height: 36px; display: flex; align-items: center; justify-content: center; }
      .sidebar-item .item-del:active { color: var(--red); background: var(--bg3); }
      .sidebar-toggle {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        background: none;
        border: 1px solid var(--border);
        border-radius: 8px;
        color: var(--text);
        font-size: 18px;
        cursor: pointer;
        flex-shrink: 0;
      }
      .sidebar-toggle:active { background: var(--bg3); }
      .split-layout { display: flex; flex: 1; overflow: hidden; position: relative; }
      .split-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; width: 100%; }

      @media (min-width: 768px) {
        .msg { padding: 12px 16px; }
        .msg-avatar { font-size: 16px; }
        .msg-name { font-size: 13px; }
        .msg-actions { opacity: 0; transition: opacity 0.15s; }
        .msg:hover .msg-actions { opacity: 1; }
        .msg-btn { padding: 2px 5px; font-size: 13px; min-width: auto; min-height: auto; }
        .code-block { border-radius: 8px; }
        .copy-code-btn { min-height: auto; }
        .input-bar { padding: 12px 16px; padding-bottom: 12px; }
        .chat-input { font-size: 13px; border-radius: 6px; padding: 9px 12px; max-height: 200px; }
        .send-btn { height: 38px; border-radius: 6px; }
        .model-select { padding: 5px 8px; font-size: 12px; min-height: auto; border-radius: 6px; }
        .chat-toolbar { padding: 8px 16px; }
        .chat-toolbar .title-input { font-size: 14px; }
        .sidebar {
          position: static;
          width: 240px;
          max-width: none;
          transform: none;
          transition: none;
          flex-shrink: 0;
          z-index: auto;
        }
        .sidebar-backdrop { display: none !important; }
        .sidebar-header { padding: 12px; }
        .sidebar-header h3 { font-size: 13px; }
        .sidebar-item { padding: 10px 12px; gap: 8px; }
        .sidebar-item .item-title { font-size: 13px; }
        .sidebar-item .item-sub { font-size: 11px; }
        .sidebar-item .item-del { opacity: 0; padding: 2px 5px; min-width: auto; min-height: auto; }
        .sidebar-item:hover .item-del { opacity: 1; }
        .sidebar-item:hover { background: var(--bg3); }
        .sidebar-toggle { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  return { toast, modal, confirm, renderMessage, renderMarkdown, escHtml, modelSelector, chatInputBar, injectStyles };
})();
