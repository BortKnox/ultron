import { describe, expect, it } from 'vitest'
import { reduce, type SttContext, type SttEvent, type SttState } from '@/composables/stt/machine'

const base: SttContext = { micArmed: true, autoListen: false, hardwareActive: true, error: '' }

function transition(state: SttState, event: SttEvent, context: SttContext = base) {
  return reduce(state, context, event)
}

describe('STT machine', () => {
  const cases: Array<[string, SttState, SttEvent, SttState, string[]]> = [
    ['off ignores duplicate off', 'off', { type: 'MIC_OFF' }, 'off', []],
    ['off arms on mic on', 'off', { type: 'MIC_ON' }, 'arming', ['ACQUIRE']],
    ['arming becomes live when armed', 'arming', { type: 'ARMED' }, 'live', []],
    ['arming reports an error', 'arming', { type: 'ARM_FAILED', reason: 'permission denied' }, 'error', []],
    ['error stays error on unrelated input', 'error', { type: 'PARTIAL', text: 'hello' }, 'error', []],
    ['arming turns off cleanly', 'arming', { type: 'MIC_OFF' }, 'off', ['RELEASE', 'STOP_LISTENING']],
    ['live turns off cleanly', 'live', { type: 'MIC_OFF' }, 'off', ['RELEASE', 'STOP_LISTENING']],
    ['listening turns off cleanly', 'listening', { type: 'MIC_OFF' }, 'off', ['RELEASE', 'STOP_LISTENING']],
    ['error turns off cleanly', 'error', { type: 'MIC_OFF' }, 'off', ['RELEASE', 'STOP_LISTENING']],
    ['live accepts a wake word', 'live', { type: 'WAKE_WORD', text: 'ultron hello' }, 'listening', ['SHOW_WINDOW', 'START_LISTENING']],
    ['live ignores partial text without wake word', 'live', { type: 'PARTIAL', text: 'hello' }, 'live', []],
    ['live ignores final text without wake word', 'live', { type: 'FINAL', text: 'hello' }, 'live', []],
    ['listening accepts partial text', 'listening', { type: 'PARTIAL', text: 'hello' }, 'listening', []],
    ['listening accepts final text', 'listening', { type: 'FINAL', text: 'hello' }, 'listening', []],
    ['listening submits explicitly', 'listening', { type: 'SUBMITTED' }, 'live', ['STOP_LISTENING']],
    ['live ignores submitted', 'live', { type: 'SUBMITTED' }, 'live', []],
    ['off ignores wake word', 'off', { type: 'WAKE_WORD', text: 'ultron hello' }, 'off', []],
    ['arming ignores wake word', 'arming', { type: 'WAKE_WORD', text: 'ultron hello' }, 'arming', []],
    ['off ignores orb click when microphone is off', 'off', { type: 'ORB_CLICK' }, 'off', []],
    ['live orb click starts a command session', 'live', { type: 'ORB_CLICK' }, 'listening', ['START_LISTENING']],
    ['listening ignores duplicate orb click', 'listening', { type: 'ORB_CLICK' }, 'listening', []],
    ['live stays live after agent idle', 'live', { type: 'AGENT_IDLE' }, 'live', []],
    ['listening stays listening after agent idle', 'listening', { type: 'AGENT_IDLE' }, 'listening', []],
    ['live ignores TTS start', 'live', { type: 'TTS_STARTED' }, 'live', []],
    ['listening ignores TTS end', 'listening', { type: 'TTS_ENDED' }, 'listening', []],
    ['hidden listening returns to live', 'listening', { type: 'WINDOW_HIDDEN' }, 'live', ['STOP_LISTENING']],
    ['hidden live remains live', 'live', { type: 'WINDOW_HIDDEN' }, 'live', []],
    ['shown live stays live when auto listen is off', 'live', { type: 'WINDOW_SHOWN' }, 'live', []],
    ['hardware failure releases live capture', 'live', { type: 'HARDWARE_LOST', reason: 'no audio frames' }, 'off', ['RELEASE', 'STOP_LISTENING']],
    ['hardware failure releases listening capture', 'listening', { type: 'HARDWARE_LOST', reason: 'track ended' }, 'off', ['RELEASE', 'STOP_LISTENING']],
    ['hardware failure releases arming capture', 'arming', { type: 'HARDWARE_LOST', reason: 'context closed' }, 'off', ['RELEASE', 'STOP_LISTENING']],
    ['hardware failure is harmless when already off', 'off', { type: 'HARDWARE_LOST', reason: 'track ended' }, 'off', []],
  ]

  it.each(cases)('%s', (_name, state, event, expectedState, expectedEffects) => {
    const result = transition(state, event)
    expect(result.state).toBe(expectedState)
    expect(result.effects.map((effect) => effect.type)).toEqual(expectedEffects)
  })

  it('preserves an error reason from arming failure', () => {
    expect(transition('arming', { type: 'ARM_FAILED', reason: 'No microphone' }).error).toBe('No microphone')
  })

  it('preserves an error reason from hardware failure', () => {
    expect(transition('live', { type: 'HARDWARE_LOST', reason: 'AudioContext closed' }).error).toBe('AudioContext closed')
  })

  it('can be re-enabled after a failed arm', () => {
    const failed = transition('arming', { type: 'ARM_FAILED', reason: 'permission denied' })
    expect(failed.state).toBe('error')

    const stopped = transition(failed.state, { type: 'MIC_OFF' })
    expect(stopped.state).toBe('off')

    const retry = transition(stopped.state, { type: 'MIC_ON' })
    expect(retry.state).toBe('arming')
    expect(retry.effects.map((effect) => effect.type)).toEqual(['ACQUIRE'])
  })

  it('can recover from a stuck arming state by turning capture off first', () => {
    const stopped = transition('arming', { type: 'MIC_OFF' })
    expect(stopped.state).toBe('off')
    expect(stopped.effects.map((effect) => effect.type)).toEqual(['RELEASE', 'STOP_LISTENING'])

    const retry = transition(stopped.state, { type: 'MIC_ON' })
    expect(retry.state).toBe('arming')
  })

  it('starts a session when a live capture is shown with auto-listen enabled', () => {
    const result = transition('live', { type: 'WINDOW_SHOWN' }, { ...base, autoListen: true })
    expect(result.state).toBe('listening')
    expect(result.effects.map((effect) => effect.type)).toEqual(['START_LISTENING'])
  })

  it('cannot enter listening without hardwareActive', () => {
    const result = transition('live', { type: 'WAKE_WORD', text: 'ultron hello' }, { ...base, hardwareActive: false })
    expect(result.state).toBe('live')
    expect(result.effects).toEqual([])
  })

  it('cannot start an orb command session without hardwareActive', () => {
    const result = transition('live', { type: 'ORB_CLICK' }, { ...base, hardwareActive: false })
    expect(result.state).toBe('live')
    expect(result.effects).toEqual([])
  })
})
