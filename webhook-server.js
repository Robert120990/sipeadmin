const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');
const path = require('path');

const PORT = process.env.WEBHOOK_PORT || 7778;
const SECRET = process.env.WEBHOOK_SECRET || 'sipeadmin-deploy-secret';
const BRANCH = process.env.AUTO_UPDATE_BRANCH || 'main';
const PROJECT_DIR = path.resolve(__dirname);

let isDeploying = false;

const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        return res.end('Method Not Allowed');
    }

    let body = '';
    req.on('data', chunk => {
        body += chunk;
        if (body.length > 2 * 1024 * 1024) {
            req.destroy();
        }
    });

    req.on('end', () => {
        const sig = req.headers['x-hub-signature-256'] || '';

        if (!process.env.WEBHOOK_SECRET && process.env.NODE_ENV === 'production') {
            console.error('[Webhook] FATAL: WEBHOOK_SECRET is not configured in production.');
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Webhook secret is not configured on server' }));
        }

        if (!sig) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Missing x-hub-signature-256 header' }));
        }

        const hmac = crypto.createHmac('sha256', SECRET);
        const digest = 'sha256=' + hmac.update(body).digest('hex');
        const sigBuffer = Buffer.from(sig, 'utf8');
        const digestBuffer = Buffer.from(digest, 'utf8');

        if (sigBuffer.length !== digestBuffer.length || !crypto.timingSafeEqual(sigBuffer, digestBuffer)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Invalid signature' }));
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
                res.writeHead(429, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ message: 'Deployment already in progress' }));
            }

            isDeploying = true;
            res.writeHead(202, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Deployment started' }));

            console.log(`[${new Date().toISOString()}] GitHub Webhook triggered for ${BRANCH}. Running deploy.sh...`);

            exec(`bash "${path.join(PROJECT_DIR, 'deploy.sh')}"`, (error, stdout, stderr) => {
                isDeploying = false;
                if (error) {
                    console.error(`Deploy error: ${error.message}`);
                    console.error(stderr);
                    return;
                }
                console.log(`Deploy stdout: ${stdout}`);
            });

        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end(`Bad Request: ${err.message}`);
        }
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`SIPE Admin Webhook listening on port ${PORT}`);
});
