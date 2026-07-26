import fs from 'fs'
import path from 'path'
import os from 'os'
import { app } from 'electron'
import type {
  AppSettings,
  Session,
  VocabItem,
  Exercise,
  ExerciseResult,
  AiSettings,
} from '../src/shared/types'
import { DEFAULT_SETTINGS, XAI_BASE_URL, XAI_DEFAULT_MODEL } from '../src/shared/types'

/** Prefer xAI. Migrate empty / DeepSeek scaffold defaults. */
function normalizeAi(ai: AiSettings): AiSettings {
  const isDeepseekScaffold =
    !ai.baseUrl ||
    ai.baseUrl.includes('deepseek.com') ||
    ai.model === 'deepseek-chat'
  return {
    baseUrl: isDeepseekScaffold ? XAI_BASE_URL : ai.baseUrl || XAI_BASE_URL,
    model:
      isDeepseekScaffold || !ai.model || ai.model === 'deepseek-chat'
        ? XAI_DEFAULT_MODEL
        : ai.model,
    apiKey: ai.apiKey || '',
  }
}

export interface DbShape {
  settings: AppSettings
  sessions: Session[]
  vocab: VocabItem[]
  lastExercises: Exercise[]
  lastResults: ExerciseResult[]
  lastSettleSessionId: string | null
}

function dbPath() {
  return path.join(app.getPath('userData'), 'rehearse-db.json')
}

function emptyDb(): DbShape {
  return {
    settings: { ...DEFAULT_SETTINGS, ai: { ...DEFAULT_SETTINGS.ai }, ocr: { ...DEFAULT_SETTINGS.ocr } },
    sessions: [],
    vocab: [],
    lastExercises: [],
    lastResults: [],
    lastSettleSessionId: null,
  }
}

export function loadDb(): DbShape {
  try {
    const p = dbPath()
    if (!fs.existsSync(p)) return emptyDb()
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as Partial<DbShape>
    const base = emptyDb()
    return {
      ...base,
      ...raw,
      settings: {
        ...base.settings,
        ...(raw.settings ?? {}),
        ai: normalizeAi({ ...base.settings.ai, ...(raw.settings?.ai ?? {}) }),
        ocr: { ...base.settings.ocr, ...(raw.settings?.ocr ?? {}) },
        maskCnSide: raw.settings?.maskCnSide || base.settings.maskCnSide,
        maskCoverRatio:
          typeof raw.settings?.maskCoverRatio === 'number'
            ? raw.settings.maskCoverRatio
            : typeof raw.settings?.maskCoverFrom === 'number'
              ? Math.max(0.3, 1 - (raw.settings.maskCoverFrom || 0))
              : base.settings.maskCoverRatio,
        maskEffect:
          (raw.settings?.maskEffect as typeof base.settings.maskEffect) ||
          base.settings.maskEffect ||
          'mosaic',
      },
      sessions: raw.sessions ?? [],
      vocab: raw.vocab ?? [],
      lastExercises: raw.lastExercises ?? [],
      lastResults: raw.lastResults ?? [],
      lastSettleSessionId: raw.lastSettleSessionId ?? null,
    }
  } catch {
    return emptyDb()
  }
}

export function saveDb(db: DbShape) {
  const p = dbPath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(db, null, 2), 'utf-8')
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const db = loadDb()
  db.settings = {
    ...db.settings,
    ...partial,
    ai: normalizeAi({ ...db.settings.ai, ...(partial.ai ?? {}) }),
    ocr: { ...db.settings.ocr, ...(partial.ocr ?? {}) },
  }
  saveDb(db)
  return db.settings
}

/**
 * Settings snapshot for renderer / IPC return values.
 * Never includes the real API key (secret stays in main process only).
 */
export function settingsForRenderer(): AppSettings {
  const s = loadDb().settings
  return {
    ...s,
    ai: {
      ...s.ai,
      apiKey: '',
    },
  }
}

/**
 * Merge settings from the UI. Empty apiKey means "keep existing" so the
 * renderer never needs the secret to re-save other fields.
 */
export function mergeSettingsFromRenderer(partial: Partial<AppSettings>): AppSettings {
  const db = loadDb()
  const next: Partial<AppSettings> = { ...partial }
  if (partial.ai) {
    const key = (partial.ai.apiKey || '').trim()
    next.ai = {
      ...partial.ai,
      apiKey: key || db.settings.ai.apiKey || '',
    }
  }
  return updateSettings(next)
}

export function hasAiCredentials(ai: AiSettings): boolean {
  if ((ai.apiKey || process.env.XAI_API_KEY || '').trim()) return true
  try {
    const authPath = path.join(os.homedir(), '.grok', 'auth.json')
    if (!fs.existsSync(authPath)) return false
    const raw = JSON.parse(fs.readFileSync(authPath, 'utf-8')) as Record<string, { key?: string }>
    return Object.values(raw || {}).some((e) => Boolean(e?.key?.trim()))
  } catch {
    return false
  }
}

export function upsertSession(session: Session) {
  const db = loadDb()
  const i = db.sessions.findIndex((s) => s.id === session.id)
  if (i >= 0) db.sessions[i] = session
  else db.sessions.unshift(session)
  saveDb(db)
}

export function addVocab(item: VocabItem) {
  const db = loadDb()
  db.vocab.unshift(item)
  const s = db.sessions.find((x) => x.id === item.sessionId)
  if (s && !s.wordIds.includes(item.id)) {
    s.wordIds.push(item.id)
  }
  saveDb(db)
}

export function removeVocab(id: string) {
  const db = loadDb()
  db.vocab = db.vocab.filter((v) => v.id !== id)
  for (const s of db.sessions) {
    s.wordIds = s.wordIds.filter((w) => w !== id)
  }
  saveDb(db)
}

export function patchVocab(id: string, patch: Partial<VocabItem>) {
  const db = loadDb()
  const v = db.vocab.find((x) => x.id === id)
  if (!v) return null
  Object.assign(v, patch)
  saveDb(db)
  return v
}

export function clearAll() {
  saveDb(emptyDb())
}

export function savePractice(sessionId: string, exercises: Exercise[], results: ExerciseResult[]) {
  const db = loadDb()
  db.lastSettleSessionId = sessionId
  db.lastExercises = exercises
  db.lastResults = results
  saveDb(db)
}
