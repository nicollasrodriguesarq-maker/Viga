'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  COR_SITUACAO, ICONE_STATUS, NOME_STATUS, STATUS_LISTA, adicionarNota, atividadeConcluida, carregarAtividade, carregarNotas, dataBR,
  definirStatus, enviarAnexo, linkAnexo, removerAnexo, situacaoPrazo, tamanhoLegivel, textoPrazo, type Atividade, type StatusResp,
} from '../lib/atividades'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const btnSmCls = 'bg-primary/10 border border-primary/30 text-primary rounded-md px-2.5 py-1 text-xs hover:bg-primary/20 transition-all cursor-pointer disabled:opacity-50'
const nomeDe = (usuarios: any[], id?: string | null) => { const u = usuarios.find(x => x.id === id); return u ? (u.nome || (u.email || '').split('@')[0]) : 'Alguém' }

// Painel de uma atividade: dados, andamento de cada responsável, status da própria pessoa, comentários e anexos.
// Serve tanto para o funcionário (atualiza a própria parte) quanto para o gestor (acompanha todos).
export default function AtividadeDetalhe({ atividadeId, meuId, usuarios, gestor, onAlterou }: {
  atividadeId: string; meuId: string; usuarios: any[]; gestor: boolean; onAlterou?: () => void
}) {
  const [a, setA] = useState<Atividade | null>(null)
  const [notas, setNotas] = useState<any[]>([])
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const arquivoRef = useRef<HTMLInputElement>(null)

  const recarregar = useCallback(async () => {
    try {
      const [at, nt] = await Promise.all([carregarAtividade(atividadeId), carregarNotas(atividadeId)])
      setA(at); setNotas(nt); setErro('')
    } catch (e: any) { setErro(e?.message || 'Não foi possível carregar a atividade') }
  }, [atividadeId])
  useEffect(() => { recarregar() }, [recarregar])

  async function executar(fn: () => Promise<void>) {
    if (ocupado) return
    setOcupado(true); setErro('')
    try { await fn(); await recarregar(); onAlterou?.() } catch (e: any) { setErro(e?.message || 'Não foi possível concluir') }
    setOcupado(false)
  }

  if (!a) return <div className="text-sm text-on-surface-variant py-6 text-center">{erro || 'Carregando...'}</div>

  const meu = a.responsaveis.find(r => r.usuario_id === meuId)
  const concluida = atividadeConcluida(a)
  const sit = situacaoPrazo(a, meu ? meu.status === 'concluida' : concluida)
  const nomeMeu = nomeDe(usuarios, meuId)

  return (
    <div data-testid="detalhe-atividade">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-primary/10 text-primary border-primary/20">{a.tipo}</span>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${COR_SITUACAO[sit.situacao]}`} data-testid="situacao-atividade">{textoPrazo(a, sit)}</span>
        {concluida && <span className="text-[11px] font-bold text-primary">✅ todos concluíram</span>}
      </div>
      <div className="text-[12px] text-on-surface-variant mb-3">📅 {dataBR(a.data_inicio)} → {dataBR(a.data_fim)} · 🔔 avisa {a.alerta_dias === 0 ? 'no dia do prazo' : `${a.alerta_dias} ${a.alerta_dias === 1 ? 'dia' : 'dias'} antes`} · criada por {nomeDe(usuarios, a.criado_por)}</div>
      {a.descricao && <div className="text-sm text-on-surface bg-surface-container-low rounded-lg px-3.5 py-3 mb-3 whitespace-pre-wrap">{a.descricao}</div>}

      {meu && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-3 mb-3" data-testid="meu-status">
          <div className="text-[11px] font-bold uppercase tracking-wide text-primary mb-2">Minha parte</div>
          <div className="flex gap-2 flex-wrap">
            {STATUS_LISTA.map(s => (
              <button key={s} disabled={ocupado} onClick={() => meu.status !== s && executar(() => definirStatus(a.id, meuId, s, nomeMeu))} data-testid={`status-${s}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-all disabled:opacity-50 ${meu.status === s ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:border-primary'}`}>
                {ICONE_STATUS[s]} {NOME_STATUS[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-1.5">Responsáveis</div>
        <div className="flex flex-wrap gap-1.5">
          {a.responsaveis.map(r => (
            <span key={r.id} title={NOME_STATUS[r.status]} className={`inline-flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-full border ${r.status === 'concluida' ? 'border-primary/30 text-primary bg-primary/5' : r.status === 'em_andamento' ? 'border-secondary/30 text-secondary bg-secondary/5' : 'border-outline-variant text-on-surface-variant bg-surface-container-low'}`}>
              {ICONE_STATUS[r.status]} {r.usuario_id === meuId ? 'Você' : nomeDe(usuarios, r.usuario_id)}
            </span>
          ))}
          {a.responsaveis.length === 0 && <span className="text-[12px] text-on-surface-variant">Nenhum responsável definido</span>}
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">Anexos ({a.anexos.length})</div>
          <button className={btnSmCls} disabled={ocupado} onClick={() => arquivoRef.current?.click()} data-testid="btn-anexar">📎 Anexar arquivo</button>
          <input ref={arquivoRef} type="file" multiple className="hidden" data-testid="input-anexo"
            onChange={e => { const arqs = Array.from(e.target.files || []); e.target.value = ''; if (arqs.length) executar(async () => { for (const f of arqs) await enviarAnexo(a.id, f, meuId) }) }} />
        </div>
        {a.anexos.length === 0 ? <div className="text-[12px] text-on-surface-variant">Nenhum arquivo anexado.</div> : (
          <div className="flex flex-col gap-1">
            {a.anexos.map(x => (
              <div key={x.id} className="flex items-center gap-2 text-sm bg-surface-container-low rounded-lg px-3 py-2" data-testid="anexo-atividade">
                <span>📄</span>
                <a href={linkAnexo(x.caminho)} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate flex-1">{x.nome}</a>
                <span className="text-[11px] text-on-surface-variant shrink-0">{tamanhoLegivel(x.tamanho)}</span>
                {(gestor || x.enviado_por === meuId) && (
                  <button className="text-error text-xs cursor-pointer shrink-0" disabled={ocupado} aria-label="Remover anexo" onClick={() => confirm(`Remover o anexo "${x.nome}"?`) && executar(() => removerAnexo(x))}>×</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-1.5">Andamento</div>
        <div className="flex gap-2 mb-2">
          <input className={inputCls} placeholder="Escreva uma atualização (ex.: material comprado, cliente aprovou...)" value={texto} onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && texto.trim()) executar(async () => { await adicionarNota(a.id, meuId, texto); setTexto('') }) }} data-testid="input-nota" />
          <button className={btnSmCls + ' shrink-0 !px-3'} disabled={ocupado || !texto.trim()} data-testid="btn-nota" onClick={() => executar(async () => { await adicionarNota(a.id, meuId, texto); setTexto('') })}>Enviar</button>
        </div>
        <div className="flex flex-col max-h-48 overflow-y-auto">
          {notas.length === 0 && <div className="text-[12px] text-on-surface-variant">Sem atualizações ainda.</div>}
          {notas.map(n => (
            <div key={n.id} className="text-[12px] py-1.5 border-b border-outline-variant/40" data-testid="nota-atividade">
              <span className="text-on-surface-variant">{new Date(n.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              {' · '}{n.tipo === 'status' ? <span className="text-on-surface-variant italic">{n.texto}</span> : <><strong>{nomeDe(usuarios, n.usuario_id)}:</strong> {n.texto}</>}
            </div>
          ))}
        </div>
      </div>
      {erro && <div className="mt-3 bg-error/10 border border-error/30 rounded-lg px-3 py-2 text-error text-xs" data-testid="erro-atividade">{erro}</div>}
    </div>
  )
}
