import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Configuración del cliente (ADR-0015).
 *
 * Las dos decisiones que no son por omisión y conviene explicar:
 *
 *  - **La estrategia del service worker es `prompt`, no `autoUpdate`.** El propio ADR avisa de que
 *    el service worker es la fuente de los errores más difíciles de diagnosticar del front: una
 *    versión cacheada que no se actualiza deja al usuario con una aplicación vieja sin que nada
 *    parezca fallar. Con `prompt`, la aplicación detecta que hay versión nueva y lo dice; el
 *    usuario decide cuándo recargar y nunca pierde lo que estaba escribiendo.
 *
 *  - **El proxy de desarrollo** evita montar CORS en local. En producción el cliente son archivos
 *    estáticos servidos por el mismo proxy inverso que la API (ADR-0016), así que el mismo origen
 *    es la situación real y no un truco de desarrollo.
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',

      // El service worker es nuestro, no uno generado: hace falta un manejador propio para los
      // avisos push, y eso un generador no lo puede escribir. La herramienta sigue inyectando la
      // lista de archivos a precachear.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },

      // Para poder probar los avisos push en desarrollo: sin esto el service worker solo existe en
      // la versión construida, y probar push obligaría a construir en cada cambio.
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'UCO Kudos',
        short_name: 'Kudos',
        description: 'Reconocimientos entre la comunidad de la Universidad Católica de Oriente.',
        lang: 'es-CO',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0b5d3b',
        icons: [
          { src: '/icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Solo el armazón de la aplicación. Los datos NO se cachean: un muro de reconocimientos
        // servido desde el caché mostraría Kudos que ya no existen o se perdería los nuevos, y eso
        // es peor que esperar a la red.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  server: {
    port: 5174,
    proxy: {
      // El destino sale del entorno (ADR-0018) con la API local como valor por omisión. Permite
      // levantar el cliente contra la API ya desplegada cuando no se puede correr la de local,
      // que es justo cuando más falta hace poder comprobar algo en un navegador de verdad.
      '/api': {
        target: process.env['API_URL'] ?? 'http://localhost:8082',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/pruebas/preparacion.ts'],
    include: ['src/**/*.prueba.{ts,tsx}'],
  },
  build: {
    // El presupuesto de QA-MOV-01 es de 300 KB comprimidos para la carga inicial. Este aviso salta
    // antes, para que el crecimiento se note mientras todavía es fácil de corregir.
    chunkSizeWarningLimit: 250,
  },
});
