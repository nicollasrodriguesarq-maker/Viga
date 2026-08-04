'use client'
import { useEffect, useState, Fragment } from 'react'
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
async function editar(tabela: string, id: string, dados: object): Promise<boolean> {
  try { const r = await fetch(BASE + '/' + tabela + '?id=eq.' + id, { method: 'PATCH', headers: H, body: JSON.stringify(dados) }); return r.ok } catch { return false }
}
async function remover(tabela: string, id: string) {
  try { await fetch(BASE + '/' + tabela + '?id=eq.' + id, { method: 'DELETE', headers: H }) } catch {}
}

// Botão flutuante injetado em todo PDF gerado pelo app — sem ele o usuário fica preso na
// tela do PDF sem como voltar, já que o app roda como PWA instalado (sem barra do navegador).
function botaoVoltarApp(path: string) {
  return `<div class="voltar-app" style="position:fixed;top:12px;left:12px;z-index:99999">
    <a href="${path}" style="display:inline-flex;align-items:center;gap:6px;background:#1B3A5C;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:13px;font-weight:700;padding:10px 18px;border-radius:24px;box-shadow:0 2px 10px rgba(0,0,0,.3)">← Voltar ao App</a>
  </div>
  <style>@media print { .voltar-app { display:none !important } }</style>`
}

