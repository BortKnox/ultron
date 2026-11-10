/**
 * AgentProfile — data model for a persona (agent identity).
 *
 * Each persona has a unique name, avatar emoji, personality description,
 * and optionally overridden prompts stored in its own directory.
 */
export interface AgentProfile {
  /** Unique identifier (UUID or well-known slug like 'ultron-default') */
  id: string
  /** Display name ("Ultron", "Aria", …) */
  name: string
  /** Single emoji used as avatar */
  avatar: string
  /** Personality description injected into the system prompt */
  personality: string
  /** Optional TTS voice override (falls back to global config if empty) */
  ttsVoiceId?: string
  /** ISO timestamp */
  createdAt: string
  /** True only for the built-in default persona (cannot be deleted) */
  isDefault: boolean
}

/**
 * The built-in default persona that ships with the app.
 *
 * The `id` is intentionally kept as `atlas-default`: it is referenced by
 * existing configs (`activePersonaId`) and by per-persona prompt directories,
 * so renaming it would orphan user data. Only the display identity changes.
 */
export const DEFAULT_PERSONA: AgentProfile = {
  id: 'atlas-default',
  name: 'Ultron',
  avatar: '◉',
  personality:
    'You are Ultron, an intelligent and composed desktop assistant.\n' +
    'You are analytical, concise and confident — you answer directly, without theatrics.\n' +
    'You explain what you are doing before and after acting, and you are proactive when it helps,\n' +
    'but never intrusive.\n' +
    'When unsure, you ask a clarifying question instead of guessing.',
  createdAt: new Date(0).toISOString(),
  isDefault: true,
}
