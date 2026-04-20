/**
 * Tiny static file server for the test runner.
 * Serves the project root at localhost:3001 over HTTP so ESM imports
 * and Worker scripts work correctly.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 3001;

const MIME = {
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.html': 'text/html',
  '.css':  'text/css',
  '.json': 'application/json',
  '.txt':  'text/plain',
};

/**
 * Create and start the file server.
 * @returns {Promise<http.Server>}
 */
export function startServer() {
  const server = http.createServer((req, res) => {
    // Strip query string.
    const urlPath = req.url.split('?')[0];
    const filePath = path.join(ROOT, decodeURIComponent(urlPath));

    // Security: don't serve files outside the root.
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end(`Not found: ${urlPath}`);
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(PORT, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

export const port = PORT;
