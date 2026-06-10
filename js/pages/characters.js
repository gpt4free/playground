const CharactersPage = (() => {
  const DATA_BASE = 'data/characters';
  const AVATAR_BASE = 'https://ella.janitorai.com/bot-avatars/';
  const SEARCH_BATCH = 20;

  let meta = null;
  let entries = [];
  let loadedPages = 0;
  let loading = false;
  let observer = null;
  const detailCache = new Map();
  const shardCache = new Map();
  const state = { q: '', tag: '', nsfw: localStorage.getItem('chars_nsfw') === '1' };
  const searchState = { gen: 0, ids: [], rendered: 0, active: false };
  const STOPWORDS = new Set(['the', 'and', 'of', 'a', 'an', 'to', 'in', 'is', 'it', 'on', 'for', 'with', 'you', 'your']);

  function tokenize(text) {
    const tokens = new Set();
    const norm = (text || '').normalize('NFKD').toLowerCase().replace(/[̀-ͯ]/g, '');
    for (const t of norm.split(/[^a-z0-9]+/)) {
      if (t.length >= 2 && t.length <= 24 && !STOPWORDS.has(t)) tokens.add(t);
    }
    return [...tokens];
  }

  const RESERVED_NAMES = new Set(['aux', 'con', 'nul', 'prn', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9']);

  function getShard(prefix) {
    if (!shardCache.has(prefix)) {
      const file = RESERVED_NAMES.has(prefix) ? `${prefix}_.json` : `${prefix}.json`;
      shardCache.set(prefix, fetch(`${DATA_BASE}/search/${file}`)
        .then(r => r.ok ? r.json() : {})
        .catch(() => ({})));
    }
    return shardCache.get(prefix);
  }

  async function postingsFor(tok) {
    const p2 = tok.slice(0, 2);
    const map = new Map();
    const collect = shard => {
      for (const key of Object.keys(shard)) {
        if (key.startsWith(tok)) {
          for (const [id, c, x] of shard[key]) {
            if (!map.has(id)) map.set(id, { c, x });
          }
        }
      }
    };
    collect(await getShard(p2));
    const split = meta?.search?.split?.[p2];
    if (split) {
      if (tok.length >= 3) {
        if (split.includes(tok[2])) collect(await getShard(tok.slice(0, 3)));
      } else {
        const subs = await Promise.all([...split].map(ch => getShard(p2 + ch)));
        subs.forEach(collect);
      }
    }
    return map;
  }

  async function searchIds(q) {
    const tokens = tokenize(q);
    if (tokens.length === 0) return [];
    let acc = null;
    for (const tok of tokens) {
      const map = await postingsFor(tok);
      if (acc === null) {
        acc = map;
      } else {
        for (const id of [...acc.keys()]) {
          if (!map.has(id)) acc.delete(id);
        }
      }
      if (!acc.size) break;
    }
    return [...acc.entries()]
      .filter(([, v]) => state.nsfw || !v.x)
      .sort((a, b) => b[1].c - a[1].c)
      .map(([id]) => id);
  }

  function entryFromDetail(d) {
    return {
      id: d.id,
      n: d.name,
      d: stripHtml(d.description).replace(/\s+/g, ' ').trim().slice(0, 180),
      a: d.avatar,
      t: d.tags || [],
      x: d.nsfw ? 1 : 0,
      c: d.chats,
    };
  }

  async function runSearch() {
    const gen = ++searchState.gen;
    searchState.active = true;
    const grid = document.getElementById('chars-grid');
    const status = document.getElementById('chars-status');
    if (grid) grid.innerHTML = '';
    if (status) status.textContent = framework.translate('Searching the full library...');
    let ids = [];
    try {
      ids = await searchIds(state.q);
    } catch {}
    if (gen !== searchState.gen) return;
    searchState.ids = ids;
    searchState.rendered = 0;
    await appendSearchResults(gen);
  }

  async function appendSearchResults(gen) {
    const grid = document.getElementById('chars-grid');
    if (!grid || gen !== searchState.gen) return;
    const batch = searchState.ids.slice(searchState.rendered, searchState.rendered + 24);
    searchState.rendered += batch.length;
    const details = await Promise.all(batch.map(id => fetchDetail(id).catch(() => null)));
    if (gen !== searchState.gen) return;
    const frag = document.createDocumentFragment();
    for (const d of details) {
      if (!d) continue;
      const e = entryFromDetail(d);
      if (state.tag && !e.t.some(t => t.toLowerCase().includes(state.tag))) continue;
      frag.appendChild(buildCard(e));
    }
    grid.appendChild(frag);
    const status = document.getElementById('chars-status');
    if (status) {
      const done = searchState.rendered >= searchState.ids.length;
      status.textContent = searchState.ids.length === 0
        ? framework.translate('No characters found in the full library.')
        : `${searchState.ids.length.toLocaleString()} ${framework.translate('results from the full library')}${done ? '' : ' · ' + framework.translate('scroll for more')}`;
    }
  }

  function avatarUrl(a) {
    if (!a) return '';
    return a.startsWith('http') ? a : AVATAR_BASE + encodeURIComponent(a);
  }

  function stripHtml(s) {
    const div = document.createElement('div');
    div.innerHTML = s || '';
    return div.textContent || '';
  }

  function fmtCount(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(n || 0);
  }

  async function loadMeta() {
    if (meta) return meta;
    const res = await fetch(`${DATA_BASE}/meta.json`);
    if (!res.ok) throw new Error('Character index not available');
    meta = await res.json();
    return meta;
  }

  async function loadNextPage() {
    if (!meta || loadedPages >= meta.pages) return false;
    const res = await fetch(`${DATA_BASE}/list/page-${loadedPages}.json`);
    if (!res.ok) return false;
    const page = await res.json();
    entries = entries.concat(page);
    loadedPages++;
    return true;
  }

  function matches(e) {
    if (!state.nsfw && e.x) return false;
    if (state.tag && !e.t.some(t => t.toLowerCase().includes(state.tag))) return false;
    if (state.q) {
      const q = state.q;
      if (!e.n.toLowerCase().includes(q) && !e.d.toLowerCase().includes(q) &&
          !e.t.some(t => t.toLowerCase().includes(q))) return false;
    }
    return true;
  }

  function render(container) {
    Components.injectStyles();
    injectStyles();
    container.innerHTML = `
      <div class="chars-wrap">
        <div class="chars-header">
          <div class="chars-title-row">
            <h1>Characters</h1>
            <span class="chars-count" id="chars-count"></span>
            <label class="chars-nsfw-toggle">
              <input type="checkbox" id="chars-nsfw" ${state.nsfw ? 'checked' : ''}>
              <span>NSFW</span>
            </label>
          </div>
          <input type="search" id="chars-search" class="chars-search" placeholder="${framework.translate('Search characters by name, description or tag...')}" value="${Components.escHtml(state.q)}">
          <div class="chars-tags" id="chars-tags"></div>
        </div>
        <div class="chars-scroll" id="chars-scroll">
          <div class="chars-grid" id="chars-grid"></div>
          <div class="chars-sentinel" id="chars-sentinel"></div>
          <div class="chars-status" id="chars-status"></div>
        </div>
      </div>`;

    const searchInput = container.querySelector('#chars-search');
    let debounce;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        state.q = searchInput.value.trim().toLowerCase();
        applyFilters();
      }, 250);
    });

    container.querySelector('#chars-nsfw').addEventListener('change', e => {
      state.nsfw = e.target.checked;
      localStorage.setItem('chars_nsfw', state.nsfw ? '1' : '0');
      applyFilters();
    });

    init(container);
  }

  async function init(container) {
    const status = container.querySelector('#chars-status');
    try {
      await loadMeta();
      renderTags();
      const countEl = document.getElementById('chars-count');
      if (countEl) countEl.textContent = `${meta.total.toLocaleString()} ${framework.translate('characters')}`;
      if (entries.length === 0) await loadNextPage();
      applyFilters();
      setupInfiniteScroll();
    } catch (err) {
      if (status) status.innerHTML = `<div class="empty-state"><div class="big">🎭</div><h2>${framework.translate('Character library unavailable')}</h2><p>${Components.escHtml(err.message)}</p></div>`;
    }
  }

  function renderTags() {
    const wrap = document.getElementById('chars-tags');
    if (!wrap || !meta?.tags) return;
    const top = meta.tags.slice(0, 30);
    wrap.innerHTML = `<button class="chars-tag ${!state.tag ? 'active' : ''}" data-tag="">${framework.translate('All')}</button>` +
      top.map(t => `<button class="chars-tag ${state.tag === t.tag ? 'active' : ''}" data-tag="${Components.escHtml(t.tag)}">${Components.escHtml(t.tag)}</button>`).join('');
    wrap.querySelectorAll('.chars-tag').forEach(btn => {
      btn.addEventListener('click', () => {
        state.tag = btn.dataset.tag;
        renderTags();
        applyFilters();
      });
    });
  }

  function setupInfiniteScroll() {
    const sentinel = document.getElementById('chars-sentinel');
    if (!sentinel) return;
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || loading) return;
      loading = true;
      if (searchState.active) {
        if (searchState.rendered < searchState.ids.length) {
          await appendSearchResults(searchState.gen);
        }
        loading = false;
        return;
      }
      const grid = document.getElementById('chars-grid');
      const before = grid ? grid.children.length : 0;
      let fetched = 0;
      while (fetched < SEARCH_BATCH && await loadNextPage()) {
        fetched++;
        appendNewMatches();
        const after = document.getElementById('chars-grid')?.children.length || 0;
        if (after - before >= 40) break;
      }
      updateStatus();
      loading = false;
    }, { root: document.getElementById('chars-scroll'), rootMargin: '600px' });
    observer.observe(sentinel);
  }

  let renderedCount = 0;

  function applyFilters() {
    if (state.q.length >= 2) {
      runSearch();
    } else {
      searchState.active = false;
      searchState.gen++;
      refreshGrid();
    }
  }

  function refreshGrid() {
    const grid = document.getElementById('chars-grid');
    if (!grid) return;
    grid.innerHTML = '';
    renderedCount = 0;
    appendNewMatches(true);
    updateStatus();
  }

  function appendNewMatches(reset) {
    const grid = document.getElementById('chars-grid');
    if (!grid) return;
    if (reset) renderedCount = 0;
    const frag = document.createDocumentFragment();
    for (let i = renderedCount; i < entries.length; i++) {
      const e = entries[i];
      if (matches(e)) frag.appendChild(buildCard(e));
    }
    renderedCount = entries.length;
    grid.appendChild(frag);
  }

  function updateStatus() {
    const status = document.getElementById('chars-status');
    const grid = document.getElementById('chars-grid');
    if (!status || !grid) return;
    if (meta && loadedPages >= meta.pages) {
      status.textContent = grid.children.length === 0 ? framework.translate('No characters match your filters.') : '';
    } else {
      status.textContent = `${framework.translate('Showing')} ${grid.children.length} · ${framework.translate('scroll for more')}`;
    }
  }

  function buildCard(e) {
    const card = document.createElement('div');
    card.className = 'char-card';
    card.innerHTML = `
      <div class="char-avatar">${e.a ? `<img loading="lazy" src="${Components.escHtml(avatarUrl(e.a))}" alt="" onerror="this.remove()">` : ''}<span class="char-avatar-fallback">🎭</span></div>
      <div class="char-body">
        <div class="char-name notranslate">${Components.escHtml(e.n)}${e.x ? ' <span class="char-nsfw">18+</span>' : ''}</div>
        <div class="char-desc notranslate">${Components.escHtml(e.d)}</div>
        <div class="char-meta">
          <span>💬 ${fmtCount(e.c)}</span>
          ${e.t.slice(0, 3).map(t => `<span class="char-tag notranslate">${Components.escHtml(t)}</span>`).join('')}
        </div>
      </div>`;
    card.addEventListener('click', () => openDetail(e.id));
    return card;
  }

  async function fetchDetail(id) {
    if (detailCache.has(id)) return detailCache.get(id);
    const shard = (id.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 2) || '00').padEnd(2, '0');
    const res = await fetch(`${DATA_BASE}/char/${shard}/${id}.json`);
    if (!res.ok) throw new Error('Character not found');
    const detail = await res.json();
    if (detailCache.size > 500) detailCache.clear();
    detailCache.set(id, detail);
    return detail;
  }

  async function openDetail(id) {
    let detail;
    try {
      detail = await fetchDetail(id);
    } catch (err) {
      Components.toast(err.message, 'error');
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'modal char-detail-modal';
    const desc = stripHtml(detail.description);
    modal.innerHTML = `
      <div class="char-detail-head">
        <div class="char-avatar char-avatar-lg">${detail.avatar ? `<img src="${Components.escHtml(avatarUrl(detail.avatar))}" alt="" onerror="this.remove()">` : ''}<span class="char-avatar-fallback">🎭</span></div>
        <div style="flex:1;min-width:0">
          <h2 class="notranslate" style="margin-bottom:4px">${Components.escHtml(detail.name)}${detail.nsfw ? ' <span class="char-nsfw">18+</span>' : ''}</h2>
          <div style="font-size:12px;color:var(--text2)" class="notranslate">${framework.translate('by')} ${Components.escHtml(detail.creator || 'unknown')}${detail.creator_verified ? ' ✓' : ''} · 💬 ${fmtCount(detail.chats)}</div>
          <div class="char-meta" style="margin-top:6px">${(detail.tags || []).slice(0, 8).map(t => `<span class="char-tag notranslate">${Components.escHtml(t)}</span>`).join('')}</div>
        </div>
      </div>
      <div class="char-detail-body notranslate">
        ${desc ? `<p>${Components.escHtml(desc.slice(0, 2000))}</p>` : ''}
        ${detail.scenario ? `<h3>${framework.translate('Scenario')}</h3><p>${Components.escHtml(stripHtml(detail.scenario).slice(0, 1000))}</p>` : ''}
        ${detail.first_message ? `<h3>${framework.translate('First message')}</h3><p class="char-first-msg">${Components.escHtml(stripHtml(detail.first_message).slice(0, 1500))}</p>` : ''}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button class="btn btn-secondary" id="char-close">${framework.translate('Close')}</button>
        <button class="btn btn-secondary" id="char-save">${framework.translate('Save as Persona')}</button>
        <button class="btn btn-primary" id="char-chat">${framework.translate('Start Chat')}</button>
      </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    modal.querySelector('#char-close').addEventListener('click', close);
    modal.querySelector('#char-save').addEventListener('click', () => {
      toPersona(detail);
      Components.toast(framework.translate('Saved to Personas'), 'success');
      close();
    });
    modal.querySelector('#char-chat').addEventListener('click', () => {
      const persona = toPersona(detail);
      close();
      window.location.hash = '#/roleplay';
      setTimeout(() => {
        if (typeof RoleplayPage !== 'undefined' && RoleplayPage.startWithPersona) {
          RoleplayPage.startWithPersona(persona.id);
        }
      }, 150);
    });
  }

  function toPersona(detail) {
    const personaId = `char-${detail.id}`;
    const description = stripHtml(detail.description).replace(/\s+/g, ' ').trim();
    const personality = stripHtml(detail.personality).trim();
    const scenario = stripHtml(detail.scenario).trim();
    const parts = [
      `You are "${detail.name}". Stay in character at all times and never break the fourth wall.`,
      description ? `Character description:\n${description}` : '',
      personality ? `Personality:\n${personality}` : '',
      scenario ? `Scenario:\n${scenario}` : '',
      `Write engaging, in-character replies. Describe actions in third person between asterisks. Address the user as "you".`,
    ].filter(Boolean);
    const persona = {
      id: personaId,
      emoji: '🎭',
      name: detail.name,
      avatar: avatarUrl(detail.avatar),
      description: description.slice(0, 200),
      systemPrompt: parts.join('\n\n').slice(0, 12000),
      firstMessage: stripHtml(detail.first_message).trim().slice(0, 6000),
      tags: detail.tags || [],
      added: Date.now(),
    };
    Store.upsertPersona(persona);
    return persona;
  }

  function injectStyles() {
    if (document.getElementById('chars-css')) return;
    const style = document.createElement('style');
    style.id = 'chars-css';
    style.textContent = `
      .chars-wrap { display:flex; flex-direction:column; height:100%; overflow:hidden; }
      .chars-header { padding:16px 16px 8px; flex-shrink:0; display:flex; flex-direction:column; gap:10px; max-width:1200px; margin:0 auto; width:100%; }
      .chars-title-row { display:flex; align-items:center; gap:12px; }
      .chars-title-row h1 { font-size:18px; }
      .chars-count { font-size:12px; color:var(--text2); flex:1; }
      .chars-nsfw-toggle { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text2); cursor:pointer; }
      .chars-nsfw-toggle input { accent-color:var(--accent); width:16px; height:16px; }
      .chars-search { width:100%; padding:10px 14px; }
      .chars-tags { display:flex; gap:6px; overflow-x:auto; padding-bottom:4px; -webkit-overflow-scrolling:touch; scrollbar-width:none; }
      .chars-tags::-webkit-scrollbar { display:none; }
      .chars-tag { flex-shrink:0; background:var(--bg3); border:1px solid var(--border); color:var(--text2); border-radius:16px; padding:5px 12px; font-size:12px; white-space:nowrap; }
      .chars-tag.active { background:var(--accent); border-color:var(--accent); color:var(--on-accent); font-weight:600; }
      .chars-tag:hover { border-color:var(--accent); }
      .chars-scroll { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:8px 16px 24px; }
      .chars-grid { display:grid; grid-template-columns:minmax(0,1fr); gap:10px; max-width:1200px; margin:0 auto; }
      .char-card { display:flex; gap:12px; min-width:0; max-width:100%; overflow:hidden; background:var(--bg2); border:1px solid var(--border); border-radius:var(--radius); padding:12px; cursor:pointer; transition:border-color .15s, transform .15s; }
      .char-card:hover { border-color:var(--accent); transform:translateY(-1px); }
      .char-avatar { position:relative; width:64px; height:64px; border-radius:10px; background:var(--bg3); flex-shrink:0; overflow:hidden; display:flex; align-items:center; justify-content:center; }
      .char-avatar img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:1; }
      .char-avatar-fallback { font-size:26px; }
      .char-avatar-lg { width:96px; height:96px; }
      .char-body { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
      .char-name { font-weight:600; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .char-nsfw { font-size:10px; background:var(--red); color:#1c0606; font-weight:700; border-radius:4px; padding:1px 5px; vertical-align:middle; }
      .char-desc { font-size:12px; color:var(--text2); line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
      .char-meta { display:flex; gap:6px; flex-wrap:wrap; font-size:11px; color:var(--text2); align-items:center; }
      .char-tag { background:var(--bg3); border-radius:10px; padding:2px 8px; white-space:nowrap; }
      .chars-sentinel { height:1px; }
      .chars-status { text-align:center; color:var(--text2); font-size:12px; padding:16px; }
      .char-detail-modal { max-width:640px; }
      .char-detail-head { display:flex; gap:14px; align-items:flex-start; margin-bottom:12px; }
      .char-detail-body { font-size:13px; color:var(--text2); line-height:1.6; max-height:40vh; overflow-y:auto; }
      .char-detail-body h3 { font-size:13px; color:var(--text); margin:12px 0 4px; }
      .char-first-msg { background:var(--bg3); border-radius:8px; padding:10px; white-space:pre-wrap; }
      @media (min-width:600px) { .chars-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
      @media (min-width:900px) { .chars-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }
      @media (min-width:1200px) { .chars-grid { grid-template-columns:repeat(4,minmax(0,1fr)); } }
    `;
    document.head.appendChild(style);
  }

  return { render };
})();
