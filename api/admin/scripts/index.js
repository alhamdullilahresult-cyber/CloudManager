// api/admin/scripts/index.js - GET/POST /api/admin/scripts
// Protected: List all scripts or create a new one
import { supabase } from '../../lib/supabase.js';
import { requireAuth, setCorsHeaders } from '../../lib/auth.js';
import { generateScriptId } from '../../lib/utils.js';

export default async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    // All admin routes require auth
    const admin = requireAuth(req, res);
    if (!admin) return;

    // GET /api/admin/scripts - list all scripts
    if (req.method === 'GET') {
        try {
            const { data, error } = await supabase
                .from('scripts')
                .select('id, name, description, active, created_at, updated_at, version')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return res.status(200).json({ success: true, scripts: data });
        } catch (err) {
            console.error('[admin/scripts GET] Error:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    // POST /api/admin/scripts - create new script
    if (req.method === 'POST') {
        try {
            const body = req.body || {};
            const { name, description, code, active } = typeof body === 'string' ? JSON.parse(body) : body;

            // Validation
            if (!name || typeof name !== 'string' || name.trim().length === 0) {
                return res.status(400).json({ success: false, error: 'Script name is required' });
            }
            if (name.length > 100) {
                return res.status(400).json({ success: false, error: 'Script name too long (max 100 chars)' });
            }
            if (typeof code !== 'string') {
                return res.status(400).json({ success: false, error: 'Script code must be a string' });
            }

            const scriptId = generateScriptId(name);
            const now = new Date().toISOString();

            const { data, error } = await supabase
                .from('scripts')
                .insert({
                    id: scriptId,
                    name: name.trim(),
                    description: (description || '').trim(),
                    code: code,
                    active: active !== false, // default true
                    created_at: now,
                    updated_at: now,
                    version: 1
                })
                .select()
                .single();

            if (error) {
                if (error.code === '23505') {
                    return res.status(409).json({ success: false, error: 'A script with this ID already exists' });
                }
                throw error;
            }

            // Save first version to history
            await supabase.from('script_history').insert({
                script_id: data.id,
                code: code,
                version: 1,
                note: 'Initial version',
                saved_at: now
            });

            return res.status(201).json({ success: true, script: data });
        } catch (err) {
            console.error('[admin/scripts POST] Error:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
}

