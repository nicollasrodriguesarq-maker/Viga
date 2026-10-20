// Revisões de proposta (REV00, REV01, ...).
//
// Modelo: o orçamento "vigente" mantém o mesmo id, o mesmo código e todos os vínculos (levantamento, lead do CRM,
// obra). Ao criar uma nova revisão, o estado atual é guardado como uma CÓPIA (snapshot) — um orçamento com
// `revisao_de = id do vigente`, só leitura, código "<código>-REVnn" — e o vigente passa a ser a revisão seguinte.
// Assim nenhuma outra tela precisa saber de revisões: elas continuam enxergando um orçamento por proposta.
export const rotuloRev = (n: any) => 'REV' + String(Number(n) || 0).padStart(2, '0')
export const codigoBase = (codigo: string) => (codigo || '').replace(/-REV\d+$/, '')
export const codigoComRev = (o: any) => codigoBase(o?.codigo) + ' · ' + rotuloRev(o?.revisao)
export const ehRevisaoAntiga = (o: any) => !!o?.revisao_de

const num = (x: any) => parseFloat(x || 0) || 0
const r2 = (n: number) => Math.round(n * 100) / 100

// Total do item como a tela de orçamento calcula: o campo total_item já guarda o valor com lucro/imposto.
export function totalItem(i: any) { return num(i.total_item) }

export interface ItemDiff { chave: string; ambiente: string; servico: string; descricao: string; de?: any; para?: any; mudancas?: { campo: string; de: any; para: any }[] }
export interface ResultadoDiff { adicionados: ItemDiff[]; removidos: ItemDiff[]; alterados: ItemDiff[]; totalDe: number; totalPara: number }

// Compara os itens de duas revisões. Identifica o mesmo item por ambiente + serviço + descrição (se houver
// repetidos, pela ordem em que aparecem).
export function compararRevisoes(itensDe: any[], ambDe: any[], itensPara: any[], ambPara: any[]): ResultadoDiff {
  const nomeAmb = (lista: any[], id: string) => lista.find(a => a.id === id)?.nome || ''
  const indexar = (itens: any[], amb: any[]) => {
    const m = new Map<string, any>()
    const cont: Record<string, number> = {}
    for (const i of itens) {
      const base = [nomeAmb(amb, i.ambiente_id), (i.servico || '').trim().toLowerCase(), (i.descricao || '').trim().toLowerCase()].join('|')
      cont[base] = (cont[base] || 0) + 1
      m.set(base + '#' + cont[base], { item: i, ambiente: nomeAmb(amb, i.ambiente_id) })
    }
    return m
  }
  const A = indexar(itensDe, ambDe)
  const Bm = indexar(itensPara, ambPara)
  const campos: [string, string][] = [['quantidade', 'Quantidade'], ['unidade', 'Unidade'], ['preco_material', 'Material (unit.)'], ['preco_mao_obra', 'Mão de obra (unit.)'], ['lucro_percentual', 'Lucro %'], ['imposto_percentual', 'Imposto %'], ['total_item', 'Total do item']]
  const out: ResultadoDiff = {
    adicionados: [], removidos: [], alterados: [],
    totalDe: r2(itensDe.reduce((a, i) => a + totalItem(i), 0)),
    totalPara: r2(itensPara.reduce((a, i) => a + totalItem(i), 0)),
  }
  for (const [k, b] of Bm) {
    const a = A.get(k)
    const base = { chave: k, ambiente: b.ambiente, servico: b.item.servico, descricao: b.item.descricao || '' }
    if (!a) { out.adicionados.push({ ...base, para: b.item }); continue }
    const iguais = (c: string, x: any, y: any) => c === 'unidade' ? String(x ?? '') === String(y ?? '') : Math.abs(num(x) - num(y)) < 0.005
    const mudancas = campos
      .filter(([c]) => !iguais(c, a.item[c], b.item[c]))
      .map(([c, rot]) => ({ campo: rot, de: a.item[c], para: b.item[c] }))
    if (mudancas.length) out.alterados.push({ ...base, de: a.item, para: b.item, mudancas })
  }
  for (const [k, a] of A) {
    if (!Bm.has(k)) out.removidos.push({ chave: k, ambiente: a.ambiente, servico: a.item.servico, descricao: a.item.descricao || '', de: a.item })
  }
  return out
}

// Datas gravadas sem fuso no banco (created_at) são UTC; sem isto, à noite a data aparece um dia à frente.
export function dataBRts(ts?: string | null): string {
  if (!ts) return '—'
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : ts + 'Z'
  return new Date(iso).toLocaleDateString('pt-BR')
}
