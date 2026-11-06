// api/admin/keys/[id].js - PUT (reset HWID / update status) & DELETE (delete key)
// Protected by JWT Auth
import { supabase } from '../../lib/supabase.js';
import { requireAuth, setCorsHeaders } from '../../lib/auth.js';

export default async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    const admin = requireAuth(req, res);
    if (!admin) return;

    // Ambil ID dari URL (key ID atau string key)
    const urlParts = req.url.split('?')[0].split('/');
    const keyParam = decodeURIComponent(urlParts[urlParts.length - 1]);

    if (!keyParam || keyParam === 'undefined') {
        return res.status(400).json({ success: false, error: 'Key identifier is required' });
    }

    // PUT: Reset HWID atau update status / note
    if (req.method === 'PUT') {
        try {
            const body = req.body || {};
            const parsed = typeof body === 'string' ? JSON.parse(body) : body;

            const updatePayload = {};

            // Action khusus: reset HWID
            if (parsed.action === 'reset_hwid') {
                updatePayload.hwid = null;
                updatePayload.status = 'active';
            } else {
                if (parsed.status !== undefined) updatePayload.status = parsed.status;
                if (parsed.note !== undefined) updatePayload.note = parsed.note;
                if (parsed.hwid !== undefined) updatePayload.hwid = parsed.hwid || null;
            }

            const { data, error } = await supabase
                .from('keys')
                .update(updatePayload)
                .or(`id.eq.${keyParam},key.eq.${keyParam}`)
                .select()
                .maybeSingle();

            if (error) throw error;
            if (!data) return res.status(404).json({ success: false, error: 'Key not found' });

            return res.status(200).json({ success: true, key: data });
        } catch (err) {
            console.error('[admin/keys PUT] Error:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    // DELETE: Hapus key permanen
    if (req.method === 'DELETE') {
        try {
            const { error } = await supabase
                .from('keys')
                .delete()
                .or(`id.eq.${keyParam},key.eq.${keyParam}`);

            if (error) throw error;
            return res.status(200).json({ success: true, message: 'Key deleted' });
        } catch (err) {
            console.error('[admin/keys DELETE] Error:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
}
