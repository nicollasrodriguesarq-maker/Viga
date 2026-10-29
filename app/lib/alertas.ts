// Motor único de alertas — usado pelo sino do cabeçalho e pelo painel "Meus alertas" do Dashboard.
//
// Regras pensadas para o alerta SAIR quando o problema é resolvido:
//  • follow-up: some quando há uma interação registrada (ligação, e-mail, reunião, visita, nota)
//    na data do follow-up ou depois, quando a data é reagendada para o futuro, ou quando o lead sai
//    da etapa aberta (ganho/perdido/pós-venda);
//  • proposta parada (sem follow-up agendado): conta os dias desde o envio OU desde o último contato,
//    o que for mais recente — registrar um contato "zera" o alerta;
//  • obra em atraso: some ao concluir a obra ou mudar a data de previsão; etapas do cronograma
//    atrasadas somem ao marcar como concluídas ou reprogramar;
//  • contas: só pendentes (pagar/receber); pagar o lançamento remove. Saídas de obra de Gerenciamento
//    não entram (é dinheiro do cliente, igual ao Financeiro);
//  • propostas (orçamentos) enviadas com validade vencida: somem ao mudar o status do orçamento.
import { obterMinhasPermissoes, temAcessoModulo, type Permissoes } from './permissoes'
import { CHAVE, definirAlvo } from './abrirAlvo'

const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON }

export const EVENTO_DADOS_ALTERADOS = 'viga:dados-alterados'

export type CategoriaAlerta = 'followup' | 'proposta' | 'orcamento_vencido' | 'obra' | 'etapa' | 'pagar' | 'receber' | 'solicitacao' | 'convite' | 'prospeccao' | 'atividade_atrasada' | 'atividade_vencendo'

export interface AlertaItem {
  id: string
  categoria: CategoriaAlerta
  titulo: string
  descricao: string
  href: string
  obraId?: string // abre a obra direto ao clicar
  alvo?: { chave: string; id: string; aba?: string } // item que a página de destino abre sozinha ao clicar no alerta
  peso: number // dias de atraso (maior = mais urgente)
}

export const META_ALERTA: Record<CategoriaAlerta, { icone: string; nome: string; texto: string; fundo: string; borda: string }> = {
  followup: { icone: '📞', nome: 'Follow-ups', texto: 'text-tertiary', fundo: 'bg-tertiary/10', borda: 'border-tertiary/30' },
  proposta: { icone: '🤝', nome: 'Propostas paradas', texto: 'text-tertiary', fundo: 'bg-tertiary/10', borda: 'border-tertiary/30' },
  orcamento_vencido: { icone: '💼', nome: 'Propostas vencidas', texto: 'text-error', fundo: 'bg-error/10', borda: 'border-error/30' },
  obra: { icone: '🏗️', nome: 'Obras em atraso', texto: 'text-error', fundo: 'bg-error/10', borda: 'border-error/30' },
  etapa: { icone: '📅', nome: 'Cronograma atrasado', texto: 'text-error', fundo: 'bg-error/10', borda: 'border-error/30' },
  pagar: { icone: '💸', nome: 'Contas a pagar', texto: 'text-error', fundo: 'bg-error/10', borda: 'border-error/30' },
  receber: { icone: '💰', nome: 'A receber vencido', texto: 'text-tertiary', fundo: 'bg-tertiary/10', borda: 'border-tertiary/30' },
  solicitacao: { icone: '🔐', nome: 'Pedidos de acesso', texto: 'text-primary', fundo: 'bg-primary/10', borda: 'border-primary/30' },
  convite: { icone: '📨', nome: 'Convites de reunião', texto: 'text-secondary', fundo: 'bg-secondary/10', borda: 'border-secondary/30' },
  atividade_atrasada: { icone: '⏰', nome: 'Atividades atrasadas', texto: 'text-error', fundo: 'bg-error/10', borda: 'border-error/30' },
  atividade_vencendo: { icone: '🔔', nome: 'Atividades perto do prazo', texto: 'text-tertiary', fundo: 'bg-tertiary/10', borda: 'border-tertiary/30' },
  prospeccao: { icone: '🎯', nome: 'Prospecção do dia', texto: 'text-primary', fundo: 'bg-primary/10', borda: 'border-primary/30' },
}
export const ORDEM_CATEGORIAS: CategoriaAlerta[] = ['convite', 'atividade_atrasada', 'obra', 'etapa', 'pagar', 'atividade_vencendo', 'orcamento_vencido', 'followup', 'proposta', 'receber', 'prospeccao', 'solicitacao']

