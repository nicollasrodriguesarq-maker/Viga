'use client'
import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

const SUPABASE_URL = 'https://vupjtoeqltzlnplijnzr.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }

async function get(tabela: string, query = '') {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}${query}`, { headers: H })
    const d = await r.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}
async function inserir(tabela: string, dados: object) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, {
      method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(dados),
    })
    const d = await r.json()
    return Array.isArray(d) ? d[0] : d
  } catch { return null }
}
async function atualizar(tabela: string, id: string, dados: object) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${id}`, { method: 'PATCH', headers: H, body: JSON.stringify(dados) })
  } catch {}
}
async function atualizarPorSetor(setor: string, dados: object) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/empresa_contatos?setor=eq.${encodeURIComponent(setor)}`, {
      method: 'PATCH', headers: H, body: JSON.stringify(dados),
    })
  } catch {}
}

async function uploadLogo(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const nome = `logo_${Date.now()}.${ext}`
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/empresa-logo/${nome}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': file.type },
    body: file,
  })
  if (r.ok) return `${SUPABASE_URL}/storage/v1/object/public/empresa-logo/${nome}`
  return null
}

const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const labelCls = 'text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5'
const btnPrimaryCls = 'bg-primary text-on-primary rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer'
const btnSecondaryCls = 'bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg px-4 py-2.5 text-sm hover:bg-surface-variant transition-all cursor-pointer'
const cardCls = 'bg-surface-container border border-outline-variant rounded-xl p-5'
const sectionCls = 'bg-surface-container border border-outline-variant rounded-xl p-5 mb-4'
const tabActiveCls = 'px-4 py-2 rounded-lg border border-primary bg-primary/10 text-primary text-sm font-semibold cursor-pointer transition-all'
const tabInactiveCls = 'px-4 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface-variant text-sm font-semibold cursor-pointer hover:bg-surface-variant/50 transition-all'

export default function Configuracoes() {
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'perfil' | 'contatos' | 'usuarios'>('perfil')
  const [meuId, setMeuId] = useState('')
  const [minhaRole, setMinhaRole] = useState<'admin' | 'usuario' | null>(null)

  useEffect(() => {
    if (!localStorage.getItem('viga_token')) { window.location.href = '/'; return }
    setUserEmail(localStorage.getItem('viga_email') || '')
    carregarMeuPerfil()
  }, [])

  async function carregarMeuPerfil() {
    setLoading(true)
    try {
      const token = localStorage.getItem('viga_token')
      const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      })
      const me = await meRes.json()
      if (me?.id) {
        setMeuId(me.id)
        const rows = await get('usuarios', `?id=eq.${me.id}&select=role`)
        setMinhaRole(rows[0]?.role === 'admin' ? 'admin' : 'usuario')
      }
    } catch { setMinhaRole('usuario') }
    setLoading(false)
  }

  function sair() {
    localStorage.removeItem('viga_token')
    localStorage.removeItem('viga_email')
    window.location.href = '/'
  }

  const souAdmin = minhaRole === 'admin'

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-primary text-lg">Carregando...</div>
    </div>
  )

  return (
    <Layout userEmail={userEmail} onLogout={sair} headerTitle="Configurações">
      <div className="mb-lg">
        <h2 className="font-headline text-headline-lg text-on-surface">Configurações</h2>
        <p className="text-body-md text-on-surface-variant">Perfil da empresa, contatos e usuários do sistema.</p>
      </div>

      <div className="flex gap-2 mb-lg flex-wrap">
        <button className={aba === 'perfil' ? tabActiveCls : tabInactiveCls} onClick={() => setAba('perfil')}>🏢 Perfil da Empresa</button>
        <button className={aba === 'contatos' ? tabActiveCls : tabInactiveCls} onClick={() => setAba('contatos')}>📇 Contatos por Setor</button>
        {souAdmin && <button className={aba === 'usuarios' ? tabActiveCls : tabInactiveCls} onClick={() => setAba('usuarios')}>👥 Usuários</button>}
      </div>

      {aba === 'perfil' && <PerfilEmpresa />}
      {aba === 'contatos' && <ContatosSetor />}
      {aba === 'usuarios' && souAdmin && <UsuariosTab />}
    </Layout>
  )
}

// ── Perfil da Empresa ──────────────────────────────────────────
function PerfilEmpresa() {
  const [configId, setConfigId] = useState('')
  const [form, setForm] = useState({ nome_empresa: '', cnpj: '', registro_profissional: '', emails_gerais: '', logo_url: '' })
  const [arquivoLogo, setArquivoLogo] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const rows = await get('empresa_config', '?limit=1')
    if (rows[0]) {
      setConfigId(rows[0].id)
      setForm({
        nome_empresa: rows[0].nome_empresa || '',
        cnpj: rows[0].cnpj || '',
        registro_profissional: rows[0].registro_profissional || '',
        emails_gerais: rows[0].emails_gerais || '',
        logo_url: rows[0].logo_url || '',
      })
    }
  }

  async function salvar() {
    setSalvando(true); setSalvo(false)
    let logoUrl = form.logo_url
    if (arquivoLogo) {
      const url = await uploadLogo(arquivoLogo)
      if (url) logoUrl = url
    }
    const dados = { ...form, logo_url: logoUrl, updated_at: new Date().toISOString() }
    if (configId) {
      await atualizar('empresa_config', configId, dados)
    } else {
      const novo = await inserir('empresa_config', dados)
      if (novo?.id) setConfigId(novo.id)
    }
    setForm(f => ({ ...f, logo_url: logoUrl }))
    setArquivoLogo(null)
    setSalvando(false)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 3000)
  }

  return (
    <div className={sectionCls}>
      <div className="flex items-center gap-lg mb-lg">
        <div className="w-20 h-20 rounded-xl bg-surface-container-low border border-outline-variant flex items-center justify-center overflow-hidden shrink-0">
          {form.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.logo_url} alt="Logo da empresa" className="w-full h-full object-contain" />
          ) : (
            <span className="material-symbols-outlined text-on-surface-variant/40 text-3xl">apartment</span>
          )}
        </div>
        <div>
          <label className={labelCls}>Logo da Empresa</label>
          <input
            type="file" accept="image/*"
            onChange={e => setArquivoLogo(e.target.files?.[0] || null)}
            className="w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface-variant text-xs px-2 py-2 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-primary/10 file:text-primary file:text-xs file:font-semibold cursor-pointer"
          />
          {arquivoLogo && <div className="text-[11px] text-primary mt-1">📎 {arquivoLogo.name} (salvar para enviar)</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
        <div>
          <label className={labelCls}>Nome da Empresa</label>
          <input className={inputCls} value={form.nome_empresa} onChange={e => setForm({ ...form, nome_empresa: e.target.value })} placeholder="Inverso Construção" />
        </div>
        <div>
          <label className={labelCls}>CNPJ</label>
          <input className={inputCls} value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0001-00" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
        <div>
          <label className={labelCls}>Registro Profissional (CREA/CAU)</label>
          <input className={inputCls} value={form.registro_profissional} onChange={e => setForm({ ...form, registro_profissional: e.target.value })} placeholder="CAU A000000-0" />
        </div>
        <div>
          <label className={labelCls}>E-mails Gerais</label>
          <input className={inputCls} value={form.emails_gerais} onChange={e => setForm({ ...form, emails_gerais: e.target.value })} placeholder="contato@inversoconstrucao.com.br" />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-5">
        <button className={btnPrimaryCls} onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        {salvo && <span className="text-primary-container text-body-sm font-semibold">✓ Salvo com sucesso</span>}
      </div>
    </div>
  )
}

// ── Contatos por Setor ─────────────────────────────────────────
function ContatosSetor() {
  const [contatos, setContatos] = useState<any[]>([])
  const [salvandoSetor, setSalvandoSetor] = useState('')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const rows = await get('empresa_contatos', '?order=setor')
    setContatos(rows)
  }

  function setCampo(setor: string, campo: string, valor: string) {
    setContatos(cs => cs.map(c => c.setor === setor ? { ...c, [campo]: valor } : c))
  }

  async function salvar(c: any) {
    setSalvandoSetor(c.setor)
    await atualizarPorSetor(c.setor, { nome_responsavel: c.nome_responsavel || '', email: c.email || '', telefone: c.telefone || '' })
    setSalvandoSetor('')
  }

  if (contatos.length === 0) {
    return <div className={sectionCls + ' text-center py-10 text-on-surface-variant'}>Nenhum setor cadastrado ainda.</div>
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {contatos.map(c => (
        <div key={c.setor} className={cardCls}>
          <div className="text-sm font-bold text-on-surface mb-3">📇 {c.setor}</div>
          <div className="mb-2.5">
            <label className={labelCls}>Responsável</label>
            <input className={inputCls} value={c.nome_responsavel || ''} onChange={e => setCampo(c.setor, 'nome_responsavel', e.target.value)} />
          </div>
          <div className="mb-2.5">
            <label className={labelCls}>E-mail</label>
            <input className={inputCls} value={c.email || ''} onChange={e => setCampo(c.setor, 'email', e.target.value)} />
          </div>
          <div className="mb-3.5">
            <label className={labelCls}>Telefone</label>
            <input className={inputCls} value={c.telefone || ''} onChange={e => setCampo(c.setor, 'telefone', e.target.value)} />
          </div>
          <button className={btnSecondaryCls} onClick={() => salvar(c)} disabled={salvandoSetor === c.setor}>
            {salvandoSetor === c.setor ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Usuários ────────────────────────────────────────────────────
function UsuariosTab() {
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [modalAberto, setModalAberto] = useState(false)
  const [novo, setNovo] = useState({ nome: '', email: '', senha: '', role: 'usuario' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const rows = await get('usuarios', '?order=created_at')
    setUsuarios(rows)
  }

  function abrirModal() {
    setNovo({ nome: '', email: '', senha: '', role: 'usuario' })
    setErro('')
    setModalAberto(true)
  }

  async function criarUsuario() {
    if (!novo.nome || !novo.email || !novo.senha) { setErro('Preencha nome, e-mail e senha'); return }
    if (novo.senha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres'); return }
    setSalvando(true); setErro('')
    try {
      const token = localStorage.getItem('viga_token')
      const r = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(novo),
      })
      const data = await r.json()
      if (!r.ok) {
        setErro(data.error || 'Não foi possível criar o usuário')
      } else {
        setModalAberto(false)
        carregar()
      }
    } catch {
      setErro('Erro de conexão')
    }
    setSalvando(false)
  }

  return (
    <div className={sectionCls}>
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm font-bold text-on-surface">👥 Usuários do Sistema</div>
        <button className={btnPrimaryCls} onClick={abrirModal}>+ Adicionar Usuário</button>
      </div>

      {usuarios.length === 0 ? (
        <div className="text-center py-8 text-on-surface-variant">Nenhum usuário cadastrado</div>
      ) : (
        <div className="flex flex-col gap-2">
          {usuarios.map(u => (
            <div key={u.id} className="flex justify-between items-center px-3.5 py-3 bg-surface-container-low rounded-lg border border-outline-variant">
              <div>
                <div className="font-semibold text-on-surface text-sm">{u.nome || u.email}</div>
                <div className="text-[11px] text-on-surface-variant">{u.email}</div>
              </div>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${u.role === 'admin' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-on-surface-variant/10 text-on-surface-variant border-on-surface-variant/20'}`}>
                {u.role === 'admin' ? 'Admin' : 'Usuário'}
              </span>
            </div>
          ))}
        </div>
      )}

      {modalAberto && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setModalAberto(false)}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[440px]">
            <div className="text-base font-bold text-on-surface mb-5">+ Adicionar Usuário</div>
            <div className="mb-3.5">
              <label className={labelCls}>Nome *</label>
              <input className={inputCls} value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} placeholder="Nome completo" />
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>E-mail *</label>
              <input className={inputCls} type="email" value={novo.email} onChange={e => setNovo({ ...novo, email: e.target.value })} placeholder="pessoa@empresa.com" />
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Senha Provisória *</label>
              <input className={inputCls} type="password" value={novo.senha} onChange={e => setNovo({ ...novo, senha: e.target.value })} placeholder="mínimo 6 caracteres" />
            </div>
            <div className="mb-5">
              <label className={labelCls}>Papel</label>
              <select className={inputCls} value={novo.role} onChange={e => setNovo({ ...novo, role: e.target.value })}>
                <option value="usuario">Usuário comum</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {erro && <div className="bg-error/10 border border-error/30 rounded-lg px-4 py-2 text-error text-body-sm mb-4">{erro}</div>}
            <div className="flex gap-2 justify-end">
              <button className={btnSecondaryCls} onClick={() => setModalAberto(false)}>Cancelar</button>
              <button className={btnPrimaryCls} onClick={criarUsuario} disabled={salvando}>{salvando ? 'Criando...' : 'Criar Usuário'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
