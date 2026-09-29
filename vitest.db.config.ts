// Tests contra la base de desarrollo de Supabase (necesitan internet y .env.local).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/db/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
})
