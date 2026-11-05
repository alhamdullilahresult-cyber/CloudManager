// api/lib/utils.js - Shared utility functions
/**
 * Generate a URL-safe unique script ID from name + random suffix
 * Example: "My Script" -> "my-script-a3f9"
 */
export function generateScriptId(name) {
    const base = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
    const suffix = Math.random().toString(36).slice(2, 6);
    return `${base}-${suffix}`;
}

/**
 * Sanitize string input
 */
export function sanitizeString(str, maxLen = 500) {
    if (typeof str !== 'string') return '';
    return str.trim().slice(0, maxLen);
}

