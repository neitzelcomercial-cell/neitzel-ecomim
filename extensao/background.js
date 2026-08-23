// Cacador de Contatos ECOMIM — background service worker
const tabAbasLocais = {}; // tabId -> { nome, cidade, segmento }

function gerarId() { return 'ext' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

async function obterCRMId() {
  const { crmTabId } = await chrome.storage.local.get('crmTabId');
  return crmTabId || null;
}

async function enviarParaCRM(leads, origem) {
  try {
    const tabId = await obterCRMId();
    if (!tabId) return { ok: false, erro: 'CRM nao localizado — abra o LeadsCRM primeiro.' };
    const resp = await chrome.tabs.sendMessage(tabId, {
      tipo: 'leadsExternos',
      leads,
      origem: origem || 'site'
    });
    return { ok: true, resp };
  } catch (e) {
    return { ok: false, erro: String(e && e.message ? e.message : e) };
  }
}

async function coletarAba(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || tab.status !== 'complete') return null;
    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) return null;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    const resp = await chrome.tabs.sendMessage(tabId, { tipo: 'coletarContatos', origem: 'site' });
    if (resp && resp.contatos && resp.contatos.length) {
      return resp.contatos;
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function abrirLocalEM(local, fonte) {
  const url = local.url || ('https://www.google.com/search?q=' + encodeURIComponent((local.nome || '') + ' ' + (local.cidade || '')));
  let tab = null;
  try {
    tab = await chrome.tabs.create({ url, active: false });
  } catch (e) {
    return null;
  }
  tabAbasLocais[tab.id] = { nome: local.nome || '', cidade: local.cidade || '', segmento: local.segmento || '', fonte: fonte || 'site' };
  return tab;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg && msg.tipo === 'ping') {
        sendResponse({ ok: true, extensao: true });
        return;
      }
      if (msg && msg.tipo === 'registrarCRM') {
        if (sender && sender.tab) await chrome.storage.local.set({ crmTabId: sender.tab.id });
        sendResponse({ ok: true });
        return;
      }
      if (msg && msg.tipo === 'abrirLocais') {
        const locais = (msg.locais || []).slice(0, 6);
        const abertos = [];
        for (const l of locais) {
          const t = await abrirLocalEM(l, msg.origem || 'site');
          if (t) abertos.push({ id: t.id, nome: l.nome || '' });
        }
        sendResponse({ ok: true, abertos: abertos.length, tabs: abertos });
        return;
      }

      if (msg && msg.tipo === 'enviarColetados') {
        const contatos = (msg.contatos || []);
        const r = await enviarParaCRM(contatos, 'site');
        if (r.ok) {
          sendResponse({ ok: true, recebidos: contatos.length });
        } else {
          sendResponse({ ok: false, erro: r.erro });
        }
        return;
      }
      if (msg && msg.tipo === 'coletarAbas') {
        const tabs = await chrome.tabs.query({});
        let contatos = [];
        for (const t of tabs) {
          if (t.id === sender.tab.id) continue;
          const c = await coletarAba(t.id);
          if (c) contatos = contatos.concat(c);
        }
        sendResponse({ ok: true, contatos });
        return;
      }
      sendResponse({ ok: false, erro: 'Tipo desconhecido: ' + (msg && msg.tipo) });
    } catch (e) {
      sendResponse({ ok: false, erro: String(e && e.message ? e.message : e) });
    }
  })();
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => { delete tabAbasLocais[tabId]; });

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete' && tabAbasLocais[tabId]) {
    const meta = tabAbasLocais[tabId];
    setTimeout(async () => {
      const contatos = await coletarAba(tabId);
      if (contatos && contatos.length) {
        await enviarParaCRM(contatos, meta.fonte || 'site');
      }
    }, 1200);
  }
});
