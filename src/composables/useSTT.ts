import { ref, computed } from 'vue'
import { api } from '@/api'
import { useAgent } from './useAgent'
import { usePersonas } from './usePersonas'
import { stopPlayback } from './useTTS'
import { reduce, type SttEffect, type SttEvent, type SttState } from './stt/machine'

/**
 * useSTT — voice-first speech-to-text composable.
 *
 * ## Microphone lifecycle (explicit)
 *
 * Capture is a **runtime** state, never restored from disk:
 * - `enable()` opens the microphone (loads the Vosk model first)
 * - `disable()` closes it and releases the audio device
 * - Nothing starts capture on launch unless `stt.autoListen` is enabled
 *
 * `micActive` reflects the real capture state, so the widget button and the
 * microphone hardware can never disagree.
 *
 * ## Flow when the microphone is on
 *
 * 1. Vosk runs continuously in the background
 * 2. Detects wake word (persona name) in transcript
 * 3. Window appears → ListeningIsland shows animated transcript
 * 4. Silence timer auto-submits command after ~0.7–1.5s pause
 * 5. Tray/hotkey opens the window → auto-activate only when `autoListen` is on
 * 6. Wake word during TTS → interrupt + new command
 */

// ── State ──

const phase = ref<SttState>('off')
const transcript = ref('')
const chunks = ref<string[]>([])
const isModelLoaded = ref(false)
const isModelLoading = ref(false)
/** Human-readable reason the microphone could not be enabled */
const micError = ref('')
/** Explicit opt-in for hands-free operation (mirrors config.stt.autoListen) */
const autoListen = ref(false)

// ── Internals ──

let model: any = null
let recognizer: any = null
let audioContext: AudioContext | null = null
let mediaStream: MediaStream | null = null
let sourceNode: MediaStreamAudioSourceNode | null = null
let silenceTimer: ReturnType<typeof setTimeout> | null = null
let ttsSpeaking = false
let lastSubmitTime = 0
let lastSubmitText = ''

const SILENCE_BASE = 700
const SILENCE_MAX = 1500

function dispatch(event: SttEvent): SttEffect[] {
  const transition = reduce(phase.value, {
    micArmed: phase.value !== 'off',
    autoListen: autoListen.value,
    error: micError.value,
  }, event)
  phase.value = transition.state
  if (transition.error) micError.value = transition.error

  for (const effect of transition.effects) {
    switch (effect.type) {
      case 'START_LISTENING':
        api.audio.startListening.mutate().catch(() => {})
        break
      case 'STOP_LISTENING':
        api.audio.stopListening.mutate().catch(() => {})
        break
      case 'SHOW_WINDOW':
        api.system.showWindow.mutate().catch(() => {})
        break
      case 'SUBMIT':
      case 'ACQUIRE':
      case 'RELEASE':
        // ACQUIRE/RELEASE are executed by enable()/stopMic(), which own the
        // asynchronous hardware lifecycle. SUBMIT is executed by the caller.
        break
    }
  }
  return transition.effects
}

// ── TTS coordination ──

let ttsSubscribed = false

function initTTSWatch() {
  if (ttsSubscribed) return
  ttsSubscribed = true

  api.audio.onTTSStatus.subscribe(undefined, {
    onData(data: { speaking: boolean }) {
      ttsSpeaking = data.speaking
      // DON'T suspend mic during TTS — we need to hear the wake word for interrupt
    },
  })
}

// ── Visibility: auto-activate when shown via tray/hotkey ──

let visibilitySubscribed = false

function initVisibilityWatch() {
  if (visibilitySubscribed) return
  visibilitySubscribed = true

  let isFirst = true
  api.system.onAgentVisibility.subscribe(undefined, {
    onData(visible: boolean) {
      // Skip the initial `true` emitted on subscription connect
      if (isFirst) { isFirst = false; return }

      if (visible && phase.value === 'live' && autoListen.value) {
        // Hands-free mode only — otherwise showing the widget never starts listening
        activateWithoutWakeWord()
      } else if (!visible && phase.value === 'listening') {
        // Agent hidden — cancel active listening, return to wake word mode
        clearSilenceTimer()
        dispatch({ type: 'WINDOW_HIDDEN' })
        transcript.value = ''
        chunks.value = []
        console.info('[useSTT] Deactivated — agent hidden')
      }
    },
  })
}

function activateWithoutWakeWord(): void {
  dispatch({ type: 'WINDOW_SHOWN' })
  transcript.value = ''
  chunks.value = []
  console.info('[useSTT] Activated via tray/hotkey (auto-listen)')
}

