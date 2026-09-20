import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
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
            const distDir = resolve(__dirname, 'dist');
            mkdirSync(distDir, { recursive: true });
            writeFileSync(
                resolve(distDir, 'version.json'),
                JSON.stringify(payload, null, 2)
            );
            console.log(`[version-json] dist/version.json -> v${payload.version} (${payload.buildId})`);
        }
    };
}

function devVersionPlugin() {
    return {
        name: 'dev-version-server',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const url = req.url ? req.url.split('?')[0] : '';
                if (url === '/version.json') {
                    try {
                        const currentPkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));
                        res.setHeader('Content-Type', 'application/json');
                        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                        res.end(JSON.stringify({
                            version: currentPkg.version,
                            buildId: 'dev'
                        }));
                        return;
                    } catch (e) {
                        // ignore error
                    }
                }
                next();
            });
        }
    };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), versionJsonPlugin(), devVersionPlugin()],
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
