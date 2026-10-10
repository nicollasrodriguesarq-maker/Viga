import { lerSessao, sbJson, serviceKey, tokenDoRequest } from '../_shared'
import { modoEfetivoCronograma, montarLinhasCronograma, ordenarLinhasCronograma, ordemCategoriaPadrao, statusVisualEtapa } from '../../../lib/cronograma'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEM_CACHE = { 'Cache-Control': 'no-store' }

// ⚠️ Esta rota é a ÚNICA fronteira entre o cliente e o banco. Só devolve campos listados aqui
// de propósito — nada de custo previsto/realizado, lucro, lançamentos de saída, gastos de
// cartão, compras, medições de fornecedor ou dados pessoais da equipe (CPF/RG).
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

  const [obras, servicos, etapas, funcionarios, atribuicoes, medicoes, orcamentos, entradas, visitas, empresa] = await Promise.all([
    sbJson<any[]>(`obras?id=eq.${obraId}&select=id,codigo,nome,tipo,cliente,endereco,responsavel,status,data_inicio,data_previsao,data_conclusao,valor_contrato,cronograma_modo`),
    sbJson<any[]>(`obra_servicos?obra_id=eq.${obraId}&select=id,nome,categoria,unidade,quantidade,status,ordem`),
    sbJson<any[]>(`cronograma_etapas?obra_id=eq.${obraId}&select=id,servico_id,orcamento_item_id,nome,categoria,data_inicio_prevista,data_fim_prevista,status,ordem,created_at`),
    sbJson<any[]>(`obra_funcionarios?obra_id=eq.${obraId}&select=nome,empresa,telefone&order=created_at`),
    sbJson<any[]>(`obra_atribuicoes?obra_id=eq.${obraId}&select=usuario_id`),
    sbJson<any[]>(`medicoes?obra_id=eq.${obraId}&tipo=eq.cliente&select=id,numero,data,lancamento_id,data_pagamento_programada&order=data`),
    sbJson<any[]>(`orcamentos?obra_id=eq.${obraId}&select=retencao_percentual&limit=1`),
    sbJson<any[]>(`lancamentos?obra_id=eq.${obraId}&tipo=eq.entrada&select=id,data,descricao,valor,status,data_vencimento,forma_pagamento&order=data.desc`),
    sbJson<any[]>(`obra_relatorios_visita?obra_id=eq.${obraId}&select=id,data,clima,descricao,pendencias,equipe_presente,fotos&order=data.desc`),
    sbJson<any[]>(`empresa_config?select=nome_empresa,logo_url,telefone,site&limit=1`),
  ])
  const obra = obras[0]
  if (!obra) return Response.json({ error: 'Obra não encontrada' }, { status: 404, headers: SEM_CACHE })

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

  // ── Medições do cliente ──
  const ids = medicoes.map(m => m.id)
  const itensMed = ids.length ? await sbJson<any[]>(`medicao_itens?medicao_id=in.(${ids.join(',')})&select=medicao_id,servico_id,valor_base,percentual_acumulado`) : []
  const retPct = parseFloat(orcamentos[0]?.retencao_percentual || 0)
  const acumPorServico = new Map<string, { valor: number; base: number }>()
  const medicoesSaida = medicoes.map(m => {
    let bruto = 0
    for (const mi of itensMed.filter(x => x.medicao_id === m.id)) {
      const acumAtual = parseFloat(mi.valor_base) * parseFloat(mi.percentual_acumulado)
      const ant = acumPorServico.get(mi.servico_id)
      bruto += acumAtual - (ant ? ant.valor : 0)
      acumPorServico.set(mi.servico_id, { valor: acumAtual, base: parseFloat(mi.valor_base) })
    }
    const retencao = bruto * retPct
    const lanc = m.lancamento_id ? entradas.find(e => e.id === m.lancamento_id) : null
    return {
      id: m.id, numero: m.numero, data: m.data, bruto, retencao, liquido: bruto - retencao,
      pagamento: !lanc ? 'a_programar' : lanc.status === 'pago' ? 'pago' : 'programado',
      data_pagamento: lanc ? (lanc.status === 'pago' ? lanc.data : lanc.data_vencimento || m.data_pagamento_programada) : null,
    }
  })
  const baseTotal = Array.from(acumPorServico.values()).reduce((a, x) => a + x.base, 0)
  const acumTotal = Array.from(acumPorServico.values()).reduce((a, x) => a + x.valor, 0)
  const progressoFisico = baseTotal > 0 ? Math.min((acumTotal / baseTotal) * 100, 100) : 0

  const servicosSaida = servicos
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .map(s => {
      const acum = acumPorServico.get(s.id)
      return { id: s.id, nome: s.nome, categoria: s.categoria, unidade: s.unidade, quantidade: s.quantidade, status: s.status, executado_pct: acum && acum.base > 0 ? Math.min((acum.valor / acum.base) * 100, 100) : null }
    })

  // ── Financeiro do cliente: o que foi contratado e o que já pagou ──
  const contrato = parseFloat(obra.valor_contrato || 0)
  const pago = entradas.filter(e => e.status === 'pago').reduce((a, e) => a + parseFloat(e.valor || 0), 0)
  const financeiro = {
    contrato, pago, a_pagar: Math.max(contrato - pago, 0),
    pagamentos: entradas.map(e => ({ id: e.id, data: e.status === 'pago' ? e.data : (e.data_vencimento || e.data), descricao: e.descricao, valor: parseFloat(e.valor || 0), status: e.status === 'pago' ? 'pago' : 'pendente', forma_pagamento: e.forma_pagamento || null })),
  }

  return Response.json({
    empresa: empresa[0] || null,
    obra: { id: obra.id, codigo: obra.codigo, nome: obra.nome, tipo: obra.tipo, cliente: obra.cliente, endereco: obra.endereco, responsavel: obra.responsavel, status: obra.status, data_inicio: obra.data_inicio, data_previsao: obra.data_previsao, data_conclusao: obra.data_conclusao },
    progresso_fisico: progressoFisico,
    servicos: servicosSaida,
    cronograma,
    equipe: { interna: usuarios, funcionarios },
    medicoes: medicoesSaida,
    financeiro,
    visitas,
  }, { headers: SEM_CACHE })
}
