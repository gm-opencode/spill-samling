(function () {
  'use strict';

  const GAMES = {
    trollguard: {
      title: 'Trollguard',
      file: './games/Trollguard.html',
      controls: 'WASD / Mouse / Q / Space',
    },
    'sap-fighter': {
      title: 'SAP Fighter 2',
      file: './games/SAP_Fighter_HD.html',
      controls: 'Keyboard Arcade Controls',
    },
    nordrally: {
      title: 'Nordrally',
      file: './games/Nordrally.html',
      controls: 'WASD or Arrows / Shift / Space',
    },
    'nova-vanguard': {
      title: 'Nova Vanguard',
      file: './games/Nova_Vanguard.html',
      controls: 'A/D or Arrows / Space / Shift / Q',
    },
  };

  const GAME_KEYS = ['trollguard', 'sap-fighter', 'nordrally', 'nova-vanguard'];
  const STORAGE_SFX_KEY = 'opengames_ui_sfx';
  const STORAGE_PLAYED_KEY = 'opengames_played_history';
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // DOM References
  const cards = Array.from(document.querySelectorAll('.game-card'));
  const ambientLayers = Array.from(document.querySelectorAll('.ambient-layer'));
  const sfxToggleBtn = document.getElementById('sfx-toggle-btn');
  const sfxIndicator = document.getElementById('sfx-indicator');

  const theater = document.getElementById('game-theater');
  const stage = document.getElementById('theater-stage');
  const frame = document.getElementById('theater-frame');
  const loading = document.getElementById('theater-loading');
  const loadingText = document.getElementById('theater-loading-text');
  const titleEl = document.getElementById('theater-game-title');
  const controlsHintEl = document.getElementById('theater-controls-hint');
  const closeBtn = document.getElementById('theater-close-btn');
  const reloadBtn = document.getElementById('theater-reload-btn');
  const fullscreenBtn = document.getElementById('theater-fullscreen-btn');
  const directLink = document.getElementById('theater-direct-link');
  const switcherBtns = document.querySelectorAll('[data-switch]');

  let activeGameId = null;
  let selectedGameId = GAME_KEYS[0];
  let lastTriggerEl = null;
  let audioCtx = null;
  let sfxEnabled = true;

  // --------------------------------------------------------------------------
  // Subtle Console UI Sound Effects (Web Audio API)
  // --------------------------------------------------------------------------
  try {
    const savedSfx = localStorage.getItem(STORAGE_SFX_KEY);
    if (savedSfx === 'off') sfxEnabled = false;
  } catch (_) {
    // Ignore storage access errors
  }

  function syncSfxUI() {
    if (!sfxToggleBtn || !sfxIndicator) return;
    sfxToggleBtn.setAttribute('aria-pressed', sfxEnabled ? 'true' : 'false');
    sfxIndicator.textContent = sfxEnabled ? 'ON' : 'OFF';
  }

  function ensureAudioContext() {
    if (!sfxEnabled) return null;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioCtx) {
      audioCtx = new AudioContextCtor();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playUiTone(type) {
    if (!sfxEnabled) return;
    const ctx = ensureAudioContext();
    if (!ctx || ctx.state !== 'running') return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'select') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(680, now + 0.035);
      gain.gain.setValueAtTime(0.028, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'launch') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.09);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'back') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(310, now + 0.07);
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  }

  if (sfxToggleBtn) {
    syncSfxUI();
    sfxToggleBtn.addEventListener('click', () => {
      sfxEnabled = !sfxEnabled;
      syncSfxUI();
      try {
        localStorage.setItem(STORAGE_SFX_KEY, sfxEnabled ? 'on' : 'off');
      } catch (_) {}
      if (sfxEnabled) {
        ensureAudioContext();
        playUiTone('select');
      }
    });
  }

  // --------------------------------------------------------------------------
  // Play History Badges
  // --------------------------------------------------------------------------
  function loadPlayHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_PLAYED_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function recordPlay(gameId) {
    try {
      const history = loadPlayHistory();
      history[gameId] = Date.now();
      localStorage.setItem(STORAGE_PLAYED_KEY, JSON.stringify(history));
    } catch (_) {}
    renderPlayHistory();
  }

  function renderPlayHistory() {
    const history = loadPlayHistory();
    let latestId = null;
    let latestTime = 0;

    for (const [id, ts] of Object.entries(history)) {
      if (ts > latestTime) {
        latestTime = ts;
        latestId = id;
      }
    }

    cards.forEach((card) => {
      const id = card.getAttribute('data-game');
      const label = card.querySelector(`[data-recent-label="${id}"]`);
      if (history[id]) {
        card.classList.add('has-played');
        if (label) {
          label.textContent = id === latestId ? 'Last Played' : 'Played';
        }
      }
    });
  }

  renderPlayHistory();

  // --------------------------------------------------------------------------
  // Ambient Backdrop & Card Selection
  // --------------------------------------------------------------------------
  function setSelectedGame(gameId, options = { silent: false }) {
    if (!GAMES[gameId]) return;
    const changed = selectedGameId !== gameId;
    selectedGameId = gameId;

    cards.forEach((card) => {
      card.classList.toggle('is-selected', card.getAttribute('data-game') === gameId);
    });

    ambientLayers.forEach((layer) => {
      layer.classList.toggle('is-active', layer.getAttribute('data-ambient') === gameId);
    });

    if (changed && !options.silent) {
      playUiTone('select');
    }
  }

  cards.forEach((card) => {
    const gameId = card.getAttribute('data-game');

    card.addEventListener('mouseenter', () => setSelectedGame(gameId));
    card.addEventListener('focusin', () => setSelectedGame(gameId, { silent: true }));

    if (!prefersReducedMotion) {
      card.addEventListener('mousemove', (event) => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        const tiltY = (x - 0.5) * 4;
        const tiltX = (0.5 - y) * 3.5;

        card.style.setProperty('--spot-x', `${(x * 100).toFixed(1)}%`);
        card.style.setProperty('--spot-y', `${(y * 100).toFixed(1)}%`);
        card.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`);
        card.style.setProperty('--tilt-y', `${tiltY.toFixed(2)}deg`);
      });

      card.addEventListener('mouseleave', () => {
        card.style.setProperty('--tilt-x', '0deg');
        card.style.setProperty('--tilt-y', '0deg');
      });
    }
  });

  // --------------------------------------------------------------------------
  // Arcade Theater Management
  // --------------------------------------------------------------------------
  function focusGameFrame() {
    if (!activeGameId) return;
    try {
      frame.focus();
      if (frame.contentWindow) {
        frame.contentWindow.focus();
      }
    } catch (_) {
      // Ignore cross-context focus restrictions
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

    setSelectedGame(gameId, { silent: true });
    playUiTone('launch');
    recordPlay(gameId);

    activeGameId = gameId;
    titleEl.textContent = game.title;
    if (controlsHintEl) {
      controlsHintEl.textContent = game.controls;
    }
    directLink.setAttribute('href', game.file);
    frame.setAttribute('title', `${game.title} — Game Viewport`);
    updateSwitcher(gameId);

    if (loadingText) {
      loadingText.textContent = `Launching ${game.title}…`;
    }
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

    playUiTone('back');

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    activeGameId = null;
    theater.classList.remove('is-open');
    theater.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('theater-open');
    updateSwitcher(null);

    // Unload game so audio and animation loops stop cleanly
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

  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      if (!activeGameId || !GAMES[activeGameId]) return;
      playUiTone('select');
      if (loadingText) {
        loadingText.textContent = `Restarting ${GAMES[activeGameId].title}…`;
      }
      loading.classList.remove('is-hidden');
      frame.src = GAMES[activeGameId].file;
    });
  }

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

  // Console-style keyboard browsing on the launcher screen
  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (!activeGameId) {
      if (event.key === '1' || event.key === '2' || event.key === '3' || event.key === '4') {
        openGame(GAME_KEYS[Number(event.key) - 1]);
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        const nextIdx = (GAME_KEYS.indexOf(selectedGameId) + 1) % GAME_KEYS.length;
        setSelectedGame(GAME_KEYS[nextIdx]);
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const prevIdx = (GAME_KEYS.indexOf(selectedGameId) - 1 + GAME_KEYS.length) % GAME_KEYS.length;
        setSelectedGame(GAME_KEYS[prevIdx]);
        return;
      }

      if (event.key === 'Enter') {
        // Avoid double-triggering if focus is already on a button or link
        if (tag !== 'BUTTON' && tag !== 'A') {
          event.preventDefault();
          openGame(selectedGameId);
        }
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

  syncFromHash();
})();
