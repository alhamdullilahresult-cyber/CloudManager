/**
 * Boyfinity Cloud Script Manager - Server
 * Native Node.js HTTP Server (Zero External Dependencies)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Path file script yang dikelola
const MANAGED_SCRIPT_PATH = path.resolve(__dirname, '..', 'Boyfinity-ViolenceDistrict-Main.lua');
const FALLBACK_SCRIPT_PATH = path.resolve(__dirname, 'script.lua');
const HTML_FILE_PATH = path.resolve(__dirname, 'index.html');

function getScriptPath() {
    if (fs.existsSync(MANAGED_SCRIPT_PATH)) {
        return MANAGED_SCRIPT_PATH;
    }
    return FALLBACK_SCRIPT_PATH;
}

function ensureScriptFile() {
    const target = getScriptPath();
    if (!fs.existsSync(target)) {
        fs.writeFileSync(target, '-- Boyfinity Violence District Main Script\nprint("Boyfinity loaded successfully!")\n', 'utf-8');
    }
}

const server = http.createServer((req, res) => {
    // Enable CORS for Roblox and web requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // 1. Raw Endpoint: /raw, /raw/script.lua, /api/raw, atau jika Accept: text/plain
    if (pathname === '/raw' || pathname === '/raw/script.lua' || pathname === '/api/raw') {
        ensureScriptFile();
        fs.readFile(getScriptPath(), 'utf-8', (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('-- Error reading lua script: ' + err.message);
                return;
            }
            res.writeHead(200, {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(data);
        });
        return;
    }

    // 2. API GET: /api/script (Fetch Script for Web Editor)
    if (pathname === '/api/script' && req.method === 'GET') {
        ensureScriptFile();
        const scriptFile = getScriptPath();
        fs.readFile(scriptFile, 'utf-8', (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
                return;
            }
            const stats = fs.statSync(scriptFile);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                content: data,
                lastModified: stats.mtime,
                filePath: scriptFile
            }));
        });
        return;
    }

    // 3. API POST: /api/script (Save/Update Script from Web Editor)
    if (pathname === '/api/script' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body);
                if (typeof parsed.content !== 'string') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Invalid content format' }));
                    return;
                }

                ensureScriptFile();
                const scriptFile = getScriptPath();
                fs.writeFile(scriptFile, parsed.content, 'utf-8', (err) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: err.message }));
                        return;
                    }
                    console.log(`[CloudScriptManager] Script updated successfully (${parsed.content.length} bytes)`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Script saved & deployed successfully' }));
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Malformed JSON payload' }));
            }
        });
        return;
    }

    // 4. Web Interface: Root (/)
    if (pathname === '/' || pathname === '/index.html') {
        fs.readFile(HTML_FILE_PATH, 'utf-8', (err, html) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error loading dashboard: ' + err.message);
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
        });
        return;
    }

    // 404 Handler
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

ensureScriptFile();

server.listen(PORT, HOST, () => {
    console.log(`====================================================`);
    console.log(`⚡ Boyfinity Cloud Script Manager running!`);
    console.log(`🌐 Web Interface : http://localhost:${PORT}`);
    console.log(`🔗 Raw Lua API   : http://localhost:${PORT}/raw`);
    console.log(`📁 Managed Script : ${getScriptPath()}`);
    console.log(`====================================================`);
});

