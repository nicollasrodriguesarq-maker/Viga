// Prazo de execução de uma obra a partir dos itens do orçamento — regra única usada na proposta (PDF), na
// transformação em obra e no cronograma gerado a partir do orçamento.
//
// 1) Quantidade: o tempo de execução cadastrado no item/banco é POR UNIDADE (1 m², 1 un...). O tempo do item no
//    orçamento = tempo por unidade × quantidade (1 m² de piso = 1 h → 5 m² = 5 h). Jornada de 8 h por dia.
//    Item sem tempo cadastrado conta 1 dia no total (não dá para saber a escala).
// 2) Trabalho em paralelo: a obra é organizada em FASES na ordem real de execução (preliminares → demolição →
//    estrutura → alvenaria/cobertura → instalações → revestimentos → esquadrias → acabamentos → pintura → limpeza).
//    Dentro de uma fase, especialidades diferentes trabalham ao mesmo tempo (ex.: elétrica e hidráulica); itens da
//    mesma especialidade seguem em fila (uma equipe por especialidade). A duração da fase é a da especialidade mais
//    longa. As fases acontecem uma depois da outra — no ritmo "Acelerado", a fase seguinte já começa quando a anterior
//    está com 70% concluído.
import { CATEGORIAS_SERVICO, dataParaISO, proximoDiaUtil } from './cronograma'

export type Ritmo = 'sequencial' | 'equilibrado' | 'acelerado'
export const RITMO_PADRAO: Ritmo = 'equilibrado'
export const RITMOS: { id: Ritmo; titulo: string; descricao: string }[] = [
  { id: 'sequencial', titulo: 'Sequencial', descricao: 'Um serviço de cada vez, todos em fila (prazo mais longo e mais seguro).' },
  { id: 'equilibrado', titulo: 'Equilibrado (recomendado)', descricao: 'Especialidades diferentes da mesma fase andam juntas (ex.: elétrica e hidráulica).' },
  { id: 'acelerado', titulo: 'Acelerado', descricao: 'Como o equilibrado, e a fase seguinte começa quando a anterior está com 70% concluído.' },
]
export const ritmoValido = (r: any): Ritmo => (r === 'sequencial' || r === 'acelerado' ? r : RITMO_PADRAO)

export const HORAS_JORNADA = 8
const SOBREPOSICAO_ACELERADO = 0.3

// Fases da obra (cada fase agrupa as especialidades que podem andar juntas). Categoria desconhecida/vazia cai em "Outros".
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

export interface DuracaoItem { horas: number; semTempo: boolean }

// Horas de trabalho do item no orçamento (tempo por unidade × quantidade). O tempo do banco de itens tem prioridade.
export function horasDoItem(item: any, bancoItens: any[]): DuracaoItem {
  const bi = item.banco_item_id ? bancoItens.find(b => b.id === item.banco_item_id) : null
  const valorBanco = bi?.tempo_execucao ? parseFloat(bi.tempo_execucao) : 0
  const valorProprio = item.tempo_execucao ? parseFloat(item.tempo_execucao) : 0
  const valor = valorBanco > 0 ? valorBanco : valorProprio
  if (!(valor > 0)) return { horas: HORAS_JORNADA, semTempo: true }
  const unidade = valorBanco > 0 ? bi?.tempo_execucao_unidade : item.tempo_execucao_unidade
  const porUnidade = unidade === 'horas' ? valor : valor * HORAS_JORNADA
  const qtd = parseFloat(item.quantidade)
  return { horas: porUnidade * (qtd > 0 ? qtd : 1), semTempo: false }
}

export interface ItemAgendado { item: any; horas: number; inicioH: number; fimH: number; inicioDia: number; fimDia: number }
export interface Estimativa {
  itens: ItemAgendado[]       // na mesma ordem dos itens recebidos
  totalDias: number           // dias úteis do início ao fim (com o paralelismo do ritmo escolhido)
  totalDiasSequencial: number // dias úteis se tudo fosse em fila
  totalHoras: number
}

const diasDe = (h: number) => Math.max(1, Math.ceil(h / HORAS_JORNADA - 1e-9))

