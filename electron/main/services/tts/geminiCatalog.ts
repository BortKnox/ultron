/**
 * geminiCatalog — verified Gemini TTS models, prebuilt voices and provider
 * metadata shared by the main process (validation) and the renderer (pickers).
 *
 * Sources (checked 2026-11):
 * - https://ai.google.dev/gemini-api/docs/speech-generation
 * - https://ai.google.dev/gemini-api/docs/pricing
 *
 * Only models listed here are offered in the UI. The model field accepts a
 * custom id as well, so a user can opt into a newer model without a code
 * change — it is simply not pre-validated.
 */

/** A selectable option rendered by the settings dropdowns */
export interface TTSOption {
  /** Value written to config */
  value: string
  /** Human-readable label */
  label: string
  /** Optional short description shown next to the label */
  hint?: string
}

/**
 * The two request shapes Gemini serves TTS from.
 *
 * Models are split by API: the preview family answers `generateContent` with
 * `responseModalities: [AUDIO]`, while the 3.8 family answers the Interactions
 * endpoint. The provider still retries the other shape once if Google reports
 * a mismatch, because these assignments have changed between API revisions.
 */
export type GeminiApi = 'generateContent' | 'interactions'

/** A Gemini TTS model plus the request shape it is served by */
export interface GeminiTTSModelOption extends TTSOption {
  /** API this model is documented to use */
  api: GeminiApi
  /** Marks the model selected for new installs */
  isDefault?: boolean
}

/**
 * Gemini TTS models, verified against the documentation (2026-11).
 *
 * The preview models are listed first because they are the ones that reliably
 * answer `generateContent`; the 3.8 models are the current generation and
 * answer the Interactions endpoint. Every entry can be overridden with a
 * custom model id in Settings.
 */
export const GEMINI_TTS_MODELS: GeminiTTSModelOption[] = [
  {
    value: 'gemini-2.5-flash-preview-tts',
    label: 'Gemini 2.5 Flash TTS (preview)',
    hint: 'Fast and cheap · generateContent',
    api: 'generateContent',
    isDefault: true,
  },
  {
    value: 'gemini-2.5-pro-preview-tts',
    label: 'Gemini 2.5 Pro TTS (preview)',
    hint: 'Higher fidelity · generateContent',
    api: 'generateContent',
  },
  {
    value: 'gemini-3.1-flash-tts-preview',
    label: 'Gemini 3.1 Flash TTS (preview)',
    hint: 'Preview · generateContent',
    api: 'generateContent',
  },
  {
    value: 'gemini-3.8-flash-lite-tts',
    label: 'Gemini 3.8 Flash-Lite TTS',
    hint: 'Current generation · interactions',
    api: 'interactions',
  },
  {
    value: 'gemini-3.8-flash-tts',
    label: 'Gemini 3.8 Flash TTS',
    hint: 'Studio-grade fidelity · interactions',
    api: 'interactions',
  },
]

/** Default Gemini TTS model — the shape that answers on the widest set of keys */
export const DEFAULT_GEMINI_TTS_MODEL =
  GEMINI_TTS_MODELS.find((m) => m.isDefault)?.value ?? 'gemini-2.5-flash-preview-tts'

/** Default Gemini TTS voice — composed, firm delivery suits the default persona */
export const DEFAULT_GEMINI_TTS_VOICE = 'Kore'

/**
 * Models tried, in order, **only** when the requested model id does not exist.
 *
 * Model ids get retired; this keeps voice output working instead of failing
 * with a 404. Every substitution is logged. The list is deliberately short —
 * each entry costs a network round trip.
 */
export const GEMINI_MODEL_FALLBACKS: string[] = [
  'gemini-3.8-flash-lite-tts',
  'gemini-3.1-flash-tts-preview',
]

/** Which request shape a model uses (unknown/custom ids default to generateContent) */
export function getGeminiModelApi(model: string): GeminiApi {
  return GEMINI_TTS_MODELS.find((m) => m.value === model)?.api ?? 'generateContent'
}

/**
 * The 30 prebuilt Gemini studio voices.
 *
 * Voice availability is model-independent for the models above, so the list
 * does not need filtering by model. (`voice` may also be a custom `voice_…`
 * design/replication id, which the settings UI accepts as free text.)
 */
