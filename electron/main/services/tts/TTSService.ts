import { BaseService } from '@electron/services/base/BaseService'
import { BaseTTSProvider, type TTSAudioFormat } from './providers/BaseTTSProvider'
import { ElevenLabsProvider } from './providers/ElevenLabsProvider'
import { YandexAliceProvider } from './providers/YandexAliceProvider'
import { GeminiTTSProvider } from './providers/GeminiTTSProvider'
import { getConfig, saveConfig, type AppConfig } from '@electron/utils/config'
import { mainEventBus } from '@electron/utils/eventBus'
import { formatTTSError, isTTSQuotaError } from '@electron/utils/ttsErrors'
import { DEFAULT_GEMINI_TTS_MODEL, DEFAULT_GEMINI_TTS_VOICE } from './geminiCatalog'
import type { PersonaService } from '@electron/services/persona/PersonaService'

/** Overrides used by the "Test voice" button — never written to config */
export interface TTSVoiceTestOverrides {
  provider?: string
  apiKey?: string
  model?: string
  voice?: string
  voiceId?: string
}

/** Result of a successful voice test */
export interface TTSVoiceTestResult {
  ok: true
  provider: string
  format: TTSAudioFormat
  bytes: number
}

/**
 * TTSService — manages TTS provider lifecycle and speech synthesis.
 *
 * Reads the active provider plus that provider's own credentials from
 * config (`tts.providers.*`). Supports per-persona voice overrides via
 * PersonaService.
 *
 * Listens for `tts:speak` events from the AgentLoop and emits
 * `tts:audio` chunks + `tts:status` + `tts:format` updates.
 *
 * Provider failures are surfaced as warnings and never silently fall back
 * to a different provider.
 */
export class TTSService extends BaseService {
  private provider: BaseTTSProvider | null = null
  private speaking = false
  private abortController: AbortController | null = null
  private personaService: PersonaService | null = null
  /** Voice the live provider was built with (avoids needless rebuilds) */
  private activeVoiceId = ''
  /** Fingerprint of the TTS config the live provider was built from */
  private providerFingerprint = ''

  // Bound handlers for proper add/remove
  private readonly boundOnSpeak = this.onSpeak.bind(this)
  private readonly boundOnStop = this.onStop.bind(this)
  private readonly boundOnPersonaSwitched = this.onPersonaSwitched.bind(this)
  private readonly boundOnConfigChanged = this.onConfigChanged.bind(this)

  /** Set after both services are registered (avoids circular dep) */
  setPersonaService(ps: PersonaService): void {
    this.personaService = ps
  }

  async init(): Promise<void> {
    // Always register event listeners so runtime enable/disable works
    mainEventBus.on('tts:speak', this.boundOnSpeak)
    mainEventBus.on('tts:stop', this.boundOnStop)
    mainEventBus.on('persona:switched', this.boundOnPersonaSwitched)
    mainEventBus.on('config:changed', this.boundOnConfigChanged)

    const config = getConfig()

    if (!config.tts.enabled) {
      this.log.info('TTS is disabled in config — listeners registered, provider skipped')
      return
    }

    if (!this.buildProvider()) {
      return
    }

    this.log.info(`TTSService initialized (provider: ${config.tts.provider})`)
  }

  async dispose(): Promise<void> {
    this.stop()
    this.disposeProvider()
    mainEventBus.off('tts:speak', this.boundOnSpeak)
    mainEventBus.off('tts:stop', this.boundOnStop)
    mainEventBus.off('persona:switched', this.boundOnPersonaSwitched)
    mainEventBus.off('config:changed', this.boundOnConfigChanged)
    this.provider = null
    this.log.info('TTSService disposed')
  }

  // ═══════════════════════════════════════════════════════════════
  //  Provider configuration
  // ═══════════════════════════════════════════════════════════════

