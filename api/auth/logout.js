// api/auth/logout.js - POST /api/auth/logout
// Clears the admin session cookie
import { setCorsHeaders } from '../lib/auth.js';

export default function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // Clear the HttpOnly cookie by setting max-age=0
    res.setHeader('Set-Cookie', 'admin_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
    return res.status(200).json({ success: true, message: 'Logged out' });
}

