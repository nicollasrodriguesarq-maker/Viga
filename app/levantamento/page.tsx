'use client'
import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { obterMinhasPermissoes, temAcessoModulo } from '../lib/permissoes'

const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': 'Bearer ' + ANON }

const moeda = (v: number) => Number(v||0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const num = (v: string) => parseFloat(String(v || '0').replace(',', '.')) || 0
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

// Calcula a área/quantidade conforme a unidade: m² usa comprimento x altura
// (medida típica de parede), com fallback pra comprimento x largura quando não
// há altura informada (medida típica de piso); m³ usa os três; demais
// unidades (ml, un, vb, cj, kg, hr) ficam para preenchimento manual.
function calcularArea(unidade: string, comprimento: string, largura: string, altura: string): string {
  const c = num(comprimento), l = num(largura), a = num(altura)
  if (unidade === 'm²') {
    if (c && a) return (c * a).toFixed(2)
    if (c && l) return (c * l).toFixed(2)
    return ''
  }
  if (unidade === 'm³') {
    if (c && l && a) return (c * l * a).toFixed(2)
    return ''
  }
  return ''
}

async function uploadFotoServico(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const nome = `foto_${Date.now()}.${ext}`
  const r = await fetch(`${BASE.replace('/rest/v1','')}/storage/v1/object/levantamento-fotos/${nome}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': file.type },
    body: file,
  })
  if (r.ok) return `${BASE.replace('/rest/v1','')}/storage/v1/object/public/levantamento-fotos/${nome}`
  return null
}

async function uploadArquivoLevantamento(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const nome = `arq_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const r = await fetch(`${BASE.replace('/rest/v1','')}/storage/v1/object/levantamento-arquivos/${nome}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (r.ok) return `${BASE.replace('/rest/v1','')}/storage/v1/object/public/levantamento-arquivos/${nome}`
  return null
}

async function buscar(tabela: string, q = '') {
  try {
    const r = await fetch(BASE + '/' + tabela + q, { headers: H })
    const d = await r.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}
async function criar(tabela: string, dados: object) {
  try {
    const r = await fetch(BASE + '/' + tabela, {
      method: 'POST', headers: { ...H, 'Prefer': 'return=representation' },
      body: JSON.stringify(dados)
    })
    const d = await r.json()
    return Array.isArray(d) ? d[0] : d
  } catch { return null }
}
async function editar(tabela: string, id: string, dados: object) {
  try { await fetch(BASE + '/' + tabela + '?id=eq.' + id, { method: 'PATCH', headers: H, body: JSON.stringify(dados) }) } catch {}
}
async function remover(tabela: string, id: string) {
  try { await fetch(BASE + '/' + tabela + '?id=eq.' + id, { method: 'DELETE', headers: H }) } catch {}
}

const STATUS_LEVA: Record<string, string> = {
  em_andamento: 'Em Andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}
const STATUS_BADGE: Record<string, string> = {
  em_andamento: 'bg-tertiary/10 text-tertiary border-tertiary/20',
  concluido: 'bg-primary-container/10 text-primary-container border-primary-container/20',
  cancelado: 'bg-error/10 text-error border-error/20',
}

const UNIDADES = ['m²', 'm³', 'ml', 'un', 'vb', 'cj', 'kg', 'hr']
const AMBIENTES_COMUNS = ['Sala de Estar', 'Sala de Jantar', 'Cozinha', 'Quarto 1', 'Quarto 2', 'Quarto 3', 'Banheiro Social', 'Banheiro Suíte', 'Área de Serviço', 'Varanda', 'Fachada', 'Área Externa', 'Corredor', 'Hall', 'Escritório', 'Garagem']
const CATEGORIAS = ['Demolição e Remoção', 'Terraplanagem e Fundação', 'Estrutura', 'Alvenaria', 'Cobertura', 'Impermeabilização', 'Instalações Elétricas', 'Instalações Hidráulicas', 'Instalações de Gás', 'Climatização (AC)', 'Forro', 'Revestimento de Parede', 'Revestimento de Piso', 'Pintura', 'Esquadrias', 'Marcenaria', 'Serralheria', 'Vidraçaria', 'Mobiliário', 'Paisagismo', 'Limpeza Pós-Obra', 'Outros']

function gerarCodigo(lista: any[]) {
  const a = new Date().getFullYear()
  const n = lista.filter(l => l.codigo?.startsWith('LEV-' + a)).length + 1
  return 'LEV-' + a + '-' + String(n).padStart(3, '0')
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

export default function Levantamento() {
  const [levantamentos, setLevantamentos] = useState<any[]>([])
  const [ambientes, setAmbientes] = useState<any[]>([])
  const [itens, setItens] = useState<any[]>([])
  const [obras, setObras] = useState<any[]>([])
  const [solicitacoes, setSolicitacoes] = useState<any[]>([])
  const [bancoItens, setBancoItens] = useState<any[]>([])
  const [arquivos, setArquivos] = useState<any[]>([])
  const [arquivoUpload, setArquivoUpload] = useState<File | null>(null)
  const [enviandoArquivo, setEnviandoArquivo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [detalhe, setDetalhe] = useState<any>(null)
  const [abaDetalhe, setAbaDetalhe] = useState('ambientes')
  const [ambienteAtivo, setAmbienteAtivo] = useState<any>(null)
  const [janela, setJanela] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [meuId, setMeuId] = useState('')
  const [souAdmin, setSouAdmin] = useState(false)

  const [fLev, setFLev] = useState({ codigo: '', nome: '', cliente: '', endereco: '', responsavel: '', status: 'em_andamento', observacao: '', obra_id: '', cliente_email: '', cliente_telefone: '' })
  const [fAmb, setFAmb] = useState({ nome: '', nomeCustom: '' })
  const [fItem, setFItem] = useState({ servico: '', descricao: '', comprimento: '', largura: '', altura: '', area: '', unidade: 'm²', observacao: '', foto_url: '', banco_item_id: '', categoria: '' })
  const [editItem, setEditItem] = useState<any>(null)
  const [arquivoFoto, setArquivoFoto] = useState<File | null>(null)
  const [enviandoFoto, setEnviandoFoto] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('viga_token')) { window.location.href = '/'; return }
    setUserEmail(localStorage.getItem('viga_email') || '')
    obterMinhasPermissoes().then(perm => {
      if (!temAcessoModulo(perm, 'levantamento')) { window.location.href = '/'; return }
      if (perm) { setMeuId(perm.id); setSouAdmin(perm.role === 'admin') }
    })
    carregar()
  }, [])

  function sair() {
    localStorage.removeItem('viga_token')
    localStorage.removeItem('viga_refresh_token')
    localStorage.removeItem('viga_email')
    window.location.href = '/'
  }

  async function carregar() {
    setLoading(true)
    const [l, a, it, o, s, b, arq] = await Promise.all([
      buscar('levantamentos', '?order=created_at.desc'),
      buscar('levantamento_ambientes', '?order=ordem'),
      buscar('levantamento_itens', '?order=created_at'),
      buscar('obras', '?select=id,nome&order=nome'),
      buscar('levantamento_solicitacoes', '?order=created_at.desc'),
      buscar('banco_itens', '?order=nome'),
      buscar('levantamento_arquivos', '?order=created_at.desc'),
    ])
    setLevantamentos(l); setAmbientes(a); setItens(it); setObras(o); setSolicitacoes(s); setBancoItens(b); setArquivos(arq)
    setLoading(false)
  }

  async function salvarLevantamento() {
    if (!fLev.cliente) return alert('Preencha o nome do cliente')
    const codigo = fLev.codigo || gerarCodigo(levantamentos)
    const dados = {
      codigo,
      nome: fLev.nome,
      cliente: fLev.cliente,
      endereco: fLev.endereco,
      responsavel: fLev.responsavel,
      status: fLev.status,
      obra_id: fLev.obra_id || null,
      cliente_email: fLev.cliente_email,
      cliente_telefone: fLev.cliente_telefone,
      criado_por: meuId || null,
    }
    const novo = await criar('levantamentos', dados)
    setJanela(null)
    setFLev({ codigo: '', nome: '', cliente: '', endereco: '', responsavel: '', status: 'em_andamento', observacao: '', obra_id: '', cliente_email: '', cliente_telefone: '' })
    const [l, a, it] = await Promise.all([
      buscar('levantamentos', '?order=created_at.desc'),
      buscar('levantamento_ambientes', '?order=ordem'),
      buscar('levantamento_itens', '?order=created_at'),
    ])
    setLevantamentos(l); setAmbientes(a); setItens(it); setLoading(false)
    if (novo?.id) {
      setDetalhe(novo); setAmbienteAtivo(null); setAbaDetalhe('ambientes')
    } else {
      const encontrado = l.find((x: any) => x.codigo === codigo)
      if (encontrado) {
        setDetalhe(encontrado); setAmbienteAtivo(null); setAbaDetalhe('ambientes')
      }
    }
  }

  async function salvarAmbiente() {
    if (!detalhe) return
    const nome = fAmb.nome === '__custom__' ? fAmb.nomeCustom : fAmb.nome
    if (!nome) return alert('Preencha o nome do ambiente')
    const ordem = ambientes.filter(a => a.levantamento_id === detalhe.id).length
    await criar('levantamento_ambientes', { levantamento_id: detalhe.id, nome, ordem })
    setJanela(null); setFAmb({ nome: '', nomeCustom: '' }); carregar()
  }

  async function salvarItem() {
    if (!ambienteAtivo || !fItem.servico) return alert('Preencha o serviço')
    const area = fItem.area ? num(fItem.area) : num(calcularArea(fItem.unidade, fItem.comprimento, fItem.largura, fItem.altura))
    let fotoUrl = fItem.foto_url
    if (arquivoFoto) {
      setEnviandoFoto(true)
      const url = await uploadFotoServico(arquivoFoto)
      setEnviandoFoto(false)
      if (url) fotoUrl = url
    }
    const dados = {
      ambiente: ambienteAtivo.id,
      levantamento_id: detalhe.id,
      servico: fItem.servico,
      descricao: fItem.descricao,
      comprimento: num(fItem.comprimento) || null,
      largura: num(fItem.largura) || null,
      altura: num(fItem.altura) || null,
      area: area || null,
      unidade: fItem.unidade,
      observacao: fItem.observacao,
      foto_url: fotoUrl || null,
      banco_item_id: fItem.banco_item_id || null,
      categoria: fItem.categoria || null,
    }
    let itemSalvo: any
    if (editItem) { await editar('levantamento_itens', editItem.id, dados); itemSalvo = { ...dados, id: editItem.id } }
    else { itemSalvo = await criar('levantamento_itens', dados) }
    setJanela(null); setEditItem(null); setArquivoFoto(null)
    setFItem({ servico: '', descricao: '', comprimento: '', largura: '', altura: '', area: '', unidade: 'm²', observacao: '', foto_url: '', banco_item_id: '', categoria: '' })
    if (itemSalvo?.id) { await sincronizarItemOrcamento(itemSalvo, ambienteAtivo) }
    carregar()
  }

  // ── Permissão de edição ──────────────────────────────────────
  function solicitacoesDoLevantamento(levId: string) {
    return solicitacoes.filter(s => s.levantamento_id === levId)
  }
  function podeEditarLevantamento(lev: any) {
    if (!meuId || souAdmin || lev.criado_por == null || lev.criado_por === meuId) return true
    return solicitacoesDoLevantamento(lev.id).some(s => s.solicitante_id === meuId && s.status === 'aprovado')
  }
  async function solicitarPermissao() {
    if (!detalhe || !meuId) return
    const jaTemPedido = solicitacoesDoLevantamento(detalhe.id).some(s => s.solicitante_id === meuId && s.status !== 'negado')
    if (jaTemPedido) return alert('Você já tem uma solicitação pendente ou aprovada para este levantamento.')
    await criar('levantamento_solicitacoes', {
      levantamento_id: detalhe.id,
      solicitante_id: meuId,
      solicitante_nome: userEmail.split('@')[0],
      status: 'pendente',
    })
    alert('Solicitação enviada! O criador ou um admin vai aprovar.')
    carregar()
  }
  async function responderSolicitacao(id: string, status: 'aprovado' | 'negado') {
    await editar('levantamento_solicitacoes', id, { status, respondido_em: new Date().toISOString() })
    carregar()
  }

  // ── Arquivos anexados ao levantamento ────────────────────────
  async function salvarArquivo() {
    if (!arquivoUpload || !detalhe) return
    setEnviandoArquivo(true)
    const url = await uploadArquivoLevantamento(arquivoUpload)
    setEnviandoArquivo(false)
    if (!url) return alert('Falha ao enviar o arquivo. Tente novamente.')
    await criar('levantamento_arquivos', {
      levantamento_id: detalhe.id,
      nome: arquivoUpload.name,
      url,
      tipo: arquivoUpload.type || null,
    })
    setArquivoUpload(null)
    carregar()
  }
  async function removerArquivo(id: string) {
    if (!confirm('Excluir este arquivo?')) return
    await remover('levantamento_arquivos', id)
    carregar()
  }

  // ── Sincronia automática Levantamento → Orçamento ────────────
  function calcularTotalItemOrc(item: any) {
    const valorUnit = (parseFloat(item.preco_material||0) + parseFloat(item.preco_mao_obra||0)) * (1 + parseFloat(item.lucro_percentual||0)/100) * (1 + parseFloat(item.imposto_percentual||0)/100)
    return valorUnit * parseFloat(item.quantidade||1)
  }
  async function atualizarTotaisOrcamento(orcId: string) {
    const todosItens = await buscar('orcamento_itens', '?orcamento_id=eq.' + orcId)
    const tMat = todosItens.reduce((a: number, i: any) => a + parseFloat(i.preco_material||0) * parseFloat(i.quantidade||1), 0)
    const tMao = todosItens.reduce((a: number, i: any) => a + parseFloat(i.preco_mao_obra||0) * parseFloat(i.quantidade||1), 0)
    const tGeral = todosItens.reduce((a: number, i: any) => a + calcularTotalItemOrc(i), 0)
    await editar('orcamentos', orcId, { total_material: tMat, total_mao_obra: tMao, total_geral: tGeral })
  }
  async function orcamentoVinculado(): Promise<string | null> {
    if (!detalhe) return null
    const existentes = await buscar('orcamentos', `?levantamento_id=eq.${detalhe.id}&limit=1`)
    if (existentes[0]) return existentes[0].id
    const ano = new Date().getFullYear()
    const orcLista = await buscar('orcamentos', '?order=created_at.desc&limit=200')
    const n = orcLista.filter((o: any) => o.codigo?.startsWith('ORC-' + ano)).length + 1
    const codigo = 'ORC-' + ano + '-' + String(n).padStart(3, '0')
    const novo = await criar('orcamentos', {
      codigo,
      levantamento_id: detalhe.id,
      cliente_nome: detalhe.cliente,
      endereco: detalhe.endereco,
      status: 'rascunho',
      total_material: 0, total_mao_obra: 0, total_geral: 0, desconto: 0,
    })
    return novo?.id || null
  }
  async function ambienteOrcamentoEspelhado(levAmbiente: any, orcId: string): Promise<string | null> {
    const existentes = await buscar('orcamento_ambientes', `?levantamento_ambiente_id=eq.${levAmbiente.id}`)
    if (existentes[0]) return existentes[0].id
    const novo = await criar('orcamento_ambientes', { orcamento_id: orcId, nome: levAmbiente.nome, ordem: levAmbiente.ordem || 0, levantamento_ambiente_id: levAmbiente.id })
    return novo?.id || null
  }
  async function sincronizarItemOrcamento(item: any, ambiente: any) {
    const orcId = await orcamentoVinculado()
    if (!orcId) return
    const oaId = await ambienteOrcamentoEspelhado(ambiente, orcId)
    if (!oaId) return
    const bi = item.banco_item_id ? bancoItens.find(b => b.id === item.banco_item_id) : null
    const qtd = parseFloat(item.area || 1) || 1
    const dadosOI = {
      orcamento_id: orcId,
      ambiente_id: oaId,
      servico: item.servico,
      descricao: item.descricao,
      quantidade: qtd,
      unidade: item.unidade,
      preco_material: bi ? bi.preco_material : 0,
      preco_mao_obra: bi ? bi.preco_mao_obra : 0,
      lucro_percentual: bi ? bi.lucro_percentual : 0,
      imposto_percentual: bi ? bi.imposto_percentual : 0,
      banco_item_id: item.banco_item_id || null,
      levantamento_item_id: item.id,
    }
    const totalItem = calcularTotalItemOrc(dadosOI)
    const existentesItem = await buscar('orcamento_itens', `?levantamento_item_id=eq.${item.id}`)
    if (existentesItem[0]) { await editar('orcamento_itens', existentesItem[0].id, { ...dadosOI, total_item: totalItem }) }
    else { await criar('orcamento_itens', { ...dadosOI, total_item: totalItem }) }
    await atualizarTotaisOrcamento(orcId)
  }
  async function excluirItemLevantamento(item: any) {
    const linked = await buscar('orcamento_itens', `?levantamento_item_id=eq.${item.id}`)
    for (const oi of linked) await remover('orcamento_itens', oi.id)
    await remover('levantamento_itens', item.id)
    if (linked[0]?.orcamento_id) await atualizarTotaisOrcamento(linked[0].orcamento_id)
    carregar()
  }
  async function excluirAmbienteLevantamento(amb: any) {
    if (!confirm('Excluir ambiente e todos os itens?')) return
    const oaLinked = await buscar('orcamento_ambientes', `?levantamento_ambiente_id=eq.${amb.id}`)
    for (const oa of oaLinked) await remover('orcamento_ambientes', oa.id)
    await remover('levantamento_ambientes', amb.id)
    if (oaLinked[0]?.orcamento_id) await atualizarTotaisOrcamento(oaLinked[0].orcamento_id)
    carregar()
  }
  async function verOrcamentoVinculado() {
    if (!detalhe) return
    const existentes = await buscar('orcamentos', `?levantamento_id=eq.${detalhe.id}&limit=1`)
    if (existentes[0]) {
      localStorage.setItem('viga_orcamento_abrir', existentes[0].id)
      window.location.href = '/orcamento'
    } else {
      alert('Nenhum orçamento vinculado ainda. Adicione um serviço no levantamento para criar automaticamente.')
    }
  }

  function paginasLevantamento(lev: any, ambs: any[], itensList: any[], cfg: any) {
    const nomeEmpresa = cfg.nome_empresa || 'VIGA'
    const hoje = new Date()
    const dataEmissao = hoje.toLocaleDateString('pt-BR')
    const nomeAmbiente = (ambienteId: string) => ambs.find(a => a.id === ambienteId)?.nome || '—'
    const formatarData = (iso: string) => {
      if (!iso) return '—'
      const d = new Date(iso)
      const dia = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase()
      return `${dia}, ${d.toLocaleDateString('pt-BR')}`
    }

    const itensHtml = itensList.map((item, i) => {
      const medidas = [
        item.comprimento ? ['COMPRIMENTO', item.comprimento + 'm'] : null,
        item.largura ? ['LARGURA', item.largura + 'm'] : null,
        item.altura ? ['ALTURA', item.altura + 'm'] : null,
        item.area ? ['ÁREA/QTD', item.area + ' ' + (item.unidade || '')] : null,
      ].filter(Boolean) as [string, string][]

      return `
      <div style="display:flex;gap:24px;margin-bottom:28px;break-inside:avoid;padding-bottom:28px;border-bottom:1px solid #3d494833">
        <div style="width:45%;aspect-ratio:1;border-radius:12px;overflow:hidden;border:1px solid #3d4948;position:relative;background:#171c23;flex-shrink:0">
          <div style="position:absolute;top:12px;left:12px;z-index:2;width:28px;height:28px;border-radius:999px;background:#6ee9e0;color:#003734;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">${i + 1}</div>
          ${item.foto_url
            ? `<img src="${item.foto_url}" style="width:100%;height:100%;object-fit:cover;display:block" />`
            : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#3d4948;font-size:40px">—</div>`}
        </div>
        <div style="flex:1;display:flex;flex-direction:column">
          <div style="margin-bottom:12px">
            <h3 style="font-size:18px;font-weight:600;color:#dee2ec;margin-bottom:4px">${item.servico || ''}</h3>
            <p style="font-size:10px;letter-spacing:0.08em;color:#6ee9e0;text-transform:uppercase;font-weight:700">${nomeAmbiente(item.ambiente)}</p>
          </div>
          <div style="background:#1b2027;border:1px solid #3d4948;border-radius:8px;padding:12px 14px;margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;border-bottom:1px solid #3d4948;padding-bottom:6px;margin-bottom:6px">
              <span style="font-size:10px;letter-spacing:0.08em;color:#869391;text-transform:uppercase">CRIADO EM</span>
              <span style="font-size:10px;color:#dee2ec">${formatarData(item.created_at)}</span>
            </div>
            ${item.descricao ? `<p style="font-size:12px;color:#bcc9c7;font-style:italic">"${item.descricao}"</p>` : ''}
            ${item.observacao ? `<p style="font-size:11px;color:#ffcbac;margin-top:6px">⚠️ ${item.observacao}</p>` : ''}
          </div>
          ${medidas.length > 0 ? `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            ${medidas.map(([label, valor]) => `
              <div style="background:#252a32;border:1px solid #3d4948;border-radius:8px;padding:10px 12px">
                <span style="font-size:9px;color:#869391;display:block;margin-bottom:2px">${label}</span>
                <span style="font-family:'JetBrains Mono',monospace;color:#6ee9e0;font-size:14px">${valor}</span>
              </div>`).join('')}
          </div>` : ''}
        </div>
      </div>`
    }).join('')

    return `
    <!-- PÁGINA 1 — CAPA -->
    <div class="page">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #3d4948">
        <div>
          <h1 style="font-size:28px;font-weight:700;color:#6ee9e0;text-transform:uppercase;margin-bottom:4px">Levantamento Técnico</h1>
          <p style="color:#bcc9c7">Relatório Fotográfico &amp; Descritivo</p>
        </div>
        <div style="text-align:right">
          ${cfg.logo_url ? `<img src="${cfg.logo_url}" style="height:36px;object-fit:contain;margin-bottom:6px" />` : `<div style="font-size:22px;font-weight:900;color:#6ee9e0;text-transform:uppercase">${nomeEmpresa}</div>`}
          <p style="font-size:10px;color:#869391">DOC ID: ${lev.codigo}</p>
          <p style="font-size:10px;color:#869391">EMISSÃO: ${dataEmissao}</p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:12px">
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="card">
            <span style="font-size:10px;letter-spacing:0.08em;color:#6ee9e0;text-transform:uppercase;font-weight:700">Informações do Levantamento</span>
            <h2 style="font-size:22px;color:#dee2ec;margin:6px 0">${lev.nome || lev.cliente}</h2>
            ${lev.endereco ? `<div style="color:#bcc9c7">📍 ${lev.endereco}</div>` : ''}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="card">
              <span style="font-size:10px;letter-spacing:0.08em;color:#869391;text-transform:uppercase">Cliente</span>
              <p style="font-size:15px;font-weight:700;color:#dee2ec;margin:4px 0 10px">${lev.cliente}</p>
              <span style="font-size:10px;letter-spacing:0.08em;color:#869391;text-transform:uppercase">Contato</span>
              <p style="font-size:12px;color:#bcc9c7">${lev.cliente_telefone || '—'}</p>
              <p style="font-size:12px;color:#6ee9e0">${lev.cliente_email || ''}</p>
            </div>
            <div class="card">
              <span style="font-size:10px;letter-spacing:0.08em;color:#869391;text-transform:uppercase">Responsável Técnico</span>
              <p style="font-size:15px;font-weight:700;color:#dee2ec;margin:4px 0 10px">${lev.responsavel || '—'}</p>
            </div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="background:#6ee9e01a;border:1px solid #6ee9e033;border-radius:12px;padding:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;flex:1">
            <span style="font-size:40px;font-weight:900;color:#6ee9e0;line-height:1">${String(itensList.length).padStart(2,'0')}</span>
            <span style="font-size:11px;color:#dee2ec;text-transform:uppercase;font-weight:700;margin-top:8px">Itens Registrados</span>
          </div>
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="font-size:10px;letter-spacing:0.08em;color:#869391;text-transform:uppercase">Status</span>
              <span style="padding:2px 8px;background:#6ee9e01a;color:#6ee9e0;font-size:9px;font-weight:700;border-radius:4px;border:1px solid #6ee9e033">${(STATUS_LEVA[lev.status] || lev.status || '').toUpperCase()}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px">
              <span style="color:#869391">Criado em:</span>
              <span style="color:#dee2ec">${lev.created_at ? new Date(lev.created_at).toLocaleDateString('pt-BR') : '—'}</span>
            </div>
          </div>
        </div>
      </div>

      <div style="height:110px;border-radius:12px;background:linear-gradient(120deg,#171c23,#1b2027);border:1px solid #3d4948;display:flex;align-items:center;padding:0 24px;margin-bottom:12px">
        <div>
          <p style="font-size:18px;font-weight:600;color:#dee2ec">${nomeEmpresa.toUpperCase()}</p>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;font-size:10px;color:#869391;padding-top:16px;border-top:1px solid #3d4948">
        <span>© ${hoje.getFullYear()} ${nomeEmpresa}</span>
        <span>${[cfg.telefone, cfg.emails_gerais, cfg.site].filter(Boolean).join(' · ')}</span>
      </div>
    </div>

    <!-- PÁGINA 2+ — ITENS -->
    <div class="page">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;border-bottom:1px solid #3d4948;padding-bottom:12px">
        <span style="font-size:11px;color:#6ee9e0;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Itens de Levantamento</span>
        <span style="font-size:10px;color:#869391;text-transform:uppercase">${(lev.nome || lev.cliente || '')}</span>
      </div>
      ${itensList.length > 0 ? itensHtml : '<p style="color:#869391;text-align:center;padding:40px 0">Nenhum item registrado ainda.</p>'}
      <div style="display:flex;justify-content:space-between;font-size:10px;color:#869391;padding-top:16px;border-top:1px solid #3d4948;margin-top:16px">
        <span>© ${hoje.getFullYear()} ${nomeEmpresa}</span>
        <span>Relatório de Levantamento</span>
      </div>
    </div>`
  }

  function envolverPaginasPdf(titulo: string, paginas: string) {
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>${titulo}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { background:#0f141b; color:#dee2ec; font-family:'Inter',sans-serif; font-size:13px; }
      h1,h2,h3 { font-family:'Manrope',sans-serif; }
      .page { max-width:900px; margin:0 auto; padding:40px 36px; }
      .card { background:#1b2027; border:1px solid #3d4948; border-radius:12px; padding:20px; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .page { break-after: page; }
        .page:last-child { break-after: auto; }
      }
    </style></head><body>
    ${paginas}
    <script>window.onload = () => { window.print() }</script>
    </body></html>`
  }

  async function gerarPDFLevantamento(lev: any, ambs: any[], itensList: any[]) {
    const configRows = await buscar('empresa_config', '?limit=1')
    const cfg = configRows[0] || {}
    const nomeEmpresa = cfg.nome_empresa || 'VIGA'
    const paginas = paginasLevantamento(lev, ambs, itensList, cfg)
    const html = envolverPaginasPdf(`Levantamento ${lev.codigo} — ${nomeEmpresa}`, paginas)
    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  async function gerarPropostaCompleta(lev: any, ambs: any[], itensList: any[]) {
    const configRows = await buscar('empresa_config', '?limit=1')
    const cfg = configRows[0] || {}
    const nomeEmpresa = cfg.nome_empresa || 'VIGA'
    const paginasBase = paginasLevantamento(lev, ambs, itensList, cfg)

    const orcs = await buscar('orcamentos', `?levantamento_id=eq.${lev.id}&limit=1`)
    const orc = orcs[0]

    let paginaOrcamento: string
    if (!orc) {
      paginaOrcamento = `
      <div class="page">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;border-bottom:1px solid #3d4948;padding-bottom:12px">
          <span style="font-size:11px;color:#6ee9e0;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Orçamento &amp; Forma de Pagamento</span>
        </div>
        <p style="color:#869391;text-align:center;padding:40px 0">Nenhum orçamento vinculado a este levantamento ainda. Adicione serviços para gerar o orçamento automaticamente.</p>
      </div>`
    } else {
      const orcAmbs = await buscar('orcamento_ambientes', `?orcamento_id=eq.${orc.id}&order=ordem`)
      const orcItens = await buscar('orcamento_itens', `?orcamento_id=eq.${orc.id}`)
      const valorUnit = (item: any) => (parseFloat(item.preco_material||0) + parseFloat(item.preco_mao_obra||0)) * (1 + parseFloat(item.lucro_percentual||0)/100) * (1 + parseFloat(item.imposto_percentual||0)/100)
      const totalItem = (item: any) => valorUnit(item) * parseFloat(item.quantidade||1)
      const totalGeral = orcItens.reduce((a: number, i: any) => a + totalItem(i), 0)
      const desconto = parseFloat(orc.desconto || 0)
      const totalFinal = totalGeral - desconto

      const ambContent = orcAmbs.map((oa: any) => {
        const itensAmb = orcItens.filter((i: any) => i.ambiente_id === oa.id)
        if (itensAmb.length === 0) return ''
        const totalAmb = itensAmb.reduce((a: number, i: any) => a + totalItem(i), 0)
        const rows = itensAmb.map((item: any) => `
          <tr>
            <td style="padding:9px 12px;border-bottom:1px solid #3d4948">${item.servico}${item.descricao ? '<br><small style="color:#869391">' + item.descricao + '</small>' : ''}</td>
            <td style="padding:9px 12px;border-bottom:1px solid #3d4948;text-align:center">${Number(item.quantidade||0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ${item.unidade}</td>
            <td style="padding:9px 12px;border-bottom:1px solid #3d4948;text-align:right">${moeda(valorUnit(item))}</td>
            <td style="padding:9px 12px;border-bottom:1px solid #3d4948;text-align:right;font-weight:700;color:#6ee9e0">${moeda(totalItem(item))}</td>
          </tr>`).join('')
        return `
        <div style="margin-bottom:20px;break-inside:avoid">
          <div style="background:#1b2027;border:1px solid #3d4948;border-radius:8px;padding:10px 14px;font-weight:700;color:#6ee9e0;margin-bottom:8px">🏠 ${oa.nome}</div>
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:#171c23">
                <th style="padding:8px 12px;text-align:left;color:#869391;font-size:10px;text-transform:uppercase">Serviço</th>
                <th style="padding:8px 12px;text-align:center;color:#869391;font-size:10px;text-transform:uppercase">Qtd</th>
                <th style="padding:8px 12px;text-align:right;color:#869391;font-size:10px;text-transform:uppercase">Valor Unit.</th>
                <th style="padding:8px 12px;text-align:right;color:#869391;font-size:10px;text-transform:uppercase">Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr style="background:#171c23">
                <td colspan="3" style="padding:8px 12px;font-weight:700;color:#dee2ec">Subtotal ${oa.nome}</td>
                <td style="padding:8px 12px;text-align:right;font-weight:900;color:#6ee9e0">${moeda(totalAmb)}</td>
              </tr>
            </tfoot>
          </table>
        </div>`
      }).join('')

      paginaOrcamento = `
      <div class="page">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;border-bottom:1px solid #3d4948;padding-bottom:12px">
          <span style="font-size:11px;color:#6ee9e0;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Orçamento &amp; Forma de Pagamento</span>
          <span style="font-size:10px;color:#869391;text-transform:uppercase">${orc.codigo}</span>
        </div>
        ${ambContent || '<p style="color:#869391;text-align:center;padding:24px 0">Nenhum item precificado ainda.</p>'}
        <div style="border:1px solid #6ee9e033;border-radius:8px;overflow:hidden;margin:20px 0">
          <div style="background:#1b2027;padding:10px 14px;font-weight:700;color:#6ee9e0;font-size:13px">Resumo Financeiro</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr><td style="padding:9px 14px">Subtotal</td><td style="padding:9px 14px;text-align:right;font-weight:600">${moeda(totalGeral)}</td></tr>
            ${desconto > 0 ? `<tr><td style="padding:9px 14px">Desconto</td><td style="padding:9px 14px;text-align:right;color:#ffb4ab;font-weight:600">- ${moeda(desconto)}</td></tr>` : ''}
            <tr style="background:#6ee9e01a">
              <td style="padding:12px 14px;font-size:14px;font-weight:700;color:#6ee9e0">TOTAL GERAL</td>
              <td style="padding:12px 14px;text-align:right;font-size:18px;font-weight:900;color:#6ee9e0">${moeda(totalFinal)}</td>
            </tr>
          </table>
        </div>
        ${orc.condicao_pagamento ? `
        <div style="background:#1b2027;border:1px solid #3d4948;border-radius:8px;padding:14px 16px;margin-bottom:20px">
          <div style="font-size:10px;color:#869391;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Forma de Pagamento</div>
          <div style="color:#dee2ec;white-space:pre-line">${orc.condicao_pagamento}</div>
        </div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:48px">
          <div style="text-align:center">
            <div style="border-top:1px solid #3d4948;padding-top:8px;color:#bcc9c7;font-size:12px">${lev.cliente}</div>
            <div style="color:#869391;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;margin-top:2px">Cliente</div>
          </div>
          <div style="text-align:center">
            <div style="border-top:1px solid #3d4948;padding-top:8px;color:#bcc9c7;font-size:12px">${nomeEmpresa}</div>
            <div style="color:#869391;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;margin-top:2px">${lev.responsavel || 'Responsável Técnico'}</div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#869391;padding-top:16px;border-top:1px solid #3d4948;margin-top:24px">
          <span>© ${new Date().getFullYear()} ${nomeEmpresa}</span>
          <span>Proposta Comercial</span>
        </div>
      </div>`
    }

    const html = envolverPaginasPdf(`Proposta ${lev.codigo} — ${nomeEmpresa}`, paginasBase + paginaOrcamento)
    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  const lista = levantamentos.filter(l => {
    if (!busca) return true
    const termo = busca.toLowerCase().trim()
    const obraNome = obras.find(o => o.id === l.obra_id)?.nome
    if ([l.cliente, l.codigo, l.endereco, l.nome, obraNome].some(v => v?.toLowerCase().includes(termo))) return true
    if (/^\d{4}$/.test(termo) && l.created_at) {
      return new Date(l.created_at).getFullYear() === parseInt(termo)
    }
    const mesIdx = MESES.findIndex(m => m.startsWith(termo))
    if (mesIdx >= 0 && l.created_at) {
      return new Date(l.created_at).getMonth() === mesIdx
    }
    return false
  })

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-primary text-lg">Carregando levantamentos...</div>
    </div>
  )

  // ── DETALHE ────────────────────────────────────────────────
  if (detalhe) {
    const ambsDetalhe = ambientes.filter(a => a.levantamento_id === detalhe.id).sort((a, b) => a.ordem - b.ordem)
    const itensDetalhe = itens.filter(i => i.levantamento_id === detalhe.id)
    const podeEditar = podeEditarLevantamento(detalhe)
    const souCriadorOuAdmin = souAdmin || detalhe.criado_por === meuId
    const pendentesDoLevantamento = souCriadorOuAdmin ? solicitacoesDoLevantamento(detalhe.id).filter(s => s.status === 'pendente') : []
    const jaTemSolicitacaoMinha = !!meuId && solicitacoesDoLevantamento(detalhe.id).some(s => s.solicitante_id === meuId && s.status !== 'negado')

    return (
      <Layout userEmail={userEmail} onLogout={sair}>
        {pendentesDoLevantamento.length > 0 && (
          <div className="bg-tertiary/10 border border-tertiary/30 rounded-xl p-4 mb-lg">
            <div className="text-sm font-bold text-tertiary mb-2">🔔 Solicitações de edição pendentes</div>
            {pendentesDoLevantamento.map(s => (
              <div key={s.id} className="flex justify-between items-center py-1.5">
                <span className="text-sm text-on-surface">{s.solicitante_nome || 'Alguém'} pediu para editar este levantamento</span>
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
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${STATUS_BADGE[detalhe.status] || STATUS_BADGE.em_andamento}`}>{STATUS_LEVA[detalhe.status] || detalhe.status}</span>
              {!podeEditar && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-on-surface-variant/10 text-on-surface-variant border-on-surface-variant/20">🔒 Somente leitura</span>}
            </div>
            <h1 className="text-headline-md font-headline text-on-surface">{detalhe.nome || detalhe.cliente}</h1>
            <p className="text-body-sm text-on-surface-variant">{detalhe.cliente}{detalhe.endereco ? ' · 📍 ' + detalhe.endereco : ''}</p>
          </div>
          <div className="flex gap-2 flex-wrap items-start">
            {podeEditar ? (
              <select value={detalhe.status}
                onChange={async e => { await editar('levantamentos', detalhe.id, { status: e.target.value }); setDetalhe({ ...detalhe, status: e.target.value }); carregar() }}
                className={inputCls + ' w-auto text-xs py-1.5'}>
                {Object.entries(STATUS_LEVA).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
            ) : !jaTemSolicitacaoMinha ? (
              <button className={btnSecondaryCls} onClick={solicitarPermissao}>🔒 Solicitar permissão de edição</button>
            ) : (
              <span className="text-xs text-on-surface-variant px-3 py-2">Solicitação enviada, aguardando aprovação</span>
            )}
            <button className="bg-secondary text-on-secondary rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer" onClick={verOrcamentoVinculado}>🔗 Ver Orçamento Vinculado</button>
            <button className="bg-surface-container-high border border-outline-variant text-on-surface rounded-lg px-4 py-2.5 text-sm font-bold hover:bg-surface-variant transition-all cursor-pointer" onClick={() => gerarPDFLevantamento(detalhe, ambsDetalhe, itensDetalhe)}>🖨️ Gerar Relatório PDF</button>
            <button className="bg-primary-container text-on-primary-container rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer" onClick={() => gerarPropostaCompleta(detalhe, ambsDetalhe, itensDetalhe)}>📄 Gerar Proposta Completa</button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-lg">
          {[
            ['Ambientes', ambsDetalhe.length, 'text-primary'],
            ['Itens/Serviços', itensDetalhe.length, 'text-tertiary'],
            ['Responsável', detalhe.responsavel || '—', 'text-secondary'],
          ].map(([l, v, c]) => (
            <div key={l as string} className={cardCls}>
              <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-2">{l}</div>
              <div className={`font-bold ${c} ${typeof v === 'number' ? 'text-2xl' : 'text-base'}`}>{v}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-lg flex-wrap">
          <button className={abaDetalhe === 'ambientes' ? tabActiveCls : tabInactiveCls} onClick={() => setAbaDetalhe('ambientes')}>🏠 Ambientes e Serviços</button>
          <button className={abaDetalhe === 'resumo' ? tabActiveCls : tabInactiveCls} onClick={() => setAbaDetalhe('resumo')}>📋 Resumo Geral</button>
          <button className={abaDetalhe === 'arquivos' ? tabActiveCls : tabInactiveCls} onClick={() => setAbaDetalhe('arquivos')}>📎 Arquivos</button>
        </div>

        {abaDetalhe === 'ambientes' && (
          <div className={sectionCls}>
            <div className="flex justify-between items-center mb-5">
              <div>
                <div className="text-sm font-bold text-on-surface">🏠 Ambientes</div>
                <div className="text-[11px] text-on-surface-variant mt-0.5">Clique em um ambiente para adicionar serviços</div>
              </div>
              {podeEditar && <button className={btnPrimaryCls} onClick={() => { setFAmb({ nome: '', nomeCustom: '' }); setJanela('ambiente') }}>+ Novo Ambiente</button>}
            </div>

            {ambsDetalhe.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">🏠</div>
                <div className="text-body-sm text-on-surface-variant mb-4">Nenhum ambiente cadastrado ainda</div>
                {podeEditar && <button className={btnPrimaryCls} onClick={() => { setFAmb({ nome: '', nomeCustom: '' }); setJanela('ambiente') }}>+ Adicionar primeiro ambiente</button>}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {ambsDetalhe.map(amb => {
                  const itensAmb = itens.filter(i => i.ambiente === amb.id)
                  const isAtivo = ambienteAtivo?.id === amb.id
                  return (
                    <div key={amb.id} className={`rounded-xl overflow-hidden border ${isAtivo ? 'border-primary bg-primary/5' : 'border-outline-variant bg-background'}`}>
                      <div className={`flex justify-between items-center px-4 py-3.5 cursor-pointer ${isAtivo ? 'bg-primary/10' : 'bg-surface-container'}`}
                        onClick={() => setAmbienteAtivo(isAtivo ? null : amb)}>
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">🏠</span>
                          <div>
                            <div className={`font-bold text-sm ${isAtivo ? 'text-primary' : 'text-on-surface'}`}>{amb.nome}</div>
                            <div className="text-[11px] text-on-surface-variant">{itensAmb.length} serviço(s)</div>
                          </div>
                        </div>
                        <div className="flex gap-1.5 items-center">
                          <span className="text-[11px] text-on-surface-variant">{isAtivo ? '▲' : '▼'}</span>
                          {podeEditar && <button className={btnDangerSmCls} onClick={e => { e.stopPropagation(); excluirAmbienteLevantamento(amb) }}>×</button>}
                        </div>
                      </div>

                      {isAtivo && (
                        <div className="p-4">
                          {podeEditar && (
                            <div className="flex justify-end mb-3">
                              <button className={btnPrimaryCls} onClick={() => {
                                setFItem({ servico: '', descricao: '', comprimento: '', largura: '', altura: '', area: '', unidade: 'm²', observacao: '', foto_url: '', banco_item_id: '', categoria: '' })
                                setArquivoFoto(null); setEditItem(null); setJanela('item')
                              }}>+ Adicionar Serviço</button>
                            </div>
                          )}

                          {itensAmb.length === 0 ? (
                            <div className="text-center py-6 text-on-surface-variant text-sm">Nenhum serviço neste ambiente ainda</div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse text-sm">
                                <thead>
                                  <tr className="border-b border-outline-variant">
                                    {['Foto', 'Serviço', 'Descrição', 'C(m)', 'L(m)', 'A(m)', 'Área', 'Un', 'Obs', ''].map(h => (
                                      <th key={h} className="text-left px-2.5 py-2 text-[10px] text-on-surface-variant uppercase bg-surface-container-high whitespace-nowrap">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {itensAmb.map(item => (
                                    <tr key={item.id} className="border-b border-outline-variant hover:bg-surface-variant/20">
                                      <td className="px-2.5 py-2.5">
                                        {item.foto_url ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img src={item.foto_url} alt={item.servico} className="w-10 h-10 object-cover rounded-md border border-outline-variant" />
                                        ) : (
                                          <div className="w-10 h-10 rounded-md border border-outline-variant bg-surface-container-low flex items-center justify-center text-on-surface-variant/40 text-xs">—</div>
                                        )}
                                      </td>
                                      <td className="px-2.5 py-2.5 font-semibold text-on-surface">{item.servico}</td>
                                      <td className="px-2.5 py-2.5 text-on-surface-variant text-xs">{item.descricao || '—'}</td>
                                      <td className="px-2.5 py-2.5 text-on-surface-variant text-xs">{item.comprimento || '—'}</td>
                                      <td className="px-2.5 py-2.5 text-on-surface-variant text-xs">{item.largura || '—'}</td>
                                      <td className="px-2.5 py-2.5 text-on-surface-variant text-xs">{item.altura || '—'}</td>
                                      <td className="px-2.5 py-2.5 font-semibold text-primary">{item.area ? item.area + ' ' + item.unidade : '—'}</td>
                                      <td className="px-2.5 py-2.5 text-on-surface-variant text-xs">{item.unidade}</td>
                                      <td className="px-2.5 py-2.5 text-on-surface-variant text-[11px] max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">{item.observacao || '—'}</td>
                                      <td className="px-2.5 py-2.5">
                                        {podeEditar && (
                                          <div className="flex gap-1">
                                            <button className={btnEditSmCls} onClick={() => {
                                              setFItem({ servico: item.servico, descricao: item.descricao || '', comprimento: item.comprimento || '', largura: item.largura || '', altura: item.altura || '', area: item.area || '', unidade: item.unidade || 'm²', observacao: item.observacao || '', foto_url: item.foto_url || '', banco_item_id: item.banco_item_id || '', categoria: item.categoria || '' })
                                              setArquivoFoto(null); setEditItem(item); setJanela('item')
                                            }}>✏️</button>
                                            <button className={btnDangerSmCls} onClick={() => excluirItemLevantamento(item)}>×</button>
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {abaDetalhe === 'resumo' && (
          <div className={sectionCls}>
            <div className="text-sm font-bold text-on-surface mb-5">📋 Resumo do Levantamento</div>
            {ambsDetalhe.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant">Nenhum ambiente cadastrado</div>
            ) : ambsDetalhe.map(amb => {
              const itensAmb = itens.filter(i => i.ambiente === amb.id)
              return (
                <div key={amb.id} className="mb-5 pb-5 border-b border-outline-variant last:border-0">
                  <div className="text-sm font-bold text-primary mb-2.5">🏠 {amb.nome}</div>
                  {itensAmb.length === 0 ? (
                    <div className="text-xs text-on-surface-variant/50">Nenhum serviço</div>
                  ) : itensAmb.map(item => (
                    <div key={item.id} className="flex justify-between items-start py-2 border-b border-outline-variant/30 last:border-0 gap-3">
                      {item.foto_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.foto_url} alt={item.servico} className="w-12 h-12 object-cover rounded-md border border-outline-variant shrink-0" />
                      )}
                      <div className="flex-1">
                        <div className="font-semibold text-sm text-on-surface">{item.servico}</div>
                        {item.descricao && <div className="text-[11px] text-on-surface-variant mt-0.5">{item.descricao}</div>}
                        {item.observacao && <div className="text-[11px] text-tertiary mt-0.5">⚠️ {item.observacao}</div>}
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        {item.area ? (
                          <div className="font-bold text-primary">{item.area} {item.unidade}</div>
                        ) : item.comprimento ? (
                          <div className="text-[11px] text-on-surface-variant">{item.comprimento}m × {item.largura}m{item.altura ? ' × ' + item.altura + 'm' : ''}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
            <div className="mt-4 p-4 bg-surface-container-low rounded-lg">
              <div className="flex gap-6">
                <div><div className="text-[10px] text-on-surface-variant mb-1">TOTAL AMBIENTES</div><div className="text-xl font-bold text-primary">{ambsDetalhe.length}</div></div>
                <div><div className="text-[10px] text-on-surface-variant mb-1">TOTAL SERVIÇOS</div><div className="text-xl font-bold text-tertiary">{itensDetalhe.length}</div></div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button className="w-full bg-secondary text-on-secondary rounded-lg py-3 text-sm font-bold hover:opacity-90 transition-all cursor-pointer" onClick={verOrcamentoVinculado}>
                🔗 Ver Orçamento Vinculado
              </button>
              <button className="w-full bg-primary-container text-on-primary-container rounded-lg py-3 text-sm font-bold hover:opacity-90 transition-all cursor-pointer" onClick={() => gerarPropostaCompleta(detalhe, ambsDetalhe, itensDetalhe)}>
                📄 Gerar Proposta Completa
              </button>
            </div>
          </div>
        )}

        {abaDetalhe === 'arquivos' && (() => {
          const arquivosDetalhe = arquivos.filter(a => a.levantamento_id === detalhe.id)
          const iconeArquivo = (tipo: string) => {
            if (!tipo) return '📄'
            if (tipo.startsWith('image/')) return '🖼️'
            if (tipo === 'application/pdf') return '📕'
            if (tipo.includes('spreadsheet') || tipo.includes('excel')) return '📊'
            if (tipo.includes('word') || tipo.includes('document')) return '📝'
            return '📄'
          }
          return (
          <div className={sectionCls}>
            <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
              <div>
                <div className="text-sm font-bold text-on-surface">📎 Arquivos do Levantamento</div>
                <div className="text-[11px] text-on-surface-variant mt-0.5">Plantas, documentos e outros arquivos relacionados</div>
              </div>
            </div>
            {podeEditar && (
              <div className="flex items-center gap-2.5 mb-5 p-3.5 bg-surface-container-low rounded-lg border border-outline-variant">
                <input
                  type="file"
                  onChange={e => setArquivoUpload(e.target.files?.[0] || null)}
                  className="flex-1 bg-surface-container border border-outline-variant rounded-lg text-on-surface-variant text-xs px-2 py-2 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-primary/10 file:text-primary file:text-xs file:font-semibold cursor-pointer"
                />
                <button className={btnPrimaryCls} onClick={salvarArquivo} disabled={!arquivoUpload || enviandoArquivo}>
                  {enviandoArquivo ? 'Enviando...' : '+ Enviar'}
                </button>
              </div>
            )}
            {arquivosDetalhe.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">📎</div>
                <div className="text-body-sm text-on-surface-variant">Nenhum arquivo anexado ainda</div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {arquivosDetalhe.map(arq => (
                  <div key={arq.id} className="flex justify-between items-center px-3.5 py-3 bg-surface-container-low rounded-lg border border-outline-variant">
                    <a href={arq.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 flex-1 min-w-0 hover:text-primary transition-colors">
                      <span className="text-xl shrink-0">{iconeArquivo(arq.tipo)}</span>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-on-surface truncate">{arq.nome}</div>
                        <div className="text-[11px] text-on-surface-variant">{arq.created_at ? new Date(arq.created_at).toLocaleDateString('pt-BR') : ''}</div>
                      </div>
                    </a>
                    {podeEditar && <button className={btnDangerSmCls} onClick={() => removerArquivo(arq.id)}>×</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
          )
        })()}

        {janela === 'ambiente' && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[560px] max-h-[92vh] overflow-y-auto">
              <div className="text-base font-bold text-on-surface mb-5">🏠 Novo Ambiente</div>
              <div className="mb-3.5">
                <label className={labelCls}>Ambiente</label>
                <select className={inputCls} value={fAmb.nome} onChange={e => setFAmb({ ...fAmb, nome: e.target.value })}>
                  <option value="">Selecione ou digite abaixo</option>
                  {AMBIENTES_COMUNS.map(a => <option key={a} value={a}>{a}</option>)}
                  <option value="__custom__">+ Outro (digitar)</option>
                </select>
              </div>
              {fAmb.nome === '__custom__' && (
                <div className="mb-3.5">
                  <label className={labelCls}>Nome personalizado</label>
                  <input className={inputCls} placeholder="Ex: Área Gourmet" value={fAmb.nomeCustom} onChange={e => setFAmb({ ...fAmb, nomeCustom: e.target.value })} />
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button className={btnSecondaryCls} onClick={() => setJanela(null)}>Cancelar</button>
                <button className={btnPrimaryCls} onClick={salvarAmbiente}>Adicionar Ambiente</button>
              </div>
            </div>
          </div>
        )}

        {janela === 'item' && (() => {
          const usaMedidas = fItem.unidade === 'm²' || fItem.unidade === 'm³'
          return (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[560px] max-h-[92vh] overflow-y-auto">
              <div className="text-base font-bold text-on-surface mb-1.5">{editItem ? '✏️ Editar Serviço' : '🔧 Novo Serviço'}</div>
              <div className="text-body-sm text-primary mb-5">Ambiente: {ambienteAtivo?.nome}</div>
              <div className="mb-3.5">
                <label className={labelCls}>Serviço *</label>
                <select className={inputCls} value={fItem.banco_item_id || (fItem.servico ? '__custom__' : '')}
                  onChange={e => {
                    const v = e.target.value
                    if (v === '' || v === '__custom__') {
                      setFItem({ ...fItem, banco_item_id: '', servico: v === '__custom__' ? '' : fItem.servico })
                    } else {
                      const bi = bancoItens.find(b => b.id === v)
                      if (bi) setFItem({ ...fItem, banco_item_id: bi.id, servico: bi.nome, categoria: bi.categoria || '', unidade: bi.unidade || fItem.unidade })
                    }
                  }}>
                  <option value="">Selecione do banco de itens ou "Outro"</option>
                  {bancoItens.map(b => <option key={b.id} value={b.id}>{b.nome}{b.categoria ? ' — ' + b.categoria : ''}</option>)}
                  <option value="__custom__">+ Outro (digitar)</option>
                </select>
              </div>
              {!fItem.banco_item_id && (
                <div className="mb-3.5">
                  <label className={labelCls}>Nome do serviço (personalizado)</label>
                  <input className={inputCls} placeholder="Ex: Pintura das paredes, Troca do piso..." value={fItem.servico} onChange={e => setFItem({ ...fItem, servico: e.target.value })} />
                </div>
              )}
              <div className="mb-3.5">
                <label className={labelCls}>Categoria {fItem.banco_item_id ? '(definida pelo banco de itens)' : ''}</label>
                <select className={inputCls} value={fItem.categoria} disabled={!!fItem.banco_item_id}
                  onChange={e => setFItem({ ...fItem, categoria: e.target.value })}>
                  <option value="">Selecione</option>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="mb-3.5">
                <label className={labelCls}>Descrição</label>
                <input className={inputCls} placeholder="Ex: Tinta acrílica cor branco neve, 2 demãos" value={fItem.descricao} onChange={e => setFItem({ ...fItem, descricao: e.target.value })} />
              </div>
              <div className="mb-3.5 flex items-center gap-3">
                <div className="w-16 h-16 rounded-lg bg-surface-container-low border border-outline-variant flex items-center justify-center overflow-hidden shrink-0">
                  {arquivoFoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={URL.createObjectURL(arquivoFoto)} alt="Prévia" className="w-full h-full object-cover" />
                  ) : fItem.foto_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fItem.foto_url} alt="Foto atual" className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-on-surface-variant/40">photo_camera</span>
                  )}
                </div>
                <div className="flex-1">
                  <label className={labelCls}>Foto do serviço</label>
                  <input
                    type="file" accept="image/*"
                    onChange={e => setArquivoFoto(e.target.files?.[0] || null)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface-variant text-xs px-2 py-2 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-primary/10 file:text-primary file:text-xs file:font-semibold cursor-pointer"
                  />
                </div>
              </div>
              {usaMedidas ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3.5">
                  <div>
                    <label className={labelCls}>Comprim. (m)</label>
                    <input className={inputCls} type="text" inputMode="decimal" placeholder="0,00" value={fItem.comprimento}
                      onChange={e => {
                        const c = e.target.value
                        setFItem({ ...fItem, comprimento: c, area: calcularArea(fItem.unidade, c, fItem.largura, fItem.altura) })
                      }} />
                  </div>
                  <div>
                    <label className={labelCls}>Largura (m)</label>
                    <input className={inputCls} type="text" inputMode="decimal" placeholder="0,00" value={fItem.largura}
                      onChange={e => {
                        const l = e.target.value
                        setFItem({ ...fItem, largura: l, area: calcularArea(fItem.unidade, fItem.comprimento, l, fItem.altura) })
                      }} />
                  </div>
                  <div>
                    <label className={labelCls}>Altura (m)</label>
                    <input className={inputCls} type="text" inputMode="decimal" placeholder="0,00" value={fItem.altura}
                      onChange={e => {
                        const a = e.target.value
                        setFItem({ ...fItem, altura: a, area: calcularArea(fItem.unidade, fItem.comprimento, fItem.largura, a) })
                      }} />
                  </div>
                  <div>
                    <label className={labelCls}>Unidade</label>
                    <select className={inputCls} value={fItem.unidade}
                      onChange={e => {
                        const u = e.target.value
                        setFItem({ ...fItem, unidade: u, area: calcularArea(u, fItem.comprimento, fItem.largura, fItem.altura) })
                      }}>
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 mb-3.5">
                  <div>
                    <label className={labelCls}>Quantidade</label>
                    <input className={inputCls} type="text" inputMode="decimal" placeholder="0,00" value={fItem.area} onChange={e => setFItem({ ...fItem, area: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Unidade</label>
                    <select className={inputCls} value={fItem.unidade}
                      onChange={e => {
                        const u = e.target.value
                        setFItem({ ...fItem, unidade: u, comprimento: '', largura: '', altura: '' })
                      }}>
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {usaMedidas && (
                <div className="mb-3.5">
                  <label className={labelCls}>Área / Quantidade calculada</label>
                  <input className={inputCls + ' text-primary font-bold'} placeholder="Calculado automaticamente ou digite" value={fItem.area} onChange={e => setFItem({ ...fItem, area: e.target.value })} />
                  {fItem.unidade === 'm²' && fItem.comprimento && (fItem.altura || fItem.largura) && (
                    <div className="text-[11px] text-on-surface-variant mt-1">Calculado: {fItem.comprimento}m × {fItem.altura || fItem.largura}m{fItem.altura ? ' (altura)' : ' (largura)'} = {calcularArea(fItem.unidade, fItem.comprimento, fItem.largura, fItem.altura)} m²</div>
                  )}
                  {fItem.unidade === 'm³' && fItem.comprimento && fItem.largura && fItem.altura && (
                    <div className="text-[11px] text-on-surface-variant mt-1">Calculado: {fItem.comprimento}m × {fItem.largura}m × {fItem.altura}m = {calcularArea(fItem.unidade, fItem.comprimento, fItem.largura, fItem.altura)} m³</div>
                  )}
                </div>
              )}
              <div className="mb-5">
                <label className={labelCls}>Observação técnica</label>
                <input className={inputCls + (fItem.observacao ? ' border-tertiary/40' : '')} placeholder="Ex: Infiltração detectada, verificar antes de iniciar" value={fItem.observacao} onChange={e => setFItem({ ...fItem, observacao: e.target.value })} />
              </div>
              <div className="flex gap-2 justify-end">
                <button className={btnSecondaryCls} onClick={() => { setJanela(null); setEditItem(null); setArquivoFoto(null) }}>Cancelar</button>
                <button className={btnPrimaryCls} onClick={salvarItem} disabled={enviandoFoto}>{enviandoFoto ? 'Enviando foto...' : editItem ? 'Salvar Alterações' : 'Adicionar Serviço'}</button>
              </div>
            </div>
          </div>
        )})()}
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
            placeholder="Buscar por nome, cliente, obra, código, mês ou ano..."
            className="w-full bg-surface-container-low border border-outline-variant rounded-full pl-12 pr-4 py-2 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
          />
        </div>
      }
      topbarSlot={
        <>
          <button
            onClick={() => { setFLev({ codigo: '', nome: '', cliente: '', endereco: '', responsavel: '', status: 'em_andamento', observacao: '', obra_id: '', cliente_email: '', cliente_telefone: '' }); setJanela('levantamento') }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl hover:opacity-90 transition-all font-label-md text-label-md shadow-lg shadow-primary/20"
          >
            <span className="material-symbols-outlined text-[20px]">add_circle</span>
            Novo Levantamento
          </button>
        </>
      }
    >
      <div className="mb-lg">
        <h2 className="font-headline text-headline-lg text-on-surface">Levantamento Técnico</h2>
        <p className="text-body-md text-on-surface-variant max-w-2xl">Gerencie e visualize as vistorias de campo, medições e registros técnicos de todas as suas obras ativas.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-lg">
        {[
          ['Total', levantamentos.length, 'text-primary'],
          ['Em Andamento', levantamentos.filter(l => l.status === 'em_andamento').length, 'text-tertiary'],
          ['Concluídos', levantamentos.filter(l => l.status === 'concluido').length, 'text-primary-container'],
        ].map(([l, v, c]) => (
          <div key={l as string} className={cardCls}>
            <div className="text-[11px] text-on-surface-variant uppercase tracking-widest mb-2">{l}</div>
            <div className={`text-2xl font-bold ${c}`}>{v}</div>
          </div>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className={sectionCls + ' text-center py-16'}>
          <div className="text-5xl mb-4">📐</div>
          <div className="text-base font-bold text-on-surface mb-4">{levantamentos.length === 0 ? 'Nenhum levantamento ainda' : 'Nenhum resultado'}</div>
          {levantamentos.length === 0 && <button className={btnPrimaryCls} onClick={() => setJanela('levantamento')}>+ Criar primeiro levantamento</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
          {lista.map(lev => {
            const ambsLev = ambientes.filter(a => a.levantamento_id === lev.id)
            const itensLev = itens.filter(i => i.levantamento_id === lev.id)
            return (
              <div key={lev.id}
                onClick={() => { setDetalhe(lev); setAmbienteAtivo(null); setAbaDetalhe('ambientes') }}
                className="bg-surface-container border border-outline-variant hover:border-primary transition-all duration-300 rounded-xl overflow-hidden cursor-pointer">
                <div className="p-lg">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border uppercase ${STATUS_BADGE[lev.status] || STATUS_BADGE.em_andamento}`}>{STATUS_LEVA[lev.status] || lev.status}</span>
                    <span className="font-data-mono text-on-surface-variant text-body-sm">#{lev.codigo}</span>
                  </div>
                  <h4 className="font-headline text-headline-sm text-on-surface mb-1">{lev.nome || lev.cliente}</h4>
                  {lev.nome && <div className="text-on-surface-variant text-body-sm mb-1">{lev.cliente}</div>}
                  {lev.endereco && (
                    <div className="flex items-center gap-1.5 text-on-surface-variant text-body-sm">
                      <span className="material-symbols-outlined text-[16px] text-primary">location_on</span>
                      <span>{lev.endereco}</span>
                    </div>
                  )}
                  {lev.responsavel && (
                    <div className="flex items-center gap-1.5 text-on-surface-variant text-body-sm mt-1">
                      <span className="material-symbols-outlined text-[16px]">person</span>
                      <span>{lev.responsavel}</span>
                    </div>
                  )}
                </div>
                <div className="bg-surface-container-low px-lg py-3 flex justify-between items-center">
                  <div className="flex gap-lg">
                    <div className="flex items-center gap-2">
                      <div className="bg-surface-container-high p-1.5 rounded-lg">
                        <span className="material-symbols-outlined text-primary text-[18px]">meeting_room</span>
                      </div>
                      <div>
                        <p className="text-body-md font-bold text-on-surface">{ambsLev.length}</p>
                        <p className="text-label-sm text-on-surface-variant">Ambientes</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 border-l border-outline-variant pl-lg">
                      <div className="bg-surface-container-high p-1.5 rounded-lg">
                        <span className="material-symbols-outlined text-tertiary text-[18px]">construction</span>
                      </div>
                      <div>
                        <p className="text-body-md font-bold text-on-surface">{itensLev.length}</p>
                        <p className="text-label-sm text-on-surface-variant">Serviços</p>
                      </div>
                    </div>
                  </div>
                  <button className="bg-surface-container-highest text-on-surface px-4 py-2 rounded-lg text-label-md hover:bg-primary hover:text-on-primary transition-all flex items-center gap-2">
                    Ver Detalhes
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {janela === 'levantamento' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[560px] max-h-[92vh] overflow-y-auto">
            <div className="text-base font-bold text-on-surface mb-5">📐 Novo Levantamento</div>
            <div className="grid grid-cols-2 gap-3 mb-3.5">
              <div>
                <label className={labelCls}>Código</label>
                <input className={inputCls} placeholder={gerarCodigo(levantamentos)} value={fLev.codigo} onChange={e => setFLev({ ...fLev, codigo: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select className={inputCls} value={fLev.status} onChange={e => setFLev({ ...fLev, status: e.target.value })}>
                  {Object.entries(STATUS_LEVA).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Nome do Levantamento</label>
              <input className={inputCls} placeholder="Ex: Levantamento Fachada, Vistoria Reforma Cozinha" value={fLev.nome} onChange={e => setFLev({ ...fLev, nome: e.target.value })} />
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Cliente *</label>
              <input className={inputCls} placeholder="Nome do cliente" value={fLev.cliente} onChange={e => setFLev({ ...fLev, cliente: e.target.value })} />
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Endereço do imóvel</label>
              <input className={inputCls} placeholder="Rua, número, bairro, cidade" value={fLev.endereco} onChange={e => setFLev({ ...fLev, endereco: e.target.value })} />
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Obra vinculada (opcional)</label>
              <select className={inputCls} value={fLev.obra_id} onChange={e => setFLev({ ...fLev, obra_id: e.target.value })}>
                <option value="">Nenhuma / cliente novo</option>
                {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
              <div>
                <label className={labelCls}>E-mail do cliente</label>
                <input className={inputCls} type="email" placeholder="cliente@empresa.com" value={fLev.cliente_email} onChange={e => setFLev({ ...fLev, cliente_email: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Telefone do cliente</label>
                <input className={inputCls} placeholder="(11) 90000-0000" value={fLev.cliente_telefone} onChange={e => setFLev({ ...fLev, cliente_telefone: e.target.value })} />
              </div>
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Responsável pelo levantamento</label>
              <input className={inputCls} placeholder="Nome do técnico" value={fLev.responsavel} onChange={e => setFLev({ ...fLev, responsavel: e.target.value })} />
            </div>
            <div className="mb-5">
              <label className={labelCls}>Observações gerais</label>
              <input className={inputCls} placeholder="Informações relevantes sobre o imóvel" value={fLev.observacao} onChange={e => setFLev({ ...fLev, observacao: e.target.value })} />
            </div>
            <div className="flex gap-2 justify-end">
              <button className={btnSecondaryCls} onClick={() => setJanela(null)}>Cancelar</button>
              <button className={btnPrimaryCls} onClick={salvarLevantamento}>Criar Levantamento</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
