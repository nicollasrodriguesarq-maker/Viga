'use client'
import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { obterMinhasPermissoes, temAcessoModulo } from '../lib/permissoes'

const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': 'Bearer ' + ANON }

const fmt = (v: number) => Number(v||0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtN = (v: number) => Number(v||0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

async function buscar(tabela: string, q = '') {
  try { const r = await fetch(BASE + '/' + tabela + q, { headers: H }); const d = await r.json(); return Array.isArray(d) ? d : [] } catch { return [] }
}
async function criar(tabela: string, dados: object) {
  try { const r = await fetch(BASE + '/' + tabela, { method: 'POST', headers: { ...H, 'Prefer': 'return=representation' }, body: JSON.stringify(dados) }); const d = await r.json(); return Array.isArray(d) ? d[0] : d } catch { return null }
}
async function editar(tabela: string, id: string, dados: object): Promise<boolean> {
  try { const r = await fetch(BASE + '/' + tabela + '?id=eq.' + id, { method: 'PATCH', headers: H, body: JSON.stringify(dados) }); return r.ok } catch { return false }
}
async function remover(tabela: string, id: string) {
  try { await fetch(BASE + '/' + tabela + '?id=eq.' + id, { method: 'DELETE', headers: H }) } catch {}
}

const STATUS_ORC: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  expirado: 'Expirado',
}
const STATUS_BADGE: Record<string, string> = {
  rascunho: 'bg-on-surface-variant/10 text-on-surface-variant border-on-surface-variant/20',
  enviado: 'bg-primary/10 text-primary border-primary/20',
  aprovado: 'bg-primary-container/10 text-primary-container border-primary-container/20',
  reprovado: 'bg-error/10 text-error border-error/20',
  expirado: 'bg-tertiary/10 text-tertiary border-tertiary/20',
}
const TIPOS_EXECUCAO = [{ v: 'obra', l: '🏗️ Execução de Obra' }, { v: 'projeto', l: '📐 Execução de Projeto' }]
const EXECUCAO_NOME: Record<string, string> = { obra: '🏗️ Obra', projeto: '📐 Projeto' }
const EXECUCAO_BADGE: Record<string, string> = {
  obra: 'bg-primary/10 text-primary border-primary/20',
  projeto: 'bg-secondary/10 text-secondary border-secondary/20',
}
const UNIDADES = ['m²', 'm³', 'ml', 'un', 'vb', 'cj', 'kg', 'hr']
const CATEGORIAS = ['Demolição e Remoção', 'Terraplanagem e Fundação', 'Estrutura', 'Alvenaria', 'Cobertura', 'Impermeabilização', 'Instalações Elétricas', 'Instalações Hidráulicas', 'Instalações de Gás', 'Climatização (AC)', 'Forro', 'Revestimento de Parede', 'Revestimento de Piso', 'Pintura', 'Esquadrias', 'Marcenaria', 'Serralheria', 'Vidraçaria', 'Mobiliário', 'Paisagismo', 'Limpeza Pós-Obra', 'Outros']

function ordemCategoria(categoria: string | null | undefined) {
  const idx = CATEGORIAS.indexOf(categoria || '')
  return idx === -1 ? CATEGORIAS.length : idx
}
function ordenarPorCategoria(itensList: any[]) {
  return [...itensList].sort((a, b) => ordemCategoria(a.categoria) - ordemCategoria(b.categoria))
}

function calcularValorUnitario(precoMaterial: number, precoMaoObra: number, lucroPct: number, impostoPct: number) {
  return (precoMaterial + precoMaoObra) * (1 + (lucroPct || 0) / 100) * (1 + (impostoPct || 0) / 100)
}
function calcularTotalItem(item: any) {
  const valorUnit = calcularValorUnitario(parseFloat(item.preco_material || 0), parseFloat(item.preco_mao_obra || 0), parseFloat(item.lucro_percentual || 0), parseFloat(item.imposto_percentual || 0))
  return valorUnit * parseFloat(item.quantidade || 1)
}
// Para documentos voltados ao cliente: material e mão de obra já com lucro/imposto embutidos,
// distribuídos proporcionalmente para que a soma bata exatamente com o total do item.
function valoresProposta(item: any) {
  const qtd = parseFloat(item.quantidade || 1)
  const mult = (1 + (parseFloat(item.lucro_percentual || 0)) / 100) * (1 + (parseFloat(item.imposto_percentual || 0)) / 100)
  return {
    material: parseFloat(item.preco_material || 0) * qtd * mult,
    maoObra: parseFloat(item.preco_mao_obra || 0) * qtd * mult,
  }
}

// classes reutilizáveis
const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const labelCls = 'text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5'
const btnPrimaryCls = 'bg-primary text-on-primary rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer'
const btnSecondaryCls = 'bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg px-4 py-2.5 text-sm hover:bg-surface-variant transition-all cursor-pointer'
const btnDangerSmCls = 'bg-error/10 border border-error/30 text-error rounded-md px-2.5 py-1 text-xs hover:bg-error/20 transition-all cursor-pointer'
const btnEditSmCls = 'bg-primary/10 border border-primary/30 text-primary rounded-md px-2.5 py-1 text-xs hover:bg-primary/20 transition-all cursor-pointer'
const cardCls = 'bg-surface-container border border-outline-variant rounded-xl p-5'
const sectionCls = 'bg-surface-container border border-outline-variant rounded-xl p-5 mb-4'
const tabActiveCls = 'px-4 py-2 rounded-lg border border-primary bg-primary/10 text-primary text-sm font-semibold cursor-pointer transition-all'
const tabInactiveCls = 'px-4 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface-variant text-sm font-semibold cursor-pointer hover:bg-surface-variant/50 transition-all'

export default function Orcamento() {
  const [orcamentos, setOrcamentos] = useState<any[]>([])
  const [ambientes, setAmbientes] = useState<any[]>([])
  const [itens, setItens] = useState<any[]>([])
  const [bancoItens, setBancoItens] = useState<any[]>([])
  const [obras, setObras] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [detalhe, setDetalhe] = useState<any>(null)
  const [abaDetalhe, setAbaDetalhe] = useState('itens')
  const [ambienteAtivo, setAmbienteAtivo] = useState<any>(null)
  const [janela, setJanela] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [buscaBanco, setBuscaBanco] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [filtroExecucao, setFiltroExecucao] = useState('todos')
  const [meuId, setMeuId] = useState('')
  const [souAdmin, setSouAdmin] = useState(false)
  const [solicitacoes, setSolicitacoes] = useState<any[]>([])

  const [telaBanco, setTelaBanco] = useState(false)
  const [abaBanco, setAbaBanco] = useState<'obras' | 'house_flipping'>('obras')
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false)

  const [fOrc, setFOrc] = useState({ codigo: '', cliente_nome: '', endereco: '', condicao_pagamento: '', validade_dias: '30', observacao: '', tipo_execucao: 'obra' })
  const [fItem, setFItem] = useState({ servico: '', descricao: '', categoria: '', banco_item_id: '', quantidade: '', unidade: 'm²', preco_material: '', preco_mao_obra: '', lucro_percentual: '20', imposto_percentual: '0' })
  const [editItem, setEditItem] = useState<any>(null)
  const [fBanco, setFBanco] = useState({ nome: '', unidade: 'm²', categoria: '', preco_material: '', preco_mao_obra: '', lucro_percentual: '20', imposto_percentual: '0', tempo_execucao: '', tipo_banco: 'obras' })
  const [composicao, setComposicao] = useState<any[]>([])
  const [fComp, setFComp] = useState({ material_nome: '', quantidade: '1', unidade: 'un', preco_unitario: '' })
  const [usarComposicao, setUsarComposicao] = useState(false)
  const [editBanco, setEditBanco] = useState<any>(null)
  const [fAmb, setFAmb] = useState('')
  const [fTransformar, setFTransformar] = useState({ data_inicio: '', dias_trabalho: 'seg_sex', periodo_trabalho: 'comercial' })

  useEffect(() => {
    if (!localStorage.getItem('viga_token')) { window.location.href = '/'; return }
    setUserEmail(localStorage.getItem('viga_email') || '')
    obterMinhasPermissoes().then(perm => {
      if (!temAcessoModulo(perm, 'orcamento')) { window.location.href = '/'; return }
      if (perm) { setMeuId(perm.id); setSouAdmin(perm.role === 'admin') }
    })
    carregar()
    const abrirId = localStorage.getItem('viga_orcamento_abrir')
    if (abrirId) {
      localStorage.removeItem('viga_orcamento_abrir')
      buscar('orcamentos', '?id=eq.' + abrirId).then(r => {
        if (r[0]) { setDetalhe(r[0]); setAmbienteAtivo(null); setAbaDetalhe('itens') }
      })
    }
  }, [])

  function sair() {
    localStorage.removeItem('viga_token')
    localStorage.removeItem('viga_refresh_token')
    localStorage.removeItem('viga_email')
    window.location.href = '/'
  }

  async function carregar() {
    setLoading(true)
    const [o, a, it, b, ob, s] = await Promise.all([
      buscar('orcamentos', '?order=created_at.desc'),
      buscar('orcamento_ambientes', '?order=ordem'),
      buscar('orcamento_itens', '?order=created_at'),
      buscar('banco_itens', '?order=nome'),
      buscar('obras', '?select=id,nome&order=nome'),
      buscar('orcamento_solicitacoes', '?order=created_at.desc'),
    ])
    setOrcamentos(o); setAmbientes(a); setItens(it); setBancoItens(b); setObras(ob); setSolicitacoes(s)
    setLoading(false)
  }

  function gerarCodigo(lista: any[]) {
    const a = new Date().getFullYear()
    const n = lista.filter(l => l.codigo?.startsWith('ORC-' + a)).length + 1
    return 'ORC-' + a + '-' + String(n).padStart(3, '0')
  }

  async function salvarOrcamento() {
    if (!fOrc.cliente_nome) return alert('Preencha o nome do cliente')
    const codigo = fOrc.codigo || gerarCodigo(orcamentos)
    const dados = {
      codigo,
      cliente_nome: fOrc.cliente_nome,
      endereco: fOrc.endereco,
      condicao_pagamento: fOrc.condicao_pagamento,
      validade_dias: parseInt(fOrc.validade_dias || '30'),
      observacao: fOrc.observacao,
      tipo_execucao: fOrc.tipo_execucao,
      status: 'rascunho',
      total_material: 0,
      total_mao_obra: 0,
      total_geral: 0,
      desconto: 0,
      criado_por: meuId || null,
    }
    const orc = await criar('orcamentos', dados)
    let orcId = orc?.id
    if (orcId) {
      await criar('orcamento_ambientes', { orcamento_id: orcId, nome: 'Geral', ordem: 0 })
    }
    setJanela(null)
    setFOrc({ codigo: '', cliente_nome: '', endereco: '', condicao_pagamento: '', validade_dias: '30', observacao: '', tipo_execucao: 'obra' })
    const [o, a, it, b] = await Promise.all([
      buscar('orcamentos', '?order=created_at.desc'),
      buscar('orcamento_ambientes', '?order=ordem'),
      buscar('orcamento_itens', '?order=created_at'),
      buscar('banco_itens', '?order=nome'),
    ])
    setOrcamentos(o); setAmbientes(a); setItens(it); setBancoItens(b); setLoading(false)
    if (orc?.id) {
      setDetalhe(orc); setAmbienteAtivo(null); setAbaDetalhe('itens')
    } else {
      const encontrado = o.find((x: any) => x.codigo === codigo)
      if (encontrado) {
        setDetalhe(encontrado); setAmbienteAtivo(null); setAbaDetalhe('itens')
      }
    }
  }

  // ── Permissão de edição ──────────────────────────────────────
  function solicitacoesDoOrcamento(orcId: string) {
    return solicitacoes.filter(s => s.orcamento_id === orcId)
  }
  function podeEditarOrcamento(orc: any) {
    if (!meuId || souAdmin || orc.criado_por == null || orc.criado_por === meuId) return true
    return solicitacoesDoOrcamento(orc.id).some(s => s.solicitante_id === meuId && s.status === 'aprovado')
  }
  async function solicitarPermissao() {
    if (!detalhe || !meuId) return
    const jaTemPedido = solicitacoesDoOrcamento(detalhe.id).some(s => s.solicitante_id === meuId && s.status !== 'negado')
    if (jaTemPedido) return alert('Você já tem uma solicitação pendente ou aprovada para este orçamento.')
    await criar('orcamento_solicitacoes', {
      orcamento_id: detalhe.id,
      solicitante_id: meuId,
      solicitante_nome: userEmail.split('@')[0],
      status: 'pendente',
    })
    alert('Solicitação enviada! O criador ou um admin vai aprovar.')
    carregar()
  }
  async function responderSolicitacao(id: string, status: 'aprovado' | 'negado') {
    await editar('orcamento_solicitacoes', id, { status, respondido_em: new Date().toISOString() })
    carregar()
  }
  async function excluirOrcamento(orc: any) {
    if (!confirm(`Excluir o orçamento ${orc.codigo} (${orc.cliente_nome})? Esta ação não pode ser desfeita.`)) return
    await remover('orcamentos', orc.id)
    carregar()
  }

  async function salvarItem() {
    if (!fItem.servico || !ambienteAtivo) return alert('Preencha o serviço')
    const mat = parseFloat(fItem.preco_material || '0')
    const mao = parseFloat(fItem.preco_mao_obra || '0')
    const qtd = parseFloat(fItem.quantidade || '1')
    const lucro = parseFloat(fItem.lucro_percentual || '0')
    const imposto = parseFloat(fItem.imposto_percentual || '0')
    const total = calcularValorUnitario(mat, mao, lucro, imposto) * qtd
    const dados = {
      orcamento_id: detalhe.id,
      ambiente_id: ambienteAtivo.id,
      servico: fItem.servico,
      descricao: fItem.descricao,
      quantidade: qtd,
      unidade: fItem.unidade,
      preco_material: mat,
      preco_mao_obra: mao,
      lucro_percentual: lucro,
      imposto_percentual: imposto,
      total_item: total,
      banco_item_id: fItem.banco_item_id || null,
      categoria: fItem.categoria || null,
    }
    if (editItem) { await editar('orcamento_itens', editItem.id, dados) }
    else {
      await criar('orcamento_itens', dados)
      const existe = bancoItens.find(b => b.nome.toLowerCase() === fItem.servico.toLowerCase())
      if (!existe && fItem.servico) {
        await criar('banco_itens', { nome: fItem.servico, unidade: fItem.unidade, preco_material: mat, preco_mao_obra: mao, lucro_percentual: lucro, imposto_percentual: imposto, categoria: fItem.categoria || '' })
      }
    }
    await atualizarTotais(detalhe.id)
    if (detalhe.obra_id) await sincronizarServicosObra(detalhe.id, detalhe.obra_id)
    setJanela(null); setEditItem(null)
    setFItem({ servico: '', descricao: '', categoria: '', banco_item_id: '', quantidade: '', unidade: 'm²', preco_material: '', preco_mao_obra: '', lucro_percentual: '20', imposto_percentual: '0' })
    carregar()
  }

  async function atualizarTotais(orcId: string) {
    const todosItens = await buscar('orcamento_itens', '?orcamento_id=eq.' + orcId)
    const tMat = todosItens.reduce((a: number, i: any) => a + parseFloat(i.preco_material||0) * parseFloat(i.quantidade||1), 0)
    const tMao = todosItens.reduce((a: number, i: any) => a + parseFloat(i.preco_mao_obra||0) * parseFloat(i.quantidade||1), 0)
    const tGeral = todosItens.reduce((a: number, i: any) => a + calcularTotalItem(i), 0)
    await editar('orcamentos', orcId, { total_material: tMat, total_mao_obra: tMao, total_geral: tGeral })
  }

  // Agrupa orcamento_itens por nome exato de servico e sincroniza obra_servicos.
  // Nunca apaga linha orfa: pode ter valor_realizado/status preenchido manualmente depois.
  async function sincronizarServicosObra(orcamentoId: string, obraId: string) {
    const itensOrc = await buscar('orcamento_itens', '?orcamento_id=eq.' + orcamentoId)
    const grupos = new Map<string, number>()
    for (const item of itensOrc) {
      if (!item.servico) continue
      grupos.set(item.servico, (grupos.get(item.servico) || 0) + calcularTotalItem(item))
    }
    const servicosExistentes = await buscar('obra_servicos', '?obra_id=eq.' + obraId)
    let maxOrdem = Math.max(0, ...servicosExistentes.map((s: any) => s.ordem || 0))
    let criouNovo = false
    for (const [nome, valorPrevisto] of grupos) {
      const existente = servicosExistentes.find((s: any) => s.nome === nome)
      if (existente) await editar('obra_servicos', existente.id, { valor_previsto: valorPrevisto })
      else {
        maxOrdem += 1
        await criar('obra_servicos', { obra_id: obraId, nome, valor_previsto: valorPrevisto, valor_realizado: 0, status: 'pendente', observacao: '', ordem: maxOrdem })
        criouNovo = true
      }
    }
    if (criouNovo) await distribuirCronogramaObra(obraId)
  }

  // Preenche automaticamente as datas do cronograma a partir do periodo da obra (mesma logica
  // usada em app/obras/page.tsx) — so cria etapa pra servico que ainda nao tem uma.
  async function distribuirCronogramaObra(obraId: string) {
    const obraRows = await buscar('obras', '?id=eq.' + obraId)
    const obra = obraRows[0]
    if (!obra?.data_inicio || !obra?.data_previsao) return
    const svsObra = (await buscar('obra_servicos', '?obra_id=eq.' + obraId))
      .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
    if (svsObra.length === 0) return
    const etapasAtuais = await buscar('cronograma_etapas', '?obra_id=eq.' + obraId)
    const inicio = new Date(obra.data_inicio + 'T00:00:00')
    const fim = new Date(obra.data_previsao + 'T00:00:00')
    const totalDias = Math.max(Math.round((fim.getTime() - inicio.getTime()) / 86400000), svsObra.length)
    const fatia = totalDias / svsObra.length
    for (let i = 0; i < svsObra.length; i++) {
      const s = svsObra[i]
      if (etapasAtuais.find((e: any) => e.servico_id === s.id)) continue
      const dIni = new Date(inicio.getTime() + Math.round(i * fatia) * 86400000)
      const dFim = new Date(inicio.getTime() + (Math.round((i + 1) * fatia) - 1) * 86400000)
      await criar('cronograma_etapas', {
        obra_id: obraId,
        servico_id: s.id,
        data_inicio_prevista: dIni.toISOString().slice(0, 10),
        data_fim_prevista: dFim.toISOString().slice(0, 10),
        status: 'pendente',
      })
    }
  }

  function somaComposicao() {
    return composicao.reduce((a, c) => a + parseFloat(c.quantidade || 0) * parseFloat(c.preco_unitario || 0), 0)
  }
  function adicionarComposicao() {
    if (!fComp.material_nome) return
    setComposicao([...composicao, { ...fComp, id: 'tmp_' + Date.now() }])
    setFComp({ material_nome: '', quantidade: '1', unidade: 'un', preco_unitario: '' })
  }
  function removerComposicao(idx: number) {
    setComposicao(composicao.filter((_, i) => i !== idx))
  }
  function abrirNovoBanco() {
    setEditBanco(null)
    setFBanco({ nome: '', unidade: 'm²', categoria: '', preco_material: '', preco_mao_obra: '', lucro_percentual: '20', imposto_percentual: '0', tempo_execucao: '', tipo_banco: abaBanco })
    setComposicao([]); setUsarComposicao(false)
    setFComp({ material_nome: '', quantidade: '1', unidade: 'un', preco_unitario: '' })
    setJanela('banco')
  }
  async function abrirEditarBanco(item: any) {
    setEditBanco(item)
    setFBanco({ nome: item.nome, unidade: item.unidade, categoria: item.categoria || '', preco_material: String(item.preco_material||0), preco_mao_obra: String(item.preco_mao_obra||0), lucro_percentual: String(item.lucro_percentual||0), imposto_percentual: String(item.imposto_percentual||0), tempo_execucao: item.tempo_execucao != null ? String(item.tempo_execucao) : '', tipo_banco: item.tipo_banco || 'obras' })
    const comp = await buscar('banco_itens_composicao', '?banco_item_id=eq.' + item.id + '&order=created_at')
    setComposicao(comp)
    setUsarComposicao(comp.length > 0)
    setFComp({ material_nome: '', quantidade: '1', unidade: 'un', preco_unitario: '' })
    setJanela('banco')
  }

  async function salvarBancoItem() {
    if (!fBanco.nome) return alert('Preencha o nome')
    if (!fBanco.categoria) return alert('Selecione a categoria')
    const precoMaterial = usarComposicao ? somaComposicao() : parseFloat(fBanco.preco_material || '0')
    const dados = {
      nome: fBanco.nome,
      unidade: fBanco.unidade,
      categoria: fBanco.categoria,
      preco_material: precoMaterial,
      preco_mao_obra: parseFloat(fBanco.preco_mao_obra || '0'),
      lucro_percentual: parseFloat(fBanco.lucro_percentual || '0'),
      imposto_percentual: parseFloat(fBanco.imposto_percentual || '0'),
      tempo_execucao: fBanco.tempo_execucao ? parseFloat(fBanco.tempo_execucao) : null,
      tipo_banco: fBanco.tipo_banco,
    }
    let bancoId = editBanco?.id
    if (editBanco) { await editar('banco_itens', editBanco.id, dados) }
    else { const novo = await criar('banco_itens', dados); bancoId = novo?.id }
    if (bancoId) {
      const existentes = await buscar('banco_itens_composicao', '?banco_item_id=eq.' + bancoId)
      for (const e of existentes) await remover('banco_itens_composicao', e.id)
      if (usarComposicao) {
        for (const c of composicao) {
          await criar('banco_itens_composicao', { banco_item_id: bancoId, material_nome: c.material_nome, quantidade: parseFloat(c.quantidade||0), unidade: c.unidade, preco_unitario: parseFloat(c.preco_unitario||0) })
        }
      }
    }
    setJanela(null); setEditBanco(null); setComposicao([]); setUsarComposicao(false)
    setFBanco({ nome: '', unidade: 'm²', categoria: '', preco_material: '', preco_mao_obra: '', lucro_percentual: '20', imposto_percentual: '0', tempo_execucao: '', tipo_banco: abaBanco })
    carregar()
  }

  async function salvarAmbiente() {
    if (!fAmb.trim() || !detalhe) return alert('Preencha o nome do ambiente')
    const ordem = ambientes.filter(a => a.orcamento_id === detalhe.id).length
    await criar('orcamento_ambientes', { orcamento_id: detalhe.id, nome: fAmb.trim(), ordem })
    setJanela(null); setFAmb(''); carregar()
  }

  async function vincularObra(obraId: string) {
    await editar('orcamentos', detalhe.id, { obra_id: obraId || null })
    setDetalhe({ ...detalhe, obra_id: obraId || null })
    if (obraId) {
      const itensOrc = itens.filter(i => i.orcamento_id === detalhe.id)
      const etapasExistentes = await buscar('cronograma_etapas', `?obra_id=eq.${obraId}`)
      const itemIdsComEtapa = new Set(etapasExistentes.map((e: any) => e.orcamento_item_id))
      const novasEtapas = itensOrc.filter(i => !itemIdsComEtapa.has(i.id))
      for (const item of novasEtapas) {
        await criar('cronograma_etapas', { orcamento_item_id: item.id, obra_id: obraId, status: 'pendente' })
      }
    }
    carregar()
  }

  // ── Transformar orçamento aprovado em Obra + cronograma automático ──
  function tempoExecucaoItem(item: any): number {
    const bi = item.banco_item_id ? bancoItens.find(b => b.id === item.banco_item_id) : null
    const t = bi?.tempo_execucao ? parseFloat(bi.tempo_execucao) : 0
    return t > 0 ? t : 1
  }
  function diaValido(d: Date, pattern: string): boolean {
    const dow = d.getDay()
    if (pattern === 'todos_dias') return true
    if (pattern === 'seg_sab') return dow >= 1 && dow <= 6
    return dow >= 1 && dow <= 5
  }
  function proximoDiaUtil(d: Date, pattern: string): Date {
    const nd = new Date(d)
    while (!diaValido(nd, pattern)) nd.setDate(nd.getDate() + 1)
    return nd
  }
  function somarDiasUteis(inicio: Date, dias: number, pattern: string): Date {
    let atual = proximoDiaUtil(inicio, pattern)
    let restante = Math.max(1, dias) - 1
    while (restante > 0) {
      atual = new Date(atual)
      atual.setDate(atual.getDate() + 1)
      atual = proximoDiaUtil(atual, pattern)
      restante--
    }
    return atual
  }
  function formatarDataISO(d: Date): string {
    return d.toISOString().slice(0, 10)
  }

  async function transformarEmObra() {
    if (!detalhe || !fTransformar.data_inicio) return alert('Selecione a data de início')
    const anoAtual = new Date().getFullYear()
    const todasObras = await buscar('obras', '?select=codigo')
    const qtd = todasObras.filter((o: any) => o.codigo?.startsWith('OBR-' + anoAtual)).length
    const codigo = 'OBR-' + anoAtual + '-' + String(qtd + 1).padStart(3, '0')

    const itensOrc = ordenarPorCategoria(itens.filter(i => i.orcamento_id === detalhe.id))
    const totalGeral = itensOrc.reduce((a, i) => a + calcularTotalItem(i), 0)
    const descontoPct = parseFloat(detalhe.desconto_percentual || 0)
    const valorContrato = totalGeral * (1 - descontoPct / 100)

    let cursor = new Date(fTransformar.data_inicio + 'T00:00:00')
    let dataFimFinal = cursor
    const etapasCalculadas: { item: any, inicio: Date, fim: Date }[] = []
    for (const item of itensOrc) {
      const inicio = proximoDiaUtil(cursor, fTransformar.dias_trabalho)
      const dur = tempoExecucaoItem(item)
      const fim = somarDiasUteis(inicio, dur, fTransformar.dias_trabalho)
      etapasCalculadas.push({ item, inicio, fim })
      dataFimFinal = fim
      const prox = new Date(fim); prox.setDate(prox.getDate() + 1)
      cursor = prox
    }

    const novaObra = await criar('obras', {
      codigo,
      nome: detalhe.cliente_nome + (detalhe.endereco ? ' — ' + detalhe.endereco : ''),
      tipo: 'Reforma',
      cliente: detalhe.cliente_nome,
      endereco: detalhe.endereco || '',
      responsavel: '',
      status: 'em_execucao',
      data_inicio: fTransformar.data_inicio,
      data_previsao: itensOrc.length > 0 ? formatarDataISO(dataFimFinal) : fTransformar.data_inicio,
      valor_contrato: valorContrato,
      dias_trabalho: fTransformar.dias_trabalho,
      periodo_trabalho: fTransformar.periodo_trabalho,
    })
    if (!novaObra?.id) return alert('Falha ao criar a obra. Tente novamente.')

    await editar('orcamentos', detalhe.id, { obra_id: novaObra.id })
    setDetalhe({ ...detalhe, obra_id: novaObra.id })

    for (const { item, inicio, fim } of etapasCalculadas) {
      await criar('cronograma_etapas', {
        orcamento_item_id: item.id,
        obra_id: novaObra.id,
        status: 'pendente',
        data_inicio_prevista: formatarDataISO(inicio),
        data_fim_prevista: formatarDataISO(fim),
      })
    }

    await sincronizarServicosObra(detalhe.id, novaObra.id)

    setJanela(null)
    alert('Obra ' + codigo + ' criada com sucesso! Cronograma gerado automaticamente com ' + etapasCalculadas.length + ' etapa(s).')
    carregar()
  }

  function verObraVinculada() {
    if (!detalhe?.obra_id) return
    localStorage.setItem('viga_obra_abrir', detalhe.obra_id)
    window.location.href = '/obras'
  }

  async function usarItemBanco(item: any) {
    if (!ambienteAtivo) return alert('Selecione um ambiente primeiro')
    setFItem({ servico: item.nome, descricao: '', categoria: item.categoria || '', banco_item_id: item.id, quantidade: '1', unidade: item.unidade, preco_material: String(item.preco_material), preco_mao_obra: String(item.preco_mao_obra), lucro_percentual: String(item.lucro_percentual||0), imposto_percentual: String(item.imposto_percentual||0) })
    setJanela('item')
  }

  function gerarPDF() {
    if (!detalhe) return
    const ambsOrc = ambientes.filter(a => a.orcamento_id === detalhe.id).sort((a, b) => a.ordem - b.ordem)
    const itensDoOrc = itens.filter(i => i.orcamento_id === detalhe.id)
    const totalMat = itensDoOrc.reduce((a, i) => a + valoresProposta(i).material, 0)
    const totalMao = itensDoOrc.reduce((a, i) => a + valoresProposta(i).maoObra, 0)
    const totalGeral = itensDoOrc.reduce((a, i) => a + calcularTotalItem(i), 0)
    const descontoPct = parseFloat(detalhe.desconto_percentual || 0)
    const desconto = totalGeral * descontoPct / 100
    const totalFinal = totalGeral - desconto

    const ambContent = ambsOrc.map(amb => {
      const itensAmb = ordenarPorCategoria(itens.filter(i => i.ambiente_id === amb.id))
      if (itensAmb.length === 0) return ''
      const matAmb = itensAmb.reduce((a, i) => a + valoresProposta(i).material, 0)
      const maoAmb = itensAmb.reduce((a, i) => a + valoresProposta(i).maoObra, 0)
      const totalAmb = itensAmb.reduce((a, i) => a + calcularTotalItem(i), 0)
      const rows = itensAmb.map(item => {
        const { material: mat, maoObra: mao } = valoresProposta(item)
        return `<tr>
          <td style="padding:8px 10px;border-bottom:1px solid #eee">${item.servico}${item.descricao ? '<br><small style="color:#666">' + item.descricao + '</small>' : ''}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${fmtN(parseFloat(item.quantidade||1))} ${item.unidade}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${fmt(mat)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${fmt(mao)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${fmt(calcularTotalItem(item))}</td>
        </tr>`
      }).join('')
      return `
        <div style="margin-bottom:24px">
          <div style="background:#1B3A5C;color:white;padding:10px 14px;border-radius:6px;font-weight:700;margin-bottom:8px;font-size:14px">🏠 ${amb.nome}</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#f5f5f5">
                <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #ddd">Serviço</th>
                <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #ddd">Qtd</th>
                <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #ddd">Material</th>
                <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #ddd">Mão de Obra</th>
                <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #ddd">Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr style="background:#f9f9f9">
                <td colspan="2" style="padding:8px 10px;font-weight:600;color:#1B3A5C">Subtotal ${amb.nome}</td>
                <td style="padding:8px 10px;text-align:right;font-weight:600">${fmt(matAmb)}</td>
                <td style="padding:8px 10px;text-align:right;font-weight:600">${fmt(maoAmb)}</td>
                <td style="padding:8px 10px;text-align:right;font-weight:700;color:#1B3A5C">${fmt(totalAmb)}</td>
              </tr>
            </tfoot>
          </table>
        </div>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Proposta ${detalhe.codigo} — Inverso</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: Arial, sans-serif; color: #333; font-size: 13px; }
      @media print { body { -webkit-print-color-adjust: exact; } }
    </style></head><body>
    <div style="max-width:800px;margin:0 auto;padding:40px 30px">
      <!-- CABEÇALHO -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #1B3A5C">
        <div>
          <div style="font-size:32px;font-weight:900;color:#1B3A5C;letter-spacing:-1px">INVERSO</div>
          <div style="font-size:12px;color:#666;margin-top:2px">Construção e Reforma</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:20px;font-weight:700;color:#1B3A5C">${detalhe.codigo}</div>
          <div style="font-size:12px;color:#666;margin-top:4px">Data: ${new Date().toLocaleDateString('pt-BR')}</div>
          <div style="font-size:12px;color:#666">Validade: ${detalhe.validade_dias || 30} dias</div>
        </div>
      </div>

      <!-- CLIENTE -->
      <div style="background:#f0f4f8;border-radius:8px;padding:16px 20px;margin-bottom:28px">
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Proposta para</div>
        <div style="font-size:18px;font-weight:700;color:#1B3A5C">${detalhe.cliente_nome}</div>
        ${detalhe.endereco ? '<div style="font-size:13px;color:#555;margin-top:4px">📍 ' + detalhe.endereco + '</div>' : ''}
      </div>

      <!-- ITENS POR AMBIENTE -->
      <div style="margin-bottom:28px">${ambContent}</div>

      <!-- TOTAIS -->
      <div style="border:2px solid #1B3A5C;border-radius:8px;overflow:hidden;margin-bottom:24px">
        <div style="background:#1B3A5C;color:white;padding:12px 16px;font-weight:700;font-size:14px">Resumo Financeiro</div>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:10px 16px">Total Material</td><td style="padding:10px 16px;text-align:right;font-weight:600">${fmt(totalMat)}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding:10px 16px">Total Mão de Obra</td><td style="padding:10px 16px;text-align:right;font-weight:600">${fmt(totalMao)}</td></tr>
          ${desconto > 0 ? '<tr><td style="padding:10px 16px">Desconto (' + fmtN(descontoPct) + '%)</td><td style="padding:10px 16px;text-align:right;color:#e74c3c;font-weight:600">- ' + fmt(desconto) + '</td></tr>' : ''}
          <tr style="background:#1B3A5C;color:white">
            <td style="padding:14px 16px;font-size:16px;font-weight:700">TOTAL GERAL</td>
            <td style="padding:14px 16px;text-align:right;font-size:20px;font-weight:900">${fmt(totalFinal)}</td>
          </tr>
        </table>
      </div>

      <!-- CONDIÇÕES -->
      ${detalhe.condicao_pagamento ? `<div style="margin-bottom:24px;padding:14px 16px;background:#f0f4f8;border-radius:8px">
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Forma de Pagamento</div>
        <div style="font-weight:600;color:#1B3A5C">${detalhe.condicao_pagamento}</div>
      </div>` : ''}

      <!-- OBSERVAÇÕES -->
      ${detalhe.observacao ? `<div style="margin-bottom:24px;padding:14px 16px;border:1px solid #ddd;border-radius:8px">
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Observações</div>
        <div style="color:#555">${detalhe.observacao}</div>
      </div>` : ''}

      <!-- RODAPÉ -->
      <div style="margin-top:32px;padding-top:20px;border-top:1px solid #ddd;text-align:center;color:#999;font-size:11px">
        <div>Esta proposta é válida por ${detalhe.validade_dias || 30} dias a partir da data de emissão.</div>
        <div style="margin-top:4px">INVERSO Construção e Reforma — contato@inversoconstrucao.com.br</div>
      </div>
    </div>
    <script>window.onload = () => { window.print() }</script>
    </body></html>`

    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  const lista = orcamentos.filter(o =>
    (filtro === 'todos' || o.status === filtro) &&
    (filtroExecucao === 'todos' || (o.tipo_execucao || 'obra') === filtroExecucao) &&
    (!busca || [o.cliente_nome, o.codigo, o.endereco].some(v => v?.toLowerCase().includes(busca.toLowerCase())))
  )

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-primary text-lg">Carregando orçamentos...</div>
    </div>
  )

  const modalBancoJsx = janela === 'banco' && (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
      <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[640px] max-h-[92vh] overflow-y-auto">
        <div className="text-base font-bold text-on-surface mb-5">📦 {editBanco ? 'Editar Item do Banco' : 'Novo Item no Banco'}</div>
        <div className="mb-3.5">
          <label className={labelCls}>Nome do Serviço/Item *</label>
          <input className={inputCls} placeholder="Ex: Pintura interna, Instalação elétrica..." value={fBanco.nome} onChange={e => setFBanco({ ...fBanco, nome: e.target.value })} />
        </div>
        <div className="mb-3.5">
          <label className={labelCls}>Base de Preços *</label>
          <select className={inputCls} value={fBanco.tipo_banco} onChange={e => setFBanco({ ...fBanco, tipo_banco: e.target.value })}>
            <option value="obras">🏗️ Obras</option>
            <option value="house_flipping">🏠 House Flipping</option>
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3.5">
          <div>
            <label className={labelCls}>Unidade</label>
            <select className={inputCls} value={fBanco.unidade} onChange={e => setFBanco({ ...fBanco, unidade: e.target.value })}>
              {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Categoria *</label>
            <select className={inputCls} value={fBanco.categoria} onChange={e => setFBanco({ ...fBanco, categoria: e.target.value })}>
              <option value="">Selecione</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Tempo Execução (dias)</label>
            <input className={inputCls} type="number" placeholder="0" value={fBanco.tempo_execucao} onChange={e => setFBanco({ ...fBanco, tempo_execucao: e.target.value })} />
          </div>
        </div>

        <div className="flex items-center justify-between mb-2 mt-4">
          <label className={labelCls + ' mb-0'}>Custo de Material</label>
          <div className="flex gap-1 bg-surface-container-low rounded-lg p-1">
            <button type="button" className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${!usarComposicao ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`} onClick={() => setUsarComposicao(false)}>Valor direto</button>
            <button type="button" className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${usarComposicao ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`} onClick={() => setUsarComposicao(true)}>Composição</button>
          </div>
        </div>

        {!usarComposicao ? (
          <div className="mb-3.5">
            <input className={inputCls + ' text-primary'} type="number" placeholder="0,00" value={fBanco.preco_material} onChange={e => setFBanco({ ...fBanco, preco_material: e.target.value })} />
          </div>
        ) : (
          <div className="bg-surface-container-low rounded-lg p-3.5 mb-3.5">
            <div className="text-[11px] text-on-surface-variant mb-2">Ex: 1m² de forro drywall — tabica 1m, perfil U de 3m, tirante de 30cm...</div>
            {composicao.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-3">
                {composicao.map((c, idx) => (
                  <div key={c.id || idx} className="flex justify-between items-center bg-surface-container px-3 py-2 rounded-md text-xs">
                    <span className="text-on-surface">{c.material_nome} — {fmtN(parseFloat(c.quantidade||0))} {c.unidade} × {fmt(parseFloat(c.preco_unitario||0))}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-primary">{fmt(parseFloat(c.quantidade||0) * parseFloat(c.preco_unitario||0))}</span>
                      <button className={btnDangerSmCls} onClick={() => removerComposicao(idx)}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-[1fr_70px_70px_90px_auto] gap-1.5 items-end">
              <div>
                <label className={labelCls}>Material</label>
                <input className={inputCls} placeholder="Ex: Tabica 1m" value={fComp.material_nome} onChange={e => setFComp({ ...fComp, material_nome: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Qtd</label>
                <input className={inputCls} type="number" value={fComp.quantidade} onChange={e => setFComp({ ...fComp, quantidade: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Un</label>
                <input className={inputCls} placeholder="un" value={fComp.unidade} onChange={e => setFComp({ ...fComp, unidade: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Preço unit.</label>
                <input className={inputCls} type="number" placeholder="0,00" value={fComp.preco_unitario} onChange={e => setFComp({ ...fComp, preco_unitario: e.target.value })} onKeyDown={e => e.key === 'Enter' && adicionarComposicao()} />
              </div>
              <button className={btnSecondaryCls} onClick={adicionarComposicao}>+</button>
            </div>
            <div className="text-right text-sm font-bold text-primary mt-3">Total material: {fmt(somaComposicao())}</div>
          </div>
        )}

        <div className="mb-5">
          <label className={labelCls}>Custo de Mão de Obra (R$ / unidade)</label>
          <input className={inputCls + ' text-secondary'} type="number" placeholder="0,00" value={fBanco.preco_mao_obra} onChange={e => setFBanco({ ...fBanco, preco_mao_obra: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3.5">
          <div>
            <label className={labelCls}>Lucro (%)</label>
            <input className={inputCls} type="number" placeholder="20" value={fBanco.lucro_percentual} onChange={e => setFBanco({ ...fBanco, lucro_percentual: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Imposto (%)</label>
            <input className={inputCls} type="number" placeholder="0" value={fBanco.imposto_percentual} onChange={e => setFBanco({ ...fBanco, imposto_percentual: e.target.value })} />
          </div>
        </div>
        <div className="bg-surface-container-low rounded-lg p-3.5 mb-5">
          <div className="text-[11px] text-on-surface-variant mb-1">VALOR FINAL POR {fBanco.unidade}</div>
          <div className="text-xl font-black text-tertiary">{fmt(calcularValorUnitario(usarComposicao ? somaComposicao() : parseFloat(fBanco.preco_material||'0'), parseFloat(fBanco.preco_mao_obra||'0'), parseFloat(fBanco.lucro_percentual||'0'), parseFloat(fBanco.imposto_percentual||'0')))}</div>
        </div>
        <div className="flex gap-2 justify-end">
          <button className={btnSecondaryCls} onClick={() => { setJanela(null); setEditBanco(null) }}>Cancelar</button>
          <button className={btnPrimaryCls} onClick={salvarBancoItem}>Salvar no Banco</button>
        </div>
      </div>
    </div>
  )

  // ── DETALHE ────────────────────────────────────────────────
  if (detalhe) {
    const ambsOrc = ambientes.filter(a => a.orcamento_id === detalhe.id).sort((a, b) => a.ordem - b.ordem)
    const itensOrc = itens.filter(i => i.orcamento_id === detalhe.id)
    const totalMat = itensOrc.reduce((a, i) => a + parseFloat(i.preco_material||0) * parseFloat(i.quantidade||1), 0)
    const totalMao = itensOrc.reduce((a, i) => a + parseFloat(i.preco_mao_obra||0) * parseFloat(i.quantidade||1), 0)
    const totalGeral = itensOrc.reduce((a, i) => a + calcularTotalItem(i), 0)
    const descontoPct = parseFloat(detalhe.desconto_percentual || 0)
    const desconto = totalGeral * descontoPct / 100
    const totalFinal = totalGeral - desconto
    const bancoBusca = bancoItens.filter(b => !buscaBanco || b.nome.toLowerCase().includes(buscaBanco.toLowerCase()))
    const podeEditar = podeEditarOrcamento(detalhe)
    const souCriadorOuAdmin = souAdmin || detalhe.criado_por === meuId
    const pendentesDoOrcamento = souCriadorOuAdmin ? solicitacoesDoOrcamento(detalhe.id).filter(s => s.status === 'pendente') : []
    const jaTemSolicitacaoMinha = !!meuId && solicitacoesDoOrcamento(detalhe.id).some(s => s.solicitante_id === meuId && s.status !== 'negado')

    return (
      <Layout userEmail={userEmail} onLogout={sair}>
        {pendentesDoOrcamento.length > 0 && (
          <div className="bg-tertiary/10 border border-tertiary/30 rounded-xl p-4 mb-lg">
            <div className="text-sm font-bold text-tertiary mb-2">🔔 Solicitações de edição pendentes</div>
            {pendentesDoOrcamento.map(s => (
              <div key={s.id} className="flex justify-between items-center py-1.5">
                <span className="text-sm text-on-surface">{s.solicitante_nome || 'Alguém'} pediu para editar este orçamento</span>
                <div className="flex gap-2">
                  <button className={btnEditSmCls} onClick={() => responderSolicitacao(s.id, 'aprovado')}>Aprovar</button>
                  <button className={btnDangerSmCls} onClick={() => responderSolicitacao(s.id, 'negado')}>Negar</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-lg">
          <div>
            <button onClick={() => { setDetalhe(null); setAmbienteAtivo(null) }} className={btnSecondaryCls + ' mb-3'}>← Voltar</button>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-body-sm text-on-surface-variant font-semibold">{detalhe.codigo}</span>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${EXECUCAO_BADGE[detalhe.tipo_execucao || 'obra']}`}>{EXECUCAO_NOME[detalhe.tipo_execucao || 'obra']}</span>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${STATUS_BADGE[detalhe.status] || STATUS_BADGE.rascunho}`}>{STATUS_ORC[detalhe.status] || detalhe.status}</span>
              {!podeEditar && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-on-surface-variant/10 text-on-surface-variant border-on-surface-variant/20">🔒 Somente leitura</span>}
            </div>
            <h1 className="text-headline-md font-headline text-on-surface">{detalhe.cliente_nome}</h1>
            {detalhe.endereco && <p className="text-body-sm text-on-surface-variant">📍 {detalhe.endereco}</p>}
          </div>
          <div className="flex gap-2 flex-wrap items-start">
            {podeEditar ? (
              <select value={detalhe.status}
                onChange={async e => {
                  const novoStatus = e.target.value
                  const ok = await editar('orcamentos', detalhe.id, { status: novoStatus })
                  if (!ok) return alert('Não foi possível salvar o status. Tente novamente.')
                  setDetalhe({ ...detalhe, status: novoStatus }); carregar()
                }}
                className={inputCls + ' w-auto text-xs py-1.5'}>
                {Object.entries(STATUS_ORC).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
            ) : !jaTemSolicitacaoMinha ? (
              <button className={btnSecondaryCls} onClick={solicitarPermissao}>🔒 Solicitar permissão de edição</button>
            ) : (
              <span className="text-xs text-on-surface-variant px-3 py-2">Solicitação enviada, aguardando aprovação</span>
            )}
            <button className="bg-primary-container text-on-primary-container rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer" onClick={gerarPDF}>🖨️ Gerar Proposta PDF</button>
            {detalhe.status === 'aprovado' && podeEditar && (
              detalhe.obra_id ? (
                <button className="bg-secondary text-on-secondary rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer" onClick={verObraVinculada}>🔗 Ver Obra Vinculada</button>
              ) : (
                <button className="bg-tertiary text-on-tertiary rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer" onClick={() => { setFTransformar({ data_inicio: '', dias_trabalho: 'seg_sex', periodo_trabalho: 'comercial' }); setJanela('transformarObra') }}>🏗️ Transformar em Obra</button>
              )
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-lg">
          {[
            ['Total Material', fmt(totalMat), 'text-primary'],
            ['Total Mão de Obra', fmt(totalMao), 'text-secondary'],
            ['Subtotal', fmt(totalGeral), 'text-tertiary'],
            ['Desconto', fmt(desconto), 'text-error'],
            ['TOTAL FINAL', fmt(totalFinal), 'text-primary-container'],
          ].map(([l, v, c]) => (
            <div key={l} className={`bg-surface-container-high border rounded-lg p-3 ${l === 'TOTAL FINAL' ? 'border-primary-container/50' : 'border-outline-variant'}`}>
              <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-2">{l}</div>
              <div className={`font-bold ${c} ${l === 'TOTAL FINAL' ? 'text-xl' : 'text-base'}`}>{v}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-lg flex-wrap">
          <button className={abaDetalhe === 'itens' ? tabActiveCls : tabInactiveCls} onClick={() => setAbaDetalhe('itens')}>📋 Itens por Ambiente</button>
          <button className={abaDetalhe === 'banco' ? tabActiveCls : tabInactiveCls} onClick={() => setAbaDetalhe('banco')}>📦 Banco de Itens</button>
          <button className={abaDetalhe === 'config' ? tabActiveCls : tabInactiveCls} onClick={() => setAbaDetalhe('config')}>⚙️ Configurações</button>
        </div>

        {abaDetalhe === 'itens' && (
          <div className={sectionCls}>
            <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
              <div className="text-sm font-bold text-on-surface">📋 Itens por Ambiente</div>
              <div className="flex gap-2">
                {podeEditar && <button className={btnSecondaryCls} onClick={() => { setFAmb(''); setJanela('ambiente') }}>+ Ambiente</button>}
                {podeEditar && ambienteAtivo && <button className={btnPrimaryCls} onClick={() => { setFItem({ servico: '', descricao: '', categoria: '', banco_item_id: '', quantidade: '1', unidade: 'm²', preco_material: '', preco_mao_obra: '', lucro_percentual: '20', imposto_percentual: '0' }); setEditItem(null); setMostrarSugestoes(false); setJanela('item') }}>+ Item</button>}
              </div>
            </div>

            {ambsOrc.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">🏠</div>
                <div className="text-on-surface-variant text-sm mb-4">Nenhum ambiente. Crie ambientes para organizar os itens.</div>
                {podeEditar && <button className={btnPrimaryCls} onClick={() => { setFAmb(''); setJanela('ambiente') }}>+ Criar Ambiente</button>}
              </div>
            ) : (
              <>
                {!ambienteAtivo && <div className="px-3.5 py-2.5 bg-primary/5 rounded-lg text-body-sm text-primary mb-4">👆 Clique em um ambiente para selecioná-lo e adicionar itens</div>}
                {ambsOrc.map(amb => {
                  const itensAmb = ordenarPorCategoria(itens.filter(i => i.ambiente_id === amb.id))
                  const isAtivo = ambienteAtivo?.id === amb.id
                  const matAmb = itensAmb.reduce((a, i) => a + parseFloat(i.preco_material||0) * parseFloat(i.quantidade||1), 0)
                  const maoAmb = itensAmb.reduce((a, i) => a + parseFloat(i.preco_mao_obra||0) * parseFloat(i.quantidade||1), 0)
                  const totalAmb = itensAmb.reduce((a, i) => a + calcularTotalItem(i), 0)
                  return (
                    <div key={amb.id} className={`rounded-xl mb-3 overflow-hidden border ${isAtivo ? 'border-primary' : 'border-outline-variant'}`}>
                      <div className={`flex justify-between items-center px-4 py-3 cursor-pointer ${isAtivo ? 'bg-primary/10' : 'bg-surface-container'}`}
                        onClick={() => setAmbienteAtivo(isAtivo ? null : amb)}>
                        <div className="flex items-center gap-2.5">
                          <span>🏠</span>
                          <div>
                            <div className={`font-bold text-sm ${isAtivo ? 'text-primary' : 'text-on-surface'}`}>{amb.nome}</div>
                            <div className="text-[11px] text-on-surface-variant">{itensAmb.length} item(ns) · {fmt(totalAmb)}</div>
                          </div>
                        </div>
                        <div className="flex gap-2 items-center">
                          <div className="text-right text-xs">
                            <div className="text-primary font-semibold">Mat: {fmt(matAmb)}</div>
                            <div className="text-secondary font-semibold">M.O: {fmt(maoAmb)}</div>
                          </div>
                          <span className="text-[11px] text-on-surface-variant">{isAtivo ? '▲' : '▼'}</span>
                          {podeEditar && <button className={btnDangerSmCls} onClick={e => { e.stopPropagation(); if (confirm('Excluir ambiente e itens?')) remover('orcamento_ambientes', amb.id).then(carregar) }}>×</button>}
                        </div>
                      </div>
                      {isAtivo && (
                        <div className="p-4">
                          {itensAmb.length === 0 ? (
                            <div className="text-center py-6 text-on-surface-variant text-sm">
                              Nenhum item. Clique em <strong>"+ Item"</strong> ou use o <strong>Banco de Itens</strong>.
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse text-sm">
                                <thead>
                                  <tr className="border-b border-outline-variant">
                                    {['Serviço', 'Qtd', 'Un', 'Material', 'Mão de Obra', 'Total', ''].map(h => (
                                      <th key={h} className="text-left px-2.5 py-2 text-[10px] text-on-surface-variant uppercase bg-surface-container-high whitespace-nowrap">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {itensAmb.map(item => {
                                    const mat = parseFloat(item.preco_material||0) * parseFloat(item.quantidade||1)
                                    const mao = parseFloat(item.preco_mao_obra||0) * parseFloat(item.quantidade||1)
                                    return (
                                      <tr key={item.id} className="border-b border-outline-variant hover:bg-surface-variant/20">
                                        <td className="px-2.5 py-2.5">
                                          <div className="font-semibold text-on-surface">{item.servico}</div>
                                          {item.descricao && <div className="text-[11px] text-on-surface-variant">{item.descricao}</div>}
                                        </td>
                                        <td className="px-2.5 py-2.5 text-on-surface">{fmtN(parseFloat(item.quantidade||1))}</td>
                                        <td className="px-2.5 py-2.5 text-on-surface-variant text-xs">{item.unidade}</td>
                                        <td className="px-2.5 py-2.5 text-primary font-semibold">{fmt(mat)}</td>
                                        <td className="px-2.5 py-2.5 text-secondary font-semibold">{fmt(mao)}</td>
                                        <td className="px-2.5 py-2.5 font-bold text-tertiary">{fmt(calcularTotalItem(item))}</td>
                                        <td className="px-2.5 py-2.5">
                                          {podeEditar && (
                                            <div className="flex gap-1">
                                              <button className={btnEditSmCls} onClick={() => {
                                                setFItem({ servico: item.servico, descricao: item.descricao||'', categoria: item.categoria || '', banco_item_id: item.banco_item_id || '', quantidade: String(item.quantidade||1), unidade: item.unidade, preco_material: String(item.preco_material||0), preco_mao_obra: String(item.preco_mao_obra||0), lucro_percentual: String(item.lucro_percentual||0), imposto_percentual: String(item.imposto_percentual||0) })
                                                setEditItem(item); setMostrarSugestoes(false); setJanela('item')
                                              }}>✏️</button>
                                              <button className={btnDangerSmCls} onClick={async () => { await remover('orcamento_itens', item.id); await atualizarTotais(detalhe.id); if (detalhe.obra_id) await sincronizarServicosObra(detalhe.id, detalhe.obra_id); carregar() }}>×</button>
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-surface-container-low">
                                    <td colSpan={3} className="px-2.5 py-2.5 font-bold text-on-surface">Subtotal {amb.nome}</td>
                                    <td className="px-2.5 py-2.5 text-primary font-bold">{fmt(matAmb)}</td>
                                    <td className="px-2.5 py-2.5 text-secondary font-bold">{fmt(maoAmb)}</td>
                                    <td className="px-2.5 py-2.5 text-tertiary font-black">{fmt(totalAmb)}</td>
                                    <td></td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div className="p-4 bg-surface-container-low rounded-lg mt-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div><div className="text-[10px] text-on-surface-variant">TOTAL MATERIAL</div><div className="text-lg font-bold text-primary">{fmt(totalMat)}</div></div>
                    <div><div className="text-[10px] text-on-surface-variant">TOTAL MÃO DE OBRA</div><div className="text-lg font-bold text-secondary">{fmt(totalMao)}</div></div>
                    <div><div className="text-[10px] text-on-surface-variant">DESCONTO (%)</div>
                      <div className="flex items-center gap-1.5">
                        <input type="number" step="0.1" placeholder="0" value={detalhe.desconto_percentual || ''} disabled={!podeEditar}
                          onChange={async e => { const v = parseFloat(e.target.value||'0'); await editar('orcamentos', detalhe.id, { desconto_percentual: v }); setDetalhe({ ...detalhe, desconto_percentual: v }) }}
                          className={inputCls + ' mt-1 text-base font-bold text-error w-20 disabled:opacity-50'} />
                        <span className="text-[11px] text-error font-semibold mt-1">- {fmt(desconto)}</span>
                      </div>
                    </div>
                    <div><div className="text-[10px] text-on-surface-variant">TOTAL FINAL</div><div className="text-xl font-black text-primary-container">{fmt(totalFinal)}</div></div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {abaDetalhe === 'banco' && (
          <div className={sectionCls}>
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <div>
                <div className="text-sm font-bold text-on-surface">📦 Banco de Itens</div>
                <div className="text-[11px] text-on-surface-variant mt-0.5">Clique em um item para adicionar ao ambiente selecionado</div>
              </div>
              <button className={btnPrimaryCls} onClick={abrirNovoBanco}>+ Novo Item</button>
            </div>
            {!ambienteAtivo && <div className="px-3.5 py-2.5 bg-tertiary/5 rounded-lg text-body-sm text-tertiary mb-4">⚠️ Selecione um ambiente na aba "Itens por Ambiente" para poder adicionar itens do banco</div>}
            <input placeholder="🔍 Buscar item..." value={buscaBanco} onChange={e => setBuscaBanco(e.target.value)} className={inputCls + ' mb-4'} />
            {bancoBusca.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant">
                {bancoItens.length === 0 ? 'Banco vazio — adicione itens para reutilizar em futuros orçamentos' : 'Nenhum resultado'}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {bancoBusca.map(item => {
                  const valorUnit = calcularValorUnitario(parseFloat(item.preco_material||0), parseFloat(item.preco_mao_obra||0), parseFloat(item.lucro_percentual||0), parseFloat(item.imposto_percentual||0))
                  return (
                  <div key={item.id} className="flex justify-between items-center px-3.5 py-3 bg-surface-container-low rounded-lg border border-outline-variant">
                    <div>
                      <div className="font-semibold text-on-surface">{item.nome}</div>
                      <div className="text-[11px] text-on-surface-variant mt-0.5">
                        Mat: {fmt(item.preco_material)} · M.O: {fmt(item.preco_mao_obra)} · Lucro {fmtN(item.lucro_percentual||0)}% · Imp {fmtN(item.imposto_percentual||0)}%
                        {item.categoria && <span className="ml-2 text-primary">{item.categoria}</span>}
                      </div>
                      <div className="text-[11px] font-bold text-tertiary mt-0.5">Valor final: {fmt(valorUnit)} / {item.unidade}</div>
                    </div>
                    <div className="flex gap-1.5 items-center">
                      {podeEditar && ambienteAtivo && <button className={btnPrimaryCls} onClick={() => usarItemBanco(item)}>+ Usar</button>}
                      <button className={btnEditSmCls} onClick={() => abrirEditarBanco(item)}>✏️</button>
                      <button className={btnDangerSmCls} onClick={() => { if (confirm('Excluir do banco?')) remover('banco_itens', item.id).then(carregar) }}>×</button>
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {abaDetalhe === 'config' && (
          <div className={sectionCls}>
            <div className="text-sm font-bold text-on-surface mb-5">⚙️ Configurações do Orçamento</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
              <div>
                <label className={labelCls}>Cliente</label>
                <input className={inputCls + ' disabled:opacity-50'} disabled={!podeEditar} value={detalhe.cliente_nome} onChange={e => setDetalhe({ ...detalhe, cliente_nome: e.target.value })} onBlur={() => editar('orcamentos', detalhe.id, { cliente_nome: detalhe.cliente_nome })} />
              </div>
              <div>
                <label className={labelCls}>Validade (dias)</label>
                <input className={inputCls + ' disabled:opacity-50'} disabled={!podeEditar} type="number" value={detalhe.validade_dias || 30} onChange={e => setDetalhe({ ...detalhe, validade_dias: e.target.value })} onBlur={() => editar('orcamentos', detalhe.id, { validade_dias: detalhe.validade_dias })} />
              </div>
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Endereço</label>
              <input className={inputCls + ' disabled:opacity-50'} disabled={!podeEditar} value={detalhe.endereco || ''} onChange={e => setDetalhe({ ...detalhe, endereco: e.target.value })} onBlur={() => editar('orcamentos', detalhe.id, { endereco: detalhe.endereco })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
              <div>
                <label className={labelCls}>Obra Vinculada</label>
                <select className={inputCls + ' disabled:opacity-50'} disabled={!podeEditar} value={detalhe.obra_id || ''} onChange={e => vincularObra(e.target.value)}>
                  <option value="">Nenhuma / prospecção</option>
                  {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
                {detalhe.obra_id && <div className="text-[11px] text-primary mt-1">✓ Etapas de cronograma criadas em Obras</div>}
              </div>
              <div>
                <label className={labelCls}>Retenção de Garantia (%)</label>
                <input className={inputCls + ' disabled:opacity-50'} disabled={!podeEditar} type="number" step="0.1" placeholder="0" value={detalhe.retencao_percentual != null ? detalhe.retencao_percentual * 100 : ''}
                  onChange={e => setDetalhe({ ...detalhe, retencao_percentual: parseFloat(e.target.value || '0') / 100 })}
                  onBlur={() => editar('orcamentos', detalhe.id, { retencao_percentual: detalhe.retencao_percentual || 0 })} />
              </div>
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Forma de Pagamento</label>
              <textarea className={inputCls + ' min-h-[70px] resize-y disabled:opacity-50'} disabled={!podeEditar} placeholder="Ex: 40% na assinatura do contrato, 30% no meio da obra, 30% na entrega." value={detalhe.condicao_pagamento || ''} onChange={e => setDetalhe({ ...detalhe, condicao_pagamento: e.target.value })} onBlur={() => editar('orcamentos', detalhe.id, { condicao_pagamento: detalhe.condicao_pagamento })} />
            </div>
            <div className="mb-5">
              <label className={labelCls}>Observações (aparece na proposta)</label>
              <textarea className={inputCls + ' min-h-[80px] resize-y disabled:opacity-50'} disabled={!podeEditar} value={detalhe.observacao || ''} onChange={e => setDetalhe({ ...detalhe, observacao: e.target.value })} onBlur={() => editar('orcamentos', detalhe.id, { observacao: detalhe.observacao })} placeholder="Ex: Serviço com garantia de 1 ano. Materiais de primeira linha." />
            </div>
            <button className="w-full bg-primary-container text-on-primary-container rounded-lg py-3 text-sm font-bold hover:opacity-90 transition-all cursor-pointer" onClick={gerarPDF}>🖨️ Gerar Proposta em PDF</button>
          </div>
        )}

        {janela === 'item' && (() => {
          const sugestoesFiltradas = fItem.servico.trim().length > 0 && !fItem.banco_item_id
            ? bancoItens.filter(b => b.nome.toLowerCase().includes(fItem.servico.toLowerCase())).slice(0, 6)
            : []
          function selecionarSugestao(item: any) {
            setFItem({ ...fItem, servico: item.nome, categoria: item.categoria || '', banco_item_id: item.id, unidade: item.unidade, preco_material: String(item.preco_material||0), preco_mao_obra: String(item.preco_mao_obra||0), lucro_percentual: String(item.lucro_percentual||0), imposto_percentual: String(item.imposto_percentual||0) })
            setMostrarSugestoes(false)
          }
          return (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[580px] max-h-[92vh] overflow-y-auto">
              <div className="text-base font-bold text-on-surface mb-1.5">{editItem ? '✏️ Editar Item' : '➕ Novo Item'}</div>
              <div className="text-body-sm text-primary mb-5">Ambiente: {ambienteAtivo?.nome}</div>
              <div className="mb-3.5 relative">
                <label className={labelCls}>Serviço *</label>
                <input
                  className={inputCls}
                  placeholder="Digite para buscar no banco de itens ou criar um novo..."
                  value={fItem.servico}
                  onChange={e => { setFItem({ ...fItem, servico: e.target.value, banco_item_id: '' }); setMostrarSugestoes(true) }}
                  onFocus={() => setMostrarSugestoes(true)}
                  onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
                />
                {mostrarSugestoes && sugestoesFiltradas.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-surface-container-high border border-outline-variant rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {sugestoesFiltradas.map(s => (
                      <div key={s.id} className="px-3.5 py-2.5 hover:bg-primary/10 cursor-pointer border-b border-outline-variant last:border-0" onMouseDown={() => selecionarSugestao(s)}>
                        <div className="font-semibold text-sm text-on-surface">{s.nome}</div>
                        <div className="text-[11px] text-on-surface-variant">{s.categoria || 'sem categoria'} · {fmt(calcularValorUnitario(parseFloat(s.preco_material||0), parseFloat(s.preco_mao_obra||0), parseFloat(s.lucro_percentual||0), parseFloat(s.imposto_percentual||0)))} / {s.unidade}</div>
                      </div>
                    ))}
                  </div>
                )}
                {fItem.banco_item_id && <div className="text-[11px] text-primary mt-1">✓ Vinculado ao banco de itens</div>}
              </div>
              <div className="mb-3.5">
                <label className={labelCls}>Categoria {fItem.banco_item_id ? '(via banco de itens)' : ''}</label>
                <select className={inputCls} value={fItem.categoria} disabled={!!fItem.banco_item_id} onChange={e => setFItem({ ...fItem, categoria: e.target.value })}>
                  <option value="">Selecione</option>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="mb-3.5">
                <label className={labelCls}>Descrição</label>
                <input className={inputCls} placeholder="Ex: Tinta acrílica 2 demãos" value={fItem.descricao} onChange={e => setFItem({ ...fItem, descricao: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3.5">
                <div>
                  <label className={labelCls}>Quantidade</label>
                  <input className={inputCls} type="number" placeholder="1" value={fItem.quantidade} onChange={e => setFItem({ ...fItem, quantidade: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Unidade</label>
                  <select className={inputCls} value={fItem.unidade} onChange={e => setFItem({ ...fItem, unidade: e.target.value })}>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3.5">
                <div>
                  <label className={labelCls}>Preço Material (R$ / unidade)</label>
                  <input className={inputCls + ' text-primary'} type="number" placeholder="0,00" value={fItem.preco_material} onChange={e => setFItem({ ...fItem, preco_material: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Preço Mão de Obra (R$ / unidade)</label>
                  <input className={inputCls + ' text-secondary'} type="number" placeholder="0,00" value={fItem.preco_mao_obra} onChange={e => setFItem({ ...fItem, preco_mao_obra: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3.5">
                <div>
                  <label className={labelCls}>Lucro (%)</label>
                  <input className={inputCls} type="number" placeholder="20" value={fItem.lucro_percentual} onChange={e => setFItem({ ...fItem, lucro_percentual: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Imposto (%)</label>
                  <input className={inputCls} type="number" placeholder="0" value={fItem.imposto_percentual} onChange={e => setFItem({ ...fItem, imposto_percentual: e.target.value })} />
                </div>
              </div>
              {(fItem.quantidade && (fItem.preco_material || fItem.preco_mao_obra)) ? (
                <div className="bg-surface-container-low rounded-lg p-3.5 mb-4">
                  <div className="text-[11px] text-on-surface-variant mb-2">PREVIEW DO TOTAL</div>
                  <div className="flex gap-5 flex-wrap">
                    <div><div className="text-[10px] text-on-surface-variant">MATERIAL</div><div className="font-bold text-primary">{fmt(parseFloat(fItem.preco_material||'0') * parseFloat(fItem.quantidade||'1'))}</div></div>
                    <div><div className="text-[10px] text-on-surface-variant">MÃO DE OBRA</div><div className="font-bold text-secondary">{fmt(parseFloat(fItem.preco_mao_obra||'0') * parseFloat(fItem.quantidade||'1'))}</div></div>
                    <div><div className="text-[10px] text-on-surface-variant">VALOR UNITÁRIO</div><div className="font-bold text-on-surface">{fmt(calcularValorUnitario(parseFloat(fItem.preco_material||'0'), parseFloat(fItem.preco_mao_obra||'0'), parseFloat(fItem.lucro_percentual||'0'), parseFloat(fItem.imposto_percentual||'0')))}</div></div>
                    <div><div className="text-[10px] text-on-surface-variant">TOTAL</div><div className="font-black text-tertiary text-base">{fmt(calcularValorUnitario(parseFloat(fItem.preco_material||'0'), parseFloat(fItem.preco_mao_obra||'0'), parseFloat(fItem.lucro_percentual||'0'), parseFloat(fItem.imposto_percentual||'0')) * parseFloat(fItem.quantidade||'1'))}</div></div>
                  </div>
                </div>
              ) : null}
              <div className="flex gap-2 justify-end">
                <button className={btnSecondaryCls} onClick={() => { setJanela(null); setEditItem(null) }}>Cancelar</button>
                <button className={btnPrimaryCls} onClick={salvarItem}>{editItem ? 'Salvar' : 'Adicionar Item'}</button>
              </div>
            </div>
          </div>
          )
        })()}

        {janela === 'ambiente' && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[400px]">
              <div className="text-base font-bold text-on-surface mb-5">🏠 Novo Ambiente</div>
              <div className="mb-5">
                <label className={labelCls}>Nome do Ambiente</label>
                <input className={inputCls} placeholder="Ex: Sala de Estar, Cozinha..." value={fAmb} onChange={e => setFAmb(e.target.value)} onKeyDown={e => e.key === 'Enter' && salvarAmbiente()} />
              </div>
              <div className="flex gap-2 justify-end">
                <button className={btnSecondaryCls} onClick={() => setJanela(null)}>Cancelar</button>
                <button className={btnPrimaryCls} onClick={salvarAmbiente}>Criar Ambiente</button>
              </div>
            </div>
          </div>
        )}

        {janela === 'transformarObra' && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[480px]">
              <div className="text-base font-bold text-on-surface mb-1.5">🏗️ Transformar em Obra</div>
              <div className="text-body-sm text-on-surface-variant mb-5">O cronograma será gerado automaticamente a partir do tempo de execução de cada item, na ordem das etapas.</div>
              <div className="mb-3.5">
                <label className={labelCls}>Data de Início *</label>
                <input className={inputCls} type="date" value={fTransformar.data_inicio} onChange={e => setFTransformar({ ...fTransformar, data_inicio: e.target.value })} />
              </div>
              <div className="mb-3.5">
                <label className={labelCls}>Dias de Trabalho</label>
                <select className={inputCls} value={fTransformar.dias_trabalho} onChange={e => setFTransformar({ ...fTransformar, dias_trabalho: e.target.value })}>
                  <option value="seg_sex">Segunda a Sexta</option>
                  <option value="seg_sab">Segunda a Sábado</option>
                  <option value="todos_dias">Todos os dias (inclusive domingo)</option>
                </select>
              </div>
              <div className="mb-5">
                <label className={labelCls}>Período</label>
                <select className={inputCls} value={fTransformar.periodo_trabalho} onChange={e => setFTransformar({ ...fTransformar, periodo_trabalho: e.target.value })}>
                  <option value="comercial">Comercial</option>
                  <option value="noturno">Noturno</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <button className={btnSecondaryCls} onClick={() => setJanela(null)}>Cancelar</button>
                <button className={btnPrimaryCls} onClick={transformarEmObra}>Gerar Obra e Cronograma</button>
              </div>
            </div>
          </div>
        )}

        {modalBancoJsx}
      </Layout>
    )
  }

  // ── BANCO DE ITENS (tela global) ───────────────────────────
  if (telaBanco) {
    const bancoBuscaGlobal = bancoItens.filter(b =>
      (b.tipo_banco || 'obras') === abaBanco &&
      (!buscaBanco || b.nome.toLowerCase().includes(buscaBanco.toLowerCase()) || (b.categoria || '').toLowerCase().includes(buscaBanco.toLowerCase()))
    )
    return (
      <Layout userEmail={userEmail} onLogout={sair}>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-lg">
          <div>
            <button onClick={() => setTelaBanco(false)} className={btnSecondaryCls + ' mb-3'}>← Voltar</button>
            <h1 className="text-headline-md font-headline text-on-surface">📦 Banco de Itens</h1>
            <p className="text-body-sm text-on-surface-variant">Lista de serviços reutilizados em todos os orçamentos — adicione, edite ou exclua quando necessário.</p>
          </div>
          <button className={btnPrimaryCls} onClick={abrirNovoBanco}>+ Novo Item</button>
        </div>

        <div className="flex gap-2 mb-lg">
          <button className={abaBanco === 'obras' ? tabActiveCls : tabInactiveCls} onClick={() => setAbaBanco('obras')}>🏗️ Obras</button>
          <button className={abaBanco === 'house_flipping' ? tabActiveCls : tabInactiveCls} onClick={() => setAbaBanco('house_flipping')}>🏠 House Flipping</button>
        </div>

        <input placeholder="🔍 Buscar por nome ou categoria..." value={buscaBanco} onChange={e => setBuscaBanco(e.target.value)} className={inputCls + ' mb-lg max-w-[28rem]'} />

        {bancoBuscaGlobal.length === 0 ? (
          <div className={sectionCls + ' text-center py-16'}>
            <div className="text-5xl mb-4">📦</div>
            <div className="text-base font-bold text-on-surface mb-2">{bancoItens.length === 0 ? 'Banco de itens vazio' : 'Nenhum resultado'}</div>
            <div className="text-body-sm text-on-surface-variant">{bancoItens.length === 0 ? 'Adicione itens para reutilizar em futuros orçamentos e levantamentos' : 'Tente outro termo de busca'}</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {bancoBuscaGlobal.map(item => {
              const valorUnit = calcularValorUnitario(parseFloat(item.preco_material||0), parseFloat(item.preco_mao_obra||0), parseFloat(item.lucro_percentual||0), parseFloat(item.imposto_percentual||0))
              return (
                <div key={item.id} className="flex justify-between items-center px-3.5 py-3 bg-surface-container border border-outline-variant rounded-lg">
                  <div>
                    <div className="font-semibold text-on-surface">{item.nome}</div>
                    <div className="text-[11px] text-on-surface-variant mt-0.5">
                      Mat: {fmt(item.preco_material)} · M.O: {fmt(item.preco_mao_obra)} · Lucro {fmtN(item.lucro_percentual||0)}% · Imp {fmtN(item.imposto_percentual||0)}%
                      {item.categoria && <span className="ml-2 text-primary">{item.categoria}</span>}
                    </div>
                    <div className="text-[11px] font-bold text-tertiary mt-0.5">Valor final: {fmt(valorUnit)} / {item.unidade}</div>
                  </div>
                  <div className="flex gap-1.5 items-center">
                    <button className={btnEditSmCls} onClick={() => abrirEditarBanco(item)}>✏️</button>
                    <button className={btnDangerSmCls} onClick={() => { if (confirm('Excluir do banco?')) remover('banco_itens', item.id).then(carregar) }}>×</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {modalBancoJsx}
      </Layout>
    )
  }

  // ── LISTAGEM ───────────────────────────────────────────────
  return (
    <Layout
      userEmail={userEmail}
      onLogout={sair}
      searchSlot={
        <div className="relative w-full group">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline group-focus-within:text-primary transition-colors">search</span>
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar orçamentos ou propostas..."
            className="w-full bg-surface-container-low border border-outline-variant rounded-full pl-12 pr-4 py-2 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
          />
        </div>
      }
      topbarSlot={
        <>
          <button
            onClick={() => { setBuscaBanco(''); setTelaBanco(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-surface-container-high border border-outline-variant text-on-surface rounded-xl hover:bg-surface-variant transition-all font-label-md text-label-md"
          >
            <span className="material-symbols-outlined text-[20px]">inventory_2</span>
            Banco de Itens
          </button>
          <button
            onClick={() => { setFOrc({ codigo: '', cliente_nome: '', endereco: '', condicao_pagamento: '', validade_dias: '30', observacao: '', tipo_execucao: 'obra' }); setJanela('orcamento') }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-container text-on-primary-container rounded-xl hover:opacity-90 transition-all font-label-md text-label-md shadow-lg shadow-primary-container/20"
          >
            <span className="material-symbols-outlined text-[20px]">post_add</span>
            Novo Orçamento
          </button>
        </>
      }
    >
      <div className="flex items-center justify-between flex-wrap gap-3 mb-lg">
        <div>
          <h2 className="font-headline text-headline-lg text-on-surface">Orçamento & Propostas</h2>
          <p className="text-body-md text-on-surface-variant">Gerenciamento centralizado de ofertas comerciais e faturamento previsto.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-1 p-1 bg-surface-container rounded-xl border border-outline-variant flex-wrap">
            {([['todos', 'Todos'], ...Object.entries(STATUS_ORC)] as [string, string][]).map(([v, n]) => (
              <button key={v}
                className={`px-4 py-2 rounded-lg text-label-md transition-colors ${filtro === v ? 'bg-primary/20 text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-variant'}`}
                onClick={() => setFiltro(v)}>{n}</button>
            ))}
          </div>
          <div className="flex gap-1 p-1 bg-surface-container rounded-xl border border-outline-variant flex-wrap">
            {([['todos', 'Todos'], ['obra', '🏗️ Obra'], ['projeto', '📐 Projeto']] as [string, string][]).map(([v, n]) => (
              <button key={v}
                className={`px-4 py-2 rounded-lg text-label-md transition-colors ${filtroExecucao === v ? 'bg-primary/20 text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-variant'}`}
                onClick={() => setFiltroExecucao(v)}>{n}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-lg">
        {[
          ['Total', orcamentos.length, 'text-primary'],
          ['Rascunho', orcamentos.filter(o => o.status === 'rascunho').length, 'text-on-surface-variant'],
          ['Enviados', orcamentos.filter(o => o.status === 'enviado').length, 'text-secondary'],
          ['Aprovados', orcamentos.filter(o => o.status === 'aprovado').length, 'text-primary-container'],
        ].map(([l, v, c]) => (
          <div key={l as string} className={cardCls}>
            <div className="text-[11px] text-on-surface-variant uppercase tracking-widest mb-2">{l}</div>
            <div className={`text-2xl font-bold ${c}`}>{v}</div>
          </div>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className={sectionCls + ' text-center py-16'}>
          <div className="text-5xl mb-4">💼</div>
          <div className="text-base font-bold text-on-surface mb-4">{orcamentos.length === 0 ? 'Nenhum orçamento ainda' : 'Nenhum resultado'}</div>
          {orcamentos.length === 0 && <button className={btnPrimaryCls} onClick={() => setJanela('orcamento')}>+ Criar primeiro orçamento</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-lg">
          {lista.map(orc => {
            const ambsOrc = ambientes.filter(a => a.orcamento_id === orc.id)
            const itensOrc = itens.filter(i => i.orcamento_id === orc.id)
            return (
              <div key={orc.id}
                onClick={() => { setDetalhe(orc); setAmbienteAtivo(null); setAbaDetalhe('itens') }}
                className="bg-surface-container border border-outline-variant hover:border-primary transition-all duration-300 rounded-xl p-5 cursor-pointer">
                <div className="flex justify-between items-start mb-3.5 gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-body-sm text-on-surface-variant font-semibold">{orc.codigo}</span>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${EXECUCAO_BADGE[orc.tipo_execucao || 'obra']}`}>{EXECUCAO_NOME[orc.tipo_execucao || 'obra']}</span>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${STATUS_BADGE[orc.status] || STATUS_BADGE.rascunho}`}>{STATUS_ORC[orc.status] || orc.status}</span>
                      {!podeEditarOrcamento(orc) && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-on-surface-variant/10 text-on-surface-variant border-on-surface-variant/20">🔒</span>}
                    </div>
                    <div className="text-base font-bold text-on-surface">{orc.cliente_nome}</div>
                    {orc.endereco && <div className="text-body-sm text-on-surface-variant mt-0.5">📍 {orc.endereco}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="text-right">
                      <div className="text-xl font-bold text-primary-container">{fmt(parseFloat(orc.total_geral||0))}</div>
                      <div className="text-[10px] text-on-surface-variant mt-0.5">total geral</div>
                    </div>
                    {podeEditarOrcamento(orc) && (
                      <button className={btnDangerSmCls} onClick={e => { e.stopPropagation(); excluirOrcamento(orc) }}>× Excluir</button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-surface-container-high rounded-lg p-2.5">
                    <div className="text-[10px] text-on-surface-variant mb-1">AMBIENTES</div>
                    <div className="text-sm font-bold text-primary">{ambsOrc.length}</div>
                  </div>
                  <div className="bg-surface-container-high rounded-lg p-2.5">
                    <div className="text-[10px] text-on-surface-variant mb-1">ITENS</div>
                    <div className="text-sm font-bold text-tertiary">{itensOrc.length}</div>
                  </div>
                  <div className="bg-surface-container-high rounded-lg p-2.5">
                    <div className="text-[10px] text-on-surface-variant mb-1">VALIDADE</div>
                    <div className="text-sm font-bold text-on-surface-variant">{orc.validade_dias || 30}d</div>
                  </div>
                </div>
                <div className="flex gap-4 text-body-sm">
                  <span className="text-primary">Mat: {fmt(parseFloat(orc.total_material||0))}</span>
                  <span className="text-secondary">M.O: {fmt(parseFloat(orc.total_mao_obra||0))}</span>
                </div>
                <div className="mt-3 text-sm text-primary font-bold">Abrir orçamento →</div>
              </div>
            )
          })}
        </div>
      )}

      {janela === 'orcamento' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[580px] max-h-[92vh] overflow-y-auto">
            <div className="text-base font-bold text-on-surface mb-5">💼 Novo Orçamento</div>
            <div className="grid grid-cols-2 gap-3 mb-3.5">
              <div>
                <label className={labelCls}>Código</label>
                <input className={inputCls} placeholder={gerarCodigo(orcamentos)} value={fOrc.codigo} onChange={e => setFOrc({ ...fOrc, codigo: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Validade (dias)</label>
                <input className={inputCls} type="number" value={fOrc.validade_dias} onChange={e => setFOrc({ ...fOrc, validade_dias: e.target.value })} />
              </div>
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Cliente *</label>
              <input className={inputCls} placeholder="Nome do cliente" value={fOrc.cliente_nome} onChange={e => setFOrc({ ...fOrc, cliente_nome: e.target.value })} />
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Execução *</label>
              <select className={inputCls} value={fOrc.tipo_execucao} onChange={e => setFOrc({ ...fOrc, tipo_execucao: e.target.value })}>
                {TIPOS_EXECUCAO.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Endereço</label>
              <input className={inputCls} placeholder="Endereço do imóvel" value={fOrc.endereco} onChange={e => setFOrc({ ...fOrc, endereco: e.target.value })} />
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Forma de Pagamento</label>
              <textarea className={inputCls + ' min-h-[70px] resize-y'} placeholder="Ex: 40% na assinatura do contrato, 30% no meio da obra, 30% na entrega." value={fOrc.condicao_pagamento} onChange={e => setFOrc({ ...fOrc, condicao_pagamento: e.target.value })} />
            </div>
            <div className="mb-5">
              <label className={labelCls}>Observações</label>
              <input className={inputCls} placeholder="Observações para a proposta" value={fOrc.observacao} onChange={e => setFOrc({ ...fOrc, observacao: e.target.value })} />
            </div>
            <div className="flex gap-2 justify-end">
              <button className={btnSecondaryCls} onClick={() => setJanela(null)}>Cancelar</button>
              <button className={btnPrimaryCls} onClick={salvarOrcamento}>Criar Orçamento</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
