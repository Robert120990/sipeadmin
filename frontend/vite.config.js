import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));
const APP_VERSION = pkg.version;

// Emite dist/version.json con la versión y un buildId único por build.
// El Service Worker y el UpdateNotifier lo usan para detectar releases nuevos.
function versionJsonPlugin() {
    return {
        name: 'version-json',
        apply: 'build',
        closeBundle() {
            const payload = {
                version: pkg.version,
                buildId: new Date().toISOString().replace(/[:.]/g, '-')
            };
            writeFileSync(
                resolve(__dirname, 'dist/version.json'),
                JSON.stringify(payload, null, 2)
            );
            console.log(`[version-json] dist/version.json -> v${payload.version} (${payload.buildId})`);
        }
    };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), versionJsonPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION)
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:5001',
        ws: true
      }
    }
  }
})
