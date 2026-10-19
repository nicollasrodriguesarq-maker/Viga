// Motor de cálculo do Financeiro — um só lugar para a tela, o PDF e o Dashboard, para os números nunca divergirem.
//
// Regras:
//  • "Realizado" = lançamento PAGO, no mês da data de pagamento (data_pagamento; lançamentos antigos usam a data).
//  • "Previsto"  = lançamento PENDENTE, no mês do vencimento; no mês corrente entram também os atrasados.
//  • Saldo (das contas) só conta o que foi pago. Pendente nunca mexe no saldo.
//  • Aporte / resgate de investimento é transferência entre a conta e o investimento: mexe no saldo, mas não é
//    despesa nem receita (fica fora de Entradas, Saídas e Resultado).
//  • Obra de Gerenciamento: a saída é dinheiro do cliente, fica fora do balanço da empresa (a entrada — a taxa — conta).
export const CAT_APORTE = 'Investimento (aporte)'
export const CAT_RESGATE = 'Resgate de investimento'
export const CAT_FATURA = 'Fatura de cartão'

const num = (x: any): number => parseFloat(x || 0) || 0
const r2 = (n: number) => Math.round(n * 100) / 100

export const ehMovInvestimento = (l: any) => l.categoria === CAT_APORTE || l.categoria === CAT_RESGATE

// Data que posiciona o lançamento no calendário: pagamento (se pago) ou vencimento (se pendente).
export function dataEfetiva(l: any): string {
  return l.status === 'pago' ? (l.data_pagamento || l.data || '') : (l.data_vencimento || l.data || '')
}

function somaPor(arr: any[], tipo: string) {
  return r2(arr.filter(l => l.tipo === tipo).reduce((a, l) => a + num(l.valor), 0))
}

