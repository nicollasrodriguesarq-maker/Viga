'use client'
import { useState } from 'react'
import Link from 'next/link'
import { META_ALERTA, ORDEM_CATEGORIAS, destinoDoAlerta, type CategoriaAlerta } from '../lib/alertas'
import { useAlertas } from '../lib/useAlertas'

// Resumo dos alertas no Dashboard: contagem por tipo (clicável para filtrar) e a lista dos mais
// urgentes. Atualiza sozinho — resolveu o problema, o alerta sai daqui.
// No app do celular (mobile) os links vão para as telas /m/...; o CRM só existe na versão desktop.
const ROTA_MOBILE: Record<string, string> = { '/obras': '/m/obras', '/financeiro': '/m/financeiro', '/levantamento': '/m/levantamento', '/orcamento': '/m/orcamento' }

export default function PainelAlertas({ limite = 8, mobile = false, compacto = false, className = 'mb-xl' }: { limite?: number; mobile?: boolean; compacto?: boolean; className?: string }) {
  const { alertas, carregando, recarregar } = useAlertas()
  const [filtro, setFiltro] = useState<CategoriaAlerta | null>(null)
  const [verTodos, setVerTodos] = useState(false)

  const contagem = ORDEM_CATEGORIAS.map(c => ({ cat: c, n: alertas.filter(a => a.categoria === c).length })).filter(x => x.n > 0)
  const filtrados = filtro ? alertas.filter(a => a.categoria === filtro) : alertas
  const visiveis = verTodos ? filtrados : filtrados.slice(0, limite)

  return (
    <section className={`bg-surface-container rounded-2xl card-border overflow-hidden flex flex-col ${className}`} data-testid="painel-alertas">
      <div className="px-lg py-lg flex items-center justify-between border-b border-outline-variant bg-surface-container-high/50 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h3 className="font-headline text-headline-sm text-on-surface">🔔 Meus Alertas</h3>
          {!carregando && (
            <span className={`text-[12px] font-bold px-2.5 py-0.5 rounded-full ${alertas.length > 0 ? 'bg-error/15 text-error' : 'bg-primary/15 text-primary'}`} data-testid="alertas-total">
              {alertas.length > 0 ? `${alertas.length} ${alertas.length === 1 ? 'pendente' : 'pendentes'}` : 'tudo em dia'}
            </span>
          )}
        </div>
        <button onClick={recarregar} className="text-primary font-label-md hover:underline flex items-center gap-1" title="Atualizar alertas">
          <span className="material-symbols-outlined text-[16px]">refresh</span>Atualizar
        </button>
      </div>

      {carregando ? (
        <div className="px-lg py-lg text-on-surface-variant text-body-sm">Carregando alertas...</div>
      ) : alertas.length === 0 ? (
        <div className="px-lg py-lg text-on-surface-variant text-body-sm">Nenhum alerta no momento 🎉 — sem retornos pendentes, obras em atraso, propostas vencidas ou pagamentos vencidos.</div>
      ) : (
        <>
          <div className="px-lg pt-md pb-sm flex flex-wrap gap-2">
            <button onClick={() => { setFiltro(null); setVerTodos(false) }} className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-all cursor-pointer ${filtro === null ? 'bg-primary/15 border-primary text-primary' : 'bg-surface-container-low border-outline-variant text-on-surface-variant hover:bg-surface-variant/50'}`}>
              Todos ({alertas.length})
            </button>
            {contagem.map(({ cat, n }) => {
              const meta = META_ALERTA[cat]
              return (
                <button key={cat} onClick={() => { setFiltro(filtro === cat ? null : cat); setVerTodos(false) }} data-testid={`chip-alerta-${cat}`}
                  className={`text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-all cursor-pointer ${filtro === cat ? `${meta.fundo} ${meta.borda} ${meta.texto}` : 'bg-surface-container-low border-outline-variant text-on-surface-variant hover:bg-surface-variant/50'}`}>
                  {meta.icone} {meta.nome} <b className={meta.texto}>{n}</b>
                </button>
              )
            })}
          </div>
          <div className={`flex flex-col ${compacto ? 'max-h-[420px] overflow-y-auto' : ''}`}>
            {visiveis.map((a, i) => {
              const meta = META_ALERTA[a.categoria]
              return (
                <Link key={a.id} href={mobile ? (ROTA_MOBILE[a.href] || a.href) : a.href} onClick={() => destinoDoAlerta(a)} data-testid="item-alerta"
                  className={`px-lg py-md hover:bg-surface-variant/30 transition-colors flex items-start gap-md ${i < visiveis.length - 1 ? 'border-b border-outline-variant/30' : ''}`}>
                  <span title={meta.nome} className={`text-[11px] font-bold px-2 py-1 rounded-full shrink-0 border ${meta.fundo} ${meta.borda} ${meta.texto}`}>{compacto ? meta.icone : `${meta.icone} ${meta.nome}`}</span>
                  <div className="min-w-0">
                    <div className="text-body-md font-semibold text-on-surface truncate">{a.titulo}</div>
                    <div className={`text-body-sm ${meta.texto}`}>{a.descricao}</div>
                  </div>
                </Link>
              )
            })}
          </div>
          {filtrados.length > limite && (
            <button onClick={() => setVerTodos(v => !v)} className="px-lg py-md text-primary font-label-md hover:bg-surface-variant/30 border-t border-outline-variant/30 text-left cursor-pointer">
              {verTodos ? 'Mostrar menos' : `Ver todos os ${filtrados.length} alertas`}
            </button>
          )}
        </>
      )}
    </section>
  )
}
