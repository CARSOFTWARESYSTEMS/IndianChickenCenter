/** Emulator tests: security rules (S-*, R-*, BR-*), offline sync (SY-*), backup and restore (B-04, B-06). `npm run test:emulator`. */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts', 'tests/sync/**/*.test.ts', 'tests/backup/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
