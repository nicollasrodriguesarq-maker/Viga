'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { obterMinhasPermissoes } from '../lib/permissoes'

const SUPABASE_URL = 'https://vupjtoeqltzlnplijnzr.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }

type Alerta = {
  categoria: 'obra' | 'financeiro' | 'levantamento'
  titulo: string
  descricao: string
  href: string
}

export default function AlertsBell() {
  const [aberto, setAberto] = useState(false)
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    async function carregar() {
      try {
        const [obrasRes, lancRes, perm] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/obras?status=eq.em_execucao&select=id,nome,data_previsao`, { headers: H }),
          fetch(`${SUPABASE_URL}/rest/v1/lancamentos?tipo=eq.saida&status=eq.pendente&select=id,descricao,valor,data,data_vencimento`, { headers: H }),
          obterMinhasPermissoes(),
        ])
        const obras = await obrasRes.json()
        const lancs = await lancRes.json()

        let levAlertas: Alerta[] = []
        if (perm) {
          try {
            const solicRes = await fetch(`${SUPABASE_URL}/rest/v1/levantamento_solicitacoes?status=eq.pendente&select=id,levantamento_id,solicitante_nome`, { headers: H })
            const solics = await solicRes.json()
            if (Array.isArray(solics) && solics.length > 0) {
              const ids = solics.map((s: any) => s.levantamento_id).join(',')
              const levsRes = await fetch(`${SUPABASE_URL}/rest/v1/levantamentos?id=in.(${ids})&select=id,nome,cliente,criado_por`, { headers: H })
              const levs = await levsRes.json()
              const levsMap = new Map((Array.isArray(levs) ? levs : []).map((l: any) => [l.id, l]))
              levAlertas = solics
                .filter((s: any) => {
                  const lev = levsMap.get(s.levantamento_id)
                  return perm.role === 'admin' || (lev && lev.criado_por === perm.id)
                })
                .map((s: any) => {
                  const lev = levsMap.get(s.levantamento_id) as any
                  return {
                    categoria: 'levantamento' as const,
                    titulo: `${s.solicitante_nome || 'Alguém'} pediu acesso`,
                    descricao: `Levantamento: ${lev?.nome || lev?.cliente || s.levantamento_id}`,
                    href: '/levantamento',
                  }
                })
            }
          } catch {}
        }
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
        const em7 = new Date(hoje); em7.setDate(hoje.getDate() + 7)

        const obraAlertas: Alerta[] = (Array.isArray(obras) ? obras : [])
          .filter((o: any) => o.data_previsao && new Date(o.data_previsao) < hoje)
          .map((o: any) => {
            const dias = Math.floor((hoje.getTime() - new Date(o.data_previsao).getTime()) / 86400000)
            return { categoria: 'obra' as const, titulo: o.nome, descricao: `Atrasada há ${dias} dia(s)`, href: '/obras' }
          })

        const lancAlertas: Alerta[] = (Array.isArray(lancs) ? lancs : [])
          .filter((l: any) => {
            const venc = l.data_vencimento ? new Date(l.data_vencimento) : new Date(l.data)
            return venc <= em7
          })
          .map((l: any) => {
            const venc = l.data_vencimento ? new Date(l.data_vencimento) : new Date(l.data)
            const atrasado = venc < hoje
            const valor = Number(l.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            return {
              categoria: 'financeiro' as const,
              titulo: l.descricao,
              descricao: `${valor} · vence ${venc.toLocaleDateString('pt-BR')}${atrasado ? ' · ATRASADO' : ''}`,
              href: '/financeiro',
            }
          })

        setAlertas([...obraAlertas, ...lancAlertas, ...levAlertas])
      } catch {
        setAlertas([])
      }
    }
    carregar()
  }, [])

  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', onClickFora)
    return () => document.removeEventListener('mousedown', onClickFora)
  }, [])

  const obraAlertas = alertas.filter(a => a.categoria === 'obra')
  const financeiroAlertas = alertas.filter(a => a.categoria === 'financeiro')
  const levantamentoAlertas = alertas.filter(a => a.categoria === 'levantamento')

  function irPara(href: string) {
    setAberto(false)
    router.push(href)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto(a => !a)}
        className="relative material-symbols-outlined p-2 text-on-surface-variant hover:bg-primary-container/10 rounded-xl transition-all cursor-pointer"
      >
        notifications
        {alertas.length > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-error text-on-error text-[10px] font-bold flex items-center justify-center">
            {alertas.length}
          </span>
        )}
      </button>
      {aberto && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[70vh] overflow-y-auto bg-surface-container border border-outline-variant rounded-2xl shadow-2xl z-[1100] p-3">
          {alertas.length === 0 ? (
            <div className="text-center text-on-surface-variant text-sm py-8">Nenhum alerta no momento 🎉</div>
          ) : (
            <>
              {obraAlertas.length > 0 && (
                <div className="mb-2">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-error px-2 py-1.5">
                    🏗️ Obras em atraso
                  </div>
                  {obraAlertas.map((a, i) => (
                    <button
                      key={i}
                      onClick={() => irPara(a.href)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-variant/40 transition-all"
                    >
                      <div className="text-sm text-on-surface font-semibold">{a.titulo}</div>
                      <div className="text-xs text-error">{a.descricao}</div>
                    </button>
                  ))}
                </div>
              )}
              {financeiroAlertas.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-tertiary px-2 py-1.5">
                    💰 Contas a pagar
                  </div>
                  {financeiroAlertas.map((a, i) => (
                    <button
                      key={i}
                      onClick={() => irPara(a.href)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-variant/40 transition-all"
                    >
                      <div className="text-sm text-on-surface font-semibold">{a.titulo}</div>
                      <div className="text-xs text-on-surface-variant">{a.descricao}</div>
                    </button>
                  ))}
                </div>
              )}
              {levantamentoAlertas.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-primary px-2 py-1.5">
                    📐 Solicitações de edição
                  </div>
                  {levantamentoAlertas.map((a, i) => (
                    <button
                      key={i}
                      onClick={() => irPara(a.href)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-variant/40 transition-all"
                    >
                      <div className="text-sm text-on-surface font-semibold">{a.titulo}</div>
                      <div className="text-xs text-on-surface-variant">{a.descricao}</div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
