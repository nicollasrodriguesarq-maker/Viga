import { autorizar, carregarConfig, gerarFila } from '../_fontes'

// Gera a fila de hoje (se ainda não foi gerada) — leve, sem consultar fontes externas.
export const dynamic = 'force-dynamic'
export async function POST(req: Request) {
  const a = await autorizar(req)
  if (!a.ok) return Response.json({ error: a.erro }, { status: a.status })
  return Response.json({ ok: true, fila: await gerarFila(await carregarConfig()) })
}
