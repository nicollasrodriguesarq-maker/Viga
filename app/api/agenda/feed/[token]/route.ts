import { SUPABASE_URL, ANON_KEY } from '../../../usuarios/_shared'

const H = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }

async function buscar(tabela: string, q: string) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}${q}`, { headers: H })
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

  const compromissos = await buscar('agenda_compromissos', `?usuario_id=in.(${visiveis.join(',')})&order=data.asc`)

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
    if (c.descricao) linhas.push(`DESCRIPTION:${escaparTexto(c.descricao)}`)
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
