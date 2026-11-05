// Prazo de execução de uma obra a partir dos itens do orçamento — regra única usada na proposta (PDF), na
// transformação em obra e no cronograma gerado a partir do orçamento.
//
// COMO O PRAZO É CALCULADO
// 1) Horas de cada item (tempo de uma equipe, jornada de 8 h):
//      • "horas por unidade"        → tempo × quantidade   (0,2 h/m² de pintura × 80 m² = 16 h)
//      • "dias por unidade"         → tempo × 8 h × quantidade
//      • "dias — serviço completo"  → tempo × 8 h, SEM multiplicar (ex.: "demolição do banheiro: 3 dias")
//    Itens de apoio (gerenciamento técnico, ART/RRT, caçamba, "fornecimento de..." sem instalação) não entram na
//    fila de trabalho: gerenciamento acompanha a obra inteira; os demais são feitos no começo.
// 2) Ordem de execução em FASES (preliminares → demolição → estrutura/contrapiso → alvenaria → impermeabilização →
//    instalações → revestimentos → esquadrias → louças/marcenaria → pintura → limpeza). Um serviço só começa quando
//    os das fases anteriores DO MESMO AMBIENTE (e os da obra toda) terminaram; ambientes diferentes andam ao mesmo
//    tempo. Impermeabilização e contrapiso têm 2 dias de cura antes da fase seguinte.
// 3) Equipes: cada especialidade (categoria) tem a sua equipe; as de maior volume (demolição, revestimentos,
//    pintura...) têm 2 (3 no ritmo acelerado). Itens da mesma especialidade ocupam a próxima equipe livre.
//    O prazo final é quando a última equipe termina.
import { CATEGORIAS_SERVICO, dataParaISO, proximoDiaUtil } from './cronograma'

export type Ritmo = 'sequencial' | 'equilibrado' | 'acelerado'
export const RITMO_PADRAO: Ritmo = 'equilibrado'
export const RITMOS: { id: Ritmo; titulo: string; descricao: string }[] = [
  { id: 'sequencial', titulo: 'Sequencial (uma equipe só)', descricao: 'Um serviço de cada vez, todos em fila — o prazo máximo, só para comparação.' },
  { id: 'equilibrado', titulo: 'Equilibrado (recomendado)', descricao: 'Uma equipe por especialidade (2 nas de maior volume) e os ambientes andam ao mesmo tempo.' },
  { id: 'acelerado', titulo: 'Acelerado (equipes reforçadas)', descricao: 'Equipes reforçadas e a fase seguinte já começa com 70% da anterior concluída.' },
]
export const ritmoValido = (r: any): Ritmo => (r === 'sequencial' || r === 'acelerado' ? r : RITMO_PADRAO)

export const HORAS_JORNADA = 8
const SOBREPOSICAO_ACELERADO = 0.3

// Fases da obra, na ordem real de execução. Categoria desconhecida/vazia cai em "Outros".
const FASES: string[][] = [
  ['Serviços Preliminares'],
  ['Demolição e Remoção'],
  ['Terraplanagem e Fundação'],
  ['Estrutura'],
  ['Alvenaria', 'Cobertura'],
  ['Impermeabilização'],
  ['Instalações Elétricas', 'Instalações Hidráulicas', 'Instalações de Gás', 'Instalações de Incêndio', 'Climatização (AC)'],
  ['Revestimento de Parede', 'Revestimento de Piso', 'Forro', 'Outros'],
  ['Esquadrias', 'Vidraçaria', 'Serralheria', 'Marmoraria'],
  ['Louças e Metais', 'Marcenaria'],
  ['Pintura'],
  ['Mobiliário', 'Paisagismo'],
  ['Limpeza Pós-Obra'],
]
const FASE_OUTROS = FASES.findIndex(f => f.includes('Outros'))
export function faseDaCategoria(categoria: string | null | undefined): number {
  const i = FASES.findIndex(f => f.includes(categoria || ''))
  return i === -1 ? FASE_OUTROS : i
}
// as categorias conhecidas precisam estar todas mapeadas
export const CATEGORIAS_SEM_FASE = CATEGORIAS_SERVICO.filter(c => !FASES.some(f => f.includes(c)))

