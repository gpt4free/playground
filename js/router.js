const Router = (() => {
  const routes = {
    '/': renderHome,
    '/chat': () => renderPage('chat', ChatPage),
    '/roleplay': () => renderPage('roleplay', RoleplayPage),
    '/coding': () => renderPage('coding', CodingPage),
    '/personas': renderPersonas,
    '/providers': () => renderPage('providers', ProvidersPage),
  };

  function getHash() {
    return location.hash.slice(1) || '/';
  }

  function closeNav() {
    const btn = document.getElementById('hamburger-btn');
    const links = document.getElementById('nav-links');
    if (btn) btn.classList.remove('open');
    if (links) links.classList.remove('open');
  }

  function initHamburger() {
    const btn = document.getElementById('hamburger-btn');
    const links = document.getElementById('nav-links');
    if (!btn || !links) return;

    btn.addEventListener('click', () => {
      btn.classList.toggle('open');
      links.classList.toggle('open');
    });

    links.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', closeNav);
    });
  }

  function navigate() {
    closeNav();
    const hash = getHash();
    const segments = hash.split('/').filter(Boolean);
    const base = '/' + (segments[0] || '');

    document.querySelectorAll('.nav-links a[data-route]').forEach(a => {
      a.classList.toggle('active', a.dataset.route === base);
    });

    if (base === '/personas') {
      renderPersonas();
      return;
    }

    const handler = routes[base] || renderHome;
    handler();
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
    container.innerHTML = `
      <div style="max-width:700px;margin:0 auto;padding:32px 16px;text-align:center;">
        <h1 class="notranslate" style="font-size:28px;font-weight:800;color:var(--accent);margin-bottom:8px">LLMPlayground</h1>
        <p style="color:var(--text2);font-size:15px;margin-bottom:32px">Your open-source AI playground — chat, roleplay, and code</p>
        <div style="display:grid;grid-template-columns:1fr;gap:12px;text-align:left;">
          ${[
            { icon: '💬', title: 'Chat', desc: 'Multi-turn conversations with any AI model', route: '/chat' },
            { icon: '🎭', title: 'Roleplay', desc: 'Character-based chats with custom personas', route: '/roleplay' },
            { icon: '💻', title: 'Coding', desc: 'Copilot-style coding assistant with code blocks', route: '/coding' },
            { icon: '🧑‍🎨', title: 'Personas', desc: 'Create and manage AI characters', route: '/personas' },
            { icon: '⚙️', title: 'Providers', desc: 'Configure API providers and models', route: '/providers' },
          ].map(item => `
            <a href="#${item.route}" style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;text-decoration:none;display:flex;align-items:center;gap:14px;transition:border-color 0.15s;" ontouchstart="this.style.borderColor='var(--accent)'" ontouchend="this.style.borderColor='var(--border)'" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
              <div style="font-size:28px;flex-shrink:0">${item.icon}</div>
              <div>
                <div style="font-weight:600;font-size:15px;color:var(--text);margin-bottom:2px">${item.title}</div>
                <div style="font-size:13px;color:var(--text2)">${item.desc}</div>
              </div>
            </a>`).join('')}
        </div>
        <div style="margin-top:32px;padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;text-align:left;">
          <h2 style="font-size:13px;margin-bottom:8px;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px">Default Provider</h2>
          <p style="font-size:13px;color:var(--text2);line-height:1.5">
            ${Store.getActiveProviderId() === 'api.airforce' ? 'Uses <strong style="color:var(--text)">Airforce API</strong> (api.airforce) by default — no API key required for free models.' : ``}
            Add your own providers in <a href="#/providers" style="color:var(--accent)">Providers</a>.
          </p>
        </div>
        <div style="margin-top:16px;font-size:12px;color:var(--text2)">
          Open source · <a href="https://github.com/meow18838/LLMPlayground" style="color:var(--accent)">GitHub</a>
        </div>
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
    initHamburger();
    window.addEventListener('hashchange', navigate);
    PlaygroundAuth.init().then(() => {
      if (!PlaygroundAuth.getUser()) PlaygroundAuth.showLoginModal();
    }).finally(() => navigate());
  }

  return { init, navigate };
})();

const PlaygroundAuth = (() => {
  const AUTH_BASE = 'https://auth.g4f.space';
  const USER_KEY = 'llmp_user';
  const SESSION_KEY = 'g4f_session';
  const EXPIRES_KEY = 'g4f_expires';
  const DEFAULT_ACCOUNT_NAME = 'Account';
  const API_KEY_PREFIX = 'g4f_';

  function getUser() {
    const expires = localStorage.getItem(EXPIRES_KEY);
    if (expires && isTokenExpired(expires)) {
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
    if (!btn) return;
    if (user) {
      const name = user.name || user.username || 'Account';
      const tier = user.tier || 'free';
      btn.textContent = `${name} · ${tier}`;
      btn.title = `Logged in (${tier})`;
    } else {
      btn.textContent = 'Login';
      btn.title = 'Login';
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
      <p style="font-size:13px;color:var(--text2);margin-bottom:16px;line-height:1.5">${framework.translate('Sign in to unlock member access tokens, provider API keys, and higher usage limits.')}</p>
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

  return { init, getUser, login, logout, refreshSession, showLoginModal };
})();

window.PlaygroundAuth = PlaygroundAuth;

Router.init();
