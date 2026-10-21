import { autorizar, carregarConfig, registrarCandidatos, type Candidato } from '../_fontes'

// Importa contatos de uma planilha (já mapeada pela tela): checa duplicados e bloqueios, pontua e grava.
export const maxDuration = 60
export async function POST(req: Request) {
  const a = await autorizar(req)
  if (!a.ok) return Response.json({ error: a.erro }, { status: a.status })
  let corpo: any
  try { corpo = await req.json() } catch { return Response.json({ error: 'Corpo inválido' }, { status: 400 }) }
  const linhas: Candidato[] = Array.isArray(corpo?.linhas) ? corpo.linhas.slice(0, 5000) : []
  if (linhas.length === 0) return Response.json({ error: 'Nenhuma linha para importar' }, { status: 400 })
  const fonte = ['importacao', 'receita', 'indicacao', 'manual'].includes(corpo?.fonte) ? corpo.fonte : 'importacao'
  const cfg = await carregarConfig()
  const candidatos = linhas.map(l => ({ ...l, fonte, tipo_abordagem: 'contato' as const, fonte_ref: l.fonte_ref || (l.documento ? `${fonte}:${String(l.documento).replace(/\D/g, '')}` : null) }))
  try {
    // planilhas entram com piso de pontuação baixo: o filtro fino é feito na hora de montar a fila do dia
    const resumo = await registrarCandidatos(candidatos, cfg, undefined, 20)
    return Response.json({ ok: true, resumo })
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Falha ao importar' }, { status: 500 })
  }
}
