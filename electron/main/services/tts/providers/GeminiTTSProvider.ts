/**
 * GeminiTTSProvider — Google Gemini text-to-speech via the installed
 * `@google/genai` SDK.
 *
 * ## Why the Interactions API
 *
 * Current Gemini TTS models (`gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts`)
 * are served by the Interactions endpoint, which the installed SDK already
 * exposes as `client.interactions.create()`. The older `generateContent` +
 * `speechConfig` shape belongs to the retired 2.5 preview API. Using the
 * installed SDK means no second Google SDK and no dependency upgrade of the
 * intelligence engine.
 *
 * ## Audio format
 *
 * Unary TTS requests return `audio/wav` (24 kHz, mono, 16-bit PCM with a RIFF
 * header). Streaming requests would return headerless `audio/l16`, but this
 * provider does not stream — see {@link GeminiTTSProvider.streamSpeech}.
 * Any `l16` payload is wrapped in a WAV container by {@link normalizeAudio} so
 * the renderer always receives a real, correctly labelled container.
 *
 * ## Honest capability reporting
 *
 * The provider is **buffered**, not streaming: the API returns a complete
 * utterance. `streamSpeech()` yields that complete buffer as a single chunk so
 * the existing TTSService pipeline keeps working without pretending otherwise.
 */

import { GoogleGenAI } from '@google/genai'
import { BaseTTSProvider, type TTSAudioFormat } from './BaseTTSProvider'
import { createLogger } from '@electron/utils/logger'
import { ensureWav, isWav, type PcmFormat } from '@electron/utils/wav'
import { formatTTSError } from '@electron/utils/ttsErrors'
import { DEFAULT_GEMINI_TTS_MODEL, DEFAULT_GEMINI_TTS_VOICE } from '../geminiCatalog'

const log = createLogger('GeminiTTSProvider')

/** Options accepted by {@link GeminiTTSProvider} */
export interface GeminiTTSOptions {
  apiKey: string
  model?: string
  voice?: string
}

/** One audio block extracted from an Interactions response */
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

/** MIME types this provider can turn into a playable container */
const WAV_MIME = 'audio/wav'
const PCM_MIMES = new Set(['audio/l16', 'audio/pcm', 'audio/l16;codec=pcm'])

/**
 * Build the Interactions request body for a single-speaker utterance.
 *
 * Extracted as a pure function so the request shape can be unit-tested
 * without touching the network.
 */
export function buildInteractionParams(text: string, model: string, voice: string) {
  return {
    model,
    input: [{ type: 'text' as const, text }],
    response_modalities: ['audio'] as string[],
    response_format: { type: 'audio', mime_type: WAV_MIME },
    generation_config: {
      speech_config: [{ voice }],
    },
  }
}

/**
 * Pull the first audio block out of an Interactions response.
 *
 * The SDK types the response as `outputs: Content[]`, while the raw REST
 * payload nests the same blocks under `steps[].content[]`. Both shapes are
 * checked so a schema revision downgrades to "no audio" instead of a crash.
 *
 * @returns The audio block, or `null` when the response contains no audio
 */
export function extractAudioBlock(interaction: unknown): GeminiAudioBlock | null {
  const record = interaction as Record<string, unknown> | null
  if (!record) return null

  const asBlock = (item: unknown): GeminiAudioBlock | null => {
    if (!item || typeof item !== 'object') return null
    const block = item as Record<string, unknown>
    if (block.type !== 'audio') return null
    if (typeof block.data !== 'string' || block.data.length === 0) return null
    return {
      data: block.data,
      mimeType: typeof block.mime_type === 'string'
        ? block.mime_type
        : typeof block.mimeType === 'string' ? block.mimeType : undefined,
      sampleRate: typeof block.sample_rate === 'number'
        ? block.sample_rate
        : typeof block.sampleRate === 'number' ? block.sampleRate : undefined,
      channels: typeof block.channels === 'number' ? block.channels : undefined,
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
 * - `audio/wav` (or a payload that already starts with RIFF) is passed through.
 * - `audio/l16` and unknown-but-headerless payloads are wrapped in a WAV header,
 *   which is what Gemini's documented 24 kHz mono 16-bit PCM requires.
 *
 * @throws When the API returns a format this provider cannot label honestly
 */
export function normalizeAudio(block: GeminiAudioBlock): Buffer {
  const raw = Buffer.from(block.data, 'base64')
  if (raw.length === 0) throw new Error('Gemini returned an empty audio response.')

  const format: Partial<PcmFormat> = {
    sampleRate: block.sampleRate ?? 24_000,
    channels: block.channels ?? 1,
    bitsPerSample: 16,
  }

  const mime = (block.mimeType ?? '').toLowerCase()

  if (mime === WAV_MIME || isWav(raw)) return ensureWav(raw, format)

  // Headerless PCM — documented for streaming responses
  if (mime === '' || PCM_MIMES.has(mime)) return ensureWav(raw, format)

  if (mime.startsWith('audio/')) {
    throw new Error(
      `Gemini returned an unsupported audio format (${mime}). ` +
      'Ultron only plays WAV/PCM output from Gemini TTS — try a different model.',
    )
  }

  // Unknown MIME but non-empty payload: assume the documented PCM layout.
  log.warn(`Unknown audio MIME "${mime}" — assuming 24 kHz mono 16-bit PCM`)
  return ensureWav(raw, format)
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

    log.info(`Initialized (model: ${this.model}, voice: ${this.voice})`)
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

    log.debug(`synthesize() ${trimmed.length} chars (model: ${this.model}, voice: ${this.voice})`)
    if (trimmed.length > 2_000) {
      log.warn(`Long TTS input (${trimmed.length} chars) — Gemini may truncate or time out; consider shorter responses`)
    }

    const startedAt = Date.now()

    let interaction: unknown
    try {
      interaction = await this.client.interactions.create(
        buildInteractionParams(trimmed, this.model, this.voice) as never,
        signal ? { signal } : undefined,
      )
    } catch (err) {
      // Cancellation is not an error — surface it as an empty result
      if (signal?.aborted) {
        log.debug('synthesize() aborted')
        return Buffer.alloc(0)
      }
      throw new Error(formatTTSError(err, 'gemini'))
    }

    const block = extractAudioBlock(interaction)
    if (!block) {
      throw new Error('Gemini TTS returned no audio. Check the selected model and voice.')
    }

    const audio = normalizeAudio(block)
    log.debug(`synthesize() done: ${audio.length} bytes in ${Date.now() - startedAt}ms`)

    return audio
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
