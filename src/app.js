/* ============================================================================
 * ECOMIM OS — Applayer (app.js)
 * ========================================================================== */

'use strict';

const E = window.ECOMIM;
const features = window.ECOMIM_EXT;

const I18N = {
  titulo: 'NEITZEL',
  sufixo: 'Sistema Digital',
};

/* ------------------------------------------------------------------ *
 * UTILITÃRIOS DE UI
 * ------------------------------------------------------------------ */

const el = (tag, cls, html, ...children) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  children.forEach((child) => {
    if (Array.isArray(child)) child.forEach((c) => appendChildSafe(node, c));
    else appendChildSafe(node, child);
  });
  return node;
};

/** Anexa um filho com segurança (float de array → nunca vira "HTMLButtonElement" na tela). */
const appendChildSafe = (node, child) => {
  if (child && typeof child.appendChild === 'function') node.appendChild(child);
  else if (child != null && child !== '') node.appendChild(document.createTextNode(String(child)));
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const toast = (msg, tipo = 'info') => {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = el('div', `toast toast-${tipo}`, esc(msg));
  c.appendChild(t);
  setTimeout(() => { t.classList.add('show'); }, 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 4200);
};

/** Insight de IA inline — mostra uma caixa de sugestão no topo da view atual. */
function inlineInsight(texto, titulo = 'Insight da IA') {
  const content = document.querySelector('.ecomim-content');
  if (!content) return;
  const box = el('div', 'ai-insight', `<div class="ai-insight-head">${esc(titulo)}</div><span class="ai-mini-typing"><span></span><span></span><span></span></span>`);
  content.insertBefore(box, content.firstChild);
  setTimeout(() => { box.innerHTML = `<div class="ai-insight-head">${esc(titulo)}</div><div>${esc(texto).replace(/\n/g, '<br>')}</div>`; }, 450);
}

/** Garante que um elemento tenha as classes informadas (usa de forma idempotente a classList). */
const addClass = (node, ...cls) => {
  if (!node) return node;
  if (node.classList && typeof node.classList.add === 'function') node.classList.add(...cls);
  else node.className = [String(node.className || '').trim(), ...cls].filter(Boolean).join(' ');
  return node;
};
const removeClass = (node, ...cls) => {
  if (!node) return node;
  if (node.classList && typeof node.classList.remove === 'function') node.classList.remove(...cls);
  else {
    const keep = String(node.className || '').split(' ').filter((c) => !cls.includes(c));
    node.className = keep.join(' ');
  }
  return node;
};
const hasClass = (node, cls) => {
  if (!node) return false;
  if (node.classList && typeof node.classList.contains === 'function') return node.classList.contains(cls);
  return String(node.className || '').split(' ').includes(cls);
};

const moneyIn = (v) => {
  if (v == null || v === '') return '';
  return (Number(v) / 100).toFixed(2).replace('.', ',');
};

/**
 * Converte texto digitado em reais (ex.: "1.500,00", "500", "12,5") para
 * reais como número puro. O core.js converte reais → centavos (toCents).
 * (Não confundir com antigo moneyOut, que pré-convertia para centavos e
 * causava valores 100× maiores no cadastro.)
 */
const parseBRLNumber = (s) => {
  const t = String(s == null ? '' : s).trim();
  if (!t) return 0;
  const clean = t.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\.|$))/g, '').replace(',', '.');
  const n = Number(clean);
  return isNaN(n) || n < 0 ? 0 : n;
};

/* ------------------------------------------------------------------ *
 * ÃCONES VETORIAIS (substituem emojis por ícones formais de linha)
 * ------------------------------------------------------------------ */
const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7.5" height="10" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="6.5" rx="1.5"/><rect x="3" y="16" width="7.5" height="5" rx="1.5"/><rect x="13.5" y="12.5" width="7.5" height="8.5" rx="1.5"/></svg>',
  leads: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>',
  funil: '<svg viewBox="0 0 24 24"><path d="M3.5 5h17l-6.5 7.5V19l-4 2v-8.5L3.5 5z"/></svg>',
  cacador: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8L21 21"/><path d="M8.5 11h5M11 8.5v5"/></svg>',
  fila: '<svg viewBox="0 0 24 24"><path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1.4"/><circle cx="4.5" cy="12" r="1.4"/><circle cx="4.5" cy="18" r="1.4"/></svg>',
  agenda: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M9.5 14.5h5M12 12v5"/></svg>',
  financeiro: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M14.5 9.5c-.5-1.2-1.5-1.8-2.5-1.8-1.6 0-2.7 1-2.7 2.3 0 3.5 5.4 1.5 5.4 5 0 1.4-1.1 2.3-2.7 2.3-1.1 0-2.2-.6-2.7-1.9"/></svg>',
  atendimento: '<svg viewBox="0 0 24 24"><path d="M4 13a8 8 0 0 1 16 0"/><rect x="3" y="13" width="4.5" height="6" rx="1.5"/><rect x="16.5" y="13" width="4.5" height="6" rx="1.5"/><path d="M20 19v1a2 2 0 0 1-2 2h-4"/></svg>',
  clientes: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3.5"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16.5 5.5a3 3 0 0 1 0 5.8M17.5 14.8c2.4.6 3.8 2.4 3.8 5.2"/></svg>',
  projetos: '<svg viewBox="0 0 24 24"><path d="M3 4.5h7l2 2.5h9v12.5H3V4.5z"/></svg>',
  marketing: '<svg viewBox="0 0 24 24"><path d="M3 11.5v4.5h4l8 5V6.5l-8 5H3z"/><path d="M18 9a4 4 0 0 1 0 6M20.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  rh: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.8"/><path d="M5 20.5c0-3.8 3.1-6 7-6s7 2.2 7 6"/></svg>',
  bi: '<svg viewBox="0 0 24 24"><path d="M4 20h16"/><path d="M6.5 17v-6M11 17V7M15.5 17v-4M20 17V4"/></svg>',
  automacoes: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="M12 7v5l-5.5 4M12 12l7 4"/></svg>',
  comunicacao: '<svg viewBox="0 0 24 24"><path d="M4 5h16v12H9l-5 4V5z"/><path d="M8 10h8"/></svg>',
  seguranca: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 5-3.2 8.5-7 10-3.8-1.5-7-5-7-10V6l7-3z"/><path d="M9.5 12l2 2 3.5-4"/></svg>',
  config: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9L19 19M19 5l-2.1 2.1M7.1 16.9L5 19"/></svg>',
  /* Ãcones de ação */
  novo: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  fechar: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  lixo: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6.5 7l1 14h9l1-14M10 11v6M14 11v6"/></svg>',
  whats: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z"/><path d="M9 8.5c0 4 2.5 6.5 6.5 6.5.5 0 .7-.3.6-.8l-.9-2.2c-.1-.3-.4-.3-.7-.1l-1 .8c-1.4-1-2.9-2.5-3.4-3.9l.9-1c.2-.3.2-.6 0-.7l-2-1.1c-.5-.3-.9 0-1 .5z"/></svg>',
  tarefa: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12"/><path d="M3.5 6l.8.8L6 5M3.5 12l.8.8L6 11M3.5 18l.8.8L6 17"/></svg>',
  importar: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/></svg>',
  ai: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 15.5v-7l7 7v-7"/></svg>',
  pastas: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18"/></svg>',
  seta: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  memoria: '<svg viewBox="0 0 24 24"><path d="M12 4a5.5 5.5 0 0 1 5.5 5.5c0 1.6-.7 3-1.8 4-.9.9-1.2 1.6-1.2 2.5h-5c0-.9-.3-1.6-1.2-2.5a5.5 5.5 0 0 1-1.8-4A5.5 5.5 0 0 1 12 4z"/><path d="M10 19.5h4M10.8 21.5h2.4"/></svg>',
  sol: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/></svg>',
  lua: '<svg viewBox="0 0 24 24"><path d="M20 13.5A8 8 0 0 1 10.5 4a8 8 0 1 0 9.5 9.5z"/></svg>',
};
const ico = (name) => `<span class="nav-icon">${ICONS[name] || ICONS.pastas}</span>`;
const iconBtn = (name) => `<span style="display:inline-flex;vertical-align:-2px">${ICONS[name] || ''}</span>`;

/* ------------------------------------------------------------------ *
 * ESTADO DA UI
 * ------------------------------------------------------------------ */

const ui = {
  view: 'dashboard',
  detailLeadId: null,
  aiOpen: false,
  notifOpen: false,
  cmdkOpen: false,
  mobileNav: false,
};

const VIEWS = [
  { id: 'dashboard', nome: 'Painel', icone: 'dashboard' },
  { id: 'leads', nome: 'Leads & CRM', icone: 'leads' },
  { id: 'funil', nome: 'Funil', icone: 'funil' },
  { id: 'cacador', nome: 'Caçador de Leads', icone: 'cacador' },
  { id: 'fila', nome: 'Fila de aprovação', icone: 'fila' },
  { id: 'planner', nome: 'Planner', icone: 'agenda' },
  { id: 'agenda', nome: 'Agenda', icone: 'agenda' },
  { id: 'servicos', nome: 'Serviços', icone: 'projetos' },
  { id: 'produtos', nome: 'Produtos', icone: 'automacoes' },
  { id: 'estoque', nome: 'Estoque', icone: 'automacoes' },
  { id: 'atendimento_ops', nome: 'Atendimento', icone: 'atendimento' },
  { id: 'financeiro', nome: 'Financeiro', icone: 'financeiro' },
  { id: 'atendimento', nome: 'Tickets', icone: 'atendimento' },
  { id: 'clientes', nome: 'Clientes & CS', icone: 'clientes' },
  { id: 'projetos', nome: 'Projetos', icone: 'projetos' },
  { id: 'marketing', nome: 'Marketing', icone: 'marketing' },
  { id: 'rh', nome: 'RH', icone: 'rh' },
  { id: 'bi', nome: 'BI & Analytics', icone: 'bi' },
  { id: 'inteligencia', nome: 'Centro de Inteligência', icone: 'ai' },
  { id: 'automacoes', nome: 'Automações', icone: 'automacoes' },
  { id: 'comunicacao', nome: 'Comunicação', icone: 'comunicacao' },
  { id: 'acessor', nome: 'Acessor WhatsApp', icone: 'comunicacao' },
  { id: 'seu_acessor', nome: 'Seu Acessor', icone: 'comunicacao' },
  { id: 'portal', nome: 'Portal do Cliente', icone: 'comunicacao' },
  { id: 'memoria', nome: 'Memória', icone: 'memoria' },
  { id: 'suporte', nome: 'Diagnóstico', icone: 'seguranca' },
  { id: 'seguranca', nome: 'Segurança', icone: 'seguranca' },
  { id: 'config', nome: 'Configurações', icone: 'config' },
];

const NAV_SECTIONS = [
  { nome: 'Operação', itens: ['dashboard', 'leads', 'funil', 'cacador', 'fila'] },
  { nome: 'Agenda', itens: ['planner', 'agenda'] },
  { nome: 'Catálogo', itens: ['servicos', 'produtos', 'estoque'] },
  { nome: 'Operação & Gestão', itens: ['atendimento_ops', 'financeiro', 'atendimento', 'clientes', 'projetos', 'marketing', 'rh'] },
  { nome: 'Inteligência', itens: ['bi', 'inteligencia', 'automacoes', 'comunicacao', 'acessor', 'seu_acessor'] },
  { nome: 'Sistema', itens: ['portal', 'memoria', 'suporte', 'seguranca', 'config'] },
];

/* ------------------------------------------------------------------ *
 * NAVEGAÇÃO
 * ------------------------------------------------------------------ */

function renderApp(unlocked) {
  const root = document.getElementById('app-root');
  if (!root) return;
  root.innerHTML = '';
  const shell = el('div', 'ecomim-shell', '');
  root.appendChild(shell);

  // Sidebar + Main
  shell.appendChild(renderSidebar());
  shell.appendChild(renderMain());
  // Onboarding profissional (primeira execução): senha 6 dígitos → recuperação → Google → confidencialidade
  if (features.security && !features.security.isOnboardingDone()) {
    if (window.NEITZEL_ONBOARDING) window.NEITZEL_ONBOARDING.start();
    else initApp();
  } else if (features.security && features.security.hasPin() && !unlocked) showLogin();
  else initApp(unlocked === true);
}

/* Estado persistido dos grupos do menu (recolhidos pelo usuário) */
const NAV_GRUPOS_KEY = 'ecomim_nav_grupos_fechados';
function gruposFechados() {
  try {
    const raw = localStorage.getItem(NAV_GRUPOS_KEY);
    if (!raw) return NAV_SECTIONS.map((s) => s.nome); // abre com tudo recolhido
    return JSON.parse(raw);
  } catch (e) { return []; }
}
function salvarGruposFechados(lista) {
  try { localStorage.setItem(NAV_GRUPOS_KEY, JSON.stringify(lista)); } catch (e) {}
}
/** Garante que o grupo do item ativo esteja aberto (navegação clara) */
function abrirGrupoDe(itemEl) {
  const g = itemEl ? itemEl.closest('.nav-group') : null;
  if (!g || !g.classList.contains('closed')) return;
  g.classList.remove('closed');
  const head = g.querySelector('.nav-group-head');
  if (head) head.setAttribute('aria-expanded', 'true');
  const nome = head ? head.querySelector('span').textContent : null;
  if (nome) salvarGruposFechados(gruposFechados().filter((n) => n !== nome));
}

function renderSidebar() {
  const navItens = [];
  NAV_SECTIONS.forEach((sec) => {
    // Grupo recolhível (redesign: menos itens visíveis, hierarquia clara)
    const fechado = gruposFechados().includes(sec.nome);
    const group = el('div', 'nav-group' + (fechado ? ' closed' : ''));
    const head = el('button', 'nav-group-head',
      `<span class="ng-title">${esc(sec.nome)}</span><span class="nav-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span>`
    );
    head.type = 'button';
    head.setAttribute('aria-expanded', String(!fechado));
    head.title = (fechado ? 'Expandir ' : 'Recolher ') + sec.nome;
    head.addEventListener('click', () => {
      const agoraFechado = group.classList.toggle('closed');
      head.setAttribute('aria-expanded', String(!agoraFechado));
      const lista = gruposFechados();
      const i = lista.indexOf(sec.nome);
      if (agoraFechado && i < 0) { lista.push(sec.nome); salvarGruposFechados(lista); }
      else if (!agoraFechado && i >= 0) { lista.splice(i, 1); salvarGruposFechados(lista); }
    });
    const body = el('div', 'nav-group-body');
    const inner = el('div', 'nav-group-inner');
    sec.itens.forEach((id) => {
      const v = VIEWS.find((x) => x.id === id);
      if (!v) return; // defesa: view desconhecida não quebra a navegação
      const navBtn = el('button', 'ecomim-nav-item' + (id === 'dashboard' ? ' active' : ''), `<span class="nav-icon">${ICONS[v.icone] || ''}</span><span class="nav-label">${esc(v.nome)}</span><span class="nav-count" data-count="${id}"></span>`);
      navBtn.dataset.view = id;
      // Botão de ajuda "?" — dica de como usar o espaço
      const help = el('button', 'ecomim-nav-help', '?');
      help.title = `Como usar ${v.nome}`;
      help.dataset.help = id;
      help.addEventListener('click', (e) => {
        e.stopPropagation();
        openHelpTip(id);
      });
      navBtn.appendChild(help);
      inner.appendChild(navBtn);
    });
    body.appendChild(inner);
    group.appendChild(head);
    group.appendChild(body);
    navItens.push(group);
  });
  const brand = el('div', 'ecomim-brand', `<div class="ecomim-brand-logo ecomim-brand-logo-nz">N</div><div><div class="ecomim-brand-name">${esc(I18N.titulo)}</div><div class="ecomim-brand-sub">${esc(I18N.sufixo)}</div></div>`);
  const footer = el('div', 'ecomim-sidebar-footer', `<button class="btn btn-sm btn-ghost" data-action="collapse">◀ Colapsar</button>`);
  return el('aside', 'ecomim-sidebar', '', brand, ...navItens, footer);
}

function renderMain() {
  const topbar = el('header', 'ecomim-topbar', `
    <button class="btn btn-icon ecomim-burger" data-action="mobile-nav" title="Menu">${ICONS.fila}</button>
    <div class="topbar-title" id="topbar-title">${esc('Painel')}</div>
    <div class="topbar-search"></div>
    <div class="topbar-right">
      <button class="btn btn-icon" id="btn-tema" title="${document.documentElement.getAttribute('data-theme') === 'light' ? 'Tema claro' : 'Tema escuro'}">${document.documentElement.getAttribute('data-theme') === 'light' ? ICONS.sol : ICONS.lua}</button>
      <button class="btn btn-icon ecomim-bell" id="btn-notif" title="Notificações">${ICONS.bi}<span class="bell-dot" style="display:none"></span></button>
      <button class="btn btn-icon" id="btn-user" title="Usuário">${ICONS.rh}</button>
    </div>
  `);
  const content = el('main', 'ecomim-content', '');
  const main = el('div', 'ecomim-main', '', topbar, content);
  // Fundo discreto do sistema: particulas suaves + brilho diagonal raro (CSS puro)
  const fundoSuave = el('div', 'fundo-suave', '<span class="fp f1"></span><span class="fp f2"></span><span class="fp f3"></span><span class="fp f4"></span><span class="fp f5"></span><span class="fs-brilho"></span>');
  main.insertBefore(fundoSuave, main.firstChild);

  // Balão flutuante de IA no canto inferior direito
  const floatingAiButton = el('button', 'ecomim-ai-floating', `
    <div class="ai-floating-icon">${ICONS.ai}</div>
    <span class="ai-floating-tooltip">Precisa de ajuda?</span>
  `);
  floatingAiButton.title = 'Assistente Neitzel';
  floatingAiButton.setAttribute('aria-label', 'Abrir assistente de IA');
  floatingAiButton.addEventListener('click', () => toggleAiPanel());

  main.appendChild(floatingAiButton);

  return main;
}

/* ------------------------------------------------------------------ *
 * LOGIN
 * ------------------------------------------------------------------ */

/** Fundo animado de tecnologia do login: rede de nós conectados, dígitos e
 *  índices subindo, gráfico com varredura — tudo no verde da marca. Para
 *  sozinho quando o overlay sai da tela. */
