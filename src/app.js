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

/** Balão de boas-vindas premium — arte com identidade NEITZEL (brilho, brinde e selo). */
function toastHero(titulo, subtitulo) {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const t = el('div', 'toast-hero', '');
  t.innerHTML = `
    <div class="th-shine" aria-hidden="true"></div>
    <div class="th-head">
      <span class="th-selo">N</span>
      <div class="th-titulos">
        <b>${esc(titulo || saudacao + '!')}</b>
        ${subtitulo ? `<span>${esc(subtitulo)}</span>` : '<span>Sistema Digital · tudo operando em casa</span>'}
      </div>
      <button class="th-x" title="Fechar" aria-label="Fechar">×</button>
    </div>
    <div class="th-foot"><span class="th-dot"></span>NEITZEL — Sistema Empresarial Digital</div>`;
  c.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  const fechar = () => { t.classList.remove('show'); setTimeout(() => t.remove(), 420); };
  t.querySelector('.th-x').addEventListener('click', fechar);
  setTimeout(fechar, 6500);
}

/** Insight de IA inline — mostra uma caixa de sugestão no topo da view atual.
 *  Respeita as configurações de IA & Agentes (pode ser desligado pelo usuário). */
function inlineInsight(texto, titulo = 'Insight da IA') {
  const ap = lerAparencia();
  if (ap.iaAtiva === false || ap.agentesAtivos === false) return;
  if (!ap.notificacoesIA && titulo !== 'Insight da IA') return;
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
  { id: 'estrategia', nome: 'Estratégia & Previsão', icone: 'bi' },
  { id: 'memoria', nome: 'Atividades & Memória', icone: 'memoria' },
  { id: 'seguranca', nome: 'Segurança & Diagnóstico', icone: 'seguranca' },
  { id: 'config', nome: 'Configurações', icone: 'config' },
];

const NAV_SECTIONS = [
  { nome: 'Operação', itens: ['dashboard', 'leads', 'funil'] },
  { nome: 'Agenda', itens: ['planner', 'agenda'] },
  { nome: 'Catálogo', itens: ['servicos', 'produtos', 'estoque'] },
  { nome: 'Operação & Gestão', itens: ['atendimento_ops', 'financeiro', 'atendimento', 'clientes', 'projetos', 'marketing', 'rh'] },
  { nome: 'Inteligência', itens: ['bi', 'inteligencia', 'estrategia'] },
  { nome: 'Sistema', itens: ['memoria', 'seguranca', 'config'] },
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
  const apNav = lerAparencia();
  const navItens = [];
  NAV_SECTIONS.forEach((sec) => {
    // Grupo recolhível (redesign: menos itens visíveis, hierarquia clara)
    const fechado = apNav.menu === 'topo' ? false : gruposFechados().includes(sec.nome);
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
      // Tooltip com a essência do espaço (1ª frase da dica, sem tags)
      const dicaBruta = HELP_DICAS[id] || '';
      const resumoDica = dicaBruta.replace(/<[^>]*>/g, '').split(/(?<=\.)\s/)[0] || '';
      if (resumoDica) navBtn.title = resumoDica.slice(0, 160);
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
  const apLogo = lerAparencia();
  const logoHtml = apLogo.logoDataUrl
    ? `<img class="ecomim-brand-logo ecomim-brand-img" src="${apLogo.logoDataUrl}" alt="logo" />`
    : `<div class="ecomim-brand-logo ecomim-brand-logo-nz">N</div>`;
  const nomeEmpresa = String(apLogo.empresa || '').trim() || String((E.db.get().config && E.db.get().config.empresa && E.db.get().config.empresa.nome) || '').trim();
  const subtituloBrand = nomeEmpresa || I18N.sufixo;
  const brand = el('div', 'ecomim-brand', `${logoHtml}<div><div class="ecomim-brand-name">${esc(I18N.titulo)}</div><div class="ecomim-brand-sub">${esc(subtituloBrand)}</div></div>`);
  const footer = el('div', 'ecomim-sidebar-footer', `
    <button class="btn btn-sm btn-ghost" data-action="cmdk-buscar" title="Buscar em tudo (Ctrl+K)" style="width:100%;justify-content:center;margin-bottom:6px">⌕ Buscar · Ctrl+K</button>
    <button class="btn btn-sm btn-ghost" data-action="collapse">◀ Colapsar</button>`);
  const aside = el('aside', 'ecomim-sidebar' + (apLogo.menu === 'compacta' ? ' collapsed' : ''), '', brand, ...navItens, footer);
  return aside;
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
  // Obra de fundo: a logo da empresa transformada em arte (duotone + aurora viva).
  const fundoArte = el('div', 'nz-fundo-arte', `
    <div class="fa-foto" aria-hidden="true"></div>
    <div class="fa-aurora" aria-hidden="true"><i></i><i></i><i></i></div>
    <canvas class="fa-chuva" aria-hidden="true"></canvas>
  `);
  main.insertBefore(fundoArte, main.firstChild);
  iniciarChuvaCodigo(fundoArte.querySelector('.fa-chuva'));
  // Fundo discreto do sistema: particulas suaves + brilho diagonal raro (CSS puro)
  const fundoSuave = el('div', 'fundo-suave', '<span class="fp f1"></span><span class="fp f2"></span><span class="fp f3"></span><span class="fp f4"></span><span class="fp f5"></span><span class="fs-brilho"></span>');
  main.insertBefore(fundoSuave, fundoArte.nextSibling);

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
 * CHUVA DE CÓDIGO — letras/números pequenos caindo sobre a arte de
 * fundo (clima hacker/programação). Leve: pausa quando a aba fica
 * oculta, quando o fundo é "padrão" e respeita no-anim.
 * ------------------------------------------------------------------ */

function iniciarChuvaCodigo(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const GLIFOS = '01<>{}[]#$%&*+=/\\|?~^;:0123456789ABCDEF';
  let W = 0, H = 0, raf = 0, t = 0, visivel = true;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const reduzir = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function dimensionar() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    criarColunas();
  }

  let colunas = [];
  function criarColunas() {
    const passo = 18 * dpr;
    const n = Math.max(1, Math.floor(canvas.width / passo));
    colunas = Array.from({ length: n }, (__, i) => ({
      x: i * passo,
      y: Math.random() * -canvas.height,
      vel: (0.9 + Math.random() * 1.6),
      rastro: 5 + Math.floor(Math.random() * 7),
      ativa: Math.random() < 0.55, // nem toda coluna cai ao mesmo tempo
      troca: Math.random(),
    }));
  }

  function corBase() {
    const COR_TEMA = document.documentElement.getAttribute('data-theme') === 'light';
    const POR_COR = { ambar: [245, 158, 11], oceano: [56, 189, 248], vinho: [244, 63, 94], roxo: [167, 139, 250], matrix: [74, 222, 128] };
    const cor = POR_COR[document.documentElement.getAttribute('data-arte-cor') || ''];
    if (cor) {
      // no claro, escurece para manter contraste sobre papel
      return COR_TEMA ? cor.map((v) => Math.round(v * 0.55)) : cor;
    }
    return COR_TEMA ? [17, 113, 74] : [62, 207, 142];
  }

  function frame() {
    if (!canvas.isConnected) { cancelAnimationFrame(raf); return; }
    raf = requestAnimationFrame(frame);
    t++;
    if (!visivel || document.hidden || reduzir) return;
    if (document.documentElement.getAttribute('data-fundo') === 'padrao') return;
    if (document.documentElement.classList.contains('no-anim')) return;
    if (W !== canvas.clientWidth || H !== canvas.clientHeight) dimensionar();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const [r, g, b] = corBase();
    ctx.font = `600 ${Math.round(11 * dpr)}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'center';
    for (const c of colunas) {
      if (!c.ativa) { if (Math.random() < 0.0015) { c.ativa = true; c.y = Math.random() * -H * 0.4; } continue; }
      c.y += c.vel * dpr;
      if (c.troca < 0.06 && Math.random() < 0.04) c.ativa = false; // desliga sozinha às vezes
      const glyphY = c.y / dpr;
      if (glyphY - c.rastro > H + 20) { c.y = Math.random() * -H * 0.3; c.vel = 0.9 + Math.random() * 1.6; }
      for (let k = 0; k < c.rastro; k++) {
        const yy = glyphY - k * 13;
        if (yy < -14 || yy > H + 14) continue;
        const alfa = (1 - k / c.rastro) * (k === 0 ? 0.95 : 0.42);
        ctx.fillStyle = `rgba(${r},${g},${b},${alfa.toFixed(3)})`;
        const gi = ((t + c.x | 0) * 31 + k * 17 + (yy | 0)) % GLIFOS.length;
        const glifo = GLIFOS[Math.abs(gi)];
        if (k === 0 || Math.random() > 0.25) ctx.fillText(glifo, c.x / dpr, yy);
      }
    }
  }

  document.addEventListener('visibilitychange', () => { visivel = !document.hidden; });
  window.addEventListener('resize', dimensionar, { passive: true });
  dimensionar();
  frame();
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
    } else {
      // Sem notificação de erro na tela de login — apenas limpa o campo.
      input.value = '';
      input.focus();
    }
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
    msg.style.color = 'var(--e-green)';
    msg.textContent = 'Senha redefinida com sucesso. Volte e entre com a nova senha.';
    setTimeout(showLogin, 1200);
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
    const apSplash = lerAparencia();
    const s = document.createElement('div');
    s.id = 'nz-splash';
    s.style.pointerEvents = 'none'; // decorativo: nunca bloqueia cliques do sistema
    const splashLogo = apSplash.logoDataUrl
      ? '<img class="splash-logo ecomim-brand-img" src="' + apSplash.logoDataUrl + '" alt="logo" style="width:74px;height:74px;object-fit:contain" />'
      : '<div class="splash-logo">N</div>';
    s.innerHTML =
      '<div class="splash-card">' +
        '<div class="splash-logo-wrap">' +
          '<span class="splash-ring r1"></span><span class="splash-ring r2"></span>' +
          splashLogo +
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
  // splash é pointer-events:none — fecha só pelo temporizador
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
  shell.querySelectorAll('[data-action="cmdk-buscar"]').forEach((b) => b.addEventListener('click', () => openCmdk()));
  // Véu que fecha a sidebar no toque (mobile) — criado/removido junto com .mobile-open
  const fecharNavMobile = () => {
    document.querySelector('.ecomim-sidebar')?.classList.remove('mobile-open');
    document.querySelector('.nav-veu')?.remove();
  };
  const sbObs = document.querySelector('.ecomim-sidebar');
  if (sbObs) {
    new MutationObserver(() => {
      const aberta = sbObs.classList.contains('mobile-open');
      let veu = document.querySelector('.nav-veu');
      if (aberta && !veu) {
        veu = el('div', 'nav-veu', '');
        document.body.appendChild(veu);
        veu.addEventListener('click', fecharNavMobile);
      } else if (!aberta && veu) veu.remove();
      // Com o menu aberto, o fundo não rola (comportamento de app nativo)
      try { document.documentElement.style.overflow = aberta ? 'hidden' : ''; } catch (e) {}
    }).observe(sbObs, { attributes: true, attributeFilter: ['class'] });
  }
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
  try { salvarAparencia({ tema: atual }); } catch (e) {}
  const btn = document.getElementById('btn-tema');
  if (btn) {
    btn.innerHTML = atual === 'dark' ? ICONS.lua : ICONS.sol;
    btn.title = atual === 'dark' ? 'Tema escuro' : 'Tema claro';
  }
}

function refreshNavCounts() {
  let agendaHoje = 0;
  try { agendaHoje = E.modules.agenda.today().length; } catch (e) {}
  let ticketsAbertos = 0;
  try {
    const atd = E.modules.atendimento;
    const lista = atd && (atd.tickets || (atd.listar && atd.listar()) || []);
    ticketsAbertos = (lista || []).filter((t) => t && !['resolvido', 'fechado'].includes(String(t.status))).length;
  } catch (e) {}
  let estoqueBaixo = 0;
  try {
    const O = window.NEITZEL_OPS;
    if (O && O.produtos && typeof O.produtos.ativos === 'function') {
      estoqueBaixo = (O.produtos.ativos() || []).filter((p) => Number(p.estoque || 0) <= Number(p.estoqueMinimo || p.minimo || 0)).length;
    }
  } catch (e) {}
  const counts = {
    fila: E.db.get().fila.length,
    leads: E.db.get().leads.length,
    tarefas: E.modules.tarefas.pendentes().length,
    planner: E.modules.tarefas.pendentes().length,
    agenda: agendaHoje,
    atendimento: ticketsAbertos,
    atendimento_ops: ticketsAbertos,
    estoque: estoqueBaixo,
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
  // Redirecionamentos de compatibilidade (views unificadas)
  if (id === 'atividades' || id === 'suporte') id = id === 'suporte' ? 'seguranca' : 'memoria';
  ui.view = id;
  document.querySelectorAll('.ecomim-nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === id);
  });
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
    case 'estrategia': renderEstrategia(content); break;
    case 'memoria': renderMemoria(content); break;
    case 'seguranca': renderSeguranca(content); break;
    case 'config': renderConfig(content); break;
  }
  // Mobile: tabelas largas rolam dentro de um trilho próprio (a página nunca estoura)
  content.querySelectorAll('.table').forEach((t) => {
    const pai = t.parentElement;
    if (!pai || pai.classList.contains('tbl-scroll')) return;
    const trilho = document.createElement('div');
    trilho.className = 'tbl-scroll';
    pai.insertBefore(trilho, t);
    trilho.appendChild(t);
  });
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

/* ------------------------------------------------------------------ *
 * DASHBOARD EXECUTIVO (arte + dados, interligado ao sistema real)
 * ------------------------------------------------------------------ */

const DBX_ATIVIDADE = {
  'lead.criado': ['L', 'Lead cadastrado', 'e-brand'],
  'lead.atualizado': ['L', 'Lead atualizado', 'e-brand'],
  'lead.etapa': ['F', 'Lead mudou de etapa', 'e-violet'],
  'lead.excluido': ['L', 'Lead excluído', 'e-danger'],
  'lead.fila_aprovado': ['OK', 'Lead aprovado da fila', 'e-green'],
  'lead.fila_rejeitado': ['X', 'Lead rejeitado da fila', 'e-danger'],
  'cliente.criado': ['C', 'Novo cliente', 'e-green'],
  'cliente.atualizado': ['C', 'Cliente atualizado', 'e-green'],
  'agenda.criado': ['A', 'Agendamento criado', 'e-cyan'],
  'agenda.atualizado': ['A', 'Agendamento atualizado', 'e-cyan'],
  'financeiro.conta_criada': ['$', 'Lançamento financeiro', 'e-orange'],
  'financeiro.conta_atualizada': ['$', 'Conta atualizada', 'e-orange'],
  'payment.completed': ['$', 'Pagamento recebido', 'e-green'],
  'servico.criado': ['S', 'Serviço criado', 'e-violet'],
  'servico.atualizado': ['S', 'Serviço atualizado', 'e-violet'],
  'produto.criado': ['P', 'Produto criado', 'e-cyan'],
  'estoque.movimentado': ['E', 'Estoque movimentado', 'e-orange'],
  'projeto.criado': ['J', 'Projeto criado', 'e-violet'],
  'ticket_criado': ['T', 'Ticket aberto', 'e-orange'],
  'atendimento.ticket_criado': ['T', 'Ticket aberto', 'e-orange'],
  'sistema.iniciado': ['N', 'Sistema iniciado', 'e-brand'],
};

/** Curva suave (Catmull-Rom → Bézier) para linhas orgânicas. */
function dbxSuave(pts) {
  if (!pts.length) return '';
  if (pts.length < 3) return pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join('');
  let path = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    path += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return path;
}

function dbxCurto(cents) {
  const v = cents / 100;
  if (Math.abs(v) >= 1000000) return 'R$' + (v / 1000000).toFixed(1).replace('.', ',') + 'M';
  if (Math.abs(v) >= 1000) return 'R$' + (v / 1000).toFixed(1).replace('.', ',') + 'k';
  return 'R$' + Math.round(v);
}

/** Contagem animada (count-up) até o valor final. */
function dbxContar(elm, alvo, tipo) {
  const dur = 950, t0 = performance.now();
  const passo = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    const v = alvo * e;
    elm.textContent = tipo === 'money' ? E.fmtMoney(v) : String(Math.round(v));
    if (k < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

/** Fundo vivo do painel: rede de nós conectados em deriva lenta. */
function iniciarDashBg(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let W = 0, H = 0, raf = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const reduced = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.documentElement.classList.contains('no-anim');
  const nos = Array.from({ length: 34 }, () => ({
    x: Math.random(), y: Math.random(),
    vx: (Math.random() - 0.5) * 0.00035, vy: (Math.random() - 0.5) * 0.00035,
    r: Math.random() * 1.6 + 0.7,
  }));
  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });
  const cor = () => getComputedStyle(document.documentElement).getPropertyValue('--e-brand').trim() || '#22c55e';
  function frame() {
    ctx.clearRect(0, 0, W, H);
    const c = cor();
    nos.forEach((n) => { n.x += n.vx; n.y += n.vy; if (n.x < 0 || n.x > 1) n.vx *= -1; if (n.y < 0 || n.y > 1) n.vy *= -1; });
    for (let i = 0; i < nos.length; i++) {
      for (let j = i + 1; j < nos.length; j++) {
        const dx = (nos[i].x - nos[j].x) * W, dy = (nos[i].y - nos[j].y) * H;
        const dist = Math.hypot(dx, dy);
        if (dist < 150) {
          ctx.strokeStyle = c; ctx.globalAlpha = (1 - dist / 150) * 0.09; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(nos[i].x * W, nos[i].y * H); ctx.lineTo(nos[j].x * W, nos[j].y * H); ctx.stroke();
        }
      }
      ctx.fillStyle = c; ctx.globalAlpha = 0.16;
      ctx.beginPath(); ctx.arc(nos[i].x * W, nos[i].y * H, nos[i].r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!reduced) raf = requestAnimationFrame(frame);
  }
  frame();
}

/** Gráfico principal: área dupla entradas × saídas com tooltip. */
function dbxChartFluxo(container, serie, periodo) {
  const N = serie.length;
  const W = 640, H = 250, L = 46, R = 14, T = 16, B = 28;
  const pw = W - L - R, ph = H - T - B;
  const maxV = Math.max(1, ...serie.map((s) => Math.max(s.entradas, s.saidas)));
  const x = (i) => L + (N <= 1 ? pw / 2 : (i * pw) / (N - 1));
  const y = (v) => T + ph - (v / maxV) * ph;
  const pin = serie.map((s, i) => [x(i), y(s.entradas)]);
  const pout = serie.map((s, i) => [x(i), y(s.saidas)]);
  const linIn = dbxSuave(pin), linOut = dbxSuave(pout);
  const areaIn = linIn + `L${x(N - 1)},${T + ph}L${x(0)},${T + ph}Z`;
  const areaOut = linOut + `L${x(N - 1)},${T + ph}L${x(0)},${T + ph}Z`;
  const passosY = 4;
  let grade = '';
  for (let g = 0; g <= passosY; g++) {
    const vy = y((maxV * g) / passosY);
    grade += `<line class="dbx-axis" x1="${L}" y1="${vy}" x2="${W - R}" y2="${vy}" opacity="${g ? 0.6 : 1}" />`;
    grade += `<text class="dbx-axis-txt" x="${L - 7}" y="${vy + 3}" text-anchor="end">${dbxCurto((maxV * g) / passosY)}</text>`;
  }
  let rotulos = '';
  const cada = periodo === 'semana' ? 1 : Math.ceil(N / 6);
  serie.forEach((s, i) => {
    if (i % cada !== 0 && i !== N - 1) return;
    const lbl = s.data.toLocaleDateString('pt-BR', periodo === 'semana' ? { weekday: 'short' } : { day: '2-digit', month: '2-digit' });
    rotulos += `<text class="dbx-axis-txt" x="${x(i)}" y="${H - 8}" text-anchor="middle">${lbl}</text>`;
  });
  container.innerHTML = `
    <svg class="dbx-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="aspect-ratio:${W}/${H}">
      <defs>
        <linearGradient id="dbxAIn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--e-green)" stop-opacity=".30" /><stop offset="100%" stop-color="var(--e-green)" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="dbxAOut" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--e-danger)" stop-opacity=".24" /><stop offset="100%" stop-color="var(--e-danger)" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${grade}${rotulos}
      <path class="dbx-area" d="${areaOut}" fill="url(#dbxAOut)" />
      <path class="dbx-area" d="${areaIn}" fill="url(#dbxAIn)" />
      <path class="dbx-line" style="stroke:var(--e-danger)" d="${linOut}" />
      <path class="dbx-line" style="stroke:var(--e-green);animation-delay:.25s" d="${linIn}" />
      <circle class="dbx-dot-hl" r="4.5" fill="var(--e-green)" stroke="var(--surface)" stroke-width="2" opacity="0" />
    </svg>`;
  const tip = el('div', 'dbx-tip', '');
  container.appendChild(tip);
  const hl = container.querySelector('.dbx-dot-hl');
  const svg = container.querySelector('svg');
  svg.addEventListener('mousemove', (ev) => {
    const rect = svg.getBoundingClientRect();
    const rel = ((ev.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(N - 1, Math.round(((rel - L) / pw) * (N - 1))));
    const s = serie[i];
    tip.innerHTML = `<b>${s.data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</b>
      <div class="row"><span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--e-green);margin-right:5px"></i>Entradas</span><span>${E.fmtMoney(s.entradas)}</span></div>
      <div class="row"><span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--e-danger);margin-right:5px"></i>Saídas</span><span>${E.fmtMoney(s.saidas)}</span></div>`;
    const px = (x(i) / W) * rect.width, py = (y(Math.max(s.entradas, s.saidas)) / H) * rect.height;
    tip.style.left = Math.min(rect.width - 140, px + 12) + 'px';
    tip.style.top = Math.max(4, py - 20) + 'px';
    tip.classList.add('show');
    if (hl) { hl.setAttribute('cx', x(i)); hl.setAttribute('cy', y(s.entradas)); hl.setAttribute('opacity', '1'); }
  });
  svg.addEventListener('mouseleave', () => { tip.classList.remove('show'); if (hl) hl.setAttribute('opacity', '0'); });
}

