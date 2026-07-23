import { SUPABASE_URL, MODULOS_VALIDOS, MODULOS_APP_VALIDOS, resolveCaller, getUsuarioRole } from './_shared'

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (!auth) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const serviceKey = process.env.SUPABASE_SECRET_KEY
  if (!serviceKey) {
    return Response.json({ error: 'SUPABASE_SECRET_KEY não configurada no servidor' }, { status: 500 })
  }

  // 1. Resolve quem está chamando, a partir do token dele
  const me = await resolveCaller(auth)
  if (!me) return Response.json({ error: 'Token inválido' }, { status: 401 })

  // 2. Confere se quem chamou é admin
  const roleCheck = await getUsuarioRole(serviceKey, me.id)
  if (!roleCheck.ok) return Response.json({ error: roleCheck.error }, { status: roleCheck.status })
  if (roleCheck.role !== 'admin') {
    return Response.json(
      { error: `Apenas administradores podem criar usuários (seu papel atual: "${roleCheck.role}")` },
      { status: 403 }
    )
  }

  // 3. Valida o corpo da requisição
  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Corpo inválido' }, { status: 400 })
  }
  const { email, senha, nome, role, setor, modulos_permitidos, modulos_app } = body || {}
  if (!email || !senha || !nome) {
    return Response.json({ error: 'Preencha e-mail, senha e nome' }, { status: 400 })
  }
  if (String(senha).length < 6) {
    return Response.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 })
  }
  const roleFinal = role === 'admin' ? 'admin' : 'usuario'
  const modulosFinal = Array.isArray(modulos_permitidos)
    ? modulos_permitidos.filter((m: string) => MODULOS_VALIDOS.includes(m))
    : MODULOS_VALIDOS
  const modulosAppFinal = Array.isArray(modulos_app)
    ? modulos_app.filter((m: string) => MODULOS_APP_VALIDOS.includes(m))
    : MODULOS_APP_VALIDOS

  // 4. Cria o usuário via Admin API do Supabase (service role)
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ email, password: senha, email_confirm: true }),
  })
  const created = await createRes.json()
  if (!createRes.ok) {
    return Response.json(
      { error: created.msg || created.message || created.error_description || 'Não foi possível criar o usuário' },
      { status: createRes.status }
    )
  }

  // 5. Grava/atualiza o perfil (o trigger de signup pode já ter criado a linha como "usuario")
  await fetch(`${SUPABASE_URL}/rest/v1/usuarios`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      id: created.id,
      email: created.email,
      nome,
      role: roleFinal,
      setor: setor || null,
      modulos_permitidos: modulosFinal,
      modulos_app: modulosAppFinal,
    }),
  })

  return Response.json({ id: created.id, email: created.email, nome, role: roleFinal }, { status: 201 })
}