function iniciarLoginFX(overlay) {
  const canvas = overlay.querySelector('.login-canvas');
  if (!canvas || canvas.dataset.fx) return;
  canvas.dataset.fx = '1';
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, raf = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function redimensionar() {
    W = canvas.width = overlay.clientWidth * dpr;
    H = canvas.height = overlay.clientHeight * dpr;
    canvas.style.width = overlay.clientWidth + 'px';
    canvas.style.height = overlay.clientHeight + 'px';
  }
  redimensionar();
  window.addEventListener('resize', () => redimensionar());

  const cor = () => (document.documentElement.getAttribute('data-theme') === 'light' ? '22,106,67' : '62,207,142');
  const nos = Array.from({ length: 34 }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * .0006, vy: (Math.random() - .5) * .0006, r: 1.2 + Math.random() * 1.6 }));
  const CH = '0123456789%↑R$·';
  const digitos = Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random(), v: .00025 + Math.random() * .00055, s: 10 + Math.random() * 13, c: CH[Math.floor(Math.random() * CH.length)], a: .07 + Math.random() * .18 }));
  const pontos = []; let v = .62;
  for (let i = 0; i <= 64; i++) { v = Math.min(.92, Math.max(.18, v + (Math.random() - .46) * .05)); pontos.push(v); }

  let t = 0;
  function frame() {
    if (!overlay.isConnected) { cancelAnimationFrame(raf); return; }
    t++;
    const c = cor();
    ctx.clearRect(0, 0, W, H);
    for (const n of nos) { n.x += n.vx; n.y += n.vy; if (n.x < 0 || n.x > 1) n.vx *= -1; if (n.y < 0 || n.y > 1) n.vy *= -1; }
    ctx.lineWidth = dpr * .7;
    for (let i = 0; i < nos.length; i++) for (let j = i + 1; j < nos.length; j++) {
      const a = nos[i], b = nos[j];
      const dx = (a.x - b.x) * W, dy = (a.y - b.y) * H, dist = Math.hypot(dx, dy), lim = W * .16;
      if (dist < lim) {
        ctx.strokeStyle = 'rgba(' + c + ',' + ((1 - dist / lim) * .22).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(a.x * W, a.y * H); ctx.lineTo(b.x * W, b.y * H); ctx.stroke();
      }
    }
    for (const n of nos) { ctx.fillStyle = 'rgba(' + c + ',.55)'; ctx.beginPath(); ctx.arc(n.x * W, n.y * H, n.r * dpr, 0, 7); ctx.fill(); }
    ctx.textAlign = 'center';
    for (const g of digitos) {
      g.y -= g.v;
      if (g.y < -.05) { g.y = 1.05; g.c = CH[Math.floor(Math.random() * CH.length)]; g.x = Math.random(); }
      ctx.font = '600 ' + (g.s * dpr) + 'px ui-monospace, Consolas, monospace';
      ctx.fillStyle = 'rgba(' + c + ',' + g.a.toFixed(3) + ')';
      ctx.fillText(g.c, g.x * W, g.y * H);
    }
    const baseY = H * .87, altura = H * .15, passo = W / (pontos.length - 1);
    ctx.strokeStyle = 'rgba(' + c + ',.85)'; ctx.lineWidth = 2 * dpr;
    ctx.shadowColor = 'rgba(' + c + ',.45)'; ctx.shadowBlur = 12 * dpr;
    ctx.beginPath();
    const revela = ((t % 460) / 460) * pontos.length;
    for (let i = 0; i < pontos.length && i <= revela; i++) {
      const x = i * passo, y = baseY - pontos[i] * altura;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke(); ctx.shadowBlur = 0;
    raf = requestAnimationFrame(frame);
  }
  if (reduced) { frame(); cancelAnimationFrame(raf); } else raf = requestAnimationFrame(frame);
}

function showLogin() {
  const c = document.querySelector('.ecomim-shell');
  if (!c) return;
  // Remove bloqueios antigos e camadas de login duplicadas
  document.querySelectorAll('.ecomim-login').forEach((n) => n.remove());
  // Mantém a sidebar/main intactas; a camada de login sobrepõe tudo
  const overlay = el('div', 'ecomim-login', `
    <canvas class="login-canvas" aria-hidden="true"></canvas>
    <div class="ecomim-login-card">
      <div class="login-logo"><div class="ecomim-brand-logo" style="width:52px;height:52px;font-size:22px;background:linear-gradient(135deg,#0b0d0c,#166a43)">N</div></div>
      <h1 class="login-title">${esc(I18N.titulo)}</h1>
      <div class="login-sub" style="letter-spacing:.28em;text-transform:uppercase;font-size:10px;font-weight:700;color:var(--e-danger);margin-top:2px;margin-bottom:18px">Sistema Digital</div>
      <p class="login-sub">Digite sua senha de 6 números para acessar o sistema</p>
      <input type="password" id="login-pin" placeholder="••••••" autocomplete="off" inputmode="numeric" maxlength="6" style="width:100%;margin-bottom:10px">
      <button class="btn btn-primary btn-block" id="login-btn">Entrar</button>
      <button class="btn btn-sm btn-block btn-ghost" id="login-remember" style="margin-top:8px;font-size:11.5px">Esqueci minha senha</button>
      <p class="login-sub" style="margin-top:14px;font-size:11px">Seus dados ficam apenas neste navegador. </p>
    </div>
    <div class="login-ticker" aria-hidden="true"><div class="lt-track">
      <span>◆ NEITZEL <b>SISTEMA DIGITAL</b></span><span>◆ PLANNER <b>TEMPO REAL</b></span><span>◆ MEMÓRIA INTELIGENTE <b>ATIVA</b></span><span>◆ SINCRONIZAÇÃO <b>LOCAL-FIRST</b></span>
    </div></div>
  `);
  c.appendChild(overlay);
  iniciarLoginFX(overlay);
  const btn = overlay.querySelector('#login-btn');
  const input = overlay.querySelector('#login-pin');
  const remember = overlay.querySelector('#login-remember');
  const submit = async () => {
    const r = await features.security.verifyPin(input.value);
    if (r.ok) {
      overlay.remove();
      initApp(true);
    } else toast('Senha incorreta', 'danger');
  };
  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  if (remember) remember.addEventListener('click', () => showRecoveryFlow());
  // E-mail de recuperação volta por link (#recuperar) e abre esta tela direto
  try { if (location.hash === '#recuperar') setTimeout(showRecoveryFlow, 250); } catch (e) {}
}

/** Recuperação de senha: verifica o contato cadastrado → código → nova senha. */
async function showRecoveryFlow() {
  const sec = features.security;
  const rec = sec.getRecovery();
  const container = document.querySelector('.ecomim-login');
  if (!rec) {
    container.innerHTML = `<div class="ecomim-login-card">
      <h1 class="login-title">Recuperação indisponível</h1>
      <p class="login-sub">Nenhum contato de recuperação cadastrado. Redefina pela Segurança se conseguir acessar.</p>
      <button class="btn btn-sm btn-block" id="reco-voltar">Voltar</button></div>`;
    container.querySelector('#reco-voltar').addEventListener('click', showLogin);
    return;
  }
  container.innerHTML = `<div class="ecomim-login-card">
      <button class="login-close" id="reco-x" title="Voltar ao login" aria-label="Fechar recuperação">${ICONS.fechar}</button>
      <h1 class="login-title">Recuperar senha</h1>
    <p class="login-sub">Informe seu WhatsApp ou e-mail cadastrado para receber um código de 6 dígitos.</p>
    <input class="input" id="reco-contato" placeholder="WhatsApp ou e-mail" style="margin-bottom:10px" />
    <div id="reco-msg" class="text-muted" style="font-size:12px;min-height:16px;margin-bottom:8px"></div>
    <div class="reco-codigo" style="display:none;margin-bottom:10px">
      <input class="input" id="reco-cod" inputmode="numeric" maxlength="6" placeholder="Código (6 dígitos)" />
      <input class="input" id="reco-nova" type="password" inputmode="numeric" maxlength="6" placeholder="Nova senha (6 números)" style="margin-top:8px" />
      <input class="input" id="reco-repete" type="password" inputmode="numeric" maxlength="6" placeholder="Repita a senha" style="margin-top:8px" />
    </div>
    <button class="btn btn-primary btn-block" id="reco-enviar">Enviar código</button>
    <button class="btn btn-sm btn-block btn-ghost" id="reco-voltar2" style="margin-top:8px">Voltar</button>
  </div>`;
  const contato = container.querySelector('#reco-contato');
  const msg = container.querySelector('#reco-msg');
  const codigoBox = container.querySelector('.reco-codigo');
  const btnEnviar = container.querySelector('#reco-enviar');
  let codigoGerado = null;
  btnEnviar.addEventListener('click', async () => {
    if (!codigoGerado) {
      const r = await sec.requestRecovery(contato.value);
      if (!r.ok) { msg.textContent = r.message || r.code; return; }
      codigoGerado = true;
      codigoBox.style.display = 'block';
      // Envio REAL do código: e-mail (FormSubmit AJAX) ou WhatsApp (wa.me).
      const linkAbrir = (location.origin && location.origin !== 'null')
        ? location.origin + location.pathname
        : location.href.split('#')[0];
      let statusEnvio = '';
      if (r.viaEmail) {
        const send = await sec.enviarCodigoEmail(contato.value.trim(), r.code, linkAbrir);
        if (send.ok) {
          statusEnvio = send.precisaAtivar
            ? 'E-mail de ATIVAÇÃO enviado — confirme uma vez na caixa de entrada e clique em Enviar código de novo.'
            : 'Código ENVIADO por e-mail! Abra a mensagem — nela há o código e o botão para voltar aqui e criar a nova senha.';
        } else {
          statusEnvio = 'Não foi possível falar com o serviço de e-mail agora — use o código exibido abaixo.';
        }
      } else {
        const digits = String(contato.value || '').replace(/\D/g, '');
        const url = sec.linkCodigoWhats(digits, r.code, linkAbrir);
        try { window.open(url, '_blank'); } catch (e) { /* pop-up bloqueado */ }
        statusEnvio = 'WhatsApp aberto com o código pronto — toque em ENVIAR lá e siga as instruções da mensagem.';
      }
      msg.innerHTML = '⭐ ' + esc(statusEnvio) +
        '<br>Código: <b style="font-size:13px">' + esc(r.code) + '</b>' +
        '<br><span class="text-muted">(exibido aqui como reserva — expira em 10 minutos)</span>';
      btnEnviar.textContent = 'Confirmar nova senha';
      return;
    }
    const code = container.querySelector('#reco-cod').value;
    const nova = container.querySelector('#reco-nova').value;
    const repete = container.querySelector('#reco-repete').value;
    if (nova !== repete) { msg.textContent = 'As senhas não conferem.'; return; }
    const rr = await sec.resetPassword(code, nova);
    if (!rr.ok) { msg.textContent = rr.message || rr.code; return; }
    toast('Senha redefinida com sucesso ', 'success');
    showLogin();
  });
  container.querySelector('#reco-voltar2').addEventListener('click', showLogin);
  container.querySelector('#reco-x').addEventListener('click', showLogin);
}

/** Splash de boas-vindas: logo + título + frase motivacional no centro da tela. */
function splashBoasVindas() {
  try {
    const frases = [
      'Cada atendimento bem feito constrói um grande negócio.',
      'Organização hoje é liberdade amanhã.',
      'Grandes empresas nascem de pequenos hábitos diários.',
      'Seu foco de hoje define o seu resultado de amanhã.',
      'Sucesso é a soma de pequenos esforços, todos os dias.',
      'Você construindo, o NEITZEL crescendo com você.'
    ];
    const reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const s = document.createElement('div');
    s.id = 'nz-splash';
    s.innerHTML =
      '<div class="splash-card">' +
        '<div class="splash-logo-wrap">' +
          '<span class="splash-ring r1"></span><span class="splash-ring r2"></span>' +
          '<div class="splash-logo">N</div>' +
        '</div>' +
        '<h2 class="splash-titulo" aria-label="Bem-vindo">' + 'BEM-VINDO'.split('').map((ch, i) =>
          '<span style="animation-delay:' + (0.45 + i * 0.045) + 's">' + ch + '</span>').join('') + '</h2>' +
        '<p class="splash-frase">' + frases[Math.floor(Math.random() * frases.length)] + '</p>' +
        '<div class="splash-bar"><span></span></div>' +
      '</div>';
    document.body.appendChild(s);
    const fechar = () => {
      if (!s.isConnected) return;
      s.classList.add('saindo');
      setTimeout(() => s.remove(), reduz ? 120 : 480);
    };
    s.addEventListener('click', fechar);
    setTimeout(fechar, reduz ? 1600 : 3400);
  } catch (e) { /* nunca bloquear entrada */ }
}

function initApp(fromLogin) {
  // Estado do usuário
  E.db.setUser({ id: 'local', nome: 'Operador', email: 'operador@local', papel: 'admin', orgId: 'org-base' });
  if (fromLogin) splashBoasVindas();
  // Inicializa catálogo de canais de comunicação (antes de qualquer renderização da view)
  if (features.channels) features.channels.load();
  features.extensionBridge.init();
  bindShell();
  refreshNavCounts();
  renderView('dashboard');
}

function bindShell() {
  const shell = document.querySelector('.ecomim-shell');
  if (!shell) return;
  shell.querySelectorAll('[data-action="collapse"]').forEach((b) => b.addEventListener('click', () => {
    document.querySelector('.ecomim-sidebar')?.classList.toggle('collapsed');
  }));
  shell.querySelector('[data-action="mobile-nav"]')?.addEventListener('click', () => {
    document.querySelector('.ecomim-sidebar')?.classList.toggle('mobile-open');
  });
  // Nav items — usa data-view (id canônico), nunca o texto da label
  shell.querySelectorAll('.ecomim-nav-item').forEach((b) => b.addEventListener('click', () => {
    document.querySelector('.ecomim-sidebar')?.classList.remove('mobile-open');
    renderView(b.dataset.view || 'dashboard');
  }));
  // Topbar
  shell.querySelector('#btn-notif')?.addEventListener('click', () => toggleNotifPanel());
  shell.querySelector('#btn-user')?.addEventListener('click', () => openUserMenu());
  shell.querySelector('#btn-tema')?.addEventListener('click', () => toggleTheme());
  // Busca global (topbar) — simples
  const searchBox = shell.querySelector('.topbar-search');
  if (searchBox) {
    const inp = el('input', 'input', '');
    inp.setAttribute ? inp.setAttribute('placeholder', 'Buscar...') : (inp.placeholder = 'Buscar...');
    searchBox.appendChild(inp);
    inp.addEventListener('input', (e) => {
      const term = e.target.value;
      if (term.length >= 2) openCmdk(term);
    });
  }
  // Teclado
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openCmdk(); }
    if (e.key === 'Escape') { closeAllPanels(); }
  });
}

function toggleTheme() {
  const html = document.documentElement;
  const atual = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', atual);
  try { localStorage.setItem('ecomim_theme', atual); } catch (e) {}
  const btn = document.getElementById('btn-tema');
  if (btn) {
    btn.innerHTML = atual === 'dark' ? ICONS.lua : ICONS.sol;
    btn.title = atual === 'dark' ? 'Tema escuro' : 'Tema claro';
  }
}

