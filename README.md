# Boyfinity Cloud Script Manager

Sistem manajemen skrip cloud real-time dengan Web Editor dan Raw API endpoint untuk Roblox Executor (Antigravity).

## Fitur Utama
1. **Web Interface Dashboard (`http://localhost:3000`)**:
   - Web editor berbasis CodeMirror dengan syntax highlighting Lua dan tema Dracula.
   - Fitur Simpan & Deploy instan (`Ctrl + S` atau tombol 💾 **Save & Deploy**).
   - Menghitung statistik baris, karakter, dan waktu update terakhir secara real-time.
   - Tombol satu-klik untuk copy URL Raw API dan snippet loader Roblox.
2. **Raw Lua Stream Endpoint (`/raw` atau `/raw/script.lua`)**:
   - Hanya mengembalikan teks mentah (`text/plain; charset=utf-8`) dari `Boyfinity-ViolenceDistrict-Main.lua`.
   - Dilengkapi header `Cache-Control: no-cache` agar Executor selalu menerima kode versi terbaru tanpa tersangkut cache.
   - Header CORS `Access-Control-Allow-Origin: *` aktif sehingga bisa diakses dari browser maupun `game:HttpGet()`.
3. **Pilihan Runtime**:
   - **Node.js**: `node server.js`
   - **Python**: `python server.py` (tanpa pip install, menggunakan modul standar `http.server`)
   - **Vercel**: Mendukung deployment serverless dengan konfigurasi `vercel.json` dan folder `api/`.

## Cara Menjalankan Server Lokal

### Menggunakan Node.js
```bash
cd CloudScriptManager
node server.js
```

### Menggunakan Python
```bash
cd CloudScriptManager
python server.py
```

### Port Custom
```bash
PORT=8080 node server.js
```

---

## Integrasi Loader Roblox Executor
Gunakan file `Loader.lua` pada Roblox Executor Anda:

```lua
local scriptUrl = "https://your-domain.com/raw" -- Ganti dengan domain / URL API Anda

local success, code = pcall(function()
    return game:HttpGet(scriptUrl)
end)

if success and code then
    local executable, err = loadstring(code)
    if executable then
        executable()
    else
        warn("Format Lua salah:", err)
    end
else
    warn("Gagal mengambil kode dari API web.")
end
```

