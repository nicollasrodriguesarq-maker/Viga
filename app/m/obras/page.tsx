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

async function uploadFotoVisita(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const nome = `visita_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
  const r = await fetch(`${BASE.replace('/rest/v1', '')}/storage/v1/object/relatorio-visita-fotos/${nome}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': file.type },
    body: file,
  })
  if (r.ok) return `${BASE.replace('/rest/v1', '')}/storage/v1/object/public/relatorio-visita-fotos/${nome}`
  return null
}

const moeda = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (v: string) => v ? new Date(v + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
const STATUS_NOME: Record<string, string> = { captacao: 'Em Captação', em_execucao: 'Em Execução', pausada: 'Pausada', concluida: 'Concluída', cancelada: 'Cancelada' }
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
  const [relatorios, setRelatorios] = useState<any[]>([])
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
  const [fMedicao, setFMedicao] = useState(FMED_VAZIO)
  const [medicaoAtiva, setMedicaoAtiva] = useState<any>(null)
  const [preenchimento, setPreenchimento] = useState<Record<string, { valor_base: string; percentual: string }>>({})

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('viga_token')) { window.location.href = '/'; return }
    obterMinhasPermissoesApp().then(perm => {
      if (!temAcessoModuloApp(perm, 'obras')) { window.location.href = '/m'; return }
      if (perm) setMeuId(perm.id)
    })
    carregar()
  }, [])

  async function carregar() {
    const [o, l, g, s, orc, orcIt, med, medIt, rv] = await Promise.all([
      buscar('obras', '?order=created_at.desc'),
      buscar('lancamentos', '?order=data.desc'),
      buscar('gastos_cartao', '?order=data.desc'),
      buscar('obra_servicos', '?order=created_at'),
      buscar('orcamentos', '?order=created_at.desc'),
      buscar('orcamento_itens', '?order=created_at'),
      buscar('medicoes', '?order=data.desc'),
      buscar('medicao_itens', '?order=created_at'),
      buscar('obra_relatorios_visita', '?order=data.desc'),
    ])
    setObras(o); setLancs(l); setGastos(g); setServicos(s); setOrcamentos(orc); setOrcItens(orcIt)
    setMedicoes(med); setMedItens(medIt); setRelatorios(rv)
  }

  function custosObra(id: string) {
    const l = lancs.filter(x => x.obra_id === id && x.tipo === 'saida').reduce((a, x) => a + parseFloat(x.valor || 0), 0)
    const g = gastos.filter(x => x.obra_id === id).reduce((a, x) => a + parseFloat(x.valor || 0), 0)
    return l + g
  }
  function receitasObra(id: string) {
    return lancs.filter(x => x.obra_id === id && x.tipo === 'entrada').reduce((a, x) => a + parseFloat(x.valor || 0), 0)
  }
  function servicosObra(id: string) { return servicos.filter(s => s.obra_id === id) }
  function totalPrevisto(id: string) { return servicosObra(id).reduce((a, s) => a + parseFloat(s.valor_previsto || 0), 0) }

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
    const fotos: { url: string; descricao: string }[] = []
    for (const f of fotosRv) {
      const url = f.url || (f.file ? await uploadFotoVisita(f.file) : null)
      if (url) fotos.push({ url, descricao: f.descricao || '' })
    }
    const dados = {
      obra_id: detalhe.id, data: fRv.data, clima: fRv.clima || null, descricao: fRv.descricao || null,
      pendencias: fRv.pendencias || null, equipe_presente: fRv.equipe_presente, fotos,
    }
    if (rvEditando) { await editar('obra_relatorios_visita', rvEditando.id, dados) }
    else { await criar('obra_relatorios_visita', { ...dados, criado_por: meuId || null }) }
    setEnviandoRv(false); setFRv(FRV_VAZIO); setFotosRv([]); setRvEditando(null)
    setTela('detalhe'); setAba('visitas')
    await carregar()
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
  function ultimoRegistro(orcamentoItemId: string, medicaoIdAtual?: string) {
    return medItens
      .filter(mi => mi.orcamento_item_id === orcamentoItemId && mi.medicao_id !== medicaoIdAtual)
      .map(mi => ({ ...mi, medicao: medicoes.find(m => m.id === mi.medicao_id) }))
      .filter(mi => mi.medicao)
      .sort((a, b) => new Date(b.medicao.data).getTime() - new Date(a.medicao.data).getTime())[0] || null
  }
  function abrirPreenchimentoMedicao(medicao: any, itensFiltrados: any[]) {
    const preench: Record<string, { valor_base: string; percentual: string }> = {}
    itensFiltrados.forEach(item => {
      const existente = medItens.find(mi => mi.medicao_id === medicao.id && mi.orcamento_item_id === item.id)
      const ultimo = ultimoRegistro(item.id, medicao.id)
      preench[item.id] = {
        valor_base: existente ? String(existente.valor_base) : (ultimo ? String(ultimo.valor_base) : String(parseFloat(item.total_item || 0))),
        percentual: existente ? String(existente.percentual_acumulado * 100) : (ultimo ? String(ultimo.percentual_acumulado * 100) : '0'),
      }
    })
    setPreenchimento(preench)
    setMedicaoAtiva(medicao)
    setTela('medicaoPreenchimento')
  }
  async function criarMedicao(orcamentoId: string) {
    const ano = new Date().getFullYear()
    const medicoesObraAno = medicoes.filter(m => m.obra_id === detalhe.id && m.numero?.startsWith('MED-' + ano))
    const numero = 'MED-' + ano + '-' + String(medicoesObraAno.length + 1).padStart(3, '0')
    const nova = await criar('medicoes', {
      obra_id: detalhe.id, orcamento_id: orcamentoId, tipo: fMedicao.tipo,
      fornecedor: fMedicao.tipo === 'fornecedor' ? (fMedicao.fornecedor || null) : null,
      numero, data: fMedicao.data, observacao: fMedicao.observacao, status: 'rascunho',
    })
    setTela('detalhe')
    if (nova?.id) {
      const [med, medIt] = await Promise.all([buscar('medicoes', '?order=data.desc'), buscar('medicao_itens', '?order=created_at')])
      setMedicoes(med); setMedItens(medIt)
      const itensOrc = orcItens.filter(i => i.orcamento_id === orcamentoId)
      const itensFiltrados = itensOrc.filter(i => nova.tipo !== 'fornecedor' || !nova.fornecedor || i.fornecedor === nova.fornecedor)
      abrirPreenchimentoMedicao(nova, itensFiltrados)
    }
  }
  async function salvarPreenchimentoMedicao(itensFiltrados: any[]) {
    for (const item of itensFiltrados) {
      const p = preenchimento[item.id]
      if (!p) continue
      const existente = medItens.find(mi => mi.medicao_id === medicaoAtiva.id && mi.orcamento_item_id === item.id)
      const dados = { medicao_id: medicaoAtiva.id, orcamento_item_id: item.id, valor_base: parseFloat(p.valor_base || '0'), percentual_acumulado: parseFloat(p.percentual || '0') / 100 }
      if (existente) await editar('medicao_itens', existente.id, dados)
      else await criar('medicao_itens', dados)
    }
    const medIt = await buscar('medicao_itens', '?order=created_at')
    setMedItens(medIt)
    alert('Medição salva!')
  }

  // ── Tela: Nova Medição ──────────────────────────────────────────
  if (tela === 'novaMedicao' && detalhe) {
    const orcamentoObra = orcamentos.find(o => o.obra_id === detalhe.id)
    const itensDoOrcamento = orcamentoObra ? orcItens.filter(i => i.orcamento_id === orcamentoObra.id) : []
    const fornecedoresDisponiveis = Array.from(new Set(itensDoOrcamento.map(i => i.fornecedor).filter(Boolean))) as string[]
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
            <button className={btnPrimaryCls} onClick={() => orcamentoObra && criarMedicao(orcamentoObra.id)}>Criar e Preencher</button>
            <button className={btnSecondaryCls} onClick={() => setTela('detalhe')}>Cancelar</button>
          </div>
        </div>
      </MobileShell>
    )
  }

  // ── Tela: Preenchimento de Medição ────────────────────────────
  if (tela === 'medicaoPreenchimento' && detalhe && medicaoAtiva) {
    const orcamentoObra = orcamentos.find(o => o.obra_id === detalhe.id)
    const itensDoOrcamento = orcamentoObra ? orcItens.filter(i => i.orcamento_id === orcamentoObra.id) : []
    const itensFiltrados = itensDoOrcamento.filter(i => medicaoAtiva.tipo !== 'fornecedor' || !medicaoAtiva.fornecedor || i.fornecedor === medicaoAtiva.fornecedor)
    const retPct = parseFloat(orcamentoObra?.retencao_percentual || 0)
    let totalPeriodo = 0, totalRetencao = 0, totalLiquido = 0
    const linhas = itensFiltrados.map(item => {
      const p = preenchimento[item.id] || { valor_base: String(parseFloat(item.total_item || 0)), percentual: '0' }
      const ultimo = ultimoRegistro(item.id, medicaoAtiva.id)
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
          <div className="text-[11px] text-on-surface-variant">{dataBR(medicaoAtiva.data)} · Retenção {(retPct * 100).toFixed(1)}%</div>
          {linhas.length === 0 ? (
            <div className="text-center py-8 text-on-surface-variant text-body-sm">Nenhum item para medir</div>
          ) : linhas.map(({ item, p, acumAtual, valorPeriodo, retencao, liquido }) => (
            <div key={item.id} className="bg-surface-container border border-outline-variant rounded-xl p-4">
              <div className="font-semibold text-sm text-on-surface mb-2">{item.servico}</div>
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
          <button className={btnPrimaryCls} onClick={() => salvarPreenchimentoMedicao(itensFiltrados)}>Salvar Medição</button>
        </div>
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
    const svs = servicosObra(detalhe.id)
    const orcamentoObra = orcamentos.find(o => o.obra_id === detalhe.id)
    const medicoesObra = medicoes.filter(m => m.obra_id === detalhe.id)
    const visitasObra = relatorios.filter(r => r.obra_id === detalhe.id)

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
            {[['resumo', '📋 Resumo'], ['visitas', '📷 Visitas'], ['medicoes', '📐 Medições'], ['nf', '🧾 NF']].map(([id, nome]) => (
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
            !orcamentoObra ? (
              <div className="text-center py-8 text-on-surface-variant text-body-sm">Nenhum orçamento vinculado a esta obra</div>
            ) : (
              <div className="flex flex-col gap-3">
                <button className={btnPrimaryCls} onClick={() => { setFMedicao(FMED_VAZIO); setTela('novaMedicao') }}>+ Nova Medição</button>
                {medicoesObra.length === 0 ? (
                  <div className="text-center py-6 text-on-surface-variant text-body-sm">Nenhuma medição ainda</div>
                ) : medicoesObra.map(med => {
                  const itensDoOrcamento = orcItens.filter(i => i.orcamento_id === orcamentoObra.id)
                  const itensFiltrados = itensDoOrcamento.filter(i => med.tipo !== 'fornecedor' || !med.fornecedor || i.fornecedor === med.fornecedor)
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
