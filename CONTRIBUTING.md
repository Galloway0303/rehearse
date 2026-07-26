# Contributing

Thanks for helping improve Rehearse.

## Development setup (Windows)

```bash
git clone https://github.com/Galloway0303/rehearse.git
cd rehearse
npm install
copy .env.example .env   # optional: add XAI_API_KEY
npm run electron:dev
```

If Electron fails to download in some networks:

```bat
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install
```

## Project layout

| Path | Role |
|------|------|
| `electron/` | Main process: windows, OCR, IPC, AI, local store |
| `src/renderer/` | Control panel (React) |
| `src/mask/` | Live Chinese cover effects |
| `src/overlay/` | Optional English assist HUD |
| `src/shared/` | Types, i18n, demo script |

## Guidelines

- Keep learning data **local by default**.
- Do not log or return API keys from the main process to the UI.
- Prefer small, focused pull requests with a clear description.
- Run `npm run typecheck` before submitting when possible.
- UI strings: update both `en` and `zh` in `src/shared/i18n.ts`.

## Pull requests

1. Fork and create a branch.
2. Describe the user-facing change and any platform assumptions (Windows-only APIs are OK when noted).
3. Link related issues if any.

## Code of conduct

Be respectful. Assume good intent. No harassment or spam.
