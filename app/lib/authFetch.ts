// Camada única de autenticação das chamadas ao Supabase feitas pelo navegador.
//
// Antes: todas as páginas mandavam a chave pública (anon) e o banco aceitava tudo (RLS
// "allow_all"). Agora o banco só responde para o usuário logado e aprovado — então toda
// chamada a /rest/v1 e /storage/v1 precisa levar o access_token do próprio usuário.
//
// Em vez de editar centenas de fetch espalhados por ~20 arquivos, este módulo instala UM
// interceptor em window.fetch que troca "Authorization: Bearer <anon>" pelo token do usuário
// (renovando-o quando está perto de vencer). Também abre arquivos privados (NF, documentos de
// funcionários, anexos de levantamento) via URL assinada de curta duração.
const SUPABASE_URL = 'https://vupjtoeqltzlnplijnzr.supabase.co'
const BUCKETS_PRIVADOS = ['notas-fiscais', 'obra-funcionarios-arquivos', 'levantamento-arquivos']

declare global { interface Window { __vigaAuthFetch?: boolean } }

function lerExp(token: string): number | null {
  const partes = token.split('.')
  if (partes.length !== 3) return null
  try {
    const json = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof json.exp === 'number' ? json.exp * 1000 : null
  } catch { return null }
}

function limparSessaoELogin() {
  try {
    localStorage.removeItem('viga_token'); localStorage.removeItem('viga_refresh_token'); localStorage.removeItem('viga_email')
  } catch {}
  if (window.location.pathname !== '/' && !window.location.pathname.startsWith('/cliente')) window.location.href = '/'
}

export function instalarAuthFetch() {
  if (typeof window === 'undefined' || window.__vigaAuthFetch) return
  window.__vigaAuthFetch = true
  const fetchOriginal = window.fetch.bind(window)
  let renovando: Promise<string | null> | null = null

  async function renovar(): Promise<string | null> {
    const refresh = localStorage.getItem('viga_refresh_token')
    if (!refresh) return null
    try {
      const r = await fetchOriginal(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_PUBLICA },
        body: JSON.stringify({ refresh_token: refresh }),
      })
      if (!r.ok) return null
      const d = await r.json()
      if (!d.access_token) return null
      localStorage.setItem('viga_token', d.access_token)
      if (d.refresh_token) localStorage.setItem('viga_refresh_token', d.refresh_token)
      return d.access_token
    } catch { return null }
  }

  async function tokenValido(): Promise<string | null> {
    const token = localStorage.getItem('viga_token')
    if (!token) return null
    const exp = lerExp(token)
    if (exp === null) return null
    if (exp - Date.now() > 60_000) return token
    if (!renovando) renovando = renovar().finally(() => { renovando = null })
    const novo = await renovando
    if (!novo) limparSessaoELogin()
    return novo
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith(`${SUPABASE_URL}/rest/v1/`) || url.startsWith(`${SUPABASE_URL}/storage/v1/`)) {
      const token = await tokenValido()
      if (token) {
        if (input instanceof Request && !init) {
          const req = new Request(input)
          req.headers.set('Authorization', `Bearer ${token}`)
          return fetchOriginal(req)
        }
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
        headers.set('Authorization', `Bearer ${token}`)
        return fetchOriginal(input, { ...init, headers })
      }
    }
    // Rotas internas do próprio app que exigem login (proxy de geocodificação).
    if (url.startsWith('/api/geocode') || url.startsWith(window.location.origin + '/api/geocode')) {
      const token = await tokenValido()
      if (token) {
        const headers = new Headers(init?.headers)
        headers.set('Authorization', `Bearer ${token}`)
        return fetchOriginal(input, { ...init, headers })
      }
    }
    return fetchOriginal(input, init)
  }

  // Links para arquivos de buckets privados: gera uma URL assinada (5 min) e abre.
  document.addEventListener('click', async (e) => {
    const alvo = (e.target as HTMLElement | null)?.closest?.('a') as HTMLAnchorElement | null
    const href = alvo?.getAttribute('href') || ''
    const m = href.match(new RegExp(`^${SUPABASE_URL.replace(/\./g, '\\.')}/storage/v1/object/(?:public/)?(${BUCKETS_PRIVADOS.join('|')})/(.+)$`))
    if (!alvo || !m) return
    e.preventDefault()
    const janela = window.open('', '_blank')
    const url = await urlAssinada(m[1], decodeURIComponent(m[2].split('?')[0]))
    if (url && janela) janela.location.href = url
    else { janela?.close(); alert('Não foi possível abrir o arquivo. Entre novamente e tente de novo.') }
  }, true)
}

export async function urlAssinada(bucket: string, caminho: string, segundos = 300): Promise<string | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${caminho.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON_PUBLICA },
      body: JSON.stringify({ expiresIn: segundos }),
    })
    if (!r.ok) return null
    const d = await r.json()
    return d.signedURL ? `${SUPABASE_URL}/storage/v1${d.signedURL}` : null
  } catch { return null }
}

// Chave pública (anon) — por desenho ela é pública; o que protege os dados é o RLS do banco.
const ANON_PUBLICA = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
