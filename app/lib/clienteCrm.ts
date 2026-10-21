// Cadastro de cliente no CRM a partir de Orçamento, Levantamento e Obra novos.
//
// Ao criar um desses registros o usuário informa se o cliente é NOVO ou já da CARTEIRA:
//  • novo     → cadastra o cliente na Agenda de Clientes (tabela clientes) e abre um lead
//               (tipo "novo") no Pipeline;
//  • carteira → usa um cliente já cadastrado e abre um novo negócio (lead tipo "carteira")
//               vinculado a ele no Pipeline;
//  • lead     → (só no Orçamento) usa um lead que já está no Pipeline, sem criar nada.
// A etapa do lead depende de onde ele nasceu: levantamento = visita realizada, orçamento =
// qualificação (proposta ainda em preparo), obra = fechado ganho (contrato fechado).
const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
// Chave pública (anon): o acesso real é decidido pelo token do usuário, injetado em lib/authFetch.ts.
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON }

export type ModoCliente = 'novo' | 'carteira' | 'lead'
export type OrigemCrm = 'orcamento' | 'levantamento' | 'obra'

export interface ValorClienteCrm {
  modo: ModoCliente
  clienteId: string
  leadId: string
  telefone: string
  email: string
  canal: string
  canalOutro: string
  // Empresa: o cliente é uma pessoa jurídica com contatos; o contato escolhido/cadastrado aqui é o
  // "responsável" DESTE documento (proposta, levantamento, obra).
  tipoCliente: 'pessoa' | 'empresa'
  cnpj: string
  contatoId: string // contato já cadastrado da empresa (modo carteira)
  novoContato: boolean // modo carteira: cadastrar um novo contato na empresa
  contatoNome: string
  contatoCargo: string
  contatoTelefone: string
  contatoEmail: string
}

export const CANAIS_CRM = ['Indicação', 'Google Meu Negócio', 'Instagram', 'Site', 'Prospecção ativa', 'Outro']
export const CLIENTE_CRM_VAZIO: ValorClienteCrm = {
  modo: 'novo', clienteId: '', leadId: '', telefone: '', email: '', canal: 'Indicação', canalOutro: '',
  tipoCliente: 'pessoa', cnpj: '', contatoId: '', novoContato: false, contatoNome: '', contatoCargo: '', contatoTelefone: '', contatoEmail: '',
}

export const ETAPA_POR_ORIGEM: Record<OrigemCrm, string> = { levantamento: 'visita_realizada', orcamento: 'qualificacao', obra: 'fechado_ganho' }
export const NOME_ETAPA_CRM: Record<string, string> = {
  lead_novo: 'Lead Novo', qualificacao: 'Qualificação', visita_agendada: 'Visita Técnica Agendada', visita_realizada: 'Visita Realizada',
  proposta_enviada: 'Proposta Enviada', negociacao: 'Em Negociação', fechado_ganho: 'Fechado Ganho', fechado_perdido: 'Fechado Perdido', pos_venda: 'Pós Venda',
}

