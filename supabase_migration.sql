-- ============================================================
-- Boyfinity Script Manager - Supabase Schema Migration
-- Run this SQL in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable UUID extension (Supabase has this by default)
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. SCRIPTS TABLE ──────────────────────────────────────
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

-- ── 2. SCRIPT HISTORY TABLE ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.script_history (
    id          BIGSERIAL   PRIMARY KEY,
    script_id   TEXT        NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
    code        TEXT        NOT NULL DEFAULT '',
    version     INTEGER     NOT NULL DEFAULT 1,
    note        TEXT        NOT NULL DEFAULT '',
    saved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. KEYS & HWID TABLE (KEY SYSTEM) ────────────────────
CREATE TABLE IF NOT EXISTS public.keys (
    id            BIGSERIAL   PRIMARY KEY,
    key           TEXT        NOT NULL UNIQUE,
    status        TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'revoked', 'expired')),
    hwid          TEXT        DEFAULT NULL,
    note          TEXT        DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    registered_at TIMESTAMPTZ DEFAULT NULL,
    last_used     TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_keys_key    ON public.keys(key);
CREATE INDEX IF NOT EXISTS idx_keys_hwid   ON public.keys(hwid);
CREATE INDEX IF NOT EXISTS idx_keys_status ON public.keys(status);

ALTER TABLE public.keys ENABLE ROW LEVEL SECURITY;

-- ── 3. INDEXES ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_scripts_active     ON public.scripts(active);
CREATE INDEX IF NOT EXISTS idx_scripts_updated_at ON public.scripts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_script_id  ON public.script_history(script_id);
CREATE INDEX IF NOT EXISTS idx_history_version    ON public.script_history(script_id, version DESC);

-- ── 4. ROW LEVEL SECURITY ────────────────────────────────
-- Enable RLS (backend uses Service Role Key which bypasses RLS)
ALTER TABLE public.scripts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_history ENABLE ROW LEVEL SECURITY;

-- No public policies = only Service Role Key can access
-- (This is intentional; frontend never touches DB directly)

-- ── 5. SAMPLE DATA (optional, delete after testing) ──────
-- INSERT INTO public.scripts (id, name, description, code, active, version)
-- VALUES (
--     'boyfinity-vd-main',
--     'Boyfinity VD Main Script',
--     'Main script for Boyfinity Violence District',
--     '-- Boyfinity VD Main Script\nprint("[Boyfinity] Loaded!")',
--     true,
--     1
-- );

-- ── 6. VERIFY ────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('scripts', 'script_history');

