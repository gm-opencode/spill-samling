(function () {
  'use strict';

  const GAMES = {
    trollguard: {
      title: 'Trollguard',
      file: './games/Trollguard.html',
    },
    'sap-fighter': {
      title: 'SAP Fighter 2',
      file: './games/SAP_Fighter_HD.html',
    },
    nordrally: {
      title: 'Nordrally',
      file: './games/Nordrally.html',
    },
  };

  const GAME_KEYS = ['trollguard', 'sap-fighter', 'nordrally'];

  const theater = document.getElementById('game-theater');
  const stage = document.getElementById('theater-stage');
  const frame = document.getElementById('theater-frame');
  const loading = document.getElementById('theater-loading');
  const titleEl = document.getElementById('theater-game-title');
  const closeBtn = document.getElementById('theater-close-btn');
  const fullscreenBtn = document.getElementById('theater-fullscreen-btn');
  const directLink = document.getElementById('theater-direct-link');
  const switcherBtns = document.querySelectorAll('[data-switch]');

  let activeGameId = null;
  let lastTriggerEl = null;

  function focusGameFrame() {
    if (!activeGameId) return;
    try {
      frame.focus();
      if (frame.contentWindow) {
        frame.contentWindow.focus();
      }
    } catch (_) {
      // Ignore focus errors if browser restricts cross-context focus
    }
  }

  function updateSwitcher(gameId) {
    switcherBtns.forEach((btn) => {
      const isCurrent = btn.getAttribute('data-switch') === gameId;
      btn.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
    });
  }

  function openGame(gameId, options = { updateHash: true }) {
    const game = GAMES[gameId];
    if (!game) return;

    if (!activeGameId) {
      lastTriggerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }

    activeGameId = gameId;
    titleEl.textContent = game.title;
    directLink.setAttribute('href', game.file);
    frame.setAttribute('title', `${game.title} — Game Viewport`);
    updateSwitcher(gameId);

    loading.textContent = `Loading ${game.title}…`;
    loading.classList.remove('is-hidden');

    theater.classList.add('is-open');
    theater.setAttribute('aria-hidden', 'false');
    document.body.classList.add('theater-open');

    if (options.updateHash && window.location.hash !== `#play=${gameId}`) {
      window.history.pushState({ gameId }, '', `#play=${gameId}`);
    }

    frame.src = game.file;
  }

  function closeGame(options = { updateHash: true }) {
    if (!activeGameId) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    activeGameId = null;
    theater.classList.remove('is-open');
    theater.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('theater-open');
    updateSwitcher(null);

    // Unload game so audio and animation loops stop immediately
    frame.src = 'about:blank';

    if (options.updateHash && window.location.hash.startsWith('#play=')) {
      window.history.pushState({}, '', window.location.pathname + window.location.search);
    }

    if (lastTriggerEl && typeof lastTriggerEl.focus === 'function') {
      lastTriggerEl.focus();
    }
  }

  frame.addEventListener('load', () => {
    if (!activeGameId) return;
    loading.classList.add('is-hidden');
    focusGameFrame();
  });

  // Launch triggers on game cards
  document.querySelectorAll('[data-launch]').forEach((el) => {
    el.addEventListener('click', (event) => {
      // Allow Ctrl/Cmd/Shift/middle-click on links to open standalone tab natively
      if (
        el.tagName === 'A' &&
        (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      ) {
        return;
      }
      event.preventDefault();
      const gameId = el.getAttribute('data-launch');
      openGame(gameId);
    });
  });

  // Switcher buttons inside theater bar
  switcherBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-switch');
      if (targetId && targetId !== activeGameId) {
        openGame(targetId);
      } else {
        focusGameFrame();
      }
    });
  });

  closeBtn.addEventListener('click', () => closeGame());

  fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      const target = stage.requestFullscreen ? stage : theater;
      if (target.requestFullscreen) {
        target.requestFullscreen().then(focusGameFrame).catch(() => {});
      }
    } else if (document.exitFullscreen) {
      document.exitFullscreen().then(focusGameFrame).catch(() => {});
    }
  });

  // Keyboard shortcuts on landing page (1, 2, 3 to launch)
  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (!activeGameId) {
      if (event.key === '1' || event.key === '2' || event.key === '3') {
        const idx = Number(event.key) - 1;
        openGame(GAME_KEYS[idx]);
      }
    }
  });

  // Sync with browser Back/Forward navigation and deep links (#play=<slug>)
  function syncFromHash() {
    const match = window.location.hash.match(/^#play=([a-z0-9-]+)$/i);
    if (match && GAMES[match[1]]) {
      if (activeGameId !== match[1]) {
        openGame(match[1], { updateHash: false });
      }
    } else if (activeGameId) {
      closeGame({ updateHash: false });
    }
  }

  window.addEventListener('hashchange', syncFromHash);
  window.addEventListener('popstate', syncFromHash);

  // Open directly if user landed on a #play=<slug> deep link
  syncFromHash();
})();
