'use client'
import { useState, useEffect, useMemo } from 'react'
import Layout from '../components/Layout'
import { obterMinhasPermissoes, temAcessoModulo } from '../lib/permissoes'

const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': 'Bearer ' + ANON }

async function buscar(tabela: string, q = '') {
  try { const r = await fetch(BASE + '/' + tabela + q, { headers: H }); const d = await r.json(); return Array.isArray(d) ? d : [] } catch { return [] }
}
async function criar(tabela: string, dados: object) {
  try {
    const r = await fetch(BASE + '/' + tabela, { method: 'POST', headers: { ...H, 'Prefer': 'return=representation' }, body: JSON.stringify(dados) })
    const d = await r.json()
    return Array.isArray(d) ? d[0] : d
  } catch { return null }
}
async function editar(tabela: string, id: string, dados: object) {
  try { const r = await fetch(BASE + '/' + tabela + '?id=eq.' + id, { method: 'PATCH', headers: H, body: JSON.stringify(dados) }); return r.ok } catch { return false }
}
async function remover(tabela: string, id: string): Promise<boolean> {
  try { const r = await fetch(BASE + '/' + tabela + '?id=eq.' + id, { method: 'DELETE', headers: H }); return r.ok } catch { return false }
}

const moeda = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const num = (v: any) => Number(v) || 0
const dataBR = (v: string) => v ? new Date(v + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

function gerarCodigo(lista: any[], prefixo: string) {
  const ano = new Date().getFullYear()
  const p = prefixo + '-' + ano + '-'
  const maior = lista.reduce((m, l) => {
    if (!l.codigo?.startsWith(p)) return m
    const n = parseInt(l.codigo.slice(p.length), 10)
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return p + String(maior + 1).padStart(3, '0')
}

// As 9 etapas do funil montado no Trello "CRM Inverso" (board real da Inverso) — não inventadas,
// seguem exatamente a ordem/nomes das listas de lá.
const ETAPA_ORDEM = ['lead_novo', 'qualificacao', 'visita_agendada', 'visita_realizada', 'proposta_enviada', 'negociacao', 'fechado_ganho', 'fechado_perdido', 'pos_venda'] as const
const ETAPA_NOME: Record<string, string> = {
  lead_novo: 'Lead Novo', qualificacao: 'Qualificação', visita_agendada: 'Visita Técnica Agendada',
  visita_realizada: 'Visita Realizada', proposta_enviada: 'Proposta Enviada', negociacao: 'Em Negociação',
  fechado_ganho: 'Fechado Ganho', fechado_perdido: 'Fechado Perdido', pos_venda: 'Pós Venda',
}
const ETAPA_BADGE: Record<string, string> = {
  lead_novo: 'bg-on-surface-variant/10 text-on-surface-variant border-on-surface-variant/20',
  qualificacao: 'bg-secondary/10 text-secondary border-secondary/20',
  visita_agendada: 'bg-secondary/10 text-secondary border-secondary/20',
  visita_realizada: 'bg-tertiary/10 text-tertiary border-tertiary/20',
  proposta_enviada: 'bg-tertiary/10 text-tertiary border-tertiary/20',
  negociacao: 'bg-tertiary/10 text-tertiary border-tertiary/20',
  fechado_ganho: 'bg-primary-container/10 text-primary-container border-primary-container/20',
  fechado_perdido: 'bg-error/10 text-error border-error/20',
  pos_venda: 'bg-primary/10 text-primary border-primary/20',
}
// Canais confirmados com o usuário (o card de exemplo no Trello só trazia "Indicação") + "Outro" livre.
const CANAL_OPCOES = ['Indicação', 'Google Meu Negócio', 'Instagram', 'Site', 'Outro']
const TIPO_LEAD_NOME: Record<string, string> = { novo: 'Novo', carteira: 'Carteira' }
const ATIVIDADE_NOME: Record<string, string> = {
  ligacao: '📞 Ligação', email: '✉️ E-mail', reuniao: '🤝 Reunião', visita: '📍 Visita', nota: '📝 Nota', mudanca_etapa: '🔀 Mudança de etapa',
}
// Temperatura do lead (pedido do usuário, pra priorizar atendimento) — vale a qualquer etapa,
// não só em Lead Novo, por isso fica sempre editável no cabeçalho do detalhe.
const STATUS_LEAD_OPCOES = ['frio', 'morno', 'quente'] as const
const STATUS_LEAD_NOME: Record<string, string> = { frio: '🔵 Frio', morno: '🟡 Morno', quente: '🔴 Quente' }
const STATUS_LEAD_BADGE: Record<string, string> = {
  frio: 'bg-secondary/10 text-secondary border-secondary/20',
  morno: 'bg-tertiary/10 text-tertiary border-tertiary/20',
  quente: 'bg-error/10 text-error border-error/20',
}

const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const labelCls = 'text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5'
const btnPrimaryCls = 'bg-primary text-on-primary rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
const btnSecondaryCls = 'bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg px-4 py-2.5 text-sm hover:bg-surface-variant transition-all cursor-pointer'
const btnEditSmCls = 'bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-md px-2.5 py-1 text-xs hover:bg-surface-variant transition-all cursor-pointer'
const btnDangerSmCls = 'bg-error/10 border border-error/30 text-error rounded-md px-2.5 py-1 text-xs hover:bg-error/20 transition-all cursor-pointer'
const cardCls = 'bg-surface-container border border-outline-variant rounded-xl p-5'
const sectionCls = 'bg-surface-container border border-outline-variant rounded-xl p-5 mb-4'

const FORM_LEAD_VAZIO = {
  codigo: '', nome: '', telefone: '', email: '', canal: 'Indicação', canal_outro: '',
  tipo: 'novo', responsavel_id: '', observacao: '',
}
const FORM_CLIENTE_VAZIO = {
  nome: '', email: '', telefone: '', cpf_cnpj: '', endereco: '', bairro: '', cidade: '', estado: '',
  cep: '', tipo: 'pessoa_fisica', canal_origem: '', observacao: '',
}

export default function CRM() {
  const [leads, setLeads] = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [orcamentos, setOrcamentos] = useState<any[]>([])
  const [levantamentos, setLevantamentos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [abaTopo, setAbaTopo] = useState<'pipeline' | 'clientes'>('pipeline')

  const [busca, setBusca] = useState('')
  const [filtroCanal, setFiltroCanal] = useState('todos')

  const [janela, setJanela] = useState<null | 'form' | 'detalhe' | 'extraEtapa' | 'confirmarCliente' | 'clienteForm' | 'clienteDetalhe'>(null)
  const [editando, setEditando] = useState<any>(null)
  const [fLead, setFLead] = useState(FORM_LEAD_VAZIO)

  const [detalhe, setDetalhe] = useState<any>(null)
  const [atividades, setAtividades] = useState<any[]>([])
  const [fAtividade, setFAtividade] = useState({ tipo: 'ligacao', descricao: '' })
  const [editandoAtividadeId, setEditandoAtividadeId] = useState<string | null>(null)
  const [textoAtividadeEditando, setTextoAtividadeEditando] = useState('')

  const [etapaAlvo, setEtapaAlvo] = useState<string>('')
  const [fExtra, setFExtra] = useState({ valor_proposta: '', motivo_perda: '', data_visita: '', hora_visita: '' })

  const [filtroClientes, setFiltroClientes] = useState<'todos' | 'fidelizados' | 'nao_fidelizados'>('todos')
  const [clienteDetalhe, setClienteDetalhe] = useState<any>(null)
  const [fCliente, setFCliente] = useState(FORM_CLIENTE_VAZIO)
  const [editandoCliente, setEditandoCliente] = useState<any>(null)

  useEffect(() => {
    if (!localStorage.getItem('viga_token')) { window.location.href = '/'; return }
    setUserEmail(localStorage.getItem('viga_email') || '')
    obterMinhasPermissoes().then(perm => {
      if (!temAcessoModulo(perm, 'crm')) { window.location.href = '/'; return }
    })
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    const [l, c, u, o, lev] = await Promise.all([
      buscar('crm_leads', '?order=created_at.desc'),
      buscar('clientes', '?order=nome.asc'),
      buscar('usuarios', '?select=id,nome,email,role&order=nome'),
      buscar('orcamentos', '?select=id,codigo,cliente_nome,total_geral,condicao_pagamento,validade_dias,crm_lead_id&order=created_at.desc'),
      buscar('levantamentos', '?select=id,codigo,nome,cliente,cliente_nome&order=created_at.desc'),
    ])
    setLeads(l); setClientes(c); setUsuarios(u); setOrcamentos(o); setLevantamentos(lev)
    setLoading(false)
  }

  function sair() {
    localStorage.removeItem('viga_token'); localStorage.removeItem('viga_refresh_token'); localStorage.removeItem('viga_email')
    window.location.href = '/'
  }

  // ── Leads / Pipeline ──────────────────────────────────────────
  function abrirNovoLead() {
    setEditando(null)
    setFLead({ ...FORM_LEAD_VAZIO, codigo: gerarCodigo(leads, 'LEAD') })
    setJanela('form')
  }
  function abrirEditarLead(l: any) {
    setEditando(l)
    setFLead({
      codigo: l.codigo || '', nome: l.nome || '', telefone: l.telefone || '', email: l.email || '',
      canal: l.canal || 'Indicação', canal_outro: l.canal_outro || '', tipo: l.tipo || 'novo',
      responsavel_id: l.responsavel_id || '', observacao: l.observacao || '',
    })
    setJanela('form')
  }
  async function salvarLead() {
    if (!fLead.nome.trim()) return alert('Preencha ao menos o nome')
    const dados: any = {
      codigo: fLead.codigo.trim().toUpperCase() || gerarCodigo(leads, 'LEAD'),
      nome: fLead.nome.trim(), telefone: fLead.telefone.trim() || null, email: fLead.email.trim() || null,
      canal: fLead.canal, canal_outro: fLead.canal === 'Outro' ? (fLead.canal_outro.trim() || null) : null,
      tipo: fLead.tipo, responsavel_id: fLead.responsavel_id || null, observacao: fLead.observacao.trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (editando) {
      const ok = await editar('crm_leads', editando.id, dados)
      if (!ok) return alert('Não foi possível salvar. Tente novamente.')
    } else {
      dados.etapa = 'lead_novo'
      const novo = await criar('crm_leads', dados)
      if (!novo) return alert('Não foi possível criar. Tente novamente.')
    }
    setJanela(null); setEditando(null)
    await carregar()
  }
  async function excluirLead(id: string) {
    if (!confirm('Excluir este lead? O histórico de atividades também será apagado.')) return
    // Orçamento, compromisso de agenda e cliente vinculados a este lead têm uma FK apontando
    // pra ele — sem desvincular antes, o banco recusa o DELETE (violação de chave estrangeira)
    // e o lead simplesmente reaparece depois do carregar(), sem nenhum aviso do motivo. Só
    // desvincula (não apaga) esses registros — eles são reais e continuam existindo.
    const orcVinculado = orcamentos.find(o => o.crm_lead_id === id)
    if (orcVinculado) await editar('orcamentos', orcVinculado.id, { crm_lead_id: null })
    const compromissos = await buscar('agenda_compromissos', '?lead_id=eq.' + id + '&select=id')
    for (const c of compromissos) await editar('agenda_compromissos', c.id, { lead_id: null })
    const clientesVinculados = await buscar('clientes', '?lead_id=eq.' + id + '&select=id')
    for (const c of clientesVinculados) await editar('clientes', c.id, { lead_id: null })
    const ok = await remover('crm_leads', id)
    if (!ok) return alert('Não foi possível excluir o lead. Tente novamente.')
    if (detalhe?.id === id) { setJanela(null); setDetalhe(null) }
    carregar()
  }

  async function abrirDetalheLead(l: any) {
    setDetalhe(l)
    setJanela('detalhe')
    const a = await buscar('crm_atividades', '?lead_id=eq.' + l.id + '&order=created_at.desc')
    setAtividades(a)
  }

  async function registrarAtividade(tipo: string, descricao: string, extra: object = {}) {
    if (!detalhe) return
    await criar('crm_atividades', { lead_id: detalhe.id, tipo, descricao: descricao || null, ...extra })
    const a = await buscar('crm_atividades', '?lead_id=eq.' + detalhe.id + '&order=created_at.desc')
    setAtividades(a)
  }
  async function salvarNovaAtividade() {
    if (!fAtividade.descricao.trim()) return alert('Descreva a atividade')
    await registrarAtividade(fAtividade.tipo, fAtividade.descricao.trim())
    setFAtividade({ tipo: 'ligacao', descricao: '' })
  }
  function iniciarEdicaoAtividade(a: any) {
    setEditandoAtividadeId(a.id)
    setTextoAtividadeEditando(a.descricao || '')
  }
  async function salvarEdicaoAtividade(id: string) {
    const ok = await editar('crm_atividades', id, { descricao: textoAtividadeEditando.trim() || null })
    if (!ok) return alert('Não foi possível salvar. Tente novamente.')
    setEditandoAtividadeId(null)
    const a = await buscar('crm_atividades', '?lead_id=eq.' + detalhe.id + '&order=created_at.desc')
    setAtividades(a)
  }
  async function excluirAtividade(id: string) {
    if (!confirm('Excluir esta atividade da linha do tempo?')) return
    const ok = await remover('crm_atividades', id)
    if (!ok) return alert('Não foi possível excluir. Tente novamente.')
    setAtividades(atividades.filter(a => a.id !== id))
  }

  // Motor de transição de etapa — mesma ideia do mudarStatus() de Oportunidades: a maioria das
  // etapas troca direto, mas algumas pedem uma informação extra antes (valor da proposta, motivo
  // da perda, data da visita) ou disparam uma ação de integração (agenda, conversão em cliente).
  function mudarEtapa(novaEtapa: string) {
    if (!detalhe || novaEtapa === detalhe.etapa) return
    setEtapaAlvo(novaEtapa)
    if (novaEtapa === 'fechado_perdido') {
      setFExtra(f => ({ ...f, motivo_perda: '' }))
      setJanela('extraEtapa')
    } else if (novaEtapa === 'visita_agendada') {
      setFExtra(f => ({ ...f, data_visita: new Date().toISOString().slice(0, 10), hora_visita: '09:00' }))
      setJanela('extraEtapa')
    } else if (novaEtapa === 'fechado_ganho') {
      setJanela('confirmarCliente')
    } else {
      confirmarMudancaEtapa(novaEtapa)
    }
  }

  async function confirmarMudancaEtapa(novaEtapa: string, dadosExtra: any = {}) {
    if (!detalhe) return
    const etapaAnterior = detalhe.etapa
    const dados = { etapa: novaEtapa, updated_at: new Date().toISOString(), ...dadosExtra }
    const ok = await editar('crm_leads', detalhe.id, dados)
    if (!ok) return alert('Não foi possível mudar a etapa. Tente novamente.')
    await criar('crm_atividades', {
      lead_id: detalhe.id, tipo: 'mudanca_etapa',
      descricao: `${ETAPA_NOME[etapaAnterior] || etapaAnterior} → ${ETAPA_NOME[novaEtapa] || novaEtapa}`,
      etapa_anterior: etapaAnterior, etapa_nova: novaEtapa,
    })
    const atualizado = { ...detalhe, ...dados }
    setDetalhe(atualizado)
    setJanela('detalhe')
    const a = await buscar('crm_atividades', '?lead_id=eq.' + detalhe.id + '&order=created_at.desc')
    setAtividades(a)
    carregar()
  }

  async function confirmarExtraEtapa() {
    if (etapaAlvo === 'fechado_perdido') {
      if (!fExtra.motivo_perda.trim()) return alert('Informe o motivo da perda')
      await confirmarMudancaEtapa('fechado_perdido', { motivo_perda: fExtra.motivo_perda.trim() })
    } else if (etapaAlvo === 'visita_agendada') {
      if (!fExtra.data_visita) return alert('Informe a data da visita')
      const compromisso = await criar('agenda_compromissos', {
        titulo: 'Visita técnica — ' + detalhe.nome, data: fExtra.data_visita, hora_inicio: fExtra.hora_visita || null,
        descricao: 'Agendado a partir do CRM (' + detalhe.codigo + ')', usuario_id: detalhe.responsavel_id || null, lead_id: detalhe.id,
      })
      if (!compromisso) return alert('Não foi possível criar o compromisso na Agenda. Tente novamente.')
      await confirmarMudancaEtapa('visita_agendada')
    }
  }

  // ── Campos por etapa (Qualificação / Visita / Proposta) ─────────
  // Ficam sempre visíveis e editáveis no detalhe do lead, independente da etapa atual em que
  // ele está agora — assim dá pra voltar e linkar/editar informação retroativamente (ex.: uma
  // proposta que já tinha sido enviada antes do CRM existir), não só no momento da transição.
  async function salvarCampoLead(campo: string, valor: any) {
    if (!detalhe) return
    await editar('crm_leads', detalhe.id, { [campo]: valor })
  }
  async function definirStatusLead(v: string) {
    if (!detalhe) return
    const valor = v || null
    await editar('crm_leads', detalhe.id, { status_lead: valor })
    setDetalhe({ ...detalhe, status_lead: valor })
    carregar()
  }
  async function vincularLevantamento(id: string) {
    if (!detalhe) return
    const valor = id || null
    await editar('crm_leads', detalhe.id, { levantamento_id: valor })
    setDetalhe({ ...detalhe, levantamento_id: valor })
    carregar()
  }
  // O vínculo mora no lado do orçamento (orcamentos.crm_lead_id), não em crm_leads — assim um
  // orçamento continua sendo o dono de seus próprios dados (valor, condição, validade) e o CRM só
  // aponta pra ele, sem duplicar número que pode ficar desatualizado.
  async function vincularOrcamento(orcamentoId: string) {
    if (!detalhe) return
    const anterior = orcamentos.find(o => o.crm_lead_id === detalhe.id)
    if (anterior && anterior.id !== orcamentoId) await editar('orcamentos', anterior.id, { crm_lead_id: null })
    let dadosLead: any = {}
    if (orcamentoId) {
      const orc = orcamentos.find(o => o.id === orcamentoId)
      await editar('orcamentos', orcamentoId, { crm_lead_id: detalhe.id })
      dadosLead.valor_proposta = orc ? num(orc.total_geral) : detalhe.valor_proposta
      if (!detalhe.data_proposta_enviada) dadosLead.data_proposta_enviada = new Date().toISOString().slice(0, 10)
      await editar('crm_leads', detalhe.id, dadosLead)
    }
    setDetalhe({ ...detalhe, ...dadosLead })
    carregar()
  }
  async function salvarFollowup(data: string) {
    if (!detalhe) return
    const valor = data || null
    await editar('crm_leads', detalhe.id, { proximo_followup: valor })
    setDetalhe({ ...detalhe, proximo_followup: valor })
  }
  async function avancarParaQualificacao() {
    await confirmarMudancaEtapa('qualificacao')
  }

  // Ao ganhar o negócio: pergunta antes de criar/vincular o Cliente (confirmado com o usuário —
  // não é automático). Localiza por telefone/e-mail pra não duplicar quem já é cliente, e nesse
  // caso já marca fidelizado (2º+ negócio fechado com a mesma pessoa).
  async function confirmarCriarCliente(criarCliente: boolean) {
    if (!criarCliente) { await confirmarMudancaEtapa('fechado_ganho'); return }
    const existente = clientes.find(c =>
      (detalhe.email && c.email && c.email.toLowerCase() === detalhe.email.toLowerCase()) ||
      (detalhe.telefone && c.telefone && c.telefone.replace(/\D/g, '') === detalhe.telefone.replace(/\D/g, ''))
    )
    let clienteId: string
    if (existente) {
      clienteId = existente.id
      if (existente.fidelizado_manual == null) await editar('clientes', existente.id, { fidelizado: true })
      await registrarAtividade('nota', 'Novo negócio fechado com cliente já cadastrado — marcado como fidelizado.')
    } else {
      const canalFinal = detalhe.canal === 'Outro' ? (detalhe.canal_outro || 'Outro') : detalhe.canal
      const novo = await criar('clientes', {
        nome: detalhe.nome, email: detalhe.email, telefone: detalhe.telefone, canal_origem: canalFinal,
        responsavel_id: detalhe.responsavel_id || null, lead_id: detalhe.id, tipo: 'pessoa_fisica',
      })
      if (!novo?.id) return alert('Não foi possível criar o cliente. Tente novamente.')
      clienteId = novo.id
    }
    await confirmarMudancaEtapa('fechado_ganho', { cliente_id: clienteId })
    carregar()
  }

  const leadsFiltrados = leads.filter(l => {
    if (filtroCanal !== 'todos' && l.canal !== filtroCanal) return false
    if (!busca) return true
    const termo = busca.toLowerCase()
    return [l.nome, l.telefone, l.email, l.codigo].some(v => v?.toLowerCase?.().includes(termo))
  })
  const porEtapa = useMemo(() => {
    const mapa: Record<string, any[]> = {}
    for (const e of ETAPA_ORDEM) mapa[e] = []
    for (const l of leadsFiltrados) (mapa[l.etapa] || mapa.lead_novo).push(l)
    return mapa
  }, [leadsFiltrados])

  const ativosCount = leads.filter(l => !['fechado_ganho', 'fechado_perdido'].includes(l.etapa)).length
  const ganhosCount = leads.filter(l => l.etapa === 'fechado_ganho').length
  const fechadosCount = leads.filter(l => ['fechado_ganho', 'fechado_perdido'].includes(l.etapa)).length
  const taxaConversao = fechadosCount > 0 ? (ganhosCount / fechadosCount) * 100 : 0

  // ── Clientes ──────────────────────────────────────────────────
  function fidelizadoEfetivo(c: any) { return c.fidelizado_manual != null ? c.fidelizado_manual : !!c.fidelizado }
  async function alternarFidelizado(c: any) {
    const novo = !fidelizadoEfetivo(c)
    const ok = await editar('clientes', c.id, { fidelizado_manual: novo })
    if (ok) { setClientes(clientes.map(x => x.id === c.id ? { ...x, fidelizado_manual: novo } : x)); if (clienteDetalhe?.id === c.id) setClienteDetalhe({ ...clienteDetalhe, fidelizado_manual: novo }) }
  }
  function abrirNovoCliente() {
    setEditandoCliente(null)
    setFCliente(FORM_CLIENTE_VAZIO)
    setJanela('clienteForm')
  }
  function abrirEditarCliente(c: any) {
    setEditandoCliente(c)
    setFCliente({
      nome: c.nome || '', email: c.email || '', telefone: c.telefone || '', cpf_cnpj: c.cpf_cnpj || '',
      endereco: c.endereco || '', bairro: c.bairro || '', cidade: c.cidade || '', estado: c.estado || '',
      cep: c.cep || '', tipo: c.tipo || 'pessoa_fisica', canal_origem: c.canal_origem || '', observacao: c.observacao || '',
    })
    setJanela('clienteForm')
  }
  async function salvarCliente() {
    if (!fCliente.nome.trim()) return alert('Preencha ao menos o nome')
    const dados = {
      nome: fCliente.nome.trim(), email: fCliente.email.trim() || null, telefone: fCliente.telefone.trim() || null,
      cpf_cnpj: fCliente.cpf_cnpj.trim() || null, endereco: fCliente.endereco.trim() || null, bairro: fCliente.bairro.trim() || null,
      cidade: fCliente.cidade.trim() || null, estado: fCliente.estado.trim() || null, cep: fCliente.cep.trim() || null,
      tipo: fCliente.tipo, canal_origem: fCliente.canal_origem.trim() || null, observacao: fCliente.observacao.trim() || null,
    }
    if (editandoCliente) {
      const ok = await editar('clientes', editandoCliente.id, dados)
      if (!ok) return alert('Não foi possível salvar. Tente novamente.')
    } else {
      const novo = await criar('clientes', dados)
      if (!novo) return alert('Não foi possível criar. Tente novamente.')
    }
    setJanela(null); setEditandoCliente(null)
    await carregar()
  }
  async function excluirCliente(id: string) {
    if (!confirm('Excluir este cliente?')) return
    // Leads que já fecharam com esse cliente apontam pra ele (crm_leads.cliente_id) — desvincula
    // antes, senão o DELETE falha por FK e o cliente reaparece sem explicação nenhuma.
    const leadsVinculados = leads.filter(l => l.cliente_id === id)
    for (const l of leadsVinculados) await editar('crm_leads', l.id, { cliente_id: null })
    const ok = await remover('clientes', id)
    if (!ok) return alert('Não foi possível excluir o cliente. Tente novamente.')
    if (clienteDetalhe?.id === id) { setJanela(null); setClienteDetalhe(null) }
    carregar()
  }
  function negociosDoCliente(clienteId: string) { return leads.filter(l => l.cliente_id === clienteId) }

  const clientesFiltrados = clientes.filter(c => {
    if (filtroClientes === 'fidelizados' && !fidelizadoEfetivo(c)) return false
    if (filtroClientes === 'nao_fidelizados' && fidelizadoEfetivo(c)) return false
    if (!busca) return true
    const termo = busca.toLowerCase()
    return [c.nome, c.email, c.telefone].some(v => v?.toLowerCase?.().includes(termo))
  })

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-primary text-lg">Carregando CRM...</div>
    </div>
  )

  return (
    <Layout
      userEmail={userEmail}
      onLogout={sair}
      searchSlot={
        <div className="relative w-full group">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline group-focus-within:text-primary transition-colors">search</span>
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder={abaTopo === 'pipeline' ? 'Buscar por nome, telefone, e-mail...' : 'Buscar cliente por nome, telefone, e-mail...'}
            className="w-full bg-surface-container-low border border-outline-variant rounded-full pl-12 pr-4 py-2 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
        </div>
      }
      topbarSlot={
        abaTopo === 'pipeline' ? (
          <button onClick={abrirNovoLead} className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl hover:opacity-90 transition-all font-label-md text-label-md shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-[20px]">add_circle</span>
            Novo Lead
          </button>
        ) : (
          <button onClick={abrirNovoCliente} className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl hover:opacity-90 transition-all font-label-md text-label-md shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-[20px]">add_circle</span>
            Novo Cliente
          </button>
        )
      }
    >
      <div className="flex items-center justify-between flex-wrap gap-3 mb-lg">
        <div>
          <h2 className="font-headline text-headline-lg text-on-surface">Clientes & CRM</h2>
          <p className="text-body-md text-on-surface-variant">Funil comercial da Inverso — do lead novo ao pós-venda.</p>
        </div>
        <div className="flex gap-1 p-1 bg-surface-container rounded-xl border border-outline-variant">
          {(['pipeline', 'clientes'] as const).map(a => (
            <button key={a} onClick={() => setAbaTopo(a)}
              className={`px-3.5 py-2 rounded-lg text-label-md transition-colors ${abaTopo === a ? 'bg-primary/20 text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-variant'}`}>
              {a === 'pipeline' ? '🔀 Pipeline' : '🤝 Clientes'}
            </button>
          ))}
        </div>
      </div>

      {abaTopo === 'pipeline' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-lg">
            <div className={cardCls}>
              <div className="text-[11px] text-on-surface-variant uppercase tracking-widest mb-2">Leads ativos no funil</div>
              <div className="text-2xl font-bold text-primary">{ativosCount}</div>
            </div>
            <div className={cardCls}>
              <div className="text-[11px] text-on-surface-variant uppercase tracking-widest mb-2">Fechados ganhos</div>
              <div className="text-2xl font-bold text-primary-container">{ganhosCount}</div>
            </div>
            <div className={cardCls}>
              <div className="text-[11px] text-on-surface-variant uppercase tracking-widest mb-2">Taxa de conversão</div>
              <div className="text-2xl font-bold text-secondary">{taxaConversao.toFixed(0)}%</div>
            </div>
          </div>

          <div className="flex gap-1 p-1 bg-surface-container rounded-xl border border-outline-variant mb-4 w-fit flex-wrap">
            {['todos', ...CANAL_OPCOES].map(v => (
              <button key={v} onClick={() => setFiltroCanal(v)}
                className={`px-3.5 py-2 rounded-lg text-label-md transition-colors ${filtroCanal === v ? 'bg-primary/20 text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-variant'}`}>
                {v === 'todos' ? 'Todos' : v}
              </button>
            ))}
          </div>

          {leads.length === 0 ? (
            <div className={sectionCls + ' text-center py-16'}>
              <div className="text-5xl mb-4">🤝</div>
              <div className="text-base font-bold text-on-surface mb-2">Nenhum lead cadastrado ainda</div>
              <p className="text-body-sm text-on-surface-variant mb-4">Cadastre o primeiro contato para começar a rastrear o funil.</p>
              <button className={btnPrimaryCls} onClick={abrirNovoLead}>+ Cadastrar primeiro lead</button>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
              {ETAPA_ORDEM.map(etapa => (
                <div key={etapa} className="flex-shrink-0 w-[280px]">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${ETAPA_BADGE[etapa]}`}>{ETAPA_NOME[etapa]}</span>
                    <span className="text-[11px] text-on-surface-variant">{porEtapa[etapa].length}</span>
                  </div>
                  <div className="flex flex-col gap-2 min-h-[60px]">
                    {porEtapa[etapa].map(l => (
                      <div key={l.id} onClick={() => abrirDetalheLead(l)}
                        className="bg-surface-container border border-outline-variant rounded-xl p-3.5 cursor-pointer hover:border-primary transition-colors">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[10px] text-on-surface-variant font-mono">{l.codigo}</span>
                          <span className="text-[10px] text-on-surface-variant">{TIPO_LEAD_NOME[l.tipo] || l.tipo}</span>
                        </div>
                        <div className="text-sm font-bold text-on-surface mb-1 line-clamp-2">{l.nome}</div>
                        <div className="text-[11px] text-on-surface-variant mb-2 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px]">campaign</span>
                          <span className="truncate">{l.canal === 'Outro' ? (l.canal_outro || 'Outro') : l.canal || '—'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          {l.valor_proposta != null ? (
                            <div className="text-xs font-semibold text-primary">{moeda(l.valor_proposta)}</div>
                          ) : <span />}
                          {l.status_lead && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_LEAD_BADGE[l.status_lead]}`}>{STATUS_LEAD_NOME[l.status_lead]}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {abaTopo === 'clientes' && (
        <>
          <div className="flex gap-1 p-1 bg-surface-container rounded-xl border border-outline-variant mb-4 w-fit">
            {(['todos', 'fidelizados', 'nao_fidelizados'] as const).map(v => (
              <button key={v} onClick={() => setFiltroClientes(v)}
                className={`px-3.5 py-2 rounded-lg text-label-md transition-colors ${filtroClientes === v ? 'bg-primary/20 text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-variant'}`}>
                {v === 'todos' ? 'Todos' : v === 'fidelizados' ? '⭐ Fidelizados' : 'Não fidelizados'}
              </button>
            ))}
          </div>

          {clientesFiltrados.length === 0 ? (
            <div className={sectionCls + ' text-center py-16'}>
              <div className="text-5xl mb-4">👥</div>
              <div className="text-base font-bold text-on-surface mb-2">Nenhum cliente encontrado</div>
              <p className="text-body-sm text-on-surface-variant mb-4">Clientes entram aqui automaticamente quando um lead é marcado como "Fechado Ganho", ou cadastre um diretamente.</p>
              <button className={btnPrimaryCls} onClick={abrirNovoCliente}>+ Cadastrar cliente</button>
            </div>
          ) : (
            <div className={sectionCls}>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-outline-variant">
                    {['Nome', 'Contato', 'Canal', 'Negócios fechados', 'Status', ''].map(h => (
                      <th key={h} className="text-left px-2.5 py-2 text-[10px] text-on-surface-variant uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientesFiltrados.map(c => (
                    <tr key={c.id} className="border-b border-outline-variant hover:bg-surface-variant/20 cursor-pointer" onClick={() => { setClienteDetalhe(c); setJanela('clienteDetalhe') }}>
                      <td className="px-2.5 py-2.5 font-semibold text-on-surface">{c.nome}</td>
                      <td className="px-2.5 py-2.5 text-on-surface-variant">{c.telefone || c.email || '—'}</td>
                      <td className="px-2.5 py-2.5 text-on-surface-variant">{c.canal_origem || '—'}</td>
                      <td className="px-2.5 py-2.5 text-on-surface-variant">{negociosDoCliente(c.id).filter(l => l.etapa === 'fechado_ganho').length}</td>
                      <td className="px-2.5 py-2.5">
                        {fidelizadoEfetivo(c) ? (
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-tertiary/10 text-tertiary border-tertiary/20">⭐ Fidelizado</span>
                        ) : (
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-surface-variant text-on-surface-variant border-outline-variant">Não fidelizado</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                        <button className={btnEditSmCls} onClick={() => alternarFidelizado(c)}>{fidelizadoEfetivo(c) ? 'Remover selo' : 'Marcar fidelizado'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Modal: Novo/Editar Lead ─────────────────────────────── */}
      {janela === 'form' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[560px] max-h-[92vh] overflow-y-auto custom-scrollbar">
            <div className="text-base font-bold text-on-surface mb-5">🤝 {editando ? 'Editar Lead' : 'Novo Lead'}</div>

            <div className="grid grid-cols-2 gap-3 mb-3.5">
              <div>
                <label className={labelCls}>Código</label>
                <input className={inputCls} value={fLead.codigo} onChange={e => setFLead({ ...fLead, codigo: e.target.value })} placeholder="LEAD-2026-001" />
              </div>
              <div>
                <label className={labelCls}>Tipo</label>
                <select className={inputCls} value={fLead.tipo} onChange={e => setFLead({ ...fLead, tipo: e.target.value })}>
                  {Object.entries(TIPO_LEAD_NOME).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>

            <div className="mb-3.5">
              <label className={labelCls}>Nome *</label>
              <input className={inputCls} value={fLead.nome} onChange={e => setFLead({ ...fLead, nome: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3.5">
              <div>
                <label className={labelCls}>Telefone</label>
                <input className={inputCls} value={fLead.telefone} onChange={e => setFLead({ ...fLead, telefone: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>E-mail</label>
                <input className={inputCls} value={fLead.email} onChange={e => setFLead({ ...fLead, email: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3.5">
              <div>
                <label className={labelCls}>Canal</label>
                <select className={inputCls} value={fLead.canal} onChange={e => setFLead({ ...fLead, canal: e.target.value })}>
                  {CANAL_OPCOES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Responsável</label>
                <select className={inputCls} value={fLead.responsavel_id} onChange={e => setFLead({ ...fLead, responsavel_id: e.target.value })}>
                  <option value="">—</option>
                  {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </div>
            </div>

            {fLead.canal === 'Outro' && (
              <div className="mb-3.5">
                <label className={labelCls}>Qual canal?</label>
                <input className={inputCls} value={fLead.canal_outro} onChange={e => setFLead({ ...fLead, canal_outro: e.target.value })} />
              </div>
            )}

            <div className="mb-5">
              <label className={labelCls}>Observações</label>
              <textarea className={inputCls + ' min-h-[70px] resize-y'} value={fLead.observacao} onChange={e => setFLead({ ...fLead, observacao: e.target.value })} />
            </div>

            <div className="flex gap-2 justify-end">
              <button className={btnSecondaryCls} onClick={() => { setJanela(null); setEditando(null) }}>Cancelar</button>
              <button className={btnPrimaryCls} onClick={salvarLead}>{editando ? 'Salvar' : 'Cadastrar Lead'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Detalhe do Lead ──────────────────────────────── */}
      {janela === 'detalhe' && detalhe && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl w-full max-w-[720px] max-h-[92vh] overflow-y-auto custom-scrollbar">
            <div className="p-7 pb-0 sticky top-0 bg-surface-container z-10">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="text-[11px] text-on-surface-variant font-mono mb-1">{detalhe.codigo}</div>
                  <div className="text-lg font-bold text-on-surface">{detalhe.nome}</div>
                  <div className="text-[12px] text-on-surface-variant flex items-center gap-3 mt-0.5 flex-wrap">
                    {detalhe.telefone && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">call</span>{detalhe.telefone}</span>}
                    {detalhe.email && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">mail</span>{detalhe.email}</span>}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button className={btnSecondaryCls} onClick={() => abrirEditarLead(detalhe)}>✏️ Editar</button>
                  <button className={btnDangerSmCls} onClick={() => excluirLead(detalhe.id)}>Excluir</button>
                  <button className="text-on-surface-variant hover:text-on-surface px-2" onClick={() => setJanela(null)}>✕</button>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${ETAPA_BADGE[detalhe.etapa]}`}>{ETAPA_NOME[detalhe.etapa]}</span>
                <select className={inputCls + ' w-auto py-1.5'} value={detalhe.etapa} onChange={e => mudarEtapa(e.target.value)}>
                  {ETAPA_ORDEM.map(e => <option key={e} value={e}>Mover para: {ETAPA_NOME[e]}</option>)}
                </select>
                <select className={inputCls + ' w-auto py-1.5 ' + (detalhe.status_lead ? STATUS_LEAD_BADGE[detalhe.status_lead] : '')} value={detalhe.status_lead || ''} onChange={e => definirStatusLead(e.target.value)} title="Prioridade do lead">
                  <option value="">Prioridade: —</option>
                  {STATUS_LEAD_OPCOES.map(s => <option key={s} value={s}>{STATUS_LEAD_NOME[s]}</option>)}
                </select>
                {detalhe.cliente_id && <span className="text-[11px] text-primary">🤝 Cliente vinculado</span>}
              </div>
            </div>

            <div className="p-7">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <div className={cardCls + ' p-3.5'}><div className="text-[10px] text-on-surface-variant uppercase mb-1">Canal</div><div className="text-sm font-bold text-on-surface">{detalhe.canal === 'Outro' ? (detalhe.canal_outro || 'Outro') : (detalhe.canal || '—')}</div></div>
                <div className={cardCls + ' p-3.5'}><div className="text-[10px] text-on-surface-variant uppercase mb-1">Tipo</div><div className="text-sm font-bold text-on-surface">{TIPO_LEAD_NOME[detalhe.tipo] || '—'}</div></div>
                <div className={cardCls + ' p-3.5'}><div className="text-[10px] text-on-surface-variant uppercase mb-1">Responsável</div><div className="text-sm font-bold text-on-surface">{usuarios.find(u => u.id === detalhe.responsavel_id)?.nome || '—'}</div></div>
                <div className={cardCls + ' p-3.5'}><div className="text-[10px] text-on-surface-variant uppercase mb-1">Proposta</div><div className="text-sm font-bold text-on-surface">{detalhe.valor_proposta != null ? moeda(detalhe.valor_proposta) : '—'}</div></div>
              </div>

              {detalhe.etapa === 'fechado_perdido' && detalhe.motivo_perda && (
                <div className="bg-error/10 border border-error/20 rounded-xl p-4 mb-5">
                  <div className="text-[11px] text-error uppercase font-bold mb-1">Motivo da perda</div>
                  <div className="text-sm text-on-surface">{detalhe.motivo_perda}</div>
                </div>
              )}

              {detalhe.observacao && (
                <div className={cardCls + ' mb-5'}>
                  <div className="text-[10px] text-on-surface-variant uppercase mb-1">Observações</div>
                  <div className="text-sm text-on-surface whitespace-pre-wrap">{detalhe.observacao}</div>
                </div>
              )}

              {/* Ficam sempre visíveis (não só na etapa correspondente) pra dar pra preencher ou
                  linkar informação retroativamente — ex.: uma proposta já enviada antes do CRM
                  existir, como o caso do Matheus Cordeiro. */}
              <div className={cardCls + ' mb-4'}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-bold text-on-surface">📋 Dados do Lead</div>
                  {detalhe.etapa === 'lead_novo' && (
                    <button className={btnEditSmCls} onClick={avancarParaQualificacao}>✓ Avançar para Qualificação</button>
                  )}
                </div>
                <div className="mb-3">
                  <label className={labelCls}>Localização</label>
                  <input className={inputCls} placeholder="Endereço do imóvel/obra" defaultValue={detalhe.localizacao || ''} key={'loc' + detalhe.id}
                    onBlur={e => salvarCampoLead('localizacao', e.target.value || null)} />
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelCls}>Tipo de obra</label>
                    <input className={inputCls} placeholder="Ex: Projeto de apartamento — 36m²" defaultValue={detalhe.tipo_obra || ''} key={'tob' + detalhe.id}
                      onBlur={e => salvarCampoLead('tipo_obra', e.target.value || null)} />
                  </div>
                  <div>
                    <label className={labelCls}>Prazo estimado</label>
                    <input className={inputCls} placeholder="Ex: 2 meses" defaultValue={detalhe.prazo_estimado || ''} key={'prz' + detalhe.id}
                      onBlur={e => salvarCampoLead('prazo_estimado', e.target.value || null)} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Ticket estimado (R$)</label>
                  <input className={inputCls} type="number" placeholder="Se já houver uma média ou algo adiantado com o cliente" defaultValue={detalhe.ticket_estimado ?? ''} key={'tkt' + detalhe.id}
                    onBlur={e => salvarCampoLead('ticket_estimado', e.target.value ? num(e.target.value) : null)} />
                </div>
              </div>

              <div className={cardCls + ' mb-4'}>
                <div className="text-sm font-bold text-on-surface mb-3">🔍 Visita Técnica</div>
                <div className="mb-3">
                  <label className={labelCls}>Levantamento técnico vinculado</label>
                  <select className={inputCls} value={detalhe.levantamento_id || ''} onChange={e => vincularLevantamento(e.target.value)}>
                    <option value="">Nenhum vinculado</option>
                    {levantamentos.map(lv => <option key={lv.id} value={lv.id}>{lv.codigo} — {lv.cliente_nome || lv.cliente || lv.nome}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelCls}>Feedback</label>
                    <textarea className={inputCls + ' min-h-[60px] resize-y'} defaultValue={detalhe.feedback_visita || ''} key={'fb' + detalhe.id}
                      onBlur={e => salvarCampoLead('feedback_visita', e.target.value || null)} />
                  </div>
                  <div>
                    <label className={labelCls}>Observações</label>
                    <textarea className={inputCls + ' min-h-[60px] resize-y'} defaultValue={detalhe.observacao_visita || ''} key={'obv' + detalhe.id}
                      onBlur={e => salvarCampoLead('observacao_visita', e.target.value || null)} />
                  </div>
                </div>
                <div className="mb-3">
                  <label className={labelCls}>Interesse</label>
                  <textarea className={inputCls + ' min-h-[50px] resize-y'} defaultValue={detalhe.interesse || ''} key={'int' + detalhe.id}
                    onBlur={e => salvarCampoLead('interesse', e.target.value || null)} />
                </div>
                <div className="mb-3">
                  <label className={labelCls}>Necessidades</label>
                  <textarea className={inputCls + ' min-h-[50px] resize-y'} defaultValue={detalhe.necessidades || ''} key={'nec' + detalhe.id}
                    onBlur={e => salvarCampoLead('necessidades', e.target.value || null)} />
                </div>
                <div>
                  <label className={labelCls}>Próximos passos</label>
                  <textarea className={inputCls + ' min-h-[50px] resize-y'} defaultValue={detalhe.proximos_passos || ''} key={'pxp' + detalhe.id}
                    onBlur={e => salvarCampoLead('proximos_passos', e.target.value || null)} />
                </div>
              </div>

              {(() => {
                const orcVinculado = orcamentos.find(o => o.crm_lead_id === detalhe.id)
                const validadeDias = orcVinculado?.validade_dias || 30
                const validoAte = detalhe.data_proposta_enviada
                  ? new Date(new Date(detalhe.data_proposta_enviada + 'T00:00:00').getTime() + validadeDias * 86400000).toLocaleDateString('pt-BR')
                  : null
                return (
                  <div className={cardCls + ' mb-4'}>
                    <div className="text-sm font-bold text-on-surface mb-3">💰 Proposta</div>
                    <div className="mb-3">
                      <label className={labelCls}>Orçamento vinculado</label>
                      <select className={inputCls} value={orcVinculado?.id || ''} onChange={e => vincularOrcamento(e.target.value)}>
                        <option value="">Nenhum vinculado</option>
                        {orcamentos.filter(o => !o.crm_lead_id || o.crm_lead_id === detalhe.id).map(o => (
                          <option key={o.id} value={o.id}>{o.codigo} — {o.cliente_nome} ({moeda(num(o.total_geral))})</option>
                        ))}
                      </select>
                    </div>
                    {orcVinculado && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                        <div className="bg-surface-container-low rounded-lg p-2.5"><div className="text-[10px] text-on-surface-variant mb-0.5">Valor</div><div className="text-sm font-bold text-primary">{moeda(num(orcVinculado.total_geral))}</div></div>
                        <div className="bg-surface-container-low rounded-lg p-2.5"><div className="text-[10px] text-on-surface-variant mb-0.5">Condições de pagamento</div><div className="text-sm text-on-surface">{orcVinculado.condicao_pagamento || '—'}</div></div>
                        <div className="bg-surface-container-low rounded-lg p-2.5"><div className="text-[10px] text-on-surface-variant mb-0.5">Válido até ({validadeDias}d)</div><div className="text-sm text-on-surface">{validoAte || '—'}</div></div>
                      </div>
                    )}
                    <div className="mb-3">
                      <label className={labelCls}>Produtos/serviços</label>
                      <textarea className={inputCls + ' min-h-[60px] resize-y'} defaultValue={detalhe.produtos_servicos || ''} key={'psv' + detalhe.id}
                        onBlur={e => salvarCampoLead('produtos_servicos', e.target.value || null)} />
                    </div>
                    <div>
                      <label className={labelCls}>Alerta de follow-up</label>
                      <input className={inputCls} type="date" value={detalhe.proximo_followup || ''} onChange={e => salvarFollowup(e.target.value)} />
                      <p className="text-[11px] text-on-surface-variant mt-1">Some no sininho de notificações quando a data chegar. Se deixar em branco, o sistema avisa sozinho 3 dias depois do envio sem retorno.</p>
                    </div>
                  </div>
                )
              })()}

              <div className="text-sm font-bold text-on-surface mb-3">🕐 Linha do tempo</div>
              <div className="flex gap-2 mb-4">
                <select className={inputCls + ' w-auto'} value={fAtividade.tipo} onChange={e => setFAtividade({ ...fAtividade, tipo: e.target.value })}>
                  {['ligacao', 'email', 'reuniao', 'visita', 'nota'].map(v => <option key={v} value={v}>{ATIVIDADE_NOME[v]}</option>)}
                </select>
                <input className={inputCls} placeholder="O que foi conversado..." value={fAtividade.descricao} onChange={e => setFAtividade({ ...fAtividade, descricao: e.target.value })} />
                <button className={btnPrimaryCls + ' whitespace-nowrap'} onClick={salvarNovaAtividade}>Registrar</button>
              </div>

              {atividades.length === 0 ? (
                <div className="text-center py-6 text-on-surface-variant text-sm">Nenhuma atividade registrada ainda</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {atividades.map(a => (
                    <div key={a.id} className="bg-surface-container-low border border-outline-variant rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <span className="text-xs font-semibold text-on-surface">{ATIVIDADE_NOME[a.tipo] || a.tipo}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-on-surface-variant">{new Date(a.created_at).toLocaleString('pt-BR')}</span>
                          {editandoAtividadeId !== a.id && (
                            <>
                              <button className="text-on-surface-variant hover:text-primary text-xs" title="Editar" onClick={() => iniciarEdicaoAtividade(a)}>✏️</button>
                              <button className="text-on-surface-variant hover:text-error text-xs" title="Excluir" onClick={() => excluirAtividade(a.id)}>×</button>
                            </>
                          )}
                        </div>
                      </div>
                      {editandoAtividadeId === a.id ? (
                        <div className="flex flex-col gap-2">
                          <textarea className={inputCls + ' min-h-[60px] resize-y text-sm'} autoFocus value={textoAtividadeEditando} onChange={e => setTextoAtividadeEditando(e.target.value)} />
                          <div className="flex gap-2 justify-end">
                            <button className={btnEditSmCls} onClick={() => setEditandoAtividadeId(null)}>Cancelar</button>
                            <button className={btnEditSmCls + ' text-primary'} onClick={() => salvarEdicaoAtividade(a.id)}>Salvar</button>
                          </div>
                        </div>
                      ) : (
                        a.descricao && <div className="text-sm text-on-surface-variant whitespace-pre-wrap">{a.descricao}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: informação extra ao mudar de etapa ───────────── */}
      {janela === 'extraEtapa' && detalhe && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1100] p-4" onClick={e => e.target === e.currentTarget && setJanela('detalhe')}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[440px]">
            {etapaAlvo === 'proposta_enviada' && (
              <>
                <div className="text-base font-bold text-on-surface mb-4">💰 Valor da proposta</div>
                <label className={labelCls}>Valor (R$) *</label>
                <input className={inputCls} type="number" value={fExtra.valor_proposta} onChange={e => setFExtra({ ...fExtra, valor_proposta: e.target.value })} autoFocus />
              </>
            )}
            {etapaAlvo === 'fechado_perdido' && (
              <>
                <div className="text-base font-bold text-on-surface mb-4">❌ Motivo da perda</div>
                <label className={labelCls}>Motivo *</label>
                <textarea className={inputCls + ' min-h-[80px] resize-y'} value={fExtra.motivo_perda} onChange={e => setFExtra({ ...fExtra, motivo_perda: e.target.value })} autoFocus />
              </>
            )}
            {etapaAlvo === 'visita_agendada' && (
              <>
                <div className="text-base font-bold text-on-surface mb-4">📅 Agendar visita técnica</div>
                <p className="text-[11px] text-on-surface-variant mb-3">Cria um compromisso na Agenda automaticamente.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Data *</label>
                    <input className={inputCls} type="date" value={fExtra.data_visita} onChange={e => setFExtra({ ...fExtra, data_visita: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Hora</label>
                    <input className={inputCls} type="time" value={fExtra.hora_visita} onChange={e => setFExtra({ ...fExtra, hora_visita: e.target.value })} />
                  </div>
                </div>
              </>
            )}
            <div className="flex gap-2 justify-end mt-5">
              <button className={btnSecondaryCls} onClick={() => setJanela('detalhe')}>Cancelar</button>
              <button className={btnPrimaryCls} onClick={confirmarExtraEtapa}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: confirmar criação de Cliente ao ganhar ───────── */}
      {janela === 'confirmarCliente' && detalhe && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1100] p-4" onClick={e => e.target === e.currentTarget && setJanela('detalhe')}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[440px]">
            <div className="text-base font-bold text-on-surface mb-2">🎉 Negócio fechado!</div>
            <p className="text-sm text-on-surface-variant mb-5">Criar (ou vincular, se já existir) o cadastro de Cliente para <strong>{detalhe.nome}</strong> agora?</p>
            <div className="flex gap-2 justify-end">
              <button className={btnSecondaryCls} onClick={() => confirmarCriarCliente(false)}>Agora não</button>
              <button className={btnPrimaryCls} onClick={() => confirmarCriarCliente(true)}>Criar Cliente</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Novo/Editar Cliente ──────────────────────────── */}
      {janela === 'clienteForm' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[560px] max-h-[92vh] overflow-y-auto custom-scrollbar">
            <div className="text-base font-bold text-on-surface mb-5">👥 {editandoCliente ? 'Editar Cliente' : 'Novo Cliente'}</div>

            <div className="mb-3.5">
              <label className={labelCls}>Nome *</label>
              <input className={inputCls} value={fCliente.nome} onChange={e => setFCliente({ ...fCliente, nome: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3.5">
              <div>
                <label className={labelCls}>Telefone</label>
                <input className={inputCls} value={fCliente.telefone} onChange={e => setFCliente({ ...fCliente, telefone: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>E-mail</label>
                <input className={inputCls} value={fCliente.email} onChange={e => setFCliente({ ...fCliente, email: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3.5">
              <div>
                <label className={labelCls}>Tipo</label>
                <select className={inputCls} value={fCliente.tipo} onChange={e => setFCliente({ ...fCliente, tipo: e.target.value })}>
                  <option value="pessoa_fisica">Pessoa Física</option>
                  <option value="pessoa_juridica">Pessoa Jurídica</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>CPF/CNPJ</label>
                <input className={inputCls} value={fCliente.cpf_cnpj} onChange={e => setFCliente({ ...fCliente, cpf_cnpj: e.target.value })} />
              </div>
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Endereço</label>
              <input className={inputCls} value={fCliente.endereco} onChange={e => setFCliente({ ...fCliente, endereco: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3.5">
              <div>
                <label className={labelCls}>Bairro</label>
                <input className={inputCls} value={fCliente.bairro} onChange={e => setFCliente({ ...fCliente, bairro: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Cidade</label>
                <input className={inputCls} value={fCliente.cidade} onChange={e => setFCliente({ ...fCliente, cidade: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>UF</label>
                <input className={inputCls} maxLength={2} value={fCliente.estado} onChange={e => setFCliente({ ...fCliente, estado: e.target.value.toUpperCase() })} />
              </div>
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Canal de origem</label>
              <select className={inputCls} value={fCliente.canal_origem} onChange={e => setFCliente({ ...fCliente, canal_origem: e.target.value })}>
                <option value="">—</option>
                {CANAL_OPCOES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="mb-5">
              <label className={labelCls}>Observações</label>
              <textarea className={inputCls + ' min-h-[70px] resize-y'} value={fCliente.observacao} onChange={e => setFCliente({ ...fCliente, observacao: e.target.value })} />
            </div>

            <div className="flex gap-2 justify-end">
              <button className={btnSecondaryCls} onClick={() => { setJanela(null); setEditandoCliente(null) }}>Cancelar</button>
              <button className={btnPrimaryCls} onClick={salvarCliente}>{editandoCliente ? 'Salvar' : 'Cadastrar Cliente'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Detalhe do Cliente ────────────────────────────── */}
      {janela === 'clienteDetalhe' && clienteDetalhe && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl w-full max-w-[640px] max-h-[92vh] overflow-y-auto custom-scrollbar p-7">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-lg font-bold text-on-surface">{clienteDetalhe.nome}</div>
                <div className="text-[12px] text-on-surface-variant flex items-center gap-3 mt-0.5 flex-wrap">
                  {clienteDetalhe.telefone && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">call</span>{clienteDetalhe.telefone}</span>}
                  {clienteDetalhe.email && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">mail</span>{clienteDetalhe.email}</span>}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button className={btnSecondaryCls} onClick={() => abrirEditarCliente(clienteDetalhe)}>✏️ Editar</button>
                <button className={btnDangerSmCls} onClick={() => excluirCliente(clienteDetalhe.id)}>Excluir</button>
                <button className="text-on-surface-variant hover:text-on-surface px-2" onClick={() => setJanela(null)}>✕</button>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-5">
              {fidelizadoEfetivo(clienteDetalhe) ? (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-tertiary/10 text-tertiary border-tertiary/20">⭐ Fidelizado</span>
              ) : (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-surface-variant text-on-surface-variant border-outline-variant">Não fidelizado</span>
              )}
              <button className={btnEditSmCls} onClick={() => alternarFidelizado(clienteDetalhe)}>{fidelizadoEfetivo(clienteDetalhe) ? 'Remover selo' : 'Marcar fidelizado'}</button>
              {clienteDetalhe.fidelizado_manual != null && <span className="text-[10px] text-on-surface-variant">(ajustado manualmente)</span>}
            </div>

            <div className="text-sm font-bold text-on-surface mb-3">Negócios</div>
            {negociosDoCliente(clienteDetalhe.id).length === 0 ? (
              <div className="text-center py-4 text-on-surface-variant text-sm">Nenhum lead vinculado a este cliente ainda</div>
            ) : (
              <div className="flex flex-col gap-2">
                {negociosDoCliente(clienteDetalhe.id).map(l => (
                  <div key={l.id} className="bg-surface-container-low border border-outline-variant rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-on-surface">{l.nome} <span className="text-on-surface-variant font-normal">· {l.codigo}</span></div>
                      <div className="text-[11px] text-on-surface-variant">{dataBR(l.created_at?.slice(0, 10))}{l.valor_proposta != null ? ' · ' + moeda(l.valor_proposta) : ''}</div>
                    </div>
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${ETAPA_BADGE[l.etapa]}`}>{ETAPA_NOME[l.etapa]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}
