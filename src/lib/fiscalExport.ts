// Geradores dos arquivos fiscais da Portaria MTP 671/2021:
//   AFD — Arquivo Fonte de Dados (marcações brutas, leiaute REP-P, Anexo VIII)
//   AEJ — Arquivo Eletrônico de Jornada (leiaute do PTRP, Anexo IX)
//
// Implementação de melhor esforço sobre os leiautes publicados. Antes de usar
// em fiscalização oficial, valide o arquivo com o contador — a UI avisa isso.

export interface FiscalCompany {
  name: string;
  cnpj: string | null; // com ou sem máscara
}

export interface FiscalEmployee {
  id: string;
  name: string;
  cpf: string | null;
  pis?: string | null;
}

export interface FiscalRecord {
  employee_id: string;
  timestamp: string; // ISO
  nsr: number | null;
  type: string;
}

const digits = (s: string | null | undefined): string => (s || '').replace(/\D/g, '');
const padN = (v: string | number, len: number): string => String(v ?? '').replace(/\D/g, '').padStart(len, '0').slice(-len);
const padA = (v: string, len: number): string => (v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').padEnd(len, ' ').slice(0, len);

/** ISO local São Paulo "AAAA-MM-DDThh:mm:00-0300" (24 posições) */
const isoSP = (d: Date): string => {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((acc, x) => { acc[x.type] = x.value; return acc; }, {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-0300`;
};
const dateSP = (d: Date): string => isoSP(d).slice(0, 10);

/** CRC-16/ARC (poly 0x8005 refletido = 0xA001, init 0x0000) — exigido nos
 *  registros do AFD de REP-P; emitido em 4 hex maiúsculos. */
export function crc16(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let crc = 0x0000;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xA001 : crc >>> 1;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const line = (body: string): string => body + crc16(body);

/**
 * AFD (REP-P): cabeçalho tipo 1 + um registro tipo 7 por marcação + trailer 9.
 */
export function generateAFD(
  company: FiscalCompany,
  employees: FiscalEmployee[],
  records: FiscalRecord[],
  periodStart: Date,
  periodEnd: Date,
): string {
  const cpfByEmp = new Map(employees.map((e) => [e.id, padN(digits(e.cpf) || '0', 12)]));
  const now = new Date();
  const cnpj = padN(digits(company.cnpj) || '0', 14);

  const out: string[] = [];

  // Tipo 1 — cabeçalho
  out.push(line(
    '000000000' + '1' +
    '1' +                       // 1 = CNPJ
    cnpj +
    padN('0', 14) +             // CNO/CAEPF não informado
    padA(company.name, 150) +
    padA('PONTZAP REP-P', 17) + // identificação do programa de registro
    dateSP(periodStart) + dateSP(periodEnd) +
    isoSP(now) +
    '003'                       // versão do leiaute
  ));

  // Tipo 7 — marcações (ordenadas por NSR)
  const sorted = [...records]
    .filter((r) => r.nsr != null)
    .sort((a, b) => (a.nsr! - b.nsr!));
  for (const r of sorted) {
    out.push(line(
      padN(r.nsr!, 9) + '7' +
      isoSP(new Date(r.timestamp)) +          // data/hora da marcação
      (cpfByEmp.get(r.employee_id) || padN('0', 12)) +
      isoSP(new Date(r.timestamp)) +          // data/hora da gravação
      '01' +                                  // coletor
      'O'                                     // on-line
    ));
  }

  // Trailer tipo 9 — contagens por tipo (2..7)
  out.push(line(
    '999999999' +
    padN(0, 9) + padN(0, 9) + padN(0, 9) + padN(0, 9) + padN(0, 9) +
    padN(sorted.length, 9) +
    '9'
  ));

  return out.join('\r\n') + '\r\n';
}

/**
 * AEJ (PTRP): versão essencial — cabeçalho, vínculos e marcações tratadas.
 */
export function generateAEJ(
  company: FiscalCompany,
  employees: FiscalEmployee[],
  records: FiscalRecord[],
  periodStart: Date,
  periodEnd: Date,
): string {
  const now = new Date();
  const cnpj = padN(digits(company.cnpj) || '0', 14);
  const out: string[] = [];
  let seq = 1;

  // 01 — cabeçalho do AEJ
  out.push([
    padN(seq++, 9), '01', '1', cnpj, padA(company.name, 150),
    dateSP(periodStart), dateSP(periodEnd), isoSP(now), '001', 'PONTZAP',
  ].join('|'));

  // 02 — vínculos (um por funcionário com marcação no período)
  const withRecords = new Set(records.map((r) => r.employee_id));
  const active = employees.filter((e) => withRecords.has(e.id));
  const vinculoByEmp = new Map<string, number>();
  active.forEach((e, i) => {
    vinculoByEmp.set(e.id, i + 1);
    out.push([
      padN(seq++, 9), '02', padN(i + 1, 6),
      padN(digits(e.cpf) || '0', 12), padA(e.name, 150),
    ].join('|'));
  });

  // 05 — marcações tratadas (aqui iguais às originais: sem ajuste manual)
  const sorted = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const typeCode: Record<string, string> = { entry: 'E', exit: 'S', lunch_out: 'S', lunch_in: 'E' };
  for (const r of sorted) {
    out.push([
      padN(seq++, 9), '05',
      padN(vinculoByEmp.get(r.employee_id) || 0, 6),
      isoSP(new Date(r.timestamp)),
      typeCode[r.type] || 'E',
      r.nsr != null ? padN(r.nsr, 9) : padN(0, 9),
    ].join('|'));
  }

  // 99 — trailer
  out.push([padN(seq, 9), '99', padN(active.length, 9), padN(sorted.length, 9)].join('|'));

  return out.join('\r\n') + '\r\n';
}
