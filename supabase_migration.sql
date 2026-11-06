-- ============================================================
-- Boyfinity Script Hub Platform - Schema & Telemetry Migration
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Tabel Scripts (Manajemen Script Cloud)
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

-- 2. Tabel Script History (Versi Script)
CREATE TABLE IF NOT EXISTS public.script_history (
    id          BIGSERIAL   PRIMARY KEY,
    script_id   TEXT        NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
    code        TEXT        NOT NULL DEFAULT '',
    version     INTEGER     NOT NULL DEFAULT 1,
    note        TEXT        NOT NULL DEFAULT '',
    saved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tabel Keys & HWID + Durasi & Telemetri
CREATE TABLE IF NOT EXISTS public.keys (
    id            BIGSERIAL   PRIMARY KEY,
    key           TEXT        NOT NULL UNIQUE,
    status        TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'revoked', 'expired')),
    duration      TEXT        NOT NULL DEFAULT 'lifetime', -- '1d', '3d', '7d', '30d', '365d', 'lifetime'
    expires_at    TIMESTAMPTZ DEFAULT NULL,
    hwid          TEXT        DEFAULT NULL,
    note          TEXT        DEFAULT '',
    roblox_user   TEXT        DEFAULT NULL,
    executor_name TEXT        DEFAULT NULL,
    ip_address    TEXT        DEFAULT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    registered_at TIMESTAMPTZ DEFAULT NULL,
    last_used     TIMESTAMPTZ DEFAULT NULL
);

-- Tambahkan kolom jika tabel 'keys' sudah pernah dibuat sebelumnya
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='keys' AND column_name='duration') THEN
        ALTER TABLE public.keys ADD COLUMN duration TEXT NOT NULL DEFAULT 'lifetime';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='keys' AND column_name='expires_at') THEN
        ALTER TABLE public.keys ADD COLUMN expires_at TIMESTAMPTZ DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='keys' AND column_name='roblox_user') THEN
        ALTER TABLE public.keys ADD COLUMN roblox_user TEXT DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='keys' AND column_name='executor_name') THEN
        ALTER TABLE public.keys ADD COLUMN executor_name TEXT DEFAULT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='keys' AND column_name='ip_address') THEN
        ALTER TABLE public.keys ADD COLUMN ip_address TEXT DEFAULT NULL;
    END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_keys_key        ON public.keys(key);
CREATE INDEX IF NOT EXISTS idx_keys_hwid       ON public.keys(hwid);
CREATE INDEX IF NOT EXISTS idx_keys_status     ON public.keys(status);
CREATE INDEX IF NOT EXISTS idx_keys_expires_at ON public.keys(expires_at);

-- RLS
ALTER TABLE public.scripts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keys           ENABLE ROW LEVEL SECURITY;
