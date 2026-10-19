// Datas e valores em horário LOCAL (Brasil). new Date().toISOString() usa UTC e, depois das 21h,
// já devolve o dia seguinte (e no dia 31 o mês seguinte) — por isso o financeiro não usa isso.
const p2 = (n: number) => String(n).padStart(2, '0')

export function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}
export const mesAtualISO = () => hojeISO().slice(0, 7)

export function somarDiasISO(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

// Soma meses mantendo o dia (31/01 + 1 mês = 28/02 ou 29/02, nunca pula para março).
export function somarMesesISO(iso: string, n: number): string {
  const [a, m, dia] = iso.split('-').map(Number)
  const total = a * 12 + (m - 1) + n
  const ano = Math.floor(total / 12)
  const mes = (total % 12) + 1
  const ultimo = new Date(ano, mes, 0).getDate()
  return `${ano}-${p2(mes)}-${p2(Math.min(dia, ultimo))}`
}

// Arredonda para centavos (evita 28807.257999999994 no banco).
export function arred2(n: number | string): number {
  const x = typeof n === 'number' ? n : parseFloat(n || '0')
  if (!Number.isFinite(x)) return 0
  return Math.round(x * 100 + (x >= 0 ? 1e-7 : -1e-7)) / 100
}

// Divide um valor em parcelas que SOMAM exatamente o total (a diferença de centavos vai para a última).
export function dividirParcelas(total: number, n: number): number[] {
  const qtd = Math.max(1, Math.floor(n) || 1)
  const centavos = Math.round(total * 100)
  const base = Math.floor(centavos / qtd)
  const resto = centavos - base * qtd
  return Array.from({ length: qtd }, (_, i) => (base + (i === qtd - 1 ? resto : 0)) / 100)
}

export function dataBR(iso?: string | null): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
