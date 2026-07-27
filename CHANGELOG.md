# Changelog

All notable changes to **Rehearse** are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/).  
Versioning follows [SemVer](https://semver.org/).

---

## [1.1.0] — 2026-07-27

Live mask quality, Pip (煤球) UX, and OCR word-feed reliability.

### Added

- **WebGL live mask engine** — true mosaic / liquid glass / blackhole / shade wave over live screen pixels (30–60fps path), not 2fps snapshot soup.
- **Pip 煤球** — floating vocab pet: chips from current EN line, open panel grows up-left from bottom-right coal, quiet drag & corner resize.
- **Pause → learn** — pause learning lifts CN cover, optionally auto-opens Pip; play can auto-collapse.
- **Pet settings** — auto-open on pause / auto-collapse on play (Settings).
- **Force OCR refresh** — opening Pip or pausing forces a fresh capture (never sit idle with stale/empty chips).
- **Word explain card** — short 3-line answer: meaning · spoken gloss · root cousins (`seek → sought / seeker`).

### Improved

- **OCR speed**
  - One full-screen grab per tick (shared across bands).
  - Pixel fingerprint skip when the EN strip has not changed.
  - ~1.0s poll normally; **~0.7s** while paused / Pip open.
  - Worker warm-up on app start.
- **OCR accuracy**
  - Character whitelist includes **space** (fixes words glued into one token).
  - Soft adaptive contrast (hard B/W was killing inter-word gaps).
  - Sticky recovery for glued blobs (`ifisought` → `if i sought`).
  - Content-word chips (filters stop-words like *to / i / one*).
- **Pip panel**
  - Roomier input row; body scrolls when chips/chat grow.
  - Custom dark-gold scrollbar (no default white OS bar).
  - Sticky chips: failed ticks no longer wipe the last good words.

### Fixed

- Region reselect not remounting live stream / effects going black.
- Pip jumping on open/close; coal re-anchored bottom-right with panel growing up-left.
- Words “suddenly disappearing” when a weak OCR tick cleared the list.
- Scroll blocked by `touch-action: none` on the whole panel.
- Opening Pip / pause doing nothing because fingerprint skip blocked re-OCR.

### Notes

- Local-first: sessions & vocab still JSON under app userData.
- API keys stay in the main process only.

---

## [1.0.0] — 2026-07-26

First public open-source release for Windows.

### Added

- Screen-level subtitle region capture (any player / browser).
- Chinese friction mask + freedom levels.
- English assist HUD, one-click vocab, export CSV / Anki text.
- Post-episode write-back drills (AI or offline templates).
- Bilingual UI (EN / 中文), demo mode without video.
- MIT license, README, screenshots, contributor docs.

### Fixed

- UTF-8 corruption that broke Vite / Electron startup (`ai.ts`, `types.ts`).
- Windows Electron restart stability; externalize `koffi`.

---

## Links

- Repo: https://github.com/Galloway0303/rehearse
- Issues: https://github.com/Galloway0303/rehearse/issues

[1.1.0]: https://github.com/Galloway0303/rehearse/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Galloway0303/rehearse/releases/tag/v1.0.0
