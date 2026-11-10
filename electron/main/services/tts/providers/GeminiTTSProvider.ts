/**
 * GeminiTTSProvider — Google Gemini text-to-speech via the installed
 * `@google/genai` SDK.
 *
 * ## Which API is used
 *
 * Two request shapes exist for Gemini TTS, and which one a model accepts has
 * changed twice during the preview period:
 *
 * 1. **`generateContent`** — `config.responseModalities: [Modality.AUDIO]` plus
 *    `config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`. This is
 *    the shape the TTS preview models (`gemini-2.5-flash-preview-tts`,
 *    `gemini-2.5-pro-preview-tts`, `gemini-3.1-flash-tts-preview`) are served
 *    by, and the one Ultron tries first for those models.
 * 2. **Interactions** — `client.interactions.create()` with a `user_input`
 *    content wrapper. Used by the Gemini 3.8 TTS models.
 *
 * The model catalogue records which shape each model prefers
 * (`GeminiTTSModel.api`). If Google rejects the preferred shape with a
 * model/API mismatch, the provider retries once with the other shape and logs
 * both raw errors, so a future API shuffle degrades to "still speaks" instead
 * of "silently broken". Nothing is swapped behind the user's back: every
 * fallback is logged, and the failing payload is never mangled to fit.
 *
 * ## Audio
 *
 * Unary TTS returns 16-bit PCM. Gemini 3.8 models wrap it in WAV; preview
 * models return headerless `audio/L16;codec=pcm;rate=24000`. Both are handled:
 * headerless payloads get a real RIFF header at the rate the response reports
 * (see `utils/wav.ts`), so the renderer always receives a correctly labelled
 * container instead of noise.
 */

import { GoogleGenAI, Modality } from '@google/genai'
import { BaseTTSProvider, type TTSAudioFormat } from './BaseTTSProvider'
import { createLogger } from '@electron/utils/logger'
import { ensureWav, isWav, type PcmFormat } from '@electron/utils/wav'
import { formatTTSError } from '@electron/utils/ttsErrors'
import {
  DEFAULT_GEMINI_TTS_MODEL,
  DEFAULT_GEMINI_TTS_VOICE,
  GEMINI_MODEL_FALLBACKS,
  getGeminiModelApi,
} from '../geminiCatalog'

const log = createLogger('GeminiTTSProvider')

/** Options accepted by {@link GeminiTTSProvider} */
export interface GeminiTTSOptions {
  apiKey: string
  model?: string
  voice?: string
}

/** One audio block extracted from a Gemini response */
export interface GeminiAudioBlock {
  /** Base64-encoded audio payload */
  data: string
  /** MIME type reported by the API, when present */
  mimeType?: string
  /** Sample rate reported by the API, when present */
  sampleRate?: number
  /** Channel count reported by the API, when present */
  channels?: number
}

/** Request shape used for a given model */
export type GeminiTtsApi = 'generateContent' | 'interactions'

const WAV_MIME = 'audio/wav'
const PCM_MIMES = new Set(['audio/l16', 'audio/pcm', 'audio/pcm;rate=24000'])

/**
 * Parse `audio/L16;codec=pcm;rate=24000` style MIME types.
 *
 * @returns The base type (`audio/l16`) and any `rate` parameter
 */
export function parseAudioMime(mimeType: string | undefined): { base: string; rate?: number } {
  if (!mimeType) return { base: '' }

  const [rawBase, ...params] = mimeType.toLowerCase().split(';')
  const base = rawBase.trim()

  let rate: number | undefined
  for (const param of params) {
    const [key, value] = param.split('=').map((s) => s.trim())
    if (key === 'rate' && value) {
      const parsed = Number.parseInt(value, 10)
      if (Number.isFinite(parsed) && parsed > 0) rate = parsed
    }
  }

  return { base, rate }
}

/**
 * Build a `generateContent` request for a single-speaker utterance.
 *
 * Pure function so the payload shape can be unit-tested without a network call.
 */
