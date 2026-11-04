'use strict';

const DIREITO_DIAS = 60;
const LIMITE_PERIODOS = 6;
const DIA_MS = 24 * 60 * 60 * 1000;

function dataUtc(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const [ano, mes, dia] = valor.split('-').map(Number);
  const ms = Date.UTC(ano, mes - 1, dia);
  const d = new Date(ms);
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia ? ms : null;
}

function diasCorridos(inicio, fim) {
  const a = dataUtc(inicio); const b = dataUtc(fim);
  if (a === null || b === null) throw new Error('Datas inválidas.');
  if (b < a) throw new Error('A data final não pode ser anterior à data inicial.');
  return Math.floor((b - a) / DIA_MS) + 1;
}

function diasUteis(inicio, fim, feriados = []) {
  const a = dataUtc(inicio); const b = dataUtc(fim);
  if (a === null || b === null) throw new Error('Datas inválidas.');
  if (b < a) throw new Error('A data final não pode ser anterior à data inicial.');
  const fer = new Set(feriados);
  let total = 0;
  for (let ms = a; ms <= b; ms += DIA_MS) {
    const diaSemana = new Date(ms).getUTCDay();
    const chave = new Date(ms).toISOString().slice(0, 10);
    if (diaSemana !== 0 && diaSemana !== 6 && !fer.has(chave)) total++;
  }
  return total;
}

function saldo(periodos) {
  const gozados = periodos.reduce((n, p) => n + diasCorridos(p.data_inicio, p.data_fim), 0);
  return { gozados, saldo: DIREITO_DIAS - gozados, quantidade: periodos.length };
}

function validarNovoPeriodo(periodos, inicio, fim, ignorarId = null) {
  const dias = diasCorridos(inicio, fim);
  const ativos = periodos.filter(p => Number(p.id) !== Number(ignorarId));
  for (const p of ativos) {
    if (inicio <= p.data_fim && fim >= p.data_inicio) throw new Error('O período se sobrepõe a outro período de férias deste diretor.');
  }
  if (ativos.length >= LIMITE_PERIODOS) throw new Error(`O limite é de ${LIMITE_PERIODOS} períodos por diretor.`);
  const atual = saldo(ativos);
  if (atual.gozados + dias > DIREITO_DIAS) throw new Error(`O período excede o saldo de férias de ${Math.max(0, atual.saldo)} dia(s).`);
  return dias;
}

function validarAfastamento(inicio, fim, feriados = []) {
  return diasUteis(inicio, fim, feriados);
}

module.exports = { DIREITO_DIAS, LIMITE_PERIODOS, dataUtc, diasCorridos, diasUteis, saldo, validarNovoPeriodo, validarAfastamento };