function applySavedTheme() {
  try {
    const t = localStorage.getItem('ecomim_theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
}

function refreshNavCounts() {
  const counts = {
    fila: E.db.get().fila.length,
    leads: E.db.get().leads.length,
    tarefas: E.modules.tarefas.pendentes().length,
  };
  Object.entries(counts).forEach(([id, n]) => {
    const c = document.querySelector(`[data-count="${id}"]`);
    if (c) c.textContent = n > 0 ? n : '';
  });
  // Badge do sino (não lidas)
  const unread = E.modules.notificacoes.unread().length;
  const dot = document.querySelector('.bell-dot');
  if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
}

/* ------------------------------------------------------------------ *
 * RENDERIZAÇÃO DE VIEWS
 * ------------------------------------------------------------------ */

function renderView(id) {
  ui.view = id;
  document.querySelectorAll('.ecomim-nav-item').forEach((b) => {
    const label = b.querySelector('.nav-label');
    const active = label && (label.textContent.trim().toLowerCase() === id.toLowerCase() || (id === 'dashboard' && label.textContent.trim().toLowerCase() === 'painel'));
    if (active !== undefined) b.classList.toggle('active', !!active);
  });
  // Menu em modo acordeão: grupos só abrem pelo clique do usuário
  // (abrirGrupoDe disponível caso queira reativar a abertura automática).
  const title = VIEWS.find((v) => v.id === id)?.nome || 'Painel';
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = title;
  const content = document.querySelector('.ecomim-content');
  if (!content) return;
  content.dataset.view = id;
  content.innerHTML = '';
  switch (id) {
    case 'dashboard': renderDashboard(content); break;
    case 'leads': renderLeads(content); break;
    case 'funil': renderFunil(content); break;
    case 'cacador': renderCacador(content); break;
    case 'fila': renderFila(content); break;
    case 'planner': renderPlanner(content); break;
    case 'agenda': renderAgenda(content); break;
    case 'servicos': renderServicos(content); break;
    case 'produtos': renderProdutos(content); break;
    case 'estoque': renderEstoque(content); break;
    case 'atendimento_ops': renderAtendimentoOps(content); break;
    case 'financeiro': renderFinanceiro(content); break;
    case 'atendimento': renderAtendimento(content); break;
    case 'clientes': renderClientes(content); break;
    case 'projetos': renderProjetos(content); break;
    case 'marketing': renderMarketing(content); break;
    case 'rh': renderRh(content); break;
    case 'bi': renderBi(content); break;
    case 'inteligencia': renderInteligencia(content); break;
    case 'automacoes': renderAutomacoes(content); break;
    case 'comunicacao': renderComunicacao(content); break;
    case 'acessor': renderAcessor(content); break;
    case 'seu_acessor': if (window.SEU_ACESSOR && window.SEU_ACESSOR.renderSeuAcessor) { window.SEU_ACESSOR.renderSeuAcessor(content); } else content.appendChild(el('div', 'empty', 'Seu Acessor indisponível (seu-acessor.js não carregou).')); break;
    case 'portal': if (window.NEITZEL_PORTAL_ADMIN && window.NEITZEL_PORTAL_ADMIN.render) { window.NEITZEL_PORTAL_ADMIN.render(content); } else content.appendChild(el('div', 'empty', 'Painel do Portal indisponível (portal-admin.js não carregou).')); break;
    case 'memoria': if (window.NEITZEL_MEMORIA && window.NEITZEL_MEMORIA.render) { window.NEITZEL_MEMORIA.render(content); } else content.appendChild(el('div','empty','Memória indisponível (memoria.js não carregou).')); break;
    case 'suporte': if (window.NEITZEL_DIAG && window.NEITZEL_DIAG.render) { window.NEITZEL_DIAG.render(content); } else content.appendChild(el('div','empty','Diagnóstico indisponível (diagnostico.js não carregou).')); break;
    case 'seguranca': renderSeguranca(content); break;
    case 'config': renderConfig(content); break;
  }
}

/* ------------------------------------------------------------------ *
 * VIEW: DASHBOARD
 * ------------------------------------------------------------------ */


/** Fundo digital do Painel: nós conectados discretos atrás dos cards. */
function iniciarDashFX(container) {
  if (!container || container.querySelector('.dash-fx')) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas');
  cv.className = 'dash-fx';
  container.insertBefore(cv, container.firstChild);
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, raf = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  function dim() { W = cv.width = container.clientWidth * dpr; H = cv.height = Math.max(600, container.clientHeight) * dpr; }
  dim();
  const nos = Array.from({ length: 22 }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * .0004, vy: (Math.random() - .5) * .0004 }));
  function frame() {
    if (!cv.isConnected) { cancelAnimationFrame(raf); return; }
    dim();
    const c = document.documentElement.getAttribute('data-theme') === 'light' ? '22,106,67' : '62,207,142';
    ctx.clearRect(0, 0, W, H);
    for (const n of nos) { n.x += n.vx; n.y += n.vy; if (n.x < 0 || n.x > 1) n.vx *= -1; if (n.y < 0 || n.y > 1) n.vy *= -1; }
    ctx.lineWidth = dpr * .6;
    for (let i = 0; i < nos.length; i++) for (let j = i + 1; j < nos.length; j++) {
      const a = nos[i], b = nos[j];
      const dx = (a.x - b.x) * W, dy = (a.y - b.y) * H, dist = Math.hypot(dx, dy), lim = W * .14;
      if (dist < lim) {
        ctx.strokeStyle = 'rgba(' + c + ',' + ((1 - dist / lim) * .07).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(a.x * W, a.y * H); ctx.lineTo(b.x * W, b.y * H); ctx.stroke();
      }
    }
    for (const n of nos) { ctx.fillStyle = 'rgba(' + c + ',.16)'; ctx.beginPath(); ctx.arc(n.x * W, n.y * H, n.r * dpr, 0, 7); ctx.fill(); }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
}

function renderDashboard(c) {
  const b = E.modules.bi;
  const s = E.modules.financeiro.saldo();
  const d = E.db.get();
  // Redesign (prompt item 9): visão geral = Leads, Oportunidades, Vendas,
  // Tarefas pendentes, Agenda e Atendimento — o resto vive nos módulos.
  let agendaHoje = 0;
  try {
    const ops = window.NEITZEL_OPS;
    if (ops && ops.atendimentos && ops.atendimentos.hoje) agendaHoje = ops.atendimentos.hoje().length;
  } catch (e) { /* ops indisponível */ }
  const kpis = [
    { label: 'Leads no funil', valor: d.leads.length, icone: 'leads', cor: 'blue' },
    { label: 'Tarefas pendentes', valor: E.modules.tarefas.pendentes().length, icone: 'fila', cor: 'orange' },
    { label: 'Agenda de hoje', valor: agendaHoje, icone: 'agenda', cor: 'violet' },
    { label: 'MRR', valor: E.fmtMoney(b.mrr()), icone: 'financeiro', cor: 'green' },
    { label: 'Valor em andamento', valor: E.fmtMoney(b.valorPrevisto()), icone: 'bi', cor: 'cyan' },
    { label: 'Tickets abertos', valor: E.modules.atendimento.abertos().length, icone: 'atendimento', cor: 'red' },
  ];
  c.appendChild(el('div', 'page-header', `<h1>Painel do NEITZEL</h1><p>Visão geral da sua operação — todos os dados são reais e locais.</p>`));
  const kpiGrid = el('div', 'kpi-grid', '');
  kpis.forEach((k) => kpiGrid.appendChild(el('div', `card kpi-card kpi-${k.cor}`, `
    <div style="display:flex;align-items:center;gap:10px"><span class="kpi-ico">${ICONS[k.icone] || ''}</span><div><div class="kpi-value">${esc(String(k.valor))}</div><div class="kpi-label">${esc(k.label)}</div></div></div>
  `)));
  c.appendChild(kpiGrid);
  // Fundo digital vivo do Painel (bem sutil, pausa com reduced-motion)
  try { iniciarDashFX(content); } catch (e) {}
  // IA: análise rápida do painel (sempre que o painel abre)
  inlineInsight(panelInsight(d, b, s), 'Leitura rápida da IA');
  // Ações rápidas (logo após a visão geral — ação principal sempre à mão)
  const q = el('div', 'card', `<h4> Ações rápidas</h4><div class="btn-group" style="margin-top:8px"></div>`);
  const qBtns = q.querySelector('.btn-group');
  if (qBtns) {
    const hBtn = el('button', 'btn btn-sm btn-primary', 'Caçador de Leads');
    if (hBtn.addEventListener) hBtn.addEventListener('click', () => { if (window.ECOMIM_HUNTER) window.ECOMIM_HUNTER.init(); renderView('cacador'); });
    qBtns.appendChild(hBtn);
    [['Novo lead', () => openLeadModal()], [' Nova tarefa', () => openTarefaModal()], ['Assistente IA', () => toggleAiPanel()], ['Importar backup', () => openImportModal()]].forEach(([label, fn]) => {
      const b2 = el('button', 'btn btn-sm', esc(label));
      if (b2.addEventListener) b2.addEventListener('click', fn);
      qBtns.appendChild(b2);
    });
  }
  c.appendChild(q);
  // Prioridades de hoje (atividade que precisa de atenção agora)
  const alertas = [];
  if (d.fila.length) alertas.push(` ${d.fila.length} lead(s) aguardando aprovação na fila`);
  if (s.aReceber > 0) alertas.push(` ${E.fmtMoney(s.aReceber)} a receber (${E.modules.financeiro.vencidas().length} vencidas)`);
  if (b.mrr() === 0) alertas.push('Nenhuma receita recorrente (MRR) cadastrada');
  if (E.modules.atendimento.slaEmRisco().length) alertas.push(' SLA estourado em atendimentos');
  if (E.modules.projetos.atrasados().length) alertas.push(` ${E.modules.projetos.atrasados().length} projetos atrasados`);
  if (alertas.length) {
    const box = el('div', 'card', `<h4> Prioridades de hoje</h4>`);
    alertas.slice(0, 5).forEach((a) => box.appendChild(el('div', 'text-muted', esc(a))));
    c.appendChild(box);
  }
  // Gráfico do funil
  const funil = E.modules.bi.funnelCounts();
  const total = d.leads.length || 1;
  const funnelBox = el('div', 'card', `<h4> Funil</h4><div class="funnel" style="margin-top:8px"></div>`);
  d.funil.forEach((f) => {
    const n = funil[f.id] || 0;
    const pct = Math.round((n / total) * 100);
    const row = el('div', 'funnel-row', '');
    const bar = el('div', 'funnel-bar', `${pct}%`);
    row.appendChild(el('div', 'funnel-label', esc(f.nome)));
    row.appendChild(bar);
    bar.style.width = Math.max(4, pct) + '%';
    bar.style.background = f.cor;
    row.appendChild(el('div', 'funnel-count', String(n)));
    const funnelEl = funnelBox.querySelector('.funnel');
    if (funnelEl) funnelEl.appendChild(row);
  });
  c.appendChild(funnelBox);
}

/* ------------------------------------------------------------------ *
 * VIEW: LEADS
 * ------------------------------------------------------------------ */

function renderLeads(c) {
  const box = el('div', '', '');
  const etapaNome2 = (id) => (d().funil.find((f) => f.id === id) || {}).nome || id;
  const header = el('div', 'page-header', `<h1>Leads & CRM</h1><p>${d().leads.length} leads · clique para abrir a ficha.</p><div style="margin-top:8px"><button class="btn btn-primary btn-sm" id="btn-novo-lead">Novo lead</button></div>`);
  box.appendChild(header);
  const grid = el('div', 'card', '');
  const table = el('table', 'table', `<thead><tr><th>Nome</th><th>Etapa</th><th>Cidade</th><th>Valor</th><th>Score</th><th>Origem</th></tr></thead><tbody></tbody>`);
  const tbody = table.querySelector('tbody');
  if (tbody) {
    d().leads.slice(0, 100).forEach((l) => {
      const tr = el('tr', 'lead-row', '');
      tr.innerHTML = `<td><b>${esc(l.nome || l.empresa || '—')}</b><div class="text-muted">${esc(l.empresa || '')}${l.whats ? ' ·  ' + esc(l.whats) : ''}</div></td><td>${esc(etapaNome2(l.etapa))}</td><td>${esc(l.cidade || '')}</td><td>${E.fmtMoney(l.valor)}</td><td>${l.score != null ? l.score : ''}</td><td>${esc(l.origem || '')}</td>`;
      if (tr.addEventListener) tr.addEventListener('click', () => openLeadDetail(l.id));
      tbody.appendChild(tr);
    });
  }
  grid.appendChild(table);
  box.appendChild(grid);
  c.appendChild(box);
}

function d() { return E.db.get(); }

/** Análise rápida gerada pela IA a partir dos dados reais do painel. */
function panelInsight(d, b, s) {
  const linhas = [];
  const fila = d.fila.length;
  const leads = d.leads.length;
  const aReceber = s.aReceber;
  const vencidasCount = E.modules.financeiro.vencidas().length;
  const slaRisco = E.modules.atendimento.slaEmRisco().length;
  const atrasados = E.modules.projetos.atrasados().length;
  if (fila > 0) linhas.push(` **${fila} lead(s)** aguardam aprovação na fila — revisar agora acelera seu funil.`);
  if (vencidasCount > 0) linhas.push(` **${vencidasCount} conta(s) vencida(s)** somando ${E.fmtMoney(aReceber)} a receber — priorize cobrança.`);
  if (slaRisco > 0) linhas.push(` **${slaRisco} atendimento(s)** com SLA em risco — precisa de resposta urgente.`);
  if (atrasados > 0) linhas.push(` **${atrasados} projeto(s) atrasado(s)** — verifique prazos para evitar retrabalho.`);
  if (leads === 0) linhas.push(' Sem leads ainda: use o **Caçador de Leads** para capturar contatos públicos e alimentar o funil.');
  if (b.mrr() === 0) linhas.push(' MRR zerado: cadastre clientes com planos recorrentes para gerar receita previsível.');
  if (!linhas.length) return 'Tudo tranquilo! Nenhuma pendência crítica no momento. Aproveite para revisar o funil ou usar o Caçador de Leads. ';
  return linhas.join('\n');
}

function openLeadModal() {
  const modal = el('div', 'modal', `
    <div class="modal-box">
      <h3>Novo lead</h3>
      <div class="form-grid">
        <label>Nome <input class="input" id="m-nome" /></label>
        <label>Empresa <input class="input" id="m-empresa" /></label>
        <label>Telefone/Whats <input class="input" id="m-telefone" /></label>
        <label>E-mail <input class="input" id="m-email" /></label>
        <label>Cidade <input class="input" id="m-cidade" /></label>
        <label>UF <input class="input" id="m-uf" maxlength="2" /></label>
        <label>Segmento <input class="input" id="m-segmento" /></label>
        <label>Valor estimado (R$) <input class="input" id="m-valor" inputmode="decimal" /></label>
        <label>Origem <select class="input" id="m-origem">${['manual','agente','google','maps','instagram','facebook','linkedin','diretorios','site','importacao'].map((o) => `<option value="${o}">${o}</option>`).join('')}</select></label>
        <label>Observações <textarea class="input" id="m-desc" rows="2"></textarea></label>
      </div>
      <label style="display:flex;align-items:center;gap:6px;margin-top:8px"><input type="checkbox" id="m-consentimento" checked /> Consentimento LGPD registrado</label>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="m-salvar">Salvar</button></div>
    </div>
  `);
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
  modal.querySelector('#m-salvar').addEventListener('click', () => {
    const dados = {
      nome: modal.querySelector('#m-nome').value,
      empresa: modal.querySelector('#m-empresa').value,
      telefone: modal.querySelector('#m-telefone').value,
      email: modal.querySelector('#m-email').value,
      cidade: modal.querySelector('#m-cidade').value,
      uf: modal.querySelector('#m-uf').value,
      segmento: modal.querySelector('#m-segmento').value,
      valor: parseBRLNumber(modal.querySelector('#m-valor').value),
      origem: modal.querySelector('#m-origem').value || 'manual',
      desc: modal.querySelector('#m-desc').value,
      consentimento: modal.querySelector('#m-consentimento').checked,
    };
    if (!dados.nome.trim() && !dados.telefone.trim() && !dados.email.trim()) {
      toast('Informe ao menos nome ou um contato', 'warn');
      return;
    }
    const res = E.modules.leads.addLead(dados);
    if (!res.ok) toast(res.message || `Não foi possível salvar (${res.code})`, 'danger');
    else {
      toast('Lead criado ', 'success');
      modal.remove();
      renderView('leads');
      inlineInsight(` **${res.lead.nome || res.lead.empresa || 'Lead'}** criado na etapa "${(d().funil.find((f) => f.id === res.lead.etapa) || {}).nome || res.lead.etapa}".\nScore atual: **${E.modules.leads.scoring(res.lead).score}/100**.\nSugestão: use o botão ** Sugerir follow-up** na ficha do lead para redigir o primeiro contato com a IA.`);
    }
  });
}

function openLeadDetail(id) {
  document.querySelectorAll('.lead-detail-panel').forEach((p) => p.remove());
  const l = d().leads.find((x) => x.id === id);
  if (!l) return;
  const panel = el('div', 'lead-detail-panel open', '');
  const score = E.modules.leads.scoring(l);
  panel.innerHTML = `
    <div class="ldp-header">
      <div style="flex:1">
        <h3>${esc(l.nome || l.empresa || '—')}</h3>
        <div class="text-muted">${esc(l.empresa || '')} · ${esc(l.cidade || '')} ${esc(l.uf || '')}</div>
      </div>
      <button class="btn btn-icon" data-close title="Fechar" aria-label="Fechar">${ICONS.fechar}</button>
    </div>
    <div class="ldp-body">
      <div class="ldp-section"><h4>Dados</h4>
        <div class="ldp-field"><span class="k">Etapa:</span><span>${esc(l.etapa)}</span></div>
        <div class="ldp-field"><span class="k">Telefone:</span><span>${esc(l.telefone || '—')}</span></div>
        <div class="ldp-field"><span class="k">WhatsApp:</span><span>${esc(l.whats || '—')}</span></div>
        <div class="ldp-field"><span class="k">E-mail:</span><span>${esc(l.email || '—')}</span></div>
        <div class="ldp-field"><span class="k">Valor:</span><span>${E.fmtMoney(l.valor)}</span></div>
        <div class="ldp-field"><span class="k">Score:</span><span>${score.score}/100 <span class="text-muted">(${score.reasons.join(', ')})</span></span></div>
        <div class="ldp-field"><span class="k">Origem:</span><span>${esc(l.origem || '—')}</span></div>
        <div class="ldp-field"><span class="k">Consentimento:</span><span>${l.consentimento ? ' registrado' : ' ausente'}</span></div>
      </div>
      <div class="ldp-section"><h4>Histórico</h4><div class="ldp-timeline">${(l.hist || []).slice().reverse().map((h) => `<div class="tl-item"><div class="tl-time">${E.fmtDateTime(h.at)}</div><div>${esc(h.desc || h.tipo)}</div></div>`).join('') || '<div class="text-muted">Sem histórico</div>'}</div></div>
      <div class="ldp-section">
        <div class="btn-group">
          <button class="btn btn-sm" data-followup>Sugerir follow-up</button>
          <button class="btn btn-sm btn-success" data-whats>WhatsApp</button>
          <button class="btn btn-sm btn-ghost" data-etapa>Mover etapa</button>
          <button class="btn btn-sm btn-danger" data-excluir>Excluir lead</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  const closeBtn = panel.querySelector('[data-close]');
  if (closeBtn) closeBtn.addEventListener('click', () => panel.remove());
  const whatsBtn = panel.querySelector('[data-whats]');
  if (whatsBtn) whatsBtn.addEventListener('click', () => {
    if (l.whats) { window.open(`https://wa.me/55${l.whats}`, '_blank'); }
    else toast('Sem WhatsApp registrado', 'warn');
  });
  const fuBtn = panel.querySelector('[data-followup]');
  if (fuBtn) fuBtn.addEventListener('click', () => {
    const r = E.modules.ia.suggestFollowUp(l.id);
    if (r.ok && r.msg) { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(r.msg); toast('Mensagem copiada — ' + r.msg, 'success'); }
  });
  const etapaBtn = panel.querySelector('[data-etapa]');
  if (etapaBtn) etapaBtn.addEventListener('click', () => {
    const etapas = d().funil.map((f) => `<option value="${f.id}" ${f.id === l.etapa ? 'selected' : ''}>${esc(f.nome)}</option>`).join('');
    const modal = el('div', 'modal', `<div class="modal-box"><h3>Mover etapa</h3><select class="input" id="mv-etapa">${etapas}</select><div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="mv-salvar">Mover</button></div></div>`);
    document.body.appendChild(modal);
    const modalClose = modal.querySelector('[data-close]');
    if (modalClose) modalClose.addEventListener('click', () => modal.remove());
    const mvSalvar = modal.querySelector('#mv-salvar');
    if (mvSalvar) mvSalvar.addEventListener('click', () => {
      const mvEtapa = modal.querySelector('#mv-etapa');
      const r = E.modules.leads.moveStage(l.id, mvEtapa ? mvEtapa.value : 'novo', 'Movido manualmente');
      if (r.ok) { toast('Lead movido', 'success'); modal.remove(); panel.remove(); renderView('leads'); }
    });
  });
  // Exclusão de lead — ação crítica: confirmação explícita + motivo + auditoria (LGPD)
  const excluirBtn = panel.querySelector('[data-excluir]');
  if (excluirBtn) excluirBtn.addEventListener('click', () => {
    const modal = el('div', 'modal', `
      <div class="modal-box">
        <h3>Excluir lead</h3>
        <p class="text-muted" style="margin-bottom:12px">Esta ação é permanente e fica registrada na auditoria (LGPD). O lead <b>${esc(l.nome || l.empresa || '')}</b> será removido do sistema.</p>
        <label>Motivo da exclusão (obrigatório)</label>
        <select class="input" id="ex-motivo" style="margin-bottom:10px">
          <option value="">Selecione o motivo...</option>
          <option value="duplicado">Registro duplicado</option>
          <option value="desinteresse">Sem interesse / não responde</option>
          <option value="solicitacao">Solicitação do titular (LGPD)</option>
          <option value="dados_invalidos">Dados inválidos</option>
          <option value="outros">Outros</option>
        </select>
        <label>Observações</label>
        <textarea class="input" id="ex-obs" rows="2" placeholder="Detalhe o motivo (opcional)"></textarea>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-close>Cancelar</button>
          <button class="btn btn-danger" id="ex-confirmar">Excluir definitivamente</button>
        </div>
      </div>
    `);
    document.body.appendChild(modal);
    const modalClose = modal.querySelector('[data-close]');
    if (modalClose) modalClose.addEventListener('click', () => modal.remove());
    const exConf = modal.querySelector('#ex-confirmar');
    if (exConf) exConf.addEventListener('click', () => {
      const motivo = modal.querySelector('#ex-motivo').value;
      const obs = modal.querySelector('#ex-obs').value.trim();
      if (!motivo) { toast('Selecione o motivo da exclusão.', 'warn'); return; }
      const r = E.modules.leads.deleteLead(l.id, (motivo + (obs ? ' — ' + obs : '')));
      if (r.ok) {
        toast('Lead excluído. Ação registrada na auditoria.', 'success');
        modal.remove();
        panel.remove();
        renderView('leads');
      } else toast('Não foi possível excluir: ' + (r.message || 'erro desconhecido'), 'danger');
    });
  });
}

/* ------------------------------------------------------------------ *
 * VIEW: FUNIL (kanban com drag & drop)
 * ------------------------------------------------------------------ */

function renderFunil(c) {
  const head = el('div', 'page-header', `<h1>Funil de vendas</h1><p>Arraste os cards entre etapas — tudo fica registrado no histórico.</p>`);
  c.appendChild(head);
  const kanban = el('div', 'kanban', '');
  d().funil.forEach((f) => {
    const col = el('div', 'kanban-col', '');
    col.dataset.stage = f.id;
    col.appendChild(el('div', 'kanban-col-head', `<span class="dot" style="background:${f.cor}"></span><span>${esc(f.nome)}</span><span class="count">${d().leads.filter((l) => l.etapa === f.id).length}</span>`));
    d().leads.filter((l) => l.etapa === f.id).forEach((l) => {
      const card = el('div', 'kanban-card', `<div class="kc-name">${esc(l.nome || l.empresa || '—')}</div><div class="kc-meta"><span>${esc(l.empresa || '')}</span><span>${E.fmtMoney(l.valor)}</span></div>`);
      card.draggable = true;
      card.dataset.lead = l.id;
      card.addEventListener('dragstart', () => card.classList.add('dragging'));
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('click', () => openLeadDetail(l.id));
      col.appendChild(card);
    });
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop-target'); });
    col.addEventListener('dragleave', () => col.classList.remove('drop-target'));
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('drop-target');
      const card = col.querySelector('.kanban-card.dragging');
      if (card) {
        const res2m = E.modules.leads.moveStage(card.dataset.lead, f.id, 'Movido via drag & drop');
        if (res2m.ok) {
          renderFunil(document.querySelector('.ecomim-content'));
          const l2 = d().leads.find((x) => x.id === card.dataset.lead);
          if (l2) {
            inlineInsight(f.id === 'ganho'
              ? ` **${l2.nome || l2.empresa || 'Lead'}** ganho! Valor: ${E.fmtMoney(l2.valor)}.\nRegistre a cobrança em Financeiro (contas a receber) para acompanhar o recebimento.`
              : f.id === 'perdido'
                ? ` **${l2.nome || l2.empresa || 'Lead'}** marcado como perdido.\nReveja o motivo (histórico da ficha) e considere reativar depois — leads perdidos podem voltar.`
                : ` **${l2.nome || l2.empresa || 'Lead'}** movido para "${f.nome}".\nPróximo passo: ${f.id === 'contato' ? 'qualificar o contato e registrar os dados coletados.' : f.id === 'qualificado' ? 'montar a proposta com valores reais.' : f.id === 'proposta' ? 'acompanhar o envio e preparar a negociação.' : 'manter o lead aquecido com follow-ups.'}`);
          }
        }
      }
    });
    kanban.appendChild(col);
  });
  c.appendChild(kanban);
}

