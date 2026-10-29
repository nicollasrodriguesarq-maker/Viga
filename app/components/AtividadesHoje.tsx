'use client'
import { useCallback, useEffect, useState } from 'react'
import AtividadeDetalhe from './AtividadeDetalhe'
import { EVENTO_DADOS_ALTERADOS } from '../lib/alertas'
import {
  COR_SITUACAO, ICONE_STATUS, NOME_STATUS, STATUS_LISTA, atividadesDeHoje, carregarMinhasAtividades, dataBR, definirStatus, situacaoPrazo, textoPrazo,
  type Atividade, type Responsavel, type StatusResp,
} from '../lib/atividades'
import { hojeISO } from '../lib/datas'

// "Minhas atividades de hoje": o que está no prazo hoje, o que atrasou e o que começa nos próximos dias.
// A pessoa atualiza o status ali mesmo e abre o detalhe para comentar e anexar arquivos.
export default function AtividadesHoje({ meuId, usuarios, mobile = false }: { meuId: string; usuarios: any[]; mobile?: boolean }) {
  const [lista, setLista] = useState<Atividade[] | null>(null)
  const [erro, setErro] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const [verProximas, setVerProximas] = useState(false)
  const [salvando, setSalvando] = useState<string | null>(null)
  const nomeMeu = (() => { const u = usuarios.find(x => x.id === meuId); return u ? (u.nome || (u.email || '').split('@')[0]) : 'Você' })()

  const carregar = useCallback(async () => {
    if (!meuId) return
    try { setLista(await carregarMinhasAtividades(meuId)); setErro('') } catch (e: any) { setErro(e?.message || 'Não foi possível carregar as atividades') }
  }, [meuId])
  useEffect(() => { carregar() }, [carregar])
  // quem altera uma atividade em outra tela (ou outra pessoa, no minuto seguinte) atualiza esta lista
  useEffect(() => {
    const t = setInterval(carregar, 60_000)
    window.addEventListener('focus', carregar)
    return () => { clearInterval(t); window.removeEventListener('focus', carregar) }
  }, [carregar])

  async function mudarStatus(a: Atividade, s: StatusResp) {
    setSalvando(a.id)
    try { await definirStatus(a.id, meuId, s, nomeMeu); await carregar(); window.dispatchEvent(new Event(EVENTO_DADOS_ALTERADOS)) } catch (e: any) { setErro(e?.message || 'Não foi possível atualizar') }
    setSalvando(null)
  }

  const hoje = hojeISO()
  const g = atividadesDeHoje(lista || [], meuId, hoje)
  const abertas = g.atrasadas.length + g.hoje.length
  const vazio = lista !== null && abertas + g.feitasHoje.length === 0

  // função (não componente): evita remontar o painel de detalhe a cada atualização da lista
  function renderLinha(a: Atividade) {
    const minha = a.responsaveis.find(r => r.usuario_id === meuId) as Responsavel
    const sit = situacaoPrazo(a, minha.status === 'concluida', hoje)
    const expandida = aberta === a.id
    return (
      <div key={a.id} className="border-b border-outline-variant/30 last:border-0" data-testid="linha-atividade-hoje">
        <div className={`flex items-center gap-3 ${mobile ? 'px-3 py-2.5' : 'px-lg py-md'} flex-wrap`}>
          <button type="button" className="flex-1 min-w-0 text-left cursor-pointer" onClick={() => setAberta(expandida ? null : a.id)} data-testid="abrir-atividade">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-semibold truncate ${minha.status === 'concluida' ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>{a.titulo}</span>
              {a.responsaveis.length > 1 && <span className="text-[10px] text-on-surface-variant">👥 {a.responsaveis.length}</span>}
              {a.anexos.length > 0 && <span className="text-[10px] text-on-surface-variant">📎 {a.anexos.length}</span>}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{a.tipo}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${COR_SITUACAO[sit.situacao]}`}>{textoPrazo(a, sit)}</span>
              {a.data_inicio > hoje && <span className="text-[10px] text-on-surface-variant">início {dataBR(a.data_inicio)}</span>}
            </div>
          </button>
          <select value={minha.status} disabled={salvando === a.id} onChange={e => mudarStatus(a, e.target.value as StatusResp)} data-testid="select-status-hoje"
            className="bg-surface-container-low border border-outline-variant rounded-lg text-on-surface text-xs px-2 py-1.5 outline-none focus:border-primary shrink-0 cursor-pointer">
            {STATUS_LISTA.map(s => <option key={s} value={s}>{ICONE_STATUS[s]} {NOME_STATUS[s]}</option>)}
          </select>
        </div>
        {expandida && (
          <div className={`${mobile ? 'px-3' : 'px-lg'} pb-4`}>
            <div className="bg-surface-container-low/50 border border-outline-variant rounded-xl p-4">
              <AtividadeDetalhe atividadeId={a.id} meuId={meuId} usuarios={usuarios} gestor={false} onAlterou={() => { carregar(); window.dispatchEvent(new Event(EVENTO_DADOS_ALTERADOS)) }} />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <section id="atividades" className="bg-surface-container rounded-2xl card-border overflow-hidden flex flex-col h-full" data-testid="card-atividades-hoje">
      <div className={`${mobile ? 'px-4 py-3' : 'px-lg py-lg'} flex items-center justify-between border-b border-outline-variant bg-surface-container-high/50 gap-2`}>
        <h3 className={mobile ? 'text-sm font-bold text-on-surface' : 'font-headline text-headline-sm text-on-surface'}>✅ Minhas Atividades de Hoje</h3>
        {lista !== null && abertas > 0 && (
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${g.atrasadas.length ? COR_SITUACAO.atrasada : COR_SITUACAO.em_andamento}`} data-testid="contagem-atividades">
            {abertas} {abertas === 1 ? 'em aberto' : 'em aberto'}{g.atrasadas.length ? ` · ${g.atrasadas.length} atrasada${g.atrasadas.length > 1 ? 's' : ''}` : ''}
          </span>
        )}
      </div>

      {erro && <div className="px-lg py-md text-error text-body-sm">{erro}</div>}
      {lista === null && !erro && <div className="px-lg py-lg text-on-surface-variant text-body-sm">Carregando...</div>}
      {vazio && <div className="px-lg py-lg text-on-surface-variant text-body-sm" data-testid="sem-atividades">Nenhuma atividade para hoje. 🎉</div>}

      {g.atrasadas.length > 0 && (
        <div>
          <div className="px-lg py-1.5 text-[10px] font-bold uppercase tracking-wide text-error bg-error/5">Atrasadas</div>
          {g.atrasadas.map(x => renderLinha(x.a))}
        </div>
      )}
      {g.hoje.length > 0 && (
        <div>
          {g.atrasadas.length > 0 && <div className="px-lg py-1.5 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant bg-surface-container-high/30">No prazo de hoje</div>}
          {g.hoje.map(x => renderLinha(x.a))}
        </div>
      )}
      {g.feitasHoje.length > 0 && (
        <div>
          <div className="px-lg py-1.5 text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/5">Concluídas hoje</div>
          {g.feitasHoje.map(x => renderLinha(x.a))}
        </div>
      )}
      {g.proximas.length > 0 && (
        <div>
          <button className="w-full text-left px-lg py-2 text-[11px] font-bold text-primary hover:bg-surface-variant/30 cursor-pointer border-t border-outline-variant/30" onClick={() => setVerProximas(v => !v)} data-testid="toggle-proximas">
            {verProximas ? '▾' : '▸'} Começam nos próximos 7 dias ({g.proximas.length})
          </button>
          {verProximas && g.proximas.map(x => renderLinha(x.a))}
        </div>
      )}
    </section>
  )
}
