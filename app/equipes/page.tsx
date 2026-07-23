'use client'
import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { obterMinhasPermissoes } from '../lib/permissoes'

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
  try { await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${id}`, { method: 'PATCH', headers: H, body: JSON.stringify(dados) }) } catch {}
}
async function deletar(tabela: string, id: string) {
  try { await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${id}`, { method: 'DELETE', headers: H }) } catch {}
}

const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const labelCls = 'text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5'
const btnPrimaryCls = 'bg-primary text-on-primary rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer'
const btnSecondaryCls = 'bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg px-4 py-2.5 text-sm hover:bg-surface-variant transition-all cursor-pointer'
const btnDangerSmCls = 'bg-error/10 border border-error/30 text-error rounded-md px-2.5 py-1 text-xs hover:bg-error/20 transition-all cursor-pointer'
const btnEditSmCls = 'bg-primary/10 border border-primary/30 text-primary rounded-md px-2.5 py-1 text-xs hover:bg-primary/20 transition-all cursor-pointer'
const sectionCls = 'bg-surface-container border border-outline-variant rounded-xl p-5 mb-4'

const FTIME_VAZIO = { nome: '', gerente_id: '' }

export default function Equipes() {
  const [times, setTimes] = useState<any[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [janela, setJanela] = useState<'time' | null>(null)
  const [fTime, setFTime] = useState(FTIME_VAZIO)
  const [editandoTime, setEditandoTime] = useState<any>(null)

  useEffect(() => {
    if (!localStorage.getItem('viga_token')) { window.location.href = '/'; return }
    setUserEmail(localStorage.getItem('viga_email') || '')
    obterMinhasPermissoes().then(perm => {
      if (perm?.role !== 'admin') { window.location.href = '/'; return }
    })
    carregar()
  }, [])

  function sair() {
    localStorage.removeItem('viga_token')
    localStorage.removeItem('viga_refresh_token')
    localStorage.removeItem('viga_email')
    window.location.href = '/'
  }

  async function carregar() {
    setLoading(true)
    const [t, u] = await Promise.all([
      get('times', '?order=nome'),
      get('usuarios', '?select=id,nome,email,role,time_id&order=nome'),
    ])
    setTimes(t); setUsuarios(u)
    setLoading(false)
  }

  const gerentes = usuarios.filter(u => u.role === 'gerente_time')
  const tecnicos = usuarios.filter(u => u.role === 'usuario')

  function abrirNovoTime() {
    setEditandoTime(null)
    setFTime(FTIME_VAZIO)
    setJanela('time')
  }
  function abrirEditarTime(t: any) {
    setEditandoTime(t)
    setFTime({ nome: t.nome, gerente_id: t.gerente_id || '' })
    setJanela('time')
  }
  async function salvarTime() {
    if (!fTime.nome) return alert('Preencha o nome do time')
    const dados = { nome: fTime.nome, gerente_id: fTime.gerente_id || null }
    if (editandoTime) await atualizar('times', editandoTime.id, dados)
    else await inserir('times', dados)
    setJanela(null); setFTime(FTIME_VAZIO); setEditandoTime(null)
    carregar()
  }
  async function excluirTime(t: any) {
    if (!confirm(`Excluir o time "${t.nome}"? Os técnicos ficam sem time atribuído.`)) return
    await deletar('times', t.id)
    carregar()
  }
  async function mudarTimeTecnico(usuarioId: string, timeId: string) {
    await atualizar('usuarios', usuarioId, { time_id: timeId || null })
    carregar()
  }

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-primary text-lg">Carregando equipes...</div>
    </div>
  )

  return (
    <Layout userEmail={userEmail} onLogout={sair} headerTitle="Equipes & Times">
      <div className="flex justify-between items-center mb-lg">
        <div>
          <h1 className="text-headline-md font-headline text-on-surface">Equipes & Times</h1>
          <p className="text-body-sm text-on-surface-variant">Organize os times e quem é o gerente de cada um</p>
        </div>
        <button className={btnPrimaryCls} onClick={abrirNovoTime}>+ Novo Time</button>
      </div>

      <div className={sectionCls}>
        <div className="text-sm font-bold text-on-surface mb-4">👥 Times</div>
        {times.length === 0 ? (
          <div className="text-center py-8 text-on-surface-variant">Nenhum time cadastrado ainda</div>
        ) : (
          <div className="flex flex-col gap-2">
            {times.map(t => {
              const gerente = usuarios.find(u => u.id === t.gerente_id)
              const qtdTecnicos = tecnicos.filter(u => u.time_id === t.id).length
              return (
                <div key={t.id} className="flex justify-between items-center px-4 py-3 bg-surface-container-low rounded-lg border border-outline-variant">
                  <div>
                    <div className="font-semibold text-sm text-on-surface">{t.nome}</div>
                    <div className="text-[11px] text-on-surface-variant">
                      Gerente: {gerente ? (gerente.nome || gerente.email) : '— não definido —'} · {qtdTecnicos} técnico(s)
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className={btnEditSmCls} onClick={() => abrirEditarTime(t)}>Editar</button>
                    <button className={btnDangerSmCls} onClick={() => excluirTime(t)}>×</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {gerentes.length === 0 && (
          <div className="mt-3 px-3.5 py-2.5 bg-tertiary/10 rounded-lg text-body-sm text-tertiary">
            ⚠️ Nenhum usuário tem o papel "Gerente de Time" ainda — crie ou edite um usuário em Configurações → Usuários.
          </div>
        )}
      </div>

      <div className={sectionCls}>
        <div className="text-sm font-bold text-on-surface mb-4">🧑‍🔧 Técnicos — atribuição de time</div>
        {tecnicos.length === 0 ? (
          <div className="text-center py-8 text-on-surface-variant">Nenhum técnico cadastrado</div>
        ) : (
          <div className="flex flex-col gap-2">
            {tecnicos.map(u => (
              <div key={u.id} className="flex justify-between items-center px-4 py-3 bg-surface-container-low rounded-lg border border-outline-variant gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-on-surface truncate">{u.nome || u.email}</div>
                  <div className="text-[11px] text-on-surface-variant truncate">{u.email}</div>
                </div>
                <select
                  className={inputCls + ' w-auto shrink-0'}
                  value={u.time_id || ''}
                  onChange={e => mudarTimeTecnico(u.id, e.target.value)}
                >
                  <option value="">— nenhum time —</option>
                  {times.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {janela === 'time' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[440px]">
            <div className="text-base font-bold text-on-surface mb-5">{editandoTime ? 'Editar Time' : '+ Novo Time'}</div>
            <div className="mb-3.5">
              <label className={labelCls}>Nome do Time *</label>
              <input className={inputCls} placeholder="Ex: Time Elétrica" value={fTime.nome} onChange={e => setFTime({ ...fTime, nome: e.target.value })} />
            </div>
            <div className="mb-5">
              <label className={labelCls}>Gerente</label>
              <select className={inputCls} value={fTime.gerente_id} onChange={e => setFTime({ ...fTime, gerente_id: e.target.value })}>
                <option value="">— não definido —</option>
                {gerentes.map(g => <option key={g.id} value={g.id}>{g.nome || g.email}</option>)}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button className={btnSecondaryCls} onClick={() => { setJanela(null); setEditandoTime(null) }}>Cancelar</button>
              <button className={btnPrimaryCls} onClick={salvarTime}>{editandoTime ? 'Salvar' : 'Criar Time'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
