// Vercel Serverless Function: /api/script
// Handles GET (fetch script) & POST (save script) on Vercel deployment

import fs from 'fs';
import path from 'path';

// File fallback di serverless /tmp agar bisa ditulis saat runtime Vercel
const TMP_FILE = '/tmp/script.lua';

const DEFAULT_SCRIPT = `-- Boyfinity Violence District Main Script (Vercel Cloud)
print("[Boyfinity Cloud] Loaded successfully from Vercel!")
`;

function getScriptContent() {
    // 1. Cek environment variable SAVED_LUA_SCRIPT (kalau diset di dashboard Vercel)
    if (process.env.SAVED_LUA_SCRIPT && !fs.existsSync(TMP_FILE)) {
        return process.env.SAVED_LUA_SCRIPT;
    }
    // 2. Cek file di /tmp
    if (fs.existsSync(TMP_FILE)) {
        try {
            return fs.readFileSync(TMP_FILE, 'utf-8');
        } catch (e) {}
    }
    return DEFAULT_SCRIPT;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method === 'GET') {
        const content = getScriptContent();
        return res.status(200).json({
            success: true,
            content: content,
            lastModified: Date.now(),
            env: 'vercel-serverless'
        });
    }

    if (req.method === 'POST') {
        try {
            const body = req.body || {};
            const content = typeof body === 'string' ? JSON.parse(body).content : body.content;

            if (typeof content !== 'string') {
                return res.status(400).json({ success: false, error: 'Invalid content format' });
            }

            // Simpan ke /tmp
            fs.writeFileSync(TMP_FILE, content, 'utf-8');

            return res.status(200).json({
                success: true,
                message: 'Script successfully saved to cloud instance!',
                length: content.length
            });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
}

