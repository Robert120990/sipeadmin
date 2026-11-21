const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

function loadEnvFileIfPresent(filePath) {
    try {
        if (!fs.existsSync(filePath)) return;
        const content = fs.readFileSync(filePath, 'utf8');
        for (const rawLine of content.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;
            const eqIdx = line.indexOf('=');
            if (eqIdx <= 0) continue;
            const key = line.slice(0, eqIdx).trim();
            let val = line.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            if (!process.env[key]) {
                process.env[key] = val;
            }
        }
    } catch (_) {
        // Ignorar errores de lectura opcional de .env
    }
}

loadEnvFileIfPresent(path.join(__dirname, 'backend', '.env'));
loadEnvFileIfPresent(path.join(__dirname, '.env'));

const PORT = parseInt(process.env.WEBHOOK_PORT || '7778', 10);
const SECRET = process.env.WEBHOOK_SECRET;
const BRANCH = process.env.AUTO_UPDATE_BRANCH || 'main';
const PROJECT_DIR = path.resolve(__dirname);

if (!SECRET) {
    console.error('ADVERTENCIA CRÍTICA: WEBHOOK_SECRET no está configurado en las variables de entorno. Los despliegues automáticos requerirán autenticación obligatoria.');
}

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const DEPLOY_TIMEOUT_MS = 10 * 60 * 1000;

let isDeploying = false;
let pendingDeploy = false;

function runDeploy() {
    isDeploying = true;
    const deployEnv = {
        ...process.env,
        HOME: process.env.HOME || '/home/sistemas',
        PATH: `/home/sistemas/.local/share/pnpm:/home/sistemas/.pnpm-global/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH || ''}`
    };

    exec(
        `bash "${path.join(PROJECT_DIR, 'deploy.sh')}"`,
        {
            env: deployEnv,
            cwd: PROJECT_DIR,
            maxBuffer: 25 * 1024 * 1024,
            timeout: DEPLOY_TIMEOUT_MS,
            killSignal: 'SIGTERM'
        },
        (error, stdout, stderr) => {
            if (error) {
                console.error(`Deploy error: ${error.message}`);
                if (stderr) console.error(stderr);
            } else {
                console.log(`Deploy stdout: ${stdout}`);
            }

            if (pendingDeploy) {
                pendingDeploy = false;
                console.log(`[${new Date().toISOString()}] Running queued follow-up deploy for ${BRANCH}...`);
                runDeploy();
                return;
            }
            isDeploying = false;
        }
    );
}

const server = http.createServer((req, res) => {
    const reqPath = (req.url || '/').split('?')[0];
    if (req.method === 'GET' && reqPath === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            status: 'ok',
            isDeploying,
            pendingDeploy,
            uptime: process.uptime()
        }));
    }

    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    }

    const chunks = [];
    let totalBytes = 0;
    let payloadTooLarge = false;

    req.on('data', chunk => {
        if (payloadTooLarge) return;
        totalBytes += chunk.length;
        if (totalBytes > MAX_PAYLOAD_BYTES) {
            payloadTooLarge = true;
            if (!res.headersSent) {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Payload Too Large' }));
            }
            req.destroy();
            return;
        }
        chunks.push(chunk);
    });

    req.on('end', () => {
        if (payloadTooLarge) return;
        const body = Buffer.concat(chunks).toString('utf8');
        const sig = req.headers['x-hub-signature-256'] || '';

        if (!SECRET) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Webhook secret not configured on server' }));
        }

        if (!sig) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Missing x-hub-signature-256 header' }));
        }

        try {
            const hmac = crypto.createHmac('sha256', SECRET);
            const digest = 'sha256=' + hmac.update(body).digest('hex');
            const sigBuffer = Buffer.from(sig, 'utf8');
            const digestBuffer = Buffer.from(digest, 'utf8');

            if (sigBuffer.length !== digestBuffer.length || !crypto.timingSafeEqual(sigBuffer, digestBuffer)) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Invalid signature' }));
            }
        } catch (cryptoErr) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Signature verification failed' }));
        }

        try {
            const payload = JSON.parse(body || '{}');
            const ref = payload.ref || '';
            const targetRef = `refs/heads/${BRANCH}`;

            if (ref !== targetRef) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ message: `Ignored push to ${ref}. Watching ${targetRef}.` }));
            }

            if (isDeploying) {
                pendingDeploy = true;
                res.writeHead(202, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ message: 'Deployment in progress; follow-up deploy queued' }));
            }

            res.writeHead(202, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Deployment started' }));

            console.log(`[${new Date().toISOString()}] GitHub Webhook triggered for ${BRANCH}. Running deploy.sh...`);
            runDeploy();
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Bad Request: ${err.message}` }));
        }
    });
});

const shutdownWebhook = (signal) => {
    console.log(`[Webhook] Señal ${signal} recibida, cerrando servidor...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
};

process.on('SIGTERM', () => shutdownWebhook('SIGTERM'));
process.on('SIGINT', () => shutdownWebhook('SIGINT'));

server.listen(PORT, '127.0.0.1', () => {
    console.log(`SIPE Admin Webhook listening on 127.0.0.1:${PORT}`);
});
