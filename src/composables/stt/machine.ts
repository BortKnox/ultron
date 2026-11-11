export type SttState = 'off' | 'arming' | 'live' | 'listening' | 'error'

export type SttEvent =
  | { type: 'MIC_ON' }
  | { type: 'MIC_OFF' }
  | { type: 'ORB_CLICK' }
  | { type: 'ARMED' }
  | { type: 'ARM_FAILED'; reason: string }
  | { type: 'WAKE_WORD'; text: string }
  | { type: 'PARTIAL'; text: string }
  | { type: 'FINAL'; text: string }
  | { type: 'SILENCE' }
  | { type: 'SUBMITTED' }
  | { type: 'AGENT_IDLE' }
  | { type: 'TTS_STARTED' }
  | { type: 'TTS_ENDED' }
  | { type: 'HARDWARE_LOST'; reason: string }
  | { type: 'WINDOW_HIDDEN' }
  | { type: 'WINDOW_SHOWN' }

export type SttEffect =
  | { type: 'ACQUIRE' }
  | { type: 'RELEASE' }
  | { type: 'START_LISTENING' }
  | { type: 'STOP_LISTENING' }
  | { type: 'SUBMIT' }
  | { type: 'SHOW_WINDOW' }

export interface SttContext {
  micArmed: boolean
  autoListen: boolean
  error: string
}

export interface SttTransition {
  state: SttState
  effects: SttEffect[]
  error?: string
}

const stay = (state: SttState): SttTransition => ({ state, effects: [] })

/**
 * Pure STT lifecycle reducer. It contains no Vue, Electron, Web Audio, or API
 * dependencies; the composable executes its declarative effects.
 *
 * PR-2 intentionally preserves the baseline hot-capture behavior: submitting
 * a command returns to `live`, not `off`, and only an explicit microphone-off
 * or hardware failure releases the capture resources.
 */
export function reduce(state: SttState, _ctx: SttContext, event: SttEvent): SttTransition {
  switch (event.type) {
    case 'MIC_ON':
      return state === 'off'
        ? { state: 'arming', effects: [{ type: 'ACQUIRE' }] }
        : stay(state)

    case 'ARMED':
      return state === 'arming'
        ? { state: 'live', effects: [] }
        : stay(state)

    case 'ARM_FAILED':
      return state === 'arming'
        ? { state: 'error', effects: [], error: event.reason }
        : stay(state)

    case 'MIC_OFF':
      return state === 'off'
        ? stay(state)
        : { state: 'off', effects: [{ type: 'RELEASE' }, { type: 'STOP_LISTENING' }] }

    case 'WAKE_WORD':
      return state === 'live'
        ? { state: 'listening', effects: [{ type: 'SHOW_WINDOW' }, { type: 'START_LISTENING' }] }
        : stay(state)

    case 'PARTIAL':
    case 'FINAL':
      return state === 'listening' ? stay(state) : stay(state)

    case 'SILENCE':
      return state === 'listening'
        ? { state: 'live', effects: [{ type: 'SUBMIT' }, { type: 'STOP_LISTENING' }] }
        : stay(state)

    case 'SUBMITTED':
      return state === 'listening'
        ? { state: 'live', effects: [{ type: 'STOP_LISTENING' }] }
        : stay(state)

    case 'HARDWARE_LOST':
      return state === 'off'
        ? stay(state)
        : { state: 'error', effects: [{ type: 'RELEASE' }, { type: 'STOP_LISTENING' }], error: event.reason }

    case 'WINDOW_HIDDEN':
      return state === 'listening'
        ? { state: 'live', effects: [{ type: 'STOP_LISTENING' }] }
        : stay(state)

    case 'WINDOW_SHOWN':
      return state === 'live' && _ctx.autoListen
        ? { state: 'listening', effects: [{ type: 'START_LISTENING' }] }
        : stay(state)

    case 'ORB_CLICK':
    case 'AGENT_IDLE':
    case 'TTS_STARTED':
    case 'TTS_ENDED':
      return stay(state)
  }
}
