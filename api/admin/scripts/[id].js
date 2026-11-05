// api/admin/scripts/[id].js - GET/PUT/DELETE /api/admin/scripts/:id
// Protected: Get, update, or delete a specific script
import { supabase } from '../../lib/supabase.js';
import { requireAuth, setCorsHeaders } from '../../lib/auth.js';

export default async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    const admin = requireAuth(req, res);
    if (!admin) return;

    // Extract script ID from URL
    const urlParts = req.url.split('?')[0].split('/');
    const scriptId = urlParts[urlParts.length - 1];

    if (!scriptId || scriptId === 'undefined') {
        return res.status(400).json({ success: false, error: 'Script ID required' });
    }

    // GET /api/admin/scripts/:id - get single script (with full code and history)
    if (req.method === 'GET') {
        try {
            const { data: script, error } = await supabase
                .from('scripts')
                .select('*')
                .eq('id', scriptId)
                .single();

            if (error || !script) {
                return res.status(404).json({ success: false, error: 'Script not found' });
            }

            // Get version history (last 20 versions)
            const { data: history } = await supabase
                .from('script_history')
                .select('id, version, note, saved_at')
                .eq('script_id', scriptId)
                .order('version', { ascending: false })
                .limit(20);

            return res.status(200).json({ success: true, script, history: history || [] });
        } catch (err) {
            console.error(`[admin/scripts/${scriptId} GET] Error:`, err);
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    // PUT /api/admin/scripts/:id - update script
    if (req.method === 'PUT') {
        try {
            const body = req.body || {};
            const { name, description, code, active, version_note } = typeof body === 'string' ? JSON.parse(body) : body;

            // Validation
            if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
                return res.status(400).json({ success: false, error: 'Script name cannot be empty' });
            }
            if (name !== undefined && name.length > 100) {
                return res.status(400).json({ success: false, error: 'Script name too long (max 100 chars)' });
            }

            // Get current script
            const { data: existing, error: fetchErr } = await supabase
                .from('scripts')
                .select('*')
                .eq('id', scriptId)
                .single();

            if (fetchErr || !existing) {
                return res.status(404).json({ success: false, error: 'Script not found' });
            }

            const updatePayload = { updated_at: new Date().toISOString() };
            if (name !== undefined) updatePayload.name = name.trim();
            if (description !== undefined) updatePayload.description = description.trim();
            if (typeof code === 'string') updatePayload.code = code;
            if (active !== undefined) updatePayload.active = !!active;

            // Bump version if code changed
            const codeChanged = typeof code === 'string' && code !== existing.code;
            if (codeChanged) {
                updatePayload.version = (existing.version || 1) + 1;
            }

            const { data: updated, error: updateErr } = await supabase
                .from('scripts')
                .update(updatePayload)
                .eq('id', scriptId)
                .select()
                .single();

            if (updateErr) throw updateErr;

            // Save to history if code changed
            if (codeChanged) {
                await supabase.from('script_history').insert({
                    script_id: scriptId,
                    code: code,
                    version: updatePayload.version,
                    note: version_note || `Updated to v${updatePayload.version}`,
                    saved_at: updatePayload.updated_at
                });
            }

            return res.status(200).json({ success: true, script: updated });
        } catch (err) {
            console.error(`[admin/scripts/${scriptId} PUT] Error:`, err);
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    // DELETE /api/admin/scripts/:id
    if (req.method === 'DELETE') {
        try {
            const { error } = await supabase
                .from('scripts')
                .delete()
                .eq('id', scriptId);

            if (error) throw error;
            return res.status(200).json({ success: true, message: 'Script deleted' });
        } catch (err) {
            console.error(`[admin/scripts/${scriptId} DELETE] Error:`, err);
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
}
