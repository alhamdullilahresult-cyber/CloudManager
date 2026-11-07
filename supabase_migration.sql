-- ============================================================
-- BOYFINITY Script Hub Platform - Multi-Role & Audit Log Schema
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. SCRIPTS TABLE
CREATE TABLE IF NOT EXISTS public.scripts (
    id          TEXT        PRIMARY KEY,
    name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    description TEXT        NOT NULL DEFAULT '',
    code        TEXT        NOT NULL DEFAULT '',
    active      BOOLEAN     NOT NULL DEFAULT true,
    version     INTEGER     NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. SCRIPT HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.script_history (
    id          BIGSERIAL   PRIMARY KEY,
    script_id   TEXT        NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
    code        TEXT        NOT NULL DEFAULT '',
    version     INTEGER     NOT NULL DEFAULT 1,
    note        TEXT        NOT NULL DEFAULT '',
    saved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. USERS / ROLES TABLE (DISCORD OAUTH2 AUTHENTICATION)
CREATE TABLE IF NOT EXISTS public.users (
    id              BIGSERIAL   PRIMARY KEY,
    discord_id      TEXT        NOT NULL UNIQUE,
    username        TEXT        NOT NULL,
    discriminator   TEXT        DEFAULT '0',
    avatar          TEXT        DEFAULT NULL,
    role            TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'staff', 'user')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. KEYS & HWID TABLE (DURATION & TELEMETRY INCLUDED)
CREATE TABLE IF NOT EXISTS public.keys (
    id            BIGSERIAL   PRIMARY KEY,
    key           TEXT        NOT NULL UNIQUE,
    status        TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'revoked', 'expired')),
    duration      TEXT        NOT NULL DEFAULT 'lifetime', -- '1d', '3d', '7d', '30d', '365d', 'lifetime'
    expires_at    TIMESTAMPTZ DEFAULT NULL,
    hwid          TEXT        DEFAULT NULL,
    note          TEXT        DEFAULT '',
    created_by    TEXT        DEFAULT 'system', -- discord_id or username
    creator_role  TEXT        DEFAULT 'admin',  -- owner, admin, staff
    buyer_email   TEXT        DEFAULT NULL,
    buyer_discord TEXT        DEFAULT NULL,
    roblox_user   TEXT        DEFAULT NULL,
    executor_name TEXT        DEFAULT NULL,
    ip_address    TEXT        DEFAULT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    registered_at TIMESTAMPTZ DEFAULT NULL,
    last_used     TIMESTAMPTZ DEFAULT NULL
);

-- 5. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id          BIGSERIAL   PRIMARY KEY,
    actor_id    TEXT        NOT NULL, -- discord_id or username
    actor_name  TEXT        NOT NULL,
    actor_role  TEXT        NOT NULL,
    action      TEXT        NOT NULL, -- e.g. 'GENERATE_KEY', 'RESET_HWID', 'DELETE_KEY', 'CHECKOUT_PURCHASE'
    target      TEXT        DEFAULT '',
    details     JSONB       DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add Columns safely if tables already exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='keys' AND column_name='created_by') THEN
        ALTER TABLE public.keys ADD COLUMN created_by TEXT DEFAULT 'system';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='keys' AND column_name='creator_role') THEN
        ALTER TABLE public.keys ADD COLUMN creator_role TEXT DEFAULT 'admin';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='keys' AND column_name='buyer_discord') THEN
        ALTER TABLE public.keys ADD COLUMN buyer_discord TEXT DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='keys' AND column_name='buyer_email') THEN
        ALTER TABLE public.keys ADD COLUMN buyer_email TEXT DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scripts' AND column_name='image_url') THEN
        ALTER TABLE public.scripts ADD COLUMN image_url TEXT DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scripts' AND column_name='status') THEN
        ALTER TABLE public.scripts ADD COLUMN status TEXT DEFAULT 'working';
    END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_keys_key        ON public.keys(key);
CREATE INDEX IF NOT EXISTS idx_keys_hwid       ON public.keys(hwid);
CREATE INDEX IF NOT EXISTS idx_keys_status     ON public.keys(status);
CREATE INDEX IF NOT EXISTS idx_users_discord   ON public.users(discord_id);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON public.audit_logs(created_at DESC);

-- RLS
ALTER TABLE public.scripts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keys           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs     ENABLE ROW LEVEL SECURITY;
