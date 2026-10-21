// Prospecção ativa: tipos, segmentos, pontuação de aderência, classificação de editais e mensagens.
// Compartilhado entre a tela do CRM e as rotas de servidor (robôs de busca).

export type StatusProspecto = 'novo' | 'abordado' | 'respondeu' | 'lead' | 'frio' | 'descartado'

export const STATUS_NOME: Record<StatusProspecto, string> = {
  novo: 'Novo', abordado: 'Abordado', respondeu: 'Respondeu', lead: 'Virou lead', frio: 'Frio (volta depois)', descartado: 'Descartado',
}

export const FONTES: Record<string, { nome: string; icone: string }> = {
  pncp: { nome: 'Licitações (PNCP)', icone: '🏛️' },
  google: { nome: 'Google Maps', icone: '📍' },
  receita: { nome: 'Empresas novas (Receita)', icone: '🏢' },
  importacao: { nome: 'Planilha importada', icone: '📄' },
  manual: { nome: 'Cadastro manual', icone: '✍️' },
  indicacao: { nome: 'Indicação', icone: '🤝' },
}

export interface SegmentoInfo { nome: string; icone: string; servico: string; peso: number; mensagem: string }

// Peso = quanto o segmento combina com o que a Inverso faz (entra na pontuação de aderência, 0–25).
export const SEGMENTOS: Record<string, SegmentoInfo> = {
  reforma_pf: {
    nome: 'Reforma e acabamento (pessoa física)', icone: '🏠', peso: 25, servico: 'Reforma, ampliação, acabamentos e manutenção',
    mensagem: '{saudacao}, {nome}! Aqui é da {empresa}, construtora e reformas em São Paulo. Vi que você está com um imóvel para reformar e queria me apresentar: fazemos projeto, reforma e acabamento com orçamento detalhado e acompanhamento da obra. Posso te mandar uma proposta sem compromisso?',
  },
  construir_pf: {
    nome: 'Construir casa ou obra nova (pessoa física)', icone: '🧱', peso: 25, servico: 'Construção de residência, muros, garagens, piscinas, áreas gourmet',
    mensagem: '{saudacao}, {nome}! Aqui é da {empresa}. Trabalhamos com construção de casas e estruturas (muros, garagens, áreas gourmet) do projeto à entrega. Se você tem um terreno ou projeto para tirar do papel, posso te apresentar como funciona e fazer uma estimativa sem custo?',
  },
  investidor: {
    nome: 'Investidores e imobiliário', icone: '📈', peso: 22, servico: 'Reforma e construção para venda/aluguel, consultoria na busca de imóveis',
    mensagem: '{saudacao}, {nome}! Aqui é da {empresa}. Ajudamos investidores a reformar ou construir imóveis para venda e aluguel, com orçamento fechado e cronograma. Se você tem algum imóvel em vista ou em obra, posso te mostrar como trabalhamos?',
  },
  empresa: {
    nome: 'Empresas (lojas, escritórios, galpões)', icone: '🏢', peso: 22, servico: 'Projeto, reforma e construção comercial, modernização de estabelecimentos',
    mensagem: '{saudacao}! Aqui é da {empresa}, construtora especializada em reformas e obras comerciais em São Paulo. Estou entrando em contato com a {nome} para oferecer apoio em projeto, reforma ou adequação do espaço, com prazo e valor fechados. Com quem posso falar sobre isso?',
  },
  condominio: {
    nome: 'Condomínios e administradoras', icone: '🏙️', peso: 24, servico: 'Reformas e manutenção de áreas comuns',
    mensagem: '{saudacao}! Aqui é da {empresa}. Atendemos condomínios em reformas e manutenção de áreas comuns (fachada, pintura, garagem, hall) com orçamento detalhado e obra organizada. Com quem posso falar sobre cadastro de fornecedores em {nome}?',
  },
  parceiro_b2b: {
    nome: 'Parceiros: construtoras, engenheiros e arquitetos', icone: '🤝', peso: 16, servico: 'Execução de projetos de terceiros, mão de obra e gerenciamento',
    mensagem: '{saudacao}, {nome}! Aqui é da {empresa}. Executamos obras e reformas para projetos de arquitetos, engenheiros e construtoras, com equipe própria e gerenciamento. Se algum projeto de vocês precisar de quem execute, adoraria conversar sobre uma parceria.',
  },
  publico: {
    nome: 'Setor público (licitações e dispensas)', icone: '🏛️', peso: 18, servico: 'Obras, reformas e manutenção predial para órgãos públicos',
    mensagem: '',
  },
  aprovacao_gestao: {
    nome: 'Aprovações, regularização e gerenciamento', icone: '📋', peso: 20, servico: 'Aprovação na prefeitura, regularização em cartório, gerenciamento de obra',
    mensagem: '{saudacao}, {nome}! Aqui é da {empresa}. Cuidamos de aprovações na prefeitura, regularização de imóveis e gerenciamento de obras. Se você tem uma obra ou imóvel que precisa disso, posso explicar como funciona sem compromisso?',
  },
  outros: { nome: 'Outros', icone: '📌', peso: 5, servico: '—', mensagem: '{saudacao}, {nome}! Aqui é da {empresa}. Posso te apresentar nossos serviços de obras e reformas?' },
}

