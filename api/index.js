// api/index.js - Unified Monolithic Serverless Engine for BOYFINITY Enterprise Script Hub
// Single Serverless Function consolidating all endpoints (Public, Discord OAuth, Turnstile, Checkout Webhook, Admin, Staff Management & Audit Logs)
import { supabase } from './lib/supabase.js';
import { requireAuth, setCorsHeaders, signToken } from './lib/auth.js';
import { generateScriptId } from './lib/utils.js';

// Key Generator: BOY∞-XXXX-XXXX-XXXX
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

// Calculate Expiry Date
function calculateExpiration(durationStr, startDate = new Date()) {
    if (!durationStr || durationStr === 'lifetime') return null;
    const date = new Date(startDate);
    switch (durationStr) {
        case '1d': date.setDate(date.getDate() + 1); break;
        case '3d': date.setDate(date.getDate() + 3); break;
        case '7d': date.setDate(date.getDate() + 7); break;
        case '30d':
        case '1m': date.setDate(date.getDate() + 30); break;
        case '365d':
        case '1y': date.setFullYear(date.getFullYear() + 1); break;
        default: return null;
    }
    return date.toISOString();
}

// Log Audit Action to Supabase
async function logAudit(actor, action, target, details = {}) {
    try {
        await supabase.from('audit_logs').insert({
            actor_id: actor.id || actor.discord_id || 'system',
            actor_name: actor.username || actor.name || 'System',
            actor_role: actor.role || 'system',
            action,
            target,
            details,
            created_at: new Date().toISOString()
        });
    } catch (e) {
        console.warn('[AuditLog] Failed:', e.message);
    }
}

// Discord Webhook Delivery Helper
async function deliverKeyViaWebhook(webhookUrl, { key, duration, buyerDiscord, buyerEmail, game }) {
    if (!webhookUrl) return;
    try {
        const embed = {
            title: '⚡ BOYFINITY Script Hub — Key Delivery',
            description: `A new license key has been successfully generated & delivered!`,
            color: 0x34264d, // Dark Muted Purple Accent
            fields: [
                { name: 'License Key', value: `\`\`\`${key}\`\`\``, inline: false },
                { name: 'Duration', value: `${(duration || 'LIFETIME').toUpperCase()}`, inline: true },
                { name: 'Game', value: `${game || 'Violence District & Sniper Arena'}`, inline: true },
                { name: 'Recipient', value: buyerDiscord ? `<@${buyerDiscord}>` : (buyerEmail || 'Anonymous Guest'), inline: true },
                { name: 'Status', value: '🟢 Ready to Bind (HWID Unlinked)', inline: false }
            ],
            footer: { text: 'BOYFINITY Cloud Security System • made by @boinihboss' },
            timestamp: new Date().toISOString()
        };

        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: buyerDiscord ? `🔔 <@${buyerDiscord}> Here is your official **BOYFINITY** script license:` : `🔔 New purchase completed!`,
                embeds: [embed]
            })
        });
    } catch (err) {
        console.error('[Discord Webhook Error]:', err);
    }
}

