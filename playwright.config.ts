// Tests de flujos en el navegador, contra la base de DESARROLLO de Supabase.
// Uso: npm run e2e (levanta la app sola si no está corriendo).
import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

const REF_DESARROLLO = 'efyulrowgyrxqubjelor' // supplyia-dev

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

// Los tests entran con los usuarios de prueba: nunca contra producción.
if (!process.env.VITE_SUPABASE_URL?.includes(REF_DESARROLLO)) {
  throw new Error(`Los tests e2e solo corren contra la base de desarrollo (${REF_DESARROLLO}).`)
}
if (!process.env.DEV_TEST_PASSWORD) {
  throw new Error('Falta DEV_TEST_PASSWORD en .env.local. Corré antes: npm run db:datos-prueba')
}

const PUERTO = 5173

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    locale: 'es-AR',
    trace: 'retain-on-failure',
  },
  // La app se usa en el celular: se prueba con pantalla de teléfono.
  projects: [{ name: 'celular', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `npm run dev -- --port ${PUERTO} --strictPort`,
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
