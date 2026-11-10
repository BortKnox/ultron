import { describe, it, expect } from 'vitest'
import {
  DEFAULT_GEMINI_TTS_MODEL,
  DEFAULT_GEMINI_TTS_VOICE,
  GEMINI_TTS_MODELS,
  GEMINI_TTS_VOICES,
  TTS_PROVIDERS,
  isKnownGeminiModel,
  isKnownGeminiVoice,
  isKnownProvider,
} from '@electron/services/tts/geminiCatalog'

describe('Gemini TTS catalogue', () => {
  it('lists the 30 documented prebuilt voices', () => {
    expect(GEMINI_TTS_VOICES).toHaveLength(30)
  })

  it('has unique voices and models', () => {
    const voices = GEMINI_TTS_VOICES.map((v) => v.value)
    const models = GEMINI_TTS_MODELS.map((m) => m.value)
    expect(new Set(voices).size).toBe(voices.length)
    expect(new Set(models).size).toBe(models.length)
  })

  it('ships defaults that exist in the catalogue', () => {
    expect(isKnownGeminiModel(DEFAULT_GEMINI_TTS_MODEL)).toBe(true)
    expect(isKnownGeminiVoice(DEFAULT_GEMINI_TTS_VOICE)).toBe(true)
  })

  it('recognises documented models only', () => {
    expect(isKnownGeminiModel('gemini-3.8-flash-tts')).toBe(true)
    expect(isKnownGeminiModel('gemini-3.8-flash-lite-tts')).toBe(true)
    expect(isKnownGeminiModel('gemini-made-up-tts')).toBe(false)
  })

  it('recognises documented voices only', () => {
    expect(isKnownGeminiVoice('Kore')).toBe(true)
    expect(isKnownGeminiVoice('Zubenelgenubi')).toBe(true)
    expect(isKnownGeminiVoice('NotA')).toBe(false)
  })
})

describe('TTS provider catalogue', () => {
  it('exposes elevenlabs, yandex-alice and gemini', () => {
    expect(TTS_PROVIDERS.map((p) => p.id)).toEqual(['elevenlabs', 'yandex-alice', 'gemini'])
  })

  it('marks Alice as key-free and the others as key-based', () => {
    const byId = Object.fromEntries(TTS_PROVIDERS.map((p) => [p.id, p]))
    expect(byId['yandex-alice'].requiresApiKey).toBe(false)
    expect(byId.elevenlabs.requiresApiKey).toBe(true)
    expect(byId.gemini.requiresApiKey).toBe(true)
  })

  it('validates provider ids', () => {
    expect(isKnownProvider('gemini')).toBe(true)
    expect(isKnownProvider('not-a-provider')).toBe(false)
  })
})
