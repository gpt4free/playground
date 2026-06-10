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
    return modal(framework.translate('Confirm'), `<p style="color:var(--text2)">${message}</p>`, [
      { label: framework.translate('Cancel'), cls: 'btn-secondary' },
      { label: framework.translate('Confirm'), cls: 'btn-primary' },
    ]).then(i => i === 1);
  }

  function renderMessage(msg, opts = {}) {
    const el = document.createElement('div');
    el.className = `msg msg-${msg.role}`;
    el.dataset.id = msg.id || '';

    let avatar = msg.role === 'user' ? '👤' : msg.role === 'system' ? '⚙️' : (opts.personaEmoji || '🤖');
    if (msg.role === 'assistant' && opts.personaAvatar) {
      avatar = `<img src="${escHtml(opts.personaAvatar)}" alt="" class="msg-avatar-img" loading="lazy" onerror="this.outerHTML='${opts.personaEmoji || '🤖'}'">`;
    }
    const name = msg.role === 'user' ? framework.translate('You') : msg.role === 'system' ? framework.translate('System') : (opts.personaName || framework.translate('Assistant'));

    let thinkingHtml = '';
    if (msg.thinking || msg.reasoning?.text) {
      thinkingHtml = renderThinkingBlock(msg.thinking || msg.reasoning.text);
    }

    let imagesHtml = '';
    if (msg.images && msg.images.length > 0) {
      imagesHtml = `<div class="msg-images">${msg.images.map(img => {
        const src = img.url || (img.b64 ? `data:image/png;base64,${img.b64}` : '');
        return `<div class="msg-image-wrap">
          <div class="img-loading-skeleton"><div class="img-loading-spinner"></div></div>
          <img src="${src}" alt="Generated image" class="msg-image" loading="lazy" />
          ${img.revisedPrompt ? `<div class="msg-image-caption">${escHtml(img.revisedPrompt)}</div>` : ''}
        </div>`;
      }).join('')}</div>`;
    }

    el.innerHTML = `
      <div class="msg-header">
        <span class="msg-avatar">${avatar}</span>
        <span class="msg-name">${escHtml(name)}</span>
        <span class="msg-time">${formatTime(msg.ts)}</span>
        <div class="msg-actions">
          ${opts.audio ? `<button class="msg-btn" data-action="speak" title="Listen">🔊</button>` : ''}
          <button class="msg-btn" data-action="copy" title="Copy">⎘</button>
          ${opts.editable ? `<button class="msg-btn" data-action="edit" title="Edit">✎</button>` : ''}
          ${opts.deletable ? `<button class="msg-btn" data-action="delete" title="Delete">✕</button>` : ''}
        </div>
      </div>
      <div class="msg-thinking" id="thinking-${msg.id || ''}">${thinkingHtml}</div>
      <div class="msg-content">${renderMarkdown(msg.content)}</div>
      ${imagesHtml}`;

    el.querySelectorAll('.thinking-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const block = toggle.closest('.thinking-block');
        block?.classList.toggle('collapsed');
      });
    });

    el.querySelectorAll('.msg-image').forEach(img => {
      img.addEventListener('load', () => {
        const skeleton = img.parentElement.querySelector('.img-loading-skeleton');
        if (skeleton) skeleton.remove();
        img.classList.add('img-loaded');
      });
      img.addEventListener('error', () => {
        const skeleton = img.parentElement.querySelector('.img-loading-skeleton');
        if (skeleton) skeleton.remove();
      });
    });

    return el;
  }

  function renderThinkingBlock(text) {
    if (!text) return '';
    const preview = text.slice(0, 80).replace(/\n/g, ' ') + (text.length > 80 ? '…' : '');
    return `
      <div class="thinking-block collapsed">
        <div class="thinking-toggle">
          <span class="thinking-icon">💭</span>
          <span class="thinking-label">${framework.translate('Thinking')}</span>
          <span class="thinking-preview">${escHtml(preview)}</span>
          <span class="thinking-chevron">▸</span>
        </div>
        <div class="thinking-content">${renderMarkdown(text)}</div>
      </div>`;
  }

  function updateThinkingBlock(el, thinkingText) {
    const thinkingContainer = el.querySelector('.msg-thinking');
    if (!thinkingContainer) return;
    if (!thinkingText) return;

    let block = thinkingContainer.querySelector('.thinking-block');
    if (!block) {
      thinkingContainer.innerHTML = renderThinkingBlock(thinkingText);
      thinkingContainer.querySelectorAll('.thinking-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
          const b = toggle.closest('.thinking-block');
          b?.classList.toggle('collapsed');
        });
      });
      return;
    }

    const contentEl = block.querySelector('.thinking-content');
    if (contentEl) contentEl.innerHTML = renderMarkdown(thinkingText);

    const preview = thinkingText.slice(0, 80).replace(/\n/g, ' ') + (thinkingText.length > 80 ? '…' : '');
    const previewEl = block.querySelector('.thinking-preview');
    if (previewEl) previewEl.textContent = preview;
  }

  function addTypingIndicator(el) {
    const contentEl = el.querySelector('.msg-content');
    if (!contentEl) return;
    contentEl.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
  }

  function removeTypingIndicator(el) {
    const indicator = el.querySelector('.typing-indicator');
    if (indicator) indicator.remove();
  }

  function createImageWithLoader(src, alt, revisedPrompt) {
    const imgWrap = document.createElement('div');
    imgWrap.className = 'msg-image-wrap';

    const skeleton = document.createElement('div');
    skeleton.className = 'img-loading-skeleton';
    skeleton.innerHTML = '<div class="img-loading-spinner"></div>';

    const img = document.createElement('img');
    img.src = src;
    img.alt = alt || 'Generated image';
    img.className = 'msg-image';
    img.loading = 'lazy';

    img.addEventListener('load', () => {
      skeleton.remove();
      img.classList.add('img-loaded');
    });

    img.addEventListener('error', () => {
      skeleton.remove();
    });

    imgWrap.appendChild(skeleton);
    imgWrap.appendChild(img);

    if (revisedPrompt) {
      const caption = document.createElement('div');
      caption.className = 'msg-image-caption';
      caption.textContent = revisedPrompt;
      imgWrap.appendChild(caption);
    }

    return imgWrap;
  }

  async function copyMessageContent(msg) {
    if (msg.images && msg.images.length > 0) {
      const imgData = msg.images[0];
      const src = imgData.url || (imgData.b64 ? `data:image/png;base64,${imgData.b64}` : '');
      if (src) {
        try {
          const response = await fetch(src);
          const blob = await response.blob();
          const pngBlob = await convertToPngBlob(blob);
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': pngBlob })
          ]);
          toast('Image copied to clipboard', 'success');
          return;
        } catch (e) {
          try {
            await navigator.clipboard.writeText(src);
            toast('Image URL copied to clipboard', 'info');
            return;
          } catch (e2) {
            toast('Failed to copy image', 'error');
            return;
          }
        }
      }
    }
    await navigator.clipboard.writeText(msg.content);
    toast('Copied to clipboard', 'success');
  }

  function convertToPngBlob(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(pngBlob => {
          if (pngBlob) resolve(pngBlob);
          else reject(new Error('Failed to convert to PNG'));
        }, 'image/png');
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.crossOrigin = 'anonymous';
      img.src = URL.createObjectURL(blob);
    });
  }

  const sanitizedConfig = () => {
      return {
          allowedTags: window?.sanitizeHtml?.defaults.allowedTags.concat(['img', 'iframe', 'audio', 'video', 'details', 'summary', 'div']),
          allowedAttributes: {
              a: [ 'href', 'title', 'target', 'rel', 'data-width', 'data-height', 'data-src' ],
              i: [ 'class' ],
              span: [ 'class' ],
              code: [ 'class' ],
              img: [ 'src', 'alt', 'width', 'height' ],
              iframe: [ 'src', 'type', 'frameborder', 'allow', 'height', 'width' ],
              audio: [ 'src', 'controls' ],
              video: [ 'src', 'controls', 'loop', 'autoplay', 'muted' ],
              div: [ 'class' ],
              table: [ 'class' ],
              blockquote: [ 'class' ]
          },
          allowedIframeHostnames: ['www.youtube.com'],
          allowedSchemes: [ 'http', 'https', 'data' ]
      }
  };

  function renderMarkdown(content) {
    if (!content) return '';
    if (Array.isArray(content)) {
        content = content.map((item) => {
            if (!item.name) {
                if (item.text) {
                    return item.text;
                }
                size = parseInt(appStorage.getItem(`bucket:${item.bucket_id}`), 10);
                return `**Bucket:** [[${item.bucket_id}]](${item.url})${size ? ` (${formatFileSize(size)})` : ""}`
            }
            if (item.name.endsWith(".wav") || item.name.endsWith(".mp3")) {
                return `<audio controls src="${item.url}"></audio>` + (item.text ? `\n${item.text}` : "");
            }
            if (item.name.endsWith(".mp4") || item.name.endsWith(".webm")) {
                return `<video controls src="${item.url}"></video>` + (item.text ? `\n${item.text}` : "");
            }
            if (item.width && item.height) {
                return `<a href="${item.url}" data-width="${item.width}" data-height="${item.height}"><img src="${item.url.replaceAll("/media/", "/thumbnail/") || item.image_url?.url}" alt="${framework.escape(item.name)}"></a>`;
            }
            return `[![${item.name}](${item.url.replaceAll("/media/", "/thumbnail/") || item.image_url?.url})](${item.url || item.image_url?.url})`;
        }).join("\n");
    }
    let html = window.sanitizeHtml ? content : escHtml(content);
    html = html.replace(/```(\w*)\n?([\s\S]*?)(```|$)/g, (_, lang, code) =>
      `<pre class="code-block"><div class="code-lang">${lang || 'code'}</div><code>${window.sanitizeHtml ? escHtml(code.trim()) : code.trim()}</code></pre>`
    );
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    html = html.replace(/\[!\[([^\]]*)\]\(([^)]*)\)\]\(([^)]*)\)/g, '<a href="$3"><img src="$2" alt="$1"></a>');
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/\n---\n+/g, '<hr>\n');
    html = html.replace(/^##### (.+)\n*/gm, '<h5>$1</h5>\n');
    html = html.replace(/^#### (.+)\n*/gm, '<h4>$1</h4>\n');
    html = html.replace(/^### (.+)\n*/gm, '<h3>$1</h3>\n');
    html = html.replace(/^## (.+)\n*/gm, '<h2>$1</h2>\n');
    html = html.replace(/^# (.+)\n*/gm, '<h1>$1</h1>\n');
    html = html.replace(/^[-*] (.+)?$/gm, '<li>$1</li>');
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
    html = html.replaceAll('</ul>\n', '</ul>');
    html = html.replaceAll('</li>\n', '</li>');
    html = html.replace(/^((?:\|.+\|\n?)+)/gm, tableBlock => {
      const rows = tableBlock.trim().split('\n');
      if (rows.length < 2) return tableBlock;
      const isSeparator = r => /^\|[\s\-:|]+\|$/.test(r.trim());
      const parseRow = (r, tag) => '<tr>' + r.trim().replace(/^\||\|$/g, '').split('|').map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
      let thead = '', tbody = '', sepIdx = rows.findIndex(isSeparator);
      if (sepIdx === 1) {
        thead = `<thead>${parseRow(rows[0], 'th')}</thead>`;
        tbody = `<tbody>${rows.slice(2).filter(r => !isSeparator(r)).map(r => parseRow(r, 'td')).join('')}</tbody>`;
      } else {
        tbody = `<tbody>${rows.filter(r => !isSeparator(r)).map(r => parseRow(r, 'td')).join('')}</tbody>`;
      }
      return `<table class="md-table">${thead}${tbody}</table>`;
    });
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/>\n/g, '>');
    html = html.replace(/\n/g, '<br>');
    html = html
        .replaceAll("<a href=", '<a target="_blank" href=')
        .replaceAll('<code>', '<code class="language-plaintext">')
        .replaceAll('<iframe src="', '<iframe frameborder="0" height="224" width="400" src="')
        .replaceAll('<iframe type="text/html" src="', '<iframe type="text/html" frameborder="0" allow="fullscreen" height="224" width="400" src="')
        .replaceAll('"></iframe>', `?enablejsapi=1"></iframe>`)
        .replaceAll('src="/media/', `src="${framework.backendUrl}/media/`)
        .replaceAll('src="/thumbnail/', `src="${framework.backendUrl}/thumbnail/`)
        .replaceAll('href="/media/', `href="${framework.backendUrl}/media/`);
    if (window.sanitizeHtml) {
        html = window.sanitizeHtml(html, sanitizedConfig());
    }
    return `<p>${html}</p>`;
  }

  function formatToolCalls(toolCalls) {
    if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) return '';
    return toolCalls.map(call => {
      const name = call.name || call.function?.name || call.tool_name || call.id || 'unknown_tool';
      const args = call.arguments || call.function?.arguments || call.args || {};
      const formattedArgs = typeof args === 'string' ? args : JSON.stringify(args, null, 2);
      return `\n\n🔧 **Tool Call:** \`${name}\`\n\n\`\`\`json\n${formattedArgs}\n\`\`\``;
    }).join('\n\n');
  }

  function escHtml(str) {
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async function updateModels(provider) {
      Components.toast('Fetching models...', 'info');
      const models = await API.fetchModels(Store.applyProviderConfig(provider));
      if (window.convertModel) models.forEach(convertModel);
      provider.fetchedModels = models;
      provider.defaultModel = provider.defaultModel || models[0]?.id;
      Store.upsertProvider(provider);
      ProvidersPage.renderList();
      Components.toast(`Fetched ${models.length} models`, 'success');
      return models;
  }

  function modelSelector(provider, currentModel) {
    function setModels(sel, models, defaultModel) {
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id || m;
        opt.textContent = m.label || m.id || m;
        if ((m.id || m) === (currentModel || defaultModel)) opt.selected = true;
        sel.appendChild(opt);
      });
    }
    const models = (provider?.fetchedModels?.length
      ? provider.fetchedModels
      : (provider?.models?.length ? provider.models : null)) || [];
    const sel = document.createElement('select');
    sel.className = 'model-select';
    if (models.length === 0) {
      updateModels(provider).then(newModels => {
        setModels(sel, newModels, provider?.defaultModel);
      });
    } else {
      setModels(sel, models, provider?.defaultModel);
    }
    return sel;
  }

  function chatInputBar(onSend, opts = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'input-bar';
    wrap.innerHTML = `
      <textarea class="chat-input" placeholder="${opts.placeholder || 'Type a message...'}" rows="1"></textarea>
      <button class="btn btn-primary send-btn">${opts.sendLabel || 'Send'}</button>
      <button class="btn btn-danger stop-btn" style="display:none">Stop</button>`;
    const ta = wrap.querySelector('textarea');
    const btn = wrap.querySelector('.send-btn');
    const stopBtn = wrap.querySelector('.stop-btn');
    btn.dataset.label = btn.innerText;
    btn.disabled = true;
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
      if (ta.value.trim()) {
        btn.textContent = btn.dataset.label;
      } else {
        btn.textContent = framework.translate('Regenerate');
      }
      btn.disabled = false;
    });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    btn.addEventListener('click', send);
    function send() {
      const val = ta.value.trim();
      ta.value = '';
      ta.style.height = 'auto';
      onSend(val);
    }
    wrap.getInput = () => ta;
    wrap.setDisabled = (v) => { ta.disabled = v; btn.disabled = v; btn.textContent = v ? '...' : (opts.sendLabel || 'Send'); };
    wrap.setStreaming = (streaming, onStop) => {
      if (streaming) {
        btn.style.display = 'none';
        stopBtn.style.display = '';
        ta.disabled = true;
        stopBtn.onclick = () => { if (onStop) onStop(); };
      } else {
        btn.style.display = '';
        stopBtn.style.display = 'none';
        ta.disabled = false;
        btn.disabled = false;
        stopBtn.onclick = null;
      }
    };
    return wrap;
  }

  function injectStyles() {
    if (document.getElementById('components-css')) return;
    const style = document.createElement('style');
    style.id = 'components-css';
    style.textContent = `
      .msg { width: 100%; max-width: 840px; margin: 0 auto; padding: 6px 16px; }
      .msg-system { opacity: 0.75; }
      .msg-system .msg-content { font-size: 12px; color: var(--text2); background: var(--bg2); border: 1px dashed var(--border2); border-radius: var(--radius); padding: 10px 14px; }
      .msg-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
      .msg-user .msg-header { flex-direction: row-reverse; }
      .msg-user .msg-avatar { display: none; }
      .msg-user .msg-name { display: none; }
      .msg-avatar { font-size: 18px; display: inline-flex; align-items: center; }
      .msg-avatar-img { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; vertical-align: middle; border: 1px solid var(--border2); }
      .msg-name { font-weight: 600; font-size: 13px; letter-spacing: -0.01em; }
      .msg-time { font-size: 11px; color: var(--text2); margin-left: 4px; }
      .msg-actions { margin-left: auto; display: flex; gap: 2px; }
      .msg-user .msg-actions { margin-left: 0; margin-right: auto; }
      .msg-btn { background: none; border: none; color: var(--text2); cursor: pointer; padding: 6px 8px; border-radius: 8px; font-size: 14px; min-width: 34px; min-height: 34px; display: flex; align-items: center; justify-content: center; }
      .msg-btn:active, .msg-btn:hover { background: var(--bg3); color: var(--text); }
      .msg-content { line-height: 1.7; word-break: break-word; font-size: 14.5px; }
      .msg-user { display: flex; flex-direction: column; align-items: flex-end; }
      .msg-user .msg-content {
        background: var(--bg3);
        border: 1px solid var(--border2);
        color: var(--text);
        border-radius: var(--radius-l) var(--radius-l) 6px var(--radius-l);
        padding: 10px 16px;
        max-width: min(85%, 560px);
      }
      .msg-user .msg-content a { color: var(--accent); }
      .msg-assistant .msg-content { padding: 2px 0 2px 36px; }
      .msg-assistant .msg-thinking { margin-left: 36px; }
      .msg-assistant .msg-images { margin-left: 36px; }
      .msg-content p { margin: 0 0 8px; }
      .msg-content p:last-child { margin-bottom: 0; }
      .msg-content h1,.msg-content h2,.msg-content h3 { margin: 10px 0 5px; letter-spacing: -0.02em; }
      .msg-content ul { padding-left: 20px; margin: 4px 0; }
      .msg-content li { margin: 2px 0; }
      .msg-thinking:empty { display: none; }
      .thinking-block { border: 1px solid var(--border2); border-radius: var(--radius); margin-bottom: 10px; overflow: hidden; background: var(--accent-soft); }
      .thinking-toggle { display: flex; align-items: center; gap: 8px; padding: 10px 14px; cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent; }
      .thinking-toggle:active { background: var(--accent-soft); }
      .thinking-icon { font-size: 16px; flex-shrink: 0; }
      .thinking-label { font-size: 13px; font-weight: 600; color: var(--accent); flex-shrink: 0; }
      .thinking-preview { font-size: 12px; color: var(--text2); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .thinking-chevron { font-size: 12px; color: var(--text2); flex-shrink: 0; transition: transform 0.2s; }
      .thinking-block:not(.collapsed) .thinking-chevron { transform: rotate(90deg); }
      .thinking-block.collapsed .thinking-content { display: none; }
      .thinking-block:not(.collapsed) .thinking-preview { display: none; }
      .thinking-content { padding: 0 14px 12px; font-size: 13px; color: var(--text2); line-height: 1.6; border-top: 1px solid var(--border2); }
      .thinking-content p { margin: 8px 0; }
      .thinking-content p:first-child { margin-top: 10px; }
      .thinking-content p:last-child { margin-bottom: 0; }
      .thinking-streaming { animation: thinkPulse 1.5s ease-in-out infinite; }
      @keyframes thinkPulse { 0%,100% { border-color: var(--border2); } 50% { border-color: var(--accent); } }
      .code-block { background: var(--code-bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin: 8px 0; overflow-x: auto; position: relative; -webkit-overflow-scrolling: touch; }
      .code-lang { font-size: 11px; color: var(--text2); margin-bottom: 6px; text-transform: uppercase; }
      .code-block code { font-family: 'Cascadia Code','Fira Code',monospace; font-size: 13px; white-space: pre; }
      .copy-code-btn { position: absolute; top: 8px; right: 8px; background: var(--bg3); border: 1px solid var(--border); color: var(--text2); padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; min-height: 32px; }
      .copy-code-btn:active { color: var(--text); }
      .inline-code { background: var(--code-bg); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; font-family: monospace; font-size: 13px; }
      .md-blockquote { border-left: 3px solid var(--accent); margin: 8px 0; padding: 6px 12px; background: var(--bg3); color: var(--text2); border-radius: 0 6px 6px 0; }
      .md-table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 13px; }
      .md-table th, .md-table td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; }
      .md-table thead th { background: var(--bg3); font-weight: 600; }
      .md-table tbody tr:nth-child(even) { background: var(--bg2); }
      .input-bar { display: flex; gap: 8px; padding: 10px 12px calc(10px + var(--safe-bottom)); align-items: flex-end; width: 100%; max-width: 872px; margin: 0 auto; }
      .input-bar .chat-input {
        flex: 1;
        padding: 12px 16px;
        resize: none;
        line-height: 1.5;
        max-height: 160px;
        overflow-y: auto;
        font-size: 16px;
        border-radius: var(--radius-l);
        background: var(--bg2);
        border: 1px solid var(--border2);
        box-shadow: 0 4px 24px rgba(0,0,0,0.3);
      }
      .input-bar .chat-input:focus { border-color: var(--accent-border); }
      .send-btn { flex-shrink: 0; height: 46px; padding: 0 20px; border-radius: var(--radius-l); }
      .stop-btn { flex-shrink: 0; height: 46px; padding: 0 20px; border-radius: var(--radius-l); }
      .model-select { padding: 8px 12px; font-size: 13px; border-radius: 99px; min-height: 38px; max-width: 200px; font-weight: 500; }
      .chat-toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--glass); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); flex-wrap: wrap; flex-shrink: 0; }
      .chat-toolbar .title-input { background: none; border: none; font-size: 15px; font-weight: 600; color: var(--text); flex: 1; min-width: 100px; padding: 6px 8px; border-radius: 8px; }
      .chat-toolbar .title-input:focus { background: var(--bg3); }
      .messages-wrap { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 16px 0 12px; min-height: 0; }
      .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text2); gap: 8px; padding: 24px; text-align: center; }
      .empty-state .big { font-size: 52px; filter: drop-shadow(0 6px 24px rgba(245,158,11,0.25)); }
      .empty-state h2 { font-size: 19px; color: var(--text); font-weight: 700; letter-spacing: -0.02em; }
      .empty-state p { font-size: 13.5px; max-width: 420px; line-height: 1.6; }
      .msg-images { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
      .msg-image-wrap { border-radius: 10px; overflow: hidden; border: 1px solid var(--border); max-width: 100%; position: relative; min-height: 120px; }
      .msg-image { display: block; max-width: 100%; height: auto; border-radius: 10px; cursor: pointer; opacity: 0; transition: opacity 0.3s ease; }
      .msg-image.img-loaded { opacity: 1; }
      .msg-image-caption { font-size: 12px; color: var(--text2); padding: 6px 10px; background: var(--bg3); }
      .img-loading-skeleton { position: absolute; inset: 0; background: var(--bg3); display: flex; align-items: center; justify-content: center; min-height: 120px; border-radius: 10px; }
      .img-loading-spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: imgSpin 0.8s linear infinite; }
      @keyframes imgSpin { to { transform: rotate(360deg); } }
      .typing-indicator { display: flex; align-items: center; gap: 5px; padding: 8px 4px; }
      .typing-indicator span { width: 8px; height: 8px; background: var(--text2); border-radius: 50%; animation: typingBounce 1.4s ease-in-out infinite; }
      .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
      .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes typingBounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-8px); opacity: 1; } }
      .sidebar {
        position: fixed;
        top: var(--nav-height);
        left: 0;
        bottom: calc(var(--tabbar-height) + var(--safe-bottom));
        width: 85%;
        max-width: 320px;
        background: var(--bg2);
        display: flex;
        flex-direction: column;
        z-index: 95;
        transform: translateX(-105%);
        transition: transform 0.28s cubic-bezier(.2,.9,.3,1);
        border-right: 1px solid var(--border2);
        box-shadow: var(--shadow);
      }
      .sidebar.open { transform: translateX(0); }
      .sidebar-backdrop {
        display: none;
        position: fixed;
        inset: 0;
        top: var(--nav-height);
        bottom: calc(var(--tabbar-height) + var(--safe-bottom));
        background: rgba(5,5,10,0.55);
        backdrop-filter: blur(3px);
        -webkit-backdrop-filter: blur(3px);
        z-index: 94;
      }
      .sidebar-backdrop.open { display: block; }
      .sidebar-header { padding: 12px 14px; display: flex; align-items: center; gap: 8px; }
      .sidebar-header h3 { flex: 1; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text2); }
      .sidebar-list { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 0 8px 12px; }
      .sidebar-item { padding: 11px 12px; cursor: pointer; border-radius: var(--radius); display: flex; align-items: center; gap: 10px; margin-bottom: 2px; border: 1px solid transparent; transition: background .12s, border-color .12s; }
      .sidebar-item:active, .sidebar-item:hover { background: var(--bg3); }
      .sidebar-item.active { background: var(--accent-soft); border-color: var(--accent-border); }
      .sidebar-item .item-title { flex: 1; font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sidebar-item .item-sub { font-size: 11.5px; color: var(--text2); margin-top: 1px; }
      .sidebar-item .item-del { color: var(--text2); background: none; border: none; cursor: pointer; padding: 6px 8px; border-radius: 8px; min-width: 34px; min-height: 34px; display: flex; align-items: center; justify-content: center; }
      .sidebar-item .item-del:active, .sidebar-item .item-del:hover { color: var(--red); background: rgba(255,92,92,0.1); }
      .sidebar-toggle {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 38px;
        height: 38px;
        background: var(--bg3);
        border: 1px solid var(--border);
        border-radius: 10px;
        color: var(--text);
        font-size: 16px;
        cursor: pointer;
        flex-shrink: 0;
      }
      .sidebar-toggle:active, .sidebar-toggle:hover { border-color: var(--accent-border); }
      .split-layout { display: flex; flex: 1; overflow: hidden; position: relative; min-height: 0; }
      .split-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; width: 100%; min-width: 0; }

      @media (min-width: 768px) {
        .msg { padding: 6px 20px; }
        .msg-actions { opacity: 0; transition: opacity 0.15s; }
        .msg:hover .msg-actions { opacity: 1; }
        .msg-btn { padding: 3px 6px; font-size: 13px; min-width: auto; min-height: auto; }
        .thinking-toggle { padding: 8px 12px; }
        .thinking-toggle:hover { background: var(--accent-soft); }
        .thinking-content { padding: 0 12px 10px; }
        .copy-code-btn { min-height: auto; }
        .input-bar { padding: 12px 20px 16px; }
        .input-bar .chat-input { font-size: 13.5px; padding: 11px 16px; max-height: 220px; }
        .send-btn, .stop-btn { height: 42px; }
        .model-select { padding: 5px 10px; font-size: 12px; min-height: 32px; }
        .chat-toolbar { padding: 8px 16px; }
        .chat-toolbar .title-input { font-size: 14px; }
        .sidebar {
          position: static;
          width: 250px;
          max-width: none;
          transform: none;
          transition: none;
          flex-shrink: 0;
          z-index: auto;
          box-shadow: none;
          background: transparent;
          border-right: 1px solid var(--border);
        }
        .sidebar-backdrop { display: none !important; }
        .sidebar-item .item-del { opacity: 0; padding: 2px 5px; min-width: auto; min-height: auto; }
        .sidebar-item:hover .item-del { opacity: 1; }
        .sidebar-toggle { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  return { toast, modal, confirm, renderMessage, renderMarkdown, escHtml, modelSelector, chatInputBar, injectStyles, renderThinkingBlock, updateThinkingBlock, addTypingIndicator, removeTypingIndicator, createImageWithLoader, copyMessageContent, formatToolCalls, updateModels };
})();
