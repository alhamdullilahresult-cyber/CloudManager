# Complete Discord OAuth2 & Webhook Setup Guide — BOYFINITY Script Hub

Panduan lengkap ini menjelaskan cara setup aplikasi Discord di **Discord Developer Portal** untuk sistem **Sign In with Discord (OAuth2)** dan **Pengiriman Key Otomatis via Webhook** pada website BOYFINITY.

---

## 📌 1. Membuat Aplikasi di Discord Developer Portal

1. Buka [Discord Developer Portal](https://discord.com/developers/applications).
2. Login dengan akun Discord Anda.
3. Klik tombol **"New Application"** di pojok kanan atas.
4. Masukkan nama aplikasi: `BOYFINITY` lalu klik **Create**.
5. Upload icon bot dengan gambar logo `boyfinity.png` di menu **General Information**.

---

## 🔑 2. Konfigurasi OAuth2 (Untuk Login Web Admin, Staff & User)

Buka menu **OAuth2** di sidebar sebelah kiri:

### A. Salin Credentials:
* **Client ID:** Salin angkanya, ini untuk env `DISCORD_CLIENT_ID`.
* **Client Secret:** Klik tombol **"Reset Secret"**, lalu salin string-nya untuk env `DISCORD_CLIENT_SECRET`.

### B. Menambahkan Redirect URI (Wajib!):
Di halaman OAuth2 yang sama, scroll ke bawah ke bagian **Redirects**:
1. Klik **"Add Redirect"**.
2. Masukkan URL callback domain Vercel Anda:
   ```text
   https://boyfinity-script.vercel.app/api/auth/discord/callback
   ```
   *(Opsional untuk test di localhost: `http://localhost:3000/api/auth/discord/callback`)*
3. Klik **"Save Changes"** di bagian bawah.

---

## 🎯 3. OAuth2 URL Generator (Scope yang Dicentang)

Buka submenu **OAuth2** → **URL Generator**:

### A. Di bagian **SCOPES**, centang 2 opsi ini:
- [x] **`identify`** *(Wajib: membaca User ID, Username, Avatar)*
- [x] **`email`** *(Wajib: membaca alamat email akun Discord)*

> [!NOTE]
> Untuk login website biasa, **hanya 2 scope di atas** yang dibutuhkan.

---

## 🤖 4. Pengiriman Key Otomatis & Bot Permissions

### Cara Paling Praktis & Efisien: Discord Webhook (Sudah Aktif di Backend)
Sistem backend BOYFINITY sudah dirancang menggunakan **Discord Webhook** sehingga **tidak membutuhkan server bot 24 jam** yang berat:

1. Buka aplikasi Discord Anda (desktop/web).
2. Masuk ke Server Discord Anda.
3. Klik kanan channel khusus log/pembelian (misal `#key-delivery` atau `#vip-log`) → **Edit Channel (⚙️)**.
4. Buka tab **Integrations** → klik **Webhooks** → **New Webhook**.
5. Beri nama `BOYFINITY Key Dispatcher`, pasang icon Boyfinity.
6. Klik **"Copy Webhook URL"**.
7. Masukkan URL ini ke env Vercel:
   ```text
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/123456789/abcdef...
   ```
*Setiap kali ada user beli atau key terbit, serverless function Vercel langsung menembakkan notifikasi kartu ungu (Rich Embed) dengan tombol copy key ke channel tersebut!*

---

### Jika Ingin Memasang Bot Resmi ke Server (Opsional)
Jika Anda ingin bot Discord resmi Boyfinity masuk sebagai member server:

1. Di Discord Developer Portal, buka tab **Bot** di sidebar kiri.
2. Klik **Add Bot** / **Reset Token** (simpan token jika ingin menjalankan bot custom).
3. Di bagian **Privileged Gateway Intents**, centang:
   - [x] **Presence Intent**
   - [x] **Server Members Intent**
   - [x] **Message Content Intent**
4. Buka **OAuth2** → **URL Generator**:
   - Centang Scopes:
     - [x] `bot`
     - [x] `applications.commands`
   - Pada **Bot Permissions** di bawahnya, centang:
     - [x] **Send Messages**
     - [x] **Embed Links**
     - [x] **Attach Files**
     - [x] **Read Message History**
     - [x] **Mention Everyone**
5. Salin URL di bagian paling bawah halaman, buka di tab browser baru untuk mengundang bot ke server Discord Anda.

---

## 🆔 5. Cara Mengambil Discord User ID (Untuk Owner Role)

Agar akun Discord Anda otomatis mendapat hak akses **Owner** (bukan user biasa):

1. Di Discord, buka **User Settings (⚙️)** → **Advanced**.
2. Aktifkan **Developer Mode**.
3. Klik kanan akun Discord Anda sendiri → klik **"Copy User ID"** (berupa deretan angka).
4. Masukkan angka tersebut ke env:
   ```text
   DISCORD_OWNER_IDS=749281928471928374
   ```

---

## 📋 Checklist Environment Variables di Vercel

Pastikan variabel berikut sudah terisi di **Vercel Dashboard → Settings → Environment Variables**:

| Environment Variable | Dari Mana Didapat | Contoh Nilai |
|---|---|---|
| `DISCORD_CLIENT_ID` | Discord Developer Portal → OAuth2 | `134567890123456789` |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal → OAuth2 | `AbCdEf1234567890_xYz...` |
| `DISCORD_REDIRECT_URI` | Domain Vercel Anda | `https://boyfinity-script.vercel.app/api/auth/discord/callback` |
| `DISCORD_OWNER_IDS` | Klik Kanan Profil Discord → Copy ID | `749281928471928374` |
| `DISCORD_WEBHOOK_URL` | Discord Channel Settings → Integrations → Webhook | `https://discord.com/api/webhooks/...` |
| `JWT_SECRET` | String random manual 32+ char | `e8f9a2b3c4d5e6f7...` |

*(Setelah menambahkan env vars di Vercel, jangan lupa klik **Redeploy** di tab Deployments agar konfigurasi langsung aktif).*