export function estimarCronograma(itens: any[], bancoItens: any[], ritmo: Ritmo = RITMO_PADRAO): Estimativa {
  const horas = itens.map(i => horasDoItem(i, bancoItens).horas)
  const totalHoras = horas.reduce((a, b) => a + b, 0)
  const ag: { inicioH: number; fimH: number }[] = itens.map(() => ({ inicioH: 0, fimH: 0 }))

  if (ritmo === 'sequencial') {
    let t = 0
    itens.forEach((_, i) => { ag[i] = { inicioH: t, fimH: t + horas[i] }; t += horas[i] })
  } else {
    // fases em ordem; em cada fase, uma "fila" por especialidade
    const fases = new Map<number, Map<string, number[]>>()
    itens.forEach((it, i) => {
      const f = faseDaCategoria(it.categoria)
      const cat = it.categoria && CATEGORIAS_SERVICO.includes(it.categoria) ? it.categoria : 'Outros'
      if (!fases.has(f)) fases.set(f, new Map())
      const filas = fases.get(f)!
      filas.set(cat, [...(filas.get(cat) || []), i])
    })
    let inicioFase = 0
    let fimGeral = 0
    for (const f of [...fases.keys()].sort((a, b) => a - b)) {
      // a limpeza final só começa depois que todo o resto terminou (nem no ritmo acelerado)
      if (f === FASES.length - 1) inicioFase = Math.max(inicioFase, fimGeral)
      let fimFase = inicioFase
      for (const indices of fases.get(f)!.values()) {
        let t = inicioFase
        for (const i of indices) { ag[i] = { inicioH: t, fimH: t + horas[i] }; t += horas[i] }
        fimFase = Math.max(fimFase, t)
      }
      fimGeral = Math.max(fimGeral, fimFase)
      inicioFase = ritmo === 'acelerado' ? inicioFase + (fimFase - inicioFase) * (1 - SOBREPOSICAO_ACELERADO) : fimFase
    }
  }

  const resultado: ItemAgendado[] = itens.map((item, i) => {
    const inicioDia = Math.floor(ag[i].inicioH / HORAS_JORNADA + 1e-9)
    const fimDia = Math.max(inicioDia, Math.ceil(ag[i].fimH / HORAS_JORNADA - 1e-9) - 1)
    return { item, horas: horas[i], inicioH: ag[i].inicioH, fimH: ag[i].fimH, inicioDia, fimDia }
  })
  const totalDias = itens.length ? Math.max(...resultado.map(r => r.fimDia)) + 1 : 1
  return { itens: resultado, totalDias, totalDiasSequencial: diasDe(totalHoras), totalHoras }
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

// Datas de cada item (mesmo formato de antes: { item, inicio, fim } em AAAA-MM-DD).
export function calcularDatasOrcamento(itens: any[], dataInicioISO: string, regime: string, bancoItens: any[], ritmo: Ritmo = RITMO_PADRAO) {
  const inicio = new Date(dataInicioISO + 'T00:00:00')
  const est = estimarCronograma(itens, bancoItens, ritmo)
  return est.itens.map(r => ({ item: r.item, inicio: dataParaISO(diaUtilNumero(inicio, r.inicioDia, regime)), fim: dataParaISO(diaUtilNumero(inicio, r.fimDia, regime)) }))
}

// Prazo da proposta em dias corridos (do primeiro dia útil até o último dia de trabalho).
export function calcularPrazoProposta(itens: any[], bancoItens: any[], regime: string, ritmo: Ritmo = RITMO_PADRAO, inicioBase: Date = new Date()) {
  const base = new Date(inicioBase); base.setHours(0, 0, 0, 0)
  const est = estimarCronograma(itens, bancoItens, ritmo)
  const primeiro = diaUtilNumero(base, 0, regime)
  const ultimo = diaUtilNumero(base, est.totalDias - 1, regime)
  const ultimoSeq = diaUtilNumero(base, est.totalDiasSequencial - 1, regime)
  const corridos = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000) + 1
  return { prazoDias: corridos(primeiro, ultimo), prazoDiasSequencial: corridos(primeiro, ultimoSeq), diasUteis: est.totalDias, diasUteisSequencial: est.totalDiasSequencial, horas: est.totalHoras }
}
