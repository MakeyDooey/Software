import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'Totem Programming Studio',
        short_name: 'Totem Studio',
        description: 'Program and monitor Totem embedded boards',
        theme_color: '#1e1e1e',
        background_color: '#1e1e1e',
        display: 'standalone',
        // Update these to match your repo name
        scope: '/controller-app-web/', 
        start_url: '/controller-app-web/',
        icons: [
          {
            src: 'vite.svg', // Remove the leading slash for relative paths
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'vite.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      }
    })
  ],
  // Change './' to your specific repo name for GitHub Pages
  base: '/controller-app-web/' 
});
