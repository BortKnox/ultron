import { ref, computed } from 'vue'
import { api } from '@/api'
import { useAgent } from './useAgent'
import { usePersonas } from './usePersonas'
import { stopPlayback } from './useTTS'

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

type STTPhase = 'off' | 'idle' | 'activated' | 'listening'

const phase = ref<STTPhase>('off')
const transcript = ref('')
const chunks = ref<string[]>([])
const isModelLoaded = ref(false)
const isModelLoading = ref(false)
/** True only while the current stream/context graph is live. */
const hardwareActive = ref(false)
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
let processorNode: ScriptProcessorNode | null = null
let sinkNode: GainNode | null = null
let captureWatchdog: ReturnType<typeof setInterval> | null = null
let lastAudioFrameAt = 0
let silenceTimer: ReturnType<typeof setTimeout> | null = null
let ttsSpeaking = false
let lastSubmitTime = 0
let lastSubmitText = ''
/** Prevent a new capture from racing an in-flight AudioContext.close(). */
let releaseBarrier: Promise<void> = Promise.resolve()
/** Invalidates a start that is still waiting for model/load or teardown. */
let captureGeneration = 0

const SILENCE_BASE = 700
const SILENCE_MAX = 1500
const VOSK_SAMPLE_RATE = 16000

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

      if (visible && phase.value === 'idle' && autoListen.value) {
        // Hands-free mode only — otherwise showing the widget never starts listening
        activateWithoutWakeWord()
      } else if (!visible && (phase.value === 'activated' || phase.value === 'listening')) {
        // Agent hidden — cancel active listening, return to wake word mode
        clearSilenceTimer()
        phase.value = 'idle'
        transcript.value = ''
        chunks.value = []
        api.audio.stopListening.mutate()
        console.info('[useSTT] Deactivated — agent hidden')
      }
    },
  })
}

function activateWithoutWakeWord(): void {
  phase.value = 'activated'
  transcript.value = ''
  chunks.value = []
  api.audio.startListening.mutate()
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
  const generation = ++captureGeneration
  if (!model) await loadModel()
  if (!model) return

  // Defensive cleanup makes every start independent, including recovery from
  // a failed/partially initialized previous capture. Wait for the old context
  // to finish closing before creating a new graph.
  await releaseCaptureResources()
  if (generation !== captureGeneration) return

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
  })
  const stream = mediaStream
  console.info(`[STT] Stream Acquired (${stream.id})`)

  // A device/permission change can end a track without changing our phase.
  // Treat that as a hardware failure and force the UI off immediately.
  for (const track of stream.getTracks()) {
    track.addEventListener('ended', () => {
      if (mediaStream !== stream || generation !== captureGeneration) return
      console.error(`[STT] Stream Failed: track ended (${track.kind})`)
      void stopMic()
    })
  }

  let context: AudioContext
  try {
    // Let Chromium/Electron select the native device rate. Forcing 16 kHz at
    // AudioContext construction is unreliable on Windows input devices.
    audioContext = new AudioContext()
    context = audioContext
    if (context.state === 'suspended') await context.resume()
    if (context.state !== 'running') {
      throw new Error(`AudioContext did not reach running state (state: ${context.state})`)
    }
  } catch (err) {
    console.error('[STT] Stream Failed: AudioContext creation/resume', err)
    throw err
  }
  context.addEventListener('statechange', () => {
    if (audioContext !== context || generation !== captureGeneration) return
    if (context.state === 'closed') {
      console.error('[STT] Stream Failed: AudioContext closed unexpectedly')
      void stopMic()
    }
  })
  recognizer = new model.KaldiRecognizer(VOSK_SAMPLE_RATE)
  recognizer.on('result', onResult)
  recognizer.on('partialresult', onPartialResult)

  try {
    sourceNode = context.createMediaStreamSource(stream)
    // This is the capture path documented by vosk-browser itself. A zero-gain
    // sink keeps ScriptProcessor alive without microphone feedback.
    processorNode = context.createScriptProcessor(4096, 1, 1)
    processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!recognizer) return
      lastAudioFrameAt = Date.now()
      // During TTS: only process audio for wake word detection (idle phase)
      if (ttsSpeaking && phase.value !== 'idle') return

      try {
        const samples = resampleToVosk(event.inputBuffer)
        const buffer = context.createBuffer(1, samples.length, VOSK_SAMPLE_RATE)
        buffer.getChannelData(0).set(samples)
        recognizer.acceptWaveform(buffer)
      } catch (err) {
        console.error('[STT] Stream Failed: ScriptProcessor/Vosk processing', err)
        void stopMic()
      }
    }
    sourceNode.connect(processorNode)
    sinkNode = context.createGain()
    sinkNode.gain.value = 0
    processorNode.connect(sinkNode)
    sinkNode.connect(context.destination)
  } catch (err) {
    console.error('[STT] Stream Failed: ScriptProcessor graph creation', err)
    throw err
  }

  hardwareActive.value = true
  lastAudioFrameAt = Date.now()
  captureWatchdog = setInterval(() => {
    if (mediaStream !== stream || generation !== captureGeneration) return
    if (context.state !== 'running') return
    // Give Chromium/Electron several seconds to warm up a newly created graph
    // before declaring the device dead.
    if (Date.now() - lastAudioFrameAt > 5000) {
      console.error('[STT] Stream Failed: no audio frames received')
      void stopMic()
    }
  }, 1000)
  phase.value = 'idle'
  // The backend state represents the live hardware session, including its
  // wake-word waiting phase—not only a recognized command.
  api.audio.startListening.mutate().catch((err) => {
    console.error('[STT] Failed to publish listening state:', err)
  })
  initVisibilityWatch()
  console.info('[STT] Capture Live — listening for wake word')
}

