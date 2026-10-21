// Robôs da Prospecção: buscam contatos em fontes públicas/oficiais, filtram, pontuam e gravam em crm_prospectos.
// Roda só no servidor (usa a chave de serviço do Supabase). Nenhuma fonte aqui faz captura de redes sociais.
import { sb, sbJson, serviceKey, resolverEquipe, SUPABASE_URL } from '../cliente/_shared'
import { calcularScore, classificarEdital, resumirObjeto, normalizarTelefone, soDigitos, hojeBR, somarDiasISO, SEGMENTOS } from '../../lib/prospeccao'

export { serviceKey }

export interface Config {
  meta_diaria: number; score_minimo: number; cadencia_dias: number[]; dias_reativacao: number
  municipios_ibge: string[]; bairros: string[]; palavras_incluir: string[] | null; palavras_excluir: string[] | null
  valor_min_edital: number; valor_max_edital: number; google_limite_mensal: number; google_buscas_por_execucao: number
  google_consumo: Record<string, number>; pncp_cursor: any; pncp_ultima_execucao: string | null
  google_cursor: number; google_ultima_execucao: string | null; ultima_fila: string | null; templates: Record<string, string> | null
}

export interface Candidato {
  nome: string; segmento: string; tipo_abordagem?: 'contato' | 'edital'; fonte: string; fonte_ref?: string | null
  documento?: string | null; telefone?: string | null; whatsapp?: string | null; email?: string | null; site?: string | null; instagram?: string | null
  endereco?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null
  gatilho?: string | null; gatilho_data?: string | null; prazo?: string | null; valor_estimado?: number | null
  link_origem?: string | null; detalhes?: any; observacao?: string | null
}

export interface ResumoFonte { fonte: string; ok: boolean; mensagem?: string; lidos?: number; aderentes?: number; novos?: number; paginas?: number; limitado?: boolean }

// ── Autorização: robô (cron) com segredo, ou usuário do CRM logado ───────────────────
export async function autorizar(req: Request): Promise<{ ok: true; origem: 'cron' | 'usuario'; usuarioId?: string } | { ok: false; erro: string; status: number }> {
  if (!serviceKey()) return { ok: false, erro: 'SUPABASE_SECRET_KEY não configurada no servidor', status: 500 }
  const auth = req.headers.get('authorization')
  const segredo = process.env.CRON_SECRET
  if (segredo && auth === `Bearer ${segredo}`) return { ok: true, origem: 'cron' }
  const eq = await resolverEquipe(auth)
  if ('erro' in eq) return { ok: false, erro: eq.erro, status: eq.status }
  const rows = await sbJson<any[]>(`usuarios?id=eq.${eq.id}&select=id,role,aprovado,modulos_permitidos`)
  const u = rows[0]
  if (!u?.aprovado) return { ok: false, erro: 'Usuário não aprovado', status: 403 }
  if (u.role !== 'admin' && !(u.modulos_permitidos || []).includes('crm')) return { ok: false, erro: 'Sem acesso ao módulo CRM', status: 403 }
  return { ok: true, origem: 'usuario', usuarioId: u.id }
}

// ── Configuração ─────────────────────────────────────────────────────────────────
export async function carregarConfig(): Promise<Config> {
  const rows = await sbJson<any[]>('crm_prospeccao_config?id=eq.1&select=*')
  if (!rows[0]) {
    await sb('crm_prospeccao_config', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ id: 1 }) })
    return (await sbJson<any[]>('crm_prospeccao_config?id=eq.1&select=*'))[0]
  }
  return rows[0]
}
export async function salvarConfig(patch: Partial<Config>) {
  await sb('crm_prospeccao_config?id=eq.1', { method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) })
}

// ── Duplicidade: já é cliente, já é lead, já foi bloqueado ou já está na lista ────────
export interface Conhecidos { docs: Set<string>; tels: Set<string>; emails: Set<string>; bloqueados: Set<string> }
const chaveTel = (v?: string | null) => normalizarTelefone(v)?.digitos || ''