async function get(tabela: string, query = ''): Promise<any[]> {
  try {
    const r = await fetch(`${BASE}/${tabela}${query}`, { headers: H })
    const d = await r.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

// Datas em texto (AAAA-MM-DD) no fuso local: evita erro de "um dia a menos" do toISOString().
function dataLocalISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const diasEntre = (de: string, ate: string) => Math.round((Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10)) - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86400000)
const somarDias = (iso: string, n: number) => { const d = new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n); return dataLocalISO(d) }
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const moeda = (v: any) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const plural = (n: number, s: string, p: string) => (n === 1 ? s : p)

const ETAPAS_ENCERRADAS = ['fechado_ganho', 'fechado_perdido', 'pos_venda']

export async function carregarAlertas(permEntrada?: Permissoes | null): Promise<AlertaItem[]> {
  const perm = permEntrada === undefined ? await obterMinhasPermissoes() : permEntrada
  const ehAdmin = perm?.role === 'admin'
  const ehGestor = ehAdmin || perm?.role === 'gerente_time'
  const meuId = perm?.id || ''
  const hoje = dataLocalISO(new Date())
  const em7 = somarDias(hoje, 7)
  const alertas: AlertaItem[] = []

  // ── Obras e cronograma ──
  const obrasTodas = await get('obras', '?select=id,nome,codigo,status,data_previsao,gerenciamento')
  let obrasVisiveis = obrasTodas
  if (!ehGestor && perm) {
    const at = await get('obra_atribuicoes', `?usuario_id=eq.${perm.id}&select=obra_id`)
    const ids = new Set(at.map((a: any) => a.obra_id))
    obrasVisiveis = obrasTodas.filter((o: any) => ids.has(o.id))
  }
  const emExecucao = obrasVisiveis.filter((o: any) => o.status === 'em_execucao')
  for (const o of emExecucao) {
    if (o.data_previsao && o.data_previsao < hoje) {
      const dias = diasEntre(o.data_previsao, hoje)
      alertas.push({ id: 'obra-' + o.id, categoria: 'obra', titulo: o.nome, descricao: `Prazo venceu em ${dataBR(o.data_previsao)} — atrasada há ${dias} ${plural(dias, 'dia', 'dias')}`, href: '/obras', obraId: o.id, alvo: { chave: CHAVE.obra, id: o.id }, peso: dias })
    }
  }
  if (emExecucao.length > 0) {
    const idsObras = emExecucao.map((o: any) => o.id).join(',')
    const etapas = await get('cronograma_etapas', `?obra_id=in.(${idsObras})&select=obra_id,nome,servico_id,orcamento_item_id,data_fim_prevista,status`)
    // etapas antigas não têm nome próprio: usa o nome do serviço da obra ou do item do orçamento
    const nomesServico = new Map((await get('obra_servicos', `?obra_id=in.(${idsObras})&select=id,nome`)).map((x: any) => [x.id, x.nome]))
    const idsItens = etapas.map((e: any) => e.orcamento_item_id).filter(Boolean)
    const nomesItem = new Map((idsItens.length ? await get('orcamento_itens', `?id=in.(${idsItens.join(',')})&select=id,servico`) : []).map((x: any) => [x.id, x.servico]))
    for (const e of etapas) e.nome = e.nome || nomesServico.get(e.servico_id) || nomesItem.get(e.orcamento_item_id) || 'etapa sem nome'
    for (const o of emExecucao) {
      const atrasadas = etapas.filter((e: any) => e.obra_id === o.id && e.status !== 'concluida' && e.data_fim_prevista && e.data_fim_prevista < hoje)
        .sort((a: any, b: any) => a.data_fim_prevista.localeCompare(b.data_fim_prevista))
      if (atrasadas.length > 0) {
        const pior = diasEntre(atrasadas[0].data_fim_prevista, hoje)
        alertas.push({
          id: 'etapas-' + o.id, categoria: 'etapa', titulo: o.nome,
          descricao: `${atrasadas.length} ${plural(atrasadas.length, 'etapa atrasada', 'etapas atrasadas')} no cronograma (mais antiga: “${atrasadas[0].nome || 'etapa'}”, ${pior} ${plural(pior, 'dia', 'dias')})`,
          href: '/obras', obraId: o.id, alvo: { chave: CHAVE.obra, id: o.id, aba: 'cronograma' }, peso: pior,
        })
      }
    }
  }

  // ── Financeiro: contas a pagar (vencidas / próximos 7 dias) e a receber vencidas ──
  if (temAcessoModulo(perm, 'financeiro') || temAcessoModulo(perm, 'obras')) {
    const gerenciamento = new Set(obrasTodas.filter((o: any) => o.gerenciamento).map((o: any) => o.id))
    const lancs = await get('lancamentos', '?status=eq.pendente&select=id,descricao,valor,tipo,data,data_vencimento,obra_id')
    for (const l of lancs) {
      const venc: string = (l.data_vencimento || l.data || '').slice(0, 10)
      if (!venc) continue
      if (l.tipo === 'saida') {
        if (l.obra_id && gerenciamento.has(l.obra_id)) continue
        if (venc > em7) continue
        const dias = diasEntre(venc, hoje)
        alertas.push({ id: 'pagar-' + l.id, categoria: 'pagar', titulo: l.descricao || 'Pagamento', descricao: `${moeda(l.valor)} · ${dias > 0 ? `venceu em ${dataBR(venc)} (${dias} ${plural(dias, 'dia', 'dias')} em atraso)` : dias === 0 ? 'vence hoje' : `vence em ${dataBR(venc)}`}`, href: '/financeiro', alvo: { chave: CHAVE.lancamento, id: l.id }, peso: dias })
      } else if (l.tipo === 'entrada' && venc < hoje) {
        const dias = diasEntre(venc, hoje)
        alertas.push({ id: 'receber-' + l.id, categoria: 'receber', titulo: l.descricao || 'Recebimento', descricao: `${moeda(l.valor)} · venceu em ${dataBR(venc)} (${dias} ${plural(dias, 'dia', 'dias')} sem receber)`, href: '/financeiro', alvo: { chave: CHAVE.lancamento, id: l.id }, peso: dias })
      }
    }
  }

  // ── CRM: follow-ups e propostas paradas ──
  if (temAcessoModulo(perm, 'crm')) {
    let leads = await get('crm_leads', `?etapa=not.in.(${ETAPAS_ENCERRADAS.join(',')})&select=id,nome,etapa,data_proposta_enviada,proximo_followup,responsavel_id`)
    if (!ehAdmin) leads = leads.filter((l: any) => l.responsavel_id === meuId)
    const comPrazo = leads.filter((l: any) => l.proximo_followup || (l.etapa === 'proposta_enviada' && l.data_proposta_enviada))
    const ultimoContato = new Map<string, string>()
    if (comPrazo.length > 0) {
      const atividades = await get('crm_atividades', `?lead_id=in.(${comPrazo.map((l: any) => l.id).join(',')})&tipo=neq.mudanca_etapa&select=lead_id,created_at`)
      for (const a of atividades) {
        const dia = dataLocalISO(new Date(a.created_at))
        if (!ultimoContato.get(a.lead_id) || dia > (ultimoContato.get(a.lead_id) as string)) ultimoContato.set(a.lead_id, dia)
      }
    }
    for (const l of comPrazo) {
      const contato = ultimoContato.get(l.id) || null
      if (l.proximo_followup) {
        if (l.proximo_followup > hoje) continue // reagendado para o futuro
        if (contato && contato >= l.proximo_followup) continue // contato feito desde a data do follow-up
        const dias = diasEntre(l.proximo_followup, hoje)
        alertas.push({ id: 'followup-' + l.id, categoria: 'followup', titulo: l.nome, descricao: dias <= 0 ? 'Retorno agendado para hoje' : `Retorno atrasado há ${dias} ${plural(dias, 'dia', 'dias')} (era ${dataBR(l.proximo_followup)})`, href: '/crm', alvo: { chave: CHAVE.lead, id: l.id }, peso: dias })
      } else if (l.etapa === 'proposta_enviada' && l.data_proposta_enviada) {
        const base = contato && contato > l.data_proposta_enviada ? contato : l.data_proposta_enviada
        const dias = diasEntre(base, hoje)
        if (dias < 3) continue
        alertas.push({ id: 'proposta-' + l.id, categoria: 'proposta', titulo: l.nome, descricao: contato && contato > l.data_proposta_enviada ? `Proposta enviada, sem novo contato há ${dias} ${plural(dias, 'dia', 'dias')}` : `Proposta enviada há ${dias} ${plural(dias, 'dia', 'dias')} sem retorno`, href: '/crm', alvo: { chave: CHAVE.lead, id: l.id }, peso: dias })
      }
    }
  }

  // ── Orçamentos enviados com validade vencida ──
  if (temAcessoModulo(perm, 'orcamento')) {
    let orcs = await get('orcamentos', '?status=eq.enviado&revisao_de=is.null&select=id,codigo,cliente_nome,created_at,revisao_data,validade_dias,criado_por')
    if (!ehAdmin) orcs = orcs.filter((o: any) => !o.criado_por || o.criado_por === meuId)
    for (const o of orcs) {
      const envio = dataLocalISO(new Date(o.revisao_data || o.created_at))
      const validade = somarDias(envio, Number(o.validade_dias) || 30)
      if (validade >= hoje) continue
      const dias = diasEntre(validade, hoje)
      alertas.push({ id: 'orc-' + o.id, categoria: 'orcamento_vencido', titulo: `${o.codigo || ''} — ${o.cliente_nome || ''}`.trim(), descricao: `Validade de ${o.validade_dias || 30} dias venceu há ${dias} ${plural(dias, 'dia', 'dias')} — defina como aprovado, reprovado ou expirado`, href: '/orcamento', alvo: { chave: CHAVE.orcamento, id: o.id }, peso: dias })
    }
  }

  // ── Prospecção: contatos da fila de hoje ainda sem abordagem e follow-ups que venceram (somem ao abordar/descartar) ──
  if (perm && temAcessoModulo(perm, 'crm')) {
    const pend = await get('crm_prospectos', `?or=(and(fila_data.eq.${hoje},status.eq.novo),and(status.eq.abordado,proximo_contato.lte.${hoje}))&select=id,status,fila_data`)
    const novos = pend.filter((p: any) => p.status === 'novo').length
    const follow = pend.filter((p: any) => p.status === 'abordado').length
    if (novos + follow > 0) {
      const partes = [novos > 0 ? `${novos} ${plural(novos, 'contato novo', 'contatos novos')}` : '', follow > 0 ? `${follow} ${plural(follow, 'follow-up', 'follow-ups')}` : ''].filter(Boolean).join(' e ')
      alertas.push({ id: 'prospeccao-dia', categoria: 'prospeccao', titulo: 'Fila de prospecção de hoje', descricao: `${partes} para abordar`, href: '/crm?aba=prospeccao', peso: follow })
    }
  }

  // ── Atividades da equipe em que sou responsável: atrasadas e perto do prazo (somem ao concluir minha parte) ──
  if (perm && meuId) {
    try {
      const minhas = await get('equipe_atividade_responsaveis', `?usuario_id=eq.${meuId}&status=neq.concluida&select=atividade_id,status`)
      if (minhas.length > 0) {
        const ativs = await get('equipe_atividades', `?id=in.(${minhas.map((m: any) => m.atividade_id).join(',')})&select=id,titulo,tipo,data_inicio,data_fim,alerta_dias`)
        for (const a of ativs) {
          const faltam = diasEntre(hoje, a.data_fim)
          if (faltam < 0) {
            const dias = -faltam
            alertas.push({ id: 'atv-atraso-' + a.id, categoria: 'atividade_atrasada', titulo: a.titulo, descricao: `${a.tipo} · prazo era ${dataBR(a.data_fim)} — atrasada há ${dias} ${plural(dias, 'dia', 'dias')}`, href: '/#atividades', alvo: { chave: CHAVE.atividade, id: a.id }, peso: dias })
          } else if (faltam <= (a.alerta_dias ?? 1)) {
            alertas.push({ id: 'atv-prazo-' + a.id, categoria: 'atividade_vencendo', titulo: a.titulo, descricao: `${a.tipo} · ${faltam === 0 ? 'vence hoje' : faltam === 1 ? `vence amanhã (${dataBR(a.data_fim)})` : `vence em ${faltam} dias (${dataBR(a.data_fim)})`}`, href: '/#atividades', alvo: { chave: CHAVE.atividade, id: a.id }, peso: 30 - faltam })
          }
        }
      }
    } catch {}
  }

  // ── Convites de reunião sem resposta (somem ao aceitar/recusar ou depois que a data passa) ──
  if (perm && meuId && temAcessoModulo(perm, 'agenda')) {
    const convites = await get('agenda_participantes', `?usuario_id=eq.${meuId}&status=eq.pendente&select=compromisso_id`)
    if (convites.length > 0) {
      const comps = await get('agenda_compromissos', `?id=in.(${convites.map((c: any) => c.compromisso_id).join(',')})&data=gte.${hoje}&select=id,titulo,data,hora_inicio,usuario_id,criado_por`)
      const donos = comps.length ? await get('usuarios', `?id=in.(${[...new Set(comps.map((c: any) => c.criado_por || c.usuario_id).filter(Boolean))].join(',')})&select=id,nome,email`) : []
      for (const c of comps) {
        const org: any = donos.find((u: any) => u.id === (c.criado_por || c.usuario_id))
        const dias = diasEntre(hoje, c.data)
        alertas.push({ id: 'convite-' + c.id, categoria: 'convite', titulo: `Convite: ${c.titulo}`, descricao: `${dataBR(c.data)}${c.hora_inicio ? ' às ' + c.hora_inicio.slice(0, 5) : ''} — de ${org?.nome || (org?.email || 'alguém').split('@')[0]} · aceite ou recuse na Agenda`, href: '/agenda', alvo: { chave: CHAVE.compromisso, id: c.id }, peso: Math.max(0, 30 - dias) })
      }
    }
  }

  // ── Pedidos de acesso/edição pendentes (levantamento e orçamento) ──
  if (perm) {
    try {
      const sl = await get('levantamento_solicitacoes', '?status=eq.pendente&select=id,levantamento_id,solicitante_nome')
      if (sl.length > 0) {
        const levs = await get('levantamentos', `?id=in.(${sl.map((s: any) => s.levantamento_id).join(',')})&select=id,nome,cliente,criado_por`)
        const mapa = new Map(levs.map((l: any) => [l.id, l]))
        for (const s of sl) {
          const lev: any = mapa.get(s.levantamento_id)
          if (!(ehAdmin || (lev && lev.criado_por === meuId))) continue
          alertas.push({ id: 'sol-lev-' + s.id, categoria: 'solicitacao', titulo: `${s.solicitante_nome || 'Alguém'} pediu acesso`, descricao: `Levantamento: ${lev?.nome || lev?.cliente || ''}`, href: '/levantamento', alvo: { chave: CHAVE.levantamento, id: s.levantamento_id }, peso: 0 })
        }
      }
      const so = await get('orcamento_solicitacoes', '?status=eq.pendente&select=id,orcamento_id,solicitante_nome')
      if (so.length > 0) {
        const os = await get('orcamentos', `?id=in.(${so.map((s: any) => s.orcamento_id).join(',')})&select=id,codigo,cliente_nome,criado_por`)
        const mapa = new Map(os.map((o: any) => [o.id, o]))
        for (const s of so) {
          const orc: any = mapa.get(s.orcamento_id)
          if (!(ehAdmin || (orc && orc.criado_por === meuId))) continue
          alertas.push({ id: 'sol-orc-' + s.id, categoria: 'solicitacao', titulo: `${s.solicitante_nome || 'Alguém'} pediu acesso`, descricao: `Orçamento: ${orc?.codigo || ''} — ${orc?.cliente_nome || ''}`, href: '/orcamento', alvo: { chave: CHAVE.orcamento, id: s.orcamento_id }, peso: 0 })
        }
      }
    } catch {}
  }

  return alertas.sort((a, b) => ORDEM_CATEGORIAS.indexOf(a.categoria) - ORDEM_CATEGORIAS.indexOf(b.categoria) || b.peso - a.peso)
}

// Abre o destino de um alerta: a página de destino abre o item exato (orçamento, lead, lançamento, obra, atividade...).
export function destinoDoAlerta(a: AlertaItem): string {
  if (a.alvo) definirAlvo(a.alvo.chave, a.alvo.id, a.alvo.aba)
  else if (a.obraId) definirAlvo(CHAVE.obra, a.obraId)
  return a.href
}