// Especialidades de maior volume de trabalho: ganham mais de uma equipe.
const ESPECIALIDADES_DE_VOLUME = new Set(['Demolição e Remoção', 'Estrutura', 'Alvenaria', 'Impermeabilização', 'Revestimento de Parede', 'Revestimento de Piso', 'Forro', 'Pintura'])
export function equipesDaEspecialidade(categoria: string, ritmo: Ritmo): number {
  if (ritmo === 'sequencial') return 1
  const volume = ESPECIALIDADES_DE_VOLUME.has(categoria)
  if (ritmo === 'acelerado') return volume ? 3 : 2
  return volume ? 2 : 1
}
// Cura/espera técnica (em horas de obra) antes de a fase seguinte poder usar o serviço.
const ESPERA_APOS_H: Record<string, number> = { 'Impermeabilização': 2 * HORAS_JORNADA, 'Estrutura': 2 * HORAS_JORNADA }

// ── Itens de apoio ───────────────────────────────────────────────────────────────
const RE_OBRA_TODA = /gerenciamento|acompanhamento t[eé]cnico|fiscaliza[cç][aã]o|administra[cç][aã]o de obra/i
const RE_APOIO = /\bART\b|\bRRT\b|ca[cç]amba|alvar[aá]|licen[cç]a|\btaxa/i
const RE_SO_FORNECIMENTO = /^\s*fornecimento\s+de\b/i // "Fornecimento de caçamba" (sem "e instalação")
export type TipoItem = 'normal' | 'obra_toda' | 'apoio'
export function tipoDoItem(item: any): TipoItem {
  const nome = String(item?.servico || '')
  if (RE_OBRA_TODA.test(nome)) return 'obra_toda'
  if (RE_APOIO.test(nome) || RE_SO_FORNECIMENTO.test(nome)) return 'apoio'
  return 'normal'
}

export interface DuracaoItem { horas: number; semTempo: boolean; tipo: TipoItem; regra: 'por_unidade' | 'servico_completo' | 'sem_tempo' | 'apoio' }

// Horas de trabalho do item. O tempo do banco de itens tem prioridade sobre o do próprio item.
export function horasDoItem(item: any, bancoItens: any[]): DuracaoItem {
  const tipo = tipoDoItem(item)
  if (tipo !== 'normal') return { horas: 0, semTempo: false, tipo, regra: 'apoio' }
  const bi = item.banco_item_id ? bancoItens.find(b => b.id === item.banco_item_id) : null
  const valorBanco = bi?.tempo_execucao ? parseFloat(bi.tempo_execucao) : 0
  const valorProprio = item.tempo_execucao ? parseFloat(item.tempo_execucao) : 0
  const valor = valorBanco > 0 ? valorBanco : valorProprio
  if (!(valor > 0)) return { horas: HORAS_JORNADA, semTempo: true, tipo, regra: 'sem_tempo' }
  const unidade: string = valorBanco > 0 ? bi?.tempo_execucao_unidade : item.tempo_execucao_unidade
  const qtd = parseFloat(item.quantidade); const q = qtd > 0 ? qtd : 1
  if (unidade === 'horas') return { horas: valor * q, semTempo: false, tipo, regra: 'por_unidade' }
  if (unidade === 'dias_un') return { horas: valor * HORAS_JORNADA * q, semTempo: false, tipo, regra: 'por_unidade' }
  return { horas: valor * HORAS_JORNADA, semTempo: false, tipo, regra: 'servico_completo' } // 'dias' = serviço completo
}

export interface ItemAgendado { item: any; horas: number; inicioH: number; fimH: number; inicioDia: number; fimDia: number; tipo: TipoItem }
export interface ResumoEspecialidade { categoria: string; horas: number; equipes: number; dias: number }
export interface Estimativa {
  itens: ItemAgendado[]                  // na mesma ordem dos itens recebidos
  totalDias: number                      // dias úteis do início ao fim
  totalDiasSequencial: number            // dias úteis se tudo fosse em fila (uma equipe só)
  totalHoras: number                     // horas de trabalho (sem os itens de apoio)
  especialidades: ResumoEspecialidade[]  // onde está o tempo (maior primeiro)
  apoio: string[]                        // itens que não entram na fila (gerenciamento, ART, caçamba...)
  semTempo: number                       // itens sem tempo cadastrado (contados como 1 dia)
  longos: { servico: string; horas: number }[] // itens muito longos: vale conferir o tempo cadastrado
}

