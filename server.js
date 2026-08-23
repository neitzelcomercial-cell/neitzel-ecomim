const http = require('http');
const fs = require('fs');
const path = require('path');

// ------------------------- CONFIGURAÇÃO POR AMBIENTE ------------------------
// Desenvolvimento:  node server.js                      (localhost:8080)
// Produção:         PORT=... NODE_ENV=production \
//                   NEITZEL_ADMIN_TOKEN=<token forte> \
//                   FRONTEND_URL=https://seu-frontend   node server.js
const PORT = process.env.PORT || 8080;
const PROD = process.env.NODE_ENV === 'production';
const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/$/, ''); // CORS do frontend hospedado separado

const ROOT_DIR = __dirname;

// Banco + API do Portal (fonte única de verdade da agenda)
const store = require('./backend/store');
const router = require('./backend/router');
const apiMod = require('./backend/api');
apiMod.setCorsOrigin(FRONTEND_URL); // em produção, só o frontend autorizado fala com a API

store.load();

// Token admin: SEMPRE via env em produção; em dev gera data/admin-token.txt
(function garantirTokenAdmin() {
  if (process.env.NEITZEL_ADMIN_TOKEN) return;
  if (PROD) {
    console.error('[FATAL] Em produção defina NEITZEL_ADMIN_TOKEN (variável de ambiente). Encerrando.');
    process.exit(1);
  }
  const dir = path.join(ROOT_DIR, 'data');
  const f = path.join(dir, 'admin-token.txt');
  try {
    if (fs.existsSync(f)) { process.env.NEITZEL_ADMIN_TOKEN = fs.readFileSync(f, 'utf8').trim(); return; }
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const t = require('crypto').randomBytes(24).toString('hex');
    fs.writeFileSync(f, t, 'utf8');
    process.env.NEITZEL_ADMIN_TOKEN = t;
    console.log('[admin] Token gerado em data/admin-token.txt (use no painel).');
  } catch (e) { console.error('[admin] Falha ao preparar token:', e.message); }
})();

// Limpeza de reservas temporárias expiradas (mecanismo automático)
setInterval(() => {
  store.transact((db) => {
    const engine = require('./backend/engine');
    if (engine.purgeExpired(db, Date.now())) router.broadcast('purge', {});
  }).catch(() => {});
}, 30000).unref();

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain'
};

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  const ip = (req.socket.remoteAddress || '?').replace('::ffff:', '');
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  /* ------------------------------ API /api/* ------------------------------ */
  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      return res.end();
    }
    let body = null;
    let dados = '';
    req.on('data', (c) => { dados += c; if (dados.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (dados) { try { body = JSON.parse(dados); } catch (e) { res.writeHead(400); return res.end('{"ok":false,"code":"JSON_INVALIDO"}'); } }
      const tratou = router.handle(req, res, url, body, ip);
      if (!tratou) { res.writeHead(404); res.end('{"ok":false,"code":"ROTA_INEXISTENTE"}'); }
    });
    return;
  }

  /* --------------------------- arquivos estáticos -------------------------- */
  // Proteção: banco e token nunca são servidos
  if (/^\/data\//.test(url.pathname) || /(^|\/)\./.test(url.pathname)) {
    res.writeHead(403); return res.end('Acesso negado');
  }

  let filePath = decodeURIComponent(url.pathname);
  if (filePath === '/' ) filePath = '/SISTEMA NEITZEL.html';
  if (filePath === '/agendamento' || filePath === '/portal') filePath = '/agendamento.html';
  filePath = path.join(ROOT_DIR, filePath);
  if (!filePath.startsWith(ROOT_DIR)) { res.writeHead(403); return res.end('Acesso negado'); }

  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); return res.end('Não encontrado'); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache, must-revalidate' : 'no-cache'
    });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor Neitzel rodando em http://localhost:${PORT}`);
  console.log(`📅 Portal público:   http://localhost:${PORT}/agendamento`);
  try {
    const os = require('os');
    for (const lista of Object.values(os.networkInterfaces())) {
      for (const ni of lista || []) {
        if (ni.family === 'IPv4' && !ni.internal) console.log(`📶 Na rede local:    http://${ni.address}:${PORT}/agendamento  (celular no mesmo Wi-Fi)`);
      }
    }
  } catch (e) {}
  if (PROD) console.log(`🛡️ Produção ativa — CORS: ${FRONTEND_URL || '(mesma origem)'}`);
});

process.on('SIGINT', () => {
  console.log('\nEncerrando servidor...');
  server.close();
  process.exit(0);
});

