// Atividades da equipe: o gestor cria, define responsáveis (uma ou mais pessoas), prazo e anexos; cada responsável
// atualiza a própria parte pelo Dashboard. O prazo gera alertas (atrasada / vencendo) — ver lib/alertas.ts.
import { hojeISO, somarDiasISO } from './datas'

const SUPABASE_URL = 'https://vupjtoeqltzlnplijnzr.supabase.co'
const BASE = SUPABASE_URL + '/rest/v1'
// Chave pública (anon): o acesso real é decidido pelo token do usuário, injetado em lib/authFetch.ts.
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON }
export const BUCKET_ATIVIDADES = 'equipe-atividades'
export const LIMITE_ANEXO_MB = 25

export type StatusResp = 'pendente' | 'em_andamento' | 'concluida'
export const NOME_STATUS: Record<StatusResp, string> = { pendente: 'A fazer', em_andamento: 'Em andamento', concluida: 'Concluída' }
export const ICONE_STATUS: Record<StatusResp, string> = { pendente: '⏳', em_andamento: '🔧', concluida: '✅' }
export const STATUS_LISTA: StatusResp[] = ['pendente', 'em_andamento', 'concluida']

async function erroDe(r: Response) { try { const d = await r.json(); return d?.message || ('erro ' + r.status) } catch { return 'erro ' + r.status } }
async function get(tabela: string, q = ''): Promise<any[]> {
  const r = await fetch(`${BASE}/${tabela}${q}`, { headers: H })
  const d = await r.json()
  if (!Array.isArray(d)) throw new Error(d?.message || 'Falha ao carregar ' + tabela)
  return d
}
async function enviar(metodo: 'POST' | 'PATCH' | 'DELETE', caminho: string, corpo?: object): Promise<any> {
  const r = await fetch(`${BASE}/${caminho}`, { method: metodo, headers: metodo === 'DELETE' ? H : { ...H, Prefer: 'return=representation' }, body: corpo ? JSON.stringify(corpo) : undefined })
  if (!r.ok) throw new Error(await erroDe(r))
  if (metodo === 'DELETE') return null
  const d = await r.json().catch(() => null)
  return Array.isArray(d) ? d[0] : d
}

export interface Responsavel { id: string; atividade_id: string; usuario_id: string; status: StatusResp; concluido_em: string | null }
export interface Atividade {
  id: string; titulo: string; descricao: string | null; tipo: string; data_inicio: string; data_fim: string; alerta_dias: number
  criado_por: string | null; created_at: string
  responsaveis: Responsavel[]
  anexos: { id: string; atividade_id: string; nome: string; caminho: string; tamanho: number | null; mime: string | null; enviado_por: string | null; created_at: string }[]
}

// ── Situação do prazo ────────────────────────────────────────────────────────────
const diasEntre = (de: string, ate: string) => Math.round((Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10)) - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86400000)
export { diasEntre }
export const dataBR = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')

export type SituacaoPrazo = 'concluida' | 'atrasada' | 'vence_hoje' | 'vencendo' | 'em_andamento' | 'futura'

// A atividade está concluída quando TODOS os responsáveis concluíram a parte deles.
export function atividadeConcluida(a: Pick<Atividade, 'responsaveis'>): boolean {
  return a.responsaveis.length > 0 && a.responsaveis.every(r => r.status === 'concluida')
}

// `status` = o que vale para quem está olhando: o status da própria pessoa, ou o geral (todos concluíram).
export function situacaoPrazo(a: Pick<Atividade, 'data_inicio' | 'data_fim' | 'alerta_dias'>, concluida: boolean, hoje = hojeISO()): { situacao: SituacaoPrazo; dias: number } {
  if (concluida) return { situacao: 'concluida', dias: 0 }
  if (a.data_fim < hoje) return { situacao: 'atrasada', dias: diasEntre(a.data_fim, hoje) }
  const falta = diasEntre(hoje, a.data_fim)
  if (falta === 0) return { situacao: 'vence_hoje', dias: 0 }
  if (falta <= a.alerta_dias) return { situacao: 'vencendo', dias: falta }
  if (a.data_inicio > hoje) return { situacao: 'futura', dias: diasEntre(hoje, a.data_inicio) }
  return { situacao: 'em_andamento', dias: falta }
}

export function textoPrazo(a: Pick<Atividade, 'data_fim'>, s: { situacao: SituacaoPrazo; dias: number }): string {
  const plural = (n: number, u: string, p: string) => `${n} ${n === 1 ? u : p}`
  switch (s.situacao) {
    case 'concluida': return 'Concluída'
    case 'atrasada': return `Atrasada há ${plural(s.dias, 'dia', 'dias')} (prazo ${dataBR(a.data_fim)})`
    case 'vence_hoje': return 'Vence hoje'
    case 'vencendo': return s.dias === 1 ? `Vence amanhã (${dataBR(a.data_fim)})` : `Vence em ${s.dias} dias (${dataBR(a.data_fim)})`
    case 'futura': return `Começa em ${plural(s.dias, 'dia', 'dias')}`
    default: return `Prazo ${dataBR(a.data_fim)}`
  }
}

