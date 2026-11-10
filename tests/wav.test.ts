import { describe, it, expect } from 'vitest'
import {
  WAV_HEADER_SIZE,
  buildWavFromPcm,
  ensureWav,
  isWav,
  readWavFormat,
} from '@electron/utils/wav'

/** 1000 samples of silence at 24 kHz mono 16-bit */
const PCM = Buffer.alloc(2000)

describe('buildWavFromPcm', () => {
  it('writes a canonical 44-byte PCM header', () => {
    const wav = buildWavFromPcm(PCM, { sampleRate: 24_000, channels: 1, bitsPerSample: 16 })

    expect(wav.length).toBe(WAV_HEADER_SIZE + PCM.length)
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ')
    expect(wav.toString('ascii', 36, 40)).toBe('data')

    // RIFF chunk size = 36 + data size
    expect(wav.readUInt32LE(4)).toBe(36 + PCM.length)
    expect(wav.readUInt32LE(16)).toBe(16)          // fmt chunk size
    expect(wav.readUInt16LE(20)).toBe(1)           // PCM
    expect(wav.readUInt16LE(22)).toBe(1)           // mono
    expect(wav.readUInt32LE(24)).toBe(24_000)      // sample rate
    expect(wav.readUInt32LE(28)).toBe(48_000)      // byte rate = 24000 * 1 * 2
    expect(wav.readUInt16LE(32)).toBe(2)           // block align
    expect(wav.readUInt16LE(34)).toBe(16)          // bits per sample
    expect(wav.readUInt32LE(40)).toBe(PCM.length)  // data size
  })

  it('keeps the PCM payload byte-for-byte', () => {
    const payload = Buffer.from([1, 2, 3, 4, 5, 6])
    const wav = buildWavFromPcm(payload)
    expect(wav.subarray(WAV_HEADER_SIZE)).toEqual(payload)
  })

  it('computes byte rate for stereo 16-bit input', () => {
    const wav = buildWavFromPcm(PCM, { sampleRate: 44_100, channels: 2, bitsPerSample: 16 })
    expect(wav.readUInt32LE(28)).toBe(44_100 * 2 * 2)
    expect(wav.readUInt16LE(32)).toBe(4)
  })

  it('defaults to 24 kHz mono 16-bit (Gemini TTS layout)', () => {
    const fmt = readWavFormat(buildWavFromPcm(PCM))
    expect(fmt).toEqual({ sampleRate: 24_000, channels: 1, bitsPerSample: 16 })
  })
})

describe('isWav', () => {
  it('accepts a generated WAV container', () => {
    expect(isWav(buildWavFromPcm(PCM))).toBe(true)
  })

  it('rejects raw PCM and short buffers', () => {
    expect(isWav(PCM)).toBe(false)
    expect(isWav(Buffer.from('RIFF'))).toBe(false)
    expect(isWav(Buffer.alloc(0))).toBe(false)
  })
})

describe('ensureWav', () => {
  it('passes an existing WAV through untouched', () => {
    const wav = buildWavFromPcm(PCM)
    expect(ensureWav(wav)).toBe(wav)
  })

  it('wraps headerless PCM exactly once', () => {
    const wrapped = ensureWav(PCM)
    expect(isWav(wrapped)).toBe(true)
    // Re-wrapping an already-wrapped buffer must not double the header
    expect(ensureWav(wrapped)).toBe(wrapped)
  })
})
