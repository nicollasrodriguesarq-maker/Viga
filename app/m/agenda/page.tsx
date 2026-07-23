'use client'
import { useEffect, useState } from 'react'
import MobileShell from '../components/MobileShell'
import { obterMinhasPermissoesApp, temAcessoModuloApp, obterUsuariosVisiveis } from '../../lib/permissoes'

const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': 'Bearer ' + ANON }

async function buscar(tabela: string, q = '') {
  try { const r = await fetch(BASE + '/' + tabela + q, { headers: H }); const d = await r.json(); return Array.isArray(d) ? d : [] } catch { return [] }
}
async function criar(tabela: string, dados: object) {
  try { const r = await fetch(BASE + '/' + tabela, { method: 'POST', headers: { ...H, 'Prefer': 'return=representation' }, body: JSON.stringify(dados) }); const d = await r.json(); return Array.isArray(d) ? d[0] : d } catch { return null }
}
async function editar(tabela: string, id: string, dados: object) {
  try { await fetch(BASE + '/' + tabela + '?id=eq.' + id, { method: 'PATCH', headers: H, body: JSON.stringify(dados) }) } catch {}
}
async function remover(tabela: string, id: string) {
  try { await fetch(BASE + '/' + tabela + '?id=eq.' + id, { method: 'DELETE', headers: H }) } catch {}
}

const ALERTA_OPCOES = [
  { valor: '', label: 'Sem alerta' },
  { valor: '5', label: '5 minutos antes' },
  { valor: '15', label: '15 minutos antes' },
  { valor: '30', label: '30 minutos antes' },
  { valor: '60', label: '1 hora antes' },
  { valor: '1440', label: '1 dia antes' },
]

function formatarGrupo(dataStr: string) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const amanha = new Date(hoje); amanha.setDate(hoje.getDate() + 1)
  const d = new Date(dataStr + 'T00:00:00')
  if (d.getTime() === hoje.getTime()) return 'Hoje'
  if (d.getTime() === amanha.getTime()) return 'Amanhã'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^\w/, c => c.toUpperCase())
}

function inicioSemana(d: Date) {
  const dt = new Date(d); const dow = dt.getDay()
  dt.setDate(dt.getDate() + (dow === 0 ? -6 : 1 - dow)); dt.setHours(0, 0, 0, 0)
  return dt
}
function janelaDatas(visualizacao: 'dia' | 'semana' | 'mes', dataRef: Date) {
  if (visualizacao === 'dia') return { inicio: new Date(dataRef), fim: new Date(dataRef) }
  if (visualizacao === 'semana') {
    const inicio = inicioSemana(dataRef)
    const fim = new Date(inicio); fim.setDate(inicio.getDate() + 6)
    return { inicio, fim }
  }
  const inicio = new Date(dataRef.getFullYear(), dataRef.getMonth(), 1)
  const fim = new Date(dataRef.getFullYear(), dataRef.getMonth() + 1, 0)
  return { inicio, fim }
}
function deslocarData(visualizacao: 'dia' | 'semana' | 'mes', dataRef: Date, direcao: 1 | -1) {
  const d = new Date(dataRef)
  if (visualizacao === 'dia') d.setDate(d.getDate() + direcao)
  else if (visualizacao === 'semana') d.setDate(d.getDate() + direcao * 7)
  else d.setMonth(d.getMonth() + direcao)
  return d
}
function formatarJanela(visualizacao: 'dia' | 'semana' | 'mes', dataRef: Date) {
  const { inicio, fim } = janelaDatas(visualizacao, dataRef)
  if (visualizacao === 'dia') return inicio.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^\w/, c => c.toUpperCase())
  if (visualizacao === 'semana') return `${inicio.toLocaleDateString('pt-BR')} – ${fim.toLocaleDateString('pt-BR')}`
  return dataRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())
}
function dataKey(d: Date) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function diasDaSemana(dataRef: Date) {
  const inicio = inicioSemana(dataRef)
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(inicio); d.setDate(inicio.getDate() + i); return d })
}
function diasDoMes(dataRef: Date) {
  const primeiroDia = new Date(dataRef.getFullYear(), dataRef.getMonth(), 1)
  const inicioGrade = inicioSemana(primeiroDia)
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(inicioGrade); d.setDate(inicioGrade.getDate() + i); return d })
}
const NOMES_DIA_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const labelCls = 'text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5'
const btnPrimaryCls = 'bg-primary text-on-primary rounded-lg px-4 py-3 text-sm font-bold hover:opacity-90 transition-all cursor-pointer w-full'
const btnSecondaryCls = 'bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg px-4 py-3 text-sm cursor-pointer'

