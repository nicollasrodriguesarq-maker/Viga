import { autorizar, carregarConfig, googleConfigurado } from '../_fontes'

export const dynamic = 'force-dynamic'
export async function GET(req: Request) {
  const a = await autorizar(req)
  if (!a.ok) return Response.json({ error: a.erro }, { status: a.status })
  const cfg = await carregarConfig()
  const mes = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 7)
  return Response.json({
    google: { configurado: googleConfigurado(), consumo_mes: Number(cfg.google_consumo?.[mes] || 0), limite_mes: cfg.google_limite_mensal, ultima: cfg.google_ultima_execucao },
    pncp: { ultima: cfg.pncp_ultima_execucao, em_andamento: !!(cfg.pncp_cursor && Object.keys(cfg.pncp_cursor).length) },
    agendador: { configurado: !!process.env.CRON_SECRET },
  })
}
