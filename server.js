const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const outDir = path.join(root, 'outputs');
const envPath = path.join(root, '.env');

function loadEnv() {
  if (!fs.existsSync(envPath)) return {};
  return fs.readFileSync(envPath, 'utf8').split(/\r?\n/).reduce((env, line) => {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m || m[1].startsWith('#')) return env;
    env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    return env;
  }, {});
}

const env = { ...loadEnv(), ...process.env };
const apiKey = env.NANO_BANANA_API_KEY || env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
const model = env.NANO_BANANA_MODEL || 'gemini-2.5-flash-image';
const port = Number(env.PORT || 8787);

const mimes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

async function render(req, res) {
  if (!apiKey) return send(res, 500, { error: 'Missing NANO_BANANA_API_KEY in .env' });
  try {
    const payload = await readJson(req);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const apiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await apiRes.json().catch(() => ({}));
    send(res, apiRes.status, data);
  } catch (error) {
    send(res, 500, { error: error.message || String(error) });
  }
}

function serveFile(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
  const rel = urlPath === '/' ? 'furniture-quote-chatbot.html' : urlPath.replace(/^\/+/, '');
  const file = path.resolve(outDir, rel);
  if (!file.startsWith(outDir)) return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    send(res, 200, data, mimes[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
}

http.createServer((req, res) => {
  if (
    req.method === 'POST' &&
    (
      req.url === '/api/render' ||
      req.url === '/api/generate-preview' ||
      req.url === '/api/generate-screen-preview'
    )
  ) {
    return render(req, res);
  }

  if (req.method === 'GET') return serveFile(req, res);

  send(res, 405, { error: 'Method not allowed' });
}).listen(port, '0.0.0.0', () => {
  console.log(`FURSYS AI server: http://localhost:${port}`);
  console.log(apiKey ? 'Nano Banana key loaded from .env' : 'Missing NANO_BANANA_API_KEY in .env');
});