export const MOTIVOS_DESCARTE = [
  'Sem interesse', 'Já tem fornecedor', 'Fora da nossa região', 'Valor/porte incompatível', 'Contato errado ou inexistente',
  'Prazo do edital inviável', 'Exige habilitação que não temos', 'Não contatar mais', 'Duplicado',
]

// ── Telefone / WhatsApp ───────────────────────────────────────────────────────────
export function soDigitos(v?: string | null) { return (v || '').replace(/\D/g, '') }

export function normalizarTelefone(raw?: string | null): { digitos: string; celular: boolean } | null {
  let d = soDigitos(raw)
  if (!d) return null
  d = d.replace(/^0+/, '')
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
  if (d.length !== 10 && d.length !== 11) return null
  return { digitos: d, celular: d.length === 11 && d[2] === '9' }
}

export function linkWhatsApp(telefone: string | null | undefined, texto: string): string | null {
  const t = normalizarTelefone(telefone)
  if (!t || !t.celular) return null
  return `https://wa.me/55${t.digitos}?text=${encodeURIComponent(texto)}`
}

export function saudacao(hora = new Date().getHours()) {
  return hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
}

export function montarMensagem(p: { nome: string; segmento: string }, templates?: Record<string, string> | null, empresa = 'Inverso'): string {
  const modelo = (templates && templates[p.segmento]) || SEGMENTOS[p.segmento]?.mensagem || SEGMENTOS.outros.mensagem
  const primeiro = (p.nome || '').trim().split(/\s+/)[0]
  const nome = p.segmento === 'empresa' || p.segmento === 'condominio' || p.segmento === 'parceiro_b2b' ? (p.nome || primeiro) : primeiro
  return modelo.replace(/\{nome\}/g, nome).replace(/\{empresa\}/g, empresa).replace(/\{saudacao\}/g, saudacao())
}

// ── Editais: o objeto combina com o que a Inverso faz? ─────────────────────────────
const INCLUIR_PADRAO = [
  'reforma', 'constru[cç][aã]o', 'amplia[cç][aã]o', 'manuten[cç][aã]o predial', 'obras? de engenharia', 'servi[cç]os? (comuns )?de engenharia',
  'pintura', 'impermeabiliza', 'recupera[cç][aã]o (estrutural|de (pr[eé]dio|edifica|fachada|telhado|cobertura))', 'cobertura', 'telhado',
  'adequa[cç][aã]o (de|do|da|dos|das) (pr[eé]dio|edif|unidade|espa[cç]o|im[oó]vel|escola|sala|ambiente|acessibilidade)', 'acessibilidade',
  'demoli[cç][aã]o', 'alvenaria', 'reparos? (predial|civil)', 'obras? civis?',
]
// Palavras que sozinhas também aparecem em compra de produto ("piso emborrachado"): só valem se o texto for de serviço
const INCLUIR_FRACAS = ['revestimento', 'piso', 'forro', 'muro', 'quadra', 'banheiro', 'sanit[aá]rio', 'cerca', 'rampa', 'port[aã]o', 'grade']
const SINAL_SERVICO = /(contrata[cç][aã]o|servi[cç]os?|execu[cç][aã]o|instala[cç][aã]o|substitui[cç][aã]o|remo[cç][aã]o|empresa especializada|reforma|obra)/
// Exclusões que não valem quando o edital é, de fato, contratação de obra/serviço de engenharia ("reforma com fornecimento de material")
const EXCLUSOES_BRANDAS = ['equipamento', 'fornecimento de (material|materiais|equipamento)']
const SERVICO_FORTE = /(servi[cç]os? (comuns )?de engenharia|execu[cç][aã]o d[eao]s? (obra|servi[cç]os? de)|obras? (civis?|de)|reforma d[aoe]|contrata[cç][aã]o de empresa[^.]{0,80}(reforma|obra|constru|pintura))/
const EXCLUIR_PADRAO = [
  've[ií]culo', 'equipamento', 'mobili[aá]rio', 'software', 'ar[- ]condicionado', 'el[ei]vador', 'medicamento', 'aliment', 'merenda', 'uniforme',
  'reforma tribut', 'reforma agr', '[oó]rtese', 'pr[oó]tese', 'laudo', 'cr[eé]dito', 'consultoria', 'treinamento', 'licen[cç]a', 'topogr', 'did[aá]tic', 'laborat[oó]rio', 'desinsetiza', 'desratiza', 'estacionamento rotativo',
  'aquisi[cç][aã]o de', 'fornecimento de (material|materiais|equipamento)', 'loca[cç][aã]o de', 'm[aá]quina', 've[ií]culos',
]

