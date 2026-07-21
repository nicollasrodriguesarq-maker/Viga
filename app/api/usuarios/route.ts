const SUPABASE_URL = 'https://vupjtoeqltzlnplijnzr.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (!auth) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const serviceKey = process.env.SUPABASE_SECRET_KEY
  if (!serviceKey) {
    return Response.json({ error: 'SUPABASE_SECRET_KEY não configurada no servidor' }, { status: 500 })
  }

  // 1. Resolve quem está chamando, a partir do token dele
  const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: auth },
  })
  if (!meRes.ok) return Response.json({ error: 'Token inválido' }, { status: 401 })
  const me = await meRes.json()
  if (!me?.id) return Response.json({ error: 'Token inválido' }, { status: 401 })

  // 2. Confere se quem chamou é admin
  const roleRes = await fetch(`${SUPABASE_URL}/rest/v1/usuarios?id=eq.${me.id}&select=role`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  })
  const roleRows = await roleRes.json()
  if (!Array.isArray(roleRows) || roleRows[0]?.role !== 'admin') {
    return Response.json({ error: 'Apenas administradores podem criar usuários' }, { status: 403 })
  }

  // 3. Valida o corpo da requisição
  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Corpo inválido' }, { status: 400 })
  }
  const { email, senha, nome, role } = body || {}
  if (!email || !senha || !nome) {
    return Response.json({ error: 'Preencha e-mail, senha e nome' }, { status: 400 })
  }
  if (String(senha).length < 6) {
    return Response.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 })
  }
  const roleFinal = role === 'admin' ? 'admin' : 'usuario'

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
    body: JSON.stringify({ id: created.id, email: created.email, nome, role: roleFinal }),
  })

  return Response.json({ id: created.id, email: created.email, nome, role: roleFinal }, { status: 201 })
}
