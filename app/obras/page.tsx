'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Layout from '../components/Layout'

const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const HDR = { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': 'Bearer ' + ANON }

const moeda = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (a: number, b: number) => b > 0 ? Math.min((a / b) * 100, 100) : 0

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
    return await r.json()
  } catch { return null }
}

async function editar(tabela: string, id: string, dados: object) {
  try {
    await fetch(BASE + '/' + tabela + '?id=eq.' + id, {
      method: 'PATCH', headers: HDR, body: JSON.stringify(dados)
    })
  } catch {}
}

async function remover(tabela: string, id: string) {
  try {
    await fetch(BASE + '/' + tabela + '?id=eq.' + id, { method: 'DELETE', headers: HDR })
  } catch {}
}

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

const TIPOS_OBRA = ['Obra Nova', 'Reforma', 'Retrofit', 'Projeto Arquitetura', 'Projeto Engenharia', 'Consultoria', 'Outro']

function gerarCodigo(obras: any[]) {
  const ano = new Date().getFullYear()
  const qtd = obras.filter(o => o.codigo?.startsWith('OBR-' + ano)).length
  return 'OBR-' + ano + '-' + String(qtd + 1).padStart(3, '0')
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
  const [loading,  setLoading]  = useState(true)
  const [detalhe,  setDetalhe]  = useState<any>(null)
  const [abaDetalhe, setAbaDetalhe] = useState('resumo')
  const [janela,   setJanela]   = useState<'nova_obra' | 'editar_obra' | 'novo_servico' | 'editar_servico' | null>(null)
  const [filtro,   setFiltro]   = useState('todos')
  const [busca,    setBusca]    = useState('')
  const [userEmail, setUserEmail] = useState('')

  const [fObra, setFObra] = useState({
    codigo: '', nome: '', tipo: 'Reforma', cliente: '',
    endereco: '', responsavel: '', status: 'em_execucao',
    data_inicio: '', data_previsao: '', valor_contrato: ''
  })

  const [fServ, setFServ] = useState({
    nome: '', valor_previsto: '', valor_realizado: '',
    status: 'pendente', observacao: ''
  })

  const [obraEditando,   setObraEditando]   = useState<any>(null)
  const [servicoEditando, setServicoEditando] = useState<any>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('viga_token')) {
      window.location.href = '/'
      return
    }
    setUserEmail(localStorage.getItem('viga_email') || '')
    carregar()
  }, [])

  function sair() {
    localStorage.removeItem('viga_token')
    localStorage.removeItem('viga_email')
    window.location.href = '/'
  }

  async function carregar() {
    setLoading(true)
    const [o, l, g, s] = await Promise.all([
      buscar('obras', '?order=created_at.desc'),
      buscar('lancamentos', '?order=data.desc'),
      buscar('gastos_cartao', '?order=data.desc'),
      buscar('obra_servicos', '?order=created_at'),
    ])
    setObras(o)
    setLancs(l)
    setGastos(g)
    setServicos(s)
    setLoading(false)
  }

  // ── cálculos ──────────────────────────────────────────────
  function custosObra(id: string) {
    const l = lancs.filter(x => x.obra_id === id && x.tipo === 'saida')
      .reduce((a, x) => a + parseFloat(x.valor || 0), 0)
    const g = gastos.filter(x => x.obra_id === id)
      .reduce((a, x) => a + parseFloat(x.valor || 0), 0)
    return l + g
  }
  function receitasObra(id: string) {
    return lancs.filter(x => x.obra_id === id && x.tipo === 'entrada')
      .reduce((a, x) => a + parseFloat(x.valor || 0), 0)
  }
  function servicosObra(id: string) { return servicos.filter(s => s.obra_id === id) }
  function totalPrevisto(id: string) { return servicosObra(id).reduce((a, s) => a + parseFloat(s.valor_previsto || 0), 0) }
  function totalRealizado(id: string) { return servicosObra(id).reduce((a, s) => a + parseFloat(s.valor_realizado || 0), 0) }

  // ── salvar obra ───────────────────────────────────────────
  async function salvarObra() {
    if (!fObra.codigo || !fObra.nome || !fObra.cliente) {
      alert('Preencha código, nome e cliente')
      return
    }
    const dados: any = {
      codigo: fObra.codigo.trim().toUpperCase(),
      nome: fObra.nome.trim(),
      tipo: fObra.tipo,
      cliente: fObra.cliente.trim(),
      endereco: fObra.endereco.trim(),
      responsavel: fObra.responsavel.trim(),
      status: fObra.status,
      data_inicio: fObra.data_inicio || null,
      data_previsao: fObra.data_previsao || null,
      valor_contrato: parseFloat(fObra.valor_contrato || '0'),
    }
    if (obraEditando) {
      await editar('obras', obraEditando.id, dados)
      if (detalhe?.id === obraEditando.id) {
        setDetalhe({ ...detalhe, ...dados })
      }
    } else {
      await criar('obras', dados)
    }
    setJanela(null)
    setObraEditando(null)
    await carregar()
  }

  // ── salvar serviço ────────────────────────────────────────
  async function salvarServico() {
    if (!fServ.nome.trim()) { alert('Preencha o nome do serviço'); return }
    if (!detalhe) return
    const dados = {
      obra_id: detalhe.id,
      nome: fServ.nome.trim(),
      valor_previsto: parseFloat(fServ.valor_previsto || '0'),
      valor_realizado: parseFloat(fServ.valor_realizado || '0'),
      status: fServ.status,
      observacao: fServ.observacao.trim(),
    }
    if (servicoEditando) {
      await editar('obra_servicos', servicoEditando.id, dados)
    } else {
      await criar('obra_servicos', dados)
    }
    setJanela(null)
    setServicoEditando(null)
    await carregar()
  }

  function abrirNovaObra() {
    setFObra({ codigo: gerarCodigo(obras), nome: '', tipo: 'Reforma', cliente: '', endereco: '', responsavel: '', status: 'em_execucao', data_inicio: '', data_previsao: '', valor_contrato: '' })
    setObraEditando(null)
    setJanela('nova_obra')
  }

  function abrirEditarObra(obra: any) {
    setFObra({
      codigo: obra.codigo || '', nome: obra.nome || '', tipo: obra.tipo || 'Reforma',
      cliente: obra.cliente || '', endereco: obra.endereco || '',
      responsavel: obra.responsavel || '', status: obra.status || 'em_execucao',
      data_inicio: obra.data_inicio || '', data_previsao: obra.data_previsao || '',
      valor_contrato: obra.valor_contrato != null ? String(obra.valor_contrato) : '',
    })
    setObraEditando(obra)
    setJanela('editar_obra')
  }

  function abrirNovoServico() {
    setFServ({ nome: '', valor_previsto: '', valor_realizado: '', status: 'pendente', observacao: '' })
    setServicoEditando(null)
    setJanela('novo_servico')
  }

  function abrirEditarServico(sv: any) {
    setFServ({
      nome: sv.nome || '',
      valor_previsto: sv.valor_previsto != null ? String(sv.valor_previsto) : '',
      valor_realizado: sv.valor_realizado != null ? String(sv.valor_realizado) : '',
      status: sv.status || 'pendente',
      observacao: sv.observacao || '',
    })
    setServicoEditando(sv)
    setJanela('editar_servico')
  }

  const listaFiltrada = obras.filter(o => {
    const matchStatus = filtro === 'todos' || o.status === filtro
    const matchBusca = !busca || [o.nome, o.cliente, o.codigo]
      .some(v => v?.toLowerCase().includes(busca.toLowerCase()))
    return matchStatus && matchBusca
  })

  const topbarIcons = (
    <>
      <span className="material-symbols-outlined p-2 text-on-surface-variant hover:bg-primary-container/10 rounded-xl transition-all cursor-pointer">notifications</span>
      <span className="material-symbols-outlined p-2 text-on-surface-variant hover:bg-primary-container/10 rounded-xl transition-all cursor-pointer">settings</span>
      <div className="h-8 w-[1px] bg-outline-variant" />
    </>
  )

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
    const svs       = servicosObra(detalhe.id)
    const lancD     = lancs.filter(l => l.obra_id === detalhe.id)
    const gastD     = gastos.filter(g => g.obra_id === detalhe.id)
    const pctCont   = pct(custos, contrato)
    const pctServ   = pct(realTotal, prevTotal)
    const atrasada  = detalhe.data_previsao && new Date(detalhe.data_previsao) < new Date() && detalhe.status === 'em_execucao'
    const margem    = receitas - custos
    const pctMargem = receitas > 0 ? Math.min(Math.max(((receitas - custos) / receitas) * 100, 0), 100) : 0

    return (
      <Layout userEmail={userEmail} onLogout={sair} topbarSlot={topbarIcons}>
        {/* header da obra */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-lg">
          <div>
            <button onClick={() => { setDetalhe(null); setAbaDetalhe('resumo') }} className={btnSecondaryCls + ' mb-3'}>← Voltar</button>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-body-sm text-on-surface-variant font-semibold">{detalhe.codigo}</span>
              <Bdg status={detalhe.status} />
              {atrasada && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-error/10 text-error border-error/20">⚠️ Atrasada</span>}
            </div>
            <h1 className="text-headline-md font-headline text-on-surface">{detalhe.nome}</h1>
            <p className="text-body-sm text-on-surface-variant">{detalhe.cliente}{detalhe.endereco ? ' · ' + detalhe.endereco : ''}</p>
          </div>
          <div className="flex gap-2 flex-wrap items-start">
            <button onClick={() => abrirEditarObra(detalhe)} className={btnEditSmCls}>✏️ Editar</button>
            <select value={detalhe.status}
              onChange={async e => { await editar('obras', detalhe.id, { status: e.target.value }); setDetalhe({ ...detalhe, status: e.target.value }); carregar() }}
              className={inputCls + ' w-auto text-xs py-1.5'}>
              {Object.entries(STATUS_NOME).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
          </div>
        </div>

        {/* cards financeiros */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-lg">
          {([
            ['Contrato', moeda(contrato), 'text-primary'],
            ['Recebido', moeda(receitas), 'text-primary-container'],
            ['Custos Reais', moeda(custos), 'text-error'],
            ['Margem Atual', moeda(margem), margem >= 0 ? 'text-primary-container' : 'text-error'],
            ['Prev. Serviços', moeda(prevTotal), 'text-tertiary'],
            ['Gasto Serviços', moeda(custos), custos > prevTotal && prevTotal > 0 ? 'text-error' : custos > 0 ? 'text-primary' : 'text-on-surface-variant'],
          ] as [string, string, string][]).map(([lbl, val, cor]) => (
            <div key={lbl} className="bg-surface-container-high border border-outline-variant rounded-lg p-3">
              <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-2">{lbl}</div>
              <div className={`text-body-lg font-bold ${cor}`}>{val}</div>
            </div>
          ))}
        </div>

        {/* barras de progresso */}
        {contrato > 0 && (
          <div className={sectionCls}>
            <div className="flex justify-between text-body-sm text-on-surface-variant mb-1.5">
              <span>Consumo do contrato — {moeda(custos)} de {moeda(contrato)}</span>
              <span className={corPct(pctCont).text}>{pctCont.toFixed(1)}%</span>
            </div>
            <div className="h-[7px] bg-surface-variant rounded overflow-hidden mb-3.5">
              <div className={`h-full rounded ${corPct(pctCont).bar}`} style={{ width: pctCont + '%' }} />
            </div>
            <div className="flex justify-between text-body-sm text-on-surface-variant mb-1.5">
              <span>Margem — Recebido: {moeda(receitas)} · Custos: {moeda(custos)} · Margem: {moeda(margem)}</span>
              <span className={corSinal(margem).text}>{contrato > 0 ? ((margem / contrato) * 100).toFixed(1) : 0}%</span>
            </div>
            <div className={`h-[7px] bg-surface-variant rounded overflow-hidden ${prevTotal > 0 ? 'mb-3.5' : ''}`}>
              <div className={`h-full rounded ${corSinal(margem).bar}`} style={{ width: pctMargem + '%' }} />
            </div>
            {prevTotal > 0 && (
              <>
                <div className="flex justify-between text-body-sm text-on-surface-variant mb-1.5">
                  <span>Orçamento serviços — Previsto: {moeda(prevTotal)} · Lançado: {moeda(custos)}</span>
                  <span className={pctServ > 100 ? 'text-error' : 'text-tertiary'}>{pctServ.toFixed(1)}%</span>
                </div>
                <div className="h-[7px] bg-surface-variant rounded overflow-hidden">
                  <div className={`h-full rounded ${pctServ > 100 ? 'bg-error' : 'bg-tertiary'}`} style={{ width: pctServ + '%' }} />
                </div>
              </>
            )}
          </div>
        )}

        {/* abas */}
        <div className="flex gap-2 mb-lg flex-wrap">
          {([['resumo', '📋 Resumo'], ['servicos', '🔧 Serviços'], ['lancamentos', '💰 Lançamentos'], ['cartao', '💳 Cartão']] as [string, string][]).map(([id, nome]) => (
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
                ['DATA INÍCIO', detalhe.data_inicio || '—'],
                ['PREVISÃO TÉRMINO', detalhe.data_previsao ? (atrasada ? detalhe.data_previsao + ' ⚠️' : detalhe.data_previsao) : '—'],
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
              <button className={btnDangerSmCls} onClick={async () => {
                if (!confirm('Excluir esta obra? Esta ação não pode ser desfeita.')) return
                await remover('obras', detalhe.id)
                setDetalhe(null); carregar()
              }}>🗑️ Excluir Obra</button>
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
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-outline-variant">
                        {['Serviço', 'Status', 'Previsto', 'Realizado (auto)', 'Diferença', 'Progresso', ''].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[11px] text-on-surface-variant uppercase bg-surface-container-high whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {svs.map(sv => {
                        const vp = parseFloat(sv.valor_previsto || 0)
                        const vrLanc = lancs.filter(l => l.servico_id === sv.id && l.tipo === 'saida').reduce((a: number, l: any) => a + parseFloat(l.valor || 0), 0)
                        const vrGasto = gastos.filter(g => g.servico_id === sv.id).reduce((a: number, g: any) => a + parseFloat(g.valor || 0), 0)
                        const vrAuto = vrLanc + vrGasto
                        const vrManual = parseFloat(sv.valor_realizado || 0)
                        const vr = vrAuto > 0 ? vrAuto : vrManual
                        const dif = vp - vr
                        const pp = pct(vr, vp)
                        const badge = SERV_BADGE[sv.status] || SERV_BADGE.pendente
                        return (
                          <tr key={sv.id} className="border-b border-outline-variant hover:bg-surface-variant/20">
                            <td className="px-3 py-3">
                              <div className="font-semibold text-sm text-on-surface">{sv.nome}</div>
                              {sv.observacao && <div className="text-[11px] text-on-surface-variant mt-0.5">{sv.observacao}</div>}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${badge}`}>{SERV_STATUS[sv.status] || sv.status}</span>
                            </td>
                            <td className="px-3 py-3 font-semibold text-tertiary">{moeda(vp)}</td>
                            <td className={`px-3 py-3 font-semibold ${vr > vp && vp > 0 ? 'text-error' : 'text-on-surface'}`}>{moeda(vr)}</td>
                            <td className="px-3 py-3">
                              <div className={`font-bold ${dif >= 0 ? 'text-primary-container' : 'text-error'}`}>{dif >= 0 ? '▼ ' : '▲ '}{moeda(Math.abs(dif))}</div>
                              <div className="text-[10px] text-on-surface-variant">{dif >= 0 ? 'sob controle' : 'acima do prev.'}</div>
                            </td>
                            <td className="px-3 py-3 min-w-[100px]">
                              <div className="h-1.5 bg-surface-variant rounded overflow-hidden mb-1">
                                <div className={`h-full rounded ${pp > 100 ? 'bg-error' : pp > 80 ? 'bg-tertiary' : 'bg-primary'}`} style={{ width: pp + '%' }} />
                              </div>
                              <div className="text-[10px] text-on-surface-variant">{pp.toFixed(0)}%</div>
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
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4 p-4 bg-surface-container-low rounded-lg">
                  <div><div className="text-[10px] text-on-surface-variant mb-1">TOTAL PREVISTO</div><div className="text-lg font-bold text-tertiary">{moeda(prevTotal)}</div><div className="text-[10px] text-on-surface-variant mt-0.5">orçamento total</div></div>
                  <div><div className="text-[10px] text-on-surface-variant mb-1">GASTOS REAIS</div><div className={`text-lg font-bold ${custos > prevTotal && prevTotal > 0 ? 'text-error' : 'text-primary'}`}>{moeda(custos)}</div><div className="text-[10px] text-on-surface-variant mt-0.5">lançamentos da obra</div></div>
                  <div><div className="text-[10px] text-on-surface-variant mb-1">DIFERENÇA</div><div className={`text-lg font-bold ${(prevTotal - custos) >= 0 ? 'text-primary-container' : 'text-error'}`}>{moeda(prevTotal - custos)}</div><div className={`text-[10px] mt-0.5 ${(prevTotal - custos) >= 0 ? 'text-primary-container' : 'text-error'}`}>{(prevTotal - custos) >= 0 ? 'sob controle' : 'estourou!'}</div></div>
                  <div><div className="text-[10px] text-on-surface-variant mb-1">MARGEM</div><div className={`text-lg font-bold ${margem >= 0 ? 'text-primary-container' : 'text-error'}`}>{moeda(margem)}</div><div className="text-[10px] text-on-surface-variant mt-0.5">{svs.filter(s => s.status === 'concluido').length}/{svs.length} concluído(s)</div></div>
                </div>
                <div className="mt-3 px-3 py-2 bg-primary/5 rounded-lg text-body-sm text-on-surface-variant">
                  💡 <strong className="text-primary">Realizado (auto)</strong> = soma automática dos lançamentos vinculados a cada serviço. Ao lançar no Financeiro, selecione a obra e depois a <strong className="text-on-surface">Categoria da Obra</strong> para atualizar aqui automaticamente.
                </div>
              </>
            )}
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
                          <td className="px-3 py-2.5 text-on-surface-variant text-xs">{l.data}</td>
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
                    <div className="text-[11px] text-on-surface-variant">{g.data} · {g.categoria || '—'}</div>
                  </div>
                  <div className="text-error font-bold">{moeda(parseFloat(g.valor))}</div>
                </div>
              ))}
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
              <div className="grid grid-cols-2 gap-3 mb-3.5">
                <div>
                  <label className={labelCls}>Valor Previsto (R$)</label>
                  <input className={inputCls} type="number" placeholder="0,00" value={fServ.valor_previsto} onChange={e => setFServ({ ...fServ, valor_previsto: e.target.value })} />
                  <div className="text-[11px] text-on-surface-variant mt-1">Quanto foi orçado</div>
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
          {topbarIcons}
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
        <div className="flex gap-1 p-1 bg-surface-container rounded-xl border border-outline-variant flex-wrap">
          {([['todos', 'Todas'], ['em_execucao', 'Em Execução'], ['captacao', 'Captação'], ['pausada', 'Pausada'], ['concluida', 'Concluída'], ['cancelada', 'Cancelada']] as [string, string][]).map(([v, n]) => (
            <button key={v}
              className={`px-4 py-2 rounded-lg text-label-md transition-colors ${filtro === v ? 'bg-primary/20 text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-variant'}`}
              onClick={() => setFiltro(v)}>{n}</button>
          ))}
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
            const pp = pct(cc, cct)
            const ns = servicosObra(o.id).length
            const at = o.data_previsao && new Date(o.data_previsao) < new Date() && o.status === 'em_execucao'
            const margem = rr - cc
            return (
              <div key={o.id}
                onClick={() => { setDetalhe(o); setAbaDetalhe('resumo') }}
                className="bg-surface-container/70 backdrop-blur-md border border-outline-variant hover:border-primary transition-all duration-300 rounded-xl overflow-hidden flex flex-col cursor-pointer">
                <div className="p-lg space-y-3 border-b border-outline-variant bg-surface-container-low/50">
                  <div className="flex justify-between items-start gap-2 flex-wrap">
                    <span className="font-data-mono text-body-sm text-outline-variant">{o.codigo}</span>
                    <div className="flex gap-1.5 flex-wrap justify-end">
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
                    {([['CONTRATO', moeda(cct), 'text-primary'], ['CUSTOS', moeda(cc), 'text-error'], ['MARGEM', moeda(margem), margem >= 0 ? 'text-primary-container' : 'text-error']] as [string, string, string][]).map(([l, v, c]) => (
                      <div key={l} className="p-2.5 rounded-lg bg-surface-container-high border border-outline-variant">
                        <p className="text-label-sm text-outline-variant uppercase">{l}</p>
                        <p className={`text-body-md font-bold ${c}`}>{v}</p>
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
                      {o.data_inicio && <span className="flex items-center gap-1.5">📅 {o.data_inicio}</span>}
                      {o.data_previsao && <span className={`flex items-center gap-1.5 ${at ? 'text-error' : ''}`}>🏁 {o.data_previsao}</span>}
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
            <FormObra f={fObra} setF={setFObra} obras={obras} editando={false} salvar={salvarObra} cancelar={() => { setJanela(null); setObraEditando(null) }} />
          </div>
        </div>
      )}
    </Layout>
  )
}

// ── componente formulário de obra ─────────────────────────────
function FormObra({ f, setF, obras, editando, salvar, cancelar }: {
  f: any; setF: any; obras: any[]; editando: boolean
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

      <div className="grid grid-cols-2 gap-3 mb-3.5">
        <div>
          <label className={labelCls}>Tipo</label>
          <select className={inputCls} value={f.tipo} onChange={(e: any) => setF({ ...f, tipo: e.target.value })}>
            {TIPOS_OBRA.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Cliente *</label>
          <input className={inputCls} placeholder="Nome do cliente" value={f.cliente} onChange={(e: any) => setF({ ...f, cliente: e.target.value })} />
        </div>
      </div>

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
        <div className="bg-primary/5 border border-primary/20 rounded-lg px-3.5 py-2.5">
          <div className="text-[11px] text-primary font-semibold mb-1">💡 CUSTOS POR SERVIÇO</div>
          <div className="text-body-sm text-on-surface-variant">Após criar a obra, acesse a aba <strong className="text-on-surface">🔧 Serviços</strong> para detalhar: Hidráulica, Elétrica, Pintura...</div>
        </div>
      </div>

      <div className="flex gap-2 justify-end mt-2">
        <button className={btnSecondaryCls} onClick={cancelar}>Cancelar</button>
        <button className={btnPrimaryCls} onClick={salvar}>{editando ? 'Salvar Alterações' : 'Criar Obra'}</button>
      </div>
    </>
  )
}
