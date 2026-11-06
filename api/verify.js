// api/verify.js - POST /api/verify
// Public endpoint for Roblox Executor to verify Key & bind HWID
import { supabase } from './lib/supabase.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const body = req.body || {};
        const parsed = typeof body === 'string' ? JSON.parse(body) : body;
        const key = (parsed.key || '').trim();
        const hwid = (parsed.hwid || '').trim();

        if (!key || !hwid) {
            return res.status(400).json({ success: false, error: 'Key dan HWID diperlukan' });
        }

        // Cari key di database Supabase
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

        // Cek binding HWID
        if (!keyRecord.hwid) {
            // Belum pernah terikat: Ikat HWID pertama kali
            const now = new Date().toISOString();
            const { error: updateErr } = await supabase
                .from('keys')
                .update({
                    hwid: hwid,
                    status: 'used',
                    last_used: now,
                    registered_at: keyRecord.registered_at || now
                })
                .eq('key', key);

            if (updateErr) throw updateErr;

            return res.status(200).json({
                success: true,
                message: 'Verifikasi berhasil! Perangkat didaftarkan.',
                bound: true
            });
        }

        // Sudah terikat: Bandingkan HWID
        if (keyRecord.hwid === hwid) {
            await supabase
                .from('keys')
                .update({ last_used: new Date().toISOString() })
                .eq('key', key);

            return res.status(200).json({
                success: true,
                message: 'Verifikasi berhasil! Selamat datang kembali.',
                bound: true
            });
        } else {
            return res.status(403).json({
                success: false,
                error: 'HWID Mismatch! Key ini sudah terikat pada perangkat lain.'
            });
        }

    } catch (err) {
        console.error('[verify] Error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error: ' + err.message });
    }
}
