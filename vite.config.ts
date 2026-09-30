/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { funcionesLocales } from './funciones-locales'

export default defineConfig({
  plugins: [
    react(),
    funcionesLocales(),
    VitePWA({
      registerType: 'autoUpdate',
      pwaAssets: { config: true },
      manifest: {
        name: 'SupplyIA',
        short_name: 'SupplyIA',
        description: 'Compras y recepción de mercadería para gastronómicos',
        lang: 'es-AR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F0F1ED',
        theme_color: '#13485B',
      },
      workbox: {
        navigateFallback: '/index.html',
        // /api/… son funciones del servidor: nunca se contestan desde la caché del celular.
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
