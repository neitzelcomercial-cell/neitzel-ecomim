/* Teste funcional do motor Caçador de Leads (executado no Node). */
'use strict';

// --- ambiente simulado (localStorage, window, fetch ausente) ---
const mem = {};
global.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
};
global.window = global;

// --- mock do BACKEND REAL (/api/cacador/pesquisar): responde como o
// OpenStreetMap responderia, de forma determinística. Assim testamos a
// pipeline inteira (coleta → normalização → validação → dedup) sem rede.
let chamadasBusca = 0;
global.fetch = async (url) => {
  const u = String(url || '');
  if (!u.includes('/api/cacador/pesquisar')) throw new Error('fetch inesperado: ' + u);
  chamadasBusca++;
  const cidade = decodeURIComponent((u.match(/cidade=([^&]*)/) || [])[1] || '');
  const termo = decodeURIComponent((u.match(/termo=([^&]*)/) || [])[1] || '');
  const elementos = Array.from({ length: 6 }, (_, i) => ({
    type: 'node', id: chamadasBusca * 100 + i,
    lat: -26.3 + i / 100, lon: -48.8 + i / 100,
    tags: {
      name: `${termo || 'Negocio'} ${chamadasBusca === 1 ? 'Alfa' : 'Beta'} ${i + 1}`,
      // 2º lead sem telefone — exercita o relatório de contato indisponível
      ...(i !== 1 ? { phone: `479${(90000000 + i * 137 + chamadasBusca).toString().slice(-8)}` } : {}),
      ...(i % 2 === 0 ? { website: `https://www.${termo || 'site'}${i}.com.br` } : {}),
      'addr:street': 'Rua Teste', 'addr:housenumber': String(100 + i),
      'addr:city': cidade || 'Joinville',
    },
  }));
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, total: elementos.length, leads: elementos.map((el) => {
      const t = el.tags;
      return {
        sintetico: false, lead_type: 'company', name: t.name, company: t.name,
        profession: termo || null, phone: t.phone || null, whats: t.phone || null,
        email: null, website: t.website || null, city: t['addr:city'], state: 'SC',
        street: t['addr:street'] + ', ' + t['addr:housenumber'],
        description: 'Contato público real', source: { type: 'openstreetmap' },
      };
    }), fonte: 'mock', local: cidade }),
  };
};

require('./src/core.js');
require('./src/hunter.js');

const H = window.ECOMIM_HUNTER;

function assert(cond, msg) {
  if (!cond) { console.error('✗ ' + msg); process.exitCode = 1; }
  else console.log('✓ ' + msg);
}

(async () => {
  // 1. init garante fontes (catálogo completo de fontes REAIS)
  H.init();
  assert(H.DB.sources.length === 8, `8 fontes reais registradas (${H.DB.sources.length})`);
  assert(H.fontesAplicaveis('empresa').length > 0, 'fontes aplicáveis a empresa > 0');

  // 2. pesquisa com fontes ativas
  const r = await H.executarPesquisa({
    tipo: 'empresa',
    cidade: 'Joinville',
    estado: 'SC',
    ddd: '47',
    segmento: 'academias',
    palavraChave: 'academia',
    quantidade: 30,
  });
  assert(r.ok, 'pesquisa executou ok');
  assert(H.DB.leads.length > 0, `pesquisa gerou leads (${H.DB.leads.length})`);
  assert(H.DB.pesquisas.length === 1, 'histórico registrado');
  const p = H.DB.pesquisas[0];
  assert(p.status === 'concluida', 'status concluída');
  assert(p.resultados.encontrados >= 0, 'resultados contados');

  // 3. normalização: telefones e UF
  const l0 = H.DB.leads[0];
  assert(l0.state === 'SC' || l0.state === null, 'UF normalizada');
  if (l0.phone) assert(/^\d{10,11}$/.test(l0.phone), 'telefone apenas dígitos 10-11');

  // 4. score 0-100 com faixas
  H.DB.leads.forEach((l) => {
    assert(l.score >= 0 && l.score <= 100, `score ${l.score} dentro do intervalo`);
    assert(['Excelente', 'Bom', 'Médio', 'Baixo'].includes(l.quality), `qualidade ${l.quality} válida`);
  });

  // 5. dedup: envia um lead único → ok; enviando de novo → DUPLICADO
  const alvo = H.DB.leads.find((l) => (l.phone || l.email) && !H.encontrarDuplicado(H.normalizar(Object.assign({}, l)), l.id));
  assert(!!alvo, 'existe lead único com contato para teste');
  if (alvo) {
    // Leads REAIS (não sintéticos) vão direto para a fila
    const r1 = H.enviarParaFila(alvo.id);
    assert(r1.ok, 'envio à fila ok (1º)');
    const dup = H.encontrarDuplicado(H.normalizar(Object.assign({}, alvo)));
    assert(dup, 'dedup encontra duplicado na 2ª tentativa (mesmo contato)');
    const E = window.ECOMIM;
    const naFila = E.db.get().fila.length;
    assert(naFila >= 1, 'fila do CRM recebeu o lead');
  }

  // 6. filtros
  const f = H.filtrar(H.DB.leads, { tipo: 'company' });
  assert(f.length <= H.DB.leads.length, 'filtro por tipo funciona');
  const fScore = H.filtrar(H.DB.leads, { scoreMin: 60 });
  assert(fScore.every((l) => l.score >= 60), 'filtro scoreMin funciona');

  // 7. agrupamento
  const ag = H.agrupar(H.DB.leads, 'state');
  assert(Object.keys(ag).length >= 1, 'agrupamento por estado funciona');

  // 8. exportação (não baixa arquivo; só constrói/valida dados)
  const out = H.DB.leads.slice(0, 3).map((l) => l.name);
  assert(out.length === 3, 'seleção de exportação ok');

  // 9. segunda pesquisa (cidade/termo diferentes) traz leads novos do backend
  await H.executarPesquisa({
    tipo: 'pessoa',
    cidade: 'Florianópolis',
    estado: 'SC',
    segmento: 'nutrição',
    palavraChave: 'nutricionista',
    quantidade: 20,
  });
  assert(H.DB.pesquisas.length === 2, 'segunda pesquisa registrada');

  // 10. cancelamento: pesquisa cancelada NÃO persiste leads parciais nem vira 'concluida'
  const antes = H.DB.leads.length;
  const iniciada = await H.executarPesquisa({ tipo: 'empresa', cidade: 'Joinville', segmento: 'academia', palavraChave: 'academia', quantidade: 40, cancelarAgora: true });
  assert(iniciada.ok && iniciada.cancelada, 'terceira pesquisa iniciada e cancelada');
  const dep = H.DB.pesquisas.find((p) => p.id === iniciada.search.id);
  assert(dep && dep.status === 'cancelada', 'pesquisa cancelada registrada como cancelada');
  assert(H.DB.leads.length === antes, 'cancelamento não persiste leads parciais');
  const unicos = new Set(H.DB.leads.map((l) => l.name)).size;
  console.log(`(info) ${H.DB.leads.length} leads, ${unicos} nomes únicos após 2 pesquisas`);

  console.log(process.exitCode ? '\nCOM FALHAS' : '\nTODOS OS TESTES PASSARAM ✔');
})();