/** Release every renderer-owned capture resource before a future start. */
function releaseCaptureResources(): Promise<void> {
  clearSilenceTimer()

  const oldProcessor = processorNode
  const oldSink = sinkNode
  const oldSource = sourceNode
  const oldContext = audioContext
  const oldStream = mediaStream
  const oldRecognizer = recognizer

  // Detach globals synchronously so stale processor callbacks cannot feed a new
  // recognizer while the old AudioContext is still closing.
  processorNode = null
  sinkNode = null
  if (captureWatchdog) {
    clearInterval(captureWatchdog)
    captureWatchdog = null
  }
  sourceNode = null
  audioContext = null
  mediaStream = null
  recognizer = null

  const release = async (): Promise<void> => {
    if (oldProcessor) {
      oldProcessor.onaudioprocess = null
      oldProcessor.disconnect()
    }
    oldSink?.disconnect()
    oldSource?.disconnect()

    const tracks = oldStream?.getTracks() ?? []
    tracks.forEach((track) => track.stop())
    if (oldStream || oldContext || oldRecognizer) {
      console.info(`[STT] Stream Released (${tracks.length} track(s))`)
    }

    oldRecognizer?.remove()

    // Await the actual close. A new AudioContext is not created until this
    // promise resolves, preventing the browser from retaining a zombie graph.
    if (oldContext) {
      try {
        await oldContext.close()
      } catch {
        // A failed start may have already closed the context.
      }
    }
  }

  releaseBarrier = releaseBarrier.then(release, release)
  return releaseBarrier
}

async function stopMic(): Promise<void> {
  captureGeneration += 1
  hardwareActive.value = false
  phase.value = 'off'
  transcript.value = ''
  chunks.value = []
  api.audio.stopListening.mutate().catch(() => {})
  await releaseCaptureResources()
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

  if (phase.value === 'idle') {
    if (partial.toLowerCase().includes(getWakeWord())) {
      activate(partial)
    }
  } else if (phase.value === 'activated' || phase.value === 'listening') {
    const clean = stripWakeWord(partial)
    if (clean) {
      phase.value = 'listening'
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

  if (phase.value === 'idle') {
    if (text.toLowerCase().includes(getWakeWord())) {
      activate(text)
    }
  } else if (phase.value === 'activated' || phase.value === 'listening') {
    const clean = stripWakeWord(text).trim()
    if (clean) {
      phase.value = 'listening'
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

  phase.value = 'activated'
  transcript.value = ''
  chunks.value = []

  // Show the agent window
  api.system.showWindow.mutate().catch(() => {})
  api.audio.startListening.mutate()

  // Extract command after wake word
  const afterWake = stripWakeWord(initialText).trim()
  if (afterWake) {
    phase.value = 'listening'
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

/** Convert a native-rate AudioBuffer into the 16 kHz buffer Vosk expects. */
function resampleToVosk(input: AudioBuffer): Float32Array {
  const source = input.getChannelData(0)
  if (input.sampleRate === VOSK_SAMPLE_RATE) return source.slice()

  const ratio = input.sampleRate / VOSK_SAMPLE_RATE
  const outputLength = Math.max(1, Math.round(source.length / ratio))
  const output = new Float32Array(outputLength)

  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio
    const left = Math.floor(position)
    const right = Math.min(left + 1, source.length - 1)
    const fraction = position - left
    output[i] = source[left] + (source[right] - source[left]) * fraction
  }

  return output
}

async function submitTranscript(): Promise<void> {
  const fullText = chunks.value.join(' ').trim()
  if (!fullText) return

  // Guard: prevent duplicate submissions
  const now = Date.now()
  if (fullText === lastSubmitText && now - lastSubmitTime < 3000) return
  lastSubmitTime = now
  lastSubmitText = fullText

  console.info('[useSTT] Auto-submit:', fullText)
  // Do not restart capture here. A background restart can race the agent's
  // response/TTS and create a second audio graph while the first is closing.
  // Await the hard teardown, then leave activation to an explicit user action
  // (or the normal wake-word path after a user-enabled capture).
  await resetCaptureAfterSubmit()

  const { sendCommand } = useAgent()
  sendCommand(fullText)
}

/** Stop the completed recognizer; never reacquire capture after submission. */
async function resetCaptureAfterSubmit(): Promise<void> {
  await stopMic()
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
  if (phase.value !== 'off') return
  micError.value = ''

  try {
    await startMic()
  } catch (err) {
    console.error('[STT] Stream Failed: start', err)
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
  const isActivated = computed(() => hardwareActive.value && (phase.value === 'activated' || phase.value === 'listening'))
  /** True only while the stream, context and processor are live. */
  const micActive = computed(() => hardwareActive.value)

  return {
    phase,
    transcript,
    chunks,
    isActivated,
    micActive,
    micError,
    hardwareActive,
    autoListen,
    isModelLoaded,
    isModelLoading,
    enable,
    disable,
    setAutoListen,
  }
}