async function uploadFotoVisita(file: File): Promise<string | null> {
  try {
    const ext = file.name.split('.').pop()
    const nome = `visita_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
    const r = await fetch(`${BASE.replace('/rest/v1', '')}/storage/v1/object/relatorio-visita-fotos/${nome}`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': file.type },
      body: file,
    })
    if (r.ok) return `${BASE.replace('/rest/v1', '')}/storage/v1/object/public/relatorio-visita-fotos/${nome}`
    return null
  } catch { return null }
}

const moeda = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (v: string) => v ? new Date(v + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
const pct = (a: number, b: number) => b > 0 ? Math.min((a / b) * 100, 100) : 0
function obraAtrasada(obra: any) {
  return !!(obra.data_previsao && new Date(obra.data_previsao) < new Date() && obra.status === 'em_execucao')
}
const GRUPO_CUSTO: Record<string, string> = {
  'Material': 'Materiais & Insumos',
  'Mão de obra': 'Mão de Obra Direta',
  'Terceiros': 'Mão de Obra Direta',
  'Pessoal': 'Mão de Obra Direta',
  'Equipamento': 'Equipamentos & Logística',
  'Aluguel': 'Equipamentos & Logística',
}
function grupoCusto(categoria: string) {
  return GRUPO_CUSTO[categoria] || 'Custos Indiretos'
}
const STATUS_NOME: Record<string, string> = { captacao: 'Em Captação', em_execucao: 'Em Execução', pausada: 'Pausada', concluida: 'Concluída', cancelada: 'Cancelada' }
const SERV_STATUS: Record<string, string> = { pendente: 'Pendente', em_execucao: 'Em Execução', concluido: 'Concluído', cancelado: 'Cancelado' }
const ETAPA_STATUS: Record<string, string> = { pendente: 'Pendente', em_andamento: 'Em Andamento', concluida: 'Concluída', atrasada: 'Atrasada' }
// Mesma logica de app/obras/page.tsx: posicao/largura (%) de uma barra de Gantt no periodo da obra.
function calcularBarraGantt(inicio: Date, fim: Date, dataIniStr?: string | null, dataFimStr?: string | null) {
  const totalMs = Math.max(fim.getTime() - inicio.getTime(), 86400000)
  const ini = dataIniStr ? new Date(dataIniStr + 'T00:00:00') : inicio
  const fimEtapa = dataFimStr ? new Date(dataFimStr + 'T00:00:00') : ini
  const xPct = Math.max(0, Math.min(100, ((ini.getTime() - inicio.getTime()) / totalMs) * 100))
  const fimPct = Math.max(0, Math.min(100, ((fimEtapa.getTime() - inicio.getTime()) / totalMs) * 100))
  const larguraPct = Math.max(fimPct - xPct, 0.8)
  return { xPct, larguraPct }
}
// Ordem = sequência real de execução de obra (mesma lista/ordem do desktop e do Orçamento).
const CATEGORIAS = ['Serviços Preliminares', 'Demolição e Remoção', 'Terraplanagem e Fundação', 'Estrutura', 'Alvenaria', 'Cobertura', 'Impermeabilização', 'Instalações Elétricas', 'Instalações Hidráulicas', 'Instalações de Gás', 'Instalações de Incêndio', 'Climatização (AC)', 'Revestimento de Parede', 'Revestimento de Piso', 'Forro', 'Esquadrias', 'Vidraçaria', 'Serralheria', 'Marmoraria', 'Louças e Metais', 'Marcenaria', 'Pintura', 'Mobiliário', 'Paisagismo', 'Limpeza Pós-Obra', 'Outros']
function ordemCategoria(categoria: string | null | undefined) {
  const idx = CATEGORIAS.indexOf(categoria || '')
  return idx === -1 ? CATEGORIAS.length : idx
}
function ordenarServicosObra(lista: any[]) {
  return [...lista].sort((a, b) => {
    const catDiff = ordemCategoria(a.categoria) - ordemCategoria(b.categoria)
    return catDiff !== 0 ? catDiff : (a.ordem ?? 0) - (b.ordem ?? 0)
  })
}
function corBarraEtapa(status: string) {
  if (status === 'concluida') return 'bg-primary-container'
  if (status === 'atrasada') return 'bg-error'
  if (status === 'em_andamento') return 'bg-tertiary'
  return 'bg-on-surface-variant/50'
}
function corHexEtapa(status: string) {
  if (status === 'concluida') return '#6ee9e0'
  if (status === 'atrasada') return '#ffb4ab'
  if (status === 'em_andamento') return '#ffcbac'
  return '#69736f'
}
// Mesma cor de app/obras/page.tsx: verde até 80%, laranja de 80-100%, vermelho acima de 100%.
function corProgresso(pctValor: number) {
  return pctValor > 100 ? 'bg-error' : pctValor > 80 ? 'bg-tertiary' : 'bg-primary'
}
function htmlGantt(inicio: Date, fim: Date, linhas: { nome: string; fornecedor?: string | null; inicioPrevisto?: string | null; fimPrevisto?: string | null; status: string }[]) {
  const linhasHtml = linhas.map(l => {
    const { xPct, larguraPct } = calcularBarraGantt(inicio, fim, l.inicioPrevisto, l.fimPrevisto)
    return `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="width:140px;flex-shrink:0;font-size:11px;color:#dee2ec;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.nome}</div>
        <div style="position:relative;flex:1;height:16px;background:#1b2027;border-radius:4px;overflow:hidden">
          <div style="position:absolute;top:0;height:100%;border-radius:4px;left:${xPct}%;width:${larguraPct}%;background:${corHexEtapa(l.status)}"></div>
        </div>
      </div>`
  }).join('')
  return `
    <div style="background:#1b2027;border:1px solid #3d4948;border-radius:12px;padding:16px;margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:10px;color:#6ee9e0;text-transform:uppercase;font-weight:700">Cronograma (Gantt)</span>
        <div style="display:flex;gap:10px;font-size:9px;color:#869391">
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#69736f;margin-right:4px"></span>Pendente</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#ffcbac;margin-right:4px"></span>Em Andamento</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#6ee9e0;margin-right:4px"></span>Concluída</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#ffb4ab;margin-right:4px"></span>Atrasada</span>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;color:#869391;margin-bottom:8px;padding-left:150px">
        <span>${inicio.toLocaleDateString('pt-BR')}</span>
        <span>${fim.toLocaleDateString('pt-BR')}</span>
      </div>
      ${linhasHtml}
    </div>`
}
const CLIMA_OPCOES = [{ v: 'ensolarado', l: '☀️ Ensolarado' }, { v: 'nublado', l: '☁️ Nublado' }, { v: 'chuva', l: '🌧️ Chuva' }, { v: 'sem_expediente', l: '🚫 Sem expediente' }]

const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const labelCls = 'text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5'
const btnPrimaryCls = 'bg-primary text-on-primary rounded-lg px-4 py-3 text-sm font-bold hover:opacity-90 transition-all cursor-pointer w-full'
const btnSecondaryCls = 'bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg px-4 py-3 text-sm cursor-pointer'
const fileCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface-variant text-xs px-2 py-2 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-primary/10 file:text-primary file:text-xs file:font-semibold cursor-pointer'

const FRV_VAZIO = { data: new Date().toISOString().slice(0, 10), clima: '', descricao: '', pendencias: '', equipe_presente: [] as string[], nomeEquipeAtual: '' }
const FMED_VAZIO = { tipo: 'cliente', fornecedor: '', data: new Date().toISOString().slice(0, 10), observacao: '' }

export default function ObrasMobile() {
  const [obras, setObras] = useState<any[]>([])
  const [lancs, setLancs] = useState<any[]>([])
  const [gastos, setGastos] = useState<any[]>([])
  const [servicos, setServicos] = useState<any[]>([])
  const [orcamentos, setOrcamentos] = useState<any[]>([])
  const [orcItens, setOrcItens] = useState<any[]>([])
  const [medicoes, setMedicoes] = useState<any[]>([])
  const [medItens, setMedItens] = useState<any[]>([])
  const [etapas, setEtapas] = useState<any[]>([])
  const [relatorios, setRelatorios] = useState<any[]>([])
  const [funcionarios, setFuncionarios] = useState<any[]>([])
  const [funcionarioArquivos, setFuncionarioArquivos] = useState<any[]>([])
  const [funcExpandido, setFuncExpandido] = useState<string | null>(null)
  const [meuId, setMeuId] = useState('')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [detalhe, setDetalhe] = useState<any>(null)
  const [aba, setAba] = useState('resumo')
  const [tela, setTela] = useState<string | null>(null)
  const [fRv, setFRv] = useState(FRV_VAZIO)
  const [fotosRv, setFotosRv] = useState<{ file?: File; url?: string; descricao: string }[]>([])
  const [enviandoRv, setEnviandoRv] = useState(false)
  const [rvEditando, setRvEditando] = useState<any>(null)
  const [buscaRv, setBuscaRv] = useState('')
  const [buscaMed, setBuscaMed] = useState('')
  const [fMedicao, setFMedicao] = useState(FMED_VAZIO)
  const [medicaoAtiva, setMedicaoAtiva] = useState<any>(null)
  const [preenchimento, setPreenchimento] = useState<Record<string, { valor_base: string; percentual: string }>>({})
  const [mostrarProgramar, setMostrarProgramar] = useState(false)
  const [dataProgramar, setDataProgramar] = useState('')
  const [mostrarRelatorioPdf, setMostrarRelatorioPdf] = useState(false)
  const [observacoesPdf, setObservacoesPdf] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('viga_token')) { window.location.href = '/'; return }
    obterMinhasPermissoesApp().then(perm => {
      if (!temAcessoModuloApp(perm, 'obras')) { window.location.href = '/m'; return }
      if (perm) setMeuId(perm.id)
    })
    carregar()
  }, [])

  async function carregar() {
    const [o, l, g, s, orc, orcIt, med, medIt, et, rv, fu, fua] = await Promise.all([
      buscar('obras', '?order=created_at.desc'),
      buscar('lancamentos', '?order=data.desc'),
      buscar('gastos_cartao', '?order=data.desc'),
      buscar('obra_servicos', '?order=created_at'),
      buscar('orcamentos', '?order=created_at.desc'),
      buscar('orcamento_itens', '?order=created_at'),
      buscar('medicoes', '?order=data.desc'),
      buscar('medicao_itens', '?order=created_at'),
      buscar('cronograma_etapas', '?order=created_at'),
      buscar('obra_relatorios_visita', '?order=data.desc'),
      buscar('obra_funcionarios', '?order=created_at'),
      buscar('obra_funcionario_arquivos', '?order=created_at'),
    ])
    setObras(o); setLancs(l); setGastos(g); setServicos(s); setOrcamentos(orc); setOrcItens(orcIt)
    setMedicoes(med); setMedItens(medIt); setEtapas(et); setRelatorios(rv); setFuncionarios(fu); setFuncionarioArquivos(fua)
  }

  // Mesma logica "viva" de app/obras/page.tsx: custo/recebido por servico via medicoes,
  // com fallback pro lancamento/gasto vinculado ou pro valor manual.
  // Base "viva" pra medição: fornecedor mede em cima do custo de mão de obra do serviço
  // (não do valor cobrado do cliente); cliente mede em cima do valor cobrado.
  function baseParaMedicao(item: any, tipo: string) {
    if (tipo === 'fornecedor') {
      const mo = parseFloat(item.valor_mao_obra_previsto || 0)
      return mo > 0 ? mo : parseFloat(item.valor_previsto || 0)
    }
    return parseFloat(item.valor_previsto || 0)
  }
  function custoMaoObraServicoAuto(servico: any) {
    const vrLanc = lancs.filter(l => l.servico_id === servico.id && l.tipo === 'saida' && l.categoria !== 'Material').reduce((a, l) => a + parseFloat(l.valor || 0), 0)
    const vrGasto = gastos.filter(g => g.servico_id === servico.id && g.categoria !== 'Material').reduce((a, g) => a + parseFloat(g.valor || 0), 0)
    const registro = medItens
      .filter(mi => mi.servico_id === servico.id)
      .map(mi => ({ ...mi, medicao: medicoes.find(m => m.id === mi.medicao_id) }))
      .filter((mi): mi is any => !!mi.medicao && mi.medicao.tipo === 'fornecedor')
      .sort((a, b) => new Date(b.medicao.data).getTime() - new Date(a.medicao.data).getTime())[0]
    const vrMedicao = registro ? registro.valor_base * registro.percentual_acumulado : 0
    return Math.max(vrLanc + vrGasto, vrMedicao)
  }
  function custoMaterialServicoAuto(servico: any) {
    const vrLanc = lancs.filter(l => l.servico_id === servico.id && l.tipo === 'saida' && l.categoria === 'Material').reduce((a, l) => a + parseFloat(l.valor || 0), 0)
    const vrGasto = gastos.filter(g => g.servico_id === servico.id && g.categoria === 'Material').reduce((a, g) => a + parseFloat(g.valor || 0), 0)
    return vrLanc + vrGasto
  }
  function custoServicoAuto(servico: any) {
    const vrAuto = custoMaoObraServicoAuto(servico) + custoMaterialServicoAuto(servico)
    return vrAuto > 0 ? vrAuto : parseFloat(servico.valor_realizado || 0)
  }
  function cobradoClienteServicoAuto(servicoId: string) {
    const registro = medItens
      .filter(mi => mi.servico_id === servicoId)
      .map(mi => ({ ...mi, medicao: medicoes.find(m => m.id === mi.medicao_id) }))
      .filter((mi): mi is any => !!mi.medicao && mi.medicao.tipo === 'cliente')
      .sort((a, b) => new Date(b.medicao.data).getTime() - new Date(a.medicao.data).getTime())[0]
    return registro ? registro.valor_base * registro.percentual_acumulado : 0
  }
  function custosObra(id: string) {
    const svsObra = servicosObra(id)
    const porServico = svsObra.reduce((a, s) => a + custoServicoAuto(s), 0)
    const idsLancDeMedicao = new Set(medicoes.filter(m => m.obra_id === id && m.lancamento_id).map(m => m.lancamento_id))
    const indireto = lancs.filter(x => x.obra_id === id && x.tipo === 'saida' && !x.servico_id && !idsLancDeMedicao.has(x.id)).reduce((a, x) => a + parseFloat(x.valor || 0), 0)
    const cartao = gastos.filter(x => x.obra_id === id && !x.servico_id).reduce((a, x) => a + parseFloat(x.valor || 0), 0)
    return porServico + indireto + cartao
  }
  function receitasObra(id: string) {
    const svsObra = servicosObra(id)
    const porServico = svsObra.reduce((a, s) => a + cobradoClienteServicoAuto(s.id), 0)
    const idsLancDeMedicao = new Set(medicoes.filter(m => m.obra_id === id && m.lancamento_id).map(m => m.lancamento_id))
    const semMedicao = lancs.filter(x => x.obra_id === id && x.tipo === 'entrada' && !idsLancDeMedicao.has(x.id)).reduce((a, x) => a + parseFloat(x.valor || 0), 0)
    return porServico + semMedicao
  }
  function servicosObra(id: string) { return servicos.filter(s => s.obra_id === id) }
  function totalPrevisto(id: string) { return servicosObra(id).reduce((a, s) => a + parseFloat(s.valor_previsto || 0), 0) }
  function totalRealizado(id: string) { return servicosObra(id).reduce((a, s) => a + custoServicoAuto(s), 0) }

  const filtrados = obras.filter(o => {
    if (filtro !== 'todos' && o.status !== filtro) return false
    if (!busca) return true
    return [o.nome, o.cliente, o.codigo].some(v => v?.toLowerCase().includes(busca.toLowerCase()))
  })

  // ── Relatório de Visita ──────────────────────────────────────
  function adicionarNomeEquipe() {
    if (!fRv.nomeEquipeAtual.trim()) return
    setFRv({ ...fRv, equipe_presente: [...fRv.equipe_presente, fRv.nomeEquipeAtual.trim()], nomeEquipeAtual: '' })
  }
  function removerNomeEquipe(i: number) {
    setFRv({ ...fRv, equipe_presente: fRv.equipe_presente.filter((_, idx) => idx !== i) })
  }
  async function salvarRelatorioVisita() {
    if (!detalhe) return
    setEnviandoRv(true)
    try {
      const fotos: { url: string; descricao: string }[] = []
      let falhas = 0
      for (const f of fotosRv) {
        const url = f.url || (f.file ? await uploadFotoVisita(f.file) : null)
        if (url) fotos.push({ url, descricao: f.descricao || '' })
        else if (f.file) falhas++
      }
      const dados = {
        obra_id: detalhe.id, data: fRv.data, clima: fRv.clima || null, descricao: fRv.descricao || null,
        pendencias: fRv.pendencias || null, equipe_presente: fRv.equipe_presente, fotos,
      }
      const ok = rvEditando
        ? await editar('obra_relatorios_visita', rvEditando.id, dados)
        : !!(await criar('obra_relatorios_visita', { ...dados, criado_por: meuId || null }))
      if (!ok) { alert('Não foi possível salvar o relatório. Verifique a conexão e tente novamente.'); return }
      if (falhas > 0) alert(`Relatório salvo, mas ${falhas} foto(s) não foram enviadas (conexão instável). Edite o relatório para reenviá-las.`)
      setFRv(FRV_VAZIO); setFotosRv([]); setRvEditando(null)
      setTela('detalhe'); setAba('visitas')
      await carregar()
    } catch {
      alert('Não foi possível salvar o relatório. Verifique a conexão e tente novamente.')
    } finally {
      setEnviandoRv(false)
    }
  }

  function abrirEditarVisita(v: any) {
    setRvEditando(v)
    setFRv({ data: v.data, clima: v.clima || '', descricao: v.descricao || '', pendencias: v.pendencias || '', equipe_presente: v.equipe_presente || [], nomeEquipeAtual: '' })
    setFotosRv((v.fotos || []).map((f: any) => ({ url: f.url, descricao: f.descricao || '' })))
    setTela('novaVisita')
  }

  async function excluirVisita(v: any) {
    if (!confirm('Excluir este relatório de visita?')) return
    await remover('obra_relatorios_visita', v.id)
    await carregar()
  }

  // ── Medições ──────────────────────────────────────────────────
  function ultimoRegistro(servicoId: string, medicaoIdAtual: string | undefined, tipo: string, fornecedor?: string | null) {
    return medItens
      .filter(mi => mi.servico_id === servicoId && mi.medicao_id !== medicaoIdAtual)
      .map(mi => ({ ...mi, medicao: medicoes.find(m => m.id === mi.medicao_id) }))
      .filter(mi => mi.medicao && mi.medicao.tipo === tipo && (tipo !== 'fornecedor' || mi.medicao.fornecedor === fornecedor))
      .sort((a, b) => new Date(b.medicao.data).getTime() - new Date(a.medicao.data).getTime())[0] || null
  }

  // Total período (bruto) e líquido (após retenção) de uma medição já salva — mesma logica
  // de app/obras/page.tsx, usada no painel de credito/debito do contrato.
  function totalsMedicao(med: any) {
    const svsObra = servicosObra(med.obra_id)
    const itensFiltrados = svsObra.filter(s => med.tipo !== 'fornecedor' || !med.fornecedor || s.fornecedor === med.fornecedor)
    const orcVinculado = orcamentos.find(o => o.obra_id === med.obra_id)
    const retPct = parseFloat(orcVinculado?.retencao_percentual || 0)
    let totalPeriodo = 0, totalLiquido = 0
    itensFiltrados.forEach(item => {
      const mi = medItens.find(x => x.medicao_id === med.id && x.servico_id === item.id)
      if (!mi) return
      const ultimo = ultimoRegistro(item.id, med.id, med.tipo, med.fornecedor)
      const acumAnterior = ultimo ? ultimo.valor_base * ultimo.percentual_acumulado : 0
      const acumAtual = mi.valor_base * mi.percentual_acumulado
      const valorPeriodo = acumAtual - acumAnterior
      totalPeriodo += valorPeriodo
      totalLiquido += valorPeriodo - valorPeriodo * retPct
    })
    return { totalPeriodo, totalLiquido }
  }
  function abrirPreenchimentoMedicao(medicao: any, itensFiltrados: any[]) {
    const preench: Record<string, { valor_base: string; percentual: string }> = {}
    itensFiltrados.forEach(item => {
      const existente = medItens.find(mi => mi.medicao_id === medicao.id && mi.servico_id === item.id)
      const ultimo = ultimoRegistro(item.id, medicao.id, medicao.tipo, medicao.fornecedor)
      preench[item.id] = {
        valor_base: existente ? String(existente.valor_base) : (ultimo ? String(ultimo.valor_base) : String(baseParaMedicao(item, medicao.tipo))),
        percentual: existente ? String(existente.percentual_acumulado * 100) : (ultimo ? String(ultimo.percentual_acumulado * 100) : '0'),
      }
    })
    setPreenchimento(preench)
    setMedicaoAtiva(medicao)
    setTela('medicaoPreenchimento')
  }
  async function criarMedicao() {
    const ano = new Date().getFullYear()
    const medicoesObraAno = medicoes.filter(m => m.obra_id === detalhe.id && m.numero?.startsWith('MED-' + ano))
    const numero = 'MED-' + ano + '-' + String(medicoesObraAno.length + 1).padStart(3, '0')
    const orcVinculado = orcamentos.find(o => o.obra_id === detalhe.id)
    const nova = await criar('medicoes', {
      obra_id: detalhe.id, orcamento_id: orcVinculado?.id || null, tipo: fMedicao.tipo,
      fornecedor: fMedicao.tipo === 'fornecedor' ? (fMedicao.fornecedor || null) : null,
      numero, data: fMedicao.data, observacao: fMedicao.observacao, status: 'rascunho',
    })
    setTela('detalhe')
    if (nova?.id) {
      const [med, medIt] = await Promise.all([buscar('medicoes', '?order=data.desc'), buscar('medicao_itens', '?order=created_at')])
      setMedicoes(med); setMedItens(medIt)
      const svsObra = servicosObra(detalhe.id)
      const itensFiltrados = svsObra.filter(s => nova.tipo !== 'fornecedor' || !nova.fornecedor || s.fornecedor === nova.fornecedor)
      abrirPreenchimentoMedicao(nova, itensFiltrados)
    }
  }
  async function salvarPreenchimentoMedicao(itensFiltrados: any[]) {
    for (const item of itensFiltrados) {
      const p = preenchimento[item.id]
      if (!p) continue
      const existente = medItens.find(mi => mi.medicao_id === medicaoAtiva.id && mi.servico_id === item.id)
      const dados = { medicao_id: medicaoAtiva.id, servico_id: item.id, valor_base: parseFloat(p.valor_base || '0'), percentual_acumulado: parseFloat(p.percentual || '0') / 100 }
      if (existente) await editar('medicao_itens', existente.id, dados)
      else await criar('medicao_itens', dados)
    }
    const medIt = await buscar('medicao_itens', '?order=created_at')
    setMedItens(medIt)
    alert('Medição salva!')
  }

  // Mesma logica de app/obras/page.tsx: distribui os servicos (por `ordem`) em fatias
  // sequenciais dentro do periodo da obra, gerando/atualizando cronograma_etapas por servico.
  async function distribuirCronograma(obraId: string, forceAll: boolean = false) {
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
      const existente = etapasAtuais.find((e: any) => e.servico_id === s.id)
      if (existente && !forceAll) continue
      const dIni = new Date(inicio.getTime() + Math.round(i * fatia) * 86400000)
      const dFim = new Date(inicio.getTime() + (Math.round((i + 1) * fatia) - 1) * 86400000)
      const dados = { obra_id: obraId, servico_id: s.id, data_inicio_prevista: dIni.toISOString().slice(0, 10), data_fim_prevista: dFim.toISOString().slice(0, 10) }
      if (existente) await editar('cronograma_etapas', existente.id, dados)
      else await criar('cronograma_etapas', { ...dados, status: 'pendente' })
    }
    const et = await buscar('cronograma_etapas', '?order=created_at')
    setEtapas(et)
  }

  async function reordenarServico(servico: any, direcao: -1 | 1) {
    const svsObra = ordenarServicosObra(servicosObra(servico.obra_id))
    const idx = svsObra.findIndex(s => s.id === servico.id)
    const vizinho = svsObra[idx + direcao]
    // Só reordena dentro da mesma categoria — a ordem entre categorias já é fixada pela
    // sequência de execução (Demolição antes de Pintura, etc.), não pelo campo "ordem".
    if (!vizinho || (vizinho.categoria || null) !== (servico.categoria || null)) return
    const ordemAtual = servico.ordem ?? idx
    const ordemVizinho = vizinho.ordem ?? (idx + direcao)
    await Promise.all([
      editar('obra_servicos', servico.id, { ordem: ordemVizinho }),
      editar('obra_servicos', vizinho.id, { ordem: ordemAtual }),
    ])
    await carregar()
    await distribuirCronograma(servico.obra_id, true)
  }

  // Mesmo padrao visual de gerarPDFMedicao/gerarPDFObra (desktop).
  async function gerarPDFCronograma(obra: any, linhas: { servico: any; etapa: any }[]) {
    const cfg = (await buscar('empresa_config', '?limit=1'))[0] || {}
    const nomeEmpresa = cfg.nome_empresa || 'VIGA'
    const linhasHtml = linhas.map(({ servico, etapa }) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948">${servico.nome}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;color:#bcc9c7">${servico.fornecedor || '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:center">${etapa?.data_inicio_prevista ? new Date(etapa.data_inicio_prevista).toLocaleDateString('pt-BR') : '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:center">${etapa?.data_fim_prevista ? new Date(etapa.data_fim_prevista).toLocaleDateString('pt-BR') : '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:center">${ETAPA_STATUS[etapa?.status] || '—'}</td>
      </tr>`).join('')
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Cronograma ${obra.codigo} — ${nomeEmpresa}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { background:#0f141b; color:#dee2ec; font-family:'Inter',sans-serif; font-size:13px; }
      h1,h2 { font-family:'Manrope',sans-serif; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
    ${botaoVoltarApp('/m/obras')}
    <div style="max-width:900px;margin:0 auto;padding:40px 36px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #3d4948">
        <div>
          <h1 style="font-size:24px;font-weight:700;color:#6ee9e0;text-transform:uppercase">Cronograma da Obra</h1>
          <p style="color:#bcc9c7">Serviços, datas previstas e status</p>
        </div>
        <div style="text-align:right">
          ${cfg.logo_url ? `<img src="${cfg.logo_url}" style="height:32px;object-fit:contain;margin-bottom:6px" />` : `<div style="font-size:18px;font-weight:900;color:#6ee9e0">${nomeEmpresa}</div>`}
          <p style="font-size:10px;color:#869391">Ref: ${obra.codigo}</p>
          <p style="font-size:10px;color:#869391">Gerado em: ${new Date().toLocaleDateString('pt-BR')}</p>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
        <div style="background:#1b2027;border:1px solid #3d4948;border-radius:12px;padding:16px">
          <span style="font-size:10px;color:#6ee9e0;text-transform:uppercase;font-weight:700">Obra</span>
          <p style="font-size:15px;font-weight:700;margin-top:4px">${obra?.nome || ''}</p>
          <p style="font-size:12px;color:#bcc9c7">${obra?.cliente || ''}</p>
        </div>
        <div style="background:#1b2027;border:1px solid #3d4948;border-radius:12px;padding:16px">
          <span style="font-size:10px;color:#869391;text-transform:uppercase">Período Previsto</span>
          <p style="font-size:15px;font-weight:700;margin-top:4px">${obra.data_inicio ? new Date(obra.data_inicio).toLocaleDateString('pt-BR') : '—'} — ${obra.data_previsao ? new Date(obra.data_previsao).toLocaleDateString('pt-BR') : '—'}</p>
        </div>
      </div>
      ${obra.data_inicio && obra.data_previsao ? htmlGantt(new Date(obra.data_inicio + 'T00:00:00'), new Date(obra.data_previsao + 'T00:00:00'), linhas.map(({ servico, etapa }) => ({ nome: servico.nome, fornecedor: servico.fornecedor, inicioPrevisto: etapa?.data_inicio_prevista, fimPrevisto: etapa?.data_fim_prevista, status: etapa?.status || 'pendente' }))) : ''}
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <thead>
          <tr style="background:#252a32">
            <th style="padding:8px 10px;text-align:left;font-size:10px;color:#869391;text-transform:uppercase">Serviço</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;color:#869391;text-transform:uppercase">Fornecedor</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;color:#869391;text-transform:uppercase">Início</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;color:#869391;text-transform:uppercase">Fim</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;color:#869391;text-transform:uppercase">Status</th>
          </tr>
        </thead>
        <tbody>${linhasHtml}</tbody>
      </table>
    </div>
    <script>window.onload = () => { window.print() }</script>
    </body></html>`
    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  // Mesmo padrao visual/logico de gerarPDFObra (desktop): resumo, curva S, Gantt, curva ABC e financeiro.
  async function gerarPDFObra(obra: any, observacoesTexto: string) {
    const cfg = (await buscar('empresa_config', '?limit=1'))[0] || {}
    const nomeEmpresa = cfg.nome_empresa || 'VIGA'
    const custos = custosObra(obra.id)
    const receitas = receitasObra(obra.id)
    const contrato = parseFloat(obra.valor_contrato || 0)
    const margem = receitas - custos
    const margemPrevistaPct = contrato > 0 ? ((contrato - custos) / contrato) * 100 : 0

    const svsObra = servicos.filter(s => s.obra_id === obra.id)
    const etapasObra = etapas.filter(e => e.obra_id === obra.id)
    const medicoesObra = medicoes.filter(m => m.obra_id === obra.id)

    const totalItens = svsObra.reduce((a, s) => a + parseFloat(s.valor_previsto || 0), 0)
    let progressoFisico = 0
    if (totalItens > 0) {
      const acumFisico = svsObra.reduce((acc, item) => {
        const registros = medItens
          .filter(mi => mi.servico_id === item.id)
          .map(mi => ({ ...mi, medicao: medicoesObra.find(m => m.id === mi.medicao_id) }))
          .filter((mi): mi is any => !!mi.medicao)
          .sort((a, b) => new Date(b.medicao.data).getTime() - new Date(a.medicao.data).getTime())
        const ultimo = registros[0]
        return acc + (ultimo ? ultimo.valor_base * ultimo.percentual_acumulado : 0)
      }, 0)
      progressoFisico = Math.min((acumFisico / totalItens) * 100, 100)
    } else {
      progressoFisico = pct(custos, contrato)
    }

    const inicio = obra.data_inicio ? new Date(obra.data_inicio) : new Date()
    const fim = obra.data_previsao ? new Date(obra.data_previsao) : new Date(inicio.getTime() + 180 * 86400000)
    const hoje = new Date()

    const planPontos = etapasObra
      .filter(e => e.data_fim_prevista)
      .map(e => ({ data: new Date(e.data_fim_prevista), item: svsObra.find(s => s.id === e.servico_id) }))
      .filter((p): p is { data: Date; item: any } => !!p.item)
      .sort((a, b) => a.data.getTime() - b.data.getTime())
    let acumPlan = 0
    const planSerie: { data: Date; pct: number }[] = [{ data: inicio, pct: 0 }]
    planPontos.forEach(p => {
      acumPlan += parseFloat(p.item.valor_previsto || 0)
      planSerie.push({ data: p.data, pct: totalItens > 0 ? Math.min((acumPlan / totalItens) * 100, 100) : 0 })
    })
    if (planSerie.length === 1) planSerie.push({ data: fim, pct: 0 })

    const datasMedicoes = Array.from(new Set(medicoesObra.map(m => m.data))).sort()
    const realSerie: { data: Date; pct: number }[] = [{ data: inicio, pct: 0 }]
    datasMedicoes.forEach(d => {
      const dataD = new Date(d as string)
      let acum = 0
      svsObra.forEach(item => {
        const registros = medItens
          .filter(mi => mi.servico_id === item.id)
          .map(mi => ({ ...mi, medicao: medicoesObra.find(m => m.id === mi.medicao_id) }))
          .filter((mi): mi is any => !!mi.medicao && new Date(mi.medicao.data) <= dataD)
          .sort((a, b) => new Date(b.medicao.data).getTime() - new Date(a.medicao.data).getTime())
        if (registros[0]) acum += registros[0].valor_base * registros[0].percentual_acumulado
      })
      realSerie.push({ data: dataD, pct: totalItens > 0 ? Math.min((acum / totalItens) * 100, 100) : 0 })
    })

    const totalMs = Math.max(fim.getTime() - inicio.getTime(), 1)
    function serieParaPath(serie: { data: Date; pct: number }[]) {
      return serie.map((p, i) => {
        const x = Math.max(0, Math.min(800, ((p.data.getTime() - inicio.getTime()) / totalMs) * 800))
        const y = 300 - (p.pct / 100) * 300
        return (i === 0 ? 'M ' : 'L ') + x.toFixed(1) + ' ' + y.toFixed(1)
      }).join(' ')
    }
    const planPath = serieParaPath(planSerie)
    const realPath = serieParaPath(realSerie)
    const hojeX = Math.max(0, Math.min(800, ((hoje.getTime() - inicio.getTime()) / totalMs) * 800))
    const temCurva = etapasObra.some(e => e.data_fim_prevista) || medicoesObra.length > 0

    const mesesEixo: string[] = []
    for (let i = 0; i <= 6; i++) {
      const d = new Date(inicio.getTime() + (totalMs * i) / 6)
      mesesEixo.push(d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase())
    }

    const lancD = lancs.filter(l => l.obra_id === obra.id)
    const gastD = gastos.filter(g => g.obra_id === obra.id)
    const movimentos = [
      ...lancD.map((l: any) => ({ data: l.data, descricao: l.descricao, categoria: l.categoria, valor: parseFloat(l.valor || 0), tipo: l.tipo, status: l.status })),
      ...gastD.map((g: any) => ({ data: g.data, descricao: g.descricao, categoria: g.categoria, valor: parseFloat(g.valor || 0), tipo: 'saida', status: 'pago' })),
    ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()).slice(0, 12)

    const custosPorGrupo: Record<string, number> = {}
    ;[...lancD.filter((l: any) => l.tipo === 'saida'), ...gastD].forEach((m: any) => {
      const g = grupoCusto(m.categoria || '')
      custosPorGrupo[g] = (custosPorGrupo[g] || 0) + parseFloat(m.valor || 0)
    })
    const totalCustosGrupo = Object.values(custosPorGrupo).reduce((a, b) => a + b, 0) || 1
    const gruposOrdem = ['Materiais & Insumos', 'Mão de Obra Direta', 'Equipamentos & Logística', 'Custos Indiretos']
    const coresBucket: Record<string, string> = {
      'Materiais & Insumos': '#6ee9e0',
      'Mão de Obra Direta': '#cebdff',
      'Equipamentos & Logística': '#ffcbac',
      'Custos Indiretos': '#869391',
    }

    const roi = custos > 0 ? (margem / custos) * 100 : 0

    // Curva ABC: serviços ordenados por valor previsto, classificados pelo peso acumulado
    // no orçamento (A até 80%, B até 95%, C o restante) — ajuda a priorizar o controle.
    const svsOrdenadosABC = svsObra.slice().sort((a, b) => parseFloat(b.valor_previsto || 0) - parseFloat(a.valor_previsto || 0))
    const totalPrevistoABC = svsOrdenadosABC.reduce((a, s) => a + parseFloat(s.valor_previsto || 0), 0) || 1
    let acumABC = 0
    const curvaAbcHtml = svsOrdenadosABC.map(s => {
      const valor = parseFloat(s.valor_previsto || 0)
      const pctInd = (valor / totalPrevistoABC) * 100
      const acumAntes = acumABC
      acumABC += pctInd
      const classe = acumAntes < 80 ? 'A' : acumAntes < 95 ? 'B' : 'C'
      const corClasse = classe === 'A' ? '#6ee9e0' : classe === 'B' ? '#ffcbac' : '#869391'
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #3d4948">${s.nome}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:right">${moeda(valor)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:center">${pctInd.toFixed(1)}%</td>
          <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:center">${acumABC.toFixed(1)}%</td>
          <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:center"><span style="padding:2px 8px;border-radius:4px;background:${corClasse}22;color:${corClasse};font-weight:700">${classe}</span></td>
        </tr>`
    }).join('')

    const ganttObraHtml = obra.data_inicio && obra.data_previsao
      ? htmlGantt(inicio, fim, svsObra.map(s => {
          const et = etapasObra.find(e => e.servico_id === s.id)
          return { nome: s.nome, fornecedor: s.fornecedor, inicioPrevisto: et?.data_inicio_prevista, fimPrevisto: et?.data_fim_prevista, status: et?.status || 'pendente' }
        }))
      : '<div class="card" style="text-align:center;color:#869391;padding:30px 0">Informe as datas de início e fim da obra para gerar o Gantt.</div>'

    const movimentosHtml = movimentos.map(m => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;font-family:'JetBrains Mono',monospace;font-size:12px">${new Date(m.data).toLocaleDateString('pt-BR')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948">${m.descricao || ''}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;color:#bcc9c7;font-size:12px">${m.categoria || '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:right;color:${m.tipo === 'entrada' ? '#6ee9e0' : '#ffb4ab'}">${m.tipo === 'entrada' ? '+' : '-'}${moeda(m.valor)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:center">
          <span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;background:${m.status === 'pago' ? '#6ee9e01a' : '#ffcbac1a'};color:${m.status === 'pago' ? '#6ee9e0' : '#ffcbac'};text-transform:uppercase">${m.status === 'pago' ? 'Pago/Recebido' : 'Pendente'}</span>
        </td>
      </tr>`).join('')

    const distribuicaoHtml = gruposOrdem.filter(g => custosPorGrupo[g] > 0).map(g => {
      const percentual = (custosPorGrupo[g] / totalCustosGrupo) * 100
      return `
      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span>${g}</span>
          <span style="font-family:'JetBrains Mono',monospace;color:${coresBucket[g]}">${percentual.toFixed(0)}%</span>
        </div>
        <div style="height:8px;background:#30353d;border-radius:999px;overflow:hidden">
          <div style="height:100%;width:${percentual}%;background:${coresBucket[g]}"></div>
        </div>
      </div>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Relatório ${obra.codigo} — ${nomeEmpresa}</title>
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
    ${botaoVoltarApp('/m/obras')}

    <!-- PÁGINA 1 -->
    <div class="page">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #3d4948">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:44px;height:44px;background:#6ee9e0;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:900;color:#003734;font-size:20px">${nomeEmpresa.charAt(0)}</div>
          <div>
            <h1 style="font-size:20px;font-weight:800;color:#6ee9e0;text-transform:uppercase">${nomeEmpresa}</h1>
            <p style="font-size:9px;color:#869391;text-transform:uppercase;letter-spacing:0.08em">Construction System</p>
          </div>
        </div>
        <div style="text-align:right">
          <h2 style="font-size:16px;font-weight:600">Relatório de Status de Projeto</h2>
          <p style="font-size:10px;color:#869391">Gerado em: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
          <p style="font-size:10px;color:#6ee9e0;font-weight:700">Ref: ${obra.codigo}</p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:20px">
        <div class="card">
          <span style="font-size:10px;color:#6ee9e0;text-transform:uppercase;font-weight:700">Resumo do Projeto</span>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px">
            <div><span style="font-size:9px;color:#869391;text-transform:uppercase;display:block">Projeto</span><span style="font-size:14px;font-weight:600">${obra.nome}</span></div>
            <div><span style="font-size:9px;color:#869391;text-transform:uppercase;display:block">Cliente</span><span style="font-size:14px;font-weight:600">${obra.cliente}</span></div>
            <div><span style="font-size:9px;color:#869391;text-transform:uppercase;display:block">Localização</span><span style="font-size:14px;font-weight:600">${obra.endereco || '—'}</span></div>
            <div><span style="font-size:9px;color:#869391;text-transform:uppercase;display:block">Cronograma</span><span style="font-size:14px;font-weight:600">${obra.data_inicio ? new Date(obra.data_inicio).toLocaleDateString('pt-BR') : '—'} — ${obra.data_previsao ? new Date(obra.data_previsao).toLocaleDateString('pt-BR') : '—'}</span></div>
          </div>
        </div>
        <div class="card" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
          <span style="font-size:10px;color:#869391;text-transform:uppercase;margin-bottom:8px">Progresso Atual</span>
          <svg width="88" height="88" viewBox="0 0 96 96" style="transform:rotate(-90deg)">
            <circle cx="48" cy="48" r="40" fill="transparent" stroke="#30353d" stroke-width="8" />
            <circle cx="48" cy="48" r="40" fill="transparent" stroke="#6ee9e0" stroke-width="8" stroke-dasharray="251.2" stroke-dashoffset="${(251.2 * (1 - progressoFisico / 100)).toFixed(1)}" stroke-linecap="round" />
          </svg>
          <div style="margin-top:-56px;font-size:20px;font-weight:700">${progressoFisico.toFixed(0)}%</div>
          <div style="margin-top:36px;font-size:11px;color:#6ee9e0">${obraAtrasada(obra) ? 'Status: Atrasada' : 'Status: Conforme Cronograma'}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
        <div class="card">
          <span style="font-size:9px;color:#869391;text-transform:uppercase">Valor de Contrato</span>
          <p style="font-size:18px;font-weight:700;margin-top:4px">${moeda(contrato)}</p>
        </div>
        <div class="card">
          <span style="font-size:9px;color:#869391;text-transform:uppercase">Custo Total Atual</span>
          <p style="font-size:18px;font-weight:700;margin-top:4px;color:#ffcbac">${moeda(custos)}</p>
        </div>
        <div class="card">
          <span style="font-size:9px;color:#869391;text-transform:uppercase">Margem Prevista</span>
          <p style="font-size:18px;font-weight:700;margin-top:4px;color:${margemPrevistaPct >= 0 ? '#6ee9e0' : '#ffb4ab'}">${margemPrevistaPct.toFixed(1)}%</p>
        </div>
      </div>

      ${temCurva ? `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <span style="font-size:10px;color:#6ee9e0;text-transform:uppercase;font-weight:700">Curva S - Evolução Físico-Financeira</span>
          <div style="display:flex;gap:12px;font-size:9px;color:#869391">
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:#6ee9e0;margin-right:4px"></span>PLANEJADO</span>
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:#ffcbac;margin-right:4px"></span>REALIZADO</span>
          </div>
        </div>
        <svg width="100%" height="220" viewBox="0 0 800 300" style="background:#171c23;border-radius:8px">
          <path d="${planPath}" fill="none" stroke="#6ee9e0" stroke-width="3" stroke-dasharray="8 4" opacity="0.7" />
          <path d="${realPath}" fill="none" stroke="#ffcbac" stroke-width="4" />
          <line x1="${hojeX.toFixed(1)}" y1="0" x2="${hojeX.toFixed(1)}" y2="300" stroke="#869391" stroke-width="1" stroke-dasharray="4 4" />
          <text x="${(hojeX + 5).toFixed(1)}" y="16" fill="#869391" font-size="10" font-weight="700">HOJE</text>
        </svg>
        <div style="display:flex;justify-content:space-between;margin-top:6px">
          ${mesesEixo.map(m => `<span style="font-size:9px;color:#869391">${m}</span>`).join('')}
        </div>
      </div>` : `<div class="card" style="text-align:center;color:#869391;padding:30px 0">Sem cronograma ou medições registradas para montar a Curva S.</div>`}

      <div style="display:flex;justify-content:space-between;margin-top:24px;padding-top:16px;border-top:1px solid #3d4948;font-size:9px;color:#869391;text-transform:uppercase">
        <span>Documento Confidencial - ${nomeEmpresa} Construction System</span>
        <span>Página 1 de 3</span>
      </div>
    </div>

    <!-- PÁGINA 2 -->
    <div class="page">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid #3d4948">
        <span style="font-size:14px;font-weight:800;color:#6ee9e0">${nomeEmpresa}</span>
        <span style="font-size:10px;color:#869391;text-transform:uppercase">Cronograma e Curva ABC</span>
      </div>

      <div style="margin-bottom:20px">
        <span style="font-size:10px;color:#6ee9e0;text-transform:uppercase;font-weight:700">Cronograma da Obra</span>
        <div style="margin-top:8px">${ganttObraHtml}</div>
      </div>

      <div style="margin-bottom:20px">
        <span style="font-size:10px;color:#6ee9e0;text-transform:uppercase;font-weight:700">Curva ABC — Peso dos Serviços no Orçamento</span>
        <table style="width:100%;border-collapse:collapse;margin-top:8px">
          <thead>
            <tr style="background:#252a32">
              <th style="padding:8px 10px;text-align:left;font-size:9px;color:#869391;text-transform:uppercase">Serviço</th>
              <th style="padding:8px 10px;text-align:right;font-size:9px;color:#869391;text-transform:uppercase">Previsto</th>
              <th style="padding:8px 10px;text-align:center;font-size:9px;color:#869391;text-transform:uppercase">% Individual</th>
              <th style="padding:8px 10px;text-align:center;font-size:9px;color:#869391;text-transform:uppercase">% Acumulado</th>
              <th style="padding:8px 10px;text-align:center;font-size:9px;color:#869391;text-transform:uppercase">Classe</th>
            </tr>
          </thead>
          <tbody>${curvaAbcHtml || '<tr><td colspan="5" style="padding:16px;text-align:center;color:#869391">Nenhum serviço cadastrado</td></tr>'}</tbody>
        </table>
      </div>

      <div style="display:flex;justify-content:space-between;margin-top:24px;padding-top:16px;border-top:1px solid #3d4948;font-size:9px;color:#869391;text-transform:uppercase">
        <span>Documento Confidencial - ${nomeEmpresa} Construction System</span>
        <span>Página 2 de 3</span>
      </div>
    </div>

    <!-- PÁGINA 3 -->
    <div class="page">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid #3d4948">
        <span style="font-size:14px;font-weight:800;color:#6ee9e0">${nomeEmpresa}</span>
        <span style="font-size:10px;color:#869391;text-transform:uppercase">Análise Financeira Detalhada</span>
      </div>

      <div style="margin-bottom:20px">
        <span style="font-size:10px;color:#6ee9e0;text-transform:uppercase;font-weight:700">Movimentações Financeiras</span>
        <table style="width:100%;border-collapse:collapse;margin-top:8px">
          <thead>
            <tr style="background:#252a32">
              <th style="padding:8px 10px;text-align:left;font-size:9px;color:#869391;text-transform:uppercase">Data</th>
              <th style="padding:8px 10px;text-align:left;font-size:9px;color:#869391;text-transform:uppercase">Descrição</th>
              <th style="padding:8px 10px;text-align:left;font-size:9px;color:#869391;text-transform:uppercase">Categoria</th>
              <th style="padding:8px 10px;text-align:right;font-size:9px;color:#869391;text-transform:uppercase">Valor</th>
              <th style="padding:8px 10px;text-align:center;font-size:9px;color:#869391;text-transform:uppercase">Status</th>
            </tr>
          </thead>
          <tbody>${movimentosHtml || '<tr><td colspan="5" style="padding:16px;text-align:center;color:#869391">Nenhuma movimentação registrada</td></tr>'}</tbody>
        </table>
      </div>

      <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:16px;margin-bottom:20px">
        <div>
          <span style="font-size:10px;color:#6ee9e0;text-transform:uppercase;font-weight:700">Distribuição de Custos</span>
          <div class="card" style="margin-top:8px">${distribuicaoHtml || '<p style="color:#869391;text-align:center">Sem custos lançados ainda</p>'}</div>
        </div>
        <div>
          <span style="font-size:10px;color:#869391;text-transform:uppercase">Resumo da Margem</span>
          <div class="card" style="margin-top:8px">
            <div style="display:flex;justify-content:space-between;padding-bottom:8px;border-bottom:1px solid #3d4948;margin-bottom:8px">
              <span style="font-size:12px;color:#bcc9c7">Receita Bruta</span><span style="font-family:'JetBrains Mono',monospace">${moeda(receitas)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding-bottom:8px;border-bottom:1px solid #3d4948;margin-bottom:8px">
              <span style="font-size:12px;color:#bcc9c7">Despesas Totais</span><span style="font-family:'JetBrains Mono',monospace;color:#ffb4ab">${moeda(custos)}</span>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="font-size:12px;color:#bcc9c7">Lucro Operacional</span><span style="font-family:'JetBrains Mono',monospace;font-weight:700;color:${margem >= 0 ? '#6ee9e0' : '#ffb4ab'}">${moeda(margem)}</span>
            </div>
            <div style="text-align:center;margin-top:16px;padding-top:12px;border-top:1px solid #3d4948">
              <p style="font-size:9px;color:#869391;text-transform:uppercase">ROI sobre Custos</p>
              <p style="font-size:20px;font-weight:800;color:#6ee9e0">${roi.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>

      ${observacoesTexto ? `
      <div style="margin-bottom:20px">
        <span style="font-size:10px;color:#6ee9e0;text-transform:uppercase;font-weight:700">Observações Técnicas e Riscos</span>
        <div class="card" style="margin-top:8px;white-space:pre-wrap;color:#bcc9c7;font-size:12px">${observacoesTexto}</div>
      </div>` : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:40px;padding-top:16px">
        <div style="text-align:center">
          <div style="width:100%;height:1px;background:#3d4948;margin-bottom:8px"></div>
          <p style="font-size:11px;font-weight:700;text-transform:uppercase">${obra.responsavel || 'Responsável Técnico'}</p>
          <p style="font-size:9px;color:#869391;text-transform:uppercase">Responsável Técnico</p>
        </div>
        <div style="text-align:center">
          <div style="width:100%;height:1px;background:#3d4948;margin-bottom:8px"></div>
          <p style="font-size:11px;font-weight:700;text-transform:uppercase">${obra.cliente}</p>
          <p style="font-size:9px;color:#869391;text-transform:uppercase">Cliente / Contratante</p>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;margin-top:24px;padding-top:16px;border-top:1px solid #3d4948;font-size:9px;color:#869391;text-transform:uppercase">
        <span>${nomeEmpresa} Construction Management System</span>
        <span>Página 3 de 3</span>
      </div>
    </div>

    <script>window.onload = () => { window.print() }</script>
    </body></html>`

    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  async function confirmarProgramarPagamento(totalLiquido: number) {
    if (!medicaoAtiva || !dataProgramar) return
    if (medicaoAtiva.lancamento_id) {
      await editar('lancamentos', medicaoAtiva.lancamento_id, { data_vencimento: dataProgramar })
      await editar('medicoes', medicaoAtiva.id, { data_pagamento_programada: dataProgramar })
    } else {
      const dados = {
        data: new Date().toISOString().slice(0, 10),
        descricao: 'Medição ' + medicaoAtiva.numero + (medicaoAtiva.fornecedor ? ' — ' + medicaoAtiva.fornecedor : ''),
        tipo: medicaoAtiva.tipo === 'fornecedor' ? 'saida' : 'entrada',
        valor: Math.abs(totalLiquido), categoria: 'Medição de obra', status: 'pendente',
        data_vencimento: dataProgramar, obra_id: detalhe.id,
      }
      const lanc = await criar('lancamentos', dados)
      if (lanc?.id) await editar('medicoes', medicaoAtiva.id, { data_pagamento_programada: dataProgramar, lancamento_id: lanc.id })
    }
    const med = await buscar('medicoes', '?order=data.desc')
    setMedicoes(med)
    setMedicaoAtiva(med.find((m: any) => m.id === medicaoAtiva.id) || null)
    setMostrarProgramar(false)
  }

  // ── Tela: Nova Medição ──────────────────────────────────────────
  if (tela === 'novaMedicao' && detalhe) {
    const fornecedoresDisponiveis = Array.from(new Set(servicosObra(detalhe.id).map(s => s.fornecedor).filter(Boolean))) as string[]
    return (
      <MobileShell title="Nova Medição">
        <div className="p-4 flex flex-col gap-3.5 pb-8">
          <div>
            <label className={labelCls}>Tipo</label>
            <select className={inputCls} value={fMedicao.tipo} onChange={e => setFMedicao({ ...fMedicao, tipo: e.target.value, fornecedor: '' })}>
              <option value="cliente">Cobrar Cliente</option>
              <option value="fornecedor">Pagar Fornecedor</option>
            </select>
          </div>
          {fMedicao.tipo === 'fornecedor' && (
            <div>
              <label className={labelCls}>Fornecedor / Equipe</label>
              <select className={inputCls} value={fMedicao.fornecedor} onChange={e => setFMedicao({ ...fMedicao, fornecedor: e.target.value })}>
                <option value="">Todos os itens sem fornecedor específico</option>
                {fornecedoresDisponiveis.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>Data</label>
            <input className={inputCls} type="date" value={fMedicao.data} onChange={e => setFMedicao({ ...fMedicao, data: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Observação</label>
            <input className={inputCls} value={fMedicao.observacao} onChange={e => setFMedicao({ ...fMedicao, observacao: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2 mt-2">
            <button className={btnPrimaryCls} onClick={() => criarMedicao()}>Criar e Preencher</button>
            <button className={btnSecondaryCls} onClick={() => setTela('detalhe')}>Cancelar</button>
          </div>
        </div>
      </MobileShell>
    )
  }

  // ── Tela: Preenchimento de Medição ────────────────────────────
  if (tela === 'medicaoPreenchimento' && detalhe && medicaoAtiva) {
    const orcamentoObra = orcamentos.find(o => o.obra_id === detalhe.id)
    const itensFiltrados = servicosObra(detalhe.id).filter(s => medicaoAtiva.tipo !== 'fornecedor' || !medicaoAtiva.fornecedor || s.fornecedor === medicaoAtiva.fornecedor)
    const retPct = parseFloat(orcamentoObra?.retencao_percentual || 0)
    let totalPeriodo = 0, totalRetencao = 0, totalLiquido = 0
    const linhas = itensFiltrados.map(item => {
      const p = preenchimento[item.id] || { valor_base: String(baseParaMedicao(item, medicaoAtiva.tipo)), percentual: '0' }
      const ultimo = ultimoRegistro(item.id, medicaoAtiva.id, medicaoAtiva.tipo, medicaoAtiva.fornecedor)
      const acumAnterior = ultimo ? ultimo.valor_base * ultimo.percentual_acumulado : 0
      const valorBase = parseFloat(p.valor_base || '0')
      const percAtual = parseFloat(p.percentual || '0') / 100
      const acumAtual = valorBase * percAtual
      const valorPeriodo = acumAtual - acumAnterior
      const retencao = valorPeriodo * retPct
      const liquido = valorPeriodo - retencao
      totalPeriodo += valorPeriodo; totalRetencao += retencao; totalLiquido += liquido
      return { item, p, acumAtual, valorPeriodo, retencao, liquido }
    })
    return (
      <MobileShell title={medicaoAtiva.numero}>
        <div className="p-4 flex flex-col gap-3 pb-8">
          <button className="text-primary text-sm font-semibold text-left" onClick={() => { setMedicaoAtiva(null); setTela('detalhe') }}>← Voltar às Medições</button>
          <div className="text-[11px] text-on-surface-variant flex items-center gap-1.5">
            <span>{dataBR(medicaoAtiva.data)} · Retenção</span>
            <input key={medicaoAtiva.id} type="number" step="0.1" min="0" defaultValue={(retPct * 100).toFixed(1)}
              onBlur={async e => {
                const novoPct = parseFloat(e.target.value || '0')
                if (!orcamentoObra) return
                const ok = await editar('orcamentos', orcamentoObra.id, { retencao_percentual: novoPct / 100 })
                if (!ok) return alert('Não foi possível salvar a retenção.')
                setOrcamentos(orcamentos.map(o => o.id === orcamentoObra.id ? { ...o, retencao_percentual: novoPct / 100 } : o))
              }}
              className="w-14 bg-surface-container-low border border-outline-variant rounded px-1.5 py-0.5 text-on-surface text-[11px]" />
            <span>%</span>
          </div>
          {linhas.length === 0 ? (
            <div className="text-center py-8 text-on-surface-variant text-body-sm">Nenhum item para medir</div>
          ) : linhas.map(({ item, p, acumAtual, valorPeriodo, retencao, liquido }) => (
            <div key={item.id} className="bg-surface-container border border-outline-variant rounded-xl p-4">
              <div className="font-semibold text-sm text-on-surface mb-2">{item.nome}{item.fornecedor && <span className="text-on-surface-variant font-normal"> · {item.fornecedor}</span>}</div>
              <div className="grid grid-cols-2 gap-2.5 mb-2">
                <div>
                  <label className={labelCls}>Valor Base</label>
                  <input className={inputCls} type="number" value={p.valor_base} onChange={e => setPreenchimento({ ...preenchimento, [item.id]: { ...p, valor_base: e.target.value } })} />
                </div>
                <div>
                  <label className={labelCls}>% Acumulado</label>
                  <input className={inputCls} type="number" min="0" max="100" value={p.percentual} onChange={e => setPreenchimento({ ...preenchimento, [item.id]: { ...p, percentual: e.target.value } })} />
                </div>
              </div>
              <div className="mb-2">
                <div className="h-1.5 bg-surface-variant rounded overflow-hidden mb-1">
                  <div className={`h-full rounded ${corProgresso(parseFloat(p.percentual || '0'))}`} style={{ width: Math.min(parseFloat(p.percentual || '0'), 100) + '%' }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                <div><div className="text-on-surface-variant">Acumulado</div><div className="font-semibold text-on-surface">{moeda(acumAtual)}</div></div>
                <div><div className="text-on-surface-variant">Período</div><div className="font-semibold text-primary">{moeda(valorPeriodo)}</div></div>
                <div><div className="text-on-surface-variant">Líquido</div><div className="font-semibold text-primary-container">{moeda(liquido)}</div></div>
              </div>
            </div>
          ))}
          {linhas.length > 0 && (
            <div className="bg-surface-container-low rounded-lg p-3 text-[12px] flex justify-between">
              <span className="font-bold text-on-surface">Total período</span>
              <span className="font-black text-primary">{moeda(totalPeriodo)}</span>
            </div>
          )}
          {medicaoAtiva.lancamento_id ? (
            <div className="text-[12px] text-primary-container font-semibold text-center">
              ✅ Programado para {dataBR(medicaoAtiva.data_pagamento_programada)}{' '}
              <button className="text-primary underline font-semibold" onClick={() => { setDataProgramar(medicaoAtiva.data_pagamento_programada || new Date().toISOString().slice(0, 10)); setMostrarProgramar(true) }}>Alterar data</button>
            </div>
          ) : (
            <button className={btnSecondaryCls}
              onClick={() => { setDataProgramar(new Date().toISOString().slice(0, 10)); setMostrarProgramar(true) }}>📅 Programar Pagamento</button>
          )}
          <button className={btnPrimaryCls} onClick={() => salvarPreenchimentoMedicao(itensFiltrados)}>Salvar Medição</button>
        </div>
        {mostrarProgramar && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setMostrarProgramar(false)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-6 w-full max-w-[400px]">
              <div className="text-base font-bold text-on-surface mb-1.5">📅 Programar Pagamento</div>
              <div className="text-body-sm text-on-surface-variant mb-4">
                {medicaoAtiva.tipo === 'fornecedor' ? 'Saída' : 'Entrada'} de {moeda(totalLiquido)} referente à medição {medicaoAtiva.numero}
              </div>
              <div className="mb-5">
                <label className={labelCls}>Data programada *</label>
                <input className={inputCls} type="date" value={dataProgramar} onChange={e => setDataProgramar(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button className={btnSecondaryCls + ' flex-1'} onClick={() => setMostrarProgramar(false)}>Cancelar</button>
                <button className={btnPrimaryCls + ' flex-1'} onClick={() => confirmarProgramarPagamento(totalLiquido)}>Confirmar</button>
              </div>
            </div>
          </div>
        )}
      </MobileShell>
    )
  }

  // ── Tela: Nova Visita ────────────────────────────────────────────
  if (tela === 'novaVisita' && detalhe) {
    return (
      <MobileShell title={rvEditando ? '✏️ Editar Relatório' : 'Relatório de Visita'}>
        <div className="p-4 flex flex-col gap-3.5 pb-8">
          <div>
            <label className={labelCls}>Data</label>
            <input className={inputCls} type="date" value={fRv.data} onChange={e => setFRv({ ...fRv, data: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Clima</label>
            <div className="grid grid-cols-2 gap-2">
              {CLIMA_OPCOES.map(c => (
                <button key={c.v} type="button"
                  className={`px-3 py-2.5 rounded-lg border text-sm font-semibold ${fRv.clima === c.v ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-container-low text-on-surface-variant border-outline-variant'}`}
                  onClick={() => setFRv({ ...fRv, clima: c.v })}>{c.l}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Descrição / Observações</label>
            <textarea className={inputCls + ' min-h-[80px] resize-y'} placeholder="O que foi verificado ou feito na visita" value={fRv.descricao} onChange={e => setFRv({ ...fRv, descricao: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Pendências</label>
            <textarea className={inputCls + ' min-h-[60px] resize-y'} placeholder="Pendências / próximos passos" value={fRv.pendencias} onChange={e => setFRv({ ...fRv, pendencias: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Equipe presente</label>
            <div className="flex gap-2">
              <input className={inputCls} placeholder="Nome" value={fRv.nomeEquipeAtual} onChange={e => setFRv({ ...fRv, nomeEquipeAtual: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarNomeEquipe() } }} />
              <button type="button" className="bg-primary/10 text-primary rounded-lg px-3 text-sm font-bold shrink-0" onClick={adicionarNomeEquipe}>+</button>
            </div>
            {fRv.equipe_presente.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {fRv.equipe_presente.map((n, i) => (
                  <span key={i} className="bg-surface-container-low border border-outline-variant rounded-full px-2.5 py-1 text-xs text-on-surface flex items-center gap-1">
                    {n} <button onClick={() => removerNomeEquipe(i)} className="text-on-surface-variant">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className={labelCls}>Fotos</label>
            <input type="file" accept="image/*" capture="environment" multiple
              onChange={e => setFotosRv([...fotosRv, ...Array.from(e.target.files || []).map(file => ({ file, descricao: '' }))])}
              className={fileCls} />
            {fotosRv.length > 0 && (
              <div className="flex flex-col gap-2 mt-2.5">
                {fotosRv.map((f, i) => (
                  <div key={i} className="flex items-center gap-2.5 bg-surface-container-low border border-outline-variant rounded-lg p-2.5">
                    <div className="w-11 h-11 rounded-lg bg-surface-container border border-outline-variant overflow-hidden shrink-0 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url || (f.file ? URL.createObjectURL(f.file) : '')} alt="" className="w-full h-full object-cover" />
                    </div>
                    <input className={inputCls} placeholder="Descrição da foto" value={f.descricao}
                      onChange={e => setFotosRv(fotosRv.map((x, idx) => idx === i ? { ...x, descricao: e.target.value } : x))} />
                    <button className="text-error text-xs font-semibold shrink-0" onClick={() => setFotosRv(fotosRv.filter((_, idx) => idx !== i))}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 mt-2">
            <button className={btnPrimaryCls} onClick={salvarRelatorioVisita} disabled={enviandoRv}>{enviandoRv ? 'Enviando...' : 'Salvar Relatório'}</button>
            <button className={btnSecondaryCls} onClick={() => { setTela('detalhe'); setFRv(FRV_VAZIO); setFotosRv([]); setRvEditando(null) }}>Cancelar</button>
          </div>
        </div>
      </MobileShell>
    )
  }

  // ── Tela: Detalhe da Obra ─────────────────────────────────────
  if (detalhe && tela === 'detalhe') {
    const custos = custosObra(detalhe.id)
    const receitas = receitasObra(detalhe.id)
    const contrato = parseFloat(detalhe.valor_contrato || 0)
    const prevTotal = totalPrevisto(detalhe.id)
    const margem = receitas - custos
    const svs = ordenarServicosObra(servicosObra(detalhe.id))
    const orcamentoObra = orcamentos.find(o => o.obra_id === detalhe.id)
    const medicoesObra = medicoes.filter(m => m.obra_id === detalhe.id)
    const visitasObra = relatorios.filter(r => r.obra_id === detalhe.id)
    const funcionariosObra = funcionarios.filter(f => f.obra_id === detalhe.id)

    return (
      <MobileShell title={detalhe.codigo}>
        <div className="p-4 flex flex-col gap-4 pb-8">
          <button className="text-primary text-sm font-semibold text-left" onClick={() => { setDetalhe(null); setTela(null) }}>← Voltar à lista</button>
          <div>
            <div className="text-headline-sm font-headline text-on-surface">{detalhe.nome}</div>
            <div className="text-body-sm text-on-surface-variant">{detalhe.cliente}{detalhe.endereco ? ' · ' + detalhe.endereco : ''}</div>
            <span className="text-[11px] font-semibold text-on-surface-variant uppercase">{STATUS_NOME[detalhe.status] || detalhe.status}</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {([
              ['Contrato', moeda(contrato), 'text-primary'],
              ['Recebido', moeda(receitas), 'text-primary-container'],
              ['Custos Reais', moeda(custos), 'text-error'],
              ['Margem Atual', moeda(margem), margem >= 0 ? 'text-primary-container' : 'text-error'],
            ] as [string, string, string][]).map(([l, v, c]) => (
              <div key={l} className="bg-surface-container-high border border-outline-variant rounded-lg p-3">
                <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1.5">{l}</div>
                <div className={`text-xs font-bold ${c}`}>{v}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {[['resumo', '📋 Resumo'], ['visitas', '📷 Visitas'], ['medicoes', '📐 Medições'], ['servicos', '🔧 Serviços'], ['cronograma', '📅 Cronograma'], ['funcionarios', '🪪 Funcionários'], ['nf', '🧾 NF']].map(([id, nome]) => (
              <button key={id} onClick={() => setAba(id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${aba === id ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-container text-on-surface-variant border-outline-variant'}`}>
                {nome}
              </button>
            ))}
          </div>

          {aba === 'resumo' && (
            <div className="bg-surface-container border border-outline-variant rounded-xl p-4 flex flex-col gap-3">
              {([
                ['Tipo', detalhe.tipo || '—'],
                ['Responsável', detalhe.responsavel || '—'],
                ['Data Início', detalhe.data_inicio || '—'],
                ['Previsão Término', detalhe.data_previsao || '—'],
                ['Serviços Cadastrados', svs.length + ' serviço(s)'],
                ['Previsto Serviços', moeda(prevTotal)],
              ] as [string, string][]).map(([l, v]) => (
                <div key={l} className="flex justify-between text-sm border-b border-outline-variant pb-2 last:border-0 last:pb-0">
                  <span className="text-on-surface-variant">{l}</span>
                  <span className="font-semibold text-on-surface text-right">{v}</span>
                </div>
              ))}
              <button className={btnSecondaryCls} onClick={() => { setObservacoesPdf(''); setMostrarRelatorioPdf(true) }}>🖨️ Gerar Relatório PDF</button>
            </div>
          )}

          {mostrarRelatorioPdf && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setMostrarRelatorioPdf(false)}>
              <div className="bg-surface-container border border-outline-variant rounded-2xl p-6 w-full max-w-[440px]">
                <div className="text-base font-bold text-on-surface mb-1.5">🖨️ Gerar Relatório de Status</div>
                <div className="text-body-sm text-on-surface-variant mb-4">Inclui resumo financeiro, curva S e distribuição de custos com os dados atuais da obra.</div>
                <div className="mb-5">
                  <label className={labelCls}>Observações Técnicas e Riscos (opcional)</label>
                  <textarea className={inputCls + ' min-h-[100px] resize-y'} placeholder="Ex: Atraso na entrega de material, risco identificado, ponto de atenção..." value={observacoesPdf} onChange={e => setObservacoesPdf(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <button className={btnSecondaryCls + ' flex-1'} onClick={() => setMostrarRelatorioPdf(false)}>Cancelar</button>
                  <button className={btnPrimaryCls + ' flex-1'} onClick={() => { setMostrarRelatorioPdf(false); gerarPDFObra(detalhe, observacoesPdf) }}>Gerar PDF</button>
                </div>
              </div>
            </div>
          )}

          {aba === 'servicos' && (
            <div className="flex flex-col gap-3">
              {svs.length === 0 ? (
                <div className="text-center py-6 text-on-surface-variant text-body-sm">Nenhum serviço cadastrado</div>
              ) : svs.map((sv, idx) => {
                const vp = parseFloat(sv.valor_previsto || 0)
                const matPrev = parseFloat(sv.valor_material_previsto || 0)
                const maoPrev = parseFloat(sv.valor_mao_obra_previsto || 0)
                const vrMao = custoMaoObraServicoAuto(sv)
                const vrMat = custoMaterialServicoAuto(sv)
                const custoPrevTotal = matPrev + maoPrev
                const custoRealTotal = vrMao + vrMat
                const ppRaw = custoPrevTotal > 0 ? (custoRealTotal / custoPrevTotal) * 100 : 0
                const categoriaAtual = sv.categoria || 'Outros'
                const categoriaAnterior = idx > 0 ? (svs[idx - 1].categoria || 'Outros') : null
                return (
                  <Fragment key={sv.id}>
                  {categoriaAtual !== categoriaAnterior && (
                    <div className="text-[10px] font-bold text-primary uppercase tracking-wide mt-2 first:mt-0">{categoriaAtual}</div>
                  )}
                  <div className="bg-surface-container border border-outline-variant rounded-xl p-4">
                    <div className="flex justify-between items-start gap-2 mb-1.5">
                      <span className="font-semibold text-sm text-on-surface">{sv.nome}</span>
                      <span className="text-[10px] font-semibold text-on-surface-variant uppercase shrink-0">{SERV_STATUS[sv.status] || sv.status}</span>
                    </div>
                    {sv.fornecedor && <div className="text-[11px] text-primary mb-1.5">{sv.fornecedor}</div>}
                    {sv.observacao && <div className="text-[11px] text-on-surface-variant mb-1.5">{sv.observacao}</div>}
                    <div className="text-[11px] text-on-surface-variant mb-1.5">{sv.unidade || '—'} {sv.quantidade != null ? `· ${Number(sv.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}` : ''}</div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-on-surface-variant text-center mb-1.5">
                      <div><div>Valor Contratado</div><div className="font-semibold text-tertiary">{moeda(vp)}</div></div>
                      <div><div>Custo Previsto (M.O+Mat)</div><div className="font-semibold text-on-surface">{moeda(custoPrevTotal)}</div></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-on-surface-variant text-center">
                      <div><div>Material Realizado</div><div className={`font-semibold ${vrMat > matPrev && matPrev > 0 ? 'text-error' : 'text-primary-container'}`}>{moeda(vrMat)}</div><div className="text-[10px]">de {moeda(matPrev)}</div></div>
                      <div><div>M.O. Realizada</div><div className={`font-semibold ${vrMao > maoPrev && maoPrev > 0 ? 'text-error' : 'text-primary-container'}`}>{moeda(vrMao)}</div><div className="text-[10px]">de {moeda(maoPrev)}</div></div>
                    </div>
                    <div className="mt-2">
                      <div className="h-1.5 bg-surface-variant rounded overflow-hidden mb-1">
                        <div className={`h-full rounded ${corProgresso(ppRaw)}`} style={{ width: Math.min(ppRaw, 100) + '%' }} />
                      </div>
                      <div className="text-[10px] text-on-surface-variant text-right">{ppRaw.toFixed(0)}%</div>
                    </div>
                  </div>
                  </Fragment>
                )
              })}
            </div>
          )}

          {aba === 'funcionarios' && (
            <div className="flex flex-col gap-2">
              {funcionariosObra.length === 0 ? (
                <div className="text-center py-6 text-on-surface-variant text-body-sm">Nenhum funcionário cadastrado</div>
              ) : funcionariosObra.map(f => {
                const arquivosDoFunc = funcionarioArquivos.filter(a => a.funcionario_id === f.id)
                const expandido = funcExpandido === f.id
                return (
                  <div key={f.id} className="bg-surface-container border border-outline-variant rounded-xl p-4">
                    <div className="cursor-pointer" onClick={() => setFuncExpandido(expandido ? null : f.id)}>
                      <div className="font-semibold text-sm text-on-surface">{f.nome}</div>
                      <div className="text-[11px] text-on-surface-variant mt-0.5">{[f.empresa, f.telefone].filter(Boolean).join(' · ') || '—'}</div>
                      <div className="text-[11px] text-on-surface-variant">{arquivosDoFunc.length} arquivo(s) — {expandido ? 'ocultar' : 'ver detalhes'}</div>
                    </div>
                    {expandido && (
                      <div className="mt-3 pt-3 border-t border-outline-variant">
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-on-surface-variant mb-2">
                          <div><span className="uppercase">CPF</span><div className="text-on-surface font-semibold">{f.cpf || '—'}</div></div>
                          <div><span className="uppercase">RG</span><div className="text-on-surface font-semibold">{f.rg || '—'}</div></div>
                        </div>
                        {arquivosDoFunc.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            {arquivosDoFunc.map(arq => (
                              <a key={arq.id} href={arq.url} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-surface-container-low rounded-lg border border-outline-variant text-xs text-on-surface truncate">📄 {arq.nome}</a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {aba === 'visitas' && (() => {
            const visitasFiltradas = visitasObra.filter(v => {
              if (!buscaRv) return true
              const alvo = ((v.descricao || '') + ' ' + (v.pendencias || '') + ' ' + dataBR(v.data)).toLowerCase()
              return alvo.includes(buscaRv.toLowerCase())
            })
            return (
              <div className="flex flex-col gap-3">
                <button className={btnPrimaryCls} onClick={() => { setFRv(FRV_VAZIO); setFotosRv([]); setRvEditando(null); setTela('novaVisita') }}>+ Relatório de Visita</button>
                <input className={inputCls} placeholder="Pesquisar por data, descrição ou pendência..." value={buscaRv} onChange={e => setBuscaRv(e.target.value)} />
                {visitasFiltradas.length === 0 ? (
                  <div className="text-center py-6 text-on-surface-variant text-body-sm">Nenhum relatório de visita encontrado</div>
                ) : visitasFiltradas.map(v => {
                  const climaLabel = CLIMA_OPCOES.find(c => c.v === v.clima)?.l || v.clima
                  return (
                    <div key={v.id} className="bg-surface-container border border-outline-variant rounded-xl p-4">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="font-semibold text-sm text-on-surface">{new Date(v.data + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                        {climaLabel && <span className="text-[11px] text-on-surface-variant">{climaLabel}</span>}
                      </div>
                      {v.descricao && <div className="text-body-sm text-on-surface-variant mb-1.5">{v.descricao}</div>}
                      {v.pendencias && <div className="text-[11px] text-tertiary mb-1.5">⚠️ {v.pendencias}</div>}
                      <div className="flex justify-between items-center text-[11px] text-on-surface-variant">
                        <span>{v.equipe_presente?.length || 0} pessoa(s) · {v.fotos?.length || 0} foto(s)</span>
                        <div className="flex gap-3">
                          <button className="text-primary font-semibold" onClick={() => abrirEditarVisita(v)}>Editar</button>
                          <button className="text-error font-semibold" onClick={() => excluirVisita(v)}>Excluir</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {aba === 'medicoes' && (
            svs.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant text-body-sm">Nenhum serviço cadastrado nesta obra ainda</div>
            ) : (
              <div className="flex flex-col gap-3">
                <button className={btnPrimaryCls} onClick={() => { setFMedicao(FMED_VAZIO); setTela('novaMedicao') }}>+ Nova Medição</button>
                {(() => {
                  const recebidoCliente = medicoesObra.filter(m => m.tipo === 'cliente').reduce((a, m) => a + totalsMedicao(m).totalPeriodo, 0)
                  const pagoFornecedores = medicoesObra.filter(m => m.tipo === 'fornecedor').reduce((a, m) => a + totalsMedicao(m).totalLiquido, 0)
                  const lucroPrevisto = contrato - prevTotal
                  const faltaReceber = contrato - recebidoCliente
                  const faltaPagar = prevTotal - pagoFornecedores
                  return (
                    <div className="flex flex-col gap-2.5">
                      <div className="bg-surface-container border border-outline-variant rounded-xl p-3.5">
                        <div className="text-[11px] font-bold text-primary uppercase mb-2">💰 Cliente</div>
                        <div className="flex flex-col gap-1.5 text-[13px]">
                          <div className="flex justify-between"><span className="text-on-surface-variant">Contrato</span><span className="font-semibold text-on-surface">{moeda(contrato)}</span></div>
                          <div className="flex justify-between"><span className="text-on-surface-variant">Recebido</span><span className="font-semibold text-primary-container">{moeda(recebidoCliente)}</span></div>
                          <div className="flex justify-between border-t border-outline-variant pt-1.5"><span className="text-on-surface-variant">Falta Receber</span><span className="font-bold text-on-surface">{moeda(faltaReceber)}</span></div>
                        </div>
                      </div>
                      <div className="bg-surface-container border border-outline-variant rounded-xl p-3.5">
                        <div className="text-[11px] font-bold text-tertiary uppercase mb-2">🧱 Custo × Lucro</div>
                        <div className="flex flex-col gap-1.5 text-[13px]">
                          <div className="flex justify-between"><span className="text-on-surface-variant">Custo Previsto</span><span className="font-semibold text-on-surface">{moeda(prevTotal)}</span></div>
                          <div className="flex justify-between"><span className="text-on-surface-variant">Lucro Previsto</span><span className={`font-semibold ${lucroPrevisto >= 0 ? 'text-primary-container' : 'text-error'}`}>{moeda(lucroPrevisto)}</span></div>
                          <div className="flex justify-between"><span className="text-on-surface-variant">Pago a Fornecedores</span><span className="font-semibold text-error">{moeda(pagoFornecedores)}</span></div>
                          <div className="flex justify-between border-t border-outline-variant pt-1.5"><span className="text-on-surface-variant">Falta Pagar</span><span className="font-bold text-on-surface">{moeda(faltaPagar)}</span></div>
                        </div>
                      </div>
                    </div>
                  )
                })()}
                <input className={inputCls} placeholder="Pesquisar por número ou fornecedor..." value={buscaMed} onChange={e => setBuscaMed(e.target.value)} />
                {medicoesObra.filter(m => !buscaMed || ((m.numero || '') + ' ' + (m.fornecedor || '')).toLowerCase().includes(buscaMed.toLowerCase())).length === 0 ? (
                  <div className="text-center py-6 text-on-surface-variant text-body-sm">Nenhuma medição encontrada</div>
                ) : medicoesObra.filter(m => !buscaMed || ((m.numero || '') + ' ' + (m.fornecedor || '')).toLowerCase().includes(buscaMed.toLowerCase())).map(med => {
                  const itensFiltrados = svs.filter(s => med.tipo !== 'fornecedor' || !med.fornecedor || s.fornecedor === med.fornecedor)
                  return (
                    <button key={med.id} className="text-left bg-surface-container border border-outline-variant rounded-xl p-4" onClick={() => abrirPreenchimentoMedicao(med, itensFiltrados)}>
                      <div className="font-semibold text-sm text-on-surface">{med.numero} · {med.tipo === 'fornecedor' ? `Fornecedor: ${med.fornecedor || '—'}` : 'Cliente'}</div>
                      <div className="text-[11px] text-on-surface-variant mt-1">{dataBR(med.data)} · {itensFiltrados.length} item(ns)</div>
                    </button>
                  )
                })}
              </div>
            )
          )}

          {aba === 'cronograma' && (() => {
            const svsOrdenados = ordenarServicosObra(svs)
            const etapasObra = etapas.filter(e => e.obra_id === detalhe.id)
            const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
            if (svs.length === 0) return <div className="text-center py-8 text-on-surface-variant text-body-sm">Nenhum serviço cadastrado nesta obra</div>
            if (!detalhe.data_inicio || !detalhe.data_previsao) return <div className="text-center py-8 text-on-surface-variant text-body-sm">Informe as datas de início e fim da obra no desktop para o sistema distribuir os serviços automaticamente.</div>
            if (etapasObra.length === 0) return <div className="text-center py-8 text-on-surface-variant text-body-sm">Gerando cronograma...</div>
            const inicioObra = new Date(detalhe.data_inicio + 'T00:00:00')
            const fimObra = new Date(detalhe.data_previsao + 'T00:00:00')
            const totalMsObra = Math.max(fimObra.getTime() - inicioObra.getTime(), 86400000)
            const hojeGantt = Math.max(0, Math.min(100, ((new Date().getTime() - inicioObra.getTime()) / totalMsObra) * 100))
            const hojeDentro = new Date() >= inicioObra && new Date() <= fimObra
            return (
              <div className="flex flex-col gap-3">
                <button className={btnSecondaryCls} onClick={() => gerarPDFCronograma(detalhe, svsOrdenados.map(servico => ({ servico, etapa: etapasObra.find(e => e.servico_id === servico.id) })).filter(l => l.etapa))}>🖨️ Gerar Cronograma PDF</button>
                <div className="bg-surface-container border border-outline-variant rounded-xl p-3.5">
                  <div className="text-[11px] font-bold text-on-surface-variant uppercase mb-2">📊 Gantt</div>
                  <div className="flex justify-between text-[10px] text-on-surface-variant mb-2">
                    <span>{dataBR(detalhe.data_inicio)}</span>
                    <span>{dataBR(detalhe.data_previsao)}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {svsOrdenados.map(servico => {
                      const et = etapasObra.find(e => e.servico_id === servico.id)
                      if (!et) return null
                      const { xPct, larguraPct } = calcularBarraGantt(inicioObra, fimObra, et.data_inicio_prevista, et.data_fim_prevista)
                      const statusVisual = (et.status !== 'concluida' && et.data_fim_prevista && new Date(et.data_fim_prevista) < new Date()) ? 'atrasada' : et.status
                      return (
                        <div key={servico.id}>
                          <div className="text-[10px] text-on-surface-variant truncate mb-0.5">{servico.nome}</div>
                          <div className="relative h-4 bg-surface-container-low rounded overflow-hidden">
                            <div className={`absolute top-0 h-full rounded ${corBarraEtapa(statusVisual)}`} style={{ left: xPct + '%', width: larguraPct + '%' }} />
                            {hojeDentro && <div className="absolute top-0 h-full w-px bg-primary" style={{ left: hojeGantt + '%' }} />}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                {svsOrdenados.map((servico, idx) => {
                  const et = etapasObra.find(e => e.servico_id === servico.id)
                  if (!et) return null
                  const atrasadaEtapa = !!(et.data_fim_prevista && new Date(et.data_fim_prevista) < hoje && et.status !== 'concluida')
                  const categoriaAtual = servico.categoria || 'Outros'
                  const categoriaAnterior = idx > 0 ? (svsOrdenados[idx - 1].categoria || 'Outros') : null
                  return (
                    <Fragment key={et.id}>
                    {categoriaAtual !== categoriaAnterior && (
                      <div className="text-[10px] font-bold text-primary uppercase tracking-wide mt-2 first:mt-0">{categoriaAtual}</div>
                    )}
                    <div className="bg-surface-container border border-outline-variant rounded-xl p-4">
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div>
                          <div className="font-semibold text-sm text-on-surface">{servico.nome}</div>
                          {servico.fornecedor && <div className="text-[11px] text-on-surface-variant">{servico.fornecedor}</div>}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button disabled={idx === 0 || (svsOrdenados[idx - 1].categoria || null) !== (servico.categoria || null)} className="text-on-surface-variant disabled:opacity-20" onClick={() => reordenarServico(servico, -1)}>▲</button>
                          <button disabled={idx === svsOrdenados.length - 1 || (svsOrdenados[idx + 1].categoria || null) !== (servico.categoria || null)} className="text-on-surface-variant disabled:opacity-20" onClick={() => reordenarServico(servico, 1)}>▼</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5 mb-2">
                        <div>
                          <label className={labelCls}>Início Previsto</label>
                          <input type="date" className={inputCls} value={et.data_inicio_prevista || ''}
                            onChange={e => {
                              const v = e.target.value
                              setEtapas(etapas.map(x => x.id === et.id ? { ...x, data_inicio_prevista: v } : x))
                              editar('cronograma_etapas', et.id, { data_inicio_prevista: v || null })
                            }} />
                        </div>
                        <div>
                          <label className={labelCls}>Fim Previsto</label>
                          <input type="date" className={inputCls} value={et.data_fim_prevista || ''}
                            onChange={e => {
                              const v = e.target.value
                              setEtapas(etapas.map(x => x.id === et.id ? { ...x, data_fim_prevista: v } : x))
                              editar('cronograma_etapas', et.id, { data_fim_prevista: v || null })
                            }} />
                        </div>
                      </div>
                      <select className={inputCls} value={et.status}
                        onChange={e => {
                          const v = e.target.value
                          setEtapas(etapas.map(x => x.id === et.id ? { ...x, status: v } : x))
                          editar('cronograma_etapas', et.id, { status: v })
                        }}>
                        {Object.entries(ETAPA_STATUS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                      </select>
                      {atrasadaEtapa && <div className="text-[11px] text-error mt-1.5">⚠️ prazo vencido</div>}
                    </div>
                    </Fragment>
                  )
                })}
              </div>
            )
          })()}

          {aba === 'nf' && (
            <div className="bg-surface-container border border-outline-variant rounded-xl p-5 text-center">
              <span className="material-symbols-outlined text-primary text-[36px]">receipt_long</span>
              <div className="font-bold text-on-surface mt-2">Lançar NF desta obra</div>
              <div className="text-body-sm text-on-surface-variant mt-1 mb-4">Abre o assistente do Financeiro já com esta obra selecionada</div>
              <button className={btnPrimaryCls} onClick={() => { localStorage.setItem('viga_financeiro_obra_id', detalhe.id); window.location.href = '/m/financeiro' }}>+ Lançar NF</button>
            </div>
          )}
        </div>
      </MobileShell>
    )
  }

  // ── Tela: Lista ───────────────────────────────────────────────────
  return (
    <MobileShell title="Obras">
      <div className="p-4 flex flex-col gap-3">
        <input className={inputCls} placeholder="Pesquisar por nome, cliente ou código..." value={busca} onChange={e => setBusca(e.target.value)} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {['todos', ...Object.keys(STATUS_NOME)].map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${filtro === f ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-container text-on-surface-variant border-outline-variant'}`}>
              {f === 'todos' ? 'Todos' : STATUS_NOME[f]}
            </button>
          ))}
        </div>
        {filtrados.length === 0 ? (
          <div className="text-center py-10 text-on-surface-variant text-body-sm">Nenhuma obra encontrada</div>
        ) : filtrados.map(o => (
          <button key={o.id} onClick={() => { setDetalhe(o); setAba('resumo'); setTela('detalhe') }}
            className="text-left bg-surface-container border border-outline-variant rounded-xl p-4">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="font-bold text-on-surface text-sm truncate">{o.nome}</div>
                <div className="text-[11px] text-on-surface-variant truncate">{o.codigo} · {o.cliente}</div>
              </div>
              <span className="text-[10px] font-semibold text-on-surface-variant uppercase shrink-0">{STATUS_NOME[o.status] || o.status}</span>
            </div>
          </button>
        ))}
      </div>
    </MobileShell>
  )
}
