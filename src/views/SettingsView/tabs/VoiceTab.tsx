import { defineComponent, ref, computed, type PropType, onMounted } from 'vue'
import type { AppConfig } from '@/composables/useSettings'
import { api } from '@/api'
import CustomSelect from '../components/CustomSelect'

/** Shape of `api.audio.getTTSOptions` */
interface TTSOption {
  value: string
  label: string
  hint?: string
}

interface TTSOptions {
  providers: { id: string; label: string; requiresApiKey: boolean; description: string }[]
  gemini: {
    models: TTSOption[]
    voices: TTSOption[]
    defaultModel: string
    defaultVoice: string
  }
  activeProvider: string | null
  activeFormat: string
}

/**
 * VoiceTab — TTS provider configuration + STT settings.
 *
 * TTS providers each keep their own credentials (`tts.providers.*`), so
 * switching the active provider never overwrites another provider's key,
 * model or voice. Gemini exposes a verified model/voice catalogue plus a
 * "Test voice" button that synthesizes with the values currently on screen.
 */
export default defineComponent({
  name: 'VoiceTab',

  props: {
    config: { type: Object as PropType<AppConfig>, required: true },
  },

  emits: ['update'],

  setup(props, { emit }) {
    /* ── STT state ── */
    const modelStatus = ref<{ downloaded: boolean; path: string }>({ downloaded: false, path: '' })
    const downloading = ref(false)
    const downloadProgress = ref(0)
    const downloadError = ref('')
    const languages = ref<{ code: string; label: string }[]>([])
    const resetting = ref(false)

    /* ── TTS catalogue + test state ── */
    const ttsOptions = ref<TTSOptions | null>(null)
    const optionsError = ref('')
    const testing = ref(false)
    const testResult = ref<{ kind: 'ok' | 'error'; message: string } | null>(null)
    const showElevenKey = ref(false)
    const showGeminiKey = ref(false)
    const customModel = ref(false)
    const customVoice = ref(false)

    const sortedLanguages = computed(() =>
      [...languages.value].sort((a, b) => a.label.localeCompare(b.label)),
    )

    const languageOptions = computed(() =>
      sortedLanguages.value.map((l) => ({ value: l.code, label: l.label })),
    )

    const providerOptions = computed(() =>
      (ttsOptions.value?.providers ?? []).map((p) => ({ value: p.id, label: p.label })),
    )

    const geminiModelOptions = computed(() =>
      (ttsOptions.value?.gemini.models ?? []).map((m) => ({
        value: m.value,
        label: m.hint ? `${m.label} — ${m.hint}` : m.label,
      })),
    )

    const geminiVoiceOptions = computed(() =>
      (ttsOptions.value?.gemini.voices ?? []).map((v) => ({
        value: v.value,
        label: v.hint ? `${v.label} — ${v.hint}` : v.label,
      })),
    )

    const geminiModel = computed(() => props.config.tts.providers?.gemini?.model ?? '')
    const geminiVoice = computed(() => props.config.tts.providers?.gemini?.voice ?? '')

    const geminiModelIsKnown = computed(() =>
      geminiModelOptions.value.some((o) => o.value === geminiModel.value),
    )
    const geminiVoiceIsKnown = computed(() =>
      geminiVoiceOptions.value.some((o) => o.value === geminiVoice.value),
    )

    const activeProviderInfo = computed(() =>
      ttsOptions.value?.providers.find((p) => p.id === props.config.tts.provider) ?? null,
    )

    onMounted(async () => {
      try {
        const [status, langs, opts] = await Promise.all([
          api.audio.getSTTModelStatus.query(),
          api.audio.getSTTLanguages.query(),
          api.audio.getTTSOptions.query(),
        ])
        modelStatus.value = status as { downloaded: boolean; path: string }
        languages.value = langs as { code: string; label: string }[]
        ttsOptions.value = opts as TTSOptions
      } catch (err) {
        console.error('Failed to load voice settings:', err)
        optionsError.value = 'Could not load TTS options.'
      }

      api.audio.onSTTModelStatus.subscribe(undefined, {
        onData(data: { downloaded: boolean; progress?: number; error?: string }) {
          if (data.downloaded) {
            modelStatus.value.downloaded = true
            downloading.value = false
            downloadProgress.value = 100
          }
          if (data.progress !== undefined) downloadProgress.value = data.progress
          if (data.error) { downloadError.value = data.error; downloading.value = false }
        },
      })
    })

    /* ── Voice test ── */
    async function testVoice() {
      if (testing.value) return
      testing.value = true
      testResult.value = null

      const tts = props.config.tts
      try {
        const result = await api.audio.testTTSVoice.mutate({
          provider: tts.provider,
          apiKey: tts.providers?.gemini?.apiKey || tts.providers?.elevenlabs?.apiKey || undefined,
          model: tts.providers?.gemini?.model || tts.providers?.elevenlabs?.model || undefined,
          voice: tts.providers?.gemini?.voice || undefined,
          voiceId: tts.providers?.elevenlabs?.voiceId || undefined,
        })
        testResult.value = {
          kind: 'ok',
          message: `Test sent — ${((result as { bytes: number }).bytes / 1024).toFixed(0)} KB of audio. You should hear it now.`,
        }
      } catch (err) {
        testResult.value = {
          kind: 'error',
          message: (err as Error).message || 'Voice test failed.',
        }
      } finally {
        testing.value = false
      }
    }

    /* ── STT actions ── */
    async function downloadModel() {
      downloading.value = true
      downloadError.value = ''
      downloadProgress.value = 0
      try {
        await api.audio.downloadSTTModel.mutate({ language: props.config.stt.language })
        modelStatus.value.downloaded = true
      } catch (err: unknown) {
        downloadError.value = (err as Error).message || 'Download failed'
      } finally {
        downloading.value = false
      }
    }

    async function refreshModelStatus() {
      try {
        const status = await api.audio.getSTTModelStatus.query({ language: props.config.stt.language })
        modelStatus.value = status as { downloaded: boolean; path: string }
      } catch (err) {
        console.error('Failed to refresh STT model status:', err)
      }
    }

    async function resetVoice() {
      resetting.value = true
      try {
        const u1 = await api.settings.resetSection.mutate({ section: 'tts' })
        testResult.value = null
        emit('update', 'tts', u1.tts)
        const u2 = await api.settings.resetSection.mutate({ section: 'stt' })
        emit('update', 'stt', u2.stt)
      } finally { resetting.value = false }
    }

    return {
      // STT
      modelStatus, downloading, downloadProgress, downloadError, languageOptions,
      downloadModel, refreshModelStatus,
      // TTS
      ttsOptions, optionsError, testing, testResult,
      showElevenKey, showGeminiKey, customModel, customVoice,
      providerOptions, geminiModelOptions, geminiVoiceOptions,
      geminiModel, geminiVoice, geminiModelIsKnown, geminiVoiceIsKnown,
      activeProviderInfo, testVoice,
      resetting, resetVoice,
    }
  },

  render() {
    const tts = this.config.tts
    const stt = this.config.stt
    const provider = tts.provider
    const eleven = tts.providers?.elevenlabs
    const gemini = tts.providers?.gemini
    const info = this.activeProviderInfo

    return (
      <div class="settings-tab">
        <h2 class="settings-tab__title">Voice</h2>
        <p class="settings-tab__subtitle">Text-to-Speech and Speech-to-Text</p>

        {/* ── Text-to-Speech ── */}
        <div class="settings-section">
          <div class="settings-section__title">Text-to-Speech</div>
          <div class="settings-section__card">
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Spoken responses</span>
                <span class="settings-row__hint">
                  Read agent replies aloud. Also available from the widget speaker button.
                </span>
              </div>
              <div class="settings-row__control">
                <input type="checkbox" class="settings-field__toggle" checked={tts.enabled}
                  onChange={(e: Event) => {
                    tts.enabled = (e.target as HTMLInputElement).checked
                    if (!tts.enabled) this.testResult = null
                  }} />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Provider</span>
                <span class="settings-row__hint">{info?.description ?? 'Select a voice provider'}</span>
              </div>
              <div class="settings-row__control">
                <CustomSelect
                  modelValue={provider}
                  onUpdate:modelValue={(v: string) => {
                    tts.provider = v
                    this.testResult = null
                    this.customModel = false
                    this.customVoice = false
                  }}
                  options={this.providerOptions}
                />
              </div>
            </div>
          </div>

          {/* Provider-specific configuration */}
          {provider === 'elevenlabs' && eleven && (
            <div style="margin-top: 12px;">
              <label class="settings-field">
                <span class="settings-field__label settings-field__label--split">
                  ElevenLabs API Key
                  <button
                    type="button"
                    class="voice-key-toggle"
                    onClick={() => { this.showElevenKey = !this.showElevenKey }}
                  >
                    {this.showElevenKey ? 'Hide' : 'Show'}
                  </button>
                </span>
                <input
                  type={this.showElevenKey ? 'text' : 'password'}
                  class="settings-field__input"
                  value={eleven.apiKey}
                  placeholder="sk_..."
                  autocomplete="off"
                  spellcheck={false}
                  onInput={(e: Event) => { eleven.apiKey = (e.target as HTMLInputElement).value }}
                />
                <span class="settings-field__hint">Stored locally in your config file. Never sent anywhere except ElevenLabs.</span>
              </label>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <label class="settings-field">
                  <span class="settings-field__label">Voice ID</span>
                  <input type="text" class="settings-field__input" value={eleven.voiceId}
                    placeholder="JBFqnCBsd6RMkjVDRZzb"
                    onInput={(e: Event) => { eleven.voiceId = (e.target as HTMLInputElement).value }} />
                </label>
                <label class="settings-field">
                  <span class="settings-field__label">Model</span>
                  <input type="text" class="settings-field__input" value={eleven.model}
                    placeholder="eleven_flash_v2_5"
                    onInput={(e: Event) => { eleven.model = (e.target as HTMLInputElement).value }} />
                </label>
              </div>
            </div>
          )}

          {provider === 'yandex-alice' && (
            <div class="voice-provider-note">
              Yandex Alice needs no API key. Voice and language are chosen by Yandex, and audio is
              returned as a complete Opus buffer (no streaming).
            </div>
          )}

          {provider === 'gemini' && gemini && (
            <div style="margin-top: 12px;">
              <label class="settings-field">
                <span class="settings-field__label settings-field__label--split">
                  Gemini API Key
                  <button
                    type="button"
                    class="voice-key-toggle"
                    onClick={() => { this.showGeminiKey = !this.showGeminiKey }}
                  >
                    {this.showGeminiKey ? 'Hide' : 'Show'}
                  </button>
                </span>
                <input
                  type={this.showGeminiKey ? 'text' : 'password'}
                  class="settings-field__input"
                  value={gemini.apiKey}
                  placeholder="AIza..."
                  autocomplete="off"
                  spellcheck={false}
                  onInput={(e: Event) => { gemini.apiKey = (e.target as HTMLInputElement).value }}
                />
                <span class="settings-field__hint">
                  Create a key at aistudio.google.com/apikey. This is separate from the model key used by the intelligence engine.
                </span>
              </label>

              <div class="settings-field">
                <span class="settings-field__label">TTS Model</span>
                {!this.customModel && this.geminiModelIsKnown ? (
                  <CustomSelect
                    modelValue={this.geminiModel}
                    onUpdate:modelValue={(v: string) => {
                      if (v === '__custom__') { this.customModel = true; return }
                      gemini.model = v
                      this.testResult = null
                    }}
                    options={[
                      ...this.geminiModelOptions,
                      { value: '__custom__', label: 'Custom model ID…' },
                    ]}
                  />
                ) : (
                  <input
                    type="text"
                    class="settings-field__input"
                    value={this.geminiModel}
                    placeholder="gemini-3.8-flash-lite-tts"
                    onInput={(e: Event) => { gemini.model = (e.target as HTMLInputElement).value }}
                  />
                )}
                <span class="settings-field__hint">
                  {!this.customModel && this.geminiModelIsKnown
                    ? 'Both Gemini 3.8 models include a free tier.'
                    : 'Any Gemini TTS model id is accepted — it is not pre-validated.'}
                  {(!this.customModel && this.geminiModelIsKnown) && (
                    <button type="button" class="voice-link-btn"
                      onClick={() => { this.customModel = true }}>
                      Use a custom model
                    </button>
                  )}
                  {this.customModel && (
                    <button type="button" class="voice-link-btn"
                      onClick={() => { this.customModel = false }}>
                      Back to verified models
                    </button>
                  )}
                </span>
              </div>

              <div class="settings-field">
                <span class="settings-field__label">Voice</span>
                {!this.customVoice && this.geminiVoiceIsKnown ? (
                  <CustomSelect
                    modelValue={this.geminiVoice}
                    onUpdate:modelValue={(v: string) => {
                      if (v === '__custom__') { this.customVoice = true; return }
                      gemini.voice = v
                      this.testResult = null
                    }}
                    options={[
                      ...this.geminiVoiceOptions,
                      { value: '__custom__', label: 'Custom voice ID…' },
                    ]}
                  />
                ) : (
                  <input
                    type="text"
                    class="settings-field__input"
                    value={this.geminiVoice}
                    placeholder="Kore"
                    onInput={(e: Event) => { gemini.voice = (e.target as HTMLInputElement).value }}
                  />
                )}
                <span class="settings-field__hint">
                  Prebuilt studio voices. A custom `voice_…` design or replication id also works.
                  {(!this.customVoice && this.geminiVoiceIsKnown) && (
                    <button type="button" class="voice-link-btn"
                      onClick={() => { this.customVoice = true }}>
                      Custom voice id
                    </button>
                  )}
                  {this.customVoice && (
                    <button type="button" class="voice-link-btn"
                      onClick={() => { this.customVoice = false }}>
                      Back to prebuilt voices
                    </button>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Test voice — available for key-based providers */}
          {provider !== 'yandex-alice' && (
            <div class="voice-test">
              <button
                class="settings-field__button"
                onClick={() => this.testVoice()}
                disabled={this.testing}
              >
                <span class="settings-field__button-icon">play_arrow</span>
                {this.testing ? 'Testing…' : 'Test voice'}
              </button>
              {this.testResult && (
                <span class={[
                  'voice-test__result',
                  this.testResult.kind === 'ok' ? 'voice-test__result--ok' : 'voice-test__result--error',
                ]}>
                  {this.testResult.kind === 'ok' ? 'check_circle' : 'error'}
                  <span>{this.testResult.message}</span>
                </span>
              )}
            </div>
          )}

          <div class="voice-note">
            Gemini TTS is buffered — it returns one complete utterance per reply, so playback
            starts after synthesis finishes. ElevenLabs streams MP3 while speaking.
            If a provider rejects a request, the full response from that provider is printed to the
            terminal log, and the reason is shown above.
          </div>
        </div>

        {/* ── Speech-to-Text ── */}
        <div class="settings-section">
          <div class="settings-section__title">Speech-to-Text</div>
          <div class="settings-section__card">
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Enable voice input</span>
                <span class="settings-row__hint">Allow the widget microphone button to capture speech</span>
              </div>
              <div class="settings-row__control">
                <input type="checkbox" class="settings-field__toggle" checked={stt.enabled}
                  onChange={(e: Event) => { stt.enabled = (e.target as HTMLInputElement).checked }} />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Start microphone on launch</span>
                <span class="settings-row__hint">
                  Off by default — the microphone stays off until you enable it in the widget.
                </span>
              </div>
              <div class="settings-row__control">
                <input type="checkbox" class="settings-field__toggle" checked={stt.autoListen}
                  onChange={(e: Event) => { stt.autoListen = (e.target as HTMLInputElement).checked }} />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Language</span>
              </div>
              <div class="settings-row__control">
                <CustomSelect
                  modelValue={stt.language}
                  onUpdate:modelValue={(v: string) => { stt.language = v; this.refreshModelStatus() }}
                  options={this.languageOptions}
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Model</span>
                <span class="settings-row__hint">
                  {this.modelStatus.downloaded ? '✓ Downloaded' : 'Not downloaded'}
                </span>
              </div>
              <div class="settings-row__control">
                {!this.modelStatus.downloaded && (
                  this.downloading ? (
                    <div class="stt-download-progress" style="width: 160px;">
                      <div class="stt-download-progress__bar" style={{ width: `${this.downloadProgress}%` }} />
                      <span class="stt-download-progress__text">{this.downloadProgress}%</span>
                    </div>
                  ) : (
                    <button class="settings-field__button" onClick={this.downloadModel}>
                      <span class="settings-field__button-icon">download</span>
                      Download
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
          {this.downloadError && (
            <div style="margin-top: 8px; color: oklch(0.72 0.17 25); font-size: 12px;">{this.downloadError}</div>
          )}
        </div>

        {/* Reset */}
        <button class="settings-reset-btn" onClick={() => this.resetVoice()} disabled={this.resetting}>
          <span class="settings-reset-btn__icon">restart_alt</span>
          {this.resetting ? 'Resetting…' : 'Reset Voice to Defaults'}
        </button>
      </div>
    )
  },
})