initTTSWatch()

// ── Model ──

async function loadModel(): Promise<void> {
  if (model) return

  isModelLoading.value = true
  try {
    const status = await api.audio.getSTTModelStatus.query()
    if (!status.downloaded) {
      throw new Error('Speech model not downloaded. Open Settings → Voice and download it first.')
    }

    const Vosk = await import('vosk-browser')
    const { language } = (await api.settings.getConfig.query()).stt

    model = await Vosk.createModel(`stt-model://${language}.zip`)
    isModelLoaded.value = true
    console.info('[useSTT] Model loaded')
  } catch (err) {
    console.error('[useSTT] Failed to load model:', err)
    isModelLoaded.value = false
    throw err
  } finally {
    isModelLoading.value = false
  }
}

// ── Mic lifecycle ──

async function startMic(): Promise<void> {
  try {
    if (!model) await loadModel()
    if (!model) throw new Error('Speech model failed to load.')

    const sampleRate = 16000

    recognizer = new model.KaldiRecognizer(sampleRate)
    recognizer.on('result', onResult)
    recognizer.on('partialresult', onPartialResult)

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: { ideal: sampleRate },
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })

    audioContext = new AudioContext({ sampleRate })
    sourceNode = audioContext.createMediaStreamSource(mediaStream)

    // Use AudioWorklet if available (off-main-thread), fallback to ScriptProcessor
    await audioContext.audioWorklet.addModule(createWorkletBlob())
    const workletNode = new AudioWorkletNode(audioContext, 'stt-processor')
    workletNode.port.onmessage = (e) => {
      if (!recognizer) return
      // During TTS: only process audio for wake word detection (live phase)
      // Skip feeding audio when actively listening to avoid TTS echo
      if (ttsSpeaking && phase.value !== 'live') return

      const samples = e.data as Float32Array
      const buf = audioContext!.createBuffer(1, samples.length, sampleRate)
      buf.getChannelData(0).set(samples)
      recognizer.acceptWaveform(buf)
    }
    sourceNode.connect(workletNode)
    workletNode.connect(audioContext.destination)

    dispatch({ type: 'ARMED' })
    initVisibilityWatch()
    console.info('[useSTT] Mic started, listening for wake word...')
  } catch (err) {
    const reason = describeMicError(err)
    dispatch({ type: 'ARM_FAILED', reason })
    throw err
  }
}

async function stopMic(): Promise<void> {
  clearSilenceTimer()

  dispatch({ type: 'MIC_OFF' })

  const oldContext = audioContext
  sourceNode?.disconnect()
  sourceNode = null
  audioContext = null

  // Releasing the tracks is what actually turns the microphone off
  mediaStream?.getTracks().forEach((t) => t.stop())
  mediaStream = null

  recognizer?.remove()
  recognizer = null

  transcript.value = ''
  chunks.value = []
  // Always close the captured context. A second stop can be issued after the
  // reducer is already `off`, but the baseline resource teardown must remain
  // idempotent and unconditional.
  if (oldContext) {
    await oldContext.close().catch(() => {})
  }
}

// ── AudioWorklet (inlined as blob) ──

function createWorkletBlob(): string {
  const code = `
    class STTProcessor extends AudioWorkletProcessor {
      process(inputs) {
        const input = inputs[0]
        if (input && input[0] && input[0].length > 0) {
          this.port.postMessage(input[0])
        }
        return true
      }
    }
    registerProcessor('stt-processor', STTProcessor)
  `
  return URL.createObjectURL(new Blob([code], { type: 'application/javascript' }))
}

// ── Wake word + transcript handling ──

function getWakeWord(): string {
  const { activePersona } = usePersonas()
  const name = (activePersona.value?.name || 'ultron').toLowerCase()
  return name
}

function onPartialResult(msg: any): void {
  const partial: string = msg?.result?.partial || msg?.partial || ''
  if (!partial) return

  // Ignore stale events right after submit
  if (Date.now() - lastSubmitTime < 500) return

  if (phase.value === 'live') {
    if (partial.toLowerCase().includes(getWakeWord())) {
      activate(partial)
    }
  } else if (phase.value === 'listening') {
    const clean = stripWakeWord(partial)
    if (clean) {
      dispatch({ type: 'PARTIAL', text: clean })
      transcript.value = clean
      resetSilenceTimer()
    }
  }
}

