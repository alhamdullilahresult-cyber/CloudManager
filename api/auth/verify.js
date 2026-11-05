// api/auth/verify.js - GET /api/auth/verify
// Checks if the current admin token is valid
import { requireAuth, setCorsHeaders } from '../lib/auth.js';

export default function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    const admin = requireAuth(req, res);
    if (!admin) return; // requireAuth already sent 401

    return res.status(200).json({ success: true, role: admin.role });
}

