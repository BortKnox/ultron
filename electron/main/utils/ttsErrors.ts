/**
 * ttsErrors — unified TTS error parsing and formatting.
 *
 * Mirrors {@link formatLLMError} pattern for TTS providers.
 * Extracts meaningful messages from provider SDK errors
 * (ElevenLabs quota_exceeded, Gemini INVALID_ARGUMENT / RESOURCE_EXHAUSTED,
 * network failures) and maps them to actionable strings.
 *
 * ## Why the raw detail is appended
 *
 * A mapped message on its own ("Gemini rejected the request") tells the user
 * nothing they can act on. Every mapped message therefore carries the provider's
 * own words in parentheses, truncated. The full, untruncated error is logged by
 * the caller (`logRawGeminiError`), so the terminal has the complete picture
 * while the UI stays readable.
 */

/** Provider identifiers used to pick a message set */
export type TTSProviderName = 'elevenlabs' | 'yandex-alice' | 'gemini'

/** Human-facing provider labels (used inside error messages) */
const PROVIDER_LABELS: Record<string, string> = {
  elevenlabs: 'ElevenLabs',
  'yandex-alice': 'Yandex Alice',
  gemini: 'Gemini',
}

/** Longest provider detail echoed into a user-facing message */
const MAX_DETAIL_LENGTH = 240

/**
 * Known TTS error status → user-facing message key.
 */
const STATUS_MESSAGES: Record<string, string> = {
  '400': 'tts.error.bad_request',
  '401': 'tts.error.auth_failed',
  '403': 'tts.error.permission_denied',
  '404': 'tts.error.model_not_found',
  '429': 'tts.error.rate_limit',
  '500': 'tts.error.internal',
  '503': 'tts.error.unavailable',
}

/**
 * Fallback messages for error keys (used until i18n is integrated).
 * `{provider}` is replaced with the provider's display label.
 */
const TTS_FALLBACK_MESSAGES: Record<string, string> = {
  'tts.error.quota_exceeded': '{provider} quota exhausted. Voice output is paused until credits reset. You can dismiss this warning.',
  'tts.error.auth_failed': '{provider} authentication failed. Check your API key in Settings → Voice.',
  'tts.error.permission_denied': '{provider} rejected the API key or its permissions. Check your key in Settings → Voice.',
  'tts.error.bad_request': '{provider} rejected the request. Check the selected model and voice in Settings → Voice.',
  'tts.error.model_not_found': '{provider} does not recognise that model or voice. Pick a supported option in Settings → Voice.',
  'tts.error.rate_limit': '{provider} rate limit exceeded. Voice output will resume shortly.',
  'tts.error.internal': '{provider} API error. Voice output is temporarily unavailable.',
  'tts.error.unavailable': '{provider} is temporarily unavailable. Voice output will resume when the service is back.',
  'tts.error.network': 'Could not reach {provider}. Check your internet connection and try again.',
  'tts.error.empty_response': '{provider} returned no audio. Try a different voice or a shorter response.',
  'tts.error.no_api_key': 'No {provider} API key configured. Add one in Settings → Voice.',
  'tts.error.unknown': 'Unknown {provider} error. Check logs for details.',
}

function providerLabel(provider?: string): string {
  if (!provider) return 'TTS'
  return PROVIDER_LABELS[provider] ?? provider
}

function resolveMessage(key: string, provider?: string): string {
  const template = TTS_FALLBACK_MESSAGES[key] ?? key
  return template.replace('{provider}', providerLabel(provider))
}

/** Collect every searchable string from an arbitrary SDK error object */
function collectErrorText(err: unknown): string {
  const parts: string[] = []
  const walk = (value: unknown, depth: number): void => {
    if (depth > 3 || value == null) return
    if (typeof value === 'string') { parts.push(value); return }
    if (value instanceof Error) { parts.push(value.message); return }
    if (typeof value === 'object') {
      for (const v of Object.values(value as Record<string, unknown>)) walk(v, depth + 1)
    }
  }
  walk(err, 0)
  return parts.join(' ').toLowerCase()
}

/** True when the error looks like a network/transport failure */
function isNetworkError(err: unknown, text: string): boolean {
  if (err instanceof TypeError) return true
  return (
    text.includes('fetch failed') ||
    text.includes('enotfound') ||
    text.includes('econnrefused') ||
    text.includes('etimedout') ||
    text.includes('network error') ||
    text.includes('socket hang up')
  )
}

/**
 * Extract the provider's own message, untouched by our mapping.
 *
 * Google SDK errors carry the payload at `error.body.error.message` (or
 * `error.response.data.error.message`); ElevenLabs uses `error.body.detail`.
 */
