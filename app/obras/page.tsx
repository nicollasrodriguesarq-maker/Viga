'use client'
import { useState, useEffect, Fragment } from 'react'
import Link from 'next/link'
import Layout from '../components/Layout'
import { obterMinhasPermissoes, temAcessoModulo } from '../lib/permissoes'
import { obterTokenValido } from '../lib/authFetch'
import { arred2 } from '../lib/datas'
import SeletorClienteCrm from '../components/SeletorClienteCrm'
import ResponsavelDoDocumento from '../components/ResponsavelDoDocumento'
import { CLIENTE_CRM_VAZIO, registrarClienteNoCrmInterativo, validarClienteCrm, vincularLeadAoRegistro, type ValorClienteCrm } from '../lib/clienteCrm'
import { calcularAbatimento, modoAbatimentoDe, type ModoAbatimento } from '../lib/medicoesCalc'
import { MODOS_CRONOGRAMA, TIPOS_ALTERACAO_CRONOGRAMA, modoEfetivoCronograma, montarLinhasCronograma, ordenarLinhasCronograma, statusVisualEtapa, ultimoMotivoEtapa, calcularDatasOrcamento, htmlSecaoCronogramaPDF, hojeISO, dataParaISO, type LinhaCronograma, type ModoCronograma } from '../lib/cronograma'
import { CHAVE, useAbrirAlvo } from '../lib/abrirAlvo'