/** Donut do funil de leads. */
function dbxDonut(container, fatias) {
  const total = fatias.reduce((a, f) => a + f.valor, 0) || 1;
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  const segs = fatias.map((f) => {
    const frac = f.valor / total;
    const seg = { ...f, dash: frac * C, gap: C - frac * C, off: -acc * C };
    acc += frac;
    return seg;
  }).filter((s) => s.dash > 0.5);
  container.innerHTML = `
    <svg class="dbx-chart" viewBox="0 0 160 160" style="max-width:190px;margin:0 auto">
      ${segs.map((s, i) => `<circle class="dbx-donut-seg" cx="80" cy="80" r="${R}" fill="none" stroke-width="17"
        stroke="${s.cor}" stroke-linecap="butt"
        stroke-dasharray="0 ${C}" stroke-dashoffset="0" transform="rotate(-90 80 80)"
        data-final="${s.dash.toFixed(2)} ${(C - s.dash).toFixed(2)}" data-off="${s.off.toFixed(2)}"
        style="animation-delay:${i * 90}ms"><title>${esc(s.nome)}: ${s.valor}</title></circle>`).join('')}
      <text class="dbx-donut-center v" x="80" y="82">${total}</text>
      <text class="dbx-donut-center l" x="80" y="98">leads no funil</text>
    </svg>`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    container.querySelectorAll('.dbx-donut-seg').forEach((c) => {
      c.setAttribute('stroke-dasharray', c.dataset.final);
      c.setAttribute('stroke-dashoffset', c.dataset.off);
    });
  }));
}

/** Barras: agendamentos por dia da semana no período. */
function dbxBarras(container, porDiaSemana) {
  const nomes = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const vals = [1, 2, 3, 4, 5, 6, 0].map((dw) => porDiaSemana[dw] || 0);
  const maxV = Math.max(1, ...vals);
  const W = 320, H = 170, B = 22, T = 10, bw = 30, gap = (W - 14 - 7 * bw) / 6;
  container.innerHTML = `
    <svg class="dbx-chart" viewBox="0 0 ${W} ${H}">
      <defs><linearGradient id="dbxBarFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--e-brand)" /><stop offset="100%" stop-color="var(--e-brand)" stop-opacity=".35" />
      </linearGradient></defs>
      <line class="dbx-axis" x1="8" y1="${H - B}" x2="${W - 6}" y2="${H - B}" />
      ${vals.map((v, i) => {
        const hh = Math.max(2, (v / maxV) * (H - B - T));
        const xx = 14 + i * (bw + gap);
        return `<rect class="dbx-bar" x="${xx}" y="${H - B - hh}" width="${bw}" height="${hh}" style="animation-delay:${i * 70}ms"><title>${v}</title></rect>
          <text class="dbx-axis-txt" x="${xx + bw / 2}" y="${H - 7}" text-anchor="middle">${nomes[i]}</text>
          <text class="dbx-axis-txt" x="${xx + bw / 2}" y="${H - B - hh - 4}" text-anchor="middle" opacity=".85">${v || ''}</text>`;
      }).join('')}
    </svg>`;
}

