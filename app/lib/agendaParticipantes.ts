// Agenda com participantes (convites no estilo Teams): quem organiza escolhe pessoas da empresa, cada convidado
// vê o compromisso na própria agenda e aceita ou recusa. Quem recusa deixa de ver o compromisso nos resumos.
const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
// Chave pública (anon): o acesso real é decidido pelo token do usuário, injetado em lib/authFetch.ts.
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON }

export type StatusConvite = 'pendente' | 'aceito' | 'recusado'
export const ICONE_CONVITE: Record<StatusConvite, string> = { pendente: '⏳', aceito: '✅', recusado: '❌' }
export const NOME_CONVITE: Record<StatusConvite, string> = { pendente: 'aguardando resposta', aceito: 'aceitou', recusado: 'recusou' }

async function erroDe(r: Response) { try { const d = await r.json(); return d?.message || ('erro ' + r.status) } catch { return 'erro ' + r.status } }
async function get(tabela: string, q = ''): Promise<any[]> {
  try { const r = await fetch(`${BASE}/${tabela}${q}`, { headers: H }); const d = await r.json(); return Array.isArray(d) ? d : [] } catch { return [] }
}
async function enviar(metodo: 'POST' | 'PATCH' | 'DELETE', caminho: string, corpo?: object): Promise<any> {
  const r = await fetch(`${BASE}/${caminho}`, { method: metodo, headers: metodo === 'DELETE' ? H : { ...H, Prefer: 'return=representation' }, body: corpo ? JSON.stringify(corpo) : undefined })
  if (!r.ok) throw new Error(await erroDe(r))
  if (metodo === 'DELETE') return null
  const d = await r.json().catch(() => null)
  return Array.isArray(d) ? d[0] : d
}

const ordenar = (a: any, b: any) => (a.data < b.data ? -1 : a.data > b.data ? 1 : (a.hora_inicio || '') < (b.hora_inicio || '') ? -1 : (a.hora_inicio || '') > (b.hora_inicio || '') ? 1 : 0)

// Compromissos dos donos informados + os que esses mesmos usuários foram convidados, já com a lista de participantes.
// `convidado: true` marca os que a pessoa vê só por ter sido convidada.
export async function carregarCompromissos(donos: string[], filtroExtra = ''): Promise<any[]> {
  if (donos.length === 0) return []
  const lista = donos.join(',')
  const proprios = await get('agenda_compromissos', `?usuario_id=in.(${lista})${filtroExtra}&order=data.asc,hora_inicio.asc`)
  const convites = await get('agenda_participantes', `?usuario_id=in.(${lista})&select=compromisso_id`)
  const jaTenho = new Set(proprios.map(c => c.id))
  const extraIds = [...new Set(convites.map(c => c.compromisso_id).filter(id => !jaTenho.has(id)))]
  const extras = extraIds.length ? await get('agenda_compromissos', `?id=in.(${extraIds.join(',')})${filtroExtra}&order=data.asc,hora_inicio.asc`) : []
  const todos = [...proprios, ...extras.map(c => ({ ...c, _convidado: true }))]
  return anexarParticipantes(todos).then(l => l.sort(ordenar))
}

// Todos os compromissos (admin enxerga a agenda inteira, sem filtro de dono).
export async function carregarTodosCompromissos(filtroExtra = ''): Promise<any[]> {
  const todos = await get('agenda_compromissos', `?order=data.asc,hora_inicio.asc${filtroExtra}`)
  return anexarParticipantes(todos)
}

export async function anexarParticipantes(compromissos: any[]): Promise<any[]> {
  if (compromissos.length === 0) return []
  const ids = compromissos.map(c => c.id)
  const parts = await get('agenda_participantes', `?compromisso_id=in.(${ids.join(',')})&select=id,compromisso_id,usuario_id,status`)
  return compromissos.map(c => ({ ...c, participantes: parts.filter(p => p.compromisso_id === c.id) }))
}

