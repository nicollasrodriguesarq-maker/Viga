'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AtividadeDetalhe from './AtividadeDetalhe'
import FormAtividade from './FormAtividade'
import { EVENTO_DADOS_ALTERADOS } from '../lib/alertas'
import {
  COR_SITUACAO, ICONE_STATUS, atividadeConcluida, carregarAtividadesGestao, carregarTipos, criarAtividade, dataBR, enviarAnexo, excluirAtividade,
  removerAnexo, salvarAtividade, situacaoPrazo, textoPrazo, type Atividade, type DadosAtividade,
} from '../lib/atividades'
import { hojeISO } from '../lib/datas'

const inputCls = 'bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3 py-2 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const btnPrimaryCls = 'bg-primary text-on-primary rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer'
const btnSecondaryCls = 'bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg px-4 py-2.5 text-sm hover:bg-surface-variant transition-all cursor-pointer'
const btnEditSmCls = 'bg-primary/10 border border-primary/30 text-primary rounded-md px-2.5 py-1 text-xs hover:bg-primary/20 transition-all cursor-pointer'
const btnDangerSmCls = 'bg-error/10 border border-error/30 text-error rounded-md px-2.5 py-1 text-xs hover:bg-error/20 transition-all cursor-pointer'
const sectionCls = 'bg-surface-container border border-outline-variant rounded-xl p-5'
const nomeDe = (usuarios: any[], id?: string | null) => { const u = usuarios.find(x => x.id === id); return u ? (u.nome || (u.email || '').split('@')[0]) : 'Alguém' }

type FiltroStatus = 'abertas' | 'atrasadas' | 'concluidas' | 'todas'

