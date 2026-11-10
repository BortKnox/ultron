import { describe, it, expect } from 'vitest'
import {
  buildGenerateContentParams,
  buildInteractionParams,
  extractAudioBlock,
  extractInlineAudio,
  normalizeAudio,
  parseAudioMime,
  resolveModelChain,
} from '@electron/services/tts/providers/GeminiTTSProvider'
import { buildWavFromPcm, isWav, readWavFormat, WAV_HEADER_SIZE } from '@electron/utils/wav'

const PCM = Buffer.alloc(480)
const PCM_B64 = PCM.toString('base64')
const WAV_B64 = buildWavFromPcm(PCM).toString('base64')

describe('buildGenerateContentParams', () => {
  it('requests audio output with the configured voice', () => {
    const params = buildGenerateContentParams('Hello there', 'gemini-2.5-flash-preview-tts', 'Kore')

    expect(params.model).toBe('gemini-2.5-flash-preview-tts')
    expect(params.config.responseModalities).toEqual(['AUDIO'])
    expect(params.config.speechConfig).toEqual({
      voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
    })
    expect(params.contents).toEqual([{ role: 'user', parts: [{ text: 'Hello there' }] }])
  })
})

describe('buildInteractionParams', () => {
  it('wraps text in a user_input block', () => {
    const params = buildInteractionParams('Hello', 'gemini-3.8-flash-tts', 'Kore')

    expect(params.input).toEqual([
      { type: 'user_input', content: [{ type: 'text', text: 'Hello' }] },
    ])
    expect(params.generation_config.speech_config).toEqual([{ voice: 'Kore' }])
    expect(params.response_format).toEqual({ type: 'audio', mime_type: 'audio/wav' })
  })
})

describe('parseAudioMime', () => {
  it('reads the base type', () => {
    expect(parseAudioMime('audio/wav').base).toBe('audio/wav')
  })

  it('reads the rate parameter', () => {
    expect(parseAudioMime('audio/L16;codec=pcm;rate=24000')).toEqual({
      base: 'audio/l16',
      rate: 24_000,
    })
  })

  it('ignores nonsense rates and missing values', () => {
    expect(parseAudioMime('audio/l16;rate=abc').rate).toBeUndefined()
    expect(parseAudioMime(undefined)).toEqual({ base: '' })
  })
})

describe('extractInlineAudio', () => {
  it('reads candidates[].content.parts[].inlineData', () => {
    const block = extractInlineAudio({
      candidates: [
        {
          content: {
            parts: [
              { text: 'ignored' },
              { inlineData: { data: PCM_B64, mimeType: 'audio/L16;codec=pcm;rate=24000' } },
            ],
          },
        },
      ],
    })

    expect(block).toMatchObject({ data: PCM_B64, sampleRate: 24_000 })
  })

  it('accepts the snake_case REST form', () => {
    const block = extractInlineAudio({
      candidates: [{ content: { parts: [{ inline_data: { data: PCM_B64, mime_type: 'audio/wav' } }] } }],
    })

    expect(block).toMatchObject({ data: PCM_B64, mimeType: 'audio/wav' })
  })

  it('returns null when there is no audio part', () => {
    expect(extractInlineAudio({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] })).toBeNull()
    expect(extractInlineAudio({ candidates: [] })).toBeNull()
    expect(extractInlineAudio({})).toBeNull()
    expect(extractInlineAudio(null)).toBeNull()
  })
})

describe('extractAudioBlock (Interactions)', () => {
  it('reads the SDK output_audio accessor', () => {
    const block = extractAudioBlock({ output_audio: { data: WAV_B64, mime_type: 'audio/wav' } })
    expect(block).toMatchObject({ data: WAV_B64, mimeType: 'audio/wav' })
  })

  it('reads outputs[] content blocks', () => {
    const block = extractAudioBlock({
      outputs: [{ type: 'text', text: '…' }, { type: 'audio', data: PCM_B64, mime_type: 'audio/wav' }],
    })
    expect(block).toMatchObject({ data: PCM_B64 })
  })

  it('reads raw steps[].content[] blocks', () => {
    const block = extractAudioBlock({
      steps: [
        { type: 'model_output', content: [{ type: 'audio', data: PCM_B64, sample_rate: 24_000 }] },
      ],
    })
    expect(block).toMatchObject({ data: PCM_B64, sampleRate: 24_000 })
  })

  it('returns null when no audio is present', () => {
    expect(extractAudioBlock({ outputs: [{ type: 'text', text: 'hi' }] })).toBeNull()
    expect(extractAudioBlock({})).toBeNull()
    expect(extractAudioBlock(null)).toBeNull()
  })
})

describe('normalizeAudio', () => {
  it('passes a WAV container through unchanged', () => {
    const out = normalizeAudio({ data: WAV_B64, mimeType: 'audio/wav' })
    expect(isWav(out)).toBe(true)
    expect(out.length).toBe(WAV_HEADER_SIZE + PCM.length)
  })

  it('wraps headerless L16 PCM using the rate reported by the API', () => {
    const out = normalizeAudio({ data: PCM_B64, mimeType: 'audio/L16;codec=pcm;rate=24000' })
    expect(readWavFormat(out)).toEqual({ sampleRate: 24_000, channels: 1, bitsPerSample: 16 })
  })

  it('defaults to 24 kHz mono when no MIME type is given', () => {
    expect(readWavFormat(normalizeAudio({ data: PCM_B64 }))?.sampleRate).toBe(24_000)
  })

  it('detects a WAV payload even with a misleading MIME type', () => {
    expect(normalizeAudio({ data: WAV_B64, mimeType: 'audio/l16' }).length)
      .toBe(WAV_HEADER_SIZE + PCM.length)
  })

  it('rejects formats it cannot label honestly', () => {
    expect(() => normalizeAudio({ data: PCM_B64, mimeType: 'audio/mp3' }))
      .toThrow(/unsupported audio format/i)
  })

  it('rejects an empty payload', () => {
    expect(() => normalizeAudio({ data: '' })).toThrow(/empty audio/i)
  })
})

describe('resolveModelChain', () => {
  it('starts with the requested model', () => {
    expect(resolveModelChain('gemini-2.5-flash-preview-tts')[0]).toBe('gemini-2.5-flash-preview-tts')
  })

  it('appends documented fallbacks without duplicates', () => {
    const chain = resolveModelChain('gemini-3.8-flash-lite-tts')
    expect(chain[0]).toBe('gemini-3.8-flash-lite-tts')
    expect(new Set(chain).size).toBe(chain.length)
  })

  it('stays bounded so a failure costs at most three attempts', () => {
    expect(resolveModelChain('unknown-model').length).toBeLessThanOrEqual(3)
  })
})
