// lib/auth.js - JWT authentication & Discord session helpers
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'boyfinity-production-secret-key-32chars-min';
const JWT_EXPIRES_IN = '7d';

/**
 * Sign a JWT token for user/staff/admin/owner
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
 * Extract and validate session from Authorization header or cookie
 */
export function requireAuth(req, res, requiredRole = null) {
    const headers = req.headers || {};
    const authHeader = headers['authorization'] || headers['Authorization'] || '';
    const cookieHeader = headers['cookie'] || headers['Cookie'] || '';

    let token = null;
    if (authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
    } else {
        const match = cookieHeader.match(/(?:^|;\s*)admin_token=([^;]+)/);
        if (match) token = match[1];
    }

    if (!token) {
        res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
        return null;
    }

    const payload = verifyToken(token);
    if (!payload) {
        res.status(401).json({ success: false, error: 'Unauthorized: Session expired or invalid' });
        return null;
    }

    // Role check hierarchy: owner > admin > staff > user
    if (requiredRole) {
        const rolesOrder = { user: 1, staff: 2, admin: 3, owner: 4 };
        const userLevel = rolesOrder[payload.role] || 1;
        const requiredLevel = rolesOrder[requiredRole] || 1;

        if (userLevel < requiredLevel) {
            res.status(403).json({ success: false, error: `Forbidden: Requires ${requiredRole.toUpperCase()} permission` });
            return null;
        }
    }

    return payload;
}

/**
 * Cors & Standard Security Headers
 */
export function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
}
