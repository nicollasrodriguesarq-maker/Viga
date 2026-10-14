'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { carregarAlertas, EVENTO_DADOS_ALTERADOS, type AlertaItem } from './alertas'

// Mantém os alertas sempre em dia: carrega ao abrir, recarrega logo depois de qualquer alteração
// feita no sistema (o interceptor de rede avisa), quando a janela volta ao foco e a cada minuto.
// Assim, resolver o problema (pagar, concluir, registrar contato, reagendar...) tira o alerta da lista.
export function useAlertas() {
  const [alertas, setAlertas] = useState<AlertaItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const emAndamento = useRef(false)
  const pedirOutra = useRef(false)

  const recarregar = useCallback(async () => {
    if (emAndamento.current) { pedirOutra.current = true; return }
    emAndamento.current = true
    try { setAlertas(await carregarAlertas()) } catch { /* mantém a lista anterior */ }
    emAndamento.current = false
    setCarregando(false)
    if (pedirOutra.current) { pedirOutra.current = false; recarregar() }
  }, [])

  useEffect(() => {
    recarregar()
    let timer: ReturnType<typeof setTimeout> | null = null
    const aoAlterar = () => { if (timer) clearTimeout(timer); timer = setTimeout(recarregar, 700) }
    const aoVoltar = () => { if (document.visibilityState === 'visible') recarregar() }
    window.addEventListener(EVENTO_DADOS_ALTERADOS, aoAlterar)
    window.addEventListener('focus', recarregar)
    document.addEventListener('visibilitychange', aoVoltar)
    const intervalo = setInterval(recarregar, 60_000)
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener(EVENTO_DADOS_ALTERADOS, aoAlterar)
      window.removeEventListener('focus', recarregar)
      document.removeEventListener('visibilitychange', aoVoltar)
      clearInterval(intervalo)
    }
  }, [recarregar])

  return { alertas, carregando, recarregar }
}
