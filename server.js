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

// Limpeza de reservas temporárias expiradas + poda de idempotência (automático)
setInterval(() => {
  store.transact((db) => {
    const engine = require('./backend/engine');
    const api = require('./backend/api');
    let mudou = engine.purgeExpired(db, Date.now());
    if (api.podarIdempotencia(db)) mudou = true;
    if (mudou) router.broadcast('purge', {});
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
  // Conexões abortadas não podem derrubar o processo (EPIPE/ERR_STREAM_DESTROYED)
  res.on('error', () => { try { res.destroy(); } catch (e) {} });
  req.on('error', () => {});
  req.socket.on('error', () => {});

  try {
    tratarRequisicao(req, res, ip);
  } catch (e) {
    // URL malformada, decode inválido etc. — responde 400 em vez de crashar.
    try { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Requisição inválida'); } catch (e2) {}
  }
});

function tratarRequisicao(req, res, ip) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  /* ------------------------------ API /api/* ------------------------------ */
  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': FRONTEND_URL || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      return res.end();
    }
    let body = null;
    let dados = '';
    req.on('data', (c) => { dados += c; if (dados.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try {
        if (dados) { try { body = JSON.parse(dados); } catch (e) { res.writeHead(400); return res.end('{"ok":false,"code":"JSON_INVALIDO"}'); } }
        const tratou = router.handle(req, res, url, body, ip);
        if (!tratou) { res.writeHead(404); res.end('{"ok":false,"code":"ROTA_INEXISTENTE"}'); }
      } catch (e) {
        console.error('[api] erro não tratado:', e.message);
        try { res.writeHead(500); res.end('{"ok":false,"code":"ERRO_INTERNO"}'); } catch (e2) {}
      }
    });
    return;
  }

  /* --------------------------- arquivos estáticos -------------------------- */
  // Proteção: banco e token nunca são servidos. O teste é feito no caminho
  // DECODIFICADO e em minúsculas — antes, "/%64ata/neitzel-db.json" ou
  // "/Data/..." no Windows burlavam a checagem e expunham o banco e tokens.
  let filePath;
  try { filePath = decodeURIComponent(url.pathname); } catch (e) {
    res.writeHead(400); return res.end('Acesso negado');
  }
  const decLower = filePath.toLowerCase();
  if (decLower.startsWith('/data/') || decLower === '/data' || /(^|\/)\./.test(decLower)) {
    res.writeHead(403); return res.end('Acesso negado');
  }

  if (filePath === '/' ) filePath = '/SISTEMA NEITZEL.html';
  if (filePath === '/agendamento' || filePath === '/portal') filePath = '/agendamento.html';
  filePath = path.resolve(path.join(ROOT_DIR, filePath));
  // path.relative evita o falso positivo de pastas irmãs com prefixo igual
  const rel = path.relative(ROOT_DIR, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) { res.writeHead(403); return res.end('Acesso negado'); }

  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); return res.end('Não encontrado'); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache, must-revalidate' : 'no-cache'
    });
    res.end(content);
  });
}

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

// Última linha de defesa: um erro imprevisto nunca deve derrubar o sistema
// (implantação local/kiosk). Loga e continua.
process.on('uncaughtException', (err) => {
  console.error('[erro não tratado]', err && err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('[promise rejeitada]', err && (err.message || err));
});

