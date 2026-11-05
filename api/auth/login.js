// api/auth/login.js - POST /api/auth/login
// Authenticates admin and returns JWT token
import bcrypt from 'bcryptjs';
import { signToken, setCorsHeaders } from '../lib/auth.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const body = req.body || {};
        const { password } = typeof body === 'string' ? JSON.parse(body) : body;

        if (!password || typeof password !== 'string') {
            return res.status(400).json({ success: false, error: 'Password required' });
        }

        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
        const adminPasswordPlain = process.env.ADMIN_PASSWORD;

        if (!adminPasswordHash && !adminPasswordPlain) {
            return res.status(500).json({ success: false, error: 'Admin credentials not configured' });
        }

        let valid = false;

        if (adminPasswordHash) {
            // Compare against bcrypt hash (recommended)
            valid = await bcrypt.compare(password, adminPasswordHash);
        } else if (adminPasswordPlain) {
            // Plain comparison fallback (less secure, use for initial setup only)
            valid = password === adminPasswordPlain;
        }

        if (!valid) {
            // Intentional delay to slow down brute force
            await new Promise(r => setTimeout(r, 1000));
            return res.status(401).json({ success: false, error: 'Invalid password' });
        }

        const token = signToken({ role: 'admin', iat: Date.now() });

        res.setHeader('Set-Cookie', `admin_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
        return res.status(200).json({ success: true, token });

    } catch (err) {
        console.error('[auth/login] Error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