function onResult(msg: any): void {
  const text: string = msg?.result?.text || msg?.text || ''
  if (!text.trim()) return

  // Ignore stale events right after submit
  if (Date.now() - lastSubmitTime < 500) return

  if (phase.value === 'live') {
    if (text.toLowerCase().includes(getWakeWord())) {
      activate(text)
    }
  } else if (phase.value === 'listening') {
    const clean = stripWakeWord(text).trim()
    if (clean) {
      dispatch({ type: 'FINAL', text: clean })
      chunks.value.push(clean)
      transcript.value = ''
      resetSilenceTimer()
    }
  }
}

function activate(initialText: string): void {
  // Always stop TTS on interrupt — backend may have finished streaming
  // while frontend is still playing the audio blob
  stopPlayback()
  api.audio.stopSpeaking.mutate().catch(() => {})
  ttsSpeaking = false

  dispatch({ type: 'WAKE_WORD', text: initialText })
  transcript.value = ''
  chunks.value = []

  // Show the agent window
  // Extract command after wake word
  const afterWake = stripWakeWord(initialText).trim()
  if (afterWake) {
    dispatch({ type: 'PARTIAL', text: afterWake })
    transcript.value = afterWake
    resetSilenceTimer()
  }
  // If afterWake is empty → don't start timer, wait for actual speech

  console.info('[useSTT] Wake word detected — activated')
}

function stripWakeWord(text: string): string {
  const wake = getWakeWord()
  const lower = text.toLowerCase()
  const idx = lower.indexOf(wake)
  if (idx >= 0) {
    return text.slice(idx + wake.length).trim()
  }
  return text
}

// ── Silence timer → auto-submit ──

function resetSilenceTimer(): void {
  clearSilenceTimer()
  // Dynamic timeout: short text → more patience, long text → quicker submit
  const wordCount = chunks.value.join(' ').split(/\s+/).length + transcript.value.split(/\s+/).length
  const timeout = wordCount <= 2 ? SILENCE_MAX : SILENCE_BASE
  silenceTimer = setTimeout(submitTranscript, timeout)
}

function clearSilenceTimer(): void {
  if (silenceTimer) {
    clearTimeout(silenceTimer)
    silenceTimer = null
  }
}

function submitTranscript(): void {
  const fullText = chunks.value.join(' ').trim()
  if (!fullText) return

  // Guard: prevent duplicate submissions
  const now = Date.now()
  if (fullText === lastSubmitText && now - lastSubmitTime < 3000) return
  lastSubmitTime = now
  lastSubmitText = fullText

  console.info('[useSTT] Auto-submit:', fullText)
  const { sendCommand } = useAgent()
  sendCommand(fullText)

  // Reset to live (keep the hot capture graph and wait for the next wake word)
  dispatch({ type: 'SUBMITTED' })
  transcript.value = ''
  chunks.value = []
}

// ── Error descriptions ──

/** Turn a getUserMedia / model failure into something a user can act on */
function describeMicError(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Microphone access was denied. Allow microphone access for Ultron in your system privacy settings.'
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No microphone was found. Connect a microphone and try again.'
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'The microphone is busy — another application may be using it.'
    }
    return err.message || 'The microphone could not be started.'
  }
  return 'The microphone could not be started.'
}

// ── Public API ──

async function enable(): Promise<void> {
  if (phase.value !== 'off' && phase.value !== 'error' && phase.value !== 'arming') return
  if (phase.value !== 'off') await stopMic()
  micError.value = ''

  try {
    const effects = dispatch({ type: 'MIC_ON' })
    if (!effects.some((effect) => effect.type === 'ACQUIRE')) return
    await startMic()
  } catch (err) {
    console.error('[useSTT] Failed to enable microphone:', err)
    micError.value = describeMicError(err)
    // Make sure a half-started capture cannot linger
    await stopMic()
  }
}

async function disable(): Promise<void> {
  micError.value = ''
  await stopMic()
}

/** Mirror the persisted auto-listen preference into the runtime watcher */
function setAutoListen(enabled: boolean): void {
  autoListen.value = enabled
}

// ── Composable ──

export function useSTT() {
  const isActivated = computed(() => phase.value === 'listening')
  /** True while the microphone is actually capturing audio */
  const micActive = computed(() => phase.value === 'live' || phase.value === 'listening')

  return {
    phase,
    transcript,
    chunks,
    isActivated,
    micActive,
    micError,
    autoListen,
    isModelLoaded,
    isModelLoading,
    enable,
    disable,
    setAutoListen,
  }
}
