'use client'
import { useEffect, useState } from 'react'
import MobileShell from '../components/MobileShell'
import { obterMinhasPermissoesApp, temAcessoModuloApp } from '../../lib/permissoes'

const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': 'Bearer ' + ANON }

async function buscar(tabela: string, q = '') {
  try { const r = await fetch(BASE + '/' + tabela + q, { headers: H }); const d = await r.json(); return Array.isArray(d) ? d : [] } catch { return [] }
}

const fmt = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtN = (v: number) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const STATUS_ORC: Record<string, string> = { rascunho: 'Rascunho', enviado: 'Enviado', aprovado: 'Aprovado', reprovado: 'Reprovado', expirado: 'Expirado' }
const CATEGORIAS = ['Demolição e Remoção', 'Terraplanagem e Fundação', 'Estrutura', 'Alvenaria', 'Cobertura', 'Impermeabilização', 'Instalações Elétricas', 'Instalações Hidráulicas', 'Instalações de Gás', 'Climatização (AC)', 'Forro', 'Revestimento de Parede', 'Revestimento de Piso', 'Pintura', 'Esquadrias', 'Marcenaria', 'Serralheria', 'Vidraçaria', 'Mobiliário', 'Paisagismo', 'Limpeza Pós-Obra', 'Outros']

function ordemCategoria(categoria: string | null | undefined) {
  const idx = CATEGORIAS.indexOf(categoria || '')
  return idx === -1 ? CATEGORIAS.length : idx
}
function ordenarPorCategoria(itensList: any[]) {
  return [...itensList].sort((a, b) => ordemCategoria(a.categoria) - ordemCategoria(b.categoria))
}
function calcularValorUnitario(precoMaterial: number, precoMaoObra: number, lucroPct: number, impostoPct: number) {
  return (precoMaterial + precoMaoObra) * (1 + (lucroPct || 0) / 100) * (1 + (impostoPct || 0) / 100)
}
function calcularTotalItem(item: any) {
  const valorUnit = calcularValorUnitario(parseFloat(item.preco_material || 0), parseFloat(item.preco_mao_obra || 0), parseFloat(item.lucro_percentual || 0), parseFloat(item.imposto_percentual || 0))
  return valorUnit * parseFloat(item.quantidade || 1)
}
function valoresProposta(item: any) {
  const qtd = parseFloat(item.quantidade || 1)
  const mult = (1 + (parseFloat(item.lucro_percentual || 0)) / 100) * (1 + (parseFloat(item.imposto_percentual || 0)) / 100)
  return { material: parseFloat(item.preco_material || 0) * qtd * mult, maoObra: parseFloat(item.preco_mao_obra || 0) * qtd * mult }
}

const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const btnPrimaryCls = 'bg-primary text-on-primary rounded-lg px-4 py-3 text-sm font-bold hover:opacity-90 transition-all cursor-pointer w-full'

