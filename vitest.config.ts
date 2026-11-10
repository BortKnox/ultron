import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Vitest configuration — unit tests for main-process logic that can run
 * without Electron.
 *
 * `electron` is aliased to a stub because config/logger modules import `app`
 * for path resolution. Everything under test is otherwise pure TypeScript.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@electron': path.resolve(__dirname, 'electron/main'),
      '@': path.resolve(__dirname, 'src'),
      electron: path.resolve(__dirname, 'tests/stubs/electron.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
