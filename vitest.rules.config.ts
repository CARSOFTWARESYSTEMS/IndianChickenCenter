/** Security-rule tests (S-*, R-*). They need the Firestore emulator: run `npm run test:rules`. */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
})
