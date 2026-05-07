const CodingPage = (() => {
  let currentChatId = null;
  let currentModel = null;
  let isStreaming = false;
  let abortController = null;

  const SYSTEM_PROMPT = `You are an expert coding assistant. When writing code:
- Always use code blocks with the correct language tag
- Explain what the code does briefly before or after
- Point out potential issues or improvements
- Prefer modern, idiomatic patterns
- Be concise but thorough`;

  function render(container) {
    Components.injectStyles();
    injectCodingStyles();
    container.innerHTML = '';

    const layout = document.createElement('div');
    layout.className = 'split-layout';

    const backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    backdrop.id = 'code-sidebar-backdrop';
    backdrop.addEventListener('click', closeSidebar);

    layout.appendChild(backdrop);
    layout.appendChild(buildSidebar());
    layout.appendChild(buildMain());
    container.appendChild(layout);

    const chats = Store.getChats().filter(c => c.type === 'coding');
    if (chats.length > 0) loadChat(chats[0].id);
    else newChat();
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('code-sidebar');
    const backdrop = document.getElementById('code-sidebar-backdrop');
    sidebar?.classList.toggle('open');
    backdrop?.classList.toggle('open');
  }

  function closeSidebar() {
    const sidebar = document.getElementById('code-sidebar');
    const backdrop = document.getElementById('code-sidebar-backdrop');
    sidebar?.classList.remove('open');
    backdrop?.classList.remove('open');
  }

  function buildSidebar() {
    const sidebar = document.createElement('div');
    sidebar.className = 'sidebar';
    sidebar.id = 'code-sidebar';
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <h3>Coding</h3>
        <button class="btn btn-primary btn-sm" id="code-new-btn">+ New</button>
      </div>
      <div class="sidebar-list" id="code-list"></div>`;
    sidebar.querySelector('#code-new-btn').addEventListener('click', newChat);
    refreshSidebar(sidebar);
    return sidebar;
  }

  function refreshSidebar(sidebar) {
    const list = (sidebar || document.getElementById('code-sidebar'))?.querySelector('#code-list');
    if (!list) return;
    list.innerHTML = '';
    const chats = Store.getChats().filter(c => c.type === 'coding');
    if (chats.length === 0) {
      list.innerHTML = '<div style="padding:16px;color:var(--text2);font-size:13px">No coding sessions yet</div>';
      return;
    }
    chats.forEach(chat => {
      const item = document.createElement('div');
      item.className = 'sidebar-item' + (chat.id === currentChatId ? ' active' : '');
      item.innerHTML = `
        <div style="flex:1;min-width:0">
          <div class="item-title">${Components.escHtml(chat.title || 'Untitled')}</div>
          <div class="item-sub">${chat.messages?.filter(m => m.role !== 'system').length || 0} messages</div>
        </div>
        <button class="item-del" title="Delete">✕</button>`;
      item.addEventListener('click', e => {
        if (e.target.classList.contains('item-del')) deleteChat(chat.id);
        else { loadChat(chat.id); closeSidebar(); }
      });
      list.appendChild(item);
    });
  }

  function buildMain() {
    const main = document.createElement('div');
    main.className = 'split-main';
    main.id = 'code-main';

    const toolbar = document.createElement('div');
    toolbar.className = 'chat-toolbar';
    toolbar.id = 'code-toolbar';

    const sidebarBtn = document.createElement('button');
    sidebarBtn.className = 'sidebar-toggle';
    sidebarBtn.innerHTML = '☰';
    sidebarBtn.addEventListener('click', toggleSidebar);

    const titleInput = document.createElement('input');
    titleInput.className = 'title-input';
    titleInput.placeholder = 'Session title...';
    titleInput.addEventListener('change', () => {
      if (!currentChatId) return;
      const chat = Store.getChat(currentChatId);
      if (chat) { chat.title = titleInput.value; Store.upsertChat(chat); }
    });

    const modelSel = Components.modelSelector(Store.getActiveProvider(), currentModel);
    modelSel.addEventListener('change', () => { currentModel = modelSel.value; });

    const quickBtns = document.createElement('div');
    quickBtns.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;width:100%;order:10;';
    [
      ['Explain', 'Explain this code:'],
      ['Review', 'Review this code for bugs and improvements:'],
      ['Refactor', 'Refactor this code to be cleaner:'],
      ['Test', 'Write tests for this code:'],
      ['Debug', 'Help me debug this:'],
    ].forEach(([label, prefix]) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary btn-sm';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        const input = document.querySelector('#code-input-bar textarea');
        if (input) {
          input.value = prefix + '\n\n';
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
          input.style.height = 'auto';
          input.style.height = Math.min(input.scrollHeight, 160) + 'px';
        }
      });
      quickBtns.appendChild(btn);
    });

    toolbar.appendChild(sidebarBtn);
    toolbar.appendChild(titleInput);
    toolbar.appendChild(modelSel);
    toolbar.appendChild(quickBtns);

    const messagesWrap = document.createElement('div');
    messagesWrap.className = 'messages-wrap';
    messagesWrap.id = 'code-messages';

    const inputBar = Components.chatInputBar(sendMessage, {
      placeholder: 'Ask a coding question or paste code...',
    });
    inputBar.id = 'code-input-bar';

    main.appendChild(toolbar);
    main.appendChild(messagesWrap);
    main.appendChild(inputBar);

    return main;
  }

  function newChat() {
    const id = Store.newId();
    const chat = {
      id, type: 'coding', title: 'New Session',
      messages: [{ id: Store.newId(), role: 'system', content: SYSTEM_PROMPT, ts: Date.now() }],
      createdAt: Date.now(),
    };
    Store.upsertChat(chat);
    loadChat(id);
  }

  function loadChat(id) {
    currentChatId = id;
    const chat = Store.getChat(id);
    if (!chat) return;
    currentModel = chat.model || Store.getActiveProvider()?.defaultModel;

    const titleInput = document.querySelector('#code-toolbar .title-input');
    if (titleInput) titleInput.value = chat.title || '';

    const modelSel = document.querySelector('#code-toolbar .model-select');
    if (modelSel) modelSel.value = currentModel;

    renderMessages(chat.messages);
    refreshSidebar();
  }

  function renderMessages(messages) {
    const wrap = document.getElementById('code-messages');
    if (!wrap) return;
    wrap.innerHTML = '';
    const visible = messages.filter(m => m.role !== 'system');
    if (visible.length === 0) {
      wrap.innerHTML = `<div class="empty-state">
        <div class="big">💻</div>
        <h2>Coding Assistant</h2>
        <p>Ask questions, paste code, get explanations, reviews, and fixes</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:8px">
          ${['Write a function', 'Explain this code', 'Find the bug', 'Optimize this'].map(s =>
            `<button class="btn btn-secondary btn-sm suggestion-btn">${s}</button>`
          ).join('')}
        </div>
      </div>`;
      wrap.querySelectorAll('.suggestion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const input = document.querySelector('#code-input-bar textarea');
          if (input) { input.value = btn.textContent + ': '; input.focus(); }
        });
      });
      return;
    }
    visible.forEach(msg => {
      const el = Components.renderMessage(msg, { deletable: true });
      el.querySelector('[data-action="delete"]')?.addEventListener('click', () => deleteMessage(msg.id));
      el.querySelector('[data-action="copy"]')?.addEventListener('click', () => Components.copyMessageContent(msg));
      wrap.appendChild(el);
    });
    wrap.scrollTop = wrap.scrollHeight;
  }

  async function sendMessage(text) {
    if (isStreaming || !currentChatId) return;
    const chat = Store.getChat(currentChatId);
    if (!chat) return;

    const provider = Store.getActiveProvider();
    const settings = Store.getSettings();
    const model = currentModel || provider.defaultModel;

    const userMsg = { id: Store.newId(), role: 'user', content: text, ts: Date.now() };
    chat.messages.push(userMsg);
    Store.upsertChat(chat);

    const wrap = document.getElementById('code-messages');
    if (wrap) {
      const emptyState = wrap.querySelector('.empty-state');
      if (emptyState) emptyState.remove();
      const userEl = Components.renderMessage(userMsg, { deletable: true });
      userEl.querySelector('[data-action="delete"]')?.addEventListener('click', () => deleteMessage(userMsg.id));
      userEl.querySelector('[data-action="copy"]')?.addEventListener('click', () => Components.copyMessageContent(userMsg));
      wrap.appendChild(userEl);
      wrap.scrollTop = wrap.scrollHeight;
    }

    const inputBar = document.getElementById('code-input-bar');
    abortController = new AbortController();
    isStreaming = true;
    inputBar?.setStreaming(true, () => { abortController?.abort(); });

    const assistantMsg = { id: Store.newId(), role: 'assistant', content: '', thinking: '', images: [], ts: Date.now() };
    const assistantEl = Components.renderMessage(assistantMsg, {});
    const contentEl = assistantEl.querySelector('.msg-content');
    Components.addTypingIndicator(assistantEl);
    if (wrap) { wrap.appendChild(assistantEl); wrap.scrollTop = wrap.scrollHeight; }

    let typingRemoved = false;

    try {
      let fullContent = '';
      let fullThinking = '';
      const images = [];
      for await (const chunk of API.streamChat(provider, chat.messages, model, {
        temperature: 0.3,
        maxTokens: settings.maxTokens,
        signal: abortController.signal,
      })) {
        if (chunk.type === 'thinking') {
          fullThinking += chunk.content;
          Components.updateThinkingBlock(assistantEl, fullThinking);
          if (!assistantEl.querySelector('.thinking-streaming')) {
            const tb = assistantEl.querySelector('.thinking-block');
            if (tb) tb.classList.add('thinking-streaming');
          }
          if (wrap) wrap.scrollTop = wrap.scrollHeight;
        }
        if (chunk.type === 'text') {
          if (!typingRemoved) {
            Components.removeTypingIndicator(assistantEl);
            typingRemoved = true;
          }
          fullContent += chunk.content;
          contentEl.innerHTML = Components.renderMarkdown(fullContent);
          if (wrap) wrap.scrollTop = wrap.scrollHeight;
        }
        if (chunk.type === 'image') {
          if (!typingRemoved) {
            Components.removeTypingIndicator(assistantEl);
            typingRemoved = true;
          }
          images.push({ url: chunk.url, b64: chunk.b64, revisedPrompt: chunk.revisedPrompt });
          const src = chunk.url || (chunk.b64 ? `data:image/png;base64,${chunk.b64}` : '');
          if (src) {
            let imagesContainer = assistantEl.querySelector('.msg-images');
            if (!imagesContainer) {
              imagesContainer = document.createElement('div');
              imagesContainer.className = 'msg-images';
              assistantEl.appendChild(imagesContainer);
            }
            const imgWrap = Components.createImageWithLoader(src, 'Generated image', chunk.revisedPrompt);
            imagesContainer.appendChild(imgWrap);
            if (wrap) wrap.scrollTop = wrap.scrollHeight;
          }
        }
      }

      const extracted = API.extractThinkingFromText(fullContent);
      if (extracted.thinking && !fullThinking) {
        fullThinking = extracted.thinking;
        fullContent = extracted.content;
        Components.updateThinkingBlock(assistantEl, fullThinking);
        contentEl.innerHTML = Components.renderMarkdown(fullContent);
      }

      assistantMsg.content = fullContent;
      assistantMsg.thinking = fullThinking;
      assistantMsg.images = images;
    } catch (err) {
      if (err.name !== 'AbortError') {
        assistantMsg.content = `Error: ${err.message}`;
        contentEl.innerHTML = Components.renderMarkdown(assistantMsg.content);
        Components.toast(err.message, 'error');
      }
    }

    if (!typingRemoved) {
      Components.removeTypingIndicator(assistantEl);
    }

    const streamingBlock = assistantEl.querySelector('.thinking-streaming');
    if (streamingBlock) streamingBlock.classList.remove('thinking-streaming');

    assistantEl.querySelector('[data-action="copy"]')?.addEventListener('click', () => Components.copyMessageContent(assistantMsg));

    chat.messages.push(assistantMsg);
    if (chat.title === 'New Session' && chat.messages.filter(m => m.role !== 'system').length === 2) {
      chat.title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
      const titleInput = document.querySelector('#code-toolbar .title-input');
      if (titleInput) titleInput.value = chat.title;
    }
    Store.upsertChat(chat);
    refreshSidebar();

    isStreaming = false;
    abortController = null;
    inputBar?.setStreaming(false);
  }

  function deleteMessage(msgId) {
    if (!currentChatId) return;
    const chat = Store.getChat(currentChatId);
    if (!chat) return;
    chat.messages = chat.messages.filter(m => m.id !== msgId);
    Store.upsertChat(chat);
    renderMessages(chat.messages);
  }

  async function deleteChat(id) {
    const ok = await Components.confirm('Delete this session?');
    if (!ok) return;
    Store.deleteChat(id);
    if (currentChatId === id) {
      const remaining = Store.getChats().filter(c => c.type === 'coding');
      if (remaining.length > 0) loadChat(remaining[0].id);
      else newChat();
    } else {
      refreshSidebar();
    }
  }

  function injectCodingStyles() {
    if (document.getElementById('coding-css')) return;
    const style = document.createElement('style');
    style.id = 'coding-css';
    style.textContent = `
      #code-messages .code-block { border-left: 3px solid var(--accent); }
    `;
    document.head.appendChild(style);
  }

  return { render };
})();
