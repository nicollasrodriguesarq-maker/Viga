// Cálculo de medições (valor do período, retenção, desconto do adiantamento e líquido) usado
// pelo portal do cliente no servidor. É a mesma regra de totalsMedicao() das telas de Obras
// (desktop/mobile), só que calculada em ordem cronológica por grupo (cliente ou fornecedor).

export interface ResultadoMedicao {
  adiantamento: boolean
  bruto: number
  retencao: number
  desconto: number
  liquido: number
}

// Base de uma medição: o fornecedor mede em cima da mão de obra do serviço (ou do valor
// previsto, se não houver mão de obra); o cliente, em cima do valor previsto.
export function baseParaMedicao(servico: any, tipo: string): number {
  if (tipo === 'fornecedor') {
    const mo = parseFloat(servico.valor_mao_obra_previsto || 0)
    return mo > 0 ? mo : parseFloat(servico.valor_previsto || 0)
  }
  return parseFloat(servico.valor_previsto || 0)
}

export const chaveGrupoMedicao = (m: { tipo: string; fornecedor?: string | null }) =>
  m.tipo === 'cliente' ? '__cliente__' : (m.fornecedor || '—')

export function calcularMedicoes(medicoes: any[], itens: any[], servicos: any[], retencaoPct: number): Map<string, ResultadoMedicao> {
  const resultado = new Map<string, ResultadoMedicao>()
  const medPorId = new Map(medicoes.map(m => [m.id, m]))

  // registro da medição anterior (mesmo tipo/fornecedor, data estritamente anterior) de um serviço
  function ultimoRegistro(servicoId: string, medAtual: any) {
    return itens
      .filter(mi => mi.servico_id === servicoId && mi.medicao_id !== medAtual.id)
      .map(mi => ({ mi, med: medPorId.get(mi.medicao_id) }))
      .filter(x => x.med && x.med.tipo === medAtual.tipo && (medAtual.tipo !== 'fornecedor' || x.med.fornecedor === medAtual.fornecedor) && x.med.data < medAtual.data)
      .sort((a, b) => (a.med.data < b.med.data ? 1 : a.med.data > b.med.data ? -1 : 0))[0]?.mi || null
  }

  const grupos = new Map<string, any[]>()
  for (const m of medicoes) {
    const k = chaveGrupoMedicao(m)
    grupos.set(k, [...(grupos.get(k) || []), m])
  }

  for (const lista of grupos.values()) {
    const ordenadas = [...lista].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : String(a.created_at || '').localeCompare(String(b.created_at || ''))))
    const totalAdiantamento = ordenadas.filter(m => m.valor_adiantamento != null).reduce((a, m) => a + parseFloat(m.valor_adiantamento || 0), 0)
    let descontoAcumulado = 0
    for (const med of ordenadas) {
      if (med.valor_adiantamento != null) {
        const v = parseFloat(med.valor_adiantamento)
        resultado.set(med.id, { adiantamento: true, bruto: v, retencao: 0, desconto: 0, liquido: v })
        continue
      }
      const servicosGrupo = servicos.filter(s => med.tipo !== 'fornecedor' || !med.fornecedor || s.fornecedor === med.fornecedor)
      let totalPeriodo = 0, totalBaseGrupo = 0
      for (const sv of servicosGrupo) {
        const mi = itens.find(x => x.medicao_id === med.id && x.servico_id === sv.id)
        const ultimo = ultimoRegistro(sv.id, med)
        const valorBase = mi ? parseFloat(mi.valor_base) : (ultimo ? parseFloat(ultimo.valor_base) : baseParaMedicao(sv, med.tipo))
        totalBaseGrupo += valorBase
        if (!mi) continue
        const acumAnterior = ultimo ? parseFloat(ultimo.valor_base) * parseFloat(ultimo.percentual_acumulado) : 0
        totalPeriodo += parseFloat(mi.valor_base) * parseFloat(mi.percentual_acumulado) - acumAnterior
      }
      const adiantadoAteData = ordenadas.filter(m => m.valor_adiantamento != null && m.data <= med.data).reduce((x, m) => x + parseFloat(m.valor_adiantamento || 0), 0)
      const { desconto } = calcularAbatimento({
        modo: modoAbatimentoDe(med),
        pctDigitado: med.desconto_adiantamento_pct != null ? parseFloat(med.desconto_adiantamento_pct) : null,
        bruto: totalPeriodo, retencaoPct, totalBaseGrupo, adiantadoTotal: totalAdiantamento, adiantadoAteData, jaAbatido: descontoAcumulado,
      })
      descontoAcumulado += desconto
      const retencao = totalPeriodo * retencaoPct
      resultado.set(med.id, { adiantamento: false, bruto: totalPeriodo, retencao, desconto, liquido: totalPeriodo - retencao - desconto })
    }
  }
  return resultado
}

// ── Abatimento do adiantamento ─────────────────────────────────────────────────────────
// Dois jeitos de abater o que já foi adiantado ao fornecedor:
//  • compensação (padrão): o valor da medição é abatido do SALDO de adiantamento disponível até
//    a data dela (adiantamentos já pagos − o que medições anteriores já abateram). O fornecedor só
//    recebe o que sobrar. Ex.: adiantou 60.000, medição de 32.332,94 → recebe 0, sobra 27.667,06.
//    O % (padrão 100%) permite abater só uma parte do valor da medição.
//  • proporcional: abate o % de avanço da medição sobre o TOTAL adiantado (ou o % digitado).
export type ModoAbatimento = 'compensacao' | 'proporcional'

export function modoAbatimentoDe(med: { modo_abatimento?: string | null }): ModoAbatimento {
  return med.modo_abatimento === 'proporcional' ? 'proporcional' : 'compensacao'
}

export function calcularAbatimento(p: {
  modo: ModoAbatimento
  pctDigitado: number | null // fração 0–1; null = automático
  bruto: number
  retencaoPct: number
  totalBaseGrupo: number
  adiantadoTotal: number // soma de todos os adiantamentos do grupo
  adiantadoAteData: number // soma dos adiantamentos com data <= data da medição
  jaAbatido: number // abatido por medições anteriores do grupo
}) {
  const pctAuto = p.modo === 'compensacao' ? 1 : (p.totalBaseGrupo > 0 ? Math.max(p.bruto / p.totalBaseGrupo, 0) : 0)
  const pct = Math.max(p.pctDigitado ?? pctAuto, 0)
  const disponivel = p.modo === 'compensacao' ? p.adiantadoAteData : p.adiantadoTotal
  const saldo = Math.max(disponivel - p.jaAbatido, 0)
  const alvo = p.modo === 'compensacao' ? Math.max(p.bruto * (1 - p.retencaoPct), 0) * pct : pct * p.adiantadoTotal
  const desconto = disponivel > 0 ? Math.min(alvo, saldo) : 0
  return { desconto, pct, pctAuto, saldo, limitado: alvo > saldo + 0.005 }
}
