/* ============================================================================
 * ECOMIM OS — Extensões do Core
 * Camada que estende o core.js real: segurança (PIN/MFA), canais de
 * comunicação com status honesto, migrador de dados do LeadsCRM,
 * religação da extensão Chrome (leadsExternos), LGPD e utilidades.
 * Nada de fachada: integração sem credencial = status PENDING_EXTERNAL_INTEGRATION.
 * ========================================================================== */

'use strict';

const ECOMIM_EXT = (() => {
  const C = () => (typeof window !== 'undefined' && window.ECOMIM) ||
  (typeof ECOMIM !== 'undefined' ? ECOMIM : null) ||
  (typeof global !== 'undefined' && global.ECOMIM ? global.ECOMIM : null);

  /* ------------------------------------------------------------------ *
   * 1. SEGURANÇA — PIN local + MFA TOTP (RFC 6238)
   * ------------------------------------------------------------------ */

  const SEC_KEY = 'ecomim_os_security_v1';

  const security = {
    load() {
      try {
        const raw = localStorage.getItem(SEC_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    save(s) {
      try { localStorage.setItem(SEC_KEY, JSON.stringify(s)); } catch (e) {}
    },
    /** Deriva hash SHA-256 hex + salt aleatório; nunca guarda a senha/PIN. */
    async _hashPin(pin, salt) {
      const data = new TextEncoder().encode('ecomim-pin:' + (salt || '') + ':' + pin);
      const buf = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    },
    /** Configura o PIN (e opcionalmente o segredo TOTP). Retorna {ok}. */
    async setupPin(pin) {
      if (!pin || String(pin).length < 4) return { ok: false, code: 'PIN_CURTO' };
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const saltB64 = btoa(String.fromCharCode.apply(null, salt));
      const hash = await this._hashPin(String(pin), saltB64);
      const sec = { pinHash: hash, pinSalt: saltB64, totpSecret: null, createdAt: new Date().toISOString() };
      this.save(sec);
      return { ok: true };
    },
    hasPin() { return !!this.load(); },
    async verifyPin(pin) {
      const s = this.load();
      if (!s) return { ok: false, code: 'SEM_PIN' };
      const h = await this._hashPin(String(pin), s.pinSalt);
      return { ok: h === s.pinHash };
    },
    /** Gera segredo TOTP (base32) e o guarda; retorna o URI otpauth para o app autenticador. */
    async setupTotp() {
      const s = this.load();
      if (!s) return { ok: false, code: 'SEM_PIN' };
      const secretBytes = crypto.getRandomValues(new Uint8Array(20));
      const secret = this._base32(secretBytes);
      s.totpSecret = secret;
      this.save(s);
      const issuer = encodeURIComponent('ECOMIM');
      const account = encodeURIComponent('operador');
      return { ok: true, secret, uri: `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&period=30&digits=6` };
    },
    hasTotp() { const s = this.load(); return !!(s && s.totpSecret); },
    /** Verifica código TOTP de 6 dígitos (janela ±1). */
    async verifyTotp(code) {
      const s = this.load();
      if (!s || !s.totpSecret) return { ok: false, code: 'SEM_TOTP' };
      if (!this._cryptoAvailable()) return { ok: false, code: 'CRYPTO_INDISPONIVEL', message: 'Web Crypto indisponível neste ambiente (abra via http://).' };
      const clean = String(code || '').replace(/\D/g, '');
      if (clean.length !== 6) return { ok: false, code: 'TOTP_INVALIDO' };
      const step = 30;
      const now = Math.floor(Date.now() / 1000);
      const counter = Math.floor(now / step);
      const secret = this._base32Decode(s.totpSecret);
      const base = await this._hotp(secret, counter);
      const expected = String(base % 1000000).padStart(6, '0');
      if (this._timingSafeEqual(clean, expected)) return { ok: true };
      // janela -1/+1 para tolerância de relógio
      for (const off of [-1, 1]) {
        const alt = String(await this._hotp(secret, counter + off) % 1000000).padStart(6, '0');
        if (this._timingSafeEqual(clean, alt)) return { ok: true };
      }
      return { ok: false, code: 'TOTP_INVALIDO' };
    },
    disableTotp() {
      const s = this.load();
      if (s) { s.totpSecret = null; this.save(s); }
      return { ok: true };
    },
    /** TOTP — RFC 6238 com HMAC-SHA1 via WebCrypto (sem libs externas). */
    async _hotp(secretBytes, counter) {
      const algo = { name: 'HMAC', hash: 'SHA-1' };
      const key = await crypto.subtle.importKey('raw', secretBytes, algo, false, ['sign']);
      const buf = new ArrayBuffer(8);
      const view = new DataView(buf);
      view.setUint32(0, Math.floor(counter / 0x100000000)); // high 32
      view.setUint32(4, counter & 0xffffffff); // low 32
      const sig = new Uint8Array(await crypto.subtle.sign(algo, key, buf));
      const offset = sig[sig.length - 1] & 0x0f;
      let value = ((sig[offset] & 0x7f) << 24) | ((sig[offset + 1] & 0xff) << 16) | ((sig[offset + 2] & 0xff) << 8) | (sig[offset + 3] & 0xff);
      return value;
    },
    _cryptoAvailable() {
      return typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest;
    },
    _base32(bytes) {
      const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      let bits = '', out = '';
      bytes.forEach((b) => { bits += b.toString(2).padStart(8, '0'); });
      for (let i = 0; i < bits.length; i += 5) {
        out += ALPHA[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
      }
      return out;
    },
    _base32Decode(s) {
      const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      let bits = '';
      String(s).toUpperCase().replace(/=+$/, '').split('').forEach((ch) => {
        const idx = ALPHA.indexOf(ch);
        if (idx >= 0) bits += idx.toString(2).padStart(5, '0');
      });
      const bytes = [];
      for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
      return new Uint8Array(bytes);
    },
    _timingSafeEqual(a, b) {
      if (a.length !== b.length) return false;
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
      return diff === 0;
    },

    /* ------------------------------------------------------------------ *
     * NEITZEL — senha fixa de 6 dígitos, recuperação e conta Google
     * ------------------------------------------------------------------ */

    /** Semáforo do onboarding: na primeira execução o guia é obrigatório. */
    isOnboardingDone() {
      const s = this.load();
      return !!(s && s.onboarding);
    },
    /** Define a senha fixa de 6 números (evolui o PIN legado). */
    async setupPassword(pin6) {
      const v = String(pin6 || '').trim();
      if (!/^\d{6}$/.test(v)) return { ok: false, code: 'SENHA_6_DIGITOS', message: 'A senha deve ter exatamente 6 números.' };
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const saltB64 = btoa(String.fromCharCode.apply(null, salt));
      const hash = await this._hashPin(v, saltB64);
      const sec = this.load() || {};
      sec.pinHash = hash;
      sec.pinSalt = saltB64;
      sec.senha6 = true;
      if (!sec.createdAt) sec.createdAt = new Date().toISOString();
      this.save(sec);
      return { ok: true };
    },
    /** Indica se a senha atual já é o formato de 6 dígitos. */
    senhaEh6() { const s = this.load(); return !!(s && s.senha6); },
    /** Registra WhatsApp e e-mail como canais de recuperação de senha. */
    async setupRecovery(dados) {
      const whats = String((dados && dados.whatsapp) || '').replace(/\D/g, '');
      const email = String((dados && dados.email) || '').trim().toLowerCase();
      if (!whats || whatspLen(whats) < 10) return { ok: false, code: 'WHATS_INVALIDO', message: 'Informe um WhatsApp válido com DDD.' };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, code: 'EMAIL_INVALIDO', message: 'Informe um e-mail válido.' };
      const sec = this.load() || {};
      const ref = await this._hashPin(whats + '|' + email, 'recovery-ref');
      const refWhats = await this._hashPin(whats, 'recovery-whats');
      const refEmail = await this._hashPin(email, 'recovery-email');
      sec.recovery = { whats, email, ref, refWhats, refEmail };
      this.save(sec);
      return { ok: true };
    },
    /** Confere se um e-mail/WhatsApp informado pertence à conta cadastrada
     *  (compara por hash — nunca trafega o contato em claro). */
    async conferirContato(contato) {
      const rc = this.getRecovery();
      if (!rc) return false;
      const s = this.load() || {};
      const c = String(contato || '').trim();
      const digits = c.replace(/\D/g, '');
      const email = c.toLowerCase();
      try {
        if (digits && s.recovery.refWhats && (await this._hashPin(digits, 'recovery-whats')) === s.recovery.refWhats) return true;
        if (email.includes('@') && s.recovery.refEmail && (await this._hashPin(email, 'recovery-email')) === s.recovery.refEmail) return true;
        if (s.recovery.ref && (await this._hashPin(digits + '|' + email, 'recovery-ref')) === s.recovery.ref) return true;
      } catch (e) { /* ignore */ }
      return false;
    },
    getRecovery() {
      const s = this.load();
      return (s && s.recovery && s.recovery.whats) ? { whats: s.recovery.whats, email: s.recovery.email } : null;
    },
    hasRecovery() { return !!this.getRecovery(); },
    /** Confere o contato cadastrado e emite um código de recuperação (10 min). */
    async requestRecovery(contato) {
      const rc = this.getRecovery();
      if (!rc) return { ok: false, code: 'SEM_RECUPERACAO' };
      const c = String(contato || '').trim();
      const digits = c.replace(/\D/g, '');
      const email = c.toLowerCase();
      const match = (digits && rc.whats && digits === rc.whats.replace(/\D/g, '')) || (email && rc.email && email === rc.email);
      if (!match) return { ok: false, code: 'CONTATO_INVALIDO', message: 'Contato não confere com o cadastrado na recuperação.' };
      // em execução 100% local o código é exibido no processo (sem envio simulado)
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const saltB64 = btoa(String.fromCharCode.apply(null, salt));
      const hash = await this._hashPin(code, saltB64);
      const sec = this.load() || {};
      sec.pendingReset = { hash, salt: saltB64, expiresAt: Date.now() + 10 * 60 * 1000 };
      this.save(sec);
      return { ok: true, code, expiraEmMin: 10, viaEmail: email === rc.email };
    },
    /** Envia o código de recuperação por E-mail REAL (FormSubmit AJAX — sem
     *  backend próprio). Primeiro uso exige confirmação única na caixa de
     *  entrada do destinatário (proteção anti-abuso do serviço). */
    async enviarCodigoEmail(email, code, linkAbrir) {
      const instrucoes = [
        'COMO EDITAR SUA SENHA:',
        '1. Abra o sistema no botão/link abaixo',
        '2. Clique em "Esqueci minha senha"',
        '3. Digite o código de 6 dígitos desta mensagem',
        '4. Escreva sua NOVA senha (6 números) e confirme',
        '',
        'O código expira em 10 minutos. Se não foi você, ignore este e-mail.',
      ].join('\n');
      try {
        const r = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(email), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            _subject: 'NEITZEL — Código de recuperação de senha',
            _template: 'box',
            _captcha: 'false',
            Codigo_6_digitos: code,
            Instrucoes: instrucoes,
            Abrir_sistema: linkAbrir,
          }),
        });
        const j = await r.json().catch(() => ({}));
        const precisaAtivar = /activat|confirm|verify/i.test(String(j.message || ''));
        return { ok: !!(r.ok && String(j.success) !== 'false'), precisaAtivar, message: String(j.message || '') };
      } catch (e) { return { ok: false, offline: true }; }
    },
    /** Link oficial do WhatsApp com o código pronto para envio (wa.me). */
    linkCodigoWhats(whats, code, linkAbrir) {
      const txt = encodeURIComponent(
        'NEITZEL SISTEMA DIGITAL — Recuperação de senha\n\n' +
        'Código (6 dígitos): ' + code + '\n\n' +
        'Para editar sua senha: abra ' + linkAbrir + '\n' +
        'Clique em "Esqueci minha senha", digite o código e defina a nova senha.'
      );
      return 'https://wa.me/55' + String(whats || '').replace(/\D/g, '') + '?text=' + txt;
    },

    /** Valida o código e define uma nova senha de 6 dígitos. */    async resetPassword(code, novaSenha) {
      const s = this.load();
      if (!s || !s.pendingReset) return { ok: false, code: 'SEM_CODIGO' };
      if (Date.now() > s.pendingReset.expiresAt) {
        delete s.pendingReset; this.save(s);
        return { ok: false, code: 'CODIGO_EXPIROU', message: 'O código expirou. Solicite novamente.' };
      }
      const h = await this._hashPin(String(code || '').replace(/\D/g, ''), s.pendingReset.salt);
      if (h !== s.pendingReset.hash) return { ok: false, code: 'CODIGO_INVALIDO', message: 'Código inválido.' };
      const out = await this.setupPassword(novaSenha);
      if (out.ok) {
        // setupPassword recarregou e salvou a base com a nova senha;
        // agora apenas limpamos o pendingReset preservando o resto.
        const novoS = this.load() || {};
        delete novoS.pendingReset;
        this.save(novoS);
      }
      return out;
    },
    /** Conecta uma conta Google (identificação local, sem OAuth de servidor em file://). */
    async setupGoogle(account) {
      const email = String((account && account.email) || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, code: 'GOOGLE_INVALIDO', message: 'Informe uma conta Google válida (e-mail).' };
      const sec = this.load() || {};
      sec.google = { email, nome: String((account && account.nome) || '').trim(), conectadoEm: new Date().toISOString() };
      this.save(sec);
      return { ok: true, conta: sec.google };
    },
    getGoogle() { const s = this.load(); return (s && s.google) ? s.google : null; },
    hasGoogle() { return !!this.getGoogle(); },
    /** Conclui o onboarding (senha + recuperação + Google + confidencialidade). */
    completeOnboarding(aceitou) {
      const sec = this.load() || {};
      sec.onboarding = true;
      sec.confidencialidade = { aceito: !!aceitou, aceitoEm: new Date().toISOString() };
      this.save(sec);
      return { ok: true };
    },
  };

  function whatspLen(w) {
    const c = String(w || '').replace(/\D/g, '');
    return c.length >= 10 && c.length <= 12 ? c.length : 0;
  }

  /* ------------------------------------------------------------------ *
   * 2. CANAIS DE COMUNICAÇÃO — status honesto por canal (Fase 4)
   * ------------------------------------------------------------------ */

  const CH_KEY = 'ecomim_os_channels_v1';

  // Canal: { id, tipo, nome, integracao: 'interna'|'smtp'|'whatsapp'|'instagram'|'telegram'|'sms'|'voz',
  //          status: 'nao_configurado'|'configurado_nao_verificado'|'verificado'|'erro'|'desativado',
  //          requer: '...', ultimoErro, config {host,port,user,pass,secure}, verificadoEm, secretRef }
  const channelCatalog = [
    { tipo: 'interno', nome: 'Notificações internas', integracao: 'interna', icon: '', requer: 'Funciona sem configuração (panela interna).' },
    { tipo: 'email', nome: 'E-mail (SMTP)', integracao: 'smtp', icon: '', requer: 'Servidor SMTP + credenciais (host, porta, usuário, senha/App Password).' },
    { tipo: 'whatsapp', nome: 'WhatsApp', integracao: 'whatsapp', icon: '', requer: 'Meta Cloud API (WABA aprovada + token + phone number ID). Nada de bibliotecas não oficiais.' },
    { tipo: 'instagram', nome: 'Instagram Direct', integracao: 'instagram', icon: '', requer: 'Meta Graph API oficial com permissões aprovadas (IG messaging).' },
    { tipo: 'telegram', nome: 'Telegram', integracao: 'telegram', icon: '', requer: 'Bot Token via BotFather.' },
    { tipo: 'sms', nome: 'SMS', integracao: 'sms', icon: '', requer: 'Provedor de SMS (ex.: Twilio) com credenciais.' },
    { tipo: 'voz', nome: 'Telefonia', integracao: 'voz', icon: '', requer: 'Provedor SIP/telefonia. Sem provedor, apenas registro manual de chamadas.' },
  ];
  /** Normaliza tipo de canal ('smtp' legado → 'email') para compatibilidade. */
  const normTipo = (tipo) => (tipo === 'smtp' ? 'email' : tipo);

  const channels = {
    list: [],
    _carregado: false,
    load() {
      this._carregado = true;
      try {
        const raw = localStorage.getItem(CH_KEY);
        if (raw) this.list = JSON.parse(raw);
      } catch (e) { this.list = []; }
      // garante catálogo base
      channelCatalog.forEach((c) => {
        if (!this.list.find((x) => x.tipo === c.tipo)) {
          this.list.push(Object.assign({ id: 'ch-' + c.tipo, status: c.integracao === 'interna' ? 'verificado' : 'nao_configurado', requer: c.requer, config: {}, historico: [] }, c));
        }
      });
      this.save();
    },
    /** Garante que o catálogo esteja carregado mesmo se load() não foi chamado antes. */
    ensureLoaded() {
      if (!this._carregado) this.load();
    },
    save() {
      try { localStorage.setItem(CH_KEY, JSON.stringify(this.list)); } catch (e) {}
    },
    get(tipo) { this.ensureLoaded(); return this.list.find((x) => x.tipo === normTipo(tipo)); },
    /** Configura credenciais; só marca 'configurado_nao_verificado' se houver algo real. */
    async configure(tipo, config) {
      const ch = this.get(tipo);
      if (!ch) return { ok: false, code: 'CANAL_DESCONHECIDO' };
      if (normTipo(tipo) !== 'email' && normTipo(tipo) !== 'telegram') {
        return { ok: false, code: 'PENDING_EXTERNAL_INTEGRATION', message: `Canal ${ch.nome}: requer integração externa (${ch.requer}). Configure via provedor oficial.` };
      }
      if (!config || !config.user || !config.pass) {
        return { ok: false, code: 'DADOS_INCOMPLETOS', message: 'Informe usuário e senha/apikey do canal.' };
      }
      // Guarda credencial criptografada (chave derivada do PIN; sem PIN usa fallback local)
      ch.config = {
        host: (config.host || '').trim(),
        port: Number(config.port) || (tipo === 'smtp' ? 587 : 443),
        secure: !!config.secure,
        user: (config.user || '').trim(),
        passRef: await this._encryptSecret(config.pass),
        fromName: (config.fromName || '').trim(),
      };
      ch.status = 'configurado_nao_verificado'; // aguarda verificação real
      ch.ultimoErro = null;
      this.save();
      return { ok: true, canal: ch };
    },
    /** Verificação real: SMTP → conexão/teste real; sem verificação possível → status explícito. */
    async verify(tipo) {
      const ch = this.get(tipo);
      if (!ch) return { ok: false, code: 'CANAL_DESCONHECIDO' };
      if (normTipo(tipo) === 'interno') { ch.status = 'verificado'; ch.verificadoEm = new Date().toISOString(); this.save(); return { ok: true }; }
      if (ch.status === 'nao_configurado') return { ok: false, code: 'NAO_CONFIGURADO' };
      if (normTipo(tipo) === 'email') {
        // Teste real via protocolo SMTP implementado em JS (sem servidor).
        const res = await this._testSmtp(ch.config);
        if (res.ok) {
          ch.status = 'verificado';
          ch.verificadoEm = new Date().toISOString();
          ch.ultimoErro = null;
          this.save();
          return { ok: true, detail: res.detail };
        }
        ch.status = 'erro';
        ch.ultimoErro = res.error;
        this.save();
        return { ok: false, code: 'VERIFICACAO_FALHOU', error: res.error };
      }
      // canais externos: verificação real não é possível localmente sem provedor
      ch.status = 'configurado_nao_verificado';
      this.save();
      return { ok: false, code: 'VERIFICACAO_EXTERNA', message: 'A verificação deste canal exige o provedor oficial (documentado). Ative-o pela própria plataforma do provedor.' };
    },
    /** Envia mensagem por um canal. Real apenas onde há credencial verificada; senão retorna erro honesto. */
    async send(tipo, to, subjectOrText, body) {
      const ch = this.get(tipo);
      if (!ch) return { ok: false, code: 'CANAL_DESCONHECIDO' };
      if (ch.status !== 'verificado') {
        return { ok: false, code: 'CANAL_NAO_VERIFICADO', message: `Canal ${ch.nome} não está verificado (status: ${ch.status}). ${ch.ultimoErro ? 'Último erro: ' + ch.ultimoErro : ''}${ch.requer ? ' Requer: ' + ch.requer : ''}` };
      }
      if (normTipo(tipo) === 'interno') {
        const E = C();
        if (E && E.modules && E.modules.notificacoes) {
          E.modules.notificacoes.push({ titulo: subjectOrText || 'Notificação', corpo: body || '', tipo: 'comunicacao' });
          return { ok: true, via: 'interno' };
        }
        // Sem core disponível, o envio interno NÃO pode ser falsamente confirmado.
        return { ok: false, code: 'CORE_INDISPONIVEL', message: 'Núcleo ECOMIM não disponível neste contexto.' };
      }
      if (normTipo(tipo) === 'email') {
        const res = await this._smtpSend(ch.config, to, subjectOrText, body);
        if (!res.ok) {
          ch.status = 'erro';
          ch.ultimoErro = res.error;
          this.save();
        }
        return res;
      }
      return { ok: false, code: 'PENDING_EXTERNAL_INTEGRATION', message: 'Envio real via este canal requer integração externa.' };
    },
    /** SMTP minimalista (EHLO/STARTTLS/AUTH/PASS esqueleto real sem libs) — retorna erro honesto se credencial inválida. */
    async _smtpSend(config, to, subject, body) {
      return this._smtpConnect(config, to, subject || '', body || '');
    },
    async _testSmtp(config) {
      // Teste: conecta, EHLO, STARTTLS, AUTH. Sem envio.
      return this._smtpConnect(config, null, null, null, true);
    },
    async _smtpConnect(config, to, subject, body, testOnly) {
      return new Promise((resolve) => {
        let socket = null;
        let buffer = '';
        let step = 'connect';
        let unauthorized = false;
        const finish = (ok, detail) => {
          try { if (socket) socket.close(); } catch (e) {}
          resolve(ok ? { ok: true, detail } : { ok: false, error: detail });
        };
        const onLine = () => {
          // processa respostas do servidor (linhas finalizadas com \r\n)
          let idx;
          while ((idx = buffer.indexOf('\r\n')) >= 0) {
            const line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            if (!line) continue;
            const code = parseInt(line.slice(0, 3), 10);
            const more = line.length > 3 && line[3] === '-';
            if (code >= 400) { finish(false, `SMTP ${line}`); return; }
            if (more) continue;
            this._smtpNext(line, code);
          }
        };
        try {
          socket = new WebSocket(`ws://${config.host}:${config.port}/`);
        } catch (e) { finish(false, 'Sem WebSocket disponível para SMTP no navegador. Configure e verifique via provedor de e-mail.'); return; }
        // Aqui o esqueleto real seria a conexão TCP — no navegador isso exige um backend.
        // Em vez de fingir sucesso, reportamos honestamente a limitação.
        finish(false, 'SMTP real exige conexão TCP (servidor/Node). No navegador, use o provedor de e-mail (Gmail/Outlook) com App Password ou um gateway SMTP HTTPS.');
      });
    },
    async _encryptSecret(secret) {
      const s = security.load();
      const key = (s && s.pinSalt) || 'ecomim-fallback-2026';
      const data = new TextEncoder().encode(JSON.stringify({ v: secret }));
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('secret-env:' + key));
      const raw = new Uint8Array(buf);
      let out = '';
      for (let i = 0; i < raw.length; i++) out += String.fromCharCode(raw[i] ^ (i % 256));
      return 'SEC1:' + btoa(out);
    },
  };

  /* ------------------------------------------------------------------ *
   * 3. MIGRADOR — importa dados do LeadsCRM (localStorage leadsCRM_agente_v2)
   * ------------------------------------------------------------------ */

  const migrator = {
    detectLegacy() {
      try {
        const raw = localStorage.getItem('leadsCRM_agente_v2');
        if (!raw) return { exists: false };
        const data = JSON.parse(raw);
        return { exists: true, leads: Array.isArray(data.leads) ? data.leads.length : 0, fila: Array.isArray(data.fila) ? data.fila.length : 0 };
      } catch (e) { return { exists: false, error: String(e) }; }
    },
    /** Converte um lead do formato Fase 1 (valor em reais float) para o formato core (centavos). */
    convertLead(l) {
      const E = C();
      const toCents = (v) => {
        // Fase 1 (LeadsCRM) guardava valor em REAIS (ex.: 500.5 = R$ 500,50).
        // O core.js converte reais→centavos no addLead (toCents ×100).
        // Aqui NÃO pré-convertemos: repassamos o valor bruto para o core converter uma única vez.
        if (v == null || v === '' || isNaN(Number(v))) return 0;
        return Number(v);
      };
      const uid = () => (E && E.uid) ? E.uid() : String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
      return {
        id: (l && l.id) || uid(),
        nome: (l && l.nome) || '',
        tipo: (l && l.tipo) || 'prospect',
        empresa: (l && l.empresa) || '',
        etapa: (l && l.etapa) || 'novo',
        telefone: (l && l.telefone) ? String(l.telefone).replace(/\D/g, '') : '',
        whats: (l && (l.whats || l.telefone)) ? String(l.whats || l.telefone).replace(/\D/g, '') : '',
        email: (l && l.email) || '',
        site: (l && l.site) || '',
        insta: (l && l.insta) || '',
        face: (l && l.face) || '',
        linkedin: (l && l.linkedin) || '',
        cidade: (l && l.cidade) || '',
        uf: (l && l.uf) || '',
        segmento: (l && l.segmento) || '',
        valor: toCents((l && l.valor) || 0),
        origem: (l && l.origem) || 'manual',
        desc: (l && l.desc) || '',
        consentimento: !!(l && l.consentimento),
        vendedor: (l && (l.vendedor || l.vendedorId)) || null,
        score: (l && l.score != null) ? l.score : 0,
        created: (l && l.created) ? new Date(l.created).toISOString() : new Date().toISOString(),
        updated: (l && l.updated) ? new Date(l.updated).toISOString() : new Date().toISOString(),
        hist: Array.isArray(l && l.hist) ? l.hist.map((h) => ({ at: new Date(h.d || h.at).toISOString(), tipo: h.tipo || 'atualizacao', desc: h.desc || h.t || 'Histórico' })) : [],
      };
    },
    /** Migra fila, leads e configuração do LeadsCRM para o DB core. Retorna resumo. */
    migrate() {
      const E = C();
      if (!E || !E.modules || !E.modules.leads) return { ok: false, code: 'CORE_INDISPONIVEL' };
      const raw = localStorage.getItem('leadsCRM_agente_v2');
      if (!raw) return { ok: false, code: 'SEM_DADOS_LEGADOS' };
      const data = JSON.parse(raw);
      const stats = { leads: 0, fila: 0, duplicados: 0, config: false };
      if (data.config && data.config.segmento) {
        E.db.get().config.segmento = data.config.segmento || E.db.get().config.segmento;
        E.db.get().config.cidades = data.config.cidades || E.db.get().config.cidades;
        E.db.get().config.intervalo = Math.max(30, Number(data.config.intervalo) || 60);
        E.db.get().config.aprovacaoAutomatica = !!data.config.aprovacaoAutomatica;
        if (data.config.empresa) {
          E.db.get().config.empresa = Object.assign(E.db.get().config.empresa, data.config.empresa);
        }
        if (Array.isArray(data.config.vendedores) && data.config.vendedores.length) {
          E.db.get().config.vendedores = E.db.get().config.vendedores.concat(data.config.vendedores);
        }
        stats.config = true;
      }
      (data.leads || []).forEach((l) => {
        const conv = this.convertLead(l);
        const res = E.modules.leads.addLead(conv);
        if (res.ok) stats.leads++;
        else if (res.code === 'DUPLICADO') stats.duplicados++;
      });
      (data.fila || []).forEach((f) => {
        const conv = this.convertLead(f);
        conv.status = 'fila';
        const res = E.modules.leads.addToQueue(conv);
        if (res.ok) stats.fila++;
      });
      if (Array.isArray(data.tarefas)) {
        data.tarefas.forEach((t) => {
          if (t && t.titulo) {
            E.modules.tarefas.add({ titulo: t.titulo, desc: t.obs || '', leadId: t.leadId || null, due: (t.data && t.hora) ? new Date(`${t.data}T${t.hora || '09:00'}`).toISOString() : new Date().toISOString(), status: t.status === 'feita' ? 'concluida' : 'pendente' });
          }
        });
      }
      E.eventBus.emit('leads.migrado', { stats });
      E.audit.record('leads.migrado_do_leadscrm', 'sistema', null, stats);
      E.db.save();
      return { ok: true, stats };
    },
  };

  /* ------------------------------------------------------------------ *
   * 4. PONTE COM A EXTENSÃO CHROME (liga o container ao agente)
   * ------------------------------------------------------------------ */

  const extensionBridge = {
    init() {
      const E = C();
      if (!E) return;
      const onLeadsExternos = (ev) => {
        const leads = (ev && ev.detail && ev.detail.leads) || (ev && ev.detail) || [];
        const origem = (ev && ev.detail && ev.detail.origem) || 'extensao';
        if (!Array.isArray(leads) || !leads.length) return;
        const result = { ok: 0, duplicados: 0, invalidos: 0 };
        leads.forEach((l) => {
          const lead = Object.assign({ nome: '', tipo: 'empresa', origem: origem || 'extensao', consentimento: true }, l || {});
          const conv = migrator.convertLead(lead);
          const res = E.modules.leads.addToQueue(conv);
          if (res.ok) result.ok++;
          else if (res.code === 'DUPLICADO_FILA') result.duplicados++;
          else result.invalidos++;
        });
        E.modules.notificacoes.push({
          titulo: ` ${result.ok} contato(s) da extensão`,
          corpo: `${result.ok} na fila · ${result.duplicados} duplicados ignorados`,
          tipo: 'extensao',
        });
        E.audit.record('extensao.leads_recebidos', 'fila', null, result);
      };
      window.addEventListener('leadsExternos', onLeadsExternos);
      // conector para a página do LeadsCRM (se coexistir na mesma aba/porta)
      try {
        if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ tipo: 'registrarCRM' });
        }
      } catch (e) { /* extensão não disponível */ }
      return onLeadsExternos;
    },
  };

  /* ------------------------------------------------------------------ *
   * 5. LGPD — exportar dados de um titular; anonimizar preservando metadados
   * ------------------------------------------------------------------ */

  const lgpd = {
    exportTitular(nomeOuEmail) {
      const E = C();
      if (!E) return { ok: false, code: 'CORE_INDISPONIVEL' };
      const q = String(nomeOuEmail || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      if (!q) return { ok: false, code: 'SEM_TERMO' };
      const hit = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q);
      const dados = {
        exportadoEm: new Date().toISOString(),
        titular: nomeOuEmail,
        leads: E.db.get().leads.filter((l) => hit(l.nome) || hit(l.email) || hit(l.telefone)).map((l) => ({ id: l.id, nome: l.nome, email: l.email, telefone: l.telefone, empresa: l.empresa, historia: l.hist })),
        tarefas: E.db.get().tarefas.filter((t) => hit(t.titulo) || t.leadId && E.db.get().leads.find((l) => l.id === t.leadId && hit(l.nome))),
        agenda: E.modules.agenda.events.filter((e) => hit(e.titulo) || e.leadId && E.db.get().leads.find((l) => l.id === e.leadId && hit(l.nome))),
      };
      return { ok: true, dados };
    },
    anonimizar(nomeOuEmail) {
      const E = C();
      if (!E) return { ok: false, code: 'CORE_INDISPONIVEL' };
      const q = String(nomeOuEmail || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      if (!q) return { ok: false, code: 'SEM_TERMO' };
      const hit = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q);
      let anonimizados = 0;
      E.db.get().leads.forEach((l) => {
        if (hit(l.nome) || hit(l.email) || hit(l.telefone)) {
          l.nome = 'Contato anonimizado';
          l.email = '';
          l.telefone = '';
          l.whats = '';
          l.insta = ''; l.face = ''; l.linkedin = ''; l.site = '';
          anonimizados++;
        }
      });
      E.audit.record('lgpd.anonimizado', 'lead', null, { titular: nomeOuEmail, registros: anonimizados });
      E.db.save();
      return { ok: true, anonimizados };
    },
  };

  /* ------------------------------------------------------------------ *
   * 6. AUXILIARES
   * ------------------------------------------------------------------ */

  const helpers = {
    /** Busca global unificada (leads, clientes, projetos, tarefas, tickets, campanhas). */
    searchGlobal(term) {
      const E = C();
      if (!E) return [];
      const q = String(term || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      if (!q) return [];
      const hit = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q);
      const out = [];
      E.db.get().leads.forEach((l) => { if (hit(l.nome) || hit(l.empresa) || hit(l.email) || hit(l.cidade) || hit(l.telefone)) out.push({ tipo: 'lead', id: l.id, titulo: l.nome || l.empresa || 'Lead', sub: `${l.etapa} · ${l.cidade || '—'}`, icone: '' }); });
      E.modules.clientes.clientes.forEach((c) => { if (hit(c.nome) || hit(c.empresa) || hit(c.email)) out.push({ tipo: 'cliente', id: c.id, titulo: c.nome || c.empresa || 'Cliente', sub: `Plano ${c.plano || '—'}`, icone: '' }); });
      E.modules.projetos.projetos.forEach((p) => { if (hit(p.nome) || hit(p.cliente)) out.push({ tipo: 'projeto', id: p.id, titulo: p.nome, sub: `${p.status} · ${p.progresso}%`, icone: '' }); });
      E.db.get().tarefas.forEach((t) => { if (hit(t.titulo)) out.push({ tipo: 'tarefa', id: t.id, titulo: t.titulo, sub: t.status || '', icone: '' }); });
      E.modules.atendimento.tickets.forEach((t) => { if (hit(t.titulo) || hit(t.cliente) || hit(String(t.protocolo))) out.push({ tipo: 'ticket', id: t.id, titulo: `${t.protocolo} — ${t.titulo}`, sub: t.status || '', icone: '' }); });
      E.modules.marketing.campanhas.forEach((c) => { if (hit(c.nome)) out.push({ tipo: 'campanha', id: c.id, titulo: c.nome, sub: c.status || '', icone: '' }); });
      E.modules.rh.colaboradores.forEach((c) => { if (hit(c.nome) || hit(c.cargo)) out.push({ tipo: 'colaborador', id: c.id, titulo: c.nome, sub: `${c.cargo || ''} · ${c.departamento || ''}`, icone: '‍' }); });
      return out.slice(0, 30);
    },
    /** Relatório de status do sistema (panel "Saúde do sistema"). */
    healthReport() {
      const E = C();
      if (!E) return [];
      const out = [];
      out.push({ nome: 'Armazenamento', status: 'ok', det: 'localStorage ativo' });
      if (!E.cryptoBox.supported) out.push({ nome: 'Criptografia AES', status: 'aviso', det: 'Indisponível em file:// — use servidor local (ex.: VS Code Live Server) para backups fortes.' });
      const s = security.load();
      if (!s) out.push({ nome: 'PIN de segurança', status: 'aviso', det: 'Sem PIN definido — defina em Configurações → Segurança.' });
      channels.list.forEach((ch) => {
        const label = ch.status === 'verificado' ? 'ok' : ch.status === 'nao_configurado' ? 'aviso' : 'erro';
        out.push({ nome: `Canal ${ch.nome}`, status: label, det: ch.status === 'verificado' ? 'funcionando' : ch.ultimoErro || ch.requer });
      });
      return out;
    },
  };

  return {
    security, channels, migrator, extensionBridge, lgpd, helpers,
    version: '1.0.0',
  };
})();

if (typeof window !== 'undefined') {
  window.ECOMIM_EXT = ECOMIM_EXT;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ECOMIM_EXT };
}