export function classificarEdital(objeto: string, extraIncluir?: string[] | null, extraExcluir?: string[] | null): { ok: boolean; tipo: string; motivo?: string } {
  const txt = (objeto || '').toLowerCase()
  const montar = (base: string[], extra?: string[] | null) => new RegExp('(' + [...base, ...(extra || []).map(e => e.trim()).filter(Boolean).map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))].join('|') + ')', 'i')
  const exc = montar(EXCLUIR_PADRAO, extraExcluir)
  const inc = montar(INCLUIR_PADRAO, extraIncluir)
  const achouExc = exc.exec(txt)
  const brando = achouExc && EXCLUSOES_BRANDAS.some(b => new RegExp('^(' + b + ')$', 'i').test(achouExc[1])) && SERVICO_FORTE.test(txt) && !/^s*aquisi/.test(txt)
  if (achouExc && !brando) return { ok: false, tipo: '', motivo: 'fora do escopo (' + achouExc[1] + ')' }
  const achouInc = inc.exec(txt)
  if (!achouInc) { if (!(new RegExp(INCLUIR_FRACAS.join('|'), 'i').test(txt) && SINAL_SERVICO.test(txt))) return { ok: false, tipo: '', motivo: 'sem palavra de obra/reforma' } }
  const tipo = /constru[cç][aã]o|nova sede|obra nova/.test(txt) ? 'Construção' : /amplia[cç][aã]o/.test(txt) ? 'Ampliação' : /manuten[cç][aã]o|reparos?/.test(txt) ? 'Manutenção' : /reforma|adequa[cç][aã]o|recupera[cç][aã]o/.test(txt) ? 'Reforma' : 'Obra/Engenharia'
  return { ok: true, tipo }
}

export function resumirObjeto(objeto: string, max = 150): string {
  let t = (objeto || '').replace(/\s+/g, ' ').trim()
  t = t.replace(/^(descri[cç][aã]o\.?\s*)?(constitui objeto d[ao] presente (edital|contrata[cç][aã]o|licita[cç][aã]o)\s*(a|o)?\s*)/i, '')
  t = t.replace(/^(o objeto d[ao] presente (licita[cç][aã]o|contrata[cç][aã]o|edital) [ée] a?\s*)/i, '')
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : t
}

// ── Pontuação de aderência (0–100) ─────────────────────────────────────────────────
export interface ConfigScore { bairros?: string[] | null; valor_min_edital?: number | null; valor_max_edital?: number | null }
export interface ItemScore { rotulo: string; pontos: number; max: number; nota?: string }

const semAcento = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function diasEntre(deISO: string, ateISO: string) {
  const a = Date.UTC(+deISO.slice(0, 4), +deISO.slice(5, 7) - 1, +deISO.slice(8, 10))
  const b = Date.UTC(+ateISO.slice(0, 4), +ateISO.slice(5, 7) - 1, +ateISO.slice(8, 10))
  return Math.round((b - a) / 86400000)
}