// Compromissos de um dia para os quais a pessoa foi convidada (e não recusou) — usado no Dashboard.
export async function convitesDoDia(usuarioId: string, data: string): Promise<any[]> {
  const parts = await get('agenda_participantes', `?usuario_id=eq.${usuarioId}&status=neq.recusado&select=compromisso_id`)
  if (parts.length === 0) return []
  const comps = await get('agenda_compromissos', `?id=in.(${parts.map(p => p.compromisso_id).join(',')})&data=eq.${data}&order=hora_inicio.asc`)
  return comps.map(c => ({ ...c, _convidado: true }))
}

export async function gravarCompromisso(id: string | null, dados: object): Promise<any> {
  return id ? enviar('PATCH', `agenda_compromissos?id=eq.${id}`, dados) : enviar('POST', 'agenda_compromissos', dados)
}
export async function excluirCompromissoDb(id: string) { await enviar('DELETE', `agenda_compromissos?id=eq.${id}`) }

// Ajusta a lista de convidados (adiciona os novos, remove os que saíram). Se a data/hora mudou, todos precisam
// confirmar de novo — como numa reunião remarcada.
export async function salvarParticipantes(compromissoId: string, novos: string[], donoId: string, pedirNovaConfirmacao: boolean) {
  const atuais = await get('agenda_participantes', `?compromisso_id=eq.${compromissoId}&select=id,usuario_id,status`)
  const alvo = [...new Set(novos.filter(id => id && id !== donoId))]
  for (const a of atuais) if (!alvo.includes(a.usuario_id)) await enviar('DELETE', `agenda_participantes?id=eq.${a.id}`)
  for (const u of alvo) if (!atuais.some(a => a.usuario_id === u)) await enviar('POST', 'agenda_participantes', { compromisso_id: compromissoId, usuario_id: u, status: 'pendente' })
  if (pedirNovaConfirmacao) {
    for (const a of atuais.filter(x => alvo.includes(x.usuario_id) && x.status !== 'pendente')) {
      await enviar('PATCH', `agenda_participantes?id=eq.${a.id}`, { status: 'pendente', respondido_em: null })
    }
  }
}

export async function responderConvite(compromissoId: string, usuarioId: string, status: StatusConvite) {
  await enviar('PATCH', `agenda_participantes?compromisso_id=eq.${compromissoId}&usuario_id=eq.${usuarioId}`, { status, respondido_em: new Date().toISOString() })
}

const minutos = (hhmm: string) => parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(3, 5), 10)

// Quem da lista já tem outro compromisso que se sobrepõe a este horário (como dono ou como convidado que não recusou).
export async function conflitosDeHorario(usuarioIds: string[], data: string, horaIni: string, horaFim: string, ignorarId?: string) {
  if (!data || !horaIni || usuarioIds.length === 0) return [] as { usuarioId: string; titulo: string; hora: string }[]
  const ini = minutos(horaIni)
  const fim = horaFim ? minutos(horaFim) : ini + 60
  const lista = usuarioIds.join(',')
  const donos = await get('agenda_compromissos', `?usuario_id=in.(${lista})&data=eq.${data}&select=id,titulo,hora_inicio,hora_fim,usuario_id`)
  const partsMeus = await get('agenda_participantes', `?usuario_id=in.(${lista})&status=neq.recusado&select=compromisso_id,usuario_id`)
  const idsConvidado = [...new Set(partsMeus.map(p => p.compromisso_id))]
  const comoConvidado = idsConvidado.length ? await get('agenda_compromissos', `?id=in.(${idsConvidado.join(',')})&data=eq.${data}&select=id,titulo,hora_inicio,hora_fim`) : []
  const saida: { usuarioId: string; titulo: string; hora: string }[] = []
  const testa = (c: any, usuarioId: string) => {
    if (c.id === ignorarId || !c.hora_inicio) return
    const i = minutos(c.hora_inicio), f = c.hora_fim ? minutos(c.hora_fim) : i + 60
    if (i < fim && ini < f) saida.push({ usuarioId, titulo: c.titulo, hora: c.hora_inicio.slice(0, 5) + (c.hora_fim ? '–' + c.hora_fim.slice(0, 5) : '') })
  }
  for (const c of donos) testa(c, c.usuario_id)
  for (const p of partsMeus) { const c = comoConvidado.find(x => x.id === p.compromisso_id); if (c) testa(c, p.usuario_id) }
  return saida
}
