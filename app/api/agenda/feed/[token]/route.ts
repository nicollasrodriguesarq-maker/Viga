import { SUPABASE_URL } from '../../../usuarios/_shared'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// O feed é público por link secreto (token), então lê com a service key no servidor — o banco não
// aceita mais a chave pública anônima.
async function buscar(tabela: string, q: string) {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) return []
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    const d = await r.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

function escaparTexto(v: string) {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function formatarDataHora(data: string, hora: string | null) {
  const dataCompacta = data.replace(/-/g, '')
  if (!hora) return { valor: dataCompacta, allDay: true }
  const horaCompacta = hora.slice(0, 8).replace(/:/g, '')
  return { valor: `${dataCompacta}T${horaCompacta}`, allDay: false }
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  // valida o formato antes de montar a consulta (evita injeção de filtros no PostgREST)
  if (!UUID.test(token)) return new Response('Feed não encontrado.', { status: 404 })

  const usuarios = await buscar('usuarios', `?feed_token=eq.${token}&select=id,role,time_id`)
  const dono = usuarios[0]
  if (!dono) {
    return new Response('Feed não encontrado.', { status: 404 })
  }

  let visiveis: string[] = [dono.id]
  if (dono.role === 'admin') {
    const todos = await buscar('usuarios', '?select=id')
    visiveis = todos.map((u: any) => u.id)
  } else if (dono.role === 'gerente_time') {
    const times = await buscar('times', `?gerente_id=eq.${dono.id}&select=id`)
    const timeIds = times.map((t: any) => t.id)
    if (timeIds.length > 0) {
      const membros = await buscar('usuarios', `?time_id=in.(${timeIds.join(',')})&select=id`)
      visiveis = Array.from(new Set([...membros.map((u: any) => u.id), dono.id]))
    }
  }

  const proprios = await buscar('agenda_compromissos', `?usuario_id=in.(${visiveis.join(',')})&order=data.asc`)
  // reuniões para as quais as pessoas do feed foram convidadas (e não recusaram) também entram
  const convites = await buscar('agenda_participantes', `?usuario_id=in.(${visiveis.join(',')})&status=neq.recusado&select=compromisso_id`)
  const jaTem = new Set(proprios.map((c: any) => c.id))
  const extraIds = Array.from(new Set(convites.map((c: any) => c.compromisso_id).filter((id: string) => !jaTem.has(id))))
  const extras = extraIds.length ? await buscar('agenda_compromissos', `?id=in.(${extraIds.join(',')})&order=data.asc`) : []
  const compromissos = [...proprios, ...extras]
  const todasPartes = compromissos.length ? await buscar('agenda_participantes', `?compromisso_id=in.(${compromissos.map((c: any) => c.id).join(',')})&select=compromisso_id,usuario_id,status`) : []
  const idsPessoas = Array.from(new Set(todasPartes.map((p: any) => p.usuario_id)))
  const pessoas = idsPessoas.length ? await buscar('usuarios', `?id=in.(${idsPessoas.join(',')})&select=id,nome,email`) : []
  const nomeDe = (id: string) => { const u: any = pessoas.find((x: any) => x.id === id); return u ? (u.nome || String(u.email || '').split('@')[0]) : 'Convidado' }

  const agora = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  const eventos = compromissos.map((c: any) => {
    const inicio = formatarDataHora(c.data, c.hora_inicio)
    let fim: { valor: string; allDay: boolean }
    if (c.hora_fim) {
      fim = formatarDataHora(c.data, c.hora_fim)
    } else if (!inicio.allDay) {
      // sem hora de fim definida: assume 1 hora de duração
      const d = new Date(c.data + 'T' + (c.hora_inicio || '00:00:00'))
      d.setHours(d.getHours() + 1)
      fim = formatarDataHora(d.toISOString().slice(0, 10), d.toTimeString().slice(0, 8))
    } else {
      // evento de dia inteiro: DTEND exclusivo = dia seguinte
      const d = new Date(c.data + 'T00:00:00')
      d.setDate(d.getDate() + 1)
      fim = formatarDataHora(d.toISOString().slice(0, 10), null)
    }

    const linhas = [
      'BEGIN:VEVENT',
      `UID:${c.id}@viga.app`,
      `DTSTAMP:${agora}`,
      inicio.allDay ? `DTSTART;VALUE=DATE:${inicio.valor}` : `DTSTART:${inicio.valor}`,
      fim.allDay ? `DTEND;VALUE=DATE:${fim.valor}` : `DTEND:${fim.valor}`,
      `SUMMARY:${escaparTexto(c.titulo || 'Compromisso')}`,
    ]
    if (c.endereco) linhas.push(`LOCATION:${escaparTexto(c.endereco)}`)
    const partes = todasPartes.filter((p: any) => p.compromisso_id === c.id)
    const textoDescricao = [
      c.descricao,
      partes.length ? 'Participantes: ' + partes.map((p: any) => nomeDe(p.usuario_id) + (p.status === 'aceito' ? ' (confirmou)' : p.status === 'pendente' ? ' (aguardando)' : '')).join(', ') : '',
      c.link_reuniao ? 'Link da reunião: ' + c.link_reuniao : '',
    ].filter(Boolean).join('\n')
    if (textoDescricao) linhas.push(`DESCRIPTION:${escaparTexto(textoDescricao)}`)
    if (c.link_reuniao && /^https?:\/\//i.test(c.link_reuniao)) linhas.push(`URL:${c.link_reuniao}`)
    linhas.push('END:VEVENT')
    return linhas.join('\r\n')
  })

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VIGA//Agenda//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Agenda VIGA',
    ...eventos,
    'END:VCALENDAR',
  ].join('\r\n')

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="agenda-viga.ics"',
      'Cache-Control': 'no-cache',
    },
  })
}
