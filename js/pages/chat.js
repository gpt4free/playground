const ChatPage = (() => {
  let currentChatId = null;
  let currentModel = null;
  let isStreaming = false;

  function render(container) {
    Components.injectStyles();
    container.innerHTML = '';

    const layout = document.createElement('div');
    layout.className = 'split-layout';

    const backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    backdrop.id = 'chat-sidebar-backdrop';
    backdrop.addEventListener('click', closeSidebar);

    const sidebar = buildSidebar();
    const main = buildMain();

    layout.appendChild(backdrop);
    layout.appendChild(sidebar);
    layout.appendChild(main);
    container.appendChild(layout);

    const chats = Store.getChats().filter(c => c.type === 'chat');
    if (chats.length > 0) loadChat(chats[0].id);
    else newChat();
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('chat-sidebar');
    const backdrop = document.getElementById('chat-sidebar-backdrop');
    sidebar?.classList.toggle('open');
    backdrop?.classList.toggle('open');
  }

  function closeSidebar() {
    const sidebar = document.getElementById('chat-sidebar');
    const backdrop = document.getElementById('chat-sidebar-backdrop');
    sidebar?.classList.remove('open');
    backdrop?.classList.remove('open');
  }

  function buildSidebar() {
    const sidebar = document.createElement('div');
    sidebar.className = 'sidebar';
    sidebar.id = 'chat-sidebar';
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <h3>Chats</h3>
        <button class="btn btn-primary btn-sm" id="new-chat-btn">+ New</button>
      </div>
      <div class="sidebar-list" id="chat-list"></div>`;
    sidebar.querySelector('#new-chat-btn').addEventListener('click', newChat);
    refreshSidebar(sidebar);
    return sidebar;
  }

  function refreshSidebar(sidebar) {
    const list = (sidebar || document.getElementById('chat-sidebar'))?.querySelector('#chat-list');
    if (!list) return;
    list.innerHTML = '';
    const chats = Store.getChats().filter(c => c.type === 'chat');
    if (chats.length === 0) {
      list.innerHTML = '<div style="padding:16px;color:var(--text2);font-size:13px">No chats yet</div>';
      return;
    }
    chats.forEach(chat => {
      const item = document.createElement('div');
      item.className = 'sidebar-item' + (chat.id === currentChatId ? ' active' : '');
      item.dataset.id = chat.id;
      item.innerHTML = `
        <div style="flex:1;min-width:0">
          <div class="item-title">${Components.escHtml(chat.title || 'Untitled')}</div>
          <div class="item-sub">${chat.messages?.length || 0} messages</div>
        </div>
        <button class="item-del" title="Delete">✕</button>`;
      item.addEventListener('click', e => {
        if (e.target.classList.contains('item-del')) {
          deleteChat(chat.id);
        } else {
          loadChat(chat.id);
          closeSidebar();
        }
      });
      list.appendChild(item);
    });
  }

  function buildMain() {
    const main = document.createElement('div');
    main.className = 'split-main';
    main.id = 'chat-main';

    const toolbar = document.createElement('div');
    toolbar.className = 'chat-toolbar';
    toolbar.id = 'chat-toolbar';

    const sidebarBtn = document.createElement('button');
    sidebarBtn.className = 'sidebar-toggle';
    sidebarBtn.innerHTML = '☰';
    sidebarBtn.addEventListener('click', toggleSidebar);

    const titleInput = document.createElement('input');
    titleInput.className = 'title-input';
    titleInput.placeholder = 'Chat title...';
    titleInput.addEventListener('change', () => {
      if (!currentChatId) return;
      const chat = Store.getChat(currentChatId);
      if (chat) { chat.title = titleInput.value; Store.upsertChat(chat); }
    });

    const modelSel = Components.modelSelector(Store.getActiveProvider(), currentModel);
    modelSel.addEventListener('change', () => { currentModel = modelSel.value; });

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-secondary btn-sm';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', clearMessages);

    toolbar.appendChild(sidebarBtn);
    toolbar.appendChild(titleInput);
    toolbar.appendChild(modelSel);
    toolbar.appendChild(clearBtn);

    const messagesWrap = document.createElement('div');
    messagesWrap.className = 'messages-wrap';
    messagesWrap.id = 'chat-messages';

    const inputBar = Components.chatInputBar(sendMessage);
    inputBar.id = 'chat-input-bar';

    main.appendChild(toolbar);
    main.appendChild(messagesWrap);
    main.appendChild(inputBar);

    return main;
  }

  function newChat() {
    const id = Store.newId();
    const chat = { id, type: 'chat', title: 'New Chat', messages: [], createdAt: Date.now() };
    Store.upsertChat(chat);
    loadChat(id);
  }

  function loadChat(id) {
    currentChatId = id;
    const chat = Store.getChat(id);
    if (!chat) return;

    const titleInput = document.querySelector('#chat-toolbar .title-input');
    if (titleInput) titleInput.value = chat.title || '';

    const modelSel = document.querySelector('#chat-toolbar .model-select');
    if (modelSel) {
      currentModel = chat.model || Store.getActiveProvider()?.defaultModel;
      modelSel.value = currentModel;
    }

    renderMessages(chat.messages);
    refreshSidebar();
  }

  function renderMessages(messages) {
    const wrap = document.getElementById('chat-messages');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!messages || messages.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="big">💬</div><h2>Start a conversation</h2><p>Type a message below to begin</p></div>`;
      return;
    }
    messages.forEach(msg => {
      if (msg.role === 'system') return;
      const el = Components.renderMessage(msg, { editable: false, deletable: true });
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

    const userMsg = { id: Store.newId(), role: 'user', content: text, ts: Date.now() };
    chat.messages.push(userMsg);
    Store.upsertChat(chat);

    const wrap = document.getElementById('chat-messages');
    if (wrap) {
      const emptyState = wrap.querySelector('.empty-state');
      if (emptyState) emptyState.remove();
      const userEl = Components.renderMessage(userMsg, { deletable: true });
      userEl.querySelector('[data-action="delete"]')?.addEventListener('click', () => deleteMessage(userMsg.id));
      userEl.querySelector('[data-action="copy"]')?.addEventListener('click', () => navigator.clipboard.writeText(userMsg.content));
      wrap.appendChild(userEl);
      wrap.scrollTop = wrap.scrollHeight;
    }

    const inputBar = document.getElementById('chat-input-bar');
    inputBar?.setDisabled(true);
    isStreaming = true;

    const provider = Store.getActiveProvider();
    const settings = Store.getSettings();
    const model = currentModel || provider.defaultModel;

    const assistantMsg = { id: Store.newId(), role: 'assistant', content: '', ts: Date.now() };
    const assistantEl = Components.renderMessage(assistantMsg, {});
    const contentEl = assistantEl.querySelector('.msg-content');
    if (wrap) { wrap.appendChild(assistantEl); wrap.scrollTop = wrap.scrollHeight; }

    try {
      let fullContent = '';
      for await (const chunk of API.streamChat(provider, chat.messages.filter(m => m.role !== 'system' || true), model, {
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
    if (chat.title === 'New Chat' && chat.messages.length === 2) {
      chat.title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
      const titleInput = document.querySelector('#chat-toolbar .title-input');
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
    const ok = await Components.confirm('Delete this chat?');
    if (!ok) return;
    Store.deleteChat(id);
    if (currentChatId === id) {
      const remaining = Store.getChats().filter(c => c.type === 'chat');
      if (remaining.length > 0) loadChat(remaining[0].id);
      else newChat();
    } else {
      refreshSidebar();
    }
  }

  return { render };
})();
