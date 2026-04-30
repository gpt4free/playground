const RoleplayPage = (() => {
  let currentChatId = null;
  let currentPersonaId = null;
  let currentModel = null;
  let isStreaming = false;

  function render(container) {
    Components.injectStyles();
    container.innerHTML = '';

    const layout = document.createElement('div');
    layout.className = 'split-layout';

    layout.appendChild(buildSidebar());
    layout.appendChild(buildMain());
    container.appendChild(layout);

    const chats = Store.getChats().filter(c => c.type === 'roleplay');
    if (chats.length > 0) loadChat(chats[0].id);
    else newChat();
  }

  function buildSidebar() {
    const sidebar = document.createElement('div');
    sidebar.className = 'sidebar';
    sidebar.id = 'rp-sidebar';
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <h3>Roleplay</h3>
        <button class="btn btn-primary btn-sm" id="rp-new-btn">+ New</button>
      </div>
      <div class="sidebar-list" id="rp-list"></div>`;
    sidebar.querySelector('#rp-new-btn').addEventListener('click', newChat);
    refreshSidebar(sidebar);
    return sidebar;
  }

  function refreshSidebar(sidebar) {
    const list = (sidebar || document.getElementById('rp-sidebar'))?.querySelector('#rp-list');
    if (!list) return;
    list.innerHTML = '';
    const chats = Store.getChats().filter(c => c.type === 'roleplay');
    if (chats.length === 0) {
      list.innerHTML = '<div style="padding:16px;color:var(--text2);font-size:12px">No roleplay sessions yet</div>';
      return;
    }
    chats.forEach(chat => {
      const persona = chat.personaId ? Store.getPersonas().find(p => p.id === chat.personaId) : null;
      const item = document.createElement('div');
      item.className = 'sidebar-item' + (chat.id === currentChatId ? ' active' : '');
      item.innerHTML = `
        <div style="flex:1;min-width:0">
          <div class="item-title">${Components.escHtml(chat.title || 'Untitled')}</div>
          <div class="item-sub">${persona ? Components.escHtml(persona.name) : 'No persona'} · ${chat.messages?.filter(m => m.role !== 'system').length || 0} msgs</div>
        </div>
        <button class="item-del" title="Delete">✕</button>`;
      item.addEventListener('click', e => {
        if (e.target.classList.contains('item-del')) deleteChat(chat.id);
        else loadChat(chat.id);
      });
      list.appendChild(item);
    });
  }

  function buildMain() {
    const main = document.createElement('div');
    main.className = 'split-main';
    main.id = 'rp-main';

    const toolbar = document.createElement('div');
    toolbar.className = 'chat-toolbar';
    toolbar.id = 'rp-toolbar';

    const titleInput = document.createElement('input');
    titleInput.className = 'title-input';
    titleInput.placeholder = 'Session title...';
    titleInput.addEventListener('change', () => {
      if (!currentChatId) return;
      const chat = Store.getChat(currentChatId);
      if (chat) { chat.title = titleInput.value; Store.upsertChat(chat); }
    });

    const personaSel = document.createElement('select');
    personaSel.className = 'model-select';
    personaSel.id = 'rp-persona-sel';
    personaSel.addEventListener('change', () => {
      currentPersonaId = personaSel.value || null;
      applyPersonaToChat();
    });

    const modelSel = Components.modelSelector(Store.getActiveProvider(), currentModel);
    modelSel.addEventListener('change', () => { currentModel = modelSel.value; });

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-secondary btn-sm';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', clearMessages);

    toolbar.appendChild(titleInput);
    toolbar.appendChild(personaSel);
    toolbar.appendChild(modelSel);
    toolbar.appendChild(clearBtn);

    const messagesWrap = document.createElement('div');
    messagesWrap.className = 'messages-wrap';
    messagesWrap.id = 'rp-messages';

    const inputBar = Components.chatInputBar(sendMessage, { placeholder: 'Say something in character...' });
    inputBar.id = 'rp-input-bar';

    main.appendChild(toolbar);
    main.appendChild(messagesWrap);
    main.appendChild(inputBar);

    refreshPersonaSelector();
    return main;
  }

  function refreshPersonaSelector() {
    const sel = document.getElementById('rp-persona-sel');
    if (!sel) return;
    sel.innerHTML = '<option value="">— No Persona —</option>';
    Store.getPersonas().forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.emoji || '🎭'} ${p.name}`;
      if (p.id === currentPersonaId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function newChat() {
    const id = Store.newId();
    const chat = { id, type: 'roleplay', title: 'New Session', messages: [], personaId: null, createdAt: Date.now() };
    Store.upsertChat(chat);
    loadChat(id);
  }

  function loadChat(id) {
    currentChatId = id;
    const chat = Store.getChat(id);
    if (!chat) return;

    currentPersonaId = chat.personaId || null;
    currentModel = chat.model || Store.getActiveProvider()?.defaultModel;

    const titleInput = document.querySelector('#rp-toolbar .title-input');
    if (titleInput) titleInput.value = chat.title || '';

    refreshPersonaSelector();
    const personaSel = document.getElementById('rp-persona-sel');
    if (personaSel) personaSel.value = currentPersonaId || '';

    const modelSel = document.querySelector('#rp-toolbar .model-select');
    if (modelSel) modelSel.value = currentModel;

    renderMessages(chat.messages);
    refreshSidebar();
  }

  function applyPersonaToChat() {
    if (!currentChatId) return;
    const chat = Store.getChat(currentChatId);
    if (!chat) return;
    chat.personaId = currentPersonaId;
    chat.messages = chat.messages.filter(m => m.role !== 'system');
    if (currentPersonaId) {
      const persona = Store.getPersonas().find(p => p.id === currentPersonaId);
      if (persona?.systemPrompt) {
        chat.messages.unshift({ id: Store.newId(), role: 'system', content: persona.systemPrompt, ts: Date.now() });
      }
    }
    Store.upsertChat(chat);
    renderMessages(chat.messages);
  }

  function renderMessages(messages) {
    const wrap = document.getElementById('rp-messages');
    if (!wrap) return;
    wrap.innerHTML = '';
    const persona = currentPersonaId ? Store.getPersonas().find(p => p.id === currentPersonaId) : null;
    const visible = messages.filter(m => m.role !== 'system');
    if (visible.length === 0) {
      const hint = persona
        ? `<div class="big">${persona.emoji || '🎭'}</div><h2>${Components.escHtml(persona.name)}</h2><p>${Components.escHtml(persona.description || 'Start the roleplay below')}</p>`
        : `<div class="big">🎭</div><h2>Roleplay</h2><p>Select a persona and start chatting</p>`;
      wrap.innerHTML = `<div class="empty-state">${hint}</div>`;
      return;
    }
    visible.forEach(msg => {
      const el = Components.renderMessage(msg, {
        personaName: persona?.name || 'Assistant',
        personaEmoji: persona?.emoji || '🤖',
        deletable: true,
      });
      el.querySelector('[data-action="delete"]')?.addEventListener('click', () => deleteMessage(msg.id));
      el.querySelector('[data-action="copy"]')?.addEventListener('click', () => navigator.clipboard.writeText(msg.content));
      wrap.appendChild(el);
    });
    wrap.scrollTop = wrap.scrollHeight;
  }

  async function sendMessage(text) {
    if (isStreaming || !currentChatId) return;
    const chat = Store.getChat(currentChatId);
    if (!chat) return;

    const persona = currentPersonaId ? Store.getPersonas().find(p => p.id === currentPersonaId) : null;

    if (chat.messages.length === 0 && persona?.systemPrompt) {
      chat.messages.push({ id: Store.newId(), role: 'system', content: persona.systemPrompt, ts: Date.now() });
    }

    const userMsg = { id: Store.newId(), role: 'user', content: text, ts: Date.now() };
    chat.messages.push(userMsg);
    Store.upsertChat(chat);

    const wrap = document.getElementById('rp-messages');
    if (wrap) {
      const emptyState = wrap.querySelector('.empty-state');
      if (emptyState) emptyState.remove();
      const userEl = Components.renderMessage(userMsg, { deletable: true });
      userEl.querySelector('[data-action="delete"]')?.addEventListener('click', () => deleteMessage(userMsg.id));
      userEl.querySelector('[data-action="copy"]')?.addEventListener('click', () => navigator.clipboard.writeText(userMsg.content));
      wrap.appendChild(userEl);
      wrap.scrollTop = wrap.scrollHeight;
    }

    const inputBar = document.getElementById('rp-input-bar');
    inputBar?.setDisabled(true);
    isStreaming = true;

    const provider = Store.getActiveProvider();
    const settings = Store.getSettings();
    const model = currentModel || provider.defaultModel;

    const assistantMsg = { id: Store.newId(), role: 'assistant', content: '', ts: Date.now() };
    const assistantEl = Components.renderMessage(assistantMsg, {
      personaName: persona?.name || 'Assistant',
      personaEmoji: persona?.emoji || '🤖',
    });
    const contentEl = assistantEl.querySelector('.msg-content');
    if (wrap) { wrap.appendChild(assistantEl); wrap.scrollTop = wrap.scrollHeight; }

    try {
      let fullContent = '';
      for await (const chunk of API.streamChat(provider, chat.messages, model, {
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
      })) {
        if (chunk.type === 'text') {
          fullContent += chunk.content;
          contentEl.innerHTML = Components.renderMarkdown(fullContent);
          if (wrap) wrap.scrollTop = wrap.scrollHeight;
        }
      }
      assistantMsg.content = fullContent;
    } catch (err) {
      assistantMsg.content = `Error: ${err.message}`;
      contentEl.innerHTML = Components.renderMarkdown(assistantMsg.content);
      Components.toast(err.message, 'error');
    }

    assistantEl.querySelector('[data-action="copy"]')?.addEventListener('click', () => navigator.clipboard.writeText(assistantMsg.content));

    chat.messages.push(assistantMsg);
    if (chat.title === 'New Session' && chat.messages.filter(m => m.role !== 'system').length === 2) {
      chat.title = (persona ? persona.name + ': ' : '') + text.slice(0, 32) + (text.length > 32 ? '…' : '');
      const titleInput = document.querySelector('#rp-toolbar .title-input');
      if (titleInput) titleInput.value = chat.title;
    }
    Store.upsertChat(chat);
    refreshSidebar();

    isStreaming = false;
    inputBar?.setDisabled(false);
  }

  function deleteMessage(msgId) {
    if (!currentChatId) return;
    const chat = Store.getChat(currentChatId);
    if (!chat) return;
    chat.messages = chat.messages.filter(m => m.id !== msgId);
    Store.upsertChat(chat);
    renderMessages(chat.messages);
  }

  function clearMessages() {
    if (!currentChatId) return;
    const chat = Store.getChat(currentChatId);
    if (!chat) return;
    chat.messages = [];
    Store.upsertChat(chat);
    renderMessages([]);
  }

  async function deleteChat(id) {
    const ok = await Components.confirm('Delete this session?');
    if (!ok) return;
    Store.deleteChat(id);
    if (currentChatId === id) {
      const remaining = Store.getChats().filter(c => c.type === 'roleplay');
      if (remaining.length > 0) loadChat(remaining[0].id);
      else newChat();
    } else {
      refreshSidebar();
    }
  }

  return { render };
})();
