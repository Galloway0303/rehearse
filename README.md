# Rehearse

**Watch. Capture. Rehearse.**  
看剧收录，写回台词。

<p align="center">
  <img src="docs/screenshots/overlay.png" alt="Rehearse covering Chinese subtitles while English stays readable" width="900" />
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#privacy">Privacy</a> ·
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%2010%2F11-0078D4?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
  <img alt="Stack" src="https://img.shields.io/badge/stack-Electron%20%7C%20React%20%7C%20TypeScript-black?style=flat-square" />
</p>

**Rehearse** is a Windows desktop app for English learners who watch subtitled video.  
It works at the **screen** level — not locked to YouTube or Netflix DOM plugins — so you can use almost any player or browser window.

1. **Frame** the subtitle region  
2. **Cover Chinese only** so English carries the load  
3. **Click words** to capture them with context  
4. **Write lines back** after the episode with situation-based drills  

---

## Screenshots

| Control panel | Write-back practice |
|---------------|---------------------|
| <img src="docs/screenshots/home.png" alt="Home dashboard" width="420" /> | <img src="docs/screenshots/practice.png" alt="Practice drills" width="420" /> |

---

## Features

| Area | What you get |
|------|----------------|
| **Universal capture** | Region OCR over any window (local player, browser, etc.) |
| **Chinese friction** | Freedom levels + live mask effects (liquid glass, mosaic, shade wave, …) |
| **Keep English native** | Cover only the Chinese strip; original EN subtitles stay on the video |
| **One-click vocab** | Tap a word on the assist HUD; undo; export CSV / Anki text |
| **Post-episode rehearse** | AI or offline template drills: situation, cloze, role, contrast |
| **Local-first** | Sessions & vocab stored as JSON under app userData |
| **Bilingual UI** | English / 中文 |
| **Demo mode** | Full loop with sample lines — no video required |

### Freedom levels

| Level | Name | Intent |
|------:|------|--------|
| 0 | Watch | Pure binge |
| 1 | Light | Soft Chinese |
| 2 | Standard | Delayed / friction on Chinese *(default)* |
| 3 | Strict | Chinese hidden; flash hotkey |
| 4 | Dictation | Subtitles mainly when paused |

---

## Quick start

### Requirements

- **Windows 10 / 11** (x64)
- **Node.js 20+** (for development)
- Optional: [xAI API key](https://console.x.ai) for translation & AI drills

### Develop

```bash
git clone https://github.com/Galloway0303/rehearse.git
cd rehearse
npm install
copy .env.example .env
# optional: put XAI_API_KEY=... in .env
npm run electron:dev
```

If Electron binaries fail to download in some networks:

```bat
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install
```

### Build installers

```bash
npm run dist
```

Outputs NSIS installer + portable build under `release/`.

### First run

1. Complete onboarding **or** use **Demo Mode** from Home  
2. Pick freedom level (**Standard** recommended)  
3. Optionally add an xAI API key in **Settings**  
4. Start episode → capture words → **End episode** → **Practice**

---

## How it works

```text
┌──────────────┐     region OCR      ┌─────────────┐
│ Video player │ ──────────────────► │  Rehearse   │
│ (any window) │                     │  main + UI  │
└──────────────┘                     └──────┬──────┘
       ▲                                    │
       │  mask covers Chinese strip         │ capture words
       │  (exclude-from-capture)            ▼
       │                             ┌─────────────┐
       └─────────────────────────────│ Local store │
                                     │ + optional  │
                                     │ xAI drills  │
                                     └─────────────┘
```

- **OCR**: Tesseract.js on a cropped, contrast-enhanced region  
- **Mask**: Windows `SetWindowDisplayAffinity` so screenshots sample real video under the cover (no flash thrash)  
- **AI**: OpenAI-compatible calls to `https://api.x.ai/v1` from the **main process only**  
- **Fallback**: Offline template exercises if no API key  

---

## Hotkeys

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+F` | Flash Chinese |
| `Ctrl+Shift+S` | Word select mode (2s) |
| `Ctrl+Shift+L` | Cycle freedom level |
| `Ctrl+Shift+E` | End episode |
| `Ctrl+Shift+O` | Toggle OCR |
| `Ctrl+Shift+P` | Pause flag (Dictation) |

---

## Configuration

| Source | Purpose |
|--------|---------|
| **Settings → xAI API** | Base URL, model, API key |
| **`.env`** | `XAI_API_KEY` (never commit) |
| Defaults | `https://api.x.ai/v1` · model `grok-4.5` |

The renderer never receives the raw API key. Leaving the key field blank keeps the previously saved key.

---

## Privacy

- Vocab, sessions, and settings stay in local JSON under the app **userData** folder.  
- Text leaves the machine **only** when you use translation / drill generation with **your** API key.  
- Rehearse does **not** bypass DRM or streaming protections. Use it only with content you are allowed to view.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

---

## Project layout

```text
electron/          Main process (windows, OCR, IPC, AI, store)
src/renderer/      Control panel (React)
src/mask/          Live Chinese cover effects
src/overlay/       Optional English assist HUD
src/region/        Subtitle region picker
src/pet/           Floating word helper
src/shared/        Types, i18n, demo script
docs/              Product notes & screenshots
```

---

## Roadmap / non-goals (v1)

**Included:** region OCR, demo stream, freedom levels, CN cover effects, vocab export, AI/template drills, bilingual UI.

**Not in v1:** Whisper alignment, macOS/Linux, cloud sync, multi-user accounts, DRM circumvention.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). PRs and issues are welcome.

```bash
npm run typecheck
```

---

## License

[MIT](LICENSE) © Rehearse contributors
