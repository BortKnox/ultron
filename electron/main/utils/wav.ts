/**
 * wav — minimal RIFF/WAVE handling for provider audio.
 *
 * Some TTS providers return headerless linear PCM instead of a finished
 * container. Chromium's `<audio>` element cannot play raw PCM, so the bytes
 * must be wrapped in a WAV header before they reach the renderer.
 *
 * This module contains no dependencies and no transcoding — it only writes
 * or reads the canonical 44-byte PCM WAV header.
 *
 * @see https://www.mmsp.ece.mcgill.ca/Documents/AudioFormats/WAVE/WAVE.html
 */

/** Size of a canonical PCM WAV header (RIFF + fmt + data) */
export const WAV_HEADER_SIZE = 44

/** Audio layout needed to describe linear PCM samples */
export interface PcmFormat {
  /** Samples per second (e.g. 24000 for Gemini TTS) */
  sampleRate: number
  /** 1 = mono, 2 = stereo */
  channels: number
  /** Bits per sample — Gemini returns 16 */
  bitsPerSample: number
}

/** Default layout for Gemini TTS output */
export const DEFAULT_PCM_FORMAT: PcmFormat = {
  sampleRate: 24_000,
  channels: 1,
  bitsPerSample: 16,
}

/** True when the buffer already starts with a RIFF/WAVE header */
export function isWav(buffer: Buffer): boolean {
  return (
    buffer.length >= WAV_HEADER_SIZE &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE'
  )
}

/**
 * Wrap headerless PCM data in a canonical 44-byte WAV container.
 *
 * @param pcm — raw little-endian samples
 * @param format — sample layout (defaults to 24 kHz mono 16-bit)
 * @returns A complete `.wav` file as a Buffer
 */
export function buildWavFromPcm(pcm: Buffer, format: Partial<PcmFormat> = {}): Buffer {
  const { sampleRate, channels, bitsPerSample } = { ...DEFAULT_PCM_FORMAT, ...format }

  const bytesPerSample = bitsPerSample / 8
  const blockAlign = channels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = pcm.length

  const header = Buffer.alloc(WAV_HEADER_SIZE)

  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + dataSize, 4)     // file size minus first 8 bytes
  header.write('WAVE', 8, 'ascii')

  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)               // PCM fmt chunk size
  header.writeUInt16LE(1, 20)                // audio format 1 = PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)

  header.write('data', 36, 'ascii')
  header.writeUInt32LE(dataSize, 40)

  return Buffer.concat([header, pcm])
}

/**
 * Read the audio layout out of an existing WAV buffer.
 *
 * Only the canonical layout written by {@link buildWavFromPcm} and the Gemini
 * TTS service is supported (PCM fmt chunk at offset 12).
 *
 * @returns The parsed format, or `null` when the buffer is not a PCM WAV
 */
export function readWavFormat(buffer: Buffer): PcmFormat | null {
  if (!isWav(buffer)) return null
  return {
    channels: buffer.readUInt16LE(22),
    sampleRate: buffer.readUInt32LE(24),
    bitsPerSample: buffer.readUInt16LE(34),
  }
}

/**
 * Ensure a buffer is a playable WAV file.
 *
 * - Already-WAV input is returned untouched.
 * - Raw PCM input is wrapped in a WAV header.
 */
export function ensureWav(buffer: Buffer, format: Partial<PcmFormat> = {}): Buffer {
  return isWav(buffer) ? buffer : buildWavFromPcm(buffer, format)
}
