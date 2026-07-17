import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'vendor-react';
            if (id.includes('node_modules/recharts')) return 'charts';
            if (id.includes('node_modules/motion')) return 'motion';
            if (id.includes('node_modules/@supabase')) return 'supabase';
            if (id.includes('node_modules/xlsx')) return 'xlsx';
          }
        }
      }
    }
  };
});
