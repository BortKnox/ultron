import { describe, it, expect } from 'vitest'
import {
  buildInteractionParams,
  extractAudioBlock,
  normalizeAudio,
} from '@electron/services/tts/providers/GeminiTTSProvider'
import { isWav, readWavFormat, WAV_HEADER_SIZE } from '@electron/utils/wav'
import { buildWavFromPcm } from '@electron/utils/wav'

const PCM = Buffer.alloc(480)
const PCM_B64 = PCM.toString('base64')
const WAV_B64 = buildWavFromPcm(PCM).toString('base64')

describe('buildInteractionParams', () => {
  it('requests audio-only output with the configured voice', () => {
    const params = buildInteractionParams('Hello there', 'gemini-3.8-flash-lite-tts', 'Kore')

    expect(params.model).toBe('gemini-3.8-flash-lite-tts')
    expect(params.response_modalities).toEqual(['audio'])
    expect(params.response_format).toEqual({ type: 'audio', mime_type: 'audio/wav' })
    expect(params.generation_config.speech_config).toEqual([{ voice: 'Kore' }])
    expect(params.input).toEqual([{ type: 'text', text: 'Hello there' }])
  })
})

describe('extractAudioBlock', () => {
  it('reads the SDK shape (outputs[])', () => {
    const block = extractAudioBlock({
      id: 'int_1',
      outputs: [{ type: 'text', text: '...' }, { type: 'audio', data: PCM_B64, mime_type: 'audio/wav' }],
    })

    expect(block).toMatchObject({ data: PCM_B64, mimeType: 'audio/wav' })
  })

  it('reads the raw REST shape (steps[].content[])', () => {
    const block = extractAudioBlock({
      steps: [
        { type: 'model_output', content: [{ type: 'audio', data: PCM_B64, mime_type: 'audio/l16', sample_rate: 24_000 }] },
      ],
    })

    expect(block).toMatchObject({ data: PCM_B64, mimeType: 'audio/l16', sampleRate: 24_000 })
  })

  it('returns null when no audio is present', () => {
    expect(extractAudioBlock({ outputs: [{ type: 'text', text: 'hi' }] })).toBeNull()
    expect(extractAudioBlock({ outputs: [] })).toBeNull()
    expect(extractAudioBlock({})).toBeNull()
    expect(extractAudioBlock(null)).toBeNull()
  })

  it('ignores audio blocks without a payload', () => {
    expect(extractAudioBlock({ outputs: [{ type: 'audio', data: '' }] })).toBeNull()
  })
})

describe('normalizeAudio', () => {
  it('passes a WAV container through unchanged', () => {
    const out = normalizeAudio({ data: WAV_B64, mimeType: 'audio/wav' })
    expect(isWav(out)).toBe(true)
    expect(out.length).toBe(WAV_HEADER_SIZE + PCM.length)
  })

  it('wraps headerless L16 PCM in a WAV container', () => {
    const out = normalizeAudio({ data: PCM_B64, mimeType: 'audio/l16', sampleRate: 24_000 })
    expect(isWav(out)).toBe(true)
    expect(readWavFormat(out)).toEqual({ sampleRate: 24_000, channels: 1, bitsPerSample: 16 })
  })

  it('assumes 24 kHz mono PCM when the MIME type is missing', () => {
    const out = normalizeAudio({ data: PCM_B64 })
    expect(readWavFormat(out)?.sampleRate).toBe(24_000)
  })

  it('detects a WAV payload even with a misleading MIME type', () => {
    const out = normalizeAudio({ data: WAV_B64, mimeType: 'audio/l16' })
    expect(out.length).toBe(WAV_HEADER_SIZE + PCM.length)
  })

  it('rejects formats it cannot label honestly', () => {
    expect(() => normalizeAudio({ data: PCM_B64, mimeType: 'audio/mp3' }))
      .toThrow(/unsupported audio format/i)
  })

  it('rejects an empty payload', () => {
    expect(() => normalizeAudio({ data: '' })).toThrow(/empty audio/i)
  })
})
