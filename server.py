"""
Boyfinity Cloud Script Manager - Python Server
Alternative to Node.js using Python Standard Library (No pip install required)
"""

import os
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

PORT = int(os.environ.get('PORT', 3000))
HOST = os.environ.get('HOST', '0.0.0.0')

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
MANAGED_SCRIPT_PATH = os.path.abspath(os.path.join(CURRENT_DIR, '..', 'Boyfinity-ViolenceDistrict-Main.lua'))
FALLBACK_SCRIPT_PATH = os.path.abspath(os.path.join(CURRENT_DIR, 'script.lua'))
HTML_FILE_PATH = os.path.abspath(os.path.join(CURRENT_DIR, 'index.html'))

def get_script_path():
    if os.path.exists(MANAGED_SCRIPT_PATH):
        return MANAGED_SCRIPT_PATH
    return FALLBACK_SCRIPT_PATH

def ensure_script_file():
    target = get_script_path()
    if not os.path.exists(target):
        with open(target, 'w', encoding='utf-8') as f:
            f.write('-- Boyfinity Violence District Main Script\nprint("Boyfinity loaded successfully!")\n')

class ScriptManagerHandler(BaseHTTPRequestHandler):
    def _send_cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        pathname = parsed.path

        # 1. Raw Endpoint
        if pathname in ['/raw', '/raw/script.lua', '/api/raw']:
            ensure_script_file()
            try:
                with open(get_script_path(), 'r', encoding='utf-8') as f:
                    content = f.read()
                self.send_response(200)
                self._send_cors()
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                self.end_headers()
                self.wfile.write(content.encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.end_headers()
                self.wfile.write(f'-- Error reading script: {str(e)}'.encode('utf-8'))
            return

        # 2. API GET Script
        if pathname == '/api/script':
            ensure_script_file()
            try:
                target = get_script_path()
                with open(target, 'r', encoding='utf-8') as f:
                    content = f.read()
                mtime = os.path.getmtime(target)
                self.send_response(200)
                self._send_cors()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                payload = json.dumps({
                    'success': True,
                    'content': content,
                    'lastModified': mtime * 1000,
                    'filePath': target
                })
                self.wfile.write(payload.encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))
            return

        # 3. Web UI
        if pathname in ['/', '/index.html']:
            try:
                with open(HTML_FILE_PATH, 'r', encoding='utf-8') as f:
                    html = f.read()
                self.send_response(200)
                self._send_cors()
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                self.wfile.write(html.encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(f'Error loading HTML: {str(e)}'.encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()
        self.wfile.write(b'Not Found')

    def do_POST(self):
        parsed = urlparse(self.path)
        pathname = parsed.path

        if pathname == '/api/script':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
                content = data.get('content')
                if not isinstance(content, str):
                    self.send_response(400)
                    self._send_cors()
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'success': False, 'error': 'Invalid content'}).encode('utf-8'))
                    return

                ensure_script_file()
                target = get_script_path()
                with open(target, 'w', encoding='utf-8') as f:
                    f.write(content)

                print(f"[CloudScriptManager Python] Script updated ({len(content)} bytes)")
                self.send_response(200)
                self._send_cors()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True, 'message': 'Script updated'}).encode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self._send_cors()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

if __name__ == '__main__':
    ensure_script_file()
    server = HTTPServer((HOST, PORT), ScriptManagerHandler)
    print("====================================================")
    print("⚡ Boyfinity Cloud Script Manager (Python) running!")
    print(f"🌐 Web Interface : http://localhost:{PORT}")
    print(f"🔗 Raw Lua API   : http://localhost:{PORT}/raw")
    print(f"📁 Managed Script : {get_script_path()}")
    print("====================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer shutting down.")

