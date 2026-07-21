'use client'
import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { obterMinhasPermissoes, temAcessoModulo } from '../lib/permissoes'

const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': 'Bearer ' + ANON }

const moeda = (v: number) => Number(v||0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

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
  const [loading, setLoading] = useState(true)
  const [detalhe, setDetalhe] = useState<any>(null)
  const [abaDetalhe, setAbaDetalhe] = useState('ambientes')
  const [ambienteAtivo, setAmbienteAtivo] = useState<any>(null)
  const [janela, setJanela] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [userEmail, setUserEmail] = useState('')

  const [fLev, setFLev] = useState({ codigo: '', cliente: '', endereco: '', responsavel: '', status: 'em_andamento', observacao: '' })
  const [fAmb, setFAmb] = useState({ nome: '', nomeCustom: '' })
  const [fItem, setFItem] = useState({ servico: '', descricao: '', comprimento: '', largura: '', altura: '', area: '', unidade: 'm²', observacao: '' })
  const [editItem, setEditItem] = useState<any>(null)

  useEffect(() => {
    if (!localStorage.getItem('viga_token')) { window.location.href = '/'; return }
    setUserEmail(localStorage.getItem('viga_email') || '')
    obterMinhasPermissoes().then(perm => { if (!temAcessoModulo(perm, 'levantamento')) window.location.href = '/' })
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
    const [l, a, it] = await Promise.all([
      buscar('levantamentos', '?order=created_at.desc'),
      buscar('levantamento_ambientes', '?order=ordem'),
      buscar('levantamento_itens', '?order=created_at'),
    ])
    setLevantamentos(l); setAmbientes(a); setItens(it)
    setLoading(false)
  }

  async function salvarLevantamento() {
    if (!fLev.cliente) return alert('Preencha o nome do cliente')
    const codigo = fLev.codigo || gerarCodigo(levantamentos)
    const dados = {
      codigo,
      cliente: fLev.cliente,
      endereco: fLev.endereco,
      responsavel: fLev.responsavel,
      status: fLev.status,
    }
    const novo = await criar('levantamentos', dados)
    setJanela(null)
    setFLev({ codigo: '', cliente: '', endereco: '', responsavel: '', status: 'em_andamento', observacao: '' })
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
    const area = fItem.area || (parseFloat(fItem.comprimento||'0') * parseFloat(fItem.largura||'0')).toFixed(2)
    const dados = {
      ambiente_id: ambienteAtivo.id,
      levantamento_id: detalhe.id,
      servico: fItem.servico,
      descricao: fItem.descricao,
      comprimento: parseFloat(fItem.comprimento||'0')||null,
      largura: parseFloat(fItem.largura||'0')||null,
      altura: parseFloat(fItem.altura||'0')||null,
      area: parseFloat(area)||null,
      unidade: fItem.unidade,
      observacao: fItem.observacao,
    }
    if (editItem) { await editar('levantamento_itens', editItem.id, dados) }
    else { await criar('levantamento_itens', dados) }
    setJanela(null); setEditItem(null)
    setFItem({ servico: '', descricao: '', comprimento: '', largura: '', altura: '', area: '', unidade: 'm²', observacao: '' })
    carregar()
  }

  async function criarOrcamento() {
    if (!detalhe) return
    const ano = new Date().getFullYear()
    const orcLista = await buscar('orcamentos', '?order=created_at.desc&limit=100')
    const n = orcLista.filter((o: any) => o.codigo?.startsWith('ORC-' + ano)).length + 1
    const codigo = 'ORC-' + ano + '-' + String(n).padStart(3, '0')
    const orc = await criar('orcamentos', {
      codigo,
      levantamento_id: detalhe.id,
      cliente: detalhe.cliente,
      endereco: detalhe.endereco,
      status: 'rascunho',
    })
    if (orc?.id) {
      const ambsLev = ambientes.filter(a => a.levantamento_id === detalhe.id)
      for (const amb of ambsLev) {
        const oa = await criar('orcamento_ambientes', { orcamento_id: orc.id, nome: amb.nome, ordem: amb.ordem })
        if (oa?.id) {
          const itensAmb = itens.filter(i => i.ambiente_id === amb.id)
          for (const item of itensAmb) {
            await criar('orcamento_itens', {
              orcamento_id: orc.id,
              ambiente_id: oa.id,
              servico: item.servico,
              descricao: item.descricao,
              quantidade: item.area || 1,
              unidade: item.unidade,
              preco_material: 0,
              preco_mao_obra: 0,
              total_item: 0,
            })
          }
        }
      }
      alert('Orçamento ' + codigo + ' criado com sucesso! Acesse o módulo Orçamento para preencher os valores.')
    }
  }

  const lista = levantamentos.filter(l =>
    !busca || [l.cliente, l.codigo, l.endereco].some(v => v?.toLowerCase().includes(busca.toLowerCase()))
  )

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-primary text-lg">Carregando levantamentos...</div>
    </div>
  )

  // ── DETALHE ────────────────────────────────────────────────
  if (detalhe) {
    const ambsDetalhe = ambientes.filter(a => a.levantamento_id === detalhe.id).sort((a, b) => a.ordem - b.ordem)
    const itensDetalhe = itens.filter(i => i.levantamento_id === detalhe.id)

    return (
      <Layout userEmail={userEmail} onLogout={sair}>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-lg">
          <div>
            <button onClick={() => { setDetalhe(null); setAmbienteAtivo(null) }} className={btnSecondaryCls + ' mb-3'}>← Voltar</button>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-body-sm text-on-surface-variant font-semibold">{detalhe.codigo}</span>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${STATUS_BADGE[detalhe.status] || STATUS_BADGE.em_andamento}`}>{STATUS_LEVA[detalhe.status] || detalhe.status}</span>
            </div>
            <h1 className="text-headline-md font-headline text-on-surface">{detalhe.cliente}</h1>
            {detalhe.endereco && <p className="text-body-sm text-on-surface-variant">📍 {detalhe.endereco}</p>}
          </div>
          <div className="flex gap-2 flex-wrap items-start">
            <select value={detalhe.status}
              onChange={async e => { await editar('levantamentos', detalhe.id, { status: e.target.value }); setDetalhe({ ...detalhe, status: e.target.value }); carregar() }}
              className={inputCls + ' w-auto text-xs py-1.5'}>
              {Object.entries(STATUS_LEVA).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
            <button className="bg-secondary text-on-secondary rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer" onClick={criarOrcamento}>📋 Gerar Orçamento</button>
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
        </div>

        {abaDetalhe === 'ambientes' && (
          <div className={sectionCls}>
            <div className="flex justify-between items-center mb-5">
              <div>
                <div className="text-sm font-bold text-on-surface">🏠 Ambientes</div>
                <div className="text-[11px] text-on-surface-variant mt-0.5">Clique em um ambiente para adicionar serviços</div>
              </div>
              <button className={btnPrimaryCls} onClick={() => { setFAmb({ nome: '', nomeCustom: '' }); setJanela('ambiente') }}>+ Novo Ambiente</button>
            </div>

            {ambsDetalhe.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">🏠</div>
                <div className="text-body-sm text-on-surface-variant mb-4">Nenhum ambiente cadastrado ainda</div>
                <button className={btnPrimaryCls} onClick={() => { setFAmb({ nome: '', nomeCustom: '' }); setJanela('ambiente') }}>+ Adicionar primeiro ambiente</button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {ambsDetalhe.map(amb => {
                  const itensAmb = itens.filter(i => i.ambiente_id === amb.id)
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
                          <button className={btnDangerSmCls} onClick={e => { e.stopPropagation(); if (confirm('Excluir ambiente e todos os itens?')) remover('levantamento_ambientes', amb.id).then(carregar) }}>×</button>
                        </div>
                      </div>

                      {isAtivo && (
                        <div className="p-4">
                          <div className="flex justify-end mb-3">
                            <button className={btnPrimaryCls} onClick={() => {
                              setFItem({ servico: '', descricao: '', comprimento: '', largura: '', altura: '', area: '', unidade: 'm²', observacao: '' })
                              setEditItem(null); setJanela('item')
                            }}>+ Adicionar Serviço</button>
                          </div>

                          {itensAmb.length === 0 ? (
                            <div className="text-center py-6 text-on-surface-variant text-sm">Nenhum serviço neste ambiente ainda</div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse text-sm">
                                <thead>
                                  <tr className="border-b border-outline-variant">
                                    {['Serviço', 'Descrição', 'C(m)', 'L(m)', 'A(m)', 'Área', 'Un', 'Obs', ''].map(h => (
                                      <th key={h} className="text-left px-2.5 py-2 text-[10px] text-on-surface-variant uppercase bg-surface-container-high whitespace-nowrap">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {itensAmb.map(item => (
                                    <tr key={item.id} className="border-b border-outline-variant hover:bg-surface-variant/20">
                                      <td className="px-2.5 py-2.5 font-semibold text-on-surface">{item.servico}</td>
                                      <td className="px-2.5 py-2.5 text-on-surface-variant text-xs">{item.descricao || '—'}</td>
                                      <td className="px-2.5 py-2.5 text-on-surface-variant text-xs">{item.comprimento || '—'}</td>
                                      <td className="px-2.5 py-2.5 text-on-surface-variant text-xs">{item.largura || '—'}</td>
                                      <td className="px-2.5 py-2.5 text-on-surface-variant text-xs">{item.altura || '—'}</td>
                                      <td className="px-2.5 py-2.5 font-semibold text-primary">{item.area ? item.area + ' ' + item.unidade : '—'}</td>
                                      <td className="px-2.5 py-2.5 text-on-surface-variant text-xs">{item.unidade}</td>
                                      <td className="px-2.5 py-2.5 text-on-surface-variant text-[11px] max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">{item.observacao || '—'}</td>
                                      <td className="px-2.5 py-2.5">
                                        <div className="flex gap-1">
                                          <button className={btnEditSmCls} onClick={() => {
                                            setFItem({ servico: item.servico, descricao: item.descricao || '', comprimento: item.comprimento || '', largura: item.largura || '', altura: item.altura || '', area: item.area || '', unidade: item.unidade || 'm²', observacao: item.observacao || '' })
                                            setEditItem(item); setJanela('item')
                                          }}>✏️</button>
                                          <button className={btnDangerSmCls} onClick={() => remover('levantamento_itens', item.id).then(carregar)}>×</button>
                                        </div>
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
              const itensAmb = itens.filter(i => i.ambiente_id === amb.id)
              return (
                <div key={amb.id} className="mb-5 pb-5 border-b border-outline-variant last:border-0">
                  <div className="text-sm font-bold text-primary mb-2.5">🏠 {amb.nome}</div>
                  {itensAmb.length === 0 ? (
                    <div className="text-xs text-on-surface-variant/50">Nenhum serviço</div>
                  ) : itensAmb.map(item => (
                    <div key={item.id} className="flex justify-between items-start py-2 border-b border-outline-variant/30 last:border-0">
                      <div>
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
            <div className="mt-4">
              <button className="w-full bg-secondary text-on-secondary rounded-lg py-3 text-sm font-bold hover:opacity-90 transition-all cursor-pointer" onClick={criarOrcamento}>
                📋 Gerar Orçamento a partir deste Levantamento
              </button>
            </div>
          </div>
        )}

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

        {janela === 'item' && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[560px] max-h-[92vh] overflow-y-auto">
              <div className="text-base font-bold text-on-surface mb-1.5">{editItem ? '✏️ Editar Serviço' : '🔧 Novo Serviço'}</div>
              <div className="text-body-sm text-primary mb-5">Ambiente: {ambienteAtivo?.nome}</div>
              <div className="mb-3.5">
                <label className={labelCls}>Serviço *</label>
                <input className={inputCls} placeholder="Ex: Pintura das paredes, Troca do piso..." value={fItem.servico} onChange={e => setFItem({ ...fItem, servico: e.target.value })} />
              </div>
              <div className="mb-3.5">
                <label className={labelCls}>Descrição</label>
                <input className={inputCls} placeholder="Ex: Tinta acrílica cor branco neve, 2 demãos" value={fItem.descricao} onChange={e => setFItem({ ...fItem, descricao: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3.5">
                <div>
                  <label className={labelCls}>Comprim. (m)</label>
                  <input className={inputCls} type="number" placeholder="0,00" value={fItem.comprimento}
                    onChange={e => {
                      const c = e.target.value; const l = fItem.largura
                      const area = c && l ? (parseFloat(c) * parseFloat(l)).toFixed(2) : ''
                      setFItem({ ...fItem, comprimento: c, area })
                    }} />
                </div>
                <div>
                  <label className={labelCls}>Largura (m)</label>
                  <input className={inputCls} type="number" placeholder="0,00" value={fItem.largura}
                    onChange={e => {
                      const l = e.target.value; const c = fItem.comprimento
                      const area = c && l ? (parseFloat(c) * parseFloat(l)).toFixed(2) : ''
                      setFItem({ ...fItem, largura: l, area })
                    }} />
                </div>
                <div>
                  <label className={labelCls}>Altura (m)</label>
                  <input className={inputCls} type="number" placeholder="0,00" value={fItem.altura} onChange={e => setFItem({ ...fItem, altura: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Unidade</label>
                  <select className={inputCls} value={fItem.unidade} onChange={e => setFItem({ ...fItem, unidade: e.target.value })}>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="mb-3.5">
                <label className={labelCls}>Área / Quantidade calculada</label>
                <input className={inputCls + ' text-primary font-bold'} placeholder="Calculado automaticamente ou digite" value={fItem.area} onChange={e => setFItem({ ...fItem, area: e.target.value })} />
                {fItem.comprimento && fItem.largura && <div className="text-[11px] text-on-surface-variant mt-1">Calculado: {(parseFloat(fItem.comprimento) * parseFloat(fItem.largura)).toFixed(2)} m²</div>}
              </div>
              <div className="mb-5">
                <label className={labelCls}>Observação técnica</label>
                <input className={inputCls + (fItem.observacao ? ' border-tertiary/40' : '')} placeholder="Ex: Infiltração detectada, verificar antes de iniciar" value={fItem.observacao} onChange={e => setFItem({ ...fItem, observacao: e.target.value })} />
              </div>
              <div className="flex gap-2 justify-end">
                <button className={btnSecondaryCls} onClick={() => { setJanela(null); setEditItem(null) }}>Cancelar</button>
                <button className={btnPrimaryCls} onClick={salvarItem}>{editItem ? 'Salvar Alterações' : 'Adicionar Serviço'}</button>
              </div>
            </div>
          </div>
        )}
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
            placeholder="Buscar por cliente, código ou endereço..."
            className="w-full bg-surface-container-low border border-outline-variant rounded-full pl-12 pr-4 py-2 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
          />
        </div>
      }
      topbarSlot={
        <>
          <button
            onClick={() => { setFLev({ codigo: '', cliente: '', endereco: '', responsavel: '', status: 'em_andamento', observacao: '' }); setJanela('levantamento') }}
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
                  <h4 className="font-headline text-headline-sm text-on-surface mb-1">{lev.cliente}</h4>
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
              <label className={labelCls}>Cliente *</label>
              <input className={inputCls} placeholder="Nome do cliente" value={fLev.cliente} onChange={e => setFLev({ ...fLev, cliente: e.target.value })} />
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Endereço do imóvel</label>
              <input className={inputCls} placeholder="Rua, número, bairro, cidade" value={fLev.endereco} onChange={e => setFLev({ ...fLev, endereco: e.target.value })} />
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
