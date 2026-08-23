/* NEITZEL — Descoberta de URL da API (Correção Crítica)
 * Desenvolvimento: vazio => mesma origem (servido pelo próprio backend).
 * Produção: defina <meta name="neitzel-api-url" content="https://api...">  no HTML,
 *           ou o usuário avançado pode fixar localStorage.neitzel_api_url.
 * Nada de localhost hardcoded no código de produção. */
'use strict';

window.NEITZEL_API_BASE = (function () {
  try {
    const meta = document.querySelector('meta[name="neitzel-api-url"]');
    const viaMeta = meta && meta.content && meta.content.trim();
    const viaLS = localStorage.getItem('neitzel_api_url') || '';
    return String(viaMeta || viaLS || '').replace(/\/+$/, '');
  } catch (e) { return ''; }
})();

window.NEITZEL_EM_PRODUCAO = !!window.NEITZEL_API_BASE;
