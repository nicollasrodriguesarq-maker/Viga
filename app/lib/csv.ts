// Leitor de CSV simples (aceita ; ou , e aspas) para importar listas de prospecção.
export function lerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '')
  const primeira = t.split(/\r?\n/, 1)[0] || ''
  const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ';' : ','
  const linhas: string[][] = []
  let campo = '', linha: string[] = [], aspas = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++ }
      else if (ch === '"') aspas = false
      else campo += ch
    } else if (ch === '"') aspas = true
    else if (ch === sep) { linha.push(campo); campo = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      linha.push(campo); campo = ''
      if (linha.some(c => c.trim() !== '')) linhas.push(linha)
      linha = []
    } else campo += ch
  }
  linha.push(campo)
  if (linha.some(c => c.trim() !== '')) linhas.push(linha)
  return linhas
}
