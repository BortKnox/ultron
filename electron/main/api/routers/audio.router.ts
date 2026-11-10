import { observable } from '@trpc/server/observable'
import { z } from 'zod'
import { trpcRouter, publicProcedure } from '@electron/api/context'
import { mainEventBus } from '@electron/utils/eventBus'
import { createLogger } from '@electron/utils/logger'
import type { STTService } from '@electron/services/stt/STTService'
import { getModelStatus as getModelStatusForLanguage } from '@electron/services/stt/ModelManager'
import type { TTSService } from '@electron/services/tts/TTSService'
import type { TTSAudioFormat } from '@electron/services/tts/providers/BaseTTSProvider'
import {
  GEMINI_TTS_MODELS,
  GEMINI_TTS_VOICES,
  DEFAULT_GEMINI_TTS_MODEL,
  DEFAULT_GEMINI_TTS_VOICE,
  TTS_PROVIDERS,
} from '@electron/services/tts/geminiCatalog'

const log = createLogger('audio.router')

let sttService: STTService | null = null
let ttsService: TTSService | null = null

/** Wire STTService into the router (called from index.ts) */
export function setSTTService(stt: STTService): void {
  sttService = stt
}

/** Wire TTSService into the router (called from index.ts) */
export function setTTSService(tts: TTSService): void {
  ttsService = tts
}

/**
 * audio.router — audio/voice + TTS + STT endpoints.
 */
export const audioRouter = trpcRouter({

  // ── STT ──

  /** Start listening for voice input */
  startListening: publicProcedure.mutation(() => {
    sttService?.setListening(true)
    return { ok: true }
  }),

  /** Stop listening for voice input */
  stopListening: publicProcedure.mutation(() => {
    sttService?.setListening(false)
    return { ok: true }
  }),

  /** Subscribe to speech-to-text transcript chunks */
  onTranscript: publicProcedure.subscription(() => {
    return observable<{ text: string; isFinal: boolean }>((emit) => {
      function onTranscript(payload: { text: string; isFinal: boolean }) {
        emit.next(payload)
      }

      mainEventBus.on('audio:transcript', onTranscript)

      return () => {
        mainEventBus.off('audio:transcript', onTranscript)
      }
    })
  }),

  /** Get STT model status (downloaded, path) for a given or configured language */
  getSTTModelStatus: publicProcedure
    .input(z.object({ language: z.string().optional() }).optional())
    .query(({ input }) => {
      if (!sttService) return { downloaded: false, path: '' }
      if (input?.language) {
        // Check status for a specific language (used when user changes language in UI)
        return getModelStatusForLanguage(input.language)
      }
      return sttService.getModelStatus()
    }),

  /** Get model path for renderer to load */
  getSTTModelPath: publicProcedure.query(() => {
    if (!sttService) return ''
    return sttService.getModelPath()
  }),

  /** Get available STT languages */
  getSTTLanguages: publicProcedure.query(() => {
    if (!sttService) return []
    return sttService.getAvailableLanguages()
  }),

  /** Download STT model for a language */
  downloadSTTModel: publicProcedure
    .input(z.object({ language: z.string() }))
    .mutation(async ({ input }) => {
      if (!sttService) throw new Error('STTService not available')
      await sttService.downloadModel(input.language)
      return { ok: true }
    }),

  /** Subscribe to STT model download progress */
  onSTTModelStatus: publicProcedure.subscription(() => {
    return observable<{ downloaded: boolean; progress?: number; error?: string }>((emit) => {
      function onStatus(payload: { downloaded: boolean; progress?: number; error?: string }) {
        emit.next(payload)
      }

      mainEventBus.on('stt:model-status', onStatus)

      return () => {
        mainEventBus.off('stt:model-status', onStatus)
      }
    })
  }),

  // ── TTS ──

  /** Trigger TTS to speak text */
  speak: publicProcedure
    .input(z.object({ text: z.string() }))
    .mutation(({ input }) => {
      log.info(`TTS speak: ${input.text.length} chars`)
      mainEventBus.emit('tts:speak', { text: input.text })
      return { ok: true }
    }),

  /** Stop current TTS playback */
  stopSpeaking: publicProcedure.mutation(() => {
    log.info('TTS stop')
    mainEventBus.emit('tts:stop')
    return { ok: true }
  }),

  /** Subscribe to TTS speaking status */
  onTTSStatus: publicProcedure.subscription(() => {
    return observable<{ speaking: boolean }>((emit) => {
      function onStatus(payload: { speaking: boolean }) {
        emit.next(payload)
      }

      mainEventBus.on('tts:status', onStatus)

      return () => {
        mainEventBus.off('tts:status', onStatus)
      }
    })
  }),

  /** Subscribe to TTS audio format (mpeg, opus or wav) — emitted when speech starts */
  onTTSFormat: publicProcedure.subscription(() => {
    return observable<{ format: TTSAudioFormat }>((emit) => {
      function onFormat(payload: { format: TTSAudioFormat }) {
        emit.next(payload)
      }

      mainEventBus.on('tts:format', onFormat)

      return () => {
        mainEventBus.off('tts:format', onFormat)
      }
    })
  }),

  /** Subscribe to TTS audio chunks (base64-encoded) */
  onTTSAudio: publicProcedure.subscription(() => {
    return observable<{ data: string; done: boolean }>((emit) => {
      function onAudio(payload: { chunk: Buffer; done: boolean }) {
        emit.next({
          data: payload.chunk.toString('base64'),
          done: payload.done,
        })
      }

      mainEventBus.on('tts:audio', onAudio)

      return () => {
        mainEventBus.off('tts:audio', onAudio)
      }
    })
  }),

  // ── TTS provider catalogue & voice test ──

  /**
   * Static catalogue for the Voice settings tab: supported providers plus the
   * verified Gemini TTS models and voices (see geminiCatalog.ts).
   */
  getTTSOptions: publicProcedure.query(() => {
    return {
      providers: TTS_PROVIDERS,
      gemini: {
        models: GEMINI_TTS_MODELS,
        voices: GEMINI_TTS_VOICES,
        defaultModel: DEFAULT_GEMINI_TTS_MODEL,
        defaultVoice: DEFAULT_GEMINI_TTS_VOICE,
      },
      activeProvider: ttsService?.activeProvider ?? null,
      activeFormat: ttsService?.audioFormat ?? 'mpeg',
    }
  }),

  /**
   * Synthesize a short sample with the settings currently shown in the UI
   * (including unsaved edits) and play it through the normal audio channel.
   */
  testTTSVoice: publicProcedure
    .input(z.object({
      text: z.string().min(1).max(300).optional(),
      provider: z.string().optional(),
      apiKey: z.string().optional(),
      model: z.string().optional(),
      voice: z.string().optional(),
      voiceId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!ttsService) throw new Error('TTSService not available')

      const text = input.text?.trim() || 'Ultron online. Voice synthesis is working.'
      log.info(`TTS voice test (provider: ${input.provider ?? 'config default'})`)

      const provider = input.provider

      // Keep the test request provider-local at the IPC boundary. The Voice
      // tab sends a shared shape for convenience, but ElevenLabs must never
      // receive Gemini's voice field (or vice versa).
      return ttsService.testVoice(text, provider === 'elevenlabs'
        ? {
            provider,
            apiKey: input.apiKey,
            model: input.model,
            voiceId: input.voiceId,
          }
        : provider === 'gemini'
          ? {
              provider,
              apiKey: input.apiKey,
              model: input.model,
              voice: input.voice,
            }
          : { provider })
    }),
})
