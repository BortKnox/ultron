/**
 * Config schema — TypeScript interfaces for all configuration sections.
 *
 * These interfaces define the shape of the Config file.
 * Each section groups related settings together.
 */

/** Recursively makes all properties optional */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

// ═══════════════════════════════════════════════════════════════
//  Section interfaces
// ═══════════════════════════════════════════════════════════════

export interface UIConfig {
  /** Which side of the screen the UI stack appears on */
  positionSide: 'left' | 'right' | 'center'
  /** Open DevTools automatically in dev mode */
  openDevTools: boolean
  /** Minimum log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  /** Write per-request session logs to {userData}/Logs/ */
  debugLog: boolean
  /** Whether UI sound effects are enabled */
  soundEnabled: boolean
  /** Sound effects volume (0.0 – 1.0) */
  soundVolume: number
  /**
   * Accent colour source.
   * - `ultron` — fixed crimson accent (default identity)
   * - `system` — follow the OS accent colour
   */
  accent: 'ultron' | 'system'
}

export interface LLMConfig {
  /** LLM provider name */
  provider: string
  /** Base URL for OpenAI-compatible API */
  baseURL: string
  /** LLM API key */
  apiKey: string
  /** Main chat model (text + streaming) */
  textModel: string
  /** Vision model (screenshot analysis) */
  visionModel: string
  /** Classifier model (intent detection, cheap) */
  classifierModel: string
}

export interface GenerationConfig {
  /** Temperature for chat/stream (0.0–2.0) */
  chatTemperature: number
  /** Top-P nucleus sampling for chat */
  chatTopP: number
  /** Top-K sampling for chat (Gemini only) */
  chatTopK: number
  /** Max output tokens for chat */
  chatMaxTokens: number
  /** Temperature for vision/action (lower = more precise) */
  visionTemperature: number
  /** Max output tokens for vision/action */
  visionMaxTokens: number
}

export interface TTSConfig {
  /** Active TTS provider: 'elevenlabs' | 'yandex-alice' | 'gemini' */
  provider: string
  /**
   * @deprecated Legacy single-provider credentials.
   * Kept so Atlas-era configs keep their values; migrated into
   * `providers.*` on load and no longer read by TTSService.
   */
  apiKey: string
  /** @deprecated — see {@link TTSConfig.apiKey} */
  voiceId: string
  /** @deprecated — see {@link TTSConfig.apiKey} */
  model: string
  /** Whether spoken responses are enabled (independent of the microphone) */
  enabled: boolean
  /**
   * Per-provider configuration. Each provider keeps its own credentials,
   * so switching the active provider never overwrites another one.
   */
  providers: TTSProvidersConfig
}

/** ElevenLabs credentials + voice/model selection */
export interface ElevenLabsTTSConfig {
  apiKey: string
  voiceId: string
  model: string
}

/** Google Gemini TTS credentials + voice/model selection */
export interface GeminiTTSConfig {
  /** Gemini API key from Google AI Studio (independent of the LLM key) */
  apiKey: string
  /** Gemini TTS model id (e.g. 'gemini-3.8-flash-lite-tts') */
  model: string
  /** Prebuilt Gemini voice name (e.g. 'Kore') */
  voice: string
}

/** Container for all provider-specific TTS settings */
export interface TTSProvidersConfig {
  elevenlabs: ElevenLabsTTSConfig
  gemini: GeminiTTSConfig
}

export interface AgentConfig {
  /** Maximum total iterations per action loop */
  maxIterations: number
  /** Maximum consecutive failures before aborting */
  maxConsecutiveFailures: number
  /** Cooldown before each action (ms) */
  preActionDelay: number
  /** Cooldown after action before verification screenshot (ms) */
  postActionDelay: number
  /** Max messages in conversation context window */
  maxContextMessages: number
  /** Shell command timeout (ms) */
  commandTimeout: number
  /** Max width for screenshots sent to LLM */
  screenshotMaxWidth: number
  /** JPEG quality for compressed screenshots (0–100) */
  screenshotQuality: number
  /** Delay before transitioning from thoughts → response in chat mode (ms) */
  thoughtsTransitionDelay: number
  /** Words per chunk in response streaming animation */
  streamWordsPerChunk: number
  /** Delay between chunks in response streaming animation (ms) */
  streamChunkDelay: number
}

export interface STTConfig {
  /** Whether STT is enabled */
  enabled: boolean
  /** Language code for model selection (e.g. 'en', 'ru') */
  language: string
  /**
   * Explicit opt-in: start microphone capture automatically on launch.
   * When false, the microphone stays off until the user enables it
   * (from the widget or Settings). Runtime capture state is never persisted.
   */
  autoListen: boolean
}

// ═══════════════════════════════════════════════════════════════
//  Root config
// ═══════════════════════════════════════════════════════════════

export interface AppConfig {
  ui: UIConfig
  llm: LLMConfig
  generation: GenerationConfig
  tts: TTSConfig
  stt: STTConfig
  agent: AgentConfig
  /** Global hotkey combo string */
  hotkey: string
  /** Currently active persona ID */
  activePersonaId: string
}
