// lib/auth.js - JWT authentication helpers
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';
const JWT_EXPIRES_IN = '8h';

/**
 * Sign a JWT token for admin
 */
export function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify a JWT token and return the decoded payload, or null if invalid
 */
export function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

/**
 * Middleware: Extract and validate JWT from Authorization header or cookie
 * Usage: const admin = requireAuth(req, res); if (!admin) return;
 */
export function requireAuth(req, res) {
    const authHeader = req.headers['authorization'] || '';
    const cookieHeader = req.headers['cookie'] || '';

    // Try Authorization: Bearer <token>
    let token = null;
    if (authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
    } else {
        // Try cookie: admin_token=<token>
        const match = cookieHeader.match(/(?:^|;\s*)admin_token=([^;]+)/);
        if (match) token = match[1];
    }

    if (!token) {
        res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
        return null;
    }

    const payload = verifyToken(token);
    if (!payload) {
        res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired token' });
        return null;
    }

    return payload;
}

/**
 * Cors + standard headers helper
 */
export function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