/* ------------------------------------------------------------------ *
 * VIEW: CAÇADOR DE LEADS (delegada ao hunter-ui.js)
 * ------------------------------------------------------------------ */

function renderCacador(c) {
  if (window.ECOMIM_APP_HUNTER) {
    window.ECOMIM_APP_HUNTER.renderCacador(c, { reexibir: true });
    return;
  }
  c.appendChild(el('div', 'empty', 'Caçador de Leads indisponível (hunter-ui.js não carregou).'));
}

/* ------------------------------------------------------------------ *
 * VIEWS OPERACIONAIS (delegadas a operacional-ui.js: Expansão)
 * ------------------------------------------------------------------ */

function renderPlanner(c) {
  if (window.NEITZEL_OPS_UI && window.NEITZEL_OPS_UI.renderPlanner) { window.NEITZEL_OPS_UI.renderPlanner(c); return; }
  c.appendChild(el('div', 'empty', 'Planner indisponível (operacional-ui.js não carregou).'));
}
function renderServicos(c) {
  if (window.NEITZEL_OPS_UI && window.NEITZEL_OPS_UI.renderServicos) { window.NEITZEL_OPS_UI.renderServicos(c); return; }
  c.appendChild(el('div', 'empty', 'Serviços indisponível (operacional-ui.js não carregou).'));
}
function renderProdutos(c) {
  if (window.NEITZEL_OPS_UI && window.NEITZEL_OPS_UI.renderProdutos) { window.NEITZEL_OPS_UI.renderProdutos(c); return; }
  c.appendChild(el('div', 'empty', 'Produtos indisponível (operacional-ui.js não carregou).'));
}
function renderEstoque(c) {
  if (window.NEITZEL_OPS_UI && window.NEITZEL_OPS_UI.renderEstoque) { window.NEITZEL_OPS_UI.renderEstoque(c); return; }
  c.appendChild(el('div', 'empty', 'Estoque indisponível (operacional-ui.js não carregou).'));
}
function renderAtendimentoOps(c) {
  if (window.NEITZEL_OPS_UI && window.NEITZEL_OPS_UI.renderAtendimentoOps) { window.NEITZEL_OPS_UI.renderAtendimentoOps(c); return; }
  c.appendChild(el('div', 'empty', 'Atendimento indisponível (operacional-ui.js não carregou).'));
}

/* ------------------------------------------------------------------ *
 * VIEW: CENTRO DE INTELIGÊNCIA (Agente Supervisor — inteligencia.js)
 * ------------------------------------------------------------------ */

function renderInteligencia(c) {
  if (window.NEITZEL_IA && window.NEITZEL_IA.renderInteligencia) { window.NEITZEL_IA.renderInteligencia(c); return; }
  c.appendChild(el('div', 'empty', 'Centro de Inteligência indisponível (inteligencia.js não carregou).'));
}

/* ------------------------------------------------------------------ *
 * VIEW: ACESSOR WHATSAPP (configuração do Acessor — acessor.js)
 * ------------------------------------------------------------------ */

function renderAcessor(c) {
  if (window.NEITZEL_ACESSOR && window.NEITZEL_ACESSOR.renderAcessor) { window.NEITZEL_ACESSOR.renderAcessor(c); return; }
  c.appendChild(el('div', 'empty', 'Acessor indisponível (acessor.js não carregou).'));
}

/* ------------------------------------------------------------------ *
 * VIEW: FILA
 * ------------------------------------------------------------------ */

function renderFila(c) {
  const itens = d().fila;
  c.appendChild(el('div', 'page-header', `<h1>Fila de aprovação</h1><p>${itens.length} aguardando revisão — revise e aprove (nada é aprovado sem você).</p><div style="margin-top:8px"><button class="btn btn-sm" id="btn-encaminhar">Encaminhar lead</button></div>`));
  const grid = el('div', 'card', '');
  if (!itens.length) grid.appendChild(el('div', 'empty', 'Fila vazia. Encaminhe contatos reais encontrados nas varreduras. '));
  itens.forEach((f) => {
    const card = el('div', 'fila-card', `
      <div class="fila-head"><b>${esc(f.nome || f.empresa || '—')}</b><span class="badge badge-${f.fonte || 'manual'}">${esc(f.fonte || f.origem || '')}</span></div>
      <div class="fila-meta">${esc(f.telefone || '')} ${esc(f.email || '')} · ${esc(f.cidade || '')}</div>
      <div class="btn-group" style="margin-top:6px">
        <button class="btn btn-sm btn-success" data-aprovar> Aprovar</button>
        <button class="btn btn-sm btn-danger" data-rejeitar> Recusar</button>
      </div>
    `);
    const aprovarBtn = card.querySelector('[data-aprovar]');
    const rejeitarBtn = card.querySelector('[data-rejeitar]');
    if (aprovarBtn) aprovarBtn.addEventListener('click', () => {
      const r = E.modules.leads.approveQueueItem(f.id);
      if (r.ok) {
        toast('Lead aprovado e no CRM ', 'success');
        renderFila(document.querySelector('.ecomim-content'));
        inlineInsight(`**${f.nome || f.empresa || 'Lead'}** entrou no CRM na etapa "${(d().funil.find((x) => x.id === 'novo') || {}).nome || 'novo'}".\nPróximo passo sugerido: fazer o primeiro contato (a IA pode redigir a mensagem na ficha do lead — botão " Sugerir follow-up").`);
      }
      else toast('Falha: ' + (r.code || 'erro'), 'danger');
    });
    if (rejeitarBtn) rejeitarBtn.addEventListener('click', () => {
      E.modules.leads.rejectQueueItem(f.id);
      toast('Lead recusado', 'info');
      renderFila(document.querySelector('.ecomim-content'));
      inlineInsight(`**${f.nome || f.empresa || 'Lead'}** foi recusado e removido da fila.\nDica: se houver muitos recusados do mesmo segmento, ajuste os filtros do Caçador de Leads para capturar contatos mais qualificados.`);
    });
    grid.appendChild(card);
  });
  c.appendChild(grid);
  c.querySelector('#btn-encaminhar')?.addEventListener('click', () => openEncaminharModal());
}

function openEncaminharModal() {
  const modal = el('div', 'modal', `
    <div class="modal-box">
      <h3>Encaminhar lead</h3>
      <div class="form-grid">
        <label>Nome <input class="input" id="e-nome" /></label>
        <label>Empresa <input class="input" id="e-empresa" /></label>
        <label>Telefone <input class="input" id="e-telefone" /></label>
        <label>E-mail <input class="input" id="e-email" /></label>
        <label>Cidade <input class="input" id="e-cidade" /></label>
        <label>Segmento <input class="input" id="e-segmento" /></label>
        <label>Valor (R$) <input class="input" id="e-valor" inputmode="decimal" /></label>
        <label>Fonte <input class="input" id="e-fonte" placeholder="ex.: Google Maps" /></label>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="e-salvar">Enviar para a fila</button></div>
    </div>
  `);
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
  modal.querySelector('#e-salvar').addEventListener('click', () => {
    const r = E.modules.leads.addToQueue({
      nome: modal.querySelector('#e-nome').value,
      empresa: modal.querySelector('#e-empresa').value,
      telefone: modal.querySelector('#e-telefone').value,
      email: modal.querySelector('#e-email').value,
      cidade: modal.querySelector('#e-cidade').value,
      segmento: modal.querySelector('#e-segmento').value,
      valor: parseBRLNumber(modal.querySelector('#e-valor').value),
      origem: 'manual',
      fonte: modal.querySelector('#e-fonte').value || 'manual',
      consentimento: true,
    });
    if (!r.ok) toast(r.code === 'DUPLICADO_FILA' ? 'Já está na fila (duplicado)' : 'Falha ao encaminhar', 'warn');
    else { toast('Na fila para aprovação ', 'success'); modal.remove(); renderView('fila'); }
  });
}

/* ------------------------------------------------------------------ *
 * VIEW: AGENDA
 * ------------------------------------------------------------------ */

function renderAgenda(c) {
  const hoje = E.modules.agenda.today();
  c.appendChild(el('div', 'page-header', `<h1>Agenda</h1><p>${hoje.length} evento(s) hoje.</p><div style="margin-top:8px"><button class="btn btn-primary btn-sm" id="btn-agenda-novo">Novo evento</button></div>`));
  const list = el('div', 'card', '');
  E.modules.agenda.events.sort((a, b) => new Date(a.quando) - new Date(b.quando)).forEach((ev) => {
    const item = el('div', 'agenda-item', `
      <div class="agenda-time">${E.fmtTime(ev.quando)}</div>
      <div class="agenda-body"><b>${esc(ev.titulo)}</b><div class="text-muted">${esc(ev.tipo || '')} ${ev.local ? '· ' + esc(ev.local) : ''}</div></div>
      <button class="btn btn-xs btn-ghost" data-remove title="Remover" aria-label="Remover">Remover</button>
    `);
    const rmBtn = item.querySelector('[data-remove]');
    if (rmBtn) rmBtn.addEventListener('click', () => {
      E.modules.agenda.remove(ev.id);
      renderAgenda(document.querySelector('.ecomim-content'));
    });
    list.appendChild(item);
  });
  if (!E.modules.agenda.events.length) list.appendChild(el('div', 'empty', 'Sem eventos. Adicione reuniões, ligações e lembretes.'));
  c.appendChild(list);
  c.querySelector('#btn-agenda-novo')?.addEventListener('click', () => openAgendaModal());
}

function openAgendaModal() {
  const modal = el('div', 'modal', `
    <div class="modal-box">
      <h3> Novo evento</h3>
      <div class="form-grid">
        <label>Título <input class="input" id="a-titulo" /></label>
        <label>Tipo <select class="input" id="a-tipo"><option value="evento">Evento</option><option value="tarefa">Tarefa</option><option value="reuniao">Reunião</option><option value="visita">Visita</option><option value="ligacao">Ligação</option><option value="lembrete">Lembrete</option></select></label>
        <label>Data <input class="input" type="date" id="a-data" /></label>
        <label>Hora <input class="input" type="time" id="a-hora" value="09:00" /></label>
        <label>Local <input class="input" id="a-local" /></label>
        <label>Descrição <input class="input" id="a-desc" /></label>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="a-salvar">Salvar</button></div>
    </div>
  `);
  document.body.appendChild(modal);
  const hoje = new Date();
  modal.querySelector('#a-data').value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
  modal.querySelector('#a-salvar').addEventListener('click', () => {
    const data = modal.querySelector('#a-data').value;
    const hora = modal.querySelector('#a-hora').value || '09:00';
    if (!data) { toast('Informe uma data', 'warn'); return; }
    const quando = new Date(`${data}T${hora}`).toISOString();
    const r = E.modules.agenda.add({
      titulo: modal.querySelector('#a-titulo').value,
      tipo: modal.querySelector('#a-tipo').value,
      quando,
      local: modal.querySelector('#a-local').value,
      desc: modal.querySelector('#a-desc').value,
    });
    if (!r.ok) toast('Falha ao salvar', 'danger');
    else {
      toast('Evento agendado ', 'success');
      modal.remove();
      renderView('agenda');
      const hoje2 = E.modules.agenda.today();
      inlineInsight(` Compromisso **${r.item.titulo || ''}** agendado (${E.fmtDate(r.item.quando)} às ${E.fmtTime(r.item.quando)}).\nAgenda do dia: **${hoje2.length}** compromisso(s).\nDica: registre também tarefas de preparação para não chegar despreparado.`);
    }
  });
}

/* ------------------------------------------------------------------ *
 * VIEW: FINANCEIRO
 * ------------------------------------------------------------------ */

function renderFinanceiro(c) {
  const s = E.modules.financeiro.saldo();
  c.appendChild(el('div', 'page-header', `<h1>Financeiro</h1><p>Contas a receber e a pagar — valores em centavos, totais recalculados.</p><div style="margin-top:8px"><button class="btn btn-primary btn-sm" id="btn-fin-novo">Nova conta</button></div>`));
  const kpis = el('div', 'kpi-grid', '');
  [['A receber', E.fmtMoney(s.aReceber), 'green'], ['A pagar', E.fmtMoney(s.aPagar), 'red'], ['Recebido', E.fmtMoney(s.recebido), 'cyan'], ['Pago', E.fmtMoney(s.pago), 'violet']].forEach(([l, v, cor]) => {
    kpis.appendChild(el('div', `card kpi-card kpi-${cor}`, `<div class="kpi-value">${v}</div><div class="kpi-label">${l}</div>`));
  });
  c.appendChild(kpis);
  const table = el('table', 'table', `<thead><tr><th>Descrição</th><th>Tipo</th><th>Vencimento</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody></tbody>`);
  const tbody2 = table.querySelector('tbody');
  if (tbody2) {
    E.modules.financeiro.contas.sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento)).forEach((co) => {
      const tr = el('tr', '', '');
      tr.innerHTML = `<td><b>${esc(co.descricao || '—')}</b></td><td>${co.tipo === 'receber' ? ' Receber' : ' Pagar'}</td><td>${E.fmtDate(co.vencimento)}</td><td>${E.fmtMoney(co.valor)}</td><td><span class="badge badge-${co.status === 'pago' ? 'green' : 'orange'}">${co.status}</span></td><td><button class="btn btn-xs" data-pagar>${co.status === 'pago' ? '—' : 'Marcar pago'}</button></td>`;
      const pagarBtn = tr.querySelector('[data-pagar]');
      if (pagarBtn) pagarBtn.addEventListener('click', () => {
        if (co.status !== 'pago') {
          E.modules.financeiro.updateConta(co.id, { status: 'pago', pagoEm: E.nowISO() });
          toast('Pagamento registrado ', 'success');
          renderView('financeiro');
          const s2 = E.modules.financeiro.saldo();
          inlineInsight(` Movimentação registrada: **${co.descricao || 'conta'}** (${E.fmtMoney(co.valor)}).\nNovo saldo do caixa: **${E.fmtMoney(s2.saldo)}** · A receber: **${E.fmtMoney(s2.aReceber)}** · A pagar: **${E.fmtMoney(s2.aPagar)}**.\nDica: ${s2.aPagar > 0 ? `há ${E.modules.financeiro.vencidas().length} conta(s) vencida(s) para regularizar.` : 'sem contas vencidas no momento. Continue acompanhando o fluxo de caixa.'}`);
        }
      });
      tbody2.appendChild(tr);
    });
  }
  c.appendChild(table);
  c.querySelector('#btn-fin-novo')?.addEventListener('click', () => openContaModal());
}

function openContaModal() {
  const modal = el('div', 'modal', `
    <div class="modal-box">
      <h3>Nova conta</h3>
      <div class="form-grid">
        <label>Descrição <input class="input" id="f-desc" /></label>
        <label>Tipo <select class="input" id="f-tipo"><option value="receber">A receber</option><option value="pagar">A pagar</option></select></label>
        <label>Valor (R$) <input class="input" id="f-valor" inputmode="decimal" /></label>
        <label>Vencimento <input class="input" type="date" id="f-venc" /></label>
        <label>Cliente/Fornecedor <input class="input" id="f-cliente" /></label>
        <label>Categoria <input class="input" id="f-cat" /></label>
        <label>Forma de pagamento <select class="input" id="f-forma"><option value="pix">PIX</option><option value="boleto">Boleto</option><option value="cartao">Cartão</option><option value="transferencia">Transferência</option><option value="dinheiro">Dinheiro</option><option value="outro">Outro</option></select></label>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="f-salvar">Salvar</button></div>
    </div>
  `);
  document.body.appendChild(modal);
  const hoje = new Date();
  modal.querySelector('#f-venc').value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
  modal.querySelector('#f-salvar').addEventListener('click', () => {
    const r = E.modules.financeiro.addConta({
      descricao: modal.querySelector('#f-desc').value,
      tipo: modal.querySelector('#f-tipo').value,
      valor: parseBRLNumber(modal.querySelector('#f-valor').value),
      vencimento: new Date(`${modal.querySelector('#f-venc').value}T12:00`).toISOString(),
      cliente: modal.querySelector('#f-cliente').value,
      categoria: modal.querySelector('#f-cat').value,
      formaPagamento: modal.querySelector('#f-forma').value,
    });
    if (!r.ok) toast('Falha: ' + (r.code || 'erro'), 'danger');
    else { toast('Conta criada ', 'success'); modal.remove(); renderView('financeiro'); }
  });
}

/* ------------------------------------------------------------------ *
 * VIEW: ATENDIMENTO
 * ------------------------------------------------------------------ */

function renderAtendimento(c) {
  const a = E.modules.atendimento;
  c.appendChild(el('div', 'page-header', `<h1>Atendimento</h1><p>${a.abertos().length} abertos · ${a.slaEmRisco().length} em risco de SLA.</p><div style="margin-top:8px"><button class="btn btn-primary btn-sm" id="btn-ticket-novo">Novo ticket</button></div>`));
  const grid = el('div', 'card', '');
  a.tickets.forEach((t) => {
    const card = el('div', 'ticket-card', `
      <div class="ticket-head"><b>${esc(t.protocolo)}</b> <span class="badge badge-${t.prioridade}">${esc(t.prioridade)}</span> ${t.status === 'novo' && new Date(t.slaDeadline) < new Date() ? '<span class="badge badge-red">SLA </span>' : ''}</div>
      <div class="ticket-title">${esc(t.titulo)}</div>
      <div class="text-muted">${esc(t.cliente || '')} · ${esc(t.canal || '')} · ${esc(t.status || '')}</div>
      <div class="btn-group" style="margin-top:6px"><button class="btn btn-sm" data-abrir>Ver</button><button class="btn btn-sm btn-success" data-fechar>Fechar</button></div>
    `);
    const abrirBtn = card.querySelector('[data-abrir]');
    const fecharBtn = card.querySelector('[data-fechar]');
    if (abrirBtn) abrirBtn.addEventListener('click', () => openTicketDetail(t.id));
    if (fecharBtn) fecharBtn.addEventListener('click', () => {
      a.updateTicket(t.id, { status: 'fechado' });
      toast('Ticket fechado', 'success');
      renderView('atendimento');
      inlineInsight(` Ticket **${t.protocolo}** (${t.titulo}) encerrado.\nAvaliação recomendada: verifique se o cliente respondeu bem e aproveite para registrar nota de satisfação na ficha do ticket — a IA pode sugerir um follow-up de pós-atendimento.`);
    });
    grid.appendChild(card);
  });
  if (!a.tickets.length) grid.appendChild(el('div', 'empty', 'Sem tickets ainda. Crie um para começar a atender.'));
  c.appendChild(grid);
  c.querySelector('#btn-ticket-novo')?.addEventListener('click', () => openTicketModal());
}

function openTicketModal() {
  const modal = el('div', 'modal', `
    <div class="modal-box">
      <h3>Novo ticket</h3>
      <div class="form-grid">
        <label>Título <input class="input" id="t-titulo" /></label>
        <label>Cliente <input class="input" id="t-cliente" /></label>
        <label>Canal <select class="input" id="t-canal"><option value="web">Site/Web</option><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option><option value="telefone">Telefone</option><option value="presencial">Presencial</option></select></label>
        <label>Prioridade <select class="input" id="t-prioridade"><option value="baixa">Baixa</option><option value="media" selected>Média</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label>
        <label>Categoria <input class="input" id="t-cat" placeholder="Financeiro, Suporte, Comercial…" /></label>
        <label>Descrição <textarea class="input" id="t-desc" rows="2"></textarea></label>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="t-salvar">Criar ticket</button></div>
    </div>
  `);
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
  modal.querySelector('#t-salvar').addEventListener('click', () => {
    const r = E.modules.atendimento.addTicket({
      titulo: modal.querySelector('#t-titulo').value,
      cliente: modal.querySelector('#t-cliente').value,
      canal: modal.querySelector('#t-canal').value,
      prioridade: modal.querySelector('#t-prioridade').value,
      categoria: modal.querySelector('#t-cat').value,
      descricao: modal.querySelector('#t-desc').value,
    });
    if (!r.ok) toast('Falha ao criar ticket', 'danger');
    else {
      toast(`Ticket ${r.ticket.protocolo} criado `, 'success');
      modal.remove();
      renderView('atendimento');
      inlineInsight(` Ticket **${r.ticket.protocolo}** aberto (prioridade ${r.ticket.prioridade}).\nSLA de primeira resposta: **${r.ticket.slaPrimeiraResposta}h** — vence em ${E.fmtDateTime(r.ticket.slaDeadline)}.\nDica: use o botão **IA: sugerir resposta** na ficha do ticket para agilizar o atendimento.`);
    }
  });
}

