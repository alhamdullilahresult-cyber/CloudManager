// Vercel Serverless Function: /api/raw
// Fetches the default/active script from Supabase database
import { supabase } from './lib/supabase.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    try {
        // Query active script from Supabase (by id 'default', or first active script)
        let { data: script, error } = await supabase
            .from('scripts')
            .select('id, name, code, active, updated_at, version')
            .eq('id', 'default')
            .eq('active', true)
            .maybeSingle();

        if (!script) {
            // Fallback to the latest updated active script
            const { data: latestScript, error: latestErr } = await supabase
                .from('scripts')
                .select('id, name, code, active, updated_at, version')
                .eq('active', true)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            script = latestScript;
            error = latestErr;
        }

        if (error || !script) {
            return res.status(404).send('-- Error: No active script found in database');
        }

        res.setHeader('X-Script-ID', script.id);
        res.setHeader('X-Script-Version', String(script.version || 1));
        return res.status(200).send(script.code);

    } catch (err) {
        console.error('[raw.js] Error fetching from Supabase:', err);
        return res.status(500).send('-- Error: Internal server error while fetching script');
    }
}
