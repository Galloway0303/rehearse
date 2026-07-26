import { net } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { randomUUID } from 'crypto'
import type { AiSettings, Exercise, ExerciseType, VocabItem } from '../src/shared/types'
import { XAI_BASE_URL, XAI_DEFAULT_MODEL } from '../src/shared/types'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

let cachedGrokToken: { token: string; mtimeMs: number; path: string } | null = null

/** Optional: reuse local Grok CLI auth token from ~/.grok/auth.json when present. */
export function readGrokBuildToken(): string {
  const authPath = path.join(os.homedir(), '.grok', 'auth.json')
  try {
    if (!fs.existsSync(authPath)) return ''
    const st = fs.statSync(authPath)
    if (cachedGrokToken && cachedGrokToken.path === authPath && cachedGrokToken.mtimeMs === st.mtimeMs) {
      return cachedGrokToken.token
    }
    const raw = JSON.parse(fs.readFileSync(authPath, 'utf-8')) as Record<
      string,
      { key?: string; expires_at?: string }
    >
    let best = ''
    let bestExp = 0
    for (const entry of Object.values(raw || {})) {
      const key = (entry?.key || '').trim()
      if (!key) continue
      const exp = entry.expires_at ? Date.parse(entry.expires_at) : Date.now() + 1
      if (exp < Date.now() - 60_000) continue
      if (exp >= bestExp) {
        bestExp = exp
        best = key
      }
    }
    // if all look expired, still try newest key (refresh may still work server-side)
    if (!best) {
      for (const entry of Object.values(raw || {})) {
        const key = (entry?.key || '').trim()
        if (key) best = key
      }
    }
    cachedGrokToken = { token: best, mtimeMs: st.mtimeMs, path: authPath }
    return best
  } catch {
    return ''
  }
}

/**
 * xAI credentials resolution order:
 * 1) settings.ai.apiKey
 * 2) process.env.XAI_API_KEY
 * 3) optional local Grok CLI auth (~/.grok/auth.json)
 */
export function resolveAiSettings(ai: AiSettings): AiSettings {
  const envKey = (process.env.XAI_API_KEY || '').trim()
  const grokKey = readGrokBuildToken()
  return {
    baseUrl: (ai.baseUrl || XAI_BASE_URL).replace(/\/$/, '') || XAI_BASE_URL,
    model: ai.model || XAI_DEFAULT_MODEL,
    apiKey: (ai.apiKey || envKey || grokKey).trim(),
  }
}

export function aiSource(ai: AiSettings): 'settings' | 'env' | 'grok-build' | 'none' {
  if ((ai.apiKey || '').trim()) return 'settings'
  if ((process.env.XAI_API_KEY || '').trim()) return 'env'
  if (readGrokBuildToken()) return 'grok-build'
  return 'none'
}

/** Electron net (Chromium) — works when Node fetch/https hits network black holes. */
function electronPostJson(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    try {
      const request = net.request({ method: 'POST', url })
      for (const [k, v] of Object.entries(headers)) request.setHeader(k, v)
      let status = 0
      const chunks: Buffer[] = []
      request.on('response', (response) => {
        status = response.statusCode || 0
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        response.on('end', () => {
          resolve({ status, text: Buffer.concat(chunks).toString('utf8') })
        })
        response.on('error', reject)
      })
      request.on('error', reject)
      request.write(body)
      request.end()
    } catch (e) {
      reject(e)
    }
  })
}

