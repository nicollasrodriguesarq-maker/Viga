const SUPABASE_URL = 'https://vupjtoeqltzlnplijnzr.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'

export interface Permissoes {
  id: string
  role: 'admin' | 'usuario'
  modulos_permitidos: string[]
}

// Só uma conveniência de UI (ocultar links/redirecionar) — não é segurança de
// verdade, já que as tabelas do Supabase usam RLS "allow_all". Se a consulta
// falhar, não bloqueia (evita travar o app por erro de rede/token expirado).
export async function obterMinhasPermissoes(): Promise<Permissoes | null> {
  const email = localStorage.getItem('viga_email') || ''
  if (!email) return null
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?email=ilike.${encodeURIComponent(email)}&select=id,role,modulos_permitidos`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
    const rows = await r.json()
    if (Array.isArray(rows) && rows[0]) {
      return {
        id: rows[0].id,
        role: rows[0].role === 'admin' ? 'admin' : 'usuario',
        modulos_permitidos: Array.isArray(rows[0].modulos_permitidos) ? rows[0].modulos_permitidos : [],
      }
    }
  } catch {}
  return null
}

export function temAcessoModulo(perm: Permissoes | null, modulo: string): boolean {
  if (!perm) return true
  if (perm.role === 'admin') return true
  return perm.modulos_permitidos.includes(modulo)
}

export interface PermissoesApp {
  id: string
  role: 'admin' | 'usuario'
  modulos_app: string[]
}

export async function obterMinhasPermissoesApp(): Promise<PermissoesApp | null> {
  const email = localStorage.getItem('viga_email') || ''
  if (!email) return null
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?email=ilike.${encodeURIComponent(email)}&select=id,role,modulos_app`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
    const rows = await r.json()
    if (Array.isArray(rows) && rows[0]) {
      return {
        id: rows[0].id,
        role: rows[0].role === 'admin' ? 'admin' : 'usuario',
        modulos_app: Array.isArray(rows[0].modulos_app) ? rows[0].modulos_app : [],
      }
    }
  } catch {}
  return null
}

export function temAcessoModuloApp(perm: PermissoesApp | null, modulo: string): boolean {
  if (!perm) return true
  if (perm.role === 'admin') return true
  return perm.modulos_app.includes(modulo)
}