const ehGeral = (nome: string) => /^\s*(geral|obra|obra toda|toda a obra|todos|todas|comum|[aá]reas? comuns?)\s*$/i.test(nome)

export function estimarCronograma(itens: any[], bancoItens: any[], ritmo: Ritmo = RITMO_PADRAO, ambientes: any[] = []): Estimativa {
  const dur = itens.map(i => horasDoItem(i, bancoItens))
  const horas = dur.map(d => d.horas)
  const totalHoras = horas.reduce((a, b) => a + b, 0)
  const cat = (it: any) => (it.categoria && CATEGORIAS_SERVICO.includes(it.categoria) ? it.categoria : 'Outros')
  const ag: { inicioH: number; fimH: number }[] = itens.map(() => ({ inicioH: 0, fimH: 0 }))

  // ambiente de cada item: null = obra toda ("Geral" ou sem ambiente)
  const ambPorId = new Map<string, any>(ambientes.map((a: any) => [a.id, a]))
  const ambDe = (it: any): string | null => {
    const a = it.ambiente_id ? ambPorId.get(it.ambiente_id) : null
    if (!it.ambiente_id || (a && ehGeral(a.nome || ''))) return null
    return it.ambiente_id
  }
  const ordemAmb = (it: any) => { const a = it.ambiente_id ? ambPorId.get(it.ambiente_id) : null; return a?.ordem ?? 0 }

  const fila = itens.map((it, i) => i).filter(i => dur[i].tipo === 'normal')
  if (ritmo === 'sequencial') {
    let t = 0
    for (const i of fila) { ag[i] = { inicioH: t, fimH: t + horas[i] }; t += horas[i] }
  } else {
    const ov = ritmo === 'acelerado' ? SOBREPOSICAO_ACELERADO : 0
    const fase = itens.map(it => faseDaCategoria(it.categoria))
    const amb = itens.map(ambDe)
    // prioridade: fase, depois ambiente, depois a ordem original
    const ordem = [...fila].sort((a, b) => fase[a] - fase[b] || ordemAmb(itens[a]) - ordemAmb(itens[b]) || a - b)
    const equipes = new Map<string, number[]>() // por especialidade: horário em que cada equipe fica livre
    const prontoPara = new Map<number, number>() // item → horário a partir do qual libera quem vem depois
    const feitos: number[] = []
    for (const i of ordem) {
      // espera os serviços anteriores do mesmo ambiente (ou da obra toda)
      let est = 0
      for (const j of feitos) {
        if (fase[j] >= fase[i]) continue
        if (amb[j] !== amb[i] && amb[j] !== null && amb[i] !== null) continue
        // a limpeza final espera tudo terminar de verdade (sem a sobreposição do ritmo acelerado)
        est = Math.max(est, fase[i] === FASES.length - 1 ? (ag[j].fimH + (ESPERA_APOS_H[cat(itens[j])] || 0)) : (prontoPara.get(j) || 0))
      }
      const c = cat(itens[i])
      if (!equipes.has(c)) equipes.set(c, Array(equipesDaEspecialidade(c, ritmo)).fill(0))
      const livres = equipes.get(c)!
      let k = 0; for (let x = 1; x < livres.length; x++) if (livres[x] < livres[k]) k = x
      const inicio = Math.max(est, livres[k]), fim = inicio + horas[i]
      livres[k] = fim
      ag[i] = { inicioH: inicio, fimH: fim }
      prontoPara.set(i, inicio + (1 - ov) * (fim - inicio) + (ESPERA_APOS_H[c] || 0))
      feitos.push(i)
    }
  }

  const fimTrabalho = fila.length ? Math.max(...fila.map(i => ag[i].fimH)) : 0
  // apoio: gerenciamento acompanha a obra inteira; ART, caçamba etc. ficam no começo
  itens.forEach((_, i) => {
    if (dur[i].tipo === 'obra_toda') ag[i] = { inicioH: 0, fimH: fimTrabalho }
    else if (dur[i].tipo === 'apoio') ag[i] = { inicioH: 0, fimH: 0 }
  })

  const resultado: ItemAgendado[] = itens.map((item, i) => {
    const inicioDia = Math.floor(ag[i].inicioH / HORAS_JORNADA + 1e-9)
    const fimDia = Math.max(inicioDia, Math.ceil(ag[i].fimH / HORAS_JORNADA - 1e-9) - 1)
    return { item, horas: horas[i], inicioH: ag[i].inicioH, fimH: ag[i].fimH, inicioDia, fimDia, tipo: dur[i].tipo }
  })
  const totalDias = Math.max(1, Math.ceil(fimTrabalho / HORAS_JORNADA - 1e-9))

  const porEsp = new Map<string, number>()
  fila.forEach(i => porEsp.set(cat(itens[i]), (porEsp.get(cat(itens[i])) || 0) + horas[i]))
  const especialidades = [...porEsp.entries()].map(([categoria, h]) => {
    const eq = equipesDaEspecialidade(categoria, ritmo)
    return { categoria, horas: h, equipes: eq, dias: Math.ceil(h / eq / HORAS_JORNADA - 1e-9) }
  }).sort((a, b) => b.dias - a.dias)

  return {
    itens: resultado, totalDias, totalDiasSequencial: Math.max(1, Math.ceil(totalHoras / HORAS_JORNADA - 1e-9)), totalHoras, especialidades,
    apoio: itens.filter((_, i) => dur[i].tipo !== 'normal').map(it => String(it.servico || '')),
    semTempo: dur.filter(d => d.semTempo).length,
    longos: fila.filter(i => horas[i] >= 5 * HORAS_JORNADA).sort((a, b) => horas[b] - horas[a]).slice(0, 3).map(i => ({ servico: String(itens[i].servico || ''), horas: horas[i] })),
  }
}

