import { describe, it, expect } from 'vitest'
import {
  migrateConfig,
  migrateSTTAutoListen,
  migrateTTSProviders,
} from '@electron/utils/config/migration'

describe('migrateTTSProviders', () => {
  it('copies legacy ElevenLabs credentials into the provider slot', () => {
    const parsed = {
      tts: {
        provider: 'elevenlabs',
        apiKey: 'sk_legacy',
        voiceId: 'voice_123',
        model: 'eleven_flash_v2_5',
      },
    }

    expect(migrateTTSProviders(parsed)).toBe(true)
    // Only the ElevenLabs slot is written; Gemini keeps its (default) shape
    expect(parsed.tts.providers).toEqual({
      elevenlabs: { apiKey: 'sk_legacy', voiceId: 'voice_123', model: 'eleven_flash_v2_5' },
    })
    // Legacy keys are preserved, not deleted
    expect(parsed.tts.apiKey).toBe('sk_legacy')
  })

  it('never overwrites a value the user set for a provider', () => {
    const parsed = {
      tts: {
        provider: 'elevenlabs',
        apiKey: 'sk_legacy',
        providers: { elevenlabs: { apiKey: 'sk_new', voiceId: 'v2', model: 'm2' } },
      },
    }

    migrateTTSProviders(parsed)
    expect(parsed.tts.providers.elevenlabs.apiKey).toBe('sk_new')
  })

  it('treats a legacy slot as Gemini when Gemini was the active provider', () => {
    const parsed = { tts: { provider: 'gemini', apiKey: 'AIza_old', model: 'gemini-3.1-flash-tts-preview' } }

    migrateTTSProviders(parsed)
    expect(parsed.tts.providers.gemini).toEqual({
      apiKey: 'AIza_old',
      model: 'gemini-3.1-flash-tts-preview',
    })
    expect(parsed.tts.providers.elevenlabs).toBeUndefined()
  })

  it('is a no-op on already-migrated configs', () => {
    const parsed = {
      tts: {
        provider: 'gemini',
        providers: { gemini: { apiKey: 'AIza', model: 'gemini-3.8-flash-lite-tts', voice: 'Kore' } },
      },
    }

    expect(migrateTTSProviders(parsed)).toBe(false)
  })

  it('ignores configs without a tts section', () => {
    expect(migrateTTSProviders({ ui: {} })).toBe(false)
  })
})

describe('migrateSTTAutoListen', () => {
  it('opts existing always-listening installs into autoListen', () => {
    const parsed = { stt: { enabled: true, language: 'en' } }

    expect(migrateSTTAutoListen(parsed)).toBe(true)
    expect(parsed.stt.autoListen).toBe(true)
  })

  it('leaves disabled installs alone', () => {
    const parsed = { stt: { enabled: false, language: 'en' } }

    expect(migrateSTTAutoListen(parsed)).toBe(false)
    expect('autoListen' in parsed.stt).toBe(false)
  })

  it('respects an explicit preference', () => {
    const parsed = { stt: { enabled: true, autoListen: false } }

    expect(migrateSTTAutoListen(parsed)).toBe(false)
    expect(parsed.stt.autoListen).toBe(false)
  })
})

describe('migrateConfig', () => {
  it('runs flat, provider and STT migrations together', () => {
    const parsed: Record<string, unknown> = {
      ttsProvider: 'gemini',
      ttsApiKey: 'AIza_flat',
      ttsModel: 'gemini-2.5-pro-preview-tts',
      ttsEnabled: true,
      stt: { enabled: true },
    }

    const result = migrateConfig(parsed)

    expect((result.tts as Record<string, unknown>).provider).toBe('gemini')
    expect('ttsApiKey' in result).toBe(false)
    expect(((result.tts as any).providers)?.gemini).toMatchObject({ apiKey: 'AIza_flat' })
    expect((result.stt as Record<string, unknown>).autoListen).toBe(true)
  })
})
