import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          devOptions: {
            enabled: true
          },
          manifest: {
            name: 'EduCheck - Absensi Digital Siswa',
            short_name: 'EduCheck',
            description: 'Aplikasi Absensi Digital Siswa Modern dengan QR Code & Face Recognition',
            theme_color: '#10b981',
            background_color: '#ffffff',
            display: 'standalone',
            orientation: 'portrait',
            categories: ['education', 'productivity'],
            icons: [
              {
                src: '/pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any'
              },
              {
                src: '/pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any'
              },
              {
                src: '/pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable'
              }
            ]
          }
        })
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        }
      },
      build: {
        target: 'es2020',
        minify: 'esbuild',
        cssMinify: true,
        cssCodeSplit: true,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return;

              if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
              if (id.includes('framer-motion')) return 'vendor-motion';
              if (id.includes('lucide-react')) return 'vendor-icons';
              if (id.includes('idb') || id.includes('@supabase/supabase-js')) return 'vendor-data';
            }
          }
        }
      }
    };
});
