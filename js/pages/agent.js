const AgentPage = (() => {
  let currentProjectId = null;
  let currentModel = null;
  let isStreaming = false;
  let abortController = null;
  let currentProject = null;
  let messages = [];

  const AGENT_INSTRUCTION = [
    '[Agent Mode Instructions:',
    '',
    'You are an expert AI agent capable of planning and executing complex coding projects.',
    '',
    'CAPABILITIES:',
    '- Planning: Break down tasks into manageable steps',
    '- Analysis: Understand project requirements and code structure',
    '- Coding: Create and modify project files',
    '- Reasoning: Explain your approach and decisions',
    '- Tools: Use available tools to read files, write files, and run commands',
    '',
    'TOOL USAGE (IMPORTANT):',
    'When tools are available, use them to:',
    '- Save files to the workspace (use file write tools)',
    '- Read existing files (use file read tools)',
    '- Execute commands (use command/shell tools)',
    '- Query the file system (use file system tools)',
    'Call tools when you need actual file operations - don\'t just show code blocks.',
    '',
    'WHEN CREATING FILES:',
    'Use fenced code blocks with language and filename:',
    '```lang:path/filename.ext',
    'code content here',
    '```',
    'Also use tools to write the file to the workspace.',
    '',
    'WHEN EDITING FILES:',
    'Use SEARCH/REPLACE blocks with exact matching:',
    'path/filename.ext',
    '<<<<<<< SEARCH',
    'exact lines to find (must match exactly)',
    '=======',
    'replacement lines',
    '>>>>>>> REPLACE',
    '',
    'For each task:',
    '1. PLAN: Show your approach and steps',
    '2. IMPLEMENT: Create/modify files with code blocks AND use tools',
    '3. VERIFY: Confirm changes and next steps',
    '4. STATUS: Report completion and any issues',
    '',
    'Focus on:',
    '- Clean, maintainable code',
    '- Following project conventions',
    '- Clear file organization',
    '- Thorough documentation',
    '- Actually writing files to the workspace using tools',
    '',
    'Available context: You will see project structure and current files before each task.]'
  ].join('\n');

  function render(container) {
    Components.injectStyles();
    container.innerHTML = '';

    const layout = document.createElement('div');
    layout.className = 'split-layout';

    const backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    backdrop.id = 'agent-sidebar-backdrop';
    backdrop.addEventListener('click', closeSidebar);

    const sidebar = buildSidebar();
    const main = buildMain();

    layout.appendChild(backdrop);
    layout.appendChild(sidebar);
    layout.appendChild(main);
    container.appendChild(layout);

    Store.getChats().then(chats => {
      const agentProjects = chats.filter(p => p.type === 'agent');
      if (agentProjects.length > 0) {
        loadProject(agentProjects[0].id);
      } else {
        newProject();
      }
    });
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('agent-sidebar');
    const backdrop = document.getElementById('agent-sidebar-backdrop');
    sidebar?.classList.toggle('open');
    backdrop?.classList.toggle('open');
  }

  function closeSidebar() {
    const sidebar = document.getElementById('agent-sidebar');
    const backdrop = document.getElementById('agent-sidebar-backdrop');
    sidebar?.classList.remove('open');
    backdrop?.classList.remove('open');
  }

  function buildSidebar() {
    const sidebar = document.createElement('div');
    sidebar.className = 'sidebar';
    sidebar.id = 'agent-sidebar';
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <h3>Projects</h3>
        <button class="btn btn-primary btn-sm" id="new-project-btn">+ New</button>
      </div>
      <div class="sidebar-list" id="project-list"></div>
      <div style="padding: 14px; border-top: 1px solid var(--border); margin-top: auto;">
        <div style="font-size: 11px; color: var(--text2); font-weight: 600; margin-bottom: 8px; text-transform: uppercase;">Project Info</div>
        <div id="project-info" style="font-size: 12px; color: var(--text2); line-height: 1.6;"></div>
      </div>`;
    sidebar.querySelector('#new-project-btn').addEventListener('click', () => {
      newProject();
      closeSidebar();
    });
    refreshSidebar(sidebar);
    return sidebar;
  }

  function refreshSidebar(sidebar) {
    const list = (sidebar || document.getElementById('agent-sidebar'))?.querySelector('#project-list');
    if (!list) return;
    list.innerHTML = '';
    Store.getChats().then(chats => {
      const agentProjects = chats.filter(p => p.type === 'agent');
      if (agentProjects.length === 0) {
        list.innerHTML = '<div style="padding:16px;color:var(--text2);font-size:13px">No projects yet</div>';
        return;
      }
      agentProjects.forEach(proj => {
        const item = document.createElement('div');
        item.className = 'sidebar-item' + (proj.id === currentProjectId ? ' active' : '');
        item.dataset.id = proj.id;
        item.innerHTML = `
          <div style="flex:1;min-width:0">
            <div class="item-title">${Components.escHtml(proj.title || 'Untitled')}</div>
            <div class="item-sub">${Object.keys(proj.files || {}).length} files · ${(proj.tasks?.length || 0)} tasks</div>
          </div>
          <button class="item-del" title="Delete">✕</button>`;
        item.addEventListener('click', e => {
          if (e.target.classList.contains('item-del')) {
            Store.deleteChat(proj.id).then(() => refreshSidebar());
          } else {
            loadProject(proj.id);
            closeSidebar();
          }
        });
        list.appendChild(item);
      });
    });
  }

  function updateProjectInfo() {
    const info = document.getElementById('project-info');
    if (!info || !currentProject) return;
    const fileCount = Object.keys(currentProject.files || {}).length;
    const taskCount = (currentProject.tasks || []).length;
    const doneCount = (currentProject.tasks || []).filter(t => t.done).length;
    info.innerHTML = `
      <div><strong>Files:</strong> ${fileCount}</div>
      <div><strong>Tasks:</strong> ${doneCount}/${taskCount}</div>
      <div style="margin-top: 8px;"><button class="btn btn-secondary btn-sm" id="export-project">Export Project</button></div>
    `;
    info.querySelector('#export-project')?.addEventListener('click', exportProject);
  }

  function buildEditorPane() {
    const pane = document.createElement('div');
    pane.className = 'agent-editor-pane';
    pane.id = 'agent-editor-pane';

    pane.innerHTML = `
      <div class="editor-toolbar">
        <span class="editor-toolbar-title">Files</span>
        <button class="btn btn-secondary btn-sm" data-action="toggle-diff">Diff</button>
        <button class="btn btn-secondary btn-sm" data-action="download">↓ Save</button>
        <button class="btn btn-secondary btn-sm" data-action="download-all">↓ All</button>
      </div>
      <div class="editor-tabs"></div>
      <div class="editor-container">
        <div class="editor-empty">
          <div class="editor-empty-icon">📄</div>
          <div class="editor-empty-text">Code blocks from responses will appear here</div>
        </div>
      </div>`;

    return pane;
  }

  function buildMain() {
    const main = document.createElement('div');
    main.className = 'split-main';
    main.id = 'agent-main';

    const toolbar = document.createElement('div');
    toolbar.className = 'chat-toolbar';
    toolbar.id = 'agent-toolbar';

    const sidebarBtn = document.createElement('button');
    sidebarBtn.className = 'sidebar-toggle';
    sidebarBtn.innerHTML = '☰';
    sidebarBtn.addEventListener('click', toggleSidebar);

    const titleInput = document.createElement('input');
    titleInput.className = 'title-input';
    titleInput.placeholder = 'Project name...';
    titleInput.addEventListener('change', () => {
      if (!currentProjectId || !currentProject) return;
      currentProject.title = titleInput.value;
      Store.upsertChat(currentProject);
      refreshSidebar();
    });

    const modelSel = Components.modelSelector(Store.getActiveProvider(), currentModel);
    modelSel.addEventListener('change', () => {
      currentModel = modelSel.value;
    });

    // Code editor toggle button
    const editorToggle = document.createElement('button');
    editorToggle.className = 'btn btn-secondary btn-sm';
    editorToggle.id = 'agent-editor-toggle';
    editorToggle.textContent = '📝 Editor';
    editorToggle.title = 'Toggle code editor panel';
    editorToggle.addEventListener('click', toggleEditorPane);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-secondary btn-sm';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', clearMessages);

    const toolsBadge = document.createElement('span');
    toolsBadge.id = 'tools-badge';
    toolsBadge.style.cssText = 'font-size:11px;font-weight:500;color:var(--text2);background:var(--bg2);border:1px solid var(--border);border-radius:99px;padding:5px 12px;margin-left:auto;white-space:nowrap;';
    toolsBadge.textContent = '🔧 Tools: Loading...';
    
    // Update tools badge with actual tools
    setTimeout(() => {
      const tools = API.getSelectedMCPToolsForAPI();
      if (tools && tools.length > 0) {
        const toolNames = tools.map(t => t.function.name).slice(0, 3).join(', ');
        const moreCount = tools.length > 3 ? ` +${tools.length - 3}` : '';
        toolsBadge.textContent = `🔧 Tools: ${toolNames}${moreCount}`;
        toolsBadge.style.borderColor = 'var(--accent-border)';
        toolsBadge.style.color = 'var(--accent)';
      } else {
        toolsBadge.textContent = '🔧 No tools available';
      }
    }, 100);

    toolbar.appendChild(sidebarBtn);
    toolbar.appendChild(titleInput);
    toolbar.appendChild(modelSel);
    toolbar.appendChild(editorToggle);
    toolbar.appendChild(clearBtn);
    toolbar.appendChild(toolsBadge);
    toolbar.id = 'agent-toolbar';

    // Split layout: chat pane + editor pane
    const codingLayout = document.createElement('div');
    codingLayout.className = 'coding-layout';
    codingLayout.id = 'agent-coding-layout';
    codingLayout.style.cssText = 'flex:1;min-height:0;';

    // Chat pane
    const chatPane = document.createElement('div');
    chatPane.className = 'coding-chat-pane';
    chatPane.id = 'agent-chat-pane';

    const messagesDiv = document.createElement('div');
    messagesDiv.id = 'agent-messages';
    messagesDiv.className = 'chat-messages';
    messagesDiv.style.cssText = 'flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px;display:flex;flex-direction:column;gap:12px;';

    const inputArea = document.createElement('div');
    inputArea.className = 'chat-input-area';
    inputArea.style.cssText = 'padding:12px 16px;border-top:1px solid var(--border);gap:10px;display:flex;flex-direction:column;';

    const statusBar = document.createElement('div');
    statusBar.id = 'agent-status-bar';
    statusBar.style.cssText = 'display:none;align-items:center;gap:10px;padding:8px 12px;background:var(--bg3);border:1px solid var(--accent-border);border-radius:8px;font-size:12px;color:var(--accent);';
    statusBar.innerHTML = `
      <span id="agent-status-spinner" style="display:inline-block;width:14px;height:14px;border:2px solid var(--accent-border);border-top-color:var(--accent);border-radius:50%;animation:agent-spin .7s linear infinite;flex-shrink:0;"></span>
      <span id="agent-status-text" style="flex:1;">Starting...</span>
      <button id="agent-cancel-btn" class="btn btn-secondary btn-sm" style="padding:3px 10px;font-size:11px;">Cancel</button>`;

    const inputContainer = document.createElement('div');
    inputContainer.style.cssText = 'display:flex;gap:10px;align-items:flex-end;';

    const textarea = document.createElement('textarea');
    textarea.id = 'agent-input';
    textarea.placeholder = 'Describe your project or task... (Ctrl+Enter to send)';
    textarea.style.cssText = 'flex:1;min-height:60px;max-height:150px;padding:12px 16px;';
    
    const sendBtn = document.createElement('button');
    sendBtn.id = 'agent-send-btn';
    sendBtn.className = 'btn btn-primary btn-sm';
    sendBtn.textContent = 'Send';
    sendBtn.addEventListener('click', sendTask);

    textarea.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        sendTask();
      }
    });

    inputContainer.appendChild(textarea);
    inputContainer.appendChild(sendBtn);
    inputArea.appendChild(statusBar);
    inputArea.appendChild(inputContainer);

    chatPane.appendChild(messagesDiv);
    chatPane.appendChild(inputArea);

    // Editor pane
    const editorPane = buildAgentEditorPane();

    codingLayout.appendChild(chatPane);
    codingLayout.appendChild(editorPane);

    if (!document.getElementById('agent-spin-style')) {
      const s = document.createElement('style');
      s.id = 'agent-spin-style';
      s.textContent = '@keyframes agent-spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(s);
    }

    const contentContainer = document.createElement('div');
    contentContainer.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;';
    contentContainer.appendChild(inputArea);

    main.appendChild(toolbar);
    main.appendChild(codingLayout);

    // Initialize EditorPanel after DOM is attached (only once)
    setTimeout(() => {
      const editorPane = document.getElementById('agent-editor-pane');
      if (editorPane && !editorPane.dataset.editorInitialized) {
        editorPane.dataset.editorInitialized = '1';
        EditorPanel.init(editorPane, {
          onFilesChanged: (files) => {
            // Sync editor files back to project
            if (currentProject) {
              currentProject.files = currentProject.files || {};
              files.forEach(f => {
                if (!currentProject.files[f.name]) {
                  currentProject.files[f.name] = {
                    content: f.code,
                    language: f.lang,
                    createdAt: new Date().toISOString()
                  };
                } else {
                  currentProject.files[f.name].content = f.code;
                }
              });
              Store.upsertChat(currentProject);
              updateProjectInfo();
            }
          }
        });
      }
    }, 50);

    EditorPanel.init(editorPane);

    return main;
  }

  function buildAgentEditorPane() {
    const pane = document.createElement('div');
    pane.className = 'coding-editor-pane';
    pane.id = 'agent-editor-pane';

    pane.innerHTML = `
      <div class="editor-toolbar">
        <span class="editor-toolbar-title">Files</span>
        <button class="btn btn-secondary btn-sm" data-action="toggle-diff">Diff</button>
        <button class="btn btn-secondary btn-sm" data-action="download">↓ Save</button>
        <button class="btn btn-secondary btn-sm" data-action="download-all">↓ All</button>
      </div>
      <div class="editor-tabs"></div>
      <div class="editor-container">
        <div class="editor-empty">
          <div class="editor-empty-icon">📄</div>
          <div class="editor-empty-text">Code blocks from agent responses will appear here</div>
        </div>
      </div>`;

    return pane;
  }

  function toggleEditorPane() {
    const editorPane = document.getElementById('agent-editor-pane');
    const toggleBtn = document.getElementById('agent-editor-toggle');
    if (!editorPane) return;
    const isVisible = editorPane.classList.contains('visible');
    if (isVisible) {
      editorPane.classList.remove('visible');
      if (toggleBtn) toggleBtn.textContent = '📝 Editor';
    } else {
      editorPane.classList.add('visible');
      if (toggleBtn) toggleBtn.textContent = '💬 Chat';
      // Populate editor with project files if empty
      populateEditorFromProject();
    }
  }

  function populateEditorFromProject() {
    if (!currentProject || !currentProject.files) return;
    const editorFiles = EditorPanel.getFiles();
    if (editorFiles.length > 0) return; // Already has files

    const fileEntries = Object.entries(currentProject.files);
    if (fileEntries.length === 0) return;

    // Build a fake content string with code blocks to feed into EditorPanel
    const fakeContent = fileEntries.map(([name, file]) => {
      const lang = file.language || name.split('.').pop() || '';
      return '```' + lang + ':' + name + '\n' + file.content + '\n```';
    }).join('\n\n');

    EditorPanel.addFilesFromContent(fakeContent);
  }

  async function newProject() {
    const title = prompt('Project name:') || 'Untitled Agent Project';
    const project = {
      id: `agent_${Date.now()}`,
      type: 'agent',
      title,
      files: {},
      tasks: [],
      createdAt: new Date().toISOString(),
    };
    await Store.upsertChat(project);
    loadProject(project.id);
  }

  async function loadProject(projectId) {
    currentProjectId = projectId;
    const project = await Store.getChat(projectId);
    if (!project) {
      newProject();
      return;
    }
    currentProject = project;
    
    // Reset editor panel for new project
    EditorPanel.reset();
    
    const titleInput = document.querySelector('.title-input');
    if (titleInput) titleInput.value = project.title || '';
    
    // Reconstruct messages from stored tasks
    messages = [];
    if (project.tasks && project.tasks.length > 0) {
      project.tasks.forEach(task => {
        // Add user message
        messages.push({
          role: 'user',
          content: task.content
        });
        // Add assistant message with files if available
        if (task.response) {
          const assistantMsg = {
            role: 'assistant',
            content: task.response,
            thinking: task.thinking || '',
            files: [],
            retryCount: task.retryCount || 0
          };
          // Extract files from project that were created for this task
          if (task.createdFiles) {
            task.createdFiles.forEach(filepath => {
              if (project.files && project.files[filepath]) {
                assistantMsg.files.push({
                  path: filepath,
                  content: project.files[filepath].content,
                  language: project.files[filepath].language
                });
              }
            });
          }
          messages.push(assistantMsg);
        }
      });
    }
    
    renderMessages();
    updateProjectInfo();
    refreshSidebar();

    // Populate editor with existing project files
    setTimeout(() => {
      populateEditorFromProject();
    }, 100);
  }

  function renderMessages() {
    const container = document.getElementById('agent-messages');
    if (!container) return;
    container.innerHTML = '';

    if (messages.length === 0) {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;text-align:center;color:var(--text2);">
          <div style="font-size:32px;margin-bottom:16px;">🤖</div>
          <div style="font-size:15px;font-weight:600;margin-bottom:8px;">Agent Ready</div>
          <div style="font-size:13px;max-width:300px;">Describe your project and the agent will help you build it, create files, and manage tasks.</div>
        </div>`;
      return;
    }

    messages.forEach((msg, idx) => {
      const bubble = document.createElement('div');
      bubble.className = 'message-bubble ' + (msg.role === 'user' ? 'user' : 'assistant');
      bubble.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 6px;
        ${msg.role === 'user' ? 'align-self: flex-end; background: var(--accent-soft); border: 1px solid var(--accent-border); color: var(--text);' : 'align-self: flex-start; background: var(--bg2); border: 1px solid var(--border); color: var(--text);'}
        padding: 12px 14px;
        border-radius: var(--radius);
        max-width: 85%;
        word-wrap: break-word;
        font-size: 14px;
        line-height: 1.5;
      `;

      if (msg.thinking) {
        const thinkingDiv = document.createElement('div');
        thinkingDiv.style.cssText = 'font-size:12px;color:var(--text2);padding:8px;background:rgba(0,0,0,0.2);border-radius:6px;font-style:italic;';
        thinkingDiv.innerHTML = `<strong>Thinking:</strong> ${Components.escHtml(msg.thinking)}`;
        bubble.appendChild(thinkingDiv);
      }

      // Show tool usage badge if applicable
      if (msg.content && (msg.content.includes('Tool Results') || msg.content.includes('Executing tools'))) {
        const toolBadge = document.createElement('div');
        toolBadge.style.cssText = 'font-size:11px;color:var(--green);padding:6px 10px;background:rgba(74,222,128,0.15);border:1px solid rgba(74,222,128,0.4);border-radius:6px;';
        toolBadge.innerHTML = '🔧 Tools executed successfully';
        bubble.appendChild(toolBadge);
      }

      if (msg.content) {
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = formatMessageContent(msg.content);
        // Wire up "Add to Editor" buttons
        contentDiv.querySelectorAll('.agent-add-to-editor').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const blockId = btn.dataset.blockId;
            const codeData = formatMessageContent._codeMap && formatMessageContent._codeMap[blockId];
            if (codeData) {
              addFileToEditor(codeData.filename, codeData.lang, codeData.code);
            }
          });
        });
        bubble.appendChild(contentDiv);
      }

      EditorPanel.applyEditsFromContent(msg.content);
      EditorPanel.addFilesFromContent(msg.content);

      if (msg.files && msg.files.length > 0) {
        const filesDiv = document.createElement('div');
        filesDiv.style.cssText = 'font-size:12px;margin-top:8px;';
        msg.files.forEach(file => {
          const badge = document.createElement('span');
          badge.className = 'file-edit-badge';
          badge.dataset.openFile = file.path;
          badge.innerHTML = `
            <span class="file-edit-badge-icon">📄</span>
            <span class="file-edit-badge-name">${Components.escHtml(file.path)}</span>
            <span class="file-edit-badge-action">Open in Editor →</span>
          `;
          badge.style.cursor = 'pointer';
          badge.title = 'Click to open file';
          badge.addEventListener('click', () => {
            const fname = badge.dataset.openFile;
            const editorFiles = EditorPanel.getFiles();
            const idx = editorFiles.findIndex(f => f.name === fname);
            console.log(idx, fname, editorFiles);
            if (idx >= 0) {
              const isMobile = window.innerWidth < 768;
              if (isMobile) {
                document.getElementById('editor-fab')?.click();
              }
            }
          });
          filesDiv.appendChild(badge);
        });
        bubble.appendChild(filesDiv);
      }

      // Show retry info and button for failed messages
      if (msg.error) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'font-size:12px;color:var(--red);padding:8px;background:rgba(248,113,113,0.1);border-radius:6px;margin-top:8px;';
        const retryCount = msg.retryCount || 0;
        const retryText = retryCount > 0 ? `Retry attempt ${retryCount}` : 'Failed';
        errorDiv.innerHTML = `❌ ${Components.escHtml(msg.error)} <em>(${retryText})</em>`;
        bubble.appendChild(errorDiv);
        
        const retryBtn = document.createElement('button');
        retryBtn.className = 'btn btn-secondary btn-sm';
        retryBtn.style.cssText = 'margin-top:8px;';
        retryBtn.textContent = 'Retry';
        retryBtn.addEventListener('click', () => retryFailedTask(idx));
        bubble.appendChild(retryBtn);
      }

      container.appendChild(bubble);
    });

    container.scrollTop = container.scrollHeight;
  }

  function formatMessageContent(content) {
    let html = Components.escHtml(content);
    // Format code blocks with "Add to Editor" button
    html = html.replace(/```(\w+):([^\n]+)\n([\s\S]*?)```/g, (match, lang, filename, code) => {
      const safeFilename = Components.escHtml(filename);
      const safeCode = Components.escHtml(code);
      const safeLang = Components.escHtml(lang);
      // Use a unique ID to reference the code instead of storing in data attribute
      const blockId = 'cb_' + Math.random().toString(36).slice(2, 10);
      // Store raw code in a map
      if (!formatMessageContent._codeMap) formatMessageContent._codeMap = {};
      formatMessageContent._codeMap[blockId] = { filename, lang, code };
      return `<div class="agent-code-block" data-block-id="${blockId}" style="margin:8px 0;background:var(--code-bg);border:1px solid var(--border);border-radius:6px;overflow:hidden;"><div style="padding:8px 10px;background:var(--bg3);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;"><span style="font-family:monospace;font-size:12px;color:var(--accent);">📄 ${safeFilename}</span><button class="btn btn-secondary btn-sm agent-add-to-editor" data-block-id="${blockId}" style="font-size:10px;padding:2px 8px;">+ Add to Editor</button></div><pre style="padding:12px;overflow-x:auto;margin:0;">${safeCode}</pre></div>`;
    });
    // Format unnamed code blocks with "Add to Editor" button
    html = html.replace(/```(\w+)\n([\s\S]*?)```/g, (match, lang, code) => {
      if (match.includes('data-block-id')) return match; // Already processed above
      const safeLang = Components.escHtml(lang);
      const safeCode = Components.escHtml(code);
      const autoFilename = `file_${Date.now()}.${lang || 'txt'}`;
      const blockId = 'cb_' + Math.random().toString(36).slice(2, 10);
      if (!formatMessageContent._codeMap) formatMessageContent._codeMap = {};
      formatMessageContent._codeMap[blockId] = { filename: autoFilename, lang, code };
      return `<div class="agent-code-block" data-block-id="${blockId}" style="margin:8px 0;background:var(--code-bg);border:1px solid var(--border);border-radius:6px;overflow:hidden;"><div style="padding:8px 10px;background:var(--bg3);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;"><span style="font-family:monospace;font-size:12px;color:var(--text2);">${safeLang} code block</span><button class="btn btn-secondary btn-sm agent-add-to-editor" data-block-id="${blockId}" style="font-size:10px;padding:2px 8px;">+ Add to Editor</button></div><pre style="padding:12px;overflow-x:auto;margin:0;">${safeCode}</pre></div>`;
    });
    // Format SEARCH/REPLACE blocks
    html = html.replace(/([^\n]+)\n<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g, (match, file, search, replace) => {
      return `<div style="margin:8px 0;background:var(--code-bg);border:1px solid var(--border);border-radius:6px;overflow:hidden;"><div style="padding:8px;background:var(--bg3);border-bottom:1px solid var(--border);font-family:monospace;font-size:12px;color:var(--accent);">${Components.escHtml(file.trim())}</div><pre style="padding:12px;overflow-x:auto;margin:0;"><span style="color:var(--red);">- ${Components.escHtml(search.trim())}</span><br/><span style="color:var(--green);">+ ${Components.escHtml(replace.trim())}</span></pre></div>`;
    });
    return html;
  }

  function setAgentStatus(text, phase) {
    const bar = document.getElementById('agent-status-bar');
    const statusText = document.getElementById('agent-status-text');
    const input = document.getElementById('agent-input');
    const sendBtn = document.getElementById('agent-send-btn');
    if (!bar) return;
    if (text === null) {
      bar.style.display = 'none';
      if (input) input.disabled = false;
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send'; }
    } else {
      bar.style.display = 'flex';
      if (statusText) statusText.textContent = text;
      if (input) input.disabled = true;
      if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Running...'; }
    }
    // Update cancel button handler
    const cancelBtn = document.getElementById('agent-cancel-btn');
    if (cancelBtn) {
      cancelBtn.onclick = () => { abortController?.abort(); setAgentStatus(null); };
    }
  }

  function getLiveStreamBubble() {
    const container = document.getElementById('agent-messages');
    if (!container) return null;
    let bubble = container.querySelector('.agent-live-bubble');
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.className = 'agent-live-bubble';
      bubble.style.cssText = 'align-self:flex-start;background:var(--bg2);border:1px solid var(--accent-border);color:var(--text);padding:12px 14px;border-radius:var(--radius);max-width:85%;word-wrap:break-word;font-size:14px;line-height:1.5;white-space:pre-wrap;min-width:60px;';
      container.appendChild(bubble);
    }
    container.scrollTop = container.scrollHeight;
    return bubble;
  }

  function removeLiveStreamBubble() {
    document.querySelector('.agent-live-bubble')?.remove();
  }

  async function sendTask() {
    const input = document.getElementById('agent-input');
    if (!input || !input.value.trim() || isStreaming) return;

    const userMessage = input.value.trim();
    input.value = '';

    messages.push({ role: 'user', content: userMessage });
    renderMessages();

    isStreaming = true;
    abortController = new AbortController();
    setAgentStatus('Thinking...');

    try {
      await executeAgentTask(userMessage);
    } catch (err) {
      console.error('Agent error:', err);
      messages.push({
        role: 'assistant',
        content: '',
        error: err.message || 'Unknown error occurred',
        retryCount: 0
      });
    } finally {
      isStreaming = false;
      removeLiveStreamBubble();
      setAgentStatus(null);
    }

    renderMessages();
  }

  async function retryFailedTask(messageIndex) {
    if (messageIndex <= 0 || messageIndex >= messages.length) return;
    
    // Find the corresponding user message (always before assistant message)
    let userMessageIdx = messageIndex - 1;
    while (userMessageIdx >= 0 && messages[userMessageIdx].role !== 'user') {
      userMessageIdx--;
    }
    
    if (userMessageIdx < 0) return;
    
    const userMessage = messages[userMessageIdx].content;
    const failedMsg = messages[messageIndex];
    
    // Increment retry count
    failedMsg.retryCount = (failedMsg.retryCount || 0) + 1;
    failedMsg.retrying = true;
    renderMessages();

    isStreaming = true;
    abortController = new AbortController();
    setAgentStatus('Retrying...');

    try {
      await executeAgentTask(userMessage, failedMsg);
      // Clear error state on successful retry
      delete failedMsg.error;
      delete failedMsg.retrying;
    } catch (err) {
      console.error('Retry error:', err);
      failedMsg.error = err.message || 'Unknown error occurred';
      delete failedMsg.retrying;
    } finally {
      isStreaming = false;
      removeLiveStreamBubble();
      setAgentStatus(null);
    }

    renderMessages();
  }

  async function writeFilesWithMCP(files) {
    const mcpClient = API.getMCPClient();
    if (!mcpClient) return false;
    
    try {
      // Get all available tools
      const tools = await mcpClient.getAllTools();
      if (!tools || tools.length === 0) {
        console.warn('No MCP tools available');
        return false;
      }
      
      // Find file write tools
      const writeTools = tools.filter(t => 
        t.name?.toLowerCase().includes('write') && 
        (t.name?.toLowerCase().includes('file') || t.name?.toLowerCase().includes('create'))
      );
      
      if (writeTools.length === 0) {
        console.warn('No file write tool found in MCP');
        return false;
      }
      
      // Create tool calls for each file
      const toolCalls = files.map((file, idx) => ({
        id: `file_write_${idx}`,
        function: {
            name: writeTools[0].name,
            arguments: {
            path: file.path,
            content: file.content
            }
        }
      }));
      
      // Execute the tool calls
      const results = await mcpClient.executeToolCalls(toolCalls);
      return results && results.length > 0;
    } catch (err) {
      console.warn('MCP file write failed:', err);
      return false;
    }
  }

  async function executeAgentTask(task, existingMessage = null) {
    const provider = Store.getActiveProvider();
    if (!provider) throw new Error('No provider configured');

    const systemMsg = {
      role: 'system',
      content: AGENT_INSTRUCTION + '\n\n' + buildProjectContext()
    };

    let apiMessages = [systemMsg, ...messages.map(m => ({
      role: m.role,
      content: m.content || ''
    }))];

    let assistantMessage = existingMessage || {
      role: 'assistant',
      content: '',
      thinking: '',
      files: []
    };
    
    // Reset content on retry
    if (existingMessage) {
      assistantMessage.content = '';
      assistantMessage.thinking = '';
      assistantMessage.files = [];
    }

    try {
      // Get available tools from MCP
      const selectedTools = API.getSelectedMCPToolsForAPI();
      let toolCallsExecuted = false;
      let retryCount = 0;
      const maxToolLoops = 5; // Prevent infinite loops

      // Main agent loop for tool use
      while (retryCount < maxToolLoops) {
        retryCount++;
        let collectedToolCalls = {};
        let liveContent = '';

        setAgentStatus(retryCount === 1 ? 'Thinking...' : `Tool loop ${retryCount}...`);

        const stream = API.streamChat(provider, apiMessages, currentModel, {
          signal: abortController.signal,
          tools: selectedTools,
          toolChoice: selectedTools ? 'auto' : undefined
        });

        for await (const chunk of stream) {
          if (chunk.type === 'thinking') {
            assistantMessage.thinking += chunk.content;
            setAgentStatus('Thinking...');
          } else if (chunk.type === 'text') {
            assistantMessage.content += chunk.content;
            liveContent += chunk.content;
            // Update live streaming bubble
            const bubble = getLiveStreamBubble();
            if (bubble) {
              bubble.textContent = liveContent.length > 600
                ? '...' + liveContent.slice(-600)
                : liveContent;
              document.getElementById('agent-messages').scrollTop = 99999;
            }
          } else if (chunk.type === 'tool_calls') {
            API.mergeToolCalls(collectedToolCalls, chunk.tool_calls);
          }
        }

        const toolCalls = Object.values(collectedToolCalls);
        
        // If no tool calls, we're done
        if (toolCalls.length === 0) {
          break;
        }

        // Execute the tool calls
        toolCallsExecuted = true;
        const toolResultsText = [];
        const toolNames = toolCalls.map(t => t.name || 'tool').join(', ');
        setAgentStatus(`Running tools: ${toolNames}`);

        try {
          const toolResults = await API.executeToolCalls(toolCalls);
          
          // Add assistant message with tool calls
          apiMessages.push({
            role: 'assistant',
            content: assistantMessage.content,
            tool_calls: toolCalls
          });
          apiMessages.push(...toolResults);

          // Process and add tool results
          toolResults.forEach(result => {
            try {
              // Try to parse as JSON for better display
              const parsedContent = JSON.stringify(JSON.parse(result.content), null, 2);
              toolResultsText.push(`✅ **${result.name}**:\n\`\`\`json\n${parsedContent}\n\`\`\`\n`);
            } catch {
              // Not JSON, show as plain text
              toolResultsText.push(`✅ **${result.name}**: ${result.content}`);
            }
          });
          
          // Add tool results to assistant message for display
          if (toolResultsText.length > 0) {
            assistantMessage.content += '\n\n**Tool Results:**\n' + toolResultsText.join('\n\n');
          }
        } catch (toolErr) {
          assistantMessage.content += `\n\n❌ **Tool Execution Error**: ${toolErr?.message || String(toolErr)}`;
          break;
        }
      }

      // Extract and save files from response
      const fileRegex = /```(\w+):([^\n]+)\n([\s\S]*?)```/g;
      let match;
      const createdFiles = [];
      while ((match = fileRegex.exec(assistantMessage.content)) !== null) {
        const [, lang, filepath, content] = match;
        const trimmedPath = filepath.trim().split(':').slice(-1)[0];
        const trimmedContent = content.trim();
        
        assistantMessage.files.push({
          path: trimmedPath,
          content: trimmedContent,
          language: lang
        });
        
        if (currentProject) {
          currentProject.files = currentProject.files || {};
          currentProject.files[trimmedPath] = {
            content: trimmedContent,
            language: lang,
            createdAt: new Date().toISOString()
          };
        }
        
        createdFiles.push(trimmedPath);
      }

      // Feed files into the EditorPanel
      if (assistantMessage.files.length > 0) {
        EditorPanel.addFilesFromContent(assistantMessage.content);
      }

      // Try to write files using MCP tool
      if (assistantMessage.files.length > 0) {
        const mcpWriteSuccess = await writeFilesWithMCP(assistantMessage.files);
        if (mcpWriteSuccess) {
          assistantMessage.content += '\n\n✅ **Files written to workspace via MCP**';
        } else {
          assistantMessage.content += '\n\n📁 **Files saved in project (download project to get files)**';
        }
      }

      // Save project with full task details
      if (currentProject) {
        currentProject.tasks = currentProject.tasks || [];
        
        if (existingMessage) {
          // Update existing task on retry
          const lastTask = currentProject.tasks[currentProject.tasks.length - 1];
          if (lastTask && lastTask.content === task) {
            lastTask.response = assistantMessage.content;
            lastTask.thinking = assistantMessage.thinking;
            lastTask.createdFiles = createdFiles;
            lastTask.retryCount = (lastTask.retryCount || 0) + 1;
            lastTask.updatedAt = new Date().toISOString();
          }
        } else {
          // Create new task
          currentProject.tasks.push({
            id: `task_${Date.now()}`,
            content: task,
            response: assistantMessage.content,
            thinking: assistantMessage.thinking,
            createdFiles: createdFiles,
            done: true,
            retryCount: 0,
            createdAt: new Date().toISOString()
          });
        }
        
        await Store.upsertChat(currentProject);
      }

      if (!existingMessage) {
        messages.push(assistantMessage);
      }
      updateProjectInfo();

    } catch (err) {
      if (err.name === 'AbortError') {
        assistantMessage.content += '\n\n*Task cancelled*';
      }
      throw err;
    }
  }

  function buildProjectContext() {
    if (!currentProject) return '';
    
    const filesList = Object.keys(currentProject.files || {})
      .map(f => `- ${f} (${(currentProject.files[f].content || '').length} chars)`)
      .join('\n');
    
    const filesPreview = Object.entries(currentProject.files || {})
      .slice(0, 5)
      .map(([name, file]) => `### ${name}\n\`\`\`\n${(file.content || '').substring(0, 200)}${(file.content || '').length > 200 ? '...' : ''}\n\`\`\``)
      .join('\n\n');

    return `
CURRENT PROJECT: ${currentProject.title || 'Untitled'}

FILES IN PROJECT:
${filesList || 'No files yet'}

RECENT FILES:
${filesPreview || 'No files yet'}

TASKS COMPLETED: ${(currentProject.tasks || []).filter(t => t.done).length}/${(currentProject.tasks || []).length}
`;
  }

  function addFileToEditor(filename, lang, code) {
    // Show the editor pane if hidden
    const editorPane = document.getElementById('agent-editor-pane');
    const toggleBtn = document.getElementById('agent-editor-toggle');
    if (editorPane && !editorPane.classList.contains('visible')) {
      editorPane.classList.add('visible');
      if (toggleBtn) toggleBtn.textContent = '💬 Chat';
    }
    // Build a code block string and feed to EditorPanel
    const fakeContent = '```' + lang + ':' + filename + '\n' + code + '\n```';
    EditorPanel.addFilesFromContent(fakeContent);
    Components.toast(`Added ${filename} to editor`, 'success');
  }

  function clearMessages() {
    if (!confirm('Clear all messages? This cannot be undone.')) return;
    messages = [];
    renderMessages();
  }

  async function exportProject() {
    if (!currentProject) return;
    
    let exported = `# ${currentProject.title}\n\nExported: ${new Date().toLocaleString()}\n\n`;
    
    exported += '## Files\n\n';
    Object.entries(currentProject.files || {}).forEach(([name, file]) => {
      exported += `### ${name}\n\n\`\`\`${file.language || ''}\n${file.content}\n\`\`\`\n\n`;
    });

    exported += '## Tasks\n\n';
    (currentProject.tasks || []).forEach(task => {
      exported += `- ${task.done ? '✓' : '○'} ${task.content}\n`;
    });

    const blob = new Blob([exported], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject.title.replace(/\s+/g, '-')}-export.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    render,
  };
})();
