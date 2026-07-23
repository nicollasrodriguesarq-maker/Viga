'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import MobileShell from './components/MobileShell'

const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': 'Bearer ' + ANON }

async function get(tabela: string, q = '') {
  try { const r = await fetch(BASE + '/' + tabela + q, { headers: H }); const d = await r.json(); return Array.isArray(d) ? d : [] } catch { return [] }
}

function formatarMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function DashboardMobile() {
  const [nomeUsuario, setNomeUsuario] = useState('')
  const [obrasAtivas, setObrasAtivas] = useState(0)
  const [faturamentoMes, setFaturamentoMes] = useState(0)
  const [aReceber, setAReceber] = useState(0)
  const [aPagar, setAPagar] = useState(0)
  const [obrasRecentes, setObrasRecentes] = useState<any[]>([])
  const [compromissosHoje, setCompromissosHoje] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('viga_token')) {
      window.location.href = '/'
      return
    }
    const email = localStorage.getItem('viga_email') || ''
    setNomeUsuario(email.split('@')[0] || 'usuário')
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    const mesAtual = new Date().toISOString().slice(0, 7)
    const hojeStr = new Date().toISOString().slice(0, 10)
    const [obras, lancamentos, compromissos] = await Promise.all([
      get('obras', '?order=created_at.desc'),
      get('lancamentos', '?order=data.desc'),
      get('agenda_compromissos', '?data=eq.' + hojeStr + '&order=hora_inicio.asc'),
    ])
    setObrasAtivas(obras.filter((o: any) => o.status === 'em_execucao').length)
    setObrasRecentes(obras.slice(0, 4))
    setCompromissosHoje(compromissos)
    const lancMes = lancamentos.filter((l: any) => l.data?.slice(0, 7) === mesAtual)
    setFaturamentoMes(lancMes.filter((l: any) => l.tipo === 'entrada').reduce((a: number, l: any) => a + parseFloat(l.valor || 0), 0))
    setAReceber(lancamentos.filter((l: any) => l.tipo === 'entrada' && l.status === 'pendente').reduce((a: number, l: any) => a + parseFloat(l.valor || 0), 0))
    setAPagar(lancamentos.filter((l: any) => l.tipo === 'saida' && l.status === 'pendente').reduce((a: number, l: any) => a + parseFloat(l.valor || 0), 0))
    setCarregando(false)
  }

  return (
    <MobileShell title="VIGA">
      <div className="p-4 flex flex-col gap-4">
        <div>
          <div className="text-body-sm text-on-surface-variant">Olá,</div>
          <div className="text-headline-sm font-black text-on-surface capitalize">{nomeUsuario}</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface-container border border-outline-variant rounded-xl p-4">
            <div className="text-[11px] text-on-surface-variant font-semibold uppercase">Obras Ativas</div>
            <div className="text-headline-sm font-black text-on-surface mt-1">{carregando ? '—' : obrasAtivas}</div>
          </div>
          <div className="bg-surface-container border border-outline-variant rounded-xl p-4">
            <div className="text-[11px] text-on-surface-variant font-semibold uppercase">Faturamento Mês</div>
            <div className="text-headline-sm font-black text-primary mt-1 truncate">{carregando ? '—' : formatarMoeda(faturamentoMes)}</div>
          </div>
          <div className="bg-surface-container border border-outline-variant rounded-xl p-4">
            <div className="text-[11px] text-on-surface-variant font-semibold uppercase">A Receber</div>
            <div className="text-headline-sm font-black text-on-surface mt-1 truncate">{carregando ? '—' : formatarMoeda(aReceber)}</div>
          </div>
          <div className="bg-surface-container border border-outline-variant rounded-xl p-4">
            <div className="text-[11px] text-on-surface-variant font-semibold uppercase">A Pagar</div>
            <div className="text-headline-sm font-black text-error mt-1 truncate">{carregando ? '—' : formatarMoeda(aPagar)}</div>
          </div>
        </div>

        <div className="bg-surface-container border border-outline-variant rounded-xl p-4">
          <div className="text-sm font-bold text-on-surface mb-3">📅 Compromissos de Hoje</div>
          {compromissosHoje.length === 0 ? (
            <div className="text-body-sm text-on-surface-variant py-2">Nenhum compromisso para hoje</div>
          ) : (
            <div className="flex flex-col gap-2">
              {compromissosHoje.map(c => (
                <div key={c.id} className="flex items-center gap-3 py-1.5">
                  <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-md shrink-0">
                    {c.hora_inicio ? c.hora_inicio.slice(0, 5) : '--:--'}
                  </span>
                  <span className="text-sm text-on-surface truncate">{c.titulo}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface-container border border-outline-variant rounded-xl p-4">
          <div className="text-sm font-bold text-on-surface mb-3">🏗️ Obras Recentes</div>
          {obrasRecentes.length === 0 ? (
            <div className="text-body-sm text-on-surface-variant py-2">Nenhuma obra cadastrada</div>
          ) : (
            <div className="flex flex-col gap-2">
              {obrasRecentes.map(o => (
                <Link key={o.id} href="/m/obras" className="flex items-center justify-between py-2 border-b border-outline-variant last:border-0">
                  <span className="text-sm text-on-surface truncate">{o.nome}</span>
                  <span className="text-[10px] font-semibold text-on-surface-variant uppercase shrink-0 ml-2">{o.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </MobileShell>
  )
}
