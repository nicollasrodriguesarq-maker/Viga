import { lerSessao, sbJson, serviceKey, tokenDoRequest } from '../_shared'
import { modoEfetivoCronograma, montarLinhasCronograma, ordenarLinhasCronograma, ordemCategoriaPadrao, statusVisualEtapa } from '../../../lib/cronograma'
import { baseParaMedicao, calcularMedicoes, chaveGrupoMedicao } from '../../../lib/medicoesCalc'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEM_CACHE = { 'Cache-Control': 'no-store' }
const num = (v: any) => parseFloat(v || 0) || 0

// ⚠️ Esta rota é a ÚNICA fronteira entre o cliente e o banco. Só devolve campos listados aqui
// de propósito — nada de compras, gastos de cartão, lucro, lançamentos avulsos de saída ou
// dados pessoais da equipe (CPF/RG).
//
// Regra de visibilidade das medições e pagamentos:
//  • obra com equipe própria: o cliente vê só as medições que COBRAMOS dele (tipo "cliente") e
//    os pagamentos que ele fez a nós. As medições internas de fornecedores (custo nosso) ficam ocultas.
//  • obra de GERENCIAMENTO: quem paga os terceiros é o próprio cliente, então ele também vê as
//    medições dos fornecedores (adiantamentos incluídos) e os pagamentos feitos a eles — mas só os
//    lançamentos ligados a essas medições, nunca outras saídas da obra.
export async function GET(req: Request) {
  if (!serviceKey()) return Response.json({ error: 'Portal indisponível' }, { status: 500, headers: SEM_CACHE })
  const sessao = lerSessao(tokenDoRequest(req))
  if (!sessao) return Response.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401, headers: SEM_CACHE })

  // O acesso precisa continuar ativo no banco (desativar um acesso derruba a sessão na hora).
  const idsAcesso = sessao.a.filter(a => UUID.test(a))
  if (idsAcesso.length === 0) return Response.json({ error: 'Sessão inválida' }, { status: 401, headers: SEM_CACHE })
  const acessos = await sbJson<any[]>(`obra_cliente_acessos?id=in.(${idsAcesso.join(',')})&ativo=eq.true&select=id,obra_id,email`)
  const autorizadas = Array.from(new Set(acessos.filter(a => String(a.email).toLowerCase() === sessao.e).map(a => a.obra_id)))
  if (autorizadas.length === 0) return Response.json({ error: 'Acesso desativado. Fale com a Inverso.' }, { status: 403, headers: SEM_CACHE })

  const pedido = new URL(req.url).searchParams.get('id')
  const obraId = pedido || autorizadas[0]
  if (!UUID.test(obraId) || !autorizadas.includes(obraId)) return Response.json({ error: 'Você não tem acesso a esta obra' }, { status: 403, headers: SEM_CACHE })

  const [obras, servicos, etapas, funcionarios, atribuicoes, medicoesTodas, orcamentos, entradas, visitas, empresa] = await Promise.all([
    sbJson<any[]>(`obras?id=eq.${obraId}&select=id,codigo,nome,tipo,cliente,endereco,responsavel,status,data_inicio,data_previsao,data_conclusao,valor_contrato,cronograma_modo,gerenciamento`),
    // valores/fornecedor dos serviços são usados só no cálculo; o que sai para o cliente é filtrado abaixo
    sbJson<any[]>(`obra_servicos?obra_id=eq.${obraId}&select=id,nome,categoria,unidade,quantidade,status,ordem,fornecedor,valor_previsto,valor_mao_obra_previsto`),
    sbJson<any[]>(`cronograma_etapas?obra_id=eq.${obraId}&select=id,servico_id,orcamento_item_id,nome,categoria,data_inicio_prevista,data_fim_prevista,status,ordem,created_at`),
    sbJson<any[]>(`obra_funcionarios?obra_id=eq.${obraId}&select=nome,empresa,telefone&order=created_at`),
    sbJson<any[]>(`obra_atribuicoes?obra_id=eq.${obraId}&select=usuario_id`),
    sbJson<any[]>(`medicoes?obra_id=eq.${obraId}&select=id,numero,data,tipo,fornecedor,observacao,lancamento_id,data_pagamento_programada,valor_adiantamento,desconto_adiantamento_pct,created_at&order=data`),
    sbJson<any[]>(`orcamentos?obra_id=eq.${obraId}&select=retencao_percentual&limit=1`),
    sbJson<any[]>(`lancamentos?obra_id=eq.${obraId}&tipo=eq.entrada&select=id,data,descricao,valor,status,data_vencimento,forma_pagamento&order=data.desc`),
    sbJson<any[]>(`obra_relatorios_visita?obra_id=eq.${obraId}&select=id,data,clima,descricao,pendencias,equipe_presente,fotos&order=data.desc`),
    sbJson<any[]>(`empresa_config?select=nome_empresa,logo_url,telefone,site&limit=1`),
  ])
  const obra = obras[0]
  if (!obra) return Response.json({ error: 'Obra não encontrada' }, { status: 404, headers: SEM_CACHE })
  const gerenciamento = !!obra.gerenciamento

  // Equipe interna atribuída (só nome, setor e e-mail de contato).
  const idsUsuarios = atribuicoes.map(a => a.usuario_id).filter((i: string) => UUID.test(i))
  const usuarios = idsUsuarios.length ? await sbJson<any[]>(`usuarios?id=in.(${idsUsuarios.join(',')})&select=nome,setor,email`) : []

  // Itens do orçamento só pra dar nome às etapas vindas do orçamento (sem preços).
  const idsItens = etapas.map(e => e.orcamento_item_id).filter((i: string) => i && UUID.test(i))
  const itensOrc = idsItens.length ? await sbJson<any[]>(`orcamento_itens?id=in.(${idsItens.join(',')})&select=id,servico,categoria`) : []

  // ── Cronograma ──
  const modo = modoEfetivoCronograma(obra, etapas)
  const linhas = ordenarLinhasCronograma(montarLinhasCronograma(etapas, servicos, itensOrc), modo, ordemCategoriaPadrao).linhas
  const cronograma = linhas.map(l => ({
    id: l.et.id, nome: l.nome, categoria: l.categoria,
    inicio: l.et.data_inicio_prevista, fim: l.et.data_fim_prevista,
    status: statusVisualEtapa(l.et),
  }))

  // ── Medições visíveis ao cliente ──
  const medicoes = medicoesTodas.filter(m => m.tipo === 'cliente' || gerenciamento)
  const idsMed = medicoes.map(m => m.id)
  const itensMed = idsMed.length ? await sbJson<any[]>(`medicao_itens?medicao_id=in.(${idsMed.join(',')})&select=medicao_id,servico_id,valor_base,percentual_acumulado&order=created_at`) : []
  const retPct = num(orcamentos[0]?.retencao_percentual)
  const calc = calcularMedicoes(medicoes, itensMed, servicos, retPct)

  // Só os lançamentos ligados às medições visíveis (nunca outras saídas da obra)
  const idsLanc = medicoes.map(m => m.lancamento_id).filter((i: string) => i && UUID.test(i))
  const lancMed = idsLanc.length ? await sbJson<any[]>(`lancamentos?id=in.(${idsLanc.join(',')})&select=id,data,valor,status,data_vencimento`) : []
  const lancPorId = new Map(lancMed.map(l => [l.id, l]))

  const contrato = num(obra.valor_contrato)
  const chaves = Array.from(new Set(medicoes.map(chaveGrupoMedicao))).sort((a, b) => a === '__cliente__' ? -1 : b === '__cliente__' ? 1 : a.localeCompare(b))
  const acumServico = new Map<string, { acum: number; base: number }>() // progresso físico por serviço

  const grupos = chaves.map(chave => {
    const tipo = chave === '__cliente__' ? 'cliente' : 'fornecedor'
    const meds = medicoes.filter(m => chaveGrupoMedicao(m) === chave)
      .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : String(a.created_at).localeCompare(String(b.created_at))))
    const servGrupo = servicos.filter(s => tipo === 'cliente' || s.fornecedor === chave)
    const previsto = tipo === 'cliente' ? contrato : servGrupo.reduce((a, s) => a + baseParaMedicao(s, 'fornecedor'), 0)

    // acumulado medido: último registro de cada serviço do grupo
    const ult = new Map<string, { acum: number; base: number }>()
    for (const med of meds) {
      const vistos = new Set<string>()
      for (const mi of itensMed.filter(x => x.medicao_id === med.id)) {
        if (vistos.has(mi.servico_id)) continue // registro duplicado do mesmo serviço na medição: vale o primeiro
        vistos.add(mi.servico_id)
        ult.set(mi.servico_id, { acum: num(mi.valor_base) * num(mi.percentual_acumulado), base: num(mi.valor_base) })
      }
    }
    const medido = Array.from(ult.values()).reduce((a, x) => a + x.acum, 0)
    const baseTotal = servGrupo.reduce((a, s) => a + (ult.get(s.id)?.base ?? baseParaMedicao(s, tipo)), 0)
    // O progresso físico usa as medições de fornecedor em obra de gerenciamento e as do cliente nas demais.
    if ((gerenciamento && tipo === 'fornecedor') || (!gerenciamento && tipo === 'cliente')) {
      for (const s of servGrupo) acumServico.set(s.id, { acum: ult.get(s.id)?.acum ?? 0, base: ult.get(s.id)?.base ?? baseParaMedicao(s, tipo) })
    }

    let contador = 0
    const itens = meds.map(m => {
      const r = calc.get(m.id)!
      const lanc = m.lancamento_id ? lancPorId.get(m.lancamento_id) : null
      const pagamento = !lanc ? 'a_programar' : lanc.status === 'pago' ? 'pago' : 'programado'
      // Medição já lançada no financeiro: vale o valor realmente lançado (pago/programado), não o
      // recálculo de hoje — assim o cliente vê exatamente o dinheiro que saiu.
      const valorLancado = lanc ? num(lanc.valor) : null
      const liquidoExibido = valorLancado ?? r.liquido
      const abatimentoExibido = r.adiantamento ? 0 : (lanc ? Math.max(r.bruto - r.retencao - (valorLancado as number), 0) : r.desconto)
      return {
        id: m.id, numero: m.numero, data: m.data,
        rotulo: r.adiantamento ? 'Adiantamento' : `Medição ${++contador}`,
        adiantamento: r.adiantamento,
        observacao: r.adiantamento ? (m.observacao || null) : null,
        bruto: r.bruto, retencao: r.retencao, desconto: abatimentoExibido, liquido: liquidoExibido,
        pagamento,
        data_pagamento: lanc ? (lanc.status === 'pago' ? lanc.data : (lanc.data_vencimento || m.data_pagamento_programada || lanc.data)) : null,
      }
    })
    const pago = itens.filter(i => i.pagamento === 'pago').reduce((a, i) => a + i.liquido, 0)
    return {
      chave, tipo, rotulo: tipo === 'cliente' ? (empresa[0]?.nome_empresa || 'Inverso') : chave,
      previsto, medido, pct_executado: baseTotal > 0 ? Math.min((medido / baseTotal) * 100, 100) : 0,
      pago, a_pagar: Math.max(previsto - pago, 0), itens,
    }
  })

  // Avanço físico geral
  const acumTotal = Array.from(acumServico.values()).reduce((a, x) => a + x.acum, 0)
  const baseGeral = Array.from(acumServico.values()).reduce((a, x) => a + x.base, 0)
  const progressoFisico = baseGeral > 0 ? Math.min((acumTotal / baseGeral) * 100, 100) : 0

  const servicosSaida = servicos
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .map(s => {
      const acum = acumServico.get(s.id)
      return {
        id: s.id, nome: s.nome, categoria: s.categoria, unidade: s.unidade, quantidade: s.quantidade, status: s.status,
        executado_pct: acum && acum.base > 0 ? Math.min((acum.acum / acum.base) * 100, 100) : null,
        // em gerenciamento o cliente contrata os terceiros: enxerga quem executa e o valor contratado
        ...(gerenciamento ? { fornecedor: s.fornecedor || null, valor_contratado: baseParaMedicao(s, 'fornecedor') } : {}),
      }
    })

  // ── Financeiro do cliente ──
  const pago = entradas.filter(e => e.status === 'pago').reduce((a, e) => a + num(e.valor), 0)
  const terceiros = gerenciamento ? grupos.filter(g => g.tipo === 'fornecedor').map(g => ({
    fornecedor: g.rotulo, previsto: g.previsto, medido: g.medido, pago: g.pago, a_pagar: g.a_pagar,
    pagamentos: g.itens.map(i => ({
      id: i.id, data: i.data_pagamento || i.data, valor: i.liquido, status: i.pagamento,
      descricao: i.adiantamento ? `Adiantamento${i.observacao ? ' — ' + i.observacao : ''}` : i.rotulo,
    })),
  })) : []
  const totalTerceiros = terceiros.reduce((a, t) => a + t.previsto, 0)
  const pagoTerceiros = terceiros.reduce((a, t) => a + t.pago, 0)
  const financeiro = {
    gerenciamento,
    contrato, pago, a_pagar: Math.max(contrato - pago, 0),
    pagamentos: entradas.map(e => ({ id: e.id, data: e.status === 'pago' ? e.data : (e.data_vencimento || e.data), descricao: e.descricao, valor: num(e.valor), status: e.status === 'pago' ? 'pago' : 'pendente', forma_pagamento: e.forma_pagamento || null })),
    terceiros,
    // visão macro da obra (só gerenciamento): honorários nossos + contratos com terceiros
    macro: gerenciamento ? {
      total_obra: totalTerceiros + contrato, total_pago: pagoTerceiros + pago,
      total_a_pagar: Math.max(totalTerceiros - pagoTerceiros, 0) + Math.max(contrato - pago, 0),
      terceiros_contratado: totalTerceiros, terceiros_pago: pagoTerceiros, terceiros_a_pagar: Math.max(totalTerceiros - pagoTerceiros, 0),
      gerenciamento_contrato: contrato, gerenciamento_pago: pago, gerenciamento_a_pagar: Math.max(contrato - pago, 0),
    } : null,
  }

  return Response.json({
    empresa: empresa[0] || null,
    obra: { id: obra.id, codigo: obra.codigo, nome: obra.nome, tipo: obra.tipo, cliente: obra.cliente, endereco: obra.endereco, responsavel: obra.responsavel, status: obra.status, data_inicio: obra.data_inicio, data_previsao: obra.data_previsao, data_conclusao: obra.data_conclusao, gerenciamento },
    progresso_fisico: progressoFisico,
    servicos: servicosSaida,
    cronograma,
    equipe: { interna: usuarios, funcionarios },
    medicoes: grupos,
    financeiro,
    visitas,
  }, { headers: SEM_CACHE })
}
