/**
 * Boyfinity Cloud Script Manager - Server (Local Development Runner)
 * Uses Supabase when credentials are provided in environment, or in-memory fallback.
 * Completely eliminates any write operation to local or /var/task filesystem!
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const HTML_FILE_PATH = path.resolve(__dirname, 'index.html');
const ADMIN_FILE_PATH = path.resolve(__dirname, 'admin.html');
const LOGIN_FILE_PATH = path.resolve(__dirname, 'login.html');

// In-memory script storage (Safe: zero disk write dependency)
let memoryScript = '-- Boyfinity Violence District Main Script\nprint("Boyfinity loaded successfully!")\n';
let memoryLastModified = new Date();

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
        supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        console.log('[Server] Connected to Supabase backend.');
    } catch (e) {
        console.warn('[Server] Supabase client init warning:', e.message);
    }
}

async function getLatestScript() {
    if (supabase) {
        try {
            const { data } = await supabase
                .from('scripts')
                .select('*')
                .eq('active', true)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (data && data.code) {
                return data.code;
            }
        } catch (e) {
            console.error('[Server] Error reading from Supabase:', e.message);
        }
    }
    return memoryScript;
}

const server = http.createServer(async (req, res) => {
    // Enable CORS for Roblox executors and Web requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // 1. Raw Endpoint: /raw, /raw/script.lua, /api/raw
    if (pathname === '/raw' || pathname === '/raw/script.lua' || pathname === '/api/raw') {
        const code = await getLatestScript();
        res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        res.end(code);
        return;
    }

    // 2. Public API endpoint per ID: /api/scripts/:id
    if (pathname.startsWith('/api/scripts/')) {
        const scriptId = pathname.replace('/api/scripts/', '').trim();
        if (supabase) {
            try {
                const { data, error } = await supabase
                    .from('scripts')
                    .select('*')
                    .eq('id', scriptId)
                    .single();

                if (error || !data) {
                    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end(`-- Error: Script '${scriptId}' not found`);
                    return;
                }
                if (!data.active) {
                    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end(`-- Error: Script '${scriptId}' is not active`);
                    return;
                }
                res.writeHead(200, {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                });
                res.end(data.code);
                return;
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('-- Error: Internal server error');
                return;
            }
        } else {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(memoryScript);
            return;
        }
    }

    // 3. API GET /api/script
    if (pathname === '/api/script' && req.method === 'GET') {
        const code = await getLatestScript();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            content: code,
            lastModified: memoryLastModified.getTime()
        }));
        return;
    }

    // 4. API POST /api/script
    if (pathname === '/api/script' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const parsed = JSON.parse(body);
                if (typeof parsed.content !== 'string') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Invalid content format' }));
                    return;
                }

                memoryScript = parsed.content;
                memoryLastModified = new Date();

                if (supabase) {
                    await supabase
                        .from('scripts')
                        .upsert({
                            id: 'default',
                            name: 'Default Script',
                            code: parsed.content,
                            active: true,
                            updated_at: new Date().toISOString()
                        });
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Script saved successfully' }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Malformed JSON payload' }));
            }
        });
        return;
    }

    // 5. Static UI pages
    if (pathname === '/' || pathname === '/index.html') {
        fs.readFile(HTML_FILE_PATH, 'utf-8', (err, html) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error loading dashboard');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
        });
        return;
    }

    if (pathname === '/admin' || pathname === '/admin.html') {
        fs.readFile(ADMIN_FILE_PATH, 'utf-8', (err, html) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error loading admin');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
        });
        return;
    }

    if (pathname === '/login' || pathname === '/login.html') {
        fs.readFile(LOGIN_FILE_PATH, 'utf-8', (err, html) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error loading login');
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

server.listen(PORT, HOST, () => {
    console.log(`====================================================`);
    console.log(`⚡ Boyfinity Cloud Script Manager running!`);
    console.log(`🌐 Web Interface : http://localhost:${PORT}`);
    console.log(`🔗 Raw Lua API   : http://localhost:${PORT}/raw`);
    console.log(`💾 Storage       : ${supabase ? 'Supabase Database' : 'Memory'}`);
    console.log(`====================================================`);
});
