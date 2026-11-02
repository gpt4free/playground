/**
 * Notifier — browser notifications for finished chat messages and live feeds.
 *
 * The browser only allows notifications after a user gesture, so the chat
 * toolbar exposes a bell button that calls `Notifier.toggle()`.  The preference
 * is stored locally and shared by every page of the playground.
 */
const Notifier = (() => {
  const KEY = 'llmp_notifications';
  const defaults = { enabled: false, sound: true };
  let baseTitle = null;
  let unread = 0;

  function supported() {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  function getSettings() {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    } catch {
      return { ...defaults };
    }
  }

  function saveSettings(patch) {
    const next = { ...getSettings(), ...patch };
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  }

  function permission() {
    return supported() ? Notification.permission : 'unsupported';
  }

  async function requestPermission() {
    if (!supported()) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return Notification.requestPermission();
  }

  async function enable() {
    const result = await requestPermission();
    const enabled = result === 'granted';
    saveSettings({ enabled });
    return enabled;
  }

  function disable() {
    saveSettings({ enabled: false });
  }

  async function toggle() {
    const settings = getSettings();
    if (settings.enabled) {
      disable();
      return false;
    }
    return enable();
  }

  function isEnabled() {
    return getSettings().enabled && permission() === 'granted';
  }

  function title() {
    if (baseTitle === null) baseTitle = document.title;
    return baseTitle;
  }

  function setUnread(count) {
    unread = Math.max(0, count || 0);
    document.title = unread > 0 ? `(${unread}) ${title()}` : title();
  }

  function bumpUnread(amount = 1) {
    setUnread(unread + amount);
  }

  function clearUnread() {
    setUnread(0);
  }

  function beep() {
    if (!getSettings().sound) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
      setTimeout(() => ctx.close?.(), 400);
    } catch {}
  }

  /**
   * Show a notification.  Returns false when notifications are disabled or the
   * page is focused, so callers can fall back to their own UI.
   */
  function notify(title, body = '', options = {}) {
    const {
      tag = '',
      url = '',
      force = false,
      silent = false,
    } = options;
    if (!isEnabled()) return false;
    if (!force && !document.hidden) return false;

    const notification = new Notification(title || 'g4f', {
      body: body ? String(body).slice(0, 240) : '',
      tag: tag || undefined,
      icon: options.icon || '/img/logo.svg',
      badge: options.badge || '/img/logo.svg',
      silent: silent || !getSettings().sound,
    });
    notification.onclick = () => {
      try {
        window.focus();
        if (options.chatId && typeof ChatPage !== 'undefined' && ChatPage.open) {
          ChatPage.open(options.chatId);
        } else if (url && /^https?:\/\//i.test(url)) {
          window.open(url, '_blank', 'noopener');
        } else if (url) {
          location.hash = url;
        }
      } finally {
        notification.close();
      }
    };
    if (!silent) beep();
    return true;
  }

  function onMessageDone({ chatId, title: chatTitle, preview, error } = {}) {
    if (!document.hidden) return;
    bumpUnread(1);
    const heading = error ? 'Message failed' : 'Assistant finished';
    notify(heading, preview || chatTitle || 'Your reply is ready', {
      tag: chatId ? `chat-${chatId}` : 'chat-done',
      chatId,
      force: true,
    });
  }

  function onFeedUpdate({ chatId, title: feedTitle, count = 1, preview } = {}) {
    bumpUnread(count);
    notify(
      feedTitle || 'Live feed updated',
      preview || `${count} new item${count === 1 ? '' : 's'}`,
      { tag: `feed-${chatId || 'feed'}`, chatId },
    );
  }

  function clearOnFocus() {
    window.addEventListener('focus', clearUnread);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) clearUnread();
    });
  }

  clearOnFocus();

  return {
    supported,
    permission,
    requestPermission,
    enable,
    disable,
    toggle,
    isEnabled,
    notify,
    onMessageDone,
    onFeedUpdate,
    bumpUnread,
    setUnread,
    clearUnread,
    getSettings,
    saveSettings,
  };
})();
