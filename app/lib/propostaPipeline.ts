// Proposta (Orçamento) e Pipeline (CRM) andam juntos: mudar o status da proposta atualiza o lead, e mover o lead
// no Pipeline atualiza a proposta. Quem faz a alteração não precisa repetir em outro lugar.
//
//   Orçamento → Pipeline                         Pipeline → Orçamento
//   Enviado   → Proposta Enviada (valor e data)  Proposta Enviada / Em Negociação → Enviado
//   Aprovado  → Fechado Ganho (+ cliente)        Fechado Ganho  → Aprovado
//   Reprovado → Fechado Perdido                  Fechado Perdido → Reprovado
//   Expirado  → Fechado Perdido
//
// Cada sentido grava só do outro lado (nunca um chama o outro), então não há laço. As funções não lançam erro: a
// mudança principal (a que a pessoa fez) já foi salva; devolvem um texto para avisar o que foi atualizado, ou null.
import { encontrarClienteDuplicado, NOME_ETAPA_CRM } from './clienteCrm'

const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
// Chave pública (anon): o acesso real é decidido pelo token do usuário, injetado em lib/authFetch.ts.
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON }

export type StatusProposta = 'rascunho' | 'enviado' | 'aprovado' | 'reprovado' | 'expirado'
export const NOME_STATUS_PROPOSTA: Record<string, string> = { rascunho: 'Rascunho', enviado: 'Enviado', aprovado: 'Aprovado', reprovado: 'Reprovado', expirado: 'Expirado' }
// concordância com "proposta" nos avisos
const FEMININO: Record<string, string> = { rascunho: 'em rascunho', enviado: 'enviada', aprovado: 'aprovada', reprovado: 'reprovada', expirado: 'expirada' }

async function get(tabela: string, q = ''): Promise<any[]> {
  const r = await fetch(`${BASE}/${tabela}${q}`, { headers: H })
  const d = await r.json()
  if (!Array.isArray(d)) throw new Error(d?.message || 'erro ao ler ' + tabela)
  return d
}
async function gravar(metodo: 'POST' | 'PATCH', caminho: string, corpo: object): Promise<any> {
  const r = await fetch(`${BASE}/${caminho}`, { method: metodo, headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(corpo) })
  if (!r.ok) throw new Error('erro ao gravar ' + caminho.split('?')[0])
  const d = await r.json().catch(() => null)
  return Array.isArray(d) ? d[0] : d
}

