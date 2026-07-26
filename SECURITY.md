# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Email or privately message the maintainers with:

- a short description of the issue
- steps to reproduce
- impact (e.g. secret leakage, remote code paths)

We will acknowledge reports as soon as practical and work on a fix before any public disclosure.

## Secrets

- Never commit `.env`, API keys, tokens, or screenshots that show personal content.
- API keys entered in Settings are stored only in the local app userData folder and are **not** sent to the renderer process.
- Rehearse does not upload vocab or subtitles unless you enable AI features with your own key.

## Scope

Rehearse is a local Windows desktop app. It is **not** designed to bypass DRM, streaming protections, or third-party terms of service. Please use it only with content you are allowed to view on your own screen.
