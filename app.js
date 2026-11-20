(function () {
  'use strict';

  // Per-game data used by the theater. Rich copy (genre, description, tags,
  // specs, accent colour, cover art) lives in each `.game-card` in index.html
  // and is read from there, so the markup stays the single source for SEO/no-JS.
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

  // Order sets arrow-key browsing, spotlight rotation and the 1–N hotkeys.
  const GAME_KEYS = ['trollguard', 'sap-fighter', 'nordrally', 'nova-vanguard'];
  const STORAGE_SFX_KEY = 'opengames_ui_sfx';
  const STORAGE_PLAYED_KEY = 'opengames_played_history';
  const HISTORY_STATE_FLAG = 'opengames';

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let prefersReducedMotion = reducedMotionQuery.matches;

  const byId = (id) => document.getElementById(id);

  // DOM references
  const siteHeader = byId('site-header');
  const mainEl = byId('main');
  const footerEl = byId('site-footer');
  const cards = Array.from(document.querySelectorAll('.game-card[data-game]'));
  const cardById = new Map(cards.map((card) => [card.getAttribute('data-game'), card]));
  const ambientLayers = Array.from(document.querySelectorAll('.ambient-layer[data-ambient]'));
  const sfxToggleBtn = byId('sfx-toggle-btn');
  const sfxIndicator = byId('sfx-indicator');

  const spotlight = byId('spotlight');
  const spotlightArt = byId('spotlight-art');
  const spotlightContent = byId('spotlight-content');
  const spotlightIndex = byId('spotlight-index');
  const spotlightGenre = byId('spotlight-genre');
  const spotlightTitle = byId('spotlight-title');
  const spotlightSubtitle = byId('spotlight-subtitle');
  const spotlightPlayed = byId('spotlight-played');
  const spotlightPitch = byId('spotlight-pitch');
  const spotlightTags = byId('spotlight-tags');
  const spotlightPlay = byId('spotlight-play');
  const spotlightHotkey = byId('spotlight-hotkey');
  const spotlightDetails = byId('spotlight-details');
  const spotlightPause = byId('spotlight-pause');
  const railList = byId('rail-list');

  const continueSection = byId('continue');
  const continueList = byId('continue-list');
  const clearHistoryBtn = byId('clear-history');

  const grid = byId('game-grid');
  const filterChips = Array.from(document.querySelectorAll('[data-filter]'));
  const searchInput = byId('library-search');
  const libraryCount = byId('library-count');
  const libraryEmpty = byId('library-empty');
  const libraryReset = byId('library-reset');

  const detailsDialog = byId('game-details');

  const theater = byId('game-theater');
  const stage = byId('theater-stage');
  let frame = byId('theater-frame');
  const loading = byId('theater-loading');
  const loadingText = byId('theater-loading-text');
  const loadingArt = byId('theater-loading-art');
  const loadingCover = byId('theater-loading-cover');
  const loadingBar = byId('theater-loading-bar');
  const loadingTip = byId('theater-loading-tip');
  const titleEl = byId('theater-game-title');
  const thumbEl = byId('theater-thumb');
  const controlsHintEl = byId('theater-controls-hint');
  const closeBtn = byId('theater-close-btn');
  const reloadBtn = byId('theater-reload-btn');
  const fullscreenBtn = byId('theater-fullscreen-btn');
  const directLink = byId('theater-direct-link');
  const switcherBtns = Array.from(document.querySelectorAll('[data-switch]'));

  let activeGameId = null;
  let selectedGameId = GAME_KEYS[0];
  let lastTriggerEl = null;
  let audioCtx = null;
  let sfxEnabled = true;
  let loadingAnim = null;

  // --------------------------------------------------------------------------
  // Game info (read once from the card markup)
  // --------------------------------------------------------------------------
  const INFO = new Map();
  GAME_KEYS.forEach((id, index) => {
    const card = cardById.get(id);
    const game = GAMES[id];
    if (!card || !game) return;
    const text = (sel) => {
      const el = card.querySelector(sel);
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    };
    const img = card.querySelector('.card-cover img');
    const tags = Array.from(card.querySelectorAll('.card-tags li')).map((li) => li.textContent.trim());
    const genres = (card.getAttribute('data-genres') || '').toLowerCase().split(/\s+/).filter(Boolean);
    const info = {
      id,
      index,
      hotkey: index < 9 ? String(index + 1) : '',
      title: game.title,
      file: game.file,
      controls: game.controls,
      genre: text('.card-genre'),
      subtitle: text('.card-subtitle'),
      description: text('.card-description'),
      tags,
      genres,
      cover: img ? img.getAttribute('src') : '',
      alt: img ? img.getAttribute('alt') : '',
      specs: card.querySelector('.card-specs'),
      accent: card.style.getPropertyValue('--game-accent').trim(),
    };
    info.haystack = [info.title, info.genre, info.subtitle, info.description, tags.join(' '), genres.join(' ')]
      .join(' ')
      .toLowerCase();
    INFO.set(id, info);
  });

  document.querySelectorAll('[data-game-count]').forEach((el) => {
    el.textContent = String(INFO.size).padStart(2, '0');
  });

  // --------------------------------------------------------------------------
  // Subtle console UI sound effects (Web Audio API, synthesized)
  // --------------------------------------------------------------------------
  try {
    if (localStorage.getItem(STORAGE_SFX_KEY) === 'off') sfxEnabled = false;
  } catch (_) {
    // Ignore storage access errors
  }

  function syncSfxUI() {
    if (!sfxToggleBtn || !sfxIndicator) return;
    sfxToggleBtn.setAttribute('aria-pressed', sfxEnabled ? 'true' : 'false');
    sfxIndicator.textContent = sfxEnabled ? 'ON' : 'OFF';
  }

  // Only ever called from a user gesture (click / key), so the context is
  // created inside one and browsers allow it to run.
  function ensureAudioContext() {
    if (!sfxEnabled) return null;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioCtx) audioCtx = new AudioContextCtor();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function playUiTone(type) {
    if (!sfxEnabled) return;
    // Hover never creates the context; only gestures (click/keys) do.
    const ctx = type === 'select' && !audioCtx ? null : ensureAudioContext();
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

  // Unlock the UI audio context on the first real gesture so hover ticks work.
  ['pointerdown', 'keydown'].forEach((type) => {
    window.addEventListener(type, function unlock() {
      window.removeEventListener(type, unlock, true);
      ensureAudioContext();
    }, true);
  });

  // --------------------------------------------------------------------------
  // Small DOM helpers
  // --------------------------------------------------------------------------
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function icon(name, size) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#i-${name}`);
    svg.appendChild(use);
    return svg;
  }

  function el(tag, className, textContent) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent != null) node.textContent = textContent;
    return node;
  }

  function fillTags(list, tags) {
    list.replaceChildren(...tags.map((tag) => el('li', 'tag', tag)));
  }

  const rtf = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat
    ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
    : null;

  function timeAgo(ts) {
    const diffSec = (ts - Date.now()) / 1000;
    const units = [
      ['year', 31536000],
      ['month', 2592000],
      ['week', 604800],
      ['day', 86400],
      ['hour', 3600],
      ['minute', 60],
    ];
    for (const [unit, seconds] of units) {
      if (Math.abs(diffSec) >= seconds) {
        const value = Math.round(diffSec / seconds);
        return rtf ? rtf.format(value, unit) : `${Math.abs(value)} ${unit}s ago`;
      }
    }
    return 'just now';
  }

  // --------------------------------------------------------------------------
  // Play history: badges, spotlight chip and "Continue playing" row
  // Format (unchanged): { "<slug>": <timestamp ms>, ... }
  // --------------------------------------------------------------------------
  function loadPlayHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_PLAYED_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
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

  function sortedHistory(history) {
    return Object.entries(history)
      .filter(([id, ts]) => INFO.has(id) && typeof ts === 'number' && ts > 0)
      .sort((a, b) => b[1] - a[1]);
  }

  function renderPlayHistory() {
    const history = loadPlayHistory();
    const recent = sortedHistory(history);
    const latestId = recent.length ? recent[0][0] : null;

    cards.forEach((card) => {
      const id = card.getAttribute('data-game');
      const label = card.querySelector(`[data-recent-label="${id}"]`);
      const played = Boolean(history[id]);
      card.classList.toggle('has-played', played);
      if (label && played) {
        label.textContent = id === latestId ? 'Last Played' : 'Played';
      }
    });

    renderSpotlightPlayed(history);

    if (!continueSection || !continueList) return;
    if (!recent.length) {
      continueSection.hidden = true;
      continueList.replaceChildren();
      return;
    }

    const items = recent.slice(0, 4).map(([id, ts], i) => {
      const info = INFO.get(id);
      const li = el('li', 'continue-item');
      if (info.accent) li.style.setProperty('--game-accent', info.accent);

      const link = el('a', 'continue-card');
      link.href = info.file;
      link.setAttribute('data-launch', id);

      const img = el('img', 'continue-cover');
      img.src = info.cover;
      img.alt = '';
      img.width = 1280;
      img.height = 714;
      img.loading = 'lazy';
      img.decoding = 'async';

      const meta = el('span', 'continue-meta');
      meta.append(
        el('span', 'continue-title', info.title),
        el('span', 'continue-time', `${i === 0 ? 'Last played' : 'Played'} ${timeAgo(ts)}`)
      );

      const play = el('span', 'continue-play');
      play.setAttribute('aria-hidden', 'true');
      play.appendChild(icon('play', 16));

      link.setAttribute('aria-label', `Resume ${info.title}, ${i === 0 ? 'last played' : 'played'} ${timeAgo(ts)}`);
      link.append(img, meta, play);
      li.appendChild(link);
      return li;
    });

    continueList.replaceChildren(...items);
    continueSection.hidden = false;
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      try {
        localStorage.removeItem(STORAGE_PLAYED_KEY);
      } catch (_) {}
      cards.forEach((card) => card.classList.remove('has-played'));
      renderPlayHistory();
      const target = cardById.get(selectedGameId);
      const play = target && target.querySelector('.btn-play');
      if (play) play.focus({ preventScroll: true });
    });
  }

  // --------------------------------------------------------------------------
  // Spotlight (featured hero) with pausable auto-rotation
  // --------------------------------------------------------------------------
  const railThumbs = new Map();
  const pauseReasons = new Set();
  let userPaused = false;

  function ensureSpotlightImage(gameId) {
    if (!spotlightArt) return null;
    let img = spotlightArt.querySelector(`[data-art="${gameId}"]`);
    if (!img) {
      const info = INFO.get(gameId);
      if (!info) return null;
      img = el('img', 'spotlight-img');
      img.setAttribute('data-art', gameId);
      img.src = info.cover;
      img.alt = '';
      img.width = 1280;
      img.height = 714;
      img.decoding = 'async';
      spotlightArt.appendChild(img);
    }
    return img;
  }

  function renderSpotlightPlayed(history) {
    if (!spotlightPlayed) return;
    const ts = (history || loadPlayHistory())[selectedGameId];
    if (typeof ts === 'number' && ts > 0) {
      spotlightPlayed.textContent = `Played ${timeAgo(ts)}`;
      spotlightPlayed.hidden = false;
    } else {
      spotlightPlayed.hidden = true;
    }
  }

  function renderSpotlight(gameId, animate) {
    const info = INFO.get(gameId);
    if (!info || !spotlight) return;

    const img = ensureSpotlightImage(gameId);
    if (spotlightArt) {
      spotlightArt.querySelectorAll('.spotlight-img').forEach((node) => {
        node.classList.toggle('is-active', node === img);
      });
    }
    if (info.accent) spotlight.style.setProperty('--game-accent', info.accent);

    spotlightIndex.textContent = `${String(info.index + 1).padStart(2, '0')} / ${String(INFO.size).padStart(2, '0')}`;
    spotlightGenre.textContent = info.genre;
    spotlightTitle.textContent = info.title;
    spotlightSubtitle.textContent = info.subtitle;
    spotlightPitch.textContent = info.description;
    fillTags(spotlightTags, info.tags);
    spotlightPlay.href = info.file;
    spotlightPlay.setAttribute('data-launch', gameId);
    spotlightPlay.setAttribute('aria-label', `Play ${info.title}`);
    if (spotlightHotkey) {
      spotlightHotkey.textContent = info.hotkey;
      spotlightHotkey.hidden = !info.hotkey;
    }
    if (spotlightDetails) {
      spotlightDetails.setAttribute('data-details', gameId);
      spotlightDetails.setAttribute('aria-label', `${info.title} details`);
    }
    renderSpotlightPlayed();

    railThumbs.forEach((thumb, id) => {
      const isActive = id === gameId;
      thumb.classList.toggle('is-active', isActive);
      if (isActive) thumb.setAttribute('aria-current', 'true');
      else thumb.removeAttribute('aria-current');
    });

    if (animate && !prefersReducedMotion && typeof spotlightContent.animate === 'function') {
      spotlightContent.animate(
        [
          { opacity: 0, transform: 'translateY(10px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 480, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    }

    // Warm up the next slide so rotation never shows an empty frame.
    if (isRotating()) ensureSpotlightImage(nextGameId(gameId, 1, false));
  }

  function buildRail() {
    if (!railList) return;
    const thumbs = GAME_KEYS.filter((id) => INFO.has(id)).map((id) => {
      const info = INFO.get(id);
      const btn = el('button', 'rail-thumb');
      btn.type = 'button';
      btn.setAttribute('data-spotlight-pick', id);
      btn.setAttribute('aria-label', `Feature ${info.title}`);
      if (info.accent) btn.style.setProperty('--game-accent', info.accent);

      const img = el('img', 'rail-thumb-img');
      img.src = info.cover;
      img.alt = '';
      img.width = 1280;
      img.height = 714;
      img.decoding = 'async';

      const text = el('span', 'rail-thumb-text');
      text.setAttribute('aria-hidden', 'true');
      text.append(el('span', 'rail-thumb-title', info.title), el('span', 'rail-thumb-genre', info.genre));

      const progress = el('span', 'rail-progress');
      progress.setAttribute('aria-hidden', 'true');
      progress.appendChild(el('span', 'rail-progress-bar'));

      btn.append(img, text, progress);
      railThumbs.set(id, btn);
      return btn;
    });
    railList.replaceChildren(...thumbs);

    railList.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-spotlight-pick]');
      if (btn) setSelectedGame(btn.getAttribute('data-spotlight-pick'));
    });

    railList.addEventListener('animationend', (event) => {
      if (event.animationName !== 'rail-progress' || !isRotating()) return;
      setSelectedGame(nextGameId(selectedGameId, 1, false), { silent: true, animate: true });
    });
  }

  function isRotating() {
    return Boolean(spotlight) && spotlight.classList.contains('is-rotating');
  }

  function updateRotation() {
    if (!spotlight) return;
    const canRotate = !prefersReducedMotion && INFO.size > 1;
    const running = canRotate && !userPaused && pauseReasons.size === 0;
    spotlight.classList.toggle('is-rotating', running);
    spotlight.classList.toggle('can-rotate', canRotate);
    // Announce changes only when they are user-driven, not on every auto-advance.
    spotlightContent.setAttribute('aria-live', running ? 'off' : 'polite');
    if (running) ensureSpotlightImage(nextGameId(selectedGameId, 1, false));
  }

  if (spotlightPause) {
    spotlightPause.addEventListener('click', () => {
      userPaused = !userPaused;
      spotlightPause.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
      spotlightPause.setAttribute('aria-label', userPaused ? 'Resume featured rotation' : 'Pause featured rotation');
      updateRotation();
    });
  }

  function bindPause(target, reason, enterEvent, leaveEvent) {
    if (!target) return;
    target.addEventListener(enterEvent, () => {
      pauseReasons.add(reason);
      updateRotation();
    });
    target.addEventListener(leaveEvent, (event) => {
      if (leaveEvent === 'focusout' && target.contains(event.relatedTarget)) return;
      pauseReasons.delete(reason);
      updateRotation();
    });
  }

  // Pause while the pointer is over the copy/buttons or the rail (not the
  // whole art, which fills the first screen), and while focus is inside.
  bindPause(spotlightContent, 'hover-content', 'pointerenter', 'pointerleave');
  bindPause(byId('spotlight-rail'), 'hover-rail', 'pointerenter', 'pointerleave');
  bindPause(spotlight, 'focus', 'focusin', 'focusout');
  bindPause(grid, 'grid', 'pointerenter', 'pointerleave');

  if (spotlight && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) pauseReasons.delete('offscreen');
        else pauseReasons.add('offscreen');
      });
      updateRotation();
    }, { threshold: 0.45 }).observe(spotlight);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseReasons.add('hidden');
    else pauseReasons.delete('hidden');
    updateRotation();
  });

  const onMotionChange = () => {
    prefersReducedMotion = reducedMotionQuery.matches;
    updateRotation();
  };
  if (reducedMotionQuery.addEventListener) reducedMotionQuery.addEventListener('change', onMotionChange);

  // --------------------------------------------------------------------------
  // Selection: cards, ambient backdrop and spotlight follow one selected game
  // --------------------------------------------------------------------------
  function setSelectedGame(gameId, options = {}) {
    if (!GAMES[gameId] || !INFO.has(gameId)) return;
    const changed = selectedGameId !== gameId;
    selectedGameId = gameId;

    cards.forEach((card) => {
      card.classList.toggle('is-selected', card.getAttribute('data-game') === gameId);
    });

    ambientLayers.forEach((layer) => {
      layer.classList.toggle('is-active', layer.getAttribute('data-ambient') === gameId);
    });

    if (changed) renderSpotlight(gameId, options.animate !== false);
    if (changed && !options.silent) playUiTone('select');
  }

  function visibleGameIds() {
    return GAME_KEYS.filter((id) => {
      const card = cardById.get(id);
      return card && !card.hidden;
    });
  }

  function nextGameId(fromId, step, visibleOnly = true) {
    const pool = visibleOnly ? visibleGameIds() : GAME_KEYS.filter((id) => INFO.has(id));
    if (!pool.length) return fromId;
    const idx = pool.indexOf(fromId);
    if (idx === -1) return pool[step > 0 ? 0 : pool.length - 1];
    return pool[(idx + step + pool.length) % pool.length];
  }

  const canTilt = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  cards.forEach((card) => {
    const gameId = card.getAttribute('data-game');

    card.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse' || event.pointerType === 'pen') setSelectedGame(gameId);
    });
    card.addEventListener('focusin', () => setSelectedGame(gameId, { silent: true }));

    if (!canTilt) return;
    let raf = 0;
    let pointerX = 0;
    let pointerY = 0;

    card.addEventListener('pointermove', (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (raf || prefersReducedMotion) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        // One read, then writes, once per frame.
        const rect = card.getBoundingClientRect();
        const x = Math.min(Math.max((pointerX - rect.left) / rect.width, 0), 1);
        const y = Math.min(Math.max((pointerY - rect.top) / rect.height, 0), 1);
        card.style.setProperty('--spot-x', `${(x * 100).toFixed(1)}%`);
        card.style.setProperty('--spot-y', `${(y * 100).toFixed(1)}%`);
        card.style.setProperty('--tilt-x', `${((0.5 - y) * 4).toFixed(2)}deg`);
        card.style.setProperty('--tilt-y', `${((x - 0.5) * 5).toFixed(2)}deg`);
      });
    });

    card.addEventListener('pointerleave', () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
    });
  });

  // --------------------------------------------------------------------------
  // Library filters and search
  // --------------------------------------------------------------------------
  let activeFilter = 'all';
  let searchQuery = '';

  filterChips.forEach((chip) => {
    const filter = chip.getAttribute('data-filter');
    const count = filter === 'all'
      ? INFO.size
      : Array.from(INFO.values()).filter((info) => info.genres.includes(filter)).length;
    if (count === 0) chip.hidden = true;
    const badge = el('span', 'chip-count', String(count));
    badge.setAttribute('aria-hidden', 'true');
    chip.appendChild(badge);
    chip.setAttribute('aria-label', `${chip.firstChild.textContent.trim()} (${count})`);
  });

  function applyFilters() {
    const terms = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    let visible = 0;

    cards.forEach((card) => {
      const info = INFO.get(card.getAttribute('data-game'));
      const genres = info ? info.genres : [];
      const matchesFilter = activeFilter === 'all' || genres.includes(activeFilter);
      const matchesSearch = !terms.length || (info && terms.every((term) => info.haystack.includes(term)));
      const show = matchesFilter && matchesSearch;
      card.hidden = !show;
      if (show) visible += 1;
    });

    filterChips.forEach((chip) => {
      chip.setAttribute('aria-pressed', chip.getAttribute('data-filter') === activeFilter ? 'true' : 'false');
    });

    if (libraryCount) {
      const filtered = activeFilter !== 'all' || terms.length;
      libraryCount.textContent = filtered
        ? `${visible} of ${cards.length} games`
        : `${cards.length} ${cards.length === 1 ? 'game' : 'games'}`;
    }
    if (libraryEmpty) libraryEmpty.hidden = visible > 0;
  }

  filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      activeFilter = chip.getAttribute('data-filter') || 'all';
      applyFilters();
      playUiTone('select');
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.trim();
      applyFilters();
    });
  }

  if (libraryReset) {
    libraryReset.addEventListener('click', () => {
      activeFilter = 'all';
      searchQuery = '';
      if (searchInput) searchInput.value = '';
      applyFilters();
      if (searchInput) searchInput.focus();
    });
  }

  // --------------------------------------------------------------------------
  // Game details dialog
  // --------------------------------------------------------------------------
  function openDetails(gameId) {
    const info = INFO.get(gameId);
    if (!info || !detailsDialog) return;

    detailsDialog.style.setProperty('--game-accent', info.accent || '');
    const cover = byId('details-cover');
    cover.src = info.cover;
    cover.alt = info.alt;
    byId('details-genre').textContent = info.genre;
    byId('details-title').textContent = info.title;
    byId('details-subtitle').textContent = info.subtitle;
    byId('details-description').textContent = info.description;
    fillTags(byId('details-tags'), info.tags);
    const specs = byId('details-specs');
    specs.replaceChildren(info.specs ? info.specs.cloneNode(true) : el('span'));

    const play = byId('details-play');
    play.href = info.file;
    play.setAttribute('data-launch', gameId);
    play.setAttribute('aria-label', `Play ${info.title}`);
    const hotkey = byId('details-hotkey');
    hotkey.textContent = info.hotkey;
    hotkey.hidden = !info.hotkey;
    const standalone = byId('details-standalone');
    standalone.href = info.file;
    standalone.setAttribute('aria-label', `Open ${info.title} as a standalone page`);

    setSelectedGame(gameId, { silent: true });
    pauseReasons.add('dialog');
    updateRotation();

    if (typeof detailsDialog.showModal === 'function') {
      if (!detailsDialog.open) detailsDialog.showModal();
    } else {
      detailsDialog.setAttribute('open', '');
    }
    play.focus();
  }

  function closeDetails() {
    if (!detailsDialog) return;
    if (typeof detailsDialog.close === 'function') detailsDialog.close();
    else detailsDialog.removeAttribute('open');
  }

  if (detailsDialog) {
    detailsDialog.addEventListener('close', () => {
      pauseReasons.delete('dialog');
      updateRotation();
    });
    // Click on the backdrop (the dialog element itself, outside the inner panel)
    detailsDialog.addEventListener('click', (event) => {
      if (event.target === detailsDialog) closeDetails();
    });
    const closeDetailsBtn = byId('details-close');
    if (closeDetailsBtn) closeDetailsBtn.addEventListener('click', closeDetails);
  }

  // --------------------------------------------------------------------------
  // Theater
  // --------------------------------------------------------------------------
  function focusGameFrame() {
    if (!activeGameId) return;
    try {
      frame.focus();
      if (frame.contentWindow) frame.contentWindow.focus();
    } catch (_) {
      // Ignore cross-context focus restrictions
    }
  }

  // Navigate by mounting a fresh iframe instead of changing `src`: a fresh
  // frame's first navigation adds no joint session history entry, so the
  // browser Back button closes the theater instead of stepping the iframe.
  function mountFrame(url) {
    const next = frame.cloneNode(false);
    next.setAttribute('src', url);
    next.addEventListener('load', onFrameLoad);
    frame.replaceWith(next);
    frame = next;
  }

  function updateSwitcher(gameId) {
    switcherBtns.forEach((btn) => {
      const isCurrent = btn.getAttribute('data-switch') === gameId;
      btn.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
      // On narrow screens the switcher scrolls: keep the current game in view.
      const bar = btn.parentElement;
      if (isCurrent && bar && bar.scrollWidth > bar.clientWidth) {
        const delta = btn.getBoundingClientRect().left - bar.getBoundingClientRect().left;
        bar.scrollLeft += delta - (bar.clientWidth - btn.offsetWidth) / 2;
      }
    });
  }

  function setPageInert(inert) {
    [siteHeader, mainEl, footerEl].forEach((node) => {
      if (!node) return;
      if (inert) node.setAttribute('inert', '');
      else node.removeAttribute('inert');
    });
  }

  function startLoading(message, info) {
    loadingText.textContent = message;
    if (info) {
      loadingArt.style.backgroundImage = `url("${info.cover}")`;
      loadingCover.src = info.cover;
      loadingCover.alt = '';
      loadingTip.textContent = `Controls: ${info.controls}`;
      theater.style.setProperty('--game-accent', info.accent || '');
    }
    loading.classList.remove('is-hidden');
    if (loadingAnim) loadingAnim.cancel();
    loadingAnim = null;
    if (typeof loadingBar.animate === 'function') {
      // Eased "fake" progress that settles near the end until the frame loads.
      loadingAnim = loadingBar.animate(
        [{ transform: 'scaleX(0.04)' }, { transform: 'scaleX(0.6)', offset: 0.35 }, { transform: 'scaleX(0.92)' }],
        { duration: 4200, easing: 'cubic-bezier(0.1, 0.7, 0.2, 1)', fill: 'forwards' }
      );
    }
  }

  function finishLoading() {
    if (loadingAnim) loadingAnim.cancel();
    loadingAnim = null;
    if (typeof loadingBar.animate === 'function') {
      loadingAnim = loadingBar.animate(
        [{ transform: 'scaleX(0.92)' }, { transform: 'scaleX(1)' }],
        { duration: 180, easing: 'ease-out', fill: 'forwards' }
      );
    }
    loading.classList.add('is-hidden');
  }

  function openGame(gameId, options = {}) {
    const game = GAMES[gameId];
    if (!game) return;
    const updateHash = options.updateHash !== false;
    const info = INFO.get(gameId);
    const wasOpen = Boolean(activeGameId);

    if (!wasOpen) {
      lastTriggerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }

    setSelectedGame(gameId, { silent: true, animate: false });
    playUiTone('launch');
    recordPlay(gameId);

    activeGameId = gameId;
    titleEl.textContent = game.title;
    if (controlsHintEl) controlsHintEl.textContent = game.controls;
    if (thumbEl && info) thumbEl.src = info.cover;
    directLink.setAttribute('href', game.file);
    frame.setAttribute('title', `${game.title} — Game Viewport`);
    updateSwitcher(gameId);
    startLoading(`Launching ${game.title}…`, info || { cover: '', controls: game.controls });

    if (!wasOpen) {
      theater.classList.add('is-open');
      theater.setAttribute('aria-hidden', 'false');
      document.body.classList.add('theater-open');
      setPageInert(true);
      pauseReasons.add('theater');
      updateRotation();
      closeBtn.focus({ preventScroll: true });
    }

    if (updateHash && window.location.hash !== `#play=${gameId}`) {
      if (wasOpen) {
        // Switching inside the theater replaces the entry so one Back exits.
        const pushed = window.history.state && window.history.state[HISTORY_STATE_FLAG] === 'play';
        window.history.replaceState({ [HISTORY_STATE_FLAG]: pushed ? 'play' : 'deeplink', gameId }, '', `#play=${gameId}`);
      } else {
        window.history.pushState({ [HISTORY_STATE_FLAG]: 'play', gameId }, '', `#play=${gameId}`);
      }
    }

    mountFrame(game.file);
  }

  function closeGame(options = {}) {
    if (!activeGameId) return;
    const updateHash = options.updateHash !== false;

    playUiTone('back');

    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }

    activeGameId = null;
    theater.classList.remove('is-open');
    theater.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('theater-open');
    setPageInert(false);
    updateSwitcher(null);
    pauseReasons.delete('theater');
    updateRotation();

    // Unload game so audio and animation loops stop cleanly
    mountFrame('about:blank');
    if (loadingAnim) loadingAnim.cancel();
    loadingAnim = null;

    if (updateHash && window.location.hash.startsWith('#play=')) {
      const state = window.history.state;
      if (state && state[HISTORY_STATE_FLAG] === 'play') {
        // We pushed this entry: step back so Back/Forward stay intuitive.
        window.history.back();
      } else {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }

    if (lastTriggerEl && lastTriggerEl.isConnected && lastTriggerEl.offsetParent !== null && lastTriggerEl !== document.body) {
      lastTriggerEl.focus();
    } else {
      const card = cardById.get(selectedGameId);
      const play = card && !card.hidden ? card.querySelector('.btn-play') : spotlightPlay;
      if (play) play.focus({ preventScroll: true });
    }
    lastTriggerEl = null;
  }

  function onFrameLoad() {
    if (!activeGameId) return;
    finishLoading();
    focusGameFrame();
  }

  frame.addEventListener('load', onFrameLoad);

  // Delegated handlers so cards, spotlight, details and "Continue" all work
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const launchEl = target.closest('[data-launch]');
    if (launchEl) {
      if (
        launchEl.tagName === 'A' &&
        (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      ) {
        return;
      }
      event.preventDefault();
      const gameId = launchEl.getAttribute('data-launch');
      if (detailsDialog && detailsDialog.open && detailsDialog.contains(launchEl)) {
        closeDetails(); // restores focus to the opener before we remember it
      }
      openGame(gameId);
      return;
    }

    const detailsEl = target.closest('[data-details]');
    if (detailsEl) {
      event.preventDefault();
      openDetails(detailsEl.getAttribute('data-details'));
      return;
    }

    const switchEl = target.closest('[data-switch]');
    if (switchEl) {
      const targetId = switchEl.getAttribute('data-switch');
      if (targetId && targetId !== activeGameId) openGame(targetId);
      else focusGameFrame();
    }
  });

  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      if (!activeGameId || !GAMES[activeGameId]) return;
      playUiTone('select');
      startLoading(`Restarting ${GAMES[activeGameId].title}…`, INFO.get(activeGameId));
      mountFrame(GAMES[activeGameId].file);
    });
  }

  closeBtn.addEventListener('click', () => closeGame());

  const fullscreenSupported = Boolean(stage.requestFullscreen || theater.requestFullscreen) && document.fullscreenEnabled !== false;
  if (!fullscreenSupported) fullscreenBtn.hidden = true;

  fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      const target = stage.requestFullscreen ? stage : theater;
      if (target.requestFullscreen) target.requestFullscreen().then(focusGameFrame).catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen().then(focusGameFrame).catch(() => {});
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const isFull = Boolean(document.fullscreenElement);
    theater.classList.toggle('is-fullscreen', isFull);
    fullscreenBtn.setAttribute('aria-label', isFull ? 'Exit fullscreen' : 'Enter fullscreen');
  });

  // --------------------------------------------------------------------------
  // Console-style keyboard control
  // --------------------------------------------------------------------------
  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

    if (activeGameId) {
      // Keys only reach us when focus is on the portal chrome, not in the game.
      if (event.key === 'Escape') {
        event.preventDefault();
        closeGame();
      }
      return;
    }

    if (detailsDialog && detailsDialog.open) return; // native dialog handles Esc

    const target = event.target;
    const tag = target && target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable)) {
      if (event.key === 'Escape' && target === searchInput && searchInput.value) {
        searchInput.value = '';
        searchQuery = '';
        applyFilters();
      }
      return;
    }

    if (event.key === '/' && searchInput) {
      event.preventDefault();
      searchInput.focus();
      return;
    }

    if (/^[1-9]$/.test(event.key)) {
      const gameId = GAME_KEYS[Number(event.key) - 1];
      if (gameId && GAMES[gameId]) {
        event.preventDefault();
        openGame(gameId);
      }
      return;
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const nextId = nextGameId(selectedGameId, event.key === 'ArrowRight' ? 1 : -1);
      setSelectedGame(nextId);
      // Keep keyboard focus with the selection when it lives in the grid/rail.
      const active = document.activeElement;
      if (active && grid && grid.contains(active)) {
        const play = cardById.get(nextId) && cardById.get(nextId).querySelector('.btn-play');
        if (play) play.focus();
      } else if (active && railList && railList.contains(active)) {
        const thumb = railThumbs.get(nextId);
        if (thumb) thumb.focus();
      }
      return;
    }

    if (event.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A') {
      event.preventDefault();
      openGame(selectedGameId);
    }
  });

  // --------------------------------------------------------------------------
  // Header: glass bar once the page scrolls
  // --------------------------------------------------------------------------
  const sentinel = byId('scroll-sentinel');
  if (siteHeader && sentinel && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      siteHeader.classList.toggle('is-scrolled', !entry.isIntersecting);
    }).observe(sentinel);
  }

  // --------------------------------------------------------------------------
  // Init + Back/Forward sync with deep links (#play=<slug>)
  // --------------------------------------------------------------------------
  function syncFromHash() {
    const match = window.location.hash.match(/^#play=([a-z0-9-]+)$/i);
    if (match && GAMES[match[1]]) {
      if (activeGameId !== match[1]) openGame(match[1], { updateHash: false });
    } else if (activeGameId) {
      closeGame({ updateHash: false });
    }
  }

  buildRail();
  renderSpotlight(selectedGameId, false);
  renderPlayHistory();
  applyFilters();
  updateRotation();

  window.addEventListener('hashchange', syncFromHash);
  window.addEventListener('popstate', syncFromHash);

  syncFromHash();
})();
