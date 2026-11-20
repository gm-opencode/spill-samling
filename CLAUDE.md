# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

OpenGam.es is a static HTML5 game portal hosted on GitHub Pages. It has no build step, package manager, linter, or test suite: every file is served as-is. Licensed AGPL-3.0.

To run it locally, serve the repo root over HTTP. Opening `file://` URLs can break iframe focus and `localStorage`:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`, or deep-link to a game with `http://localhost:8000/#play=nordrally`.

## Model and effort for subagents

These are the repository owner's standing instructions until they say otherwise:
- **Coding work and general subagents:** use `model: "opus"` with `effort: "high"`.
- **Git and GitHub work** (commits, pushes, branches, pull requests, issues): delegate it to a subagent with `model: "sonnet"` and `effort: "medium"`.

This file can't change the main session's own model or effort. The user sets those (e.g. with `/model`).

## Architecture

**Portal (`index.html` + `app.js` + `styles.css`)**: a single-page launcher. `app.js` is one IIFE with no dependencies. It handles:
- **Card selection and ambient backdrop.** Hovering, focusing, or using arrow keys on a `.game-card[data-game]` toggles `.is-selected` on the card and `.is-active` on the matching `.ambient-layer[data-ambient]`.
- **Theater.** Elements with `[data-launch]` open the game in `#theater-frame` (an iframe) and set the URL hash to `#play=<slug>`. `syncFromHash` keeps Back/Forward and deep links in sync. Closing the theater sets the iframe to `about:blank` so the game's audio and render loops stop.
- **Keyboard shortcuts.** Keys `1`–`4` launch games by their index in `GAME_KEYS`.
- **UI sound effects.** These are synthesized with Web Audio, not loaded from files.
- **`localStorage` keys.** `opengames_ui_sfx` and `opengames_played_history` drive the Played/Last Played badges.

**Games (`games/*.html`)**: each game is one fully self-contained HTML file with all JS, CSS, and libraries inlined. They have no external dependencies and must keep working when opened directly as standalone pages (the cards link to them that way too).
- `Nordrally.html` and `Nova_Vanguard.html` inline a full copy of Three.js (r160) at the top of the file. Game code is in the last `<script>` block.
- `Trollguard.html` uses raw WebGL2 and Canvas 2D, split across several `<script>` blocks.
- `SAP_Fighter_HD.html` is Canvas 2D in a single script.
- These files are very large (up to ~20k lines). Use Grep and `Read` with offset/limit rather than reading them whole.
- Games keep their own namespaced `localStorage` keys (e.g. `nordrally.settings.v1`).

## Adding or renaming a game

A game's slug (e.g. `nova-vanguard`) is hard-coded in several places that must stay in sync:
1. `app.js`: the `GAMES` map (title, file path, controls hint) and the `GAME_KEYS` order, which sets both the arrow-key order and the `1`–`N` hotkeys. The hotkey check in the `keydown` handler lists `'1'`–`'4'` explicitly.
2. `index.html`:
   - an `.ambient-layer` with `data-ambient`
   - a `.game-card` with `data-game`, `data-launch`, and `data-recent-label`
   - a theater switcher button with `data-switch`
   - the `<meta>` description and Open Graph text, which name every game
3. `assets/<slug>.jpg` for the cover art, used by both the card and the ambient backdrop.