export const COR_SITUACAO: Record<SituacaoPrazo, string> = {
  concluida: 'bg-primary/10 text-primary border-primary/30',
  atrasada: 'bg-error/10 text-error border-error/30',
  vence_hoje: 'bg-error/10 text-error border-error/30',
  vencendo: 'bg-tertiary/10 text-tertiary border-tertiary/30',
  em_andamento: 'bg-secondary/10 text-secondary border-secondary/30',
  futura: 'bg-surface-variant text-on-surface-variant border-outline-variant',
}

// ── Carregamento ─────────────────────────────────────────────────────────────────
async function montar(atividades: any[]): Promise<Atividade[]> {
  if (atividades.length === 0) return []
  const lista = atividades.map(a => a.id).join(',')
  const [resp, anexos] = await Promise.all([
    get('equipe_atividade_responsaveis', `?atividade_id=in.(${lista})&select=id,atividade_id,usuario_id,status,concluido_em`),
    get('equipe_atividade_anexos', `?atividade_id=in.(${lista})&order=created_at.asc`),
  ])
  return atividades.map(a => ({ ...a, responsaveis: resp.filter(r => r.atividade_id === a.id), anexos: anexos.filter(x => x.atividade_id === a.id) }))
}

// Gestão: `visiveis` = null (admin vê tudo) ou os ids das pessoas do time do gerente (+ ele). Inclui o que o gerente criou.
export async function carregarAtividadesGestao(visiveis: string[] | null, meuId: string): Promise<Atividade[]> {
  if (visiveis === null) return montar(await get('equipe_atividades', '?order=data_fim.asc,created_at.desc&limit=1000'))
  const lista = [...new Set([...visiveis, meuId])].join(',')
  const comResp = await get('equipe_atividade_responsaveis', `?usuario_id=in.(${lista})&select=atividade_id`)
  const ids = [...new Set(comResp.map(r => r.atividade_id))]
  const filtros = [`criado_por.eq.${meuId}`, ...(ids.length ? [`id.in.(${ids.join(',')})`] : [])]
  return montar(await get('equipe_atividades', `?or=(${filtros.join(',')})&order=data_fim.asc,created_at.desc&limit=1000`))
}

// Dashboard da pessoa: as atividades em que ela é responsável.
export async function carregarMinhasAtividades(meuId: string): Promise<Atividade[]> {
  const minhas = await get('equipe_atividade_responsaveis', `?usuario_id=eq.${meuId}&select=atividade_id`)
  if (minhas.length === 0) return []
  const ids = [...new Set(minhas.map(r => r.atividade_id))].join(',')
  return montar(await get('equipe_atividades', `?id=in.(${ids})&order=data_fim.asc`))
}

export async function carregarAtividade(id: string): Promise<Atividade | null> {
  return (await montar(await get('equipe_atividades', `?id=eq.${id}`)))[0] || null
}

export async function carregarNotas(atividadeId: string): Promise<any[]> {
  return get('equipe_atividade_notas', `?atividade_id=eq.${atividadeId}&order=created_at.desc`)
}

export async function carregarTipos(): Promise<{ id: string; nome: string; alerta_dias: number }[]> {
  return get('equipe_atividade_tipos', '?order=nome')
}
export async function criarTipo(nome: string, alertaDias: number) {
  return enviar('POST', 'equipe_atividade_tipos', { nome: nome.trim(), alerta_dias: alertaDias })
}

// ── Gravação ─────────────────────────────────────────────────────────────────────
export interface DadosAtividade { titulo: string; descricao: string; tipo: string; data_inicio: string; data_fim: string; alerta_dias: number }

export async function criarAtividade(dados: DadosAtividade, responsaveis: string[], criadoPor: string): Promise<Atividade> {
  const a = await enviar('POST', 'equipe_atividades', { ...dados, descricao: dados.descricao || null, criado_por: criadoPor })
  for (const u of [...new Set(responsaveis)]) await enviar('POST', 'equipe_atividade_responsaveis', { atividade_id: a.id, usuario_id: u })
  return (await carregarAtividade(a.id)) as Atividade
}

// Ajusta dados e responsáveis. Quem já estava na atividade mantém o próprio status.
export async function salvarAtividade(id: string, dados: DadosAtividade, responsaveis: string[]) {
  await enviar('PATCH', `equipe_atividades?id=eq.${id}`, { ...dados, descricao: dados.descricao || null, updated_at: new Date().toISOString() })
  const atuais = await get('equipe_atividade_responsaveis', `?atividade_id=eq.${id}&select=id,usuario_id`)
  const alvo = [...new Set(responsaveis)]
  for (const r of atuais) if (!alvo.includes(r.usuario_id)) await enviar('DELETE', `equipe_atividade_responsaveis?id=eq.${r.id}`)
  for (const u of alvo) if (!atuais.some(r => r.usuario_id === u)) await enviar('POST', 'equipe_atividade_responsaveis', { atividade_id: id, usuario_id: u })
}

