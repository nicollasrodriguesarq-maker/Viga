'use client'
import { useEffect, useState } from 'react'
import MobileShell from '../components/MobileShell'
import { obterMinhasPermissoesApp, temAcessoModuloApp } from '../../lib/permissoes'

const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': 'Bearer ' + ANON }

async function buscar(tabela: string, q = '') {
  try { const r = await fetch(BASE + '/' + tabela + q, { headers: H }); const d = await r.json(); return Array.isArray(d) ? d : [] } catch { return [] }
}
async function criar(tabela: string, dados: object) {
  try { const r = await fetch(BASE + '/' + tabela, { method: 'POST', headers: { ...H, 'Prefer': 'return=representation' }, body: JSON.stringify(dados) }); const d = await r.json(); return Array.isArray(d) ? d[0] : d } catch { return null }
}
async function editar(tabela: string, id: string, dados: object) {
  try { await fetch(BASE + '/' + tabela + '?id=eq.' + id, { method: 'PATCH', headers: H, body: JSON.stringify(dados) }) } catch {}
}
async function remover(tabela: string, id: string) {
  try { await fetch(BASE + '/' + tabela + '?id=eq.' + id, { method: 'DELETE', headers: H }) } catch {}
}

async function uploadFotoServico(file: File): Promise<string | null> {
  try {
    const ext = file.name.split('.').pop()
    const nome = `foto_${Date.now()}.${ext}`
    const r = await fetch(`${BASE.replace('/rest/v1', '')}/storage/v1/object/levantamento-fotos/${nome}`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': file.type },
      body: file,
    })
    if (r.ok) return `${BASE.replace('/rest/v1', '')}/storage/v1/object/public/levantamento-fotos/${nome}`
    return null
  } catch { return null }
}

const num = (v: string) => parseFloat(String(v || '0').replace(',', '.')) || 0
function calcularArea(unidade: string, comprimento: string, largura: string, altura: string): string {
  const c = num(comprimento), l = num(largura), a = num(altura)
  if (unidade === 'm²') { if (c && a) return (c * a).toFixed(2); if (c && l) return (c * l).toFixed(2); return '' }
  if (unidade === 'm³') { if (c && l && a) return (c * l * a).toFixed(2); return '' }
  return ''
}

const STATUS_LEVA: Record<string, string> = { em_andamento: 'Em Andamento', concluido: 'Concluído', cancelado: 'Cancelado' }
const UNIDADES = ['m²', 'm³', 'ml', 'un', 'vb', 'cj', 'kg', 'hr']
const AMBIENTES_COMUNS = ['Sala de Estar', 'Sala de Jantar', 'Cozinha', 'Quarto 1', 'Quarto 2', 'Quarto 3', 'Banheiro Social', 'Banheiro Suíte', 'Área de Serviço', 'Varanda', 'Fachada', 'Área Externa', 'Corredor', 'Hall', 'Escritório', 'Garagem']
// Ordem = sequência real de execução de obra (usada para ordenar/agrupar itens e etapas).
const CATEGORIAS = ['Serviços Preliminares', 'Demolição e Remoção', 'Terraplanagem e Fundação', 'Estrutura', 'Alvenaria', 'Cobertura', 'Impermeabilização', 'Instalações Elétricas', 'Instalações Hidráulicas', 'Instalações de Gás', 'Instalações de Incêndio', 'Climatização (AC)', 'Revestimento de Parede', 'Revestimento de Piso', 'Forro', 'Esquadrias', 'Vidraçaria', 'Serralheria', 'Marmoraria', 'Louças e Metais', 'Marcenaria', 'Pintura', 'Mobiliário', 'Paisagismo', 'Limpeza Pós-Obra', 'Outros']