export function calcularScore(p: any, cfg: ConfigScore = {}, hoje = new Date().toISOString().slice(0, 10)): { score: number; detalhe: ItemScore[] } {
  const detalhe: ItemScore[] = []
  const edital = p.tipo_abordagem === 'edital'

  // 1) Gatilho: por que falar com esta pessoa AGORA (0–35)
  let g = 15, gNota = 'sem evento específico'
  if (edital) {
    const d = p.prazo ? diasEntre(hoje, String(p.prazo).slice(0, 10)) : 7
    if (d >= 7) { g = 35; gNota = `edital aberto, ${d} dias para a proposta` }
    else if (d >= 4) { g = 28; gNota = `edital aberto, ${d} dias (prazo curto)` }
    else if (d >= 2) { g = 12; gNota = `só ${d} dias para a proposta` }
    else { g = 0; gNota = 'prazo praticamente encerrado' }
  } else if (p.fonte === 'receita') {
    const a = p.gatilho_data ? diasEntre(String(p.gatilho_data).slice(0, 10), hoje) : 999
    if (a <= 30) { g = 35; gNota = 'empresa aberta há menos de 30 dias' } else if (a <= 90) { g = 28; gNota = 'empresa aberta há menos de 90 dias' }
    else if (a <= 180) { g = 18; gNota = 'empresa aberta há menos de 6 meses' } else { g = 8; gNota = 'empresa já estabelecida' }
  } else if (p.fonte === 'indicacao') { g = 35; gNota = 'veio por indicação' }
  else if (p.fonte === 'google') { g = 12; gNota = 'empresa do segmento (sem evento recente)' }
  else if (p.gatilho) { g = 22; gNota = 'sinal de compra informado' }
  detalhe.push({ rotulo: 'Momento de compra', pontos: g, max: 35, nota: gNota })

  // 2) Segmento (0–25)
  const peso = SEGMENTOS[p.segmento]?.peso ?? SEGMENTOS.outros.peso
  detalhe.push({ rotulo: 'Encaixe com nossos serviços', pontos: peso, max: 25, nota: SEGMENTOS[p.segmento]?.nome || 'Outros' })

  // 3) Região (0–15)
  const capital = semAcento(p.cidade || '') === 'sao paulo' && (!p.uf || String(p.uf).toUpperCase() === 'SP')
  const bairroPrio = !!p.bairro && (cfg.bairros || []).some(b => semAcento(b) === semAcento(p.bairro))
  let l = 0, lNota = 'fora da região atendida'
  if (capital) { l = bairroPrio ? 15 : 12; lNota = bairroPrio ? 'capital, bairro prioritário' : 'capital de São Paulo' }
  else if (String(p.uf || '').toUpperCase() === 'SP') { l = 6; lNota = 'estado de SP, fora da capital' }
  detalhe.push({ rotulo: 'Região', pontos: l, max: 15, nota: lNota })

  // 4) Contato (0–15)
  const tel = normalizarTelefone(p.whatsapp) || normalizarTelefone(p.telefone)
  let c = 0, cNota = 'sem forma de contato'
  if (tel?.celular) { c = 15; cNota = 'WhatsApp/celular' } else if (tel) { c = 9; cNota = 'telefone fixo' }
  else if (p.email) { c = 6; cNota = 'só e-mail' }
  else if (edital && p.link_origem) { c = 12; cNota = 'acesso direto ao edital' }
  detalhe.push({ rotulo: 'Facilidade de contato', pontos: c, max: 15, nota: cNota })

  // 5) Porte do negócio (0–10)
  let t = 6, tNota = 'porte não informado'
  if (edital) {
    const v = Number(p.valor_estimado) || 0
    const min = cfg.valor_min_edital ?? 20000, max = cfg.valor_max_edital ?? 3000000
    if (v <= 0) { t = 5; tNota = 'valor não divulgado' }
    else if (v < min) { t = 3; tNota = 'valor baixo para o esforço' }
    else if (v <= max) { t = 10; tNota = 'valor dentro da nossa capacidade' }
    else if (v <= max * 2) { t = 4; tNota = 'valor alto — exige estrutura maior' }
    else { t = 0; tNota = 'valor muito acima da nossa capacidade' }
  }
  detalhe.push({ rotulo: 'Porte do negócio', pontos: t, max: 10, nota: tNota })

  let score = detalhe.reduce((a, d) => a + d.pontos, 0)
  if (c === 0) score = Math.min(score, 30) // sem como falar com a pessoa, não vai para a fila
  return { score: Math.max(0, Math.min(100, Math.round(score))), detalhe }
}

export function corScore(score: number) {
  return score >= 75 ? 'bg-primary-container/15 text-primary-container border-primary-container/30' : score >= 55 ? 'bg-tertiary/10 text-tertiary border-tertiary/30' : 'bg-surface-variant text-on-surface-variant border-outline-variant'
}

export function dataBR(iso?: string | null) {
  if (!iso) return '—'
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

// "Hoje" no horário de Brasília (o servidor roda em UTC; depois das 21h o toISOString já seria o dia seguinte).
export function hojeBR(): string {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
}
export function somarDiasISO(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
