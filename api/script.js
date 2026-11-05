// Vercel Serverless Function: /api/script
// Handles GET (fetch default script) & POST (update/save script) using Supabase database
import { supabase } from './lib/supabase.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method === 'GET') {
        try {
            // Find default script or latest active script from Supabase
            let { data: script, error } = await supabase
                .from('scripts')
                .select('*')
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw error;

            if (!script) {
                return res.status(200).json({
                    success: true,
                    content: '-- No script stored yet\nprint("Boyfinity LuaVault initialized!")',
                    lastModified: Date.now(),
                    id: null
                });
            }

            return res.status(200).json({
                success: true,
                content: script.code,
                lastModified: new Date(script.updated_at).getTime(),
                id: script.id,
                name: script.name,
                active: script.active
            });
        } catch (err) {
            console.error('[api/script GET] Error:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const body = req.body || {};
            const content = typeof body === 'string' ? JSON.parse(body).content : body.content;

            if (typeof content !== 'string') {
                return res.status(400).json({ success: false, error: 'Invalid content format' });
            }

            const now = new Date().toISOString();

            // Check if default script exists
            const { data: existing } = await supabase
                .from('scripts')
                .select('id, version')
                .eq('id', 'default')
                .maybeSingle();

            let targetId = 'default';
            let nextVersion = (existing?.version || 1) + 1;

            if (existing) {
                await supabase
                    .from('scripts')
                    .update({
                        code: content,
                        version: nextVersion,
                        updated_at: now
                    })
                    .eq('id', 'default');
            } else {
                await supabase
                    .from('scripts')
                    .insert({
                        id: 'default',
                        name: 'Default Script',
                        description: 'Main cloud script',
                        code: content,
                        active: true,
                        version: 1,
                        created_at: now,
                        updated_at: now
                    });
                nextVersion = 1;
            }

            // Save history entry
            await supabase.from('script_history').insert({
                script_id: targetId,
                code: content,
                version: nextVersion,
                note: `Updated via /api/script`,
                saved_at: now
            });

            return res.status(200).json({
                success: true,
                message: 'Script successfully saved to Supabase database!',
                length: content.length,
                version: nextVersion
            });
        } catch (err) {
            console.error('[api/script POST] Error:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
}