export async function excluirAtividade(a: Atividade) {
  const caminhos = a.anexos.map(x => x.caminho)
  await enviar('DELETE', `equipe_atividades?id=eq.${a.id}`)
  for (const c of caminhos) await removerArquivo(c)
}

export async function definirStatus(atividadeId: string, usuarioId: string, status: StatusResp, nomeUsuario: string) {
  await enviar('PATCH', `equipe_atividade_responsaveis?atividade_id=eq.${atividadeId}&usuario_id=eq.${usuarioId}`, {
    status, concluido_em: status === 'concluida' ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
  })
  await enviar('POST', 'equipe_atividade_notas', { atividade_id: atividadeId, usuario_id: usuarioId, tipo: 'status', texto: `${nomeUsuario} marcou como “${NOME_STATUS[status]}”` })
}

export async function adicionarNota(atividadeId: string, usuarioId: string, texto: string) {
  await enviar('POST', 'equipe_atividade_notas', { atividade_id: atividadeId, usuario_id: usuarioId, tipo: 'nota', texto: texto.trim() })
}

// ── Anexos ───────────────────────────────────────────────────────────────────────
function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) || 'arquivo'
}

export async function enviarAnexo(atividadeId: string, arquivo: File, usuarioId: string) {
  if (arquivo.size > LIMITE_ANEXO_MB * 1024 * 1024) throw new Error(`O arquivo "${arquivo.name}" passa de ${LIMITE_ANEXO_MB} MB`)
  const caminho = `${atividadeId}/${Date.now()}-${nomeSeguro(arquivo.name)}`
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET_ATIVIDADES}/${caminho}`, {
    method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': arquivo.type || 'application/octet-stream' }, body: arquivo,
  })
  if (!r.ok) throw new Error(`Não foi possível enviar "${arquivo.name}": ${await erroDe(r)}`)
  try {
    return await enviar('POST', 'equipe_atividade_anexos', { atividade_id: atividadeId, nome: arquivo.name, caminho, tamanho: arquivo.size, mime: arquivo.type || null, enviado_por: usuarioId })
  } catch (e) { await removerArquivo(caminho); throw e }
}

async function removerArquivo(caminho: string) {
  try { await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET_ATIVIDADES}/${caminho}`, { method: 'DELETE', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } }) } catch { /* arquivo órfão não atrapalha */ }
}

export async function removerAnexo(anexo: { id: string; caminho: string }) {
  await enviar('DELETE', `equipe_atividade_anexos?id=eq.${anexo.id}`)
  await removerArquivo(anexo.caminho)
}

// Link para abrir o arquivo (o interceptor de lib/authFetch.ts troca por um link assinado de curta duração).
export const linkAnexo = (caminho: string) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_ATIVIDADES}/${caminho}`
export const tamanhoLegivel = (b?: number | null) => (!b ? '' : b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1024 / 1024).toFixed(1) + ' MB')

// Data local (Brasil) de um instante gravado em UTC.
export function dataLocalISO(instante: string): string {
  const d = new Date(instante)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Filtro do Dashboard: o que é "de hoje" para a pessoa ─────────────────────────
export function atividadesDeHoje(todas: Atividade[], meuId: string, hoje = hojeISO()) {
  const comMeu = todas.map(a => ({ a, minha: a.responsaveis.find(r => r.usuario_id === meuId) })).filter(x => x.minha) as { a: Atividade; minha: Responsavel }[]
  const aberta = (x: { minha: Responsavel }) => x.minha.status !== 'concluida'
  const atrasadas = comMeu.filter(x => aberta(x) && x.a.data_fim < hoje).sort((p, q) => p.a.data_fim.localeCompare(q.a.data_fim))
  const hojeLista = comMeu.filter(x => aberta(x) && x.a.data_inicio <= hoje && x.a.data_fim >= hoje).sort((p, q) => p.a.data_fim.localeCompare(q.a.data_fim))
  const proximas = comMeu.filter(x => aberta(x) && x.a.data_inicio > hoje && x.a.data_inicio <= somarDiasISO(hoje, 7)).sort((p, q) => p.a.data_inicio.localeCompare(q.a.data_inicio))
  const feitasHoje = comMeu.filter(x => !aberta(x) && x.minha.concluido_em && dataLocalISO(x.minha.concluido_em) === hoje)
  return { atrasadas, hoje: hojeLista, proximas, feitasHoje }
}
