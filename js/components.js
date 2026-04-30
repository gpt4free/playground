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
      <textarea class="chat-input" placeholder="${opts.placeholder || 'Type a message... (Shift+Enter for newline)'}" rows="1"></textarea>
      <button class="btn btn-primary send-btn">${opts.sendLabel || 'Send'}</button>`;
    const ta = wrap.querySelector('textarea');
    const btn = wrap.querySelector('button');
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
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
      .msg { padding: 12px 16px; border-bottom: 1px solid var(--border); }
      .msg:last-child { border-bottom: none; }
      .msg-user { background: var(--bg); }
      .msg-assistant { background: var(--bg2); }
      .msg-system { background: var(--bg3); opacity: 0.8; }
      .msg-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
      .msg-avatar { font-size: 16px; }
      .msg-name { font-weight: 600; font-size: 13px; }
      .msg-time { font-size: 11px; color: var(--text2); margin-left: 4px; }
      .msg-actions { margin-left: auto; display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s; }
      .msg:hover .msg-actions { opacity: 1; }
      .msg-btn { background: none; border: none; color: var(--text2); cursor: pointer; padding: 2px 5px; border-radius: 4px; font-size: 13px; }
      .msg-btn:hover { background: var(--bg3); color: var(--text); }
      .msg-content { line-height: 1.6; word-break: break-word; }
      .msg-content p { margin: 0 0 8px; }
      .msg-content p:last-child { margin-bottom: 0; }
      .msg-content h1,.msg-content h2,.msg-content h3 { margin: 8px 0 4px; }
      .msg-content ul { padding-left: 20px; margin: 4px 0; }
      .msg-content li { margin: 2px 0; }
      .code-block { background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin: 8px 0; overflow-x: auto; position: relative; }
      .code-lang { font-size: 11px; color: var(--text2); margin-bottom: 6px; text-transform: uppercase; }
      .code-block code { font-family: 'Cascadia Code','Fira Code',monospace; font-size: 13px; white-space: pre; }
      .copy-code-btn { position: absolute; top: 8px; right: 8px; background: var(--bg3); border: 1px solid var(--border); color: var(--text2); padding: 3px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; }
      .copy-code-btn:hover { color: var(--text); }
      .inline-code { background: var(--code-bg); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; font-family: monospace; font-size: 12px; }
      .input-bar { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border); background: var(--bg2); align-items: flex-end; }
      .chat-input { flex: 1; padding: 9px 12px; resize: none; line-height: 1.5; max-height: 200px; overflow-y: auto; }
      .send-btn { flex-shrink: 0; height: 38px; padding: 0 18px; }
      .model-select { padding: 5px 8px; font-size: 12px; }
      .chat-toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--bg2); flex-wrap: wrap; }
      .chat-toolbar .title-input { background: none; border: none; font-size: 14px; font-weight: 600; color: var(--text); flex: 1; min-width: 120px; padding: 4px; }
      .chat-toolbar .title-input:focus { background: var(--bg3); border-radius: 4px; }
      .messages-wrap { flex: 1; overflow-y: auto; }
      .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text2); gap: 8px; }
      .empty-state .big { font-size: 48px; }
      .empty-state h2 { font-size: 18px; color: var(--text); }
      .sidebar { width: 240px; border-right: 1px solid var(--border); background: var(--bg2); display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden; }
      .sidebar-header { padding: 12px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
      .sidebar-header h3 { flex: 1; font-size: 13px; }
      .sidebar-list { flex: 1; overflow-y: auto; }
      .sidebar-item { padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
      .sidebar-item:hover { background: var(--bg3); }
      .sidebar-item.active { background: var(--bg3); border-left: 2px solid var(--accent); }
      .sidebar-item .item-title { flex: 1; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sidebar-item .item-sub { font-size: 11px; color: var(--text2); }
      .sidebar-item .item-del { opacity: 0; color: var(--text2); background: none; border: none; cursor: pointer; padding: 2px 5px; border-radius: 3px; }
      .sidebar-item:hover .item-del { opacity: 1; }
      .sidebar-item .item-del:hover { color: var(--red); }
      .split-layout { display: flex; flex: 1; overflow: hidden; }
      .split-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    `;
    document.head.appendChild(style);
  }

  return { toast, modal, confirm, renderMessage, renderMarkdown, escHtml, modelSelector, chatInputBar, injectStyles };
})();