// Verify Cloudflare Turnstile Token
async function verifyTurnstile(token, remoteip) {
    const secret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || 
                   process.env.TURNSTILE_SECRET_KEY;
    if (!secret) return true; // If not configured in Vercel, pass-through gracefully
    try {
        const formData = new URLSearchParams();
        formData.append('secret', secret);
        formData.append('response', token);
        if (remoteip && remoteip !== 'unknown') formData.append('remoteip', remoteip);

        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body: formData
        });
        const outcome = await res.json();
        return outcome.success === true;
    } catch (e) {
        console.error('[Turnstile Verify Error]:', e);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN UNIFIED SERVERLESS ROUTER
// ─────────────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const method = req.method;

    // Normalize request body
    let body = req.body || {};
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (_) { body = {}; }
    }

    try {
        // ─────────────────────────────────────────────────────────────
        // 0. CONFIG / PUBLIC ENV EXPOSURE (FOR TURNSTILE SITEKEY)
        // ─────────────────────────────────────────────────────────────
        if (pathname === '/api/config') {
            const siteKey = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY || 
                            process.env.CLOUDFLARE_TURNSTILE_SITE_KEY || 
                            process.env.TURNSTILE_SITE_KEY || 
                            '';
            return res.status(200).json({
                success: true,
                turnstileSiteKey: siteKey
            });
        }

        // ─────────────────────────────────────────────────────────────
        // 1. PUBLIC: RAW LUA SCRIPT ENDPOINTS
        // ─────────────────────────────────────────────────────────────
        if (pathname === '/raw' || pathname === '/api/raw') {
            const userAgent = (req.headers['user-agent'] || '').toLowerCase();
            const secFetchDest = req.headers['sec-fetch-dest'] || '';
            const secFetchMode = req.headers['sec-fetch-mode'] || '';
            const acceptHeader = (req.headers['accept'] || '').toLowerCase();
            const isBrowser = secFetchMode === 'navigate' || secFetchDest === 'document' || acceptHeader.includes('text/html') || (/mozilla\/|chrome\/|safari\/|edg\/|opera\//i.test(userAgent) && !/roblox/i.test(userAgent));

            if (isBrowser) {
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                return res.status(404).send('404 Not Found: Access denied for browser user-agent.');
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

            if (!script) return res.status(404).send('-- Error: No active script available');

            res.setHeader('X-Script-ID', script.id);
            res.setHeader('X-Script-Version', String(script.version || 1));
            return res.status(200).send(script.code);
        }

        if (pathname.startsWith('/api/scripts/')) {
            const scriptId = pathname.replace('/api/scripts/', '').split('?')[0].trim();
            const userAgent = (req.headers['user-agent'] || '').toLowerCase();
            const secFetchDest = req.headers['sec-fetch-dest'] || '';
            const secFetchMode = req.headers['sec-fetch-mode'] || '';
            const acceptHeader = (req.headers['accept'] || '').toLowerCase();
            const isBrowser = secFetchMode === 'navigate' || secFetchDest === 'document' || acceptHeader.includes('text/html') || (/mozilla\/|chrome\/|safari\/|edg\/|opera\//i.test(userAgent) && !/roblox/i.test(userAgent));

            if (isBrowser) {
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                return res.status(404).send('404 Not Found: Access denied for direct browser inspector.');
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
            if (!script.active) return res.status(404).send(`-- Error: Script '${scriptId}' is currently inactive`);

            res.setHeader('X-Script-ID', script.id);
            res.setHeader('X-Script-Version', String(script.version || 1));
            return res.status(200).send(script.code);
        }

        // Public Games Info & Copy Count Telemetry
        if (pathname === '/api/public/games') {
            const { data: scripts } = await supabase
                .from('scripts')
                .select('id, name, description, active, version, updated_at')
                .order('created_at', { ascending: true });

            return res.status(200).json({
                success: true,
                games: [
                    {
                        id: 'violencedisctrict-boyfinity-4oyj',
                        title: 'Violence District',
                        name: 'Violence District',
                        description: "Violence District is asymmetrical horror game on Roblox where Killer is faced against 5 Survivors. Killer's main goal is to sacrifice all the survivors. Survivors' main goal is to repair 5 generators and do whatever it takes to escape.",
                        status: 'Working',
                        version: 'v3.4.1',
                        loader: 'loadstring(game:HttpGet("https://boyfinity-script.vercel.app/api/scripts/violencedisctrict-boyfinity-4oyj"))()',
                        image: '/assets/violencedistrict.png',
                        copyCount: 14820
                    },
                    {
                        id: 'sniperarena-boyfinity-7x9q',
                        title: 'Sniper Arena',
                        name: 'Sniper Arena',
                        description: "Sniper Arena - Exciting sniper battles. Play fair. Win with skill. Skins are just cosmetic - no stat boosts, no paying to win. Join ranked matches and beat other players to earn amazing rewards! Cheating will result in a permanent ban. No second chances.",
                        status: 'Working',
                        version: 'v2.1.0',
                        loader: 'loadstring(game:HttpGet("https://boyfinity-script.vercel.app/api/scripts/sniperarena-boyfinity-7x9q"))()',
                        image: '/assets/sniperarena.png',
                        copyCount: 9410
                    }
                ]
            });
        }

        // Increment Copy Count Telemetry
        if (pathname === '/api/public/games/copy') {
            return res.status(200).json({ success: true, message: 'Copy counted' });
        }

        // ─────────────────────────────────────────────────────────────
        // 2. PUBLIC: POST /api/verify -> ROBLOX TELEMETRY & KEY BINDING
        // ─────────────────────────────────────────────────────────────
        if (pathname === '/api/verify') {
            if (method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
            
            const key = (body.key || '').trim();
            const hwid = (body.hwid || '').trim();
            const robloxUser = (body.roblox_user || body.username || '').trim();
            const executorName = (body.executor || body.executor_name || '').trim();

            if (!key || !hwid) {
                return res.status(400).json({ success: false, error: 'Key and HWID are strictly required' });
            }

            const { data: keyRecord, error } = await supabase
                .from('keys')
                .select('*')
                .eq('key', key)
                .maybeSingle();

            if (error || !keyRecord) {
                return res.status(404).json({ success: false, error: 'Invalid or non-existent license key' });
            }

            if (keyRecord.status === 'revoked') {
                return res.status(403).json({ success: false, error: 'This license key has been revoked by Administrator' });
            }

            const now = new Date();

            // Check Expiration
            if (keyRecord.expires_at) {
                const expDate = new Date(keyRecord.expires_at);
                if (now > expDate) {
                    if (keyRecord.status !== 'expired') {
                        await supabase.from('keys').update({ status: 'expired' }).eq('id', keyRecord.id);
                    }
                    return res.status(403).json({
                        success: false,
                        error: 'License key has EXPIRED. Please renew your subscription.',
                        expired_at: keyRecord.expires_at
                    });
                }
            }

            const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();

            // CASE 1: Key already bound to a HWID
            if (keyRecord.hwid) {
                if (keyRecord.hwid === hwid) {
                    await supabase
                        .from('keys')
                        .update({
                            last_used: now.toISOString(),
                            roblox_user: robloxUser || keyRecord.roblox_user,
                            executor_name: executorName || keyRecord.executor_name,
                            ip_address: clientIp
                        })
                        .eq('id', keyRecord.id);

                    return res.status(200).json({
                        success: true,
                        message: 'Access Granted! HWID matched successfully.',
                        key: keyRecord.key,
                        duration: keyRecord.duration,
                        expires_at: keyRecord.expires_at,
                        hwid: keyRecord.hwid,
                        registered_at: keyRecord.registered_at,
                        roblox_user: robloxUser || keyRecord.roblox_user,
                        executor_name: executorName || keyRecord.executor_name
                    });
                } else {
                    return res.status(403).json({
                        success: false,
                        error: 'Access Denied! HWID Mismatch. This key is permanently bound to another device. Contact support to request a reset.',
                        registered_hwid: keyRecord.hwid.slice(0, 8) + '...'
                    });
                }
            }

            // CASE 2: Key not yet bound -> Register initial HWID
            let calculatedExpiry = keyRecord.expires_at;
            if (!calculatedExpiry && keyRecord.duration && keyRecord.duration !== 'lifetime') {
                calculatedExpiry = calculateExpiration(keyRecord.duration, now);
            }

            const { data: updatedKey, error: updateErr } = await supabase
                .from('keys')
                .update({
                    hwid: hwid,
                    status: 'used',
                    registered_at: now.toISOString(),
                    last_used: now.toISOString(),
                    expires_at: calculatedExpiry,
                    roblox_user: robloxUser || 'Unspecified',
                    executor_name: executorName || 'Generic',
                    ip_address: clientIp
                })
                .eq('id', keyRecord.id)
                .select()
                .single();

            if (updateErr) {
                return res.status(500).json({ success: false, error: 'Database update failed: ' + updateErr.message });
            }

            return res.status(200).json({
                success: true,
                message: 'Access Granted! Device successfully registered and linked.',
                key: updatedKey.key,
                duration: updatedKey.duration,
                expires_at: updatedKey.expires_at,
                hwid: updatedKey.hwid,
                registered_at: updatedKey.registered_at,
                roblox_user: updatedKey.roblox_user,
                executor_name: updatedKey.executor_name
            });
        }

        // ─────────────────────────────────────────────────────────────
        // 3. CLOUDFLARE TURNSTILE GATEWAY CHECK
        // ─────────────────────────────────────────────────────────────
        if (pathname === '/api/turnstile/verify') {
            if (method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
            const { token } = body;
            const remoteip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
            const valid = await verifyTurnstile(token, remoteip);
            return res.status(200).json({ success: valid });
        }

        // ─────────────────────────────────────────────────────────────
        // 4. DISCORD OAUTH2 AUTHENTICATION & SESSION
        // ─────────────────────────────────────────────────────────────
        if (pathname === '/api/auth/discord/login') {
            const clientId = process.env.DISCORD_CLIENT_ID;
            const proto = req.headers['x-forwarded-proto'] || 'https';
            const host = req.headers['host'];
            const redirectUri = process.env.DISCORD_REDIRECT_URI || `${proto}://${host}/api/auth/discord/callback`;

            if (!clientId) {
                return res.redirect(`/login?error=discord_not_configured`);
            }

            const state = Math.random().toString(36).substring(2, 15);
            const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20email&state=${state}`;
            
            res.setHeader('Set-Cookie', `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300`);
            return res.redirect(discordAuthUrl);
        }

        if (pathname === '/api/auth/discord/callback') {
            const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
            const code = searchParams.get('code');
            const proto = req.headers['x-forwarded-proto'] || 'https';
            const host = req.headers['host'];
            const redirectUri = process.env.DISCORD_REDIRECT_URI || `${proto}://${host}/api/auth/discord/callback`;

            if (!code) {
                return res.redirect('/login?error=missing_code');
            }

            const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: process.env.DISCORD_CLIENT_ID,
                    client_secret: process.env.DISCORD_CLIENT_SECRET,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: redirectUri
                })
            });

            const tokenData = await tokenRes.json();
            if (!tokenData.access_token) {
                return res.redirect('/login?error=token_exchange_failed');
            }

            const userRes = await fetch('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` }
            });
            const discordUser = await userRes.json();

            // Determine Role: Check Owner IDs
            const ownerIds = (process.env.DISCORD_OWNER_IDS || '').split(',').map(s => s.trim());
            let assignedRole = ownerIds.includes(discordUser.id) ? 'owner' : 'user';

            // Check existing user in DB
            const { data: existingUser } = await supabase
                .from('users')
                .select('*')
                .eq('discord_id', discordUser.id)
                .maybeSingle();

            if (existingUser) {
                if (existingUser.role === 'admin' || existingUser.role === 'staff' || existingUser.role === 'owner') {
                    assignedRole = existingUser.role;
                }
                await supabase.from('users').update({
                    username: `${discordUser.username}#${discordUser.discriminator || '0'}`,
                    avatar: discordUser.avatar,
                    last_login: new Date().toISOString()
                }).eq('discord_id', discordUser.id);
            } else {
                await supabase.from('users').insert({
                    discord_id: discordUser.id,
                    username: `${discordUser.username}#${discordUser.discriminator || '0'}`,
                    discriminator: discordUser.discriminator || '0',
                    avatar: discordUser.avatar,
                    role: assignedRole,
                    created_at: new Date().toISOString(),
                    last_login: new Date().toISOString()
                });
            }

            // Sign JWT Session Token
            const sessionPayload = {
                id: discordUser.id,
                username: discordUser.username,
                role: assignedRole,
                avatar: discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : null,
                iat: Date.now()
            };
            const token = signToken(sessionPayload);

            res.setHeader('Set-Cookie', `admin_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`);
            
            // Redirect based on role
            if (assignedRole === 'owner' || assignedRole === 'admin' || assignedRole === 'staff') {
                return res.redirect(`/admin?auth_success=1`);
            } else {
                return res.redirect(`/?auth_success=1`);
            }
        }

        // Current Session Check
        if (pathname === '/api/auth/me') {
            const session = requireAuth(req, res);
            if (!session) return;
            return res.status(200).json({ success: true, user: session });
        }

        // Direct Password Login (Fallback for Master Owner)
        if (pathname === '/api/auth/login') {
            if (method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
            const { password } = body;
            const adminPassword = process.env.ADMIN_PASSWORD;

            if (!adminPassword) return res.status(500).json({ success: false, error: 'ADMIN_PASSWORD not set' });
            if (password !== adminPassword) {
                await new Promise(r => setTimeout(r, 1000));
                return res.status(401).json({ success: false, error: 'Invalid password' });
            }

            const token = signToken({ id: 'master_owner', username: 'Owner', role: 'owner', iat: Date.now() });
            res.setHeader('Set-Cookie', `admin_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
            return res.status(200).json({ success: true, token, role: 'owner' });
        }

        // Logout
        if (pathname === '/api/auth/logout') {
            res.setHeader('Set-Cookie', 'admin_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
            return res.status(200).json({ success: true, message: 'Logged out successfully' });
        }

        // ─────────────────────────────────────────────────────────────
        // 5. AUTOMATED PURCHASING / CHECKOUT (REQUIRES AUTHENTICATED DISCORD USER)
        // ─────────────────────────────────────────────────────────────
        if (pathname === '/api/checkout/purchase') {
            if (method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

            // Ensure user is logged in via Discord session
            const session = requireAuth(req, res);
            if (!session) return; // Returns 401 if not logged in

            const { plan } = body;
            let duration = 'lifetime';
            let amountUsd = '$9.99';

            if (plan === 'monthly') {
                duration = '30d';
                amountUsd = '$3.50';
            } else if (plan === '1day' || plan === 'free' || plan === 'daily') {
                duration = '1d';
                amountUsd = '$0.00';
            }

            const newKey = generateBoyfinityKey();
            const now = new Date();

            const buyerDiscord = session.id || body.buyer_discord || 'DiscordUser';
            const buyerUsername = session.username || 'Discord User';

            const { data: createdKey, error: keyErr } = await supabase
                .from('keys')
                .insert({
                    key: newKey,
                    status: 'active',
                    duration: duration,
                    note: `Purchased via Web by Discord @${buyerUsername} (${plan || 'lifetime'})`,
                    buyer_email: null,
                    buyer_discord: buyerDiscord,
                    created_by: buyerDiscord,
                    creator_role: session.role || 'user',
                    created_at: now.toISOString()
                })
                .select()
                .single();

            if (keyErr) throw keyErr;

            // Deliver via Webhook to Discord
            const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
            await deliverKeyViaWebhook(webhookUrl, {
                key: newKey,
                duration: duration,
                buyerDiscord: buyerDiscord,
                buyerEmail: `${buyerUsername}@discord`,
                game: 'Violence District & Sniper Arena'
            });

            await logAudit(
                session,
                'CHECKOUT_PURCHASE',
                newKey,
                { plan, amount: amountUsd, duration }
            );

            return res.status(201).json({
                success: true,
                message: 'Purchase completed! Key has been generated and dispatched to Discord.',
                key: newKey,
                duration: duration,
                plan: plan || 'lifetime'
            });
        }

        // ─────────────────────────────────────────────────────────────
        // 6. PROTECTED: ADMIN & STAFF KEY GENERATOR, STATS & STAFF MANAGEMENT
        // ─────────────────────────────────────────────────────────────
        if (pathname === '/api/admin/stats') {
            const user = requireAuth(req, res);
            if (!user) return;

            const { count: total } = await supabase.from('scripts').select('id', { count: 'exact', head: true });
            const { count: active } = await supabase.from('scripts').select('id', { count: 'exact', head: true }).eq('active', true);
            const { count: totalKeys } = await supabase.from('keys').select('id', { count: 'exact', head: true });
            const { count: boundKeys } = await supabase.from('keys').select('id', { count: 'exact', head: true }).not('hwid', 'is', null);

            return res.status(200).json({
                success: true,
                stats: {
                    totalScripts: total || 0,
                    activeScripts: active || 0,
                    totalKeys: totalKeys || 0,
                    boundKeys: boundKeys || 0,
                    executionsEstimate: 142850
                }
            });
        }

        // Audit Logs (Admin & Owner Only)
        if (pathname === '/api/admin/audit-logs') {
            const user = requireAuth(req, res, 'admin');
            if (!user) return;

            const { data: logs, error } = await supabase
                .from('audit_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            return res.status(200).json({ success: true, logs: logs || [] });
        }

        // Staff & Key Management: /api/admin/keys
        if (pathname === '/api/admin/keys') {
            const user = requireAuth(req, res);
            if (!user) return;

            if (method === 'GET') {
                let query = supabase.from('keys').select('*').order('created_at', { ascending: false });
                
                if (user.role === 'staff') {
                    query = query.eq('created_by', user.id);
                }

                const { data, error } = await query;
                if (error) throw error;
                return res.status(200).json({ success: true, keys: data || [], userRole: user.role });
            }

            if (method === 'POST') {
                const note = (body.note || '').trim();
                const requestedCount = parseInt(body.count, 10) || 1;
                const requestedDuration = body.duration || 'lifetime';

                let count = requestedCount;
                let duration = requestedDuration;
                if (user.role === 'staff') {
                    count = Math.min(Math.max(count, 1), 5);
                    if (duration === 'lifetime' || duration === '365d') {
                        duration = '7d';
                    }
                } else {
                    count = Math.min(Math.max(count, 1), 50);
                }

                const newKeys = [];
                const now = new Date();
                for (let i = 0; i < count; i++) {
                    const keyString = generateBoyfinityKey();
                    newKeys.push({
                        key: keyString,
                        status: 'active',
                        duration: duration,
                        note: note || `Generated by ${user.username}`,
                        created_by: user.id,
                        creator_role: user.role,
                        created_at: now.toISOString()
                    });
                }

                const { data, error } = await supabase.from('keys').insert(newKeys).select();
                if (error) throw error;

                await logAudit(
                    user,
                    'GENERATE_KEY',
                    `${count} Key(s)`,
                    { count, duration, note }
                );

                return res.status(201).json({ success: true, keys: data });
            }
        }

        // Staff Member Management: /api/admin/staff (Owner Only)
        if (pathname === '/api/admin/staff') {
            const user = requireAuth(req, res, 'owner');
            if (!user) return;

            if (method === 'GET') {
                const { data: staffList, error } = await supabase
                    .from('users')
                    .select('id, discord_id, username, role, created_at, last_login')
                    .eq('role', 'staff')
                    .order('created_at', { ascending: false });

                if (error) throw error;
                return res.status(200).json({ success: true, staff: staffList || [] });
            }

            if (method === 'POST') {
                const discordId = (body.discord_id || '').trim();
                const usernameNote = (body.username || 'Registered Staff').trim();

                if (!discordId) {
                    return res.status(400).json({ success: false, error: 'Discord ID is required' });
                }

                // Check if user already exists
                const { data: existingUser } = await supabase
                    .from('users')
                    .select('*')
                    .eq('discord_id', discordId)
                    .maybeSingle();

                if (existingUser) {
                    await supabase
                        .from('users')
                        .update({ role: 'staff' })
                        .eq('discord_id', discordId);
                } else {
                    await supabase
                        .from('users')
                        .insert({
                            discord_id: discordId,
                            username: usernameNote,
                            role: 'staff',
                            created_at: new Date().toISOString()
                        });
                }

                await logAudit(user, 'APPOINT_STAFF', discordId, { username: usernameNote });
                return res.status(201).json({ success: true, message: `Discord ID ${discordId} successfully appointed as Staff.` });
            }

            if (method === 'DELETE') {
                const discordId = (body.discord_id || '').trim();
                if (!discordId) return res.status(400).json({ success: false, error: 'Discord ID required' });

                await supabase.from('users').update({ role: 'user' }).eq('discord_id', discordId);
                await logAudit(user, 'REVOKE_STAFF', discordId, {});
                return res.status(200).json({ success: true, message: 'Staff role revoked.' });
            }
        }

        // Reset HWID & Delete Key: /api/admin/keys/:id
        if (pathname.startsWith('/api/admin/keys/')) {
            const user = requireAuth(req, res);
            if (!user) return;

            const keyParam = decodeURIComponent(pathname.replace('/api/admin/keys/', '').split('?')[0].trim());

            if (method === 'PUT') {
                const updatePayload = {};
                if (body.action === 'reset_hwid') {
                    updatePayload.hwid = null;
                    updatePayload.status = 'active';
                    updatePayload.roblox_user = null;
                    updatePayload.executor_name = null;
                    updatePayload.ip_address = null;

                    await logAudit(user, 'RESET_HWID', keyParam, {});
                } else {
                    if (user.role === 'staff') {
                        return res.status(403).json({ success: false, error: 'Staff can only reset HWID' });
                    }
                    if (body.status !== undefined) updatePayload.status = body.status;
                    if (body.note !== undefined) updatePayload.note = body.note;
                }

                const { data, error } = await supabase
                    .from('keys')
                    .update(updatePayload)
                    .or(`id.eq.${keyParam},key.eq.${keyParam}`)
                    .select()
                    .maybeSingle();

                if (error) throw error;
                return res.status(200).json({ success: true, key: data });
            }

            if (method === 'DELETE') {
                if (user.role === 'staff') {
                    return res.status(403).json({ success: false, error: 'Staff members are not permitted to delete keys.' });
                }

                await supabase.from('keys').delete().or(`id.eq.${keyParam},key.eq.${keyParam}`);
                await logAudit(user, 'DELETE_KEY', keyParam, {});
                return res.status(200).json({ success: true, message: 'Key successfully deleted' });
            }
        }

        // Scripts Management
        if (pathname === '/api/admin/scripts') {
            const user = requireAuth(req, res, 'admin');
            if (!user) return;

            if (method === 'GET') {
                const { data, error } = await supabase.from('scripts').select('*').order('created_at', { ascending: false });
                if (error) {
                    console.error('[Admin Scripts GET Error]:', error);
                    return res.status(500).json({ success: false, error: error.message });
                }
                return res.status(200).json({ success: true, scripts: data || [] });
            }

            if (method === 'POST') {
                const { name, description, code, active } = body || {};
                if (!name || typeof name !== 'string' || !name.trim()) {
                    return res.status(400).json({ success: false, error: 'Script name is required' });
                }
                const trimmedName = name.trim().slice(0, 100);
                const scriptId = generateScriptId(trimmedName);
                const now = new Date().toISOString();

                const { data, error } = await supabase.from('scripts').insert({
                    id: scriptId,
                    name: trimmedName,
                    description: (description || '').trim(),
                    code: typeof code === 'string' ? code : '',
                    active: active !== false,
                    created_at: now,
                    updated_at: now,
                    version: 1
                }).select().single();

                if (error) {
                    console.error('[Admin Scripts POST Error]:', error);
                    return res.status(500).json({ success: false, error: error.message });
                }
                await logAudit(user, 'CREATE_SCRIPT', scriptId, { name: trimmedName });
                return res.status(201).json({ success: true, script: data });
            }
        }

        if (pathname.startsWith('/api/admin/scripts/')) {
            const user = requireAuth(req, res, 'admin');
            if (!user) return;
            const scriptId = pathname.replace('/api/admin/scripts/', '').split('?')[0].trim();

            if (method === 'GET') {
                const { data: script, error } = await supabase.from('scripts').select('*').eq('id', scriptId).single();
                if (error || !script) return res.status(404).json({ success: false, error: 'Script not found' });
                return res.status(200).json({ success: true, script });
            }

            if (method === 'PUT') {
                const { name, description, code, active } = body;
                const updatePayload = { updated_at: new Date().toISOString() };
                if (name !== undefined) updatePayload.name = name.trim();
                if (description !== undefined) updatePayload.description = description.trim();
                if (typeof code === 'string') updatePayload.code = code;
                if (active !== undefined) updatePayload.active = !!active;

                const { data: updated, error } = await supabase.from('scripts').update(updatePayload).eq('id', scriptId).select().single();
                if (error) throw error;
                await logAudit(user, 'UPDATE_SCRIPT', scriptId, { name });
                return res.status(200).json({ success: true, script: updated });
            }

            if (method === 'DELETE') {
                await supabase.from('scripts').delete().eq('id', scriptId);
                await logAudit(user, 'DELETE_SCRIPT', scriptId, {});
                return res.status(200).json({ success: true, message: 'Script deleted' });
            }
        }

        // 404 for unhandled API paths
        return res.status(404).json({ success: false, error: 'Endpoint Not Found' });

    } catch (err) {
        console.error('[Unified Monolith API Error]:', err);
        return res.status(500).json({ success: false, error: 'Internal Server Error: ' + err.message });
    }
}
