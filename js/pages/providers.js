const ProvidersPage = (() => {
  function render(container) {
    Components.injectStyles();
    container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:24px;overflow-y:auto;height:100%;max-width:800px;margin:0 auto;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:8px;';
    header.innerHTML = `<h1 style="font-size:20px;flex:1">Providers</h1>`;
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-primary';
    resetBtn.textContent = 'Reset Providers';
    resetBtn.addEventListener('click', () => Store.loadProviders());
    header.appendChild(resetBtn);
    const newBtn = document.createElement('button');
    newBtn.className = 'btn btn-primary';
    newBtn.textContent = '+ Add Provider';
    newBtn.addEventListener('click', () => openEditor(null));
    header.appendChild(newBtn);

    const hint = document.createElement('p');
    hint.style.cssText = 'color:var(--text2);font-size:13px;margin-bottom:24px;';
    hint.textContent = 'Providers are OpenAI-compatible API endpoints. Airforce API is the default (no key required for free models).';

    const list = document.createElement('div');
    list.id = 'providers-list';
    list.style.cssText = 'display:flex;flex-direction:column;gap:12px;';

    const settingsSection = buildSettingsSection();

    wrap.appendChild(header);
    wrap.appendChild(hint);
    wrap.appendChild(list);
    wrap.appendChild(settingsSection);
    container.appendChild(wrap);

    renderList();
    updateBadge();
  }

  function renderList() {
    const list = document.getElementById('providers-list');
    if (!list) return;
    list.innerHTML = '';
    const providers = Store.getProviders();
    const activeId = Store.getActiveProviderId();

    providers.forEach(provider => {
      const isActive = provider.id === activeId;
      const card = document.createElement('div');
      card.style.cssText = `background:var(--bg2);border:1px solid ${isActive ? 'var(--accent)' : 'var(--border)'};border-radius:10px;padding:16px;`;
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-weight:600;font-size:15px">${Components.escHtml(provider.name)}</span>
              ${isActive ? '<span style="font-size:11px;background:var(--accent);color:#fff;padding:2px 7px;border-radius:10px">Active</span>' : ''}
            </div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">${Components.escHtml(provider.baseUrl)}</div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0">
            ${!isActive ? `<button class="btn btn-secondary btn-sm" data-action="activate">Set Active</button>` : ''}
            <button class="btn btn-secondary btn-sm" data-action="fetch-models">Fetch Models</button>
            <button class="btn btn-secondary btn-sm" data-action="edit">Edit</button>
            ${provider.id !== 'airforce' ? `<button class="btn btn-danger btn-sm" data-action="delete">Delete</button>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:16px;font-size:12px;color:var(--text2)">
          <span>Model: <strong style="color:var(--text)">${Components.escHtml(provider.defaultModel || '—')}</strong></span>
          <span>Key: <strong style="color:var(--text)">${provider.apiKey ? '••••' + provider.apiKey.slice(-4) : 'None'}</strong></span>
          <span>Models cached: <strong style="color:var(--text)">${provider.fetchedModels?.length || 0}</strong></span>
        </div>
        ${provider.fetchedModels?.length ? `
        <div style="margin-top:10px">
          <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px">Default Model</label>
          <select class="model-select default-model-sel" style="width:100%">
            ${provider.fetchedModels.map(m => `<option value="${Components.escHtml(m)}" ${m === provider.defaultModel ? 'selected' : ''}>${Components.escHtml(m)}</option>`).join('')}
          </select>
        </div>` : ''}`;

      card.querySelector('[data-action="activate"]')?.addEventListener('click', () => {
        Store.setActiveProviderId(provider.id);
        renderList();
        updateBadge();
        Components.toast(`Switched to ${provider.name}`, 'success');
      });

      card.querySelector('[data-action="fetch-models"]')?.addEventListener('click', async () => {
        try {
          Components.toast('Fetching models...', 'info');
          const models = await API.fetchModels(provider);
          provider.fetchedModels = models;
          Store.upsertProvider(provider);
          renderList();
          Components.toast(`Fetched ${models.length} models`, 'success');
        } catch (err) {
          Components.toast(`Failed: ${err.message}`, 'error');
        }
      });

      card.querySelector('[data-action="edit"]')?.addEventListener('click', () => openEditor(provider));

      card.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
        const ok = await Components.confirm(`Delete provider "${provider.name}"?`);
        if (!ok) return;
        Store.deleteProvider(provider.id);
        renderList();
        updateBadge();
      });

      card.querySelector('.default-model-sel')?.addEventListener('change', e => {
        provider.defaultModel = e.target.value;
        Store.upsertProvider(provider);
        updateBadge();
      });

      list.appendChild(card);
    });
  }

  function openEditor(provider) {
    return new Promise(resolve => {
      const isNew = !provider;

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <h2>${isNew ? 'Add Provider' : 'Edit Provider'}</h2>
        <div class="form-group">
          <label>Name *</label>
          <input id="prov-name" type="text" placeholder="My Provider" value="${Components.escHtml(provider?.name || '')}">
        </div>
        <div class="form-group">
          <label>Base URL *</label>
          <input id="prov-url" type="text" placeholder="https://api.example.com/v1" value="${Components.escHtml(provider?.baseUrl || '')}">
        </div>
        <div class="form-group">
          <label>API Key</label>
          <input id="prov-key" type="password" placeholder="sk-..." value="${Components.escHtml(provider?.apiKey || '')}">
        </div>
        <div class="form-group">
          <label>Default Model</label>
          <input id="prov-model" type="text" placeholder="llama-4-scout" value="${Components.escHtml(provider?.defaultModel || '')}">
        </div>
        <div id="prov-error" style="color:var(--red);font-size:13px;min-height:18px;margin-top:4px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button class="btn btn-secondary" id="prov-cancel">Cancel</button>
          <button class="btn btn-primary" id="prov-save">${isNew ? 'Add' : 'Save'}</button>
        </div>`;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      function close() { overlay.remove(); resolve(); }

      modal.querySelector('#prov-cancel').addEventListener('click', close);
      overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

      modal.querySelector('#prov-save').addEventListener('click', () => {
        const name = modal.querySelector('#prov-name').value.trim();
        const baseUrl = modal.querySelector('#prov-url').value.trim();
        const errEl = modal.querySelector('#prov-error');
        if (!name || !baseUrl) {
          errEl.textContent = 'Name and URL are required.';
          return;
        }

        const updated = {
          id: provider?.id || Store.newId(),
          name,
          baseUrl: baseUrl.replace(/\/$/, ''),
          apiKey: modal.querySelector('#prov-key').value.trim(),
          defaultModel: modal.querySelector('#prov-model').value.trim() || 'llama-4-scout',
          type: 'openai',
          fetchedModels: provider?.fetchedModels || [],
        };

        Store.upsertProvider(updated);
        if (isNew) Store.setActiveProviderId(updated.id);
        renderList();
        updateBadge();
        Components.toast(isNew ? 'Provider added' : 'Provider saved', 'success');
        close();
      });

      modal.querySelector('#prov-name').focus();
    });
  }

  function buildSettingsSection() {
    const section = document.createElement('div');
    section.style.cssText = 'margin-top:32px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:20px;';
    const settings = Store.getSettings();
    section.innerHTML = `
      <h2 style="font-size:15px;margin-bottom:16px">Global Settings</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div class="form-group" style="margin:0">
          <label>Temperature (0–2)</label>
          <input id="set-temp" type="number" min="0" max="2" step="0.1" value="${settings.temperature}" style="width:100%;padding:8px 10px;">
        </div>
        <div class="form-group" style="margin:0">
          <label>Max Tokens</label>
          <input id="set-maxtok" type="number" min="64" max="32000" step="64" value="${settings.maxTokens}" style="width:100%;padding:8px 10px;">
        </div>
      </div>
      <div style="margin-top:14px">
        <button class="btn btn-primary btn-sm" id="save-settings-btn">Save Settings</button>
      </div>`;
    section.querySelector('#save-settings-btn').addEventListener('click', () => {
      Store.updateSettings({
        temperature: parseFloat(document.getElementById('set-temp')?.value) || 0.7,
        maxTokens: parseInt(document.getElementById('set-maxtok')?.value) || 2048,
      });
      Components.toast('Settings saved', 'success');
    });
    return section;
  }

  function updateBadge() {
    const badge = document.getElementById('active-provider-badge');
    if (!badge) return;
    const p = Store.getActiveProvider();
    badge.textContent = p ? `${p.name} · ${p.defaultModel || '?'}` : 'No provider';
  }

  return { render, updateBadge, renderList };
})();