export async function carregarConhecidos(): Promise<Conhecidos> {
  const [clientes, leads, prosp, bloq] = await Promise.all([
    sbJson<any[]>('clientes?select=cpf_cnpj,telefone,email'),
    sbJson<any[]>('crm_leads?select=telefone,email'),
    sbJson<any[]>('crm_prospectos?select=documento,telefone,whatsapp,email&limit=10000'),
    sbJson<any[]>('crm_bloqueios?select=tipo,valor'),
  ])
  const c: Conhecidos = { docs: new Set(), tels: new Set(), emails: new Set(), bloqueados: new Set() }
  const add = (o: any) => {
    const d = soDigitos(o.cpf_cnpj || o.documento); if (d.length >= 11) c.docs.add(d)
    for (const t of [o.telefone, o.whatsapp]) { const k = chaveTel(t); if (k) c.tels.add(k) }
    if (o.email) c.emails.add(String(o.email).toLowerCase().trim())
  }
  ;[...clientes, ...leads, ...prosp].forEach(add)
  bloq.forEach((b: any) => c.bloqueados.add(`${b.tipo}:${b.valor}`))
  return c
}

export interface ResumoRegistro { recebidos: number; novos: number; duplicados: number; clientes_ou_leads: number; bloqueados: number; baixa_aderencia: number }

// Pontua e grava. Quem já é cliente/lead/prospecto (mesmo CNPJ, telefone ou e-mail) ou está bloqueado fica de fora.
export async function registrarCandidatos(lista: Candidato[], cfg: Config, conhecidos?: Conhecidos, scoreMinimoGravar = 35): Promise<ResumoRegistro> {
  const k = conhecidos || await carregarConhecidos()
  const hoje = hojeBR()
  const resumo: ResumoRegistro = { recebidos: lista.length, novos: 0, duplicados: 0, clientes_ou_leads: 0, bloqueados: 0, baixa_aderencia: 0 }
  const linhas: any[] = []
  for (const c of lista) {
    if (!c.nome?.trim()) continue
    const doc = soDigitos(c.documento); const tel = chaveTel(c.whatsapp) || chaveTel(c.telefone); const email = (c.email || '').toLowerCase().trim()
    const bloqueado = (doc && k.bloqueados.has('documento:' + doc)) || (tel && k.bloqueados.has('telefone:' + tel)) || (email && k.bloqueados.has('email:' + email))
    if (bloqueado) { resumo.bloqueados++; continue }
    // edital de órgão público não deve ser barrado pelo CNPJ do órgão (um órgão publica vários editais)
    const edital = c.tipo_abordagem === 'edital'
    const jaExiste = (!edital && doc && k.docs.has(doc)) || (tel && k.tels.has(tel)) || (email && k.emails.has(email))
    if (jaExiste) { resumo.duplicados++; continue }
    const registro: any = {
      nome: c.nome.trim(), segmento: SEGMENTOS[c.segmento] ? c.segmento : 'outros', tipo_abordagem: c.tipo_abordagem || 'contato', fonte: c.fonte,
      fonte_ref: c.fonte_ref || null, documento: doc || null, telefone: c.telefone || null, whatsapp: c.whatsapp || null, email: email || null,
      site: c.site || null, instagram: c.instagram || null, endereco: c.endereco || null, bairro: c.bairro || null, cidade: c.cidade || 'São Paulo', uf: (c.uf || 'SP').toUpperCase(),
      gatilho: c.gatilho || null, gatilho_data: c.gatilho_data || null, prazo: c.prazo || null, valor_estimado: c.valor_estimado ?? null,
      link_origem: c.link_origem || null, detalhes: c.detalhes || null, observacao: c.observacao || null,
    }
    // contato sem nenhuma forma de abordagem não serve (edital sempre tem o link)
    if (!edital && !tel && !email && !c.site && !c.instagram) { resumo.baixa_aderencia++; continue }
    const s = calcularScore(registro, cfg, hoje)
    if (s.score < scoreMinimoGravar) { resumo.baixa_aderencia++; continue }
    registro.score = s.score; registro.score_detalhe = s.detalhe
    linhas.push(registro)
    if (!edital && doc) k.docs.add(doc); if (tel) k.tels.add(tel); if (email) k.emails.add(email)
  }
  for (let i = 0; i < linhas.length; i += 100) {
    const lote = linhas.slice(i, i + 100)
    const r = await sb('crm_prospectos?on_conflict=fonte,fonte_ref', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(lote) })
    if (!r.ok) throw new Error('Falha ao gravar prospectos: ' + (await r.text()).slice(0, 200))
    const inseridos = await r.json()
    resumo.novos += Array.isArray(inseridos) ? inseridos.length : 0
    resumo.duplicados += lote.length - (Array.isArray(inseridos) ? inseridos.length : 0)
  }
  return resumo
}

