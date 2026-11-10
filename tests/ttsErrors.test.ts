import { describe, it, expect } from 'vitest'
import { formatTTSError, getTTSErrorDetail, isTTSQuotaError } from '@electron/utils/ttsErrors'

/** Build an error that mimics a Google API failure */
function googleError(status: number, message: string): Error {
  const err = new Error(message) as Error & { status: number }
  err.status = status
  return err
}

/** Build an error shaped like a Google SDK error with a JSON body */
function googleBodyError(status: number, apiMessage: string): Error {
  const err = new Error(`got status: ${status}`) as Error & Record<string, unknown>
  err.status = status
  err.body = { error: { code: status, message: apiMessage, status: 'INVALID_ARGUMENT' } }
  return err
}

describe('formatTTSError — Gemini', () => {
  it('names Gemini and points at Settings → Voice', () => {
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
})

describe('formatTTSError — raw provider detail', () => {
  it('appends Google’s own message to the mapped 400', () => {
    const msg = formatTTSError(
      googleBodyError(400, 'Request contains an invalid argument: contents is required.'),
      'gemini',
    )

    // The mapped sentence and the provider's words are both present
    expect(msg).toMatch(/rejected the request/i)
    expect(msg).toContain('contents is required')
    expect(msg).toContain(' — ')
  })

  it('extracts detail from body.error.message', () => {
    expect(getTTSErrorDetail(googleBodyError(400, 'Bad voice name'))).toBe('Bad voice name')
  })

  it('does not repeat detail already present in the message', () => {
    const msg = formatTTSError(googleError(404, 'model gemini-x is not found'), 'gemini')
    expect(msg.match(/gemini-x/g)?.length ?? 0).toBeLessThanOrEqual(1)
  })

  it('skips meaningless status-only wrappers', () => {
    const msg = formatTTSError(googleError(400, '400 status code (no body)'), 'gemini')
    expect(msg).not.toContain('400 status code')
  })

  it('truncates very long provider messages', () => {
    const long = 'x'.repeat(1000)
    const msg = formatTTSError(googleBodyError(400, long), 'gemini')
    expect(msg.length).toBeLessThan(500)
    expect(msg).toContain('…')
  })

  it('still returns a bare message when nothing can be mapped', () => {
    expect(formatTTSError(new Error('something odd'), 'gemini')).toBe('something odd')
  })
})

describe('formatTTSError — ElevenLabs', () => {
  it('detects quota_exceeded from the SDK body', () => {
    const err = new Error('quota') as Error & { body: unknown }
    err.body = { detail: { status: 'quota_exceeded', message: 'You have 0 credits' } }

    expect(formatTTSError(err, 'elevenlabs')).toMatch(/quota exhausted/i)
    expect(isTTSQuotaError(err)).toBe(true)
  })

  it('keeps the provider name generic when no provider is given', () => {
    expect(formatTTSError(googleError(500, 'boom'))).toContain('TTS')
  })
})

describe('isTTSQuotaError', () => {
  it('is false for non-quota failures', () => {
    expect(isTTSQuotaError(googleError(429, 'rate limit exceeded'))).toBe(false)
    expect(isTTSQuotaError(new Error('nope'))).toBe(false)
    expect(isTTSQuotaError('not an error')).toBe(false)
  })
})
