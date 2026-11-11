export const ARM_FRAME_GRACE_MS = 5000
export const CAPTURE_FRAME_TIMEOUT_MS = 1000

export type WatchdogStage = 'no-audio-frames-during-arm' | 'no-audio-frames-during-capture'

export function isCurrentGeneration(startGeneration: number, currentGeneration: number): boolean {
  return startGeneration === currentGeneration
}

export function watchdogStage(
  now: number,
  armedAt: number,
  lastFrameAt: number,
  hasReceivedFrame: boolean,
): WatchdogStage | null {
  if (!hasReceivedFrame && now - armedAt >= ARM_FRAME_GRACE_MS) {
    return 'no-audio-frames-during-arm'
  }
  if (hasReceivedFrame && now - lastFrameAt >= CAPTURE_FRAME_TIMEOUT_MS) {
    return 'no-audio-frames-during-capture'
  }
  return null
}
