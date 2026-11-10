import { describe, it, expect } from 'vitest'
import { formatTTSError, isTTSQuotaError } from '@electron/utils/ttsErrors'

/** Build an error that mimics a Google API failure */
function googleError(status: number, message: string): Error {
  const err = new Error(message) as Error & { status: number }
  err.status = status
  return err
}

describe('formatTTSError — Gemini', () => {
  it('names Gemini in the message', () => {
    const msg = formatTTSError(googleError(401, 'Unauthorized'), 'gemini')
    expect(msg).toContain('Gemini')
    expect(msg).toContain('Settings → Voice')
  })

  it('maps an invalid API key to an actionable message', () => {
    const msg = formatTTSError(
      googleError(400, 'API key not valid. Please pass a valid API key.'),
      'gemini',
    )
    expect(msg).toMatch(/authentication failed/i)
  })

  it('maps a 404 to an unknown model/voice message', () => {
    const msg = formatTTSError(googleError(404, 'models/foo-tts is not found'), 'gemini')
    expect(msg).toMatch(/model or voice/i)
  })

  it('maps RESOURCE_EXHAUSTED to a quota message', () => {
    const msg = formatTTSError(
      googleError(429, '429 RESOURCE_EXHAUSTED: You exceeded your current quota'),
      'gemini',
    )
    expect(msg).toMatch(/quota exhausted/i)
    expect(msg).toContain('Gemini')
  })

  it('maps transport failures to a network message', () => {
    const msg = formatTTSError(new TypeError('fetch failed'), 'gemini')
    expect(msg).toMatch(/could not reach gemini/i)
  })

  it('labels unknown errors with the provider name', () => {
    const msg = formatTTSError(new Error('something odd'), 'gemini')
    expect(msg).toBe('something odd')
  })
})

describe('formatTTSError — ElevenLabs', () => {
  it('still detects quota_exceeded from the SDK body', () => {
    const err = new Error('quota') as Error & { body: unknown }
    err.body = { detail: { status: 'quota_exceeded', message: 'You have 0 credits' } }

    expect(formatTTSError(err, 'elevenlabs')).toMatch(/quota exhausted/i)
    expect(isTTSQuotaError(err)).toBe(true)
  })

  it('keeps the provider name generic when no provider is given', () => {
    const msg = formatTTSError(googleError(500, 'boom'))
    expect(msg).toContain('TTS')
  })
})

describe('isTTSQuotaError', () => {
  it('is false for non-quota failures', () => {
    expect(isTTSQuotaError(googleError(429, 'rate limit exceeded'))).toBe(false)
    expect(isTTSQuotaError(new Error('nope'))).toBe(false)
    expect(isTTSQuotaError('not an error')).toBe(false)
  })
})
