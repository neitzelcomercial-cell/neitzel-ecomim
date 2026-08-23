// Cacador de Contatos ECOMIM — popup
document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const resEl = document.getElementById('resultado');

  try {
    chrome.runtime.sendMessage({ tipo: 'ping' }, (r) => {
      if (r && r.ok) {
        statusEl.textContent = 'extensao ativa';
        statusEl.innerHTML = '<b style="color:#22c55e">extensao ativa</b>';
      } else {
        statusEl.innerHTML = '<b style="color:#ef4444">erro de comunicacao</b>';
      }
    });
  } catch (e) {
    statusEl.textContent = 'erro';
  }

  document.getElementById('btnColetar').addEventListener('click', () => {
    resEl.textContent = 'Coletando contatos de todas as abas...';
    chrome.runtime.sendMessage({ tipo: 'coletarAbas' }, (r) => {
      if (r && r.ok) {
        const n = (r.contatos || []).length;
        resEl.textContent = '✅ Coletados ' + n + ' contato(s) das abas. Enviando ao CRM...';
        chrome.runtime.sendMessage({ tipo: 'enviarColetados', contatos: r.contatos }, (r2) => {
          if (r2 && r2.ok) {
            resEl.textContent = '✅ Enviados ' + n + ' contatos ao LeadsCRM.';
          } else {
            resEl.textContent = '⚠️ CRM nao encontrado. Abra o LeadsCRM e tente de novo.';
          }
        });
      } else {
        resEl.textContent = '⚠️ Nada coletado: ' + (r && r.erro ? r.erro : 'abas sem contatos');
      }
    });
  });

  document.getElementById('btnAbas').addEventListener('click', () => {
    chrome.tabs.query({}, (tabs) => {
      resEl.textContent = 'Voce tem ' + tabs.length + ' aba(s) aberta(s).';
    });
  });
});