async function chat(ai: AiSettings, messages: ChatMessage[], temperature = 0.4): Promise<string> {
  const cfg = resolveAiSettings(ai)
  if (!cfg.apiKey) throw new Error('No xAI credential (Settings / XAI_API_KEY)')

  const base = cfg.baseUrl.replace(/\/$/, '')
  const url = `${base}/chat/completions`
  const body = JSON.stringify({
    model: cfg.model,
    temperature,
    messages,
  })

  const { status, text } = await electronPostJson(
    url,
    {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body,
  )

  if (status < 200 || status >= 300) {
    throw new Error(`xAI ${status}: ${text.slice(0, 240)}`)
  }

  const data = JSON.parse(text) as {
    choices?: { message?: { content?: string } }[]
  }
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}

export async function testAi(ai: AiSettings): Promise<{ ok: boolean; message: string }> {
  const cfg = resolveAiSettings(ai)
  const src = aiSource(ai)
  if (!cfg.apiKey) {
    return {
      ok: false,
      message: 'No credential — set an API key in Settings or XAI_API_KEY',
    }
  }
  try {
    const out = await chat(cfg, [{ role: 'user', content: 'Reply with exactly: OK' }], 0)
    return {
      ok: true,
      message: `xAI OK · ${cfg.model} · via ${src} · ${out.slice(0, 40) || 'OK'}`,
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

export async function translateEnToZh(ai: AiSettings, text: string): Promise<string> {
  const cfg = resolveAiSettings(ai)
  if (!cfg.apiKey || !text.trim()) return ''
  const out = await chat(
    cfg,
    [
      {
        role: 'system',
        content: 'Translate English dialogue to concise Simplified Chinese. Output only the translation.',
      },
      { role: 'user', content: text },
    ],
    0.2,
  )
  return out.replace(/^["']|["']$/g, '')
}

/** Pet chat: word meaning for Chinese learners */
export async function explainWord(
  ai: AiSettings,
  word: string,
  contextEn?: string,
): Promise<string> {
  const cfg = resolveAiSettings(ai)
  const w = word.trim()
  if (!w) return ''
  if (!cfg.apiKey) {
    // offline tiny fallback
    return `銆?{w}銆嶏細璇烽厤缃?AI 鍚庢煡鐪嬮噴涔夈€?{contextEn ? `\n璇锛?{contextEn}` : ''}`
  }
  try {
    return await chat(
      cfg,
      [
        {
          role: 'system',
          content:
            '浣犳槸 Rehearse 閲岀殑娲绘臣瀹犵墿鐙愩€孭ip銆嶃€傜敤绠€鐭腑鏂囪В閲婅嫳鏂囪瘝锛?)璇嶆€?鎰忔€?2)涓€鍙ヤ汉璇?3)鍙€夋惌閰嶃€傛€婚暱鈮?0瀛椼€傝姘旇交蹇紝鍍忔湅鍙嬭创鑰宠锛屼笉瑕佹竻鍗曞紡闀挎枃銆?,
        },
        {
          role: 'user',
          content: contextEn
            ? `鍗曡瘝锛?{w}\n鍓т腑鍙ュ瓙锛?{contextEn}`
            : `鍗曡瘝锛?{w}`,
        },
      ],
      0.4,
    )
  } catch {
    return `銆?{w}銆嶆殏鏃舵煡涓嶅埌锛岀◢鍚庡啀璇曪綖`
  }
}

function normalizeWord(s: string) {
  return s.trim().toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, '')
}

export function buildFallbackExercises(
  words: VocabItem[],
  subtitleText: string,
  limit = 8,
): Exercise[] {
  const pool =
    words.length > 0
      ? words.filter((w) => w.kind === 'word').slice(0, limit)
      : extractWordsFromScript(subtitleText)
          .slice(0, limit)
          .map(
            (word, i) =>
              ({
                id: `tmp-${i}`,
                word,
                status: 'new',
                sessionId: '',
                contextEn: findSentence(subtitleText, word),
                contextZh: '',
                timestamp: Date.now(),
                createdAt: Date.now(),
                reviewCount: 0,
                correctCount: 0,
                wrongCount: 0,
                kind: 'word',
              }) as VocabItem,
          )

  const types: ExerciseType[] = ['situation', 'cloze', 'ban_literal', 'role', 'contrast']

  return pool.map((w, i) => {
    const type = types[i % types.length]
    const sentence = w.contextEn || findSentence(subtitleText, w.word)
    const blanked = sentence.replace(new RegExp(w.word, 'ig'), '____')
    const base = {
      id: randomUUID(),
      answer: w.word,
      acceptAlternatives: [w.word, normalizeWord(w.word)].filter(Boolean),
      revealSentence: sentence,
      targetWord: w.word,
      hint: w.word.slice(0, 1) + '_'.repeat(Math.max(0, w.word.length - 1)),
    }

    if (type === 'situation') {
      return {
        ...base,
        type,
        promptEn: `In this scene, someone faces this moment: 鈥?{truncate(sentence, 90)}鈥? Which word fits the attitude or key idea they express?`,
        promptZh: `杩欎竴骞曢噷锛屼汉鐗╅潰瀵癸細鈥?{truncate(sentence, 60)}鈥濄€備粬浠〃杈剧殑鎬佸害/鍏抽敭鐐癸紝璇ョ敤鍝釜璇嶏紵`,
        why: 'Recalling the word from story detail beats memorizing a glossary row.',
      }
    }
    if (type === 'cloze') {
      return {
        ...base,
        type,
        promptEn: `Fill the missing word from the line:\n${blanked}`,
        promptZh: `鏍规嵁鍓т腑鍙拌瘝濉┖锛歕n${blanked}`,
        why: 'Exact line retrieval strengthens form + context together.',
      }
    }
    if (type === 'ban_literal') {
      return {
        ...base,
        type,
        promptEn: `Describe this beat in English using the episode鈥檚 preferred word (not a simpler synonym):\n${sentence}`,
        promptZh: `鐢ㄦ湰闆嗘洿璐村垏鐨勯偅涓瘝琛ㄨ揪杩欎竴鎯呰妭锛堜笉瑕佺敤鏇寸畝鍗曠殑杩戜箟璇嶏級锛歕n${w.contextZh || sentence}`,
        why: 'Forces output of the specific lexical choice, not generic paraphrase.',
      }
    }
    if (type === 'role') {
      return {
        ...base,
        type,
        promptEn: `You are the speaker of this line. Under the same pressure, which word do you reach for?\nContext: ${truncate(sentence, 100)}`,
        promptZh: `浣犳槸杩欏彞鍙拌瘝鐨勮璇濅汉銆傚悓鏍峰帇鍔涗笅锛屼綘浼氳劚鍙ｈ€屽嚭鍝釜璇嶏紵\n璇锛?{truncate(sentence, 80)}`,
        why: 'Role framing mimics how kids are taught words: situation 鈫?word.',
      }
    }
    return {
      ...base,
      type: 'contrast' as const,
      promptEn: `Why might the script prefer 鈥?{w.word}鈥?here rather than a blander near-synonym?\n${sentence}\nType the preferred word.`,
      promptZh: `涓轰綍杩欓噷鏇村彲鑳界敤 鈥?{w.word}鈥?鑰屼笉鏄洿骞崇殑杩戜箟璇存硶锛焅n${sentence}\n璇峰啓鍑鸿璇嶃€俙,
      why: 'Near-synonym contrast builds precision, not just recognition.',
    }
  })
}

function extractWordsFromScript(text: string): string[] {
  const words = text
    .split(/\s+/)
    .map(normalizeWord)
    .filter((w) => w.length >= 5)
  const freq = new Map<string, number>()
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1)
  const stop = new Set([
    'about',
    'there',
    'their',
    'would',
    'could',
    'should',
    'which',
    'where',
    'every',
    'after',
    'before',
    'because',
    'through',
    'still',
    'being',
    'those',
    'these',
    'other',
    'something',
    'nothing',
  ])
  return [...freq.entries()]
    .filter(([w]) => !stop.has(w))
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .slice(0, 12)
}

function findSentence(text: string, word: string): string {
  const parts = text.split(/(?<=[.!?])\s+|\n+/)
  const hit = parts.find((p) => new RegExp(`\\b${escapeReg(word)}\\b`, 'i').test(p))
  return (
    hit?.trim() ||
    text.split('\n').find((l) => l.toLowerCase().includes(word.toLowerCase())) ||
    word
  )
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1) + '鈥?
}

export async function generateExercises(
  ai: AiSettings,
  opts: {
    title: string
    subtitleText: string
    words: VocabItem[]
  },
): Promise<{ exercises: Exercise[]; source: 'ai' | 'fallback' }> {
  const cfg = resolveAiSettings(ai)
  const fallback = () => ({
    exercises: buildFallbackExercises(opts.words, opts.subtitleText),
    source: 'fallback' as const,
  })

  if (!cfg.apiKey) return fallback()

  const wordPayload = opts.words.slice(0, 12).map((w) => ({
    word: w.word,
    context: w.contextEn,
    zh: w.contextZh,
  }))

  const system = `You are Rehearse, an English learning coach for Chinese speakers.

Create output-first vocabulary drills from an episode script.
Return STRICT JSON only: {"exercises":[...]}
Each exercise:
{
  "type": "situation"|"cloze"|"ban_literal"|"role"|"contrast",
  "prompt_en": string,
  "prompt_zh": string,
  "answer": string,
  "accept_alternatives": string[],
  "reveal_sentence": string,
  "why": string,
  "hint": string,
  "target_word": string
}
Rules:
- 5 to 10 exercises max.
- Prefer words the learner marked unknown.
- Lead with story detail / situation, then ask for the word (like teaching a child).
- prompts bilingual; answer is the English target word.
- No markdown fences.`

  const user = JSON.stringify({
    episode_title: opts.title,
    subtitle_full_text: opts.subtitleText.slice(0, 12000),
    unknown_words: wordPayload,
  })

  try {
    const raw = await chat(
      cfg,
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      0.5,
    )
    const jsonText = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
    const parsed = JSON.parse(jsonText) as {
      exercises?: Array<{
        type: ExerciseType
        prompt_en: string
        prompt_zh: string
        answer: string
        accept_alternatives?: string[]
        reveal_sentence: string
        why: string
        hint?: string
        target_word?: string
      }>
    }
    const exercises: Exercise[] = (parsed.exercises ?? []).map((e) => ({
      id: randomUUID(),
      type: e.type,
      promptEn: e.prompt_en,
      promptZh: e.prompt_zh,
      answer: e.answer,
      acceptAlternatives: e.accept_alternatives ?? [e.answer],
      revealSentence: e.reveal_sentence,
      why: e.why,
      hint: e.hint,
      targetWord: e.target_word ?? e.answer,
    }))
    if (!exercises.length) return fallback()
    return { exercises, source: 'ai' }
  } catch {
    return fallback()
  }
}

export function gradeAnswer(exercise: Exercise, userAnswer: string): boolean {
  const a = normalizeWord(userAnswer)
  if (!a) return false
  const candidates = [exercise.answer, ...(exercise.acceptAlternatives ?? []), exercise.targetWord]
    .map(normalizeWord)
    .filter(Boolean)
  return candidates.includes(a)
}