// Data local (Brasil) em AAAA-MM-DD.
function hoje(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const moeda = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ── Orçamento → Pipeline ─────────────────────────────────────────────────────────
// Garante que o lead tenha cadastro em Clientes (reaproveita o que já existe por e-mail/telefone) e marca
// "fidelizado" quando é o 2º negócio fechado com a mesma pessoa (salvo ajuste manual).
async function garantirCliente(lead: any): Promise<string | null> {
  let clienteId: string | null = lead.cliente_id || null
  if (!clienteId) {
    const existente = await encontrarClienteDuplicado(lead.email || '', lead.telefone || '')
    if (existente) clienteId = existente.id
    else {
      const canal = lead.canal === 'Outro' ? (lead.canal_outro || 'Outro') : lead.canal
      const novo = await gravar('POST', 'clientes', {
        nome: lead.nome, email: lead.email || null, telefone: lead.telefone || null, canal_origem: canal || null,
        responsavel_id: lead.responsavel_id || null, lead_id: lead.id, tipo: 'pessoa_fisica',
      })
      clienteId = novo?.id || null
    }
  }
  if (clienteId) {
    const cli = (await get('clientes', `?id=eq.${clienteId}&select=id,fidelizado_manual`))[0]
    if (cli && cli.fidelizado_manual == null) {
      const outros = await get('crm_leads', `?cliente_id=eq.${clienteId}&etapa=eq.fechado_ganho&id=neq.${lead.id}&select=id`)
      if (outros.length > 0) {
        await gravar('PATCH', `clientes?id=eq.${clienteId}`, { fidelizado: true })
        await gravar('POST', 'crm_atividades', { lead_id: lead.id, tipo: 'nota', descricao: 'Novo negócio fechado com cliente já cadastrado — marcado como fidelizado.' })
      }
    }
  }
  return clienteId
}

export async function atualizarPipelineDaProposta(orcamentoId: string, novoStatus: string): Promise<string | null> {
  try {
    const orc = (await get('orcamentos', `?id=eq.${orcamentoId}&select=id,codigo,crm_lead_id,total_geral`))[0]
    if (!orc?.crm_lead_id) return null
    const lead = (await get('crm_leads', `?id=eq.${orc.crm_lead_id}`))[0]
    if (!lead) return null

    const etapaAtual: string = lead.etapa
    let etapaNova: string | null = null
    const dados: Record<string, any> = {}
    const valor = Number(orc.total_geral) || 0

    if (novoStatus === 'enviado') {
      // a proposta saiu: vira "Proposta Enviada" (não faz o lead recuar se já está em negociação ou virou cliente)
      if (!['proposta_enviada', 'negociacao', 'pos_venda'].includes(etapaAtual)) etapaNova = 'proposta_enviada'
      dados.valor_proposta = valor || lead.valor_proposta || null
      dados.data_proposta_enviada = hoje() // reinicia a contagem de "proposta parada"
      if (etapaNova) dados.motivo_perda = null
    } else if (novoStatus === 'aprovado') {
      if (!['fechado_ganho', 'pos_venda'].includes(etapaAtual)) {
        etapaNova = 'fechado_ganho'
        dados.motivo_perda = null
        const clienteId = await garantirCliente(lead)
        if (clienteId) dados.cliente_id = clienteId
      }
      if (valor) dados.valor_proposta = valor
    } else if (novoStatus === 'reprovado' || novoStatus === 'expirado') {
      // lead que já fechou negócio (ou virou pós-venda) não volta para "perdido" por causa de uma proposta antiga
      if (!['fechado_perdido', 'fechado_ganho', 'pos_venda'].includes(etapaAtual)) {
        etapaNova = 'fechado_perdido'
        dados.motivo_perda = novoStatus === 'reprovado' ? 'Proposta reprovada pelo cliente' : 'Proposta expirou sem retorno do cliente'
      }
    } else {
      return null // rascunho: não mexe no pipeline
    }

    if (etapaNova) dados.etapa = etapaNova
    // nada a alterar de verdade (já estava na etapa e os dados batem)
    if (!etapaNova && novoStatus !== 'enviado' && novoStatus !== 'aprovado') return null
    dados.updated_at = new Date().toISOString()
    await gravar('PATCH', `crm_leads?id=eq.${lead.id}`, dados)
    if (etapaNova) {
      await gravar('POST', 'crm_atividades', {
        lead_id: lead.id, tipo: 'mudanca_etapa', etapa_anterior: etapaAtual, etapa_nova: etapaNova,
        descricao: `${NOME_ETAPA_CRM[etapaAtual] || etapaAtual} → ${NOME_ETAPA_CRM[etapaNova] || etapaNova} (automático: proposta ${orc.codigo || ''} ${FEMININO[novoStatus] || novoStatus})`,
      })
      return `Pipeline atualizado: ${lead.nome} → ${NOME_ETAPA_CRM[etapaNova]}${novoStatus === 'enviado' && valor ? ` (${moeda(valor)})` : ''}.`
    }
    return novoStatus === 'enviado' ? `Pipeline: proposta de ${lead.nome} registrada como enviada hoje.` : null
  } catch { return null }
}

// ── Pipeline → Orçamento ─────────────────────────────────────────────────────────
export async function atualizarPropostaDoLead(leadId: string, novaEtapa: string): Promise<string | null> {
  try {
    let alvo: StatusProposta | null = null
    if (novaEtapa === 'proposta_enviada' || novaEtapa === 'negociacao') alvo = 'enviado'
    else if (novaEtapa === 'fechado_ganho') alvo = 'aprovado'
    else if (novaEtapa === 'fechado_perdido') alvo = 'reprovado'
    if (!alvo) return null
    // só a proposta vigente (as revisões antigas são histórico e não mudam de status)
    const orcs = await get('orcamentos', `?crm_lead_id=eq.${leadId}&revisao_de=is.null&select=id,codigo,status,total_geral`)
    const mudadas: string[] = []
    // o lead acompanha o valor da proposta vinculada (e a data de envio, se ainda não tinha)
    const total = orcs.map(o => Number(o.total_geral) || 0).reduce((a, b) => a + b, 0)
    if (total > 0 && ['proposta_enviada', 'negociacao', 'fechado_ganho'].includes(novaEtapa)) {
      const lead = (await get('crm_leads', `?id=eq.${leadId}&select=valor_proposta,data_proposta_enviada`))[0]
      const ajuste: Record<string, any> = {}
      if (lead && Number(lead.valor_proposta) !== total) ajuste.valor_proposta = total
      if (lead && !lead.data_proposta_enviada && novaEtapa !== 'fechado_ganho') ajuste.data_proposta_enviada = hoje()
      if (Object.keys(ajuste).length) await gravar('PATCH', `crm_leads?id=eq.${leadId}`, ajuste)
    }
    for (const o of orcs) {
      if (o.status === alvo) continue
      if (alvo === 'reprovado' && o.status === 'expirado') continue // já está encerrada
      await gravar('PATCH', `orcamentos?id=eq.${o.id}`, { status: alvo })
      mudadas.push(o.codigo || '')
    }
    if (mudadas.length === 0) return null
    return `Proposta ${mudadas.join(', ')} marcada como ${FEMININO[alvo]}.`
  } catch { return null }
}
