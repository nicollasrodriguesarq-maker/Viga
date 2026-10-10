import { SESSAO_HORAS, assinarSessao, confereSenha, limparFalhasLogin, loginBloqueado, registrarFalhaLogin, sb, sbJson, serviceKey } from '../_shared'

export async function POST(req: Request) {
  if (!serviceKey()) return Response.json({ error: 'Portal indisponível: servidor sem SUPABASE_SECRET_KEY' }, { status: 500 })

  let body: any
  try { body = await req.json() } catch { return Response.json({ error: 'Corpo inválido' }, { status: 400 }) }
  const email = String(body?.email || '').trim().toLowerCase()
  const senha = String(body?.senha || '')
  if (!email || !senha) return Response.json({ error: 'Informe e-mail e senha' }, { status: 400 })

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'ip'
  const chave = `${email}|${ip}`
  if (loginBloqueado(chave)) return Response.json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }, { status: 429 })

  const acessos = await sbJson<any[]>(`obra_cliente_acessos?email=eq.${encodeURIComponent(email)}&ativo=eq.true&select=id,obra_id,nome,senha_hash`)
  const validos: any[] = []
  // confere a senha em todos os acessos do e-mail (um cliente pode ter mais de uma obra); se
  // não houver nenhum, confere contra um hash nulo só pra manter o tempo de resposta parecido.
  if (acessos.length === 0) await confereSenha(senha, null)
  for (const a of acessos) if (await confereSenha(senha, a.senha_hash)) validos.push(a)

  if (validos.length === 0) {
    registrarFalhaLogin(chave)
    return Response.json({ error: 'E-mail ou senha incorretos' }, { status: 401 })
  }
  limparFalhasLogin(chave)

  const token = assinarSessao({ e: email, a: validos.map(v => v.id), exp: Date.now() + SESSAO_HORAS * 3600 * 1000 })
  if (!token) return Response.json({ error: 'Falha ao iniciar sessão' }, { status: 500 })

  const agora = new Date().toISOString()
  await Promise.all(validos.map(v => sb(`obra_cliente_acessos?id=eq.${v.id}`, { method: 'PATCH', body: JSON.stringify({ ultimo_login: agora }) })))

  const ids = Array.from(new Set(validos.map(v => v.obra_id)))
  const obras = await sbJson<any[]>(`obras?id=in.(${ids.join(',')})&select=id,codigo,nome`)
  return Response.json({ token, nome: validos[0].nome || null, obras })
}
