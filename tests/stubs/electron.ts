/**
 * Minimal Electron stub for unit tests.
 *
 * Config and logger modules call `app.getPath()` at import time; this stub
 * satisfies those calls without launching Electron.
 */
export const app = {
  getName: () => 'Ultron',
  getPath: (_name: string) => '/tmp/ultron-test',
  isPackaged: false,
  setPath: () => undefined,
  setName: () => undefined,
  getVersion: () => '0.0.0-test',
  whenReady: () => Promise.resolve(),
  on: () => undefined,
  emit: () => undefined,
  quit: () => undefined,
}

export const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: (s: string) => Buffer.from(s),
  decryptString: (b: Buffer) => b.toString(),
}

export default { app, safeStorage }
