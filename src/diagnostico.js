/* ============================================================================
 * NEITZEL — CENTRAL DE DIAGNÓSTICO & REPORT DE PROBLEMAS
 * Monitora o ambiente e registra ocorrências automaticamente:
 *   - Conexão: offline / online / sinal lento (effectiveType, downlink)
 *   - Bateria do computador: nível baixo / descarregando
 *   - Armazenamento local quase cheio
 *   - Erros JavaScript do sistema (window.error + unhandledrejection)
 * Registros em neitzel_problemas_v1 (ring de 200). UI na view 'suporte'
 * com status ao vivo, log, report manual e envio por e-mail.
 * ========================================================================== */

'use strict';

(function () {
  const KEY = 'neitzel_problemas_v1';
  const MAX = 200;

  const lsGet = (k, f) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : f; } catch (e) { return f; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  const SEVERIDADE = { critico: 'badge-red', atencao: 'badge-orange', info: 'badge-gray' };

  /** Balão central: mostra o report na tela por 3 segundos.
   * NUNCA aparece enquanto o sistema estiver bloqueado (login/primeira senha) —
   * pessoas de fora não podem ver notificações sem colocar a senha.
   * Erros de carregamento/promessa rejeitada ficam apenas no registro silencioso. */
  function balaoProblema(severidade, tipo, mensagem, opts) {
    try {
      const o = opts || {};
      if (o.silencioso) return;
      const bloqueado = !!(document.querySelector('.ecomim-login') || document.querySelector('.nz-onboarding'));
      if (bloqueado) return;
      let cont = document.getElementById('nz-balao-problemas');
      if (!cont) {
        cont = document.createElement('div');
        cont.id = 'nz-balao-problemas';
        cont.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9999;display:flex;flex-direction:column-reverse;gap:10px;align-items:center;pointer-events:none';
        document.body.appendChild(cont);
      }
      const cores = { critico: '#ef4444', atencao: '#f59e0b', info: '#9aa0b4' };
      const cor = cores[severidade] || cores.info;
      const b = document.createElement('div');
      b.style.cssText = 'background:rgba(23,25,35,.96);color:#e8eaf2;border:1px solid rgba(255,255,255,.09);border-left:4px solid ' + cor +
        ';border-radius:12px;padding:12px 20px;max-width:min(440px,88vw);box-shadow:0 14px 38px rgba(0,0,0,.45)' +
        ";text-align:center;opacity:0;transform:translateY(10px) scale(.97);transition:opacity .22s ease,transform .22s ease";
      b.innerHTML =
        '<div style="font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:' + cor + '">' + esc(tipo) + '</div>' +
        '<div style="font-size:13px;margin-top:4px;line-height:1.45">' + esc(mensagem) + '</div>';
      cont.appendChild(b);
      requestAnimationFrame(() => { b.style.opacity = '1'; b.style.transform = 'translateY(0) scale(1)'; });
      setTimeout(() => {
        b.style.opacity = '0'; b.style.transform = 'translateY(-8px) scale(.98)';
        setTimeout(() => b.remove(), 260);
      }, 3000);
      while (cont.children.length > 3) cont.firstElementChild.remove();
    } catch (e) { /* nunca atrapalhar o fluxo */ }
  }

  function registrar(tipo, severidade, mensagem, detalhe, opts) {
    const lista = lsGet(KEY, []);
    lista.unshift({ id: 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), tipo, severidade, mensagem: String(mensagem || '').slice(0, 300), detalhe: String(detalhe || '').slice(0, 600), ts: new Date().toISOString() });
    if (lista.length > MAX) lista.length = MAX;
    lsSet(KEY, lista);
    balaoProblema(severidade, tipo, mensagem, opts);
    try {
      const E = window.ECOMIM;
      if (E && E.modules && E.modules.notificacoes && severidade !== 'info') {
        E.modules.notificacoes.add({ tipo: 'diagnostico', titulo: 'Diagnóstico: ' + tipo, corpo: mensagem, aviso: 'Central de Problemas' });
      }
    } catch (e) {}
    if (window.ECOMIM_APP && document.querySelector('[data-view="seguranca"].active')) window.ECOMIM_APP.renderView('seguranca');
  }

  /* ------------------------- monitores automáticos ---------------------- */
  let ultimoEstadoNet = navigator.onLine;
  function checarRede() {
    const on = navigator.onLine;
    if (on !== ultimoEstadoNet) {
      ultimoEstadoNet = on;
      registrar(on ? 'Conexão' : 'Sem conexão', on ? 'info' : 'critico', on ? 'Conexão restaurada.' : 'SEM INTERNET — o sistema continua funcionando offline; dados sincronizam quando voltar.');
    } else if (on && navigator.connection) {
      const cn = navigator.connection;
      const lenta = (cn.effectiveType && /2g/.test(cn.effectiveType)) || (cn.downlink != null && cn.downlink > 0 && cn.downlink < 0.7);
      const jaAvisou = lsGet('neitzel_diag_net_avisada', false);
      if (lenta && !jaAvisou) {
        lsSet('neitzel_diag_net_avisada', true);
        registrar('Sinal lento', 'atencao', `Internet lenta detectada (${cn.effectiveType || '?'}, ${cn.downlink || '?'} Mbps). O sistema pode ficar mais lento.`);
      } else if (!lenta && jaAvisou) {
        lsSet('neitzel_diag_net_avisada', false);
        registrar('Conexão', 'info', 'Velocidade da internet normalizada.');
      }
    }
  }

  async function checarBateria() {
    try {
      if (!navigator.getBattery) return;
      const b = await navigator.getBattery();
      const avisou = lsGet('neitzel_diag_bat_nivel', 100);
      if (b.level <= 0.2 && !b.charging && avisou > 20) {
        lsSet('neitzel_diag_bat_nivel', Math.round(b.level * 100));
        registrar('Bateria', 'atencao', `Bateria em ${Math.round(b.level * 100)}% e sem carregador — salve seu trabalho ou conecte o carregador.`);
      } else if (b.charging && avisou <= 20) {
        lsSet('neitzel_diag_bat_nivel', 100);
        registrar('Bateria', 'info', 'Carregador conectado.');
      }
    } catch (e) { /* API indisponível (Firefox/Safari) */ }
  }

  async function checarArmazenamento() {
    try {
      if (!navigator.storage || !navigator.storage.estimate) return;
      const est = await navigator.storage.estimate();
      if (est.usage != null && est.quota && est.usage / est.quota > 0.9) {
        const ja = lsGet('neitzel_diag_storage_avisado', false);
        if (!ja) {
          lsSet('neitzel_diag_storage_avisado', true);
          registrar('Armazenamento', 'atencao', `Espaço local ~90% ocupado (${Math.round(est.usage / 1048576)} MB). Exporte um backup e limpe relatórios antigos se necessário.`);
        }
      } else lsSet('neitzel_diag_storage_avisado', false);
    } catch (e) {}
  }

  function instalarHooksDeErro() {
    window.addEventListener('error', (ev) => {
      registrar('Erro do sistema', 'critico', ev.message || 'Erro inesperado', (ev.filename || '') + ':' + (ev.lineno || '') + '\n' + (ev.error && ev.error.stack ? String(ev.error.stack).slice(0, 400) : ''), { silencioso: true });
    });
    window.addEventListener('unhandledrejection', (ev) => {
      registrar('Erro do sistema', 'critico', 'Operação falhou (promessa rejeitada)', String(ev.reason && (ev.reason.stack || ev.reason.message) || ev.reason).slice(0, 400), { silencioso: true });
    });
  }

  /** Anomalias: chamado por módulos quando algo foge do padrão. */
  function anomalia(mensagem, detalhe) {
    registrar('Anomalia', 'atencao', mensagem, detalhe);
  }

  /* ------------------------------- UI ----------------------------------- */
  function statusRede() {
    if (!navigator.onLine) return '<span class="badge badge-red">Offline</span>';
    const cn = navigator.connection;
    if (!cn) return '<span class="badge badge-green">Online</span>';
    const tipo = (cn.effectiveType || '—').toUpperCase();
    const vel = cn.downlink != null ? cn.downlink + ' Mbps' : '';
    const lenta = /2g/.test(cn.effectiveType || '');
    return `<span class="badge ${lenta ? 'badge-orange' : 'badge-green'}">Online · ${tipo} ${vel}</span>`;
  }

  function render(c) {
    c.innerHTML = '';

    // Status ao vivo
    let bat = 'n/d';
    let stg = 'n/d';
    const st1 = document.createElement('div'); st1.className = 'card';
    st1.innerHTML = `<h4>Status agora</h4>
      <div class="diag-grid">
        <div class="diag-item">Internet<br>${statusRede()}</div>
        <div class="diag-item">Bateria<br><span id="dg-bat" class="text-muted">${bat}</span></div>
        <div class="diag-item">Armazenamento<br><span id="dg-stg" class="text-muted">${stg}</span></div>
        <div class="diag-item">Ocorrências registradas<br><b>${lsGet(KEY, []).length}</b></div>
      </div>
      <div class="btn-group" style="margin-top:10px">
        <button class="btn btn-sm btn-primary" id="dg-reportar"> Reportar problema manualmente</button>
        <button class="btn btn-sm btn-success" id="dg-email"> Enviar registro por e-mail</button>
        <button class="btn btn-sm btn-ghost" id="dg-limpar"> Limpar registro</button>
        <button class="btn btn-sm btn-ghost" id="dg-teste"> Testar alerta</button>
      </div>`;
    c.appendChild(st1);

    navigator.getBattery && navigator.getBattery().then((b) => {
      const el = document.getElementById('dg-bat');
      if (el) el.innerHTML = `<span class="badge ${b.level <= .2 && !b.charging ? 'badge-orange' : 'badge-green'}">${Math.round(b.level * 100)}% ${b.charging ? '· carregando' : ''}</span>`;
    });
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then((est) => {
      const el = document.getElementById('dg-stg');
      if (el && est.usage != null) el.innerHTML = `<span class="badge badge-gray">${Math.round(est.usage / 1048576)} MB usados${est.quota ? ' de ~' + Math.round(est.quota / 1048576) + ' MB' : ''}</span>`;
    });

    // Log de ocorrências
    const card = document.createElement('div'); card.className = 'card';
    const lista = lsGet(KEY, []);
    card.innerHTML = `<h4>Ocorrências (${lista.length})</h4>`;
    if (!lista.length) card.innerHTML += '<div class="empty">Nenhum problema registrado. Tudo rodando limpo. ✅</div>';
    else lista.slice(0, 50).forEach((p) => {
      const row = document.createElement('div'); row.className = 'mm-file';
      row.innerHTML = `
        <div class="mm-info"><span class="badge ${SEVERIDADE[p.severidade] || 'badge-gray'}">${esc(p.tipo)}</span>
          <span style="margin-left:8px">${esc(p.mensagem)}</span>
          ${p.detalhe ? `<div class="text-muted" style="font-size:11px;margin-top:3px;white-space:pre-wrap">${esc(p.detalhe)}</div>` : ''}
          <div class="text-muted" style="font-size:11px">${new Date(p.ts).toLocaleString('pt-BR')}</div></div>`;
      card.appendChild(row);
    });
    c.appendChild(card);

    // Ações
    st1.querySelector('#dg-reportar').addEventListener('click', () => {
      const desc = prompt('Descreva o problema com o máximo de detalhes:');
      if (!desc) return;
      const onde = prompt('Onde aconteceu? (sistema/planner/agenda/outro):') || 'não informado';
      registrar('Report manual', 'atencao', desc, 'Local: ' + onde);
      toast('Problema registrado. Obrigado!', 'success');
      render(c);
    });
    st1.querySelector('#dg-email').addEventListener('click', async () => {
      const sec = window.ECOMIM && window.ECOMIM.features && window.ECOMIM.features.security;
      const rc = sec && sec.getRecovery && sec.getRecovery();
      if (!rc || !rc.email) { toast('Configure a recuperação por e-mail em Segurança primeiro.', 'warn'); return; }
      const logs = lsGet(KEY, []).slice(0, 30).map((p) => `[${new Date(p.ts).toLocaleString('pt-BR')}] (${p.severidade}) ${p.tipo}: ${p.mensagem}${p.detalhe ? '\n   ' + p.detalhe.replace(/\n/g, '\n   ') : ''}`).join('\n\n') || 'Sem ocorrências registradas.';
      toast('Enviando diagnóstico para ' + rc.email + '…', 'info');
      const r = await sec.enviarCodigoEmail(rc.email, 'RELATÓRIO', 'DIAGNÓSTICO DO SISTEMA NEITZEL\n\n' + logs);
      toast(r.ok ? 'Diagnóstico enviado! Verifique a caixa de entrada.' : (r.precisaAtivar ? 'Confirme a ativação no e-mail e reenvie.' : 'Falha no envio — tente novamente.'), r.ok ? 'success' : 'danger');
    });
    st1.querySelector('#dg-limpar').addEventListener('click', () => {
      if (!confirm('Limpar todos os registros de problemas?')) return;
      lsSet(KEY, []); render(c); toast('Registro limpo.', 'info');
    });
    st1.querySelector('#dg-teste').addEventListener('click', () => {
      registrar('Teste', 'info', 'Alerta de teste disparado pelo usuário.');
      toast('Alerta de teste registrado.', 'info');
    });
  }

  /* ------------------------------- boot --------------------------------- */
  window.addEventListener('online', checarRede);
  window.addEventListener('offline', checarRede);
  setInterval(() => { checarRede(); }, 20000);
  setInterval(() => { checarBateria(); checarArmazenamento(); }, 120000);
  instalarHooksDeErro();
  setTimeout(() => { checarRede(); checarBateria(); checarArmazenamento(); }, 3000);

  window.NEITZEL_DIAG = { registrar, anomalia, render };
})();
