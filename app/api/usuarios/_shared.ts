export const SUPABASE_URL = 'https://vupjtoeqltzlnplijnzr.supabase.co'
export const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'

export const MODULOS_VALIDOS = ['obras', 'financeiro', 'levantamento', 'orcamento', 'agenda']

export async function resolveCaller(auth: string | null): Promise<{ id: string } | null> {
  if (!auth) return null
  const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: auth },
  })
  if (!meRes.ok) return null
  const me = await meRes.json()
  return me?.id ? me : null
}

export async function getUsuarioRole(
  serviceKey: string,
  id: string
): Promise<{ ok: true; role: string } | { ok: false; error: string; status: number }> {
  const roleRes = await fetch(`${SUPABASE_URL}/rest/v1/usuarios?id=eq.${id}&select=role`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  })
  if (!roleRes.ok) {
    const errText = await roleRes.text()
    return { ok: false, error: `Erro ao verificar permissão (status ${roleRes.status}): ${errText.slice(0, 300)}`, status: 500 }
  }
  const rows = await roleRes.json()
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      ok: false,
      error: `Seu usuário (id ${id}) não tem perfil na tabela "usuarios". Rode o SQL de bootstrap novamente.`,
      status: 403,
    }
  }
  return { ok: true, role: rows[0]?.role }
}
