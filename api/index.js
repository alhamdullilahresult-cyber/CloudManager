// api/index.js - Unified Monolithic Serverless Engine for BOYFINITY Enterprise Script Hub
// Single Serverless Function consolidating all endpoints (Public, Discord OAuth, Turnstile, Checkout Webhook, Admin, Staff & Audit Logs)
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
            color: 0x9333ea, // Purple
            fields: [
                { name: 'License Key', value: `\`\`\`${key}\`\`\``, inline: false },
                { name: 'Duration', value: `${(duration || 'LIFETIME').toUpperCase()}`, inline: true },
                { name: 'Game', value: `${game || 'Violence District'}`, inline: true },
                { name: 'Recipient', value: buyerDiscord ? `<@${buyerDiscord}>` : (buyerEmail || 'Anonymous Guest'), inline: true },
                { name: 'Status', value: '🟢 Ready to Bind (HWID Unlinked)', inline: false }
            ],
            footer: { text: 'BOYFINITY Enterprise Security • 100% Undetected' },
            timestamp: new Date().toISOString()
        };

        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: buyerDiscord ? `🔔 <@${buyerDiscord}> Your BOYFINITY access key is ready!` : undefined,
                embeds: [embed]
            })
        });
    } catch (e) {
        console.error('[Discord Webhook Delivery Error]:', e);
    }
}