export function getTTSErrorDetail(err: unknown): string | undefined {
  if (!(err instanceof Error)) {
    return typeof err === 'string' && err.trim() ? err.trim() : undefined
  }

  const obj = err as unknown as Record<string, unknown>
  const response = obj.response as Record<string, unknown> | undefined
  const body = (obj.body ?? response?.data ?? response) as Record<string, unknown> | undefined
  const bodyError = body?.error as Record<string, unknown> | undefined

  const candidates: unknown[] = [
    bodyError?.message,
    body?.message,
    err.message,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }

  return undefined
}

/** Append the provider's detail to a mapped message, unless it adds nothing */
function withDetail(mapped: string, err: unknown, skip: boolean): string {
  const detail = getTTSErrorDetail(err)
  if (skip || !detail) return mapped

  // Do not repeat what the mapped message already says, and do not echo the
  // generic SDK wrapper ("400 status code (no body)" adds nothing).
  if (mapped.toLowerCase().includes(detail.toLowerCase())) return mapped
  if (/^(4|5)\d\d status code/i.test(detail) && !detail.includes(':')) return mapped

  const clipped = detail.length > MAX_DETAIL_LENGTH
    ? `${detail.slice(0, MAX_DETAIL_LENGTH - 1)}…`
    : detail

  return `${mapped} — ${clipped}`
}

/**
 * Map any TTS SDK error into a clean, actionable message.
 *
 * Handles:
 * - ElevenLabs quota_exceeded (body.detail.status)
 * - Gemini/Google API errors (INVALID_ARGUMENT, RESOURCE_EXHAUSTED, 404)
 * - HTTP status codes (400, 401, 403, 404, 429, 500, 503)
 * - Network failures
 * - Generic Error objects
 *
 * The provider's own wording is appended where available, so the user sees
 * "Gemini rejected the request … — API key not valid" rather than a bare
 * rejection.
 *
 * @param err — raw error from a TTS SDK call
 * @param provider — provider id, used to name the service in the message
 * @returns A clean, actionable error message
 */
export function formatTTSError(err: unknown, provider?: string): string {
  if (!(err instanceof Error)) {
    return String(err)
  }

  const message = err.message || ''
  const errObj = err as unknown as Record<string, unknown>
  const text = collectErrorText(err)

  // ── Network / transport ──
  if (isNetworkError(err, text)) {
    return resolveMessage('tts.error.network', provider)
  }

  // ── ElevenLabs quota_exceeded ──
  // ElevenLabs SDK errors have a `body` property with { detail: { status, message } }
  const body = errObj.body as Record<string, unknown> | undefined
  if (body) {
    const detail = body.detail as Record<string, unknown> | undefined
    if (detail?.status === 'quota_exceeded') {
      return withDetail(resolveMessage('tts.error.quota_exceeded', provider), err, false)
    }
  }

  // ── Quota (both ElevenLabs and Google wording) ──
  if (
    text.includes('quota_exceeded') ||
    text.includes('resource_exhausted') ||
    text.includes('exceeded your current quota') ||
    text.includes('quota exceeded')
  ) {
    return withDetail(resolveMessage('tts.error.quota_exceeded', provider), err, false)
  }

  // ── Gemini: rejected credentials / invalid arguments ──
  if (text.includes('api key not valid') || text.includes('api_key_invalid')) {
    return withDetail(resolveMessage('tts.error.auth_failed', provider), err, false)
  }
  if (text.includes('permission_denied') && text.includes('api key')) {
    return withDetail(resolveMessage('tts.error.permission_denied', provider), err, false)
  }

  // ── HTTP status code from error object ──
  const statusCode = errObj.statusCode ?? errObj.status ?? errObj.code
  if (typeof statusCode === 'number') {
    const key = STATUS_MESSAGES[String(statusCode)]
    if (key) return withDetail(resolveMessage(key, provider), err, false)
  }

  // ── Status codes / Google status names embedded in the message ──
  for (const [code, key] of Object.entries(STATUS_MESSAGES)) {
    if (message.includes(code)) {
      return withDetail(resolveMessage(key, provider), err, false)
    }
  }
  if (text.includes('not_found') || text.includes('not found')) {
    return withDetail(resolveMessage('tts.error.model_not_found', provider), err, false)
  }
  if (text.includes('invalid_argument')) {
    return withDetail(resolveMessage('tts.error.bad_request', provider), err, false)
  }

  // Fall through to the raw message
  return message || resolveMessage('tts.error.unknown', provider)
}

/**
 * Check if a TTS error indicates quota exhaustion.
 *
 * Useful for deciding whether to auto-disable TTS
 * to avoid spamming failed requests.
 */
export function isTTSQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false

  const errObj = err as unknown as Record<string, unknown>
  const body = errObj.body as Record<string, unknown> | undefined
  const detail = body?.detail as Record<string, unknown> | undefined
  const text = collectErrorText(err)

  return (
    detail?.status === 'quota_exceeded' ||
    text.includes('quota_exceeded') ||
    text.includes('exceeded your current quota')
  )
}
