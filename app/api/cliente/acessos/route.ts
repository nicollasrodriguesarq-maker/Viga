import { hashSenha, resolverEquipe, sb, sbJson, serviceKey } from '../_shared'

// Administração dos logins do portal do cliente — só equipe interna (admin / gerente de time).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PAPEIS_PERMITIDOS = ['admin', 'gerente_time']

async function autorizar(req: Request) {
  if (!serviceKey()) return { erro: Response.json({ error: 'SUPABASE_SECRET_KEY não configurada no servidor' }, { status: 500 }) }
  const eq = await resolverEquipe(req.headers.get('authorization'))
  if ('erro' in eq) return { erro: Response.json({ error: eq.erro }, { status: eq.status }) }
  if (!PAPEIS_PERMITIDOS.includes(eq.role)) return { erro: Response.json({ error: 'Apenas administradores e gerentes podem gerenciar o acesso de clientes' }, { status: 403 }) }
  return { ok: true as const }
}

const CAMPOS = 'id,obra_id,nome,email,ativo,ultimo_login,created_at'

export async function GET(req: Request) {
  const a = await autorizar(req); if ('erro' in a) return a.erro
  const obraId = new URL(req.url).searchParams.get('obra_id') || ''
  if (!UUID.test(obraId)) return Response.json({ error: 'obra_id inválido' }, { status: 400 })
  const rows = await sbJson<any[]>(`obra_cliente_acessos?obra_id=eq.${obraId}&select=${CAMPOS}&order=created_at`)
  return Response.json({ acessos: rows })
}

export async function POST(req: Request) {
  const a = await autorizar(req); if ('erro' in a) return a.erro
  let body: any
  try { body = await req.json() } catch { return Response.json({ error: 'Corpo inválido' }, { status: 400 }) }
  const obraId = String(body?.obra_id || '')
  const email = String(body?.email || '').trim().toLowerCase()
  const senha = String(body?.senha || '')
  const nome = String(body?.nome || '').trim() || null
  if (!UUID.test(obraId)) return Response.json({ error: 'obra_id inválido' }, { status: 400 })
  if (!EMAIL.test(email)) return Response.json({ error: 'Informe um e-mail válido' }, { status: 400 })
  if (senha.length < 6) return Response.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 })

  const obra = await sbJson<any[]>(`obras?id=eq.${obraId}&select=id`)
  if (!obra[0]) return Response.json({ error: 'Obra não encontrada' }, { status: 404 })
  const ja = await sbJson<any[]>(`obra_cliente_acessos?obra_id=eq.${obraId}&email=eq.${encodeURIComponent(email)}&select=id`)
  if (ja[0]) return Response.json({ error: 'Já existe um acesso com este e-mail para esta obra. Use "Redefinir senha".' }, { status: 409 })

  const r = await sb('obra_cliente_acessos', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ obra_id: obraId, nome, email, senha_hash: await hashSenha(senha) }),
  })
  if (!r.ok) return Response.json({ error: 'Não foi possível criar o acesso: ' + (await r.text()).slice(0, 200) }, { status: 500 })
  const [criado] = await r.json()
  const { senha_hash: _omitido, ...publico } = criado
  return Response.json({ acesso: publico })
}

export async function PATCH(req: Request) {
  const a = await autorizar(req); if ('erro' in a) return a.erro
  let body: any
  try { body = await req.json() } catch { return Response.json({ error: 'Corpo inválido' }, { status: 400 }) }
  const id = String(body?.id || '')
  if (!UUID.test(id)) return Response.json({ error: 'id inválido' }, { status: 400 })
  const dados: any = {}
  if (typeof body.ativo === 'boolean') dados.ativo = body.ativo
  if (body.nome !== undefined) dados.nome = String(body.nome).trim() || null
  if (body.senha !== undefined) {
    if (String(body.senha).length < 6) return Response.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 })
    dados.senha_hash = await hashSenha(String(body.senha))
  }
  if (Object.keys(dados).length === 0) return Response.json({ error: 'Nada para atualizar' }, { status: 400 })
  const r = await sb(`obra_cliente_acessos?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(dados) })
  if (!r.ok) return Response.json({ error: 'Não foi possível atualizar o acesso' }, { status: 500 })
  const rows = await r.json()
  if (!rows[0]) return Response.json({ error: 'Acesso não encontrado' }, { status: 404 })
  const { senha_hash: _omitido, ...publico } = rows[0]
  return Response.json({ acesso: publico })
}

export async function DELETE(req: Request) {
  const a = await autorizar(req); if ('erro' in a) return a.erro
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!UUID.test(id)) return Response.json({ error: 'id inválido' }, { status: 400 })
  const r = await sb(`obra_cliente_acessos?id=eq.${id}`, { method: 'DELETE' })
  if (!r.ok) return Response.json({ error: 'Não foi possível remover o acesso' }, { status: 500 })
  return Response.json({ ok: true })
}
