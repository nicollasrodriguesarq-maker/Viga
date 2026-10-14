'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { META_ALERTA, ORDEM_CATEGORIAS, destinoDoAlerta, type AlertaItem } from '../lib/alertas'
import { useAlertas } from '../lib/useAlertas'

// Sino do cabeçalho. Usa o mesmo motor de alertas do painel do Dashboard (lib/alertas.ts) e se
// atualiza sozinho: logo após qualquer alteração no sistema, ao voltar para a aba e a cada minuto.
export default function AlertsBell() {
  const [aberto, setAberto] = useState(false)
  const { alertas } = useAlertas()
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', onClickFora)
    return () => document.removeEventListener('mousedown', onClickFora)
  }, [])

  function irPara(a: AlertaItem) {
    setAberto(false)
    router.push(destinoDoAlerta(a))
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto(a => !a)}
        className="relative material-symbols-outlined p-2 text-on-surface-variant hover:bg-primary-container/10 rounded-xl transition-all cursor-pointer"
        data-testid="sino-alertas"
      >
        notifications
        {alertas.length > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-error text-on-error text-[10px] font-bold flex items-center justify-center" data-testid="sino-contagem">
            {alertas.length}
          </span>
        )}
      </button>
      {aberto && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[70vh] overflow-y-auto bg-surface-container border border-outline-variant rounded-2xl shadow-2xl z-[1100] p-3">
          {alertas.length === 0 ? (
            <div className="text-center text-on-surface-variant text-sm py-8">Nenhum alerta no momento 🎉</div>
          ) : (
            ORDEM_CATEGORIAS.map(cat => {
              const itens = alertas.filter(a => a.categoria === cat)
              if (itens.length === 0) return null
              const meta = META_ALERTA[cat]
              return (
                <div key={cat} className="mb-2">
                  <div className={`text-[11px] font-bold uppercase tracking-wide px-2 py-1.5 ${meta.texto}`}>
                    {meta.icone} {meta.nome} ({itens.length})
                  </div>
                  {itens.map(a => (
                    <button key={a.id} onClick={() => irPara(a)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-variant/40 transition-all">
                      <div className="text-sm text-on-surface font-semibold">{a.titulo}</div>
                      <div className={`text-xs ${meta.texto}`}>{a.descricao}</div>
                    </button>
                  ))}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
