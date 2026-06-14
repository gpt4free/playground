const Router = (() => {
  const KNOWN_ORIGINS = ["https://g4f.dev", "http://localhost:8080", "http://localhost:1337", "https://gpt4free.github.io"]; 

  const routes = {
    '/': renderHome,
    '/chat': () => renderPage('chat', ChatPage),
    '/characters': () => renderPage('characters', CharactersPage),
    '/roleplay': () => renderPage('roleplay', RoleplayPage),
    '/coding': () => renderPage('coding', CodingPage),
    '/agent': () => renderPage('agent', AgentPage),
    '/personas': renderPersonas,
    '/providers': () => renderPage('providers', ProvidersPage),
    '/app-store': () => renderPage('app-store', AppStorePage),
  };

  function getHash() {
    return location.hash.slice(1) || '/';
  }

  function isKnownOrigin() {
    return KNOWN_ORIGINS.includes(location.origin);
  }

  function navigate() {
    const hash = getHash();
    const segments = hash.split('/').filter(Boolean);
    const base = '/' + (segments[0] || '');

    document.querySelectorAll('a[data-route]').forEach(a => {
      a.classList.toggle('active', a.dataset.route === base);
    });

    if (base === '/personas') {
      renderPersonas();
      return;
    }

    if (routes[base]) {
      routes[base]();
      return;
    }

    console.warn('No route found for hash:', segments);

    if (segments[0]) {
        renderPage('app-store', AppStorePage);
        AppStorePage.openApp(hash.substring(1));
        return;
    }

    renderHome();
  }

  function renderPage(name, Page) {
    hideAll();
    const container = document.getElementById(`page-${name}`);
    if (!container) return;
    container.classList.add('active');
    Page.render(container);
    ProvidersPage.updateBadge();
    framework.translateElements(container.querySelectorAll('*'));
  }

  function renderHome() {
    hideAll();
    const container = document.getElementById('page-home');
    if (!container) return;
    container.classList.add('active');
    container.style.cssText = 'overflow-y:auto;-webkit-overflow-scrolling:touch;';
    if (!document.getElementById('home-css')) {
      const style = document.createElement('style');
      style.id = 'home-css';
      style.textContent = `
        .home-hero { padding: 56px 16px 36px; text-align: center; }
        .home-hero .eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--accent); background: var(--accent-soft); border: 1px solid var(--accent-border); border-radius: 99px; padding: 5px 14px; margin-bottom: 18px; }
        .home-hero h1 { font-size: clamp(34px, 7vw, 52px); font-weight: 800; letter-spacing: -0.04em; line-height: 1.05; margin-bottom: 14px; background: linear-gradient(120deg, #fff 25%, #fbbf24 65%, #f59e0b); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .home-hero p { color: var(--text2); font-size: 16px; max-width: 520px; margin: 0 auto 26px; line-height: 1.6; }
        .home-cta { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
        .home-cta a { text-decoration: none; }
        .home-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: 12px; text-align: left; max-width: 920px; margin: 0 auto; padding: 0 16px; width: 100%; }
        @media (min-width: 640px) { .home-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
        @media (min-width: 980px) { .home-grid { grid-template-columns: repeat(3, minmax(0,1fr)); } }
        .home-card { position: relative; background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius-l); padding: 20px; text-decoration: none; display: flex; flex-direction: column; gap: 10px; transition: border-color .15s, transform .15s, box-shadow .15s; overflow: hidden; }
        .home-card:hover { border-color: var(--accent-border); transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,0,0,0.35); }
        .home-card .hc-icon { width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; font-size: 22px; background: var(--bg3); border: 1px solid var(--border); border-radius: 12px; }
        .home-card .hc-title { font-weight: 700; font-size: 15px; color: var(--text); letter-spacing: -0.01em; }
        .home-card .hc-desc { font-size: 13px; color: var(--text2); line-height: 1.55; }
        .home-foot { text-align: center; padding: 28px 16px 40px; font-size: 12.5px; color: var(--text2); }
        .home-foot a { color: var(--accent); text-decoration: none; }
        .home-foot a:hover { text-decoration: underline; }
      `;
      document.head.appendChild(style);
    }
    container.innerHTML = `
      <div class="home-hero">
        <div class="eyebrow notranslate">✦ ${framework.translate('Free & open source')}</div>
        <h1 class="notranslate">LLMPlayground</h1>
        <p>${framework.translate('Chat with any model, browse 237k+ characters, roleplay, and code — in one fast, open playground.')}</p>
        <div class="home-cta">
          <a href="#/chat" class="btn btn-primary">${framework.translate('Start chatting')}</a>
          <a href="#/characters" class="btn btn-secondary">${framework.translate('Browse characters')}</a>
        </div>
      </div>
      <div class="home-grid">
        ${[
          { icon: '🤖', title: 'Agent', desc: 'AI-powered project assistant that plans tasks, writes code, and manages project files', route: '/agent' },
          { icon: '💬', title: 'Chat', desc: 'Multi-turn conversations with any AI model, streaming, thinking traces and image generation', route: '/chat' },
          { icon: '🗂️', title: 'Characters', desc: 'A library of 237k+ community characters with search, tags and one-tap chat', route: '/characters' },
          { icon: '🎭', title: 'Roleplay', desc: 'Immersive character chats with personas, avatars and opening scenes', route: '/roleplay' },
          { icon: '⌨️', title: 'Coding', desc: 'Copilot-style assistant with a Monaco editor, quick actions and code blocks', route: '/coding' },
          { icon: '🧑‍🎨', title: 'Personas', desc: 'Create, edit and manage your own AI characters', route: '/personas' },
          { icon: '⚙️', title: 'Providers', desc: 'Bring any OpenAI-compatible API — Airforce API works out of the box, no key needed', route: '/providers' },
          { icon: '🛒', title: 'App Store', desc: 'Browse and launch 40+ mini web apps — games, tools, utilities and more', route: '/app-store' },
        ].map(item => `
          <a href="#${item.route}" class="home-card">
            <div class="hc-icon">${item.icon}</div>
            <div class="hc-title">${item.title}</div>
            <div class="hc-desc">${item.desc}</div>
          </a>`).join('')}
      </div>
      <div class="home-foot">
        ${framework.translate('Open source')} · <a href="https://github.com/meow18838/LLMPlayground">GitHub</a> · ${Router.isKnownOrigin() ? 'Powered by <a href="https://g4f.dev">g4f.dev' : '<a href="#/providers">' + framework.translate('Sign in with Airforce')}</a>
      </div>`;
    ProvidersPage.updateBadge();
    framework.translateElements(container.querySelectorAll('*'));
  }

  function renderPersonas() {
    hideAll();
    const container = document.getElementById('page-personas');
    if (!container) return;
    container.classList.add('active');
    PersonasPage.render(container);
    ProvidersPage.updateBadge();
    framework.translateElements(container.querySelectorAll('*'));
  }

  function hideAll() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  }

  function init() {
    window.addEventListener('hashchange', navigate);
    PlaygroundAuth.init().then(() => {
      if (!PlaygroundAuth.getUser()) PlaygroundAuth.showLoginModal();
    }).finally(() => navigate());
  }

  return { init, navigate, isKnownOrigin };
})();

