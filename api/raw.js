// Vercel Serverless Function: /api/raw
import fs from 'fs';

const TMP_FILE = '/tmp/script.lua';
const DEFAULT_SCRIPT = `-- Boyfinity Violence District Cloud Script
-- Loaded dynamically via Antigravity Loader
print("[Boyfinity Cloud] Script initialized via game:HttpGet!")
`;

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    let output = DEFAULT_SCRIPT;
    if (fs.existsSync(TMP_FILE)) {
        try {
            output = fs.readFileSync(TMP_FILE, 'utf-8');
        } catch (e) {}
    } else if (process.env.SAVED_LUA_SCRIPT) {
        output = process.env.SAVED_LUA_SCRIPT;
    }

    return res.status(200).send(output);
}
