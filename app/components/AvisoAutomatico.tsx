'use client'
import { useEffect } from 'react'

// Aviso curto (some sozinho) para dizer o que o sistema atualizou automaticamente em outro módulo.
export default function AvisoAutomatico({ texto, onFechar }: { texto: string; onFechar: () => void }) {
  useEffect(() => { const t = setTimeout(onFechar, 7000); return () => clearTimeout(t) }, [texto, onFechar])
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1300] max-w-[92vw] bg-surface-container-high border border-primary/40 text-on-surface rounded-xl shadow-2xl px-4 py-3 text-sm flex items-center gap-3" role="status" data-testid="aviso-automatico">
      <span>🔄</span><span>{texto}</span>
      <button className="text-on-surface-variant hover:text-on-surface cursor-pointer" aria-label="Fechar aviso" onClick={onFechar}>×</button>
    </div>
  )
}
