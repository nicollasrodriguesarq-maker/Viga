'use client'
// Alertas que levam direto ao item: o alerta grava "qual item abrir" no navegador e a página de destino, ao ficar
// pronta (dados carregados), abre esse item. Funciona tanto ao navegar de outra página quanto quando a pessoa já
// está na página do destino (o evento avisa a página que há um novo item para abrir).
import { useCallback, useEffect, useRef, useState } from 'react'

export const EVENTO_ABRIR = 'viga:abrir-alvo'

export const CHAVE = {
  obra: 'viga_obra_abrir',
  orcamento: 'viga_orcamento_abrir',
  levantamento: 'viga_levantamento_abrir',
  lead: 'viga_lead_abrir',
  lancamento: 'viga_lancamento_abrir',
  compromisso: 'viga_compromisso_abrir',
  atividade: 'viga_atividade_abrir',
} as const

export function definirAlvo(chave: string, id: string, aba?: string) {
  try {
    localStorage.setItem(chave, id)
    if (aba) localStorage.setItem(chave + '_aba', aba); else localStorage.removeItem(chave + '_aba')
    window.dispatchEvent(new Event(EVENTO_ABRIR))
  } catch { /* sem armazenamento: o alerta abre só a página */ }
}

// `pronto` = a página já carregou os dados necessários para encontrar o item. `abrir` recebe o id (e a aba, se houver).
export function useAbrirAlvo(chave: string, pronto: boolean, abrir: (id: string, aba: string | null) => void) {
  const [pendente, setPendente] = useState<{ id: string; aba: string | null } | null>(null)
  const abrirRef = useRef(abrir)
  abrirRef.current = abrir

  const ler = useCallback(() => {
    try {
      const id = localStorage.getItem(chave)
      if (!id) return
      const aba = localStorage.getItem(chave + '_aba')
      localStorage.removeItem(chave); localStorage.removeItem(chave + '_aba')
      setPendente({ id, aba })
    } catch { /* ignora */ }
  }, [chave])

  useEffect(() => {
    ler()
    window.addEventListener(EVENTO_ABRIR, ler)
    return () => window.removeEventListener(EVENTO_ABRIR, ler)
  }, [ler])

  useEffect(() => {
    if (pendente && pronto) { const p = pendente; setPendente(null); abrirRef.current(p.id, p.aba) }
  }, [pendente, pronto])
}