/** Sparkline de KPI. */
function dbxSpark(vals, cor) {
  const W = 150, H = 34, maxV = Math.max(...vals, 1), minV = Math.min(...vals, 0);
  const pts = vals.map((v, i) => [vals.length <= 1 ? W / 2 : (i * W) / (vals.length - 1), H - 3 - ((v - minV) / (maxV - minV || 1)) * (H - 7)]);
  const linha = dbxSuave(pts);
  const area = linha + `L${W},${H}L0,${H}Z`;
  return `<svg class="dbx-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="dbxSparkFill-${cor.replace(/[^a-z]/gi, '')}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${cor}" stop-opacity=".28"/><stop offset="100%" stop-color="${cor}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#dbxSparkFill-${cor.replace(/[^a-z]/gi, '')})"/>
    <path d="${linha}" fill="none" stroke="${cor}" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
}

function renderDashboard(c) {
  (window.__dbxTimers || []).forEach(clearInterval);
  window.__dbxTimers = [];
  const estado = { periodo: window.__dbxPeriodo || 'mes' };

  const wrap = el('div', 'dbx-wrap', '');
  wrap.appendChild(el('div', 'dbx-orb dbx-orb-1', ''));
  wrap.appendChild(el('div', 'dbx-orb dbx-orb-2', ''));
  wrap.appendChild(el('div', 'dbx-orb dbx-orb-3', ''));
  const bg = el('canvas', 'dbx-bg', '');
  wrap.appendChild(bg);
  const palco = el('div', '', '');
  wrap.appendChild(palco);
  c.appendChild(wrap);

  /** Coleta os dados REAIS do sistema para o período. */
  function dados(periodo) {
    const dias = periodo === 'semana' ? 7 : 30;
    const base = new Date(); base.setHours(0, 0, 0, 0);
    const inicio = new Date(base.getTime() - (dias - 1) * 86400000);
    const serie = Array.from({ length: dias }, (_, i) => ({
      data: new Date(inicio.getTime() + i * 86400000),
      entradas: 0, saidas: 0, leads: 0, clientes: 0, agendamentos: 0,
    }));
    const idxDe = (iso) => {
      if (!iso) return -1;
      const dt = new Date(iso); if (isNaN(dt)) return -1; dt.setHours(0, 0, 0, 0);
      const i = Math.round((dt.getTime() - inicio.getTime()) / 86400000);
      return i >= 0 && i < dias ? i : -1;
    };
    try { E.modules.financeiro.contas.forEach((ct) => { const i = idxDe(ct.pagoEm || ct.vencimento); if (i >= 0) { if (ct.tipo === 'receber') serie[i].entradas += ct.valor; else serie[i].saidas += ct.valor; } }); } catch (e) {}
    try { d().leads.forEach((l) => { const i = idxDe(l.created); if (i >= 0) serie[i].leads++; }); } catch (e) {}
    try { (E.modules.clientes.clientes || []).forEach((cl) => { const i = idxDe(cl.created); if (i >= 0) serie[i].clientes++; }); } catch (e) {}
    try { E.modules.agenda.events.forEach((ev) => { const i = idxDe(ev.quando); if (i >= 0) serie[i].agendamentos++; }); } catch (e) {}

    const iniAnt = new Date(inicio.getTime() - dias * 86400000);
    const noPeriodo = (iso, ini, fim) => { if (!iso) return false; const dt = new Date(iso); return !isNaN(dt) && dt >= ini && dt < fim; };
    const fim = new Date(inicio.getTime() + dias * 86400000);
    const contasAtuais = E.modules.financeiro.contas.filter((ct) => noPeriodo(ct.pagoEm || ct.vencimento, inicio, fim));
    const contasAntes = E.modules.financeiro.contas.filter((ct) => noPeriodo(ct.pagoEm || ct.vencimento, iniAnt, inicio));
    const soma = (arr, tp) => arr.filter((c) => c.tipo === tp).reduce((a, c) => a + c.valor, 0);
    const resumo = {
      entradas: soma(contasAtuais, 'receber'), saidas: soma(contasAtuais, 'pagar'),
      lucro: soma(contasAtuais, 'receber') - soma(contasAtuais, 'pagar'),
      leads: serie.reduce((a, s) => a + s.leads, 0),
      clientes: serie.reduce((a, s) => a + s.clientes, 0),
      agendamentos: serie.reduce((a, s) => a + s.agendamentos, 0),
      ant: {
        entradas: soma(contasAntes, 'receber'), saidas: soma(contasAntes, 'pagar'),
        leads: d().leads.filter((l) => noPeriodo(l.created, iniAnt, inicio)).length,
        clientes: (E.modules.clientes.clientes || []).filter((cl) => noPeriodo(cl.created, iniAnt, inicio)).length,
        agendamentos: E.modules.agenda.events.filter((ev) => noPeriodo(ev.quando, iniAnt, inicio)).length,
      },
      porDiaSemana: {},
    };
    serie.forEach((s) => { const dw = s.data.getDay(); resumo.porDiaSemana[dw] = (resumo.porDiaSemana[dw] || 0) + s.agendamentos; });
    return { serie, resumo, dias };
  }

  function tendencia(atual, antes, bomQuandoSobe) {
    if (!antes && !atual) return { txt: '=', cls: 'flat' };
    if (!antes) return { txt: ' novo', cls: (bomQuandoSobe ? 'up' : 'down') };
    const pct = Math.round(((atual - antes) / antes) * 100);
    if (pct === 0) return { txt: '= 0%', cls: 'flat' };
    const sobe = pct > 0;
    const bom = bomQuandoSobe ? sobe : !sobe;
    return { txt: `${sobe ? '' : ''} ${Math.abs(pct)}%`, cls: bom ? 'up' : 'down' };
  }

  function desenhar() {
    palco.innerHTML = '';
    const { serie, resumo, dias } = dados(estado.periodo);
    const b = E.modules.bi;

    /* Hero */
    const hora = new Date().getHours();
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    const hero = el('div', 'dbx-hero dbx-in', '');
    hero.innerHTML = `
      <div class="dbx-hello">
        <h1>${saudacao}. Este é o seu painel.</h1>
        <p>Visão executiva ${estado.periodo === 'semana' ? 'dos últimos 7 dias' : 'dos últimos 30 dias'} — tudo calculado dos seus dados reais.</p>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span class="dbx-clock"><span class="dbx-live-dot"></span><span id="dbx-hora">${new Date().toLocaleTimeString('pt-BR')}</span></span>
        <div class="dbx-toggle ${estado.periodo === 'mes' ? 'mes' : ''}" id="dbx-tgl">
          <button data-p="semana" class="${estado.periodo === 'semana' ? 'on' : ''}">Semana</button>
          <button data-p="mes" class="${estado.periodo === 'mes' ? 'on' : ''}">Mês</button>
        </div>
      </div>`;
    palco.appendChild(hero);
    const tgl = hero.querySelector('#dbx-tgl');
    tgl.querySelectorAll('button').forEach((bt) => bt.addEventListener('click', () => {
      estado.periodo = bt.dataset.p; window.__dbxPeriodo = bt.dataset.p; desenhar();
    }));

    /* KPIs */
    const kpis = [
      { label: 'Novos clientes', val: resumo.clientes, ant: resumo.ant.clientes, sobeBom: true, cor: 'var(--e-green)', spark: serie.map((s) => s.clientes), icone: ICONS.clientes, tipo: 'n', clique: 'clientes' },
      { label: 'Agendamentos', val: resumo.agendamentos, ant: resumo.ant.agendamentos, sobeBom: true, cor: 'var(--e-cyan)', spark: serie.map((s) => s.agendamentos), icone: ICONS.agenda, tipo: 'n', clique: 'planner' },
      { label: 'Entradas', val: resumo.entradas, ant: resumo.ant.entradas, sobeBom: true, cor: 'var(--e-brand)', spark: serie.map((s) => s.entradas), icone: ICONS.financeiro, tipo: 'money', clique: 'financeiro' },
      { label: 'Saídas', val: resumo.saidas, ant: resumo.ant.saidas, sobeBom: false, cor: 'var(--e-danger)', spark: serie.map((s) => s.saidas), icone: ICONS.financeiro, tipo: 'money', clique: 'financeiro' },
      { label: 'Resultado', val: resumo.lucro, ant: null, sobeBom: true, cor: 'var(--e-violet)', spark: serie.map((s) => s.entradas - s.saidas), icone: ICONS.bi, tipo: 'money' },
      { label: 'Novos leads', val: resumo.leads, ant: resumo.ant.leads, sobeBom: true, cor: 'var(--e-orange)', spark: serie.map((s) => s.leads), icone: ICONS.leads, tipo: 'n', clique: 'leads' },
    ];
    const gridK = el('div', 'dbx-kpis', '');
    kpis.forEach((k, i) => {
      const tr = tendencia(k.val, k.ant, k.sobeBom);
      const card = el('div', 'dbx-kpi dbx-in', '');
      card.style.animationDelay = (i * 70) + 'ms';
      card.style.setProperty('--kpi-c', k.cor);
      card.innerHTML = `
        <div class="dbx-kpi-top">
          <span class="dbx-kpi-ico">${k.icone || ''}</span>
          <span class="dbx-trend ${tr.cls}">${tr.txt}</span>
        </div>
        <div class="dbx-kpi-value">—</div>
        <div class="dbx-kpi-label">${esc(k.label)} · ${estado.periodo === 'semana' ? '7d' : '30d'}</div>
        ${dbxSpark(k.spark, k.cor)}`;
      dbxContar(card.querySelector('.dbx-kpi-value'), k.tipo === 'money' ? k.val / 100 : k.val, k.tipo === 'money' ? 'money' : 'n');
      if (k.clique) { card.style.cursor = 'pointer'; card.title = 'Abrir ' + k.label; card.addEventListener('click', () => renderView(k.clique)); }
      gridK.appendChild(card);
    });
    palco.appendChild(gridK);

    /* Linha 2: fluxo de caixa + funil donut */
    const grid1 = el('div', 'dbx-grid', '');
    const cFluxo = el('div', 'dbx-card dbx-in', `<h4>Fluxo de caixa</h4><p class="dbx-sub">Entradas × saídas por dia — valores lançados no Financeiro.</p>`);
    cFluxo.style.animationDelay = '120ms';
    const boxFluxo = el('div', '', ''); cFluxo.appendChild(boxFluxo);
    dbxChartFluxo(boxFluxo, serie, estado.periodo);
    cFluxo.querySelector('.dbx-sub').insertAdjacentHTML('afterend',
      `<div class="dbx-legend"><span><i style="background:var(--e-green)"></i>Entradas</span><span><i style="background:var(--e-danger)"></i>Saídas</span><span style="margin-left:auto"><b>${E.fmtMoney(resumo.lucro)}</b> de resultado no período</span></div>`);
    grid1.appendChild(cFluxo);

    const cFunil = el('div', 'dbx-card dbx-in', `<h4>Funil de leads</h4><p class="dbx-sub">Distribuição atual por etapa.</p>`);
    cFunil.style.animationDelay = '190ms';
    const boxDonut = el('div', '', ''); cFunil.appendChild(boxDonut);
    const fatias = d().funil.map((f) => ({ nome: f.nome, valor: d().leads.filter((l) => l.etapa === f.id).length, cor: f.cor }));
    dbxDonut(boxDonut, fatias);
    cFunil.appendChild(el('div', 'dbx-legend', fatias.map((f) => `<span title="${esc(f.nome)}"><i style="background:${f.cor}"></i>${esc(f.nome)} <b>${f.valor}</b></span>`).join('')));
    grid1.appendChild(cFunil);
    palco.appendChild(grid1);

    /* Linha 3: agendamentos por dia · evolução de clientes · IA + prioridades */
    const grid2 = el('div', 'dbx-grid2', '');

    const cAgd = el('div', 'dbx-card dbx-in', `<h4>Ritmo de agendamentos</h4><p class="dbx-sub">Concentração por dia da semana no período.</p>`);
    cAgd.style.animationDelay = '240ms';
    const boxBar = el('div', '', ''); cAgd.appendChild(boxBar);
    dbxBarras(boxBar, resumo.porDiaSemana);
    grid2.appendChild(cAgd);

    const cCli = el('div', 'dbx-card dbx-in', `<h4>Evolução de clientes</h4><p class="dbx-sub">${resumo.clientes >= resumo.ant.clientes ? 'Base em crescimento' : 'Atenção: ritmo abaixo do período anterior'} na base de Clientes & CS.</p>`);
    cCli.style.animationDelay = '300ms';
    const acum = []; let runTot = 0;
    serie.forEach((s) => { runTot += s.clientes; acum.push(runTot); });
    cCli.insertAdjacentHTML('beforeend', dbxSpark(acum, 'var(--e-violet)'));
    cCli.insertAdjacentHTML('beforeend', `<div style="margin-top:12px;display:flex;gap:18px;font-size:12px;color:var(--text-muted)">
      <span>No período: <b style="color:var(--text);font-size:15px">${resumo.clientes}</b></span>
      <span>Total na base: <b style="color:var(--text);font-size:15px">${(E.modules.clientes.clientes || []).length}</b></span>
      <span>MRR: <b style="color:var(--text);font-size:15px">${E.fmtMoney(b.mrr())}</b></span></div>`);
    grid2.appendChild(cCli);

    const prioridades = [];
    try { const v = E.modules.financeiro.vencidas(); if (v.length) prioridades.push(`${v.length} conta(s) vencida(s)`); } catch (e) {}
    try { if (E.modules.atendimento.slaEmRisco().length) prioridades.push(`SLA em risco nos atendimentos`); } catch (e) {}
    try { if (E.modules.projetos.atrasados().length) prioridades.push(`${E.modules.projetos.atrasados().length} projeto(s) atrasado(s)`); } catch (e) {}
    const cIA = el('div', 'dbx-card dbx-in', `<h4>Inteligência do painel</h4><p class="dbx-sub">Leitura rápida da IA sobre o momento.</p>`);
    cIA.style.animationDelay = '360ms';
    const ins = el('div', 'text-muted', esc(panelInsight(d(), b, E.modules.financeiro.saldo())));
    ins.style.cssText = 'font-size:12.5px;line-height:1.65;white-space:pre-line';
    cIA.appendChild(ins);
    if (prioridades.length) {
      cIA.insertAdjacentHTML('beforeend', `<div style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--border)">
        <b style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--e-orange)">Prioridades</b>
        ${prioridades.map((p) => `<div style="font-size:12.5px;margin-top:6px;color:var(--text-muted)">• ${esc(p)}</div>`).join('')}</div>`);
    }
    const acoes = el('div', 'dbx-actions', '');
    [['Possível Cenário', 'cenario'], ['Novo lead', null], ['Nova tarefa', null]].forEach(([label]) => {
      const bt = el('button', 'btn btn-sm btn-primary', esc(label));
      bt.addEventListener('click', () => {
        if (label === 'Possível Cenário') { if (window.NEITZEL_CENARIO) window.NEITZEL_CENARIO.open(); }
        else if (label === 'Novo lead') openLeadModal();
        else openTarefaModal();
      });
      acoes.appendChild(bt);
    });
    cIA.appendChild(acoes);
    grid2.appendChild(cIA);
    palco.appendChild(grid2);

    /* Feed ao vivo — memória do sistema em tempo real */
    const cFeed = el('div', 'dbx-card dbx-in', `<h4><span class="dbx-live-dot" style="display:inline-block;margin-right:8px;vertical-align:-1px"></span>Memória do sistema — ao vivo</h4><p class="dbx-sub">Tudo que acontece fica registrado aqui com data e hora.</p>`);
    cFeed.style.animationDelay = '420ms';
    const feedBox = el('div', 'dbx-feed', '');
    cFeed.appendChild(feedBox);
    const pintarFeed = () => {
      const lista = (E.audit.list ? E.audit.list() : []).slice(-9).reverse();
      feedBox.innerHTML = lista.map((ev, i) => {
        const info = DBX_ATIVIDADE[ev.action] || [null, ev.action.replace(/[._]/g, ' '), 'e-brand'];
        const dt = new Date(ev.ts);
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        const mesmoDia = dt >= hoje;
        const horaTxt = (mesmoDia ? '' : dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' · ') +
          dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `<div class="dbx-feed-row" style="animation-delay:${i * 55}ms">
          <span class="dbx-feed-ico" style="color:var(--${info[2]});border:1px solid var(--border)">${info[0] || '•'}</span>
          <span><b>${esc(info[1])}</b>${ev.after && ev.after.nome ? ` — ${esc(String(ev.after.nome).slice(0, 42))}` : ''}</span>
          <span class="dbx-feed-time">${horaTxt}</span>
        </div>`;
      }).join('') || '<div class="text-muted" style="padding:8px">Nenhuma atividade registrada ainda.</div>';
    };
    pintarFeed();
    window.__dbxTimers.push(setInterval(pintarFeed, 8000));
    palco.appendChild(cFeed);

    /* Relógio ao vivo */
    const horaEl = palco.querySelector('#dbx-hora');
    if (horaEl) window.__dbxTimers.push(setInterval(() => { horaEl.textContent = new Date().toLocaleTimeString('pt-BR'); }, 1000));
  }

  desenhar();
  iniciarDashBg(bg);
  // Limpeza ao sair da view
  const obs = new MutationObserver(() => {
    if (!document.body.contains(wrap)) {
      (window.__dbxTimers || []).forEach(clearInterval);
      window.__dbxTimers = [];
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

/* ------------------------------------------------------------------ *
 * VIEW: ATIVIDADES & MEMÓRIA (memória viva + ciclo automático)
 * Tudo que acontece no sistema fica aqui com data e hora; a memória
 * captura as atividades do mês e arquiva sozinha (30d → arquivo,
 * 60d → PDF pronto).
 * ------------------------------------------------------------------ */

const ATIV_ROTULOS = {
  'lead.criado': ['Lead', 'Lead cadastrado no CRM'],
  'lead.atualizado': ['Lead', 'Dados do lead atualizados'],
  'lead.etapa': ['Lead', 'Lead mudou de etapa'],
  'lead.excluido': ['Lead', 'Lead excluído'],
  'lead.duplicado_recusado': ['Lead', 'Tentativa de lead duplicado recusada'],
  'lead.fila_aprovado': ['Fila', 'Lead aprovado da fila para o CRM'],
  'lead.fila_rejeitado': ['Fila', 'Lead rejeitado na fila'],
  'lead.fila_encaminhado': ['Fila', 'Lead enviado para aprovação'],
  'cliente.criado': ['Cliente', 'Novo cliente cadastrado'],
  'cliente.atualizado': ['Cliente', 'Dados do cliente atualizados'],
  'agenda.criado': ['Agenda', 'Agendamento/evento criado'],
  'agenda.atualizado': ['Agenda', 'Agendamento atualizado'],
  'agenda.excluido': ['Agenda', 'Agendamento excluído'],
  'tarefa.criada': ['Tarefa', 'Nova tarefa criada'],
  'tarefa.atualizada': ['Tarefa', 'Tarefa atualizada'],
  'financeiro.conta_criada': ['Financeiro', 'Lançamento financeiro criado'],
  'financeiro.conta_atualizada': ['Financeiro', 'Conta atualizada (pagamento/status)'],
  'financeiro.conta_removida': ['Financeiro', 'Conta removida'],
  'payment.completed': ['Financeiro', 'Pagamento concluído'],
  'servico.criado': ['Serviços', 'Serviço criado no catálogo'],
  'servico.atualizado': ['Serviços', 'Serviço atualizado'],
  'produto.criado': ['Produtos', 'Produto criado'],
  'produto.atualizado': ['Produtos', 'Produto atualizado'],
  'estoque.movimentado': ['Estoque', 'Movimentação de estoque'],
  'projeto.criado': ['Projetos', 'Projeto criado'],
  'projeto.atualizado': ['Projetos', 'Projeto atualizado'],
  'atendimento.ticket_criado': ['Atendimento', 'Ticket aberto'],
  'atendimento.ticket_atualizado': ['Atendimento', 'Ticket atualizado'],
  'marketing.campanha_criada': ['Marketing', 'Campanha criada'],
  'rh.colaborador_criado': ['RH', 'Colaborador cadastrado'],
  'sistema.iniciado': ['Sistema', 'Sistema iniciado'],
  'sistema.telefones_migrados': ['Sistema', 'Telefones migrados para o padrão DDD + número'],
  'config.empresa': ['Config', 'Dados da empresa atualizados'],
  'config.aparencia': ['Config', 'Aparência alterada'],
};

/* ------------------------------------------------------------------ *
 * CRONÔMETRO VIVO DAS MEMÓRIAS — quanto tempo passou até cada etapa.
 * Um único timer global atualiza todos os selos .cron-chip na tela.
 * ------------------------------------------------------------------ */

function cronFormato(ms) {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'min ' + String(s % 60).padStart(2, '0') + 's';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ' + String(m % 60).padStart(2, '0') + 'min';
  const d = Math.floor(h / 24);
  return d + 'd ' + (h % 24) + 'h';
}

function cronChipHtml(ts, titulo) {
  const t = Number(ts);
  if (!t) return '';
  return `<span class="cron-chip" data-ts="${t}" title="${esc(titulo || 'Cronômetro: tempo desde o registro')}"><span class="cron-dot"></span><span class="cron-val">${cronFormato(Date.now() - t)}</span></span>`;
}

setInterval(() => {
  document.querySelectorAll('.cron-chip[data-ts]').forEach((chip) => {
    const span = chip.querySelector('.cron-val');
    if (span) span.textContent = cronFormato(Date.now() - Number(chip.dataset.ts));
  });
  const sessao = document.querySelector('#cron-sessao');
  if (sessao && window.__NZ_SESSAO_INICIO) sessao.textContent = cronFormato(Date.now() - window.__NZ_SESSAO_INICIO);
}, 1000);

function renderMemoria(c) {
  /* ---------- PARTE 1: ATIVIDADES AO VIVO ---------- */
  c.appendChild(el('div', 'page-header', `<h1>Atividades & Memória</h1><p>Tudo o que acontece fica anotado aqui com data e hora — e a memória guarda o mês automaticamente.</p>`));
  const barra = el('div', 'card', `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <span style="display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--text-muted)"><span class="dbx-live-dot" style="width:8px;height:8px;border-radius:50%;background:var(--e-green);animation:pulse 1.6s infinite"></span>Capturando atividades em tempo real</span>
      <input class="input" id="at-busca" placeholder="Buscar por pessoa, ação ou detalhe..." style="flex:1;min-width:220px" />
      <select class="input" id="at-filtro" style="max-width:210px">
        <option value="">Todas as categorias</option>
        <option>Lead</option><option>Cliente</option><option>Agenda</option>
        <option>Tarefa</option><option>Financeiro</option><option>Serviços</option><option>Produtos</option>
        <option>Estoque</option><option>Projetos</option><option>Atendimento</option><option>Marketing</option>
        <option>RH</option><option>Sistema</option><option>Config</option>
      </select>
      <button class="btn btn-sm" id="at-atualizar">Atualizar</button>
    </div>
  `);
  c.appendChild(barra);

  /* Cronômetros: sessão aberta, primeiro registro de hoje e último evento */
  const agoraHoje = new Date(); agoraHoje.setHours(0, 0, 0, 0);
  const eventosTodos = E.audit.list();
  const ultimoEv = eventosTodos.length ? eventosTodos[eventosTodos.length - 1] : null;
  const primeiroHoje = eventosTodos.find((ev) => new Date(ev.ts) >= agoraHoje);
  const cardCron = el('div', 'card', `
    <h4>Cronômetro do tempo</h4>
    <p class="text-muted" style="font-size:12px;margin:2px 0 10px">O tempo corre ao vivo: quanto tempo o sistema está aberto e quanto tempo se passou até cada etapa registrada.</p>
    <div style="display:flex;gap:26px;flex-wrap:wrap">
      <div><div class="kpi-value" style="font-variant-numeric:tabular-nums" id="cron-sessao">${cronFormato(window.__NZ_SESSAO_INICIO ? Date.now() - window.__NZ_SESSAO_INICIO : 0)}</div><div class="text-muted" style="font-size:12px">sessão atual aberta</div></div>
      <div>${cronChipHtml(primeiroHoje ? new Date(primeiroHoje.ts).getTime() : null, 'Tempo desde o primeiro registro de hoje') || '<div class="kpi-value">—</div>'}<div class="text-muted" style="font-size:12px">desde o 1º registro de hoje</div></div>
      <div>${cronChipHtml(ultimoEv ? new Date(ultimoEv.ts).getTime() : null, 'Tempo desde a última atividade') || '<div class="kpi-value">—</div>'}<div class="text-muted" style="font-size:12px">desde a última atividade</div></div>
    </div>
  `);
  c.appendChild(cardCron);

  const lista = el('div', 'card', '');
  c.appendChild(lista);

  function pintar() {
    const busca = (c.querySelector('#at-busca')?.value || '').toLowerCase();
    const filtro = c.querySelector('#at-filtro')?.value || '';
    const eventos = E.audit.list().slice().reverse();
    const filtrados = eventos.filter((ev) => {
      const info = ATIV_ROTULOS[ev.action] || [null, ev.action];
      if (filtro && info[0] !== filtro) return false;
      if (!busca) return true;
      const alvo = `${info[1]} ${ev.action} ${JSON.stringify(ev.after || {})} ${JSON.stringify(ev.before || {})}`.toLowerCase();
      return alvo.includes(busca);
    });
    lista.innerHTML = `<h4>${filtrados.length} registro(s) este mês · alimentam a memória automaticamente</h4>
      <table class="table"><thead><tr><th>Data / Hora</th><th>Cronômetro</th><th>Categoria</th><th>O que aconteceu</th><th>Quem fez</th></tr></thead><tbody>${
        filtrados.slice(0, 400).map((ev) => {
          const info = ATIV_ROTULOS[ev.action] || ['', ev.action.replace(/[._]/g, ' ')];
          let detalhe = '';
          try {
            const after = ev.after || {};
            detalhe = after.nome || after.descricao || (after.id ? String(after.id).slice(0, 12) : '');
          } catch (e) {}
          const dt = new Date(ev.ts);
          const dataTxt = dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR');
          return `<tr><td style="white-space:nowrap;font-variant-numeric:tabular-nums">${dataTxt}</td>
            <td>${cronChipHtml(dt.getTime(), 'Há quanto tempo aconteceu')}</td>
            <td><span class="badge badge-green">${esc(info[0])}</span></td>
            <td><b>${esc(info[1])}</b>${detalhe ? ` <span class="text-muted">— ${esc(String(detalhe))}</span>` : ''}</td>
            <td class="text-muted">${esc((ev.actorRole === 'sistema' || !ev.actor) ? 'sistema' : ev.actor)}</td></tr>`;
        }).join('') || '<tr><td colspan="5" class="text-muted">Nenhum registro encontrado.</td></tr>'
      }</tbody></table>`;
  }
  pintar();
  barra.querySelector('#at-busca').addEventListener('input', pintar);
  barra.querySelector('#at-filtro').addEventListener('change', pintar);
  barra.querySelector('#at-atualizar').addEventListener('click', () => { pintar(); toast('Atividades atualizadas', 'info'); });

  /* Diários salvos — registro escrito de cada dia, gerado às 23:58 */
  const diarioMod = E.modules.diario;
  const cardDiario = el('div', 'card', `<h4>Diários salvos</h4><p class="text-muted" style="margin:2px 0 10px;font-size:12px">Todo dia às 23:58 o sistema guarda por escrito tudo o que aconteceu — com processo completo de salvamento.</p>`);
  const acoesD = el('div', 'btn-group', '');
  const btnGerarHoje = el('button', 'btn btn-sm btn-primary', 'Gerar registro de hoje agora');
  btnGerarHoje.addEventListener('click', () => {
    const r = diarioMod.gerar();
    if (r.ok) { toast('Registro do dia salvo na memória', 'success'); renderView('memoria'); }
    else toast(r.code === 'JA_EXISTE' ? 'O registro de hoje já existe.' : r.message || 'Não foi possível gerar', 'info');
  });
  acoesD.appendChild(btnGerarHoje);
  cardDiario.appendChild(acoesD);
  const listaD = el('div', '', '');
  listaD.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:10px';
  const entradas = (diarioMod.entradas || []).slice().reverse();
  if (!entradas.length) {
    listaD.appendChild(el('div', 'text-muted', 'Nenhum diário salvo ainda — o primeiro será gerado automaticamente às 23:58.'));
  } else {
    entradas.slice(0, 60).forEach((en) => {
      const row = el('div', 'dbx-feed-row', '');
      const dt = new Date(en.data + 'T12:00:00');
      row.innerHTML = `<span class="dbx-feed-ico" style="color:var(--e-brand);border:1px solid var(--border)">D</span>
        <span><b>${dt.toLocaleDateString('pt-BR')}</b> <span class="text-muted">· ${en.totalEventos} evento(s) registrados por escrito</span></span>
        <span class="dbx-feed-time"><button class="btn btn-xs" data-ver-diario="${esc(en.id)}">Ler</button></span>`;
      row.querySelector('[data-ver-diario]').addEventListener('click', () => openDiarioModal(en));
      listaD.appendChild(row);
    });
  }
  cardDiario.appendChild(listaD);
  c.appendChild(cardDiario);

  /* ---------- PARTE 2: CICLO DA MEMÓRIA (30d → arquivo · 60d → PDF) ---------- */
  const secaoMem = el('div', '', '');
  c.appendChild(secaoMem);
  if (window.NEITZEL_MEMORIA && window.NEITZEL_MEMORIA.render) {
    window.NEITZEL_MEMORIA.render(secaoMem);
  } else {
    secaoMem.appendChild(el('div', 'empty', 'Ciclo da memória indisponível (memoria.js não carregou).'));
  }
}

/** Modal de leitura do diário de um dia (texto integral). */
function openDiarioModal(en) {
  const dt = new Date(en.data + 'T12:00:00');
  const modal = el('div', 'modal', `
    <div class="modal-box" style="max-width:760px">
      <h3>Registro diário — ${dt.toLocaleDateString('pt-BR')}</h3>
      <pre id="diario-texto" style="white-space:pre-wrap;font-family:Consolas,monospace;font-size:12px;line-height:1.55;max-height:56vh;overflow:auto;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:14px;color:var(--text)"></pre>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>Fechar</button>
        <button class="btn btn-sm" id="diario-copiar">Copiar texto</button>
        <button class="btn btn-sm btn-primary" id="diario-baixar">Baixar .txt</button>
      </div>
    </div>
  `);
  document.body.appendChild(modal);
  modal.querySelector('#diario-texto').textContent = en.texto;
  modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
  modal.querySelector('#diario-copiar').addEventListener('click', () => {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(en.texto);
    toast('Texto copiado', 'success');
  });
  modal.querySelector('#diario-baixar').addEventListener('click', () => {
    const blob = new Blob([en.texto], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `NEITZEL-registro-${en.data}.txt`;
    a.click();
  });
}

/* ------------------------------------------------------------------ *
 * VIEW: LEADS
 * ------------------------------------------------------------------ */

function renderLeads(c) {
  const box = el('div', '', '');
  const etapaNome2 = (id) => (d().funil.find((f) => f.id === id) || {}).nome || id;
  const header = el('div', 'page-header', `<h1>Leads & CRM</h1><p>${d().leads.length} leads · clique para abrir a ficha.</p><div style="margin-top:8px"><button class="btn btn-primary btn-sm" id="btn-novo-lead">Novo lead</button></div>`);
  box.appendChild(header);

  /* Barra de filtros: busca, etapa, origem, cidade, valor mínimo e ordenação */
  const filtros = el('div', 'card', `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <input class="input" id="lf-busca" placeholder="Buscar nome, empresa, e-mail..." style="flex:1;min-width:200px" />
      <select class="input" id="lf-etapa" style="max-width:170px">
        <option value="">Todas as etapas</option>
        ${d().funil.map((f) => `<option value="${f.id}">${esc(f.nome)}</option>`).join('')}
      </select>
      <select class="input" id="lf-origem" style="max-width:150px">
        <option value="">Toda origem</option>
        ${Array.from(new Set(d().leads.map((l) => l.origem).filter(Boolean))).sort().map((o) => `<option>${esc(o)}</option>`).join('')}
      </select>
      <input class="input" id="lf-cidade" placeholder="Cidade" style="max-width:130px" />
      <input class="input" id="lf-valor" placeholder="Valor mín. R$" inputmode="decimal" style="max-width:130px" />
      <select class="input" id="lf-ordem" style="max-width:180px">
        <option value="recentes">Mais recentes</option>
        <option value="valor">Maior valor</option>
        <option value="score">Maior score</option>
        <option value="nome">Nome (A-Z)</option>
      </select>
      <button class="btn btn-sm btn-ghost" id="lf-limpar">Limpar</button>
    </div>
  `);
  box.appendChild(filtros);
  const contagem = el('div', 'text-muted', '');
  contagem.style.cssText = 'font-size:12.5px;margin:8px 2px';
  box.appendChild(contagem);
  const grid = el('div', 'card', '');

  function leadsFiltrados() {
    const q = (filtros.querySelector('#lf-busca')?.value || '').toLowerCase().trim();
    const etapa = filtros.querySelector('#lf-etapa')?.value || '';
    const origem = filtros.querySelector('#lf-origem')?.value || '';
    const cidade = (filtros.querySelector('#lf-cidade')?.value || '').toLowerCase().trim();
    const valorMin = parseBRLNumber(filtros.querySelector('#lf-valor')?.value || '') * 100;
    const ordem = filtros.querySelector('#lf-ordem')?.value || 'recentes';
    let lista = d().leads.filter((l) => {
      if (etapa && l.etapa !== etapa) return false;
      if (origem && (l.origem || '') !== origem) return false;
      if (cidade && !(l.cidade || '').toLowerCase().includes(cidade)) return false;
      if (valorMin > 0 && (Number(l.valor) || 0) < valorMin) return false;
      if (q) {
        const alvo = `${l.nome || ''} ${l.empresa || ''} ${l.email || ''} ${l.telefone || ''} ${l.whats || ''}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
    if (ordem === 'valor') lista.sort((a, b) => (b.valor || 0) - (a.valor || 0));
    else if (ordem === 'score') lista.sort((a, b) => (E.modules.leads.scoring(b).score || 0) - (E.modules.leads.scoring(a).score || 0));
    else if (ordem === 'nome') lista.sort((a, b) => String(a.nome || a.empresa || '').localeCompare(String(b.nome || b.empresa || ''), 'pt-BR'));
    else lista.sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));
    return lista;
  }

  function pintarTabela() {
    const lista = leadsFiltrados();
    const total = d().leads.length;
    contagem.innerHTML = lista.length === total
      ? `Mostrando <b>${total}</b> lead(s)`
      : `Mostrando <b>${lista.length}</b> de ${total} lead(s) (com filtros ativos)`;
    grid.innerHTML = '';
    const table = el('table', 'table', `<thead><tr><th>Nome</th><th>Etapa</th><th>Cidade</th><th>Valor</th><th>Score</th><th>Origem</th></tr></thead><tbody></tbody>`);
    const tbody = table.querySelector('tbody');
    if (tbody) {
      if (!lista.length) tbody.innerHTML = '<tr><td colspan="6" class="text-muted">Nenhum lead encontrado com esses filtros.</td></tr>';
      lista.slice(0, 200).forEach((l) => {
        const tr = el('tr', 'lead-row', '');
        tr.innerHTML = `<td><b>${esc(l.nome || l.empresa || '—')}</b><div class="text-muted">${esc(l.empresa || '')}${l.whats ? ' · ' + esc(E.foneBR.formatar(l.whats)) : ''}</div></td><td>${esc(etapaNome2(l.etapa))}</td><td>${esc(l.cidade || '')}</td><td>${E.fmtMoney(l.valor)}</td><td>${l.score != null ? l.score : ''}</td><td>${esc(l.origem || '')}</td>`;
        if (tr.addEventListener) tr.addEventListener('click', () => openLeadDetail(l.id));
        tbody.appendChild(tr);
      });
    }
    grid.appendChild(table);
  }
  pintarTabela();
  ['lf-busca'].forEach((idc) => filtros.querySelector('#' + idc)?.addEventListener('input', pintarTabela));
  ['lf-etapa', 'lf-origem', 'lf-ordem'].forEach((idc) => filtros.querySelector('#' + idc)?.addEventListener('change', pintarTabela));
  ['lf-cidade', 'lf-valor'].forEach((idc) => filtros.querySelector('#' + idc)?.addEventListener('change', pintarTabela));
  filtros.querySelector('#lf-limpar')?.addEventListener('click', () => {
    ['#lf-busca', '#lf-etapa', '#lf-origem', '#lf-cidade', '#lf-valor'].forEach((s) => { const i = filtros.querySelector(s); if (i) i.value = ''; });
    const o = filtros.querySelector('#lf-ordem'); if (o) o.value = 'recentes';
    pintarTabela();
  });
  box.appendChild(grid);
  c.appendChild(box);
  c.querySelector('#btn-novo-lead')?.addEventListener('click', () => openLeadModal());
}

