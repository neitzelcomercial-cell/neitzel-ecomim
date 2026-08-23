// Cacador de Contatos ECOMIM — ponte com o LeadsCRM (roda na pagina do app)
(function () {
  if (window.__cacadorBridge) return;
  window.__cacadorBridge = true;

  try { chrome.runtime.sendMessage({ tipo: 'registrarCRM' }); } catch (e) {}

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.tipo === 'leadsExternos' && Array.isArray(msg.leads)) {
      const ev = new CustomEvent('leadsExternos', { detail: { leads: msg.leads, origem: msg.origem || 'site' } });
      window.dispatchEvent(ev);
      sendResponse({ ok: true, recebidos: msg.leads.length });
    } else {
      sendResponse({});
    }
  });
})();
