// Infra do portal do cliente (rotas de servidor).
//
// Por que existe: todas as tabelas do projeto aceitam a chave anon direto do navegador (RLS
// "allow_all"), então não dá pra confiar em filtro feito no front. O portal do cliente por isso:
//   1. guarda credenciais numa tabela FECHADA (obra_cliente_acessos: RLS ligada, sem policy —
//      a chave anon não enxerga nada ali, nem o hash da senha);
//   2. NÃO usa o Supabase Auth (cliente nunca vira um usuário capaz de entrar no app interno);
//   3. entrega os dados só por estas rotas, que usam a service key no servidor e devolvem apenas
//      campos explicitamente liberados (nada de custo, lucro, compras ou cartão).
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (senha: string, salt: Buffer, len: number) => Promise<Buffer>

export const SUPABASE_URL = 'https://vupjtoeqltzlnplijnzr.supabase.co'
export const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'

export const SESSAO_HORAS = 24 * 7

export function serviceKey(): string | null {
  return process.env.SUPABASE_SECRET_KEY || null
}

// ── Senhas (scrypt + salt aleatório) ──────────────────────────────────────────────
export async function hashSenha(senha: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(senha, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export async function confereSenha(senha: string, armazenado: string | null | undefined): Promise<boolean> {
  // Sempre faz o mesmo trabalho, mesmo sem usuário, pra não vazar por tempo se o e-mail existe.
  const [alg, saltHex, hashHex] = (armazenado || 'scrypt$00000000000000000000000000000000$' + '0'.repeat(128)).split('$')
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false
  const esperado = Buffer.from(hashHex, 'hex')
  const calculado = await scrypt(senha, Buffer.from(saltHex, 'hex'), esperado.length || 64)
  return esperado.length === calculado.length && timingSafeEqual(esperado, calculado) && !!armazenado
}

// ── Sessão assinada (HMAC-SHA256) ─────────────────────────────────────────────────
export interface SessaoCliente { e: string; a: string[]; exp: number }

function segredo(): string | null {
  const k = serviceKey()
  return k ? 'viga-portal-cliente:' + k : null
}
const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url')

export function assinarSessao(s: SessaoCliente): string | null {
  const seg = segredo()
  if (!seg) return null
  const corpo = b64u(JSON.stringify(s))
  const sig = createHmac('sha256', seg).update(corpo).digest('base64url')
  return `${corpo}.${sig}`
}

export function lerSessao(token: string | null | undefined): SessaoCliente | null {
  const seg = segredo()
  if (!seg || !token) return null
  const [corpo, sig] = token.split('.')
  if (!corpo || !sig) return null
  const esperada = createHmac('sha256', seg).update(corpo).digest()
  let recebida: Buffer
  try { recebida = Buffer.from(sig, 'base64url') } catch { return null }
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) return null
  try {
    const s = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as SessaoCliente
    if (!s?.e || !Array.isArray(s.a) || typeof s.exp !== 'number' || s.exp < Date.now()) return null
    return s
  } catch { return null }
}

export function tokenDoRequest(req: Request): string | null {
  const auth = req.headers.get('authorization') || ''
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null
}

// ── Acesso ao banco com a service key (só no servidor) ────────────────────────────
export async function sb(path: string, init: RequestInit = {}): Promise<Response> {
  const key = serviceKey()
  if (!key) throw new Error('SUPABASE_SECRET_KEY não configurada no servidor')
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
}

export async function sbJson<T = any[]>(path: string): Promise<T> {
  const r = await sb(path)
  if (!r.ok) throw new Error(`Erro ao consultar ${path.split('?')[0]} (${r.status})`)
  return r.json()
}

// ── Limite simples de tentativas de login (por instância do servidor) ─────────────
const tentativas = new Map<string, { n: number; ate: number }>()
export function loginBloqueado(chave: string): boolean {
  const t = tentativas.get(chave)
  if (!t) return false
  if (t.ate < Date.now()) { tentativas.delete(chave); return false }
  return t.n >= 8
}
export function registrarFalhaLogin(chave: string) {
  const t = tentativas.get(chave)
  if (!t || t.ate < Date.now()) tentativas.set(chave, { n: 1, ate: Date.now() + 15 * 60 * 1000 })
  else t.n++
}
export function limparFalhasLogin(chave: string) { tentativas.delete(chave) }

// ── Autenticação de quem administra os acessos (equipe interna, via Supabase Auth) ─
export async function resolverEquipe(auth: string | null): Promise<{ id: string; role: string } | { erro: string; status: number }> {
  if (!auth) return { erro: 'Não autenticado', status: 401 }
  const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: auth } })
  if (!meRes.ok) return { erro: 'Sessão inválida. Entre novamente no VIGA.', status: 401 }
  const me = await meRes.json()
  if (!me?.id) return { erro: 'Sessão inválida', status: 401 }
  const rows = await sbJson<any[]>(`usuarios?id=eq.${me.id}&select=id,role`)
  if (!rows[0]) return { erro: 'Seu usuário não tem perfil interno no VIGA', status: 403 }
  return { id: rows[0].id, role: rows[0].role }
}
