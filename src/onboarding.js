/* ============================================================================
 * NEITZEL — Sistema Empresarial Digital · Onboarding de Segurança
 * Fluxo obrigatório na primeira abertura:
 *   1. Criar senha fixa de 6 dígitos
 *   2. Cadastrar WhatsApp + e-mail para recuperação
 *   3. Conectar conta Google
 *   4. Aviso de confidencialidade (não compartilhar o arquivo)
 *   5. Notificação de boas-vindas
 * ========================================================================== */

'use strict';

(() => {
  const EXT = window.ECOMIM_EXT;
  if (!EXT) return;

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const toast = (msg, tipo = 'info') => {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast toast-${tipo}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 4200);
  };

  /** Bloqueia a tela com o fundo do onboarding (sem sair sem concluir). */
  function lockBackdrop() {
    let bd = document.querySelector('.nz-onboarding');
    if (!bd) {
      bd = document.createElement('div');
      bd.className = 'nz-onboarding';
      document.body.appendChild(bd);
    }
    bd.style.display = 'flex';
    return bd;
  }

  /** Abre o guia completo (chamado quando o onboarding não foi concluído). */
  function start() {
    if (EXT.security.isOnboardingDone()) return false;
    const sec = EXT.security;
    const shell = document.querySelector('.ecomim-shell');
    if (shell) shell.style.display = 'none';
    const root = document.getElementById('app-root');
    if (root) root.style.display = 'none';
    const bd = lockBackdrop();
    stepSenha(bd, sec);
    return true;
  }

  function renderSteps(bd, ativo) {
    const steps = [
      ['Passo 1', 'Senha de 6 dígitos'],
      ['Passo 2', 'Recuperação'],
      ['Passo 3', 'Conta Google'],
      ['Passo 4', 'Confidencialidade'],
    ];
    const bar = document.createElement('div');
    bar.className = 'nz-steps';
    steps.forEach((s, i) => {
      const chip = document.createElement('div');
      chip.className = 'nz-step' + (i < ativo ? ' done' : i === ativo ? ' active' : '');
      chip.innerHTML = `<span class="nz-step-n">${i < ativo ? '' : i + 1}</span><span class="nz-step-label">${s[1]}</span>`;
      bar.appendChild(chip);
    });
    return bar;
  }

  function card(bd, titulo, subtitulo, bodyHtml, botoes, sec) {
    bd.innerHTML = '';
    bd.appendChild(renderSteps(bd, { 's0': 0, 's1': 1, 's2': 2, 's3': 3 }[sec] != null ? { s0: 0, s1: 1, s2: 2, s3: 3 }[sec] : 0));
    const c = document.createElement('div');
    c.className = 'nz-card';
    c.innerHTML = `
      <div class="nz-logo"><span class="nz-logo-e">N</span></div>
      <h1 class="nz-title">NEITZEL</h1>
      <div class="nz-subtitle">SISTEMA EMPRESARIAL DIGITAL</div>
      <h2 class="nz-card-title">${esc(titulo)}</h2>
      <div class="nz-sub">${esc(subtitulo)}</div>
      <div class="nz-body">${bodyHtml}</div>
      <div class="nz-actions" data-actions></div>
    `;
    bd.appendChild(c);
    const act = c.querySelector('[data-actions]');
    botoes.forEach((b) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.kind || 'btn-primary');
      btn.textContent = b.label;
      btn.addEventListener('click', b.fn);
      act.appendChild(btn);
    });
    const first = c.querySelector('input');
    if (first) setTimeout(() => first.focus(), 60);
    return c;
  }

  /* ----------------------- Passo 1: senha ----------------------- */
  function stepSenha(bd, sec) {
    card(bd, 'Crie sua senha de acesso', 'Escolha uma senha fixa com exatamente 6 números. Ela será solicitada em toda abertura do sistema.', `
      <div class="nz-form">
        <label class="nz-field">
          <span>Nova senha (6 números)</span>
          <input class="input" id="nz-p1" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="••••••" />
        </label>
        <label class="nz-field">
          <span>Repita a senha</span>
          <input class="input" id="nz-p2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="••••••" />
        </label>
        <div id="nz-err" class="nz-err"></div>
      </div>
    `, [
      { label: 'Continuar →', kind: 'btn-primary', fn: async (e) => {
        const p1 = bd.querySelector('#nz-p1').value.trim();
        const p2 = bd.querySelector('#nz-p2').value.trim();
        const err = bd.querySelector('#nz-err');
        if (!/^\d{6}$/.test(p1)) { err.textContent = 'A senha deve ter exatamente 6 números.'; return; }
        if (p1 !== p2) { err.textContent = 'As senhas não conferem. Verifique.'; return; }
        const r = await sec.setupPassword(p1);
        if (!r.ok) { err.textContent = r.message || r.code; return; }
        stepRecovery(bd, sec);
      } },
    ], sec);
  }

  /* ----------------------- Passo 2: recuperação ----------------------- */
  function stepRecovery(bd, sec) {
    card(bd, 'Recuperação de senha', 'Cadastre um WhatsApp e um e-mail. Case você esqueça a senha, eles servirão para recuperar o acesso com um código temporário.', `
      <div class="nz-form">
        <label class="nz-field">
          <span>WhatsApp (com DDD)</span>
          <input class="input" id="nz-whats" inputmode="tel" placeholder="(47) 99999-9999" />
        </label>
        <label class="nz-field">
          <span>E-mail</span>
          <input class="input" id="nz-email" type="email" placeholder="voce@exemplo.com.br" />
        </label>
        <div class="nz-note"> Somente este dispositivo tem acesso a esses dados. Eles são usados apenas para recuperar sua senha.</div>
        <div id="nz-err" class="nz-err"></div>
      </div>
    `, [
      { label: 'Voltar', kind: 'btn-ghost', fn: () => stepSenha(bd, sec) },
      { label: 'Continuar →', kind: 'btn-primary', fn: async (e) => {
        const whats = bd.querySelector('#nz-whats').value;
        const email = bd.querySelector('#nz-email').value;
        const err = bd.querySelector('#nz-err');
        const r = await sec.setupRecovery({ whatsapp: whats, email });
        if (!r.ok) { err.textContent = r.message || r.code; return; }
        stepGoogle(bd, sec);
      } },
    ], sec);
  }

  /* ----------------------- Passo 3: conta Google ----------------------- */
  function stepGoogle(bd, sec) {
    card(bd, 'Conecte sua conta Google', 'Associe uma conta Google para identificação e sincronização futura. O vínculo é guardado com segurança local.', `
      <div class="nz-form">
        <label class="nz-field">
          <span>Nome completo</span>
          <input class="input" id="nz-google-nome" placeholder="Seu nome" />
        </label>
        <label class="nz-field">
          <span>E-mail da conta Google</span>
          <input class="input" id="nz-google-email" type="email" placeholder="nome@gmail.com" />
        </label>
        <div class="nz-note"> Em execução local (usando o arquivo direto), a conexão é registrada com segurança no navegador — sem envio de dados para serviços externos.</div>
        <div id="nz-err" class="nz-err"></div>
      </div>
    `, [
      { label: 'Voltar', kind: 'btn-ghost', fn: () => stepRecovery(bd, sec) },
      { label: 'Conectar', kind: 'btn-primary', fn: async (e) => {
        const nome = bd.querySelector('#nz-google-nome').value;
        const email = bd.querySelector('#nz-google-email').value;
        const err = bd.querySelector('#nz-err');
        const r = await sec.setupGoogle({ nome, email });
        if (!r.ok) { err.textContent = r.message || r.code; return; }
        stepConfidencialidade(bd, sec);
      } },
    ], sec);
  }

  /* ----------------------- Passo 4: confidencialidade ----------------------- */
  function stepConfidencialidade(bd, sec) {
    card(bd, 'Termo de confidencialidade', 'Leia atentamente antes de usar o sistema.', `
      <div class="nz-conf">
        <p><b> AVISO IMPORTANTE</b></p>
        <p>Este arquivo e todo o seu conteúdo são <b>confidenciais</b> e de propriedade exclusiva do <b>programador e da empresa</b>.</p>
        <p>Você <b>NÃO tem autorização</b> para compartilhar, distribuir, revender ou disponibilizar este sistema a terceiros, sob qualquer forma.</p>
        <p>O compartilhamento não autorizado constitui violação de confidencialidade e pode resultar em <b>crime</b>, com consequências legais, civis e criminais para quem compartilhar.</p>
      </div>
    `, [
      { label: 'Voltar', kind: 'btn-ghost', fn: () => stepGoogle(bd, sec) },
      { label: ' Estou ciente e aceito os requisitos', kind: 'btn-primary', fn: async () => {
        sec.completeOnboarding(true);
        finish(bd);
      } },
    ], sec);
  }

  /** Fim do onboarding: restaura o app e mostra boas-vindas. */
  function finish(bd) {
    bd.style.display = 'none';
    const shell = document.querySelector('.ecomim-shell');
    if (shell) shell.style.display = '';
    const root = document.getElementById('app-root');
    if (root) root.style.display = '';
    // recomenda re-renderizar o app (login já configurado)
    const E = window.ECOMIM;
    if (window.ECOMIM_APP && window.ECOMIM_APP.renderApp) window.ECOMIM_APP.renderApp();
    setTimeout(() => {
      toast(' Bem-vindo(a) ao NEITZEL — Sistema Empresarial Digital!', 'success');
      const fech = document.querySelector('.nz-onboarding');
      if (fech) fech.remove();
    }, 120);
  }

  // Exposição
  window.NEITZEL_ONBOARDING = { start, isDone: () => EXT.security.isOnboardingDone() };
})();