// n-ésimo dia de trabalho (0 = primeiro dia útil a partir de `inicio`), respeitando os dias da semana da obra.
export function diaUtilNumero(inicio: Date, n: number, regime: string): Date {
  let atual = proximoDiaUtil(inicio, regime)
  for (let k = 0; k < n; k++) {
    atual = new Date(atual)
    atual.setDate(atual.getDate() + 1)
    atual = proximoDiaUtil(atual, regime)
  }
  return atual
}

// Datas de cada item ({ item, inicio, fim } em AAAA-MM-DD).
export function calcularDatasOrcamento(itens: any[], dataInicioISO: string, regime: string, bancoItens: any[], ritmo: Ritmo = RITMO_PADRAO, ambientes: any[] = []) {
  const inicio = new Date(dataInicioISO + 'T00:00:00')
  const est = estimarCronograma(itens, bancoItens, ritmo, ambientes)
  return est.itens.map(r => ({ item: r.item, inicio: dataParaISO(diaUtilNumero(inicio, r.inicioDia, regime)), fim: dataParaISO(diaUtilNumero(inicio, r.fimDia, regime)) }))
}

// Prazo da proposta em dias corridos (do primeiro dia útil até o último dia de trabalho).
export function calcularPrazoProposta(itens: any[], bancoItens: any[], regime: string, ritmo: Ritmo = RITMO_PADRAO, inicioBase: Date = new Date(), ambientes: any[] = []) {
  const base = new Date(inicioBase); base.setHours(0, 0, 0, 0)
  const est = estimarCronograma(itens, bancoItens, ritmo, ambientes)
  const primeiro = diaUtilNumero(base, 0, regime)
  const ultimo = diaUtilNumero(base, est.totalDias - 1, regime)
  const ultimoSeq = diaUtilNumero(base, est.totalDiasSequencial - 1, regime)
  const corridos = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000) + 1
  return {
    prazoDias: corridos(primeiro, ultimo), prazoDiasSequencial: corridos(primeiro, ultimoSeq), diasUteis: est.totalDias, diasUteisSequencial: est.totalDiasSequencial,
    horas: est.totalHoras, estimativa: est,
  }
}