function openTicketDetail(id) {
  document.querySelectorAll('.lead-detail-panel').forEach((p) => p.remove());
  const a = E.modules.atendimento;
  const t = a.tickets.find((x) => x.id === id);
  if (!t) return;
  const panel = el('div', 'lead-detail-panel open', '');
  panel.innerHTML = `
    <div class="ldp-header"><div style="flex:1"><h3>${esc(t.protocolo)} — ${esc(t.titulo)}</h3><div class="text-muted">${esc(t.cliente || '')} · ${esc(t.canal || '')} · ${esc(t.prioridade || '')}</div></div><button class="btn btn-icon" data-close title="Fechar" aria-label="Fechar">${ICONS.fechar}</button></div>
    <div class="ldp-body">
      <div class="ldp-section"><h4>Mensagens</h4><div class="ldp-timeline">${(t.mensagens || []).map((m) => `<div class="tl-item"><div class="tl-time">${E.fmtDateTime(m.criadaEm)} ${m.origem === 'outbound' ? '(atendente)' : '(cliente)'}</div><div>${esc(m.corpo)}</div></div>`).join('') || '<div class="text-muted">Sem mensagens</div>'}</div></div>
      <div class="ldp-section">
        <textarea class="input" id="msg-corpo" rows="2" placeholder="Escreva uma mensagem…"></textarea>
        <div class="btn-group" style="margin-top:6px">
          <button class="btn btn-sm btn-primary" data-enviar>Enviar (atendente)</button>
          <button class="btn btn-sm" data-ia>IA: sugerir resposta</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  panel.querySelector('[data-close]').addEventListener('click', () => panel.remove());
  panel.querySelector('[data-enviar]').addEventListener('click', () => {
    const corpo = panel.querySelector('#msg-corpo').value;
    if (!corpo.trim()) { toast('Escreva uma mensagem', 'warn'); return; }
    a.addMensagem(t.id, { autor: 'Equipe', origem: 'outbound', corpo });
    toast('Mensagem registrada', 'success');
    openTicketDetail(id);
  });
  panel.querySelector('[data-ia]').addEventListener('click', async () => {
    const btn = panel.querySelector('[data-ia]');
    btn.disabled = true;
    btn.textContent = 'Pensando…';
    const res = await E.modules.ia.ask('Sugira uma resposta de atendimento para este ticket (contexto: ' + t.titulo + ' — ' + t.descricao + '). Seja objetivo e cordial.', { scope: 'atendimento' });
    btn.textContent = 'IA: sugerir resposta';
    btn.disabled = false;
    panel.querySelector('#msg-corpo').value = res.resposta;
    toast('Sugestão pronta — revise antes de enviar (Humano no comando)', 'info');
  });
}

/* ------------------------------------------------------------------ *
 * VIEW: CLIENTES & CS
 * ------------------------------------------------------------------ */

function renderClientes(c) {
  const cl = E.modules.clientes;
  cl.recalcScores();
  c.appendChild(el('div', 'page-header', `<h1>Clientes & Customer Success</h1><p>Perfil 360°, health score explicável e receita recorrente.</p><div style="margin-top:8px"><button class="btn btn-primary btn-sm" id="btn-cliente-novo">Novo cliente</button></div>`));
  const kpis = el('div', 'kpi-grid', '');
  const ativos = cl.clientes.filter((x) => x.status === 'ativo').length;
  const risco = cl.clientes.filter((x) => x.status === 'risco').length;
  [['Clientes', cl.clientes.length, 'blue'], ['Ativos', ativos, 'green'], ['Em risco', risco, 'red'], ['MRR', E.fmtMoney(E.modules.bi.mrr()), 'cyan']].forEach(([l, v, cor]) => {
    kpis.appendChild(el('div', `card kpi-card kpi-${cor}`, `<div class="kpi-value">${esc(String(v))}</div><div class="kpi-label">${l}</div>`));
  });
  c.appendChild(kpis);
  const table = el('table', 'table', `<thead><tr><th>Cliente</th><th>Plano</th><th>MRR</th><th>Health</th><th>Último acesso</th><th></th></tr></thead><tbody></tbody>`);
  const tbody3 = table.querySelector('tbody');
  if (tbody3) {
    cl.clientes.forEach((x) => {
      const hs = x.health != null ? x.health : cl.healthScore(x).score;
      const tr = el('tr', '', '');
      tr.innerHTML = `<td><b>${esc(x.nome || x.empresa || '—')}</b></td><td>${esc(x.plano || '—')}</td><td>${E.fmtMoney(x.mrr)}</td><td><span class="badge badge-${hs >= 70 ? 'green' : hs >= 40 ? 'orange' : 'red'}">${hs}</span></td><td>${x.ultimoAcesso ? E.fmtDate(x.ultimoAcesso) : '—'}</td><td><button class="btn btn-xs" data-ver>Ver</button></td>`;
      const verBtn = tr.querySelector('[data-ver]');
      if (verBtn) verBtn.addEventListener('click', () => openClienteDetail(x.id));
      tbody3.appendChild(tr);
    });
  }
  c.appendChild(table);
  c.querySelector('#btn-cliente-novo')?.addEventListener('click', () => openClienteModal());
}

function openClienteModal() {
  const modal = el('div', 'modal', `
    <div class="modal-box">
      <h3>Novo cliente</h3>
      <div class="form-grid">
        <label>Nome <input class="input" id="cl-nome" /></label>
        <label>Empresa <input class="input" id="cl-empresa" /></label>
        <label>E-mail <input class="input" id="cl-email" /></label>
        <label>Telefone <input class="input" id="cl-tel" /></label>
        <label>Plano <input class="input" id="cl-plano" /></label>
        <label>MRR (R$) <input class="input" id="cl-mrr" inputmode="decimal" /></label>
        <label>Status <select class="input" id="cl-status"><option value="ativo">Ativo</option><option value="risco">Em risco</option><option value="inativo">Inativo</option></select></label>
        <label>Último acesso <input class="input" type="date" id="cl-acesso" /></label>
        <label>NPS <input class="input" id="cl-nps" inputmode="numeric" /></label>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="cl-salvar">Salvar</button></div>
    </div>
  `);
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
  modal.querySelector('#cl-salvar').addEventListener('click', () => {
    const acesso = modal.querySelector('#cl-acesso').value;
    const r = E.modules.clientes.addCliente({
      nome: modal.querySelector('#cl-nome').value,
      empresa: modal.querySelector('#cl-empresa').value,
      email: modal.querySelector('#cl-email').value,
      telefone: modal.querySelector('#cl-tel').value,
      plano: modal.querySelector('#cl-plano').value,
      mrr: parseBRLNumber(modal.querySelector('#cl-mrr').value),
      status: modal.querySelector('#cl-status').value,
      ultimoAcesso: acesso ? new Date(`${acesso}T10:00`).toISOString() : null,
      nps: modal.querySelector('#cl-nps').value ? Number(modal.querySelector('#cl-nps').value) : null,
    });
    if (!r.ok) toast('Falha: ' + (r.code || 'erro'), 'danger');
    else {
      toast('Cliente criado ', 'success');
      modal.remove();
      renderView('clientes');
      const hs2 = E.modules.clientes.healthScore(r.cliente);
      inlineInsight(` **${r.cliente.nome || r.cliente.empresa || 'Cliente'}** cadastrado com MRR de **${E.fmtMoney(r.cliente.mrr)}**.\nHealth score inicial: **${hs2.score}/100** (${hs2.reasons.join('; ')}).\nDica: registre o contrato e o próximo acesso para o score refletir a saúde real.`);
    }
  });
}

function openClienteDetail(id) {
  document.querySelectorAll('.lead-detail-panel').forEach((p) => p.remove());
  const cl = E.modules.clientes;
  const x = cl.clientes.find((c) => c.id === id);
  if (!x) return;
  const hs = cl.healthScore(x);
  const panel = el('div', 'lead-detail-panel open', '');
  panel.innerHTML = `
    <div class="ldp-header"><div style="flex:1"><h3>${esc(x.nome || x.empresa || '—')}</h3><div class="text-muted">${esc(x.empresa || '')} · ${esc(x.plano || '')} · ${esc(x.status || '')}</div></div><button class="btn btn-icon" data-close title="Fechar" aria-label="Fechar">${ICONS.fechar}</button></div>
    <div class="ldp-body">
      <div class="ldp-section"><h4>Health score</h4><div class="kpi-value">${hs.score}/100</div><div class="text-muted" style="margin-top:4px">${hs.reasons.map((r) => esc(r)).join(' · ')}</div></div>
      <div class="ldp-section"><h4>Dados</h4>
        <div class="ldp-field"><span class="k">E-mail:</span><span>${esc(x.email || '—')}</span></div>
        <div class="ldp-field"><span class="k">Telefone:</span><span>${esc(x.telefone || '—')}</span></div>
        <div class="ldp-field"><span class="k">MRR:</span><span>${E.fmtMoney(x.mrr)}</span></div>
        <div class="ldp-field"><span class="k">CNPJ:</span><span>${esc(x.cnpj || '—')}</span></div>
        <div class="ldp-field"><span class="k">Contrato:</span><span>${x.contratoInicio ? E.fmtDate(x.contratoInicio) + ' → ' + E.fmtDate(x.contratoFim) : '—'}</span></div>
        <div class="ldp-field"><span class="k">NPS:</span><span>${x.nps != null ? x.nps : '—'}</span></div>
      </div>
      <div class="ldp-section"><h4>Histórico</h4><div class="ldp-timeline">${(x.historico || []).map((h) => `<div class="tl-item"><div class="tl-time">${E.fmtDateTime(h.at)}</div><div>${esc(h.desc)}</div></div>`).join('') || '<div class="text-muted">Sem histórico</div>'}</div></div>
    </div>
  `;
  document.body.appendChild(panel);
  panel.querySelector('[data-close]').addEventListener('click', () => panel.remove());
}

/* ------------------------------------------------------------------ *
 * VIEW: PROJETOS
 * ------------------------------------------------------------------ */

function renderProjetos(c) {
  const pj = E.modules.projetos;
  c.appendChild(el('div', 'page-header', `<h1>Projetos</h1><p>${pj.projetos.length} projetos · ${pj.atrasados().length} atrasados.</p><div style="margin-top:8px"><button class="btn btn-primary btn-sm" id="btn-proj-novo"> Novo projeto</button></div>`));
  const grid = el('div', 'grid-2', '');
  pj.projetos.forEach((p) => {
    const card = el('div', 'card', `
      <div class="proj-head"><b>${esc(p.nome)}</b> <span class="badge badge-${p.status === 'concluido' ? 'green' : p.status === 'atrasado' ? 'red' : 'blue'}">${esc(p.status)}</span></div>
      <div class="text-muted">${esc(p.cliente || '')} · ${esc(p.tipo || '')} · resp. ${esc(p.responsavel || '—')}</div>
      <div class="progress" style="margin-top:8px"><div class="progress-bar" style="width:${p.progresso || 0}%"></div></div>
      <div class="text-muted" style="margin-top:4px">${p.progresso || 0}% · ${(p.tarefas || []).length} tarefas</div>
      <div class="btn-group" style="margin-top:8px"><button class="btn btn-sm" data-ver>Ver</button><button class="btn btn-sm btn-ghost" data-tarefa>+ Tarefa</button></div>
    `);
    const verBtn2 = card.querySelector('[data-ver]');
    if (verBtn2) verBtn2.addEventListener('click', () => openProjetoDetail(p.id));
    const tarBtn = card.querySelector('[data-tarefa]');
    if (tarBtn) tarBtn.addEventListener('click', () => openTarefaProjetoModal(p.id));
    grid.appendChild(card);
  });
  c.appendChild(grid);
  if (!pj.projetos.length) {
    const empty = el('div', 'empty', 'Nenhum projeto ainda. Crie projetos para organizar implantações, desenvolvimento e operações.');
    c.appendChild(empty);
  }
  c.querySelector('#btn-proj-novo')?.addEventListener('click', () => openProjetoModal());
}

function openProjetoModal() {
  const modal = el('div', 'modal', `
    <div class="modal-box">
      <h3> Novo projeto</h3>
      <div class="form-grid">
        <label>Nome <input class="input" id="p-nome" /></label>
        <label>Cliente <input class="input" id="p-cliente" /></label>
        <label>Tipo <select class="input" id="p-tipo"><option value="interno">Interno</option><option value="implantacao">Implantação</option><option value="desenvolvimento">Desenvolvimento</option><option value="marketing">Marketing</option><option value="consultoria">Consultoria</option><option value="outro">Outro</option></select></label>
        <label>Responsável <input class="input" id="p-resp" /></label>
        <label>Prazo <input class="input" type="date" id="p-prazo" /></label>
        <label>Descrição <textarea class="input" id="p-desc" rows="2"></textarea></label>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="p-salvar">Criar</button></div>
    </div>
  `);
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
  modal.querySelector('#p-salvar').addEventListener('click', () => {
    const prazo = modal.querySelector('#p-prazo').value;
    const r = E.modules.projetos.addProjeto({
      nome: modal.querySelector('#p-nome').value,
      cliente: modal.querySelector('#p-cliente').value,
      tipo: modal.querySelector('#p-tipo').value,
      responsavel: modal.querySelector('#p-resp').value,
      prazo: prazo ? new Date(`${prazo}T18:00`).toISOString() : null,
      desc: modal.querySelector('#p-desc').value,
    });
    if (!r.ok) toast('Falha ao criar projeto', 'danger');
    else { toast('Projeto criado ', 'success'); modal.remove(); renderView('projetos'); }
  });
}

function openTarefaProjetoModal(projetoId) {
  const modal = el('div', 'modal', `
    <div class="modal-box">
      <h3>Nova tarefa do projeto</h3>
      <div class="form-grid">
        <label>Tarefa <input class="input" id="pt-nome" /></label>
        <label>Responsável <input class="input" id="pt-resp" /></label>
        <label>Prioridade <select class="input" id="pt-prio"><option value="baixa">Baixa</option><option value="media" selected>Média</option><option value="alta">Alta</option></select></label>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="pt-salvar">Adicionar</button></div>
    </div>
  `);
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
  modal.querySelector('#pt-salvar').addEventListener('click', () => {
    const r = E.modules.projetos.addTarefa(projetoId, { nome: modal.querySelector('#pt-nome').value, responsavel: modal.querySelector('#pt-resp').value, prioridade: modal.querySelector('#pt-prio').value });
    if (!r.ok) toast('Falha ao adicionar tarefa', 'danger');
    else { toast('Tarefa adicionada ', 'success'); modal.remove(); renderView('projetos'); }
  });
}

function openProjetoDetail(id) {
  document.querySelectorAll('.lead-detail-panel').forEach((p) => p.remove());
  const pj = E.modules.projetos;
  const p = pj.projetos.find((x) => x.id === id);
  if (!p) return;
  const panel = el('div', 'lead-detail-panel open', '');
  panel.innerHTML = `
    <div class="ldp-header"><div style="flex:1"><h3>${esc(p.nome)}</h3><div class="text-muted">${esc(p.status || '')} · ${p.progresso || 0}%</div></div><button class="btn btn-icon" data-close title="Fechar" aria-label="Fechar">${ICONS.fechar}</button></div>
    <div class="ldp-body">
      <div class="ldp-section"><h4>Tarefas</h4><div class="ldp-timeline">${(p.tarefas || []).map((t) => `<div class="tl-item"><div>${esc(t.nome)} <span class="badge badge-${t.status === 'concluida' ? 'green' : 'orange'}">${esc(t.status)}</span>${t.status !== 'concluida' ? ' <button class="btn btn-xs" data-concluir="' + t.id + '">Concluir</button>' : ''}</div></div>`).join('') || '<div class="text-muted">Sem tarefas</div>'}</div></div>
    </div>
  `;
  document.body.appendChild(panel);
  panel.querySelector('[data-close]').addEventListener('click', () => panel.remove());
  panel.querySelectorAll('[data-concluir]').forEach((b) => b.addEventListener('click', () => {
    pj.updateTarefa(p.id, b.dataset.concluir, { status: 'concluida' });
    toast('Tarefa concluída ', 'success');
    openProjetoDetail(id);
  }));
}

/* ------------------------------------------------------------------ *
 * VIEW: MARKETING
 * ------------------------------------------------------------------ */

function renderMarketing(c) {
  const mk = E.modules.marketing;
  c.appendChild(el('div', 'page-header', `<h1>Marketing</h1><p>Campanhas com orçamento e metas — leads e conversões reais.</p><div style="margin-top:8px"><button class="btn btn-primary btn-sm" id="btn-camp-nova"> Nova campanha</button></div>`));
  const grid = el('div', 'card', '');
  mk.campanhas.forEach((cm) => {
    const card = el('div', 'mkt-card', `
      <div class="mkt-head"><b>${esc(cm.nome)}</b> <span class="badge badge-${cm.status === 'ativa' ? 'green' : 'orange'}">${esc(cm.status)}</span></div>
      <div class="text-muted">${esc(cm.canal || '')} · orçamento ${E.fmtMoney(cm.orcamento)}</div>
      <div class="text-muted">${cm.leadsObtidos || 0} leads · ${cm.conversoes || 0} conversões</div>
      <div class="btn-group" style="margin-top:6px">
        <button class="btn btn-sm" data-lead>+ Lead</button>
        <button class="btn btn-sm btn-success" data-conv>+ Conversão</button>
      </div>
    `);
    const leadBtn = card.querySelector('[data-lead]');
    if (leadBtn) leadBtn.addEventListener('click', () => {
      mk.registrarLead(cm.id);
      toast('Lead registrado na campanha', 'success');
      renderView('marketing');
      inlineInsight(` Campanha **${cm.nome}** registrou +1 lead (total: ${cm.leadsObtidos}).\nConversão atual: ${cm.conversoes} (${cm.conversoes ? Math.round((cm.conversoes / cm.leadsObtidos) * 100) : 0}%).\nDica: alimente a campanha com o Caçador de Leads para escalar a captação.`);
    });
    const convBtn = card.querySelector('[data-conv]');
    if (convBtn) convBtn.addEventListener('click', () => {
      mk.registrarConversao(cm.id);
      toast('Conversão registrada ', 'success');
      renderView('marketing');
      const roi2 = cm.orcamento ? Math.round(((cm.conversoes * E.modules.bi.ticketMedio() - cm.orcamento) / cm.orcamento) * 100) : null;
      inlineInsight(` Campanha **${cm.nome}** registrou +1 conversão (total: ${cm.conversoes}).\nROI estimado: ${roi2 != null ? roi2 + '%' : 'sem orçamento definido'}.\nDica: considere ampliar o orçamento se o ROI estiver positivo.`);
    });
    grid.appendChild(card);
  });
  if (!mk.campanhas.length) grid.appendChild(el('div', 'empty', 'Nenhuma campanha ainda. Crie campanhas e registre resultados reais.'));
  c.appendChild(grid);
  c.querySelector('#btn-camp-nova')?.addEventListener('click', () => openCampanhaModal());
}

function openCampanhaModal() {
  const modal = el('div', 'modal', `
    <div class="modal-box">
      <h3> Nova campanha</h3>
      <div class="form-grid">
        <label>Nome <input class="input" id="cm-nome" /></label>
        <label>Objetivo <input class="input" id="cm-objetivo" placeholder="ex.: Captar leads de academias" /></label>
        <label>Canal <select class="input" id="cm-canal"><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="google">Google</option><option value="landing">Landing page</option><option value="presencial">Presencial</option></select></label>
        <label>Orçamento (R$) <input class="input" id="cm-orc" inputmode="decimal" /></label>
        <label>Segmento <input class="input" id="cm-seg" /></label>
        <label>Responsável <input class="input" id="cm-resp" /></label>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="cm-salvar">Criar</button></div>
    </div>
  `);
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
  modal.querySelector('#cm-salvar').addEventListener('click', () => {
    const r = E.modules.marketing.addCampanha({
      nome: modal.querySelector('#cm-nome').value,
      objetivo: modal.querySelector('#cm-objetivo').value,
      canal: modal.querySelector('#cm-canal').value,
      orcamento: parseBRLNumber(modal.querySelector('#cm-orc').value),
      segmento: modal.querySelector('#cm-seg').value,
      responsavel: modal.querySelector('#cm-resp').value,
      status: 'rascunho',
    });
    if (!r.ok) toast('Falha ao criar campanha', 'danger');
    else { toast('Campanha criada ', 'success'); modal.remove(); renderView('marketing'); }
  });
}

/* ------------------------------------------------------------------ *
 * VIEW: RH
 * ------------------------------------------------------------------ */

function renderRh(c) {
  const rh = E.modules.rh;
  c.appendChild(el('div', 'page-header', `<h1>RH</h1><p>Colaboradores, cargos e departamentos — dados LGPD.</p><div style="margin-top:8px"><button class="btn btn-primary btn-sm" id="btn-rh-novo"> Novo colaborador</button></div>`));
  const table = el('table', 'table', `<thead><tr><th>Nome</th><th>Cargo</th><th>Departamento</th><th>Status</th><th></th></tr></thead><tbody></tbody>`);
  const tbody4 = table.querySelector('tbody');
  if (tbody4) {
    rh.colaboradores.forEach((c2) => {
      const tr = el('tr', '', '');
      tr.innerHTML = `<td><b>${esc(c2.nome)}</b></td><td>${esc(c2.cargo || '—')}</td><td>${esc(c2.departamento || '—')}</td><td><span class="badge badge-${c2.status === 'ativo' ? 'green' : 'red'}">${esc(c2.status || '')}</span></td><td><button class="btn btn-xs btn-ghost" data-dem="${esc(c2.id)}">Desligar</button></td>`;
      const demBtn = tr.querySelector(`[data-dem="${esc(c2.id)}"]`);
      if (demBtn) demBtn.addEventListener('click', () => {
        rh.updateColaborador(c2.id, { status: 'inativo' });
        toast('Colaborador desligado', 'info');
        renderView('rh');
      });
      tbody4.appendChild(tr);
    });
  }
  c.appendChild(table);
  c.querySelector('#btn-rh-novo')?.addEventListener('click', () => openColaboradorModal());
}

function openColaboradorModal() {
  const modal = el('div', 'modal', `
    <div class="modal-box">
      <h3>â€ Novo colaborador</h3>
      <div class="form-grid">
        <label>Nome <input class="input" id="rh-nome" /></label>
        <label>Cargo <input class="input" id="rh-cargo" /></label>
        <label>Departamento <input class="input" id="rh-dept" /></label>
        <label>Gestor <input class="input" id="rh-gestor" /></label>
        <label>E-mail <input class="input" id="rh-email" /></label>
        <label>Telefone <input class="input" id="rh-tel" /></label>
        <label>Admissão <input class="input" type="date" id="rh-adm" /></label>
        <label>Salário (R$) <input class="input" id="rh-sal" inputmode="decimal" /></label>
        <label>Benefícios <input class="input" id="rh-ben" placeholder="VA, VT, Plano…" /></label>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="rh-salvar">Salvar</button></div>
    </div>
  `);
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
  modal.querySelector('#rh-salvar').addEventListener('click', () => {
    const adm = modal.querySelector('#rh-adm').value;
    const r = E.modules.rh.addColaborador({
      nome: modal.querySelector('#rh-nome').value,
      cargo: modal.querySelector('#rh-cargo').value,
      departamento: modal.querySelector('#rh-dept').value,
      gestor: modal.querySelector('#rh-gestor').value,
      email: modal.querySelector('#rh-email').value,
      telefone: modal.querySelector('#rh-tel').value,
      admissao: adm ? new Date(`${adm}T09:00`).toISOString() : null,
      salario: parseBRLNumber(modal.querySelector('#rh-sal').value),
      beneficios: modal.querySelector('#rh-ben').value,
    });
    if (!r.ok) toast('Falha ao cadastrar', 'danger');
    else { toast('Colaborador cadastrado â€', 'success'); modal.remove(); renderView('rh'); }
  });
}

/* ------------------------------------------------------------------ *
 * VIEW: BI
 * ------------------------------------------------------------------ */

function renderBi(c) {
  const b = E.modules.bi;
  c.appendChild(el('div', 'page-header', `<h1>BI & Analytics</h1><p>Indicadores reais calculados ao vivo — sem dados falsos.</p>`));
  const grid = el('div', 'kpi-grid', '');
  const kpis = [
    ['Leads', String(d().leads.length), 'blue'],
    ['MRR', E.fmtMoney(b.mrr()), 'green'],
    ['ARR', E.fmtMoney(b.arrend()), 'cyan'],
    ['Pipeline', E.fmtMoney(b.pipelineValue()), 'violet'],
    ['Conversão', String(b.conversion()) + '%', 'orange'],
    ['Ticket médio', E.fmtMoney(b.ticketMedio()), 'red'],
    ['Valor ganho', E.fmtMoney(b.valorGanho()), 'green'],
    ['A receber', E.fmtMoney(b.financeiro().aReceber), 'orange'],
    ['SLA em risco', String(b.atendimento().slaRisco), 'red'],
  ];
  kpis.forEach(([l, v, cor]) => grid.appendChild(el('div', `card kpi-card kpi-${cor}`, `<div class="kpi-value">${esc(String(v))}</div><div class="kpi-label">${esc(l)}</div>`)));
  c.appendChild(grid);
  // Origem dos leads
  const origens = b.leadsPorOrigem();
  const origBox = el('div', 'card', `<h4> Leads por origem</h4>`);
  Object.entries(origens).forEach(([k, v]) => {
    origBox.appendChild(el('div', 'text-muted', `${esc(k)}: <b>${v}</b>`));
  });
  c.appendChild(origBox);
  // Consulta em linguagem natural
  const aiBox = el('div', 'card', `
    <h4> Pergunte ao BI</h4>
    <p class="text-muted">Ex.: "Qual vendedor vendeu mais este mês?" · "Como está meu funil?" — respostas com base nos dados reais.</p>
    <div style="display:flex;gap:6px"><input class="input" id="bi-pergunta" placeholder="Pergunta…" style="flex:1"><button class="btn btn-primary" id="bi-enviar">Perguntar</button></div>
    <div id="bi-resposta" style="margin-top:10px"></div>
  `);
  c.appendChild(aiBox);
  const biEnviar = aiBox.querySelector('#bi-enviar');
  if (biEnviar) biEnviar.addEventListener('click', async () => {
    const perguntaInp = aiBox.querySelector('#bi-pergunta');
    const pergunta = perguntaInp ? perguntaInp.value.trim() : '';
    if (!pergunta) return;
    const respBox = aiBox.querySelector('#bi-resposta');
    if (!respBox) return;
    respBox.innerHTML = '<div class="ai-typing"><span></span><span></span><span></span></div>';
    const res = await E.modules.ia.ask(pergunta, { scope: 'geral' });
    respBox.innerHTML = `<div class="ai-msg bot">${esc(res.resposta).replace(/\n/g, '<br>')}</div><div class="text-muted" style="font-size:11px;margin-top:4px">${res.modo === 'local' ? 'Resposta do motor local (sem gateway configurado)' : 'Resposta do gateway de IA'}</div>`;
  });
}

/* ------------------------------------------------------------------ *
 * VIEW: AUTOMAÇÕES
 * ------------------------------------------------------------------ */

function renderAutomacoes(c) {
  const au = E.modules.automacoes;
  const EVENTOS = ['lead.created', 'lead.qualified', 'lead.won', 'lead.lost', 'payment.completed', 'ticket.created', 'ticket.closed', 'task.created', 'task.completed', 'customer.created', 'agenda.created', 'financeiro.conta_criada'];
  c.appendChild(el('div', 'page-header', `<h1>Automações</h1><p>Regras gatilho → condição → ação com efeitos reais. Sem fachada: o WhatsApp só envia de verdade com prove</p><div style="margin-top:8px"><button class="btn btn-primary btn-sm" id="btn-auto-nova"> Nova regra</button></div>`));
  c.appendChild(el('div', 'card', `<h4> Regras ativas</h4><div id="auto-lista"></div>`));
  const lista = c.querySelector('#auto-lista');
  if (!lista) return;
  au.rules.filter((r) => r.ativa).forEach((r) => {
    const item = el('div', 'auto-item', `
      <div><b>${esc(r.nome)}</b> <span class="badge badge-blue">${esc(r.evento)}</span></div>
      <div class="text-muted">Ação: ${esc(r.acao)} ${r.acaoParams && r.acaoParams.titulo ? '· ' + esc(r.acaoParams.titulo) : ''}</div>
      <button class="btn btn-xs btn-danger" data-remove>Desativar</button>
    `);
    const rmRule = item.querySelector('[data-remove]');
    if (rmRule) rmRule.addEventListener('click', () => {
      au.updateRule(r.id, { ativa: false });
      toast('Regra desativada', 'info');
      renderView('automacoes');
    });
    lista.appendChild(item);
  });
  if (!au.rules.filter((r) => r.ativa).length && lista) lista.appendChild(el('div', 'empty', 'Nenhuma regra ativa. Crie uma regra e ela passa a reagir aos eventos reais.'));
  // Histórico
  c.appendChild(el('div', 'card', `<h4> Histórico de execuções</h4><div id="auto-hist"></div>`));
  const hist = c.querySelector('#auto-hist');
  if (hist) {
    au.executions.slice(0, 20).forEach((ex) => {
      const item = el('div', 'auto-item', `<div><b>${esc(ex.regraNome)}</b> <span class="text-muted">${E.fmtDateTime(ex.em)}</span></div><div class="text-muted">evento ${esc(ex.evento)} → ${esc(String(ex.resultado && ex.resultado.tipo))} · ok=${ex.resultado && ex.resultado.ok ? '' : ''}</div>`);
      hist.appendChild(item);
    });
    if (!au.executions.length) hist.appendChild(el('div', 'empty', 'Nenhuma execução ainda. Os eventos reais do sistema acionam as regras.'));
  }
  c.querySelector('#btn-auto-nova')?.addEventListener('click', () => {
    const modal = el('div', 'modal', `
      <div class="modal-box">
        <h3> Nova automação</h3>
        <div class="form-grid">
          <label>Nome <input class="input" id="au-nome" placeholder="ex.: Avisar vendedor de lead novo" /></label>
          <label>Evento <select class="input" id="au-evento">${EVENTOS.map((e) => `<option value="${e}">${e}</option>`).join('')}</select></label>
          <label>Ação <select class="input" id="au-acao">
            <option value="notificar"> Notificar</option>
            <option value="criar_tarefa"> Criar tarefa</option>
            <option value="mover_etapa"> Mover etapa</option>
            <option value="agendar"> Agendar</option>
            <option value="marcar_contato"> Atribuir vendedor</option>
            <option value="enviar_whats"> WhatsApp (requer provedor)</option>
          </select></label>
          <label>Parâmetro (título/texto) <input class="input" id="au-param" /></label>
        </div>
        <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="au-salvar">Ativar regra</button></div>
      </div>
    `);
    document.body.appendChild(modal);
    modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
    modal.querySelector('#au-salvar').addEventListener('click', () => {
      const acao = modal.querySelector('#au-acao').value;
      const r = E.modules.automacoes.addRule({
        nome: modal.querySelector('#au-nome').value,
        evento: modal.querySelector('#au-evento').value,
        acao,
        acaoParams: { titulo: modal.querySelector('#au-param').value || (acao === 'notificar' ? 'Notificação automática' : '') },
        ativa: true,
      });
      if (!r.ok) toast('Falha ao criar regra', 'danger');
      else { toast('Regra ativada ', 'success'); modal.remove(); E.modules.automacoes.watch(); renderView('automacoes'); }
    });
  });
}

/* ------------------------------------------------------------------ *
 * VIEW: COMUNICAÇÃO (canais com status honesto)
 * ------------------------------------------------------------------ */

function renderComunicacao(c) {
  const chs = features.channels;
  if (chs && chs.ensureLoaded) chs.ensureLoaded();
  c.appendChild(el('div', 'page-header', `<h1>Comunicação</h1><p>Status real por canal — o que não tem credencial verificada fica explícito (nada de botão que não envia).</p>`));
  const grid = el('div', 'grid-2', '');
  chs.list.forEach((ch) => {
    const ok = ch.status === 'verificado';
    const card = el('div', 'card', `
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:22px">${ch.icon}</span>
        <div style="flex:1"><b>${esc(ch.nome)}</b>
          <div class="text-muted" style="font-size:12px">${ch.integracao === 'interna' ? 'Interno — sempre disponível' : esc(ch.integracao)}</div>
        </div>
        <span class="badge badge-${ok ? 'green' : ch.status === 'nao_configurado' ? 'gray' : ch.status === 'configurado_nao_verificado' ? 'orange' : 'red'}">${esc(ch.status.replace(/_/g, ' '))}</span>
      </div>
      <div class="text-muted" style="font-size:12px;margin-top:6px">${esc(ch.requer || '')}</div>
      ${ch.ultimoErro ? `<div class="text-muted" style="font-size:11px;color:var(--e-danger)">Último erro: ${esc(ch.ultimoErro)}</div>` : ''}
      <div class="btn-group" style="margin-top:8px">
        ${ch.integracao !== 'interna' ? `<button class="btn btn-sm" data-config>Configurar</button>` : ''}
        ${ch.status === 'configurado_nao_verificado' ? `<button class="btn btn-sm btn-primary" data-verify>Verificar</button>` : ''}
      </div>
    `);
    card.querySelector('[data-config]')?.addEventListener('click', () => openChannelConfig(ch));
    card.querySelector('[data-verify]')?.addEventListener('click', async () => {
      const r = await chs.verify(ch.tipo);
      if (r.ok) { toast(`Canal ${ch.nome} verificado `, 'success'); }
      else toast(r.message || r.error || 'Verificação falhou', 'warn');
      renderView('comunicacao');
    });
    grid.appendChild(card);
  });
  c.appendChild(grid);
  // Enviar mensagem interna / e-mail
  const sendBox = el('div', 'card', `
    <h4> Enviar mensagem</h4>
    <div class="form-grid">
      <label>Canal <select class="input" id="env-canal">${chs.list.map((x) => `<option value="${x.tipo}" ${x.integracao === 'interna' ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
      <label>Para <input class="input" id="env-para" placeholder="e-mail ou identificador" /></label>
      <label>Título <input class="input" id="env-titulo" /></label>
      <label>Mensagem <textarea class="input" id="env-corpo" rows="3"></textarea></label>
    </div>
    <button class="btn btn-primary" id="env-enviar">Enviar</button>
  `);
  c.appendChild(sendBox);
  const envBtn = sendBox.querySelector('#env-enviar');
  if (envBtn) envBtn.addEventListener('click', async () => {
    const tipo = sendBox.querySelector('#env-canal') ? sendBox.querySelector('#env-canal').value : 'interno';
    const para = sendBox.querySelector('#env-para') ? sendBox.querySelector('#env-para').value.trim() : '';
    const titulo = sendBox.querySelector('#env-titulo') ? sendBox.querySelector('#env-titulo').value.trim() : '';
    const corpo = sendBox.querySelector('#env-corpo') ? sendBox.querySelector('#env-corpo').value.trim() : '';
    const r = await chs.send(tipo, para, titulo || corpo, corpo);
    if (r.ok) { toast('Mensagem enviada via ' + (r.via || tipo) + ' ', 'success'); if (sendBox.querySelector('#env-corpo')) sendBox.querySelector('#env-corpo').value = ''; }
    else toast(r.message || r.error || 'Não foi possível enviar', 'danger');
  });
}

function openChannelConfig(ch) {
  const isSmtp = ch.tipo === 'smtp';
  const isTelegram = ch.tipo === 'telegram';
  const modal = el('div', 'modal', `
    <div class="modal-box">
      <h3>Configurar: ${esc(ch.nome)}</h3>
      ${isSmtp ? `
        <p class="text-muted">Use SMTP com App Password (Gmail/Outlook) ou um gateway SMTP. A verificação é real, sem simulação.</p>
        <div class="form-grid">
          <label>Host <input class="input" id="cfg-host" placeholder="smtp.gmail.com" /></label>
          <label>Porta <input class="input" id="cfg-port" value="587" /></label>
          <label>Usuário (e-mail) <input class="input" id="cfg-user" /></label>
          <label>Senha / App Password <input class="input" id="cfg-pass" type="password" /></label>
          <label>Nome de exibição <input class="input" id="cfg-from" /></label>
          <label><input type="checkbox" id="cfg-secure" /> TLS/SSL (porta 465)</label>
        </div>
      ` : isTelegram ? `
        <p class="text-muted">Cole o Bot Token do BotFather. A verificação real exige chamada à API do Telegram.</p>
        <div class="form-grid">
          <label>Bot Token <input class="input" id="cfg-user" /></label>
          <label>Nome de exibição <input class="input" id="cfg-from" /></label>
        </div>
      ` : `<p class="text-muted">${esc(ch.requer)}</p>`}
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="cfg-salvar">Salvar</button></div>
    </div>
  `);
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
  modal.querySelector('#cfg-salvar').addEventListener('click', async () => {
    const config = {
      host: modal.querySelector('#cfg-host')?.value || '',
      port: modal.querySelector('#cfg-port')?.value || '',
      user: modal.querySelector('#cfg-user')?.value || '',
      pass: modal.querySelector('#cfg-pass')?.value || modal.querySelector('#cfg-user')?.value || '',
      secure: modal.querySelector('#cfg-secure')?.checked || false,
      fromName: modal.querySelector('#cfg-from')?.value || '',
    };
    const r = await features.channels.configure(ch.tipo, config);
    if (!r.ok) toast(r.message || 'Não foi possível configurar', 'danger');
    else { toast('Configurado — agora verifique o canal', 'info'); modal.remove(); renderView('comunicacao'); }
  });
}

/* ------------------------------------------------------------------ *
 * VIEW: SEGURANÇA
 * ------------------------------------------------------------------ */

function renderSeguranca(c) {
  const sec = features.security;
  const lgpd = features.lgpd;
  c.appendChild(el('div', 'page-header', `<h1>Segurança & LGPD</h1><p>Proteção local, auditoria e direitos dos titulares.</p>`));
  const card = el('div', 'card', `
    <h4> Acesso</h4>
    <div class="text-muted">${sec.hasPin() ? 'Senha de 6 números configurada — o sistema pede a senha para abrir.' : 'Sem senha — defina agora para proteger seus dados.'}</div>
    <div class="btn-group" style="margin-top:8px">
      <button class="btn btn-sm" id="sec-pin">${sec.hasPin() ? 'Trocar senha' : 'Definir senha'}</button>
      <button class="btn btn-sm" id="sec-totp">${sec.hasTotp() ? 'Desativar MFA' : 'Ativar MFA (TOTP)'}</button>
      <button class="btn btn-sm btn-ghost" id="sec-recovery">${sec.hasRecovery() ? 'Recuperação configurada' : 'Configurar recuperação'}</button>
      <button class="btn btn-sm btn-ghost" id="sec-google">${sec.hasGoogle() ? 'Conta Google vinculada' : 'Vincular conta Google'}</button>
    </div>
    <div id="sec-detalhes" class="text-muted" style="margin-top:10px;font-size:12px"></div>
  `);
  c.appendChild(card);
  const detalhes = card.querySelector('#sec-detalhes');
  if (sec.hasRecovery()) {
    const r = sec.getRecovery();
    detalhes.appendChild(el('div', '', `WhatsApp: <b>${esc(r.whats)}</b> · E-mail: <b>${esc(r.email)}</b>`));
  }
  if (sec.hasGoogle()) {
    const g = sec.getGoogle();
    detalhes.appendChild(el('div', '', `Google: <b>${esc(g.email)}</b>${g.nome ? ' (' + esc(g.nome) + ')' : ''}`));
  }

  // ————— Sincronizar outro dispositivo (código específico do usuário) —————
  const sincCard = el('div', 'card', `
    <h4> Sincronizar outro dispositivo</h4>
    <div class="text-muted" style="margin-bottom:8px">Novo dispositivo: clique em <b>Já tenho conta</b> e informe seu e-mail/WhatsApp cadastrado para puxar tudo do link oficial — ou gere/copie um código manual abaixo.</div>
    <div class="btn-group">
      <button class="btn btn-sm btn-primary" id="sync-gerar"> Gerar código</button>
      <button class="btn btn-sm" id="sync-copiar" disabled> Copiar</button>
      <button class="btn btn-sm btn-success" id="sync-aplicar"> Aplicar código colado</button>
      <button class="btn btn-sm" id="sync-conta"> Já tenho conta</button>
      <button class="btn btn-sm btn-ghost" id="sync-email"> Enviar por e-mail</button>
    </div>
    <textarea class="input" id="sync-codigo" rows="3" placeholder="Cole aqui o código gerado no outro dispositivo…" style="margin-top:10px;font-family:monospace;font-size:11px"></textarea>
    <div id="sync-msg" class="text-muted" style="font-size:12px;margin-top:6px"></div>
  `);
  c.appendChild(sincCard);
  const syncBox = sincCard.querySelector('#sync-codigo');
  const syncMsg = sincCard.querySelector('#sync-msg');
  let syncValor = '';
  sincCard.querySelector('#sync-gerar').addEventListener('click', () => {
    try {
      const O = window.NEITZEL_OPS;
      const dados = {
        t: Date.now(),
        s: O ? O.servicos.ativos() : [],
        p: O ? O.produtos.ativos() : [],
        rec: sec.getRecovery() || null,
      };
      syncValor = btoa(encodeURIComponent(JSON.stringify(dados)));
      syncBox.value = syncValor;
      sincCard.querySelector('#sync-copiar').disabled = false;
      syncMsg.innerHTML = 'Código gerado. Copie e envie para você mesmo (e-mail/WhatsApp) — depois cole no outro dispositivo e clique em <b>Aplicar</b>.';
    } catch (e) { syncMsg.textContent = 'Falha ao gerar: ' + e.message; }
  });
  sincCard.querySelector('#sync-copiar').addEventListener('click', async () => {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(syncValor || syncBox.value);
      else { syncBox.select(); document.execCommand('copy'); }
      toast('Código copiado.', 'success');
    } catch (e) { toast('Copie manualmente (Ctrl+C).', 'info'); }
  });
  sincCard.querySelector('#sync-email').addEventListener('click', async () => {
    if (!syncValor) { toast('Gere o código primeiro.', 'warn'); return; }
    const rc = sec.getRecovery();
    if (!rc || !rc.email) { toast('Configure a recuperação por e-mail primeiro.', 'warn'); return; }
    syncMsg.textContent = 'Enviando código por e-mail…';
    const send = await sec.enviarCodigoEmail(rc.email, 'SINCRONIZACAO', 'Cole o código anexado na área Segurança → Sincronizar outro dispositivo.\n\n' + syncValor);
    syncMsg.textContent = send.ok
      ? (send.precisaAtivar ? 'Ativação enviada — confirme uma vez na caixa de entrada e reenvie.' : 'Enviado para ' + rc.email + '! Abra no outro dispositivo e cole o código aqui.')
      : 'Não foi possível enviar agora — copie manualmente.';
  });
  sincCard.querySelector('#sync-aplicar').addEventListener('click', () => {
    try {
      const raw = syncBox.value.trim();
      if (!raw) { syncMsg.textContent = 'Cole um código antes de aplicar.'; return; }
      const dados = JSON.parse(decodeURIComponent(atob(raw)));
      if (!dados || !Array.isArray(dados.s)) throw new Error('código inválido');
      if (dados.rec && !sec.hasRecovery()) sec.setupRecovery({ whatsapp: dados.rec.whats, email: dados.rec.email });
      try { localStorage.setItem('neitzel_servicos_v1', JSON.stringify(dados.s || [])); } catch (e) {}
      try { localStorage.setItem('neitzel_produtos_v1', JSON.stringify(dados.p || [])); } catch (e) {}
      if (window.NEITZEL_SYNC_FLASH) window.NEITZEL_SYNC_FLASH();
      syncMsg.textContent = 'Aplicado! Serviços e produtos atualizados neste dispositivo.';
      toast('Sincronização aplicada.', 'success');
      setTimeout(() => renderView('seguranca'), 600);
    } catch (e) { syncMsg.textContent = 'Código inválido: ' + e.message; }
  });

  // "Já tenho conta": informa o e-mail/WhatsApp cadastrado e puxa tudo do
  // link oficial publicado no GitHub — validando por hash, sem expor contato.
  sincCard.querySelector('#sync-conta').addEventListener('click', async () => {
    const contato = prompt('Seu e-mail ou WhatsApp cadastrado na conta:');
    if (!contato) return;
    syncMsg.textContent = 'Buscando sua conta no link oficial…';
    try {
      const r = await fetch('https://neitzelcomercial-cell.github.io/neitzel-ecomim/portal-data.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('nada publicado ainda — gere o código no dispositivo principal');
      const d = await r.json();
      if (!d || !Array.isArray(d.s)) throw new Error('publicação sem dados válidos');
      // Valida a conta comparando hashes individuais publicados
      let autenticado = false;
      const digits = String(contato).replace(/\D/g, '');
      const email = String(contato).trim().toLowerCase();
      try {
        if (d.rec && d.rec.w && digits && (await sec._hashPin(digits, 'recovery-whats')) === d.rec.w) autenticado = true;
        if (!autenticado && d.rec && d.rec.e && email.includes('@') && (await sec._hashPin(email, 'recovery-email')) === d.rec.e) autenticado = true;
      } catch (e) { /* ignore */ }
      if (!autenticado) throw new Error('contato não confere com a conta publicada');
      // Aplica os dados da conta neste dispositivo
      try { localStorage.setItem('neitzel_servicos_v1', JSON.stringify(d.s || [])); } catch (e) {}
      try { localStorage.setItem('neitzel_produtos_v1', JSON.stringify(d.p || [])); } catch (e) {}
      try {
        if (!sec.hasRecovery()) {
          // vincula a recuperação local ao contato autenticado (tipo deduzido)
          if (digits && !(email.includes('@'))) await sec.setupRecovery({ whatsapp: digits, email: ('sync' + digits.slice(-8) + '@neitzel.local') });
          else await sec.setupRecovery({ whatsapp: '00000000000' + Math.floor(Math.random() * 9), email });
        }
      } catch (e) { /* não bloqueia */ }
      if (window.NEITZEL_SYNC_FLASH) window.NEITZEL_SYNC_FLASH();
      syncMsg.innerHTML = '<b>Conta sincronizada!</b> Serviços e produtos restaurados neste dispositivo.';
      toast('Bem-vindo de volta! Conta sincronizada.', 'success');
      setTimeout(() => renderView('seguranca'), 700);
    } catch (e) {
      syncMsg.textContent = 'Não foi possível: ' + e.message;
      toast('Falha na sincronização da conta.', 'danger');
    }
  });
  const secPin = c.querySelector('#sec-pin');
  if (secPin) secPin.addEventListener('click', async () => {
    const p = prompt(sec.hasPin() ? 'Nova senha (6 números):' : 'Defina sua senha (6 números):');
    if (!p) return;
    if (!/^\d{6}$/.test(String(p).trim())) { toast('A senha deve ter exatamente 6 números', 'danger'); return; }
    const r = await sec.setupPassword(p);
    toast(r.ok ? 'Senha definida ' : r.message || 'Não foi possível definir', r.ok ? 'success' : 'danger');
    renderView('seguranca');
  });
  const secRecovery = c.querySelector('#sec-recovery');
  if (secRecovery) secRecovery.addEventListener('click', async () => {
    const whats = prompt('WhatsApp para recuperação (com DDD):');
    if (!whats) return;
    const email = prompt('E-mail para recuperação:');
    if (!email) return;
    const r = await sec.setupRecovery({ whatsapp: whats, email });
    toast(r.ok ? 'Recuperação configurada ' : r.message || r.code, r.ok ? 'success' : 'danger');
    renderView('seguranca');
  });
  const secGoogle = c.querySelector('#sec-google');
  if (secGoogle) secGoogle.addEventListener('click', async () => {
    const nome = prompt('Nome (conta Google):');
    if (nome == null) return;
    const email = prompt('E-mail da conta Google:');
    if (email == null) return;
    const r = await sec.setupGoogle({ nome, email });
    toast(r.ok ? `Conta Google vinculada: ${r.conta.email}` : r.message || r.code, r.ok ? 'success' : 'danger');
    renderView('seguranca');
  });
  const secTotp = c.querySelector('#sec-totp');
  if (secTotp) secTotp.addEventListener('click', async () => {
    if (sec.hasTotp()) { sec.disableTotp(); toast('MFA desativado', 'info'); renderView('seguranca'); return; }
    const r = await sec.setupTotp();
    if (r.ok) {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(r.secret);
      alert(`MFA ativado! Escaneie este código no app autenticador (Google Authenticator etc.) ou anote o segredo:\n\n${r.secret}\n\nURI: ${r.uri}\n\n(segredo copiado para a área de transferência)`);
      renderView('seguranca');
    } else toast('Configura o PIN antes', 'warn');
  });
  const auditCard = el('div', 'card', `<h4> Auditoria (append-only)</h4><div id="audit-list"></div>`);
  c.appendChild(auditCard);
  const al = auditCard.querySelector('#audit-list');
  if (al) {
    E.audit.list().slice(-30).reverse().forEach((a) => {
      al.appendChild(el('div', 'text-muted', `<b>${esc(a.action)}</b> · ${esc(a.entity || '')} · ${E.fmtDateTime(a.ts)} · ${esc(a.actor)}`));
    });
    if (!E.audit.list().length) al.appendChild(el('div', 'empty', 'Nenhuma auditoria ainda.'));
  }
  const lgpdCard = el('div', 'card', `
    <h4> LGPD</h4>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
      <input class="input" id="lgpd-termo" placeholder="Nome ou e-mail do titular" style="flex:1;min-width:200px" />
      <button class="btn btn-sm" id="lgpd-export">Exportar dados</button>
      <button class="btn btn-sm btn-danger" id="lgpd-anon">Anonimizar</button>
    </div>
    <div id="lgpd-result" class="text-muted" style="margin-top:8px"></div>
  `);
  c.appendChild(lgpdCard);
  const lgpdExportBtn = lgpdCard.querySelector('#lgpd-export');
  if (lgpdExportBtn) lgpdExportBtn.addEventListener('click', () => {
    const termo = lgpdCard.querySelector('#lgpd-termo') ? lgpdCard.querySelector('#lgpd-termo').value : '';
    const r = lgpd.exportTitular(termo);
    const resultEl = lgpdCard.querySelector('#lgpd-result');
    if (r.ok && r.dados.leads.length) {
      const blob = new Blob([JSON.stringify(r.dados, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `lgpd-export-${Date.now()}.json`;
      a.click();
      if (resultEl) resultEl.textContent = `Exportado: ${r.dados.leads.length} leads de "${termo}".`;
    } else if (resultEl) resultEl.textContent = 'Nenhum dado encontrado para esse titular.';
  });
  const lgpdAnonBtn = lgpdCard.querySelector('#lgpd-anon');
  if (lgpdAnonBtn) lgpdAnonBtn.addEventListener('click', () => {
    const termo = lgpdCard.querySelector('#lgpd-termo') ? lgpdCard.querySelector('#lgpd-termo').value : '';
    if (!confirm('Anonimizar todos os registros deste titular? (irreversível — preserva metadados)')) return;
    const r = lgpd.anonimizar(termo);
    toast(r.ok ? `${r.anonimizados} registro(s) anonimizado(s)` : 'Nada encontrado', r.ok ? 'success' : 'info');
    renderView('seguranca');
  });
}

/* ------------------------------------------------------------------ *
 * VIEW: CONFIGURAÇÕES
 * ------------------------------------------------------------------ */

function renderConfig(c) {
  const cfg = E.db.get().config;
  c.appendChild(el('div', 'page-header', `<h1>Configurações</h1><p>Segmento, cidades, empresa, integrações e backup.</p>`));
  const card = el('div', 'card', `
    <h4> Prospecção</h4>
    <div class="form-grid">
      <label>Segmento <input class="input" id="cfg-seg" value="${esc(cfg.segmento || '')}" placeholder="ex.: academias, nutricionistas" /></label>
      <label>Cidades <input class="input" id="cfg-cid" value="${esc(cfg.cidades || '')}" placeholder="ex.: Joinville, Florianópolis" /></label>
      <label>Intervalo (min) <input class="input" id="cfg-int" type="number" min="1" value="${cfg.intervalo || 60}" /></label>
      <label>Empresa <input class="input" id="cfg-emp" value="${esc(cfg.empresa?.nome || '')}" /></label>
      <label>WhatsApp comercial <input class="input" id="cfg-whats" value="${esc(cfg.empresa?.whatsapp || '')}" /></label>
    </div>
    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <button class="btn btn-primary" id="cfg-salvar"> Salvar</button>
      <button class="btn btn-sm" id="cfg-migrar"> Migrar dados do LeadsCRM</button>
    </div>
    <div id="cfg-msg" class="text-muted" style="margin-top:8px"></div>
  `);
  c.appendChild(card);
  const cfgSalvar = c.querySelector('#cfg-salvar');
  if (cfgSalvar) cfgSalvar.addEventListener('click', () => {
    const seg = c.querySelector('#cfg-seg'), cid = c.querySelector('#cfg-cid'), intr = c.querySelector('#cfg-int'), emp = c.querySelector('#cfg-emp'), wh = c.querySelector('#cfg-whats');
    if (seg) cfg.segmento = seg.value;
    if (cid) cfg.cidades = cid.value;
    if (intr) cfg.intervalo = Number(intr.value) || 60;
    cfg.empresa = Object.assign(cfg.empresa || {}, { nome: emp ? emp.value : '', whatsapp: wh ? wh.value : '' });
    E.db.save();
    toast('Configurações salvas', 'success');
  });
  const cfgMigrar = c.querySelector('#cfg-migrar');
  if (cfgMigrar) cfgMigrar.addEventListener('click', () => {
    const msgEl = c.querySelector('#cfg-msg');
    const det = features.migrator.detectLegacy();
    if (!det.exists) { if (msgEl) msgEl.textContent = 'Nenhum dado do LeadsCRM encontrado neste navegador.'; return; }
    if (!confirm(`Encontrei ${det.leads} leads e ${det.fila} itens de fila do LeadsCRM. Migrar para o NEITZEL agora?`)) return;
    const r = features.migrator.migrate();
    if (r.ok) {
      const s = r.stats;
      if (msgEl) msgEl.textContent = `Migração concluída: ${s.leads} leads importados, ${s.fila} da fila, ${s.duplicados} duplicados ignorados${s.config ? ', configuração copiada' : ''}.`;
      toast('Migração concluída ', 'success');
      renderView('leads');
    } else if (msgEl) msgEl.textContent = 'Falha na migração: ' + (r.code || 'erro');
  });
  // Backup
  const bk = el('div', 'card', `
    <h4> Backup & dados</h4>
    <div class="text-muted">Exporta/importa tudo com criptografia real (AES-GCM). Em file:// o AES exige servidor local; sem ele, o fallback é sinalizado.</div>
    <div class="btn-group" style="margin-top:8px;flex-wrap:wrap">
      <button class="btn btn-sm" id="bk-export">⬇ Exportar backup (criptografado)</button>
      <button class="btn btn-sm" id="bk-import">⬆ Importar backup</button>
      <button class="btn btn-sm" id="bk-csv"> Exportar leads CSV</button>
    </div>
  `);
  c.appendChild(bk);
  const bkExport = bk.querySelector('#bk-export');
  if (bkExport) bkExport.addEventListener('click', async () => {
    const senha = prompt('Senha do backup (mín. 4 caracteres):');
    if (!senha || senha.length < 4) { toast('Senha muito curta', 'warn'); return; }
    try {
      const payload = await E.cryptoBox.encrypt(E.db.backup(), senha);
      const blob = new Blob([JSON.stringify({ crm: 'ecomim', v: 2, payload })], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `neitzel-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      toast('Backup exportado ', 'success');
    } catch (e) { toast('Erro ao exportar: ' + e.message, 'danger'); }
  });
  const bkImport = bk.querySelector('#bk-import');
  if (bkImport) bkImport.addEventListener('click', () => openImportModal());
  const bkCsv = bk.querySelector('#bk-csv');
  if (bkCsv) bkCsv.addEventListener('click', () => {
    const rows = [['nome', 'empresa', 'telefone', 'whats', 'email', 'cidade', 'uf', 'segmento', 'valor', 'etapa', 'origem', 'consentimento']];
    d().leads.forEach((l) => rows.push([l.nome, l.empresa, l.telefone, l.whats, l.email, l.cidade, l.uf, l.segmento, (l.valor / 100).toString().replace('.', ','), l.etapa, l.origem, l.consentimento ? 'sim' : 'nao']));
    const csv = rows.map((r) => r.map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `neitzel-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  });
}

function openImportModal() {
  const modal = el('div', 'modal', `
    <div class="modal-box">
      <h3>⬆ Importar backup</h3>
      <input type="file" id="imp-arquivo" accept=".json" style="margin:10px 0" />
      <input class="input" id="imp-senha" type="password" placeholder="Senha do backup" />
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="imp-salvar">Importar</button></div>
    </div>
  `);
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
  modal.querySelector('#imp-salvar').addEventListener('click', async () => {
    const file = modal.querySelector('#imp-arquivo').files[0];
    if (!file) { toast('Selecione o arquivo', 'warn'); return; }
    const senha = modal.querySelector('#imp-senha').value;
    try {
      const txt = await file.text();
      const j = JSON.parse(txt);
      if (j.crm === 'leads' && j.payload) {
        // backup do LeadsCRM (formato irmão)
        const dados = await E.cryptoBox.decrypt(j.payload, senha);
        E.db.restore(dados);
        toast('Importado com sucesso (formato LeadsCRM)', 'success');
      } else if (j.crm === 'ecomim') {
        const dados = await E.cryptoBox.decrypt(j.payload, senha);
        E.db.restore(dados);
        toast('Backup NEITZEL restaurado ', 'success');
      } else if (j && j.leads && j.config) {
        // formato bruto
        E.db.restore(j);
        toast('Backup restaurado', 'success');
      } else toast('Formato de backup desconhecido', 'danger');
      modal.remove();
      renderView('dashboard');
    } catch (e) { toast('Falha ao importar: ' + e.message, 'danger'); }
  });
}

/* ------------------------------------------------------------------ *
 * ASSISTENTE IA (painel lateral + FAB)
 * ------------------------------------------------------------------ */

// Função para obter contexto da tela atual
function getCurrentViewContext() {
  const currentView = ui.view || 'dashboard';
  const viewInfo = VIEWS.find(v => v.id === currentView) || { nome: 'Painel', icone: 'dashboard' };
  const viewName = viewInfo.nome || 'Painel';
  
  // Adiciona informações específicas por view
  let contextInfo = {
    view: currentView,
    viewName: viewName,
    viewDescription: `Você está na área de "${viewName}".`
  };
  
  // Informações adicionais por módulo
  switch(currentView) {
    case 'dashboard':
      contextInfo.suggestions = ['O que posso fazer aqui?', 'Como está meu desempenho geral?', 'Quais são minhas principais métricas?'];
      break;
    case 'leads':
      contextInfo.suggestions = ['Como cadastrar um lead?', 'Como mover um lead no funil?', 'O que significa cada etapa do funil?'];
      contextInfo.leadCount = E.db.get().leads.length;
      break;
    case 'clientes':
      contextInfo.suggestions = ['Como cadastrar um cliente?', 'Como atualizar informações do cliente?', 'O que são clientes em risco?'];
      contextInfo.clienteCount = E.modules.clientes.clientes.length;
      break;
    case 'financeiro':
      contextInfo.suggestions = ['Como registrar uma receita?', 'O que são contas a pagar?', 'Como ver meu fluxo de caixa?'];
      break;
    case 'agenda':
      contextInfo.suggestions = ['Como agendar um compromisso?', 'Como visualizar minha agenda?', 'Como definir lembretes?'];
      break;
    case 'atendimento':
      contextInfo.suggestions = ['Como criar um ticket?', 'Como responder a um atendimento?', 'O que é SLA?'];
      break;
    default:
      contextInfo.suggestions = ['O que posso fazer aqui?', 'Como faço isso?', 'O que significa essa tela?'];
  }
  
  return contextInfo;
}

function toggleAiPanel() {
  const shell = document.querySelector('.ecomim-shell');
  let panel = shell.querySelector('.ecomim-ai-panel');
  const viewContext = getCurrentViewContext();
  
  if (!panel) {
    panel = el('div', 'ecomim-ai-panel', `
      <div class="ai-header">
        <div class="ai-header-title">
          <b>Assistente Neitzel</b>
          <div class="ai-header-sub">Estou aqui para ajudar você a entender e usar o sistema.</div>
        </div>
        <button class="btn btn-icon" data-close title="Fechar" aria-label="Fechar">${ICONS.fechar}</button>
      </div>
      <div class="ai-messages" id="ai-msgs"></div>
      <div class="ai-quick" id="ai-quick"></div>
      <div class="ai-input-area">
        <textarea class="input" id="ai-input" rows="1" placeholder="Digite sua dúvida…"></textarea>
        <button class="btn btn-primary" id="ai-send">Enviar</button>
      </div>
    `);
    shell.appendChild(panel);
    panel.querySelector('[data-close]').addEventListener('click', () => panel.classList.remove('open'));
    panel.querySelector('#ai-send').addEventListener('click', async () => {
      const input = panel.querySelector('#ai-input');
      const q = input.value.trim();
      if (!q) return;
      input.value = '';
      const msgs = panel.querySelector('#ai-msgs');
      msgs.appendChild(el('div', 'ai-msg user', esc(q)));
      const typing = el('div', 'ai-typing', '<span></span><span></span><span></span>');
      msgs.appendChild(typing);
      
      try {
        // Primeiro tenta interpretar a pergunta para contexto melhorado
        const interpretation = E.modules.ia.interpretQuestion(q, ui.view);
        
        let res;
        if (interpretation.interpreted) {
          // Se a pergunta foi interpretada como contextual, usa explicação específica
          typing.remove();
          const bot = el('div', 'ai-msg bot', esc(interpretation.response));
          
          // Adiciona botão de ação se relevante
          if (interpretation.intent === 'contextual_help') {
            const actionBtn = el('button', 'btn btn-xs', 'Mostrar detalhes');
            actionBtn.style.marginTop = '8px';
            actionBtn.addEventListener('click', () => {
              const detailMsg = E.modules.ia.explainView(ui.view);
              msgs.appendChild(el('div', 'ai-msg bot', esc(detailMsg).replace(/\n/g, '<br>')));
            });
            bot.appendChild(actionBtn);
          }
          
          msgs.appendChild(bot);
        } else {
          // Pergunta geral, usa o sistema normal de IA
          res = await E.modules.ia.ask(q, { scope: 'geral' });
          typing.remove();
          const bot = el('div', 'ai-msg bot', esc(res.resposta).replace(/\n/g, '<br>'));
          
          // Adiciona citações se existirem
          if (res.citacoes && res.citacoes.length) {
            bot.appendChild(el('div', '', res.citacoes.slice(0, 4).map((ci) => `<span class="ai-cite"> ${esc(ci.label)}</span>`).join(' ')));
          }
          
          // Adiciona botões de ação baseados no contexto da resposta
          const lowerResponse = res.resposta.toLowerCase();
          if (lowerResponse.includes('painel') || lowerResponse.includes('dashboard')) {
            const actionBtn = el('button', 'btn btn-xs', 'Abrir Painel');
            actionBtn.style.marginTop = '8px';
            actionBtn.addEventListener('click', () => {
              renderView('dashboard');
              toast('Abrindo painel principal...', 'info');
            });
            bot.appendChild(actionBtn);
          }
          
          bot.appendChild(el('div', 'text-muted', `${res.modo === 'local' ? 'motor local' : 'gateway de IA'} · ${res.ms}ms`));
          msgs.appendChild(bot);
        }
      } catch (error) {
        typing.remove();
        msgs.appendChild(el('div', 'ai-msg bot', 'Desculpe, houve um erro ao processar sua pergunta. Tente novamente.'));
        console.error('Erro no assistente IA:', error);
      }
    });
    panel.querySelector('.ai-quick').querySelectorAll('button').forEach((b) => b.addEventListener('click', async () => {
      const q = b.textContent.trim();
      const input = panel.querySelector('#ai-input');
      input.value = q;
      panel.querySelector('#ai-send').click();
    }));
    panel.querySelector('#ai-input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); panel.querySelector('#ai-send').click(); } });
  }
  // Atualiza sugestões rápidas baseadas no contexto da tela
  const quickSection = panel.querySelector('#ai-quick');
  if (quickSection) {
    const context = getCurrentViewContext();
    quickSection.innerHTML = '';
    
    // Adiciona sugestões contextuais
    context.suggestions.forEach(suggestion => {
      const btn = el('button', 'btn btn-xs', esc(suggestion));
      btn.addEventListener('click', async () => {
        const input = panel.querySelector('#ai-input');
        input.value = suggestion;
        panel.querySelector('#ai-send').click();
      });
      quickSection.appendChild(btn);
    });
    
    // Adiciona sugestões gerais se houver espaço
    const generalSuggestions = [
      'O que posso fazer aqui?',
      'Como faço isso?',
      'O que significa essa tela?',
      'Qual é o próximo passo?',
      'Me explique de forma simples.'
    ];
    
    generalSuggestions.slice(0, 3).forEach(suggestion => {
      if (!context.suggestions.includes(suggestion)) {
        const btn = el('button', 'btn btn-xs', esc(suggestion));
        btn.addEventListener('click', async () => {
          const input = panel.querySelector('#ai-input');
          input.value = suggestion;
          panel.querySelector('#ai-send').click();
        });
        quickSection.appendChild(btn);
      }
    });
  }
  
  panel.classList.toggle('open');
  ui.aiOpen = panel.classList.contains('open');
  if (ui.aiOpen) {
    const msgs = panel.querySelector('#ai-msgs');
    if (!msgs.children.length) {
      const context = getCurrentViewContext();
      msgs.appendChild(el('div', 'ai-msg bot', `
        <div style="margin-bottom: 8px">Olá! Sou o <b>Assistente Neitzel</b>. Estou aqui para te ajudar a entender e usar o sistema.</div>
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px">${context.viewDescription}</div>
        <div style="font-size: 12px; margin-top: 12px">Pergunte sobre vendas, leads, financeiro, atendimento, clientes, projetos, marketing, RH ou peça o plano do dia. Respondo com base nos dados reais do sistema.</div>
      `));
      const res = E.modules.ia.planDay();
      if (res) {
        msgs.appendChild(el('div', 'ai-msg bot', esc(res).replace(/\n/g, '<br>')));
      }
    }
  }
}

function toggleNotifPanel() {
  const shell = document.querySelector('.ecomim-shell');
  let panel = shell.querySelector('.notif-panel');
  if (!panel) {
    panel = el('div', 'notif-panel', '');
    shell.querySelector('#btn-notif').appendChild(panel);
  }
  panel.classList.toggle('open');
  ui.notifOpen = panel.classList.contains('open');
  if (ui.notifOpen) {
    const itens = E.modules.notificacoes.items;
    panel.innerHTML = '';
    panel.appendChild(el('div', 'notif-head', `<div style="padding:12px 14px;font-weight:650">Notificações <button class="btn btn-xs" data-allread>Marcar todas lidas</button></div>`));
    panel.querySelector('[data-allread]').addEventListener('click', (e) => {
      e.stopPropagation();
      E.modules.notificacoes.markAllRead();
      toggleNotifPanel();
    });
    if (!itens.length) panel.appendChild(el('div', 'empty', 'Sem notificações.'));
    itens.slice(0, 30).forEach((n) => {
      const item = el('div', 'notif-item' + (n.lida ? '' : ' unread'), `<div class="notif-ico">${esc(n.tipo === 'financeiro' ? '' : n.tipo === 'lead' ? '' : n.tipo === 'atendimento' ? '' : n.tipo === 'automacao' ? '' : n.tipo === 'extensao' ? '' : '')}</div><div><div class="notif-title">${esc(n.titulo)}</div><div class="notif-body">${esc(n.corpo || '')}</div>${n.aviso ? `<div class="notif-aviso">${esc(n.aviso)}</div>` : ''}</div>`);
      item.addEventListener('click', () => {
        E.modules.notificacoes.markRead(n.id);
        item.classList.remove('unread');
        refreshNavCounts();
      });
      panel.appendChild(item);
    });
    }
}

function openUserMenu() {
  const shell = document.querySelector('.ecomim-shell');
  let panel = shell.querySelector('.user-menu');
  if (!panel) {
    panel = el('div', 'notif-panel', '');
    shell.querySelector('#btn-user').appendChild(panel);
  }
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) {
    const sec = features.security;
    const g = sec.getGoogle();
    const nome = (g && g.nome) || 'Operador';
    const email = (g && g.email) || 'Administrador · local';
    panel.innerHTML = `<div class="notif-head" style="padding:12px 14px"><b> ${esc(nome)}</b><div class="text-muted">${esc(email)} · NEITZEL</div></div><div style="padding:10px;display:flex;flex-direction:column;gap:8px"><button class="btn btn-sm btn-block" id="um-mail"> Recuperar senha</button><button class="btn btn-sm btn-block" id="um-sair">Bloquear sistema (pedir senha)</button></div>`;
    panel.querySelector('#um-mail').addEventListener('click', () => { panel.classList.remove('open'); showRecoveryFlow(); });
    panel.querySelector('#um-sair').addEventListener('click', () => {
      if (!window.ECOMIM_EXT.security.hasPin()) { toast('Defina a senha em Segurança para bloquear', 'warn'); return; }
      showLogin();
    });
  }
}

/* ------------------------------------------------------------------ *
 * COMANDO RÃPIDO (⌘K)
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * DICAS DE AJUDA — botão "?" na sidebar explica como usar cada espaço
 * ------------------------------------------------------------------ */

const HELP_DICAS = {
  dashboard: ' <b>Painel</b>: visão geral da operação. Veja KPIs (leads, MRR, conversão), alertas e ações rápidas. Clique em “Caçador de Leadsâ€ para capturar contatos novos.',
  leads: ' <b>Leads & CRM</b>: cadastre e gerencie leads. Clique em <b>+ Novo lead</b> para adicionar, ou clique numa linha para abrir a ficha com histórico e ações (WhatsApp, follow-up com IA, mover etapa).',
  funil: ' <b>Funil</b>: kanban visual. <b>Arraste</b> os cards entre etapas (novo → contato → qualificado → proposta → ganho/perdido). Tudo fica registrado no histórico do lead.',
  cacador: ' <b>Caçador de Leads</b>: capture contatos públicos. Defina tipo (empresa/pessoa), cidade, segmento e quantidade, depois clique em <b>Executar pesquisa</b>. Revise os resultados e envie para a fila do CRM.',
  fila: ' <b>Fila de aprovação</b>: nada entra no CRM sem você aprovar. Use <b> Aprovar</b> ou <b> Recusar</b>. Após aprovar, o lead vai para a etapa “novoâ€ do funil.',
  agenda: ' <b>Agenda</b>: agende eventos, tarefas, reuniões, ligações e lembretes. Clique em <b>+ Novo evento</b> para adicionar.',
  financeiro: ' <b>Financeiro</b>: contas a receber e a pagar. Clique em <b>+ Nova conta</b> para lançar. Valores em reais; totais recalculados automaticamente.',
  atendimento: ' <b>Atendimento</b>: tickets com protocolo e SLA. Clique em <b>+ Novo ticket</b> ou em <b>Ver</b> numa ticket para responder. Use a IA para sugerir respostas.',
  clientes: ' <b>Clientes & CS</b>: perfil 360° com health score. Cadastre clientes e monitore MRR, risco e último acesso.',
  projetos: ' <b>Projetos</b>: gerencie projetos e tarefas com progresso automático. Clique em <b>+ Novo projeto</b> e depois em <b>+ Tarefa</b>.',
  marketing: ' <b>Marketing</b>: campanhas com orçamento. Registre <b>+ Lead</b> e <b>+ Conversão</b> por campanha para calcular ROI.',
  rh: 'â€ <b>RH</b>: colaboradores, cargos e departamentos. Clique em <b>+ Novo colaborador</b> para cadastrar.',
  bi: ' <b>BI & Analytics</b>: indicadores ao vivo. Use a caixa <b>“Pergunte ao BIâ€</b> para fazer perguntas em linguagem natural sobre seus dados.',
  automacoes: ' <b>Automações</b>: regras gatilho → condição → ação. Crie uma regra e ela reagirá aos eventos reais do sistema.',
  comunicacao: ' <b>Comunicação</b>: canais de envio. O status aparece com honestidade. Configure e verifique um canal (ex.: e-mail) antes de enviar.',
  seguranca: ' <b>Segurança</b>: senha de 6 dígitos, recuperação por WhatsApp/e-mail, conta Google, MFA e LGPD.',
  config: ' <b>Configurações</b>: segmento, cidades, empresa e backup criptografado. Ajuste a prospecção do Caçador aqui.',
};

/** Abre a dica de uso de um espaço (botão "?" na sidebar). */
function openHelpTip(viewId) {
  const dica = HELP_DICAS[viewId] || HELP_DICAS.dashboard;
  let tip = document.querySelector('.help-tip-pop');
  if (!tip) {
    tip = el('div', 'help-tip-pop', '');
    document.body.appendChild(tip);
    tip.addEventListener('click', () => tip.classList.remove('show'));
  }
  tip.innerHTML = `
    <button class="help-tip-close" data-closeHelp title="Fechar" aria-label="Fechar">${ICONS.fechar}</button>
    <div class="help-tip-body">${dica}</div>
  `;
  tip.querySelector('[data-closeHelp]').addEventListener('click', () => tip.classList.remove('show'));
  tip.classList.add('show');
}

function openCmdk(term) {
  const shell = document.querySelector('.ecomim-shell');
  if (!shell) return;
  let box = shell.querySelector('.cmdk');
  if (!box) {
    box = el('div', 'cmdk', `<div class="cmdk-box"><input class="cmdk-input" id="cmdk-input" placeholder="Buscar leads, clientes, projetos… ou navegar" /><div class="cmdk-list" id="cmdk-list"></div></div>`);
    shell.appendChild(box);
    const cmdkInput = box.querySelector('#cmdk-input');
    if (cmdkInput) {
      cmdkInput.addEventListener('input', (e) => renderCmdk(e.target.value));
      cmdkInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') box.classList.remove('open');
      });
    }
    box.addEventListener('click', (e) => { if (e.target === box) box.classList.remove('open'); });
  }
  box.classList.add('open');
  const input = box.querySelector('#cmdk-input');
  if (input) {
    input.value = term || '';
    input.focus();
  }
  renderCmdk(term || '');
}

function renderCmdk(term) {
  const box = document.querySelector('.cmdk');
  if (!box) return;
  const list = box.querySelector('#cmdk-list');
  if (!list) return;
  list.innerHTML = '';
  boostCmdk();
  const itens = [];
  VIEWS.forEach((v) => itens.push({ title: v.nome, icon: v.icone, action: () => { if (v.id === 'cacador' && window.ECOMIM_HUNTER) window.ECOMIM_HUNTER.init(); renderView(v.id); box.classList.remove('open'); } }));
  if (term && term.length >= 2) {
    features.helpers.searchGlobal(term).forEach((r) => itens.push({
      title: r.titulo,
      icon: r.icone,
      sub: r.sub,
      action: () => {
        box.classList.remove('open');
        if (r.tipo === 'lead') openLeadDetail(r.id);
        if (r.tipo === 'cliente') openClienteDetail(r.id);
        if (r.tipo === 'projeto') openProjetoDetail(r.id);
        if (r.tipo === 'ticket') openTicketDetail(r.id);
        if (r.tipo === 'campanha') renderView('marketing');
        if (r.tipo === 'tarefa') { renderView('agenda'); }
        if (r.tipo === 'colaborador') renderView('rh');
      },
    }));
  }
  const q = (term || '').toLowerCase();
  const filtrados = itens.filter((i) => !q || i.title.toLowerCase().includes(q) || (i.sub || '').toLowerCase().includes(q));
  if (!filtrados.length) list.appendChild(el('div', 'cmdk-empty', 'Nada encontrado.'));
  filtrados.slice(0, 20).forEach((i) => {
    const item = el('div', 'cmdk-item', `<span>${i.icon}</span><span>${esc(i.title)}</span>${i.sub ? `<span class="ck">${esc(i.sub)}</span>` : ''}`);
    item.addEventListener('click', i.action);
    list.appendChild(item);
  });
}

function boostCmdk() {
  if (!window.ECOMIM_HUNTER || !E.modules) return;
  const hunter = window.ECOMIM_HUNTER;
  const total = hunter.DB.leads.length;
  const naFila = hunter.DB.leads.filter((l) => l.status === 'na_fila').length;
  const content = document.querySelector('.ecomim-content');
  const current = content ? (content.dataset.view || '') : '';
  if (current !== 'cacador') return;
  const card = document.querySelector('.hunter-topbar') || null;
  // nada extra — o rodapé é tratado no render
}

function closeAllPanels() {
  document.querySelectorAll('.cmdk').forEach((b) => b.classList.remove('open'));
  document.querySelectorAll('.notif-panel').forEach((b) => b.classList.remove('open'));
  document.querySelectorAll('.lead-detail-panel').forEach((b) => b.classList.remove('open'));
}

/* ------------------------------------------------------------------ *
 * INICIALIZAÇÃO
 * ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', () => {
  E.init();
  if (window.ECOMIM_HUNTER) window.ECOMIM_HUNTER.init();
  applySavedTheme();
  renderApp();
  // Verificação automática do Agente Supervisor (assíncrona, não bloqueia o boot)
  if (window.NEITZEL_IA && window.NEITZEL_IA.verificarSistema) {
    try { setTimeout(() => { window.NEITZEL_IA.verificarSistema(); }, 4000); } catch (e) { /* não bloqueia o boot */ }
  }
  // Observa mudanças de banco em outras abas
  window.addEventListener('ecomim:db-changed', () => {
    E.db.load();
    refreshNavCounts();
    toast('Dados atualizados de outra aba', 'info');
  });
});

// Exposição para ferramentas de teste/depuração (sem efeito na operação)
if (typeof window !== 'undefined') {
  window.__ECOMIM_APP = window.ECOMIM_APP = { renderView, openLeadDetail, openCmdk, toggleAiPanel, closeAllPanels, bindShell, renderApp, refreshNavCounts };
}