const PlaygroundAuth = (() => {
  const AUTH_BASE = 'https://auth.g4f.space';
  const USER_KEY = 'g4f_user';
  const SESSION_KEY = 'g4f_session';
  const EXPIRES_KEY = 'g4f_expires';
  const DEFAULT_ACCOUNT_NAME = 'Account';
  const API_KEY_PREFIX = 'g4f_';

  const AIRFORCE_PROVIDER_ID = 'api.airforce';
  const AIRFORCE_TOKEN_KEY = 'airforce_token';
  const AIRFORCE_EXPIRES_KEY = 'airforce_expires';
  const AIRFORCE_USER_KEY = 'airforce_user';

  function getUser() {
    const expires = localStorage.getItem(EXPIRES_KEY);
    if (isTokenExpired(expires)) {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(EXPIRES_KEY);
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function setUser(user, expires) {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      if (expires) {
        localStorage.setItem(EXPIRES_KEY, expires);
      }
    } else {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(EXPIRES_KEY);
    }
    window.dispatchEvent(new CustomEvent('llmp-auth-updated', { detail: { user } }));
    updateAuthButton(user);
  }

  function updateAuthButton(user = getUser()) {
    const btn = document.getElementById('auth-status-btn');
    if (btn) {
      btn.removeAttribute("style");
      if (user) {
        const name = user.name || user.username || 'Account';
        const tier = user.tier || 'free';
        if (user.avatar) {
          btn.style.backgroundImage = `url(${user.avatar})`;
          btn.style.backgroundSize = 'contain';
          btn.style.backgroundRepeat = 'no-repeat';
          btn.style.paddingLeft = '24px';
          btn.textContent = tier;
        } else {
          btn.textContent = `${name} · ${tier}`;
        }
        btn.title = `Logged in (${tier})`;
      } else {
        btn.textContent = 'Login';
        btn.title = 'Login';
      }
    }
    const railBtn = document.getElementById('auth-status-btn-rail');
    if (railBtn) {
      railBtn.removeAttribute("style");
      if (user?.avatar) {
        railBtn.style.backgroundImage = `url(${user.avatar})`;
        railBtn.style.backgroundSize = 'cover';
        railBtn.style.borderRadius = '50%';
        railBtn.style.width = '30px';
        railBtn.style.height = '30px';
        railBtn.textContent = '';
        railBtn.title = `Logged in (${user.tier || 'free'})`;
      } else if (user) {
        railBtn.textContent = '👤';
        railBtn.title = `${user.name || user.username || 'Account'} (${user.tier || 'free'})`;
      } else {
        railBtn.textContent = '👤';
        railBtn.title = 'Login';
      }
    }
  }

  function getCurrentUrl() {
    return window.location.href.split('#')[0];
  }

  function isTokenExpired(expires) {
    if (!expires) return false;
    const expiresMs = expires > 1e12 ? expires : expires * 1000;
    return Date.now() > expiresMs;
  }

  function setProviderApiKey(providerId, apiKey, expires) {
    if (!apiKey || typeof Store === 'undefined' || !Store.getProviders) return;
    const provider = Store.getProviders().find(p => p.id === providerId);
    if (!provider) return;
    provider.apiKey = apiKey;
    if (expires) {
      provider.apiKeyExpires = expires > 1e12 ? expires : expires * 1000;
    } else {
      delete provider.apiKeyExpires;
    }
    Store.upsertProvider(provider);
  }

  function clearProviderApiKey(providerId) {
    if (typeof Store === 'undefined' || !Store.getProviders) return;
    const provider = Store.getProviders().find(p => p.id === providerId);
    if (!provider) return;
    provider.apiKey = '';
    delete provider.apiKeyExpires;
    Store.upsertProvider(provider);
  }

  function clearAirforce() {
    localStorage.removeItem(AIRFORCE_TOKEN_KEY);
    localStorage.removeItem(AIRFORCE_EXPIRES_KEY);
    localStorage.removeItem(AIRFORCE_USER_KEY);
    clearProviderApiKey(AIRFORCE_PROVIDER_ID);
  }

  function applyAuthResult(sessionToken, user, expires) {
    console.log('Applying auth result:', { sessionToken, user, expires });
    if (sessionToken) {
      localStorage.setItem(SESSION_KEY, sessionToken);
    }
    if (user?.pollinations?.api_key) {
      if (!isTokenExpired(user.pollinations.expires)) {
        Store.setDefault('activeProvider', 'pollinations');
        setProviderApiKey('pollinations', user.pollinations.api_key, user.pollinations.expires);
      }
    }
    if (user?.huggingface?.access_token) {
      if (!isTokenExpired(user.huggingface.expires)) {
        Store.setDefault('activeProvider', 'huggingface');
        setProviderApiKey('huggingface', user.huggingface.access_token, user.huggingface.expires);
      }
    }
    if (user?.airforce?.access_token) {
      if (!isTokenExpired(user.airforce.expires)) {
        Store.setDefault('activeProvider', 'api.airforce');
        setProviderApiKey('api.airforce', user.airforce.access_token, user.airforce.expires);
      }
    }
    setUser(user || getUser(), expires);
  }

  async function handleRedirectCallback() {
    const hash = window.location.hash || '';
    const decodedHash = hash ? decodeURIComponent(hash.substring(1)) : '';
    const hashParams = new URLSearchParams(decodedHash);
    let handled = false;

    const sessionToken = hashParams.get('session');
    const userParam = hashParams.get('user');
    const expiresParam = hashParams.get('expires');
    if (sessionToken) {
      let user = getUser();
      if (userParam) {
        try {
          user = JSON.parse(decodeURIComponent(userParam));
        } catch {
          user = getUser();
        }
      }
      applyAuthResult(sessionToken, user, expiresParam);
      handled = true;
    }

    if (handled) {
      window.history.replaceState({}, document.title, `${window.location.pathname}#/providers`);
    }
    return handled;
  }

  async function refreshSession() {
    const token = localStorage.getItem("g4f_session");
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const endpoint = isApiKeyToken(token) ? 'keys/validate' : 'session';
      const response = await fetch(`${AUTH_BASE}/members/api/${endpoint}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        localStorage.removeItem("g4f_session");
        setUser(null);
        return;
      }
      const data = await response.json();
      if (endpoint === 'keys/validate') {
        setUser({
          name: data.username || DEFAULT_ACCOUNT_NAME,
          username: data.username || DEFAULT_ACCOUNT_NAME,
          tier: data.tier || 'free'
        }, data.expires);
      } else {
        applyAuthResult(null, data.user || getUser(), data.expires);
      }
    } catch (e) {
      console.error('Error refreshing session:', e);
      updateAuthButton(getUser());
    }
  }

  async function login(provider) {
    if (provider === 'pollinations') {
      const params = new URLSearchParams({
        redirect: getCurrentUrl(),
        provider: 'pollinations'
      });
      window.location.href = `https://g4f.dev/members?${params.toString()}`;
      return;
    }
    window.location.href = `${AUTH_BASE}/members/auth/${provider}?redirect=${encodeURIComponent(getCurrentUrl())}`;
  }

  async function logout() {
    clearAirforce();
    const token = localStorage.getItem("g4f_session");
    if (token) {
      try {
        await fetch(`${AUTH_BASE}/members/api/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (e) {
        console.warn('Logout request failed:', e);
      }
    }
    localStorage.removeItem("g4f_session");
    setUser(null);
  }

  async function init() {
    updateAuthButton(getUser());
    await handleRedirectCallback();
    await refreshSession();
  }

  function showLoginModal() {
    const isLLMPlayground = document.location.hostname === 'llmplayground.net';
    const providers = isLLMPlayground
      ? [{ id: 'airforce', label: 'Airforce' }]
      : [
          { id: 'github', label: 'GitHub' },
          { id: 'discord', label: 'Discord' },
          { id: 'huggingface', label: 'HuggingFace' },
          { id: 'pollinations', label: 'Pollinations' },
          { id: 'airforce', label: 'Airforce' },
        ];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'login-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    modal.innerHTML = `
      <h2 style="margin-bottom:8px">${framework.translate('Sign in to LLMPlayground')}</h2>
      <p style="font-size:13px;color:var(--text2);margin-bottom:16px;line-height:1.5">${Router.isKnownOrigin() ? 'Powered by <a href="https://g4f.dev">g4f.dev</a>' : framework.translate('Sign in with Airforce to use the models in your plan — usage is billed to your account. Other providers unlock member access tokens and API keys.')}</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${providers.map(p => `<button class="btn btn-secondary" data-auth-provider="${p.id}">${p.label}</button>`).join('')}
      </div>
      <button class="btn btn-secondary" id="login-modal-skip" style="margin-top:12px;width:100%;color:var(--text2)">${framework.translate('Continue as guest')}</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelectorAll('[data-auth-provider]').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.remove();
        login(btn.dataset.authProvider);
      });
    });

    modal.querySelector('#login-modal-skip').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }

  function isApiKeyToken(token) {
    return token.startsWith(API_KEY_PREFIX);
  }

  return { init, getUser, login, logout, refreshSession, showLoginModal, clearAirforce };
})();

window.PlaygroundAuth = PlaygroundAuth;

Router.init();
