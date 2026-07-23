const SUPABASE_URL = 'https://vupjtoeqltzlnplijnzr.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }

export type Papel = 'admin' | 'gerente_time' | 'usuario'

function normalizarPapel(v: string): Papel {
  return v === 'admin' ? 'admin' : v === 'gerente_time' ? 'gerente_time' : 'usuario'
}

export interface Permissoes {
  id: string
  role: Papel
  time_id: string | null
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
      `${SUPABASE_URL}/rest/v1/usuarios?email=ilike.${encodeURIComponent(email)}&select=id,role,time_id,modulos_permitidos`,
      { headers: H }
    )
    const rows = await r.json()
    if (Array.isArray(rows) && rows[0]) {
      return {
        id: rows[0].id,
        role: normalizarPapel(rows[0].role),
        time_id: rows[0].time_id || null,
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
  role: Papel
  time_id: string | null
  modulos_app: string[]
}

export async function obterMinhasPermissoesApp(): Promise<PermissoesApp | null> {
  const email = localStorage.getItem('viga_email') || ''
  if (!email) return null
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?email=ilike.${encodeURIComponent(email)}&select=id,role,time_id,modulos_app`,
      { headers: H }
    )
    const rows = await r.json()
    if (Array.isArray(rows) && rows[0]) {
      return {
        id: rows[0].id,
        role: normalizarPapel(rows[0].role),
        time_id: rows[0].time_id || null,
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

// ── Hierarquia (Diretor/admin vê tudo, Gerente de Time vê o time dele, ──
// ── Usuário/técnico vê só o próprio) — usada por Agenda e Dashboard ──────
export async function obterUsuariosVisiveis(perm: Permissoes | PermissoesApp | null): Promise<string[]> {
  if (!perm) return []
  try {
    if (perm.role === 'admin') {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/usuarios?select=id`, { headers: H })
      const rows = await r.json()
      return Array.isArray(rows) ? rows.map((u: any) => u.id) : [perm.id]
    }
    if (perm.role === 'gerente_time') {
      const rt = await fetch(`${SUPABASE_URL}/rest/v1/times?gerente_id=eq.${perm.id}&select=id`, { headers: H })
      const times = await rt.json()
      const timeIds = Array.isArray(times) ? times.map((t: any) => t.id) : []
      if (timeIds.length === 0) return [perm.id]
      const ru = await fetch(`${SUPABASE_URL}/rest/v1/usuarios?time_id=in.(${timeIds.join(',')})&select=id`, { headers: H })
      const usuarios = await ru.json()
      const ids = Array.isArray(usuarios) ? usuarios.map((u: any) => u.id) : []
      return Array.from(new Set([...ids, perm.id]))
    }
  } catch {}
  return [perm.id]
}
