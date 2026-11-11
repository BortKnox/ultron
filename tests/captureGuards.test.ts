import { describe, expect, it } from 'vitest'
import {
  ARM_FRAME_GRACE_MS,
  CAPTURE_FRAME_TIMEOUT_MS,
  isCurrentGeneration,
  watchdogStage,
} from '@/composables/stt/captureGuards'

describe('STT capture guards', () => {
  it('accepts the current capture generation', () => {
    expect(isCurrentGeneration(7, 7)).toBe(true)
  })

  it('rejects a stale capture generation', () => {
    expect(isCurrentGeneration(6, 7)).toBe(false)
  })

  it('does not fire the arm watchdog before the five-second grace period', () => {
    expect(watchdogStage(4999, 0, 0, false)).toBeNull()
  })

  it('fires the arm watchdog after five seconds without a frame', () => {
    expect(watchdogStage(ARM_FRAME_GRACE_MS, 0, 0, false)).toBe('no-audio-frames-during-arm')
  })

  it('does not fire the capture watchdog immediately after a frame', () => {
    expect(watchdogStage(999, 0, 0, true)).toBeNull()
  })

  it('fires the capture watchdog after one second without a frame', () => {
    expect(watchdogStage(CAPTURE_FRAME_TIMEOUT_MS, 0, 0, true)).toBe('no-audio-frames-during-capture')
  })
})
