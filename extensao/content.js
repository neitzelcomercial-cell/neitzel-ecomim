// Cacador de Contatos ECOMIM — content script (injetado nas abas dos locais)
(function () {
  if (window.__cacadorInjetado) return;
  window.__cacadorInjetado = true;

  function limpar(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function norm(s) { return limpar(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

  function pegarMeta(prop, content) {
    const sel = document.querySelector('meta[property="' + prop + '"], meta[name="' + prop + '"]');
    if (sel && sel.content) return limpar(sel.content);
    return '';
  }

  function pegarLink(sel) { const el = document.querySelector(sel); return el ? limpar(el.href) : ''; }

  function extrairTelefones() {
    const tels = new Set();
    const re = /(?:\+?\d{2,3}[\s\-()]*)?(?:\(\d{2}\)\s*)?\d{4,5}[\s\-]?\d{4}/g;
    const m = document.body.innerText || '';
    for (const t of m.match(re) || []) {
      const d = t.replace(/\D/g, '');
      if (d.length >= 10 && d.length <= 13) tels.add(d);
    }
    for (const a of document.querySelectorAll('a[href*="tel:"]')) {
      const d = (a.href.match(/tel:([^?]+)/) || [])[1] || '';
      const l = d.replace(/\D/g, '');
      if (l.length >= 10 && l.length <= 13) tels.add(l);
    }
    const arr = [...tels];
    return arr.sort((a, b) => (b.length - a.length)).slice(0, 3);
  }

  function extrairEmails() {
    const s = new Set();
    const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    for (const e of (document.body.innerText || '').match(re) || []) s.add(e);
    for (const a of document.querySelectorAll('a[href^="mailto:"]')) {
      const e = (a.href.match(/mailto:([^?]+)/) || [])[1] || '';
      if (e) s.add(e);
    }
    return [...s].slice(0, 3);
  }

  function extrairRedes() {
    const res = { insta: '', face: '', linkedin: '', site: '' };
    for (const a of document.querySelectorAll('a[href]')) {
      const h = a.href || '';
      const n = norm(h);
      if (!res.insta && (n.includes('instagram.com'))) {
        const m = h.match(/instagram\.com\/([^\/?#]+)/);
        if (m && m[1] && m[1] !== 'explore') res.insta = m[1].replace(/^@/, '');
      }
      if (!res.face && (n.includes('facebook.com') || n.includes('fb.com'))) {
        const m = h.match(/(?:facebook\.com|fb\.com)\/([^\/?#]+)/);
        if (m && m[1] && !/^(share|sharer|login|pages\/category)/.test(m[1])) res.face = m[1];
      }
      if (!res.linkedin && (n.includes('linkedin.com'))) {
        const m = h.match(/linkedin\.com\/(company|in|school)\/([^\/?#]+)/);
        if (m) res.linkedin = m[1] + '/' + m[2];
      }
    }
    res.site = pegarLink('a[href^="http"]');
    return res;
  }

  function detectarHost(hostname) {
    const h = norm(hostname);
    if (h.includes('instagram.com')) return 'instagram';
    if (h.includes('facebook.com') || h.includes('fb.com')) return 'facebook';
    if (h.includes('linkedin.com')) return 'linkedin';
    if (h.includes('google.com') || h.includes('google.com.br') || h.includes('maps.google')) return 'google';
    if (h.includes('whatsapp') || h.includes('wa.me')) return 'whatsapp';
    return 'site';
  }

  function coletar() {
    const host = detectarHost(location.hostname);
    const ogTitulo = pegarMeta('og:title');
    const titulo = ogTitulo || (document.title || '');
    let nome = limpar(titulo.split('|')[0].split('-')[0].split(' — ')[0].trim());
    if (!nome || nome.length > 120) nome = '';
    const desc = pegarMeta('og:description') || pegarMeta('description');
    const tel = extrairTelefones();
    const email = extrairEmails();
    const redes = extrairRedes();
    const contato = {
      nome,
      tipo: 'empresa',
      telefone: tel[0] || '',
      whats: tel[0] || '',
      email: email[0] || '',
      site: redes.site || '',
      insta: redes.insta,
      face: redes.face,
      linkedin: redes.linkedin,
      cidade: '',
      uf: '',
      segmento: '',
      desc: 'Coletado automaticamente da aba: ' + location.href,
      consentimento: true,
      fonte: host
    };
    return [contato];
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.tipo === 'coletarContatos') {
      const contatos = coletar();
      sendResponse({ contatos });
    } else {
      sendResponse({});
    }
  });
})();
