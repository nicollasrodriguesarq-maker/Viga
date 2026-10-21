'use client'
import { useEffect, useMemo, useState } from 'react'
import { obterTokenValido } from '../lib/authFetch'
import { lerCsv } from '../lib/csv'
import {
  FONTES, MOTIVOS_DESCARTE, SEGMENTOS, STATUS_NOME, corScore, dataBR, hojeBR, linkWhatsApp, montarMensagem, normalizarTelefone, somarDiasISO, soDigitos,
  type StatusProspecto,
} from '../lib/prospeccao'

const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON }

async function erroDe(r: Response) { try { const d = await r.json(); return d?.message || d?.error || ('erro ' + r.status) } catch { return 'erro ' + r.status } }
async function ler(tabela: string, q = ''): Promise<any[]> {
  const r = await fetch(`${BASE}/${tabela}${q}`, { headers: H })
  const d = await r.json()
  if (!Array.isArray(d)) throw new Error(d?.message || 'Falha ao carregar ' + tabela)
  return d
}
async function gravar(metodo: 'POST' | 'PATCH' | 'DELETE', caminho: string, corpo?: object): Promise<any> {
  const r = await fetch(`${BASE}/${caminho}`, { method: metodo, headers: metodo === 'DELETE' ? H : { ...H, Prefer: 'return=representation' }, body: corpo ? JSON.stringify(corpo) : undefined })
  if (!r.ok) throw new Error(await erroDe(r))
  if (metodo === 'DELETE') return null
  const d = await r.json().catch(() => null)
  return Array.isArray(d) ? d[0] : d
}
async function api(caminho: string, metodo: 'GET' | 'POST' = 'POST', corpo?: object) {
  const token = (await obterTokenValido()) || ''
  const r = await fetch(caminho, { method: metodo, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: corpo ? JSON.stringify(corpo) : undefined })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d?.error || 'erro ' + r.status)
  return d
}

const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const labelCls = 'text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5'
const btnPrimaryCls = 'bg-primary text-on-primary rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer disabled:opacity-50'
const btnSecondaryCls = 'bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg px-4 py-2.5 text-sm hover:bg-surface-variant transition-all cursor-pointer'
const btnSmCls = 'bg-primary/10 border border-primary/30 text-primary rounded-md px-2.5 py-1 text-xs hover:bg-primary/20 transition-all cursor-pointer'
const btnDangerSmCls = 'bg-error/10 border border-error/30 text-error rounded-md px-2.5 py-1 text-xs hover:bg-error/20 transition-all cursor-pointer'
const cardCls = 'bg-surface-container border border-outline-variant rounded-xl p-5'
const moeda = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function gerarCodigoLead(lista: any[]) {
  const p = 'LEAD-' + new Date().getFullYear() + '-'
  const maior = lista.reduce((m, l) => { if (!l.codigo?.startsWith(p)) return m; const n = parseInt(l.codigo.slice(p.length), 10); return Number.isFinite(n) && n > m ? n : m }, 0)
  return p + String(maior + 1).padStart(3, '0')
}

const CAMPOS_IMPORTACAO: [string, string, string[]][] = [
  ['nome', 'Nome / empresa *', ['nome', 'nome fantasia', 'razao social', 'razão social', 'empresa', 'name', 'cliente', 'fantasia']],
  ['telefone', 'Telefone', ['telefone', 'fone', 'celular', 'phone', 'tel', 'contato']],
  ['whatsapp', 'WhatsApp', ['whatsapp', 'zap', 'wpp']],
  ['email', 'E-mail', ['email', 'e-mail', 'correio eletronico', 'correio eletrônico']],
  ['documento', 'CNPJ/CPF', ['cnpj', 'documento', 'cpf', 'cnpj/cpf']],
  ['site', 'Site', ['site', 'website', 'url']],
  ['instagram', 'Instagram', ['instagram', 'insta']],
  ['endereco', 'Endereço', ['endereco', 'endereço', 'logradouro', 'address']],
  ['bairro', 'Bairro', ['bairro', 'neighborhood']],
  ['cidade', 'Cidade', ['cidade', 'municipio', 'município', 'city']],
  ['gatilho', 'Sinal de compra / observação', ['gatilho', 'sinal', 'observacao', 'observação', 'obs', 'cnae']],
  ['gatilho_data', 'Data do sinal (ex.: abertura)', ['gatilho_data', 'data abertura', 'data de abertura', 'data inicio atividade', 'abertura', 'data']],
  ['segmento', 'Segmento', ['segmento', 'categoria']],
]

