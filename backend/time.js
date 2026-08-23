/* NEITZEL — Tempo: helpers de fuso wall-clock (sem libs externas). */
'use strict';

/** Data de hoje no fuso da empresa como 'YYYY-MM-DD' + minutos corridos. */
function nowInTZ(tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(new Date());
  const g = (t) => Number((parts.find((p) => p.type === t) || {}).value || 0);
  let h = g('hour'); if (h === 24) h = 0;
  return {
    ymd: parts.find((p) => p.type === 'year').value + '-' +
         parts.find((p) => p.type === 'month').value + '-' +
         parts.find((p) => p.type === 'day').value,
    minutes: h * 60 + g('minute'),
    seconds: g('second')
  };
}

/** Dia da semana (0=dom..6=sáb) de um 'YYYY-MM-DD'. */
function weekdayOf(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Converte wall-clock (ymd + minutos) no fuso tz para ISO UTC real. */
function zonedToISO(ymd, minutes, tz) {
  const [y, m, d] = ymd.split('-').map(Number);
  const asUTC = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  let ts = asUTC;
  for (let i = 0; i < 3; i++) {
    const off = asUTC - new Date(new Date(ts).toLocaleString('en-US', { timeZone: tz })).getTime();
    ts = asUTC + off;
  }
  return new Date(ts).toISOString();
}

function isValidYmd(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
function isMin(n) { return Number.isInteger(n) && n >= 0 && n < 1440; }

module.exports = { nowInTZ, weekdayOf, addDays, zonedToISO, isValidYmd, isMin };