function d() { return E.db.get(); }

/** Análise rápida gerada pela IA a partir dos dados reais do painel. */
function panelInsight(d, b, s) {
  const linhas = [];
  const leads = d.leads.length;
  const aReceber = s.aReceber;
  const vencidasCount = E.modules.financeiro.vencidas().length;
  const slaRisco = E.modules.atendimento.slaEmRisco().length;
  const atrasados = E.modules.projetos.atrasados().length;
  if (vencidasCount > 0) linhas.push(` **${vencidasCount} conta(s) vencida(s)** somando ${E.fmtMoney(aReceber)} a receber — priorize cobrança.`);
  if (slaRisco > 0) linhas.push(` **${slaRisco} atendimento(s)** com SLA em risco — precisa de resposta urgente.`);
  if (atrasados > 0) linhas.push(` **${atrasados} projeto(s) atrasado(s)** — verifique prazos para evitar retrabalho.`);
  if (leads === 0) linhas.push(' Sem leads ainda: cadastre o primeiro lead em **Leads & CRM** para alimentar o funil.');
  if (b.mrr() === 0) linhas.push(' MRR zerado: cadastre clientes com planos recorrentes para gerar receita previsível.');
  if (!linhas.length) return 'Tudo tranquilo! Nenhuma pendência crítica no momento. Aproveite para revisar o funil ou abrir um **Possível Cenário** na área de Estratégia.';
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
  // Formatação ao vivo: o número inteiro fica no padrão profissional
  const inpTel = modal.querySelector('#m-telefone');
  const dicaTel = el('div', 'text-muted', '');
  dicaTel.style.cssText = 'font-size:11px;margin-top:-4px';
  if (inpTel) {
    inpTel.addEventListener('blur', () => {
      const F = E.foneBR;
      const norm = F.normalizar(inpTel.value);
      if (inpTel.value.trim() && norm) { inpTel.value = F.formatar(norm); dicaTel.textContent = 'Gravado como número inteiro: ' + norm; dicaTel.style.color = 'var(--e-green)'; }
      else if (inpTel.value.trim()) { dicaTel.textContent = 'Número incompleto — informe o número inteiro com DDD (ex.: 51 99999-8888).'; dicaTel.style.color = 'var(--e-warning)'; }
      else dicaTel.textContent = '';
    });
    inpTel.insertAdjacentElement('afterend', dicaTel);
  }
  const errBox = el('div', 'text-muted', '');
  errBox.style.cssText = 'color:var(--e-danger);font-size:12px;margin-top:6px;min-height:14px';
  modal.querySelector('.modal-actions').insertAdjacentElement('beforebegin', errBox);
  modal.querySelector('#m-salvar').addEventListener('click', () => {
    errBox.textContent = '';
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
      errBox.textContent = 'Informe ao menos nome ou um contato.';
      return;
    }
    const res = E.modules.leads.addLead(dados);
    if (!res.ok) { errBox.textContent = res.message || `Não foi possível salvar (${res.code})`; return; }
    if (!res.verificacao.contatoReal) {
      toast('Lead salvo, mas SEM contato real verificado — ' + res.verificacao.problemas.join(' e '), 'warn');
    } else {
      toast('Lead criado e verificado', 'success');
    }
    modal.remove();
    renderView('leads');
    inlineInsight(` **${res.lead.nome || res.lead.empresa || 'Lead'}** criado na etapa "${(d().funil.find((f) => f.id === res.lead.etapa) || {}).nome || res.lead.etapa}".\nScore atual: **${E.modules.leads.scoring(res.lead).score}/100**.\nSugestão: use o botão ** Sugerir follow-up** na ficha do lead para redigir o primeiro contato com a IA.`);
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
        <div class="ldp-field"><span class="k">Telefone:</span><span>${esc(l.telefone ? E.foneBR.formatar(l.telefone) : '—')}</span></div>
        <div class="ldp-field"><span class="k">WhatsApp:</span><span>${l.whats ? `${esc(E.foneBR.formatar(l.whats))} <button class="btn btn-xs btn-success" data-whats-inline style="margin-left:6px">Abrir WhatsApp</button>` : '—'}</span></div>
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
  const abrirWhatsLead = () => {
    const link = E.foneBR.waLink(l.whats || l.telefone);
    if (link) window.open(link, '_blank');
    else toast('WhatsApp inválido ou incompleto — informe DDD + número', 'warn');
  };
  if (whatsBtn) whatsBtn.addEventListener('click', abrirWhatsLead);
  const whatsInline = panel.querySelector('[data-whats-inline]');
  if (whatsInline) whatsInline.addEventListener('click', abrirWhatsLead);
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
  /* Filtros do funil: busca, origem e cidade */
  const filtros = el('div', 'card', `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <input class="input" id="fn-busca" placeholder="Buscar lead no funil..." style="flex:1;min-width:180px" />
      <select class="input" id="fn-origem" style="max-width:150px">
        <option value="">Toda origem</option>
        ${Array.from(new Set(d().leads.map((l) => l.origem).filter(Boolean))).sort().map((o) => `<option>${esc(o)}</option>`).join('')}
      </select>
      <input class="input" id="fn-cidade" placeholder="Cidade" style="max-width:140px" />
      <button class="btn btn-sm btn-ghost" id="fn-limpar">Limpar</button>
    </div>
  `);
  c.appendChild(filtros);
  const kanban = el('div', 'kanban', '');

  function passaFiltros(l) {
    const q = (filtros.querySelector('#fn-busca')?.value || '').toLowerCase().trim();
    const origem = filtros.querySelector('#fn-origem')?.value || '';
    const cidade = (filtros.querySelector('#fn-cidade')?.value || '').toLowerCase().trim();
    if (origem && (l.origem || '') !== origem) return false;
    if (cidade && !(l.cidade || '').toLowerCase().includes(cidade)) return false;
    if (q) {
      const alvo = `${l.nome || ''} ${l.empresa || ''} ${l.email || ''} ${l.telefone || ''}`.toLowerCase();
      if (!alvo.includes(q)) return false;
    }
    return true;
  }

  function pintarKanban() {
    kanban.innerHTML = '';
    d().funil.forEach((f) => {
      const col = el('div', 'kanban-col', '');
      col.dataset.stage = f.id;
      const leadsDaEtapa = d().leads.filter((l) => l.etapa === f.id && passaFiltros(l));
      const totalEtapa = d().leads.filter((l) => l.etapa === f.id).length;
      col.appendChild(el('div', 'kanban-col-head', `<span class="dot" style="background:${f.cor}"></span><span>${esc(f.nome)}</span><span class="count">${leadsDaEtapa.length}${totalEtapa !== leadsDaEtapa.length ? '/' + totalEtapa : ''}</span>`));
      leadsDaEtapa.forEach((l) => {
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
            pintarKanban();
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
  }
  pintarKanban();
  filtros.querySelector('#fn-busca')?.addEventListener('input', pintarKanban);
  filtros.querySelector('#fn-origem')?.addEventListener('change', pintarKanban);
  filtros.querySelector('#fn-cidade')?.addEventListener('change', pintarKanban);
  filtros.querySelector('#fn-limpar')?.addEventListener('click', () => {
    ['#fn-busca', '#fn-origem', '#fn-cidade'].forEach((s) => { const i = filtros.querySelector(s); if (i) i.value = ''; });
    pintarKanban();
  });
  c.appendChild(kanban);
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
 * VIEW: ESTRATÉGIA & PREVISÃO (o sistema pensa pelos vocês)
 * - Clientes sem movimentação (25 dias padrão) → Manter / Apagar
 * - Clientes que mais/menos geram receita
 * - Produtos e serviços que mais/menos vendem
 * - Previsão de movimento de clientes (tendência semanal)
 * - Botão "Possível Cenário" — agente pesquisa fontes reais
 * ------------------------------------------------------------------ */

/** Configuração do sistema com padrões sensatos. */
function lerConfigSistema() {
  const s = (d().config && d().config.sistema) || {};
  return {
    pais: s.pais || 'Brasil',
    estado: s.estado || '',
    cidade: s.cidade || '',
    segmento: s.segmento || 'barbearia',
    diasInatividadeCliente: Number(s.diasInatividadeCliente) || 25,
    capturaAutoAtividades: s.capturaAutoAtividades !== false,
  };
}

/** Última movimentação real de um cliente: histórico + auditoria + financeiro + agendamentos. */
function ultimaMovimentacaoCliente(cli, auditLista) {
  let ultima = cli.ultimoAcesso ? new Date(cli.ultimoAcesso).getTime() : 0;
  const nomeAlvo = String(cli.nome || cli.empresa || '').toLowerCase().trim();
  if (Array.isArray(cli.historico)) {
    cli.historico.forEach((h) => { const t = new Date(h.at).getTime(); if (t > ultima && h.tipo !== 'criacao') ultima = t; });
  }
  try {
    E.modules.financeiro.contas.forEach((ct) => {
      if (String(ct.cliente || '').toLowerCase().trim() === nomeAlvo && nomeAlvo) {
        const t = new Date(ct.pagoEm || ct.vencimento || ct.criadaEm || 0).getTime();
        if (t > ultima) ultima = t;
      }
    });
  } catch (e) {}
  try {
    (auditLista || E.audit.list()).forEach((ev) => {
      const blob = `${JSON.stringify(ev.after || '')} ${JSON.stringify(ev.before || '')}`.toLowerCase();
      if (nomeAlvo && blob.includes(nomeAlvo)) {
        if (!/cliente\.excluido/.test(ev.action)) {
          const t = new Date(ev.ts).getTime();
          if (t > ultima) ultima = t;
        }
      }
    });
  } catch (e) {}
  return ultima;
}

/** Receita gerada por cliente (contas a receber pagas, agrupadas por nome). */
function receitaPorCliente() {
  const mapa = new Map();
  try {
    E.modules.financeiro.contas.forEach((ct) => {
      const nome = String(ct.cliente || '').trim();
      if (!nome) return;
      const atual = mapa.get(nome.toLowerCase()) || { nome, recebido: 0, aberto: 0 };
      if (ct.tipo === 'receber') {
        if (ct.status === 'pago') atual.recebido += ct.valor;
        else atual.aberto += ct.valor;
      }
      mapa.set(nome.toLowerCase(), atual);
    });
  } catch (e) {}
  return Array.from(mapa.values()).sort((a, b) => b.recebido - a.recebido);
}

/** Vendas por produto (estoque: saídas; atendimentos: itens de produtos). */
function vendasPorProduto() {
  const mapa = new Map();
  const somar = (nome, qtd, valor) => {
    const k = String(nome || '—').trim() || '—';
    const atual = mapa.get(k) || { nome: k, qtd: 0, valor: 0 };
    atual.qtd += Math.abs(qtd || 1);
    atual.valor += valor || 0;
    mapa.set(k, atual);
  };
  try {
    const movs = JSON.parse(localStorage.getItem('neitzel_estoque_mov_v1') || '[]');
    movs.forEach((m) => { if ((m.tipo === 'saida' || m.tipo === 'utilizacao' || (m.quantidade || 0) < 0)) somar(m.produtoNome, m.quantidade, Math.abs(m.quantidade || 1) * (m.precoUnitario || m.preco || 0)); });
  } catch (e) {}
  try {
    const atds = JSON.parse(localStorage.getItem('neitzel_atendimentos_v1') || '[]');
    atds.forEach((a) => (a.itensProdutos || []).forEach((it) => somar(it.produtoNome || it.nome, it.quantidade || 1, (it.precoUnitario || it.preco || 0) * (it.quantidade || 1))));
  } catch (e) {}
  return Array.from(mapa.values()).sort((a, b) => b.qtd - a.qtd);
}

/** Uso de serviços (atendimentos concluídos por nome de serviço). */
function usoDeServicos() {
  const mapa = new Map();
  try {
    const atds = JSON.parse(localStorage.getItem('neitzel_atendimentos_v1') || '[]');
    atds.forEach((a) => {
      if (a.servicoNome) {
        const k = a.servicoNome;
        const atual = mapa.get(k) || { nome: k, qtd: 0, valor: 0 };
        atual.qtd += 1;
        atual.valor += a.servicoPreco || 0;
        mapa.set(k, atual);
      }
    });
  } catch (e) {}
  return Array.from(mapa.values()).sort((a, b) => b.qtd - a.qtd);
}

/** Série semanal de novos clientes (últimas N semanas) + regressão linear simples. */
function serieSemanalClientes(semanas) {
  const N = semanas || 8;
  const agora = new Date(); agora.setHours(0, 0, 0, 0);
  const inicioUltima = new Date(agora.getTime() - (N * 7 - 1) * 86400000);
  const serie = Array.from({ length: N }, () => 0);
  try {
    (E.modules.clientes.clientes || []).forEach((cl) => {
      const dt = new Date(cl.created || 0);
      if (isNaN(dt) || dt < inicioUltima) return;
      const idx = N - 1 - Math.floor((agora - dt) / (7 * 86400000));
      if (idx >= 0 && idx < N) serie[idx]++;
    });
  } catch (e) {}
  // Regressão linear y = a + bx
  const n = serie.length;
  const sx = serie.reduce((a, _, i) => a + i, 0), sy = serie.reduce((a, v) => a + v, 0);
  const sxx = serie.reduce((a, _, i) => a + i * i, 0), sxy = serie.reduce((a, v, i) => a + i * v, 0);
  const denom = n * sxx - sx * sx;
  const b = denom ? (n * sxy - sx * sy) / denom : 0;
  const a0 = (sy - b * sx) / n;
  return { serie, inclinacao: b, projetado: Math.max(0, a0 + b * n) };
}

function renderEstrategia(c) {
  const cfg = lerConfigSistema();
  c.appendChild(el('div', 'page-header', `
    <h1>Estratégia & Previsão</h1>
    <p>O sistema pensa com você: quem está esfriando, o que vende, para onde o movimento caminha.</p>
    <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-primary" id="btn-cenario" style="background:linear-gradient(135deg,var(--e-brand),#0d5c38);box-shadow:0 6px 22px rgba(22,106,67,.35)">
        Possível Cenário — analisar as próximas 8 semanas
      </button>
      <span class="text-muted" style="font-size:12px;align-self:center">Agente busca em notícias, índices e eventos reais de ${esc([cfg.cidade, cfg.estado, cfg.pais].filter(Boolean).join(' · ') || 'sua região')}</span>
    </div>`));

  /* ---------- A. Clientes sem movimentação ---------- */
  const auditLista = E.audit.list();
  const limiteMs = cfg.diasInatividadeCliente * 86400000;
  const agoraT = Date.now();
  const frios = (E.modules.clientes.clientes || [])
    .map((cli) => ({ cli, ultima: ultimaMovimentacaoCliente(cli, auditLista) }))
    .filter((x) => x.ultima > 0 && (agoraT - x.ultima) >= limiteMs)
    .sort((a, b) => a.ultima - b.ultima);

  const cardFrios = el('div', 'card', `
    <h4>Clientes sem movimentação há ${cfg.diasInatividadeCliente}+ dias</h4>
    <p class="text-muted" style="font-size:12px;margin:2px 0 10px">Detectado automaticamente cruzando histórico, financeiro e auditoria. Decida: manter ou apagar o contato.</p>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      <span class="text-muted" style="font-size:12px">Alertar após</span>
      <input class="input" id="et-dias" type="number" min="5" max="120" value="${Number(cfg.diasInatividadeCliente) || 25}" style="width:80px;padding:5px 8px" />
      <span class="text-muted" style="font-size:12px">dias sem registro</span>
      <button class="btn btn-xs" id="et-dias-salvar">Salvar</button>
    </div>
    <div id="frios-lista"></div>
  `);
  c.querySelector('#et-dias-salvar')?.addEventListener('click', () => {
    const v = Math.min(120, Math.max(5, Number(c.querySelector('#et-dias')?.value) || 25));
    const dbd = d();
    dbd.config = dbd.config || {};
    dbd.config.sistema = Object.assign({}, dbd.config.sistema, { diasInatividadeCliente: v });
    E.db.save();
    E.audit.record('config.sistema', 'sistema', null, { diasInatividadeCliente: v });
    toast('Alerta de inatividade em ' + v + ' dias', 'success');
    renderView('estrategia');
  });
  const friosLista = cardFrios.querySelector('#frios-lista');
  if (!frios.length) {
    friosLista.innerHTML = '<div class="empty">Nenhum cliente frio no momento — base aquecida.</div>';
  } else {
    frios.forEach(({ cli, ultima }) => {
      const dias = Math.floor((agoraT - ultima) / 86400000);
      const row = el('div', 'dbx-feed-row', '');
      row.style.cssText = 'align-items:center;padding:8px 0;border-bottom:1px dashed var(--border)';
      row.innerHTML = `
        <span class="dbx-feed-ico" style="color:var(--e-warning);border:1px solid var(--border)">!</span>
        <span style="flex:1"><b>${esc(cli.nome || cli.empresa || '—')}</b>
          <span class="text-muted" style="font-size:11.5px"> · ${dias} dia(s) sem registro · MRR ${E.fmtMoney(cli.mrr)}</span></span>
        <span class="btn-group">
          <button class="btn btn-sm btn-success" data-manter="${esc(cli.id)}">Manter</button>
          <button class="btn btn-sm btn-danger" data-apagar="${esc(cli.id)}">Apagar</button>
        </span>`;
      row.querySelector(`[data-manter]`)?.addEventListener('click', () => {
        E.modules.clientes.updateCliente(cli.id, {
          ultimoAcesso: E.nowISO(),
          notas: (cli.notas ? cli.notas + ' | ' : '') + '[estratégia] contato mantido manualmente em ' + new Date().toLocaleDateString('pt-BR'),
        });
        toast(`${cli.nome || 'Cliente'} marcado como ativo por mais um ciclo`, 'success');
        renderView('estrategia');
      });
      row.querySelector(`[data-apagar]`)?.addEventListener('click', () => {
        if (!confirm(`Apagar definitivamente "${cli.nome || cli.empresa}"? A ação fica registrada na auditoria (LGPD).`)) return;
        const r = E.modules.clientes.deleteCliente(cli.id, 'Inativo há ' + dias + ' dias — removido na área Estratégica');
        if (r.ok) { toast('Contato apagado (registrado na auditoria)', 'info'); renderView('estrategia'); }
        else toast('Não foi possível apagar', 'danger');
      });
      friosLista.appendChild(row);
    });
  }
  c.appendChild(cardFrios);

  /* ---------- B. Ranking de receita por cliente ---------- */
  const receita = receitaPorCliente().filter((r) => r.recebido > 0 || r.aberto > 0);
  const gridRank = el('div', 'grid-2', '');
  const topReceita = receita.slice(0, 5);
  const bottomReceita = receita.filter((r) => r.recebido === 0).slice(-5).reverse();
  const cardTop = el('div', 'card', `<h4>Clientes que mais geram receita</h4>${
    topReceita.length ? `<table class="table"><thead><tr><th>Cliente</th><th>Recebido</th><th>A receber</th></tr></thead><tbody>${
      topReceita.map((r, i) => `<tr><td>${['\uD83E\uDD47','\uD83E\uDD48','\uD83E\uDD49'][i] || ''} ${esc(r.nome)}</td><td><b>${E.fmtMoney(r.recebido)}</b></td><td>${E.fmtMoney(r.aberto)}</td></tr>`).join('')
    }</tbody></table>` : '<div class="empty">Sem receitas registradas ainda.</div>'}`);
  const cardBottom = el('div', 'card', `<h4>Clientes que menos geram receita</h4>${
    bottomReceita.length ? `<table class="table"><thead><tr><th>Cliente</th><th>Somente em aberto</th></tr></thead><tbody>${
      bottomReceita.map((r) => `<tr><td>${esc(r.nome)}</td><td>${E.fmtMoney(r.aberto)}</td></tr>`).join('')
    }</tbody></table><p class="text-muted" style="font-size:11.5px;margin:6px 0 0">Nada recebido ainda desses nomes — vale um follow-up.</p>`
    : '<div class="empty">Todos os clientes com registro já geraram receita.</div>'}`);
  gridRank.appendChild(cardTop); gridRank.appendChild(cardBottom);
  c.appendChild(gridRank);

  /* ---------- C. Produtos e serviços ---------- */
  const prods = vendasPorProduto();
  const servs = usoDeServicos();
  const gridCat = el('div', 'grid-2', '');
  const cardProd = el('div', 'card', `<h4>Produtos — mais e menos vendidos</h4>${
    prods.length ? `
      <table class="table"><thead><tr><th>Mais vendem</th><th>Qtd</th><th>Valor</th></tr></thead><tbody>${
        prods.slice(0, 5).map((p) => `<tr><td>${esc(p.nome)}</td><td><b>${p.qtd}</b></td><td>${E.fmtMoney(p.valor)}</td></tr>`).join('')
      }</tbody></table>
      ${prods.length > 5 ? `<table class="table" style="margin-top:8px"><thead><tr><th>Menos vendem</th><th>Qtd</th></tr></thead><tbody>${
        prods.slice(-3).reverse().map((p) => `<tr><td>${esc(p.nome)}</td><td>${p.qtd}</td></tr>`).join('')
      }</tbody></table>` : ''}`
    : '<div class="empty">Sem vendas de produtos registradas (estoque/atendimentos).</div>'}`);
  const cardServ = el('div', 'card', `<h4>Serviços — mais e menos procurados</h4>${
    servs.length ? `
      <table class="table"><thead><tr><th>Mais realizados</th><th>Vezes</th><th>Total</th></tr></thead><tbody>${
        servs.slice(0, 5).map((s) => `<tr><td>${esc(s.nome)}</td><td><b>${s.qtd}</b></td><td>${E.fmtMoney(s.valor)}</td></tr>`).join('')
      }</tbody></table>
      ${servs.length > 5 ? `<table class="table" style="margin-top:8px"><thead><tr><th>Menos procurados</th><th>Vezes</th></tr></thead><tbody>${
        servs.slice(-3).reverse().map((s) => `<tr><td>${esc(s.nome)}</td><td>${s.qtd}</td></tr>`).join('')
      }</tbody></table>` : ''}`
    : '<div class="empty">Sem atendimentos de serviços registrados.</div>'}`);
  gridCat.appendChild(cardProd); gridCat.appendChild(cardServ);
  c.appendChild(gridCat);

  /* ---------- D. Previsão de movimento de clientes ---------- */
  const prev = serieSemanalClientes(8);
  const total8 = prev.serie.reduce((a, v) => a + v, 0);
  const media = total8 / 8;
  const direcao = prev.inclinacao > 0.05 ? { txt: 'ALTA', cls: 'e-green', seta: '\u2197' } : prev.inclinacao < -0.05 ? { txt: 'BAIXA', cls: 'e-danger', seta: '\u2198' } : { txt: 'ESTÁVEL', cls: 'text-muted', seta: '\u2192' };
  const cardPrev = el('div', 'card dbx-in', `
    <h4>Previsão de movimento de clientes</h4>
    <p class="text-muted" style="font-size:12px;margin:2px 0 8px">Regressão sobre as últimas 8 semanas de novos clientes — recalculado ao vivo dos seus dados.</p>
    <div style="display:flex;gap:26px;flex-wrap:wrap;align-items:center">
      <div><div class="kpi-value" style="color:var(--${direcao.cls})">${direcao.seta} ${direcao.txt}</div><div class="text-muted" style="font-size:12px">tendência da semana</div></div>
      <div><div class="kpi-value">${prev.projetado.toFixed(1)}</div><div class="text-muted" style="font-size:12px">novos clientes projetados p/ próxima semana</div></div>
      <div><div class="kpi-value">${media.toFixed(1)}</div><div class="text-muted" style="font-size:12px">média semanal (8 semanas)</div></div>
    </div>
    <div style="margin-top:10px">${dbxSpark(prev.serie.map((v) => v), 'var(--e-violet)')}</div>
  `);
  c.appendChild(cardPrev);

  /* ---------- Histórico de cenários já calculados ---------- */
  const histCard = window.NEITZEL_CENARIO ? window.NEITZEL_CENARIO.renderHistoricoCard() : null;
  if (histCard) c.appendChild(histCard);

  c.querySelector('#btn-cenario')?.addEventListener('click', () => {
    if (window.NEITZEL_CENARIO) window.NEITZEL_CENARIO.open();
    else toast('Módulo de cenários não carregou (cenario.js).', 'danger');
  });
}

/* ------------------------------------------------------------------ *
 * VIEW: ACESSOR WHATSAPP (configuração do Acessor — acessor.js)
 * ------------------------------------------------------------------ */

function renderAcessor(c) {
  if (window.NEITZEL_ACESSOR && window.NEITZEL_ACESSOR.renderAcessor) { window.NEITZEL_ACESSOR.renderAcessor(c); return; }
  c.appendChild(el('div', 'empty', 'Acessor indisponível (acessor.js não carregou).'));
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

/** Nova tarefa (usado pelo Painel e pela Agenda) — cria em modules.tarefas. */
function openTarefaModal() {
  const modal = el('div', 'modal', `
    <div class="modal-box">
      <h3>Nova tarefa</h3>
      <div class="form-grid">
        <label>Título da tarefa <input class="input" id="tf-titulo" placeholder="ex.: Ligar para cliente X" /></label>
        <label>Detalhes <textarea class="input" id="tf-desc" rows="2" placeholder="Opcional"></textarea></label>
        <label>Prazo <input class="input" type="date" id="tf-data" /></label>
        <label>Hora <input class="input" type="time" id="tf-hora" value="09:00" /></label>
        <label>Prioridade
          <select class="input" id="tf-prio">
            <option value="normal">Normal</option>
            <option value="alta">Alta</option>
            <option value="baixa">Baixa</option>
          </select>
        </label>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="tf-salvar">Criar tarefa</button></div>
    </div>
  `);
  document.body.appendChild(modal);
  const hojeD = new Date();
  modal.querySelector('#tf-data').value = `${hojeD.getFullYear()}-${String(hojeD.getMonth() + 1).padStart(2, '0')}-${String(hojeD.getDate()).padStart(2, '0')}`;
  modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
  modal.querySelector('#tf-salvar').addEventListener('click', () => {
    const titulo = modal.querySelector('#tf-titulo').value.trim();
    if (!titulo) { toast('Dê um título à tarefa', 'warn'); return; }
    const data = modal.querySelector('#tf-data').value;
    const hora = modal.querySelector('#tf-hora').value || '09:00';
    const due = data ? new Date(`${data}T${hora}`).toISOString() : E.nowISO();
    const r = E.modules.tarefas.add({
      titulo,
      desc: modal.querySelector('#tf-desc').value.trim(),
      due,
      prioridade: modal.querySelector('#tf-prio').value || 'normal',
    });
    if (!r.ok) { toast('Não foi possível criar a tarefa', 'danger'); return; }
    toast('Tarefa criada', 'success');
    modal.remove();
    refreshNavCounts();
    const atrasadas = E.modules.tarefas.atrasadas().length;
    inlineInsight(` Tarefa **${r.tarefa.titulo}** criada com prazo ${E.fmtDateTime(r.tarefa.due)}.\nVocê tem **${E.modules.tarefas.pendentes().length}** tarefa(s) pendente(s)${atrasadas ? `, sendo ${atrasadas} atrasada(s)` : ''}.\nDica: conclua pelo Planner para manter o ritmo do dia.`);
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
      inlineInsight(` Campanha **${cm.nome}** registrou +1 lead (total: ${cm.leadsObtidos}).\nConversão atual: ${cm.conversoes} (${cm.conversoes ? Math.round((cm.conversoes / cm.leadsObtidos) * 100) : 0}%).\nDica: cadastre novos contatos em Leads & CRM para escalar a captação.`);
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

  // ————— Modo offline: relatório honesto do que funciona sem rede —————
  const rel = relatorioOffline();
  const estadoTxt = rel.estado.online
    ? (rel.estado.servidor ? 'Online · internet + servidor OK' : 'Internet OK · servidor fechado')
    : 'Sem internet';
  const cardOffline = el('div', 'card', `
    <h4>Modo offline &amp; conexão</h4>
    <p class="text-muted" style="font-size:12px;margin:2px 0 10px">O sistema nasceu local-first: sua operação continua de pé mesmo sem rede. Aqui está o que funciona e o que espera conexão.</p>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      <span class="cron-chip" title="Estado verificado agora"><span class="cron-dot" style="color:${rel.estado.online && rel.estado.servidor ? 'var(--e-green)' : 'var(--e-warning)'}"></span><span class="cron-val">${esc(estadoTxt)}</span></span>
      <button class="btn btn-sm btn-ghost" id="off-rechecar">Reverificar agora</button>
    </div>
    <div class="grid-2">
      <div>
        <h4 style="font-size:13px;color:var(--e-green)">✔ Funciona offline (${rel.okLocal.length})</h4>
        ${rel.okLocal.map(([n, d]) => `<div style="padding:5px 0;border-bottom:1px dashed var(--border);font-size:12.5px"><b>${esc(n)}</b> <span class="text-muted">— ${esc(d)}</span></div>`).join('')}
      </div>
      <div>
        <h4 style="font-size:13px;color:var(--e-orange)">⏻ Precisa de internet/servidor (${rel.precisaRede.length})</h4>
        ${rel.precisaRede.map(([n, d]) => `<div style="padding:5px 0;border-bottom:1px dashed var(--border);font-size:12.5px"><b>${esc(n)}</b> <span class="text-muted">— ${esc(d)}</span></div>`).join('')}
        <p class="text-muted" style="font-size:11.5px;margin-top:8px">Quando a conexão volta, tudo é retomado automaticamente — os dados locais nunca se perdem.</p>
      </div>
    </div>
  `);
  c.appendChild(cardOffline);
  cardOffline.querySelector('#off-rechecar').addEventListener('click', async () => {
    await verificarConexaoAgora();
    toast(relatorioOffline().estado.online && relatorioOffline().estado.servidor ? 'Conexão completa: internet + servidor' : 'Ainda limitado — veja o relatório atualizado', 'info');
    renderSeguranca(document.querySelector('.ecomim-content'));
  });
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

  /* ---------- PARTE 2: DIAGNÓSTICO (embaixo da Segurança) ---------- */
  const diagHeader = el('div', 'page-header', `<h1 style="font-size:22px">Diagnóstico do sistema</h1><p>Saúde do ambiente em tempo real: internet, bateria, armazenamento, erros e anomalias.</p>`);
  c.appendChild(diagHeader);
  const diagBox = el('div', '', '');
  c.appendChild(diagBox);
  if (window.NEITZEL_DIAG && window.NEITZEL_DIAG.render) {
    window.NEITZEL_DIAG.render(diagBox);
  } else {
    diagBox.appendChild(el('div', 'empty', 'Diagnóstico indisponível (diagnostico.js não carregou).'));
  }
}

/* ------------------------------------------------------------------ *
 * APARÊNCIA (tema, cores e animações — persistidos e aplicados no boot)
 * ------------------------------------------------------------------ */

const AP_KEY = 'ecomim_aparencia';

function lerAparencia() {
  const padrao = { tema: 'dark', destaque: '', texto: '', animacoes: true, zoom: 100,
    titulo: 'NEITZEL', sufixo: 'Sistema Digital', logoDataUrl: '',
    fundo: '', surface: '', borda: '', fonte: 'sistema', botao: 'padrao',
    menu: 'lateral', cartao: 'padrao', letraTamanho: 'normal',
    somTipo: 'none', somVolume: 50,
    fundoModo: 'arte', fundoOpacidade: 55, temaArt: '',
    arteCor: '',
    iaAtiva: true, agentesAtivos: true, notificacoesIA: true };
  let ap;
  try { ap = Object.assign({}, padrao, JSON.parse(localStorage.getItem(AP_KEY) || '{}')); }
  catch (e) { return padrao; }
  // Migração do formato antigo (checkbox som true/false) para somTipo
  if ('som' in ap) {
    if (ap.som === false && (!ap.somTipo || ap.somTipo === 'tick')) ap.somTipo = 'none';
    delete ap.som;
  }
  if (ap.letra && !ap.fonte) ap.fonte = ap.letra;
  return ap;
}

/** Redimensiona/comprime uma imagem escolhida — garante upload de logo que
 *  sempre cabe no localStorage e carrega rápido. */
function prepararLogo(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo não é uma imagem válida'));
      img.onload = () => {
        try {
          const MAX = 480;
          const escala = Math.min(1, MAX / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * escala));
          const h = Math.max(1, Math.round(img.height * escala));
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', 0.88));
        } catch (e) { reject(e); }
      };
      img.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  });
}

function hexParaRgba(hex, alfa) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
  if (!m) return '';
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alfa})`;
}

/** Clareia (p>0) ou escurece (p<0) um hex — usado para derivar variantes. */
function shadeHex(hex, p) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
  if (!m) return '';
  const alvo = p < 0 ? 0 : 255;
  const out = [1, 2, 3].map((i) => {
    const v = parseInt(m[i], 16);
    return Math.round((alvo - v) * Math.abs(p) + v);
  });
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}
const hexValido = (v) => !!/^#[0-9a-fA-F]{6}$/.test(String(v || ''));

/** Aplica a aparência ao documento inteiro.
 *  Aceita PATCH parcial (ex.: { zoom:110 }): campos ausentes são lidos do
 *  estado salvo — assim mudar uma opção nunca desfaz as outras. */
function aplicarAparencia(patch) {
  try {
    const root = document.documentElement;
    const ap = Object.assign({}, lerAparencia(), patch || {});
    if (ap.tema === 'light' || ap.tema === 'dark') root.setAttribute('data-theme', ap.tema);

    /* Destaque (marca) */
    if (hexValido(ap.destaque)) {
      const s = root.style;
      s.setProperty('--e-brand', ap.destaque);
      s.setProperty('--nz-red', ap.destaque);
      s.setProperty('--nz-red-strong', shadeHex(ap.destaque, -0.18));
      s.setProperty('--e-brand-soft', hexParaRgba(ap.destaque, 0.12));
      s.setProperty('--nz-red-soft', hexParaRgba(ap.destaque, 0.12));
      s.setProperty('--nz-red-soft-2', hexParaRgba(ap.destaque, 0.20));
      s.setProperty('--nz-red-glow', hexParaRgba(ap.destaque, 0.30));
      s.setProperty('--ring', hexParaRgba(ap.destaque, 0.20));
    } else if (ap.destaque === '') {
      ['--e-brand', '--nz-red', '--nz-red-strong', '--e-brand-soft', '--nz-red-soft', '--nz-red-soft-2', '--nz-red-glow', '--ring'].forEach((v) => root.style.removeProperty(v));
    }

    /* Texto (+ variantes derivadas) */
    if (hexValido(ap.texto)) {
      root.style.setProperty('--text', ap.texto);
      root.style.setProperty('--text-muted', shadeHex(ap.texto, -0.30));
      root.style.setProperty('--text-subtle', shadeHex(ap.texto, -0.48));
    } else if (ap.texto === '') {
      ['--text', '--text-muted', '--text-subtle'].forEach((v) => root.style.removeProperty(v));
    }

    /* Fundo */
    if (hexValido(ap.fundo)) root.style.setProperty('--bg', ap.fundo);
    else if (ap.fundo === '') root.style.removeProperty('--bg');

    /* Superfícies (cartões) com variantes derivadas */
    if (hexValido(ap.surface)) {
      root.style.setProperty('--surface', ap.surface);
      root.style.setProperty('--surface-2', shadeHex(ap.surface, -0.05));
      root.style.setProperty('--surface-3', shadeHex(ap.surface, -0.10));
    } else if (ap.surface === '') {
      ['--surface', '--surface-2', '--surface-3'].forEach((v) => root.style.removeProperty(v));
    }

    /* Bordas */
    if (hexValido(ap.borda)) {
      root.style.setProperty('--border', ap.borda);
      root.style.setProperty('--border-strong', shadeHex(ap.borda, 0.22));
    } else if (ap.borda === '') {
      ['--border', '--border-strong'].forEach((v) => root.style.removeProperty(v));
    }

    /* Modelo das letras */
    root.classList.remove('font-serif', 'font-mono', 'font-rounded', 'font-compacta',
      'font-display', 'font-legivel', 'font-elegante');
    if (['serif', 'mono', 'rounded', 'compacta', 'display', 'legivel', 'elegante'].includes(ap.fonte)) root.classList.add('font-' + ap.fonte);

    /* Tamanho das letras */
    root.classList.remove('letra-pequeno', 'letra-grande');
    if (ap.letraTamanho === 'pequeno' || ap.letraTamanho === 'grande') root.classList.add('letra-' + ap.letraTamanho);

    /* Modelo dos botões */
    root.classList.remove('btn-arredondado', 'btn-pill', 'btn-quadrado', 'btn-contorno',
      'btn-3d', 'btn-glass', 'btn-gradiente', 'btn-minimalista');
    if (['arredondado', 'pill', 'quadrado', 'contorno', '3d', 'glass', 'gradiente', 'minimalista'].includes(ap.botao)) root.classList.add('btn-' + ap.botao);

    /* Modelo do menu e dos cartões */
    root.classList.remove('menu-topo');
    if (ap.menu === 'topo') root.classList.add('menu-topo');
    root.classList.remove('cartao-flat', 'cartao-elevado');
    if (['flat', 'elevado'].includes(ap.cartao)) root.classList.add('cartao-' + ap.cartao);

    root.classList.toggle('no-anim', ap.animacoes === false);
    try { document.body.style.zoom = (Number(ap.zoom) || 100) + '%'; } catch (e) {}

    /* Tela de fundo: arte da logo ou padrão limpo */
    const modo = ap.fundoModo === 'padrao' ? 'padrao' : 'arte';
    root.setAttribute('data-fundo', modo);
    const op = Math.max(0, Math.min(100, Number(ap.fundoOpacidade) == null || isNaN(Number(ap.fundoOpacidade)) ? 55 : Number(ap.fundoOpacidade)));
    root.style.setProperty('--nz-arte-opacidade', String(op / 100));

    /* Assinatura animada dos temas autorais */
    root.classList.remove('tema-art-on');
    root.removeAttribute('data-tema-art');
    if (ap.temaArt && ['aurora', 'neon', 'sakura', 'matrix', 'oceano', 'deserto'].includes(ap.temaArt)) {
      root.setAttribute('data-tema-art', ap.temaArt);
      root.classList.add('tema-art-on');
    }

    /* Cor da arte de fundo acompanhando o tema escolhido */
    root.removeAttribute('data-arte-cor');
    if (['verde', 'ambar', 'oceano', 'vinho', 'roxo', 'matrix'].includes(ap.arteCor)) {
      root.setAttribute('data-arte-cor', ap.arteCor);
    }

    /* IA & agentes auxiliares: ligar/desligar globalmente */
    root.classList.toggle('ia-off', ap.iaAtiva === false || ap.agentesAtivos === false);

    /* Identidade (título/subtítulo vivem no I18N lidos na renderização) */
    if (ap.titulo != null) I18N.titulo = String(ap.titulo).slice(0, 24) || 'NEITZEL';
    if (ap.sufixo != null) I18N.sufixo = String(ap.sufixo).slice(0, 36) || 'Sistema Digital';
    try { document.title = I18N.titulo + ' — ' + I18N.sufixo; } catch (e) {}
  } catch (e) {}
}

function salvarAparencia(ap) {
  try {
    localStorage.setItem(AP_KEY, JSON.stringify(Object.assign(lerAparencia(), ap)));
    E.audit.record('config.aparencia', 'sistema', null, ap);
  } catch (e) {}
}

/* ------------------------------------------------------------------ *
 * SOM NOS CLIQUES — sintetizado via WebAudio (sem arquivos externos)
 * ------------------------------------------------------------------ */

let __nzAudioCtx = null;
function tocarClique(forcar) {
  const ap = lerAparencia();
  const tipo = ap.somTipo || 'none';
  if (tipo === 'none' || !tipo) return; // "Sem som" — silêncio total
  if (!forcar && tipo === 'none') return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    __nzAudioCtx = __nzAudioCtx || new Ctx();
    const ctx = __nzAudioCtx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    const vol = Math.max(0.02, Math.min(1, (Number(ap.somVolume) || 50) / 100)) * 0.32;
    const t0 = ctx.currentTime;
    if (tipo === 'pop') {
      o.type = 'sine';
      o.frequency.setValueAtTime(340, t0);
      o.frequency.exponentialRampToValueAtTime(150, t0 + 0.08);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.10);
      o.start(t0); o.stop(t0 + 0.11);
    } else if (tipo === 'suave') {
      o.type = 'sine';
      o.frequency.setValueAtTime(520, t0);
      g.gain.setValueAtTime(vol * 0.55, t0);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.07);
      o.start(t0); o.stop(t0 + 0.08);
    } else {
      o.type = 'square';
      o.frequency.setValueAtTime(1150, t0);
      g.gain.setValueAtTime(vol * 0.35, t0);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.035);
      o.start(t0); o.stop(t0 + 0.045);
    }
  } catch (e) { /* som nunca bloqueia */ }
}
document.addEventListener('click', (ev) => {
  const alvo = ev.target instanceof Element ? ev.target.closest('.btn, .ecomim-nav-item, .kanban-card') : null;
  if (alvo) tocarClique(false);
}, true);

function applySavedTheme() {
  try {
    const t = localStorage.getItem('ecomim_theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
  aplicarAparencia(lerAparencia());
}

/* ------------------------------------------------------------------ *
 * VIEW: CONFIGURAÇÕES
 * ------------------------------------------------------------------ */

function renderConfig(c) {
  const cfg = E.db.get().config;
  const ap = lerAparencia();
  c.appendChild(el('div', 'page-header', `<h1>Configurações</h1><p>Empresa, aparência do sistema e dados.</p>`));

  /* --- PERSONALIZAÇÃO COMPLETA DO SISTEMA --- */
  /* Famílias de tema: cada uma com modelo ESCURO e CLARO na mesma cor-assinatura.
     `arteCor` tinge a obra de fundo (foto + aurora + chuva de código) para combinar. */
  const TEMAS_FAMILIAS = [
    { nome: 'Verde Neitzel', arteCor: 'verde', art: '',
      escuro: { tema: 'dark', destaque: '', fundo: '', surface: '', texto: '', borda: '' },
      claro: { tema: 'light', destaque: '#166a43', fundo: '#f4f6f4', surface: '#ffffff', texto: '#141a16', borda: '#dde5df' } },
    { nome: 'Grafite & Âmbar', arteCor: 'ambar', art: '',
      escuro: { tema: 'dark', destaque: '#d97706', fundo: '#0b0c10', surface: '#15171e', texto: '#eceae4', borda: '#272a33' },
      claro: { tema: 'light', destaque: '#b45309', fundo: '#faf7f1', surface: '#ffffff', texto: '#241d12', borda: '#eadfcc' } },
    { nome: 'Oceano Profundo', arteCor: 'oceano', art: 'oceano',
      escuro: { tema: 'dark', destaque: '#38bdf8', fundo: '#081019', surface: '#0f1a26', texto: '#e6f0f7', borda: '#1c2d3d' },
      claro: { tema: 'light', destaque: '#0369a1', fundo: '#edf4fa', surface: '#ffffff', texto: '#122436', borda: '#d2e1ee' } },
    { nome: 'Vinho Executivo', arteCor: 'vinho', art: '',
      escuro: { tema: 'dark', destaque: '#f43f5e', fundo: '#120b0e', surface: '#1b1216', texto: '#f7edf0', borda: '#2f1d24' },
      claro: { tema: 'light', destaque: '#be123c', fundo: '#fbf3f4', surface: '#ffffff', texto: '#2b1219', borda: '#efdee1' } },
    { nome: 'Roxo Neon', arteCor: 'roxo', art: 'neon',
      escuro: { tema: 'dark', destaque: '#a78bfa', fundo: '#0c0a14', surface: '#14111f', texto: '#ece9fa', borda: '#251f3a' },
      claro: { tema: 'light', destaque: '#7c3aed', fundo: '#f5f3fc', surface: '#ffffff', texto: '#1d1533', borda: '#e3ddf4' } },
    { nome: 'Matrix Terminal', arteCor: 'matrix', art: 'matrix',
      escuro: { tema: 'dark', destaque: '#4ade80', fundo: '#050807', surface: '#0b110d', texto: '#d9f4e4', borda: '#17251c' },
      claro: { tema: 'light', destaque: '#15803d', fundo: '#eff7f0', surface: '#ffffff', texto: '#0f2015', borda: '#d5e7da' } },
  ];
  const MODELOS_BOTAO = [
    ['padrao', 'Padrão'], ['arredondado', 'Arredondado'], ['pill', 'Pílula'], ['quadrado', 'Quadrado'],
    ['contorno', 'Contorno'], ['3d', '3D (profundidade)'], ['glass', 'Vidro'], ['gradiente', 'Gradiente'], ['minimalista', 'Minimalista'],
  ];
  const MODELOS_FONTE = [
    ['sistema', 'Padrão do sistema'], ['display', 'Display (títulos)'], ['serif', 'Serifa clássica'],
    ['elegante', 'Elegante'], ['mono', 'Monoespaçada'], ['rounded', 'Arredondada'],
    ['legivel', 'Muito legível'], ['compacta', 'Compacta'],
  ];
  const MODELOS_MENU = [['lateral', 'Lateral (padrão)'], ['compacta', 'Compacta (só ícones)'], ['topo', 'Barra no topo']];
  const MODELOS_CARTAO = [['padrao', 'Padrão'], ['flat', 'Flat (sem sombra)'], ['elevado', 'Elevado']];
  const TAM_LETRAS = [['normal', 'Normal'], ['pequeno', 'Pequeno'], ['grande', 'Grande']];

  const cardPz = el('div', 'card', `
    <h4>Personalização do sistema</h4>
    <p class="text-muted" style="font-size:12px;margin:2px 0 12px">Mude tudo ao vivo: identidade, cores, formato dos botões, letras e sons. Fica salvo neste dispositivo.</p>

    <h4 style="margin-top:4px">Identidade</h4>
    <div class="form-grid">
      <label>Nome da empresa
        <input class="input" id="pz-empresa" maxlength="40" value="${esc(ap.empresa || '')}" placeholder="ex.: Barbearia Estilo Fino" />
      </label>
      <label>WhatsApp comercial
        <input class="input" id="pz-empwhats" value="${esc(cfg.empresa?.whatsapp || '')}" placeholder="51999998888" />
      </label>
      <label>Título do sistema <input class="input" id="pz-titulo" maxlength="24" value="${esc(ap.titulo || 'NEITZEL')}" /></label>
      <label>Subtítulo <input class="input" id="pz-sub" maxlength="36" value="${esc(I18N.sufixo || 'Sistema Digital')}" /></label>
      <label>Logo — JPG/PNG/WebP (até 3 MB; comprimimos e redimensionamos automaticamente)
        <span style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          ${ap.logoDataUrl ? `<img src="${ap.logoDataUrl}" alt="logo atual" style="width:46px;height:46px;object-fit:contain;border-radius:11px;border:1px solid var(--border);background:var(--surface-2)" />` : ''}
          <input type="file" id="pz-logo" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/avif" style="max-width:250px" />
          ${ap.logoDataUrl ? '<button class="btn btn-sm btn-ghost" id="pz-logo-remover">Remover</button>' : ''}
        </span>
        <span id="pz-logo-status" class="text-muted" style="font-size:11.5px">${ap.logoDataUrl ? '✔ Logo ativa na barra lateral, abertura e cenários.' : 'Sem logo — usando a letra N padrão.'}</span>
      </label>
    </div>

    <h4 style="margin-top:16px">Cores</h4>
    <div class="form-grid">
      <label>Cor de destaque
        <span style="display:flex;gap:8px;align-items:center">
          <input type="color" id="pz-destaque" value="${esc(ap.destaque || '#166a43')}" style="width:46px;height:34px;padding:2px;border-radius:8px;border:1px solid var(--border);background:var(--surface);cursor:pointer" />
          <button class="btn btn-sm btn-ghost pz-reset-cor" data-alvo="destaque">Padrão</button>
        </span>
      </label>
      <label>Fundo do sistema
        <span style="display:flex;gap:8px;align-items:center">
          <input type="color" id="pz-fundo" value="${esc(ap.fundo || '#090a0d')}" style="width:46px;height:34px;padding:2px;border-radius:8px;border:1px solid var(--border);background:var(--surface);cursor:pointer" />
          <button class="btn btn-sm btn-ghost pz-reset-cor" data-alvo="fundo">Padrão</button>
        </span>
      </label>
      <label>Cartões / superfícies
        <span style="display:flex;gap:8px;align-items:center">
          <input type="color" id="pz-surface" value="${esc(ap.surface || '#101116')}" style="width:46px;height:34px;padding:2px;border-radius:8px;border:1px solid var(--border);background:var(--surface);cursor:pointer" />
          <button class="btn btn-sm btn-ghost pz-reset-cor" data-alvo="surface">Padrão</button>
        </span>
      </label>
      <label>Cor da letra
        <span style="display:flex;gap:8px;align-items:center">
          <input type="color" id="pz-texto" value="${esc(ap.texto || '#e8eaee')}" style="width:46px;height:34px;padding:2px;border-radius:8px;border:1px solid var(--border);background:var(--surface);cursor:pointer" />
          <button class="btn btn-sm btn-ghost pz-reset-cor" data-alvo="texto">Padrão</button>
        </span>
      </label>
      <label>Cor das bordas
        <span style="display:flex;gap:8px;align-items:center">
          <input type="color" id="pz-borda" value="${esc(ap.borda || '#22242c')}" style="width:46px;height:34px;padding:2px;border-radius:8px;border:1px solid var(--border);background:var(--surface);cursor:pointer" />
          <button class="btn btn-sm btn-ghost pz-reset-cor" data-alvo="borda">Padrão</button>
        </span>
      </label>
      <label>Tema base
        <select class="input" id="pz-tema">
          <option value="dark" ${ap.tema !== 'light' ? 'selected' : ''}>Escuro</option>
          <option value="light" ${ap.tema === 'light' ? 'selected' : ''}>Claro</option>
        </select>
      </label>
    </div>
    <div style="margin-top:10px">
      <div class="text-muted" style="font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Temas prontos — cada família em escuro e claro (a arte de fundo acompanha a cor)</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${TEMAS_FAMILIAS.map((t, i) => `
          <div class="tema-familia">
            <span class="tf-nome">${esc(t.nome)}</span>
            <button class="btn btn-sm tf-btn" data-tema-familia="${i}" data-modelo="escuro" title="${esc(t.nome)} — modelo escuro">
              <i class="tf-cor" style="background:${t.escuro.fundo || '#090a0d'}"></i><i class="tf-cor" style="background:${t.escuro.destaque || '#3ecf8e'}"></i>Escuro
            </button>
            <button class="btn btn-sm tf-btn" data-tema-familia="${i}" data-modelo="claro" title="${esc(t.nome)} — modelo claro">
              <i class="tf-cor" style="background:${t.claro.fundo || '#f5f6f8'};box-shadow:inset 0 0 0 1px var(--border)"></i><i class="tf-cor" style="background:${t.claro.destaque}"></i>Claro
            </button>
          </div>`).join('')}
      </div>
    </div>

    <h4 style="margin-top:16px">Formatos</h4>
    <div class="form-grid">
      <label>Modelo dos botões
        <select class="input" id="pz-btn">${MODELOS_BOTAO.map(([v, n]) => `<option value="${v}" ${ap.botao === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <label>Modelo das letras
        <select class="input" id="pz-font">${MODELOS_FONTE.map(([v, n]) => `<option value="${v}" ${ap.fonte === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <label>Tamanho das letras
        <select class="input" id="pz-tamletra">${TAM_LETRAS.map(([v, n]) => `<option value="${v}" ${(ap.letraTamanho || 'normal') === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <label>Modelo do menu do sistema
        <select class="input" id="pz-menu">${MODELOS_MENU.map(([v, n]) => `<option value="${v}" ${ap.menu === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <label>Estilo dos cartões
        <select class="input" id="pz-cartao">${MODELOS_CARTAO.map(([v, n]) => `<option value="${v}" ${ap.cartao === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <label>Animações do sistema
        <span style="display:flex;gap:8px;align-items:center">
          <input type="checkbox" id="pz-anim" ${ap.animacoes !== false ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--e-brand)" />
          <span class="text-muted" style="font-size:12px">${ap.animacoes !== false ? 'ligadas' : 'desligadas'}</span>
        </span>
      </label>
      <label>Zoom da interface <input type="range" id="pz-zoom" min="80" max="130" step="5" value="${Number(ap.zoom) || 100}" style="accent-color:var(--e-brand)" /></label>
    </div>

    <h4 style="margin-top:16px">Tela de fundo &amp; arte</h4>
    <div class="form-grid">
      <label>Fundo do sistema
        <select class="input" id="pz-fundomodo">
          <option value="arte" ${ap.fundoModo !== 'padrao' ? 'selected' : ''}>Obra de arte da logo (aurora viva)</option>
          <option value="padrao" ${ap.fundoModo === 'padrao' ? 'selected' : ''}>Padrão limpo (sem imagem)</option>
        </select>
      </label>
      <label>Intensidade da arte <input type="range" id="pz-fundoop" min="10" max="100" step="5" value="${Number(ap.fundoOpacidade) == null || isNaN(Number(ap.fundoOpacidade)) ? 55 : Number(ap.fundoOpacidade)}" style="accent-color:var(--e-brand)" /></label>
      <label>Animação autoral do tema
        <select class="input" id="pz-temaart">
          ${[['', 'Nenhuma'], ['aurora', 'Véu Aurora Boreal'], ['neon', 'Grade Neon Cyberpunk'], ['sakura', 'Pétalas Sakura'], ['matrix', 'Chuva Matrix'], ['oceano', 'Ondas do Oceano'], ['deserto', 'Calor do Deserto']].map(([v, n]) => `<option value="${v}" ${(ap.temaArt || '') === v ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
    </div>

    <h4 style="margin-top:16px">Som nos cliques</h4>
    <div class="form-grid">
      <label>Som ao clicar em botões
        <select class="input" id="pz-somtipo">
          <option value="none" ${!ap.somTipo || ap.somTipo === 'none' ? 'selected' : ''}>Sem som (silencioso)</option>
          <option value="tick" ${ap.somTipo === 'tick' ? 'selected' : ''}>Tick (curto)</option>
          <option value="pop" ${ap.somTipo === 'pop' ? 'selected' : ''}>Pop (grave)</option>
          <option value="suave" ${ap.somTipo === 'suave' ? 'selected' : ''}>Suave</option>
        </select>
      </label>
      <label>Volume <input type="range" id="pz-somvol" min="5" max="100" step="5" value="${Number(ap.somVolume) || 50}" style="accent-color:var(--e-brand)" /></label>
      <label> <button class="btn btn-sm" id="pz-som-teste">Testar som</button></label>
    </div>

    <div style="display:flex;gap:10px;margin-top:18px;padding-top:14px;border-top:1px dashed var(--border);flex-wrap:wrap;align-items:center">
      <button class="btn btn-danger" id="pz-reset">Restaurar tudo ao padrão de criação</button>
      <span class="text-muted" style="font-size:11.5px">Volta cores, título, logo, botões, letras, sons, tema e zoom ao original.</span>
    </div>
  `);
  c.appendChild(cardPz);

  /* --- ASSISTÊNCIA DE IA & AGENTES --- */
  const cardIa = el('div', 'card', `
    <h4>Assistência de IA &amp; Agentes</h4>
    <p class="text-muted" style="font-size:12px;margin:2px 0 12px">Os auxiliares do sistema trabalham por você: respondem dúvidas, sugerem próximos passos, avisam de riscos e executam verificações sozinhos — sem inventar dados (tudo vem dos seus registros reais). Desligue quando quiser um sistema 100% silencioso.</p>
    <div class="form-grid">
      <label>Assistente IA (balão de ajuda e respostas)
        <span style="display:flex;gap:8px;align-items:center">
          <input type="checkbox" id="pz-iaativa" ${ap.iaAtiva !== false ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--e-brand)" />
          <span class="text-muted" style="font-size:12px">${ap.iaAtiva !== false ? 'ligado' : 'desligado'}</span>
        </span>
      </label>
      <label>Agentes autônomos (Supervisor, automações e memória)
        <span style="display:flex;gap:8px;align-items:center">
          <input type="checkbox" id="pz-agentes" ${ap.agentesAtivos !== false ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--e-brand)" />
          <span class="text-muted" style="font-size:12px">${ap.agentesAtivos !== false ? 'ativos' : 'pausados'}</span>
        </span>
      </label>
      <label>Avisos proativos da IA (notificações úteis)
        <span style="display:flex;gap:8px;align-items:center">
          <input type="checkbox" id="pz-notifia" ${ap.notificacoesIA !== false ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--e-brand)" />
          <span class="text-muted" style="font-size:12px">${ap.notificacoesIA !== false ? 'permitidos' : 'silenciados'}</span>
        </span>
      </label>
    </div>
    <div class="text-muted" style="font-size:11.5px;margin-top:8px">
      Offline: o assistente continua funcionando com o motor local (dados do sistema). Pesquisas externas (Possível Cenário, Caçador) precisam de internet + servidor aberto.
    </div>
  `);
  c.appendChild(cardIa);
  const pzIa = cardIa.querySelector('#pz-iaativa');
  if (pzIa) pzIa.addEventListener('change', () => { salvarPz({ iaAtiva: pzIa.checked }); toast(pzIa.checked ? 'Assistente IA ligado' : 'Assistente IA desligado — balão oculto e insights pausados', 'info'); });
  const pzAgentes = cardIa.querySelector('#pz-agentes');
  if (pzAgentes) pzAgentes.addEventListener('change', () => { salvarPz({ agentesAtivos: pzAgentes.checked }); toast(pzAgentes.checked ? 'Agentes autônomos ativos' : 'Agentes autônomos pausados', 'info'); });
  const pzNotifIa = cardIa.querySelector('#pz-notifia');
  if (pzNotifIa) pzNotifIa.addEventListener('change', () => salvarPz({ notificacoesIA: pzNotifIa.checked }));

  const rebrandar = () => { try { renderApp(true); renderView('config'); } catch (e) {} };
  const salvarPz = (patch, recriar) => {
    aplicarAparencia(patch);
    salvarAparencia(patch);
    if (recriar) setTimeout(rebrandar, 60);
  };

  const bindCor = (id, campo, recriar) => {
    const inp = c.querySelector('#' + id);
    if (!inp) return;
    inp.addEventListener('input', () => { aplicarAparencia({ [campo]: inp.value }); salvarAparencia({ [campo]: inp.value }); });
    inp.addEventListener('change', () => { if (recriar) rebrandar(); });
  };
  bindCor('pz-destaque', 'destaque', false);
  bindCor('pz-fundo', 'fundo', false);
  bindCor('pz-surface', 'surface', false);
  bindCor('pz-texto', 'texto', false);
  bindCor('pz-borda', 'borda', false);

  c.querySelectorAll('.pz-reset-cor').forEach((bt) => bt.addEventListener('click', () => {
    const alvo = bt.dataset.alvo;
    aplicarAparencia({ [alvo]: '' });
    salvarAparencia({ [alvo]: '' });
    const mapa = { destaque: '#pz-destaque', fundo: '#pz-fundo', surface: '#pz-surface', texto: '#pz-texto', borda: '#pz-borda' };
    const inp = c.querySelector(mapa[alvo]);
    if (inp) {
      const padroes = { destaque: '#166a43', fundo: document.documentElement.getAttribute('data-theme') === 'light' ? '#f5f6f8' : '#090a0d', surface: document.documentElement.getAttribute('data-theme') === 'light' ? '#ffffff' : '#101116', texto: document.documentElement.getAttribute('data-theme') === 'light' ? '#131418' : '#e8eaee', borda: document.documentElement.getAttribute('data-theme') === 'light' ? '#e4e6ea' : '#22242c' };
      inp.value = padroes[alvo];
    }
    toast('Cor restaurada ao padrão', 'info');
  }));

  const pzTitulo = c.querySelector('#pz-titulo');
  if (pzTitulo) pzTitulo.addEventListener('change', () => salvarPz({ titulo: pzTitulo.value.trim() || 'NEITZEL', sufixo: c.querySelector('#pz-sub')?.value.trim() || '' }, true));
  const pzSub = c.querySelector('#pz-sub');
  if (pzSub) pzSub.addEventListener('change', () => salvarPz({ sufixo: pzSub.value.trim() || 'Sistema Digital', titulo: c.querySelector('#pz-titulo')?.value.trim() || 'NEITZEL' }, true));

  const pzLogo = c.querySelector('#pz-logo');
  if (pzLogo) pzLogo.addEventListener('change', async () => {
    const f = pzLogo.files && pzLogo.files[0];
    if (!f) return;
    const LIMITE = 3 * 1024 * 1024;
    if (f.size > LIMITE) { toast('Imagem muito grande — use até 3 MB.', 'warn'); return; }
    try {
      const dataUrl = await prepararLogo(f);
      salvarPz({ logoDataUrl: dataUrl }, true);
      toast('Logo aplicada ao sistema', 'success');
    } catch (e) {
      toast('Não foi possível processar a imagem: ' + (e && e.message ? e.message : 'arquivo inválido'), 'danger');
    }
  });
  const pzLogoRem = c.querySelector('#pz-logo-remover');
  if (pzLogoRem) pzLogoRem.addEventListener('click', () => { salvarPz({ logoDataUrl: '' }, true); });

  c.querySelectorAll('[data-tema-familia]').forEach((bt) => bt.addEventListener('click', () => {
    const fam = TEMAS_FAMILIAS[Number(bt.dataset.temaFamilia)];
    if (!fam) return;
    const vals = Object.assign({}, fam[bt.dataset.modelo] || fam.escuro, { arteCor: fam.arteCor, temaArt: fam.art });
    aplicarAparencia(vals);
    salvarAparencia(vals);
    toast('Tema aplicado: ' + fam.nome + ' (' + (bt.dataset.modelo === 'claro' ? 'claro' : 'escuro') + ')', 'success');
    setTimeout(rebrandar, 80);
  }));

  const pzTema = c.querySelector('#pz-tema');
  if (pzTema) pzTema.addEventListener('change', () => salvarPz({ tema: pzTema.value }));
  const pzBtn = c.querySelector('#pz-btn');
  if (pzBtn) pzBtn.addEventListener('change', () => salvarPz({ botao: pzBtn.value }));
  const pzFont = c.querySelector('#pz-font');
  if (pzFont) pzFont.addEventListener('change', () => salvarPz({ fonte: pzFont.value }));
  const pzAnim = c.querySelector('#pz-anim');
  if (pzAnim) pzAnim.addEventListener('change', () => salvarPz({ animacoes: pzAnim.checked }));
  const pzZoom = c.querySelector('#pz-zoom');
  if (pzZoom) pzZoom.addEventListener('change', () => salvarPz({ zoom: Number(pzZoom.value) }));

  const pzSom = c.querySelector('#pz-som');
  if (pzSom) pzSom.addEventListener('change', () => salvarPz({ som: pzSom.checked }));
  const pzFundoModo = c.querySelector('#pz-fundomodo');
  if (pzFundoModo) pzFundoModo.addEventListener('change', () => salvarPz({ fundoModo: pzFundoModo.value }));
  const pzFundoOp = c.querySelector('#pz-fundoop');
  if (pzFundoOp) pzFundoOp.addEventListener('input', () => {
    aplicarAparencia({ fundoOpacidade: Number(pzFundoOp.value) });
    salvarAparencia({ fundoOpacidade: Number(pzFundoOp.value) });
  });
  const pzTemaArt = c.querySelector('#pz-temaart');
  if (pzTemaArt) pzTemaArt.addEventListener('change', () => salvarPz({ temaArt: pzTemaArt.value }));
  const pzSomTipo = c.querySelector('#pz-somtipo');
  if (pzSomTipo) pzSomTipo.addEventListener('change', () => salvarPz({ somTipo: pzSomTipo.value }));
  const pzSomVol = c.querySelector('#pz-somvol');
  if (pzSomVol) pzSomVol.addEventListener('input', () => salvarAparencia({ somVolume: Number(pzSomVol.value) }));
  const pzSomTeste = c.querySelector('#pz-som-teste');
  if (pzSomTeste) pzSomTeste.addEventListener('click', () => tocarClique(true));

  const pzReset = c.querySelector('#pz-reset');
  if (pzReset) pzReset.addEventListener('click', () => {
    if (!confirm('Restaurar TODA a personalização ao padrão de criação?\n(tema, cores, título, logo, modelo de botões, letras, sons e zoom)')) return;
    try { localStorage.removeItem(AP_KEY); } catch (e) {}
    I18N.titulo = 'NEITZEL';
    I18N.sufixo = 'Sistema Digital';
    aplicarAparencia(lerAparencia());
    toast('Sistema restaurado ao padrão de criação', 'success');
    setTimeout(rebrandar, 80);
  });

  /* --- Backup & dados --- */
  const bk = el('div', 'card', `
    <h4>Backup & dados</h4>
    <div class="text-muted">Exporta/importa tudo com criptografia real (AES-GCM). Em file:// o AES exige servidor local; sem ele, o fallback é sinalizado.</div>
    <div class="btn-group" style="margin-top:8px;flex-wrap:wrap">
      <button class="btn btn-sm" id="bk-export">⬇ Exportar backup (criptografado)</button>
      <button class="btn btn-sm" id="bk-import">⬆ Importar backup</button>
      <button class="btn btn-sm" id="bk-csv"> Exportar leads CSV</button>
      <button class="btn btn-sm" id="bk-migrar">Migrar dados do LeadsCRM antigo</button>
    </div>
    <div id="cfg-msg" class="text-muted" style="margin-top:8px;font-size:12px"></div>
  `);
  c.appendChild(bk);
  const bkMigrar = bk.querySelector('#bk-migrar');
  if (bkMigrar) bkMigrar.addEventListener('click', () => {
    const msgEl = bk.querySelector('#cfg-msg');
    const det = features.migrator.detectLegacy();
    if (!det.exists) { if (msgEl) msgEl.textContent = 'Nenhum dado do LeadsCRM encontrado neste navegador.'; return; }
    if (!confirm(`Encontrei ${det.leads} leads e ${det.fila} itens de fila do LeadsCRM. Migrar para o NEITZEL agora?`)) return;
    const r = features.migrator.migrate();
    if (r.ok) {
      const s = r.stats;
      if (msgEl) msgEl.textContent = `Migração concluída: ${s.leads} leads importados, ${s.fila} da fila, ${s.duplicados} duplicados ignorados${s.config ? ', configuração copiada' : ''}.`;
      toast('Migração concluída', 'success');
      renderView('leads');
    } else if (msgEl) msgEl.textContent = 'Falha na migração: ' + (r.code || 'erro');
  });
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
 * MODO OFFLINE — monitor de conexão + relatório honesto do que
 * funciona sem internet/servidor e do que precisa de rede.
 * ------------------------------------------------------------------ */

const CONEXAO = { online: navigator.onLine, servidor: null, _timer: 0 };

/** Sonda o servidor local/backend (1.2s de tolerância). */
async function sondarServidor() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1200);
    const r = await fetch(`${window.NEITZEL_API_BASE || ''}/api/health`, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    return !!(r && r.ok);
  } catch (e) { return false; }
}

function pintarSeloConexao() {
  const topbar = document.querySelector('.topbar-right');
  if (!topbar) return;
  let selo = document.getElementById('offline-selo');
  const offline = !(CONEXAO.online && CONEXAO.servidor);
  if (offline && !selo) {
    selo = el('span', 'offline-selo', '');
    selo.id = 'offline-selo';
    selo.title = 'Clique para ver o relatório do modo offline (Segurança & Diagnóstico)';
    selo.addEventListener('click', () => renderView('seguranca'));
    topbar.insertBefore(selo, topbar.firstChild);
  } else if (!offline && selo) {
    selo.remove();
    return;
  }
  if (selo) {
    const motivo = !CONEXAO.online ? 'Sem internet' : 'Sem servidor';
    selo.innerHTML = `<span>⏻</span>${esc(motivo)} · modo local`;
  }
}

async function verificarConexaoAgora() {
  CONEXAO.online = navigator.onLine;
  CONEXAO.servidor = await sondarServidor();
  pintarSeloConexao();
}

function iniciarMonitorConexao() {
  window.addEventListener('online', verificarConexaoAgora);
  window.addEventListener('offline', verificarConexaoAgora);
  verificarConexaoAgora();
  clearInterval(CONEXAO._timer);
  CONEXAO._timer = setInterval(verificarConexaoAgora, 45000);
}

/** Relatório do modo offline: o que segue funcionando e o que depende de rede. */
function relatorioOffline() {
  const okLocal = [
    ['Leads & CRM', 'cadastro, funil e histórico — tudo salvo no dispositivo'],
    ['Clientes & CS', 'perfis, health score e receita'],
    ['Financeiro', 'contas a pagar/receber e fluxo local'],
    ['Agenda & Tarefas', 'eventos, prazos e cronômetros'],
    ['Atendimento', 'tickets com protocolo e SLA'],
    ['Operacional', 'serviços, produtos e estoque'],
    ['Memória & Diários', 'captura ao vivo, arquivo em 30d e PDF em 60d'],
    ['Assistente IA', 'motor local responde com os dados do sistema'],
    ['Backup criptografado', 'exportar/importar arquivos localmente'],
    ['Personalização', 'temas, arte de fundo, fontes e sons'],
  ];
  const precisaRede = [
    ['Possível Cenário (externo)', 'notícias, índices e Google Maps' + (CONEXAO.servidor ? '' : ' + servidor aberto')],
    ['Caçador de leads externos', 'busca real no Google Maps via Chrome'],
    ['Portal do Cliente público', 'agenda online para seus clientes'],
    ['Pesquisa web da IA', 'quando a pergunta vai além dos dados locais'],
  ];
  return { okLocal, precisaRede, estado: CONEXAO };
}

/* ------------------------------------------------------------------ *
 * COMANDO RÃPIDO (⌘K)
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * DICAS DE AJUDA — botão "?" na sidebar explica como usar cada espaço
 * ------------------------------------------------------------------ */

const HELP_DICAS = {
  dashboard: ' <b>Painel</b>: visão geral da operação. Veja KPIs (leads, MRR, conversão), alertas e ações rápidas — inclusive o botão <b>Possível Cenário</b>.',
  leads: ' <b>Leads & CRM</b>: cadastre e gerencie leads com filtros (busca, etapa, origem, cidade, valor e ordem). Clique em <b>+ Novo lead</b> para adicionar, ou numa linha para abrir a ficha com histórico e ações.',
  funil: ' <b>Funil</b>: kanban visual com filtros por busca, origem e cidade. <b>Arraste</b> os cards entre etapas (novo → contato → qualificado → proposta → ganho/perdido).',
  agenda: ' <b>Agenda</b>: agende eventos, tarefas, reuniões, ligações e lembretes. Clique em <b>+ Novo evento</b> para adicionar.',
  financeiro: ' <b>Financeiro</b>: contas a receber e a pagar. Clique em <b>+ Nova conta</b> para lançar. Valores em reais; totais recalculados automaticamente.',
  atendimento: ' <b>Atendimento</b>: tickets com protocolo e SLA. Clique em <b>+ Novo ticket</b> ou em <b>Ver</b> num ticket para responder. Use a IA para sugerir respostas.',
  clientes: ' <b>Clientes & CS</b>: perfil 360° com health score. Cadastre clientes e monitore MRR, risco e último acesso.',
  projetos: ' <b>Projetos</b>: gerencie projetos e tarefas com progresso automático. Clique em <b>+ Novo projeto</b> e depois em <b>+ Tarefa</b>.',
  marketing: ' <b>Marketing</b>: campanhas com orçamento. Registre <b>+ Lead</b> e <b>+ Conversão</b> por campanha para calcular ROI.',
  rh: 'â€ <b>RH</b>: colaboradores, cargos e departamentos. Clique em <b>+ Novo colaborador</b> para cadastrar.',
  bi: ' <b>BI & Analytics</b>: indicadores ao vivo. Use a caixa <b>"Pergunte ao BIâ€</b> para fazer perguntas em linguagem natural sobre seus dados.',
  inteligencia: ' <b>Centro de Inteligência</b>: o Agente Supervisor verifica a saúde dos módulos e sugere próximos passos.',
  estrategia: ' <b>Estratégia & Previsão</b>: o sistema pensa com você — clientes frios (25+ dias sem movimento, manter/apagar), quem mais/menos gera receita, produtos e serviços que mais/menos vendem, previsão de movimento e o botão <b>Possível Cenário</b> que pesquisa fontes reais da sua região.',
  memoria: ' <b>Atividades & Memória</b>: tudo fica registrado aqui ao vivo. A memória captura o mês automaticamente; aos 30 dias arquiva num lugar separado e aos 60 dias gera o PDF pronto.',
  seguranca: ' <b>Segurança & Diagnóstico</b>: senha de 6 dígitos, recuperação, Google, MFA e LGPD em cima; saúde do sistema (internet, bateria, erros) embaixo.',
  config: ' <b>Configurações</b>: personalize TUDO — título e logo do sistema, todas as cores, modelo dos botões e das letras, sons nos cliques, temas prontos, animações, zoom e o botão que restaura tudo ao padrão de criação. Backup criptografado fica aqui embaixo.',
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
  const itens = [];
  VIEWS.forEach((v) => itens.push({ title: v.nome, icon: v.icone, action: () => { renderView(v.id); box.classList.remove('open'); } }));
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

function closeAllPanels() {
  document.querySelectorAll('.cmdk').forEach((b) => b.classList.remove('open'));
  document.querySelectorAll('.notif-panel').forEach((b) => b.classList.remove('open'));
  document.querySelectorAll('.lead-detail-panel').forEach((b) => b.classList.remove('open'));
}

/* ------------------------------------------------------------------ *
 * INICIALIZAÇÃO
 * ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', () => {
  window.__NZ_SESSAO_INICIO = Date.now();
  E.init();
  applySavedTheme();
  renderApp();
  iniciarMonitorConexao();
  // Verificação automática do Agente Supervisor (assíncrona, não bloqueia o boot)
  // — só roda quando os agentes autônomos estão ligados nas configurações.
  if (window.NEITZEL_IA && window.NEITZEL_IA.verificarSistema && lerAparencia().agentesAtivos !== false) {
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