// ── Fonte 1: licitações e dispensas abertas (PNCP — API pública oficial) ─────────────
const PNCP = 'https://pncp.gov.br/api/consulta/v1'
// 8 = Dispensa (contratação direta: o melhor encaixe para empresa pequena), 4/5 = Concorrência, 6 = Pregão eletrônico
const MODALIDADES_PNCP = [8, 4, 5, 6]
const PAGINAS_POR_EXECUCAO = 6
// Página pública do edital no PNCP a partir do número de controle (ex.: 43054154000179-1-000028/2024)
export function linkPncp(numero: string): string | null {
  const m = /^(\d{14})-\d+-0*(\d+)\/(\d{4})$/.exec(numero || '')
  return m ? `https://pncp.gov.br/app/editais/${m[1]}/${m[3]}/${m[2]}` : null
}
const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, m => m.toLowerCase())

export async function fontePncp(cfg: Config, conhecidos: Conhecidos): Promise<ResumoFonte> {
  const hoje = hojeBR()
  const dataFinal = somarDiasISO(hoje, 365).replace(/-/g, '')
  const municipios = cfg.municipios_ibge?.length ? cfg.municipios_ibge : ['3550308']
  let cursor = { i: 0, m: 0, pg: 1, ...(cfg.pncp_cursor || {}) }
  const resumo: ResumoFonte = { fonte: 'pncp', ok: true, lidos: 0, aderentes: 0, novos: 0, paginas: 0 }
  const achados: Candidato[] = []

  while (resumo.paginas! < PAGINAS_POR_EXECUCAO && cursor.i < municipios.length) {
    const url = `${PNCP}/contratacoes/proposta?dataFinal=${dataFinal}&codigoModalidadeContratacao=${MODALIDADES_PNCP[cursor.m]}&codigoMunicipioIbge=${municipios[cursor.i]}&pagina=${cursor.pg}&tamanhoPagina=50`
    let r: Response
    try { r = await fetch(url, { headers: { Accept: 'application/json' } }) } catch (e: any) { resumo.ok = false; resumo.mensagem = 'PNCP fora do ar: ' + e.message; break }
    if (r.status === 204) { avancarCursor(cursor, municipios.length); continue }
    const texto = await r.text()
    if (r.status === 429 || texto.trimStart().startsWith('<')) { resumo.limitado = true; resumo.mensagem = 'O PNCP limitou as consultas; continua na próxima rodada.'; break }
    if (!r.ok) { resumo.ok = false; resumo.mensagem = `PNCP respondeu ${r.status}: ${texto.slice(0, 120)}`; break }
    let j: any
    try { j = JSON.parse(texto) } catch { resumo.ok = false; resumo.mensagem = 'Resposta inesperada do PNCP'; break }
    resumo.paginas!++
    for (const c of j.data || []) {
      resumo.lidos!++
      if (c.situacaoCompraNome && c.situacaoCompraNome !== 'Divulgada no PNCP') continue
      const prazo = (c.dataEncerramentoProposta || '').slice(0, 10)
      if (!prazo || prazo < somarDiasISO(hoje, 2)) continue
      const cls = classificarEdital(c.objetoCompra || '', cfg.palavras_incluir, cfg.palavras_excluir)
      if (!cls.ok) continue
      resumo.aderentes!++
      const org = c.orgaoEntidade || {}, un = c.unidadeOrgao || {}
      const seq = String(c.numeroControlePNCP || '')
      achados.push({
        nome: titulo(org.razaoSocial || un.nomeUnidade || 'Órgão público'), segmento: 'publico', tipo_abordagem: 'edital', fonte: 'pncp', fonte_ref: seq,
        documento: org.cnpj, cidade: un.municipioNome || 'São Paulo', uf: un.ufSigla || 'SP', bairro: null,
        gatilho: `${cls.tipo}: ${resumirObjeto(c.objetoCompra || '')}`, gatilho_data: (c.dataPublicacaoPncp || '').slice(0, 10) || hoje, prazo,
        valor_estimado: Number(c.valorTotalEstimado) || null,
        link_origem: c.linkSistemaOrigem || linkPncp(seq),
        detalhes: { modalidade: c.modalidadeNome, unidade: un.nomeUnidade, objeto: String(c.objetoCompra || '').slice(0, 1500), numeroCompra: c.numeroCompra, processo: c.processo, amparo: c.amparoLegal?.nome, srp: c.srp },
      })
    }
    if (cursor.pg >= (j.totalPaginas || 1)) avancarCursor(cursor, municipios.length)
    else cursor.pg++
    await esperar(1400)
  }

  const terminouCiclo = cursor.i >= municipios.length
  if (achados.length) {
    const reg = await registrarCandidatos(achados, cfg, conhecidos)
    resumo.novos = reg.novos
  }
  await salvarConfig({ pncp_cursor: terminouCiclo ? {} : cursor, pncp_ultima_execucao: new Date().toISOString() })
  if (!resumo.mensagem) resumo.mensagem = terminouCiclo ? 'Varredura completa dos editais abertos.' : 'Varredura em andamento (continua na próxima rodada).'
  return resumo
}
function avancarCursor(c: { i: number; m: number; pg: number }, nMunicipios: number) {
  c.pg = 1; c.m++
  if (c.m >= MODALIDADES_PNCP.length) { c.m = 0; c.i++ }
  if (c.i >= nMunicipios) c.i = nMunicipios // terminou
}

