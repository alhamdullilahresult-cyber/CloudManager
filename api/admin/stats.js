// api/admin/stats.js - GET /api/admin/stats
// Protected: returns aggregate statistics for dashboard
import { supabase } from '../lib/supabase.js';
import { requireAuth, setCorsHeaders } from '../lib/auth.js';

export default async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    const admin = requireAuth(req, res);
    if (!admin) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        // Total scripts
        const { count: total } = await supabase
            .from('scripts')
            .select('id', { count: 'exact', head: true });

        // Active scripts
        const { count: active } = await supabase
            .from('scripts')
            .select('id', { count: 'exact', head: true })
            .eq('active', true);

        // Total updates (sum of all version numbers)
        const { data: versionData } = await supabase
            .from('scripts')
            .select('version');

        const totalUpdates = (versionData || []).reduce((acc, s) => acc + (s.version || 1), 0);

        // Last updated script
        const { data: lastUpdated } = await supabase
            .from('scripts')
            .select('name, updated_at')
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();

        return res.status(200).json({
            success: true,
            stats: {
                total: total || 0,
                active: active || 0,
                inactive: (total || 0) - (active || 0),
                totalUpdates,
                lastUpdated: lastUpdated || null
            }
        });
    } catch (err) {
        console.error('[admin/stats GET] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
