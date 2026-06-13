const AppStorePage = (() => {
  const APPS_BASE = 'https://g4f.dev/apps/';

  const STATIC_APPS = [
    { slug: 'dash', file: 'https://cdn.miniapps.ai/miniapps/91dfa307-8365-4707-be63-8717f55d8b92/1/index.html', name: 'G4F Quest Hub', icon: '<img src="https://cdn.miniapps.ai/cdn-cgi/image/w=32,h=32,fit=cover/images/tools/91dfa307-8365-4707-be63-8717f55d8b92/logo-d12e5351-3c40-4022-a309-b263a1430b9e.png">', desc: 'Gamification Dashboard for GPT4Free' },
    { file: '2048_game.html', name: '2048 Game', icon: '🧩', desc: 'Classic sliding tile puzzle' },
    // { file: 'anondrop-streamer.html', name: 'AnonDrop Streamer', icon: '📡', desc: 'Anonymous file streaming tool' },
    { file: 'api_tester_like_postman-lite.html', name: 'API Tester', icon: '🔧', desc: 'Lightweight Postman-like API client' },
    { file: 'calculator.html', name: 'Calculator', icon: '🔢', desc: 'Simple arithmetic calculator' },
    { file: 'color_picker.html', name: 'Color Picker', icon: '🎨', desc: 'Pick and copy hex colors' },
    { file: 'countdown_timer.html', name: 'Countdown Timer', icon: '⏱️', desc: 'Set a countdown with alarm sound' },
    { file: 'currency_converter.html', name: 'Currency Converter', icon: '💱', desc: 'Convert between currencies' },
    { file: 'dailymotivationalquotegenerator.html', name: 'Daily Quote', icon: '💬', desc: 'Random motivational quotes' },
    { file: 'digital_clock.html', name: 'Digital Clock', icon: '🕐', desc: 'Live digital time display' },
    { file: 'dynamic_kanban_board_drag__drop.html', name: 'Kanban Board', icon: '📋', desc: 'Drag & drop task board' },
    { file: 'expense_tracker_localstorage.html', name: 'Expense Tracker', icon: '💰', desc: 'Track expenses in localStorage' },
    { file: 'file-drop_image_compressor.html', name: 'Image Compressor', icon: '🖼️', desc: 'Drop images to compress' },
    { file: 'flappy_bird_clone.html', name: 'Flappy Bird', icon: '🐦', desc: 'Classic flappy bird clone' },
    { file: 'flashcard_learning_app.html', name: 'Flashcards', icon: '🃏', desc: 'Study with flashcard decks' },
    { file: 'hangman_game.html', name: 'Hangman', icon: '🎯', desc: 'Word guessing game' },
    { file: 'interactivequizplatform.html', name: 'Quiz Platform', icon: '❓', desc: 'Interactive quiz builder' },
    { file: 'interactiveto-dolistwithdrag-and-drop.html', name: 'Todo List', icon: '✅', desc: 'Drag & drop to-do list' },
    { file: 'markdown_previewer.html', name: 'Markdown Previewer', icon: '📝', desc: 'Live markdown editor & preview' },
    { file: 'maze_generator__solver.html', name: 'Maze Solver', icon: '🌀', desc: 'Generate and solve mazes' },
    { file: 'memorycardmatchingchallenge.html', name: 'Memory Match', icon: '🧠', desc: 'Card matching memory game' },
    { file: 'model_tester.html', name: 'Model Tester', icon: '🧪', desc: 'Test AI model responses' },
    { file: 'moov-relocator.html', name: 'Moov Relocator', icon: '🚚', desc: 'Relocation planning tool' },
    { file: 'notepad_notes_app.html', name: 'Notepad', icon: '📄', desc: 'Simple notes app' },
    { file: 'pac-man_game_canvas.html', name: 'Pac-Man', icon: '👻', desc: 'Canvas-based Pac-Man game' },
    { file: 'paint_clone.html', name: 'Paint Clone', icon: '🖌️', desc: 'Simple drawing canvas' },
    { file: 'personalexpensetrackerwithcharts.html', name: 'Expense Charts', icon: '📊', desc: 'Expense tracker with charts' },
    { file: 'quote_generator.html', name: 'Quote Generator', icon: '✨', desc: 'Generate random quotes' },
    { file: 'random_password_generator.html', name: 'Password Gen', icon: '🔐', desc: 'Generate secure passwords' },
    { file: 'recipefinderbyingredients.html', name: 'Recipe Finder', icon: '🍳', desc: 'Find recipes by ingredients' },
    { file: 'simon_memory_game.html', name: 'Simon Game', icon: '🔴', desc: 'Classic Simon memory game' },
    { file: 'simple_bmi_calculator.html', name: 'BMI Calculator', icon: '⚖️', desc: 'Calculate body mass index' },
    // { file: 'simple_poll_voting_app.html', name: 'Poll Voting', icon: '🗳️', desc: 'Create and vote on polls' },
    { file: 'snake_game.html', name: 'Snake Game', icon: '🐍', desc: 'Classic snake game' },
    { file: 'stopwatch.html', name: 'Stopwatch', icon: '⏲️', desc: 'Precision stopwatch timer' },
    { file: 'sudoku_solver_(basic).html', name: 'Sudoku Solver', icon: '🧮', desc: 'Basic sudoku puzzle solver' },
    { file: 'tetris.html', name: 'Tetris', icon: '🧱', desc: 'Classic block-stacking game' },
    { file: 'tip_calculator.html', name: 'Tip Calculator', icon: '💵', desc: 'Calculate tips and splits' },
    { file: 'to-do_list_app.html', name: 'Todo List', icon: '📋', desc: 'Simple task checklist' },
    { file: 'typing_speed_test.html', name: 'Typing Test', icon: '⌨️', desc: 'Measure typing speed' },
    { file: 'unit_converter_(length,_weight,_temperature).html', name: 'Unit Converter', icon: '📏', desc: 'Convert length, weight, temp' },
    // { file: 'video-converter.html', name: 'Video Converter', icon: '🎬', desc: 'Convert video formats' },
    { file: 'voice-controlledstopwatch.html', name: 'Voice Stopwatch', icon: '🎤', desc: 'Voice-controlled stopwatch' },
    { file: 'voice_assistant.html', name: 'Voice Assistant', icon: '🗣️', desc: 'Browser voice assistant' },
    { file: 'https://g4f.dev/background.html', name: 'Background AI', icon: '🎨', desc: 'AI-generated background experiments' },
    { file: 'https://g4f.dev/render.html', name: 'AI Render', icon: '🧠', desc: 'AI-generated content renderer' }
  ];
  const dynamicApps = [];

  async function loadDynamicApps(filter = '') {
    const url = "https://miniapps.g4f.space/tools/resumed?type=miniapp&options={%22sortBy%22:[%22generationsWeek%22],%22sortDesc%22:[true],%22mustSort%22:true,%22lang%22:%22en%22,%22itemsPerPage%22:20}&homepage=true&nsfw=0";
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data && data.items) {
        data.items.forEach(item => {
          if (item.id) {
            dynamicApps.push({
              slug: item.slug,
              file: `https://cdn.miniapps.ai/miniapps/${item.id}/${item.revision}/index.html?lang=en`,
              name: item.title,
              icon: `<img src="https://cdn.miniapps.ai/cdn-cgi/image/w=32,h=32,fit=cover/${item.logo}" alt="${item.title}" style="width:32px;height:32px;">`,
              desc: item.description
            });
          }
        });
      }
    } catch (e) {
      console.warn('Failed to load dynamic apps:', e);
    }

    const mcpClient = API.getMCPClient();
    if (!mcpClient) return false;
    
    try {
      // Get all available tools
      const tools = await mcpClient.getAllTools();
      if (!tools || tools.length === 0) {
        console.warn('No MCP tools available');
        return false;
      }
      
      // Find file search tools
      const searchTools = tools.filter(t => t.name==='file_search');
      console.log('Available file search tools:', searchTools);
      if (searchTools.length === 0) {
        console.warn('No file search tool found in MCP');
        return false;
      }
      
      // Create tool calls for each file
      const toolCalls = [{
        id: `file_search_${Date.now()}`,
        function: {
            name: 'file_search',
            arguments: {
              recursive: true,
              max_results: 200,
              pattern: '*.html',
            }
          }
      }];
      
      // Execute the tool calls
      const results = await mcpClient.executeToolCalls(toolCalls);
      if (!results || results.length === 0) {
        console.warn('No results from MCP tool execution');
        return false;
      }

      const serverUrl = (mcpClient.servers.filter(s => s.enabled) || [null])[0]?.url;    
      const newApps = (JSON.parse(results[0].content).matches || []).map(m => {
        const file = new URL("/pa/files/" + m.path, serverUrl);
        const name = m.path.split('/')[0].replace(/\.html?$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const icon = '📦';
        const desc = `App from ${m.path}`;
        return { file: file.href, name, icon, desc };
      });
      const existingFiles = new Set(dynamicApps.map(a => a.file));
      newApps.forEach(app => {
        if (!existingFiles.has(app.file)) {
          dynamicApps.push(app);
        }
      });
    } catch (e) {
      console.warn('Failed to load dynamic apps:', e);
    }
  }

  async function getAllApps() {
    await loadDynamicApps();
    return STATIC_APPS.concat(dynamicApps);
  }

  async function updateAppList(filter = '') {
    const allApps = await getAllApps();
    const q = filter.toLowerCase();
    const filtered = allApps.filter(a =>
      !q || a.name.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q)
    );
    renderGrid(filtered);
  }

  function render(container) {
    container.innerHTML = '';
    container.style.overflow = 'hidden';

    const wrapper = document.createElement('div');
    wrapper.className = 'appstore-wrapper';
    wrapper.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';

    const header = document.createElement('div');
    header.className = 'appstore-header';
    header.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border);flex-shrink:0;';
    header.innerHTML = `
      <h2 style="font-size:17px;font-weight:700;letter-spacing:-0.02em;flex:1;">🛒 ${framework.translate('App Store')}</h2>
      <input type="text" id="appstore-search" placeholder="${framework.translate('Search apps…')}" 
        style="width:220px;padding:7px 12px;font-size:13px;border-radius:8px;background:var(--bg3);border:1px solid var(--border);color:var(--text);outline:none;"
        oninput="AppStorePage.filterApps(this.value)">
    `;
    wrapper.appendChild(header);

    const grid = document.createElement('div');
    grid.id = 'appstore-grid';
    grid.style.cssText = 'flex:1;overflow-y:auto;padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;align-content:start;';
    wrapper.appendChild(grid);

    const iframeView = document.createElement('div');
    iframeView.id = 'appstore-iframe-view';
    iframeView.style.cssText = 'display:none;flex:1;flex-direction:column;overflow:hidden;';
    iframeView.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);flex-shrink:0;">
        <button class="btn btn-sm btn-secondary" onclick="AppStorePage.closeApp()">← ${framework.translate('Back')}</button>
        <span id="appstore-iframe-title" style="font-weight:600;font-size:14px;flex:1;"></span>
        <a id="appstore-iframe-open" href="#" target="_blank" class="btn btn-sm btn-secondary" title="${framework.translate('Open in new tab')}">↗</a>
      </div>
      <iframe id="appstore-iframe" style="flex:1;width:100%;border:none;" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"></iframe>
    `;
    wrapper.appendChild(iframeView);

    container.appendChild(wrapper);
    updateAppList(''); // initial load
  }

  async function filterApps(query) {
    await updateAppList(query);
  }

  function renderGrid(apps) {
    const grid = document.getElementById('appstore-grid');
    if (!grid) return;
    grid.innerHTML = apps.map(a => `
      <div class="appstore-card" onclick="AppStorePage.openApp('${a.slug || a.file}','${(a.name||'').replace(/'/g, "\\'")}')"
        style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:16px;cursor:pointer;display:flex;flex-direction:column;gap:8px;transition:border-color .15s,transform .15s,box-shadow .15s;"
        onmouseenter="this.style.borderColor='var(--accent-border)';this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.3)'"
        onmouseleave="this.style.borderColor='var(--border)';this.style.transform='';this.style.boxShadow=''">
        <div style="font-size:28px;line-height:1;">${a.icon}</div>
        <div style="font-weight:700;font-size:14px;color:var(--text);">${a.name}</div>
        <div style="font-size:12px;color:var(--text2);line-height:1.4;max-height:48px;overflow:hidden;text-overflow:ellipsis;">${a.desc}</div>
      </div>
    `).join('');
  }

  async function openApp(file, name) {
    if (!file.startsWith('http')) {
        currentApp = await getAllApps().then(apps => apps.find(a => a.file === file || a.slug === file));
    } else {
        currentApp = { file, name };
    }
    if (location.hash !== `#${currentApp.slug || currentApp.file}`) {
        history.pushState(null, '', `#/${currentApp.slug || currentApp.file}`);
    }
    const grid = document.getElementById('appstore-grid');
    const iframeView = document.getElementById('appstore-iframe-view');
    const iframe = document.getElementById('appstore-iframe');
    const title = document.getElementById('appstore-iframe-title');
    const openLink = document.getElementById('appstore-iframe-open');
    const search = document.getElementById('appstore-search');

    // const hashParams = new URLSearchParams();
    // let tempApiKey = 'temp_' + Math.random().toString(36).substr(2, 9);
    // (async () => {
    //   try {
    //     const response = await fetch('/members/api/keys/generate', {
    //       method: 'POST',
    //       headers: { 'Content-Type': 'application/json' }
    //     });
    //     const data = await response.json();
    //     tempApiKey = data.api_key || data.key || tempApiKey;
    //   } catch (e) {
    //     console.warn('Failed to generate temp API key via API, using fallback');
    //   }
    // })();
    // hashParams.set('temp_api_key', tempApiKey);

    if (grid) grid.style.display = 'none';
    if (search) search.style.display = 'none';
    if (iframeView) iframeView.style.display = 'flex';
    if (title) title.textContent = currentApp.name;
    if (openLink) openLink.href = currentApp.file;
    if (iframe) iframe.src = currentApp.file.startsWith('http') ? currentApp.file : APPS_BASE + currentApp.file;
    // window.__tempApiKey = tempApiKey;
  }

  function closeApp() {
    currentApp = null;
    const grid = document.getElementById('appstore-grid');
    const iframeView = document.getElementById('appstore-iframe-view');
    const iframe = document.getElementById('appstore-iframe');
    const search = document.getElementById('appstore-search');

    if (grid) grid.style.display = 'grid';
    if (search) search.style.display = '';
    if (iframeView) iframeView.style.display = 'none';
    if (iframe) iframe.src = '';
  }

  return { render, openApp, closeApp, filterApps };
})();