// Editais cujo prazo já passou saem da fila sozinhos
export async function encerrarEditaisVencidos() {
  const hoje = hojeBR()
  await sb(`crm_prospectos?tipo_abordagem=eq.edital&status=in.(novo,abordado)&prazo=lt.${hoje}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'descartado', motivo_descarte: 'Prazo do edital encerrado', fila_data: null, updated_at: new Date().toISOString() }),
  })
}

// ── Fonte 2: Google Maps (Places API) — opcional, exige chave e respeita um teto mensal ─
export const CONSULTAS_GOOGLE: { segmento: string; q: string }[] = [
  { segmento: 'condominio', q: 'administradora de condomínios' },
  { segmento: 'parceiro_b2b', q: 'escritório de arquitetura' },
  { segmento: 'parceiro_b2b', q: 'construtora' },
  { segmento: 'parceiro_b2b', q: 'escritório de engenharia civil' },
  { segmento: 'investidor', q: 'imobiliária' },
  { segmento: 'investidor', q: 'incorporadora' },
  { segmento: 'aprovacao_gestao', q: 'despachante imobiliário regularização de imóveis' },
]

export function googleConfigurado() { return !!process.env.GOOGLE_PLACES_API_KEY }

export function montarRequisicaoGoogle(textQuery: string) {
  return {
    url: 'https://places.googleapis.com/v1/places:searchText',
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY || '',
        // pedir só o necessário: telefone e site são campos pagos do nível "Enterprise" (1.000 buscas grátis/mês)
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.businessStatus,places.rating,places.userRatingCount,places.primaryType',
      },
      body: JSON.stringify({ textQuery, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20 }),
    } as RequestInit,
  }
}

export async function fonteGoogle(cfg: Config, conhecidos: Conhecidos): Promise<ResumoFonte> {
  const resumo: ResumoFonte = { fonte: 'google', ok: true, lidos: 0, aderentes: 0, novos: 0, paginas: 0 }
  if (!googleConfigurado()) return { ...resumo, ok: true, mensagem: 'Chave do Google não configurada (fonte desligada).' }
  const mes = hojeBR().slice(0, 7)
  const consumo = { ...(cfg.google_consumo || {}) }
  let usadas = Number(consumo[mes] || 0)
  const bairros = cfg.bairros?.length ? cfg.bairros : ['Pinheiros']
  const combos = CONSULTAS_GOOGLE.flatMap(c => bairros.map(b => ({ ...c, bairro: b })))
  let cursor = (cfg.google_cursor || 0) % Math.max(1, combos.length)
  const achados: Candidato[] = []
  for (let n = 0; n < (cfg.google_buscas_por_execucao || 5); n++) {
    if (usadas >= cfg.google_limite_mensal) { resumo.mensagem = `Teto mensal de ${cfg.google_limite_mensal} buscas atingido — fonte pausada até o próximo mês.`; break }
    const combo = combos[cursor]
    const { url, init } = montarRequisicaoGoogle(`${combo.q} em ${combo.bairro}, São Paulo`)
    let r: Response
    try { r = await fetch(url, init) } catch (e: any) { resumo.ok = false; resumo.mensagem = 'Google fora do ar: ' + e.message; break }
    if (!r.ok) { resumo.ok = false; resumo.mensagem = `Google respondeu ${r.status}: ${(await r.text()).slice(0, 160)}`; break }
    usadas++; resumo.paginas!++
    const j: any = await r.json().catch(() => ({}))
    for (const p of j.places || []) {
      resumo.lidos!++
      if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue
      if (!p.nationalPhoneNumber) continue
      if (!/s[aã]o paulo/i.test(p.formattedAddress || '')) continue
      resumo.aderentes!++
      achados.push({
        nome: p.displayName?.text || '', segmento: combo.segmento, fonte: 'google', fonte_ref: p.id, telefone: p.nationalPhoneNumber, site: p.websiteUri || null,
        endereco: p.formattedAddress || null, bairro: combo.bairro, cidade: 'São Paulo', uf: 'SP',
        gatilho: `Encontrada no Google Maps: ${combo.q} (${combo.bairro})`, link_origem: p.googleMapsUri || null,
        detalhes: { avaliacao: p.rating, avaliacoes: p.userRatingCount, tipo: p.primaryType },
      })
    }
    cursor = (cursor + 1) % combos.length
    await esperar(300)
  }
  consumo[mes] = usadas
  if (achados.length) resumo.novos = (await registrarCandidatos(achados, cfg, conhecidos)).novos
  await salvarConfig({ google_cursor: cursor, google_consumo: consumo, google_ultima_execucao: new Date().toISOString() })
  return resumo
}

// ── Fila do dia: follow-ups vencidos + melhores prospectos novos ─────────────────────
// Escolhe os melhores contatos novos (no máximo 40% editais) para ocupar `vagas` lugares; ignora quem já está na fila de hoje.
async function escolherNovos(cfg: Config, vagas: number, hoje: string) {
  if (vagas <= 0) return []
  const candidatos = await sbJson<any[]>(`crm_prospectos?status=eq.novo&score=gte.${cfg.score_minimo ?? 55}&or=(fila_data.is.null,fila_data.neq.${hoje})&select=id,tipo_abordagem,score&order=score.desc,created_at.desc,id.asc&limit=60`)
  const maxEditais = Math.ceil((cfg.meta_diaria || 5) * 0.4)
  const escolhidos: any[] = []
  let editais = 0
  for (const c of candidatos) {
    if (escolhidos.length >= vagas) break
    if (c.tipo_abordagem === 'edital') { if (editais >= maxEditais) continue; editais++ }
    escolhidos.push(c)
  }
  for (const c of candidatos) { // sobrou vaga e faltou contato: completa com editais
    if (escolhidos.length >= vagas) break
    if (!escolhidos.includes(c)) escolhidos.push(c)
  }
  return escolhidos
}

export async function gerarFila(cfg: Config, completar = false): Promise<{ gerada: boolean; followups: number; novos: number }> {
  const hoje = hojeBR()
  // trava: só uma execução por dia faz a montagem inicial (duas pessoas abrindo a tela juntas não duplicam)
  const trava = await sb(`crm_prospeccao_config?id=eq.1&or=(ultima_fila.is.null,ultima_fila.neq.${hoje})`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ultima_fila: hoje }) })
  const ganhou = trava.ok ? await trava.json() : []
  if (!Array.isArray(ganhou) || ganhou.length === 0) {
    // quem perdeu a corrida não mexe na fila (o vencedor ainda está montando); só a busca de novos contatos completa vagas
    if (!completar) return { gerada: false, followups: 0, novos: 0 }
    // a fila de hoje já foi montada: se chegaram contatos depois (nova busca) e ainda há vaga, completa — é idempotente
    const naFila = await sbJson<any[]>(`crm_prospectos?fila_data=eq.${hoje}&select=id&limit=200`)
    const extras = await escolherNovos(cfg, (cfg.meta_diaria || 5) - naFila.length, hoje)
    if (extras.length) await sb(`crm_prospectos?id=in.(${extras.map(x => x.id).join(',')})`, { method: 'PATCH', body: JSON.stringify({ fila_data: hoje, updated_at: new Date().toISOString() }) })
    return { gerada: false, followups: 0, novos: extras.length }
  }

  // quem estava "frio" há tempo suficiente volta a ser novo
  await sb(`crm_prospectos?status=eq.frio&proximo_contato=lte.${hoje}`, { method: 'PATCH', body: JSON.stringify({ status: 'novo', tentativas: 0, proximo_contato: null, updated_at: new Date().toISOString() }) })
  await encerrarEditaisVencidos()

  const follow = await sbJson<any[]>(`crm_prospectos?status=eq.abordado&proximo_contato=lte.${hoje}&select=id&order=proximo_contato.asc,score.desc&limit=8`)
  const escolhidos = await escolherNovos(cfg, Math.max(2, (cfg.meta_diaria || 5) - follow.length), hoje)
  const ids = [...follow, ...escolhidos].map(x => x.id)
  if (ids.length) {
    await sb(`crm_prospectos?id=in.(${ids.join(',')})`, { method: 'PATCH', body: JSON.stringify({ fila_data: hoje, updated_at: new Date().toISOString() }) })
  }
  return { gerada: true, followups: follow.length, novos: escolhidos.length }
}

export { SUPABASE_URL }
