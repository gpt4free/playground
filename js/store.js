const Store = (() => {
  const KEYS = {
    providers: 'llmp_providers',
    activeProvider: 'llmp_active_provider',
    personas: 'llmp_personas',
    chats: 'llmp_chats',
    settings: 'llmp_settings',
  };

  function loadProviders() {
    const url = 'https://g4f.dev/dist/js/providers.json';
    fetch(url).then(res => res.json()).then(data => {
      for ([key, provider] of Object.entries(data.providers)) {
        provider.id = key;
        provider.name = (provider.label || key) + (provider.tags ? ` ${provider.tags}` : '');
        provider.baseUrl = provider.backupUrl || provider.baseUrl || `https://g4f.space/api/${key}`;
        provider.defaultModel = data.defaultModels[key] || provider.defaultModel;
        provider.baseUrl = provider.baseUrl.replace('{model}', provider.defaultModel)
        provider.type = provider.type || 'openai';
        provider.models = provider.models || [];
        provider.fetchedModels = [];
        provider.defaultModel = data.defaultModels[key] || provider.defaultModel;
        if (data.providerLocalStorage[key]) {
          provider.apiKey = localStorage.getItem(data.providerLocalStorage[key]);
        }
        if (!provider.apiKey && provider.backupUrl) {
          provider.apiKey = localStorage.getItem("session_token");
        }
      }
      delete data.providers.custom;
      Store.setProviders(Object.values(data.providers));
      ProvidersPage.renderList();
    });
  }

  if (!localStorage.getItem(KEYS['providers'])) {
    loadProviders();
  }

  const defaults = {
    providers: [
      {
        id: 'api.airforce',
        name: 'Airforce API',
        baseUrl: 'https://api.airforce/v1',
        apiKey: '',
        type: 'openai',
        models: [],
        fetchedModels: [],
        defaultModel: 'llama-4-scout',
      },
    ],
    activeProvider: 'api.airforce',
    personas: [],
    chats: [],
    settings: {
      streamingEnabled: true,
      temperature: 0.7,
      maxTokens: 2048,
      theme: 'dark',
    },
  };

  function get(key) {
    try {
      const raw = localStorage.getItem(KEYS[key]);
      return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(defaults[key]));
    } catch {
      return JSON.parse(JSON.stringify(defaults[key]));
    }
  }

  function set(key, value) {
    localStorage.setItem(KEYS[key], JSON.stringify(value));
  }

  function getProviders() { return get('providers'); }
  function setProviders(v) { set('providers', v); }

  function getActiveProviderId() { return get('activeProvider'); }
  function setActiveProviderId(id) { set('activeProvider', id); }

  function getActiveProvider() {
    const providers = getProviders();
    const id = getActiveProviderId();
    return providers.find(p => p.id === id) || providers[0];
  }

  function upsertProvider(provider) {
    const providers = getProviders();
    const idx = providers.findIndex(p => p.id === provider.id);
    if (idx >= 0) providers[idx] = provider;
    else providers.push(provider);
    setProviders(providers);
  }

  function deleteProvider(id) {
    const providers = getProviders().filter(p => p.id !== id);
    setProviders(providers);
    if (getActiveProviderId() === id && providers.length > 0) {
      setActiveProviderId(providers[0].id);
    }
  }

  function getPersonas() { return get('personas'); }
  function setPersonas(v) { set('personas', v); }

  function upsertPersona(persona) {
    const personas = getPersonas();
    const idx = personas.findIndex(p => p.id === persona.id);
    if (idx >= 0) personas[idx] = persona;
    else personas.push(persona);
    setPersonas(personas);
  }

  function deletePersona(id) {
    setPersonas(getPersonas().filter(p => p.id !== id));
  }

  function getChats() { return get('chats'); }
  function setChats(v) { set('chats', v); }

  function getChat(id) {
    return getChats().find(c => c.id === id) || null;
  }

  function upsertChat(chat) {
    const chats = getChats();
    const idx = chats.findIndex(c => c.id === chat.id);
    if (idx >= 0) chats[idx] = chat;
    else chats.unshift(chat);
    setChats(chats);
  }

  function deleteChat(id) {
    setChats(getChats().filter(c => c.id !== id));
  }

  function getSettings() { return get('settings'); }
  function setSettings(v) { set('settings', v); }

  function updateSettings(patch) {
    setSettings({ ...getSettings(), ...patch });
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  return {
    getProviders, setProviders, getActiveProviderId, setActiveProviderId,
    getActiveProvider, upsertProvider, deleteProvider,
    getPersonas, setPersonas, upsertPersona, deletePersona,
    getChats, setChats, getChat, upsertChat, deleteChat,
    getSettings, setSettings, updateSettings,
    newId, loadProviders,
  };
})();
