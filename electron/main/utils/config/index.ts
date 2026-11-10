/**
 * Config module — persistent app settings with load/save.
 *
 * Public API:
 * - `loadConfig()` — reads Config from userData, merges with defaults
 * - `saveConfig(partial)` — merges partial updates, writes to disk
 * - `getConfig()` — returns current in-memory config (singleton)
 *
 * First launch: file doesn't exist → defaults are used and saved.
 *
 * Re-exports all types from schema for convenience:
 * ```ts
 * import { getConfig, type AppConfig } from '@electron/utils/config'
 * ```
 */

import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { createLogger } from '@electron/utils/logger'
import type { AppConfig, DeepPartial } from './schema'
import { defaultConfig } from './defaults'
import { migrateConfig } from './migration'

const log = createLogger('Config')

// ── Re-exports ──
export type {
  AppConfig,
  UIConfig,
  LLMConfig,
  GenerationConfig,
  TTSConfig,
  TTSProvidersConfig,
  ElevenLabsTTSConfig,
  GeminiTTSConfig,
  STTConfig,
  AgentConfig,
  DeepPartial,
} from './schema'
export { defaultConfig } from './defaults'

// ── Singleton ──

let currentConfig: AppConfig = structuredClone(defaultConfig)

/** Path to Config in userData */
function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'Config')
}

/** True for plain objects (not arrays, not class instances) */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Recursively merge `source` into `target`.
 *
 * Nested groups (e.g. `tts.providers.gemini`) are merged key-by-key instead of
 * being replaced wholesale, so a partial save never drops sibling values and
 * newly added defaults always reach existing configs. `undefined` values in
 * `source` are ignored; arrays are treated as values and replaced.
 */
function mergeConfig(target: unknown, source: unknown): unknown {
  if (!isPlainObject(target) || !isPlainObject(source)) return source

  const result: Record<string, unknown> = { ...target }
  for (const [key, val] of Object.entries(source)) {
    if (val === undefined) continue
    result[key] = isPlainObject(val) && isPlainObject(target[key])
      ? mergeConfig(target[key], val)
      : val
  }
  return result
}

/** Deep-merge a partial config into the given base config */
function merge(target: AppConfig, source: DeepPartial<AppConfig>): AppConfig {
  return mergeConfig(target, source) as AppConfig
}

// ── Public API ──

/** Load config from disk, merge with defaults. Call once on startup. */
export function loadConfig(): AppConfig {
  const filePath = getConfigPath()
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      let parsed = JSON.parse(raw)
      parsed = migrateConfig(parsed)
      currentConfig = merge(defaultConfig, parsed)
      saveConfig({}) // persist any new default fields + clean migrated keys
      log.info('Loaded config from', filePath)
    } else {
      currentConfig = structuredClone(defaultConfig)
      saveConfig({}) // persist defaults on first launch
      log.info('No config found, using defaults')
    }
  } catch (err) {
    log.error('Failed to load config, using defaults:', err)
    currentConfig = structuredClone(defaultConfig)
  }
  return currentConfig
}

/** Save partial config updates to disk. */
export function saveConfig(partial: DeepPartial<AppConfig>): void {
  currentConfig = merge(currentConfig, partial)
  const filePath = getConfigPath()
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, JSON.stringify(currentConfig, null, 2), 'utf-8')
    log.debug('Config saved to', filePath)
  } catch (err) {
    log.error('Failed to save config:', err)
  }
}

/** Get current in-memory config (returns singleton). */
export function getConfig(): AppConfig {
  return currentConfig
}