// Verify Cloudflare Turnstile Token
async function verifyTurnstile(token, remoteip) {
    const secret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
    if (!secret) return true; // If not configured, pass-through gracefully
    try {
        const formData = new URLSearchParams();
        formData.append('secret', secret);
        formData.append('response', token);
        if (remoteip) formData.append('remoteip', remoteip);

        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body: formData
        });
        const outcome = await res.json();
        return outcome.success;
    } catch (e) {
        console.error('[Turnstile] Error:', e);
        return false;
    }
}

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const host = req.headers.host || 'localhost';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const parsedUrl = new URL(req.url, `${proto}://${host}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';

    let body = {};
    if (req.body) {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }

    try {
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
                const expireDate = new Date(keyRecord.expires_at);
                if (now > expireDate) {
                    if (keyRecord.status !== 'expired') {
                        await supabase.from('keys').update({ status: 'expired' }).eq('key', key);
                    }
                    return res.status(403).json({ 
                        success: false, 
                        error: `License key has expired on ${expireDate.toLocaleDateString()}. Please renew your key.` 
                    });
                }
            }

            // Case 1: First-time binding
            if (!keyRecord.hwid) {
                const nowIso = now.toISOString();
                let calculatedExpiry = keyRecord.expires_at;
                if (!calculatedExpiry && keyRecord.duration && keyRecord.duration !== 'lifetime') {
                    calculatedExpiry = calculateExpiration(keyRecord.duration, now);
                }

                const updatePayload = {
                    hwid: hwid,
                    status: 'used',
                    roblox_user: robloxUser || 'UnknownPlayer',
                    executor_name: executorName || 'GenericExecutor',
                    ip_address: ip,
                    registered_at: keyRecord.registered_at || nowIso,
                    last_used: nowIso
                };

                if (calculatedExpiry) updatePayload.expires_at = calculatedExpiry;

                await supabase.from('keys').update(updatePayload).eq('key', key);

                return res.status(200).json({
                    success: true,
                    message: 'Verification successful! Device & telemetry bound.',
                    bound: true,
                    duration: keyRecord.duration || 'lifetime',
                    expires_at: calculatedExpiry
                });
            }

            // Case 2: Returning User (Matching HWID)
            if (keyRecord.hwid === hwid) {
                const nowIso = now.toISOString();
                const updatePayload = { last_used: nowIso, ip_address: ip };
                if (robloxUser) updatePayload.roblox_user = robloxUser;
                if (executorName) updatePayload.executor_name = executorName;

                await supabase.from('keys').update(updatePayload).eq('key', key);

                return res.status(200).json({
                    success: true,
                    message: `Welcome back, ${robloxUser || 'Operator'}!`,
                    bound: true,
                    expires_at: keyRecord.expires_at
                });
            } else {
                // Case 3: HWID Mismatch
                return res.status(403).json({
                    success: false,
                    error: 'HWID Mismatch! This key is permanently bound to another device. Request a HWID reset via support.'
                });
            }
        }

        // ─────────────────────────────────────────────────────────────
        // 3. PUBLIC: CLOUDFLARE TURNSTILE GATEWAY VERIFICATION
        // ─────────────────────────────────────────────────────────────
        if (pathname === '/api/turnstile/verify') {
            if (method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
            const token = body.token;
            if (!token) return res.status(400).json({ success: false, error: 'Turnstile verification token required' });

            const valid = await verifyTurnstile(token, ip);
            if (valid) {
                return res.status(200).json({ success: true, verified: true });
            } else {
                return res.status(403).json({ success: false, error: 'Human verification failed. Please try again.' });
            }
        }

        // ─────────────────────────────────────────────────────────────
        // 4. DISCORD OAUTH2 AUTHENTICATION & SESSION
        // ─────────────────────────────────────────────────────────────
        if (pathname === '/api/auth/discord/login') {
            const clientId = process.env.DISCORD_CLIENT_ID;
            const redirectUri = process.env.DISCORD_REDIRECT_URI || `${proto}://${host}/api/auth/discord/callback`;

            if (!clientId) {
                // Graceful fallback if Discord credentials not yet set
                return res.redirect(`/login?error=discord_not_configured`);
            }

            const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20email`;
            return res.redirect(discordAuthUrl);
        }

        if (pathname === '/api/auth/discord/callback') {
            const code = parsedUrl.searchParams.get('code');
            if (!code) return res.redirect('/login?error=missing_code');

            const clientId = process.env.DISCORD_CLIENT_ID;
            const clientSecret = process.env.DISCORD_CLIENT_SECRET;
            const redirectUri = process.env.DISCORD_REDIRECT_URI || `${proto}://${host}/api/auth/discord/callback`;

            // Exchange code for Access Token
            const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: redirectUri
                })
            });

            const tokens = await tokenResponse.json();
            if (!tokens.access_token) {
                console.error('[Discord OAuth] Token Error:', tokens);
                return res.redirect('/login?error=token_exchange_failed');
            }

            // Fetch Discord User Info
            const userRes = await fetch('https://discord.com/api/users/@me', {
                headers: { Authorization: `Bearer ${tokens.access_token}` }
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
                // Preserve admin/staff role unless elevated to owner
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

            // Set Cookie and Redirect to Admin/Dashboard
            res.setHeader('Set-Cookie', `admin_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`);
            return res.redirect(`/admin?auth_success=1`);
        }

        // Current Session Check
        if (pathname === '/api/auth/me') {
            const session = requireAuth(req, res);
            if (!session) return;
            return res.status(200).json({ success: true, user: session });
        }

        // Direct Password Login (Fallback for Master Owner if needed)
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
        // 5. AUTOMATED PURCHASING / CHECKOUT WEBHOOK MOCK
        // ─────────────────────────────────────────────────────────────
        if (pathname === '/api/checkout/purchase') {
            if (method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

            const { plan, buyer_email, buyer_discord } = body;
            let duration = 'lifetime';
            let amountUsd = '$85.00';

            if (plan === 'monthly') {
                duration = '30d';
                amountUsd = '$35.00';
            } else if (plan === '1day' || plan === 'daily') {
                duration = '1d';
                amountUsd = '$5.00';
            }

            const newKey = generateBoyfinityKey();
            const now = new Date();

            const { data: createdKey, error: keyErr } = await supabase
                .from('keys')
                .insert({
                    key: newKey,
                    status: 'active',
                    duration: duration,
                    note: `Purchased via Web Checkout (${plan || 'lifetime'})`,
                    buyer_email: buyer_email || null,
                    buyer_discord: buyer_discord || null,
                    created_by: 'automated_checkout',
                    creator_role: 'system',
                    created_at: now.toISOString()
                })
                .select()
                .single();

            if (keyErr) throw keyErr;

            // Deliver via Discord Webhook
            const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
            await deliverKeyViaWebhook(webhookUrl, {
                key: newKey,
                duration: duration,
                buyerDiscord: buyer_discord,
                buyerEmail: buyer_email,
                game: 'Violence District & Sniper Arena'
            });

            // Log to Audit Trail
            await logAudit(
                { id: buyer_discord || 'checkout_user', username: buyer_email || 'Web Purchaser', role: 'user' },
                'CHECKOUT_PURCHASE',
                newKey,
                { plan, amount: amountUsd, duration }
            );

            return res.status(201).json({
                success: true,
                message: 'Purchase completed! Key has been generated and dispatched.',
                key: newKey,
                duration: duration,
                plan: plan || 'lifetime'
            });
        }

        // ─────────────────────────────────────────────────────────────
        // 6. PROTECTED: ADMIN & STAFF KEY GENERATOR & STATS
        // ─────────────────────────────────────────────────────────────
        if (pathname === '/api/admin/stats') {
            const user = requireAuth(req, res); // Staff, Admin, or Owner
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
            const user = requireAuth(req, res, 'admin'); // Staff cannot view audit logs
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
            const user = requireAuth(req, res); // Staff, Admin, Owner
            if (!user) return;

            if (method === 'GET') {
                let query = supabase.from('keys').select('*').order('created_at', { ascending: false });
                
                // If role is staff, only show keys created by this staff member
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

                // STAFF RESTRICTION: Staff cannot generate Lifetime or > 5 keys at a time
                let count = requestedCount;
                let duration = requestedDuration;
                if (user.role === 'staff') {
                    count = Math.min(Math.max(count, 1), 5);
                    if (duration === 'lifetime' || duration === '365d') {
                        duration = '7d'; // Staff capped at max 7 days
                    }
                } else {
                    count = Math.min(Math.max(count, 1), 50);
                }

                const newKeys = [];
                const now = new Date();
                const nowIso = now.toISOString();

                for (let i = 0; i < count; i++) {
                    const keyStr = generateBoyfinityKey();
                    newKeys.push({
                        key: keyStr,
                        status: 'active',
                        duration: duration,
                        expires_at: null,
                        hwid: null,
                        note: note || `Gen by ${user.username} (${user.role})`,
                        created_by: user.id || user.username,
                        creator_role: user.role,
                        created_at: nowIso
                    });
                }

                const { data, error } = await supabase.from('keys').insert(newKeys).select();
                if (error) throw error;

                // Log to Audit Log
                await logAudit(
                    user,
                    'GENERATE_KEY',
                    `${count} keys (${duration})`,
                    { count, duration, note }
                );

                return res.status(201).json({ success: true, keys: data });
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
                    // Only Admin/Owner can alter duration or custom status
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
                // STAFF CANNOT DELETE KEYS
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
            const user = requireAuth(req, res, 'admin'); // Admin/Owner only
            if (!user) return;

            if (method === 'GET') {
                const { data, error } = await supabase.from('scripts').select('*').order('created_at', { ascending: false });
                if (error) throw error;
                return res.status(200).json({ success: true, scripts: data });
            }

            if (method === 'POST') {
                const { name, description, code, active } = body;
                if (!name) return res.status(400).json({ success: false, error: 'Script name required' });
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
                await logAudit(user, 'CREATE_SCRIPT', scriptId, { name });
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
