# Harakat check server (Google Cloud Run). POST /check with a signed-in user's Supabase token:
#   {"audio": base64 16 kHz mono int16 PCM (<= 30 s), "words": [the Uthmani words from where the reciter is, <= 120]}
# -> {"heard", "said", "skipped", "wrong", "flags" (said with another haraka), "scores", "seconds", "ms"}
# Audio is checked in memory and never written anywhere. Limits per user: MAX_SECONDS_DAY a day.
import base64, json, os, threading, time, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from harakat import Model, check

SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://jposubjybzstfmnngews.supabase.co')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY', 'sb_publishable_Su6KSbkC7LHqqLwoKbrj6w_aevj2aY9')
ORIGINS = set(filter(None, os.environ.get('ORIGINS', 'https://brandyco.github.io,https://localhost,capacitor://localhost,http://localhost:5173,http://localhost:4173').split(',')))
MAX_SECONDS_DAY = float(os.environ.get('MAX_SECONDS_DAY', '3600'))
AUTH_OFF = os.environ.get('AUTH_OFF') == '1'  # local tests only

model = Model()
lock = threading.Semaphore(int(os.environ.get('PARALLEL', '1')))  # one model run at a time per instance
users: dict[str, tuple[str, float]] = {}  # token -> (user id, checked at)
used: dict[str, tuple[str, float]] = {}   # user id -> (day, seconds)


def user_of(token: str) -> str | None:
    if AUTH_OFF:
        return 'test'
    hit = users.get(token)
    if hit and time.time() - hit[1] < 600:
        return hit[0]
    req = urllib.request.Request(f'{SUPABASE_URL}/auth/v1/user', headers={'Authorization': f'Bearer {token}', 'apikey': SUPABASE_KEY})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            uid = json.load(r).get('id')
    except Exception:
        return None
    if uid:
        if len(users) > 5000:
            users.clear()
        users[token] = (uid, time.time())
    return uid


class H(BaseHTTPRequestHandler):
    def cors(self):
        o = self.headers.get('Origin', '')
        if o in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', o)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Max-Age', '86400')

    def reply(self, code: int, body: dict):
        b = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()

    def do_GET(self):
        self.reply(200, {'ok': True}) if self.path == '/health' else self.reply(404, {'error': 'not found'})

    def do_POST(self):
        if self.path != '/check':
            return self.reply(404, {'error': 'not found'})
        auth = self.headers.get('Authorization', '')
        uid = user_of(auth[7:]) if auth.startswith('Bearer ') else None
        if not uid:
            return self.reply(401, {'error': 'sign in'})
        n = int(self.headers.get('Content-Length', '0'))
        if n <= 0 or n > 1_400_000:
            return self.reply(413, {'error': 'too long'})
        try:
            q = json.loads(self.rfile.read(n))
            pcm = base64.b64decode(q['audio'])
            words = [str(w)[:40] for w in q['words']][:120]
        except Exception:
            return self.reply(400, {'error': 'bad request'})
        secs = len(pcm) / 32000
        if secs > 30:
            return self.reply(413, {'error': 'too long'})
        day = time.strftime('%Y-%m-%d')
        d, s = used.get(uid, (day, 0.0))
        if d != day:
            s = 0.0
        if s + secs > MAX_SECONDS_DAY:
            return self.reply(429, {'error': 'daily limit'})
        used[uid] = (day, s + secs)
        with lock:
            t = time.time()
            out = check(model, pcm, words)
        out['ms'] = round((time.time() - t) * 1000)
        self.reply(200, out)

    def log_message(self, *a):  # no request logs (no audio or text is ever logged)
        pass


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', '8080'))), H).serve_forever()
