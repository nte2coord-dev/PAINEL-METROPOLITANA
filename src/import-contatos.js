// Importa a planilha Contatos_e_Ramais.xlsx para a tabela de setores.
// Uso: DATABASE_URL=... node src/import-contatos.js caminho/Contatos_e_Ramais.xlsx
// Colunas reconhecidas (cabeçalho, sem acento/maiúsculas): SETOR, NOME/REFERENCIA, RAMAL, TELEFONE, SALA, EMAIL.
// "NOME/REFERÊNCIA" indica a unidade (DAFI, DIPE, DIRE A, DIRE B, INSPECAO, NTE, GABINETE...).
const ExcelJS = require('exceljs');
const { q, migrate, pool } = require('./db');
const { seed } = require('./bootstrap');

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const cell = v => (v && typeof v === 'object' ? (v.text ?? v.result ?? (v.richText || []).map(r => r.text).join('')) : v);
const split = (v, re) => String(cell(v) ?? '').split(re).map(x => x.trim()).filter(Boolean);

function unidadeDe(ref, setor) {
  const t = norm(`${ref} ${setor}`);
  if (/\bdafi\b/.test(t)) return 'DAFI';
  if (/\bdipe\b/.test(t)) return 'DIPE';
  if (/dire\s*a\b|direa\b/.test(t)) return 'DIRE A';
  if (/dire\s*b\b|direb\b/.test(t)) return 'DIRE B';
  if (/inspe|coordinspe/.test(t)) return 'Coordinspe';   // Inspeção: coordenação independente
  if (/\bnte\b|tecnologia/.test(t)) return 'NTE';        // NTE: coordenação independente
  return 'Superintendência';                              // Gabinete e demais
}

async function main(file) {
  if (!file) throw new Error('Informe o caminho do .xlsx');
  await migrate(); await seed();
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const head = {}; ws.getRow(1).eachCell((c, i) => { head[norm(cell(c.value))] = i; });
  const col = (...nomes) => { for (const n of nomes) for (const k of Object.keys(head)) if (k.includes(n)) return head[k]; return null; };
  const c = { setor: col('setor'), ref: col('referencia', 'nome'), ramal: col('ramal'), tel: col('telefone', 'fone'),
    sala: col('sala'), email: col('e-mail', 'email') };
  if (!c.setor) throw new Error('Coluna SETOR não encontrada no cabeçalho.');

  // agrupa linhas duplicadas por (unidade, setor), unindo ramais/telefones/e-mails
  const grupos = new Map();
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const setor = String(cell(row.getCell(c.setor).value) ?? '').trim();
    if (!setor) return;
    const un = unidadeDe(c.ref ? cell(row.getCell(c.ref).value) : '', setor);
    const key = `${un}|${norm(setor)}`;
    const g = grupos.get(key) || { un, setor, ramais: new Set(), tels: new Set(), emails: new Set(), sala: null };
    if (c.ramal) split(row.getCell(c.ramal).value, /[\/,;]/).forEach(x => g.ramais.add(x));
    if (c.tel) split(row.getCell(c.tel).value, /[\/,;]/).forEach(x => g.tels.add(x));
    if (c.email) split(row.getCell(c.email).value, /[,;\s]+/).forEach(x => g.emails.add(x.toLowerCase()));
    if (c.sala && !g.sala) g.sala = String(cell(row.getCell(c.sala).value) ?? '').trim() || null;
    grupos.set(key, g);
  });

  let n = 0;
  for (const g of grupos.values()) {
    const { rows: [u] } = await q(`select id from units where sigla = $1`, [g.un]);
    // casa com setor já semeado ignorando acento/caixa; senão cria
    const { rows: ex } = await q(`select id, nome from sectors where unit_id = $1`, [u.id]);
    const achado = ex.find(s => norm(s.nome).replace(/[^a-z0-9]/g, '') === norm(g.setor).replace(/[^a-z0-9]/g, ''));
    const vals = [[...g.ramais], [...g.tels], g.sala, [...g.emails]];
    if (achado) await q(`update sectors set ramais=$1, telefones=$2, sala=$3, emails=$4, ativo=true where id=$5`, [...vals, achado.id]);
    else await q(`insert into sectors (unit_id, nome, ramais, telefones, sala, emails) values ($1,$2,$3,$4,$5,$6)`, [u.id, g.setor, ...vals]);
    n++;
  }
  console.log(`${n} setores importados/atualizados.`);
}

main(process.argv[2]).then(() => pool.end()).catch(e => { console.error(e.message); process.exit(1); });
