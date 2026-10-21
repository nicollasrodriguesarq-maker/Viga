import { autorizar, carregarConfig, carregarConhecidos, encerrarEditaisVencidos, fonteGoogle, fontePncp, gerarFila, googleConfigurado, type ResumoFonte } from '../_fontes'

// Atualiza as fontes automáticas (editais, Google Maps) e garante a fila do dia.
// Chamada por: (1) o agendador diário da Vercel (GET com CRON_SECRET), (2) o botão "Atualizar agora" e a abertura da aba (POST).
export const maxDuration = 60
export const dynamic = 'force-dynamic'

async function executar(req: Request, forcar: boolean) {
  const a = await autorizar(req)
  if (!a.ok) return Response.json({ error: a.erro }, { status: a.status })
  const cfg = await carregarConfig()
  const conhecidos = await carregarConhecidos()
  const fontes: ResumoFonte[] = []

  // PNCP limita consultas em sequência: não repete antes de 8 minutos, a não ser que o usuário peça
  const minutosDesdePncp = cfg.pncp_ultima_execucao ? (Date.now() - new Date(cfg.pncp_ultima_execucao).getTime()) / 60000 : 9999
  if (forcar || minutosDesdePncp >= 8) {
    try { fontes.push(await fontePncp(cfg, conhecidos)) } catch (e: any) { fontes.push({ fonte: 'pncp', ok: false, mensagem: e?.message || 'erro' }) }
  } else fontes.push({ fonte: 'pncp', ok: true, mensagem: 'Atualizado há poucos minutos.' })

  if (googleConfigurado()) {
    const horas = cfg.google_ultima_execucao ? (Date.now() - new Date(cfg.google_ultima_execucao).getTime()) / 3600000 : 999
    if (forcar || horas >= 20) {
      try { fontes.push(await fonteGoogle(await carregarConfig(), conhecidos)) } catch (e: any) { fontes.push({ fonte: 'google', ok: false, mensagem: e?.message || 'erro' }) }
    } else fontes.push({ fonte: 'google', ok: true, mensagem: 'Já atualizado hoje.' })
  }

  await encerrarEditaisVencidos()
  const fila = await gerarFila(await carregarConfig())
  return Response.json({ ok: true, origem: a.origem, fontes, fila })
}

export async function GET(req: Request) { return executar(req, false) }
export async function POST(req: Request) {
  let forcar = false
  try { forcar = !!(await req.json())?.forcar } catch { /* sem corpo */ }
  return executar(req, forcar)
}
