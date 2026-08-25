/* ============================================================================
 * NEITZEL — ENGINE de disponibilidade (fonte única de verdade)
 * Regras: regra semanal → exceção → bloqueios → antecedência → conflitos.
 * ========================================================================== */
'use strict';
const { weekdayOf } = require('./time');

function purgeExpired(db, agoraTs) {
  let mudou = false;
  for (const h of db.holds) {
    if (h.status === 'active' && h.expiresAt <= agoraTs) { h.status = 'expired'; mudou = true; }
  }
  // Poda de estados terminais antigos — antes holds mortos ficavam para sempre
  // e o banco JSON só crescia.
  const TTL_TERMINAL_MS = 7 * 24 * 60 * 60 * 1000;
  const vivos = db.holds.filter((h) =>
    h.status === 'active' ||
    (agoraTs - new Date(h.criadoEm || 0).getTime()) < TTL_TERMINAL_MS
  );
  if (vivos.length !== db.holds.length) { mudou = true; db.holds = vivos; }
  return mudou;
}

function periodosDoDia(db, ymd) {
  const esp = db.specialHours.find((s) => s.date === ymd);
  if (esp) return { periodos: esp.periodos.filter((p) => p.end > p.start), origem: 'especial' };
  return { periodos: (db.schedule[weekdayOf(ymd)] || []).filter((p) => p.end > p.start), origem: 'semanal' };
}

function diaFechado(db, ymd) {
  return db.blockedDates.some((b) => b.date === ymd);
}

function bloqueadoPorHorario(db, ymd, start, end) {
  return db.blockedTimes.some((b) => b.date === ymd && start < b.end && end > b.start);
}

/** Conflito real contra appointments ativos + holds vivos (pode excluir um hold próprio). */
function temVaga(db, ymd, start, end, agoraTs, profId, excluirHoldId) {
  const cap = Math.max(1, Number(db.config.capacidadePorSlot) || 1);
  let concorrentes = 0;
  for (const a of db.appointments) {
    if (a.date !== ymd || !['confirmed', 'pending'].includes(a.status)) continue;
    if (profId && a.professionalId && a.professionalId !== profId) continue;
    /* O fim OPERACIONAL do agendamento existente inclui o intervalo de
       limpeza/deslocamento — antes só o hold respeitava isso e o
       confirmado podia emendar com o próximo cliente. */
    const serv = db.services.find((s) => s.id === a.serviceId);
    const intervalo = Math.max(0, Number(serv && serv.intervaloMin != null ? serv.intervaloMin : db.config.intervaloPadraoMin) || 0);
    const fimEfetivo = a.endMin + (Number.isInteger(a.endMin) ? intervalo : 0);
    if (start < fimEfetivo && end > a.startMin) concorrentes++;
  }
  for (const h of db.holds) {
    if (!(h.status === 'active' && h.expiresAt > agoraTs && h.date === ymd)) continue;
    if (h.id === excluirHoldId) continue;
    if (profId && h.professionalId && h.professionalId !== profId) continue;
    if (start < h.endMin && end > h.startMin) concorrentes++;
  }
  return concorrentes < cap;
}

/** Lista de slots livres para um serviço num dia. ctx={agoraTs,hojeYmd,agoraMin} */
function disponibilidade(db, servico, ymd, ctx) {
  const out = { date: ymd, aberto: true, periodos: [], slots: [], motivo: null };
  if (diaFechado(db, ymd)) { out.aberto = false; out.motivo = 'bloqueado'; return out; }
  const { periodos } = periodosDoDia(db, ymd);
  if (!periodos.length) { out.aberto = false; out.motivo = 'fechado'; return out; }
  out.periodos = periodos;
  const slot = Math.max(5, Number(db.config.slotMin) || 15);
  const dur = Math.max(5, Number(servico.duracaoMin) || slot);
  const intervalo = Math.max(0, Number(servico.intervaloMin != null ? servico.intervaloMin : db.config.intervaloPadraoMin) || 0);
  const antMin = Number(db.config.antecedenciaMinMinutos) || 0;
  const vistos = new Set(); // períodos sobrepostos não podem duplicar o mesmo slot
  for (const p of periodos) {
    for (let t = p.start; t + dur <= p.end; t += slot) {
      const fimOp = t + dur + intervalo;
      if (fimOp > p.end) continue;
      if (ymd < ctx.hojeYmd) continue;
      if (ymd === ctx.hojeYmd && t < ctx.agoraMin + antMin) continue;
      if (bloqueadoPorHorario(db, ymd, t, fimOp)) continue;
      if (!temVaga(db, ymd, t, fimOp, ctx.agoraTs, null)) continue;
      if (vistos.has(t)) continue;
      vistos.add(t);
      out.slots.push({ start: t, end: t + dur, fimOperacional: fimOp });
    }
  }
  return out;
}

module.exports = { purgeExpired, periodosDoDia, diaFechado, bloqueadoPorHorario, temVaga, disponibilidade };

