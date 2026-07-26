# Rehearse — Product overview

**Watch. Capture. Rehearse.**  
看剧收录，写回台词。

## Problem

Chinese learners watching dual-language video often read Chinese first. English listening and reading get little training. Typical bilingual plugins are site-locked and stop at lookup — there is no full learning loop.

## Solution

Rehearse is a **Windows** desktop app that:

1. Sees **any** screen region (OCR), not a single website DOM  
2. Makes Chinese **costly** to read (freedom levels + live cover effects) while English stays on the original video  
3. Captures words with **near-zero friction** (click + context)  
4. Forces **output** after the episode — situation-based drills, not only flashcards  

## Freedom levels

| L | Name | Intent |
|---|------|--------|
| 0 | Watch | Pure binge |
| 1 | Light | Soft Chinese |
| 2 | Standard | Friction on Chinese (default) |
| 3 | Strict | Chinese hidden; flash hotkey |
| 4 | Dictation | Subtitles mainly when paused |

## Tech (v1)

Electron · React · TypeScript · local JSON store · Tesseract OCR · optional xAI API (`https://api.x.ai/v1`)

## Out of scope (v1)

Audio alignment / Whisper, mobile, macOS, cloud accounts, DRM circumvention.