export function addDias(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export interface PeriodoFinanceiro {
  empresa: any[]
  saldoBase: number
  saldoTotal: number // saldo acumulado = soma das contas + lançamentos pagos sem conta
  saldosContas: { conta: any; saldo: number }[]
  semConta: any[]
  semContaLiquido: number
  saldoAnterior: number
  pagosMes: any[]
  entradasReal: number
  saidasReal: number
  investLiquido: number // aportes − resgates pagos no mês (dinheiro que saiu da conta para investir)
  saldoFinalReal: number
  pendentesMes: any[] // vencem no mês + atrasados (no mês corrente)
  atrasadosAntes: any[]
  prevEntradas: number
  prevSaidas: number
  prevInvestLiquido: number
  saldoProjetado: number
  impostosPagos: number
  impostosPrevistos: number
  porCategoria: Record<string, number> // saídas pagas no mês
  porCategoriaPrevista: Record<string, number>
  aPagarTotal: number
  aReceberTotal: number
  vencAtrasados: any[] // saídas pendentes vencidas (antes de hoje)
  vencProximos: any[] // saídas pendentes vencendo hoje..+7 dias
  custosFixosMes: any[]
  lista: any[] // lançamentos do mês para exibir (atrasados + pagos + pendentes)
}

export function lancamentosDaEmpresa(lancamentos: any[], obras: any[]) {
  const ger = new Set(obras.filter(o => o.gerenciamento).map(o => o.id))
  return lancamentos.filter(l => !(l.tipo === 'saida' && l.obra_id && ger.has(l.obra_id)))
}

export function calcularPeriodo(args: { lancamentos: any[]; obras: any[]; contas: any[]; mes: string; hoje: string }): PeriodoFinanceiro {
  const { lancamentos, obras, contas, mes, hoje } = args
  const empresa = lancamentosDaEmpresa(lancamentos, obras)
  const pagos = empresa.filter(l => l.status === 'pago')
  const pendentes = empresa.filter(l => l.status !== 'pago')
  const op = (l: any) => !ehMovInvestimento(l)

  const saldoBase = r2(contas.reduce((a, c) => a + num(c.saldo_inicial), 0))
  // saldo de cada conta = extrato real (tudo que foi pago naquela conta, inclusive obra de gerenciamento se for o caso)
  const saldosContas = contas.map(c => {
    const mov = lancamentos.filter(l => l.status === 'pago' && l.conta === c.nome)
    return { conta: c, saldo: r2(num(c.saldo_inicial) + somaPor(mov, 'entrada') - somaPor(mov, 'saida')) }
  })
  const semConta = pagos.filter(l => !l.conta)
  const semContaLiquido = r2(somaPor(semConta, 'entrada') - somaPor(semConta, 'saida'))
  const saldoTotal = r2(saldosContas.reduce((a, s) => a + s.saldo, 0) + semContaLiquido)

  const mesDe = (l: any) => dataEfetiva(l).slice(0, 7)
  const anteriores = pagos.filter(l => mesDe(l) < mes)
  const saldoAnterior = r2(saldoBase + somaPor(anteriores, 'entrada') - somaPor(anteriores, 'saida'))
  const pagosMes = pagos.filter(l => mesDe(l) === mes)
  const entradasReal = somaPor(pagosMes.filter(op), 'entrada')
  const saidasReal = somaPor(pagosMes.filter(op), 'saida')
  const movMes = pagosMes.filter(ehMovInvestimento)
  const investLiquido = r2(somaPor(movMes, 'saida') - somaPor(movMes, 'entrada'))
  const saldoFinalReal = r2(saldoAnterior + entradasReal - saidasReal - investLiquido)

  const mesAtual = hoje.slice(0, 7)
  const atrasadosAntes = mes === mesAtual
    ? pendentes.filter(l => mesDe(l) < mes).sort((a, b) => (dataEfetiva(a) < dataEfetiva(b) ? -1 : 1))
    : []
  const doMes = pendentes.filter(l => mesDe(l) === mes)
  const pendentesMes = [...atrasadosAntes, ...doMes]
  const prevEntradas = somaPor(pendentesMes.filter(op), 'entrada')
  const prevSaidas = somaPor(pendentesMes.filter(op), 'saida')
  const movPend = pendentesMes.filter(ehMovInvestimento)
  const prevInvestLiquido = r2(somaPor(movPend, 'saida') - somaPor(movPend, 'entrada'))
  const saldoProjetado = r2(saldoFinalReal + prevEntradas - prevSaidas - prevInvestLiquido)

  const porCat = (arr: any[]) => {
    const m: Record<string, number> = {}
    arr.filter(l => l.tipo === 'saida' && op(l)).forEach(l => { const c = l.categoria || 'Outros'; m[c] = r2((m[c] || 0) + num(l.valor)) })
    return m
  }
  const impostos = (arr: any[]) => r2(arr.filter(l => l.tipo === 'saida' && l.categoria === 'Imposto').reduce((a, l) => a + num(l.valor), 0))

  const saidasPend = pendentes.filter(l => l.tipo === 'saida')
  const em7 = addDias(hoje, 7)
  const lista = [...atrasadosAntes, ...pagosMes, ...doMes].sort((a, b) => {
    const da = dataEfetiva(a), db = dataEfetiva(b)
    return da < db ? -1 : da > db ? 1 : 0
  })

  return {
    empresa, saldoBase, saldoTotal, saldosContas, semConta, semContaLiquido, saldoAnterior,
    pagosMes, entradasReal, saidasReal, investLiquido, saldoFinalReal,
    pendentesMes, atrasadosAntes, prevEntradas, prevSaidas, prevInvestLiquido, saldoProjetado,
    impostosPagos: impostos(pagosMes), impostosPrevistos: impostos(pendentesMes),
    porCategoria: porCat(pagosMes), porCategoriaPrevista: porCat(pendentesMes),
    aPagarTotal: somaPor(pendentes, 'saida'), aReceberTotal: somaPor(pendentes, 'entrada'),
    vencAtrasados: saidasPend.filter(l => dataEfetiva(l) < hoje),
    vencProximos: saidasPend.filter(l => dataEfetiva(l) >= hoje && dataEfetiva(l) <= em7),
    custosFixosMes: empresa.filter(l => l.recorrente && l.tipo === 'saida' && mesDe(l) === mes),
    lista,
  }
}
