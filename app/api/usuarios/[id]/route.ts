import { SUPABASE_URL, MODULOS_VALIDOS, MODULOS_APP_VALIDOS, resolveCaller, getUsuarioRole } from '../_shared'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = req.headers.get('authorization')
  if (!auth) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const serviceKey = process.env.SUPABASE_SECRET_KEY
  if (!serviceKey) {
    return Response.json({ error: 'SUPABASE_SECRET_KEY não configurada no servidor' }, { status: 500 })
  }

  const me = await resolveCaller(auth)
  if (!me) return Response.json({ error: 'Token inválido' }, { status: 401 })

  const roleCheck = await getUsuarioRole(serviceKey, me.id)
  if (!roleCheck.ok) return Response.json({ error: roleCheck.error }, { status: roleCheck.status })
  const souAdmin = roleCheck.role === 'admin'
  const souEuMesmo = me.id === id

  if (!souAdmin && !souEuMesmo) {
    return Response.json({ error: 'Você só pode editar seus próprios dados' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Corpo inválido' }, { status: 400 })
  }
  const { nome, setor, email, senha, role, modulos_permitidos, modulos_app } = body || {}

  if ((role !== undefined || modulos_permitidos !== undefined || modulos_app !== undefined) && !souAdmin) {
    return Response.json({ error: 'Apenas administradores podem alterar papel ou módulos de acesso' }, { status: 403 })
  }
  if (senha !== undefined && String(senha).length > 0 && String(senha).length < 6) {
    return Response.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 })
  }

  // Atualiza e-mail/senha no Auth via Admin API (bypassa confirmação por e-mail)
  if (email || senha) {
    const authBody: any = {}
    if (email) authBody.email = email
    if (senha) authBody.password = senha
    if (email) authBody.email_confirm = true
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(authBody),
    })
    const authData = await authRes.json()
    if (!authRes.ok) {
      return Response.json(
        { error: authData.msg || authData.message || authData.error_description || 'Não foi possível atualizar login' },
        { status: authRes.status }
      )
    }
  }

  const dadosPerfil: any = {}
  if (nome !== undefined) dadosPerfil.nome = nome
  if (setor !== undefined) dadosPerfil.setor = setor || null
  if (email !== undefined) dadosPerfil.email = email
  if (souAdmin && role !== undefined) dadosPerfil.role = role === 'admin' ? 'admin' : 'usuario'
  if (souAdmin && modulos_permitidos !== undefined) {
    dadosPerfil.modulos_permitidos = Array.isArray(modulos_permitidos)
      ? modulos_permitidos.filter((m: string) => MODULOS_VALIDOS.includes(m))
      : MODULOS_VALIDOS
  }
  if (souAdmin && modulos_app !== undefined) {
    dadosPerfil.modulos_app = Array.isArray(modulos_app)
      ? modulos_app.filter((m: string) => MODULOS_APP_VALIDOS.includes(m))
      : MODULOS_APP_VALIDOS
  }

  if (Object.keys(dadosPerfil).length > 0) {
    const updRes = await fetch(`${SUPABASE_URL}/rest/v1/usuarios?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(dadosPerfil),
    })
    if (!updRes.ok) {
      const errText = await updRes.text()
      return Response.json({ error: `Erro ao salvar perfil: ${errText.slice(0, 300)}` }, { status: 500 })
    }
  }

  return Response.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = req.headers.get('authorization')
  if (!auth) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const serviceKey = process.env.SUPABASE_SECRET_KEY
  if (!serviceKey) {
    return Response.json({ error: 'SUPABASE_SECRET_KEY não configurada no servidor' }, { status: 500 })
  }

  const me = await resolveCaller(auth)
  if (!me) return Response.json({ error: 'Token inválido' }, { status: 401 })

  const roleCheck = await getUsuarioRole(serviceKey, me.id)
  if (!roleCheck.ok) return Response.json({ error: roleCheck.error }, { status: roleCheck.status })
  if (roleCheck.role !== 'admin') {
    return Response.json({ error: 'Apenas administradores podem excluir usuários' }, { status: 403 })
  }
  if (me.id === id) {
    return Response.json({ error: 'Você não pode excluir sua própria conta' }, { status: 400 })
  }

  const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  })
  if (!delRes.ok) {
    const errText = await delRes.text()
    return Response.json({ error: `Não foi possível excluir o usuário: ${errText.slice(0, 300)}` }, { status: delRes.status })
  }

  return Response.json({ ok: true })
}