  /**
   * Resolve the credentials for one provider from config.
   *
   * Each provider owns its own slot, so switching the active provider never
   * touches another provider's key, model or voice.
   */
  private resolveProviderConfig(name: string): {
    apiKey: string
    voice: string
    model: string
    requiresApiKey: boolean
  } {
    const tts = getConfig().tts
    const personaVoice = this.personaService?.getActive()?.ttsVoiceId || ''

    switch (name) {
      case 'gemini':
        return {
          apiKey: tts.providers?.gemini?.apiKey ?? '',
          voice: personaVoice || tts.providers?.gemini?.voice || DEFAULT_GEMINI_TTS_VOICE,
          model: tts.providers?.gemini?.model || DEFAULT_GEMINI_TTS_MODEL,
          requiresApiKey: true,
        }
      case 'yandex-alice':
        return { apiKey: '', voice: '', model: '', requiresApiKey: false }
      case 'elevenlabs':
      default:
        return {
          apiKey: tts.providers?.elevenlabs?.apiKey ?? '',
          voice: personaVoice || tts.providers?.elevenlabs?.voiceId || 'JBFqnCBsd6RMkjVDRZzb',
          model: tts.providers?.elevenlabs?.model || 'eleven_flash_v2_5',
          requiresApiKey: true,
        }
    }
  }

  /** Stable fingerprint of the provider-relevant config (for rebuild checks) */
  private fingerprint(name: string, cfg: ReturnType<TTSService['resolveProviderConfig']>): string {
    return [name, cfg.model, cfg.voice, cfg.apiKey.length].join('|')
  }

  /**
   * Build (or rebuild) the provider for the configured provider id.
   *
   * @returns true when a usable provider is now active
   */
  private buildProvider(name = getConfig().tts.provider): boolean {
    const cfg = this.resolveProviderConfig(name)

    this.disposeProvider()

    if (cfg.requiresApiKey && !cfg.apiKey) {
      this.provider = null
      this.providerFingerprint = ''
      this.log.warn(`No API key configured for TTS provider '${name}'`)
      mainEventBus.emit('agent:warning', {
        id: 'missing-tts-key',
        message: `No API key configured for ${this.providerLabel(name)}. Add one in Settings → Voice to enable voice output.`,
        dismissable: true,
      })
      return false
    }

    try {
      switch (name) {
        case 'yandex-alice':
          this.provider = new YandexAliceProvider()
          break
        case 'gemini':
          this.provider = new GeminiTTSProvider({
            apiKey: cfg.apiKey,
            model: cfg.model,
            voice: cfg.voice,
          })
          break
        case 'elevenlabs':
          this.provider = new ElevenLabsProvider(cfg.apiKey, cfg.voice, cfg.model)
          break
        default:
          // Unknown provider id: report it instead of silently switching voices
          this.provider = null
          this.log.error(`Unknown TTS provider: '${name}'`)
          mainEventBus.emit('agent:warning', {
            id: 'tts-provider-invalid',
            message: `Unknown TTS provider "${name}". Select a provider in Settings → Voice.`,
            dismissable: true,
          })
          return false
      }
    } catch (err) {
      this.provider = null
      const message = formatTTSError(err, name)
      this.log.error(`Failed to create TTS provider '${name}':`, err)
      mainEventBus.emit('agent:warning', {
        id: 'tts-provider-error',
        message,
        dismissable: true,
      })
      return false
    }

    this.activeVoiceId = cfg.voice
    this.providerFingerprint = this.fingerprint(name, cfg)
    mainEventBus.emit('agent:dismiss-warning', { id: 'missing-tts-key' })
    mainEventBus.emit('agent:dismiss-warning', { id: 'tts-provider-error' })
    return true
  }

  /** Human-facing provider label */
  private providerLabel(name: string): string {
    switch (name) {
      case 'gemini': return 'Gemini'
      case 'yandex-alice': return 'Yandex Alice'
      case 'elevenlabs': return 'ElevenLabs'
      default: return name
    }
  }

