import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const host = process.env.TAURI_DEV_HOST || 'localhost';
const port = parseInt(process.env.TAURI_DEV_PORT || '1420');

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: './',
  clearScreen: false,
  server: {
    host,
    port,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host,
      port: 1421,
    },
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split Monaco Editor into its own chunk (lazy loaded)
          'monaco-editor': ['@monaco-editor/react'],
          // Split heavy UI components
          'settings-panel': ['./components/SettingsPanel.tsx'],
          'command-palette': ['./components/CommandPalette.tsx'],
          // Vendor libs
          'vendor-react': ['react', 'react-dom'],
          'vendor-markdown': ['react-markdown', 'rehype-highlight', 'remark-gfm'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