// Usa o maior número já usado (não a contagem) — se algum levantamento do ano foi
// excluído, contar de novo geraria um código repetido e o insert seria rejeitado (409).
function gerarCodigo(lista: any[]) {
  const a = new Date().getFullYear()
  const prefixo = 'LEV-' + a + '-'
  const maior = lista.reduce((m, l) => {
    if (!l.codigo?.startsWith(prefixo)) return m
    const n = parseInt(l.codigo.slice(prefixo.length), 10)
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return prefixo + String(maior + 1).padStart(3, '0')
}

const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const labelCls = 'text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5'
const btnPrimaryCls = 'bg-primary text-on-primary rounded-lg px-4 py-3 text-sm font-bold hover:opacity-90 transition-all cursor-pointer w-full'
const btnSecondaryCls = 'bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg px-4 py-3 text-sm cursor-pointer w-full'
const moeda = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Botão flutuante injetado em todo PDF gerado pelo app — sem ele o usuário fica preso na
// tela do PDF sem como voltar, já que o app roda como PWA instalado (sem barra do navegador).
function botaoVoltarApp(path: string) {
  return `<div class="voltar-app" style="position:fixed;top:12px;left:12px;z-index:99999">
    <a href="${path}" style="display:inline-flex;align-items:center;gap:6px;background:#1B3A5C;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:13px;font-weight:700;padding:10px 18px;border-radius:24px;box-shadow:0 2px 10px rgba(0,0,0,.3)">← Voltar ao App</a>
  </div>
  <style>@media print { .voltar-app { display:none !important } }</style>`
}

const FLEV_VAZIO = { codigo: '', nome: '', cliente: '', endereco: '', responsavel: '', status: 'em_andamento', obra_id: '', cliente_email: '', cliente_telefone: '', tipo_execucao: 'obra' }
const TIPOS_EXECUCAO = [{ v: 'obra', l: '🏗️ Execução de Obra' }, { v: 'projeto', l: '📐 Execução de Projeto' }]
const EXECUCAO_NOME: Record<string, string> = { obra: '🏗️ Obra', projeto: '📐 Projeto' }
const FITEM_VAZIO = { servico: '', descricao: '', comprimento: '', largura: '', altura: '', area: '', unidade: 'm²', observacao: '', foto_url: '', banco_item_id: '', categoria: '' }
const FAMB_VAZIO = { nome: '', nomeCustom: '' }

export default function LevantamentoMobile() {
  const [levantamentos, setLevantamentos] = useState<any[]>([])
  const [ambientes, setAmbientes] = useState<any[]>([])
  const [itens, setItens] = useState<any[]>([])
  const [obras, setObras] = useState<any[]>([])
  const [bancoItens, setBancoItens] = useState<any[]>([])
  const [meuId, setMeuId] = useState('')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [filtroExecucao, setFiltroExecucao] = useState('todos')
  const [detalhe, setDetalhe] = useState<any>(null)
  const [ambienteAtivo, setAmbienteAtivo] = useState<any>(null)
  const [mostrarRegimeProposta, setMostrarRegimeProposta] = useState(false)
  const [regimeProposta, setRegimeProposta] = useState('seg_sex')
  const [propostaAlvo, setPropostaAlvo] = useState<{ lev: any, ambs: any[], itensList: any[] } | null>(null)
  const [tela, setTela] = useState<string | null>(null)
  const [fLev, setFLev] = useState(FLEV_VAZIO)
  const [levantamentoEditando, setLevantamentoEditando] = useState<any>(null)
  const [fAmb, setFAmb] = useState(FAMB_VAZIO)
  const [fItem, setFItem] = useState(FITEM_VAZIO)
  const [editItem, setEditItem] = useState<any>(null)
  const [arquivoFoto, setArquivoFoto] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [fotoCompartilhada, setFotoCompartilhada] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('viga_token')) { window.location.href = '/'; return }
    obterMinhasPermissoesApp().then(perm => {
      if (!temAcessoModuloApp(perm, 'levantamento')) { window.location.href = '/m'; return }
      if (perm) setMeuId(perm.id)
    })
    carregar()
  }, [])

  async function carregar() {
    const [l, a, it, o, b] = await Promise.all([
      buscar('levantamentos', '?order=created_at.desc'),
      buscar('levantamento_ambientes', '?order=ordem'),
      buscar('levantamento_itens', '?order=created_at'),
      buscar('obras', '?select=id,nome,dias_trabalho&order=nome'),
      buscar('banco_itens', '?order=nome'),
    ])
    setLevantamentos(l); setAmbientes(a); setItens(it); setObras(o); setBancoItens(b)
  }

  const filtrados = levantamentos.filter(l => {
    if (filtro !== 'todos' && l.status !== filtro) return false
    if (filtroExecucao !== 'todos' && (l.tipo_execucao || 'obra') !== filtroExecucao) return false
    if (!busca) return true
    const alvo = (l.codigo + ' ' + l.nome + ' ' + l.cliente).toLowerCase()
    return alvo.includes(busca.toLowerCase())
  })

  async function salvarLevantamento() {
    if (!fLev.cliente) return alert('Preencha o nome do cliente')
    const codigo = fLev.codigo || gerarCodigo(levantamentos)
    if (levantamentoEditando) {
      await editar('levantamentos', levantamentoEditando.id, { ...fLev, codigo, obra_id: fLev.obra_id || null })
      const editandoId = levantamentoEditando.id
      setTela('detalhe'); setFLev(FLEV_VAZIO); setLevantamentoEditando(null)
      const l = await buscar('levantamentos', '?order=created_at.desc')
      setLevantamentos(l)
      const atualizado = l.find((x: any) => x.id === editandoId)
      if (atualizado) setDetalhe(atualizado)
      return
    }
    const novo = await criar('levantamentos', { ...fLev, codigo, obra_id: fLev.obra_id || null, criado_por: meuId || null })
    setTela(null); setFLev(FLEV_VAZIO)
    await carregar()
    if (novo?.id) { setDetalhe(novo) }
  }

  function abrirEditarLevantamento(lev: any) {
    setFLev({
      codigo: lev.codigo || '', nome: lev.nome || '', cliente: lev.cliente || '', endereco: lev.endereco || '',
      responsavel: lev.responsavel || '', status: lev.status || 'em_andamento', obra_id: lev.obra_id || '',
      cliente_email: lev.cliente_email || '', cliente_telefone: lev.cliente_telefone || '', tipo_execucao: lev.tipo_execucao || 'obra',
    })
    setLevantamentoEditando(lev)
    setTela('novoLevantamento')
  }

  async function salvarAmbiente() {
    if (!detalhe) return
    const nome = fAmb.nome === '__custom__' ? fAmb.nomeCustom : fAmb.nome
    if (!nome) return alert('Preencha o nome do ambiente')
    const ordem = ambientes.filter(a => a.levantamento_id === detalhe.id).length
    await criar('levantamento_ambientes', { levantamento_id: detalhe.id, nome, ordem })
    setTela('detalhe'); setFAmb(FAMB_VAZIO)
    await carregar()
  }

  function calcularTotalItemOrc(item: any) {
    const valorUnit = (parseFloat(item.preco_material || 0) + parseFloat(item.preco_mao_obra || 0)) * (1 + parseFloat(item.lucro_percentual || 0) / 100) * (1 + parseFloat(item.imposto_percentual || 0) / 100)
    return valorUnit * parseFloat(item.quantidade || 1)
  }
  async function atualizarTotaisOrcamento(orcId: string) {
    const todosItens = await buscar('orcamento_itens', '?orcamento_id=eq.' + orcId)
    const tMat = todosItens.reduce((a: number, i: any) => a + parseFloat(i.preco_material || 0) * parseFloat(i.quantidade || 1), 0)
    const tMao = todosItens.reduce((a: number, i: any) => a + parseFloat(i.preco_mao_obra || 0) * parseFloat(i.quantidade || 1), 0)
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
    const novo = await criar('orcamentos', { codigo, levantamento_id: detalhe.id, cliente_nome: detalhe.cliente, endereco: detalhe.endereco, status: 'rascunho', total_material: 0, total_mao_obra: 0, total_geral: 0, desconto: 0 })
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
    // Foto de registro (sem serviço real) não vira item de orçamento.
    if (item.servico === 'Foto') {
      const existentesFoto = await buscar('orcamento_itens', `?levantamento_item_id=eq.${item.id}`)
      for (const oi of existentesFoto) await remover('orcamento_itens', oi.id)
      return
    }
    const oaId = await ambienteOrcamentoEspelhado(ambiente, orcId)
    if (!oaId) return
    const bi = item.banco_item_id ? bancoItens.find(b => b.id === item.banco_item_id) : null
    const qtd = parseFloat(item.area || 1) || 1
    const dadosOI = {
      orcamento_id: orcId, ambiente_id: oaId, servico: item.servico, descricao: item.descricao,
      quantidade: qtd, unidade: item.unidade,
      preco_material: bi ? bi.preco_material : 0, preco_mao_obra: bi ? bi.preco_mao_obra : 0,
      lucro_percentual: bi ? bi.lucro_percentual : 0, imposto_percentual: bi ? bi.imposto_percentual : 0,
      banco_item_id: item.banco_item_id || null, levantamento_item_id: item.id,
    }
    const totalItem = calcularTotalItemOrc(dadosOI)
    const existentesItem = await buscar('orcamento_itens', `?levantamento_item_id=eq.${item.id}`)
    if (existentesItem[0]) { await editar('orcamento_itens', existentesItem[0].id, { ...dadosOI, total_item: totalItem }) }
    else { await criar('orcamento_itens', { ...dadosOI, total_item: totalItem }) }
    await atualizarTotaisOrcamento(orcId)
  }

  async function selecionarFotoCompartilhada(file: File) {
    setEnviando(true)
    const url = await uploadFotoServico(file)
    setEnviando(false)
    if (url) setFotoCompartilhada(url)
  }

  async function salvarItem() {
    if (!ambienteAtivo || !fItem.servico) return alert('Preencha o serviço')
    const area = fItem.area ? num(fItem.area) : num(calcularArea(fItem.unidade, fItem.comprimento, fItem.largura, fItem.altura))
    const dados = {
      ambiente: ambienteAtivo.id, levantamento_id: detalhe.id, servico: fItem.servico, descricao: fItem.descricao,
      comprimento: num(fItem.comprimento) || null, largura: num(fItem.largura) || null, altura: num(fItem.altura) || null,
      area: area || null, unidade: fItem.unidade, observacao: fItem.observacao, foto_url: fotoCompartilhada || fItem.foto_url || null,
      banco_item_id: fItem.banco_item_id || null, categoria: fItem.categoria || null,
    }
    let itemSalvo: any
    if (editItem) { await editar('levantamento_itens', editItem.id, dados); itemSalvo = { ...dados, id: editItem.id } }
    else { itemSalvo = await criar('levantamento_itens', dados) }
    setFItem(FITEM_VAZIO)
    if (itemSalvo?.id) await sincronizarItemOrcamento(itemSalvo, ambienteAtivo)
    await carregar()
    if (editItem) { setTela('detalhe'); setEditItem(null); setFotoCompartilhada(null) }
  }

  async function excluirItemLevantamento(item: any) {
    const linked = await buscar('orcamento_itens', `?levantamento_item_id=eq.${item.id}`)
    for (const oi of linked) await remover('orcamento_itens', oi.id)
    await remover('levantamento_itens', item.id)
    if (linked[0]?.orcamento_id) await atualizarTotaisOrcamento(linked[0].orcamento_id)
    await carregar()
  }

  async function excluirAmbienteLevantamento(amb: any) {
    if (!confirm('Excluir ambiente e todos os itens?')) return
    const oaLinked = await buscar('orcamento_ambientes', `?levantamento_ambiente_id=eq.${amb.id}`)
    for (const oa of oaLinked) await remover('orcamento_ambientes', oa.id)
    await remover('levantamento_ambientes', amb.id)
    if (oaLinked[0]?.orcamento_id) await atualizarTotaisOrcamento(oaLinked[0].orcamento_id)
    await carregar()
  }

  async function excluirLevantamento(lev: any) {
    const orcs = await buscar('orcamentos', `?levantamento_id=eq.${lev.id}`)
    if (orcs.some((o: any) => o.obra_id)) {
      alert('Este levantamento já foi convertido em obra e não pode ser excluído. Exclua a obra primeiro, se necessário.')
      return
    }
    if (!confirm(`Excluir o levantamento ${lev.codigo}? Esta ação não pode ser desfeita.`)) return
    const ambs = await buscar('levantamento_ambientes', `?levantamento_id=eq.${lev.id}`)
    const itensLev = await buscar('levantamento_itens', `?levantamento_id=eq.${lev.id}`)
    for (const item of itensLev) {
      const oi = await buscar('orcamento_itens', `?levantamento_item_id=eq.${item.id}`)
      for (const o of oi) await remover('orcamento_itens', o.id)
    }
    for (const amb of ambs) {
      const oa = await buscar('orcamento_ambientes', `?levantamento_ambiente_id=eq.${amb.id}`)
      for (const o of oa) await remover('orcamento_ambientes', o.id)
    }
    for (const orc of orcs) await remover('orcamentos', orc.id)
    for (const item of itensLev) await remover('levantamento_itens', item.id)
    for (const amb of ambs) await remover('levantamento_ambientes', amb.id)
    await remover('levantamentos', lev.id)
    if (detalhe?.id === lev.id) { setDetalhe(null); setTela(null) }
    await carregar()
  }

  function concluirServicos() {
    setTela('detalhe'); setArquivoFoto(null); setFotoCompartilhada(null); setFItem(FITEM_VAZIO)
  }

  // Mesmo padrao visual/logico de gerarPDFLevantamento (desktop app/levantamento/page.tsx).
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
    ${botaoVoltarApp('/m/levantamento')}
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

  // ═══ Proposta Completa (Inverso) — mesmo padrão visual de app/levantamento/page.tsx ═══
  function calcularValorUnitarioLev(item: any) {
    return (parseFloat(item.preco_material || 0) + parseFloat(item.preco_mao_obra || 0)) * (1 + parseFloat(item.lucro_percentual || 0) / 100) * (1 + parseFloat(item.imposto_percentual || 0) / 100)
  }
  function calcularTotalItemLev(item: any) {
    return calcularValorUnitarioLev(item) * parseFloat(item.quantidade || 1)
  }
  function tempoExecucaoItemLev(item: any): number {
    const bi = item.banco_item_id ? bancoItens.find(b => b.id === item.banco_item_id) : null
    const valor = bi?.tempo_execucao ? parseFloat(bi.tempo_execucao) : 0
    const dias = bi?.tempo_execucao_unidade === 'horas' ? valor / 8 : valor
    return dias > 0 ? dias : 1
  }
  function diaValidoLev(d: Date, pattern: string): boolean {
    const dow = d.getDay()
    if (pattern === 'todos_dias') return true
    if (pattern === 'seg_sab') return dow >= 1 && dow <= 6
    return dow >= 1 && dow <= 5
  }
  function proximoDiaUtilLev(d: Date, pattern: string): Date {
    const nd = new Date(d)
    while (!diaValidoLev(nd, pattern)) nd.setDate(nd.getDate() + 1)
    return nd
  }
  function somarDiasUteisLev(inicio: Date, dias: number, pattern: string): Date {
    let atual = proximoDiaUtilLev(inicio, pattern)
    let restante = Math.max(1, dias) - 1
    while (restante > 0) {
      atual = new Date(atual)
      atual.setDate(atual.getDate() + 1)
      atual = proximoDiaUtilLev(atual, pattern)
      restante--
    }
    return atual
  }
  function paginaCapaInversa(tituloProjeto: string, subtitulo: string, cliente: string, local: string, dataStr: string, validadeDias: number, cfg: any, origin: string) {
    return `
    <div class="page" style="background:#1A1A1A;color:#fff;display:flex">
      <div style="width:55%;padding:60px 56px;display:flex;flex-direction:column;justify-content:center">
        ${cfg.logo_url ? `<img src="${cfg.logo_url}" style="width:110px;height:110px;object-fit:contain;background:#DEDBD6;border-radius:4px;padding:16px;margin-bottom:28px" />` : `<div style="width:110px;height:110px;background:#DEDBD6;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#1A1A1A;font-weight:900;font-family:Cambria,serif;margin-bottom:28px">${(cfg.nome_empresa||'INVERSO').toUpperCase()}</div>`}
        <div style="border-top:1px solid #555;width:280px;margin-bottom:14px"></div>
        <div style="font-size:11px;letter-spacing:0.2em;color:#999;margin-bottom:10px">PROPOSTA COMERCIAL</div>
        <div style="font-family:Cambria,Georgia,serif;font-style:italic;font-weight:700;font-size:42px;line-height:1.1;margin-bottom:14px">${tituloProjeto}</div>
        <div style="font-size:16px;color:#ccc;margin-bottom:32px">${subtitulo}</div>
        <table style="font-size:12px;border-collapse:collapse">
          <tr><td style="color:#999;letter-spacing:0.1em;padding:5px 24px 5px 0;vertical-align:top">CLIENTE</td><td style="font-weight:700;padding:5px 0">${cliente}</td></tr>
          <tr><td style="color:#999;letter-spacing:0.1em;padding:5px 24px 5px 0;vertical-align:top">LOCAL</td><td style="font-weight:700;padding:5px 0">${local || '—'}</td></tr>
          <tr><td style="color:#999;letter-spacing:0.1em;padding:5px 24px 5px 0;vertical-align:top">DATA</td><td style="font-weight:700;padding:5px 0">${dataStr}</td></tr>
          <tr><td style="color:#999;letter-spacing:0.1em;padding:5px 24px 5px 0;vertical-align:top">VALIDADE</td><td style="font-weight:700;padding:5px 0">${validadeDias} dias</td></tr>
        </table>
      </div>
      <div style="width:45%;position:relative;background:#2a2a2a">
        <img src="${origin}/proposta/capa.jpg" style="width:100%;height:100%;object-fit:cover;display:block;opacity:0.9" />
        <div style="position:absolute;left:24px;bottom:24px;right:24px;font-family:Cambria,Georgia,serif;font-style:italic;color:#fff;font-size:13px;text-align:right;text-shadow:0 2px 8px rgba(0,0,0,0.7)">Construindo mais do que edifícios —<br/>construindo legados duradouros.</div>
      </div>
    </div>`
  }
  function paginaHistoriaInversa(cfg: any) {
    const areas = ['Residencial', 'Comercial', 'Varejo', 'Projetos', 'Regularização', 'Gestão de Obra']
    const cards = [
      ['MISSÃO', 'Viabilizar a construção para todos os públicos com qualidade e economia.'],
      ['VISÃO', 'Ser referência nacional, trazendo excelência em projetos e obras.'],
      ['VALORES', 'Transparência, Criatividade, Comprometimento e Ética.'],
      ['OBJETIVOS', 'Consolidar e quebrar paradigmas no setor de Projetos e Obras.'],
    ]
    return `
    <div class="page" style="background:#fff;display:flex;flex-direction:column">
      <div style="background:#1A1A1A;color:#fff;padding:14px 40px;font-weight:700;letter-spacing:0.05em">${(cfg.nome_empresa||'INVERSO').toUpperCase()}</div>
      <div style="flex:1;display:flex">
        <div style="width:62%;padding:40px 44px">
          <div style="font-size:11px;letter-spacing:0.15em;color:#888;margin-bottom:6px">QUEM SOMOS</div>
          <div style="font-family:Cambria,Georgia,serif;font-weight:700;font-size:32px;color:#1A1A1A;margin-bottom:6px">Nossa História</div>
          <div style="width:48px;border-top:3px solid #1A1A1A;margin-bottom:18px"></div>
          <p style="color:#444;line-height:1.7;margin-bottom:14px;font-size:13px">Somos uma empresa líder em Projetos e Construção, destacando-nos por oferecer excelência na gestão de obras e na elaboração de projetos inovadores. Com sede estratégica em São Paulo, a ${cfg.nome_empresa||'Inverso'} atende a todo o território brasileiro.</p>
          <p style="color:#444;line-height:1.7;margin-bottom:22px;font-size:13px">Nossas práticas se fundamentam nos princípios inabaláveis do Custo × Benefício, Comprometimento e Design Inovador — garantindo que cada projeto ultrapasse as expectativas e proporcione resultados duradouros.</p>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
            ${cards.map(([t, d]) => `
              <div style="background:#F5F4F1;border-radius:4px;padding:14px 12px">
                <div style="font-size:9px;letter-spacing:0.1em;color:#999;border-bottom:1px solid #DEDBD6;padding-bottom:8px;margin-bottom:8px">${t}</div>
                <div style="font-size:11px;color:#333;line-height:1.4">${d}</div>
              </div>`).join('')}
          </div>
        </div>
        <div style="width:38%;background:#1A1A1A;color:#fff;padding:40px 32px">
          <div style="font-size:10px;letter-spacing:0.15em;color:#999;border-bottom:1px solid #444;padding-bottom:10px;margin-bottom:18px">ÁREAS DE ATUAÇÃO</div>
          ${areas.map(a => `<div style="border-left:3px solid #fff;padding:8px 0 8px 14px;margin-bottom:14px;font-size:14px">${a}</div>`).join('')}
        </div>
      </div>
      <div style="background:#ECEAE5;color:#666;font-size:10px;padding:10px 40px;text-align:right">${[cfg.emails_gerais, cfg.telefone, cfg.site].filter(Boolean).join(' | ')}</div>
    </div>`
  }
  function paginaDivisorPortfolio(cfg: any) {
    return `
    <div class="page" style="background:#1A1A1A;color:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 64px;position:relative">
      <div style="font-family:Cambria,Georgia,serif;font-weight:700;font-size:48px;line-height:1.15;text-transform:uppercase">PROJETOS<br/>REALIZADOS</div>
      <div style="font-family:Cambria,Georgia,serif;font-style:italic;color:#999;margin-top:24px;font-size:14px">Cada projeto é uma oportunidade única de inovação e excelência.</div>
      <div style="position:absolute;left:32px;bottom:24px;font-weight:700;letter-spacing:0.05em">${(cfg.nome_empresa||'INVERSO').toUpperCase()}</div>
    </div>`
  }
  function paginaPortfolioItem(categoria: string, titulo: string, descricao: string, tags: string[], fotos: string[], origin: string, cfg: any) {
    const foto = (src: string) => `<div style="flex:1;height:100%;background:#171c23"><img src="${origin}${src}" style="width:100%;height:100%;object-fit:cover;display:block" /></div>`
    return `
    <div class="page" style="background:#F5F4F1;display:flex;flex-direction:column">
      <div style="background:#1A1A1A;color:#fff;padding:14px 40px;display:flex;justify-content:space-between;font-weight:700;letter-spacing:0.05em">
        <span>${(cfg.nome_empresa||'INVERSO').toUpperCase()}</span><span style="color:#999;font-size:11px;letter-spacing:0.15em">PORTFÓLIO</span>
      </div>
      <div style="display:flex;height:250px">${fotos.map(foto).join('')}</div>
      <div style="padding:28px 40px;flex:1">
        <div style="font-size:11px;letter-spacing:0.15em;color:#888;margin-bottom:8px">${categoria}</div>
        <div style="font-family:Cambria,Georgia,serif;font-style:italic;font-weight:700;font-size:30px;color:#1A1A1A;margin-bottom:12px">${titulo}</div>
        <p style="color:#444;line-height:1.7;font-size:13px;max-width:640px">${descricao}</p>
        <div style="display:flex;gap:10px;margin-top:20px">
          ${tags.map(t => `<div style="background:#1A1A1A;color:#fff;font-weight:700;font-size:12px;padding:10px 18px;border-radius:4px">${t}</div>`).join('')}
        </div>
      </div>
    </div>`
  }
  function paginasPortfolioInverso(origin: string, cfg: any) {
    return paginaPortfolioItem('COMERCIAL / CORPORATIVO', 'Makmo Infraestrutura',
      'Reforma e implantação de infraestrutura do escritório corporativo Makmo. O projeto contemplou layout de open space, divisórias em vidro, painéis de madeira, iluminação linear e área de recepção. Ambiente projetado para estimular a colaboração e produtividade, com acabamentos premium e identidade visual integrada.',
      ['Open Space', 'Painéis de Madeira', 'Infraestrutura'],
      ['/proposta/makmo-1.jpg', '/proposta/makmo-2.jpg', '/proposta/makmo-3.jpg', '/proposta/makmo-4.jpg', '/proposta/makmo-5.jpg', '/proposta/makmo-6.jpg'], origin, cfg) +
      paginaPortfolioItem('RESIDENCIAL / CONSTRUÇÃO', 'Apartamento Sabará',
      'Projeto de interiores completo com imagens 3D fotorrealistas. Conceito contemporâneo com madeira, neutros quentes e iluminação cuidadosamente projetada. Ambientes integrados e personalizados para máximo conforto e funcionalidade.',
      ['Projeto Arq.', 'Interiores', 'Imagens 3D'],
      ['/proposta/sabara-1.jpg', '/proposta/sabara-2.jpg', '/proposta/sabara-3.jpg'], origin, cfg) +
      paginaPortfolioItem('RESIDENCIAL / CONSTRUÇÃO', 'Residência Aclimação',
      'Construção residencial completa no bairro Aclimação. Piso em parquet de taco, banheiros com revestimento premium, cozinha integrada e acabamentos de alto padrão. A obra foi gerenciada do início ao fim com controle de prazos e qualidade, entregando um resultado sofisticado e funcional.',
      ['Construção', 'House Flipping', 'Reforma'],
      ['/proposta/aclimacao-1.jpg', '/proposta/aclimacao-2.jpg', '/proposta/aclimacao-3.jpg', '/proposta/aclimacao-4.jpg', '/proposta/aclimacao-5.jpg', '/proposta/aclimacao-6.jpg'], origin, cfg) +
      paginaPortfolioItem('RESIDENCIAL / CONSTRUÇÃO', 'Cobertura Marajoara',
      'Reforma e projeto de interiores de cobertura com terraço gourmet. Teto de madeira, cozinha integrada com adega embutida, piso de concreto e vista panorâmica da cidade.',
      ['Projeto', 'Construção', 'Reforma'],
      ['/proposta/marajoara-1.jpg', '/proposta/marajoara-2.jpg', '/proposta/marajoara-3.jpg', '/proposta/marajoara-4.jpg'], origin, cfg)
  }
  function paginaInvestimentoInverso(itensOrc: any[], codigo: string, cfg: any) {
    const rows = itensOrc.map(item => `
      <tr style="break-inside:avoid">
        <td style="padding:12px 16px;border-bottom:1px solid #333;color:#eee">${item.servico}${item.descricao ? `<br/><span style="color:#999;font-size:11px">${item.descricao}</span>` : ''}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #333;text-align:center;color:#ccc">${item.unidade}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #333;text-align:center;color:#ccc">${Number(item.quantidade||1).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #333;text-align:right;color:#ccc">${moeda(calcularValorUnitarioLev(item))}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #333;text-align:right;font-weight:700;color:#fff">${moeda(calcularTotalItemLev(item))}</td>
      </tr>`).join('')
    const totalGeral = itensOrc.reduce((a, i) => a + calcularTotalItemLev(i), 0)
    return `
    <div class="page-flow" style="background:#1A1A1A;color:#fff;padding:36px 40px">
      <div style="display:flex;justify-content:space-between;font-weight:700;letter-spacing:0.05em;border-bottom:1px solid #333;padding-bottom:14px;margin-bottom:22px">
        <span>${(cfg.nome_empresa||'INVERSO').toUpperCase()}</span><span style="color:#999;font-size:11px;letter-spacing:0.15em">INVESTIMENTO</span>
      </div>
      <div style="font-size:11px;letter-spacing:0.15em;color:#999;margin-bottom:6px">ORÇAMENTO DETALHADO</div>
      <div style="font-family:Cambria,Georgia,serif;font-style:italic;font-weight:700;font-size:32px;margin-bottom:6px">Investimento</div>
      <div style="width:48px;border-top:3px solid #fff;margin-bottom:22px"></div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#F5F4F1;color:#1A1A1A">
          <th style="padding:10px 16px;text-align:left">Descrição do Serviço</th>
          <th style="padding:10px 16px;text-align:center">Unid.</th>
          <th style="padding:10px 16px;text-align:center">Qtd.</th>
          <th style="padding:10px 16px;text-align:right">Valor Unit.</th>
          <th style="padding:10px 16px;text-align:right">Total</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="5" style="padding:24px;text-align:center;color:#999">Nenhum item cadastrado ainda.</td></tr>`}</tbody>
      </table>
      <div style="display:flex;justify-content:flex-end;margin-top:18px;break-inside:avoid">
        <div style="background:#fff;color:#1A1A1A;padding:14px 28px;display:flex;align-items:center;gap:18px">
          <span style="font-size:12px;letter-spacing:0.1em;color:#666">TOTAL GERAL</span>
          <span style="font-family:Cambria,Georgia,serif;font-weight:700;font-size:22px">${moeda(totalGeral)}</span>
        </div>
      </div>
    </div>`
  }
  function paginaCondicoesInverso(prazoDias: number, condicaoPagamento: string, validadeDias: number, cfg: any) {
    return `
    <div class="page" style="background:#fff;display:flex;flex-direction:column">
      <div style="background:#1A1A1A;color:#fff;padding:14px 40px;display:flex;justify-content:space-between;font-weight:700;letter-spacing:0.05em">
        <span>${(cfg.nome_empresa||'INVERSO').toUpperCase()}</span><span style="color:#999;font-size:11px;letter-spacing:0.15em">CONDIÇÕES COMERCIAIS</span>
      </div>
      <div style="padding:36px 40px;flex:1">
        <div style="font-size:11px;letter-spacing:0.15em;color:#888;margin-bottom:6px">PRAZOS E PAGAMENTO</div>
        <div style="font-family:Cambria,Georgia,serif;font-weight:700;font-size:32px;color:#1A1A1A;margin-bottom:6px">Condições Comerciais</div>
        <div style="width:48px;border-top:3px solid #1A1A1A;margin-bottom:22px"></div>
        <div style="display:flex;gap:16px">
          <div style="flex:1;background:#F5F4F1;border-radius:4px;padding:22px 24px">
            <div style="font-size:10px;letter-spacing:0.1em;color:#888;border-bottom:1px solid #DEDBD6;padding-bottom:10px;margin-bottom:16px">PRAZO DE ENTREGA</div>
            <div style="color:#333;font-size:13px;margin-bottom:10px">Execução dos serviços descritos nesta proposta</div>
            <div style="font-family:Cambria,Georgia,serif;font-weight:700;font-size:20px;color:#1A1A1A">${prazoDias} dia${prazoDias === 1 ? '' : 's'} corrido${prazoDias === 1 ? '' : 's'}<br/>(após o briefing)</div>
          </div>
          <div style="flex:1;background:#1A1A1A;color:#fff;border-radius:4px;padding:22px 24px">
            <div style="font-size:10px;letter-spacing:0.1em;color:#999;border-bottom:1px solid #444;padding-bottom:10px;margin-bottom:16px">FORMAS DE PAGAMENTO</div>
            ${condicaoPagamento ? `<div style="font-size:13px;color:#eee;white-space:pre-line;line-height:1.7">${condicaoPagamento}</div>` : `<div style="font-size:13px;color:#777;font-style:italic">A combinar — preencha em "Forma de Pagamento" no orçamento.</div>`}
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:26px">
          <div style="background:#1A1A1A;color:#fff;font-weight:700;font-size:12px;padding:12px 20px;border-radius:4px">✦ Validade desta proposta: ${validadeDias} dias</div>
          <div style="font-size:11px;color:#888;font-style:italic;max-width:420px;text-align:right">* Quaisquer serviços não descritos nesta proposta deverão ser acordados separadamente.</div>
        </div>
      </div>
    </div>`
  }
  function paginaFechamentoInverso(cfg: any) {
    return `
    <div class="page" style="background:#1A1A1A;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 40px">
      <div style="font-family:Cambria,Georgia,serif;font-style:italic;font-weight:700;font-size:38px;line-height:1.25;margin-bottom:28px">Bora começar a<br/>projetar esse sonho?</div>
      <div style="width:340px;border-top:1px solid #555;margin-bottom:22px"></div>
      <div style="font-weight:700;font-size:14px;margin-bottom:12px">${cfg.emails_gerais || ''}</div>
      <div style="color:#999;font-size:13px;margin-bottom:8px">${cfg.telefone || ''}</div>
      <div style="color:#999;font-size:13px;margin-bottom:32px">${cfg.site || ''}</div>
      <div style="color:#666;font-size:11px">${(cfg.nome_empresa||'INVERSO').toUpperCase()} STUDIO ${cfg.cnpj ? '| CNPJ: ' + cfg.cnpj : ''}</div>
    </div>`
  }
  function envolverPropostaInversa(titulo: string, paginas: string) {
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>${titulo}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:Calibri,'Segoe UI',Arial,sans-serif; }
      @page { size: A4 landscape; margin:0; }
      .page { width:297mm; height:210mm; overflow:hidden; }
      .page-flow { width:297mm; min-height:210mm; }
      @media print {
        body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .page { break-after:page; }
        .page:last-child { break-after:auto; }
        .page-flow { break-before:page; break-after:page; }
        .page-flow:last-child { break-after:auto; }
      }
    </style></head><body>
    ${botaoVoltarApp('/m/levantamento')}
    ${paginas}
    <script>window.onload = () => { window.print() }</script>
    </body></html>`
  }
  // Encarte do levantamento (estilo escuro do sistema), inserido entre o portfólio e o orçamento.
  function paginasLevantamentoEncarte(lev: any, ambs: any[], itensList: any[], cfg: any) {
    const nomeAmbiente = (ambienteId: string) => ambs.find((a: any) => a.id === ambienteId)?.nome || '—'
    const itensHtml = itensList.map((item: any, i: number) => `
      <div style="display:flex;gap:20px;margin-bottom:20px;break-inside:avoid;padding-bottom:20px;border-bottom:1px solid #333">
        <div style="width:38%;aspect-ratio:1;border-radius:6px;overflow:hidden;background:#171c23;flex-shrink:0;position:relative">
          <div style="position:absolute;top:10px;left:10px;width:24px;height:24px;border-radius:999px;background:#fff;color:#1A1A1A;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">${i + 1}</div>
          ${item.foto_url ? `<img src="${item.foto_url}" style="width:100%;height:100%;object-fit:cover;display:block" />` : ''}
        </div>
        <div style="flex:1">
          <h3 style="font-size:15px;color:#eee;margin-bottom:4px">${item.servico || ''}</h3>
          <p style="font-size:10px;letter-spacing:0.08em;color:#999;text-transform:uppercase;font-weight:700;margin-bottom:8px">${nomeAmbiente(item.ambiente)}</p>
          ${item.descricao ? `<p style="font-size:11px;color:#bbb;font-style:italic">"${item.descricao}"</p>` : ''}
        </div>
      </div>`).join('')
    return `
    <div class="page-flow" style="background:#0f141b;color:#dee2ec;padding:36px 40px">
      <div style="display:flex;justify-content:space-between;margin-bottom:20px;border-bottom:1px solid #3d4948;padding-bottom:10px">
        <span style="font-size:11px;color:#6ee9e0;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Levantamento Técnico — ${lev.codigo}</span>
        <span style="font-size:10px;color:#869391">${(cfg.nome_empresa||'INVERSO').toUpperCase()}</span>
      </div>
      ${itensList.length > 0 ? itensHtml : '<p style="color:#869391;text-align:center;padding:40px 0">Nenhum item de levantamento registrado.</p>'}
    </div>`
  }

  function abrirRegimeProposta(lev: any, ambs: any[], itensList: any[]) {
    const obraVinculada = obras.find(o => o.id === lev.obra_id)
    setRegimeProposta(obraVinculada?.dias_trabalho || 'seg_sex')
    setPropostaAlvo({ lev, ambs, itensList })
    setMostrarRegimeProposta(true)
  }

  async function gerarPropostaCompleta(lev: any, ambs: any[], itensList: any[]) {
    const configRows = await buscar('empresa_config', '?limit=1')
    const cfg = configRows[0] || {}
    const origin = window.location.origin

    const orcs = await buscar('orcamentos', `?levantamento_id=eq.${lev.id}&limit=1`)
    const orc = orcs[0]
    const orcItens = orc ? await buscar('orcamento_itens', `?orcamento_id=eq.${orc.id}`) : []

    const totalDiasUteis = Math.max(1, Math.round(orcItens.reduce((a: number, i: any) => a + tempoExecucaoItemLev(i), 0)))
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const inicioValido = proximoDiaUtilLev(hoje, regimeProposta)
    const fimPrazo = somarDiasUteisLev(hoje, totalDiasUteis, regimeProposta)
    const prazoDias = Math.round((fimPrazo.getTime() - inicioValido.getTime()) / 86400000) + 1

    const paginas =
      paginaCapaInversa(lev.nome || lev.cliente, lev.tipo_execucao === 'projeto' ? 'Projeto' : 'Proposta de Obra', lev.cliente, lev.endereco, new Date().toLocaleDateString('pt-BR'), parseInt(orc?.validade_dias || '30'), cfg, origin) +
      paginaHistoriaInversa(cfg) +
      paginaDivisorPortfolio(cfg) +
      paginasPortfolioInverso(origin, cfg) +
      paginasLevantamentoEncarte(lev, ambs, itensList, cfg) +
      paginaInvestimentoInverso(orcItens, orc?.codigo || lev.codigo, cfg) +
      paginaCondicoesInverso(prazoDias, orc?.condicao_pagamento, parseInt(orc?.validade_dias || '30'), cfg) +
      paginaFechamentoInverso(cfg)

    const html = envolverPropostaInversa(`Proposta ${lev.codigo} — ${cfg.nome_empresa || 'Inverso'}`, paginas)
    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  const ambsDetalhe = detalhe ? ambientes.filter(a => a.levantamento_id === detalhe.id) : []
  const itensDetalhe = detalhe ? itens.filter(i => i.levantamento_id === detalhe.id) : []
  const usaMedidas = fItem.unidade === 'm²' || fItem.unidade === 'm³'

  // ── Tela: Novo Levantamento ────────────────────────────────────
  if (tela === 'novoLevantamento') {
    return (
      <MobileShell title={levantamentoEditando ? 'Editar Levantamento' : 'Novo Levantamento'}>
        <div className="p-4 flex flex-col gap-3.5 pb-8">
          {levantamentoEditando && (
            <div>
              <label className={labelCls}>Status</label>
              <select className={inputCls} value={fLev.status} onChange={e => setFLev({ ...fLev, status: e.target.value })}>
                {Object.entries(STATUS_LEVA).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>Execução *</label>
            <select className={inputCls} value={fLev.tipo_execucao} onChange={e => setFLev({ ...fLev, tipo_execucao: e.target.value })}>
              {TIPOS_EXECUCAO.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Cliente *</label>
            <input className={inputCls} placeholder="Nome do cliente" value={fLev.cliente} onChange={e => setFLev({ ...fLev, cliente: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Nome do Levantamento</label>
            <input className={inputCls} placeholder="Ex: Vistoria Reforma Cozinha" value={fLev.nome} onChange={e => setFLev({ ...fLev, nome: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Endereço do imóvel</label>
            <input className={inputCls} placeholder="Rua, número, bairro, cidade" value={fLev.endereco} onChange={e => setFLev({ ...fLev, endereco: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Obra vinculada (opcional)</label>
            <select className={inputCls} value={fLev.obra_id} onChange={e => setFLev({ ...fLev, obra_id: e.target.value })}>
              <option value="">Nenhuma / cliente novo</option>
              {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Telefone do cliente</label>
            <input className={inputCls} placeholder="(11) 90000-0000" value={fLev.cliente_telefone} onChange={e => setFLev({ ...fLev, cliente_telefone: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Responsável pelo levantamento</label>
            <input className={inputCls} placeholder="Nome do técnico" value={fLev.responsavel} onChange={e => setFLev({ ...fLev, responsavel: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2 mt-2">
            <button className={btnPrimaryCls} onClick={salvarLevantamento}>{levantamentoEditando ? 'Salvar Alterações' : 'Criar Levantamento'}</button>
            <button className={btnSecondaryCls} onClick={() => { setTela(levantamentoEditando ? 'detalhe' : null); setFLev(FLEV_VAZIO); setLevantamentoEditando(null) }}>Cancelar</button>
          </div>
        </div>
      </MobileShell>
    )
  }

  // ── Tela: Novo Ambiente ─────────────────────────────────────────
  if (tela === 'novoAmbiente') {
    return (
      <MobileShell title="Novo Ambiente">
        <div className="p-4 flex flex-col gap-3.5 pb-8">
          <div>
            <label className={labelCls}>Ambiente</label>
            <select className={inputCls} value={fAmb.nome} onChange={e => setFAmb({ ...fAmb, nome: e.target.value })}>
              <option value="">Selecione ou digite abaixo</option>
              {AMBIENTES_COMUNS.map(a => <option key={a} value={a}>{a}</option>)}
              <option value="__custom__">+ Outro (digitar)</option>
            </select>
          </div>
          {fAmb.nome === '__custom__' && (
            <div>
              <label className={labelCls}>Nome personalizado</label>
              <input className={inputCls} placeholder="Ex: Área Gourmet" value={fAmb.nomeCustom} onChange={e => setFAmb({ ...fAmb, nomeCustom: e.target.value })} />
            </div>
          )}
          <div className="flex flex-col gap-2 mt-2">
            <button className={btnPrimaryCls} onClick={salvarAmbiente}>Adicionar Ambiente</button>
            <button className={btnSecondaryCls} onClick={() => setTela('detalhe')}>Cancelar</button>
          </div>
        </div>
      </MobileShell>
    )
  }

  // ── Tela: Novo Item ──────────────────────────────────────────────
  if (tela === 'novoItem') {
    return (
      <MobileShell title={`${editItem ? '✏️ Editar Serviço' : '🔧 Novo Serviço'} — ${ambienteAtivo?.nome || ''}`}>
        <div className="p-4 flex flex-col gap-3.5 pb-8">
          <div>
            <label className={labelCls}>Serviço *</label>
            <select className={inputCls} value={fItem.banco_item_id || (fItem.servico === 'Foto' ? '__foto__' : (fItem.servico ? '__custom__' : ''))}
              onChange={e => {
                const v = e.target.value
                if (v === '__foto__') setFItem({ ...fItem, banco_item_id: '', servico: 'Foto', categoria: '' })
                else if (v === '' || v === '__custom__') setFItem({ ...fItem, banco_item_id: '', servico: v === '__custom__' ? '' : fItem.servico })
                else {
                  const bi = bancoItens.find(b => b.id === v)
                  if (bi) setFItem({ ...fItem, banco_item_id: bi.id, servico: bi.nome, categoria: bi.categoria || '', unidade: bi.unidade || fItem.unidade })
                }
              }}>
              <option value="">Selecione do banco de itens ou &quot;Outro&quot;</option>
              <option value="__foto__">📷 Foto (apenas registro, sem serviço)</option>
              {bancoItens.map(b => <option key={b.id} value={b.id}>{b.nome}{b.categoria ? ' — ' + b.categoria : ''}</option>)}
              <option value="__custom__">+ Outro (digitar)</option>
            </select>
          </div>
          {!fItem.banco_item_id && (
            <div>
              <label className={labelCls}>Nome do serviço (personalizado)</label>
              <input className={inputCls} placeholder="Ex: Pintura das paredes" value={fItem.servico} onChange={e => setFItem({ ...fItem, servico: e.target.value })} />
            </div>
          )}
          <div>
            <label className={labelCls}>Categoria {fItem.banco_item_id ? '(definida pelo banco de itens)' : ''}</label>
            <select className={inputCls} value={fItem.categoria} disabled={!!fItem.banco_item_id} onChange={e => setFItem({ ...fItem, categoria: e.target.value })}>
              <option value="">Selecione</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Descrição</label>
            <input className={inputCls} placeholder="Ex: Tinta acrílica cor branco neve, 2 demãos" value={fItem.descricao} onChange={e => setFItem({ ...fItem, descricao: e.target.value })} />
          </div>
          <div className="flex items-center gap-3 bg-surface-container-low border border-outline-variant rounded-lg p-3">
            <div className="w-16 h-16 rounded-lg bg-surface-container border border-outline-variant flex items-center justify-center overflow-hidden shrink-0">
              {fotoCompartilhada ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotoCompartilhada} alt="Foto do serviço" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-on-surface-variant/40">photo_camera</span>
              )}
            </div>
            <div className="flex-1">
              {fotoCompartilhada ? (
                <>
                  <div className="text-[11px] text-on-surface mb-1">Foto anexada — pode adicionar quantos serviços quiser nela</div>
                  <button className="text-xs text-primary font-semibold" onClick={() => setFotoCompartilhada(null)}>Trocar foto</button>
                </>
              ) : (
                <>
                  <label className={labelCls}>Foto (compartilhada entre vários serviços)</label>
                  <input
                    type="file" accept="image/*" capture="environment"
                    onChange={e => { const f = e.target.files?.[0]; if (f) selecionarFotoCompartilhada(f) }}
                    className="w-full bg-surface-container border border-outline-variant rounded-lg text-on-surface-variant text-xs px-2 py-2 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-primary/10 file:text-primary file:text-xs file:font-semibold cursor-pointer"
                  />
                  {enviando && <div className="text-[11px] text-primary mt-1">Enviando foto...</div>}
                </>
              )}
            </div>
          </div>
          {usaMedidas ? (
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={labelCls}>Comprim. (m)</label>
                <input className={inputCls} type="text" inputMode="decimal" placeholder="0,00" value={fItem.comprimento}
                  onChange={e => { const c = e.target.value; setFItem({ ...fItem, comprimento: c, area: calcularArea(fItem.unidade, c, fItem.largura, fItem.altura) }) }} />
              </div>
              <div>
                <label className={labelCls}>Largura (m)</label>
                <input className={inputCls} type="text" inputMode="decimal" placeholder="0,00" value={fItem.largura}
                  onChange={e => { const l = e.target.value; setFItem({ ...fItem, largura: l, area: calcularArea(fItem.unidade, fItem.comprimento, l, fItem.altura) }) }} />
              </div>
              <div>
                <label className={labelCls}>Altura (m)</label>
                <input className={inputCls} type="text" inputMode="decimal" placeholder="0,00" value={fItem.altura}
                  onChange={e => { const a = e.target.value; setFItem({ ...fItem, altura: a, area: calcularArea(fItem.unidade, fItem.comprimento, fItem.largura, a) }) }} />
              </div>
              <div>
                <label className={labelCls}>Unidade</label>
                <select className={inputCls} value={fItem.unidade}
                  onChange={e => { const u = e.target.value; setFItem({ ...fItem, unidade: u, area: calcularArea(u, fItem.comprimento, fItem.largura, fItem.altura) }) }}>
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={labelCls}>Quantidade</label>
                <input className={inputCls} type="text" inputMode="decimal" placeholder="0,00" value={fItem.area} onChange={e => setFItem({ ...fItem, area: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Unidade</label>
                <select className={inputCls} value={fItem.unidade} onChange={e => setFItem({ ...fItem, unidade: e.target.value, comprimento: '', largura: '', altura: '' })}>
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          )}
          {usaMedidas && (
            <div>
              <label className={labelCls}>Área / Quantidade calculada</label>
              <input className={inputCls + ' text-primary font-bold'} placeholder="Calculado automaticamente ou digite" value={fItem.area} onChange={e => setFItem({ ...fItem, area: e.target.value })} />
            </div>
          )}
          <div>
            <label className={labelCls}>Observação técnica</label>
            <input className={inputCls} placeholder="Ex: Infiltração detectada" value={fItem.observacao} onChange={e => setFItem({ ...fItem, observacao: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2 mt-2">
            <button className={btnPrimaryCls} onClick={salvarItem} disabled={enviando}>{editItem ? 'Salvar Alterações' : '+ Adicionar e continuar'}</button>
            <button className={btnSecondaryCls} onClick={editItem ? () => { setTela('detalhe'); setEditItem(null); setFotoCompartilhada(null); setFItem(FITEM_VAZIO) } : concluirServicos}>{editItem ? 'Cancelar' : 'Concluir'}</button>
          </div>
        </div>
      </MobileShell>
    )
  }

  // ── Tela: Detalhe do Levantamento ────────────────────────────────
  if (detalhe && tela === 'detalhe') {
    return (
      <MobileShell title={detalhe.codigo}>
        <div className="p-4 flex flex-col gap-4 pb-8">
          <button className="text-primary text-sm font-semibold text-left" onClick={() => { setDetalhe(null); setTela(null) }}>← Voltar à lista</button>
          <div className="bg-surface-container border border-outline-variant rounded-xl p-4">
            <div className="font-bold text-on-surface">{detalhe.nome || detalhe.cliente}</div>
            <div className="text-body-sm text-on-surface-variant mt-1">{detalhe.cliente}</div>
            {detalhe.endereco && <div className="text-[11px] text-on-surface-variant mt-1">📍 {detalhe.endereco}</div>}
            <div className="text-[11px] text-on-surface-variant mt-1">Status: {STATUS_LEVA[detalhe.status] || detalhe.status}</div>
            <div className="text-[11px] text-primary mt-1">{EXECUCAO_NOME[detalhe.tipo_execucao || 'obra']}</div>
          </div>

          <button className={btnSecondaryCls} onClick={() => abrirEditarLevantamento(detalhe)}>✏️ Editar Levantamento</button>
          <div className="flex gap-2">
            <button className={btnSecondaryCls} onClick={() => gerarPDFLevantamento(detalhe, ambsDetalhe, itensDetalhe)}>🖨️ Gerar PDF</button>
            <button className={btnSecondaryCls} onClick={() => abrirRegimeProposta(detalhe, ambsDetalhe, itensDetalhe)}>📄 Proposta Completa</button>
          </div>

          {mostrarRegimeProposta && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setMostrarRegimeProposta(false)}>
              <div className="bg-surface-container border border-outline-variant rounded-2xl p-6 w-full max-w-[420px]">
                <div className="text-base font-bold text-on-surface mb-1.5">📄 Gerar Proposta Completa</div>
                <div className="text-body-sm text-on-surface-variant mb-4">Cada obra roda em um ritmo diferente — escolha o regime de execução para calcular o prazo em dias corridos que vai na proposta.</div>
                <div className="mb-5">
                  <label className={labelCls}>Regime de Execução</label>
                  <select className={inputCls} value={regimeProposta} onChange={e => setRegimeProposta(e.target.value)}>
                    <option value="seg_sex">Segunda a Sexta</option>
                    <option value="seg_sab">Segunda a Sábado</option>
                    <option value="todos_dias">Todos os dias (dias corridos)</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button className={btnSecondaryCls + ' flex-1'} onClick={() => setMostrarRegimeProposta(false)}>Cancelar</button>
                  <button className={btnPrimaryCls + ' flex-1'} onClick={() => { setMostrarRegimeProposta(false); if (propostaAlvo) gerarPropostaCompleta(propostaAlvo.lev, propostaAlvo.ambs, propostaAlvo.itensList) }}>Gerar</button>
                </div>
              </div>
            </div>
          )}
          <button className={btnPrimaryCls} onClick={() => setTela('novoAmbiente')}>+ Ambiente</button>

          {ambsDetalhe.length === 0 ? (
            <div className="text-center py-6 text-on-surface-variant text-body-sm">Nenhum ambiente cadastrado ainda</div>
          ) : ambsDetalhe.map(amb => {
            const itensAmb = itens.filter(i => i.ambiente === amb.id)
            return (
              <div key={amb.id} className="bg-surface-container border border-outline-variant rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-on-surface text-sm">🏠 {amb.nome}</div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button className="text-primary text-xs font-semibold" onClick={() => { setAmbienteAtivo(amb); setFItem(FITEM_VAZIO); setEditItem(null); setArquivoFoto(null); setFotoCompartilhada(null); setTela('novoItem') }}>+ Serviço</button>
                    <button className="text-error text-xs font-semibold" onClick={() => excluirAmbienteLevantamento(amb)}>Excluir</button>
                  </div>
                </div>
                {itensAmb.length === 0 ? (
                  <div className="text-[12px] text-on-surface-variant py-2">Nenhum serviço registrado</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {itensAmb.map(item => (
                      <div key={item.id} className="flex gap-2.5 items-center py-2 border-t border-outline-variant first:border-0">
                        <div className="w-11 h-11 rounded-lg bg-surface-container-low border border-outline-variant overflow-hidden shrink-0 flex items-center justify-center cursor-pointer"
                          onClick={() => {
                            setAmbienteAtivo(amb)
                            setFItem({ servico: item.servico, descricao: item.descricao || '', comprimento: item.comprimento ? String(item.comprimento) : '', largura: item.largura ? String(item.largura) : '', altura: item.altura ? String(item.altura) : '', area: item.area ? String(item.area) : '', unidade: item.unidade || 'm²', observacao: item.observacao || '', foto_url: item.foto_url || '', banco_item_id: item.banco_item_id || '', categoria: item.categoria || '' })
                            setArquivoFoto(null); setFotoCompartilhada(item.foto_url || null); setEditItem(item); setTela('novoItem')
                          }}>
                          {item.foto_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.foto_url} alt="" className="w-full h-full object-cover" />
                          ) : <span className="material-symbols-outlined text-[16px] text-on-surface-variant/40">image</span>}
                        </div>
                        <div className="min-w-0 flex-1 cursor-pointer"
                          onClick={() => {
                            setAmbienteAtivo(amb)
                            setFItem({ servico: item.servico, descricao: item.descricao || '', comprimento: item.comprimento ? String(item.comprimento) : '', largura: item.largura ? String(item.largura) : '', altura: item.altura ? String(item.altura) : '', area: item.area ? String(item.area) : '', unidade: item.unidade || 'm²', observacao: item.observacao || '', foto_url: item.foto_url || '', banco_item_id: item.banco_item_id || '', categoria: item.categoria || '' })
                            setArquivoFoto(null); setFotoCompartilhada(item.foto_url || null); setEditItem(item); setTela('novoItem')
                          }}>
                          <div className="text-sm text-on-surface truncate">{item.servico}</div>
                          {item.area && <div className="text-[11px] text-on-surface-variant">{item.area} {item.unidade}</div>}
                        </div>
                        <button className="text-error text-xs font-semibold shrink-0" onClick={() => excluirItemLevantamento(item)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </MobileShell>
    )
  }

  // ── Tela: Lista ───────────────────────────────────────────────────
  return (
    <MobileShell title="Levantamento">
      <div className="p-4 flex flex-col gap-3">
        <input className={inputCls} placeholder="Pesquisar por código, nome ou cliente..." value={busca} onChange={e => setBusca(e.target.value)} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {['todos', ...Object.keys(STATUS_LEVA)].map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${filtro === f ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-container text-on-surface-variant border-outline-variant'}`}>
              {f === 'todos' ? 'Todos' : STATUS_LEVA[f]}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[['todos', 'Todos'], ['obra', '🏗️ Obra'], ['projeto', '📐 Projeto']].map(([v, n]) => (
            <button key={v} onClick={() => setFiltroExecucao(v)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${filtroExecucao === v ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-container text-on-surface-variant border-outline-variant'}`}>
              {n}
            </button>
          ))}
        </div>
        <button className={btnPrimaryCls} onClick={() => { setFLev(FLEV_VAZIO); setLevantamentoEditando(null); setTela('novoLevantamento') }}>+ Novo Levantamento</button>

        {filtrados.length === 0 ? (
          <div className="text-center py-10 text-on-surface-variant text-body-sm">Nenhum levantamento encontrado</div>
        ) : filtrados.map(l => {
          const qtdItens = itens.filter(i => i.levantamento_id === l.id).length
          return (
            <div key={l.id} onClick={() => { setDetalhe(l); setTela('detalhe') }}
              className="text-left bg-surface-container border border-outline-variant rounded-xl p-4 cursor-pointer">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-on-surface text-sm truncate">{l.nome || l.cliente}</div>
                  <div className="text-[11px] text-on-surface-variant truncate">{l.codigo} · {l.cliente}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-semibold text-on-surface-variant uppercase">{STATUS_LEVA[l.status] || l.status}</span>
                  <button className="text-error text-xs font-semibold" onClick={e => { e.stopPropagation(); excluirLevantamento(l) }}>🗑️</button>
                </div>
              </div>
              <div className="text-[11px] text-primary mt-1">{EXECUCAO_NOME[l.tipo_execucao || 'obra']}</div>
              <div className="text-[11px] text-on-surface-variant mt-1">{qtdItens} serviço{qtdItens === 1 ? '' : 's'} registrado{qtdItens === 1 ? '' : 's'}</div>
            </div>
          )
        })}
      </div>
    </MobileShell>
  )
}
