// api/index.js - Unified Serverless Router for Boyfinity Cloud Script Platform
// Single Serverless Function consolidating all endpoints to satisfy Vercel Hobby plan limits (max 12 functions).
import { supabase } from './lib/supabase.js';
import { requireAuth, setCorsHeaders, signToken } from './lib/auth.js';
import { generateScriptId } from './lib/utils.js';

// Generator format key wajib: BOY∞-XXXX-XXXX-XXXX
function generateBoyfinityKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const genBlock = () => {
        let b = '';
        for (let i = 0; i < 4; i++) {
            b += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return b;
    };
    return `BOY∞-${genBlock()}-${genBlock()}-${genBlock()}`;
}

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // Helper untuk membaca parse JSON body
    let body = {};
    if (req.body) {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }

    try {
        // ─────────────────────────────────────────────────────────────
        // 1. PUBLIC: /raw atau /api/raw -> Ambil script default/terbaru
        // ─────────────────────────────────────────────────────────────
        if (pathname === '/raw' || pathname === '/api/raw') {
            const userAgent = (req.headers['user-agent'] || '').toLowerCase();
            const secFetchDest = req.headers['sec-fetch-dest'] || '';
            const secFetchMode = req.headers['sec-fetch-mode'] || '';
            const acceptHeader = (req.headers['accept'] || '').toLowerCase();
            const isBrowser = secFetchMode === 'navigate' || secFetchDest === 'document' || acceptHeader.includes('text/html') || (/mozilla\/|chrome\/|safari\/|edg\/|opera\//i.test(userAgent) && !/roblox/i.test(userAgent));

            if (isBrowser) {
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                return res.status(404).send('404 Not Found: Anda tidak diizinkan mengakses endpoint ini.');
            }

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

            let { data: script } = await supabase
                .from('scripts')
                .select('id, code, active, updated_at, version')
                .eq('id', 'default')
                .eq('active', true)
                .maybeSingle();

            if (!script) {
                const { data: latest } = await supabase
                    .from('scripts')
                    .select('id, code, active, updated_at, version')
                    .eq('active', true)
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                script = latest;
            }

            if (!script) {
                return res.status(404).send('-- Error: No active script found');
            }

            res.setHeader('X-Script-ID', script.id);
            res.setHeader('X-Script-Version', String(script.version || 1));
            return res.status(200).send(script.code);
        }

        // ─────────────────────────────────────────────────────────────
        // 2. PUBLIC: /api/scripts/:id -> Ambil raw script berdasarkan ID
        // ─────────────────────────────────────────────────────────────
        if (pathname.startsWith('/api/scripts/')) {
            const scriptId = pathname.replace('/api/scripts/', '').split('?')[0].trim();
            
            const userAgent = (req.headers['user-agent'] || '').toLowerCase();
            const secFetchDest = req.headers['sec-fetch-dest'] || '';
            const secFetchMode = req.headers['sec-fetch-mode'] || '';
            const acceptHeader = (req.headers['accept'] || '').toLowerCase();
            const isBrowser = secFetchMode === 'navigate' || secFetchDest === 'document' || acceptHeader.includes('text/html') || (/mozilla\/|chrome\/|safari\/|edg\/|opera\//i.test(userAgent) && !/roblox/i.test(userAgent));

            if (isBrowser) {
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                return res.status(404).send('404 Not Found: Anda tidak diizinkan mengakses endpoint ini.');
            }

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

            if (!scriptId) return res.status(400).send('-- Error: Script ID required');

            const { data: script, error } = await supabase
                .from('scripts')
                .select('id, name, code, active, updated_at, version')
                .eq('id', scriptId)
                .maybeSingle();

            if (error || !script) return res.status(404).send(`-- Error: Script '${scriptId}' not found`);
            if (!script.active) return res.status(404).send(`-- Error: Script '${scriptId}' is not active`);

            res.setHeader('X-Script-ID', script.id);
            res.setHeader('X-Script-Version', String(script.version || 1));
            res.setHeader('X-Last-Updated', script.updated_at || '');
            return res.status(200).send(script.code);
        }

        // ─────────────────────────────────────────────────────────────
        // 3. PUBLIC: POST /api/verify -> Verifikasi Key & HWID (Roblox)
        // ─────────────────────────────────────────────────────────────
        if (pathname === '/api/verify') {
            if (method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
            
            const key = (body.key || '').trim();
            const hwid = (body.hwid || '').trim();

            if (!key || !hwid) {
                return res.status(400).json({ success: false, error: 'Key dan HWID diperlukan' });
            }

            const { data: keyRecord, error } = await supabase
                .from('keys')
                .select('*')
                .eq('key', key)
                .maybeSingle();

            if (error || !keyRecord) {
                return res.status(404).json({ success: false, error: 'Key tidak ditemukan atau tidak valid' });
            }

            if (keyRecord.status === 'revoked' || keyRecord.status === 'expired') {
                return res.status(403).json({ success: false, error: 'Key ini telah dinonaktifkan atau kadaluarsa' });
            }

            const now = new Date().toISOString();
            if (!keyRecord.hwid) {
                // Ikat HWID pertama kali
                await supabase
                    .from('keys')
                    .update({ hwid, status: 'used', last_used: now, registered_at: keyRecord.registered_at || now })
                    .eq('key', key);

                return res.status(200).json({ success: true, message: 'Verifikasi berhasil! Perangkat didaftarkan.', bound: true });
            }

            if (keyRecord.hwid === hwid) {
                await supabase.from('keys').update({ last_used: now }).eq('key', key);
                return res.status(200).json({ success: true, message: 'Verifikasi berhasil! Selamat datang kembali.', bound: true });
            } else {
                return res.status(403).json({ success: false, error: 'HWID Mismatch! Key ini sudah terikat pada perangkat lain.' });
            }
        }

        // ─────────────────────────────────────────────────────────────
        // 4. AUTH: /api/auth/login, /api/auth/verify, /api/auth/logout
        // ─────────────────────────────────────────────────────────────
        if (pathname === '/api/auth/login') {
            if (method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
            const { password } = body;
            const adminPassword = process.env.ADMIN_PASSWORD;

            if (!adminPassword) return res.status(500).json({ success: false, error: 'ADMIN_PASSWORD not configured' });
            if (password !== adminPassword) {
                await new Promise(r => setTimeout(r, 1000));
                return res.status(401).json({ success: false, error: 'Invalid password' });
            }

            const token = signToken({ role: 'admin', iat: Date.now() });
            res.setHeader('Set-Cookie', `admin_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
            return res.status(200).json({ success: true, token });
        }

        if (pathname === '/api/auth/verify') {
            const admin = requireAuth(req, res);
            if (!admin) return;
            return res.status(200).json({ success: true, role: admin.role });
        }

        if (pathname === '/api/auth/logout') {
            res.setHeader('Set-Cookie', 'admin_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
            return res.status(200).json({ success: true, message: 'Logged out' });
        }

        // ─────────────────────────────────────────────────────────────
        // 5. PROTECTED ADMIN: /api/admin/stats
        // ─────────────────────────────────────────────────────────────
        if (pathname === '/api/admin/stats') {
            const admin = requireAuth(req, res);
            if (!admin) return;

            const { count: total } = await supabase.from('scripts').select('id', { count: 'exact', head: true });
            const { count: active } = await supabase.from('scripts').select('id', { count: 'exact', head: true }).eq('active', true);
            const { data: versionData } = await supabase.from('scripts').select('version');
            const totalUpdates = (versionData || []).reduce((acc, s) => acc + (s.version || 1), 0);
            const { data: lastUpdated } = await supabase.from('scripts').select('name, updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle();

            return res.status(200).json({
                success: true,
                stats: { total: total || 0, active: active || 0, inactive: (total || 0) - (active || 0), totalUpdates, lastUpdated: lastUpdated || null }
            });
        }

        // ─────────────────────────────────────────────────────────────
        // 6. PROTECTED ADMIN: /api/admin/scripts/:id
        // ─────────────────────────────────────────────────────────────
        if (pathname.startsWith('/api/admin/scripts/')) {
            const admin = requireAuth(req, res);
            if (!admin) return;

            const scriptId = pathname.replace('/api/admin/scripts/', '').split('?')[0].trim();
            if (!scriptId) return res.status(400).json({ success: false, error: 'Script ID required' });

            if (method === 'GET') {
                const { data: script, error } = await supabase.from('scripts').select('*').eq('id', scriptId).single();
                if (error || !script) return res.status(404).json({ success: false, error: 'Script not found' });
                const { data: history } = await supabase.from('script_history').select('id, version, note, saved_at').eq('script_id', scriptId).order('version', { ascending: false }).limit(20);
                return res.status(200).json({ success: true, script, history: history || [] });
            }

            if (method === 'PUT') {
                const { name, description, code, active, version_note } = body;
                const { data: existing, error: fetchErr } = await supabase.from('scripts').select('*').eq('id', scriptId).single();
                if (fetchErr || !existing) return res.status(404).json({ success: false, error: 'Script not found' });

                const updatePayload = { updated_at: new Date().toISOString() };
                if (name !== undefined) updatePayload.name = name.trim();
                if (description !== undefined) updatePayload.description = description.trim();
                if (typeof code === 'string') updatePayload.code = code;
                if (active !== undefined) updatePayload.active = !!active;

                const codeChanged = typeof code === 'string' && code !== existing.code;
                if (codeChanged) updatePayload.version = (existing.version || 1) + 1;

                const { data: updated, error: updateErr } = await supabase.from('scripts').update(updatePayload).eq('id', scriptId).select().single();
                if (updateErr) throw updateErr;

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
            }

            if (method === 'DELETE') {
                await supabase.from('scripts').delete().eq('id', scriptId);
                return res.status(200).json({ success: true, message: 'Script deleted' });
            }
        }

        // ─────────────────────────────────────────────────────────────
        // 7. PROTECTED ADMIN: /api/admin/scripts (GET all & POST new)
        // ─────────────────────────────────────────────────────────────
        if (pathname === '/api/admin/scripts') {
            const admin = requireAuth(req, res);
            if (!admin) return;

            if (method === 'GET') {
                const { data, error } = await supabase.from('scripts').select('id, name, description, active, created_at, updated_at, version').order('created_at', { ascending: false });
                if (error) throw error;
                return res.status(200).json({ success: true, scripts: data });
            }

            if (method === 'POST') {
                const { name, description, code, active } = body;
                if (!name || typeof name !== 'string') return res.status(400).json({ success: false, error: 'Script name required' });
                const scriptId = generateScriptId(name);
                const now = new Date().toISOString();

                const { data, error } = await supabase.from('scripts').insert({
                    id: scriptId,
                    name: name.trim(),
                    description: (description || '').trim(),
                    code: typeof code === 'string' ? code : '',
                    active: active !== false,
                    created_at: now,
                    updated_at: now,
                    version: 1
                }).select().single();

                if (error) throw error;

                await supabase.from('script_history').insert({
                    script_id: data.id,
                    code: code || '',
                    version: 1,
                    note: 'Initial version',
                    saved_at: now
                });

                return res.status(201).json({ success: true, script: data });
            }
        }

        // ─────────────────────────────────────────────────────────────
        // 8. PROTECTED ADMIN: /api/admin/keys/:id (PUT reset/update & DELETE)
        // ─────────────────────────────────────────────────────────────
        if (pathname.startsWith('/api/admin/keys/')) {
            const admin = requireAuth(req, res);
            if (!admin) return;

            const keyParam = decodeURIComponent(pathname.replace('/api/admin/keys/', '').split('?')[0].trim());

            if (method === 'PUT') {
                const updatePayload = {};
                if (body.action === 'reset_hwid') {
                    updatePayload.hwid = null;
                    updatePayload.status = 'active';
                } else {
                    if (body.status !== undefined) updatePayload.status = body.status;
                    if (body.note !== undefined) updatePayload.note = body.note;
                    if (body.hwid !== undefined) updatePayload.hwid = body.hwid || null;
                }

                const { data, error } = await supabase.from('keys').update(updatePayload).or(`id.eq.${keyParam},key.eq.${keyParam}`).select().maybeSingle();
                if (error) throw error;
                return res.status(200).json({ success: true, key: data });
            }

            if (method === 'DELETE') {
                await supabase.from('keys').delete().or(`id.eq.${keyParam},key.eq.${keyParam}`);
                return res.status(200).json({ success: true, message: 'Key deleted' });
            }
        }

        // ─────────────────────────────────────────────────────────────
        // 9. PROTECTED ADMIN: /api/admin/keys (GET all & POST batch)
        // ─────────────────────────────────────────────────────────────
        if (pathname === '/api/admin/keys') {
            const admin = requireAuth(req, res);
            if (!admin) return;

            if (method === 'GET') {
                const { data, error } = await supabase.from('keys').select('*').order('created_at', { ascending: false });
                if (error) throw error;
                return res.status(200).json({ success: true, keys: data || [] });
            }

            if (method === 'POST') {
                const note = (body.note || '').trim();
                const count = Math.min(Math.max(parseInt(body.count, 10) || 1, 1), 20);
                const newKeys = [];
                const now = new Date().toISOString();

                for (let i = 0; i < count; i++) {
                    newKeys.push({
                        key: generateBoyfinityKey(),
                        status: 'active',
                        hwid: null,
                        note: note || 'Generated by Admin',
                        created_at: now,
                        registered_at: null,
                        last_used: null
                    });
                }

                const { data, error } = await supabase.from('keys').insert(newKeys).select();
                if (error) throw error;
                return res.status(201).json({ success: true, keys: data });
            }
        }

        // 404 jika rute tidak ditemukan
        return res.status(404).json({ success: false, error: 'API Endpoint Not Found' });

    } catch (err) {
        console.error('[Unified API Error]:', err);
        return res.status(500).json({ success: false, error: 'Internal Server Error: ' + err.message });
    }
}
