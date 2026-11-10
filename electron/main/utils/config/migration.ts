/**
 * Config migration — handles legacy config shapes.
 *
 * Two kinds of migration happen here:
 *
 * 1. **Flat → nested** (`migrateFlat`)
 *    Early versions of Ultron stored settings as flat top-level keys
 *    (e.g. `apiKey`, `textModel`). They are moved into the current
 *    nested structure (e.g. `llm.apiKey`, `llm.textModel`).
 *
 * 2. **Single-slot TTS → per-provider TTS** (`migrateTTSProviders`)
 *    Older builds stored one set of TTS credentials (`tts.apiKey`,
 *    `tts.voiceId`, `tts.model`) for whichever provider was active.
 *    Those values are copied into `tts.providers.elevenlabs` so the
 *    existing credentials survive while Gemini gains its own slot.
 *
 * 3. **STT auto-listen opt-in** (`migrateSTTAutoListen`)
 *    Runtime microphone state is no longer implied by `stt.enabled`.
 *    Installations that had voice input enabled keep their previous
 *    "always listening" behaviour by opting into `stt.autoListen`.
 *
 * All migrations run once during `loadConfig()` and are safe to re-run
 * on already-migrated configs. Nothing is ever deleted from the user's
 * configuration — legacy keys are left in place.
 */

import { createLogger } from '@electron/utils/logger'

const log = createLogger('ConfigMigration')

/**
 * Mapping: old flat key → [nested group, nested key].
 *
 * When adding new migrations, just add entries here.
 */
const FLAT_TO_NESTED: Record<string, [string, string]> = {
  llmProvider:       ['llm', 'provider'],
  apiKey:            ['llm', 'apiKey'],
  baseURL:           ['llm', 'baseURL'],
  textModel:         ['llm', 'textModel'],
  visionModel:       ['llm', 'visionModel'],
  classifierModel:   ['llm', 'classifierModel'],
  geminiModel:       ['llm', 'textModel'],  // legacy name
  ttsProvider:       ['tts', 'provider'],
  ttsApiKey:         ['tts', 'apiKey'],
  ttsVoiceId:        ['tts', 'voiceId'],
  ttsModel:          ['tts', 'model'],
  ttsEnabled:        ['tts', 'enabled'],
  positionSide:      ['ui', 'positionSide'],
  openDevTools:      ['ui', 'openDevTools'],
  logLevel:          ['ui', 'logLevel'],
  chatTemperature:   ['generation', 'chatTemperature'],
  chatTopP:          ['generation', 'chatTopP'],
  chatTopK:          ['generation', 'chatTopK'],
  chatMaxTokens:     ['generation', 'chatMaxTokens'],
  visionTemperature: ['generation', 'visionTemperature'],
  visionMaxTokens:   ['generation', 'visionMaxTokens'],
}

/** Narrow an unknown value to a plain object (or an empty one). */
function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** Read a non-empty string, otherwise return '' */
function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Migrate old flat config keys to nested structure.
 *
 * Mutates `parsed` in place — moves flat keys into their nested groups
 * and deletes the original flat keys.
 *
 * @param parsed — raw JSON object from Config
 * @returns The same object with flat keys migrated
 */
export function migrateFlat(parsed: Record<string, unknown>): Record<string, unknown> {
  let migrated = false

  for (const [flatKey, [group, nestedKey]] of Object.entries(FLAT_TO_NESTED)) {
    if (flatKey in parsed && parsed[flatKey] !== undefined) {
      if (!parsed[group] || typeof parsed[group] !== 'object') {
        parsed[group] = {}
      }
      const groupObj = parsed[group] as Record<string, unknown>
      // Only migrate if the nested key is not already set
      if (!(nestedKey in groupObj) || groupObj[nestedKey] === '' || groupObj[nestedKey] === undefined) {
        groupObj[nestedKey] = parsed[flatKey]
      }
      delete parsed[flatKey]
      migrated = true
    }
  }

  if (migrated) {
    log.info('Migrated legacy flat config keys to nested structure')
  }

  return parsed
}

/**
 * Copy the legacy single-slot TTS credentials into per-provider slots.
 *
 * Only fills *empty* fields — a value the user already set for a specific
 * provider always wins. Legacy top-level keys are preserved as-is.
 *
 * @returns true when anything changed
 */
export function migrateTTSProviders(parsed: Record<string, unknown>): boolean {
  const tts = parsed.tts
  if (!tts || typeof tts !== 'object') return false

  const t = tts as Record<string, unknown>
  const provider = asString(t.provider) || 'elevenlabs'
  const legacyApiKey = asString(t.apiKey)
  const legacyVoiceId = asString(t.voiceId)
  const legacyModel = asString(t.model)

  let elevenlabsChanged = false
  let geminiChanged = false

  const providers = asObject(t.providers)
  const elevenlabs = asObject(providers.elevenlabs)
  const gemini = asObject(providers.gemini)

  // Legacy credentials were ElevenLabs' unless Gemini was the active provider.
  if (provider !== 'gemini') {
    if (!asString(elevenlabs.apiKey) && legacyApiKey) {
      elevenlabs.apiKey = legacyApiKey
      elevenlabsChanged = true
    }
    if (!asString(elevenlabs.voiceId) && legacyVoiceId) {
      elevenlabs.voiceId = legacyVoiceId
      elevenlabsChanged = true
    }
    if (!asString(elevenlabs.model) && legacyModel) {
      elevenlabs.model = legacyModel
      elevenlabsChanged = true
    }
  } else {
    // A user who had already pasted a Gemini key into the single slot keeps it.
    if (!asString(gemini.apiKey) && legacyApiKey) {
      gemini.apiKey = legacyApiKey
      geminiChanged = true
    }
    if (!asString(gemini.model) && legacyModel) {
      gemini.model = legacyModel
      geminiChanged = true
    }
  }

  const changed = elevenlabsChanged || geminiChanged

  if (changed) {
    // Only write the slots that actually changed, so an untouched provider
    // keeps whatever shape/defaults it already had.
    const nextProviders: Record<string, unknown> = { ...providers }
    if (elevenlabsChanged) nextProviders.elevenlabs = elevenlabs
    if (geminiChanged) nextProviders.gemini = gemini
    t.providers = nextProviders
    log.info(`Migrated legacy TTS credentials into per-provider config (active: ${provider})`)
  }

  return changed
}

/**
 * Preserve the old "voice input is always on" behaviour as an explicit opt-in.
 *
 * Before per-widget microphone control existed, `stt.enabled: true` meant the
 * microphone started with the app. Runtime capture is now explicit, so existing
 * installations that had STT enabled opt into auto-listen instead of silently
 * losing the behaviour. New installations default to `false`.
 *
 * @returns true when anything changed
 */
export function migrateSTTAutoListen(parsed: Record<string, unknown>): boolean {
  const stt = parsed.stt
  if (!stt || typeof stt !== 'object') return false

  const s = stt as Record<string, unknown>
  if ('autoListen' in s) return false
  if (s.enabled !== true) return false

  s.autoListen = true
  log.info('Migrated STT: autoListen enabled to preserve existing always-listening behaviour')
  return true
}

/**
 * Run every config migration in order.
 *
 * @param parsed — raw JSON object from Config
 * @returns The same object, migrated in place
 */
export function migrateConfig(parsed: Record<string, unknown>): Record<string, unknown> {
  migrateFlat(parsed)
  migrateTTSProviders(parsed)
  migrateSTTAutoListen(parsed)
  return parsed
}
