'use client'
import { useEffect, useState, Fragment } from 'react'

// Portal do cliente: só enxerga a obra dele. Os dados vêm de /api/cliente/obra, que no servidor
// entrega apenas o que o cliente pode ver (nada de custos, lucro, compras ou cartão).
const CHAVE_TOKEN = 'viga_cliente_token'
const CHAVE_OBRAS = 'viga_cliente_obras'
const CHAVE_NOME = 'viga_cliente_nome'

const moeda = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (v?: string | null) => v ? new Date(v.slice(0, 10) + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

const STATUS_OBRA: Record<string, string> = { captacao: 'Em captação', em_execucao: 'Em execução', pausada: 'Pausada', concluida: 'Concluída', cancelada: 'Cancelada' }
const STATUS_ETAPA: Record<string, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída', atrasada: 'Atrasada' }
const COR_ETAPA: Record<string, string> = { concluida: 'bg-primary-container', atrasada: 'bg-error', em_andamento: 'bg-tertiary', pendente: 'bg-on-surface-variant/50' }
const TXT_ETAPA: Record<string, string> = { concluida: 'text-primary-container', atrasada: 'text-error', em_andamento: 'text-tertiary', pendente: 'text-on-surface-variant' }
const STATUS_SERV: Record<string, string> = { pendente: 'Pendente', em_execucao: 'Em execução', concluido: 'Concluído', cancelado: 'Cancelado' }
const CLIMA: Record<string, string> = { ensolarado: '☀️ Ensolarado', nublado: '☁️ Nublado', chuva: '🌧️ Chuva', sem_expediente: '🚫 Sem expediente' }

const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-3 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const cardCls = 'bg-surface-container border border-outline-variant rounded-xl p-5'

const ABAS: [string, string][] = [['resumo', '📋 Resumo'], ['servicos', '🔧 Serviços'], ['cronograma', '📅 Cronograma'], ['equipe', '👷 Equipe'], ['medicoes', '📐 Medições'], ['visitas', '📷 Visitas'], ['financeiro', '💰 Financeiro']]

export default function PortalCliente() {
  const [token, setToken] = useState<string | null>(null)
  const [obras, setObras] = useState<{ id: string; codigo: string; nome: string }[]>([])
  const [obraId, setObraId] = useState<string>('')
  const [dados, setDados] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [aba, setAba] = useState('resumo')
  const [foto, setFoto] = useState<string | null>(null)

  useEffect(() => {
    try {
      const t = localStorage.getItem(CHAVE_TOKEN)
      const o = JSON.parse(localStorage.getItem(CHAVE_OBRAS) || '[]')
      if (t && Array.isArray(o) && o.length) { setToken(t); setObras(o); setObraId(o[0].id) }
    } catch {}
    setCarregando(false)
  }, [])

  useEffect(() => { if (token && obraId) carregarObra(token, obraId) }, [token, obraId])

  function sair(mensagem = '') {
    try { localStorage.removeItem(CHAVE_TOKEN); localStorage.removeItem(CHAVE_OBRAS); localStorage.removeItem(CHAVE_NOME) } catch {}
    setToken(null); setDados(null); setObras([]); setObraId(''); setSenha(''); setErro(mensagem)
  }

  async function carregarObra(t: string, id: string) {
    setCarregando(true)
    try {
      const r = await fetch('/api/cliente/obra?id=' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + t }, cache: 'no-store' })
      const j = await r.json()
      if (r.status === 401 || r.status === 403) return sair(j.error || 'Sessão expirada. Entre novamente.')
      if (!r.ok) { setErro(j.error || 'Não foi possível carregar a obra.'); setDados(null) }
      else { setDados(j); setErro('') }
    } catch { setErro('Falha de conexão. Tente novamente.') }
    setCarregando(false)
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setEntrando(true); setErro('')
    try {
      const r = await fetch('/api/cliente/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) })
      const j = await r.json()
      if (!r.ok) { setErro(j.error || 'Não foi possível entrar.'); setEntrando(false); return }
      localStorage.setItem(CHAVE_TOKEN, j.token)
      localStorage.setItem(CHAVE_OBRAS, JSON.stringify(j.obras))
      if (j.nome) localStorage.setItem(CHAVE_NOME, j.nome)
      setObras(j.obras); setObraId(j.obras[0]?.id || ''); setToken(j.token); setSenha('')
    } catch { setErro('Falha de conexão. Tente novamente.') }
    setEntrando(false)
  }

  // ── Login ──
  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <form onSubmit={entrar} className="w-full max-w-[400px] bg-surface-container border border-outline-variant rounded-2xl p-8" data-testid="form-login-cliente">
          <div className="text-center mb-6">
            <div className="text-3xl font-black text-primary tracking-tight">VIGA</div>
            <div className="text-[11px] text-on-surface-variant uppercase tracking-widest mt-1">Área do Cliente</div>
          </div>
          <p className="text-body-sm text-on-surface-variant mb-5 text-center">Acompanhe sua obra: cronograma, medições, visitas e financeiro.</p>
          <div className="mb-3.5">
            <label className="text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5">E-mail</label>
            <input className={inputCls} type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} data-testid="input-email-cliente" />
          </div>
          <div className="mb-5">
            <label className="text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5">Senha</label>
            <input className={inputCls} type="password" autoComplete="current-password" required value={senha} onChange={e => setSenha(e.target.value)} data-testid="input-senha-cliente" />
          </div>
          {erro && <div className="text-error text-sm mb-4 text-center" data-testid="erro-login-cliente">{erro}</div>}
          <button type="submit" disabled={entrando || carregando} className="w-full bg-primary text-on-primary rounded-lg py-3 text-sm font-bold hover:opacity-90 transition-all cursor-pointer disabled:opacity-60" data-testid="btn-entrar-cliente">{entrando ? 'Entrando...' : 'Entrar'}</button>
          <p className="text-[11px] text-on-surface-variant text-center mt-5">Não tem acesso? Peça seu login à equipe responsável pela sua obra.</p>
        </form>
      </div>
    )
  }

  const nomeCliente = typeof window !== 'undefined' ? localStorage.getItem(CHAVE_NOME) : null
  const obra = dados?.obra
  const hoje = new Date().toISOString().slice(0, 10)
  const cron: any[] = dados?.cronograma || []
  const contagem = (s: string) => cron.filter(c => c.status === s).length

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <header className="bg-surface-container border-b border-outline-variant">
        <div className="max-w-[1000px] mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {dados?.empresa?.logo_url ? <img src={dados.empresa.logo_url} alt="" className="h-9 object-contain" /> : <div className="text-xl font-black text-primary">VIGA</div>}
            <div>
              <div className="text-sm font-bold">{dados?.empresa?.nome_empresa || 'Área do Cliente'}</div>
              <div className="text-[11px] text-on-surface-variant">{nomeCliente ? `Olá, ${nomeCliente}` : 'Área do Cliente'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {obras.length > 1 && (
              <select className="bg-surface-container-low border border-outline-variant rounded-lg text-sm px-3 py-2" value={obraId} onChange={e => setObraId(e.target.value)}>
                {obras.map(o => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}
              </select>
            )}
            <button className="text-sm text-on-surface-variant border border-outline-variant rounded-lg px-3 py-2 hover:bg-surface-variant transition-all cursor-pointer" onClick={() => sair()} data-testid="btn-sair-cliente">Sair</button>
          </div>
        </div>
      </header>

      <main className="max-w-[1000px] mx-auto px-4 py-6">
        {erro && <div className="text-error text-sm mb-4">{erro}</div>}
        {!obra ? (
          <div className="text-center py-16 text-on-surface-variant">{carregando ? 'Carregando sua obra...' : 'Nenhum dado disponível.'}</div>
        ) : (
          <>
            <div className="mb-5">
              <div className="text-[11px] text-on-surface-variant uppercase tracking-wide">{obra.codigo}</div>
              <h1 className="text-2xl font-bold" data-testid="titulo-obra-cliente">{obra.nome}</h1>
              <div className="text-sm text-on-surface-variant">{obra.endereco || ''}</div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
              {ABAS.map(([id, nome]) => (
                <button key={id} onClick={() => setAba(id)} data-testid={`aba-cliente-${id}`}
                  className={`px-4 py-2 rounded-lg border text-sm font-semibold whitespace-nowrap cursor-pointer transition-all ${aba === id ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant bg-surface-container text-on-surface-variant hover:bg-surface-variant/50'}`}>{nome}</button>
              ))}
            </div>

            {aba === 'resumo' && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className={cardCls}><div className="text-[10px] text-on-surface-variant uppercase">Situação</div><div className="text-sm font-bold mt-1">{STATUS_OBRA[obra.status] || obra.status}</div></div>
                  <div className={cardCls}><div className="text-[10px] text-on-surface-variant uppercase">Início</div><div className="text-sm font-bold mt-1">{dataBR(obra.data_inicio)}</div></div>
                  <div className={cardCls}><div className="text-[10px] text-on-surface-variant uppercase">Previsão de entrega</div><div className="text-sm font-bold mt-1">{dataBR(obra.data_previsao)}</div></div>
                  <div className={cardCls}><div className="text-[10px] text-on-surface-variant uppercase">Responsável</div><div className="text-sm font-bold mt-1">{obra.responsavel || '—'}</div></div>
                </div>
                <div className={cardCls}>
                  <div className="flex justify-between items-center mb-2"><div className="text-[11px] font-bold text-on-surface-variant uppercase">Avanço físico (medido)</div><div className="text-sm font-bold text-primary">{Number(dados.progresso_fisico || 0).toFixed(1)}%</div></div>
                  <div className="h-2.5 bg-surface-container-high rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(dados.progresso_fisico || 0, 100)}%` }} /></div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className={cardCls}><div className="text-[10px] text-on-surface-variant uppercase">Etapas concluídas</div><div className="text-xl font-bold text-primary-container">{contagem('concluida')}</div></div>
                  <div className={cardCls}><div className="text-[10px] text-on-surface-variant uppercase">Em andamento</div><div className="text-xl font-bold text-tertiary">{contagem('em_andamento')}</div></div>
                  <div className={cardCls}><div className="text-[10px] text-on-surface-variant uppercase">Atrasadas</div><div className="text-xl font-bold text-error">{contagem('atrasada')}</div></div>
                  <div className={cardCls}><div className="text-[10px] text-on-surface-variant uppercase">Pendentes</div><div className="text-xl font-bold text-on-surface-variant">{contagem('pendente')}</div></div>
                </div>
                {dados.financeiro.macro ? (
                  <div className={cardCls} data-testid="macro-obra">
                    <div className="text-[11px] font-bold text-on-surface-variant uppercase mb-3">💼 Visão geral da obra (gerenciamento)</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                      <div><div className="text-[10px] text-on-surface-variant uppercase">Valor total da obra</div><div className="text-lg font-bold" data-testid="macro-total">{moeda(dados.financeiro.macro.total_obra)}</div></div>
                      <div><div className="text-[10px] text-on-surface-variant uppercase">Já pago (total)</div><div className="text-lg font-bold text-primary-container" data-testid="macro-pago">{moeda(dados.financeiro.macro.total_pago)}</div></div>
                      <div><div className="text-[10px] text-on-surface-variant uppercase">Falta pagar (total)</div><div className="text-lg font-bold text-tertiary">{moeda(dados.financeiro.macro.total_a_pagar)}</div></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3">
                        <div className="font-semibold mb-1">Contratos com terceiros</div>
                        <div className="text-on-surface-variant text-[12px]">Contratado {moeda(dados.financeiro.macro.terceiros_contratado)} · pago <b className="text-primary-container">{moeda(dados.financeiro.macro.terceiros_pago)}</b> · falta {moeda(dados.financeiro.macro.terceiros_a_pagar)}</div>
                      </div>
                      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3">
                        <div className="font-semibold mb-1">Gerenciamento ({dados.empresa?.nome_empresa || 'Inverso'})</div>
                        <div className="text-on-surface-variant text-[12px]">Contratado {moeda(dados.financeiro.macro.gerenciamento_contrato)} · pago <b className="text-primary-container">{moeda(dados.financeiro.macro.gerenciamento_pago)}</b> · falta {moeda(dados.financeiro.macro.gerenciamento_a_pagar)}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className={cardCls}><div className="text-[10px] text-on-surface-variant uppercase">Valor contratado</div><div className="text-lg font-bold">{moeda(dados.financeiro.contrato)}</div></div>
                    <div className={cardCls}><div className="text-[10px] text-on-surface-variant uppercase">Já pago</div><div className="text-lg font-bold text-primary-container">{moeda(dados.financeiro.pago)}</div></div>
                    <div className={cardCls}><div className="text-[10px] text-on-surface-variant uppercase">Saldo a pagar</div><div className="text-lg font-bold text-tertiary">{moeda(dados.financeiro.a_pagar)}</div></div>
                  </div>
                )}
              </div>
            )}

            {aba === 'servicos' && (
              <div className={cardCls}>
                <div className="text-sm font-bold mb-3">Serviços contratados</div>
                {dados.servicos.length === 0 ? <div className="text-on-surface-variant text-sm py-6 text-center">Nenhum serviço cadastrado ainda.</div> : (() => {
                  const ger = !!obra.gerenciamento
                  return (
                  <div className="overflow-x-auto"><table className="w-full text-sm border-collapse">
                    <thead><tr className="border-b border-outline-variant">{['Serviço', 'Categoria', ...(ger ? ['Executor', 'Valor contratado'] : []), 'Qtd.', 'Situação', 'Executado'].map(h => <th key={h} className="text-left px-3 py-2 text-[11px] text-on-surface-variant uppercase bg-surface-container-high whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody>{dados.servicos.map((s: any) => (
                      <tr key={s.id} className="border-b border-outline-variant">
                        <td className="px-3 py-2.5 font-semibold">{s.nome}</td>
                        <td className="px-3 py-2.5 text-on-surface-variant text-xs">{s.categoria || '—'}</td>
                        {ger && <td className="px-3 py-2.5 text-xs whitespace-nowrap">{s.fornecedor || '—'}</td>}
                        {ger && <td className="px-3 py-2.5 text-xs whitespace-nowrap">{moeda(s.valor_contratado)}</td>}
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap">{s.quantidade != null ? `${Number(s.quantidade).toLocaleString('pt-BR')} ${s.unidade || ''}` : '—'}</td>
                        <td className="px-3 py-2.5 text-xs">{STATUS_SERV[s.status] || s.status || '—'}</td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap">{s.executado_pct != null ? `${s.executado_pct.toFixed(0)}%` : '—'}</td>
                      </tr>))}
                    </tbody></table></div>
                  )
                })()}
              </div>
            )}

            {aba === 'cronograma' && (() => {
              const datas = cron.flatMap(c => [c.inicio, c.fim]).filter(Boolean) as string[]
              const iniStr = obra.data_inicio || (datas.length ? [...datas].sort()[0] : null)
              const fimStr = obra.data_previsao || (datas.length ? [...datas].sort().slice(-1)[0] : null)
              const ini = iniStr ? new Date(iniStr + 'T00:00:00') : null, fim = fimStr ? new Date(fimStr + 'T00:00:00') : null
              const total = ini && fim ? Math.max(fim.getTime() - ini.getTime(), 86400000) : 1
              const barra = (a?: string | null, b?: string | null) => {
                if (!ini || !fim) return { x: 0, w: 1 }
                const i = a ? new Date(a + 'T00:00:00') : ini, f = b ? new Date(b + 'T00:00:00') : i
                const x = Math.max(0, Math.min(100, ((i.getTime() - ini.getTime()) / total) * 100))
                const fx = Math.max(0, Math.min(100, ((f.getTime() - ini.getTime()) / total) * 100))
                return { x, w: Math.max(fx - x, 0.8) }
              }
              const hojePct = ini && fim ? Math.max(0, Math.min(100, ((Date.now() - ini.getTime()) / total) * 100)) : 0
              const hojeDentro = !!(ini && fim && Date.now() >= ini.getTime() && Date.now() <= fim.getTime())
              let catAnt: string | null = null
              return (
                <div className="flex flex-col gap-4">
                  {cron.length === 0 ? <div className={cardCls + ' text-center text-on-surface-variant text-sm py-8'}>O cronograma desta obra ainda está sendo montado.</div> : (
                    <>
                      {ini && fim && (
                        <div className={cardCls}>
                          <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                            <div className="text-[11px] font-bold text-on-surface-variant uppercase">📊 Gantt</div>
                            <div className="flex gap-3 text-[10px] text-on-surface-variant">
                              {Object.entries(STATUS_ETAPA).map(([k, n]) => <span key={k}><span className={`inline-block w-2 h-2 rounded-full mr-1 ${COR_ETAPA[k]}`} />{n}</span>)}
                            </div>
                          </div>
                          <div className="flex justify-between text-[10px] text-on-surface-variant mb-2"><span>{dataBR(iniStr)}</span><span>{dataBR(fimStr)}</span></div>
                          <div className="flex flex-col gap-2">
                            {cron.map(c => { const { x, w } = barra(c.inicio, c.fim); return (
                              <div key={c.id} className="flex items-center gap-3">
                                <div className="w-28 md:w-40 shrink-0 text-[11px] truncate" title={c.nome}>{c.nome}</div>
                                <div className="relative flex-1 h-5 bg-surface-container-low rounded overflow-hidden">
                                  <div className={`absolute top-0 h-full rounded ${COR_ETAPA[c.status] || COR_ETAPA.pendente}`} style={{ left: x + '%', width: w + '%' }} title={`${dataBR(c.inicio)} — ${dataBR(c.fim)}`} />
                                  {hojeDentro && <div className="absolute top-0 h-full w-px bg-primary" style={{ left: hojePct + '%' }} />}
                                </div>
                              </div>) })}
                          </div>
                        </div>
                      )}
                      <div className={cardCls + ' overflow-x-auto'}>
                        <table className="w-full text-sm border-collapse">
                          <thead><tr className="border-b border-outline-variant">{['Etapa', 'Início', 'Fim', 'Situação'].map(h => <th key={h} className="text-left px-3 py-2 text-[11px] text-on-surface-variant uppercase bg-surface-container-high whitespace-nowrap">{h}</th>)}</tr></thead>
                          <tbody>{cron.map(c => {
                            const mostraCat = !!c.categoria && c.categoria !== catAnt; catAnt = c.categoria || catAnt
                            return (
                              <Fragment key={c.id}>
                                {mostraCat && <tr className="bg-surface-container-high"><td colSpan={4} className="px-3 py-1.5 text-[10px] font-bold text-primary uppercase tracking-wide">{c.categoria}</td></tr>}
                                <tr className="border-b border-outline-variant" data-testid="linha-cronograma-cliente">
                                  <td className="px-3 py-2.5 font-semibold">{c.nome}</td>
                                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">{dataBR(c.inicio)}</td>
                                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">{dataBR(c.fim)}</td>
                                  <td className={`px-3 py-2.5 text-xs font-bold whitespace-nowrap ${TXT_ETAPA[c.status] || ''}`}>{STATUS_ETAPA[c.status] || c.status}</td>
                                </tr>
                              </Fragment>)
                          })}</tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )
            })()}

            {aba === 'equipe' && (
              <div className="flex flex-col gap-4">
                <div className={cardCls}>
                  <div className="text-sm font-bold mb-3">Equipe da {dados.empresa?.nome_empresa || 'empresa'}</div>
                  {obra.responsavel && <div className="text-sm mb-2">Responsável pela obra: <b>{obra.responsavel}</b></div>}
                  {dados.equipe.interna.length === 0 ? <div className="text-on-surface-variant text-sm">Nenhum profissional atribuído ainda.</div> : (
                    <div className="flex flex-col gap-2">{dados.equipe.interna.map((u: any, i: number) => (
                      <div key={i} className="flex justify-between flex-wrap gap-2 text-sm border-b border-outline-variant pb-2"><span className="font-semibold">{u.nome}{u.setor ? <span className="text-on-surface-variant font-normal"> · {u.setor}</span> : ''}</span><span className="text-on-surface-variant">{u.email || ''}</span></div>))}</div>
                  )}
                  {dados.empresa?.telefone && <div className="text-sm mt-3 text-on-surface-variant">Contato da empresa: {dados.empresa.telefone}</div>}
                </div>
                <div className={cardCls}>
                  <div className="text-sm font-bold mb-3">Equipe de trabalho em obra</div>
                  {dados.equipe.funcionarios.length === 0 ? <div className="text-on-surface-variant text-sm">Nenhum profissional cadastrado ainda.</div> : (
                    <div className="flex flex-col gap-2">{dados.equipe.funcionarios.map((f: any, i: number) => (
                      <div key={i} className="flex justify-between flex-wrap gap-2 text-sm border-b border-outline-variant pb-2"><span className="font-semibold">{f.nome}{f.empresa ? <span className="text-on-surface-variant font-normal"> · {f.empresa}</span> : ''}</span><span className="text-on-surface-variant">{f.telefone || '—'}</span></div>))}</div>
                  )}
                </div>
              </div>
            )}

            {aba === 'medicoes' && (
              <div className="flex flex-col gap-4">
                {dados.medicoes.length === 0 ? <div className={cardCls + ' text-center text-on-surface-variant text-sm py-8'}>Nenhuma medição realizada ainda.</div> : dados.medicoes.map((g: any) => (
                  <div key={g.chave} className={cardCls} data-testid="grupo-medicao-cliente">
                    <div className="flex justify-between items-start flex-wrap gap-2 mb-1">
                      <div className="text-sm font-bold">{g.tipo === 'fornecedor' ? `🧱 ${g.rotulo}` : `📐 Medições — ${g.rotulo}`}</div>
                      <div className="text-[11px] text-on-surface-variant">{g.pct_executado.toFixed(0)}% executado</div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 my-3">
                      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-2.5"><div className="text-[10px] text-on-surface-variant uppercase">{g.tipo === 'cliente' ? 'Contrato' : 'Contratado'}</div><div className="text-sm font-bold">{moeda(g.previsto)}</div></div>
                      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-2.5"><div className="text-[10px] text-on-surface-variant uppercase">Medido até agora</div><div className="text-sm font-bold">{moeda(g.medido)}</div></div>
                      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-2.5"><div className="text-[10px] text-on-surface-variant uppercase">Pago</div><div className="text-sm font-bold text-primary-container">{moeda(g.pago)}</div></div>
                      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-2.5"><div className="text-[10px] text-on-surface-variant uppercase">Falta pagar</div><div className="text-sm font-bold text-tertiary">{moeda(g.a_pagar)}</div></div>
                    </div>
                    <div className="overflow-x-auto"><table className="w-full text-sm border-collapse">
                      <thead><tr className="border-b border-outline-variant">{['Medição', 'Data', 'Valor medido', 'Retenção', 'Abatimentos', 'Valor a pagar', 'Pagamento'].map(h => <th key={h} className="text-left px-3 py-2 text-[11px] text-on-surface-variant uppercase bg-surface-container-high whitespace-nowrap">{h}</th>)}</tr></thead>
                      <tbody>{g.itens.map((m: any) => (
                        <tr key={m.id} className="border-b border-outline-variant" data-testid="linha-medicao-cliente">
                          <td className="px-3 py-2.5 font-semibold">{m.adiantamento ? '💰 Adiantamento' : m.rotulo} <span className="text-on-surface-variant font-normal text-xs">· {m.numero}</span>{m.observacao && <div className="text-[11px] text-on-surface-variant font-normal">{m.observacao}</div>}</td>
                          <td className="px-3 py-2.5 text-xs whitespace-nowrap">{dataBR(m.data)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">{m.adiantamento ? '—' : moeda(m.bruto)}</td>
                          <td className="px-3 py-2.5 text-on-surface-variant whitespace-nowrap">{m.adiantamento ? '—' : moeda(m.retencao)}</td>
                          <td className="px-3 py-2.5 text-on-surface-variant whitespace-nowrap">{m.adiantamento ? '—' : moeda(m.desconto)}</td>
                          <td className="px-3 py-2.5 font-bold whitespace-nowrap">{moeda(m.liquido)}</td>
                          <td className="px-3 py-2.5 text-xs whitespace-nowrap">{m.pagamento === 'pago' ? <span className="text-primary-container font-bold">✅ Pago {m.data_pagamento ? dataBR(m.data_pagamento) : ''}</span> : m.pagamento === 'programado' ? <span className="text-tertiary">📅 Programado {m.data_pagamento ? dataBR(m.data_pagamento) : ''}</span> : <span className="text-on-surface-variant">A programar</span>}</td>
                        </tr>))}</tbody></table></div>
                  </div>))}
              </div>
            )}

            {aba === 'visitas' && (
              <div className="flex flex-col gap-3">
                {dados.visitas.length === 0 ? <div className={cardCls + ' text-center text-on-surface-variant text-sm py-8'}>Nenhum relatório de visita registrado ainda.</div> : dados.visitas.map((v: any) => (
                  <div key={v.id} className={cardCls} data-testid="visita-cliente">
                    <div className="flex justify-between flex-wrap gap-2 mb-2"><div className="text-sm font-bold">Visita de {dataBR(v.data)}</div><div className="text-xs text-on-surface-variant">{CLIMA[v.clima] || v.clima || ''}</div></div>
                    {v.descricao && <div className="text-sm whitespace-pre-line mb-2">{v.descricao}</div>}
                    {v.pendencias && <div className="text-sm text-tertiary whitespace-pre-line mb-2"><b>Pendências:</b> {v.pendencias}</div>}
                    {Array.isArray(v.equipe_presente) && v.equipe_presente.length > 0 && <div className="text-xs text-on-surface-variant mb-2">Equipe presente: {v.equipe_presente.join(', ')}</div>}
                    {Array.isArray(v.fotos) && v.fotos.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">{v.fotos.map((f: any, i: number) => (
                        <button key={i} className="text-left cursor-pointer" onClick={() => setFoto(f.url)}>
                          <img src={f.url} alt={f.descricao || ''} className="w-full h-28 object-cover rounded-lg border border-outline-variant" />
                          {f.descricao && <div className="text-[10px] text-on-surface-variant mt-1 truncate">{f.descricao}</div>}
                        </button>))}</div>
                    )}
                  </div>))}
              </div>
            )}

            {aba === 'financeiro' && (() => {
              const fin = dados.financeiro
              const tabelaPagamentos = (lista: any[], vazio: string) => lista.length === 0 ? <div className="text-on-surface-variant text-sm py-4 text-center">{vazio}</div> : (
                <div className="overflow-x-auto"><table className="w-full text-sm border-collapse">
                  <thead><tr className="border-b border-outline-variant">{['Data', 'Descrição', 'Valor', 'Situação'].map(h => <th key={h} className="text-left px-3 py-2 text-[11px] text-on-surface-variant uppercase bg-surface-container-high">{h}</th>)}</tr></thead>
                  <tbody>{lista.map((p: any) => (
                    <tr key={p.id} className="border-b border-outline-variant"><td className="px-3 py-2.5 text-xs whitespace-nowrap">{p.data ? dataBR(p.data) : '—'}</td><td className="px-3 py-2.5">{p.descricao || '—'}</td><td className="px-3 py-2.5 font-semibold whitespace-nowrap">{moeda(p.valor)}</td><td className={`px-3 py-2.5 text-xs font-bold ${p.status === 'pago' ? 'text-primary-container' : 'text-tertiary'}`}>{p.status === 'pago' ? '✅ Pago' : p.status === 'programado' ? '📅 Programado' : p.status === 'a_programar' ? 'A programar' : '⏳ Pendente'}</td></tr>))}</tbody></table></div>
              )
              return (
              <div className="flex flex-col gap-4">
                {fin.macro && (
                  <div className={cardCls} data-testid="fin-macro">
                    <div className="text-[11px] font-bold text-on-surface-variant uppercase mb-3">💼 Visão geral da obra</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div><div className="text-[10px] text-on-surface-variant uppercase">Valor total da obra</div><div className="text-xl font-bold" data-testid="fin-macro-total">{moeda(fin.macro.total_obra)}</div></div>
                      <div><div className="text-[10px] text-on-surface-variant uppercase">Já pago (total)</div><div className="text-xl font-bold text-primary-container" data-testid="fin-macro-pago">{moeda(fin.macro.total_pago)}</div></div>
                      <div><div className="text-[10px] text-on-surface-variant uppercase">Falta pagar (total)</div><div className="text-xl font-bold text-tertiary">{moeda(fin.macro.total_a_pagar)}</div></div>
                    </div>
                  </div>
                )}
                <div className={cardCls}>
                  <div className="text-sm font-bold mb-3">{fin.gerenciamento ? `🤝 Gerenciamento — ${dados.empresa?.nome_empresa || 'Inverso'}` : 'Seu contrato'}</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3"><div className="text-[10px] text-on-surface-variant uppercase">Valor contratado</div><div className="text-xl font-bold" data-testid="fin-contrato">{moeda(fin.contrato)}</div></div>
                    <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3"><div className="text-[10px] text-on-surface-variant uppercase">Já pago</div><div className="text-xl font-bold text-primary-container" data-testid="fin-pago">{moeda(fin.pago)}</div></div>
                    <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3"><div className="text-[10px] text-on-surface-variant uppercase">Saldo a pagar</div><div className="text-xl font-bold text-tertiary" data-testid="fin-saldo">{moeda(fin.a_pagar)}</div></div>
                  </div>
                  <div className="text-[11px] font-bold text-on-surface-variant uppercase mb-1">{fin.gerenciamento ? `Pagamentos feitos à ${dados.empresa?.nome_empresa || 'Inverso'}` : 'Seus pagamentos'}</div>
                  {tabelaPagamentos(fin.pagamentos, 'Nenhum pagamento registrado ainda.')}
                </div>
                {fin.terceiros.map((t: any) => (
                  <div key={t.fornecedor} className={cardCls} data-testid="fin-terceiro">
                    <div className="text-sm font-bold mb-3">🧱 Pagamentos a {t.fornecedor}</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3"><div className="text-[10px] text-on-surface-variant uppercase">Contratado</div><div className="text-base font-bold">{moeda(t.previsto)}</div></div>
                      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3"><div className="text-[10px] text-on-surface-variant uppercase">Medido até agora</div><div className="text-base font-bold">{moeda(t.medido)}</div></div>
                      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3"><div className="text-[10px] text-on-surface-variant uppercase">Já pago</div><div className="text-base font-bold text-primary-container" data-testid="fin-terceiro-pago">{moeda(t.pago)}</div></div>
                      <div className="bg-surface-container-low border border-outline-variant rounded-lg p-3"><div className="text-[10px] text-on-surface-variant uppercase">Falta pagar</div><div className="text-base font-bold text-tertiary">{moeda(t.a_pagar)}</div></div>
                    </div>
                    {tabelaPagamentos(t.pagamentos, 'Nenhum pagamento registrado ainda.')}
                  </div>
                ))}
              </div>
              )
            })()}
          </>
        )}
      </main>

      {foto && (
        <div className="fixed inset-0 bg-black/90 z-[1000] flex items-center justify-center p-4 cursor-pointer" onClick={() => setFoto(null)}>
          <img src={foto} alt="" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  )
}
