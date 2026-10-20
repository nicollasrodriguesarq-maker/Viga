'use client'
import { useEffect, useState } from 'react'
import { conflitosDeHorario, ICONE_CONVITE, NOME_CONVITE, type StatusConvite } from '../lib/agendaParticipantes'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all'
const nomeDe = (usuarios: any[], id: string) => { const u = usuarios.find(x => x.id === id); return u ? (u.nome || (u.email || '').split('@')[0]) : 'Usuário' }

// Escolha de participantes no formulário: chips + seletor de pessoas da empresa.
export function CampoParticipantes({ usuarios, donoId, valor, onChange }: { usuarios: any[]; donoId: string; valor: string[]; onChange: (ids: string[]) => void }) {
  const disponiveis = usuarios.filter(u => u.id !== donoId && !valor.includes(u.id))
  return (
    <div data-testid="campo-participantes">
      {valor.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {valor.map(id => (
            <span key={id} className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20" data-testid="chip-participante">
              👤 {nomeDe(usuarios, id)}
              <button type="button" className="text-primary/70 hover:text-error cursor-pointer" onClick={() => onChange(valor.filter(x => x !== id))} aria-label="Remover participante">×</button>
            </span>
          ))}
        </div>
      )}
      <select className={inputCls} value="" onChange={e => { if (e.target.value) onChange([...valor, e.target.value]) }} data-testid="select-participante">
        <option value="">{disponiveis.length === 0 ? 'Todas as pessoas já foram adicionadas' : '➕ Adicionar pessoa ao compromisso...'}</option>
        {disponiveis.map(u => <option key={u.id} value={u.id}>{u.nome || u.email}</option>)}
      </select>
    </div>
  )
}

// Avisa (sem bloquear) quando alguém do compromisso já tem outro no mesmo horário.
export function AvisoConflitos({ usuarios, ids, data, ini, fim, ignorarId }: { usuarios: any[]; ids: string[]; data: string; ini: string; fim: string; ignorarId?: string }) {
  const [conflitos, setConflitos] = useState<{ usuarioId: string; titulo: string; hora: string }[]>([])
  const chave = ids.slice().sort().join(',') + '|' + data + '|' + ini + '|' + fim
  useEffect(() => {
    let vivo = true
    const t = setTimeout(() => { conflitosDeHorario(ids, data, ini, fim, ignorarId).then(c => { if (vivo) setConflitos(c) }).catch(() => {}) }, 350)
    return () => { vivo = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, ignorarId])
  if (conflitos.length === 0) return null
  return (
    <div className="bg-tertiary/10 border border-tertiary/30 rounded-lg px-3 py-2.5 text-[12px] text-tertiary mb-3.5" data-testid="aviso-conflito">
      ⚠️ <strong>Conflito de horário:</strong>
      {conflitos.map((c, i) => <div key={i}>{nomeDe(usuarios, c.usuarioId)} já tem “{c.titulo}” às {c.hora}</div>)}
    </div>
  )
}

// Lista de convidados com a situação de cada um.
export function ListaParticipantes({ participantes, usuarios, meuId }: { participantes: any[]; usuarios: any[]; meuId?: string }) {
  if (!participantes || participantes.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5" data-testid="lista-participantes">
      {participantes.map(p => (
        <span key={p.id} title={NOME_CONVITE[p.status as StatusConvite]}
          className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${p.status === 'recusado' ? 'border-error/30 text-error bg-error/5 line-through' : p.status === 'aceito' ? 'border-primary/30 text-primary bg-primary/5' : 'border-outline-variant text-on-surface-variant bg-surface-container-low'}`}>
          {ICONE_CONVITE[p.status as StatusConvite]} {p.usuario_id === meuId ? 'Você' : nomeDe(usuarios, p.usuario_id)}
        </span>
      ))}
    </div>
  )
}

// Botões de aceitar/recusar para quem foi convidado.
export function BotoesConvite({ comp, meuId, onResponder, compacto }: { comp: any; meuId: string; onResponder: (compromissoId: string, status: StatusConvite) => void; compacto?: boolean }) {
  const meu = (comp.participantes || []).find((p: any) => p.usuario_id === meuId)
  if (!meu) return null
  const cls = compacto ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-2" data-testid="botoes-convite">
      <span className="text-[11px] text-on-surface-variant">{meu.status === 'pendente' ? 'Você foi convidado:' : meu.status === 'aceito' ? 'Você aceitou' : 'Você recusou'}</span>
      {meu.status !== 'aceito' && <button type="button" className={`${cls} rounded-md font-semibold bg-primary/15 text-primary border border-primary/30 cursor-pointer`} onClick={() => onResponder(comp.id, 'aceito')} data-testid="aceitar-convite">✅ Aceitar</button>}
      {meu.status !== 'recusado' && <button type="button" className={`${cls} rounded-md font-semibold bg-error/10 text-error border border-error/30 cursor-pointer`} onClick={() => onResponder(comp.id, 'recusado')} data-testid="recusar-convite">❌ Recusar</button>}
    </div>
  )
}

export function BotaoEntrarReuniao({ link }: { link?: string | null }) {
  if (!link) return null
  const url = /^https?:\/\//i.test(link) ? link : 'https://' + link
  return <a href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 mt-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-md bg-secondary/15 text-secondary border border-secondary/30 hover:bg-secondary/25" data-testid="entrar-reuniao">🔗 Entrar na reunião</a>
}
