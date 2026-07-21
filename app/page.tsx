'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Layout from './components/Layout'

const SUPABASE_URL = 'https://vupjtoeqltzlnplijnzr.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

async function get(tabela: string, query = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}${query}`, { headers: H })
  const d = await r.json()
  return Array.isArray(d) ? d : []
}

async function loginAPI(email: string, senha: string) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
    body: JSON.stringify({ email, password: senha })
  })
  return r.json()
}

async function signupAPI(email: string, senha: string) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
    body: JSON.stringify({ email, password: senha })
  })
  return r.json()
}

const MODULOS = [
  { icon: '🏗️', nome: 'Obras & Projetos', desc: 'Hub central de obras', href: '/obras', ativo: true },
  { icon: '💰', nome: 'Financeiro', desc: 'Empresa e obras', href: '/financeiro', ativo: true },
  { icon: '📐', nome: 'Levantamento', desc: 'Registro de campo', href: '/levantamento', ativo: true },
  { icon: '💼', nome: 'Orçamento', desc: 'Composição e proposta', href: '/orcamento', ativo: true },
  { icon: '📦', nome: 'Suprimentos', desc: 'Compras e estoque', href: '/suprimentos', ativo: false },
  { icon: '🤝', nome: 'CRM', desc: 'Clientes e vendas', href: '/crm', ativo: false },
  { icon: '👥', nome: 'Equipes', desc: 'Tarefas e alocação', href: '/equipes', ativo: false },
  { icon: '📅', nome: 'Agenda', desc: 'Compromissos', href: '/agenda', ativo: false },
]

const STATUS_CLASSES: Record<string, string> = {
  captacao: 'bg-secondary/10 text-secondary border-secondary/20',
  em_execucao: 'bg-primary/10 text-primary border-primary/20',
  pausada: 'bg-tertiary/10 text-tertiary border-tertiary/20',
  concluida: 'bg-primary-container/10 text-primary-container border-primary-container/20',
  cancelada: 'bg-error/10 text-error border-error/20',
}
const STATUS_LABELS: Record<string, string> = {
  captacao: 'Captação', em_execucao: 'Em Execução', pausada: 'Pausada', concluida: 'Concluída', cancelada: 'Cancelada'
}

export default function Home() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [logado, setLogado] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [checando, setChecando] = useState(true)
  const [modoAuth, setModoAuth] = useState<'login' | 'cadastro'>('login')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [cadastroSucesso, setCadastroSucesso] = useState(false)

  // Dashboard data
  const [obrasAtivas, setObrasAtivas] = useState(0)
  const [faturamentoMes, setFaturamentoMes] = useState(0)
  const [aReceber, setAReceber] = useState(0)
  const [aPagar, setAPagar] = useState(0)
  const [obrasRecentes, setObrasRecentes] = useState<any[]>([])
  const [loadingDash, setLoadingDash] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('viga_token')
    const savedEmail = localStorage.getItem('viga_email')
    if (token && savedEmail) {
      setUserEmail(savedEmail)
      setLogado(true)
    }
    setChecando(false)
  }, [])

  useEffect(() => {
    if (logado) carregarDashboard()
  }, [logado])

  async function carregarDashboard() {
    setLoadingDash(true)
    try {
      const mesAtual = new Date().toISOString().slice(0, 7)
      const [obras, lancamentos] = await Promise.all([
        get('obras', '?order=created_at.desc'),
        get('lancamentos', '?order=data.desc')
      ])

      setObrasAtivas(obras.filter((o: any) => o.status === 'em_execucao').length)
      setObrasRecentes(obras.slice(0, 4))

      const lancMes = lancamentos.filter((l: any) => l.data?.slice(0, 7) === mesAtual)
      setFaturamentoMes(lancMes.filter((l: any) => l.tipo === 'entrada').reduce((a: number, l: any) => a + parseFloat(l.valor || 0), 0))
      setAReceber(lancamentos.filter((l: any) => l.tipo === 'entrada' && l.status === 'pendente').reduce((a: number, l: any) => a + parseFloat(l.valor || 0), 0))
      setAPagar(lancamentos.filter((l: any) => l.tipo === 'saida' && l.status === 'pendente').reduce((a: number, l: any) => a + parseFloat(l.valor || 0), 0))
    } catch (e) { console.error(e) }
    setLoadingDash(false)
  }

  async function entrar() {
    if (!email || !senha) { setErro('Preencha e-mail e senha'); return }
    setLoading(true); setErro('')
    const data = await loginAPI(email.trim(), senha)
    if (data.access_token) {
      localStorage.setItem('viga_token', data.access_token)
      localStorage.setItem('viga_email', email.trim())
      setUserEmail(email.trim())
      setLogado(true)
    } else {
      setErro('E-mail ou senha incorretos')
    }
    setLoading(false)
  }

  async function cadastrar() {
    if (!email || !senha) { setErro('Preencha e-mail e senha'); return }
    if (senha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres'); return }
    if (senha !== confirmarSenha) { setErro('As senhas não coincidem'); return }
    setLoading(true); setErro('')
    const data = await signupAPI(email.trim(), senha)
    if (data.id || data.user) {
      if (data.access_token) {
        localStorage.setItem('viga_token', data.access_token)
        localStorage.setItem('viga_email', email.trim())
        setUserEmail(email.trim())
        setLogado(true)
      } else {
        setCadastroSucesso(true)
      }
    } else {
      setErro(data.msg || data.error_description || data.message || 'Não foi possível criar a conta')
    }
    setLoading(false)
  }

  function trocarModo(novo: 'login' | 'cadastro') {
    setModoAuth(novo); setErro(''); setCadastroSucesso(false); setSenha(''); setConfirmarSenha('')
  }

  function sair() {
    localStorage.removeItem('viga_token')
    localStorage.removeItem('viga_email')
    setLogado(false); setEmail(''); setSenha(''); setUserEmail('')
  }

  if (checando) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-primary text-base">Carregando...</div>
    </div>
  )

  if (logado) {
    const hora = new Date().getHours()
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

    return (
      <Layout
        userEmail={userEmail}
        onLogout={sair}
        searchSlot={
          <div className="relative w-full group">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline group-focus-within:text-primary transition-colors">search</span>
            <input
              type="text"
              placeholder="Pesquisar em obras, clientes ou suprimentos..."
              className="w-full bg-surface-container-low border border-outline-variant rounded-full pl-12 pr-4 py-2 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            />
          </div>
        }
        topbarSlot={
          <Link href="/financeiro" className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl hover:opacity-90 transition-all font-label-md text-label-md shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-[20px]">add</span>
            Novo Lançamento
          </Link>
        }
      >
        {/* Saudação */}
        <div className="flex justify-between items-end mb-xl">
          <div>
            <h2 className="font-headline text-headline-lg text-on-surface flex items-center gap-2">{saudacao}! 👋</h2>
            <p className="text-on-surface-variant mt-1 capitalize">
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button onClick={carregarDashboard} className="flex items-center gap-2 px-4 py-2 bg-surface-container-high text-primary-fixed-dim rounded-lg hover:bg-surface-variant transition-all border border-outline-variant/30">
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            <span className="font-label-md">Atualizar</span>
          </button>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-lg mb-xl">
          <Link href="/obras" className="bg-surface-container p-lg rounded-xl card-border group hover:border-primary transition-all duration-300 block">
            <div className="flex items-center justify-between mb-md">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <span className="material-symbols-outlined">construction</span>
              </div>
            </div>
            <p className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-widest mb-1">OBRAS ATIVAS</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-headline-lg font-headline text-primary">{loadingDash ? '...' : obrasAtivas}</h3>
              <span className="text-label-md text-on-surface-variant">em execução</span>
            </div>
          </Link>

          <Link href="/financeiro" className="bg-surface-container p-lg rounded-xl card-border group hover:border-secondary transition-all duration-300 block">
            <div className="flex items-center justify-between mb-md">
              <div className="p-2 bg-secondary/10 rounded-lg text-secondary">
                <span className="material-symbols-outlined">payments</span>
              </div>
            </div>
            <p className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-widest mb-1">FATURAMENTO MÊS</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-headline-md font-headline text-secondary">{loadingDash ? '...' : fmt(faturamentoMes)}</h3>
            </div>
            <div className="text-label-md text-on-surface-variant mt-1 capitalize">{new Date().toLocaleDateString('pt-BR', { month: 'long' })}</div>
          </Link>

          <Link href="/financeiro" className="bg-surface-container p-lg rounded-xl card-border group hover:border-tertiary transition-all duration-300 block">
            <div className="flex items-center justify-between mb-md">
              <div className="p-2 bg-tertiary/10 rounded-lg text-tertiary">
                <span className="material-symbols-outlined">trending_up</span>
              </div>
            </div>
            <p className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-widest mb-1">A RECEBER</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-headline-md font-headline text-tertiary">{loadingDash ? '...' : fmt(aReceber)}</h3>
            </div>
            <div className="text-label-md text-on-surface-variant mt-1">pendente</div>
          </Link>

          <Link href="/financeiro" className="bg-surface-container p-lg rounded-xl card-border group hover:border-error transition-all duration-300 block">
            <div className="flex items-center justify-between mb-md">
              <div className="p-2 bg-error/10 rounded-lg text-error">
                <span className="material-symbols-outlined">trending_down</span>
              </div>
            </div>
            <p className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-widest mb-1">A PAGAR</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-headline-md font-headline text-error">{loadingDash ? '...' : fmt(aPagar)}</h3>
            </div>
            <div className="text-label-md text-on-surface-variant mt-1">pendente</div>
          </Link>
        </div>

        {/* Obras recentes */}
        {obrasRecentes.length > 0 && (
          <section className="bg-surface-container rounded-2xl card-border overflow-hidden flex flex-col mb-xl">
            <div className="px-lg py-lg flex items-center justify-between border-b border-outline-variant bg-surface-container-high/50">
              <h3 className="font-headline text-headline-sm text-on-surface">Obras Recentes</h3>
              <Link href="/obras" className="text-primary font-label-md hover:underline flex items-center gap-1">
                Ver todas
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </Link>
            </div>
            <div className="flex flex-col">
              {obrasRecentes.map((obra: any, i: number) => {
                const badge = STATUS_CLASSES[obra.status] || STATUS_CLASSES.em_execucao
                const contrato = parseFloat(obra.valor_contrato || 0)
                return (
                  <Link
                    href="/obras"
                    key={obra.id}
                    className={`px-lg py-md hover:bg-surface-variant/30 transition-colors flex items-center justify-between ${i < obrasRecentes.length - 1 ? 'border-b border-outline-variant/30' : ''}`}
                  >
                    <div className="flex items-center gap-lg">
                      <div className="w-12 h-12 rounded-xl bg-surface-variant flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary">home_work</span>
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-data-mono text-[11px] text-on-surface-variant bg-surface-container-highest px-2 py-0.5 rounded">{obra.codigo}</span>
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badge}`}>
                            {STATUS_LABELS[obra.status] || obra.status}
                          </span>
                        </div>
                        <h4 className="font-headline text-headline-sm text-on-surface">{obra.nome}</h4>
                        <p className="text-on-surface-variant text-body-sm">{obra.cliente}</p>
                      </div>
                    </div>
                    {contrato > 0 && (
                      <div className="text-right">
                        <p className="font-headline text-headline-md text-primary-container">{fmt(contrato)}</p>
                        <p className="text-on-surface-variant text-[11px] uppercase tracking-widest font-bold">contrato</p>
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* Timeline + RDO */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg mb-xl">
          <div className="lg:col-span-2 bg-surface-container rounded-2xl card-border p-lg">
            <h3 className="font-headline text-headline-sm text-on-surface mb-lg">Timeline da Equipe</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="mt-1 w-2 h-2 rounded-full bg-primary ring-4 ring-primary/10" />
                <div>
                  <p className="text-on-surface font-label-md">Concretagem concluída no Setor B</p>
                  <p className="text-on-surface-variant text-body-sm">Hoje às 14:30 • Eng. Ricardo Silva</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="mt-1 w-2 h-2 rounded-full bg-secondary ring-4 ring-secondary/10" />
                <div>
                  <p className="text-on-surface font-label-md">Novo orçamento aprovado pelo cliente</p>
                  <p className="text-on-surface-variant text-body-sm">Ontem</p>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-surface-container rounded-2xl card-border p-lg flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-primary-container/20 text-primary-container flex items-center justify-center mb-md">
              <span className="material-symbols-outlined text-[32px]">cloud_upload</span>
            </div>
            <h4 className="font-headline text-headline-sm text-on-surface mb-2">Relatórios Diários</h4>
            <p className="text-on-surface-variant text-body-sm mb-lg">Suba fotos e relatórios das visitas técnicas realizadas hoje.</p>
            <button className="w-full py-3 border-2 border-dashed border-outline-variant rounded-xl text-on-surface-variant hover:border-primary hover:text-primary transition-all font-bold">
              Upload RDO
            </button>
          </div>
        </div>

        {/* Módulos */}
        <div className="bg-surface-container rounded-2xl card-border p-lg mb-xl">
          <h3 className="font-headline text-headline-sm text-on-surface mb-md">Módulos do Sistema</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
            {MODULOS.map(mod => {
              const conteudo = (
                <>
                  <div className="text-2xl mb-2">{mod.icon}</div>
                  <div className="font-label-md text-on-surface mb-1">{mod.nome}</div>
                  <div className="text-body-sm text-on-surface-variant mb-3">{mod.desc}</div>
                  <div className={`text-label-sm uppercase tracking-widest font-bold ${mod.ativo ? 'text-primary' : 'text-on-surface-variant/50'}`}>
                    {mod.ativo ? 'Acessar →' : 'Em breve'}
                  </div>
                </>
              )
              return mod.ativo ? (
                <Link key={mod.nome} href={mod.href} className="bg-surface-container-low border border-outline-variant rounded-lg p-md hover:border-primary hover:-translate-y-0.5 transition-all block">
                  {conteudo}
                </Link>
              ) : (
                <div key={mod.nome} className="bg-surface-container-low border border-outline-variant/50 rounded-lg p-md opacity-50">
                  {conteudo}
                </div>
              )
            })}
          </div>
        </div>

        <div className="text-center text-on-surface-variant/60 text-body-sm">VIGA v1.0 · Inverso Construção</div>

        {/* FAB */}
        <div className="fixed bottom-lg right-lg group">
          <div className="absolute bottom-full right-0 mb-4 flex flex-col items-end gap-2 pointer-events-none opacity-0 group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-300 -translate-y-2 group-hover:translate-y-0">
            <Link href="/orcamento" className="flex items-center gap-3 px-4 py-2 bg-surface-container card-border rounded-lg text-on-surface hover:bg-surface-variant shadow-xl">
              <span className="font-label-md">Novo Orçamento</span>
              <span className="material-symbols-outlined text-primary">description</span>
            </Link>
            <Link href="/obras" className="flex items-center gap-3 px-4 py-2 bg-surface-container card-border rounded-lg text-on-surface hover:bg-surface-variant shadow-xl">
              <span className="font-label-md">Adicionar Obra</span>
              <span className="material-symbols-outlined text-primary">add_business</span>
            </Link>
          </div>
          <button className="w-14 h-14 bg-primary text-on-primary rounded-full flex items-center justify-center shadow-xl shadow-primary/40 hover:scale-110 active:scale-95 transition-all">
            <span className="material-symbols-outlined text-[28px] group-hover:rotate-45 transition-transform">add</span>
          </button>
        </div>
      </Layout>
    )
  }

  // LOGIN / CADASTRO
  const acaoPrincipal = modoAuth === 'login' ? entrar : cadastrar

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-md">
      <div className="bg-surface-container border border-outline-variant rounded-2xl p-xl w-full max-w-[400px]">
        <div className="text-center mb-lg">
          <div className="font-headline text-[52px] font-black text-primary tracking-tighter mb-2">VIGA</div>
          <div className="text-on-surface-variant text-body-md">Sistema de Gestão Integrada</div>
          <div className="text-on-surface-variant/60 text-body-sm mt-1">Inverso Construção</div>
        </div>

        <div className="flex gap-1 p-1 bg-surface-container-low rounded-xl mb-lg">
          <button
            onClick={() => trocarModo('login')}
            className={`flex-1 rounded-lg py-2 text-body-sm font-bold transition-all ${modoAuth === 'login' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            Entrar
          </button>
          <button
            onClick={() => trocarModo('cadastro')}
            className={`flex-1 rounded-lg py-2 text-body-sm font-bold transition-all ${modoAuth === 'cadastro' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            Criar Conta
          </button>
        </div>

        {cadastroSucesso ? (
          <div className="text-center py-lg">
            <div className="text-4xl mb-3">📧</div>
            <div className="text-on-surface font-semibold mb-2">Conta criada!</div>
            <div className="text-on-surface-variant text-body-sm mb-lg">Verifique seu e-mail para confirmar o cadastro antes de entrar.</div>
            <button
              onClick={() => trocarModo('login')}
              className="w-full rounded-lg py-3 font-bold text-body-lg bg-primary text-on-primary hover:opacity-90 transition-all"
            >
              Voltar para Entrar
            </button>
          </div>
        ) : (
          <>
            <div className="mb-md">
              <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-widest block mb-2">E-mail</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com"
                onKeyDown={e => e.key === 'Enter' && acaoPrincipal()}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-4 py-3 text-body-md outline-none focus:border-primary transition-all"
              />
            </div>
            <div className={modoAuth === 'cadastro' ? 'mb-md' : 'mb-lg'}>
              <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-widest block mb-2">Senha</label>
              <input
                type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="••••••••"
                onKeyDown={e => e.key === 'Enter' && acaoPrincipal()}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-4 py-3 text-body-md outline-none focus:border-primary transition-all"
              />
            </div>
            {modoAuth === 'cadastro' && (
              <div className="mb-lg">
                <label className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-widest block mb-2">Confirmar Senha</label>
                <input
                  type="password" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} placeholder="••••••••"
                  onKeyDown={e => e.key === 'Enter' && acaoPrincipal()}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-4 py-3 text-body-md outline-none focus:border-primary transition-all"
                />
              </div>
            )}
            {erro && (
              <div className="bg-error/10 border border-error/30 rounded-lg px-4 py-2 text-error text-body-sm mb-md">{erro}</div>
            )}
            <button
              onClick={acaoPrincipal} disabled={loading}
              className={`w-full rounded-lg py-3 font-bold text-body-lg transition-all ${loading ? 'bg-surface-variant text-on-surface-variant cursor-not-allowed' : 'bg-primary text-on-primary hover:opacity-90 cursor-pointer'}`}
            >
              {loading ? (modoAuth === 'login' ? 'Entrando...' : 'Criando conta...') : (modoAuth === 'login' ? 'Entrar no VIGA' : 'Criar Conta')}
            </button>
          </>
        )}

        <div className="text-center mt-lg text-on-surface-variant/60 text-body-sm">v1.0 · Inverso Construção</div>
      </div>
    </div>
  )
}