export default function Prospeccao({ usuarios, meuId, onLeadCriado, busca }: { usuarios: any[]; meuId: string; onLeadCriado: () => void; busca: string }) {
  const hoje = hojeBR()
  const [prospectos, setProspectos] = useState<any[]>([])
  const [cfg, setCfg] = useState<any>(null)
  const [status, setStatus] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [resultadoAtualizacao, setResultadoAtualizacao] = useState<any>(null)
  const [erro, setErro] = useState('')
  const [sub, setSub] = useState<'fila' | 'todos' | 'desempenho' | 'fontes'>('fila')
  const [filtroSeg, setFiltroSeg] = useState('todos')
  const [filtroFonte, setFiltroFonte] = useState('todos')
  const [filtroStatus, setFiltroStatus] = useState('ativos')
  const [modal, setModal] = useState<null | { tipo: 'resposta' | 'descartar' | 'novo' | 'importar' | 'detalhe'; p?: any }>(null)
  const [mensagens, setMensagens] = useState<Record<string, string>>({})
  const [abrindoMsg, setAbrindoMsg] = useState<Record<string, boolean>>({})
  const [aguardandoEnvio, setAguardandoEnvio] = useState<Record<string, boolean>>({})
  const [ocupado, setOcupado] = useState(false)
  const [atividades, setAtividades] = useState<any[]>([])

  // formulários
  const [fNovo, setFNovo] = useState({ nome: '', segmento: 'reforma_pf', telefone: '', email: '', site: '', instagram: '', bairro: '', gatilho: '', fonte: 'manual', naFila: true })
  const [motivo, setMotivo] = useState(MOTIVOS_DESCARTE[0])
  const [cfgEdicao, setCfgEdicao] = useState<any>(null)
  // importação
  const [csv, setCsv] = useState<{ cab: string[]; linhas: string[][] } | null>(null)
  const [mapa, setMapa] = useState<Record<string, number>>({})
  const [segPadrao, setSegPadrao] = useState('empresa')
  const [fontePadrao, setFontePadrao] = useState('importacao')
  const [resImport, setResImport] = useState<any>(null)

  async function carregar() {
    try {
      const [p, c] = await Promise.all([ler('crm_prospectos', '?order=score.desc,created_at.desc&limit=3000'), ler('crm_prospeccao_config', '?id=eq.1')])
      setProspectos(p); setCfg(c[0] || null); setCfgEdicao(c[0] ? { ...c[0], cadencia_txt: (c[0].cadencia_dias || []).join(', '), bairros_txt: (c[0].bairros || []).join(', '), inc_txt: (c[0].palavras_incluir || []).join(', '), exc_txt: (c[0].palavras_excluir || []).join(', ') } : null)
      setErro('')
    } catch (e: any) { setErro(e.message || 'Falha ao carregar a Prospecção. Rode o SQL da Prospecção no Supabase.') }
    setCarregando(false)
  }

  async function atualizarFontes(forcar: boolean) {
    setAtualizando(true)
    try {
      const r = await api('/api/prospeccao/atualizar', 'POST', { forcar })
      setResultadoAtualizacao(r)
    } catch (e: any) { setResultadoAtualizacao({ erro: e.message }) }
    await carregar()
    try { setStatus(await api('/api/prospeccao/status', 'GET')) } catch { /* opcional */ }
    setAtualizando(false)
  }

  useEffect(() => {
    (async () => {
      await carregar()
      try { setStatus(await api('/api/prospeccao/status', 'GET')) } catch { /* sem permissão ou sem chave de serviço */ }
      // garante a fila de hoje e, se as fontes estão velhas (> 20h), atualiza em segundo plano
      try {
        await api('/api/prospeccao/fila', 'POST')
        await carregar()
      } catch { /* a tela segue funcionando com o que já existe */ }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!cfg || carregando) return
    const ultima = cfg.pncp_ultima_execucao ? (Date.now() - new Date(cfg.pncp_ultima_execucao).getTime()) / 3600000 : 999
    if (ultima > 20) atualizarFontes(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando])

  const nomeUsuario = (id?: string) => { const u = usuarios.find(x => x.id === id); return u ? (u.nome || (u.email || '').split('@')[0]) : '' }

  // ── Fila de hoje ───────────────────────────────────────────────
  const daFila = prospectos.filter(p => p.fila_data === hoje)
  const pendentes = daFila.filter(p => p.status === 'novo' || (p.status === 'abordado' && (!p.proximo_contato || p.proximo_contato <= hoje)))
  const feitos = daFila.filter(p => !pendentes.includes(p))
  const meta = cfg?.meta_diaria || 5

  const termo = busca.trim().toLowerCase()
  const casaBusca = (p: any) => !termo || [p.nome, p.telefone, p.whatsapp, p.email, p.bairro, p.gatilho, p.documento].some(v => String(v || '').toLowerCase().includes(termo))

  // ── Ações ──────────────────────────────────────────────────────
  async function atividade(p: any, tipo: string, descricao: string) {
    try { await gravar('POST', 'crm_prospeccao_atividades', { prospecto_id: p.id, tipo, descricao, usuario_id: meuId || null }) } catch { /* histórico é secundário */ }
  }
  async function atualizarProspecto(p: any, dados: object) {
    await gravar('PATCH', `crm_prospectos?id=eq.${p.id}`, { ...dados, updated_at: new Date().toISOString() })
  }
  async function executar(fn: () => Promise<void>) {
    if (ocupado) return
    setOcupado(true)
    try { await fn(); await carregar() } catch (e: any) { alert('Não foi possível concluir: ' + (e?.message || 'tente novamente')) }
    setOcupado(false)
  }

  // Marca a abordagem e agenda o próximo contato conforme a cadência (ex.: 3, 7 e 14 dias); esgotada, o contato fica "frio" e volta depois.
  function confirmarAbordagem(p: any, canal: string) {
    executar(async () => {
      const cad: number[] = cfg?.cadencia_dias?.length ? cfg.cadencia_dias : [3, 7, 14]
      const t = (p.tentativas || 0) + 1
      let dados: any
      if (p.tipo_abordagem === 'edital') {
        // edital: lembrete 1 dia antes de fechar o prazo
        const lembrete = p.prazo && p.prazo > hoje ? somarDiasISO(p.prazo, -1) : somarDiasISO(hoje, 1)
        dados = { status: 'abordado', tentativas: t, ultimo_contato: new Date().toISOString(), proximo_contato: lembrete < hoje ? hoje : lembrete, responsavel_id: p.responsavel_id || meuId || null }
      } else if (t > cad.length) {
        dados = { status: 'frio', tentativas: t, ultimo_contato: new Date().toISOString(), proximo_contato: somarDiasISO(hoje, cfg?.dias_reativacao || 90), responsavel_id: p.responsavel_id || meuId || null }
      } else {
        dados = { status: 'abordado', tentativas: t, ultimo_contato: new Date().toISOString(), proximo_contato: somarDiasISO(hoje, cad[t - 1]), responsavel_id: p.responsavel_id || meuId || null }
      }
      await atualizarProspecto(p, dados)
      await atividade(p, 'abordagem', `${canal} (tentativa ${t})${dados.status === 'frio' ? ' — sem retorno, volta à lista em ' + (cfg?.dias_reativacao || 90) + ' dias' : ''}`)
      setAguardandoEnvio(a => ({ ...a, [p.id]: false }))
    })
  }

  function semRetorno(p: any) {
    // o contato já foi abordado e hoje é o dia de insistir de novo, ou desistir
    confirmarAbordagem(p, 'Novo contato sem resposta anterior')
  }

  function registrarResposta(p: any, resultado: 'interesse' | 'sem_interesse' | 'nao_contatar') {
    executar(async () => {
      if (resultado === 'interesse') {
        const leads = await ler('crm_leads', '?select=codigo')
        const codigo = gerarCodigoLead(leads)
        const obs = [`Origem: prospecção ativa (${FONTES[p.fonte]?.nome || p.fonte}).`, p.gatilho ? `Sinal: ${p.gatilho}` : '', p.valor_estimado ? `Valor estimado do edital: ${moeda(p.valor_estimado)}` : '', p.prazo ? `Prazo da proposta: ${dataBR(p.prazo)}` : '', p.link_origem ? `Link: ${p.link_origem}` : ''].filter(Boolean).join('\n')
        const lead = await gravar('POST', 'crm_leads', {
          codigo, nome: p.nome, telefone: p.whatsapp || p.telefone || null, email: p.email || null, canal: 'Prospecção ativa', tipo: 'novo',
          etapa: 'qualificacao', responsavel_id: p.responsavel_id || meuId || null, observacao: obs, updated_at: new Date().toISOString(),
        })
        await atualizarProspecto(p, { status: 'lead', lead_id: lead?.id || null, proximo_contato: null })
        await atividade(p, 'resposta', `Respondeu com interesse — virou o lead ${codigo}`)
        onLeadCriado()
      } else if (resultado === 'sem_interesse') {
        await atualizarProspecto(p, { status: 'descartado', motivo_descarte: motivo, proximo_contato: null })
        await atividade(p, 'resposta', `Respondeu sem interesse: ${motivo}`)
      } else {
        const linhas: any[] = []
        const doc = soDigitos(p.documento); const tel = normalizarTelefone(p.whatsapp || p.telefone)?.digitos; const em = (p.email || '').toLowerCase()
        if (doc && p.tipo_abordagem !== 'edital') linhas.push({ tipo: 'documento', valor: doc, motivo: 'Pediu para não ser contatado' })
        if (tel) linhas.push({ tipo: 'telefone', valor: tel, motivo: 'Pediu para não ser contatado' })
        if (em) linhas.push({ tipo: 'email', valor: em, motivo: 'Pediu para não ser contatado' })
        for (const l of linhas) { try { await gravar('POST', 'crm_bloqueios', l) } catch { /* já bloqueado */ } }
        await atualizarProspecto(p, { status: 'descartado', motivo_descarte: 'Não contatar mais', proximo_contato: null })
        await atividade(p, 'resposta', 'Pediu para não ser contatado — bloqueado nas próximas listas')
      }
      setModal(null)
    })
  }

  function descartar(p: any, m: string) {
    executar(async () => { await atualizarProspecto(p, { status: 'descartado', motivo_descarte: m, proximo_contato: null }); await atividade(p, 'status', 'Descartado: ' + m); setModal(null) })
  }
  function puxarParaHoje(p: any) {
    executar(async () => { await atualizarProspecto(p, { fila_data: hoje, status: p.status === 'descartado' || p.status === 'frio' ? 'novo' : p.status }); await atividade(p, 'status', 'Puxado para a fila de hoje') })
  }

  async function salvarNovo() {
    if (!fNovo.nome.trim()) return alert('Informe o nome')
    if (!fNovo.telefone && !fNovo.email && !fNovo.site && !fNovo.instagram) return alert('Informe ao menos uma forma de contato (telefone, e-mail, site ou Instagram)')
    await executar(async () => {
      const r = await api('/api/prospeccao/importar', 'POST', { fonte: fNovo.fonte, linhas: [{ nome: fNovo.nome, segmento: fNovo.segmento, telefone: fNovo.telefone, email: fNovo.email, site: fNovo.site, instagram: fNovo.instagram, bairro: fNovo.bairro, gatilho: fNovo.gatilho || null, fonte: fNovo.fonte }] })
      if (r.resumo.novos === 0) {
        throw new Error(r.resumo.duplicados ? 'Este contato já está na lista, é cliente ou é lead.' : r.resumo.bloqueados ? 'Este contato pediu para não ser contatado.' : 'Contato não entrou na lista (aderência baixa).')
      }
      if (fNovo.naFila) {
        const novo = (await ler('crm_prospectos', `?order=created_at.desc&limit=1`))[0]
        if (novo) await atualizarProspecto(novo, { fila_data: hoje })
      }
      setModal(null); setFNovo({ nome: '', segmento: 'reforma_pf', telefone: '', email: '', site: '', instagram: '', bairro: '', gatilho: '', fonte: 'manual', naFila: true })
    })
  }

  async function salvarConfig() {
    if (!cfgEdicao) return
    const lista = (t: string) => t.split(',').map(x => x.trim()).filter(Boolean)
    const cad = lista(cfgEdicao.cadencia_txt).map(Number).filter(n => n > 0)
    await executar(async () => {
      await gravar('PATCH', 'crm_prospeccao_config?id=eq.1', {
        meta_diaria: Math.max(1, parseInt(cfgEdicao.meta_diaria) || 5), score_minimo: Math.min(100, Math.max(0, parseInt(cfgEdicao.score_minimo) || 55)),
        cadencia_dias: cad.length ? cad : [3, 7, 14], dias_reativacao: Math.max(15, parseInt(cfgEdicao.dias_reativacao) || 90),
        bairros: lista(cfgEdicao.bairros_txt), palavras_incluir: lista(cfgEdicao.inc_txt), palavras_excluir: lista(cfgEdicao.exc_txt),
        valor_min_edital: Number(cfgEdicao.valor_min_edital) || 0, valor_max_edital: Number(cfgEdicao.valor_max_edital) || 3000000,
        google_limite_mensal: Math.max(0, parseInt(cfgEdicao.google_limite_mensal) || 0), google_buscas_por_execucao: Math.max(1, parseInt(cfgEdicao.google_buscas_por_execucao) || 5),
        templates: cfgEdicao.templates || null, updated_at: new Date().toISOString(),
      })
      alert('Configurações salvas.')
    })
  }

  // ── Importação de planilha ─────────────────────────────────────
  function lerArquivo(f: File | null) {
    setResImport(null)
    if (!f) return setCsv(null)
    const leitor = new FileReader()
    leitor.onload = () => {
      const linhas = lerCsv(String(leitor.result || ''))
      if (linhas.length < 2) { alert('Planilha vazia ou em formato não reconhecido (use CSV).'); return setCsv(null) }
      const cab = linhas[0].map(c => c.trim())
      const m: Record<string, number> = {}
      for (const [campo, , sinonimos] of CAMPOS_IMPORTACAO) {
        const idx = cab.findIndex(c => sinonimos.includes(c.toLowerCase()))
        if (idx >= 0) m[campo] = idx
      }
      setMapa(m); setCsv({ cab, linhas: linhas.slice(1) })
    }
    leitor.readAsText(f, 'utf-8')
  }
  async function importar() {
    if (!csv) return
    if (mapa.nome == null) return alert('Indique qual coluna é o nome da empresa/pessoa')
    await executar(async () => {
      const g = (l: string[], campo: string) => (mapa[campo] != null ? (l[mapa[campo]] || '').trim() : '')
      const linhas = csv.linhas.map(l => {
        const seg = g(l, 'segmento').toLowerCase()
        const segmento = SEGMENTOS[seg] ? seg : segPadrao
        const dataBruta = g(l, 'gatilho_data')
        const dt = /^\d{4}-\d{2}-\d{2}/.test(dataBruta) ? dataBruta.slice(0, 10) : /^\d{2}\/\d{2}\/\d{4}/.test(dataBruta) ? `${dataBruta.slice(6, 10)}-${dataBruta.slice(3, 5)}-${dataBruta.slice(0, 2)}` : /^\d{8}$/.test(dataBruta) ? `${dataBruta.slice(0, 4)}-${dataBruta.slice(4, 6)}-${dataBruta.slice(6, 8)}` : null
        return { nome: g(l, 'nome'), segmento, telefone: g(l, 'telefone'), whatsapp: g(l, 'whatsapp'), email: g(l, 'email'), documento: g(l, 'documento'), site: g(l, 'site'), instagram: g(l, 'instagram'), endereco: g(l, 'endereco'), bairro: g(l, 'bairro'), cidade: g(l, 'cidade') || 'São Paulo', gatilho: g(l, 'gatilho') || null, gatilho_data: dt, fonte: fontePadrao }
      }).filter(l => l.nome)
      const total = { recebidos: 0, novos: 0, duplicados: 0, clientes_ou_leads: 0, bloqueados: 0, baixa_aderencia: 0 }
      for (let i = 0; i < linhas.length; i += 400) {
        const r = await api('/api/prospeccao/importar', 'POST', { fonte: fontePadrao, linhas: linhas.slice(i, i + 400) })
        for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += r.resumo[k] || 0
      }
      setResImport(total)
    })
  }

  // ── Dados derivados ────────────────────────────────────────────
  const filtrados = useMemo(() => prospectos.filter(p => {
    if (!casaBusca(p)) return false
    if (filtroSeg !== 'todos' && p.segmento !== filtroSeg) return false
    if (filtroFonte !== 'todos' && p.fonte !== filtroFonte) return false
    if (filtroStatus === 'ativos' && ['descartado', 'lead'].includes(p.status)) return false
    if (!['ativos', 'todos'].includes(filtroStatus) && p.status !== filtroStatus) return false
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [prospectos, filtroSeg, filtroFonte, filtroStatus, termo])

  const semana = somarDiasISO(hoje, -7)
  const abordadosSemana = prospectos.filter(p => p.ultimo_contato && p.ultimo_contato.slice(0, 10) >= semana).length
  const respostasTotal = prospectos.filter(p => ['respondeu', 'lead'].includes(p.status) || (p.status === 'descartado' && p.motivo_descarte && !['Prazo do edital encerrado', 'Duplicado'].includes(p.motivo_descarte) && p.tentativas > 0)).length
  const leadsGerados = prospectos.filter(p => p.status === 'lead').length

  function resumoPor(chave: 'fonte' | 'segmento') {
    const mapaR: Record<string, { total: number; abordados: number; respostas: number; leads: number }> = {}
    for (const p of prospectos) {
      const k = p[chave] || '—'
      const r = (mapaR[k] = mapaR[k] || { total: 0, abordados: 0, respostas: 0, leads: 0 })
      r.total++
      if (p.tentativas > 0) r.abordados++
      if (['respondeu', 'lead'].includes(p.status)) r.respostas++
      if (p.status === 'lead') r.leads++
    }
    return Object.entries(mapaR).sort((a, b) => b[1].total - a[1].total)
  }

  async function abrirDetalhe(p: any) {
    setModal({ tipo: 'detalhe', p })
    try { setAtividades(await ler('crm_prospeccao_atividades', `?prospecto_id=eq.${p.id}&order=created_at.desc`)) } catch { setAtividades([]) }
  }

  if (carregando) return <div className={cardCls + ' text-center py-12 text-on-surface-variant'}>Carregando prospecção...</div>
  if (erro) return (
    <div className={cardCls + ' text-center py-12'} data-testid="prospeccao-erro">
      <div className="text-4xl mb-3">🛠️</div>
      <div className="font-bold text-on-surface mb-2">A Prospecção ainda não foi ativada no banco de dados</div>
      <p className="text-body-sm text-on-surface-variant max-w-[520px] mx-auto">{erro}. Rode o arquivo <code>sql/2026-10-24_prospeccao.sql</code> no SQL Editor do Supabase e recarregue esta página.</p>
    </div>
  )

  // ── Cartão de um prospecto ──
  const CartaoProspecto = ({ p, concluido = false }: { p: any; concluido?: boolean }) => {
    const seg = SEGMENTOS[p.segmento] || SEGMENTOS.outros
    const edital = p.tipo_abordagem === 'edital'
    const msg = mensagens[p.id] ?? montarMensagem(p, cfg?.templates, 'Inverso')
    const wa = linkWhatsApp(p.whatsapp || p.telefone, msg)
    const telDigitos = normalizarTelefone(p.whatsapp || p.telefone)?.digitos
    const followup = p.tentativas > 0
    const esperando = p.status === 'abordado' && p.proximo_contato && p.proximo_contato > hoje
    return (
      <div className={`bg-surface-container border rounded-xl p-4 ${concluido ? 'border-outline-variant opacity-70' : 'border-outline-variant'}`} data-testid="cartao-prospecto">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-primary/10 text-primary border-primary/20">{seg.icone} {seg.nome.split(' (')[0]}</span>
              <span className="text-[11px] text-on-surface-variant">{FONTES[p.fonte]?.icone} {FONTES[p.fonte]?.nome || p.fonte}</span>
              {followup && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-tertiary/15 text-tertiary border border-tertiary/30">Follow-up #{p.tentativas}</span>}
              {esperando && <span className="text-[11px] font-semibold text-on-surface-variant">⏳ aguardando — próximo contato {dataBR(p.proximo_contato)}</span>}
              {p.status === 'lead' && <span className="text-[11px] font-bold text-primary-container">✅ virou lead</span>}
              {p.status === 'descartado' && <span className="text-[11px] text-error">descartado: {p.motivo_descarte}</span>}
              {p.status === 'respondeu' && <span className="text-[11px] font-bold text-secondary">💬 respondeu</span>}
              {p.status === 'frio' && <span className="text-[11px] text-on-surface-variant">❄️ sem retorno — volta em {dataBR(p.proximo_contato)}</span>}
            </div>
            <div className="text-base font-bold text-on-surface cursor-pointer hover:underline" onClick={() => abrirDetalhe(p)}>{p.nome}</div>
            {p.gatilho && <div className="text-body-sm text-on-surface mt-0.5">🎯 {p.gatilho}</div>}
            <div className="text-[12px] text-on-surface-variant mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {edital && p.prazo && <span>📅 propostas até <b>{dataBR(p.prazo)}</b></span>}
              {edital && p.valor_estimado ? <span>💰 {moeda(p.valor_estimado)}</span> : null}
              {p.bairro && <span>📍 {p.bairro}</span>}
              {(p.whatsapp || p.telefone) && <span>📞 {p.whatsapp || p.telefone}</span>}
              {p.email && <span>✉️ {p.email}</span>}
              {p.site && <a href={/^https?:/.test(p.site) ? p.site : 'https://' + p.site} target="_blank" rel="noreferrer" className="text-primary hover:underline">🌐 site</a>}
              {p.link_origem && <a href={p.link_origem} target="_blank" rel="noreferrer" className="text-primary hover:underline">{edital ? '📄 abrir edital' : '🔗 origem'}</a>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`text-sm font-black px-3 py-1 rounded-full border ${corScore(p.score)}`} title={(p.score_detalhe || []).map((d: any) => `${d.rotulo}: ${d.pontos}/${d.max} (${d.nota})`).join('\n')} data-testid="score-prospecto">{p.score}</span>
            <span className="text-[10px] text-on-surface-variant">aderência</span>
          </div>
        </div>

        {!concluido && (
          <div className="mt-3 pt-3 border-t border-outline-variant/60">
            {!edital && abrindoMsg[p.id] && (
              <textarea className={inputCls + ' min-h-[90px] mb-2 text-xs'} value={msg} onChange={e => setMensagens(m => ({ ...m, [p.id]: e.target.value }))} />
            )}
            {aguardandoEnvio[p.id] ? (
              <div className="flex items-center gap-2 flex-wrap" data-testid="confirmar-envio">
                <span className="text-sm text-on-surface">Você enviou a mensagem?</span>
                <button className={btnPrimaryCls + ' !py-1.5 !text-xs'} disabled={ocupado} onClick={() => confirmarAbordagem(p, 'WhatsApp enviado')} data-testid="btn-enviei">✓ Enviei</button>
                <button className={btnSecondaryCls + ' !py-1.5 !text-xs'} onClick={() => setAguardandoEnvio(a => ({ ...a, [p.id]: false }))}>Não enviei</button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {edital ? (
                  <>
                    {p.link_origem && <a href={p.link_origem} target="_blank" rel="noreferrer" className={btnPrimaryCls + ' !py-1.5 !text-xs inline-block'}>📄 Abrir edital</a>}
                    {p.status === 'novo' && <button className={btnSmCls} disabled={ocupado} onClick={() => confirmarAbordagem(p, 'Edital em análise')} data-testid="btn-analisar">🔎 Vou analisar</button>}
                    {p.status === 'abordado' && <button className={btnSmCls} disabled={ocupado} onClick={() => registrarResposta(p, 'interesse')} data-testid="btn-participar">✅ Vou participar (virar lead)</button>}
                  </>
                ) : (
                  <>
                    {wa && p.status === 'novo' && <a href={wa} target="_blank" rel="noreferrer" className={btnPrimaryCls + ' !py-1.5 !text-xs inline-block'} onClick={() => setAguardandoEnvio(a => ({ ...a, [p.id]: true }))} data-testid="btn-whatsapp">💬 Chamar no WhatsApp</a>}
                    {wa && p.status === 'abordado' && <a href={wa} target="_blank" rel="noreferrer" className={btnPrimaryCls + ' !py-1.5 !text-xs inline-block'} onClick={() => setAguardandoEnvio(a => ({ ...a, [p.id]: true }))}>💬 Chamar de novo</a>}
                    {telDigitos && <a href={`tel:+55${telDigitos}`} className={btnSmCls + ' inline-block'}>📞 Ligar</a>}
                    {p.email && <a href={`mailto:${p.email}`} className={btnSmCls + ' inline-block'}>✉️ E-mail</a>}
                    {p.status === 'novo' && !wa && <button className={btnSmCls} disabled={ocupado} onClick={() => confirmarAbordagem(p, 'Contato por telefone/e-mail')}>✓ Contatei</button>}
                    <button className={btnSmCls} onClick={() => setAbrindoMsg(a => ({ ...a, [p.id]: !a[p.id] }))}>✏️ Mensagem</button>
                    {p.status === 'abordado' && <button className={btnSmCls} disabled={ocupado} onClick={() => semRetorno(p)} data-testid="btn-sem-retorno">⏭️ Insistir / sem retorno</button>}
                  </>
                )}
                {p.status === 'abordado' && !edital && <button className={btnSmCls} onClick={() => setModal({ tipo: 'resposta', p })} data-testid="btn-respondeu">💬 Respondeu</button>}
                {p.status === 'novo' && !edital && <button className={btnSmCls} onClick={() => setModal({ tipo: 'resposta', p })}>💬 Já respondeu</button>}
                <button className={btnDangerSmCls} onClick={() => { setMotivo(MOTIVOS_DESCARTE[0]); setModal({ tipo: 'descartar', p }) }} data-testid="btn-descartar">✕ Descartar</button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const meses = hoje.slice(0, 7)
  return (
    <div data-testid="aba-prospeccao">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-lg">
        <div className={cardCls}><div className="text-[11px] text-on-surface-variant uppercase tracking-widest mb-2">Fila de hoje</div><div className="text-2xl font-bold text-primary" data-testid="kpi-fila">{feitos.length}/{daFila.length}</div><div className="text-[11px] text-on-surface-variant mt-1">meta {meta} novos por dia</div></div>
        <div className={cardCls}><div className="text-[11px] text-on-surface-variant uppercase tracking-widest mb-2">Abordados (7 dias)</div><div className="text-2xl font-bold text-tertiary">{abordadosSemana}</div></div>
        <div className={cardCls}><div className="text-[11px] text-on-surface-variant uppercase tracking-widest mb-2">Respostas</div><div className="text-2xl font-bold text-secondary">{respostasTotal}</div></div>
        <div className={cardCls}><div className="text-[11px] text-on-surface-variant uppercase tracking-widest mb-2">Leads gerados</div><div className="text-2xl font-bold text-primary-container">{leadsGerados}</div></div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex gap-1 p-1 bg-surface-container rounded-xl border border-outline-variant">
          {([['fila', '🎯 Fila de hoje'], ['todos', '📋 Todos'], ['desempenho', '📊 Desempenho'], ['fontes', '⚙️ Fontes e ajustes']] as const).map(([k, rot]) => (
            <button key={k} onClick={() => setSub(k)} data-testid={`sub-${k}`} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${sub === k ? 'bg-primary/20 text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-variant'}`}>{rot}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <button className={btnSecondaryCls} onClick={() => setModal({ tipo: 'novo' })} data-testid="btn-novo-prospecto">+ Adicionar contato</button>
          <button className={btnSecondaryCls} onClick={() => { setCsv(null); setResImport(null); setModal({ tipo: 'importar' }) }} data-testid="btn-importar">📄 Importar planilha</button>
          <button className={btnPrimaryCls} disabled={atualizando} onClick={() => atualizarFontes(true)} data-testid="btn-atualizar">{atualizando ? 'Buscando...' : '🔄 Buscar novos agora'}</button>
        </div>
      </div>

      {resultadoAtualizacao && (
        <div className={`rounded-lg px-4 py-3 mb-4 text-sm border ${resultadoAtualizacao.erro ? 'bg-error/10 border-error/30 text-error' : 'bg-primary/10 border-primary/30 text-on-surface'}`} data-testid="resultado-atualizacao">
          {resultadoAtualizacao.erro ? `Não foi possível atualizar: ${resultadoAtualizacao.erro}` : (
            <>
              <b>Busca concluída.</b> {resultadoAtualizacao.fontes?.map((f: any) => `${FONTES[f.fonte]?.nome || f.fonte}: ${f.novos ?? 0} novo(s)${f.mensagem ? ' — ' + f.mensagem : ''}`).join(' · ')}
              {resultadoAtualizacao.fila?.gerada ? ` · Fila de hoje montada (${resultadoAtualizacao.fila.followups} follow-up(s) + ${resultadoAtualizacao.fila.novos} novo(s)).` : ''}
            </>
          )}
          <button className="ml-3 underline text-xs" onClick={() => setResultadoAtualizacao(null)}>fechar</button>
        </div>
      )}

      {sub === 'fila' && (
        <>
          {daFila.length === 0 ? (
            <div className={cardCls + ' text-center py-14'}>
              <div className="text-5xl mb-3">🎯</div>
              <div className="font-bold text-on-surface mb-1">Nenhum contato na fila de hoje</div>
              <p className="text-body-sm text-on-surface-variant max-w-[520px] mx-auto mb-4">A fila é montada sozinha todo dia com os {meta} melhores contatos (follow-ups primeiro). Ainda não há prospectos com aderência mínima — clique em "Buscar novos agora", importe uma planilha ou adicione um contato.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 mb-6" data-testid="lista-fila">
                {pendentes.filter(casaBusca).map(p => <CartaoProspecto key={p.id} p={p} />)}
                {pendentes.length === 0 && <div className={cardCls + ' text-center py-8'}><div className="text-3xl mb-2">🎉</div><div className="font-bold text-on-surface">Fila de hoje concluída!</div><div className="text-body-sm text-on-surface-variant">Amanhã cedo chegam os próximos {meta}.</div></div>}
              </div>
              {feitos.length > 0 && (
                <>
                  <div className="text-[11px] text-on-surface-variant font-bold uppercase tracking-widest mb-2">Feitos hoje ({feitos.length})</div>
                  <div className="flex flex-col gap-2 mb-6">{feitos.filter(casaBusca).map(p => <CartaoProspecto key={p.id} p={p} concluido />)}</div>
                </>
              )}
            </>
          )}
        </>
      )}

      {sub === 'todos' && (
        <>
          <div className="flex gap-3 flex-wrap mb-4">
            <select className={inputCls + ' !w-auto'} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
              <option value="ativos">Em andamento</option><option value="todos">Todos</option>
              {(Object.keys(STATUS_NOME) as StatusProspecto[]).map(s => <option key={s} value={s}>{STATUS_NOME[s]}</option>)}
            </select>
            <select className={inputCls + ' !w-auto'} value={filtroSeg} onChange={e => setFiltroSeg(e.target.value)}>
              <option value="todos">Todos os segmentos</option>{Object.entries(SEGMENTOS).map(([k, s]) => <option key={k} value={k}>{s.icone} {s.nome}</option>)}
            </select>
            <select className={inputCls + ' !w-auto'} value={filtroFonte} onChange={e => setFiltroFonte(e.target.value)}>
              <option value="todos">Todas as fontes</option>{Object.entries(FONTES).map(([k, f]) => <option key={k} value={k}>{f.icone} {f.nome}</option>)}
            </select>
            <span className="text-sm text-on-surface-variant self-center">{filtrados.length} contato(s)</span>
          </div>
          <div className={cardCls + ' !p-0 overflow-x-auto'}>
            <table className="w-full border-collapse text-sm">
              <thead><tr className="border-b border-outline-variant">{['Aderência', 'Nome', 'Segmento', 'Origem', 'Sinal', 'Situação', ''].map(h => <th key={h} className="text-left px-3 py-2 text-[10px] text-on-surface-variant uppercase whitespace-nowrap bg-surface-container-high">{h}</th>)}</tr></thead>
              <tbody>
                {filtrados.slice(0, 300).map(p => (
                  <tr key={p.id} className="border-b border-outline-variant hover:bg-surface-variant/20 cursor-pointer" onClick={() => abrirDetalhe(p)} data-testid="linha-prospecto">
                    <td className="px-3 py-2"><span className={`text-xs font-black px-2.5 py-1 rounded-full border ${corScore(p.score)}`}>{p.score}</span></td>
                    <td className="px-3 py-2 font-semibold text-on-surface">{p.nome}</td>
                    <td className="px-3 py-2 text-on-surface-variant text-xs">{(SEGMENTOS[p.segmento] || SEGMENTOS.outros).icone} {(SEGMENTOS[p.segmento] || SEGMENTOS.outros).nome.split(' (')[0]}</td>
                    <td className="px-3 py-2 text-on-surface-variant text-xs">{FONTES[p.fonte]?.nome || p.fonte}</td>
                    <td className="px-3 py-2 text-on-surface-variant text-xs max-w-[320px] truncate">{p.gatilho || '—'}</td>
                    <td className="px-3 py-2 text-xs">{STATUS_NOME[p.status as StatusProspecto] || p.status}{p.fila_data === hoje ? ' · na fila' : ''}</td>
                    <td className="px-3 py-2">{p.fila_data !== hoje && !['lead'].includes(p.status) && <button className={btnSmCls} onClick={e => { e.stopPropagation(); puxarParaHoje(p) }}>+ fila de hoje</button>}</td>
                  </tr>
                ))}
                {filtrados.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-on-surface-variant">Nenhum contato com estes filtros</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {sub === 'desempenho' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {([['fonte', 'Por origem do contato'], ['segmento', 'Por segmento']] as const).map(([chave, titulo]) => (
            <div key={chave} className={cardCls}>
              <div className="text-sm font-bold text-on-surface mb-3">{titulo}</div>
              <table className="w-full text-sm">
                <thead><tr className="text-[10px] text-on-surface-variant uppercase text-left"><th className="py-1.5">{chave === 'fonte' ? 'Origem' : 'Segmento'}</th><th>Contatos</th><th>Abordados</th><th>Respostas</th><th>Leads</th><th>Conversão</th></tr></thead>
                <tbody>
                  {resumoPor(chave).map(([k, r]) => (
                    <tr key={k} className="border-t border-outline-variant/50">
                      <td className="py-2 text-on-surface">{chave === 'fonte' ? `${FONTES[k]?.icone || ''} ${FONTES[k]?.nome || k}` : `${(SEGMENTOS[k] || SEGMENTOS.outros).icone} ${(SEGMENTOS[k] || SEGMENTOS.outros).nome.split(' (')[0]}`}</td>
                      <td>{r.total}</td><td>{r.abordados}</td><td>{r.respostas}</td><td className="font-bold text-primary-container">{r.leads}</td>
                      <td className="text-on-surface-variant">{r.abordados > 0 ? Math.round((r.leads / r.abordados) * 100) + '%' : '—'}</td>
                    </tr>
                  ))}
                  {prospectos.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-on-surface-variant">Sem dados ainda</td></tr>}
                </tbody>
              </table>
            </div>
          ))}
          <div className={cardCls + ' lg:col-span-2'}>
            <div className="text-sm font-bold text-on-surface mb-2">Como ler</div>
            <p className="text-body-sm text-on-surface-variant">Conversão = leads gerados ÷ contatos abordados. Com algumas semanas de uso, aumente a atenção nas origens e segmentos que mais viram lead e reduza onde só há contatos sem resposta (ajuste em "Fontes e ajustes").</p>
          </div>
        </div>
      )}

      {sub === 'fontes' && cfgEdicao && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={cardCls} data-testid="card-fonte-pncp">
              <div className="font-bold text-on-surface mb-1">🏛️ Licitações e dispensas (PNCP)</div>
              <div className="text-[12px] text-primary font-semibold mb-2">Automática · gratuita</div>
              <p className="text-body-sm text-on-surface-variant">Todo dia busca editais abertos em São Paulo (capital) de obra, reforma e manutenção predial, descarta o que foge do nosso porte e do nosso serviço e põe na fila com o prazo.</p>
              <div className="text-[11px] text-on-surface-variant mt-2">Última busca: {cfg?.pncp_ultima_execucao ? new Date(cfg.pncp_ultima_execucao).toLocaleString('pt-BR') : 'ainda não rodou'}{status?.pncp?.em_andamento ? ' · varredura em andamento' : ''}</div>
            </div>
            <div className={cardCls} data-testid="card-fonte-google">
              <div className="font-bold text-on-surface mb-1">📍 Google Maps</div>
              <div className={`text-[12px] font-semibold mb-2 ${status?.google?.configurado ? 'text-primary' : 'text-tertiary'}`}>{status?.google?.configurado ? 'Conectado' : 'Aguardando a chave do Google'}</div>
              <p className="text-body-sm text-on-surface-variant">Encontra administradoras de condomínio, escritórios de arquitetura/engenharia, construtoras e imobiliárias com telefone, por bairro. Teto mensal de segurança para nunca passar da cota gratuita.</p>
              <div className="text-[11px] text-on-surface-variant mt-2">Uso no mês ({meses}): {status?.google?.consumo_mes ?? 0} de {cfg?.google_limite_mensal} buscas</div>
              {!status?.google?.configurado && <div className="text-[11px] text-on-surface-variant mt-1">Para ligar: crie uma chave da "Places API (New)" no Google Cloud e cadastre como <code>GOOGLE_PLACES_API_KEY</code> na Vercel.</div>}
            </div>
            <div className={cardCls}>
              <div className="font-bold text-on-surface mb-1">🏢 Empresas novas (Receita Federal)</div>
              <div className="text-[12px] text-primary font-semibold mb-2">Planilha mensal · gratuita</div>
              <p className="text-body-sm text-on-surface-variant">Rode <code>node scripts/receita-prospectos.mjs</code> uma vez por mês no computador (ele filtra a base aberta da Receita por São Paulo e por atividades que costumam precisar de obra) e importe o CSV gerado em "Importar planilha".</p>
            </div>
          </div>

          <div className={cardCls}>
            <div className="text-sm font-bold text-on-surface mb-3">Ajustes da prospecção</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div><label className={labelCls}>Contatos novos por dia</label><input className={inputCls} type="number" min="1" value={cfgEdicao.meta_diaria} onChange={e => setCfgEdicao({ ...cfgEdicao, meta_diaria: e.target.value })} /></div>
              <div><label className={labelCls}>Aderência mínima (0–100)</label><input className={inputCls} type="number" value={cfgEdicao.score_minimo} onChange={e => setCfgEdicao({ ...cfgEdicao, score_minimo: e.target.value })} /></div>
              <div><label className={labelCls}>Insistir após (dias)</label><input className={inputCls} value={cfgEdicao.cadencia_txt} onChange={e => setCfgEdicao({ ...cfgEdicao, cadencia_txt: e.target.value })} placeholder="3, 7, 14" /></div>
              <div><label className={labelCls}>Reativar frios após (dias)</label><input className={inputCls} type="number" value={cfgEdicao.dias_reativacao} onChange={e => setCfgEdicao({ ...cfgEdicao, dias_reativacao: e.target.value })} /></div>
              <div><label className={labelCls}>Edital: valor mínimo (R$)</label><input className={inputCls} type="number" value={cfgEdicao.valor_min_edital} onChange={e => setCfgEdicao({ ...cfgEdicao, valor_min_edital: e.target.value })} /></div>
              <div><label className={labelCls}>Edital: valor máximo (R$)</label><input className={inputCls} type="number" value={cfgEdicao.valor_max_edital} onChange={e => setCfgEdicao({ ...cfgEdicao, valor_max_edital: e.target.value })} /></div>
              <div><label className={labelCls}>Google: teto de buscas/mês</label><input className={inputCls} type="number" value={cfgEdicao.google_limite_mensal} onChange={e => setCfgEdicao({ ...cfgEdicao, google_limite_mensal: e.target.value })} /></div>
              <div><label className={labelCls}>Google: buscas por dia</label><input className={inputCls} type="number" value={cfgEdicao.google_buscas_por_execucao} onChange={e => setCfgEdicao({ ...cfgEdicao, google_buscas_por_execucao: e.target.value })} /></div>
            </div>
            <div className="mb-3"><label className={labelCls}>Bairros prioritários (separe por vírgula)</label><textarea className={inputCls + ' min-h-[60px]'} value={cfgEdicao.bairros_txt} onChange={e => setCfgEdicao({ ...cfgEdicao, bairros_txt: e.target.value })} /></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div><label className={labelCls}>Editais: palavras a mais que INCLUEM</label><input className={inputCls} value={cfgEdicao.inc_txt} onChange={e => setCfgEdicao({ ...cfgEdicao, inc_txt: e.target.value })} placeholder="ex.: gesso, drywall" /></div>
              <div><label className={labelCls}>Editais: palavras que EXCLUEM</label><input className={inputCls} value={cfgEdicao.exc_txt} onChange={e => setCfgEdicao({ ...cfgEdicao, exc_txt: e.target.value })} placeholder="ex.: jardinagem, paisagismo" /></div>
            </div>
            <details className="mb-3">
              <summary className="cursor-pointer text-sm font-semibold text-primary">Mensagens de abordagem por segmento</summary>
              <div className="mt-3 flex flex-col gap-3">
                {Object.entries(SEGMENTOS).filter(([k]) => k !== 'publico').map(([k, s]) => (
                  <div key={k}><label className={labelCls}>{s.icone} {s.nome}</label>
                    <textarea className={inputCls + ' min-h-[80px] text-xs'} value={(cfgEdicao.templates || {})[k] ?? s.mensagem} onChange={e => setCfgEdicao({ ...cfgEdicao, templates: { ...(cfgEdicao.templates || {}), [k]: e.target.value } })} />
                  </div>
                ))}
                <div className="text-[11px] text-on-surface-variant">Use {'{nome}'}, {'{empresa}'} e {'{saudacao}'} (bom dia/boa tarde/boa noite).</div>
              </div>
            </details>
            <button className={btnPrimaryCls} onClick={salvarConfig} disabled={ocupado} data-testid="btn-salvar-config">Salvar ajustes</button>
          </div>
        </div>
      )}

      {/* ── Modais ── */}
      {modal?.tipo === 'resposta' && modal.p && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1100] p-4" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[460px]" data-testid="modal-resposta">
            <div className="text-base font-bold text-on-surface mb-1">💬 {modal.p.nome} respondeu</div>
            <div className="text-body-sm text-on-surface-variant mb-4">O que aconteceu?</div>
            <div className="flex flex-col gap-2.5">
              <button className="text-left px-4 py-3 rounded-xl border-2 border-outline-variant hover:border-primary-container bg-surface-container-low transition-all" onClick={() => registrarResposta(modal.p, 'interesse')} data-testid="resp-interesse">
                <div className="font-bold text-on-surface text-sm">✅ Tem interesse</div><div className="text-[12px] text-on-surface-variant">Vira um lead no Pipeline (etapa Qualificação), com o histórico da prospecção.</div></button>
              <div className="px-4 py-3 rounded-xl border-2 border-outline-variant bg-surface-container-low">
                <div className="font-bold text-on-surface text-sm mb-2">🚫 Sem interesse</div>
                <div className="flex gap-2"><select className={inputCls} value={motivo} onChange={e => setMotivo(e.target.value)}>{MOTIVOS_DESCARTE.filter(m => m !== 'Não contatar mais').map(m => <option key={m}>{m}</option>)}</select>
                  <button className={btnSecondaryCls} onClick={() => registrarResposta(modal.p, 'sem_interesse')} data-testid="resp-sem-interesse">Registrar</button></div></div>
              <button className="text-left px-4 py-3 rounded-xl border-2 border-outline-variant hover:border-error bg-surface-container-low transition-all" onClick={() => registrarResposta(modal.p, 'nao_contatar')} data-testid="resp-nao-contatar">
                <div className="font-bold text-error text-sm">⛔ Pediu para não ser contatado</div><div className="text-[12px] text-on-surface-variant">Entra na lista de bloqueio: nunca mais aparece nas buscas (LGPD).</div></button>
            </div>
            <div className="flex justify-end mt-4"><button className={btnSecondaryCls} onClick={() => setModal(null)}>Cancelar</button></div>
          </div>
        </div>
      )}

      {modal?.tipo === 'descartar' && modal.p && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1100] p-4" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[420px]" data-testid="modal-descartar">
            <div className="text-base font-bold text-on-surface mb-3">Descartar {modal.p.nome}</div>
            <label className={labelCls}>Motivo</label>
            <select className={inputCls + ' mb-1'} value={motivo} onChange={e => setMotivo(e.target.value)} data-testid="motivo-descarte">{MOTIVOS_DESCARTE.map(m => <option key={m}>{m}</option>)}</select>
            <div className="text-[11px] text-on-surface-variant mb-4">O motivo ajuda a afinar os filtros (aparece em Desempenho).</div>
            <div className="flex gap-2 justify-end"><button className={btnSecondaryCls} onClick={() => setModal(null)}>Cancelar</button>
              <button className={btnPrimaryCls} disabled={ocupado} onClick={() => motivo === 'Não contatar mais' ? registrarResposta(modal.p, 'nao_contatar') : descartar(modal.p, motivo)} data-testid="confirmar-descarte">Descartar</button></div>
          </div>
        </div>
      )}

      {modal?.tipo === 'novo' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1100] p-4" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[540px] max-h-[92vh] overflow-y-auto" data-testid="modal-novo-prospecto">
            <div className="text-base font-bold text-on-surface mb-4">+ Adicionar contato à prospecção</div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="col-span-2"><label className={labelCls}>Nome / empresa *</label><input className={inputCls} value={fNovo.nome} onChange={e => setFNovo({ ...fNovo, nome: e.target.value })} data-testid="novo-nome" /></div>
              <div><label className={labelCls}>Segmento</label><select className={inputCls} value={fNovo.segmento} onChange={e => setFNovo({ ...fNovo, segmento: e.target.value })}>{Object.entries(SEGMENTOS).filter(([k]) => k !== 'publico').map(([k, s]) => <option key={k} value={k}>{s.icone} {s.nome}</option>)}</select></div>
              <div><label className={labelCls}>Como chegou</label><select className={inputCls} value={fNovo.fonte} onChange={e => setFNovo({ ...fNovo, fonte: e.target.value })}><option value="manual">Encontrei (pesquisa)</option><option value="indicacao">Indicação</option></select></div>
              <div><label className={labelCls}>Telefone / WhatsApp</label><input className={inputCls} value={fNovo.telefone} onChange={e => setFNovo({ ...fNovo, telefone: e.target.value })} placeholder="(11) 9...." data-testid="novo-telefone" /></div>
              <div><label className={labelCls}>E-mail</label><input className={inputCls} value={fNovo.email} onChange={e => setFNovo({ ...fNovo, email: e.target.value })} /></div>
              <div><label className={labelCls}>Site</label><input className={inputCls} value={fNovo.site} onChange={e => setFNovo({ ...fNovo, site: e.target.value })} /></div>
              <div><label className={labelCls}>Instagram</label><input className={inputCls} value={fNovo.instagram} onChange={e => setFNovo({ ...fNovo, instagram: e.target.value })} /></div>
              <div><label className={labelCls}>Bairro</label><input className={inputCls} value={fNovo.bairro} onChange={e => setFNovo({ ...fNovo, bairro: e.target.value })} /></div>
              <div className="col-span-2"><label className={labelCls}>Sinal de compra (por que agora?)</label><input className={inputCls} value={fNovo.gatilho} onChange={e => setFNovo({ ...fNovo, gatilho: e.target.value })} placeholder="Ex.: comprou o imóvel há 1 semana; abriu a loja em outubro" /></div>
            </div>
            <label className="flex items-center gap-2 text-sm text-on-surface mb-4 cursor-pointer"><input type="checkbox" className="accent-primary" checked={fNovo.naFila} onChange={e => setFNovo({ ...fNovo, naFila: e.target.checked })} />Colocar na fila de hoje</label>
            <div className="flex gap-2 justify-end"><button className={btnSecondaryCls} onClick={() => setModal(null)}>Cancelar</button><button className={btnPrimaryCls} disabled={ocupado} onClick={salvarNovo} data-testid="salvar-novo-prospecto">Adicionar</button></div>
          </div>
        </div>
      )}

      {modal?.tipo === 'importar' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1100] p-4" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[720px] max-h-[92vh] overflow-y-auto" data-testid="modal-importar">
            <div className="text-base font-bold text-on-surface mb-1">📄 Importar planilha de contatos</div>
            <p className="text-body-sm text-on-surface-variant mb-4">Aceita CSV (separado por ; ou ,). O sistema reconhece as colunas pelo nome, ignora quem já é cliente, lead ou pediu para não ser contatado, e pontua o resto.</p>
            <input type="file" accept=".csv,text/csv,.txt" onChange={e => lerArquivo(e.target.files?.[0] || null)} className="mb-4 text-sm" data-testid="arquivo-csv" />
            {csv && (
              <>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {CAMPOS_IMPORTACAO.map(([campo, rotulo]) => (
                    <div key={campo}><label className={labelCls}>{rotulo}</label>
                      <select className={inputCls} value={mapa[campo] ?? ''} onChange={e => setMapa({ ...mapa, [campo]: e.target.value === '' ? (undefined as any) : parseInt(e.target.value) })} data-testid={`mapa-${campo}`}>
                        <option value="">— não importar —</option>{csv.cab.map((c, i) => <option key={i} value={i}>{c}</option>)}
                      </select></div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className={labelCls}>Segmento quando a planilha não informar</label><select className={inputCls} value={segPadrao} onChange={e => setSegPadrao(e.target.value)}>{Object.entries(SEGMENTOS).filter(([k]) => k !== 'publico').map(([k, s]) => <option key={k} value={k}>{s.icone} {s.nome}</option>)}</select></div>
                  <div><label className={labelCls}>Origem da lista</label><select className={inputCls} value={fontePadrao} onChange={e => setFontePadrao(e.target.value)}><option value="importacao">Planilha</option><option value="receita">Empresas novas (Receita)</option><option value="indicacao">Indicações</option></select></div>
                </div>
                <div className="text-[12px] text-on-surface-variant mb-3">{csv.linhas.length} linha(s) encontrada(s). Exemplo: {csv.linhas[0]?.slice(0, 4).join(' · ')}</div>
              </>
            )}
            {resImport && (
              <div className="rounded-lg px-4 py-3 mb-3 text-sm bg-primary/10 border border-primary/30 text-on-surface" data-testid="resultado-importacao">
                <b>{resImport.novos} contato(s) novo(s)</b> entraram na lista · {resImport.duplicados} já estavam na lista ou eram clientes/leads · {resImport.bloqueados} bloqueado(s) · {resImport.baixa_aderencia} descartado(s) por baixa aderência.
              </div>
            )}
            <div className="flex gap-2 justify-end"><button className={btnSecondaryCls} onClick={() => setModal(null)}>Fechar</button>
              <button className={btnPrimaryCls} disabled={!csv || ocupado} onClick={importar} data-testid="confirmar-importacao">{ocupado ? 'Importando...' : 'Importar'}</button></div>
          </div>
        </div>
      )}

      {modal?.tipo === 'detalhe' && modal.p && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1100] p-4" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[600px] max-h-[92vh] overflow-y-auto" data-testid="modal-detalhe-prospecto">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div><div className="text-lg font-bold text-on-surface">{modal.p.nome}</div><div className="text-[12px] text-on-surface-variant">{(SEGMENTOS[modal.p.segmento] || SEGMENTOS.outros).nome} · {FONTES[modal.p.fonte]?.nome || modal.p.fonte} · {STATUS_NOME[modal.p.status as StatusProspecto]}{modal.p.responsavel_id ? ' · ' + nomeUsuario(modal.p.responsavel_id) : ''}</div></div>
              <span className={`text-sm font-black px-3 py-1 rounded-full border ${corScore(modal.p.score)}`}>{modal.p.score}</span>
            </div>
            {modal.p.gatilho && <div className="text-body-sm text-on-surface mb-2">🎯 {modal.p.gatilho}</div>}
            <div className="text-[12px] text-on-surface-variant mb-3 flex flex-wrap gap-x-3 gap-y-1">
              {modal.p.documento && <span>CNPJ/CPF {modal.p.documento}</span>}{(modal.p.whatsapp || modal.p.telefone) && <span>📞 {modal.p.whatsapp || modal.p.telefone}</span>}{modal.p.email && <span>✉️ {modal.p.email}</span>}
              {modal.p.endereco && <span>📍 {modal.p.endereco}</span>}{modal.p.link_origem && <a className="text-primary hover:underline" target="_blank" rel="noreferrer" href={modal.p.link_origem}>🔗 origem</a>}
            </div>
            {modal.p.detalhes?.objeto && <div className="text-[12px] text-on-surface-variant bg-surface-container-low rounded-lg p-3 mb-3"><b>Objeto do edital:</b> {modal.p.detalhes.objeto}</div>}
            <div className="mb-3"><div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mb-1.5">Por que esta pontuação</div>
              {(modal.p.score_detalhe || []).map((d: any) => (
                <div key={d.rotulo} className="flex items-center gap-2 text-[12px] mb-1"><span className="w-40 text-on-surface-variant shrink-0">{d.rotulo}</span><div className="flex-1 h-1.5 bg-surface-variant rounded overflow-hidden"><div className="h-full bg-primary rounded" style={{ width: (d.pontos / d.max) * 100 + '%' }} /></div><span className="w-12 text-right font-semibold text-on-surface">{d.pontos}/{d.max}</span><span className="w-52 text-on-surface-variant truncate" title={d.nota}>{d.nota}</span></div>
              ))}</div>
            <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mb-1.5">Histórico</div>
            <div className="mb-4 max-h-40 overflow-y-auto">{atividades.length === 0 ? <div className="text-[12px] text-on-surface-variant">Nenhuma interação registrada.</div> : atividades.map(a => <div key={a.id} className="text-[12px] py-1 border-b border-outline-variant/40"><span className="text-on-surface-variant">{new Date(a.created_at + (/[zZ]|[+-]\d\d:?\d\d$/.test(a.created_at) ? '' : 'Z')).toLocaleString('pt-BR')}</span> · {a.descricao}</div>)}</div>
            <div className="flex gap-2 justify-end flex-wrap">
              {modal.p.fila_data !== hoje && modal.p.status !== 'lead' && <button className={btnSmCls} onClick={() => { puxarParaHoje(modal.p); setModal(null) }}>+ fila de hoje</button>}
              <button className={btnSecondaryCls} onClick={() => setModal(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