export default function PainelAtividadesEquipe({ usuarios, selecionaveis, visiveis, meuId }: {
  usuarios: any[]          // todas as pessoas (para mostrar nomes)
  selecionaveis: any[]     // quem este gestor pode escolher como responsável
  visiveis: string[] | null // null = admin (vê tudo)
  meuId: string
}) {
  const [lista, setLista] = useState<Atividade[] | null>(null)
  const [tipos, setTipos] = useState<{ id: string; nome: string; alerta_dias: number }[]>([])
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<FiltroStatus>('abertas')
  const [fResp, setFResp] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState<null | { atividade: Atividade | null }>(null)
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const hoje = hojeISO()

  const carregar = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([carregarAtividadesGestao(visiveis, meuId), carregarTipos()])
      setLista(a); setTipos(t); setErro('')
    } catch (e: any) { setErro((e?.message || 'Falha ao carregar') + ' — rode o SQL das atividades no Supabase se ainda não rodou.'); setLista([]) }
  }, [visiveis, meuId])
  useEffect(() => { if (meuId) carregar() }, [carregar, meuId])

  const enriquecida = useMemo(() => (lista || []).map(a => {
    const concluida = atividadeConcluida(a)
    return { a, concluida, sit: situacaoPrazo(a, concluida, hoje) }
  }), [lista, hoje])

  const kpi = {
    abertas: enriquecida.filter(x => !x.concluida).length,
    atrasadas: enriquecida.filter(x => x.sit.situacao === 'atrasada').length,
    vencendo: enriquecida.filter(x => ['vence_hoje', 'vencendo'].includes(x.sit.situacao)).length,
    concluidas: enriquecida.filter(x => x.concluida).length,
  }

  const termo = busca.trim().toLowerCase()
  const visivel = enriquecida.filter(x => {
    if (filtro === 'abertas' && x.concluida) return false
    if (filtro === 'atrasadas' && x.sit.situacao !== 'atrasada') return false
    if (filtro === 'concluidas' && !x.concluida) return false
    if (fResp && !x.a.responsaveis.some(r => r.usuario_id === fResp)) return false
    if (fTipo && x.a.tipo !== fTipo) return false
    if (termo && !`${x.a.titulo} ${x.a.descricao || ''}`.toLowerCase().includes(termo)) return false
    return true
  }).sort((p, q) => (p.concluida === q.concluida ? p.a.data_fim.localeCompare(q.a.data_fim) : p.concluida ? 1 : -1))

  async function salvar(dados: DadosAtividade, responsaveis: string[], arquivos: File[]) {
    const editando = form?.atividade
    const id = editando ? editando.id : (await criarAtividade(dados, responsaveis, meuId)).id
    if (editando) await salvarAtividade(editando.id, dados, responsaveis)
    for (const f of arquivos) await enviarAnexo(id, f, meuId)
    setForm(null); await carregar()
    window.dispatchEvent(new Event(EVENTO_DADOS_ALTERADOS))
  }
  async function excluir(a: Atividade) {
    if (!confirm(`Excluir a atividade "${a.titulo}"? Os anexos e o andamento também serão apagados.`)) return
    try { await excluirAtividade(a); setDetalheId(null); await carregar(); window.dispatchEvent(new Event(EVENTO_DADOS_ALTERADOS)) } catch (e: any) { alert('Não foi possível excluir: ' + (e?.message || 'tente novamente')) }
  }

  const chip = (k: FiltroStatus, rot: string, n?: number) => (
    <button key={k} onClick={() => setFiltro(k)} data-testid={`filtro-${k}`}
      className={`px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${filtro === k ? 'bg-primary/20 text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-variant'}`}>{rot}{n !== undefined ? ` (${n})` : ''}</button>
  )
  const detalhe = detalheId ? (lista || []).find(a => a.id === detalheId) : null

  return (
    <div data-testid="painel-atividades-equipe">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <p className="text-body-sm text-on-surface-variant">Distribua atividades para a equipe, com prazo e anexos. Quem é responsável é avisado no painel e o prazo gera alerta.</p>
        <button className={btnPrimaryCls} onClick={() => setForm({ atividade: null })} data-testid="btn-nova-atividade">+ Nova atividade</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {[['Em aberto', kpi.abertas, 'text-primary'], ['Atrasadas', kpi.atrasadas, 'text-error'], ['Vencem em breve', kpi.vencendo, 'text-tertiary'], ['Concluídas', kpi.concluidas, 'text-primary-container']].map(([r, n, c]) => (
          <div key={r as string} className={sectionCls + ' !p-4'}><div className="text-[11px] text-on-surface-variant uppercase tracking-widest mb-1">{r}</div><div className={`text-2xl font-bold ${c}`} data-testid={`kpi-${(r as string).toLowerCase().replace(/\s/g, '-')}`}>{n}</div></div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center mb-4">
        <div className="flex gap-1 p-1 bg-surface-container rounded-xl border border-outline-variant">
          {chip('abertas', 'Em aberto')}{chip('atrasadas', 'Atrasadas', kpi.atrasadas)}{chip('concluidas', 'Concluídas')}{chip('todas', 'Todas')}
        </div>
        <select className={inputCls} value={fResp} onChange={e => setFResp(e.target.value)} data-testid="filtro-responsavel">
          <option value="">Todas as pessoas</option>
          {selecionaveis.map(u => <option key={u.id} value={u.id}>{u.nome || u.email}</option>)}
        </select>
        <select className={inputCls} value={fTipo} onChange={e => setFTipo(e.target.value)} data-testid="filtro-tipo">
          <option value="">Todos os tipos</option>
          {tipos.map(t => <option key={t.id} value={t.nome}>{t.nome}</option>)}
        </select>
        <input className={inputCls + ' flex-1 min-w-[180px]'} placeholder="Buscar atividade..." value={busca} onChange={e => setBusca(e.target.value)} />
      </div>

      {erro && <div className="bg-error/10 border border-error/30 rounded-lg px-4 py-3 text-error text-sm mb-4" data-testid="erro-atividades">{erro}</div>}
      {lista === null ? <div className={sectionCls + ' text-center text-on-surface-variant'}>Carregando atividades...</div> : visivel.length === 0 ? (
        <div className={sectionCls + ' text-center py-12'}>
          <div className="text-4xl mb-2">📋</div>
          <div className="font-bold text-on-surface mb-1">{enriquecida.length === 0 ? 'Nenhuma atividade criada ainda' : 'Nada encontrado com estes filtros'}</div>
          {enriquecida.length === 0 && <div className="text-body-sm text-on-surface-variant">Clique em “+ Nova atividade” para distribuir a primeira.</div>}
        </div>
      ) : (
        <div className="flex flex-col gap-2" data-testid="lista-atividades">
          {visivel.map(({ a, concluida, sit }) => (
            <div key={a.id} className="bg-surface-container border border-outline-variant rounded-xl px-4 py-3 hover:border-primary transition-colors cursor-pointer" onClick={() => setDetalheId(a.id)} data-testid="card-atividade">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20">{a.tipo}</span>
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${COR_SITUACAO[sit.situacao]}`}>{textoPrazo(a, sit)}</span>
                    {a.anexos.length > 0 && <span className="text-[11px] text-on-surface-variant">📎 {a.anexos.length}</span>}
                  </div>
                  <div className={`font-semibold text-sm ${concluida ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>{a.titulo}</div>
                  <div className="text-[11px] text-on-surface-variant mt-0.5">📅 {dataBR(a.data_inicio)} → {dataBR(a.data_fim)}</div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {a.responsaveis.map(r => (
                      <span key={r.id} className={`text-[11px] px-2 py-0.5 rounded-full border ${r.status === 'concluida' ? 'border-primary/30 text-primary bg-primary/5' : r.status === 'em_andamento' ? 'border-secondary/30 text-secondary bg-secondary/5' : 'border-outline-variant text-on-surface-variant'}`}>
                        {ICONE_STATUS[r.status]} {r.usuario_id === meuId ? 'Eu' : nomeDe(usuarios, r.usuario_id)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                  <button className={btnEditSmCls} onClick={() => setForm({ atividade: a })} data-testid="btn-editar-atividade">Editar</button>
                  <button className={btnDangerSmCls} onClick={() => excluir(a)} aria-label="Excluir atividade" data-testid="btn-excluir-atividade">×</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <FormAtividade inicial={form.atividade} usuarios={selecionaveis} tipos={tipos} meuId={meuId} onSalvar={salvar} onCancelar={() => setForm(null)}
          onExcluirAnexo={async x => { await removerAnexo(x); await carregar() }} />
      )}

      {detalhe && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setDetalheId(null)}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[620px] max-h-[92vh] overflow-y-auto" data-testid="modal-atividade">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="text-lg font-bold text-on-surface">{detalhe.titulo}</div>
              <div className="flex gap-2 shrink-0">
                <button className={btnEditSmCls} onClick={() => { setDetalheId(null); setForm({ atividade: detalhe }) }}>Editar</button>
                <button className={btnSecondaryCls + ' !py-1 !px-3 !text-xs'} onClick={() => setDetalheId(null)} data-testid="fechar-atividade">Fechar</button>
              </div>
            </div>
            <AtividadeDetalhe atividadeId={detalhe.id} meuId={meuId} usuarios={usuarios} gestor onAlterou={() => { carregar(); window.dispatchEvent(new Event(EVENTO_DADOS_ALTERADOS)) }} />
          </div>
        </div>
      )}
    </div>
  )
}