  /** Dispose current provider (close connections etc.) */
  private disposeProvider(): void {
    const provider = this.provider as (BaseTTSProvider & { close?: () => void }) | null
    if (provider?.close) {
      try {
        provider.close()
      } catch {
        // closing must never throw
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Public API
  // ═══════════════════════════════════════════════════════════════

  /** Audio format for the current provider */
  get audioFormat(): TTSAudioFormat {
    return this.provider?.audioFormat ?? 'mpeg'
  }

  /** Name of the active provider, or null when none is usable */
  get activeProvider(): string | null {
    return this.provider?.name ?? null
  }

  /** Switch provider at runtime (rolled back to "no provider" on failure) */
  setProvider(name: string): void {
    if (!this.buildProvider(name)) return
    this.log.info(`Switched TTS to provider: ${name}`)
  }

  /** Toggle spoken responses on/off */
  setEnabled(enabled: boolean): void {
    saveConfig({ tts: { enabled } })
    this.log.info(`TTS ${enabled ? 'enabled' : 'disabled'}`)

    if (enabled && !this.provider) {
      this.buildProvider()
    }

    if (!enabled) {
      this.stop()
    }
  }

  /** Whether the service has a usable provider */
  get isReady(): boolean {
    return this.provider !== null && getConfig().tts.enabled
  }

  /** Speak text — emits audio chunks via the event bus */
  async speak(text: string): Promise<void> {
    if (!getConfig().tts.enabled) {
      this.log.debug('TTS disabled, skipping speech')
      return
    }

    if (!this.provider) {
      this.log.warn('No TTS provider configured, skipping speech')
      return
    }

    // Rebuild only when the voice actually changed for this provider
    const config = getConfig()
    const target = this.resolveProviderConfig(config.tts.provider)
    if (this.activeVoiceId !== target.voice) {
      this.buildProvider(config.tts.provider)
    }

    if (!this.provider) return

    // Stop any ongoing speech
    this.stop()

    this.speaking = true
    this.abortController = new AbortController()
    const signal = this.abortController.signal
    const provider = this.provider

    mainEventBus.emit('tts:status', { speaking: true })
    mainEventBus.emit('tts:format', { format: provider.audioFormat })

    try {
      const stream = provider.streamSpeech(text, signal)

      for await (const chunk of stream) {
        if (signal.aborted) {
          this.log.debug('Speech aborted')
          break
        }
        mainEventBus.emit('tts:audio', { chunk, done: false })
      }

      if (!signal.aborted) {
        mainEventBus.emit('tts:audio', { chunk: Buffer.alloc(0), done: true })
      }
    } catch (err) {
      if (!signal.aborted) {
        this.handleSynthesisError(err, provider.name)
      }
    } finally {
      this.speaking = false
      this.abortController = null
      mainEventBus.emit('tts:status', { speaking: false })
    }
  }

  /** Stop current speech */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.speaking = false
  }

  /**
   * Synthesize a short sample with the given (possibly unsaved) settings and
   * play it through the normal audio channel.
   *
   * Used by the "Test voice" button so a user can hear a voice before relying
   * on it. The live provider is left untouched.
   *
   * @param text — sample text (a short sentence)
   * @param overrides — provider/apiKey/model/voice currently shown in the UI
   */
  async testVoice(text: string, overrides: TTSVoiceTestOverrides = {}): Promise<TTSVoiceTestResult> {
    const providerName = overrides.provider || getConfig().tts.provider
    const base = this.resolveProviderConfig(providerName)

    const apiKey = overrides.apiKey?.trim() || base.apiKey
    const model = overrides.model?.trim() || base.model
    const voice = overrides.voice?.trim() || overrides.voiceId?.trim() || base.voice

    if (base.requiresApiKey && !apiKey) {
      throw new Error(
        `No ${this.providerLabel(providerName)} API key configured. Add one in Settings → Voice.`,
      )
    }

    let testProvider: BaseTTSProvider
    try {
      switch (providerName) {
        case 'yandex-alice':
          testProvider = new YandexAliceProvider()
          break
        case 'gemini':
          testProvider = new GeminiTTSProvider({ apiKey, model, voice })
          break
        case 'elevenlabs':
          testProvider = new ElevenLabsProvider(apiKey, voice, model)
          break
        default:
          throw new Error(`Unknown TTS provider "${providerName}"`)
      }
    } catch (err) {
      throw new Error(formatTTSError(err, providerName))
    }

    // Play the sample through the shared audio channel
    this.stop()
    this.speaking = true
    const controller = new AbortController()
    this.abortController = controller

    mainEventBus.emit('tts:status', { speaking: true })
    mainEventBus.emit('tts:format', { format: testProvider.audioFormat })

    let bytes = 0
    try {
      const audio = await testProvider.synthesize(text, controller.signal)

      if (audio.length === 0) {
        throw new Error(
          `${this.providerLabel(providerName)} returned no audio. Try a different model or voice.`,
        )
      }

      bytes = audio.length
      mainEventBus.emit('tts:audio', { chunk: audio, done: false })
      mainEventBus.emit('tts:audio', { chunk: Buffer.alloc(0), done: true })
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error('Voice test cancelled.')
      }
      const message = formatTTSError(err, providerName)
      this.log.error(`Voice test failed (${providerName}):`, err)
      mainEventBus.emit('tts:status', { speaking: false })
      throw new Error(message)
    } finally {
      this.speaking = false
      this.abortController = null
      mainEventBus.emit('tts:status', { speaking: false })
      const closable = testProvider as BaseTTSProvider & { close?: () => void }
      closable.close?.()
    }

    this.log.info(`Voice test OK (${providerName}, ${voice || 'default voice'}, ${bytes} bytes)`)
    return { ok: true, provider: providerName, format: testProvider.audioFormat, bytes }
  }

  /** Shared error handling for a failed synthesis */
  private handleSynthesisError(err: unknown, providerName: string): void {
    const message = formatTTSError(err, providerName)
    this.log.error(`TTS stream error (${providerName}):`, err)

    mainEventBus.emit('agent:warning', {
      id: 'tts-runtime-error',
      message,
      dismissable: true,
    })

    // ElevenLabs reports a hard quota exhaustion; disable to stop request spam.
    // Gemini's 429 is a per-minute rate limit, so the provider stays enabled.
    if (providerName === 'elevenlabs' && isTTSQuotaError(err)) {
      this.log.warn('TTS quota exhausted — auto-disabling TTS')
      this.provider = null
      this.providerFingerprint = ''
      saveConfig({ tts: { enabled: false } })
      mainEventBus.emit('config:changed', getConfig())

      mainEventBus.emit('agent:warning', {
        id: 'tts-runtime-error',
        message: 'ElevenLabs quota exhausted. Voice output has been disabled. Re-enable it in Settings → Voice when credits reset.',
        dismissable: true,
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Event handlers
  // ═══════════════════════════════════════════════════════════════

  /** Event handler: tts:speak */
  private async onSpeak(payload: { text: string }): Promise<void> {
    await this.speak(payload.text)
  }

  /** Event handler: tts:stop */
  private onStop(): void {
    this.stop()
  }

  /** Event handler: persona:switched — rebuild provider with new voice */
  private onPersonaSwitched(): void {
    const config = getConfig()
    if (config.tts.enabled) {
      this.buildProvider(config.tts.provider)
      this.log.info(`TTS voice updated for persona: ${this.activeVoiceId}`)
    }
  }

  /** Event handler: config:changed — apply TTS settings in realtime */
  private onConfigChanged(config: AppConfig): void {
    if (!config.tts.enabled) {
      this.stop()
      this.disposeProvider()
      this.provider = null
      this.providerFingerprint = ''
      this.log.info('TTS disabled at runtime')
      return
    }

    const name = config.tts.provider
    const resolved = this.resolveProviderConfig(name)
    const next = this.fingerprint(name, resolved)

    // Ignore config changes unrelated to TTS (settings are saved on any edit)
    if (this.provider && this.provider.name === name && next === this.providerFingerprint) {
      this.log.debug('Config changed but TTS provider is unchanged — skipping rebuild')
      return
    }

    this.buildProvider(name)
    this.log.info('TTS provider (re)built from config change')
  }
}
