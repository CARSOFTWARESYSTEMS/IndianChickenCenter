/** Emulator tests: security rules (S-*, R-*) and offline sync (SY-*). Run with `npm run test:emulator`. */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts', 'tests/sync/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
