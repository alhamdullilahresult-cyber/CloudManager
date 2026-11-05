// api/scripts/[id].js - GET /api/scripts/:id
// PUBLIC endpoint: returns raw Lua script as plain text
// Rate limited: max 60 requests per minute per IP
import { supabase } from '../lib/supabase.js';

// Simple in-memory rate limiter (resets per serverless instance)
const rateLimitMap = new Map();
const RATE_LIMIT = 60; // requests per window
const RATE_WINDOW_MS = 60 * 1000; // 1 minute

function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, start: now };

    // Reset if window expired
    if (now - entry.start > RATE_WINDOW_MS) {
        entry.count = 0;
        entry.start = now;
    }

    entry.count++;
    rateLimitMap.set(ip, entry);

    return entry.count > RATE_LIMIT;
}

export default async function handler(req, res) {
    // CORS - allow any origin (needed for game:HttpGet in Roblox)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(405).send('-- Error: Method not allowed');
    }

    // Rate limiting
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
    if (isRateLimited(ip)) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Retry-After', '60');
        return res.status(429).send('-- Error: Rate limit exceeded. Please wait before retrying.');
    }

    // Extract script ID from URL
    const urlParts = req.url.split('?')[0].split('/');
    const scriptId = urlParts[urlParts.length - 1];

    if (!scriptId) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(400).send('-- Error: Script ID required');
    }

    try {
        const { data: script, error } = await supabase
            .from('scripts')
            .select('id, name, code, active, updated_at, version')
            .eq('id', scriptId)
            .single();

        if (error || !script) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.status(404).send(`-- Error: Script '${scriptId}' not found`);
        }

        if (!script.active) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.status(404).send(`-- Error: Script '${scriptId}' is not active`);
        }

        // Return the raw Lua code as plain text
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('X-Script-ID', script.id);
        res.setHeader('X-Script-Version', String(script.version || 1));
        res.setHeader('X-Last-Updated', script.updated_at || '');
        return res.status(200).send(script.code);

    } catch (err) {
        console.error(`[scripts/${scriptId}] Error:`, err);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(500).send('-- Error: Internal server error');
    }
}

