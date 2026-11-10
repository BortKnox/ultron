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

/** Default Gemini TTS model — cost-efficient and free-tier capable */
export const DEFAULT_GEMINI_TTS_MODEL = 'gemini-3.8-flash-lite-tts'

/** Default Gemini TTS voice — composed, firm delivery suits the default persona */
export const DEFAULT_GEMINI_TTS_VOICE = 'Kore'

/**
 * Gemini TTS models verified against the current documentation.
 *
 * The Gemini 3.8 models are the current generation and both include a free
 * tier. The two `preview` entries are older models kept for compatibility —
 * they are labelled as legacy so nobody selects them by accident.
 */
export const GEMINI_TTS_MODELS: TTSOption[] = [
  {
    value: 'gemini-3.8-flash-lite-tts',
    label: 'Gemini 3.8 Flash-Lite TTS',
    hint: 'Fast and cheapest — recommended',
  },
  {
    value: 'gemini-3.8-flash-tts',
    label: 'Gemini 3.8 Flash TTS',
    hint: 'Studio-grade fidelity, slower',
  },
  {
    value: 'gemini-3.1-flash-tts-preview',
    label: 'Gemini 3.1 Flash TTS (preview)',
    hint: 'Legacy preview model',
  },
  {
    value: 'gemini-2.5-pro-preview-tts',
    label: 'Gemini 2.5 Pro TTS (preview)',
    hint: 'Legacy preview model',
  },
]

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