export function buildGenerateContentParams(text: string, model: string, voice: string) {
  return {
    model,
    contents: [{ role: 'user', parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  }
}

/**
 * Build an Interactions request for a single-speaker utterance.
 *
 * The documented input shape nests text inside a `user_input` content block.
 * An earlier revision sent `{ type: 'text', text }` directly, which Google
 * rejected with a 400 — that mismatch is why this wrapper is explicit.
 */
export function buildInteractionParams(text: string, model: string, voice: string) {
  return {
    model,
    input: [
      {
        type: 'user_input',
        content: [{ type: 'text', text }],
      },
    ],
    response_format: { type: 'audio', mime_type: WAV_MIME },
    generation_config: {
      speech_config: [{ voice }],
    },
  }
}

/**
 * Pull the first audio block out of a `generateContent` response.
 *
 * Audio arrives as `candidates[].content.parts[].inlineData` (camelCase from the
 * SDK, `inline_data` over REST).
 */
export function extractInlineAudio(response: unknown): GeminiAudioBlock | null {
  const record = response as Record<string, unknown> | null
  if (!record) return null

  const candidates = Array.isArray(record.candidates) ? record.candidates : []
  for (const candidate of candidates) {
    const parts = (candidate as Record<string, unknown>)?.content as Record<string, unknown> | undefined
    const partList = Array.isArray(parts?.parts) ? (parts.parts as unknown[]) : []

    for (const part of partList) {
      const p = part as Record<string, unknown>
      const inline = (p.inlineData ?? p.inline_data) as Record<string, unknown> | undefined
      if (!inline) continue

      const data = typeof inline.data === 'string' ? inline.data : ''
      if (!data) continue

      const mimeType = (inline.mimeType ?? inline.mime_type) as string | undefined
      return {
        data,
        mimeType,
        sampleRate: parseAudioMime(mimeType).rate,
      }
    }
  }

  return null
}

/**
 * Pull the first audio block out of an Interactions response.
 *
 * Three shapes are accepted, in order of likelihood:
 * - SDK convenience accessor `interaction.output_audio.data` (documented)
 * - `outputs[]` content blocks
 * - raw REST `steps[].content[]` blocks
 */
export function extractAudioBlock(interaction: unknown): GeminiAudioBlock | null {
  const record = interaction as Record<string, unknown> | null
  if (!record) return null

  const asBlock = (item: unknown): GeminiAudioBlock | null => {
    if (!item || typeof item !== 'object') return null
    const block = item as Record<string, unknown>
    if (block.type !== 'audio') return null
    if (typeof block.data !== 'string' || block.data.length === 0) return null

    const mimeType = typeof block.mime_type === 'string'
      ? block.mime_type
      : typeof block.mimeType === 'string' ? block.mimeType : undefined

    return {
      data: block.data,
      mimeType,
      sampleRate: typeof block.sample_rate === 'number'
        ? block.sample_rate
        : typeof block.sampleRate === 'number'
          ? block.sampleRate
          : parseAudioMime(mimeType).rate,
      channels: typeof block.channels === 'number' ? block.channels : undefined,
    }
  }

  // Shape 0 — SDK accessor: interaction.output_audio
  const outputAudio = record.output_audio ?? record.outputAudio
  if (outputAudio && typeof outputAudio === 'object') {
    const wrapper = outputAudio as Record<string, unknown>
    if (typeof wrapper.data === 'string' && wrapper.data.length > 0) {
      const mimeType = (wrapper.mime_type ?? wrapper.mimeType) as string | undefined
      return {
        data: wrapper.data,
        mimeType,
        sampleRate: parseAudioMime(mimeType).rate,
      }
    }
  }

  // Shape A — SDK: interaction.outputs[]
  if (Array.isArray(record.outputs)) {
    for (const item of record.outputs) {
      const block = asBlock(item)
      if (block) return block
    }
  }

  // Shape B — raw REST: interaction.steps[].content[]
  if (Array.isArray(record.steps)) {
    for (const step of record.steps) {
      const content = (step as Record<string, unknown>)?.content
      if (!Array.isArray(content)) continue
      for (const item of content) {
        const block = asBlock(item)
        if (block) return block
      }
    }
  }

  return null
}

/**
 * Convert an API audio block into a playable WAV buffer.
 *
 * - Payloads already carrying a RIFF header are passed through untouched.
 * - Headerless PCM (`audio/l16`, `audio/pcm`, rate in the MIME params) is
 *   wrapped at the reported sample rate.
 *
 * @throws When the API returns a format this provider cannot label honestly
 */
export function normalizeAudio(block: GeminiAudioBlock): Buffer {
  const raw = Buffer.from(block.data, 'base64')
  if (raw.length === 0) throw new Error('Gemini returned an empty audio response.')

  const { base, rate } = parseAudioMime(block.mimeType)

  const format: Partial<PcmFormat> = {
    sampleRate: block.sampleRate ?? rate ?? 24_000,
    channels: block.channels ?? 1,
    bitsPerSample: 16,
  }

  if (isWav(raw)) return raw
  if (base === '' || base === WAV_MIME || PCM_MIMES.has(base)) return ensureWav(raw, format)

  if (base.startsWith('audio/')) {
    throw new Error(
      `Gemini returned an unsupported audio format (${block.mimeType}). ` +
      'Ultron plays WAV/PCM output from Gemini TTS — pick another model in Settings → Voice.',
    )
  }

  log.warn(`Unknown audio MIME "${block.mimeType ?? ''}" — assuming 24 kHz mono 16-bit PCM`)
  return ensureWav(raw, format)
}

/** True when an error means "this model does not speak that API" */
function isApiMismatchError(err: unknown): boolean {
  const text = collectStrings(err)
  return (
    text.includes('interactions') ||
    text.includes('not supported') ||
    text.includes('unsupported') ||
    text.includes('not found') ||
    text.includes('is not found') ||
    text.includes('404') ||
    text.includes('does not support')
  )
}

/** True when an error means "this model id does not exist" */
function isModelNotFoundError(err: unknown): boolean {
  const text = collectStrings(err)
  return text.includes('not found') || text.includes('404') || text.includes('does not exist')
}

/** Flatten every string inside an SDK error for keyword checks */
function collectStrings(value: unknown, depth = 0): string {
  if (depth > 3 || value == null) return ''
  if (typeof value === 'string') return value.toLowerCase()
  if (value instanceof Error) {
    const extra = (value as unknown as Record<string, unknown>)
    return `${value.message} ${JSON.stringify(extra.body ?? '')} ${JSON.stringify(extra.response ?? '')}`.toLowerCase()
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((v) => collectStrings(v, depth + 1))
      .join(' ')
  }
  return ''
}

/**
 * Print the raw Google failure to the terminal log.
 *
 * The UI shows a mapped message, but troubleshooting needs the untouched
 * payload: status, `error.status`, `error.message` and any `details`.
 */
export function logRawGeminiError(context: string, err: unknown): void {
  const errObj = (err ?? {}) as Record<string, unknown>
  const status = errObj.status ?? errObj.statusCode ?? errObj.code
  const response = errObj.response as Record<string, unknown> | undefined
  const body = (errObj.body ?? response?.data ?? response) as Record<string, unknown> | undefined
  const bodyError = body?.error as Record<string, unknown> | undefined

  const rawMessage =
    (typeof bodyError?.message === 'string' && bodyError.message) ||
    (typeof body?.message === 'string' && body.message) ||
    (err instanceof Error ? err.message : String(err))

  const rawStatus = bodyError?.status ?? body?.status

  log.error(`[Gemini TTS] ${context} failed`)
  log.error(`  HTTP status : ${status ?? 'unknown'}`)
  log.error(`  API status  : ${rawStatus ?? 'unknown'}`)
  log.error(`  message     : ${rawMessage}`)

  if (bodyError?.details) {
    try {
      log.error(`  details     : ${JSON.stringify(bodyError.details)}`)
    } catch {
      log.error('  details     : <unserialisable>')
    }
  }

  if (err instanceof Error && err.stack) {
    log.debug(`  stack       : ${err.stack.split('\n').slice(0, 4).join('\n')}`)
  }
}

/**
 * The model ids to try, in order: the requested model first, then documented
 * fallbacks only when the requested id does not exist (models get retired).
 */
export function resolveModelChain(model: string): string[] {
  const chain = [model]
  for (const fallback of GEMINI_MODEL_FALLBACKS) {
    if (chain.length >= 3) break
    if (!chain.includes(fallback)) chain.push(fallback)
  }
  return chain
}

export class GeminiTTSProvider extends BaseTTSProvider {
  readonly name = 'gemini'

  /** Gemini TTS always produces a WAV container (PCM is wrapped on arrival) */
  readonly audioFormat: TTSAudioFormat = 'wav'

  private client: GoogleGenAI
  private model: string
  private voice: string

  constructor(options: GeminiTTSOptions) {
    super()

    if (!options.apiKey) {
      throw new Error('Gemini TTS requires an API key.')
    }

    this.client = new GoogleGenAI({ apiKey: options.apiKey })
    this.model = options.model?.trim() || DEFAULT_GEMINI_TTS_MODEL
    this.voice = options.voice?.trim() || DEFAULT_GEMINI_TTS_VOICE

    log.info(`Initialized (model: ${this.model}, voice: ${this.voice}, api: ${getGeminiModelApi(this.model)})`)
  }

  /**
   * Synthesize the complete utterance.
   *
   * @param text — text to speak
   * @param signal — optional cancellation signal
   * @returns Playable WAV audio
   */
  async synthesize(text: string, signal?: AbortSignal): Promise<Buffer> {
    const trimmed = text.trim()
    if (!trimmed) return Buffer.alloc(0)

    if (trimmed.length > 2_000) {
      log.warn(`Long TTS input (${trimmed.length} chars) — Gemini may truncate or time out`)
    }

    const startedAt = Date.now()
    const errors: string[] = []
    let lastErr: unknown = null

    for (const model of resolveModelChain(this.model)) {
      const preferred = getGeminiModelApi(model)
      const secondary: GeminiTtsApi = preferred === 'generateContent' ? 'interactions' : 'generateContent'

      for (const api of [preferred, secondary]) {
        try {
          const block = api === 'generateContent'
            ? await this.callGenerateContent(trimmed, model, signal)
            : await this.callInteractions(trimmed, model, signal)

          if (!block) {
            errors.push(`${model}/${api}: response contained no audio`)
            log.warn(`${model}/${api} returned no audio block`)
            continue
          }

          const audio = normalizeAudio(block)
          log.debug(`synthesize() ${audio.length} bytes in ${Date.now() - startedAt}ms (${model} via ${api})`)
          return audio
        } catch (err) {
          if (signal?.aborted) {
            log.debug('synthesize() aborted')
            return Buffer.alloc(0)
          }

          lastErr = err
          logRawGeminiError(`${model} via ${api}`, err)
          errors.push(`${model}/${api}: ${errorText(err)}`)

          // A missing model id: try the next model, not the other API.
          if (isModelNotFoundError(err) && api === preferred) break

          // Anything else: try the other request shape for this model once.
          if (api === secondary) break
          if (!isApiMismatchError(err)) {
            log.debug('Not an API-shape error — not retrying the other endpoint')
            break
          }
          log.warn(`Retrying ${model} with the ${secondary} API`)
        }
      }
    }

    // Every attempt failed — surface the raw reason, not a generic rejection.
    const summary = errors.join(' | ') || 'no response'
    log.error(`[Gemini TTS] all attempts failed: ${summary}`)
    throw new Error(`${formatTTSError(lastErr, 'gemini')} [${summary}]`)
  }

  /** `generateContent` + `responseModalities: [AUDIO]` */
  private async callGenerateContent(
    text: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<GeminiAudioBlock | null> {
    const params = buildGenerateContentParams(text, model, this.voice)

    // `generateContent` takes a single params object; cancellation travels in
    // `config.abortSignal` rather than as a second argument.
    const withSignal = signal
      ? { ...params, config: { ...params.config, abortSignal: signal } }
      : params

    const response = await this.client.models.generateContent(withSignal as never)
    return extractInlineAudio(response)
  }

  /** Interactions API with the documented `user_input` wrapper */
  private async callInteractions(
    text: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<GeminiAudioBlock | null> {
    const params = buildInteractionParams(text, model, this.voice)
    const interaction = await this.client.interactions.create(
      params as never,
      signal ? { signal } : undefined,
    )
    return extractAudioBlock(interaction)
  }

  /**
   * Buffered "stream": Gemini returns one complete utterance, so the finished
   * buffer is yielded as a single chunk. No fake progressive playback.
   */
  async *streamSpeech(text: string, signal?: AbortSignal): AsyncGenerator<Buffer> {
    const audio = await this.synthesize(text, signal)
    if (audio.length === 0) return

    yield audio
    log.debug('streamSpeech() yielded complete buffer')
  }
}

/** Extract a readable message from an arbitrary thrown value */
function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