export default function OrcamentoMobile() {
  const [orcamentos, setOrcamentos] = useState<any[]>([])
  const [ambientes, setAmbientes] = useState<any[]>([])
  const [itens, setItens] = useState<any[]>([])
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [detalhe, setDetalhe] = useState<any>(null)
  const [ambienteAberto, setAmbienteAberto] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('viga_token')) { window.location.href = '/'; return }
    obterMinhasPermissoesApp().then(perm => { if (!temAcessoModuloApp(perm, 'orcamento')) window.location.href = '/m' })
    carregar()
  }, [])

  async function carregar() {
    const [o, a, i] = await Promise.all([
      buscar('orcamentos', '?order=created_at.desc'),
      buscar('orcamento_ambientes', '?order=ordem'),
      buscar('orcamento_itens', '?order=created_at'),
    ])
    setOrcamentos(o); setAmbientes(a); setItens(i)
  }

  const filtrados = orcamentos.filter(o => {
    if (filtro !== 'todos' && o.status !== filtro) return false
    if (!busca) return true
    return [o.cliente_nome, o.codigo, o.endereco].some(v => v?.toLowerCase().includes(busca.toLowerCase()))
  })

  function gerarPDF(orc: any) {
    const ambsOrc = ambientes.filter(a => a.orcamento_id === orc.id).sort((a, b) => a.ordem - b.ordem)
    const itensDoOrc = itens.filter(i => i.orcamento_id === orc.id)
    const totalMat = itensDoOrc.reduce((a, i) => a + valoresProposta(i).material, 0)
    const totalMao = itensDoOrc.reduce((a, i) => a + valoresProposta(i).maoObra, 0)
    const totalGeral = itensDoOrc.reduce((a, i) => a + calcularTotalItem(i), 0)
    const descontoPct = parseFloat(orc.desconto_percentual || 0)
    const desconto = totalGeral * descontoPct / 100
    const totalFinal = totalGeral - desconto

    const ambContent = ambsOrc.map(amb => {
      const itensAmb = ordenarPorCategoria(itens.filter(i => i.ambiente_id === amb.id))
      if (itensAmb.length === 0) return ''
      const matAmb = itensAmb.reduce((a, i) => a + valoresProposta(i).material, 0)
      const maoAmb = itensAmb.reduce((a, i) => a + valoresProposta(i).maoObra, 0)
      const totalAmb = itensAmb.reduce((a, i) => a + calcularTotalItem(i), 0)
      const rows = itensAmb.map(item => {
        const { material: mat, maoObra: mao } = valoresProposta(item)
        return `<tr>
          <td style="padding:8px 10px;border-bottom:1px solid #eee">${item.servico}${item.descricao ? '<br><small style="color:#666">' + item.descricao + '</small>' : ''}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${fmtN(parseFloat(item.quantidade || 1))} ${item.unidade}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${fmt(mat)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${fmt(mao)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${fmt(calcularTotalItem(item))}</td>
        </tr>`
      }).join('')
      return `
        <div style="margin-bottom:24px">
          <div style="background:#1B3A5C;color:white;padding:10px 14px;border-radius:6px;font-weight:700;margin-bottom:8px;font-size:14px">🏠 ${amb.nome}</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#f5f5f5">
                <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #ddd">Serviço</th>
                <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #ddd">Qtd</th>
                <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #ddd">Material</th>
                <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #ddd">Mão de Obra</th>
                <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #ddd">Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr style="background:#f9f9f9">
                <td colspan="2" style="padding:8px 10px;font-weight:600;color:#1B3A5C">Subtotal ${amb.nome}</td>
                <td style="padding:8px 10px;text-align:right;font-weight:600">${fmt(matAmb)}</td>
                <td style="padding:8px 10px;text-align:right;font-weight:600">${fmt(maoAmb)}</td>
                <td style="padding:8px 10px;text-align:right;font-weight:700;color:#1B3A5C">${fmt(totalAmb)}</td>
              </tr>
            </tfoot>
          </table>
        </div>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Proposta ${orc.codigo} — Inverso</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: Arial, sans-serif; color: #333; font-size: 13px; }
      @media print { body { -webkit-print-color-adjust: exact; } }
    </style></head><body>
    <div style="max-width:800px;margin:0 auto;padding:40px 30px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #1B3A5C">
        <div>
          <div style="font-size:32px;font-weight:900;color:#1B3A5C;letter-spacing:-1px">INVERSO</div>
          <div style="font-size:12px;color:#666;margin-top:2px">Construção e Reforma</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:20px;font-weight:700;color:#1B3A5C">${orc.codigo}</div>
          <div style="font-size:12px;color:#666;margin-top:4px">Data: ${new Date().toLocaleDateString('pt-BR')}</div>
          <div style="font-size:12px;color:#666">Validade: ${orc.validade_dias || 30} dias</div>
        </div>
      </div>
      <div style="background:#f0f4f8;border-radius:8px;padding:16px 20px;margin-bottom:28px">
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Proposta para</div>
        <div style="font-size:18px;font-weight:700;color:#1B3A5C">${orc.cliente_nome}</div>
        ${orc.endereco ? '<div style="font-size:13px;color:#555;margin-top:4px">📍 ' + orc.endereco + '</div>' : ''}
      </div>
      <div style="margin-bottom:28px">${ambContent}</div>
      <div style="border:2px solid #1B3A5C;border-radius:8px;overflow:hidden;margin-bottom:24px">
        <div style="background:#1B3A5C;color:white;padding:12px 16px;font-weight:700;font-size:14px">Resumo Financeiro</div>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:10px 16px">Total Material</td><td style="padding:10px 16px;text-align:right;font-weight:600">${fmt(totalMat)}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding:10px 16px">Total Mão de Obra</td><td style="padding:10px 16px;text-align:right;font-weight:600">${fmt(totalMao)}</td></tr>
          ${desconto > 0 ? '<tr><td style="padding:10px 16px">Desconto (' + fmtN(descontoPct) + '%)</td><td style="padding:10px 16px;text-align:right;color:#e74c3c;font-weight:600">- ' + fmt(desconto) + '</td></tr>' : ''}
          <tr style="background:#1B3A5C;color:white">
            <td style="padding:14px 16px;font-size:16px;font-weight:700">TOTAL GERAL</td>
            <td style="padding:14px 16px;text-align:right;font-size:20px;font-weight:900">${fmt(totalFinal)}</td>
          </tr>
        </table>
      </div>
      ${orc.condicao_pagamento ? `<div style="margin-bottom:24px;padding:14px 16px;background:#f0f4f8;border-radius:8px">
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Forma de Pagamento</div>
        <div style="font-weight:600;color:#1B3A5C">${orc.condicao_pagamento}</div>
      </div>` : ''}
      ${orc.observacao ? `<div style="margin-bottom:24px;padding:14px 16px;border:1px solid #ddd;border-radius:8px">
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Observações</div>
        <div style="color:#555">${orc.observacao}</div>
      </div>` : ''}
      <div style="margin-top:32px;padding-top:20px;border-top:1px solid #ddd;text-align:center;color:#999;font-size:11px">
        <div>Esta proposta é válida por ${orc.validade_dias || 30} dias a partir da data de emissão.</div>
        <div style="margin-top:4px">INVERSO Construção e Reforma — contato@inversoconstrucao.com.br</div>
      </div>
    </div>
    <script>window.onload = () => { window.print() }</script>
    </body></html>`

    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  // ── Tela: Detalhe (somente leitura) ─────────────────────────────
  if (detalhe) {
    const ambsOrc = ambientes.filter(a => a.orcamento_id === detalhe.id).sort((a, b) => a.ordem - b.ordem)
    const itensOrc = itens.filter(i => i.orcamento_id === detalhe.id)
    const totalMat = itensOrc.reduce((a, i) => a + parseFloat(i.preco_material || 0) * parseFloat(i.quantidade || 1), 0)
    const totalMao = itensOrc.reduce((a, i) => a + parseFloat(i.preco_mao_obra || 0) * parseFloat(i.quantidade || 1), 0)
    const totalGeral = itensOrc.reduce((a, i) => a + calcularTotalItem(i), 0)
    const descontoPct = parseFloat(detalhe.desconto_percentual || 0)
    const desconto = totalGeral * descontoPct / 100
    const totalFinal = totalGeral - desconto

    return (
      <MobileShell title={detalhe.codigo}>
        <div className="p-4 flex flex-col gap-4 pb-8">
          <button className="text-primary text-sm font-semibold text-left" onClick={() => { setDetalhe(null); setAmbienteAberto(null) }}>← Voltar à lista</button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-on-surface-variant/10 text-on-surface-variant border-on-surface-variant/20">🔒 Somente leitura</span>
            </div>
            <div className="text-headline-sm font-headline text-on-surface">{detalhe.cliente_nome}</div>
            {detalhe.endereco && <div className="text-body-sm text-on-surface-variant">📍 {detalhe.endereco}</div>}
            <span className="text-[11px] font-semibold text-on-surface-variant uppercase">{STATUS_ORC[detalhe.status] || detalhe.status}</span>
          </div>

          <button className={btnPrimaryCls} onClick={() => gerarPDF(detalhe)}>🖨️ Gerar Proposta PDF</button>

          <div className="grid grid-cols-2 gap-2.5">
            {([
              ['Total Material', fmt(totalMat), 'text-primary'],
              ['Total Mão de Obra', fmt(totalMao), 'text-secondary'],
              ['Desconto', fmt(desconto), 'text-error'],
              ['TOTAL FINAL', fmt(totalFinal), 'text-primary-container'],
            ] as [string, string, string][]).map(([l, v, c]) => (
              <div key={l} className="bg-surface-container-high border border-outline-variant rounded-lg p-3">
                <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1.5">{l}</div>
                <div className={`text-xs font-bold ${c}`}>{v}</div>
              </div>
            ))}
          </div>

          {ambsOrc.length === 0 ? (
            <div className="text-center py-8 text-on-surface-variant text-body-sm">Nenhum ambiente cadastrado</div>
          ) : ambsOrc.map(amb => {
            const itensAmb = ordenarPorCategoria(itens.filter(i => i.ambiente_id === amb.id))
            const totalAmb = itensAmb.reduce((a, i) => a + calcularTotalItem(i), 0)
            const aberto = ambienteAberto === amb.id
            return (
              <div key={amb.id} className="bg-surface-container border border-outline-variant rounded-xl overflow-hidden">
                <button className="w-full text-left px-4 py-3 flex justify-between items-center" onClick={() => setAmbienteAberto(aberto ? null : amb.id)}>
                  <div>
                    <div className="font-bold text-sm text-on-surface">🏠 {amb.nome}</div>
                    <div className="text-[11px] text-on-surface-variant">{itensAmb.length} item(ns) · {fmt(totalAmb)}</div>
                  </div>
                  <span className="text-[11px] text-on-surface-variant">{aberto ? '▲' : '▼'}</span>
                </button>
                {aberto && (
                  <div className="px-4 pb-4 flex flex-col gap-2">
                    {itensAmb.map(item => (
                      <div key={item.id} className="border-t border-outline-variant pt-2.5 first:border-0 first:pt-0">
                        <div className="text-sm font-semibold text-on-surface">{item.servico}</div>
                        {item.descricao && <div className="text-[11px] text-on-surface-variant">{item.descricao}</div>}
                        <div className="flex justify-between text-[11px] mt-1">
                          <span className="text-on-surface-variant">{fmtN(parseFloat(item.quantidade || 1))} {item.unidade}</span>
                          <span className="font-bold text-primary">{fmt(calcularTotalItem(item))}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </MobileShell>
    )
  }

  // ── Tela: Lista ───────────────────────────────────────────────────
  return (
    <MobileShell title="Orçamento">
      <div className="p-4 flex flex-col gap-3">
        <input className={inputCls} placeholder="Pesquisar por cliente, código ou endereço..." value={busca} onChange={e => setBusca(e.target.value)} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {['todos', ...Object.keys(STATUS_ORC)].map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${filtro === f ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-container text-on-surface-variant border-outline-variant'}`}>
              {f === 'todos' ? 'Todos' : STATUS_ORC[f]}
            </button>
          ))}
        </div>
        {filtrados.length === 0 ? (
          <div className="text-center py-10 text-on-surface-variant text-body-sm">Nenhum orçamento encontrado</div>
        ) : filtrados.map(o => (
          <button key={o.id} onClick={() => { setDetalhe(o); setAmbienteAberto(null) }}
            className="text-left bg-surface-container border border-outline-variant rounded-xl p-4">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="font-bold text-on-surface text-sm truncate">{o.cliente_nome}</div>
                <div className="text-[11px] text-on-surface-variant truncate">{o.codigo}{o.endereco ? ' · ' + o.endereco : ''}</div>
              </div>
              <span className="text-[10px] font-semibold text-on-surface-variant uppercase shrink-0">{STATUS_ORC[o.status] || o.status}</span>
            </div>
          </button>
        ))}
      </div>
    </MobileShell>
  )
}
