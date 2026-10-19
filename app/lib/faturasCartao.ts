import { somarMesesISO } from './datas'

// Fatura de cartão: a compra feita DEPOIS do dia de fechamento cai na fatura seguinte; o vencimento é o
// próximo dia de vencimento depois do fechamento (se o vencimento é um dia menor que o fechamento, ele
// cai no mês seguinte ao do fechamento).
export function vencimentoDaFatura(dataCompra: string, diaFechamento: number, diaVencimento: number): string {
  const [a, m, d] = dataCompra.split('-').map(Number)
  const fech = diaFechamento || 1
  const venc = diaVencimento || 10
  const mesFechamento = d > fech ? 1 : 0
  const mesVencimento = venc > fech ? 0 : 1
  const primeiroDia = `${a}-${String(m).padStart(2, '0')}-01`
  const base = somarMesesISO(primeiroDia, mesFechamento + mesVencimento)
  const [ba, bm] = base.split('-').map(Number)
  const ultimo = new Date(ba, bm, 0).getDate()
  return `${ba}-${String(bm).padStart(2, '0')}-${String(Math.min(venc, ultimo)).padStart(2, '0')}`
}

export interface Fatura {
  vencimento: string
  itens: any[]
  total: number // tudo da fatura
  aberto: number // ainda não incluído em nenhum pagamento de fatura
  itensAbertos: any[]
}

export function agruparFaturas(gastos: any[], cartao: any): Fatura[] {
  const mapa = new Map<string, any[]>()
  for (const g of gastos) {
    const venc = vencimentoDaFatura(g.data, cartao.dia_fechamento, cartao.dia_vencimento)
    if (!mapa.has(venc)) mapa.set(venc, [])
    mapa.get(venc)!.push(g)
  }
  return [...mapa.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([vencimento, itens]) => {
      const itensAbertos = itens.filter(i => !i.fatura_lancamento_id)
      const soma = (arr: any[]) => Math.round(arr.reduce((a, i) => a + (parseFloat(i.valor || 0) || 0), 0) * 100) / 100
      return { vencimento, itens, total: soma(itens), aberto: soma(itensAbertos), itensAbertos }
    })
}