const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const HDR = { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': 'Bearer ' + ANON }

const moeda = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (v: string) => v ? new Date(v + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
const pct = (a: number, b: number) => b > 0 ? Math.min((a / b) * 100, 100) : 0

// Posição/largura (%) de uma barra de Gantt dentro do período total da obra — usado na
// visualização em tela e na exportação em PDF.
function calcularBarraGantt(inicio: Date, fim: Date, dataIniStr?: string | null, dataFimStr?: string | null) {
  const totalMs = Math.max(fim.getTime() - inicio.getTime(), 86400000)
  const ini = dataIniStr ? new Date(dataIniStr + 'T00:00:00') : inicio
  const fimEtapa = dataFimStr ? new Date(dataFimStr + 'T00:00:00') : ini
  const xPct = Math.max(0, Math.min(100, ((ini.getTime() - inicio.getTime()) / totalMs) * 100))
  const fimPct = Math.max(0, Math.min(100, ((fimEtapa.getTime() - inicio.getTime()) / totalMs) * 100))
  const larguraPct = Math.max(fimPct - xPct, 0.8)
  return { xPct, larguraPct }
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
// Monta o HTML do gráfico de Gantt (usado no PDF do cronograma e no relatório da obra).
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

// Sobrescrita de impressão: os relatórios usam tema escuro na tela, mas impressoras/PDF
// costumam ignorar o fundo escuro e imprimir em papel branco — sem isso, o texto claro
// (pensado pra contrastar com #0f141b/#1b2027) fica ilegível em cima do branco. Força fundo
// branco e texto escuro só no momento de imprimir/exportar, preservando o visual normal na tela.
const PRINT_SAFE_CSS = `
      @media print {
        html, body { background:#ffffff !important; }
        body { color:#12161c !important; }
        * { color:#12161c !important; }
        .card { background:#ffffff !important; }
        [style*="background:#0f141b"], [style*="background:#1b2027"], [style*="background:#171c23"], [style*="background:#252a32"], [style*="background:#3d4948"], [style*="linear-gradient"] { background:#ffffff !important; }
        [style*="border:1px solid #3d4948"], [style*="border-bottom:1px solid #3d4948"], [style*="border-top:1px solid #3d4948"], [style*="border-color:#3d4948"] { border-color:#d7dbda !important; }
      }`

async function buscar(tabela: string, query = '') {
  try {
    const r = await fetch(BASE + '/' + tabela + query, { headers: HDR })
    const d = await r.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

async function criar(tabela: string, dados: object) {
  try {
    const r = await fetch(BASE + '/' + tabela, {
      method: 'POST',
      headers: { ...HDR, 'Prefer': 'return=representation' },
      body: JSON.stringify(dados)
    })
    const d = await r.json()
    return Array.isArray(d) ? d[0] : d
  } catch { return null }
}

async function editar(tabela: string, id: string, dados: object): Promise<boolean> {
  try {
    const r = await fetch(BASE + '/' + tabela + '?id=eq.' + id, {
      method: 'PATCH', headers: HDR, body: JSON.stringify(dados)
    })
    return r.ok
  } catch { return false }
}

async function remover(tabela: string, id: string) {
  try {
    await fetch(BASE + '/' + tabela + '?id=eq.' + id, { method: 'DELETE', headers: HDR })
  } catch {}
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

const CLIMA_OPCOES = [{ v: 'ensolarado', l: '☀️ Ensolarado' }, { v: 'nublado', l: '☁️ Nublado' }, { v: 'chuva', l: '🌧️ Chuva' }, { v: 'sem_expediente', l: '🚫 Sem expediente' }]
const FRV_VAZIO = { data: hojeISO(), clima: '', descricao: '', pendencias: '', equipe_presente: [] as string[], nomeEquipeAtual: '' }

async function uploadArquivoFuncionario(file: File): Promise<string | null> {
  try {
    const nome = `arq_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const r = await fetch(`${BASE.replace('/rest/v1', '')}/storage/v1/object/obra-funcionarios-arquivos/${nome}`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    if (r.ok) return `${BASE.replace('/rest/v1', '')}/storage/v1/object/public/obra-funcionarios-arquivos/${nome}`
    return null
  } catch { return null }
}
const FFUNC_VAZIO = { nome: '', cpf: '', rg: '', empresa: '', telefone: '' }

const STATUS_NOME: Record<string, string> = {
  captacao: 'Em Captação',
  em_execucao: 'Em Execução',
  pausada: 'Pausada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}

// Paleta de badges mapeada para os tokens do novo design system (primary/secondary/tertiary/error)
const STATUS_BADGE: Record<string, string> = {
  captacao: 'bg-secondary/10 text-secondary border-secondary/20',
  em_execucao: 'bg-primary/10 text-primary border-primary/20',
  pausada: 'bg-tertiary/10 text-tertiary border-tertiary/20',
  concluida: 'bg-primary-container/10 text-primary-container border-primary-container/20',
  cancelada: 'bg-error/10 text-error border-error/20',
}

const SERV_STATUS: Record<string, string> = {
  pendente: 'Pendente',
  em_execucao: 'Em Execução',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}
const SERV_BADGE: Record<string, string> = {
  pendente: 'bg-on-surface-variant/10 text-on-surface-variant border-on-surface-variant/20',
  em_execucao: 'bg-tertiary/10 text-tertiary border-tertiary/20',
  concluido: 'bg-primary-container/10 text-primary-container border-primary-container/20',
  cancelado: 'bg-error/10 text-error border-error/20',
}

const UNIDADES = ['m²', 'm³', 'ml', 'un', 'vb', 'cj', 'kg', 'hr']
// Ordem = sequência real de execução de obra (usada para ordenar/agrupar serviços no
// Cronograma e na aba Serviços — mesma lista/ordem já usada no Orçamento).
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
// Cor compartilhada de barra de progresso (Serviços/Medição/Cronograma): verde até 80%,
// laranja de 80 a 100%, vermelho acima de 100% (estourou o previsto/atrasado).
function corProgresso(pctValor: number) {
  return pctValor > 100 ? 'bg-error' : pctValor > 80 ? 'bg-tertiary' : 'bg-primary'
}

const TIPOS_OBRA = ['Obra Nova', 'Reforma', 'Retrofit', 'Projeto Arquitetura', 'Projeto Engenharia', 'Consultoria', 'Outro']
// Classificação macro pedida pelo usuário: execução física da obra x execução só do projeto
// (arquitetônico/engenharia) — separado do campo "Tipo" acima, que já existia.
const TIPOS_EXECUCAO = [{ v: 'obra', l: '🏗️ Execução de Obra' }, { v: 'projeto', l: '📐 Execução de Projeto' }]
const EXECUCAO_NOME: Record<string, string> = { obra: '🏗️ Obra', projeto: '📐 Projeto' }
const EXECUCAO_BADGE: Record<string, string> = {
  obra: 'bg-primary/10 text-primary border-primary/20',
  projeto: 'bg-secondary/10 text-secondary border-secondary/20',
}

const ETAPA_STATUS: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em Andamento',
  concluida: 'Concluída',
  atrasada: 'Atrasada',
}

// Agrupamento das categorias de lançamento (app/financeiro/page.tsx) em 4 baldes
// pra "Distribuição de Custos" do relatório — aproximação, não uma taxonomia oficial.
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

// Usa o maior número já usado (não a contagem) — se alguma obra do ano foi excluída,
// contar de novo geraria um código repetido e o insert seria rejeitado (409).
function gerarCodigo(obras: any[]) {
  const ano = new Date().getFullYear()
  const prefixo = 'OBR-' + ano + '-'
  const maior = obras.reduce((m, o) => {
    if (!o.codigo?.startsWith(prefixo)) return m
    const n = parseInt(o.codigo.slice(prefixo.length), 10)
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return prefixo + String(maior + 1).padStart(3, '0')
}

function corPct(p: number) {
  if (p > 90) return { text: 'text-error', bar: 'bg-error' }
  if (p > 70) return { text: 'text-tertiary', bar: 'bg-tertiary' }
  return { text: 'text-primary', bar: 'bg-primary' }
}
function corSinal(v: number) {
  return v >= 0 ? { text: 'text-primary-container', bar: 'bg-primary-container' } : { text: 'text-error', bar: 'bg-error' }
}

// classes reutilizáveis do formulário
const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const labelCls = 'text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5'
const btnPrimaryCls = 'bg-primary text-on-primary rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer'
const btnSecondaryCls = 'bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg px-4 py-2.5 text-sm hover:bg-surface-variant transition-all cursor-pointer'
const btnEditSmCls = 'bg-primary/10 border border-primary/30 text-primary rounded-md px-2.5 py-1 text-xs hover:bg-primary/20 transition-all cursor-pointer'
const btnDangerSmCls = 'bg-error/10 border border-error/30 text-error rounded-md px-2.5 py-1 text-xs hover:bg-error/20 transition-all cursor-pointer'
const tabActiveCls = 'px-4 py-2 rounded-lg border border-primary bg-primary/10 text-primary text-sm font-semibold cursor-pointer transition-all whitespace-nowrap'
const tabInactiveCls = 'px-4 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface-variant text-sm font-semibold cursor-pointer hover:bg-surface-variant/50 transition-all whitespace-nowrap'
const cardCls = 'bg-surface-container border border-outline-variant rounded-xl p-5'
const sectionCls = 'bg-surface-container border border-outline-variant rounded-xl p-5 mb-4'

function Bdg({ status }: { status: string }) {
  const cls = STATUS_BADGE[status] || STATUS_BADGE.em_execucao
  return <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${cls}`}>{STATUS_NOME[status] || status}</span>
}

// ─────────────────────────────────────────────────────────────
export default function Obras() {
  const [obras,    setObras]    = useState<any[]>([])
  const [lancs,    setLancs]    = useState<any[]>([])
  const [gastos,   setGastos]   = useState<any[]>([])
  const [servicos, setServicos] = useState<any[]>([])
  const [orcamentos, setOrcamentos] = useState<any[]>([])
  const [orcAmbientes, setOrcAmbientes] = useState<any[]>([])
  const [orcItens, setOrcItens] = useState<any[]>([])
  const [etapas, setEtapas] = useState<any[]>([])
  const [cronHistorico, setCronHistorico] = useState<any[]>([])
  const [bancoItens, setBancoItens] = useState<any[]>([])
  const [alteracaoCron, setAlteracaoCron] = useState<{ et: any; nome: string; patch: any; tipo: string; motivo: string } | null>(null)
  const [fEtapa, setFEtapa] = useState({ nome: '', categoria: '', fornecedor: '', inicio: '', fim: '' })
  const [etapaHistAberta, setEtapaHistAberta] = useState<string | null>(null)
  const [acessosCliente, setAcessosCliente] = useState<any[]>([])
  const [carregandoAcessos, setCarregandoAcessos] = useState(false)
  const [fAcessos, setFAcessos] = useState<{ nome: string; email: string; senha: string }[]>([{ nome: '', email: '', senha: '' }])
  const [acessosCriados, setAcessosCriados] = useState<{ email: string; senha: string }[]>([])
  const [salvandoAcessos, setSalvandoAcessos] = useState(false)
  const [redefinindoAcesso, setRedefinindoAcesso] = useState<{ id: string; senha: string } | null>(null)
  const [msgAcesso, setMsgAcesso] = useState('')
  const [medicoes, setMedicoes] = useState<any[]>([])
  const [medItens, setMedItens] = useState<any[]>([])
  const [medicaoAtiva, setMedicaoAtiva] = useState<any>(null)
  const [preenchimento, setPreenchimento] = useState<Record<string, { valor_base: string; percentual: string }>>({})
  const [descAdiantPctInput, setDescAdiantPctInput] = useState('')
  const [clienteCrm, setClienteCrm] = useState<ValorClienteCrm>(CLIENTE_CRM_VAZIO)
  const [modoAbatInput, setModoAbatInput] = useState<ModoAbatimento>('compensacao')
  const [fMedicao, setFMedicao] = useState({ tipo: 'cliente', fornecedor: '', data: hojeISO(), observacao: '', adiantamento: false, valor_adiantamento: '' })
  const [grupoMedicaoAberto, setGrupoMedicaoAberto] = useState<string | null>(null)
  const [mapaGeralAberto, setMapaGeralAberto] = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [detalhe,  setDetalhe]  = useState<any>(null)
  const [abaDetalhe, setAbaDetalhe] = useState('resumo')
  const [janela,   setJanela]   = useState<'nova_obra' | 'editar_obra' | 'novo_servico' | 'editar_servico' | 'nova_medicao' | 'relatorio_pdf' | 'nova_visita' | 'editar_visita' | 'novo_funcionario' | 'editar_funcionario' | 'programar_pagamento' | 'alterar_etapa' | 'nova_etapa' | 'campo_cliente' | null>(null)
  const [medicaoProgramando, setMedicaoProgramando] = useState<any>(null)
  const [dataProgramar, setDataProgramar] = useState('')
  const [totalLiquidoProgramar, setTotalLiquidoProgramar] = useState(0)
  const [observacoesPdf, setObservacoesPdf] = useState('')
  const [filtro,   setFiltro]   = useState('todos')
  const [filtroExecucao, setFiltroExecucao] = useState('todos')
  const [busca,    setBusca]    = useState('')
  const [userEmail, setUserEmail] = useState('')

  const [fObra, setFObra] = useState({
    codigo: '', nome: '', tipo: 'Reforma', tipo_execucao: 'obra', cliente: '',
    endereco: '', responsavel: '', status: 'em_execucao',
    data_inicio: '', data_previsao: '', valor_contrato: '', dias_trabalho: 'seg_sex',
    gerenciamento: false,
  })

  const [fServ, setFServ] = useState({
    nome: '', categoria: '', unidade: 'm²', quantidade: '1', valor_previsto: '', valor_realizado: '',
    valor_mao_obra_previsto: '', valor_material_previsto: '',
    status: 'pendente', observacao: '', fornecedor: ''
  })

  const [obraEditando,   setObraEditando]   = useState<any>(null)
  const [servicoEditando, setServicoEditando] = useState<any>(null)

  const [usuarios, setUsuarios] = useState<any[]>([])
  const [atribuicoes, setAtribuicoes] = useState<any[]>([])
  const [souAdmin, setSouAdmin] = useState(false)
  const [souGerenteTime, setSouGerenteTime] = useState(false)

  const [relatoriosVisita, setRelatoriosVisita] = useState<any[]>([])
  const [fRv, setFRv] = useState(FRV_VAZIO)
  const [fotosRv, setFotosRv] = useState<{ file?: File; url?: string; descricao: string }[]>([])
  const [enviandoRv, setEnviandoRv] = useState(false)
  const [rvEditando, setRvEditando] = useState<any>(null)
  const [buscaRv, setBuscaRv] = useState('')

  const [funcionarios, setFuncionarios] = useState<any[]>([])
  const [funcionarioArquivos, setFuncionarioArquivos] = useState<any[]>([])
  const [fFunc, setFFunc] = useState(FFUNC_VAZIO)
  const [funcEditando, setFuncEditando] = useState<any>(null)
  const [funcExpandido, setFuncExpandido] = useState<string | null>(null)
  const [arquivoUploadFunc, setArquivoUploadFunc] = useState<File | null>(null)
  const [enviandoArquivoFunc, setEnviandoArquivoFunc] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('viga_token')) {
      window.location.href = '/'
      return
    }
    setUserEmail(localStorage.getItem('viga_email') || '')
    obterMinhasPermissoes().then(perm => {
      if (!temAcessoModulo(perm, 'obras')) { window.location.href = '/'; return }
      setSouAdmin(perm?.role === 'admin')
      setSouGerenteTime(perm?.role === 'gerente_time')
    })
    carregar()
  }, [])

  // abre a obra apontada por um alerta (ou pelo 'Upload RDO' do Dashboard), na aba pedida
  useAbrirAlvo(CHAVE.obra, true, async (id, abaAlvo) => {
    const abrirNovaVisitaFlag = localStorage.getItem('viga_obra_abrir_nova_visita')
    localStorage.removeItem('viga_obra_abrir_nova_visita')
    const r = await buscar('obras', '?id=eq.' + id)
    if (r[0]) {
      setDetalhe(r[0])
      setAbaDetalhe(abaAlvo || 'resumo')
      if (abaAlvo === 'visitas' && abrirNovaVisitaFlag) abrirNovaVisita()
    }
  })

  function sair() {
    localStorage.removeItem('viga_token')
    localStorage.removeItem('viga_refresh_token')
    localStorage.removeItem('viga_email')
    window.location.href = '/'
  }

  async function carregar() {
    setLoading(true)
    const [o, l, g, s, orc, orcAmb, orcIt, et, med, medIt, u, atr, rv, fu, fua, cronHist, bancoIt] = await Promise.all([
      buscar('obras', '?order=created_at.desc'),
      buscar('lancamentos', '?order=data.desc'),
      buscar('gastos_cartao', '?order=data.desc'),
      buscar('obra_servicos', '?order=created_at'),
      buscar('orcamentos', '?order=created_at.desc'),
      buscar('orcamento_ambientes', '?order=ordem'),
      buscar('orcamento_itens', '?order=created_at'),
      buscar('cronograma_etapas', '?order=created_at'),
      buscar('medicoes', '?order=data.desc'),
      buscar('medicao_itens', '?order=created_at'),
      buscar('usuarios', '?select=id,nome,email,role&order=nome'),
      buscar('obra_atribuicoes', '?order=created_at'),
      buscar('obra_relatorios_visita', '?order=data.desc'),
      buscar('obra_funcionarios', '?order=created_at'),
      buscar('obra_funcionario_arquivos', '?order=created_at'),
      buscar('cronograma_historico', '?order=created_at.desc'),
      buscar('banco_itens', '?select=id,tempo_execucao,tempo_execucao_unidade'),
    ])
    setCronHistorico(cronHist)
    setBancoItens(bancoIt)
    setObras(o)
    setLancs(l)
    setGastos(g)
    setServicos(s)
    setOrcamentos(orc)
    setOrcAmbientes(orcAmb)
    setOrcItens(orcIt)
    setEtapas(et)
    setMedicoes(med)
    setMedItens(medIt)
    setUsuarios(u)
    setAtribuicoes(atr)
    setRelatoriosVisita(rv)
    setFuncionarios(fu)
    setFuncionarioArquivos(fua)
    setLoading(false)
  }

  // ── Funcionários / equipe da obra ────────────────────────────
  function abrirNovoFuncionario() {
    setFuncEditando(null); setFFunc(FFUNC_VAZIO)
    setJanela('novo_funcionario')
  }
  function abrirEditarFuncionario(f: any) {
    setFuncEditando(f)
    setFFunc({ nome: f.nome, cpf: f.cpf || '', rg: f.rg || '', empresa: f.empresa || '', telefone: f.telefone || '' })
    setJanela('editar_funcionario')
  }
  async function salvarFuncionario() {
    if (!detalhe || !fFunc.nome.trim()) return alert('Preencha o nome')
    const dados = { obra_id: detalhe.id, nome: fFunc.nome.trim(), cpf: fFunc.cpf || null, rg: fFunc.rg || null, empresa: fFunc.empresa || null, telefone: fFunc.telefone || null }
    if (funcEditando) { await editar('obra_funcionarios', funcEditando.id, dados) }
    else { await criar('obra_funcionarios', dados) }
    setJanela(null); setFuncEditando(null); setFFunc(FFUNC_VAZIO)
    await carregar()
  }
  async function excluirFuncionario(f: any) {
    if (!confirm(`Excluir ${f.nome}? Isso também remove os arquivos anexados.`)) return
    await remover('obra_funcionarios', f.id)
    await carregar()
  }
  async function salvarArquivoFuncionario(funcionarioId: string) {
    if (!arquivoUploadFunc) return
    setEnviandoArquivoFunc(true)
    const url = await uploadArquivoFuncionario(arquivoUploadFunc)
    setEnviandoArquivoFunc(false)
    if (!url) return alert('Falha ao enviar o arquivo. Tente novamente.')
    await criar('obra_funcionario_arquivos', { funcionario_id: funcionarioId, nome: arquivoUploadFunc.name, url, tipo: arquivoUploadFunc.type || null })
    setArquivoUploadFunc(null)
    await carregar()
  }
  async function removerArquivoFuncionario(id: string) {
    if (!confirm('Excluir este arquivo?')) return
    await remover('obra_funcionario_arquivos', id)
    await carregar()
  }

  // ── Relatório de Visita ──────────────────────────────────────
  function adicionarNomeEquipe() {
    if (!fRv.nomeEquipeAtual.trim()) return
    setFRv({ ...fRv, equipe_presente: [...fRv.equipe_presente, fRv.nomeEquipeAtual.trim()], nomeEquipeAtual: '' })
  }
  function removerNomeEquipe(i: number) {
    setFRv({ ...fRv, equipe_presente: fRv.equipe_presente.filter((_, idx) => idx !== i) })
  }
  function abrirNovaVisita() {
    setRvEditando(null); setFRv(FRV_VAZIO); setFotosRv([])
    setJanela('nova_visita')
  }
  function abrirEditarVisita(v: any) {
    setRvEditando(v)
    setFRv({ data: v.data, clima: v.clima || '', descricao: v.descricao || '', pendencias: v.pendencias || '', equipe_presente: v.equipe_presente || [], nomeEquipeAtual: '' })
    setFotosRv((v.fotos || []).map((f: any) => ({ url: f.url, descricao: f.descricao || '' })))
    setJanela('editar_visita')
  }
  async function excluirVisita(v: any) {
    if (!confirm('Excluir este relatório de visita?')) return
    await remover('obra_relatorios_visita', v.id)
    await carregar()
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
        : !!(await criar('obra_relatorios_visita', dados))
      if (!ok) { alert('Não foi possível salvar o relatório. Verifique a conexão e tente novamente.'); return }
      if (falhas > 0) alert(`Relatório salvo, mas ${falhas} foto(s) não foram enviadas (conexão instável). Edite o relatório para reenviá-las.`)
      setFRv(FRV_VAZIO); setFotosRv([]); setRvEditando(null)
      setJanela(null)
      await carregar()
    } catch {
      alert('Não foi possível salvar o relatório. Verifique a conexão e tente novamente.')
    } finally {
      setEnviandoRv(false)
    }
  }

  function atribuicoesDaObra(obraId: string) {
    return atribuicoes.filter(a => a.obra_id === obraId)
  }
  async function alternarAtribuicao(obraId: string, usuarioId: string) {
    const existente = atribuicoes.find(a => a.obra_id === obraId && a.usuario_id === usuarioId)
    if (existente) await remover('obra_atribuicoes', existente.id)
    else await criar('obra_atribuicoes', { obra_id: obraId, usuario_id: usuarioId })
    carregar()
  }

  // ── Medições ──────────────────────────────────────────────
  // Busca o registro da medição IMEDIATAMENTE ANTERIOR (mesmo tipo/fornecedor, data
  // estritamente anterior à da medição atual) para servir de base do "acumulado anterior".
  // Sem o filtro de data, uma medição futura já lançada fora de ordem (ex.: setembro
  // cadastrado antes de agosto ser corrigido) podia ser escolhida como "anterior" de uma
  // medição mais antiga, gerando valor de período negativo/errado.
  function ultimoRegistro(servicoId: string, medicaoIdAtual: string | undefined, tipo: string, fornecedor: string | null | undefined, dataAtual: string) {
    return medItens
      .filter(mi => mi.servico_id === servicoId && mi.medicao_id !== medicaoIdAtual)
      .map(mi => ({ ...mi, medicao: medicoes.find(m => m.id === mi.medicao_id) }))
      .filter(mi => mi.medicao && mi.medicao.tipo === tipo && (tipo !== 'fornecedor' || mi.medicao.fornecedor === fornecedor) && mi.medicao.data < dataAtual)
      .sort((a, b) => new Date(b.medicao.data).getTime() - new Date(a.medicao.data).getTime())[0] || null
  }

  // Total período (bruto) e líquido (após retenção) de uma medição já salva — usado no
  // painel de crédito/débito do contrato e na lista de medições.
  function totalsMedicao(med: any) {
    // Adiantamento: valor fixo, pago à parte de qualquer % por serviço — sem retenção,
    // e sem depender de medicao_itens (por isso também nunca vira "ultimoRegistro" de
    // um serviço real: não tem itens vinculados a ele).
    if (med.valor_adiantamento != null) return { totalPeriodo: parseFloat(med.valor_adiantamento), totalLiquido: parseFloat(med.valor_adiantamento) }
    const svsObra = servicosObra(med.obra_id)
    const itensFiltrados = svsObra.filter(s => med.tipo !== 'fornecedor' || !med.fornecedor || s.fornecedor === med.fornecedor)
    const orcVinculado = orcamentos.find(o => o.obra_id === med.obra_id)
    const retPct = parseFloat(orcVinculado?.retencao_percentual || 0)
    let totalPeriodo = 0, totalBaseGrupo = 0
    itensFiltrados.forEach(item => {
      const mi = medItens.find(x => x.medicao_id === med.id && x.servico_id === item.id)
      const ultimo = ultimoRegistro(item.id, med.id, med.tipo, med.fornecedor, med.data)
      const valorBase = mi ? mi.valor_base : (ultimo ? ultimo.valor_base : baseParaMedicao(item, med.tipo))
      totalBaseGrupo += valorBase
      if (!mi) return
      const acumAnterior = ultimo ? ultimo.valor_base * ultimo.percentual_acumulado : 0
      const acumAtual = mi.valor_base * mi.percentual_acumulado
      totalPeriodo += acumAtual - acumAnterior
    })
    // Abatimento do adiantamento: por padrão a medição COMPENSA o saldo de adiantamento disponível até a
    // data dela (o fornecedor só recebe o que sobrar); o modo proporcional abate o % de avanço sobre o
    // total adiantado. O % digitado (desconto_adiantamento_pct) ajusta ambos — ver app/lib/medicoesCalc.ts.
    const abat = calcularAbatimento({
      modo: modoAbatimentoDe(med),
      pctDigitado: med.desconto_adiantamento_pct != null ? parseFloat(med.desconto_adiantamento_pct) : null,
      bruto: totalPeriodo, retencaoPct: retPct, totalBaseGrupo,
      adiantadoTotal: totalAdiantamentoGrupoMed(med), adiantadoAteData: adiantadoAteDataGrupo(med), jaAbatido: descontoJaAbatido(med),
    })
    const descontoAdiantamento = abat.desconto
    const totalLiquido = totalPeriodo - totalPeriodo * retPct - descontoAdiantamento
    return { totalPeriodo, totalLiquido, descontoAdiantamento }
  }

  // Soma dos adiantamentos do mesmo grupo (cliente, ou o mesmo fornecedor) de uma medição.
  function totalAdiantamentoGrupoMed(med: any) {
    return medicoes
      .filter(m => m.obra_id === med.obra_id && m.tipo === med.tipo && (med.tipo !== 'fornecedor' || m.fornecedor === med.fornecedor) && m.valor_adiantamento != null)
      .reduce((a, m) => a + parseFloat(m.valor_adiantamento || 0), 0)
  }

  // Soma dos adiantamentos do mesmo grupo feitos até a data da medição (o adiantamento de uma data
  // posterior não pode ser abatido por uma medição anterior a ele).
  function adiantadoAteDataGrupo(med: any) {
    return medicoes
      .filter(m => m.obra_id === med.obra_id && m.tipo === med.tipo && (med.tipo !== 'fornecedor' || m.fornecedor === med.fornecedor) && m.valor_adiantamento != null && m.data <= med.data)
      .reduce((a, m) => a + parseFloat(m.valor_adiantamento || 0), 0)
  }

  // Quanto do adiantamento já foi abatido pelas medições reais ANTERIORES do mesmo grupo
  // (mesma ordem usada por ultimoRegistro: data, desempatando por criação).
  function descontoJaAbatido(med: any): number {
    return medicoes
      .filter(m => m.id !== med.id && m.obra_id === med.obra_id && m.tipo === med.tipo && (med.tipo !== 'fornecedor' || m.fornecedor === med.fornecedor)
        && m.valor_adiantamento == null
        && (m.data < med.data || (m.data === med.data && (m.created_at || '') < (med.created_at || ''))))
      .reduce((a, m) => a + (totalsMedicao(m).descontoAdiantamento || 0), 0)
  }

  // Mapa Geral: pivota medicao_itens numa linha por item × uma coluna por medição real do
  // grupo (estilo planilha "Medição Física" que o cliente usa) — reaproveita o mesmo motor
  // de ultimoRegistro/valor_base·percentual_acumulado já usado na tela de preenchimento e em
  // totalsMedicao, só que percorrendo TODAS as medições do grupo de uma vez em vez de uma só.
  function mapaGeralGrupo(grupo: { tipo: 'cliente' | 'fornecedor'; fornecedor: string | null; medicoes: any[] }, itensGrupo: any[]) {
    const itensOrdenados = ordenarServicosObra(itensGrupo)
    const medicoesReais = grupo.medicoes.filter(m => m.valor_adiantamento == null)
    const linhas = itensOrdenados.map(item => {
      const porMedicao = medicoesReais.map(med => {
        const mi = medItens.find(x => x.medicao_id === med.id && x.servico_id === item.id)
        const ultimo = ultimoRegistro(item.id, med.id, med.tipo, med.fornecedor, med.data)
        const acumAnterior = ultimo ? ultimo.valor_base * ultimo.percentual_acumulado : 0
        const valorBase = mi ? mi.valor_base : (ultimo ? ultimo.valor_base : baseParaMedicao(item, med.tipo))
        // Sem lançamento pra esse item nesse round: mantém o acumulado anterior (não zera).
        const acumAtual = mi ? mi.valor_base * mi.percentual_acumulado : acumAnterior
        const valorPeriodo = acumAtual - acumAnterior
        return { med, valorBase, valorPeriodo, pctPeriodo: valorBase > 0 ? (valorPeriodo / valorBase) * 100 : 0, acumAtual }
      })
      const ultimaColuna = porMedicao[porMedicao.length - 1]
      const valorAcum = ultimaColuna ? ultimaColuna.acumAtual : 0
      const baseFinal = ultimaColuna ? ultimaColuna.valorBase : baseParaMedicao(item, grupo.tipo)
      const pctAcum = baseFinal > 0 ? (valorAcum / baseFinal) * 100 : 0
      return { item, porMedicao, valorBase: baseFinal, valorAcum, pctAcum, valorFalta: Math.max(baseFinal - valorAcum, 0), pctFalta: Math.max(100 - pctAcum, 0) }
    })
    const totaisPorMedicao = medicoesReais.map((_, idx) => linhas.reduce((a, l) => a + (l.porMedicao[idx]?.valorPeriodo || 0), 0))
    const totalBase = linhas.reduce((a, l) => a + l.valorBase, 0)
    const totalAcum = linhas.reduce((a, l) => a + l.valorAcum, 0)
    const totalFalta = linhas.reduce((a, l) => a + l.valorFalta, 0)
    const totalPctAcum = totalBase > 0 ? (totalAcum / totalBase) * 100 : 0
    const totalPctFalta = totalBase > 0 ? (totalFalta / totalBase) * 100 : 0
    return { itensOrdenados, medicoesReais, linhas, totaisPorMedicao, totalBase, totalAcum, totalFalta, totalPctAcum, totalPctFalta }
  }

  function abrirPreenchimentoMedicao(medicao: any, itensFiltrados: any[]) {
    const preench: Record<string, { valor_base: string; percentual: string }> = {}
    itensFiltrados.forEach(item => {
      const existente = medItens.find(mi => mi.medicao_id === medicao.id && mi.servico_id === item.id)
      const ultimo = ultimoRegistro(item.id, medicao.id, medicao.tipo, medicao.fornecedor, medicao.data)
      preench[item.id] = {
        valor_base: existente ? String(existente.valor_base) : (ultimo ? String(ultimo.valor_base) : String(baseParaMedicao(item, medicao.tipo))),
        percentual: existente ? String(existente.percentual_acumulado * 100) : (ultimo ? String(ultimo.percentual_acumulado * 100) : '0'),
      }
    })
    setPreenchimento(preench)
    setDescAdiantPctInput(medicao.desconto_adiantamento_pct != null ? String(Math.round(parseFloat(medicao.desconto_adiantamento_pct) * 10000) / 100) : '')
    setModoAbatInput(modoAbatimentoDe(medicao))
    setMedicaoAtiva(medicao)
  }

  async function criarMedicao() {
    const ehAdiantamento = fMedicao.tipo === 'fornecedor' && fMedicao.adiantamento
    if (ehAdiantamento && !parseFloat(fMedicao.valor_adiantamento || '0')) return alert('Preencha o valor do adiantamento')
    if (ehAdiantamento && !fMedicao.observacao.trim()) return alert('Preencha a que se refere o adiantamento')
    const ano = new Date().getFullYear()
    const medicoesObraAno = medicoes.filter(m => m.obra_id === detalhe.id && m.numero?.startsWith('MED-' + ano))
    const numero = 'MED-' + ano + '-' + String(medicoesObraAno.length + 1).padStart(3, '0')
    const orcVinculado = orcamentos.find(o => o.obra_id === detalhe.id)
    const nova = await criar('medicoes', {
      obra_id: detalhe.id,
      orcamento_id: orcVinculado?.id || null,
      tipo: fMedicao.tipo,
      fornecedor: fMedicao.tipo === 'fornecedor' ? (fMedicao.fornecedor || null) : null,
      numero,
      data: fMedicao.data,
      observacao: fMedicao.observacao,
      status: 'rascunho',
      valor_adiantamento: ehAdiantamento ? parseFloat(fMedicao.valor_adiantamento) : null,
    })
    setJanela(null)
    if (nova?.id) {
      const [med, medIt] = await Promise.all([buscar('medicoes', '?order=data.desc'), buscar('medicao_itens', '?order=created_at')])
      setMedicoes(med); setMedItens(medIt)
      // Adiantamento é valor fixo, sem itens por serviço — não faz sentido abrir a tela de
      // preenchimento item a item (fica vazia); o valor já entra pronto no histórico do
      // fornecedor e no painel de pago × falta pagar.
      if (ehAdiantamento) return
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
      const dados = {
        medicao_id: medicaoAtiva.id,
        servico_id: item.id,
        valor_base: parseFloat(p.valor_base || '0'),
        percentual_acumulado: parseFloat(p.percentual || '0') / 100,
      }
      if (existente) await editar('medicao_itens', existente.id, dados)
      else await criar('medicao_itens', dados)
    }
    const pctDigitado = descAdiantPctInput.trim() === '' ? null : Math.min(Math.max(parseFloat(descAdiantPctInput.replace(',', '.')) || 0, 0), 100) / 100
    const okPct = await editar('medicoes', medicaoAtiva.id, { desconto_adiantamento_pct: pctDigitado, modo_abatimento: modoAbatInput })
    if (!okPct) alert('Os itens foram salvos, mas não foi possível salvar o % de desconto do adiantamento. Tente novamente.')
    const [medIt, med] = await Promise.all([buscar('medicao_itens', '?order=created_at'), buscar('medicoes', '?order=data.desc')])
    setMedItens(medIt)
    setMedicoes(med)
    setMedicaoAtiva(med.find((m: any) => m.id === medicaoAtiva.id) || medicaoAtiva)
    if (okPct) alert('Medição salva!')
  }

  function abrirProgramarPagamento(medicao: any, totalLiquido: number) {
    setMedicaoProgramando(medicao)
    setDataProgramar(medicao.data_pagamento_programada || hojeISO())
    setTotalLiquidoProgramar(totalLiquido)
    setJanela('programar_pagamento')
  }
  async function confirmarProgramarPagamento() {
    if (!medicaoProgramando || !dataProgramar) return
    if (medicaoProgramando.lancamento_id) {
      await editar('lancamentos', medicaoProgramando.lancamento_id, { data_vencimento: dataProgramar })
      await editar('medicoes', medicaoProgramando.id, { data_pagamento_programada: dataProgramar })
    } else {
      const dados = {
        data: hojeISO(),
        descricao: 'Medição ' + medicaoProgramando.numero + (medicaoProgramando.fornecedor ? ' — ' + medicaoProgramando.fornecedor : ''),
        tipo: medicaoProgramando.tipo === 'fornecedor' ? 'saida' : 'entrada',
        valor: arred2(Math.abs(totalLiquidoProgramar)),
        categoria: 'Medição de obra',
        status: 'pendente',
        data_vencimento: dataProgramar,
        obra_id: detalhe.id,
      }
      const lanc = await criar('lancamentos', dados)
      if (lanc?.id) await editar('medicoes', medicaoProgramando.id, { data_pagamento_programada: dataProgramar, lancamento_id: lanc.id })
    }
    setJanela(null); setMedicaoProgramando(null); setDataProgramar('')
    const [med, lc] = await Promise.all([buscar('medicoes', '?order=data.desc'), buscar('lancamentos', '?order=data.desc')])
    setMedicoes(med); setLancs(lc)
    if (medicaoAtiva) setMedicaoAtiva(med.find((m: any) => m.id === medicaoAtiva.id) || null)
  }
  // Marca o lançamento de uma medição/adiantamento como pago diretamente na aba Medições —
  // necessário porque, numa obra de Gerenciamento, esse lançamento fica de fora das telas do
  // Financeiro (não é dinheiro da Inverso), então o único lugar pra confirmar o pagamento e
  // disparar o abatimento no painel de pago × falta pagar é aqui mesmo.
  // Alinha o lançamento financeiro de uma medição ao valor a pagar calculado hoje (ex.: medição que
  // foi lançada antes do abatimento do adiantamento). Valor zero remove o lançamento.
  async function ajustarLancamentoMedicao(medicao: any, valor: number) {
    const lanc = lancs.find(l => l.id === medicao.lancamento_id)
    if (!lanc) return
    const zerado = valor <= 0.005
    const msg = zerado
      ? `O valor a pagar desta medição é R$ 0,00 (tudo abatido do adiantamento), mas existe um lançamento de ${moeda(parseFloat(lanc.valor || 0))} (${lanc.status === 'pago' ? 'pago' : 'pendente'}). Remover esse lançamento?`
      : `Alterar o lançamento de ${moeda(parseFloat(lanc.valor || 0))} para ${moeda(valor)}?`
    if (!confirm(msg)) return
    if (zerado) {
      const okLink = await editar('medicoes', medicao.id, { lancamento_id: null, data_pagamento_programada: null })
      if (!okLink) return alert('Não foi possível desvincular o lançamento. Tente novamente.')
      await remover('lancamentos', lanc.id)
    } else {
      const ok = await editar('lancamentos', lanc.id, { valor: arred2(valor) })
      if (!ok) return alert('Não foi possível ajustar o lançamento. Tente novamente.')
    }
    const [med, lc] = await Promise.all([buscar('medicoes', '?order=data.desc'), buscar('lancamentos', '?order=data.desc')])
    setMedicoes(med); setLancs(lc)
    setMedicaoAtiva(med.find((m: any) => m.id === medicao.id) || null)
  }

  async function marcarMedicaoPaga(lancamentoId: string) {
    const ok = await editar('lancamentos', lancamentoId, { status: 'pago', data_pagamento: hojeISO() })
    if (!ok) return alert('Não foi possível marcar como pago. Tente novamente.')
    const lc = await buscar('lancamentos', '?order=data.desc')
    setLancs(lc)
  }

  async function gerarPDFMedicao(medicao: any, linhas: any[], obra: any) {
    const cfg = (await buscar('empresa_config', '?limit=1'))[0] || {}
    const nomeEmpresa = cfg.nome_empresa || 'VIGA'
    const totalPeriodo = linhas.reduce((a, l) => a + l.valorPeriodo, 0)
    const totalRetencao = linhas.reduce((a, l) => a + l.retencao, 0)
    const totalDescontoAdiantamento = linhas.reduce((a, l) => a + (l.descontoAdiantamento || 0), 0)
    const totalLiquido = linhas.reduce((a, l) => a + l.liquido, 0)
    const temDescontoAdiantamento = totalDescontoAdiantamento > 0

    const linhasHtml = linhas.map(l => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948">${l.item.nome}${l.item.fornecedor ? ` <span style="color:#869391">(${l.item.fornecedor})</span>` : ''}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:center">${parseFloat(l.p.percentual || '0').toFixed(1)}%</td>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:right">${moeda(l.valorPeriodo)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:right;color:#ffb4ab">${moeda(l.retencao)}</td>
        ${temDescontoAdiantamento ? `<td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:right;color:#ffcbac">${moeda(l.descontoAdiantamento || 0)}</td>` : ''}
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:right;font-weight:700;color:#6ee9e0">${moeda(l.liquido)}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>${medicao.numero} — ${nomeEmpresa}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { background:#0f141b; color:#dee2ec; font-family:'Inter',sans-serif; font-size:13px; }
      h1,h2 { font-family:'Manrope',sans-serif; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      ${PRINT_SAFE_CSS}
    </style></head><body>
    <div style="max-width:900px;margin:0 auto;padding:40px 36px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #3d4948">
        <div>
          <h1 style="font-size:24px;font-weight:700;color:#6ee9e0;text-transform:uppercase">Boletim de Medição</h1>
          <p style="color:#bcc9c7">${medicao.tipo === 'fornecedor' ? 'Pagamento a Fornecedor' : 'Cobrança ao Cliente'}</p>
        </div>
        <div style="text-align:right">
          ${cfg.logo_url ? `<img src="${cfg.logo_url}" style="height:80px;object-fit:contain;margin-bottom:6px" />` : `<div style="font-size:18px;font-weight:900;color:#6ee9e0">${nomeEmpresa}</div>`}
          <p style="font-size:10px;color:#869391">Nº ${medicao.numero}</p>
          <p style="font-size:10px;color:#869391">Data: ${new Date(medicao.data).toLocaleDateString('pt-BR')}</p>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
        <div style="background:#1b2027;border:1px solid #3d4948;border-radius:12px;padding:16px">
          <span style="font-size:10px;color:#6ee9e0;text-transform:uppercase;font-weight:700">Obra</span>
          <p style="font-size:15px;font-weight:700;margin-top:4px">${obra?.nome || ''}</p>
          <p style="font-size:12px;color:#bcc9c7">${obra?.cliente || ''}</p>
        </div>
        <div style="background:#1b2027;border:1px solid #3d4948;border-radius:12px;padding:16px">
          <span style="font-size:10px;color:#869391;text-transform:uppercase">${medicao.tipo === 'fornecedor' ? 'Fornecedor' : 'Cliente'}</span>
          <p style="font-size:15px;font-weight:700;margin-top:4px">${medicao.tipo === 'fornecedor' ? (medicao.fornecedor || '—') : (obra?.cliente || '—')}</p>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <thead>
          <tr style="background:#252a32">
            <th style="padding:8px 10px;text-align:left;font-size:10px;color:#869391;text-transform:uppercase">Serviço</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;color:#869391;text-transform:uppercase">% Acum.</th>
            <th style="padding:8px 10px;text-align:right;font-size:10px;color:#869391;text-transform:uppercase">Valor Período</th>
            <th style="padding:8px 10px;text-align:right;font-size:10px;color:#869391;text-transform:uppercase">Retenção</th>
            ${temDescontoAdiantamento ? `<th style="padding:8px 10px;text-align:right;font-size:10px;color:#869391;text-transform:uppercase">Desc. Adiant.</th>` : ''}
            <th style="padding:8px 10px;text-align:right;font-size:10px;color:#869391;text-transform:uppercase">Líquido</th>
          </tr>
        </thead>
        <tbody>${linhasHtml}</tbody>
        <tfoot>
          <tr style="background:#1b2027">
            <td colspan="2" style="padding:10px;font-weight:700">TOTAL</td>
            <td style="padding:10px;text-align:right;font-weight:700;color:#6ee9e0">${moeda(totalPeriodo)}</td>
            <td style="padding:10px;text-align:right;font-weight:700;color:#ffb4ab">${moeda(totalRetencao)}</td>
            ${temDescontoAdiantamento ? `<td style="padding:10px;text-align:right;font-weight:700;color:#ffcbac">${moeda(totalDescontoAdiantamento)}</td>` : ''}
            <td style="padding:10px;text-align:right;font-weight:900;color:#6ee9e0;font-size:15px">${moeda(totalLiquido)}</td>
          </tr>
        </tfoot>
      </table>
      ${medicao.observacao ? `<div style="margin-bottom:20px;padding:14px;background:#1b2027;border:1px solid #3d4948;border-radius:8px"><span style="font-size:10px;color:#869391;text-transform:uppercase">Observações</span><p style="margin-top:4px;color:#bcc9c7">${medicao.observacao}</p></div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:60px;padding-top:20px">
        <div style="text-align:center">
          <div style="width:100%;height:1px;background:#3d4948;margin-bottom:8px"></div>
          <p style="font-size:11px;font-weight:700">${nomeEmpresa}</p>
        </div>
        <div style="text-align:center">
          <div style="width:100%;height:1px;background:#3d4948;margin-bottom:8px"></div>
          <p style="font-size:11px;font-weight:700">${medicao.tipo === 'fornecedor' ? (medicao.fornecedor || 'Fornecedor') : (obra?.cliente || 'Cliente')}</p>
        </div>
      </div>
    </div>
    <script>window.onload = () => { window.print() }</script>
    </body></html>`

    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  // Relatório Completo de Medições — histórico acumulado de TODAS as medições já lançadas
  // para um fornecedor (ou para o cliente) até o momento, com o panorama pago × falta pagar.
  // Complementa gerarPDFMedicao (que só cobre a medição atual) para apresentar ao cliente/
  // fornecedor o quanto já foi medido e pago desde o início.
  async function gerarPDFMedicaoCompleta(grupo: { tipo: 'cliente' | 'fornecedor'; fornecedor: string | null; medicoes: any[] }, obra: any, previstoGrupo: number) {
    const cfg = (await buscar('empresa_config', '?limit=1'))[0] || {}
    const nomeEmpresa = cfg.nome_empresa || 'VIGA'
    const nomeGrupo = grupo.tipo === 'cliente' ? (obra?.cliente || 'Cliente') : (grupo.fornecedor || 'Fornecedor')

    let pagoGrupo = 0, totalLiquidoGeral = 0, contadorMedicao = 0
    const linhasHtml = grupo.medicoes.map((med) => {
      const { totalLiquido } = totalsMedicao(med)
      totalLiquidoGeral += totalLiquido
      const lanc = med.lancamento_id ? lancs.find(l => l.id === med.lancamento_id) : null
      const statusPag = !lanc ? 'Rascunho' : lanc.status === 'pago' ? 'Pago' : 'Programado'
      const corStatus = statusPag === 'Pago' ? '#6ee9e0' : statusPag === 'Programado' ? '#ffcbac' : '#869391'
      if (lanc?.status === 'pago') pagoGrupo += totalLiquido
      const isAdiantamento = med.valor_adiantamento != null
      const rotulo = isAdiantamento ? '💰 Adiantamento' : `Medição ${++contadorMedicao}`
      return `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948">${rotulo} <span style="color:#869391">· ${med.numero}</span>${isAdiantamento && med.observacao ? ` <span style="color:#869391">— ${med.observacao}</span>` : ''}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:center">${new Date(med.data).toLocaleDateString('pt-BR')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:right;font-weight:700;color:#6ee9e0">${moeda(totalLiquido)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:center;font-weight:700;color:${corStatus}">${statusPag}</td>
      </tr>`
    }).join('')
    const faltaGrupo = previstoGrupo - pagoGrupo

    // Mapa Geral (linha por item × coluna por medição real, estilo "Medição Física" da
    // planilha que o cliente usa) e Curva S Físico × Financeiro escopados a este grupo.
    const svsObraMapa = servicosObra(obra.id)
    const itensGrupoMapa = svsObraMapa.filter(s => grupo.tipo !== 'fornecedor' || s.fornecedor === grupo.fornecedor)
    const mapa = mapaGeralGrupo(grupo, itensGrupoMapa)

    let categoriaAnteriorMapa: string | null = null
    const mapaLinhasHtml = mapa.linhas.map(l => {
      const categoriaAtual = l.item.categoria || 'Outros'
      const headerCategoria = categoriaAtual !== categoriaAnteriorMapa
        ? `<tr><td colspan="${4 + mapa.medicoesReais.length * 2 + 4}" style="padding:6px 10px;background:#252a32;color:#6ee9e0;font-weight:700;font-size:10px;text-transform:uppercase">${categoriaAtual}</td></tr>`
        : ''
      categoriaAnteriorMapa = categoriaAtual
      const colsPorMedicao = l.porMedicao.map(pm => `
        <td style="padding:6px 8px;border-bottom:1px solid #3d4948;border-left:1px solid #3d4948;text-align:center;color:#bcc9c7">${pm.pctPeriodo.toFixed(0)}%</td>
        <td style="padding:6px 8px;border-bottom:1px solid #3d4948;text-align:right;color:#bcc9c7">${moeda(pm.valorPeriodo)}</td>`).join('')
      return `${headerCategoria}<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #3d4948">${l.item.nome}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #3d4948;text-align:center;color:#869391">${l.item.unidade || '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #3d4948;text-align:center;color:#869391">${l.item.quantidade ?? '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #3d4948;text-align:right">${moeda(l.valorBase)}</td>
        ${colsPorMedicao}
        <td style="padding:6px 8px;border-bottom:1px solid #3d4948;border-left:1px solid #3d4948;text-align:center;color:#6ee9e0;font-weight:700">${l.pctAcum.toFixed(0)}%</td>
        <td style="padding:6px 8px;border-bottom:1px solid #3d4948;text-align:right;color:#6ee9e0;font-weight:700">${moeda(l.valorAcum)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #3d4948;border-left:1px solid #3d4948;text-align:center;color:#ffb4ab">${l.pctFalta.toFixed(0)}%</td>
        <td style="padding:6px 8px;border-bottom:1px solid #3d4948;text-align:right;color:#ffb4ab">${moeda(l.valorFalta)}</td>
      </tr>`
    }).join('')
    const mapaCabecalhoMedicoes = mapa.medicoesReais.map((med, i) => `<th colspan="2" style="padding:6px 8px;text-align:center;font-size:9px;color:#869391;text-transform:uppercase;border-left:1px solid #3d4948">Medição ${i + 1}<br/><span style="font-weight:400;text-transform:none">${new Date(med.data).toLocaleDateString('pt-BR')}</span></th>`).join('')
    const mapaSubcabecalhoMedicoes = mapa.medicoesReais.map(() => `<th style="padding:4px 8px;text-align:center;font-size:9px;color:#869391;border-left:1px solid #3d4948">%</th><th style="padding:4px 8px;text-align:center;font-size:9px;color:#869391">R$</th>`).join('')
    const mapaRodapeMedicoes = mapa.totaisPorMedicao.map(v => `
        <td style="padding:8px;border-left:1px solid #3d4948;text-align:center;font-size:9px;color:#869391">${mapa.totalBase > 0 ? ((v / mapa.totalBase) * 100).toFixed(0) : '0'}%</td>
        <td style="padding:8px;text-align:right;font-weight:700">${moeda(v)}</td>`).join('')

    // Curva S Físico × Financeiro — eixo de datas real do grupo (não um cronograma fixo),
    // físico = acumulado medido (mesma lógica de progressoFisico, escopada ao grupo),
    // financeiro = acumulado pago (inclui adiantamento, já que ele também conta como pago
    // no painel Pago × Falta Pagar acima). Ambas as séries terminam no mesmo ponto (a data
    // mais recente do grupo) segurando o último valor conhecido — senão a linha física para
    // no meio do gráfico enquanto a financeira segue até a borda, parecendo "cortada".
    const datasGrupoCurva = grupo.medicoes.map(m => new Date(m.data + 'T00:00:00'))
    const primeiraDataCurva = datasGrupoCurva.length ? new Date(Math.min(...datasGrupoCurva.map(d => d.getTime()))) : new Date()
    const fimCurva = datasGrupoCurva.length ? new Date(Math.max(...datasGrupoCurva.map(d => d.getTime()))) : new Date()
    // Âncora do "zero" um pouco ANTES da primeira medição real — se ficasse na mesma data,
    // os dois primeiros pontos caem no mesmo x e a subida inicial fica invisível.
    const folgaCurva = Math.max((fimCurva.getTime() - primeiraDataCurva.getTime()) * 0.08, 3 * 86400000)
    const inicioCurva = new Date(primeiraDataCurva.getTime() - folgaCurva)
    const totalMsCurva = Math.max(fimCurva.getTime() - inicioCurva.getTime(), 1)
    const fisicoSerie: { data: Date; pct: number }[] = [{ data: inicioCurva, pct: 0 }]
    mapa.medicoesReais.forEach((med, idx) => {
      const acumAte = mapa.linhas.reduce((a, l) => a + (l.porMedicao[idx]?.acumAtual || 0), 0)
      fisicoSerie.push({ data: new Date(med.data + 'T00:00:00'), pct: mapa.totalBase > 0 ? Math.min((acumAte / mapa.totalBase) * 100, 100) : 0 })
    })
    if (fisicoSerie[fisicoSerie.length - 1].data.getTime() < fimCurva.getTime()) {
      fisicoSerie.push({ data: fimCurva, pct: fisicoSerie[fisicoSerie.length - 1].pct })
    }
    let pagoAcumCurva = 0
    const financeiroSerie: { data: Date; pct: number }[] = [{ data: inicioCurva, pct: 0 }]
    grupo.medicoes.slice().sort((a, b) => a.data < b.data ? -1 : 1).forEach(med => {
      const lanc = med.lancamento_id ? lancs.find(l => l.id === med.lancamento_id) : null
      if (lanc?.status === 'pago') pagoAcumCurva += totalsMedicao(med).totalLiquido
      financeiroSerie.push({ data: new Date(med.data + 'T00:00:00'), pct: mapa.totalBase > 0 ? Math.min((pagoAcumCurva / mapa.totalBase) * 100, 100) : 0 })
    })
    // Escala do eixo Y auto-ajustada ao maior valor das duas séries (arredondado pra cima em
    // múltiplos de 5, mínimo 10%) — em vez de sempre 0-100%, senão uma obra no início (poucos
    // % executados) fica com uma linha achatada e ilegível colada no eixo.
    const maxPctCurva = Math.max(1, ...fisicoSerie.map(p => p.pct), ...financeiroSerie.map(p => p.pct))
    const escalaMaxCurva = Math.min(100, Math.max(10, Math.ceil((maxPctCurva * 1.15) / 5) * 5))
    function serieParaPathGrupo(serie: { data: Date; pct: number }[]) {
      return serie.map((p, i) => {
        const x = Math.max(0, Math.min(800, ((p.data.getTime() - inicioCurva.getTime()) / totalMsCurva) * 800))
        const y = 300 - Math.min(p.pct / escalaMaxCurva, 1) * 300
        return (i === 0 ? 'M ' : 'L ') + x.toFixed(1) + ' ' + y.toFixed(1)
      }).join(' ')
    }
    const fisicoPath = serieParaPathGrupo(fisicoSerie)
    const financeiroPath = serieParaPathGrupo(financeiroSerie)
    const temCurvaGrupo = mapa.medicoesReais.length >= 2
    const eixoDatasCurva: string[] = []
    for (let i = 0; i <= 4; i++) {
      const d = new Date(inicioCurva.getTime() + (totalMsCurva * i) / 4)
      eixoDatasCurva.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', ''))
    }
    // Tabela de escopo e curva de gráfico ficam bem mais largas que uma folha retrato — a
    // impressão sai em paisagem, e se mesmo assim não couber (muitas medições), a tabela
    // encolhe proporcionalmente (zoom) até caber na largura útil da página.
    const mapaLarguraMin = 640 + mapa.medicoesReais.length * 140
    // A tabela do Mapa Geral usa largura em % (table-layout fixo): sempre cabe na folha, qualquer que seja o
    // número de medições; só a fonte diminui conforme as colunas aumentam.
    const nMedMapa = mapa.medicoesReais.length
    const mapaFonte = nMedMapa <= 3 ? 10 : nMedMapa <= 5 ? 9 : nMedMapa <= 7 ? 8.5 : nMedMapa <= 9 ? 8 : 7.5
    const mapaColNome = nMedMapa > 6 ? 16 : 20
    const mapaUnidadeCol = (100 - (mapaColNome + 3.5 + 3.5 + 8.5)) / ((nMedMapa + 2) * 3.4)
    const mapaColgroup = `<colgroup><col style="width:${mapaColNome}%"><col style="width:3.5%"><col style="width:3.5%"><col style="width:8.5%">${('<col style="width:' + mapaUnidadeCol.toFixed(2) + '%"><col style="width:' + (mapaUnidadeCol * 2.4).toFixed(2) + '%">').repeat(nMedMapa + 2)}</colgroup>`

    // Cronograma da obra (concluído / em andamento / atrasado) junto das medições, pra o
    // cliente ver o avanço físico ao lado do financeiro no mesmo arquivo.
    const etapasDaObraPDF = etapas.filter(e => e.obra_id === obra.id)
    const linhasCronogramaPDF = ordenarLinhasCronograma(
      montarLinhasCronograma(etapasDaObraPDF, servicosObra(obra.id), orcItens),
      modoEfetivoCronograma(obra, etapasDaObraPDF), ordemCategoria,
    ).linhas
    const secaoCronogramaHtml = htmlSecaoCronogramaPDF(obra, linhasCronogramaPDF, cronHistorico)

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Relatório Completo — ${nomeGrupo} — ${nomeEmpresa}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { background:#0f141b; color:#dee2ec; font-family:'Inter',sans-serif; font-size:13px; }
      h1,h2 { font-family:'Manrope',sans-serif; }
      .mapa-wrap { overflow-x:auto; margin-bottom:24px }
      .mapa-geral { width:100%; border-collapse:collapse; table-layout:fixed }
      .mapa-geral th, .mapa-geral td { padding:5px 4px !important; overflow-wrap:anywhere; word-break:break-word }
      .mapa-geral td:not(:first-child) { white-space:nowrap }
      .mapa-geral tr { break-inside:avoid }
      .mapa-geral thead { display:table-header-group }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @page { size: landscape; margin: 10mm; }
        .doc { max-width:none !important; padding:0 !important }
        .mapa-wrap { overflow:visible }
        .mapa-geral { min-width:0 !important; width:100% !important }
      }
      ${PRINT_SAFE_CSS}
    </style></head><body>
    <div class="doc" style="max-width:1200px;margin:0 auto;padding:40px 36px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #3d4948">
        <div>
          <h1 style="font-size:24px;font-weight:700;color:#6ee9e0;text-transform:uppercase">Relatório Completo de Medições</h1>
          <p style="color:#bcc9c7">${grupo.tipo === 'fornecedor' ? 'Panorama de Pagamentos ao Fornecedor' : 'Panorama de Cobranças ao Cliente'}</p>
        </div>
        <div style="text-align:right">
          ${cfg.logo_url ? `<img src="${cfg.logo_url}" style="height:80px;object-fit:contain;margin-bottom:6px" />` : `<div style="font-size:18px;font-weight:900;color:#6ee9e0">${nomeEmpresa}</div>`}
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
          <span style="font-size:10px;color:#869391;text-transform:uppercase">${grupo.tipo === 'fornecedor' ? 'Fornecedor' : 'Cliente'}</span>
          <p style="font-size:15px;font-weight:700;margin-top:4px">${nomeGrupo}</p>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
        <div style="background:#1b2027;border:1px solid #3d4948;border-radius:12px;padding:16px"><span style="font-size:9px;color:#869391;text-transform:uppercase">${grupo.tipo === 'cliente' ? 'Contrato' : 'Previsto'}</span><p style="font-size:17px;font-weight:700;margin-top:4px">${moeda(previstoGrupo)}</p></div>
        <div style="background:#1b2027;border:1px solid #3d4948;border-radius:12px;padding:16px"><span style="font-size:9px;color:#869391;text-transform:uppercase">${grupo.tipo === 'cliente' ? 'Recebido' : 'Pago'}</span><p style="font-size:17px;font-weight:700;margin-top:4px;color:#6ee9e0">${moeda(pagoGrupo)}</p></div>
        <div style="background:#1b2027;border:1px solid #3d4948;border-radius:12px;padding:16px"><span style="font-size:9px;color:#869391;text-transform:uppercase">Falta ${grupo.tipo === 'cliente' ? 'Receber' : 'Pagar'}</span><p style="font-size:17px;font-weight:700;margin-top:4px;color:#ffb4ab">${moeda(faltaGrupo)}</p></div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <thead>
          <tr style="background:#252a32">
            <th style="padding:8px 10px;text-align:left;font-size:10px;color:#869391;text-transform:uppercase">Medição</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;color:#869391;text-transform:uppercase">Data</th>
            <th style="padding:8px 10px;text-align:right;font-size:10px;color:#869391;text-transform:uppercase">Valor Líquido</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;color:#869391;text-transform:uppercase">Status</th>
          </tr>
        </thead>
        <tbody>${linhasHtml || `<tr><td colspan="4" style="padding:16px;text-align:center;color:#869391">Nenhuma medição registrada</td></tr>`}</tbody>
        <tfoot>
          <tr style="background:#1b2027">
            <td colspan="2" style="padding:10px;font-weight:700">TOTAL MEDIDO ATÉ AQUI</td>
            <td style="padding:10px;text-align:right;font-weight:900;color:#6ee9e0;font-size:15px">${moeda(totalLiquidoGeral)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <h2 style="font-size:16px;font-weight:700;color:#6ee9e0;text-transform:uppercase;margin-bottom:4px">Mapa Geral de Medição</h2>
      <p style="color:#bcc9c7;font-size:11px;margin-bottom:12px">Escopo completo × cada medição × acumulado × saldo, item a item</p>
      <div class="mapa-wrap">
        <table class="mapa-geral" style="min-width:${mapaLarguraMin}px;font-size:${mapaFonte}px">
          ${mapaColgroup}
          <thead>
            <tr style="background:#252a32">
              <th rowspan="2" style="padding:6px 8px;text-align:left;font-size:9px;color:#869391;text-transform:uppercase">Serviço</th>
              <th rowspan="2" style="padding:6px 8px;text-align:center;font-size:9px;color:#869391;text-transform:uppercase">Unid.</th>
              <th rowspan="2" style="padding:6px 8px;text-align:center;font-size:9px;color:#869391;text-transform:uppercase">Qtd</th>
              <th rowspan="2" style="padding:6px 8px;text-align:right;font-size:9px;color:#869391;text-transform:uppercase">Custo Total</th>
              ${mapaCabecalhoMedicoes}
              <th colspan="2" style="padding:6px 8px;text-align:center;font-size:9px;color:#6ee9e0;text-transform:uppercase;border-left:1px solid #3d4948">Acumulado</th>
              <th colspan="2" style="padding:6px 8px;text-align:center;font-size:9px;color:#ffb4ab;text-transform:uppercase;border-left:1px solid #3d4948">Falta</th>
            </tr>
            <tr style="background:#1b2027">
              ${mapaSubcabecalhoMedicoes}
              <th style="padding:4px 8px;text-align:center;font-size:9px;color:#6ee9e0;border-left:1px solid #3d4948">%</th><th style="padding:4px 8px;text-align:center;font-size:9px;color:#6ee9e0">R$</th>
              <th style="padding:4px 8px;text-align:center;font-size:9px;color:#ffb4ab;border-left:1px solid #3d4948">%</th><th style="padding:4px 8px;text-align:center;font-size:9px;color:#ffb4ab">R$</th>
            </tr>
          </thead>
          <tbody>${mapaLinhasHtml || `<tr><td colspan="${8 + mapa.medicoesReais.length * 2}" style="padding:16px;text-align:center;color:#869391">Nenhum item de escopo encontrado para este ${grupo.tipo === 'cliente' ? 'cliente' : 'fornecedor'}</td></tr>`}</tbody>
          <tfoot>
            <tr style="background:#1b2027">
              <td colspan="3" style="padding:8px;font-weight:700">TOTAL GERAL</td>
              <td style="padding:8px;text-align:right;font-weight:700">${moeda(mapa.totalBase)}</td>
              ${mapaRodapeMedicoes}
              <td style="padding:8px;border-left:1px solid #3d4948;text-align:center;font-weight:900;color:#6ee9e0;font-size:12px">${mapa.totalPctAcum.toFixed(0)}%</td>
              <td style="padding:8px;text-align:right;font-weight:900;color:#6ee9e0;font-size:12px">${moeda(mapa.totalAcum)}</td>
              <td style="padding:8px;border-left:1px solid #3d4948;text-align:center;font-weight:900;color:#ffb4ab;font-size:12px">${mapa.totalPctFalta.toFixed(0)}%</td>
              <td style="padding:8px;text-align:right;font-weight:900;color:#ffb4ab;font-size:12px">${moeda(mapa.totalFalta)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      ${temCurvaGrupo ? `
      <div style="background:#1b2027;border:1px solid #3d4948;border-radius:12px;padding:16px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <span style="font-size:10px;color:#6ee9e0;text-transform:uppercase;font-weight:700">Curva S — Físico × Financeiro <span style="color:#869391;font-weight:400">(escala 0–${escalaMaxCurva}%)</span></span>
          <div style="display:flex;gap:12px;font-size:9px;color:#869391">
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:#6ee9e0;margin-right:4px"></span>EXECUTADO (FÍSICO)</span>
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:#ffcbac;margin-right:4px"></span>PAGO (FINANCEIRO)</span>
          </div>
        </div>
        <svg width="100%" height="220" viewBox="0 0 800 300" style="background:#171c23;border-radius:8px">
          <path d="${fisicoPath}" fill="none" stroke="#6ee9e0" stroke-width="3" />
          <path d="${financeiroPath}" fill="none" stroke="#ffcbac" stroke-width="3" stroke-dasharray="8 4" />
        </svg>
        <div style="display:flex;justify-content:space-between;margin-top:6px">
          ${eixoDatasCurva.map(d => `<span style="font-size:9px;color:#869391">${d}</span>`).join('')}
        </div>
      </div>` : `<div style="text-align:center;color:#869391;padding:20px 0;margin-bottom:20px">Dados insuficientes para montar a Curva S — mínimo de 2 medições reais.</div>`}

      ${secaoCronogramaHtml}

      <div style="display:flex;justify-content:space-between;font-size:10px;color:#869391;padding-top:16px;border-top:1px solid #3d4948">
        <span>Documento Confidencial - ${nomeEmpresa}</span>
        <span>${obra?.codigo || ''}</span>
      </div>
    </div>
    <script>window.onload = () => { window.print() }</script>
    </body></html>`

    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  async function gerarPDFCronograma(obra: any, linhas: LinhaCronograma[]) {
    const cfg = (await buscar('empresa_config', '?limit=1'))[0] || {}
    const nomeEmpresa = cfg.nome_empresa || 'VIGA'
    const hojeStr = hojeISO()
    const agrupar = linhas.some(l => !!l.categoria) && modoEfetivoCronograma(obra, etapas.filter(e => e.obra_id === obra.id)) !== 'zero'

    const linhasHtml = linhas.map((l, idx) => {
      const etapa = l.et
      const categoriaAtual = l.categoria || 'Outros'
      const categoriaAnterior = idx > 0 ? (linhas[idx - 1].categoria || 'Outros') : null
      const headerCategoria = agrupar && categoriaAtual !== categoriaAnterior
        ? `<tr><td colspan="5" style="padding:6px 10px;background:#1b2027;color:#6ee9e0;font-weight:700;font-size:11px;text-transform:uppercase">${categoriaAtual}</td></tr>`
        : ''
      const statusV = statusVisualEtapa(etapa, hojeStr)
      return `${headerCategoria}<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948">${l.nome}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;color:#bcc9c7">${l.fornecedor || '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:center">${etapa?.data_inicio_prevista ? dataBR(etapa.data_inicio_prevista) : '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:center">${etapa?.data_fim_prevista ? dataBR(etapa.data_fim_prevista) : '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:center">${ETAPA_STATUS[statusV] || '—'}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Cronograma ${obra.codigo} — ${nomeEmpresa}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { background:#0f141b; color:#dee2ec; font-family:'Inter',sans-serif; font-size:13px; }
      h1,h2 { font-family:'Manrope',sans-serif; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      ${PRINT_SAFE_CSS}
    </style></head><body>
    <div style="max-width:900px;margin:0 auto;padding:40px 36px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #3d4948">
        <div>
          <h1 style="font-size:24px;font-weight:700;color:#6ee9e0;text-transform:uppercase">Cronograma da Obra</h1>
          <p style="color:#bcc9c7">Serviços, datas previstas e status</p>
        </div>
        <div style="text-align:right">
          ${cfg.logo_url ? `<img src="${cfg.logo_url}" style="height:80px;object-fit:contain;margin-bottom:6px" />` : `<div style="font-size:18px;font-weight:900;color:#6ee9e0">${nomeEmpresa}</div>`}
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
      ${obra.data_inicio && obra.data_previsao ? htmlGantt(new Date(obra.data_inicio + 'T00:00:00'), new Date(obra.data_previsao + 'T00:00:00'), linhas.map(l => ({ nome: l.nome, fornecedor: l.fornecedor, inicioPrevisto: l.et.data_inicio_prevista, fimPrevisto: l.et.data_fim_prevista, status: statusVisualEtapa(l.et, hojeStr) }))) : ''}
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

  // Relatório de Visita em PDF — pensado pra mandar direto pro cliente sempre que uma visita
  // técnica é registrada (mesmo padrão visual dos demais relatórios da obra).
  async function gerarPDFRelatorioVisita(obra: any, visita: any) {
    const cfg = (await buscar('empresa_config', '?limit=1'))[0] || {}
    const nomeEmpresa = cfg.nome_empresa || 'VIGA'
    const climaLabel = CLIMA_OPCOES.find(c => c.v === visita.clima)?.l || visita.clima || '—'
    const fotos: { url: string; descricao: string }[] = Array.isArray(visita.fotos) ? visita.fotos : []

    const equipeHtml = (visita.equipe_presente || []).length
      ? (visita.equipe_presente as string[]).map((n: string) => `<span style="display:inline-block;background:#1b2027;border:1px solid #3d4948;border-radius:999px;padding:4px 12px;font-size:11px;margin:0 6px 6px 0">${n}</span>`).join('')
      : '<span style="color:#869391;font-size:12px">Nenhum nome registrado</span>'

    const fotosHtml = fotos.length
      ? fotos.map((f, i) => `
        <div style="background:#1b2027;border:1px solid #3d4948;border-radius:12px;overflow:hidden;margin-bottom:16px;break-inside:avoid">
          <img src="${f.url}" style="width:100%;max-height:420px;object-fit:cover;display:block" />
          <div style="padding:10px 14px">
            <span style="font-size:10px;color:#6ee9e0;font-weight:700">FOTO ${i + 1}</span>
            <p style="font-size:12px;color:#bcc9c7;margin-top:2px">${f.descricao || 'Sem descrição'}</p>
          </div>
        </div>`).join('')
      : '<p style="color:#869391;text-align:center;padding:20px 0">Nenhuma foto anexada</p>'

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Relatório de Visita — ${dataBR(visita.data)} — ${nomeEmpresa}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { background:#0f141b; color:#dee2ec; font-family:'Inter',sans-serif; font-size:13px; }
      h1,h2 { font-family:'Manrope',sans-serif; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      ${PRINT_SAFE_CSS}
    </style></head><body>
    <div style="max-width:900px;margin:0 auto;padding:40px 36px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #3d4948">
        <div>
          <h1 style="font-size:24px;font-weight:700;color:#6ee9e0;text-transform:uppercase">Relatório de Visita Técnica</h1>
          <p style="color:#bcc9c7">${climaLabel}</p>
        </div>
        <div style="text-align:right">
          ${cfg.logo_url ? `<img src="${cfg.logo_url}" style="height:80px;object-fit:contain;margin-bottom:6px" />` : `<div style="font-size:18px;font-weight:900;color:#6ee9e0">${nomeEmpresa}</div>`}
          <p style="font-size:10px;color:#869391">Data da visita: ${dataBR(visita.data)}</p>
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
          <span style="font-size:10px;color:#869391;text-transform:uppercase">Equipe presente</span>
          <div style="margin-top:8px">${equipeHtml}</div>
        </div>
      </div>
      <div style="background:#1b2027;border:1px solid #3d4948;border-radius:12px;padding:16px;margin-bottom:16px">
        <span style="font-size:10px;color:#6ee9e0;text-transform:uppercase;font-weight:700">Atividades / Descrição da Visita</span>
        <p style="margin-top:8px;line-height:1.6;white-space:pre-wrap">${visita.descricao || '—'}</p>
      </div>
      ${visita.pendencias ? `<div style="background:#1b2027;border:1px solid #ffcbac4d;border-radius:12px;padding:16px;margin-bottom:20px">
        <span style="font-size:10px;color:#ffcbac;text-transform:uppercase;font-weight:700">⚠ Pendências / Próximos Passos</span>
        <p style="margin-top:8px;line-height:1.6;white-space:pre-wrap">${visita.pendencias}</p>
      </div>` : ''}
      <div style="margin-bottom:12px">
        <span style="font-size:10px;color:#6ee9e0;text-transform:uppercase;font-weight:700">Registro Fotográfico</span>
      </div>
      ${fotosHtml}
      <div style="display:flex;justify-content:space-between;margin-top:32px;padding-top:16px;border-top:1px solid #3d4948;font-size:9px;color:#869391;text-transform:uppercase">
        <span>Documento gerado por ${nomeEmpresa}</span>
        <span>${dataBR(visita.data)}</span>
      </div>
    </div>
    <script>window.onload = () => { window.print() }</script>
    </body></html>`

    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  function obraAtrasada(obra: any) {
    return !!(obra.data_previsao && new Date(obra.data_previsao) < new Date() && obra.status === 'em_execucao')
  }

  async function gerarPDFObra(obra: any, observacoesTexto: string) {
    const cfg = (await buscar('empresa_config', '?limit=1'))[0] || {}
    const nomeEmpresa = cfg.nome_empresa || 'VIGA'
    const custos = custosObra(obra.id)
    const receitas = receitasObra(obra.id)
    const contrato = parseFloat(obra.valor_contrato || 0)
    // Gerenciamento: o custo do fornecedor é do cliente, não da Inverso — margem = receita
    // da taxa de gerenciamento, sem subtrair um custo que não é dela (mesma lógica da tela).
    const margem = obra.gerenciamento ? receitas : receitas - custos
    const margemPrevistaPct = contrato > 0 ? (obra.gerenciamento ? (receitas / contrato) * 100 : ((contrato - custos) / contrato) * 100) : 0

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
      // classifica pelo acumulado ANTES deste item, para o item que cruza o limite ainda
      // contar na classe que ele está completando (senão o maior item isolado viraria "C")
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
      ? htmlGantt(inicio, fim, ordenarLinhasCronograma(montarLinhasCronograma(etapasObra, svsObra, orcItens), modoEfetivoCronograma(obra, etapasObra), ordemCategoria).linhas.map(l => (
          { nome: l.nome, fornecedor: l.fornecedor, inicioPrevisto: l.et.data_inicio_prevista, fimPrevisto: l.et.data_fim_prevista, status: statusVisualEtapa(l.et) }
        )))
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
      ${PRINT_SAFE_CSS}
    </style></head><body>

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
            <div><span style="font-size:9px;color:#869391;text-transform:uppercase;display:block">Cliente</span><span style="font-size:14px;font-weight:600">${obra.cliente}${obra.contato_nome ? ' <span style="font-weight:400;color:#bcc9c7;font-size:12px">(A/C ' + obra.contato_nome + ')</span>' : ''}</span></div>
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

  // ── cálculos ──────────────────────────────────────────────
  // Base "viva" pra medição: mão de obra mede em cima do custo de mão de obra do serviço
  // (não do valor cobrado do cliente); cliente mede em cima do valor cobrado. Cai pro valor
  // cobrado se o serviço ainda não tem o custo de mão de obra preenchido (dado antigo/manual).
  function baseParaMedicao(item: any, tipo: string) {
    if (tipo === 'fornecedor') {
      const mo = parseFloat(item.valor_mao_obra_previsto || 0)
      return mo > 0 ? mo : parseFloat(item.valor_previsto || 0)
    }
    return parseFloat(item.valor_previsto || 0)
  }
  // Custo "vivo" de mão de obra de um serviço: maior valor entre lançamentos/gastos com
  // categoria diferente de Material vinculados a ele e a última medição de fornecedor
  // registrada nele.
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
  // Custo "vivo" de material de um serviço: soma dos lançamentos/gastos com categoria
  // Material vinculados a ele (compras de material descontam direto daqui, sem medição).
  function custoMaterialServicoAuto(servico: any) {
    const vrLanc = lancs.filter(l => l.servico_id === servico.id && l.tipo === 'saida' && l.categoria === 'Material').reduce((a, l) => a + parseFloat(l.valor || 0), 0)
    const vrGasto = gastos.filter(g => g.servico_id === servico.id && g.categoria === 'Material').reduce((a, g) => a + parseFloat(g.valor || 0), 0)
    return vrLanc + vrGasto
  }
  // Custo "vivo" total de um serviço: mão de obra + material; cai para o valor manual só
  // se nada disso existir.
  function custoServicoAuto(servico: any) {
    const vrAuto = custoMaoObraServicoAuto(servico) + custoMaterialServicoAuto(servico)
    return vrAuto > 0 ? vrAuto : parseFloat(servico.valor_realizado || 0)
  }
  // Valor "vivo" cobrado do cliente num serviço: última medição de cliente registrada nele.
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
    const semMedicao = lancs.filter(x => x.obra_id === id && x.tipo === 'entrada' && x.status === 'pago' && !idsLancDeMedicao.has(x.id)).reduce((a, x) => a + parseFloat(x.valor || 0), 0)
    return porServico + semMedicao
  }
  function servicosObra(id: string) { return servicos.filter(s => s.obra_id === id) }
  function totalPrevisto(id: string) { return servicosObra(id).reduce((a, s) => a + parseFloat(s.valor_previsto || 0), 0) }
  function totalRealizado(id: string) { return servicosObra(id).reduce((a, s) => a + custoServicoAuto(s), 0) }

  // Apaga a obra inteira. obra_servicos/cronograma_etapas/medicoes/medicao_itens/
  // obra_funcionarios/obra_funcionario_arquivos/obra_relatorios_visita/obra_atribuicoes já têm
  // "on delete cascade" no banco; orcamentos vinculados só perdem o vínculo (obra_id vira null).
  // lancamentos e gastos_cartao NÃO têm cascade (de propósito, são registros financeiros) — por
  // isso o delete direto da obra falhava em silêncio sempre que havia algum lançamento ou gasto
  // de cartão vinculado. Apagamos os dois explicitamente antes, e checamos o resultado final.
  async function excluirObra(obra: any) {
    if (!confirm(`Excluir a obra ${obra.codigo}? Isso apaga também os lançamentos e gastos de cartão vinculados a ela. Esta ação não pode ser desfeita.`)) return
    await fetch(BASE + '/lancamentos?obra_id=eq.' + obra.id, { method: 'DELETE', headers: HDR })
    await fetch(BASE + '/gastos_cartao?obra_id=eq.' + obra.id, { method: 'DELETE', headers: HDR })
    const r = await fetch(BASE + '/obras?id=eq.' + obra.id, { method: 'DELETE', headers: HDR })
    if (!r.ok) {
      const errText = await r.text()
      alert('Não foi possível excluir a obra: ' + errText.slice(0, 300))
      return
    }
    setDetalhe(null)
    carregar()
  }

  // ── salvar obra ───────────────────────────────────────────
  // Distribui os obra_servicos (ordenados por `ordem`) em fatias sequenciais dentro do
  // periodo data_inicio..data_previsao da obra, gerando/atualizando uma cronograma_etapas por
  // servico. forceAll=true recalcula tudo (usado ao reordenar); por padrao so preenche etapas
  // que ainda nao existem, sem mexer em datas ja editadas manualmente.
  async function distribuirCronograma(obraId: string, forceAll: boolean = false) {
    const obraRows = await buscar('obras', '?id=eq.' + obraId)
    const obra = obraRows[0]
    if (!obra?.data_inicio || !obra?.data_previsao) return
    const svsObra = (await buscar('obra_servicos', '?obra_id=eq.' + obraId))
      .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
    if (svsObra.length === 0) return
    const etapasAtuais = await buscar('cronograma_etapas', '?obra_id=eq.' + obraId)
    // Só distribui automaticamente no modo "a partir dos serviços" (explícito, ou deduzido de
    // obras antigas que já tinham etapas por serviço). Nos demais modos o cronograma é montado à mão.
    if (modoEfetivoCronograma(obra, etapasAtuais) !== 'servicos') return
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
      const dados = {
        obra_id: obraId,
        servico_id: s.id,
        data_inicio_prevista: dIni.toISOString().slice(0, 10),
        data_fim_prevista: dFim.toISOString().slice(0, 10),
      }
      if (existente) await editar('cronograma_etapas', existente.id, dados)
      else await criar('cronograma_etapas', { ...dados, status: 'pendente' })
    }
    const et = await buscar('cronograma_etapas', '?order=created_at')
    setEtapas(et)
  }

  // ── Campo Cliente: login do cliente no portal (rotas de servidor /api/cliente/acessos) ──
  async function apiAcessosCliente(metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE', opts: { query?: string; body?: any } = {}) {
    try {
      const token = await obterTokenValido()
      if (!token) return { ok: false as const, erro: 'Sua sessão expirou. Saia e entre novamente no VIGA.' }
      const r = await fetch('/api/cliente/acessos' + (opts.query || ''), {
        method: metodo,
        headers: { Authorization: 'Bearer ' + token, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) return { ok: false as const, erro: j.error || `Não foi possível concluir (erro ${r.status}). Tente novamente.` }
      return { ok: true as const, dados: j }
    } catch { return { ok: false as const, erro: 'Falha de conexão com o servidor' } }
  }

  async function carregarAcessosCliente(obraId: string) {
    setCarregandoAcessos(true)
    const r = await apiAcessosCliente('GET', { query: '?obra_id=' + obraId })
    if (r.ok) { setAcessosCliente(r.dados.acessos || []); setMsgAcesso('') }
    else { setAcessosCliente([]); setMsgAcesso(r.erro) }
    setCarregandoAcessos(false)
  }

  function abrirCampoCliente() {
    if (!detalhe) return
    setFAcessos([{ nome: detalhe.cliente || '', email: '', senha: '' }])
    setAcessosCriados([]); setRedefinindoAcesso(null); setMsgAcesso('')
    setJanela('campo_cliente')
    carregarAcessosCliente(detalhe.id)
  }

  function gerarSenhaAleatoria() {
    const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
    const arr = new Uint32Array(10)
    crypto.getRandomValues(arr)
    return Array.from(arr, n => letras[n % letras.length]).join('')
  }

  function atualizarLinhaAcesso(i: number, campos: Partial<{ nome: string; email: string; senha: string }>) {
    setFAcessos(linhas => linhas.map((l, idx) => idx === i ? { ...l, ...campos } : l))
  }
  function adicionarLinhaAcesso() {
    setFAcessos(linhas => [...linhas, { nome: '', email: '', senha: '' }])
  }
  function removerLinhaAcesso(i: number) {
    setFAcessos(linhas => linhas.length > 1 ? linhas.filter((_, idx) => idx !== i) : linhas)
  }

  // Cria todos os acessos preenchidos de uma vez; os que falham ficam no formulário com o motivo.
  async function criarAcessosCliente() {
    if (!detalhe || salvandoAcessos) return
    const linhas = fAcessos.map(l => ({ nome: l.nome.trim(), email: l.email.trim().toLowerCase(), senha: l.senha }))
    const validas = linhas.filter(l => l.email || l.senha)
    if (validas.length === 0) return setMsgAcesso('Preencha e-mail e senha do cliente.')
    const emails = new Set<string>()
    for (const l of validas) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email)) return setMsgAcesso('E-mail inválido: "' + (l.email || '(vazio)') + '". Confira o endereço.')
      if (l.senha.length < 8) return setMsgAcesso('A senha de ' + l.email + ' precisa ter pelo menos 8 caracteres (use o botão Gerar para criar uma segura).')
      if (emails.has(l.email)) return setMsgAcesso('O e-mail ' + l.email + ' aparece mais de uma vez na lista.')
      emails.add(l.email)
    }
    setSalvandoAcessos(true); setMsgAcesso('')
    const criados: { email: string; senha: string }[] = []
    const falhas: { linha: { nome: string; email: string; senha: string }; erro: string }[] = []
    for (const l of validas) {
      const r = await apiAcessosCliente('POST', { body: { obra_id: detalhe.id, nome: l.nome, email: l.email, senha: l.senha } })
      if (r.ok) criados.push({ email: l.email, senha: l.senha })
      else falhas.push({ linha: l, erro: r.erro })
    }
    setSalvandoAcessos(false)
    if (criados.length) setAcessosCriados(anteriores => [...anteriores, ...criados])
    // recarrega a lista ANTES de mostrar o erro (a recarga limpa a mensagem)
    if (criados.length) await carregarAcessosCliente(detalhe.id)
    if (falhas.length) {
      setFAcessos(falhas.map(f => f.linha))
      setMsgAcesso(falhas.map(f => f.linha.email + ': ' + f.erro).join(' | '))
    } else {
      setFAcessos([{ nome: detalhe.cliente || '', email: '', senha: '' }])
    }
  }

  async function alternarAcessoCliente(a: any) {
    const r = await apiAcessosCliente('PATCH', { body: { id: a.id, ativo: !a.ativo } })
    if (!r.ok) return setMsgAcesso(r.erro)
    carregarAcessosCliente(detalhe.id)
  }

  async function confirmarNovaSenhaCliente() {
    if (!redefinindoAcesso) return
    const r = await apiAcessosCliente('PATCH', { body: { id: redefinindoAcesso.id, senha: redefinindoAcesso.senha } })
    if (!r.ok) return setMsgAcesso(r.erro)
    const a = acessosCliente.find(x => x.id === redefinindoAcesso.id)
    setAcessosCriados([{ email: a?.email || '', senha: redefinindoAcesso.senha }])
    setRedefinindoAcesso(null); setMsgAcesso('')
  }

  async function removerAcessoCliente(a: any) {
    if (!confirm(`Remover o acesso de ${a.email}? O cliente não conseguirá mais entrar no portal.`)) return
    const r = await apiAcessosCliente('DELETE', { query: '?id=' + a.id })
    if (!r.ok) return setMsgAcesso(r.erro)
    carregarAcessosCliente(detalhe.id)
  }

  // ── Cronograma: modos de montagem, etapas manuais e histórico de alterações ──────────
  async function atualizarObraLocal(obraId: string, dados: any) {
    setObras(prev => prev.map(o => o.id === obraId ? { ...o, ...dados } : o))
    setDetalhe((d: any) => d && d.id === obraId ? { ...d, ...dados } : d)
  }

  async function recarregarEtapas() {
    setEtapas(await buscar('cronograma_etapas', '?order=created_at'))
  }

  async function escolherModoCronograma(obra: any, modo: ModoCronograma) {
    if (modo === 'orcamento') {
      const orc = orcamentos.find(o => o.obra_id === obra.id)
      if (!orc) return alert('Esta obra não tem orçamento vinculado. Vincule um orçamento a esta obra (módulo Orçamento) para montar o cronograma a partir dele.')
      if (orcItens.filter(i => i.orcamento_id === orc.id).length === 0) return alert('O orçamento vinculado ainda não tem itens.')
    }
    if (modo === 'servicos' && servicosObra(obra.id).length === 0) return alert('Cadastre ao menos um serviço na aba "Serviços" antes de montar o cronograma a partir deles.')
    const ok = await editar('obras', obra.id, { cronograma_modo: modo })
    if (!ok) return alert('Não foi possível salvar o modo do cronograma. Tente novamente.')
    atualizarObraLocal(obra.id, { cronograma_modo: modo })
    if (modo === 'servicos') {
      if (!obra.data_inicio || !obra.data_previsao) alert('Informe as datas de início e fim da obra (✏️ Editar) para o sistema distribuir os serviços automaticamente.')
      else await distribuirCronograma(obra.id)
    }
    if (modo === 'orcamento') await importarItensOrcamentoCronograma({ ...obra, cronograma_modo: modo })
  }

  // Cria uma etapa por item do orçamento vinculado que ainda não está no cronograma, com datas
  // sequenciais calculadas pelo tempo de execução de cada item (dias de trabalho da obra).
  async function importarItensOrcamentoCronograma(obra: any) {
    const orc = orcamentos.find(o => o.obra_id === obra.id)
    if (!orc) return alert('Esta obra não tem orçamento vinculado.')
    const itens = orcItens
      .filter(i => i.orcamento_id === orc.id)
      .sort((a, b) => ordemCategoria(a.categoria) - ordemCategoria(b.categoria) || String(a.created_at).localeCompare(String(b.created_at)))
    const atuais = await buscar('cronograma_etapas', '?obra_id=eq.' + obra.id)
    const jaTem = new Set(atuais.map((e: any) => e.orcamento_item_id).filter(Boolean))
    const novos = itens.filter(i => !jaTem.has(i.id))
    if (novos.length === 0) return alert('Todos os itens do orçamento já estão no cronograma.')
    const ultimoFim = atuais.map((e: any) => e.data_fim_prevista).filter(Boolean).sort().pop()
    let inicioISO = obra.data_inicio || hojeISO()
    if (ultimoFim && atuais.length > 0) { const d = new Date(ultimoFim + 'T00:00:00'); d.setDate(d.getDate() + 1); inicioISO = dataParaISO(d) }
    const calculado = calcularDatasOrcamento(novos, inicioISO, obra.dias_trabalho || 'seg_sex', bancoItens)
    let ordem = Math.max(0, ...atuais.map((e: any) => e.ordem || 0))
    for (const { item, inicio, fim } of calculado) {
      await criar('cronograma_etapas', {
        obra_id: obra.id, orcamento_item_id: item.id, nome: item.servico, categoria: item.categoria || null,
        data_inicio_prevista: inicio, data_fim_prevista: fim, status: 'pendente', ordem: ++ordem,
      })
    }
    const ultimaData = calculado[calculado.length - 1].fim
    const dadosObra: any = {}
    if (!obra.data_inicio) dadosObra.data_inicio = inicioISO
    if (!obra.data_previsao) dadosObra.data_previsao = ultimaData
    if (Object.keys(dadosObra).length) { await editar('obras', obra.id, dadosObra); atualizarObraLocal(obra.id, dadosObra) }
    await recarregarEtapas()
  }

  async function trocarModoCronograma(obra: any) {
    const qtd = etapas.filter(e => e.obra_id === obra.id).length
    if (!confirm(`Trocar o modo de montagem apaga as ${qtd} etapa(s) atual(is) do cronograma e o histórico de alterações de datas (os serviços e o orçamento não são afetados). Continuar?`)) return
    await fetch(BASE + '/cronograma_etapas?obra_id=eq.' + obra.id, { method: 'DELETE', headers: HDR })
    const ok = await editar('obras', obra.id, { cronograma_modo: null })
    if (!ok) return alert('Não foi possível trocar o modo. Tente novamente.')
    atualizarObraLocal(obra.id, { cronograma_modo: null })
    await recarregarEtapas()
    setCronHistorico(await buscar('cronograma_historico', '?order=created_at.desc'))
  }

  function abrirNovaEtapa() {
    setFEtapa({ nome: '', categoria: '', fornecedor: '', inicio: '', fim: '' })
    setJanela('nova_etapa')
  }

  async function salvarNovaEtapa() {
    if (!detalhe) return
    if (!fEtapa.nome.trim()) return alert('Informe o nome da etapa')
    if (fEtapa.inicio && fEtapa.fim && fEtapa.fim < fEtapa.inicio) return alert('A data final não pode ser anterior à data inicial')
    const maxOrdem = Math.max(0, ...etapas.filter(e => e.obra_id === detalhe.id).map(e => e.ordem || 0))
    const nova = await criar('cronograma_etapas', {
      obra_id: detalhe.id, nome: fEtapa.nome.trim(), categoria: fEtapa.categoria || null, fornecedor: fEtapa.fornecedor.trim() || null,
      data_inicio_prevista: fEtapa.inicio || null, data_fim_prevista: fEtapa.fim || null, status: 'pendente', ordem: maxOrdem + 1,
    })
    if (!nova?.id) return alert('Não foi possível criar a etapa. Tente novamente.')
    // Etapa criada com a obra ainda sem modo definido: assume "do zero".
    if (!detalhe.cronograma_modo) {
      await editar('obras', detalhe.id, { cronograma_modo: 'zero' })
      atualizarObraLocal(detalhe.id, { cronograma_modo: 'zero' })
    }
    setJanela(null)
    await recarregarEtapas()
  }

  async function excluirEtapaCronograma(linha: LinhaCronograma) {
    if (linha.origem === 'servico') return
    if (!confirm(`Remover a etapa "${linha.nome}" do cronograma?${linha.origem === 'orcamento' ? ' (o item continua no orçamento)' : ''}`)) return
    await remover('cronograma_etapas', linha.et.id)
    await recarregarEtapas()
  }

  async function renomearEtapaCronograma(et: any, nome: string) {
    const novo = nome.trim()
    if (!novo || novo === et.nome) return
    const ok = await editar('cronograma_etapas', et.id, { nome: novo })
    if (!ok) return alert('Não foi possível renomear a etapa.')
    setEtapas(prev => prev.map(x => x.id === et.id ? { ...x, nome: novo } : x))
  }

  async function aplicarAlteracaoEtapa(et: any, patch: any, registro?: { tipo: string; motivo: string }): Promise<boolean> {
    const ok = await editar('cronograma_etapas', et.id, patch)
    if (!ok) { alert('Não foi possível salvar a alteração da etapa. Tente novamente.'); return false }
    if (registro) {
      const novo = await criar('cronograma_historico', {
        etapa_id: et.id, obra_id: et.obra_id, tipo: registro.tipo, motivo: registro.motivo || null,
        inicio_anterior: et.data_inicio_prevista || null, fim_anterior: et.data_fim_prevista || null,
        inicio_novo: ('data_inicio_prevista' in patch ? patch.data_inicio_prevista : et.data_inicio_prevista) || null,
        fim_novo: ('data_fim_prevista' in patch ? patch.data_fim_prevista : et.data_fim_prevista) || null,
        status_anterior: et.status || null, status_novo: ('status' in patch ? patch.status : et.status) || null,
        usuario_email: userEmail || localStorage.getItem('viga_email') || null,
      })
      if (novo?.id) setCronHistorico(prev => [novo, ...prev])
      else alert('A etapa foi alterada, mas o registro no histórico falhou.')
    }
    setEtapas(prev => prev.map(x => x.id === et.id ? { ...x, ...patch } : x))
    return true
  }

  // Alterar data já definida ou marcar como atrasada exige justificativa (vai pro histórico);
  // definir a data pela primeira vez ou avançar o status é direto.
  function solicitarAlteracaoEtapa(linha: LinhaCronograma, patch: any) {
    const et = linha.et
    const mudaDataExistente = (['data_inicio_prevista', 'data_fim_prevista'] as const).some(k => k in patch && et[k] && (patch[k] || null) !== et[k])
    const viraAtrasada = patch.status === 'atrasada' && et.status !== 'atrasada'
    if (!mudaDataExistente && !viraAtrasada) { aplicarAlteracaoEtapa(et, patch); return }
    const jaAtrasada = statusVisualEtapa(et) === 'atrasada'
    const obraIniciada = !!detalhe?.data_inicio && detalhe.data_inicio <= hojeISO()
    const tipo = viraAtrasada || jaAtrasada ? 'atraso' : obraIniciada ? 'reprogramacao' : 'ajuste'
    setAlteracaoCron({ et, nome: linha.nome, patch, tipo, motivo: '' })
    setJanela('alterar_etapa')
  }

  async function confirmarAlteracaoEtapa() {
    if (!alteracaoCron) return
    if (alteracaoCron.tipo !== 'ajuste' && !alteracaoCron.motivo.trim()) return alert('Informe o motivo da alteração — ele fica registrado no histórico da etapa.')
    const ok = await aplicarAlteracaoEtapa(alteracaoCron.et, alteracaoCron.patch, { tipo: alteracaoCron.tipo, motivo: alteracaoCron.motivo.trim() })
    if (!ok) return
    setJanela(null)
    setAlteracaoCron(null)
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

  async function salvarObra() {
    if (!fObra.codigo || !fObra.nome || !fObra.cliente) {
      alert('Preencha código, nome e cliente')
      return
    }
    // Obra NOVA = contrato fechado: registra o cliente na Agenda de Clientes e o lead no Pipeline
    // (cliente novo ou da carteira) já na etapa "Fechado Ganho".
    let crm: { leadId: string | null; clienteId: string | null; nomeCliente: string | null; contatoId: string | null; contatoNome: string | null } | null = { leadId: null, clienteId: null, nomeCliente: null, contatoId: null, contatoNome: null }
    if (!obraEditando) {
      const erroCrm = validarClienteCrm(clienteCrm, fObra.cliente)
      if (erroCrm) return alert(erroCrm)
      const meuIdCrm = usuarios.find(u => u.email && userEmail && u.email.toLowerCase() === userEmail.toLowerCase())?.id || null
      crm = await registrarClienteNoCrmInterativo(clienteCrm, {
        origem: 'obra', rotulo: 'Obra ' + fObra.codigo.trim().toUpperCase(), nome: fObra.cliente,
        endereco: fObra.endereco, responsavelId: meuIdCrm,
      })
      if (!crm) return
    }
    const dados: any = {
      codigo: fObra.codigo.trim().toUpperCase(),
      nome: fObra.nome.trim(),
      tipo: fObra.tipo,
      tipo_execucao: fObra.tipo_execucao,
      cliente: (crm?.nomeCliente || fObra.cliente).trim(),
      endereco: fObra.endereco.trim(),
      responsavel: fObra.responsavel.trim(),
      status: fObra.status,
      data_inicio: fObra.data_inicio || null,
      data_previsao: fObra.data_previsao || null,
      valor_contrato: parseFloat(fObra.valor_contrato || '0'),
      dias_trabalho: fObra.dias_trabalho || 'seg_sex',
      gerenciamento: !!fObra.gerenciamento,
    }
    let obraId = obraEditando?.id
    if (obraEditando) {
      const ok = await editar('obras', obraEditando.id, dados)
      if (!ok) return alert('Não foi possível salvar as alterações. Tente novamente.')
      if (detalhe?.id === obraEditando.id) {
        setDetalhe({ ...detalhe, ...dados })
      }
    } else {
      if (crm?.clienteId) dados.cliente_id = crm.clienteId
      if (crm?.contatoId) dados.contato_id = crm.contatoId
      if (crm?.contatoNome) dados.contato_nome = crm.contatoNome
      const nova = await criar('obras', dados)
      obraId = nova?.id
      if (obraId) await vincularLeadAoRegistro(crm?.leadId || null, { obra_id: obraId })
    }
    setJanela(null)
    setObraEditando(null)
    setClienteCrm(CLIENTE_CRM_VAZIO)
    await carregar()
    if (obraId) await distribuirCronograma(obraId)
  }

  // ── salvar serviço ────────────────────────────────────────
  async function salvarServico() {
    if (!fServ.nome.trim()) { alert('Preencha o nome do serviço'); return }
    if (!detalhe) return
    const dados = {
      obra_id: detalhe.id,
      nome: fServ.nome.trim(),
      categoria: fServ.categoria || null,
      unidade: fServ.unidade,
      quantidade: parseFloat(fServ.quantidade || '1'),
      valor_previsto: parseFloat(fServ.valor_previsto || '0'),
      valor_realizado: parseFloat(fServ.valor_realizado || '0'),
      valor_mao_obra_previsto: parseFloat(fServ.valor_mao_obra_previsto || '0'),
      valor_material_previsto: parseFloat(fServ.valor_material_previsto || '0'),
      status: fServ.status,
      observacao: fServ.observacao.trim(),
      fornecedor: fServ.fornecedor.trim() || null,
    }
    if (servicoEditando) {
      await editar('obra_servicos', servicoEditando.id, dados)
    } else {
      const maxOrdem = Math.max(0, ...servicosObra(detalhe.id).map(s => s.ordem || 0))
      await criar('obra_servicos', { ...dados, ordem: maxOrdem + 1 })
    }
    setJanela(null)
    setServicoEditando(null)
    await carregar()
    await distribuirCronograma(detalhe.id)
  }

  function abrirNovaObra() {
    setClienteCrm(CLIENTE_CRM_VAZIO)
    setFObra({ codigo: gerarCodigo(obras), nome: '', tipo: 'Reforma', tipo_execucao: 'obra', cliente: '', endereco: '', responsavel: '', status: 'em_execucao', data_inicio: '', data_previsao: '', valor_contrato: '', dias_trabalho: 'seg_sex', gerenciamento: false })
    setObraEditando(null)
    setJanela('nova_obra')
  }

  function abrirEditarObra(obra: any) {
    setFObra({
      codigo: obra.codigo || '', nome: obra.nome || '', tipo: obra.tipo || 'Reforma',
      tipo_execucao: obra.tipo_execucao || 'obra',
      cliente: obra.cliente || '', endereco: obra.endereco || '',
      responsavel: obra.responsavel || '', status: obra.status || 'em_execucao',
      data_inicio: obra.data_inicio || '', data_previsao: obra.data_previsao || '',
      valor_contrato: obra.valor_contrato != null ? String(obra.valor_contrato) : '',
      dias_trabalho: obra.dias_trabalho || 'seg_sex',
      gerenciamento: !!obra.gerenciamento,
    })
    setObraEditando(obra)
    setJanela('editar_obra')
  }

  function abrirNovoServico() {
    setFServ({ nome: '', categoria: '', unidade: 'm²', quantidade: '1', valor_previsto: '', valor_realizado: '', valor_mao_obra_previsto: '', valor_material_previsto: '', status: 'pendente', observacao: '', fornecedor: '' })
    setServicoEditando(null)
    setJanela('novo_servico')
  }

  function abrirEditarServico(sv: any) {
    setFServ({
      nome: sv.nome || '',
      categoria: sv.categoria || '',
      unidade: sv.unidade || 'm²',
      quantidade: sv.quantidade != null ? String(sv.quantidade) : '1',
      valor_previsto: sv.valor_previsto != null ? String(sv.valor_previsto) : '',
      valor_realizado: sv.valor_realizado != null ? String(sv.valor_realizado) : '',
      valor_mao_obra_previsto: sv.valor_mao_obra_previsto != null ? String(sv.valor_mao_obra_previsto) : '',
      valor_material_previsto: sv.valor_material_previsto != null ? String(sv.valor_material_previsto) : '',
      status: sv.status || 'pendente',
      observacao: sv.observacao || '',
      fornecedor: sv.fornecedor || '',
    })
    setServicoEditando(sv)
    setJanela('editar_servico')
  }

  const listaFiltrada = obras.filter(o => {
    const matchStatus = filtro === 'todos' || o.status === filtro
    const matchExecucao = filtroExecucao === 'todos' || (o.tipo_execucao || 'obra') === filtroExecucao
    const matchBusca = !busca || [o.nome, o.cliente, o.codigo]
      .some(v => v?.toLowerCase().includes(busca.toLowerCase()))
    return matchStatus && matchExecucao && matchBusca
  })

  // ── LOADING ───────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-primary text-lg">Carregando obras...</div>
    </div>
  )

  // ── DETALHE DA OBRA ───────────────────────────────────────
  if (detalhe) {
    const custos    = custosObra(detalhe.id)
    const receitas  = receitasObra(detalhe.id)
    const contrato  = parseFloat(detalhe.valor_contrato || 0)
    const prevTotal = totalPrevisto(detalhe.id)
    const realTotal = totalRealizado(detalhe.id)
    const svs       = ordenarServicosObra(servicosObra(detalhe.id))
    const lancD     = lancs.filter(l => l.obra_id === detalhe.id)
    const gastD     = gastos.filter(g => g.obra_id === detalhe.id)
    // Numa obra de Gerenciamento, o custo do fornecedor é do cliente, não da Inverso — a
    // margem/lucro da empresa nessa obra é só a taxa de gerenciamento recebida (receitas),
    // sem subtrair um custo que não é dela; e "consumo do contrato" passa a comparar quanto
    // da taxa já foi cobrada, não o custo repassado (que pode superar o próprio contrato de
    // gerenciamento sem que isso signifique nada de errado).
    const pctCont   = detalhe.gerenciamento ? pct(receitas, contrato) : pct(custos, contrato)
    const pctServ   = pct(realTotal, prevTotal)
    const atrasada  = detalhe.data_previsao && new Date(detalhe.data_previsao) < new Date() && detalhe.status === 'em_execucao'
    const margem    = detalhe.gerenciamento ? receitas : receitas - custos
    const pctMargem = receitas > 0 ? Math.min(Math.max((margem / receitas) * 100, 0), 100) : 0
    const orcamentoObra = orcamentos.find(o => o.obra_id === detalhe.id)
    const etapasObra = etapas.filter(e => e.obra_id === detalhe.id)
    const hoje = new Date(); hoje.setHours(0,0,0,0)
    const medicoesObra = medicoes.filter(m => m.obra_id === detalhe.id)
    // Agrupa as medições por fornecedor (e o cliente como um grupo à parte), em vez da lista
    // plana anterior que misturava tudo — cada grupo vira "Medição 1, Medição 2..." em ordem
    // cronológica, com um painel de pago × falta pagar escopado àquele fornecedor/cliente.
    const gruposMedicao = (() => {
      const porChave = new Map<string, any[]>()
      medicoesObra.forEach(m => {
        const chave = m.tipo === 'cliente' ? '__cliente__' : (m.fornecedor || '—')
        porChave.set(chave, [...(porChave.get(chave) || []), m])
      })
      return Array.from(porChave.entries()).map(([chave, meds]) => ({
        chave,
        tipo: (chave === '__cliente__' ? 'cliente' : 'fornecedor') as 'cliente' | 'fornecedor',
        fornecedor: chave === '__cliente__' ? null : chave,
        medicoes: meds.slice().sort((a, b) => a.data < b.data ? -1 : 1),
      }))
    })()
    const fornecedoresDisponiveis = Array.from(new Set(svs.map(s => s.fornecedor).filter(Boolean))) as string[]
    const visitasObra = relatoriosVisita.filter(r => r.obra_id === detalhe.id).filter(v => {
      if (!buscaRv) return true
      const alvo = ((v.descricao || '') + ' ' + (v.pendencias || '') + ' ' + dataBR(v.data)).toLowerCase()
      return alvo.includes(buscaRv.toLowerCase())
    })
    const funcionariosObra = funcionarios.filter(f => f.obra_id === detalhe.id)

    return (
      <Layout userEmail={userEmail} onLogout={sair}>
        {/* header da obra */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-lg">
          <div>
            <button onClick={() => { setDetalhe(null); setAbaDetalhe('resumo'); setMedicaoAtiva(null) }} className={btnSecondaryCls + ' mb-3'}>← Voltar</button>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-body-sm text-on-surface-variant font-semibold">{detalhe.codigo}</span>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${EXECUCAO_BADGE[detalhe.tipo_execucao || 'obra']}`}>{EXECUCAO_NOME[detalhe.tipo_execucao || 'obra']}</span>
              {detalhe.gerenciamento && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-secondary/10 text-secondary border-secondary/20" title="Custos de fornecedor são do cliente — não entram no financeiro da Inverso">🤝 Gerenciamento</span>}
              <Bdg status={detalhe.status} />
              {atrasada && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-error/10 text-error border-error/20">⚠️ Atrasada</span>}
            </div>
            <h1 className="text-headline-md font-headline text-on-surface">{detalhe.nome}</h1>
            <p className="text-body-sm text-on-surface-variant">{detalhe.cliente}{detalhe.endereco ? ' · ' + detalhe.endereco : ''}</p>
            <ResponsavelDoDocumento rotulo="Contato do cliente (A/C)" clienteId={detalhe.cliente_id} contatoId={detalhe.contato_id} contatoNome={detalhe.contato_nome}
              onSalvar={async (cid, nome) => { const ok = await editar('obras', detalhe.id, { contato_id: cid, contato_nome: nome }); if (!ok) return alert('Não foi possível salvar o responsável. Tente novamente.'); setDetalhe({ ...detalhe, contato_id: cid, contato_nome: nome }) }} />
          </div>
          <div className="flex gap-2 flex-wrap items-start">
            <button onClick={() => abrirEditarObra(detalhe)} className={btnEditSmCls}>✏️ Editar</button>
            <button onClick={abrirCampoCliente} className={btnEditSmCls} data-testid="btn-campo-cliente" title="Criar e gerenciar o login do cliente para acompanhar esta obra">👤 Campo Cliente</button>
            <select value={detalhe.status}
              onChange={async e => {
                const novoStatus = e.target.value
                const ok = await editar('obras', detalhe.id, { status: novoStatus })
                if (!ok) return alert('Não foi possível salvar o status. Tente novamente.')
                setDetalhe({ ...detalhe, status: novoStatus }); carregar()
              }}
              className={inputCls + ' w-auto text-xs py-1.5'}>
              {Object.entries(STATUS_NOME).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
            <button className="bg-primary-container text-on-primary-container rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer" onClick={() => { setObservacoesPdf(''); setJanela('relatorio_pdf') }}>🖨️ Gerar Relatório PDF</button>
          </div>
        </div>

        {/* cards financeiros */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-lg">
          {([
            ['Contrato', moeda(contrato), 'text-primary'],
            ['Recebido + medido', moeda(receitas), 'text-primary-container'],
            [detalhe.gerenciamento ? 'Custos (do Cliente)' : 'Custos Reais', moeda(custos), 'text-error'],
            ['Margem Atual', moeda(margem), margem >= 0 ? 'text-primary-container' : 'text-error'],
            ['Prev. Serviços', moeda(prevTotal), 'text-tertiary'],
            ['Gasto Serviços', moeda(realTotal), realTotal > prevTotal && prevTotal > 0 ? 'text-error' : realTotal > 0 ? 'text-primary' : 'text-on-surface-variant'],
          ] as [string, string, string][]).map(([lbl, val, cor]) => (
            <div key={lbl} className="bg-surface-container-high border border-outline-variant rounded-lg p-3 min-w-0">
              <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-2">{lbl}</div>
              <div className={`text-[11px] sm:text-xs font-bold leading-tight whitespace-nowrap ${cor}`}>{val}</div>
            </div>
          ))}
        </div>

        {/* barras de progresso */}
        {contrato > 0 && (
          <div className={sectionCls}>
            <div className="flex justify-between text-body-sm text-on-surface-variant mb-1.5">
              <span>{detalhe.gerenciamento ? 'Taxa de gerenciamento cobrada' : 'Consumo do contrato'} — {moeda(detalhe.gerenciamento ? receitas : custos)} de {moeda(contrato)}</span>
              <span className={corPct(pctCont).text}>{pctCont.toFixed(1)}%</span>
            </div>
            <div className="h-[7px] bg-surface-variant rounded overflow-hidden mb-3.5">
              <div className={`h-full rounded ${corPct(pctCont).bar}`} style={{ width: pctCont + '%' }} />
            </div>
            <div className="flex justify-between text-body-sm text-on-surface-variant mb-1.5">
              <span>Margem — Recebido: {moeda(receitas)} · Custos{detalhe.gerenciamento ? ' (repassado ao cliente, fora do balanço da Inverso)' : ''}: {moeda(custos)} · Margem: {moeda(margem)}</span>
              <span className={corSinal(margem).text}>{contrato > 0 ? ((margem / contrato) * 100).toFixed(1) : 0}%</span>
            </div>
            <div className={`h-[7px] bg-surface-variant rounded overflow-hidden ${prevTotal > 0 ? 'mb-3.5' : ''}`}>
              <div className={`h-full rounded ${corSinal(margem).bar}`} style={{ width: pctMargem + '%' }} />
            </div>
            {prevTotal > 0 && (
              <>
                <div className="flex justify-between text-body-sm text-on-surface-variant mb-1.5">
                  <span>Orçamento serviços — Previsto: {moeda(prevTotal)} · Lançado: {moeda(realTotal)}</span>
                  <span className={pctServ > 100 ? 'text-error' : 'text-tertiary'}>{pctServ.toFixed(1)}%</span>
                </div>
                <div className="h-[7px] bg-surface-variant rounded overflow-hidden">
                  <div className={`h-full rounded ${pctServ > 100 ? 'bg-error' : 'bg-tertiary'}`} style={{ width: pctServ + '%' }} />
                </div>
              </>
            )}
          </div>
        )}

        {/* conferência com o Financeiro: custo apropriado na obra x o que foi lançado no Financeiro */}
        {(() => {
          const lancadoFin = Math.round((lancD.filter(l => l.tipo === 'saida').reduce((a, l) => a + parseFloat(l.valor || 0), 0) + gastD.reduce((a, g) => a + parseFloat(g.valor || 0), 0)) * 100) / 100
          const dif = Math.round((custos - lancadoFin) * 100) / 100
          const soManual = svs.filter(sv => custoMaoObraServicoAuto(sv) + custoMaterialServicoAuto(sv) === 0 && parseFloat(sv.valor_realizado || 0) > 0)
          const somaManual = soManual.reduce((a, sv) => a + parseFloat(sv.valor_realizado || 0), 0)
          const medsSemLanc = medicoes.filter(m => m.obra_id === detalhe.id && m.tipo === 'fornecedor' && !m.lancamento_id)
          const residual = Math.round((dif - somaManual) * 100) / 100
          const bate = Math.abs(dif) < 0.01
          return (
            <div className={sectionCls} data-testid="conferencia-financeiro">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div className="text-sm font-bold text-on-surface">🔗 Conferência com o Financeiro</div>
                <Link href="/financeiro" className="text-primary text-[12px] font-semibold hover:underline">abrir Financeiro →</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                {([
                  ['Custo apropriado na obra', moeda(custos), 'serviços (medições + lançamentos) + indiretos + cartão'],
                  ['Lançado no Financeiro', moeda(lancadoFin), 'saídas da obra + compras no cartão'],
                  ['Diferença', moeda(dif), bate ? 'tudo conciliado' : 'ver explicação abaixo'],
                ] as [string, string, string][]).map(([l, v, sub]) => (
                  <div key={l} className="bg-surface-container-high border border-outline-variant rounded-lg p-3">
                    <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">{l}</div>
                    <div className={'text-sm font-bold ' + (l === 'Diferença' ? (bate ? 'text-primary-container' : 'text-tertiary') : 'text-on-surface')}>{v}</div>
                    <div className="text-[10px] text-on-surface-variant mt-1">{sub}</div>
                  </div>
                ))}
              </div>
              {bate ? (
                <div className="text-body-sm text-primary-container">✅ O custo da obra e o que foi lançado no Financeiro estão iguais.</div>
              ) : (
                <div className="text-body-sm text-on-surface-variant flex flex-col gap-1.5">
                  {soManual.length > 0 && <div>• <b>{moeda(somaManual)}</b> em serviços com valor informado só manualmente (sem lançamento no Financeiro): {soManual.map(sv => sv.nome + ' (' + moeda(parseFloat(sv.valor_realizado || 0)) + ')').join('; ')}.</div>}
                  {medsSemLanc.length > 0 && <div>• Medições de fornecedor sem pagamento programado no Financeiro: {medsSemLanc.map(m => m.numero).join(', ')}.</div>}
                  {Math.abs(residual) >= 0.01 && <div>• <b>{moeda(Math.abs(residual))}</b> de {residual > 0 ? 'valor medido que ainda não foi lançado/pago no Financeiro' : 'lançamentos no Financeiro acima do que está apropriado nos serviços (ex.: lançamento sem serviço ou medição de menor valor)'}.</div>}
                  {detalhe.gerenciamento && <div className="text-[11px]">Obra de gerenciamento: o custo é do cliente e fica fora do balanço da Inverso.</div>}
                </div>
              )}
            </div>
          )
        })()}

        {/* abas */}
        <div className="flex gap-2 mb-lg flex-wrap">
          {([['resumo', '📋 Resumo'], ['equipe', '👷 Equipe'], ['funcionarios', '🪪 Funcionários'], ['servicos', '🔧 Serviços'], ['lancamentos', '💰 Lançamentos'], ['cartao', '💳 Cartão'], ['cronograma', '📅 Cronograma'], ['medicoes', '📐 Medições'], ['visitas', '📷 Visitas']] as [string, string][]).map(([id, nome]) => (
            <button key={id} className={abaDetalhe === id ? tabActiveCls : tabInactiveCls} onClick={() => setAbaDetalhe(id)}>{nome}</button>
          ))}
        </div>

        {/* aba resumo */}
        {abaDetalhe === 'resumo' && (
          <div className={sectionCls}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {([
                ['TIPO', detalhe.tipo || '—'],
                ['RESPONSÁVEL', detalhe.responsavel || '—'],
                ['DATA INÍCIO', dataBR(detalhe.data_inicio)],
                ['PREVISÃO TÉRMINO', detalhe.data_previsao ? (dataBR(detalhe.data_previsao) + (atrasada ? ' ⚠️' : '')) : '—'],
                ['ENDEREÇO', detalhe.endereco || '—'],
                ['SERVIÇOS CADASTRADOS', svs.length + ' serviço(s)'],
                ['LANÇAMENTOS', (lancD.length + gastD.length) + ' no total'],
              ] as [string, string][]).map(([l, v]) => (
                <div key={l}>
                  <div className="text-[11px] text-on-surface-variant mb-1">{l}</div>
                  <div className="text-sm font-semibold text-on-surface">{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-outline-variant">
              <button className={btnDangerSmCls} onClick={() => excluirObra(detalhe)}>🗑️ Excluir Obra</button>
            </div>
          </div>
        )}

        {/* aba equipe (atribuição de técnicos) */}
        {abaDetalhe === 'equipe' && (() => {
          const tecnicos = usuarios.filter(u => u.role === 'usuario')
          const atribuidosDaObra = atribuicoesDaObra(detalhe.id)
          const podeEditarEquipe = souAdmin || souGerenteTime
          return (
            <div className={sectionCls}>
              <div className="text-sm font-bold text-on-surface mb-1">👷 Equipe da Obra</div>
              <div className="text-body-sm text-on-surface-variant mb-5">Técnicos atribuídos a esta obra — definem o que aparece no Dashboard e na Agenda de cada um</div>
              {tecnicos.length === 0 ? (
                <div className="text-center py-8 text-on-surface-variant">Nenhum técnico cadastrado ainda</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {tecnicos.map(u => {
                    const atribuido = atribuidosDaObra.some(a => a.usuario_id === u.id)
                    return (
                      <label key={u.id} className={`flex items-center gap-3 px-3.5 py-3 bg-surface-container-low rounded-lg border border-outline-variant ${podeEditarEquipe ? 'cursor-pointer' : ''}`}>
                        <input
                          type="checkbox"
                          checked={atribuido}
                          disabled={!podeEditarEquipe}
                          onChange={() => alternarAtribuicao(detalhe.id, u.id)}
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-on-surface truncate">{u.nome || u.email}</div>
                          <div className="text-[11px] text-on-surface-variant truncate">{u.email}</div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

        {/* aba funcionários */}
        {abaDetalhe === 'funcionarios' && (
          <div className={sectionCls}>
            <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
              <div>
                <div className="text-sm font-bold text-on-surface">🪪 Funcionários / Equipe da Obra</div>
                <div className="text-body-sm text-on-surface-variant mt-0.5">Cadastro manual — nome, documento, empresa e anexos por pessoa</div>
              </div>
              <button className={btnPrimaryCls} onClick={abrirNovoFuncionario}>+ Novo Funcionário</button>
            </div>
            {funcionariosObra.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant text-body-sm">Nenhum funcionário cadastrado ainda</div>
            ) : (
              <div className="flex flex-col gap-2">
                {funcionariosObra.map(f => {
                  const arquivosDoFunc = funcionarioArquivos.filter(a => a.funcionario_id === f.id)
                  const expandido = funcExpandido === f.id
                  return (
                    <div key={f.id} className="bg-surface-container-low border border-outline-variant rounded-lg p-3.5">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 cursor-pointer" onClick={() => setFuncExpandido(expandido ? null : f.id)}>
                          <div className="font-semibold text-sm text-on-surface">{f.nome}</div>
                          <div className="text-[11px] text-on-surface-variant mt-0.5">
                            {[f.empresa, f.telefone].filter(Boolean).join(' · ') || '—'}
                          </div>
                          <div className="text-[11px] text-on-surface-variant">{arquivosDoFunc.length} arquivo(s) — {expandido ? 'ocultar' : 'ver detalhes'}</div>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button className={btnEditSmCls} onClick={() => abrirEditarFuncionario(f)}>✏️</button>
                          <button className={btnDangerSmCls} onClick={() => excluirFuncionario(f)}>×</button>
                        </div>
                      </div>
                      {expandido && (
                        <div className="mt-3 pt-3 border-t border-outline-variant">
                          <div className="grid grid-cols-2 gap-2 text-[11px] text-on-surface-variant mb-3">
                            <div><span className="uppercase">CPF</span><div className="text-on-surface font-semibold">{f.cpf || '—'}</div></div>
                            <div><span className="uppercase">RG</span><div className="text-on-surface font-semibold">{f.rg || '—'}</div></div>
                          </div>
                          <div className="flex items-center gap-2.5 mb-3">
                            <input type="file" onChange={e => setArquivoUploadFunc(e.target.files?.[0] || null)}
                              className="flex-1 bg-surface-container border border-outline-variant rounded-lg text-on-surface-variant text-xs px-2 py-2 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-primary/10 file:text-primary file:text-xs file:font-semibold cursor-pointer" />
                            <button className={btnEditSmCls} onClick={() => salvarArquivoFuncionario(f.id)} disabled={!arquivoUploadFunc || enviandoArquivoFunc}>
                              {enviandoArquivoFunc ? 'Enviando...' : '+ Enviar'}
                            </button>
                          </div>
                          {arquivosDoFunc.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                              {arquivosDoFunc.map(arq => (
                                <div key={arq.id} className="flex justify-between items-center px-3 py-2 bg-surface-container rounded-lg border border-outline-variant">
                                  <a href={arq.url} target="_blank" rel="noopener noreferrer" className="text-xs text-on-surface hover:text-primary truncate">📄 {arq.nome}</a>
                                  <button className={btnDangerSmCls} onClick={() => removerArquivoFuncionario(arq.id)}>×</button>
                                </div>
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
          </div>
        )}

        {/* modal novo/editar funcionário */}
        {(janela === 'novo_funcionario' || janela === 'editar_funcionario') && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[480px]">
              <div className="text-base font-bold text-on-surface mb-5">{janela === 'editar_funcionario' ? '✏️ Editar Funcionário' : '🪪 Novo Funcionário'}</div>
              <div className="flex flex-col gap-3.5">
                <div><label className={labelCls}>Nome *</label><input className={inputCls} value={fFunc.nome} onChange={e => setFFunc({ ...fFunc, nome: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelCls}>CPF</label><input className={inputCls} value={fFunc.cpf} onChange={e => setFFunc({ ...fFunc, cpf: e.target.value })} /></div>
                  <div><label className={labelCls}>RG</label><input className={inputCls} value={fFunc.rg} onChange={e => setFFunc({ ...fFunc, rg: e.target.value })} /></div>
                </div>
                <div><label className={labelCls}>Empresa</label><input className={inputCls} value={fFunc.empresa} onChange={e => setFFunc({ ...fFunc, empresa: e.target.value })} /></div>
                <div><label className={labelCls}>Telefone</label><input className={inputCls} value={fFunc.telefone} onChange={e => setFFunc({ ...fFunc, telefone: e.target.value })} /></div>
              </div>
              <div className="flex gap-2.5 justify-end mt-6">
                <button className={btnSecondaryCls} onClick={() => { setJanela(null); setFuncEditando(null); setFFunc(FFUNC_VAZIO) }}>Cancelar</button>
                <button className={btnPrimaryCls} onClick={salvarFuncionario}>{janela === 'editar_funcionario' ? 'Salvar Alterações' : 'Adicionar Funcionário'}</button>
              </div>
            </div>
          </div>
        )}

        {/* aba serviços */}
        {abaDetalhe === 'servicos' && (
          <div className={sectionCls}>
            <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
              <div>
                <div className="text-sm font-bold text-on-surface">🔧 Custos Previstos por Serviço</div>
                <div className="text-body-sm text-on-surface-variant mt-0.5">Compare o previsto com o realizado em cada serviço</div>
              </div>
              <button className={btnPrimaryCls} onClick={abrirNovoServico}>+ Novo Serviço</button>
            </div>

            {svs.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">🔧</div>
                <div className="text-sm font-semibold text-on-surface mb-2">Nenhum serviço cadastrado</div>
                <div className="text-body-sm text-on-surface-variant mb-5">Exemplo: Hidráulica · Elétrica · Pintura · Forro</div>
                <button className={btnPrimaryCls} onClick={abrirNovoServico}>+ Adicionar primeiro serviço</button>
              </div>
            ) : (() => {
              const totalContratado = svs.reduce((a, s) => a + parseFloat(s.valor_previsto || 0), 0)
              const totalMatPrevisto = svs.reduce((a, s) => a + parseFloat(s.valor_material_previsto || 0), 0)
              const totalMaoPrevisto = svs.reduce((a, s) => a + parseFloat(s.valor_mao_obra_previsto || 0), 0)
              const totalMatGasto = svs.reduce((a, s) => a + custoMaterialServicoAuto(s), 0)
              const totalMaoGasto = svs.reduce((a, s) => a + custoMaoObraServicoAuto(s), 0)
              const lucroPrejuizo = totalContratado - totalMatGasto - totalMaoGasto
              return (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-outline-variant">
                        {['Serviço', 'Unid.', 'Qtd.', 'Valor Contratado', 'Custo Material Prev.', 'Custo M.O. Prev.', 'Material Realizado', 'M.O. Realizada', 'Status', 'Progresso', ''].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[11px] text-on-surface-variant uppercase bg-surface-container-high whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {svs.map((sv, idx) => {
                        const vp = parseFloat(sv.valor_previsto || 0)
                        const matPrev = parseFloat(sv.valor_material_previsto || 0)
                        const maoPrev = parseFloat(sv.valor_mao_obra_previsto || 0)
                        const vrMao = custoMaoObraServicoAuto(sv)
                        const vrMat = custoMaterialServicoAuto(sv)
                        const custoPrevTotal = matPrev + maoPrev
                        const custoRealTotal = vrMao + vrMat
                        const ppRaw = custoPrevTotal > 0 ? (custoRealTotal / custoPrevTotal) * 100 : 0
                        const badge = SERV_BADGE[sv.status] || SERV_BADGE.pendente
                        const categoriaAtual = sv.categoria || 'Outros'
                        const categoriaAnterior = idx > 0 ? (svs[idx - 1].categoria || 'Outros') : null
                        return (
                          <Fragment key={sv.id}>
                          {categoriaAtual !== categoriaAnterior && (
                            <tr className="bg-surface-container-high">
                              <td colSpan={11} className="px-3 py-1.5 text-[10px] font-bold text-primary uppercase tracking-wide">{categoriaAtual}</td>
                            </tr>
                          )}
                          <tr className="border-b border-outline-variant hover:bg-surface-variant/20">
                            <td className="px-3 py-3">
                              <div className="font-semibold text-sm text-on-surface">{sv.nome}</div>
                              {sv.fornecedor && <div className="text-[11px] text-primary mt-0.5">{sv.fornecedor}</div>}
                              {sv.observacao && <div className="text-[11px] text-on-surface-variant mt-0.5">{sv.observacao}</div>}
                            </td>
                            <td className="px-3 py-3 text-on-surface-variant">{sv.unidade || '—'}</td>
                            <td className="px-3 py-3 text-on-surface-variant">{sv.quantidade != null ? Number(sv.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—'}</td>
                            <td className="px-3 py-3 font-semibold text-tertiary">{moeda(vp)}</td>
                            <td className="px-3 py-3 font-semibold text-on-surface">{moeda(matPrev)}</td>
                            <td className="px-3 py-3 font-semibold text-on-surface">{moeda(maoPrev)}</td>
                            <td className={`px-3 py-3 font-semibold ${vrMat > matPrev && matPrev > 0 ? 'text-error' : 'text-primary-container'}`}>{moeda(vrMat)}</td>
                            <td className={`px-3 py-3 font-semibold ${vrMao > maoPrev && maoPrev > 0 ? 'text-error' : 'text-primary-container'}`}>{moeda(vrMao)}</td>
                            <td className="px-3 py-3">
                              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${badge}`}>{SERV_STATUS[sv.status] || sv.status}</span>
                            </td>
                            <td className="px-3 py-3 min-w-[100px]">
                              <div className="h-1.5 bg-surface-variant rounded overflow-hidden mb-1">
                                <div className={`h-full rounded ${corProgresso(ppRaw)}`} style={{ width: Math.min(ppRaw, 100) + '%' }} />
                              </div>
                              <div className="text-[10px] text-on-surface-variant">{ppRaw.toFixed(0)}%</div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex gap-1.5">
                                <button className={btnEditSmCls} onClick={() => abrirEditarServico(sv)}>✏️</button>
                                <button className={btnDangerSmCls} onClick={async () => {
                                  if (!confirm('Excluir este serviço?')) return
                                  await remover('obra_servicos', sv.id); carregar()
                                }}>×</button>
                              </div>
                            </td>
                          </tr>
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4 p-4 bg-surface-container-low rounded-lg">
                  <div><div className="text-[10px] text-on-surface-variant mb-1">CONTRATO (SERVIÇOS)</div><div className="text-lg font-bold text-tertiary">{moeda(totalContratado)}</div><div className="text-[10px] text-on-surface-variant mt-0.5">valor cobrado do cliente</div></div>
                  <div>
                    <div className="text-[10px] text-on-surface-variant mb-1">MATERIAL</div>
                    <div className={`text-lg font-bold ${totalMatGasto > totalMatPrevisto && totalMatPrevisto > 0 ? 'text-error' : 'text-primary'}`}>{moeda(totalMatGasto)}</div>
                    <div className="text-[10px] text-on-surface-variant mt-0.5">de {moeda(totalMatPrevisto)} previsto</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-on-surface-variant mb-1">MÃO DE OBRA</div>
                    <div className={`text-lg font-bold ${totalMaoGasto > totalMaoPrevisto && totalMaoPrevisto > 0 ? 'text-error' : 'text-primary'}`}>{moeda(totalMaoGasto)}</div>
                    <div className="text-[10px] text-on-surface-variant mt-0.5">de {moeda(totalMaoPrevisto)} previsto</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-on-surface-variant mb-1">{lucroPrejuizo >= 0 ? 'LUCRO' : 'PREJUÍZO'}</div>
                    <div className={`text-lg font-bold ${lucroPrejuizo >= 0 ? 'text-primary-container' : 'text-error'}`}>{moeda(lucroPrejuizo)}</div>
                    <div className="text-[10px] text-on-surface-variant mt-0.5">{svs.filter(s => s.status === 'concluido').length}/{svs.length} concluído(s)</div>
                  </div>
                </div>
                <div className="mt-3 px-3 py-2 bg-primary/5 rounded-lg text-body-sm text-on-surface-variant">
                  💡 <strong className="text-on-surface">Material Realizado</strong> = compras lançadas no Financeiro com categoria "Material" vinculadas ao serviço. <strong className="text-on-surface">M.O. Realizada</strong> = última medição de fornecedor registrada no serviço, com base no custo de mão de obra previsto (não no valor cobrado do cliente). No Financeiro, selecione a obra, a <strong className="text-on-surface">Categoria da Obra</strong> (serviço) e a categoria "Material" ou "Mão de obra" para o lançamento entrar na conta certa.
                </div>
              </>
              )
            })()}
          </div>
        )}

        {/* aba lançamentos */}
        {abaDetalhe === 'lancamentos' && (
          <div className={sectionCls}>
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <div className="text-sm font-bold text-on-surface">Lançamentos vinculados</div>
              <Link href="/financeiro" className={btnPrimaryCls}>+ Lançar no Financeiro</Link>
            </div>
            {lancD.length === 0
              ? <div className="text-center py-8 text-on-surface-variant">Nenhum lançamento vinculado a esta obra</div>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead><tr className="border-b border-outline-variant">
                      {['Data', 'Descrição', 'Categoria', 'Status', 'Valor'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-[11px] text-on-surface-variant uppercase bg-surface-container-high">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {lancD.map(l => (
                        <tr key={l.id} className="border-b border-outline-variant hover:bg-surface-variant/20">
                          <td className="px-3 py-2.5 text-on-surface-variant text-xs">{dataBR(l.data)}</td>
                          <td className="px-3 py-2.5 font-semibold text-on-surface">{l.descricao}</td>
                          <td className="px-3 py-2.5 text-on-surface-variant text-xs">{l.categoria || '—'}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${l.status === 'pago' ? 'bg-primary-container/10 text-primary-container border-primary-container/20' : 'bg-tertiary/10 text-tertiary border-tertiary/20'}`}>
                              {l.status === 'pago' ? 'Pago' : 'Pendente'}
                            </span>
                          </td>
                          <td className={`px-3 py-2.5 font-bold ${l.tipo === 'entrada' ? 'text-primary-container' : 'text-error'}`}>
                            {l.tipo === 'entrada' ? '+' : '-'}{moeda(parseFloat(l.valor))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        )}

        {/* aba cartão */}
        {abaDetalhe === 'cartao' && (
          <div className={sectionCls}>
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <div className="text-sm font-bold text-on-surface">Gastos no Cartão</div>
              <Link href="/financeiro" className={btnPrimaryCls}>+ Lançar</Link>
            </div>
            {gastD.length === 0
              ? <div className="text-center py-8 text-on-surface-variant">Nenhum gasto de cartão vinculado</div>
              : gastD.map(g => (
                <div key={g.id} className="flex justify-between items-center py-2.5 border-b border-outline-variant">
                  <div>
                    <div className="font-semibold text-sm text-on-surface">{g.descricao}</div>
                    <div className="text-[11px] text-on-surface-variant">{dataBR(g.data)} · {g.categoria || '—'}</div>
                  </div>
                  <div className="text-error font-bold">{moeda(parseFloat(g.valor))}</div>
                </div>
              ))}
          </div>
        )}

        {/* aba cronograma */}
        {abaDetalhe === 'cronograma' && (() => {
          const modoCron = modoEfetivoCronograma(detalhe, etapasObra)
          const orcVinculadoCron = orcamentos.find(o => o.obra_id === detalhe.id)
          const qtdItensOrcCron = orcVinculadoCron ? orcItens.filter(i => i.orcamento_id === orcVinculadoCron.id).length : 0

          if (!modoCron) {
            return (
              <div className={sectionCls}>
                <div className="text-center mb-5">
                  <div className="text-4xl mb-2">📅</div>
                  <div className="text-sm font-bold text-on-surface mb-1">Como você quer montar o cronograma desta obra?</div>
                  <div className="text-body-sm text-on-surface-variant max-w-[36rem] mx-auto">Escolha uma das opções abaixo. Em todas elas dá para ajustar datas e acrescentar etapas depois, e cada atraso ou mudança de data fica registrado com o motivo.</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {MODOS_CRONOGRAMA.map(m => {
                    const indisponivel = m.id === 'servicos' ? svs.length === 0 : m.id === 'orcamento' ? qtdItensOrcCron === 0 : false
                    const aviso = m.id === 'servicos' && svs.length === 0 ? 'Cadastre serviços na aba Serviços para usar esta opção.'
                      : m.id === 'orcamento' && !orcVinculadoCron ? 'Esta obra não tem orçamento vinculado.'
                      : m.id === 'orcamento' && qtdItensOrcCron === 0 ? 'O orçamento vinculado ainda não tem itens.' : ''
                    return (
                      <div key={m.id} className={`bg-surface-container-low border rounded-xl p-4 flex flex-col ${indisponivel ? 'border-outline-variant opacity-60' : 'border-primary/30'}`} data-testid={`modo-cronograma-${m.id}`}>
                        <div className="text-2xl mb-1">{m.icone}</div>
                        <div className="text-sm font-bold text-on-surface mb-1">{m.titulo}</div>
                        <div className="text-[12px] text-on-surface-variant leading-relaxed flex-1 mb-3">{m.descricao}</div>
                        {aviso && <div className="text-[11px] text-error mb-2">{aviso}</div>}
                        <button className={btnPrimaryCls + (indisponivel ? ' opacity-50 cursor-not-allowed' : '')} disabled={indisponivel} onClick={() => escolherModoCronograma(detalhe, m.id)}>Usar esta opção</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          }

          const modoInfo = MODOS_CRONOGRAMA.find(m => m.id === modoCron)!
          const { linhas: linhasCron, agruparPorCategoria } = ordenarLinhasCronograma(montarLinhasCronograma(etapasObra, svs, orcItens), modoCron, ordemCategoria)
          const todasDatasCron = linhasCron.flatMap(l => [l.et.data_inicio_prevista, l.et.data_fim_prevista]).filter(Boolean) as string[]
          const iniGanttStr = detalhe.data_inicio || (todasDatasCron.length ? [...todasDatasCron].sort()[0] : null)
          const fimGanttStr = detalhe.data_previsao || (todasDatasCron.length ? [...todasDatasCron].sort().slice(-1)[0] : null)
          const inicioObra = iniGanttStr ? new Date(iniGanttStr + 'T00:00:00') : null
          const fimObra = fimGanttStr ? new Date(fimGanttStr + 'T00:00:00') : null
          const totalMsObra = inicioObra && fimObra ? Math.max(fimObra.getTime() - inicioObra.getTime(), 86400000) : 1
          const hojeGantt = inicioObra ? Math.max(0, Math.min(100, ((new Date().getTime() - inicioObra.getTime()) / totalMsObra) * 100)) : 0
          const hojeDentro = !!(inicioObra && fimObra && new Date() >= inicioObra && new Date() <= fimObra)
          const hojeStr = hojeISO()
          const itensOrcFaltando = modoCron === 'orcamento' && orcVinculadoCron
            ? orcItens.filter(i => i.orcamento_id === orcVinculadoCron.id && !etapasObra.some(e => e.orcamento_item_id === i.id)).length : 0
          return (
          <div className={sectionCls}>
            <div className="flex justify-between items-start mb-5 flex-wrap gap-2">
              <div>
                <div className="text-sm font-bold text-on-surface">📅 Cronograma da Obra</div>
                <div className="text-body-sm text-on-surface-variant mt-0.5">Modo: <b className="text-on-surface">{modoInfo.icone} {modoInfo.titulo}</b> — datas editáveis; mudar uma data já definida ou marcar atraso registra o motivo no histórico</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button className={btnSecondaryCls} onClick={abrirNovaEtapa} data-testid="btn-nova-etapa">+ Etapa</button>
                {modoCron === 'orcamento' && itensOrcFaltando > 0 && (
                  <button className={btnSecondaryCls} onClick={() => importarItensOrcamentoCronograma(detalhe)}>🔄 Trazer {itensOrcFaltando} item(ns) novo(s) do orçamento</button>
                )}
                {linhasCron.length > 0 && (
                  <button className={btnPrimaryCls} onClick={() => gerarPDFCronograma(detalhe, linhasCron)}>🖨️ Gerar Cronograma PDF</button>
                )}
                <button className={btnSecondaryCls} onClick={() => trocarModoCronograma(detalhe)} title="Apaga as etapas atuais e volta para a escolha do modo">↩ Trocar modo</button>
              </div>
            </div>
            {modoCron === 'servicos' && (!detalhe.data_inicio || !detalhe.data_previsao) && linhasCron.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant">Informe as datas de início e fim previstas da obra (✏️ Editar) para o sistema distribuir os serviços automaticamente.</div>
            ) : linhasCron.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant">Nenhuma etapa ainda. Use <b>+ Etapa</b> para cadastrar a primeira.</div>
            ) : (
              <>
              {inicioObra && fimObra && (
              <div className="mb-5 bg-surface-container-low border border-outline-variant rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <div className="text-[11px] font-bold text-on-surface-variant uppercase">📊 Gantt</div>
                  <div className="flex gap-3 text-[10px] text-on-surface-variant">
                    <span><span className="inline-block w-2 h-2 rounded-full bg-on-surface-variant/50 mr-1" />Pendente</span>
                    <span><span className="inline-block w-2 h-2 rounded-full bg-tertiary mr-1" />Em Andamento</span>
                    <span><span className="inline-block w-2 h-2 rounded-full bg-primary-container mr-1" />Concluída</span>
                    <span><span className="inline-block w-2 h-2 rounded-full bg-error mr-1" />Atrasada</span>
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-on-surface-variant mb-2">
                  <span>{dataBR(iniGanttStr!)}</span>
                  <span>{dataBR(fimGanttStr!)}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {linhasCron.map(l => {
                    const { xPct, larguraPct } = calcularBarraGantt(inicioObra, fimObra, l.et.data_inicio_prevista, l.et.data_fim_prevista)
                    return (
                      <div key={l.et.id} className="flex items-center gap-3">
                        <div className="w-32 shrink-0 text-[11px] text-on-surface truncate" title={l.nome}>{l.nome}</div>
                        <div className="relative flex-1 h-5 bg-surface-container rounded overflow-hidden">
                          <div className={`absolute top-0 h-full rounded ${corBarraEtapa(statusVisualEtapa(l.et, hojeStr))}`} style={{ left: xPct + '%', width: larguraPct + '%' }} title={`${dataBR(l.et.data_inicio_prevista)} — ${dataBR(l.et.data_fim_prevista)}`} />
                          {hojeDentro && <div className="absolute top-0 h-full w-px bg-primary" style={{ left: hojeGantt + '%' }} />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant">
                      {['', 'Etapa', 'Fornecedor', 'Início Previsto', 'Fim Previsto', 'Status', ''].map((h, i) => (
                        <th key={i} className="text-left px-3 py-2 text-[11px] text-on-surface-variant uppercase bg-surface-container-high whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linhasCron.map((linha, idx) => {
                      const et = linha.et
                      const statusV = statusVisualEtapa(et, hojeStr)
                      const categoriaAtual = linha.categoria || 'Outros'
                      const categoriaAnterior = idx > 0 ? (linhasCron[idx - 1].categoria || 'Outros') : null
                      const histEtapa = cronHistorico.filter(h => h.etapa_id === et.id)
                      const ultimoMot = ultimoMotivoEtapa(et.id, cronHistorico)
                      const anterior = linhasCron[idx - 1], proxima = linhasCron[idx + 1]
                      const podeSubir = modoCron === 'servicos' && !!linha.servico && !!anterior?.servico && (anterior.servico.categoria || null) === (linha.servico.categoria || null)
                      const podeDescer = modoCron === 'servicos' && !!linha.servico && !!proxima?.servico && (proxima.servico.categoria || null) === (linha.servico.categoria || null)
                      return (
                      <Fragment key={et.id}>
                        {agruparPorCategoria && categoriaAtual !== categoriaAnterior && (
                          <tr className="bg-surface-container-high">
                            <td colSpan={7} className="px-3 py-1.5 text-[10px] font-bold text-primary uppercase tracking-wide">{categoriaAtual}</td>
                          </tr>
                        )}
                        <tr className="border-b border-outline-variant hover:bg-surface-variant/20" data-testid="linha-etapa">
                          <td className="px-3 py-2.5">
                            {modoCron === 'servicos' && linha.servico && (
                              <div className="flex flex-col gap-0.5">
                                <button disabled={!podeSubir} className="text-xs text-on-surface-variant hover:text-primary disabled:opacity-20 disabled:cursor-not-allowed" onClick={() => reordenarServico(linha.servico, -1)}>▲</button>
                                <button disabled={!podeDescer} className="text-xs text-on-surface-variant hover:text-primary disabled:opacity-20 disabled:cursor-not-allowed" onClick={() => reordenarServico(linha.servico, 1)}>▼</button>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {linha.origem === 'servico' ? (
                              <span className="font-semibold text-on-surface">{linha.nome}</span>
                            ) : (
                              <input key={et.id + (et.nome || '')} className={inputCls + ' text-sm py-1.5 font-semibold'} defaultValue={linha.nome} onBlur={e => renomearEtapaCronograma(et, e.target.value)} />
                            )}
                            {ultimoMot && (
                              <div className="text-[10px] text-tertiary mt-1" title={`${new Date(ultimoMot.created_at).toLocaleString('pt-BR')} — ${ultimoMot.usuario_email || ''}`}>↳ {TIPOS_ALTERACAO_CRONOGRAMA[ultimoMot.tipo] || ultimoMot.tipo}: {ultimoMot.motivo}</div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-on-surface-variant text-xs whitespace-nowrap">{linha.fornecedor || '—'}</td>
                          <td className="px-3 py-2.5">
                            <input type="date" className={inputCls + ' text-xs py-1.5'} value={et.data_inicio_prevista || ''}
                              onChange={e => {
                                const v = e.target.value
                                if (v && et.data_fim_prevista && v > et.data_fim_prevista) return alert('O início não pode ser depois do fim previsto. Ajuste primeiro a data final.')
                                solicitarAlteracaoEtapa(linha, { data_inicio_prevista: v || null })
                              }} />
                          </td>
                          <td className="px-3 py-2.5">
                            <input type="date" className={inputCls + ' text-xs py-1.5'} value={et.data_fim_prevista || ''}
                              onChange={e => {
                                const v = e.target.value
                                if (v && et.data_inicio_prevista && v < et.data_inicio_prevista) return alert('O fim não pode ser antes do início previsto. Ajuste primeiro a data inicial.')
                                solicitarAlteracaoEtapa(linha, { data_fim_prevista: v || null })
                              }} />
                          </td>
                          <td className="px-3 py-2.5">
                            <select className={inputCls + ' text-xs py-1.5 w-auto'} value={et.status}
                              onChange={e => solicitarAlteracaoEtapa(linha, { status: e.target.value })}>
                              {Object.entries(ETAPA_STATUS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                            </select>
                            {statusV === 'atrasada' && et.status !== 'atrasada' && <div className="text-[10px] text-error mt-1">⚠️ prazo vencido</div>}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <button className="text-[11px] text-primary underline mr-2" onClick={() => setEtapaHistAberta(etapaHistAberta === et.id ? null : et.id)} title="Histórico de atrasos e mudanças de data">📝 {histEtapa.length}</button>
                            {linha.origem !== 'servico' && <button className="text-[11px] text-error" onClick={() => excluirEtapaCronograma(linha)} title="Remover etapa">🗑️</button>}
                          </td>
                        </tr>
                        {etapaHistAberta === et.id && (
                          <tr className="bg-surface-container-low">
                            <td colSpan={7} className="px-4 py-3">
                              <div className="text-[10px] font-bold text-on-surface-variant uppercase mb-2">Histórico — {linha.nome}</div>
                              {histEtapa.length === 0 ? (
                                <div className="text-[12px] text-on-surface-variant">Nenhuma alteração registrada.</div>
                              ) : (
                                <div className="flex flex-col gap-1.5">
                                  {histEtapa.map(h => (
                                    <div key={h.id} className="text-[12px] text-on-surface">
                                      <span className="text-on-surface-variant">{new Date(h.created_at).toLocaleString('pt-BR')} · {h.usuario_email || '—'}</span>{' '}
                                      <b>{TIPOS_ALTERACAO_CRONOGRAMA[h.tipo] || h.tipo}</b>
                                      {(h.inicio_anterior !== h.inicio_novo || h.fim_anterior !== h.fim_novo) && <span className="text-on-surface-variant"> · {dataBR(h.inicio_anterior)}–{dataBR(h.fim_anterior)} → {dataBR(h.inicio_novo)}–{dataBR(h.fim_novo)}</span>}
                                      {h.status_anterior !== h.status_novo && <span className="text-on-surface-variant"> · {ETAPA_STATUS[h.status_anterior] || '—'} → {ETAPA_STATUS[h.status_novo] || '—'}</span>}
                                      {h.motivo && <div className="text-tertiary">“{h.motivo}”</div>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
          )
        })()}
        {/* aba medições — sem orçamento vinculado */}
        {abaDetalhe === 'medicoes' && svs.length === 0 && (
          <div className={sectionCls + ' text-center py-12'}>
            <div className="text-4xl mb-3">📐</div>
            <div className="text-sm font-bold text-on-surface mb-2">Nenhum serviço cadastrado nesta obra</div>
            <div className="text-body-sm text-on-surface-variant mb-5 max-w-[28rem] mx-auto">As medições são feitas em cima dos serviços da obra. Cadastre ao menos um serviço na aba "🔧 Serviços" (manualmente ou vinculando um orçamento).</div>
          </div>
        )}

        {/* aba medições — lista */}
        {abaDetalhe === 'medicoes' && svs.length > 0 && !medicaoAtiva && (
          <div className={sectionCls}>
            <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
              <div>
                <div className="text-sm font-bold text-on-surface">📐 Medições</div>
                <div className="text-body-sm text-on-surface-variant mt-0.5">Avanço físico-financeiro para pagar fornecedores ou cobrar o cliente</div>
              </div>
              <button className={btnPrimaryCls} onClick={() => { setFMedicao({ tipo: 'cliente', fornecedor: '', data: hojeISO(), observacao: '', adiantamento: false, valor_adiantamento: '' }); setJanela('nova_medicao') }}>+ Nova Medição</button>
            </div>
            {(() => {
              const recebidoCliente = medicoesObra.filter(m => m.tipo === 'cliente').reduce((a, m) => a + totalsMedicao(m).totalPeriodo, 0)
              const pagoFornecedores = medicoesObra.filter(m => m.tipo === 'fornecedor').reduce((a, m) => a + totalsMedicao(m).totalLiquido, 0)
              const lucroPrevisto = contrato - prevTotal
              const faltaReceber = contrato - recebidoCliente
              const faltaPagar = prevTotal - pagoFornecedores
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                  <div className="bg-surface-container-low border border-outline-variant rounded-lg p-4">
                    <div className="text-[11px] font-bold text-primary uppercase mb-3">💰 Cliente</div>
                    <div className="flex flex-col gap-2 text-sm">
                      <div className="flex justify-between"><span className="text-on-surface-variant">Contrato</span><span className="font-semibold text-on-surface">{moeda(contrato)}</span></div>
                      <div className="flex justify-between"><span className="text-on-surface-variant">Recebido</span><span className="font-semibold text-primary-container">{moeda(recebidoCliente)}</span></div>
                      <div className="flex justify-between border-t border-outline-variant pt-2"><span className="text-on-surface-variant">Falta Receber</span><span className="font-bold text-on-surface">{moeda(faltaReceber)}</span></div>
                    </div>
                  </div>
                  <div className="bg-surface-container-low border border-outline-variant rounded-lg p-4">
                    <div className="text-[11px] font-bold text-tertiary uppercase mb-3">🧱 Custo × Lucro</div>
                    <div className="flex flex-col gap-2 text-sm">
                      <div className="flex justify-between"><span className="text-on-surface-variant">Custo Previsto</span><span className="font-semibold text-on-surface">{moeda(prevTotal)}</span></div>
                      <div className="flex justify-between"><span className="text-on-surface-variant">Lucro Previsto</span><span className={`font-semibold ${lucroPrevisto >= 0 ? 'text-primary-container' : 'text-error'}`}>{moeda(lucroPrevisto)}</span></div>
                      <div className="flex justify-between"><span className="text-on-surface-variant">Pago a Fornecedores</span><span className="font-semibold text-error">{moeda(pagoFornecedores)}</span></div>
                      <div className="flex justify-between border-t border-outline-variant pt-2"><span className="text-on-surface-variant">Falta Pagar</span><span className="font-bold text-on-surface">{moeda(faltaPagar)}</span></div>
                    </div>
                  </div>
                </div>
              )
            })()}
            {medicoesObra.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant">Nenhuma medição ainda</div>
            ) : (
              <div className="flex flex-col gap-3">
                {gruposMedicao.map(grupo => {
                  const itensGrupo = svs.filter(s => grupo.tipo !== 'fornecedor' || s.fornecedor === grupo.fornecedor)
                  const previstoGrupo = grupo.tipo === 'cliente' ? contrato : itensGrupo.reduce((a, s) => a + parseFloat(s.valor_previsto || 0), 0)
                  let pagoGrupo = 0, contadorMedicao = 0
                  const medsComTotais = grupo.medicoes.map(med => {
                    const { totalPeriodo, totalLiquido, descontoAdiantamento } = totalsMedicao(med)
                    const lanc = med.lancamento_id ? lancs.find(l => l.id === med.lancamento_id) : null
                    const statusPag: 'rascunho' | 'programado' | 'pago' = !lanc ? 'rascunho' : lanc.status === 'pago' ? 'pago' : 'programado'
                    if (statusPag === 'pago') pagoGrupo += totalLiquido
                    const isAdiantamento = med.valor_adiantamento != null
                    const indice = isAdiantamento ? null : ++contadorMedicao
                    return { med, indice, totalLiquido, totalPeriodo, descontoAdiantamento: descontoAdiantamento || 0, statusPag, isAdiantamento }
                  })
                  const faltaGrupo = previstoGrupo - pagoGrupo
                  const aberto = grupoMedicaoAberto === grupo.chave
                  return (
                    <div key={grupo.chave} className="bg-surface-container-low rounded-lg border border-outline-variant overflow-hidden">
                      <div className="w-full flex justify-between items-center px-4 py-3 hover:bg-surface-variant/20 transition-all cursor-pointer flex-wrap gap-2" onClick={() => setGrupoMedicaoAberto(aberto ? null : grupo.chave)}>
                        <div>
                          <div className="font-semibold text-sm text-on-surface">{grupo.tipo === 'cliente' ? '💰 Cliente' : `🧱 Fornecedor: ${grupo.fornecedor}`}</div>
                          <div className="text-[11px] text-on-surface-variant">{grupo.medicoes.length} medição(ões) · Previsto: {moeda(previstoGrupo)}</div>
                        </div>
                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="text-right">
                            <div className="text-[10px] text-on-surface-variant uppercase">{grupo.tipo === 'cliente' ? 'Recebido' : 'Pago'}</div>
                            <div className="text-sm font-bold text-primary-container">{moeda(pagoGrupo)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-on-surface-variant uppercase">Falta {grupo.tipo === 'cliente' ? 'Receber' : 'Pagar'}</div>
                            <div className="text-sm font-bold text-error">{moeda(faltaGrupo)}</div>
                          </div>
                          <button className={btnEditSmCls} title="Mapa Geral: escopo × cada medição × acumulado × falta, item a item" onClick={e => { e.stopPropagation(); setMapaGeralAberto(mapaGeralAberto === grupo.chave ? null : grupo.chave) }}>🗺️ Mapa Geral</button>
                          <button className={btnEditSmCls} title="Relatório completo (histórico + panorama)" onClick={e => { e.stopPropagation(); gerarPDFMedicaoCompleta(grupo, detalhe, previstoGrupo) }}>🖨️</button>
                          <span className="material-symbols-outlined text-on-surface-variant">{aberto ? 'expand_less' : 'expand_more'}</span>
                        </div>
                      </div>
                      {mapaGeralAberto === grupo.chave && (() => {
                        const mapa = mapaGeralGrupo(grupo, itensGrupo)
                        let categoriaAnteriorMapa: string | null = null
                        return (
                          <div className="border-t border-outline-variant overflow-x-auto">
                            <table className="w-full border-collapse text-xs" style={{ minWidth: 640 + mapa.medicoesReais.length * 140 }}>
                              <thead>
                                <tr className="bg-surface-container-high">
                                  <th rowSpan={2} className="text-left px-2.5 py-2 text-[9px] text-on-surface-variant uppercase whitespace-nowrap">Serviço</th>
                                  <th rowSpan={2} className="text-center px-2.5 py-2 text-[9px] text-on-surface-variant uppercase whitespace-nowrap">Unid.</th>
                                  <th rowSpan={2} className="text-center px-2.5 py-2 text-[9px] text-on-surface-variant uppercase whitespace-nowrap">Qtd</th>
                                  <th rowSpan={2} className="text-right px-2.5 py-2 text-[9px] text-on-surface-variant uppercase whitespace-nowrap">Custo Total</th>
                                  {mapa.medicoesReais.map((med, i) => (
                                    <th key={med.id} colSpan={2} className="text-center px-2.5 py-1 text-[9px] text-on-surface-variant uppercase border-l border-outline-variant whitespace-nowrap">Medição {i + 1}<br /><span className="font-normal normal-case">{dataBR(med.data)}</span></th>
                                  ))}
                                  <th colSpan={2} className="text-center px-2.5 py-1 text-[9px] text-primary uppercase border-l border-outline-variant whitespace-nowrap">Acumulado</th>
                                  <th colSpan={2} className="text-center px-2.5 py-1 text-[9px] text-error uppercase border-l border-outline-variant whitespace-nowrap">Falta</th>
                                </tr>
                                <tr className="bg-surface-container-high">
                                  {mapa.medicoesReais.map(med => (
                                    <Fragment key={med.id}>
                                      <th className="text-center px-2.5 py-1 text-[9px] text-on-surface-variant border-l border-outline-variant">%</th>
                                      <th className="text-center px-2.5 py-1 text-[9px] text-on-surface-variant">R$</th>
                                    </Fragment>
                                  ))}
                                  <th className="text-center px-2.5 py-1 text-[9px] text-primary border-l border-outline-variant">%</th>
                                  <th className="text-center px-2.5 py-1 text-[9px] text-primary">R$</th>
                                  <th className="text-center px-2.5 py-1 text-[9px] text-error border-l border-outline-variant">%</th>
                                  <th className="text-center px-2.5 py-1 text-[9px] text-error">R$</th>
                                </tr>
                              </thead>
                              <tbody>
                                {mapa.linhas.length === 0 ? (
                                  <tr><td colSpan={8 + mapa.medicoesReais.length * 2} className="text-center py-6 text-on-surface-variant">Nenhum item de escopo encontrado</td></tr>
                                ) : mapa.linhas.map(l => {
                                  const categoriaAtual = l.item.categoria || 'Outros'
                                  const mostrarCategoria = categoriaAtual !== categoriaAnteriorMapa
                                  categoriaAnteriorMapa = categoriaAtual
                                  return (
                                    <Fragment key={l.item.id}>
                                      {mostrarCategoria && (
                                        <tr><td colSpan={8 + mapa.medicoesReais.length * 2} className="px-2.5 py-1.5 bg-surface-container-high text-primary font-bold text-[10px] uppercase">{categoriaAtual}</td></tr>
                                      )}
                                      <tr className="border-b border-outline-variant hover:bg-surface-variant/20">
                                        <td className="px-2.5 py-2 font-semibold text-on-surface whitespace-nowrap">{l.item.nome}</td>
                                        <td className="px-2.5 py-2 text-center text-on-surface-variant whitespace-nowrap">{l.item.unidade || '—'}</td>
                                        <td className="px-2.5 py-2 text-center text-on-surface-variant whitespace-nowrap">{l.item.quantidade ?? '—'}</td>
                                        <td className="px-2.5 py-2 text-right whitespace-nowrap">{moeda(l.valorBase)}</td>
                                        {l.porMedicao.map((pm, i) => (
                                          <Fragment key={i}>
                                            <td className="px-2.5 py-2 text-center text-on-surface-variant border-l border-outline-variant whitespace-nowrap">{pm.pctPeriodo.toFixed(0)}%</td>
                                            <td className="px-2.5 py-2 text-right text-on-surface-variant whitespace-nowrap">{moeda(pm.valorPeriodo)}</td>
                                          </Fragment>
                                        ))}
                                        <td className="px-2.5 py-2 text-center font-bold text-primary border-l border-outline-variant whitespace-nowrap">{l.pctAcum.toFixed(0)}%</td>
                                        <td className="px-2.5 py-2 text-right font-bold text-primary whitespace-nowrap">{moeda(l.valorAcum)}</td>
                                        <td className="px-2.5 py-2 text-center text-error border-l border-outline-variant whitespace-nowrap">{l.pctFalta.toFixed(0)}%</td>
                                        <td className="px-2.5 py-2 text-right text-error whitespace-nowrap">{moeda(l.valorFalta)}</td>
                                      </tr>
                                    </Fragment>
                                  )
                                })}
                              </tbody>
                              {mapa.linhas.length > 0 && (
                                <tfoot>
                                  <tr className="bg-surface-container-low font-bold">
                                    <td colSpan={3} className="px-2.5 py-2 whitespace-nowrap">TOTAL GERAL</td>
                                    <td className="px-2.5 py-2 text-right whitespace-nowrap">{moeda(mapa.totalBase)}</td>
                                    {mapa.totaisPorMedicao.map((v, i) => (
                                      <Fragment key={i}>
                                        <td className="px-2.5 py-2 text-center text-[10px] text-on-surface-variant border-l border-outline-variant whitespace-nowrap">{mapa.totalBase > 0 ? ((v / mapa.totalBase) * 100).toFixed(0) : '0'}%</td>
                                        <td className="px-2.5 py-2 text-right whitespace-nowrap">{moeda(v)}</td>
                                      </Fragment>
                                    ))}
                                    <td className="px-2.5 py-2 text-center text-primary border-l border-outline-variant whitespace-nowrap">{mapa.totalPctAcum.toFixed(0)}%</td>
                                    <td className="px-2.5 py-2 text-right text-primary whitespace-nowrap">{moeda(mapa.totalAcum)}</td>
                                    <td className="px-2.5 py-2 text-center text-error border-l border-outline-variant whitespace-nowrap">{mapa.totalPctFalta.toFixed(0)}%</td>
                                    <td className="px-2.5 py-2 text-right text-error whitespace-nowrap">{moeda(mapa.totalFalta)}</td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        )
                      })()}
                      {aberto && (
                        <div className="border-t border-outline-variant divide-y divide-outline-variant">
                          {medsComTotais.map(({ med, indice, totalLiquido, totalPeriodo, descontoAdiantamento, statusPag, isAdiantamento }) => (
                            <div key={med.id} className="flex justify-between items-center px-4 py-3 flex-wrap gap-2">
                              <div>
                                <div className="font-semibold text-sm text-on-surface">{isAdiantamento ? '💰 Adiantamento' : `Medição ${indice}`} <span className="text-on-surface-variant font-normal">· {med.numero}</span>{isAdiantamento && med.observacao && <span className="text-on-surface-variant font-normal"> — {med.observacao}</span>}</div>
                                <div className="text-[11px] text-on-surface-variant" data-testid="resumo-medicao-lista">{dataBR(med.data)} · {isAdiantamento ? moeda(totalLiquido) : <>medido {moeda(totalPeriodo)}{descontoAdiantamento > 0.005 ? <> · abatido do adiantamento {moeda(descontoAdiantamento)}</> : null} · <b className={totalLiquido > 0.005 ? 'text-on-surface' : 'text-primary-container'}>a pagar {moeda(totalLiquido)}</b></>}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusPag === 'pago' ? 'bg-primary-container/10 text-primary-container border-primary-container/20' : statusPag === 'programado' ? 'bg-tertiary/10 text-tertiary border-tertiary/20' : 'bg-surface-variant text-on-surface-variant border-outline-variant'}`}>
                                  {statusPag === 'pago' ? '✅ Pago' : statusPag === 'programado' ? '📅 Programado' : (!isAdiantamento && totalLiquido <= 0.005 && totalPeriodo > 0) ? '✅ Abatido do adiantamento' : '📝 Rascunho'}
                                </span>
                                {statusPag === 'programado' && (
                                  <button className={btnEditSmCls} onClick={() => marcarMedicaoPaga(med.lancamento_id)} title="Confirmar que o pagamento já foi feito">✓ Pago</button>
                                )}
                                {isAdiantamento ? (
                                  <button className={btnEditSmCls} onClick={() => abrirProgramarPagamento(med, totalLiquido)}>{statusPag === 'rascunho' ? '📅 Programar' : 'Alterar data'}</button>
                                ) : (
                                  <button className={btnEditSmCls} onClick={() => { const itensFiltrados = svs.filter(s => med.tipo !== 'fornecedor' || !med.fornecedor || s.fornecedor === med.fornecedor); abrirPreenchimentoMedicao(med, itensFiltrados) }}>Abrir</button>
                                )}
                                <button className={btnDangerSmCls} onClick={async () => { if (confirm('Excluir esta medição?')) { await remover('medicoes', med.id); carregar() } }}>×</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* aba medições — preenchimento */}
        {abaDetalhe === 'medicoes' && medicaoAtiva && (() => {
          const itensFiltrados = svs.filter(s => medicaoAtiva.tipo !== 'fornecedor' || !medicaoAtiva.fornecedor || s.fornecedor === medicaoAtiva.fornecedor)
          const itensOrdenadosPreench = ordenarServicosObra(itensFiltrados)
          const retPct = parseFloat(orcamentoObra?.retencao_percentual || 0)
          const chaveGrupoAtual = medicaoAtiva.tipo === 'cliente' ? '__cliente__' : (medicaoAtiva.fornecedor || '—')
          const grupoAtual = gruposMedicao.find(g => g.chave === chaveGrupoAtual)
          const previstoGrupoAtual = medicaoAtiva.tipo === 'cliente' ? contrato : itensFiltrados.reduce((a, s) => a + parseFloat(s.valor_previsto || 0), 0)
          // Histórico das medições ANTERIORES do mesmo grupo (tudo, menos a que está sendo
          // preenchida agora), pivotado com o mesmo motor do Mapa Geral — pra a pessoa
          // enxergar Medição 1, Medição 2... lado a lado com a que está preenchendo agora,
          // em vez de precisar abrir cada uma separadamente.
          const grupoHistorico = grupoAtual ? { ...grupoAtual, medicoes: grupoAtual.medicoes.filter(m => m.id !== medicaoAtiva.id) } : null
          const mapaHistorico = grupoHistorico ? mapaGeralGrupo(grupoHistorico, itensFiltrados) : null
          const itensComValores = itensOrdenadosPreench.map(item => {
            const p = preenchimento[item.id] || { valor_base: String(baseParaMedicao(item, medicaoAtiva.tipo)), percentual: '0' }
            const ultimo = ultimoRegistro(item.id, medicaoAtiva.id, medicaoAtiva.tipo, medicaoAtiva.fornecedor, medicaoAtiva.data)
            const acumAnterior = ultimo ? ultimo.valor_base * ultimo.percentual_acumulado : 0
            const valorBase = parseFloat(p.valor_base || '0')
            const percAtual = parseFloat(p.percentual || '0') / 100
            const acumAtual = valorBase * percAtual
            const valorPeriodo = acumAtual - acumAnterior
            const historico = mapaHistorico?.linhas.find(l => l.item.id === item.id)
            return { item, p, acumAnterior, acumAtual, valorBase, valorPeriodo, porMedicaoHistorico: historico?.porMedicao || [] }
          })
          const totalPeriodo = itensComValores.reduce((a, l) => a + l.valorPeriodo, 0)
          // Base do grupo pra ratear o desconto do adiantamento proporcionalmente (mesma lógica
          // de totalsMedicao, mas com os valores AO VIVO desta tela, antes de salvar).
          const totalBaseGrupoAtual = itensComValores.reduce((a, l) => a + l.valorBase, 0)
          const totalAdiantamentoGrupo = (grupoAtual?.medicoes || []).filter(m => m.valor_adiantamento != null).reduce((a, m) => a + parseFloat(m.valor_adiantamento || 0), 0)
          // Abatimento ao vivo (mesma regra de totalsMedicao): % digitado (0–100) ou o automático do modo escolhido.
          const pctDigitadoDesc = descAdiantPctInput.trim() === '' ? null : Math.min(Math.max(parseFloat(descAdiantPctInput.replace(',', '.')) || 0, 0), 100) / 100
          const jaAbatidoAdiantamento = descontoJaAbatido(medicaoAtiva)
          const adiantadoAteDataAtual = adiantadoAteDataGrupo(medicaoAtiva)
          const abatLive = calcularAbatimento({
            modo: modoAbatInput, pctDigitado: pctDigitadoDesc, bruto: totalPeriodo, retencaoPct: retPct,
            totalBaseGrupo: totalBaseGrupoAtual, adiantadoTotal: totalAdiantamentoGrupo, adiantadoAteData: adiantadoAteDataAtual, jaAbatido: jaAbatidoAdiantamento,
          })
          const pctAutoDesconto = abatLive.pctAuto
          const pctDescontoAplicado = abatLive.pct
          const saldoAdiantamentoGrupo = abatLive.saldo
          const descontoAdiantamentoTotal = abatLive.desconto
          let totalRetencao = 0, totalLiquido = 0
          const linhas = itensComValores.map(l => {
            const retencao = l.valorPeriodo * retPct
            const descontoAdiantamento = totalPeriodo !== 0 ? (l.valorPeriodo / totalPeriodo) * descontoAdiantamentoTotal : 0
            const liquido = l.valorPeriodo - retencao - descontoAdiantamento
            totalRetencao += retencao; totalLiquido += liquido
            return { ...l, retencao, descontoAdiantamento, liquido }
          })
          let pagoGrupoAtual = 0
          grupoAtual?.medicoes.forEach(med => {
            const lanc = med.lancamento_id ? lancs.find(l => l.id === med.lancamento_id) : null
            if (lanc?.status === 'pago') pagoGrupoAtual += totalsMedicao(med).totalLiquido
          })
          const faltaGrupoAtual = previstoGrupoAtual - pagoGrupoAtual
          return (
            <div className={sectionCls}>
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div>
                  <button className={btnSecondaryCls + ' mb-2'} onClick={() => setMedicaoAtiva(null)}>← Voltar às Medições</button>
                  <div className="text-sm font-bold text-on-surface">{medicaoAtiva.numero} — {medicaoAtiva.tipo === 'fornecedor' ? `Fornecedor: ${medicaoAtiva.fornecedor || '—'}` : 'Cliente'}</div>
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
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {medicaoAtiva.lancamento_id ? (
                    <div className="text-[11px] text-primary-container font-semibold">
                      ✅ Programado para {dataBR(medicaoAtiva.data_pagamento_programada)}{' '}
                      <button className="text-primary underline font-semibold" onClick={() => abrirProgramarPagamento(medicaoAtiva, totalLiquido)}>Alterar data</button>
                    </div>
                  ) : totalLiquido <= 0.005 ? (
                    <div className="text-[11px] text-primary-container font-semibold" data-testid="sem-valor-a-pagar">✅ Sem valor a pagar — abatido do adiantamento</div>
                  ) : (
                    <button className="bg-tertiary/10 border border-tertiary/30 text-tertiary rounded-lg px-4 py-2.5 text-sm font-bold hover:bg-tertiary/20 transition-all cursor-pointer" onClick={() => abrirProgramarPagamento(medicaoAtiva, totalLiquido)} data-testid="btn-programar-pagamento">📅 Programar Pagamento ({moeda(totalLiquido)})</button>
                  )}
                  <button className="bg-primary-container text-on-primary-container rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer" onClick={() => gerarPDFMedicao(medicaoAtiva, linhas, detalhe)}>🖨️ Gerar Boletim PDF</button>
                  <button className={btnSecondaryCls} onClick={() => grupoAtual && gerarPDFMedicaoCompleta(grupoAtual, detalhe, previstoGrupoAtual)} title="Histórico completo de todas as medições já lançadas para este fornecedor/cliente">🖨️ Relatório Completo</button>
                </div>
              </div>
              {medicaoAtiva.lancamento_id && (() => {
                const lanc = lancs.find(l => l.id === medicaoAtiva.lancamento_id)
                if (!lanc) return null
                const calculado = totalsMedicao(medicaoAtiva).totalLiquido
                if (Math.abs(parseFloat(lanc.valor || 0) - calculado) < 0.01) return null
                return (
                  <div className="mb-4 bg-error/10 border border-error/30 rounded-lg p-3 text-[12px] text-on-surface" data-testid="aviso-lancamento-divergente">
                    ⚠️ O lançamento financeiro desta medição está em <b>{moeda(parseFloat(lanc.valor || 0))}</b> ({lanc.status === 'pago' ? 'pago' : 'pendente'}), mas o valor a pagar calculado é <b>{moeda(calculado)}</b>.{' '}
                    <button className="text-primary underline font-semibold" onClick={() => ajustarLancamentoMedicao(medicaoAtiva, calculado)} data-testid="btn-ajustar-lancamento">{calculado <= 0.005 ? 'Remover lançamento' : 'Ajustar lançamento para ' + moeda(calculado)}</button>
                  </div>
                )
              })()}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3">
                  <div className="text-[10px] text-on-surface-variant uppercase">{medicaoAtiva.tipo === 'cliente' ? 'Contrato' : 'Previsto'} (grupo)</div>
                  <div className="text-sm font-bold text-on-surface">{moeda(previstoGrupoAtual)}</div>
                </div>
                <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3">
                  <div className="text-[10px] text-on-surface-variant uppercase">{medicaoAtiva.tipo === 'cliente' ? 'Recebido' : 'Pago'} até agora</div>
                  <div className="text-sm font-bold text-primary-container">{moeda(pagoGrupoAtual)}</div>
                </div>
                <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3">
                  <div className="text-[10px] text-on-surface-variant uppercase">Falta {medicaoAtiva.tipo === 'cliente' ? 'Receber' : 'Pagar'}</div>
                  <div className="text-sm font-bold text-error">{moeda(faltaGrupoAtual)}</div>
                </div>
              </div>
              {linhas.length === 0 ? (
                <div className="text-center py-8 text-on-surface-variant">Nenhum item para medir (verifique o fornecedor filtrado)</div>
              ) : (() => {
                let categoriaAnteriorPreench: string | null = null
                return (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs" style={{ minWidth: 560 + (mapaHistorico?.medicoesReais.length || 0) * 140 }}>
                    <thead>
                      <tr className="border-b border-outline-variant">
                        <th rowSpan={2} className="text-left px-2.5 py-2 text-[10px] text-on-surface-variant uppercase bg-surface-container-high whitespace-nowrap">Serviço</th>
                        <th rowSpan={2} className="text-right px-2.5 py-2 text-[10px] text-on-surface-variant uppercase bg-surface-container-high whitespace-nowrap">Custo Total</th>
                        {(mapaHistorico?.medicoesReais || []).map((med, i) => (
                          <th key={med.id} colSpan={2} className="text-center px-2.5 py-1 text-[9px] text-on-surface-variant uppercase bg-surface-container-high border-l border-outline-variant whitespace-nowrap">Medição {i + 1}<br /><span className="font-normal normal-case">{dataBR(med.data)}</span></th>
                        ))}
                        <th colSpan={2} className="text-center px-2.5 py-1 text-[9px] text-tertiary uppercase bg-tertiary/10 border-l border-outline-variant whitespace-nowrap">Medição {(mapaHistorico?.medicoesReais.length || 0) + 1} (atual)</th>
                        <th colSpan={2} className="text-center px-2.5 py-1 text-[9px] text-primary uppercase bg-surface-container-high border-l border-outline-variant whitespace-nowrap">Acumulado</th>
                        <th colSpan={2} className="text-center px-2.5 py-1 text-[9px] text-error uppercase bg-surface-container-high border-l border-outline-variant whitespace-nowrap">Falta</th>
                      </tr>
                      <tr className="border-b border-outline-variant">
                        {(mapaHistorico?.medicoesReais || []).map(med => (
                          <Fragment key={med.id}>
                            <th className="text-center px-2.5 py-1 text-[9px] text-on-surface-variant bg-surface-container-high border-l border-outline-variant">%</th>
                            <th className="text-center px-2.5 py-1 text-[9px] text-on-surface-variant bg-surface-container-high">R$</th>
                          </Fragment>
                        ))}
                        <th className="text-center px-2.5 py-1 text-[9px] text-tertiary bg-tertiary/10 border-l border-outline-variant">%</th>
                        <th className="text-center px-2.5 py-1 text-[9px] text-tertiary bg-tertiary/10">R$</th>
                        <th className="text-center px-2.5 py-1 text-[9px] text-primary bg-surface-container-high border-l border-outline-variant">%</th>
                        <th className="text-center px-2.5 py-1 text-[9px] text-primary bg-surface-container-high">R$</th>
                        <th className="text-center px-2.5 py-1 text-[9px] text-error bg-surface-container-high border-l border-outline-variant">%</th>
                        <th className="text-center px-2.5 py-1 text-[9px] text-error bg-surface-container-high">R$</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map(({ item, p, acumAtual, valorBase, valorPeriodo, porMedicaoHistorico }) => {
                        const categoriaAtual = item.categoria || 'Outros'
                        const mostrarCategoria = categoriaAtual !== categoriaAnteriorPreench
                        categoriaAnteriorPreench = categoriaAtual
                        const pctAcum = valorBase > 0 ? (acumAtual / valorBase) * 100 : 0
                        const pctAtualInput = parseFloat(p.percentual || '0')
                        return (
                          <Fragment key={item.id}>
                            {mostrarCategoria && (
                              <tr><td colSpan={8 + (mapaHistorico?.medicoesReais.length || 0) * 2} className="px-2.5 py-1.5 bg-surface-container-high text-primary font-bold text-[10px] uppercase">{categoriaAtual}</td></tr>
                            )}
                            <tr className="border-b border-outline-variant hover:bg-surface-variant/20">
                              <td className="px-2.5 py-2 font-semibold text-on-surface whitespace-nowrap">{item.nome}</td>
                              <td className="px-2.5 py-2 whitespace-nowrap">
                                <input className={inputCls + ' text-xs py-1 w-24'} type="number" value={p.valor_base}
                                  onChange={e => setPreenchimento({ ...preenchimento, [item.id]: { ...p, valor_base: e.target.value } })} />
                              </td>
                              {porMedicaoHistorico.map((pm, i) => (
                                <Fragment key={i}>
                                  <td className="px-2.5 py-2 text-center text-on-surface-variant border-l border-outline-variant whitespace-nowrap">{pm.pctPeriodo.toFixed(0)}%</td>
                                  <td className="px-2.5 py-2 text-right text-on-surface-variant whitespace-nowrap">{moeda(pm.valorPeriodo)}</td>
                                </Fragment>
                              ))}
                              <td className="px-2.5 py-2 text-center bg-tertiary/5 border-l border-outline-variant whitespace-nowrap">
                                <input className={inputCls + ' text-xs py-1 w-16 text-center'} type="number" min="0" max="100" value={p.percentual}
                                  onChange={e => setPreenchimento({ ...preenchimento, [item.id]: { ...p, percentual: e.target.value } })} />
                              </td>
                              <td className="px-2.5 py-2 text-right font-semibold text-tertiary bg-tertiary/5 whitespace-nowrap">{moeda(valorPeriodo)}</td>
                              <td className="px-2.5 py-2 text-center font-bold text-primary border-l border-outline-variant whitespace-nowrap">{pctAcum.toFixed(0)}%</td>
                              <td className="px-2.5 py-2 text-right font-bold text-primary whitespace-nowrap">{moeda(acumAtual)}</td>
                              <td className="px-2.5 py-2 text-center text-error border-l border-outline-variant whitespace-nowrap">{Math.max(100 - pctAcum, 0).toFixed(0)}%</td>
                              <td className="px-2.5 py-2 text-right text-error whitespace-nowrap">{moeda(Math.max(valorBase - acumAtual, 0))}</td>
                            </tr>
                          </Fragment>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-surface-container-low font-bold">
                        <td className="px-2.5 py-2 whitespace-nowrap">Total desta medição</td>
                        <td className="px-2.5 py-2 text-right whitespace-nowrap">{moeda(linhas.reduce((a, l) => a + l.valorBase, 0))}</td>
                        {(mapaHistorico?.totaisPorMedicao || []).map((v, i) => (
                          <td key={i} colSpan={2} className="px-2.5 py-2 text-right text-[10px] text-on-surface-variant border-l border-outline-variant whitespace-nowrap">{moeda(v)}</td>
                        ))}
                        <td colSpan={2} className="px-2.5 py-2 text-right text-tertiary bg-tertiary/5 border-l border-outline-variant whitespace-nowrap">{moeda(totalPeriodo)}</td>
                        <td colSpan={2} className="px-2.5 py-2 text-right text-primary border-l border-outline-variant whitespace-nowrap">{moeda(linhas.reduce((a, l) => a + l.acumAtual, 0))}</td>
                        <td colSpan={2} className="px-2.5 py-2 text-right text-error border-l border-outline-variant whitespace-nowrap">{moeda(linhas.reduce((a, l) => a + Math.max(l.valorBase - l.acumAtual, 0), 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                )
              })()}
              {totalAdiantamentoGrupo > 0 && (
                <div className="mt-4 bg-tertiary/5 border border-tertiary/30 rounded-lg p-3.5" data-testid="painel-desconto-adiantamento">
                  <div className="text-[10px] text-tertiary font-bold uppercase mb-2">💰 Abatimento do adiantamento</div>
                  <div className="flex flex-wrap gap-4 mb-3">
                    <label className="flex items-start gap-2 text-[12px] cursor-pointer max-w-[340px]">
                      <input type="radio" name="modo-abatimento" className="mt-0.5" checked={modoAbatInput === 'compensacao'} onChange={() => setModoAbatInput('compensacao')} data-testid="modo-compensacao" />
                      <span><b className="text-on-surface">Compensar o valor da medição</b><br /><span className="text-on-surface-variant">abate do saldo de adiantamento disponível; o fornecedor recebe só o que sobrar</span></span>
                    </label>
                    <label className="flex items-start gap-2 text-[12px] cursor-pointer max-w-[340px]">
                      <input type="radio" name="modo-abatimento" className="mt-0.5" checked={modoAbatInput === 'proporcional'} onChange={() => setModoAbatInput('proporcional')} data-testid="modo-proporcional" />
                      <span><b className="text-on-surface">Proporcional ao avanço</b><br /><span className="text-on-surface-variant">abate o % de avanço da medição sobre o total adiantado</span></span>
                    </label>
                  </div>
                  <div className="flex flex-wrap items-end gap-4">
                    <div>
                      <div className="text-[10px] text-on-surface-variant uppercase mb-1">{modoAbatInput === 'compensacao' ? '% do valor da medição a abater' : '% do adiantamento a abater'}</div>
                      <div className="flex items-center gap-1.5">
                        <input type="number" step="0.01" min="0" max="100" inputMode="decimal"
                          className="w-24 bg-surface-container-low border border-outline-variant rounded px-2 py-1.5 text-on-surface text-sm"
                          placeholder={(pctAutoDesconto * 100).toFixed(2)} value={descAdiantPctInput}
                          onChange={e => setDescAdiantPctInput(e.target.value)} data-testid="input-desconto-adiantamento-pct" />
                        <span className="text-sm text-on-surface-variant">%</span>
                        {descAdiantPctInput.trim() !== '' && (
                          <button type="button" className="text-[11px] text-primary underline ml-1" onClick={() => setDescAdiantPctInput('')}>usar automático</button>
                        )}
                        {modoAbatInput === 'proporcional' && <button type="button" className="text-[11px] text-primary underline ml-1" onClick={() => setDescAdiantPctInput('100')}>descontar tudo (100%)</button>}
                      </div>
                    </div>
                    <div className="text-[11px] text-on-surface-variant leading-relaxed" data-testid="resumo-abatimento">
                      <div>Adiantado {modoAbatInput === 'compensacao' ? 'até a data desta medição' : 'no total'}: <b className="text-on-surface">{moeda(modoAbatInput === 'compensacao' ? adiantadoAteDataAtual : totalAdiantamentoGrupo)}</b> · já abatido em medições anteriores: <b className="text-on-surface">{moeda(jaAbatidoAdiantamento)}</b> · saldo disponível: <b className="text-on-surface">{moeda(saldoAdiantamentoGrupo)}</b></div>
                      <div>{descAdiantPctInput.trim() === '' ? <>Automático: {(pctAutoDesconto * 100).toFixed(2)}%</> : <>Digitado: {(pctDescontoAplicado * 100).toFixed(2)}%</>} → abatimento de <b className="text-tertiary">{moeda(descontoAdiantamentoTotal)}</b>{abatLive.limitado ? ' (limitado ao saldo do adiantamento)' : ''} · <b className="text-primary-container" data-testid="valor-a-pagar-fornecedor">{totalLiquido > 0.005 ? 'a pagar ao fornecedor: ' + moeda(totalLiquido) : 'nada a pagar: tudo abatido do adiantamento'}</b></div>
                    </div>
                  </div>
                </div>
              )}
              <div className={`grid grid-cols-1 gap-3 mt-4 ${totalAdiantamentoGrupo > 0 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
                <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3">
                  <div className="text-[10px] text-on-surface-variant uppercase">Bruto desta medição</div>
                  <div className="text-sm font-bold text-on-surface">{moeda(totalPeriodo)}</div>
                </div>
                <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3">
                  <div className="text-[10px] text-on-surface-variant uppercase">Retenção</div>
                  <div className="text-sm font-bold text-error">{moeda(totalRetencao)}</div>
                </div>
                {totalAdiantamentoGrupo > 0 && (
                  <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3" title="Desconto do adiantamento já pago (percentual editável acima)">
                    <div className="text-[10px] text-on-surface-variant uppercase">Desconto Adiantamento</div>
                    <div className="text-sm font-bold text-tertiary">{moeda(descontoAdiantamentoTotal)}</div>
                  </div>
                )}
                <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3">
                  <div className="text-[10px] text-on-surface-variant uppercase">Líquido desta medição</div>
                  <div className="text-sm font-bold text-primary-container">{moeda(totalLiquido)}</div>
                </div>
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <button className={btnPrimaryCls} onClick={() => salvarPreenchimentoMedicao(itensFiltrados)}>Salvar Medição</button>
              </div>
            </div>
          )
        })()}

        {/* aba visitas */}
        {abaDetalhe === 'visitas' && (
          <div className={sectionCls}>
            <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
              <div>
                <div className="text-sm font-bold text-on-surface">📷 Relatórios de Visita</div>
                <div className="text-body-sm text-on-surface-variant mt-0.5">Registros de acompanhamento da obra com fotos e observações</div>
              </div>
              <button className={btnPrimaryCls} onClick={abrirNovaVisita}>+ Relatório de Visita</button>
            </div>
            <input className={inputCls + ' mb-4'} placeholder="Pesquisar por data, descrição ou pendência..." value={buscaRv} onChange={e => setBuscaRv(e.target.value)} />
            {visitasObra.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant text-body-sm">Nenhum relatório de visita encontrado</div>
            ) : (
              <div className="flex flex-col gap-3">
                {visitasObra.map(v => {
                  const climaLabel = CLIMA_OPCOES.find(c => c.v === v.clima)?.l || v.clima
                  return (
                    <div key={v.id} className="bg-surface-container-low border border-outline-variant rounded-xl p-4">
                      <div className="flex justify-between items-start gap-2 mb-1.5">
                        <div>
                          <span className="font-semibold text-sm text-on-surface">{dataBR(v.data)}</span>
                          {climaLabel && <span className="text-[11px] text-on-surface-variant ml-2">{climaLabel}</span>}
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button className={btnEditSmCls} onClick={() => gerarPDFRelatorioVisita(detalhe, v)} title="Gerar PDF para enviar ao cliente">🖨️</button>
                          <button className={btnEditSmCls} onClick={() => abrirEditarVisita(v)}>✏️</button>
                          <button className={btnDangerSmCls} onClick={() => excluirVisita(v)}>×</button>
                        </div>
                      </div>
                      {v.descricao && <div className="text-body-sm text-on-surface-variant mb-1.5">{v.descricao}</div>}
                      {v.pendencias && <div className="text-[11px] text-tertiary mb-1.5">⚠️ {v.pendencias}</div>}
                      <div className="text-[11px] text-on-surface-variant mb-2">{v.equipe_presente?.length || 0} pessoa(s) na equipe · {v.fotos?.length || 0} foto(s)</div>
                      {v.fotos?.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {v.fotos.map((f: any, i: number) => (
                            <div key={i} className="w-16 h-16 rounded-lg overflow-hidden border border-outline-variant relative group">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={f.url} alt={f.descricao || ''} className="w-full h-full object-cover" title={f.descricao || ''} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* modal nova/editar visita */}
        {(janela === 'nova_visita' || janela === 'editar_visita') && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[560px] max-h-[90vh] overflow-y-auto">
              <div className="text-base font-bold text-on-surface mb-5">{janela === 'editar_visita' ? '✏️ Editar Relatório de Visita' : '📷 Novo Relatório de Visita'}</div>
              <div className="flex flex-col gap-3.5">
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
                  <input type="file" accept="image/*" multiple
                    onChange={e => setFotosRv([...fotosRv, ...Array.from(e.target.files || []).map(file => ({ file, descricao: '' }))])}
                    className={inputCls} />
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
              </div>
              <div className="flex gap-2.5 justify-end mt-6">
                <button className={btnSecondaryCls} onClick={() => { setJanela(null); setFRv(FRV_VAZIO); setFotosRv([]); setRvEditando(null) }}>Cancelar</button>
                <button className={btnPrimaryCls} onClick={salvarRelatorioVisita} disabled={enviandoRv}>{enviandoRv ? 'Enviando...' : (janela === 'editar_visita' ? 'Salvar Alterações' : 'Salvar Relatório')}</button>
              </div>
            </div>
          </div>
        )}

        {/* modal nova medição */}
        {janela === 'nova_medicao' && svs.length > 0 && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[480px]">
              <div className="text-base font-bold text-on-surface mb-5">📐 Nova Medição</div>
              <div className="mb-3.5">
                <label className={labelCls}>Tipo</label>
                <select className={inputCls} value={fMedicao.tipo} onChange={e => setFMedicao({ ...fMedicao, tipo: e.target.value, fornecedor: '' })}>
                  <option value="cliente">Cobrar Cliente</option>
                  <option value="fornecedor">Pagar Fornecedor</option>
                </select>
              </div>
              {fMedicao.tipo === 'fornecedor' && (
                <div className="mb-3.5">
                  <label className={labelCls}>Fornecedor / Equipe</label>
                  <select className={inputCls} value={fMedicao.fornecedor} onChange={e => setFMedicao({ ...fMedicao, fornecedor: e.target.value })}>
                    <option value="">Todos os itens sem fornecedor específico</option>
                    {fornecedoresDisponiveis.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              )}
              {fMedicao.tipo === 'fornecedor' && (
                <label className="flex items-start gap-2.5 mb-3.5 px-3.5 py-2.5 bg-tertiary/5 border border-tertiary/20 rounded-lg cursor-pointer select-none">
                  <input type="checkbox" checked={fMedicao.adiantamento} onChange={e => setFMedicao({ ...fMedicao, adiantamento: e.target.checked })} className="w-4 h-4 accent-tertiary cursor-pointer mt-0.5" />
                  <span>
                    <span className="block text-body-sm font-semibold text-on-surface">💰 É um adiantamento</span>
                    <span className="block text-[11px] text-on-surface-variant mt-0.5">Valor fixo pago ao fornecedor antes do início dos serviços — entra no histórico dele e abate automaticamente das próximas medições.</span>
                  </span>
                </label>
              )}
              {fMedicao.tipo === 'fornecedor' && fMedicao.adiantamento && (
                <div className="mb-3.5">
                  <label className={labelCls}>Valor do Adiantamento (R$) *</label>
                  <input className={inputCls} type="number" placeholder="0,00" value={fMedicao.valor_adiantamento} onChange={e => setFMedicao({ ...fMedicao, valor_adiantamento: e.target.value })} />
                </div>
              )}
              <div className="mb-3.5">
                <label className={labelCls}>Data</label>
                <input className={inputCls} type="date" value={fMedicao.data} onChange={e => setFMedicao({ ...fMedicao, data: e.target.value })} />
              </div>
              <div className="mb-5">
                <label className={labelCls}>{fMedicao.tipo === 'fornecedor' && fMedicao.adiantamento ? 'Referente a *' : 'Observação'}</label>
                <input className={inputCls} placeholder={fMedicao.tipo === 'fornecedor' && fMedicao.adiantamento ? 'Ex: Entrada para início dos serviços, compra de material...' : ''} value={fMedicao.observacao} onChange={e => setFMedicao({ ...fMedicao, observacao: e.target.value })} />
              </div>
              <div className="flex gap-2 justify-end">
                <button className={btnSecondaryCls} onClick={() => setJanela(null)}>Cancelar</button>
                <button className={btnPrimaryCls} onClick={() => criarMedicao()}>{fMedicao.adiantamento ? 'Registrar Adiantamento' : 'Criar e Preencher'}</button>
              </div>
            </div>
          </div>
        )}

        {/* modal relatório pdf */}
        {janela === 'relatorio_pdf' && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[520px]">
              <div className="text-base font-bold text-on-surface mb-1.5">🖨️ Gerar Relatório de Status</div>
              <div className="text-body-sm text-on-surface-variant mb-5">Inclui resumo financeiro, curva S e distribuição de custos com os dados atuais da obra.</div>
              <div className="mb-5">
                <label className={labelCls}>Observações Técnicas e Riscos (opcional)</label>
                <textarea className={inputCls + ' min-h-[100px] resize-y'} placeholder="Ex: Atraso na entrega de material, risco identificado, ponto de atenção..." value={observacoesPdf} onChange={e => setObservacoesPdf(e.target.value)} />
              </div>
              <div className="flex gap-2 justify-end">
                <button className={btnSecondaryCls} onClick={() => setJanela(null)}>Cancelar</button>
                <button className={btnPrimaryCls} onClick={() => { setJanela(null); gerarPDFObra(detalhe, observacoesPdf) }}>Gerar PDF</button>
              </div>
            </div>
          </div>
        )}

        {/* modal programar pagamento da medição */}
        {janela === 'programar_pagamento' && medicaoProgramando && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[420px]">
              <div className="text-base font-bold text-on-surface mb-1.5">📅 Programar Pagamento</div>
              <div className="text-body-sm text-on-surface-variant mb-5">
                {medicaoProgramando.tipo === 'fornecedor' ? 'Saída' : 'Entrada'} de {moeda(totalLiquidoProgramar)} referente à medição {medicaoProgramando.numero}
              </div>
              <div className="mb-5">
                <label className={labelCls}>Data programada *</label>
                <input className={inputCls} type="date" value={dataProgramar} onChange={e => setDataProgramar(e.target.value)} />
              </div>
              <div className="flex gap-2 justify-end">
                <button className={btnSecondaryCls} onClick={() => { setJanela(null); setMedicaoProgramando(null) }}>Cancelar</button>
                <button className={btnPrimaryCls} onClick={confirmarProgramarPagamento}>Confirmar</button>
              </div>
            </div>
          </div>
        )}

        {/* modal Campo Cliente — login do cliente para acompanhar a obra */}
        {janela === 'campo_cliente' && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[640px] max-h-[92vh] overflow-y-auto" data-testid="modal-campo-cliente">
              <div className="text-base font-bold text-on-surface mb-1.5">👤 Campo Cliente</div>
              <div className="text-body-sm text-on-surface-variant mb-4">Crie o login do cliente para ele acompanhar <b className="text-on-surface">apenas esta obra</b> pelo VIGA: serviços contratados, cronograma, equipe, medições, relatórios de visita e financeiro (o que foi contratado e já pago). Nada de custos internos, compras, cartão ou lucro.</div>

              <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3 mb-4 flex items-center justify-between gap-2 flex-wrap">
                <div className="text-[12px] text-on-surface-variant">Endereço do portal: <b className="text-primary">{typeof window !== 'undefined' ? window.location.origin : ''}/cliente</b></div>
                <button className="text-[11px] text-primary underline" onClick={() => { navigator.clipboard?.writeText(window.location.origin + '/cliente'); setMsgAcesso('Link copiado!') }}>copiar link</button>
              </div>

              {acessosCriados.length > 0 && (
                <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 mb-4 text-[13px]" data-testid="acesso-criado">
                  <div className="font-bold text-primary mb-1">{acessosCriados.length > 1 ? acessosCriados.length + ' acessos prontos' : 'Acesso pronto'} — anote agora, a senha não fica visível depois:</div>
                  {acessosCriados.map((a, i) => (
                    <div key={i} className="mb-1.5">E-mail: <b>{a.email}</b> · Senha: <b className="font-mono">{a.senha}</b></div>
                  ))}
                  <button className="text-[11px] text-primary underline mt-1" onClick={() => navigator.clipboard?.writeText(acessosCriados.map(a => `Portal: ${window.location.origin}/cliente\nE-mail: ${a.email}\nSenha: ${a.senha}`).join('\n\n'))}>copiar dados de acesso</button>
                </div>
              )}

              <div className="text-[11px] font-bold text-on-surface-variant uppercase mb-2">Acessos desta obra</div>
              {carregandoAcessos ? <div className="text-sm text-on-surface-variant py-3">Carregando...</div> : acessosCliente.length === 0 ? (
                <div className="text-sm text-on-surface-variant py-3">Nenhum acesso criado ainda.</div>
              ) : (
                <div className="flex flex-col gap-2 mb-4">
                  {acessosCliente.map(a => (
                    <div key={a.id} className="bg-surface-container-low border border-outline-variant rounded-lg p-3" data-testid="linha-acesso-cliente">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <div className="text-sm font-semibold text-on-surface">{a.nome || '—'} <span className="text-on-surface-variant font-normal">· {a.email}</span></div>
                          <div className="text-[11px] text-on-surface-variant">{a.ativo ? '🟢 Ativo' : '🔴 Desativado'} · último acesso: {a.ultimo_login ? new Date(a.ultimo_login).toLocaleString('pt-BR') : 'nunca'}</div>
                        </div>
                        <div className="flex gap-2 text-[11px]">
                          <button className="text-primary underline" onClick={() => setRedefinindoAcesso({ id: a.id, senha: gerarSenhaAleatoria() })}>Redefinir senha</button>
                          <button className="text-tertiary underline" onClick={() => alternarAcessoCliente(a)}>{a.ativo ? 'Desativar' : 'Reativar'}</button>
                          <button className="text-error underline" onClick={() => removerAcessoCliente(a)}>Remover</button>
                        </div>
                      </div>
                      {redefinindoAcesso && redefinindoAcesso.id === a.id && (
                        <div className="flex gap-2 mt-2 items-center">
                          <input className={inputCls + ' text-sm py-1.5'} value={redefinindoAcesso.senha} onChange={e => { const v = e.target.value; setRedefinindoAcesso(r => r ? { ...r, senha: v } : r) }} />
                          <button className={btnPrimaryCls + ' py-1.5'} onClick={confirmarNovaSenhaCliente}>Salvar</button>
                          <button className={btnSecondaryCls + ' py-1.5'} onClick={() => setRedefinindoAcesso(null)}>Cancelar</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="text-[11px] font-bold text-on-surface-variant uppercase mb-2 mt-2">Novos acessos</div>
              <div className="flex flex-col gap-3 mb-3">
                {fAcessos.map((l, i) => (
                  <div key={i} className="bg-surface-container-low border border-outline-variant rounded-lg p-3" data-testid="linha-novo-acesso">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[11px] text-on-surface-variant font-semibold">Acesso {i + 1}</div>
                      {fAcessos.length > 1 && <button className="text-[11px] text-error underline" onClick={() => removerLinhaAcesso(i)}>remover</button>}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <div><label className={labelCls}>Nome</label><input className={inputCls} value={l.nome} onChange={e => atualizarLinhaAcesso(i, { nome: e.target.value })} data-testid="input-nome-acesso" /></div>
                      <div><label className={labelCls}>E-mail *</label><input className={inputCls} type="email" value={l.email} onChange={e => atualizarLinhaAcesso(i, { email: e.target.value })} data-testid="input-email-acesso" /></div>
                    </div>
                    <label className={labelCls}>Senha * (mín. 8 caracteres)</label>
                    <div className="flex gap-2">
                      <input className={inputCls} value={l.senha} onChange={e => atualizarLinhaAcesso(i, { senha: e.target.value })} data-testid="input-senha-acesso" />
                      <button className={btnSecondaryCls + ' whitespace-nowrap'} onClick={() => atualizarLinhaAcesso(i, { senha: gerarSenhaAleatoria() })}>Gerar</button>
                    </div>
                  </div>
                ))}
              </div>
              <button className="text-sm text-primary font-semibold mb-3" onClick={adicionarLinhaAcesso} data-testid="btn-adicionar-acesso">＋ Adicionar outro acesso</button>
              {msgAcesso && <div className={'text-sm mb-3 rounded-lg px-3 py-2 ' + (/copiado/i.test(msgAcesso) ? 'text-primary bg-primary/10' : 'text-error bg-error/10 border border-error/30 font-semibold')} data-testid="msg-acesso">{msgAcesso}</div>}
              <div className="flex gap-2 justify-end">
                <button className={btnSecondaryCls} onClick={() => setJanela(null)}>Fechar</button>
                <button className={btnPrimaryCls + (salvandoAcessos ? ' opacity-60' : '')} disabled={salvandoAcessos} onClick={criarAcessosCliente} data-testid="btn-criar-acesso">{salvandoAcessos ? 'Criando...' : fAcessos.length > 1 ? 'Criar ' + fAcessos.length + ' acessos' : 'Criar acesso'}</button>
              </div>
            </div>
          </div>
        )}

        {/* modal justificativa de atraso / mudança de data do cronograma */}
        {janela === 'alterar_etapa' && alteracaoCron && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && (setJanela(null), setAlteracaoCron(null))}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[480px]" data-testid="modal-alterar-etapa">
              <div className="text-base font-bold text-on-surface mb-1.5">📝 Registrar alteração no cronograma</div>
              <div className="text-body-sm text-on-surface-variant mb-4">
                Etapa <b className="text-on-surface">{alteracaoCron.nome}</b>
                <div className="mt-1 text-[12px]">
                  {'data_inicio_prevista' in alteracaoCron.patch && <div>Início: {dataBR(alteracaoCron.et.data_inicio_prevista)} → <b className="text-on-surface">{dataBR(alteracaoCron.patch.data_inicio_prevista)}</b></div>}
                  {'data_fim_prevista' in alteracaoCron.patch && <div>Fim: {dataBR(alteracaoCron.et.data_fim_prevista)} → <b className="text-on-surface">{dataBR(alteracaoCron.patch.data_fim_prevista)}</b></div>}
                  {'status' in alteracaoCron.patch && <div>Status: {ETAPA_STATUS[alteracaoCron.et.status] || '—'} → <b className="text-on-surface">{ETAPA_STATUS[alteracaoCron.patch.status]}</b></div>}
                </div>
              </div>
              <div className="mb-3.5">
                <label className={labelCls}>Tipo da alteração</label>
                <select className={inputCls} value={alteracaoCron.tipo} onChange={e => setAlteracaoCron({ ...alteracaoCron, tipo: e.target.value })}>
                  {Object.entries(TIPOS_ALTERACAO_CRONOGRAMA).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                </select>
              </div>
              <div className="mb-5">
                <label className={labelCls}>Motivo {alteracaoCron.tipo !== 'ajuste' ? '*' : '(opcional)'}</label>
                <textarea className={inputCls} rows={3} autoFocus placeholder="Ex.: chuva forte atrasou a concretagem; material entregue com 5 dias de atraso..." value={alteracaoCron.motivo} onChange={e => setAlteracaoCron({ ...alteracaoCron, motivo: e.target.value })} data-testid="input-motivo-etapa" />
                <div className="text-[11px] text-on-surface-variant mt-1">Fica registrado no histórico da etapa, com data e usuário.</div>
              </div>
              <div className="flex gap-2 justify-end">
                <button className={btnSecondaryCls} onClick={() => { setJanela(null); setAlteracaoCron(null) }}>Cancelar</button>
                <button className={btnPrimaryCls} onClick={confirmarAlteracaoEtapa} data-testid="btn-confirmar-alteracao-etapa">Confirmar alteração</button>
              </div>
            </div>
          </div>
        )}

        {/* modal nova etapa do cronograma */}
        {janela === 'nova_etapa' && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[480px]">
              <div className="text-base font-bold text-on-surface mb-5">+ Nova Etapa do Cronograma</div>
              <div className="mb-3.5">
                <label className={labelCls}>Nome da etapa *</label>
                <input className={inputCls} autoFocus placeholder="Ex.: Instalação de tubulação do banheiro" value={fEtapa.nome} onChange={e => setFEtapa({ ...fEtapa, nome: e.target.value })} data-testid="input-nome-etapa" />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3.5">
                <div>
                  <label className={labelCls}>Categoria</label>
                  <select className={inputCls} value={fEtapa.categoria} onChange={e => setFEtapa({ ...fEtapa, categoria: e.target.value })}>
                    <option value="">— sem categoria —</option>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Fornecedor</label>
                  <input className={inputCls} placeholder="Opcional" value={fEtapa.fornecedor} onChange={e => setFEtapa({ ...fEtapa, fornecedor: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div>
                  <label className={labelCls}>Início previsto</label>
                  <input type="date" className={inputCls} value={fEtapa.inicio} onChange={e => setFEtapa({ ...fEtapa, inicio: e.target.value })} data-testid="input-inicio-etapa" />
                </div>
                <div>
                  <label className={labelCls}>Fim previsto</label>
                  <input type="date" className={inputCls} value={fEtapa.fim} onChange={e => setFEtapa({ ...fEtapa, fim: e.target.value })} data-testid="input-fim-etapa" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button className={btnSecondaryCls} onClick={() => setJanela(null)}>Cancelar</button>
                <button className={btnPrimaryCls} onClick={salvarNovaEtapa} data-testid="btn-salvar-etapa">Adicionar etapa</button>
              </div>
            </div>
          </div>
        )}

        {/* modal editar obra */}
        {janela === 'editar_obra' && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[580px] max-h-[92vh] overflow-y-auto">
              <div className="text-base font-bold text-on-surface mb-5">✏️ Editar Obra</div>
              <FormObra f={fObra} setF={setFObra} obras={obras} editando salvar={salvarObra} cancelar={() => { setJanela(null); setObraEditando(null) }} />
            </div>
          </div>
        )}

        {/* modal serviço */}
        {(janela === 'novo_servico' || janela === 'editar_servico') && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[580px] max-h-[92vh] overflow-y-auto">
              <div className="text-base font-bold text-on-surface mb-1.5">{janela === 'editar_servico' ? '✏️ Editar Serviço' : '🔧 Novo Serviço'}</div>
              <div className="text-body-sm text-primary mb-5">Obra: {detalhe?.nome}</div>
              <div className="mb-3.5">
                <label className={labelCls}>Nome do Serviço *</label>
                <input className={inputCls} placeholder="Ex: Hidráulica, Elétrica, Pintura..." value={fServ.nome} onChange={e => setFServ({ ...fServ, nome: e.target.value })} />
              </div>
              <div className="mb-3.5">
                <label className={labelCls}>Fornecedor / Equipe Responsável (opcional)</label>
                <input className={inputCls} placeholder="Ex: Pedreiro João, Instaladora XPTO Ar-Condicionado" value={fServ.fornecedor} onChange={e => setFServ({ ...fServ, fornecedor: e.target.value })} />
              </div>
              <div className="mb-3.5">
                <label className={labelCls}>Categoria</label>
                <select className={inputCls} value={fServ.categoria} onChange={e => setFServ({ ...fServ, categoria: e.target.value })}>
                  <option value="">Selecione</option>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="text-[11px] text-on-surface-variant mt-1">Define a ordem de execução no Cronograma</div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3.5">
                <div>
                  <label className={labelCls}>Unidade</label>
                  <select className={inputCls} value={fServ.unidade} onChange={e => setFServ({ ...fServ, unidade: e.target.value })}>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Quantidade</label>
                  <input className={inputCls} type="number" placeholder="1" value={fServ.quantidade} onChange={e => setFServ({ ...fServ, quantidade: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3.5">
                <div>
                  <label className={labelCls}>Custo Mão de Obra Previsto (R$)</label>
                  <input className={inputCls} type="number" placeholder="0,00" value={fServ.valor_mao_obra_previsto} onChange={e => setFServ({ ...fServ, valor_mao_obra_previsto: e.target.value })} />
                  <div className="text-[11px] text-on-surface-variant mt-1">Base usada na medição de fornecedor</div>
                </div>
                <div>
                  <label className={labelCls}>Custo Material Previsto (R$)</label>
                  <input className={inputCls} type="number" placeholder="0,00" value={fServ.valor_material_previsto} onChange={e => setFServ({ ...fServ, valor_material_previsto: e.target.value })} />
                  <div className="text-[11px] text-on-surface-variant mt-1">Descontado ao lançar compras de material</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3.5">
                <div>
                  <label className={labelCls}>Valor Cobrado do Cliente (R$)</label>
                  <input className={inputCls} type="number" placeholder="0,00" value={fServ.valor_previsto} onChange={e => setFServ({ ...fServ, valor_previsto: e.target.value })} />
                  <div className="text-[11px] text-on-surface-variant mt-1">Base usada na medição de cliente</div>
                </div>
                <div>
                  <label className={labelCls}>Valor Realizado (R$)</label>
                  <input className={inputCls} type="number" placeholder="0,00" value={fServ.valor_realizado} onChange={e => setFServ({ ...fServ, valor_realizado: e.target.value })} />
                  <div className="text-[11px] text-on-surface-variant mt-1">Quanto foi gasto</div>
                </div>
              </div>
              <div className="mb-3.5">
                <label className={labelCls}>Status</label>
                <select className={inputCls} value={fServ.status} onChange={e => setFServ({ ...fServ, status: e.target.value })}>
                  <option value="pendente">Pendente</option>
                  <option value="em_execucao">Em Execução</option>
                  <option value="concluido">Concluído</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <div className="mb-5">
                <label className={labelCls}>Observação</label>
                <input className={inputCls} placeholder="Ex: Contratado com João Silva" value={fServ.observacao} onChange={e => setFServ({ ...fServ, observacao: e.target.value })} />
              </div>
              {(fServ.valor_previsto || fServ.valor_realizado) ? (
                <div className="bg-surface-container-low rounded-lg p-3.5 mb-4 flex gap-5 flex-wrap">
                  <div><div className="text-[10px] text-on-surface-variant">PREVISTO</div><div className="text-base font-bold text-tertiary">{moeda(parseFloat(fServ.valor_previsto || '0'))}</div></div>
                  <div><div className="text-[10px] text-on-surface-variant">REALIZADO</div><div className="text-base font-bold text-on-surface">{moeda(parseFloat(fServ.valor_realizado || '0'))}</div></div>
                  <div>
                    <div className="text-[10px] text-on-surface-variant">DIFERENÇA</div>
                    <div className={`text-base font-bold ${(parseFloat(fServ.valor_previsto || '0') - parseFloat(fServ.valor_realizado || '0')) >= 0 ? 'text-primary-container' : 'text-error'}`}>
                      {moeda(parseFloat(fServ.valor_previsto || '0') - parseFloat(fServ.valor_realizado || '0'))}
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="flex gap-2 justify-end">
                <button className={btnSecondaryCls} onClick={() => { setJanela(null); setServicoEditando(null) }}>Cancelar</button>
                <button className={btnPrimaryCls} onClick={salvarServico}>{janela === 'editar_servico' ? 'Salvar Alterações' : 'Adicionar Serviço'}</button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    )
  }

  // ── LISTAGEM ──────────────────────────────────────────────
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
            placeholder="Buscar por nome, cliente ou código..."
            className="w-full bg-surface-container-low border border-outline-variant rounded-full pl-12 pr-4 py-2 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
          />
        </div>
      }
      topbarSlot={
        <>
          <button onClick={abrirNovaObra} className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl hover:opacity-90 transition-all font-label-md text-label-md shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-[20px]">add</span>
            Nova Obra
          </button>
        </>
      }
    >
      <div className="flex items-center justify-between flex-wrap gap-3 mb-lg">
        <div>
          <h2 className="font-headline text-headline-lg text-primary">Obras & Projetos</h2>
          <p className="text-body-md text-on-surface-variant">Monitoramento em tempo real do cronograma físico-financeiro.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-1 p-1 bg-surface-container rounded-xl border border-outline-variant flex-wrap">
            {([['todos', 'Todas'], ['em_execucao', 'Em Execução'], ['captacao', 'Captação'], ['pausada', 'Pausada'], ['concluida', 'Concluída'], ['cancelada', 'Cancelada']] as [string, string][]).map(([v, n]) => (
              <button key={v}
                className={`px-4 py-2 rounded-lg text-label-md transition-colors ${filtro === v ? 'bg-primary/20 text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-variant'}`}
                onClick={() => setFiltro(v)}>{n}</button>
            ))}
          </div>
          <div className="flex gap-1 p-1 bg-surface-container rounded-xl border border-outline-variant flex-wrap">
            {([['todos', 'Todas'], ['obra', '🏗️ Obra'], ['projeto', '📐 Projeto']] as [string, string][]).map(([v, n]) => (
              <button key={v}
                className={`px-4 py-2 rounded-lg text-label-md transition-colors ${filtroExecucao === v ? 'bg-primary/20 text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-variant'}`}
                onClick={() => setFiltroExecucao(v)}>{n}</button>
            ))}
          </div>
        </div>
      </div>

      {/* métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-lg mb-lg">
        {([
          ['Em Execução', obras.filter(o => o.status === 'em_execucao').length, 'text-primary', 'construction'],
          ['Concluídas', obras.filter(o => o.status === 'concluida').length, 'text-on-surface-variant', 'task_alt'],
          ['Volume Ativo', moeda(obras.filter(o => o.status === 'em_execucao').reduce((a, o) => a + parseFloat(o.valor_contrato || 0), 0)), 'text-tertiary', 'payments'],
          ['Total Obras', obras.length, 'text-secondary', 'folder_open'],
        ] as [string, string | number, string, string][]).map(([l, v, c, icon]) => (
          <div key={l as string} className="bg-surface-container/70 backdrop-blur-md border border-outline-variant hover:border-primary transition-all duration-300 p-lg rounded-xl flex flex-col justify-between h-32 relative overflow-hidden">
            <div className="flex justify-between items-start z-10">
              <span className="text-label-md uppercase tracking-wider text-on-surface-variant font-bold">{l}</span>
              <span className={`material-symbols-outlined ${c}`}>{icon}</span>
            </div>
            <div className={`text-headline-lg font-black z-10 ${c}`}>{v}</div>
          </div>
        ))}
      </div>

      {/* lista */}
      {listaFiltrada.length === 0 ? (
        <div className={sectionCls + ' text-center py-16'}>
          <div className="text-5xl mb-4">🏗️</div>
          <div className="text-base font-bold text-on-surface mb-2">
            {obras.length === 0 ? 'Nenhuma obra cadastrada ainda' : 'Nenhuma obra encontrada'}
          </div>
          <div className="text-body-sm text-on-surface-variant mb-5">
            {obras.length === 0 ? 'Clique em "+ Nova Obra" para começar' : 'Tente ajustar os filtros'}
          </div>
          {obras.length === 0 && <button className={btnPrimaryCls} onClick={abrirNovaObra}>+ Cadastrar primeira obra</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-lg mb-lg">
          {listaFiltrada.map(o => {
            const cc = custosObra(o.id)
            const rr = receitasObra(o.id)
            const cct = parseFloat(o.valor_contrato || 0)
            const pv = totalPrevisto(o.id)
            const rv = totalRealizado(o.id)
            const pp = o.gerenciamento ? pct(rr, cct) : pct(cc, cct)
            const ns = servicosObra(o.id).length
            const at = o.data_previsao && new Date(o.data_previsao) < new Date() && o.status === 'em_execucao'
            const margem = o.gerenciamento ? rr : rr - cc
            return (
              <div key={o.id}
                onClick={() => { setDetalhe(o); setAbaDetalhe('resumo'); setMedicaoAtiva(null) }}
                className="bg-surface-container/70 backdrop-blur-md border border-outline-variant hover:border-primary transition-all duration-300 rounded-xl overflow-hidden flex flex-col cursor-pointer">
                <div className="p-lg space-y-3 border-b border-outline-variant bg-surface-container-low/50">
                  <div className="flex justify-between items-start gap-2 flex-wrap">
                    <span className="font-data-mono text-body-sm text-outline-variant">{o.codigo}</span>
                    <div className="flex gap-1.5 flex-wrap justify-end">
                      <span className={`text-label-sm px-2 py-0.5 rounded border ${EXECUCAO_BADGE[o.tipo_execucao || 'obra']}`}>{EXECUCAO_NOME[o.tipo_execucao || 'obra']}</span>
                      <Bdg status={o.status} />
                      {at && <span className="bg-error/10 text-error border border-error/20 px-2 py-0.5 rounded text-label-sm flex items-center gap-0.5">⚠️ Atrasada</span>}
                      {ns > 0 && <span className="bg-tertiary/10 text-tertiary border border-tertiary/20 px-2 py-0.5 rounded text-label-sm">{ns} serv.</span>}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-headline text-headline-sm text-on-surface truncate">{o.nome}</h3>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap text-body-sm text-on-surface-variant">
                      <span>👤 {o.cliente}</span>
                      {o.tipo && <><span className="text-outline">•</span><span className="text-outline">{o.tipo}</span></>}
                    </div>
                  </div>
                </div>
                <div className="p-lg space-y-4 flex-1 flex flex-col">
                  <div className="grid grid-cols-3 gap-2">
                    {([['CONTRATO', moeda(cct), 'text-primary'], [o.gerenciamento ? 'CUSTOS (CLIENTE)' : 'CUSTOS', moeda(cc), 'text-error'], ['MARGEM', moeda(margem), margem >= 0 ? 'text-primary-container' : 'text-error']] as [string, string, string][]).map(([l, v, c]) => (
                      <div key={l} className="p-2.5 rounded-lg bg-surface-container-high border border-outline-variant min-w-0">
                        <p className="text-label-sm text-outline-variant uppercase">{l}</p>
                        <p className={`text-[11px] sm:text-xs font-bold leading-tight whitespace-nowrap ${c}`}>{v}</p>
                      </div>
                    ))}
                  </div>
                  {pv > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-label-sm">
                        <span className="text-on-surface-variant">Serviços: {moeda(rv)} / {moeda(pv)}</span>
                        <span className="text-tertiary font-bold">{pct(rv, pv).toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-surface-variant rounded-full overflow-hidden">
                        <div className="h-full bg-tertiary" style={{ width: pct(rv, pv) + '%' }} />
                      </div>
                    </div>
                  )}
                  {cct > 0 && (
                    <div className="space-y-1">
                      <div className="h-1.5 w-full bg-surface-variant rounded-full overflow-hidden">
                        <div className={`h-full ${corPct(pp).bar}`} style={{ width: pp + '%' }} />
                      </div>
                      <p className="text-label-sm text-outline italic">{pp.toFixed(0)}% do contrato</p>
                    </div>
                  )}
                  {(o.data_inicio || o.data_previsao || o.responsavel) && (
                    <div className="pt-3 border-t border-outline-variant grid grid-cols-2 gap-2 text-body-sm text-on-surface-variant">
                      {o.data_inicio && <span className="flex items-center gap-1.5">📅 {dataBR(o.data_inicio)}</span>}
                      {o.data_previsao && <span className={`flex items-center gap-1.5 ${at ? 'text-error' : ''}`}>🏁 {dataBR(o.data_previsao)}</span>}
                      {o.responsavel && <span className="flex items-center gap-1.5 col-span-2">👷 {o.responsavel}</span>}
                    </div>
                  )}
                  <div className="mt-auto pt-2 -mx-lg -mb-lg px-lg py-3 border-t border-outline-variant text-center text-primary text-label-md font-bold">Ver detalhes →</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* modal nova obra */}
      {janela === 'nova_obra' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[580px] max-h-[92vh] overflow-y-auto">
            <div className="text-base font-bold text-on-surface mb-5">🏗️ Nova Obra</div>
            <FormObra f={fObra} setF={setFObra} obras={obras} editando={false} clienteCrm={clienteCrm} setClienteCrm={setClienteCrm} salvar={salvarObra} cancelar={() => { setJanela(null); setObraEditando(null) }} />
          </div>
        </div>
      )}
    </Layout>
  )
}

// ── componente formulário de obra ─────────────────────────────
function FormObra({ f, setF, obras, editando, salvar, cancelar, clienteCrm, setClienteCrm }: {
  f: any; setF: any; obras: any[]; editando: boolean
  clienteCrm?: ValorClienteCrm; setClienteCrm?: (v: ValorClienteCrm) => void
  salvar: () => void; cancelar: () => void
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-3.5">
        <div>
          <label className={labelCls}>Código *</label>
          <div className="flex gap-1.5">
            <input className={inputCls + ' flex-1'} value={f.codigo} onChange={(e: any) => setF({ ...f, codigo: e.target.value })} placeholder="OBR-2026-001" />
            {!editando && (
              <button className={btnSecondaryCls + ' text-xs px-2.5 whitespace-nowrap'}
                onClick={() => setF({ ...f, codigo: gerarCodigo(obras) })}>Auto</button>
            )}
          </div>
        </div>
        <div>
          <label className={labelCls}>Status</label>
          <select className={inputCls} value={f.status} onChange={(e: any) => setF({ ...f, status: e.target.value })}>
            {Object.entries(STATUS_NOME).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </div>
      </div>

      <div className="mb-3.5">
        <label className={labelCls}>Nome da Obra *</label>
        <input className={inputCls} placeholder="Ex: Residência Família Silva" value={f.nome} onChange={(e: any) => setF({ ...f, nome: e.target.value })} />
      </div>

      {!editando && clienteCrm && setClienteCrm && (
        <SeletorClienteCrm valor={clienteCrm} onChange={setClienteCrm} origem="obra" mostrarContato
          onClienteSelecionado={c => setF({ ...f, cliente: c.nome, endereco: f.endereco || c.endereco || '' })} />
      )}

      <div className="grid grid-cols-3 gap-3 mb-3.5">
        <div>
          <label className={labelCls}>Tipo</label>
          <select className={inputCls} value={f.tipo} onChange={(e: any) => setF({ ...f, tipo: e.target.value })}>
            {TIPOS_OBRA.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Execução *</label>
          <select className={inputCls} value={f.tipo_execucao} onChange={(e: any) => setF({ ...f, tipo_execucao: e.target.value })}>
            {TIPOS_EXECUCAO.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Cliente *</label>
          <input className={inputCls} placeholder="Nome do cliente" value={f.cliente} onChange={(e: any) => setF({ ...f, cliente: e.target.value })} />
        </div>
      </div>

      <label className="flex items-start gap-2.5 mb-3.5 px-3.5 py-2.5 bg-secondary/5 border border-secondary/20 rounded-lg cursor-pointer select-none">
        <input type="checkbox" checked={!!f.gerenciamento} onChange={(e: any) => setF({ ...f, gerenciamento: e.target.checked })} className="w-4 h-4 accent-secondary cursor-pointer mt-0.5" />
        <span>
          <span className="block text-body-sm font-semibold text-on-surface">🤝 Esta obra é um contrato de Gerenciamento</span>
          <span className="block text-[11px] text-on-surface-variant mt-0.5">Nós controlamos as medições e pagamentos do fornecedor, mas quem paga é o cliente — o custo dele não entra no financeiro da Inverso. Só a medição de taxa de gerenciamento conta como receita.</span>
        </span>
      </label>

      <div className="mb-3.5">
        <label className={labelCls}>Endereço</label>
        <input className={inputCls} placeholder="Rua, número, bairro, cidade" value={f.endereco} onChange={(e: any) => setF({ ...f, endereco: e.target.value })} />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3.5">
        <div>
          <label className={labelCls}>Responsável</label>
          <input className={inputCls} value={f.responsavel} onChange={(e: any) => setF({ ...f, responsavel: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Data Início</label>
          <input className={inputCls} type="date" value={f.data_inicio} onChange={(e: any) => setF({ ...f, data_inicio: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Previsão Término</label>
          <input className={inputCls} type="date" value={f.data_previsao} onChange={(e: any) => setF({ ...f, data_previsao: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3.5">
        <div>
          <label className={labelCls}>Valor do Contrato (R$)</label>
          <input className={inputCls} type="number" placeholder="0,00" value={f.valor_contrato} onChange={(e: any) => setF({ ...f, valor_contrato: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Dias de Trabalho</label>
          <select className={inputCls} value={f.dias_trabalho} onChange={(e: any) => setF({ ...f, dias_trabalho: e.target.value })}>
            <option value="seg_sex">Segunda a Sexta</option>
            <option value="seg_sab">Segunda a Sábado</option>
            <option value="todos_dias">Todos os dias (inclusive domingo)</option>
          </select>
        </div>
      </div>

      <div className="bg-primary/5 border border-primary/20 rounded-lg px-3.5 py-2.5 mb-3.5">
        <div className="text-[11px] text-primary font-semibold mb-1">💡 CUSTOS POR SERVIÇO</div>
        <div className="text-body-sm text-on-surface-variant">Após criar a obra, acesse a aba <strong className="text-on-surface">🔧 Serviços</strong> para detalhar: Hidráulica, Elétrica, Pintura...</div>
      </div>

      <div className="flex gap-2 justify-end mt-2">
        <button className={btnSecondaryCls} onClick={cancelar}>Cancelar</button>
        <button className={btnPrimaryCls} onClick={salvar}>{editando ? 'Salvar Alterações' : 'Criar Obra'}</button>
      </div>
    </>
  )
}