export const GEMINI_TTS_VOICES: TTSOption[] = [
  { value: 'Zephyr', label: 'Zephyr', hint: 'Bright' },
  { value: 'Puck', label: 'Puck', hint: 'Upbeat' },
  { value: 'Charon', label: 'Charon', hint: 'Informative' },
  { value: 'Kore', label: 'Kore', hint: 'Firm' },
  { value: 'Fenrir', label: 'Fenrir', hint: 'Excitable' },
  { value: 'Leda', label: 'Leda', hint: 'Youthful' },
  { value: 'Orus', label: 'Orus', hint: 'Firm' },
  { value: 'Aoede', label: 'Aoede', hint: 'Breezy' },
  { value: 'Callirrhoe', label: 'Callirrhoe', hint: 'Easy-going' },
  { value: 'Autonoe', label: 'Autonoe', hint: 'Bright' },
  { value: 'Enceladus', label: 'Enceladus', hint: 'Breathy' },
  { value: 'Iapetus', label: 'Iapetus', hint: 'Clear' },
  { value: 'Umbriel', label: 'Umbriel', hint: 'Easy-going' },
  { value: 'Algieba', label: 'Algieba', hint: 'Smooth' },
  { value: 'Despina', label: 'Despina', hint: 'Smooth' },
  { value: 'Erinome', label: 'Erinome', hint: 'Clear' },
  { value: 'Algenib', label: 'Algenib', hint: 'Gravelly' },
  { value: 'Rasalgethi', label: 'Rasalgethi', hint: 'Informative' },
  { value: 'Laomedeia', label: 'Laomedeia', hint: 'Upbeat' },
  { value: 'Achernar', label: 'Achernar', hint: 'Soft' },
  { value: 'Alnilam', label: 'Alnilam', hint: 'Firm' },
  { value: 'Schedar', label: 'Schedar', hint: 'Even' },
  { value: 'Gacrux', label: 'Gacrux', hint: 'Mature' },
  { value: 'Pulcherrima', label: 'Pulcherrima', hint: 'Forward' },
  { value: 'Achird', label: 'Achird', hint: 'Friendly' },
  { value: 'Zubenelgenubi', label: 'Zubenelgenubi', hint: 'Casual' },
  { value: 'Vindemiatrix', label: 'Vindemiatrix', hint: 'Gentle' },
  { value: 'Sadachbia', label: 'Sadachbia', hint: 'Lively' },
  { value: 'Sadaltager', label: 'Sadaltager', hint: 'Knowledgeable' },
  { value: 'Sulafat', label: 'Sulafat', hint: 'Warm' },
]

/** True when `voice` is one of the documented prebuilt voices */
export function isKnownGeminiVoice(voice: string): boolean {
  return GEMINI_TTS_VOICES.some((v) => v.value === voice)
}

/** True when `model` is one of the documented Gemini TTS models */
export function isKnownGeminiModel(model: string): boolean {
  return GEMINI_TTS_MODELS.some((m) => m.value === model)
}

/** Provider metadata shared with the settings UI */
export interface TTSProviderInfo {
  /** Config value (`tts.provider`) */
  id: string
  label: string
  /** Whether the provider needs an API key before it can speak */
  requiresApiKey: boolean
  /** Short description shown under the provider selector */
  description: string
}

/** All TTS providers supported by the app, in display order */
export const TTS_PROVIDERS: TTSProviderInfo[] = [
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    requiresApiKey: true,
    description: 'High-quality streaming voices. Requires an ElevenLabs API key and credits.',
  },
  {
    id: 'yandex-alice',
    label: 'Yandex Alice',
    requiresApiKey: false,
    description: 'Uses Yandex Alice. No API key required; voice and language are chosen by Yandex.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    requiresApiKey: true,
    description: 'Google Gemini TTS. Requires a Gemini API key from Google AI Studio.',
  },
]

/** True when the provider id is one the app knows how to build */
export function isKnownProvider(provider: string): boolean {
  return TTS_PROVIDERS.some((p) => p.id === provider)
}