async function get(tabela: string, query = ''): Promise<any[]> {
  try {
    const r = await fetch(`${BASE}/${tabela}${query}`, { headers: H })
    const d = await r.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}
async function post(tabela: string, dados: object): Promise<any | null> {
  try {
    const r = await fetch(`${BASE}/${tabela}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(dados) })
    const d = await r.json()
    if (!r.ok) return null
    return Array.isArray(d) ? d[0] : d
  } catch { return null }
}
async function patch(tabela: string, id: string, dados: object): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/${tabela}?id=eq.${id}`, { method: 'PATCH', headers: H, body: JSON.stringify(dados) })
    return r.ok
  } catch { return false }
}

const soDigitos = (s?: string | null) => String(s || '').replace(/\D/g, '')

export async function listarClientesCarteira(): Promise<any[]> {
  return get('clientes', '?select=id,nome,email,telefone,endereco,bairro,cidade,estado,canal_origem,tipo,cpf_cnpj,razao_social&order=nome')
}

export async function listarContatosDoCliente(clienteId: string): Promise<any[]> {
  if (!clienteId) return []
  return get('cliente_contatos', `?cliente_id=eq.${clienteId}&select=id,nome,cargo,telefone,email,principal&order=principal.desc,nome`)
}

// Cria um contato na empresa; o primeiro contato da empresa vira o principal.
export async function criarContatoDoCliente(clienteId: string, c: { nome: string; cargo?: string; telefone?: string; email?: string }, principal?: boolean) {
  const existentes = await get('cliente_contatos', `?cliente_id=eq.${clienteId}&select=id&limit=1`)
  return post('cliente_contatos', {
    cliente_id: clienteId, nome: c.nome.trim(), cargo: c.cargo?.trim() || null, telefone: c.telefone?.trim() || null,
    email: c.email?.trim() || null, principal: principal ?? existentes.length === 0,
  })
}

async function gerarCodigoLead(): Promise<string> {
  const ano = new Date().getFullYear()
  const prefixo = `LEAD-${ano}-`
  const lista = await get('crm_leads', '?select=codigo')
  const maior = lista.reduce((m, l) => {
    if (!l.codigo?.startsWith(prefixo)) return m
    const n = parseInt(l.codigo.slice(prefixo.length), 10)
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return prefixo + String(maior + 1).padStart(3, '0')
}

// Mensagem de erro de preenchimento (ou null se está ok).
export function validarClienteCrm(v: ValorClienteCrm, nome: string): string | null {
  if (!nome.trim()) return 'Preencha o nome do cliente'
  if (v.modo === 'carteira' && !v.clienteId) return 'Selecione o cliente da carteira (ou troque para "Cliente novo")'
  if (v.modo === 'lead' && !v.leadId) return 'Selecione o lead do pipeline (ou troque para "Cliente novo")'
  if (v.modo === 'carteira' && v.novoContato && !v.contatoNome.trim()) return 'Informe o nome do novo contato da empresa'
  return null
}

// Cliente já cadastrado com o mesmo e-mail ou telefone (evita duplicar a agenda de clientes).
export async function encontrarClienteDuplicado(email: string, telefone: string, cnpj = ''): Promise<any | null> {
  const clientes = await get('clientes', '?select=id,nome,email,telefone,canal_origem,cpf_cnpj')
  const tel = soDigitos(telefone)
  const doc = soDigitos(cnpj)
  return clientes.find(c =>
    (doc.length >= 11 && soDigitos(c.cpf_cnpj) === doc) ||
    (email && c.email && c.email.trim().toLowerCase() === email.trim().toLowerCase()) ||
    (tel.length >= 8 && soDigitos(c.telefone).length >= 8 && soDigitos(c.telefone).endsWith(tel.slice(-8)))
  ) || null
}

export interface ContextoCrm {
  origem: OrigemCrm
  rotulo: string // ex.: "Orçamento ORC-2026-021"
  nome: string
  telefone?: string
  email?: string
  endereco?: string
  responsavelId?: string | null
}
export type ResultadoCrm =
  | { ok: true; leadId: string | null; clienteId: string | null; criouCliente: boolean; criouLead: boolean; nomeCliente: string | null; contatoId: string | null; contatoNome: string | null }
  | { ok: false; erro: string; duplicado?: any }

export async function registrarClienteNoCrm(v: ValorClienteCrm, ctx: ContextoCrm): Promise<ResultadoCrm> {
  // Lead que já está no pipeline: só vincula.
  if (v.modo === 'lead') {
    if (!v.leadId) return { ok: false, erro: 'Lead não selecionado' }
    const lead = (await get('crm_leads', `?id=eq.${v.leadId}&select=id,cliente_id`))[0]
    return { ok: true, leadId: v.leadId, clienteId: lead?.cliente_id || null, criouCliente: false, criouLead: false, nomeCliente: null, contatoId: null, contatoNome: null }
  }

  const telefone = (v.telefone || ctx.telefone || '').trim()
  const email = (v.email || ctx.email || '').trim()
  const etapa = ETAPA_POR_ORIGEM[ctx.origem]
  let clienteId = v.clienteId
  let criouCliente = false
  let canal = v.canal
  let canalOutro: string | null = v.canal === 'Outro' ? (v.canalOutro.trim() || null) : null
  let nomeLead = ctx.nome.trim()
  let telLead = telefone, emailLead = email
  let contatoId: string | null = null
  let contatoNome: string | null = null

  if (v.modo === 'carteira') {
    const cliente = (await get('clientes', `?id=eq.${clienteId}&select=id,nome,email,telefone,canal_origem,fidelizado_manual,tipo`))[0]
    if (!cliente) return { ok: false, erro: 'Cliente da carteira não encontrado' }
    nomeLead = cliente.nome
    telLead = cliente.telefone || telefone
    emailLead = cliente.email || email
    // Empresa: o responsável deste documento é um contato dela (existente ou recém-cadastrado)
    if (cliente.tipo === 'pessoa_juridica') {
      if (v.novoContato && v.contatoNome.trim()) {
        const novoC = await criarContatoDoCliente(clienteId, { nome: v.contatoNome, cargo: v.contatoCargo, telefone: v.contatoTelefone, email: v.contatoEmail })
        if (novoC?.id) { contatoId = novoC.id; contatoNome = novoC.nome }
      } else if (v.contatoId) {
        const c = (await get('cliente_contatos', `?id=eq.${v.contatoId}&select=id,nome`))[0]
        if (c) { contatoId = c.id; contatoNome = c.nome }
      }
      const cont = contatoId ? (await get('cliente_contatos', `?id=eq.${contatoId}&select=telefone,email`))[0] : null
      telLead = cont?.telefone || telLead
      emailLead = cont?.email || emailLead
    }
    if (cliente.canal_origem && CANAIS_CRM.includes(cliente.canal_origem)) { canal = cliente.canal_origem; canalOutro = null }
    else { canal = 'Outro'; canalOutro = cliente.canal_origem || 'Carteira' }
    // novo negócio FECHADO com quem já fechou antes → fidelizado (regra do CRM), salvo ajuste manual
    if (etapa === 'fechado_ganho' && cliente.fidelizado_manual == null) {
      const ganhos = await get('crm_leads', `?cliente_id=eq.${clienteId}&etapa=eq.fechado_ganho&select=id`)
      if (ganhos.length >= 1) await patch('clientes', clienteId, { fidelizado: true })
    }
  } else {
    const ehEmpresa = v.tipoCliente === 'empresa'
    // empresa: telefone/e-mail do cadastro vêm do contato (quando informado)
    const telCad = ehEmpresa ? (v.contatoTelefone.trim() || telefone) : telefone
    const emailCad = ehEmpresa ? (v.contatoEmail.trim() || email) : email
    const duplicado = await encontrarClienteDuplicado(emailCad, telCad, ehEmpresa ? v.cnpj : '')
    if (duplicado) return { ok: false, erro: 'duplicado', duplicado }
    const canalFinal = canal === 'Outro' ? (canalOutro || 'Outro') : canal
    const novo = await post('clientes', {
      nome: ctx.nome.trim(), email: emailCad || null, telefone: telCad || null, endereco: ctx.endereco?.trim() || null,
      cpf_cnpj: ehEmpresa ? (v.cnpj.trim() || null) : null,
      canal_origem: canalFinal, responsavel_id: ctx.responsavelId || null, tipo: ehEmpresa ? 'pessoa_juridica' : 'pessoa_fisica',
    })
    if (!novo?.id) return { ok: false, erro: 'Não foi possível cadastrar o cliente na agenda de clientes' }
    clienteId = novo.id
    criouCliente = true
    telLead = telCad; emailLead = emailCad
    if (ehEmpresa && v.contatoNome.trim()) {
      const c = await criarContatoDoCliente(clienteId, { nome: v.contatoNome, cargo: v.contatoCargo, telefone: v.contatoTelefone, email: v.contatoEmail }, true)
      if (c?.id) { contatoId = c.id; contatoNome = c.nome }
    }
  }

  const lead = await post('crm_leads', {
    codigo: await gerarCodigoLead(), nome: nomeLead, telefone: telLead || null, email: emailLead || null,
    canal, canal_outro: canalOutro, tipo: v.modo === 'carteira' ? 'carteira' : 'novo', etapa,
    cliente_id: clienteId, responsavel_id: ctx.responsavelId || null,
    observacao: `Criado a partir de ${ctx.rotulo}`, updated_at: new Date().toISOString(),
  })
  if (!lead?.id) return { ok: false, erro: 'O cliente foi cadastrado, mas não foi possível criar o lead no pipeline' }
  if (criouCliente) await patch('clientes', clienteId, { lead_id: lead.id })
  await post('crm_atividades', {
    lead_id: lead.id, tipo: 'nota',
    descricao: `Lead criado automaticamente a partir de ${ctx.rotulo} (${v.modo === 'carteira' ? 'cliente da carteira' : 'cliente novo'}).`,
  })
  return { ok: true, leadId: lead.id, clienteId, criouCliente, criouLead: true, nomeCliente: nomeLead, contatoId, contatoNome }
}

// Versão para telas: confirma duplicidade com o usuário e oferece criar sem CRM se algo falhar.
// Retorna null se o usuário cancelou; { leadId, clienteId } (podendo ser nulos) caso contrário.
export async function registrarClienteNoCrmInterativo(v: ValorClienteCrm, ctx: ContextoCrm): Promise<{ leadId: string | null; clienteId: string | null; nomeCliente: string | null; contatoId: string | null; contatoNome: string | null } | null> {
  let r = await registrarClienteNoCrm(v, ctx)
  if (!r.ok && r.duplicado) {
    const d = r.duplicado
    const usar = confirm(`Já existe na carteira um cliente com este e-mail/telefone:\n\n${d.nome}${d.telefone ? ' · ' + d.telefone : ''}${d.email ? ' · ' + d.email : ''}\n\nUsar o cadastro existente (cliente da carteira)?\n\nOK = usar o existente · Cancelar = voltar e corrigir`)
    if (!usar) return null
    r = await registrarClienteNoCrm({ ...v, modo: 'carteira', clienteId: d.id }, ctx)
  }
  if (!r.ok) {
    const seguir = confirm(`Não foi possível registrar o cliente no CRM: ${r.erro}.\n\nCriar ${ctx.rotulo.split(' ')[0].toLowerCase()} mesmo assim, sem CRM?`)
    return seguir ? { leadId: null, clienteId: null, nomeCliente: null, contatoId: null, contatoNome: v.tipoCliente === 'empresa' ? (v.contatoNome.trim() || null) : null } : null
  }
  return { leadId: r.leadId, clienteId: r.clienteId, nomeCliente: r.nomeCliente, contatoId: r.contatoId, contatoNome: r.contatoNome }
}

// Depois que o registro (levantamento/obra) existe, grava o vínculo no lead.
export async function vincularLeadAoRegistro(leadId: string | null, campos: { levantamento_id?: string; obra_id?: string }) {
  if (!leadId) return
  await patch('crm_leads', leadId, { ...campos, updated_at: new Date().toISOString() })
}

// Lead do pipeline ligado a um levantamento (para ligar o orçamento gerado dele ao mesmo lead).
export async function leadDoLevantamento(levantamentoId: string): Promise<string | null> {
  const l = await get('crm_leads', `?levantamento_id=eq.${levantamentoId}&select=id&limit=1`)
  return l[0]?.id || null
}

// ── Sincronização Pipeline → Agenda de Clientes ───────────────────────────────────────
// Todo lead do pipeline precisa ter um cadastro em Clientes. Para os que ainda não têm (criados
// direto no CRM, antes do cadastro automático etc.): procura o cliente por e-mail, telefone ou nome
// idêntico; se não achar, cria. Depois grava o vínculo (lead.cliente_id / cliente.lead_id).
// Idempotente e protegido contra execuções simultâneas (não duplica cadastros).
const normalizarNome = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
let sincronizando: Promise<number> | null = null

export function sincronizarLeadsComClientes(): Promise<number> {
  if (!sincronizando) sincronizando = executarSincronizacao().finally(() => { sincronizando = null })
  return sincronizando
}

async function executarSincronizacao(): Promise<number> {
  const leads = await get('crm_leads', '?cliente_id=is.null&select=id,nome,email,telefone,canal,canal_outro,responsavel_id&order=created_at')
  if (leads.length === 0) return 0
  const clientes = await get('clientes', '?select=id,nome,email,telefone,lead_id')
  let vinculados = 0
  for (const lead of leads) {
    const email = String(lead.email || '').trim().toLowerCase()
    const tel = soDigitos(lead.telefone)
    let cliente = (email && clientes.find(c => String(c.email || '').trim().toLowerCase() === email))
      || (tel.length >= 8 && clientes.find(c => soDigitos(c.telefone).length >= 8 && soDigitos(c.telefone).endsWith(tel.slice(-8))))
      || clientes.find(c => normalizarNome(c.nome) === normalizarNome(lead.nome))
      || null
    if (!cliente) {
      const canalOrigem = lead.canal === 'Outro' ? (lead.canal_outro || 'Outro') : lead.canal
      cliente = await post('clientes', {
        nome: lead.nome, email: lead.email || null, telefone: lead.telefone || null, canal_origem: canalOrigem || null,
        responsavel_id: lead.responsavel_id || null, tipo: 'pessoa_fisica', lead_id: lead.id,
      })
      if (!cliente?.id) continue
      clientes.push(cliente)
    } else if (!cliente.lead_id) {
      await patch('clientes', cliente.id, { lead_id: lead.id })
      cliente.lead_id = lead.id
    }
    if (await patch('crm_leads', lead.id, { cliente_id: cliente.id })) vinculados++
  }
  return vinculados
}
