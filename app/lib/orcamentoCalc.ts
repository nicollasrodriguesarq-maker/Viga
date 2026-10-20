// Cálculo do item de orçamento com DESCONTO PRÓPRIO do item.
//
// O preço de tabela (matriz de preços / banco de itens) nunca é alterado: o desconto é um campo à parte do item
// (desconto_item_tipo + desconto_item_valor) e vale só para aquele item, naquele orçamento/revisão.
//   valor unitário = (material + mão de obra) × (1 + lucro%) × (1 + imposto%)
//   bruto          = valor unitário × quantidade                (preço de tabela do item)
//   desconto       = % do bruto  ou  valor fixo em R$           (nunca passa do bruto)
//   líquido        = bruto − desconto                           (o que entra nos totais, na obra e na proposta)
const num = (x: any): number => parseFloat(x || 0) || 0
const r2 = (n: number) => Math.round(n * 100) / 100

export function valorUnitario(material: number, maoObra: number, lucroPct: number, impostoPct: number) {
  return (material + maoObra) * (1 + (lucroPct || 0) / 100) * (1 + (impostoPct || 0) / 100)
}

export function brutoItem(item: any): number {
  const q = item.quantidade === '' || item.quantidade == null ? 1 : num(item.quantidade)
  return valorUnitario(num(item.preco_material), num(item.preco_mao_obra), num(item.lucro_percentual), num(item.imposto_percentual)) * q
}

export function tipoDescontoItem(item: any): 'percentual' | 'valor' {
  return item?.desconto_item_tipo === 'valor' ? 'valor' : 'percentual'
}

// Desconto em R$ aplicado ao item (em centavos, limitado a 0..bruto).
export function descontoItem(item: any): number {
  const v = num(item?.desconto_item_valor)
  if (v <= 0) return 0
  const bruto = brutoItem(item)
  const d = tipoDescontoItem(item) === 'valor' ? v : bruto * Math.min(v, 100) / 100
  return r2(Math.min(Math.max(d, 0), bruto))
}

export function liquidoItem(item: any): number {
  return brutoItem(item) - descontoItem(item)
}

// Percentual efetivo de desconto (para exibir "−12,5%" mesmo quando o desconto foi dado em R$).
export function pctDescontoItem(item: any): number {
  const b = brutoItem(item)
  return b > 0 ? (descontoItem(item) / b) * 100 : 0
}

// Custo direto do item (material + mão de obra, sem lucro nem imposto) — para avisar quando o desconto come a margem.
export function custoItem(item: any): number {
  const q = item.quantidade === '' || item.quantidade == null ? 1 : num(item.quantidade)
  return (num(item.preco_material) + num(item.preco_mao_obra)) * q
}

// Fator que multiplica material e mão de obra quando a proposta NÃO mostra o desconto (o valor já sai com o desconto embutido).
export function fatorDesconto(item: any): number {
  const b = brutoItem(item)
  return b > 0 ? liquidoItem(item) / b : 1
}
