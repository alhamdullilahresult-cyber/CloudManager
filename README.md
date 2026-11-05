# Boyfinity Script Manager Platform v2.0

Cloud-based Lua Script Management Platform dengan Admin Dashboard, Supabase backend, dan Public API untuk Roblox Executor.

## Fitur

- **Admin Dashboard** — dark mode premium, login aman, statistik real-time
- **Script CRUD** — tambah, edit, hapus, aktif/nonaktifkan script
- **Lua Code Editor** — CodeMirror dengan syntax highlighting Lua (tema Dracula)
- **Version History** — setiap perubahan kode tersimpan di histori
- **Public API** — endpoint per-script mengembalikan plain text Lua
- **Rate Limiting** — 60 req/menit per IP untuk endpoint publik
- **Supabase Database** — script tersimpan permanen, bukan di filesystem Vercel

## Struktur File

```
CloudScriptManager/
├── index.html              ← Landing page
├── admin.html              ← Admin dashboard (protected)
├── login.html              ← Admin login
├── vercel.json             ← Routing config
├── package.json
├── supabase_migration.sql  ← Database schema (run di Supabase SQL Editor)
├── .env.example            ← Contoh environment variables
└── api/
    ├── lib/
    │   ├── supabase.js     ← Supabase client (server-side only)
    │   ├── auth.js         ← JWT auth helpers
    │   └── utils.js        ← Shared utilities
    ├── auth/
    │   ├── login.js        ← POST /api/auth/login
    │   └── verify.js       ← GET /api/auth/verify
    ├── admin/
    │   ├── stats.js        ← GET /api/admin/stats
    │   └── scripts/
    │       ├── index.js    ← GET/POST /api/admin/scripts
    │       └── [id].js     ← GET/PUT/DELETE /api/admin/scripts/:id
    └── scripts/
        └── [id].js         ← GET /api/scripts/:id (PUBLIC)
```

## Setup

### 1. Supabase

1. Buat project baru di [supabase.com](https://supabase.com)
2. Buka **SQL Editor** dan jalankan isi `supabase_migration.sql`
3. Ambil kredensial dari **Project Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Environment Variables di Vercel

Buka **Vercel Dashboard → Project → Settings → Environment Variables** lalu tambahkan:

| Variable | Keterangan |
|---|---|
| `SUPABASE_URL` | URL project Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (RAHASIA, jangan expose ke frontend) |
| `JWT_SECRET` | String random panjang untuk signing token |
| `ADMIN_PASSWORD_HASH` | bcrypt hash dari password admin |

#### Generate bcrypt hash password
```bash
node -e "const b=require('bcryptjs');b.hash('PASSWORD_KAMU',12).then(console.log)"
```

> **Catatan**: Untuk setup awal, kamu bisa pakai `ADMIN_PASSWORD=plain_password` dulu, lalu ganti dengan `ADMIN_PASSWORD_HASH` setelah berhasil login.

### 3. Deploy ke Vercel

```bash
git add -A
git commit -m "feat: script management platform v2.0"
git push origin main
```

Vercel akan otomatis rebuild dari GitHub.

## Public API

### Endpoint Script

```
GET /api/scripts/{id}
```

- Mengembalikan kode Lua sebagai `text/plain; charset=utf-8`
- HTTP 404 jika script tidak ditemukan atau tidak aktif
- Rate limit: 60 request/menit per IP
- CORS: `Access-Control-Allow-Origin: *`

### Penggunaan di Roblox

```lua
-- Simple one-liner
loadstring(game:HttpGet("https://DOMAIN-KAMU.vercel.app/api/scripts/SCRIPT-ID"))()

-- Safe version
local url = "https://DOMAIN-KAMU.vercel.app/api/scripts/SCRIPT-ID"
local ok, result = pcall(game.HttpGet, game, url)
if ok and result then
    local fn, err = loadstring(result)
    if fn then fn()
    else warn("[Boyfinity] Error:", err) end
else
    warn("[Boyfinity] Failed to fetch script")
end
```

### Kompatibilitas

| Feature | Status |
|---|---|
| `game:HttpGet(url)` | ✅ Didukung semua executor standar |
| `loadstring(code)()` | ✅ Harus diaktifkan oleh executor |
| CORS Header | ✅ `Access-Control-Allow-Origin: *` |
| Cache-Control | ✅ `no-cache` — selalu versi terbaru |
| HTTP 404 untuk inactive | ✅ Mengembalikan comment Lua, bukan HTML |
| Plain text response | ✅ Tidak ada JSON/HTML wrapper |

## Admin Dashboard

| URL | Keterangan |
|---|---|
| `/` | Landing page |
| `/login` | Halaman login admin |
| `/admin` | Dashboard admin (membutuhkan login) |

### Keyboard Shortcuts

| Shortcut | Fungsi |
|---|---|
| `Ctrl+S` | Simpan script saat modal editor terbuka |
| `Esc` | Tutup modal |
