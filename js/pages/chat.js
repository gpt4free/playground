const ChatPage = (() => {
  let currentChatId = null;
  let currentModel = null;
  let isStreaming = false;
  let abortController = null;
  let feedTimer = null;
  const notifiedIds = new Set();

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

    startFeedRefresh();
    API.runDueTriggers().catch(() => {});
    refreshServerNotifications();

    Store.getLastChat().then(lastChat => {
      const importChatId = localStorage.getItem('openChatId');
      if (importChatId) {
        localStorage.removeItem('openChatId');
        loadChat(importChatId);
      } else if (lastChat) {
        loadChat(lastChat.id);
      } else {
        newChat();
      }
    });
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
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn btn-secondary btn-sm" id="new-feed-btn" title="Add a live RSS/Atom feed">＋ Feed</button>
          <button class="btn btn-secondary btn-sm" id="new-trigger-btn" title="Create a trigger from a prompt">⚡</button>
          <button class="btn btn-primary btn-sm" id="new-chat-btn">+ New</button>
        </div>
      </div>
      <div class="sidebar-list" id="chat-list"></div>`;
    sidebar.querySelector('#new-chat-btn').addEventListener('click', () => {
      newChat();
      closeSidebar();
    });
    sidebar.querySelector('#new-feed-btn').addEventListener('click', () => {
      addFeed();
      closeSidebar();
    });
    sidebar.querySelector('#new-trigger-btn').addEventListener('click', () => {
      addTriggerFromPrompt();
      closeSidebar();
    });
    refreshSidebar(sidebar);
    return sidebar;
  }

  function refreshSidebar(sidebar) {
    const list = (sidebar || document.getElementById('chat-sidebar'))?.querySelector('#chat-list');
    if (!list) return;
    list.innerHTML = '';
    Store.getChats().then(chats => {
      const chatList = chats.filter(c => c.type === 'chat' || c.type === 'feed');
      if (chatList.length === 0) {
        list.innerHTML = '<div style="padding:16px;color:var(--text2);font-size:13px">No chats yet</div>';
        return;
      }
      chatList.forEach(chat => {
        const item = document.createElement('div');
        item.className = 'sidebar-item' + (chat.id === currentChatId ? ' active' : '');
        item.dataset.id = chat.id;
        const isFeed = chat.type === 'feed';
        const sub = isFeed
          ? `📡 Live feed · ${chat.count || 0} ${Components.escHtml(framework.translate('messages'))}`
          : `${chat.count} ${Components.escHtml(framework.translate('messages'))}`;
        const unread = chat.feedUnread ? `<span class="badge" style="margin-left:6px">${chat.feedUnread}</span>` : '';
        item.innerHTML = `
          <div style="flex:1;min-width:0">
            <div class="item-title">${isFeed ? '📡 ' : ''}${Components.escHtml(chat.title || 'Untitled')}${unread}</div>
            <div class="item-sub">${sub}</div>
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
      Store.getChat(currentChatId).then(chat => {
        if (chat) { chat.title = titleInput.value; Store.upsertChat(chat); }
      });
    });

    const modelSel = Components.modelSelector(Store.getActiveProvider(), currentModel);
    modelSel.addEventListener('change', () => {
      currentModel = modelSel.value;
    });

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-secondary btn-sm';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', clearMessages);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-secondary btn-sm';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => saveChatAsFile());

    const playBtn = document.createElement('button');
    playBtn.className = 'btn btn-secondary btn-sm';
    playBtn.textContent = 'Play';
    playBtn.addEventListener('click', () => playChatAsAudio());

    const qrBtn = document.createElement('button');
    qrBtn.className = 'btn btn-secondary btn-sm';
    qrBtn.textContent = 'QR';
    qrBtn.addEventListener('click', () => generateChatQRCode());

    const notifyBtn = document.createElement('button');
    notifyBtn.className = 'btn btn-secondary btn-sm';
    notifyBtn.id = 'chat-notify-btn';
    const paintNotifyBtn = () => {
      notifyBtn.textContent = (typeof Notifier !== 'undefined' && Notifier.isEnabled()) ? '🔔' : '🔕';
      notifyBtn.title = notifyBtn.textContent === '🔔'
        ? 'Notifications are on'
        : 'Enable notifications for finished messages';
    };
    notifyBtn.addEventListener('click', async () => {
      if (typeof Notifier === 'undefined') {
        Components.toast('Notifications are not supported here', 'error');
        return;
      }
      const enabled = await Notifier.toggle();
      paintNotifyBtn();
      Components.toast(
        enabled ? 'Notifications enabled' : 'Notifications disabled',
        enabled ? 'success' : 'info'
      );
    });
    paintNotifyBtn();

    toolbar.appendChild(sidebarBtn);
    toolbar.appendChild(titleInput);
    toolbar.appendChild(modelSel);
    toolbar.appendChild(clearBtn);
    toolbar.appendChild(saveBtn);
    toolbar.appendChild(playBtn);
    toolbar.appendChild(qrBtn);
    toolbar.appendChild(notifyBtn);

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
    const chat = { id, type: 'chat', title: framework.translate('New Chat'), items: [], added: Date.now() };
    Store.upsertChat(chat);
    loadChat(id);
  }

  function loadChat(id) {
    currentChatId = id;
    Store.getChat(id).then(chat => {
      console.log('Loaded chat:', chat);
      if (!chat) return;
      if (chat.type === 'feed' && chat.feedUnread) {
        chat.feedUnread = 0;
        Store.upsertChat(chat);
      }
      const sendBtn = document.querySelector('.input-bar .send-btn');
      if (sendBtn) {
        if (!chat.items.some(m => m.role === 'user')) {
          sendBtn.textContent = sendBtn.dataset.label;
          sendBtn.disabled = true;
        } else {
          sendBtn.textContent = framework.translate('Regenerate');
          sendBtn.disabled = false;
        }
      }

      const modelSel = document.querySelector('#chat-toolbar .model-select');
      if (modelSel) {
        currentModel = chat.model || Store.getActiveProvider()?.defaultModel;
        modelSel.value = currentModel;
      }

      const titleInput = document.querySelector('#chat-toolbar .title-input');
      if (titleInput) titleInput.value = chat.title || '';
      renderMessages(chat.items || chat.items || []);
    });
    refreshSidebar();
  }

  function renderMessages(messages) {
    const wrap = document.getElementById('chat-messages');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!messages || messages.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="big">💬</div><h2>Start a conversation</h2><p>Type a message below to begin</p></div>`;
      framework.translateElements(wrap.querySelectorAll('*'));
      return;
    }
    messages.forEach(msg => {
      if (msg.role === 'system') return;
      const el = Components.renderMessage(msg, { editable: false, deletable: true, audio: true });
      el.querySelector('[data-action="delete"]')?.addEventListener('click', () => deleteMessage(msg.id));
      el.querySelector('[data-action="copy"]')?.addEventListener('click', () => Components.copyMessageContent(msg));
      el.querySelector('[data-action="speak"]')?.addEventListener('click', () => playMessageAudio(msg.content));
      wrap.appendChild(el);
    });
    wrap.scrollTop = wrap.scrollHeight;
  }

  async function sendMessage(text) {
    if (isStreaming || !currentChatId) return;
    const chat = await Store.getChat(currentChatId);
    if (!chat) return;

    const provider = Store.getActiveProvider();
    const settings = Store.getSettings();
    const model = currentModel || provider.defaultModel;

    let userMsg = null;
    if (text) {
      userMsg = { id: Store.newId(), role: 'user', content: text, ts: Date.now() };
      chat.items.push(userMsg);
      Store.upsertChat(chat);
    }

    const wrap = document.getElementById('chat-messages');
    if (wrap && userMsg) {
      const emptyState = wrap.querySelector('.empty-state');
      if (emptyState) emptyState.remove();
      const userEl = Components.renderMessage(userMsg, { deletable: true });
      userEl.querySelector('[data-action="delete"]')?.addEventListener('click', () => deleteMessage(userMsg.id));
      userEl.querySelector('[data-action="copy"]')?.addEventListener('click', () => Components.copyMessageContent(userMsg));
      wrap.appendChild(userEl);
      wrap.scrollTop = wrap.scrollHeight;
    }

    const inputBar = document.getElementById('chat-input-bar');
    abortController = null;
    isStreaming = true;
    inputBar?.setStreaming(true, () => { abortController?.abort(); });

    const assistantMsg = { id: Store.newId(), role: 'assistant', content: '', thinking: '', images: [], ts: Date.now() };
    const assistantEl = Components.renderMessage(assistantMsg, {});
    const contentEl = assistantEl.querySelector('.msg-content');
    const thinkingBlock = assistantEl.querySelector('.thinking-block');
    if (thinkingBlock) thinkingBlock.classList.add('thinking-streaming');
    Components.addTypingIndicator(assistantEl);
    if (wrap) { wrap.appendChild(assistantEl); wrap.scrollTop = wrap.scrollHeight; }

    let typingRemoved = false;
    let collectedToolCalls = {};
    let wasAborted = false;

    try {
      let fullContent = '';
      let fullThinking = '';
      const images = [];
      let messages = [...chat.items];
      let doStreamChat = true;
      const selectedTools = API.getSelectedMCPToolsForAPI();
      while (doStreamChat) {
        doStreamChat = false;
        abortController = new AbortController();
        for await (const chunk of API.streamChat(provider, messages, model, {
          ...settings,
          tools: selectedTools,
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
          if (chunk.type === 'tool_calls') {
            API.mergeToolCalls(collectedToolCalls, chunk.tool_calls);
            continue;
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

        const toolCalls = Object.values(collectedToolCalls);
        if (toolCalls.length > 0) {
          collectedToolCalls = {};
          fullContent += Components.formatToolCalls(toolCalls);
          try {
            const toolResults = await API.executeToolCalls(toolCalls);
            const resultsText = toolResults.map(result => {
              let formatted = result.content;
              try {
                formatted = JSON.stringify(JSON.parse(result.content), null, 2);
              } catch {}
              return `\n\n✅ **Tool Result:** \`${result.name}\`\n\`\`\`json\n${formatted}\n\`\`\``;
            }).join('\n\n');
            fullContent += resultsText;
            messages = [...messages, {
                role: 'assistant',
                content: '',
                tool_calls: toolCalls
            }, ...toolResults];
            doStreamChat = true;
          } catch (err) {
            fullContent += `\n\n❌ **Tool Execution Error:** ${err?.message || String(err)}`;
          }
          contentEl.innerHTML = Components.renderMarkdown(fullContent);
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
      console.error('Streaming error:', err);
      if (err.name !== 'AbortError') {
        assistantMsg.error = true;
        assistantMsg.content = `**${framework.translate('Error')}**: ${err.message}`;
        contentEl.innerHTML = Components.renderMarkdown(assistantMsg.content);
        Components.toast(err.message, 'error');
      } else {
        wasAborted = true;
      }
    }

    if (!typingRemoved) {
      Components.removeTypingIndicator(assistantEl);
    }

    const streamingBlock = assistantEl.querySelector('.thinking-streaming');
    if (streamingBlock) streamingBlock.classList.remove('thinking-streaming');

    assistantEl.querySelector('[data-action="copy"]')?.addEventListener('click', () => Components.copyMessageContent(assistantMsg));
    if (chat.title === framework.translate('New Chat') && chat.items.length <= 2) {
      chat.title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
      const titleInput = document.querySelector('#chat-toolbar .title-input');
      if (titleInput) titleInput.value = chat.title;
    }
    chat.items.push(assistantMsg);
    Store.upsertChat(chat);
    refreshSidebar();

    if (!assistantMsg.error && !wasAborted) {
      if (typeof Notifier !== 'undefined') {
        Notifier.onMessageDone({
          chatId: chat.id,
          title: chat.title,
          preview: (assistantMsg.content || '').replace(/[#*_`>]/g, '').slice(0, 160),
        });
      }
      if (document.hidden) {
        API.notifyFinished({
          title: chat.title || 'Chat finished',
          body: (assistantMsg.content || '').replace(/[#*_`>]/g, '').slice(0, 200),
          kind: 'chat',
          source: chat.id,
        }).catch(() => {});
      }
    }

    isStreaming = false;
    abortController = null;
    inputBar?.setStreaming(false);
  }

  async function addFeed() {
    const raw = window.prompt('RSS or Atom feed URL (e.g. https://news.ycombinator.com/rss):');
    if (!raw) return;
    const url = raw.trim();
    if (!/^https?:\/\//i.test(url)) {
      Components.toast('Please enter an http(s) URL', 'error');
      return;
    }
    try {
      Components.toast('Loading feed...', 'info');
      const incoming = await API.getFeed(url, 50);
      const chats = await Store.getChats();
      const existing = chats.find(c => c.type === 'feed' && c.feedUrl === incoming.feedUrl);
      const id = existing ? existing.id : Store.newId();
      const previous = existing ? await Store.getChat(existing.id) : null;
      const seen = new Set(previous?.feedSeen || []);
      const items = previous
        ? [...(previous.items || []), ...incoming.items.filter(item => !seen.has(item.id))]
        : incoming.items;
      const chat = {
        ...(previous || {}),
        ...incoming,
        id,
        type: 'feed',
        items,
        feedSeen: Array.from(new Set([...(previous?.feedSeen || []), ...(incoming.feedSeen || [])])).slice(-500),
        feedUnread: 0,
        added: previous?.added || Date.now(),
        updated: Date.now(),
      };
      await Store.upsertChat(chat);
      loadChat(id);
      refreshSidebar();
      Components.toast(`Live feed added: ${incoming.title || url}`, 'success');
    } catch (err) {
      Components.toast(`Could not load feed: ${err.message}`, 'error');
    }
  }

  async function addTriggerFromPrompt() {
    const prompt = window.prompt(
      'Describe a trigger. Example: Notify me when the "AI" RSS feed mentions OpenAI every 10 minutes'
    );
    if (!prompt) return;
    try {
      const trigger = await API.createTriggerFromPrompt(prompt, null, true);
      Components.toast(`Trigger created: ${trigger.name}`, 'success');
    } catch (err) {
      Components.toast(`Could not create trigger: ${err.message}`, 'error');
    }
  }

  async function refreshFeeds() {
    let chats;
    try {
      chats = (await Store.getChats()).filter(c => c.type === 'feed' && c.feedUrl);
    } catch {
      return;
    }
    for (const summary of chats) {
      let chat;
      try {
        chat = await Store.getChat(summary.id);
      } catch {
        continue;
      }
      if (!chat || !chat.feedUrl) continue;
      try {
        const incoming = await API.getFeed(chat.feedUrl, 50, chat.id);
        const seen = new Set(chat.feedSeen || []);
        const fresh = (incoming.items || []).filter(item => item.id && !seen.has(item.id));
        if (fresh.length === 0) continue;
        chat.items = [...(chat.items || []), ...fresh];
        chat.feedSeen = Array.from(new Set([...(chat.feedSeen || []), ...fresh.map(item => item.id)])).slice(-500);
        chat.feedUnread = (chat.feedUnread || 0) + fresh.length;
        chat.title = incoming.title || chat.title;
        if (chat.id === currentChatId) {
          chat.feedUnread = 0;
          renderMessages(chat.items);
        } else if (typeof Notifier !== 'undefined') {
          Notifier.onFeedUpdate({
            chatId: chat.id,
            title: chat.title,
            count: fresh.length,
            preview: (fresh[fresh.length - 1].content || '').replace(/[#*_`>]/g, '').slice(0, 160),
          });
        }
        await Store.upsertChat(chat);
      } catch (err) {
        console.warn('Feed refresh failed:', chat.feedUrl, err);
      }
    }
    refreshSidebar();
  }

  let feedVisibilityBound = false;
  function startFeedRefresh() {
    if (feedTimer) clearInterval(feedTimer);
    feedTimer = setInterval(() => {
      if (document.hidden) return;
      API.runDueTriggers().catch(() => {});
      refreshFeeds();
      refreshServerNotifications();
    }, 5 * 60 * 1000);
    if (!feedVisibilityBound) {
      feedVisibilityBound = true;
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          API.runDueTriggers().catch(() => {});
          refreshFeeds();
          refreshServerNotifications();
        }
      });
    }
  }

  async function refreshServerNotifications() {
    try {
      const result = await API.getNotifications(true, 20);
      const items = result.data || [];
      let shown = 0;
      for (const item of items) {
        if (!item.id || notifiedIds.has(item.id)) continue;
        notifiedIds.add(item.id);
        shown += 1;
        if (typeof Notifier !== 'undefined') {
          const displayed = Notifier.notify(item.title, item.body, {
            tag: `g4f-${item.id}`,
            url: item.url,
            chatId: item.metadata?.chat_id,
          });
          if (!displayed && document.hidden === false && item.kind === 'trigger') {
            Components.toast(`${item.title}${item.body ? ` — ${item.body.slice(0, 80)}` : ''}`, 'info');
          }
        }
      }
      if (shown > 0) {
        if (document.hidden && typeof Notifier !== 'undefined') Notifier.bumpUnread(shown);
        await API.markNotificationsRead();
      }
    } catch (err) {
      console.debug('Notification refresh skipped:', err.message);
    }
  }

  function deleteMessage(msgId) {
    if (!currentChatId) return;
    Store.getChat(currentChatId).then(chat => {
      if (!chat) return;
      chat.items = chat.items.filter(m => m.id !== msgId);
      Store.upsertChat(chat);
      renderMessages(chat.items);
    });
  }

  function clearMessages() {
    if (!currentChatId) return;
    Store.getChat(currentChatId).then(chat => {
      if (!chat) return;
      chat.items = [];
      Store.upsertChat(chat);
      renderMessages([]);
    });
  }

  function createDownloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function saveChatAsFile() {
    if (!currentChatId) return;
    Store.getChat(currentChatId).then(chat => {
      if (!chat) return;
      const lines = [`Chat: ${chat.title || 'Untitled'}`, `Created: ${new Date(chat.added).toLocaleString()}`, ''];
      chat.items.forEach(item => {
        const role = item.role === 'user' ? 'You' : item.role === 'assistant' ? 'Assistant' : item.role;
        lines.push(`${role} [${item.id || ''}] @ ${new Date(item.ts).toLocaleString()}`);
        lines.push(item.content || '');
        lines.push('');
      });
      const filename = `${(chat.title || 'chat').replace(/[^a-z0-9_-]/gi, '_').slice(0, 40)}.txt`;
      createDownloadFile(filename, lines.join('\n'));
      Components.toast('Chat saved as file', 'success');
    });
  }

  async function fetchAudioUrl(text) {
    const payload = text.trim().slice(0, 1000);
    if (!payload) throw new Error('No text to play');
    const url = `https://g4f.space/ai/audio/${encodeURIComponent(payload)}`;
    const headers = {};
    const token = localStorage.getItem("g4f_session");
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    } else {
      return url;
    }
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
      throw new Error(`Audio request failed (${response.status})`);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }

  async function playMessageAudio(text) {
    try {
      const audioUrl = await fetchAudioUrl(text);
      const audio = new Audio(audioUrl);
      audio.onended = () => { URL.revokeObjectURL(audioUrl); Components.toast('Audio playback finished', 'success'); };
      audio.onerror = () => { URL.revokeObjectURL(audioUrl); Components.toast('Audio playback failed', 'error'); };
      await audio.play();
      Components.toast('Playing message audio', 'info');
    } catch (err) {
      Components.toast(err.message || 'Failed to play audio', 'error');
    }
  }

  async function playChatAsAudio() {
    if (!currentChatId) return;
    const chat = await Store.getChat(currentChatId);
    if (!chat || !chat.items || chat.items.length === 0) {
      Components.toast('Nothing to play', 'info');
      return;
    }
    const text = chat.items
      .map(item => {
        const role = item.role === 'user' ? 'You said:' : item.role === 'assistant' ? 'Assistant replied:' : `${item.role}:`;
        return `${role} ${item.content || ''}`;
      })
      .join(' \n ');
    try {
      const audioUrl = await fetchAudioUrl(text);
      const audio = new Audio(audioUrl);
      audio.onended = () => { URL.revokeObjectURL(audioUrl); Components.toast('Audio playback finished', 'success'); };
      audio.onerror = () => { URL.revokeObjectURL(audioUrl); Components.toast('Audio playback failed', 'error'); };
      await audio.play();
      Components.toast('Playing chat as audio', 'info');
    } catch (err) {
      Components.toast(err.message || 'Failed to play chat audio', 'error');
    }
  }

  function openQrcodeDb(mode) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('chat-db', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result.transaction('conversations', mode));
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('conversations')) {
          db.createObjectStore('conversations', { keyPath: 'id' });
        }
      };
    });
  }

  async function saveConversationForQRCode(chat) {
    const tx = await openQrcodeDb('readwrite');
    const store = tx.objectStore('conversations');
    store.put({
      id: chat.id || Store.newId(),
      title: chat.title,
      items: chat.items,
      added: chat.added || Date.now(),
      updated: Date.now(),
      type: 'chat'
    });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function generateChatQRCode() {
    if (!currentChatId) return;
    const chat = await Store.getChat(currentChatId);
    if (!chat || !chat.items || chat.items.length === 0) {
      Components.toast('No chat content available', 'info');
      return;
    }
    await saveConversationForQRCode(chat);
    const qrcodeUrl = new URL('qrcode.html#' + encodeURIComponent(chat.id), window.location.href).href;
    window.open(qrcodeUrl, '_blank');
  }

  async function deleteChat(id) {
    const ok = await Components.confirm(framework.translate('Are you sure you want to delete this session?'));
    if (!ok) return;
    Store.deleteChat(id);
    if (currentChatId === id) {
      Store.getChats().then(chats => {
        const remaining = chats.filter(c => c.type === 'chat');
        if (remaining.length > 0) loadChat(remaining[0].id);
        else newChat();
      });
    } else {
      refreshSidebar();
    }
  }

  return { render, open: loadChat, addFeed, addTriggerFromPrompt, refreshFeeds };
})();
