import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, reqPath);

  // Security check: prevent directory traversal outside public
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

let mqttProcess = null;

function cleanup() {
  if (mqttProcess && !mqttProcess.killed) {
    try {
      mqttProcess.kill('SIGINT');
    } catch {
      // Ignore
    }
  }
  server.close();
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

function startServer(port, maxAttempts = 10) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️ Port ${port} is already in use.`);
      if (maxAttempts > 1) {
        const nextPort = port + 1;
        console.log(`🔄 Trying next available port: http://localhost:${nextPort}...`);
        startServer(nextPort, maxAttempts - 1);
      } else {
        console.error(`❌ Could not find an open port after multiple attempts.`);
        process.exit(1);
      }
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });

  server.listen(port, () => {
    console.log(`\n============================================================`);
    console.log(`  Shamba Watch IoT Dashboard is running locally!`);
    console.log(`  Local URL:  http://localhost:${port}`);
    console.log(`  Serving:    ${PUBLIC_DIR}`);
    console.log(`  Press Ctrl+C to stop.`);
    console.log(`============================================================\n`);

    const bridgePath = path.resolve(__dirname, 'mqtt_ingestion_bridge.js');
    const disableMqtt = process.argv.includes('--no-mqtt');

    if (!disableMqtt && fs.existsSync(bridgePath)) {
      console.log(`📡 Launching Live LoRaWAN MQTT Telemetry Ingestion Bridge in background...\n`);
      const bridgeArgs = process.argv.slice(2).filter((arg) => arg !== '--no-mqtt');
      mqttProcess = fork(bridgePath, bridgeArgs, { stdio: 'inherit' });

      mqttProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.warn(`[MQTT] Ingestion bridge exited with code ${code}`);
        }
      });
    }
  });
}

startServer(Number(PORT));
