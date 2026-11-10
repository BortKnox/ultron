/**
 * BaseTTSProvider — abstract base for all TTS integrations.
 *
 * Every provider (ElevenLabs, Yandex Alice, Gemini, …) implements this
 * contract so TTSService can swap them transparently.
 */

/**
 * Audio container produced by a provider.
 *
 * The value is reported to the renderer so it can pick the right playback
 * pipeline — it must always describe the bytes that are actually sent,
 * never "whatever the player happens to accept".
 */
export type TTSAudioFormat = 'mpeg' | 'opus' | 'wav'

export abstract class BaseTTSProvider {
  abstract readonly name: string

  /**
   * Container of the audio this provider emits.
   * Defaults to `mpeg` (ElevenLabs); providers override it.
   */
  readonly audioFormat: TTSAudioFormat = 'mpeg'

  /**
   * Full synthesis: send text, get complete audio in {@link audioFormat}.
   *
   * @param text — text to speak
   * @param signal — optional cancellation signal; providers that cannot
   *   abort in-flight work may ignore it (TTSService also stops consuming)
   */
  abstract synthesize(text: string, signal?: AbortSignal): Promise<Buffer>

  /**
   * Streaming synthesis: yields audio chunks as they arrive.
   * Consumers iterate with `for await (const chunk of streamSpeech(...))`.
   *
   * Buffered providers yield the complete buffer as a single chunk.
   */
  abstract streamSpeech(text: string, signal?: AbortSignal): AsyncGenerator<Buffer>
}