const FORM_VAZIO = { titulo: '', descricao: '', endereco: '', data: '', hora_inicio: '', hora_fim: '', alerta_minutos_antes: '', usuario_id: '' }

export default function AgendaMobile() {
  const [compromissos, setCompromissos] = useState<any[]>([])
  const [busca, setBusca] = useState('')
  const [tela, setTela] = useState<string | null>(null)
  const [fComp, setFComp] = useState(FORM_VAZIO)
  const [editando, setEditando] = useState<any>(null)
  const [meuId, setMeuId] = useState('')
  const [souAdmin, setSouAdmin] = useState(false)
  const [souGerenteTime, setSouGerenteTime] = useState(false)
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [visiveis, setVisiveis] = useState<string[]>([])
  const [alvoAgenda, setAlvoAgenda] = useState('')
  const [visualizacao, setVisualizacao] = useState<'dia' | 'semana' | 'mes'>('semana')
  const [dataRef, setDataRef] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })

  const souGestor = souAdmin || souGerenteTime

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('viga_token')) { window.location.href = '/'; return }
    obterMinhasPermissoesApp().then(async perm => {
      if (!temAcessoModuloApp(perm, 'agenda')) { window.location.href = '/m'; return }
      if (!perm) return
      setMeuId(perm.id)
      setSouAdmin(perm.role === 'admin')
      setSouGerenteTime(perm.role === 'gerente_time')
      const vis = await obterUsuariosVisiveis(perm)
      setVisiveis(vis)
      if (perm.role !== 'usuario') {
        const u = await buscar('usuarios', '?select=id,nome,email&order=nome')
        setUsuarios(u)
      }
    })
  }, [])

  useEffect(() => { if (meuId) carregar() }, [alvoAgenda, meuId])

  async function carregar() {
    let filtro = ''
    if (!souGestor) {
      filtro = '&usuario_id=eq.' + meuId
    } else if (alvoAgenda === 'equipe') {
      filtro = visiveis.length > 0 ? '&usuario_id=in.(' + visiveis.join(',') + ')' : ''
    } else if (alvoAgenda) {
      filtro = '&usuario_id=eq.' + alvoAgenda
    } else {
      filtro = '&usuario_id=eq.' + meuId
    }
    const c = await buscar('agenda_compromissos', '?order=data.asc,hora_inicio.asc' + filtro)
    setCompromissos(c)
  }

  function abrirNovo() {
    setEditando(null)
    const usuarioPadrao = souGestor && alvoAgenda && alvoAgenda !== 'equipe' ? alvoAgenda : meuId
    setFComp({ ...FORM_VAZIO, data: new Date().toISOString().slice(0, 10), usuario_id: usuarioPadrao })
    setTela('novoCompromisso')
  }
  function abrirEditar(c: any) {
    setEditando(c)
    setFComp({
      titulo: c.titulo || '', descricao: c.descricao || '', endereco: c.endereco || '',
      data: c.data || '', hora_inicio: c.hora_inicio || '', hora_fim: c.hora_fim || '',
      alerta_minutos_antes: c.alerta_minutos_antes != null ? String(c.alerta_minutos_antes) : '',
      usuario_id: c.usuario_id || meuId,
    })
    setTela('novoCompromisso')
  }

  async function salvarCompromisso() {
    if (!fComp.titulo.trim()) return alert('Preencha o título')
    if (!fComp.data) return alert('Selecione a data')
    const dados = {
      titulo: fComp.titulo.trim(),
      descricao: fComp.descricao.trim(),
      endereco: fComp.endereco.trim(),
      data: fComp.data,
      hora_inicio: fComp.hora_inicio || null,
      hora_fim: fComp.hora_fim || null,
      alerta_minutos_antes: fComp.alerta_minutos_antes ? parseInt(fComp.alerta_minutos_antes) : null,
      criado_por: meuId || null,
      usuario_id: (souGestor && fComp.usuario_id) || meuId || null,
    }
    if (editando) { await editar('agenda_compromissos', editando.id, dados) }
    else { await criar('agenda_compromissos', dados) }
    setTela(null); setEditando(null); setFComp(FORM_VAZIO)
    await carregar()
  }

  async function excluirCompromisso(id: string) {
    if (!confirm('Excluir este compromisso?')) return
    await remover('agenda_compromissos', id)
    await carregar()
  }

  const { inicio: janelaInicio, fim: janelaFim } = janelaDatas(visualizacao, dataRef)

  const filtrados = compromissos.filter(c => {
    const d = new Date(c.data + 'T00:00:00')
    if (d < janelaInicio || d > janelaFim) return false
    if (!busca) return true
    const termo = busca.toLowerCase()
    return [c.titulo, c.descricao, c.endereco].some(v => v?.toLowerCase().includes(termo))
  })

  const hojeStr = new Date().toISOString().slice(0, 10)
  const filtradosBusca = compromissos.filter(c => {
    if (!busca) return true
    const termo = busca.toLowerCase()
    return [c.titulo, c.descricao, c.endereco].some(v => v?.toLowerCase().includes(termo))
  })
  function compromissosDoDia(d: Date) {
    const key = dataKey(d)
    return filtradosBusca.filter(c => c.data === key)
  }

  const grupos: { data: string, itens: any[] }[] = []
  for (const c of filtrados) {
    let grupo = grupos.find(g => g.data === c.data)
    if (!grupo) { grupo = { data: c.data, itens: [] }; grupos.push(grupo) }
    grupo.itens.push(c)
  }

  // ── Tela: Novo/Editar Compromisso ─────────────────────────────
  if (tela === 'novoCompromisso') {
    return (
      <MobileShell title={editando ? '✏️ Editar Compromisso' : '📅 Novo Compromisso'}>
        <div className="p-4 flex flex-col gap-3.5 pb-8">
          {souGestor && (
            <div>
              <label className={labelCls}>Para quem</label>
              <select className={inputCls} value={fComp.usuario_id} onChange={e => setFComp({ ...fComp, usuario_id: e.target.value })}>
                <option value={meuId}>Eu mesmo</option>
                {usuarios.filter(u => visiveis.includes(u.id) && u.id !== meuId).map(u => (
                  <option key={u.id} value={u.id}>{u.nome || u.email}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>Título *</label>
            <input className={inputCls} placeholder="Ex: Visita técnica, Reunião com cliente..." value={fComp.titulo} onChange={e => setFComp({ ...fComp, titulo: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Descrição</label>
            <textarea className={inputCls + ' min-h-[70px] resize-y'} placeholder="Detalhes do compromisso" value={fComp.descricao} onChange={e => setFComp({ ...fComp, descricao: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Endereço (para serviços externos)</label>
            <input className={inputCls} placeholder="Rua, número, bairro, cidade" value={fComp.endereco} onChange={e => setFComp({ ...fComp, endereco: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Data *</label>
            <input className={inputCls} type="date" value={fComp.data} onChange={e => setFComp({ ...fComp, data: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={labelCls}>Início</label>
              <input className={inputCls} type="time" value={fComp.hora_inicio} onChange={e => setFComp({ ...fComp, hora_inicio: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Fim</label>
              <input className={inputCls} type="time" value={fComp.hora_fim} onChange={e => setFComp({ ...fComp, hora_fim: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Alerta</label>
            <select className={inputCls} value={fComp.alerta_minutos_antes} onChange={e => setFComp({ ...fComp, alerta_minutos_antes: e.target.value })}>
              {ALERTA_OPCOES.map(a => <option key={a.valor} value={a.valor}>{a.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-2 mt-2">
            <button className={btnPrimaryCls} onClick={salvarCompromisso}>{editando ? 'Salvar Alterações' : 'Adicionar Compromisso'}</button>
            <button className={btnSecondaryCls} onClick={() => { setTela(null); setEditando(null); setFComp(FORM_VAZIO) }}>Cancelar</button>
          </div>
        </div>
      </MobileShell>
    )
  }

  // ── Tela: Lista ──────────────────────────────────────────────
  return (
    <MobileShell title="Agenda">
      <div className="p-4 flex flex-col gap-3 pb-8">
        <input className={inputCls} placeholder="Pesquisar compromissos..." value={busca} onChange={e => setBusca(e.target.value)} />

        <div className="flex gap-1 p-1 bg-surface-container rounded-xl border border-outline-variant">
          {(['dia', 'semana', 'mes'] as const).map(v => (
            <button key={v}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors capitalize ${visualizacao === v ? 'bg-primary/20 text-primary' : 'text-on-surface-variant'}`}
              onClick={() => setVisualizacao(v)}>{v}</button>
          ))}
        </div>

        {souGestor && (
          <div>
            <label className={labelCls}>Ver agenda de</label>
            <select className={inputCls} value={alvoAgenda} onChange={e => setAlvoAgenda(e.target.value)}>
              <option value="">— Minha agenda —</option>
              <option value="equipe">— Toda a equipe —</option>
              {usuarios.filter(u => visiveis.includes(u.id) && u.id !== meuId).map(u => (
                <option key={u.id} value={u.id}>{u.nome || u.email}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button className={btnSecondaryCls + ' px-2.5 py-2 text-xs'} onClick={() => setDataRef(deslocarData(visualizacao, dataRef, -1))}>←</button>
            <button className={btnSecondaryCls + ' px-2.5 py-2 text-xs'} onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setDataRef(d) }}>Hoje</button>
            <button className={btnSecondaryCls + ' px-2.5 py-2 text-xs'} onClick={() => setDataRef(deslocarData(visualizacao, dataRef, 1))}>→</button>
          </div>
          <div className="text-xs font-semibold text-on-surface capitalize text-right">{formatarJanela(visualizacao, dataRef)}</div>
        </div>

        <button className={btnPrimaryCls} onClick={abrirNovo}>+ Novo Compromisso</button>

        {visualizacao === 'dia' && (
          grupos.length === 0 ? (
            <div className="text-center py-10 text-on-surface-variant text-body-sm">{compromissos.length === 0 ? 'Nenhum compromisso ainda' : 'Nenhum resultado'}</div>
          ) : (
            <div className="flex flex-col gap-4">
              {grupos.map(grupo => (
                <div key={grupo.data}>
                  <div className="text-sm font-bold text-primary mb-2 capitalize">{formatarGrupo(grupo.data)}</div>
                  <div className="flex flex-col gap-2">
                    {grupo.itens.map(c => (
                      <div key={c.id} className="bg-surface-container border border-outline-variant rounded-xl p-4 flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {(c.hora_inicio || c.hora_fim) && (
                              <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-full">
                                {c.hora_inicio?.slice(0, 5) || '—'}{c.hora_fim ? ' – ' + c.hora_fim.slice(0, 5) : ''}
                              </span>
                            )}
                            {c.alerta_minutos_antes != null && (
                              <span className="text-[11px] text-tertiary">🔔 {ALERTA_OPCOES.find(a => a.valor === String(c.alerta_minutos_antes))?.label || c.alerta_minutos_antes + ' min antes'}</span>
                            )}
                          </div>
                          <div className="font-bold text-on-surface text-sm">{c.titulo}</div>
                          {c.endereco && <div className="text-[11px] text-on-surface-variant mt-0.5">📍 {c.endereco}</div>}
                          {c.descricao && <div className="text-[11px] text-on-surface-variant mt-1">{c.descricao}</div>}
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button className="text-primary text-xs font-semibold" onClick={() => abrirEditar(c)}>✏️</button>
                          <button className="text-error text-xs font-semibold" onClick={() => excluirCompromisso(c.id)}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {visualizacao === 'semana' && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
            {diasDaSemana(dataRef).map(d => {
              const itensDia = compromissosDoDia(d)
              const ehHoje = dataKey(d) === hojeStr
              return (
                <div key={dataKey(d)} className={`shrink-0 w-[110px] rounded-xl border p-2 min-h-[140px] ${ehHoje ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-container'}`}>
                  <div className={`text-[10px] font-bold uppercase mb-1.5 ${ehHoje ? 'text-primary' : 'text-on-surface-variant'}`}>
                    {NOMES_DIA_SEMANA[(d.getDay() + 6) % 7]} <span className="text-on-surface">{d.getDate()}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {itensDia.map(c => (
                      <div key={c.id} className="bg-surface-container-low border border-outline-variant rounded-lg px-1.5 py-1 cursor-pointer" onClick={() => abrirEditar(c)}>
                        {c.hora_inicio && <div className="text-[9px] font-bold text-primary">{c.hora_inicio.slice(0, 5)}</div>}
                        <div className="text-[10px] text-on-surface truncate">{c.titulo}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {visualizacao === 'mes' && (
          <div>
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {NOMES_DIA_SEMANA.map(n => <div key={n} className="text-[9px] font-bold text-on-surface-variant uppercase text-center py-1">{n[0]}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {diasDoMes(dataRef).map(d => {
                const itensDia = compromissosDoDia(d)
                const foraDoMes = d.getMonth() !== dataRef.getMonth()
                const ehHoje = dataKey(d) === hojeStr
                return (
                  <div key={dataKey(d)}
                    onClick={() => { setVisualizacao('dia'); setDataRef(d) }}
                    className={`rounded-md border p-1 min-h-[40px] flex flex-col items-center cursor-pointer ${ehHoje ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-container'} ${foraDoMes ? 'opacity-40' : ''}`}>
                    <div className={`text-[10px] font-bold ${ehHoje ? 'text-primary' : 'text-on-surface'}`}>{d.getDate()}</div>
                    {itensDia.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5">
                        {itensDia.slice(0, 3).map(c => <div key={c.id} className="w-1 h-1 rounded-full bg-primary" />)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </MobileShell>
  )
}
