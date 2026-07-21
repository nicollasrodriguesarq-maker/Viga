'use client'
import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': 'Bearer ' + ANON }

const fmt = (v: number) => Number(v||0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtN = (v: number) => Number(v||0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

async function buscar(tabela: string, q = '') {
  try { const r = await fetch(BASE + '/' + tabela + q, { headers: H }); const d = await r.json(); return Array.isArray(d) ? d : [] } catch { return [] }
}
async function criar(tabela: string, dados: object) {
  try { const r = await fetch(BASE + '/' + tabela, { method: 'POST', headers: { ...H, 'Prefer': 'return=representation' }, body: JSON.stringify(dados) }); const d = await r.json(); return Array.isArray(d) ? d[0] : d } catch { return null }
}
async function editar(tabela: string, id: string, dados: object) {
  try { await fetch(BASE + '/' + tabela + '?id=eq.' + id, { method: 'PATCH', headers: H, body: JSON.stringify(dados) }) } catch {}
}
async function remover(tabela: string, id: string) {
  try { await fetch(BASE + '/' + tabela + '?id=eq.' + id, { method: 'DELETE', headers: H }) } catch {}
}

const STATUS_ORC: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  expirado: 'Expirado',
}
const STATUS_BADGE: Record<string, string> = {
  rascunho: 'bg-on-surface-variant/10 text-on-surface-variant border-on-surface-variant/20',
  enviado: 'bg-primary/10 text-primary border-primary/20',
  aprovado: 'bg-primary-container/10 text-primary-container border-primary-container/20',
  reprovado: 'bg-error/10 text-error border-error/20',
  expirado: 'bg-tertiary/10 text-tertiary border-tertiary/20',
}
const UNIDADES = ['m²', 'm³', 'ml', 'un', 'vb', 'cj', 'kg', 'hr']
const FORMAS_PAG = ['50% entrada + 50% na entrega', '30% entrada + 70% na entrega', '40% entrada + 60% na entrega', 'À vista', '3x sem juros', '50% início + 25% meio + 25% fim', 'A combinar']

// classes reutilizáveis
const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const labelCls = 'text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5'
const btnPrimaryCls = 'bg-primary text-on-primary rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer'
const btnSecondaryCls = 'bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg px-4 py-2.5 text-sm hover:bg-surface-variant transition-all cursor-pointer'
const btnDangerSmCls = 'bg-error/10 border border-error/30 text-error rounded-md px-2.5 py-1 text-xs hover:bg-error/20 transition-all cursor-pointer'
const btnEditSmCls = 'bg-primary/10 border border-primary/30 text-primary rounded-md px-2.5 py-1 text-xs hover:bg-primary/20 transition-all cursor-pointer'
const cardCls = 'bg-surface-container border border-outline-variant rounded-xl p-5'
const sectionCls = 'bg-surface-container border border-outline-variant rounded-xl p-5 mb-4'
const tabActiveCls = 'px-4 py-2 rounded-lg border border-primary bg-primary/10 text-primary text-sm font-semibold cursor-pointer transition-all'
const tabInactiveCls = 'px-4 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface-variant text-sm font-semibold cursor-pointer hover:bg-surface-variant/50 transition-all'

export default function Orcamento() {
  const [orcamentos, setOrcamentos] = useState<any[]>([])
  const [ambientes, setAmbientes] = useState<any[]>([])
  const [itens, setItens] = useState<any[]>([])
  const [bancoItens, setBancoItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [detalhe, setDetalhe] = useState<any>(null)
  const [abaDetalhe, setAbaDetalhe] = useState('itens')
  const [ambienteAtivo, setAmbienteAtivo] = useState<any>(null)
  const [janela, setJanela] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [buscaBanco, setBuscaBanco] = useState('')
  const [userEmail, setUserEmail] = useState('')

  const [fOrc, setFOrc] = useState({ codigo: '', cliente_nome: '', endereco: '', condicao_pagamento: '', validade_dias: '30', observacao: '' })
  const [fItem, setFItem] = useState({ servico: '', descricao: '', quantidade: '', unidade: 'm²', preco_material: '', preco_mao_obra: '' })
  const [editItem, setEditItem] = useState<any>(null)
  const [fBanco, setFBanco] = useState({ nome: '', unidade: 'm²', preco_material: '', preco_mao_obra: '', categoria: '' })
  const [fAmb, setFAmb] = useState('')

  useEffect(() => {
    if (!localStorage.getItem('viga_token')) { window.location.href = '/'; return }
    setUserEmail(localStorage.getItem('viga_email') || '')
    carregar()
  }, [])

  function sair() {
    localStorage.removeItem('viga_token')
    localStorage.removeItem('viga_email')
    window.location.href = '/'
  }

  async function carregar() {
    setLoading(true)
    const [o, a, it, b] = await Promise.all([
      buscar('orcamentos', '?order=created_at.desc'),
      buscar('orcamento_ambientes', '?order=ordem'),
      buscar('orcamento_itens', '?order=created_at'),
      buscar('banco_itens', '?order=nome'),
    ])
    setOrcamentos(o); setAmbientes(a); setItens(it); setBancoItens(b)
    setLoading(false)
  }

  function gerarCodigo(lista: any[]) {
    const a = new Date().getFullYear()
    const n = lista.filter(l => l.codigo?.startsWith('ORC-' + a)).length + 1
    return 'ORC-' + a + '-' + String(n).padStart(3, '0')
  }

  async function salvarOrcamento() {
    if (!fOrc.cliente_nome) return alert('Preencha o nome do cliente')
    const codigo = fOrc.codigo || gerarCodigo(orcamentos)
    const dados = {
      codigo,
      cliente_nome: fOrc.cliente_nome,
      endereco: fOrc.endereco,
      condicao_pagamento: fOrc.condicao_pagamento,
      validade_dias: parseInt(fOrc.validade_dias || '30'),
      observacao: fOrc.observacao,
      status: 'rascunho',
      total_material: 0,
      total_mao_obra: 0,
      total_geral: 0,
      desconto: 0,
    }
    const orc = await criar('orcamentos', dados)
    let orcId = orc?.id
    if (orcId) {
      await criar('orcamento_ambientes', { orcamento_id: orcId, nome: 'Geral', ordem: 0 })
    }
    setJanela(null)
    setFOrc({ codigo: '', cliente_nome: '', endereco: '', condicao_pagamento: '', validade_dias: '30', observacao: '' })
    const [o, a, it, b] = await Promise.all([
      buscar('orcamentos', '?order=created_at.desc'),
      buscar('orcamento_ambientes', '?order=ordem'),
      buscar('orcamento_itens', '?order=created_at'),
      buscar('banco_itens', '?order=nome'),
    ])
    setOrcamentos(o); setAmbientes(a); setItens(it); setBancoItens(b); setLoading(false)
    if (orc?.id) {
      setDetalhe(orc); setAmbienteAtivo(null); setAbaDetalhe('itens')
    } else {
      const encontrado = o.find((x: any) => x.codigo === codigo)
      if (encontrado) {
        setDetalhe(encontrado); setAmbienteAtivo(null); setAbaDetalhe('itens')
      }
    }
  }

  async function salvarItem() {
    if (!fItem.servico || !ambienteAtivo) return alert('Preencha o serviço')
    const mat = parseFloat(fItem.preco_material || '0')
    const mao = parseFloat(fItem.preco_mao_obra || '0')
    const qtd = parseFloat(fItem.quantidade || '1')
    const total = (mat + mao) * qtd
    const dados = {
      orcamento_id: detalhe.id,
      ambiente_id: ambienteAtivo.id,
      servico: fItem.servico,
      descricao: fItem.descricao,
      quantidade: qtd,
      unidade: fItem.unidade,
      preco_material: mat,
      preco_mao_obra: mao,
      total_item: total,
    }
    if (editItem) { await editar('orcamento_itens', editItem.id, dados) }
    else {
      await criar('orcamento_itens', dados)
      const existe = bancoItens.find(b => b.nome.toLowerCase() === fItem.servico.toLowerCase())
      if (!existe && fItem.servico) {
        await criar('banco_itens', { nome: fItem.servico, unidade: fItem.unidade, preco_material: mat, preco_mao_obra: mao, categoria: '' })
      }
    }
    await atualizarTotais(detalhe.id)
    setJanela(null); setEditItem(null)
    setFItem({ servico: '', descricao: '', quantidade: '', unidade: 'm²', preco_material: '', preco_mao_obra: '' })
    carregar()
  }

  async function atualizarTotais(orcId: string) {
    const todosItens = await buscar('orcamento_itens', '?orcamento_id=eq.' + orcId)
    const tMat = todosItens.reduce((a: number, i: any) => a + parseFloat(i.preco_material||0) * parseFloat(i.quantidade||1), 0)
    const tMao = todosItens.reduce((a: number, i: any) => a + parseFloat(i.preco_mao_obra||0) * parseFloat(i.quantidade||1), 0)
    await editar('orcamentos', orcId, { total_material: tMat, total_mao_obra: tMao, total_geral: tMat + tMao })
  }

  async function salvarBancoItem() {
    if (!fBanco.nome) return alert('Preencha o nome')
    await criar('banco_itens', { ...fBanco, preco_material: parseFloat(fBanco.preco_material||'0'), preco_mao_obra: parseFloat(fBanco.preco_mao_obra||'0') })
    setJanela(null); setFBanco({ nome: '', unidade: 'm²', preco_material: '', preco_mao_obra: '', categoria: '' }); carregar()
  }

  async function salvarAmbiente() {
    if (!fAmb.trim() || !detalhe) return alert('Preencha o nome do ambiente')
    const ordem = ambientes.filter(a => a.orcamento_id === detalhe.id).length
    await criar('orcamento_ambientes', { orcamento_id: detalhe.id, nome: fAmb.trim(), ordem })
    setJanela(null); setFAmb(''); carregar()
  }

  async function usarItemBanco(item: any) {
    if (!ambienteAtivo) return alert('Selecione um ambiente primeiro')
    setFItem({ servico: item.nome, descricao: '', quantidade: '1', unidade: item.unidade, preco_material: String(item.preco_material), preco_mao_obra: String(item.preco_mao_obra) })
    setJanela('item')
  }

  function gerarPDF() {
    if (!detalhe) return
    const ambsOrc = ambientes.filter(a => a.orcamento_id === detalhe.id).sort((a, b) => a.ordem - b.ordem)
    const totalMat = itens.filter(i => i.orcamento_id === detalhe.id).reduce((a, i) => a + parseFloat(i.preco_material||0) * parseFloat(i.quantidade||1), 0)
    const totalMao = itens.filter(i => i.orcamento_id === detalhe.id).reduce((a, i) => a + parseFloat(i.preco_mao_obra||0) * parseFloat(i.quantidade||1), 0)
    const totalGeral = totalMat + totalMao
    const desconto = parseFloat(detalhe.desconto || 0)
    const totalFinal = totalGeral - desconto

    const ambContent = ambsOrc.map(amb => {
      const itensAmb = itens.filter(i => i.ambiente_id === amb.id)
      if (itensAmb.length === 0) return ''
      const matAmb = itensAmb.reduce((a, i) => a + parseFloat(i.preco_material||0) * parseFloat(i.quantidade||1), 0)
      const maoAmb = itensAmb.reduce((a, i) => a + parseFloat(i.preco_mao_obra||0) * parseFloat(i.quantidade||1), 0)
      const rows = itensAmb.map(item => {
        const mat = parseFloat(item.preco_material||0) * parseFloat(item.quantidade||1)
        const mao = parseFloat(item.preco_mao_obra||0) * parseFloat(item.quantidade||1)
        return `<tr>
          <td style="padding:8px 10px;border-bottom:1px solid #eee">${item.servico}${item.descricao ? '<br><small style="color:#666">' + item.descricao + '</small>' : ''}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${fmtN(parseFloat(item.quantidade||1))} ${item.unidade}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${fmt(mat)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${fmt(mao)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${fmt(mat + mao)}</td>
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
                <td style="padding:8px 10px;text-align:right;font-weight:700;color:#1B3A5C">${fmt(matAmb + maoAmb)}</td>
              </tr>
            </tfoot>
          </table>
        </div>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Proposta ${detalhe.codigo} — Inverso</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: Arial, sans-serif; color: #333; font-size: 13px; }
      @media print { body { -webkit-print-color-adjust: exact; } }
    </style></head><body>
    <div style="max-width:800px;margin:0 auto;padding:40px 30px">
      <!-- CABEÇALHO -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #1B3A5C">
        <div>
          <div style="font-size:32px;font-weight:900;color:#1B3A5C;letter-spacing:-1px">INVERSO</div>
          <div style="font-size:12px;color:#666;margin-top:2px">Construção e Reforma</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:20px;font-weight:700;color:#1B3A5C">${detalhe.codigo}</div>
          <div style="font-size:12px;color:#666;margin-top:4px">Data: ${new Date().toLocaleDateString('pt-BR')}</div>
          <div style="font-size:12px;color:#666">Validade: ${detalhe.validade_dias || 30} dias</div>
        </div>
      </div>

      <!-- CLIENTE -->
      <div style="background:#f0f4f8;border-radius:8px;padding:16px 20px;margin-bottom:28px">
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Proposta para</div>
        <div style="font-size:18px;font-weight:700;color:#1B3A5C">${detalhe.cliente_nome}</div>
        ${detalhe.endereco ? '<div style="font-size:13px;color:#555;margin-top:4px">📍 ' + detalhe.endereco + '</div>' : ''}
      </div>

      <!-- ITENS POR AMBIENTE -->
      <div style="margin-bottom:28px">${ambContent}</div>

      <!-- TOTAIS -->
      <div style="border:2px solid #1B3A5C;border-radius:8px;overflow:hidden;margin-bottom:24px">
        <div style="background:#1B3A5C;color:white;padding:12px 16px;font-weight:700;font-size:14px">Resumo Financeiro</div>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:10px 16px">Total Material</td><td style="padding:10px 16px;text-align:right;font-weight:600">${fmt(totalMat)}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding:10px 16px">Total Mão de Obra</td><td style="padding:10px 16px;text-align:right;font-weight:600">${fmt(totalMao)}</td></tr>
          ${desconto > 0 ? '<tr><td style="padding:10px 16px">Desconto</td><td style="padding:10px 16px;text-align:right;color:#e74c3c;font-weight:600">- ' + fmt(desconto) + '</td></tr>' : ''}
          <tr style="background:#1B3A5C;color:white">
            <td style="padding:14px 16px;font-size:16px;font-weight:700">TOTAL GERAL</td>
            <td style="padding:14px 16px;text-align:right;font-size:20px;font-weight:900">${fmt(totalFinal)}</td>
          </tr>
        </table>
      </div>

      <!-- CONDIÇÕES -->
      ${detalhe.condicao_pagamento ? `<div style="margin-bottom:24px;padding:14px 16px;background:#f0f4f8;border-radius:8px">
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Forma de Pagamento</div>
        <div style="font-weight:600;color:#1B3A5C">${detalhe.condicao_pagamento}</div>
      </div>` : ''}

      <!-- OBSERVAÇÕES -->
      ${detalhe.observacao ? `<div style="margin-bottom:24px;padding:14px 16px;border:1px solid #ddd;border-radius:8px">
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Observações</div>
        <div style="color:#555">${detalhe.observacao}</div>
      </div>` : ''}

      <!-- RODAPÉ -->
      <div style="margin-top:32px;padding-top:20px;border-top:1px solid #ddd;text-align:center;color:#999;font-size:11px">
        <div>Esta proposta é válida por ${detalhe.validade_dias || 30} dias a partir da data de emissão.</div>
        <div style="margin-top:4px">INVERSO Construção e Reforma — contato@inversoconstrucao.com.br</div>
      </div>
    </div>
    <script>window.onload = () => { window.print() }</script>
    </body></html>`

    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  const lista = orcamentos.filter(o =>
    !busca || [o.cliente_nome, o.codigo, o.endereco].some(v => v?.toLowerCase().includes(busca.toLowerCase()))
  )

  const topbarIcons = (
    <>
      <span className="material-symbols-outlined p-2 text-on-surface-variant hover:bg-primary-container/10 rounded-xl transition-all cursor-pointer">notifications</span>
      <span className="material-symbols-outlined p-2 text-on-surface-variant hover:bg-primary-container/10 rounded-xl transition-all cursor-pointer">settings</span>
      <div className="h-8 w-[1px] bg-outline-variant" />
    </>
  )

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-primary text-lg">Carregando orçamentos...</div>
    </div>
  )

  // ── DETALHE ────────────────────────────────────────────────
  if (detalhe) {
    const ambsOrc = ambientes.filter(a => a.orcamento_id === detalhe.id).sort((a, b) => a.ordem - b.ordem)
    const itensOrc = itens.filter(i => i.orcamento_id === detalhe.id)
    const totalMat = itensOrc.reduce((a, i) => a + parseFloat(i.preco_material||0) * parseFloat(i.quantidade||1), 0)
    const totalMao = itensOrc.reduce((a, i) => a + parseFloat(i.preco_mao_obra||0) * parseFloat(i.quantidade||1), 0)
    const totalGeral = totalMat + totalMao
    const desconto = parseFloat(detalhe.desconto || 0)
    const totalFinal = totalGeral - desconto
    const bancoBusca = bancoItens.filter(b => !buscaBanco || b.nome.toLowerCase().includes(buscaBanco.toLowerCase()))

    return (
      <Layout userEmail={userEmail} onLogout={sair} topbarSlot={topbarIcons}>
        <div className="flex items-start justify-between gap-4 flex-wrap mb-lg">
          <div>
            <button onClick={() => { setDetalhe(null); setAmbienteAtivo(null) }} className={btnSecondaryCls + ' mb-3'}>← Voltar</button>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-body-sm text-on-surface-variant font-semibold">{detalhe.codigo}</span>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${STATUS_BADGE[detalhe.status] || STATUS_BADGE.rascunho}`}>{STATUS_ORC[detalhe.status] || detalhe.status}</span>
            </div>
            <h1 className="text-headline-md font-headline text-on-surface">{detalhe.cliente_nome}</h1>
            {detalhe.endereco && <p className="text-body-sm text-on-surface-variant">📍 {detalhe.endereco}</p>}
          </div>
          <div className="flex gap-2 flex-wrap items-start">
            <select value={detalhe.status}
              onChange={async e => { await editar('orcamentos', detalhe.id, { status: e.target.value }); setDetalhe({ ...detalhe, status: e.target.value }); carregar() }}
              className={inputCls + ' w-auto text-xs py-1.5'}>
              {Object.entries(STATUS_ORC).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
            <button className="bg-primary-container text-on-primary-container rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer" onClick={gerarPDF}>🖨️ Gerar Proposta PDF</button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-lg">
          {[
            ['Total Material', fmt(totalMat), 'text-primary'],
            ['Total Mão de Obra', fmt(totalMao), 'text-secondary'],
            ['Subtotal', fmt(totalGeral), 'text-tertiary'],
            ['Desconto', fmt(desconto), 'text-error'],
            ['TOTAL FINAL', fmt(totalFinal), 'text-primary-container'],
          ].map(([l, v, c]) => (
            <div key={l} className={`bg-surface-container-high border rounded-lg p-3 ${l === 'TOTAL FINAL' ? 'border-primary-container/50' : 'border-outline-variant'}`}>
              <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-2">{l}</div>
              <div className={`font-bold ${c} ${l === 'TOTAL FINAL' ? 'text-xl' : 'text-base'}`}>{v}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-lg flex-wrap">
          <button className={abaDetalhe === 'itens' ? tabActiveCls : tabInactiveCls} onClick={() => setAbaDetalhe('itens')}>📋 Itens por Ambiente</button>
          <button className={abaDetalhe === 'banco' ? tabActiveCls : tabInactiveCls} onClick={() => setAbaDetalhe('banco')}>📦 Banco de Itens</button>
          <button className={abaDetalhe === 'config' ? tabActiveCls : tabInactiveCls} onClick={() => setAbaDetalhe('config')}>⚙️ Configurações</button>
        </div>

        {abaDetalhe === 'itens' && (
          <div className={sectionCls}>
            <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
              <div className="text-sm font-bold text-on-surface">📋 Itens por Ambiente</div>
              <div className="flex gap-2">
                <button className={btnSecondaryCls} onClick={() => { setFAmb(''); setJanela('ambiente') }}>+ Ambiente</button>
                {ambienteAtivo && <button className={btnPrimaryCls} onClick={() => { setFItem({ servico: '', descricao: '', quantidade: '1', unidade: 'm²', preco_material: '', preco_mao_obra: '' }); setEditItem(null); setJanela('item') }}>+ Item</button>}
              </div>
            </div>

            {ambsOrc.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">🏠</div>
                <div className="text-on-surface-variant text-sm mb-4">Nenhum ambiente. Crie ambientes para organizar os itens.</div>
                <button className={btnPrimaryCls} onClick={() => { setFAmb(''); setJanela('ambiente') }}>+ Criar Ambiente</button>
              </div>
            ) : (
              <>
                {!ambienteAtivo && <div className="px-3.5 py-2.5 bg-primary/5 rounded-lg text-body-sm text-primary mb-4">👆 Clique em um ambiente para selecioná-lo e adicionar itens</div>}
                {ambsOrc.map(amb => {
                  const itensAmb = itens.filter(i => i.ambiente_id === amb.id)
                  const isAtivo = ambienteAtivo?.id === amb.id
                  const matAmb = itensAmb.reduce((a, i) => a + parseFloat(i.preco_material||0) * parseFloat(i.quantidade||1), 0)
                  const maoAmb = itensAmb.reduce((a, i) => a + parseFloat(i.preco_mao_obra||0) * parseFloat(i.quantidade||1), 0)
                  return (
                    <div key={amb.id} className={`rounded-xl mb-3 overflow-hidden border ${isAtivo ? 'border-primary' : 'border-outline-variant'}`}>
                      <div className={`flex justify-between items-center px-4 py-3 cursor-pointer ${isAtivo ? 'bg-primary/10' : 'bg-surface-container'}`}
                        onClick={() => setAmbienteAtivo(isAtivo ? null : amb)}>
                        <div className="flex items-center gap-2.5">
                          <span>🏠</span>
                          <div>
                            <div className={`font-bold text-sm ${isAtivo ? 'text-primary' : 'text-on-surface'}`}>{amb.nome}</div>
                            <div className="text-[11px] text-on-surface-variant">{itensAmb.length} item(ns) · {fmt(matAmb + maoAmb)}</div>
                          </div>
                        </div>
                        <div className="flex gap-2 items-center">
                          <div className="text-right text-xs">
                            <div className="text-primary font-semibold">Mat: {fmt(matAmb)}</div>
                            <div className="text-secondary font-semibold">M.O: {fmt(maoAmb)}</div>
                          </div>
                          <span className="text-[11px] text-on-surface-variant">{isAtivo ? '▲' : '▼'}</span>
                          <button className={btnDangerSmCls} onClick={e => { e.stopPropagation(); if (confirm('Excluir ambiente e itens?')) remover('orcamento_ambientes', amb.id).then(carregar) }}>×</button>
                        </div>
                      </div>
                      {isAtivo && (
                        <div className="p-4">
                          {itensAmb.length === 0 ? (
                            <div className="text-center py-6 text-on-surface-variant text-sm">
                              Nenhum item. Clique em <strong>"+ Item"</strong> ou use o <strong>Banco de Itens</strong>.
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse text-sm">
                                <thead>
                                  <tr className="border-b border-outline-variant">
                                    {['Serviço', 'Qtd', 'Un', 'Material', 'Mão de Obra', 'Total', ''].map(h => (
                                      <th key={h} className="text-left px-2.5 py-2 text-[10px] text-on-surface-variant uppercase bg-surface-container-high whitespace-nowrap">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {itensAmb.map(item => {
                                    const mat = parseFloat(item.preco_material||0) * parseFloat(item.quantidade||1)
                                    const mao = parseFloat(item.preco_mao_obra||0) * parseFloat(item.quantidade||1)
                                    return (
                                      <tr key={item.id} className="border-b border-outline-variant hover:bg-surface-variant/20">
                                        <td className="px-2.5 py-2.5">
                                          <div className="font-semibold text-on-surface">{item.servico}</div>
                                          {item.descricao && <div className="text-[11px] text-on-surface-variant">{item.descricao}</div>}
                                        </td>
                                        <td className="px-2.5 py-2.5 text-on-surface">{fmtN(parseFloat(item.quantidade||1))}</td>
                                        <td className="px-2.5 py-2.5 text-on-surface-variant text-xs">{item.unidade}</td>
                                        <td className="px-2.5 py-2.5 text-primary font-semibold">{fmt(mat)}</td>
                                        <td className="px-2.5 py-2.5 text-secondary font-semibold">{fmt(mao)}</td>
                                        <td className="px-2.5 py-2.5 font-bold text-tertiary">{fmt(mat + mao)}</td>
                                        <td className="px-2.5 py-2.5">
                                          <div className="flex gap-1">
                                            <button className={btnEditSmCls} onClick={() => {
                                              setFItem({ servico: item.servico, descricao: item.descricao||'', quantidade: String(item.quantidade||1), unidade: item.unidade, preco_material: String(item.preco_material||0), preco_mao_obra: String(item.preco_mao_obra||0) })
                                              setEditItem(item); setJanela('item')
                                            }}>✏️</button>
                                            <button className={btnDangerSmCls} onClick={async () => { await remover('orcamento_itens', item.id); await atualizarTotais(detalhe.id); carregar() }}>×</button>
                                          </div>
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-surface-container-low">
                                    <td colSpan={3} className="px-2.5 py-2.5 font-bold text-on-surface">Subtotal {amb.nome}</td>
                                    <td className="px-2.5 py-2.5 text-primary font-bold">{fmt(matAmb)}</td>
                                    <td className="px-2.5 py-2.5 text-secondary font-bold">{fmt(maoAmb)}</td>
                                    <td className="px-2.5 py-2.5 text-tertiary font-black">{fmt(matAmb + maoAmb)}</td>
                                    <td></td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div className="p-4 bg-surface-container-low rounded-lg mt-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div><div className="text-[10px] text-on-surface-variant">TOTAL MATERIAL</div><div className="text-lg font-bold text-primary">{fmt(totalMat)}</div></div>
                    <div><div className="text-[10px] text-on-surface-variant">TOTAL MÃO DE OBRA</div><div className="text-lg font-bold text-secondary">{fmt(totalMao)}</div></div>
                    <div><div className="text-[10px] text-on-surface-variant">DESCONTO</div>
                      <input type="number" placeholder="0" value={detalhe.desconto || ''} onChange={async e => { const v = parseFloat(e.target.value||'0'); await editar('orcamentos', detalhe.id, { desconto: v }); setDetalhe({ ...detalhe, desconto: v }) }}
                        className={inputCls + ' mt-1 text-base font-bold text-error w-32'} />
                    </div>
                    <div><div className="text-[10px] text-on-surface-variant">TOTAL FINAL</div><div className="text-xl font-black text-primary-container">{fmt(totalFinal)}</div></div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {abaDetalhe === 'banco' && (
          <div className={sectionCls}>
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <div>
                <div className="text-sm font-bold text-on-surface">📦 Banco de Itens</div>
                <div className="text-[11px] text-on-surface-variant mt-0.5">Clique em um item para adicionar ao ambiente selecionado</div>
              </div>
              <button className={btnPrimaryCls} onClick={() => { setFBanco({ nome: '', unidade: 'm²', preco_material: '', preco_mao_obra: '', categoria: '' }); setJanela('banco') }}>+ Novo Item</button>
            </div>
            {!ambienteAtivo && <div className="px-3.5 py-2.5 bg-tertiary/5 rounded-lg text-body-sm text-tertiary mb-4">⚠️ Selecione um ambiente na aba "Itens por Ambiente" para poder adicionar itens do banco</div>}
            <input placeholder="🔍 Buscar item..." value={buscaBanco} onChange={e => setBuscaBanco(e.target.value)} className={inputCls + ' mb-4'} />
            {bancoBusca.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant">
                {bancoItens.length === 0 ? 'Banco vazio — adicione itens para reutilizar em futuros orçamentos' : 'Nenhum resultado'}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {bancoBusca.map(item => (
                  <div key={item.id} className="flex justify-between items-center px-3.5 py-3 bg-surface-container-low rounded-lg border border-outline-variant">
                    <div>
                      <div className="font-semibold text-on-surface">{item.nome}</div>
                      <div className="text-[11px] text-on-surface-variant mt-0.5">
                        Mat: {fmt(item.preco_material)} · M.O: {fmt(item.preco_mao_obra)} / {item.unidade}
                        {item.categoria && <span className="ml-2 text-primary">{item.categoria}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {ambienteAtivo && <button className={btnPrimaryCls} onClick={() => usarItemBanco(item)}>+ Usar</button>}
                      <button className={btnDangerSmCls} onClick={() => { if (confirm('Excluir do banco?')) remover('banco_itens', item.id).then(carregar) }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {abaDetalhe === 'config' && (
          <div className={sectionCls}>
            <div className="text-sm font-bold text-on-surface mb-5">⚙️ Configurações do Orçamento</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
              <div>
                <label className={labelCls}>Cliente</label>
                <input className={inputCls} value={detalhe.cliente_nome} onChange={e => setDetalhe({ ...detalhe, cliente_nome: e.target.value })} onBlur={() => editar('orcamentos', detalhe.id, { cliente_nome: detalhe.cliente_nome })} />
              </div>
              <div>
                <label className={labelCls}>Validade (dias)</label>
                <input className={inputCls} type="number" value={detalhe.validade_dias || 30} onChange={e => setDetalhe({ ...detalhe, validade_dias: e.target.value })} onBlur={() => editar('orcamentos', detalhe.id, { validade_dias: detalhe.validade_dias })} />
              </div>
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Endereço</label>
              <input className={inputCls} value={detalhe.endereco || ''} onChange={e => setDetalhe({ ...detalhe, endereco: e.target.value })} onBlur={() => editar('orcamentos', detalhe.id, { endereco: detalhe.endereco })} />
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Forma de Pagamento</label>
              <select className={inputCls} value={detalhe.condicao_pagamento || ''} onChange={e => { setDetalhe({ ...detalhe, condicao_pagamento: e.target.value }); editar('orcamentos', detalhe.id, { condicao_pagamento: e.target.value }) }}>
                <option value="">Selecione</option>
                {FORMAS_PAG.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="mb-5">
              <label className={labelCls}>Observações (aparece na proposta)</label>
              <textarea className={inputCls + ' min-h-[80px] resize-y'} value={detalhe.observacao || ''} onChange={e => setDetalhe({ ...detalhe, observacao: e.target.value })} onBlur={() => editar('orcamentos', detalhe.id, { observacao: detalhe.observacao })} placeholder="Ex: Serviço com garantia de 1 ano. Materiais de primeira linha." />
            </div>
            <button className="w-full bg-primary-container text-on-primary-container rounded-lg py-3 text-sm font-bold hover:opacity-90 transition-all cursor-pointer" onClick={gerarPDF}>🖨️ Gerar Proposta em PDF</button>
          </div>
        )}

        {janela === 'item' && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[580px] max-h-[92vh] overflow-y-auto">
              <div className="text-base font-bold text-on-surface mb-1.5">{editItem ? '✏️ Editar Item' : '➕ Novo Item'}</div>
              <div className="text-body-sm text-primary mb-5">Ambiente: {ambienteAtivo?.nome}</div>
              <div className="mb-3.5">
                <label className={labelCls}>Serviço *</label>
                <input className={inputCls} placeholder="Ex: Pintura das paredes" value={fItem.servico} onChange={e => setFItem({ ...fItem, servico: e.target.value })} />
              </div>
              <div className="mb-3.5">
                <label className={labelCls}>Descrição</label>
                <input className={inputCls} placeholder="Ex: Tinta acrílica 2 demãos" value={fItem.descricao} onChange={e => setFItem({ ...fItem, descricao: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3.5">
                <div>
                  <label className={labelCls}>Quantidade</label>
                  <input className={inputCls} type="number" placeholder="1" value={fItem.quantidade} onChange={e => setFItem({ ...fItem, quantidade: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Unidade</label>
                  <select className={inputCls} value={fItem.unidade} onChange={e => setFItem({ ...fItem, unidade: e.target.value })}>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className={labelCls}>Preço Material (R$ / unidade)</label>
                  <input className={inputCls + ' text-primary'} type="number" placeholder="0,00" value={fItem.preco_material} onChange={e => setFItem({ ...fItem, preco_material: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Preço Mão de Obra (R$ / unidade)</label>
                  <input className={inputCls + ' text-secondary'} type="number" placeholder="0,00" value={fItem.preco_mao_obra} onChange={e => setFItem({ ...fItem, preco_mao_obra: e.target.value })} />
                </div>
              </div>
              {(fItem.quantidade && (fItem.preco_material || fItem.preco_mao_obra)) ? (
                <div className="bg-surface-container-low rounded-lg p-3.5 mb-4">
                  <div className="text-[11px] text-on-surface-variant mb-2">PREVIEW DO TOTAL</div>
                  <div className="flex gap-5">
                    <div><div className="text-[10px] text-on-surface-variant">MATERIAL</div><div className="font-bold text-primary">{fmt(parseFloat(fItem.preco_material||'0') * parseFloat(fItem.quantidade||'1'))}</div></div>
                    <div><div className="text-[10px] text-on-surface-variant">MÃO DE OBRA</div><div className="font-bold text-secondary">{fmt(parseFloat(fItem.preco_mao_obra||'0') * parseFloat(fItem.quantidade||'1'))}</div></div>
                    <div><div className="text-[10px] text-on-surface-variant">TOTAL</div><div className="font-black text-tertiary text-base">{fmt((parseFloat(fItem.preco_material||'0') + parseFloat(fItem.preco_mao_obra||'0')) * parseFloat(fItem.quantidade||'1'))}</div></div>
                  </div>
                </div>
              ) : null}
              <div className="flex gap-2 justify-end">
                <button className={btnSecondaryCls} onClick={() => { setJanela(null); setEditItem(null) }}>Cancelar</button>
                <button className={btnPrimaryCls} onClick={salvarItem}>{editItem ? 'Salvar' : 'Adicionar Item'}</button>
              </div>
            </div>
          </div>
        )}

        {janela === 'ambiente' && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[400px]">
              <div className="text-base font-bold text-on-surface mb-5">🏠 Novo Ambiente</div>
              <div className="mb-5">
                <label className={labelCls}>Nome do Ambiente</label>
                <input className={inputCls} placeholder="Ex: Sala de Estar, Cozinha..." value={fAmb} onChange={e => setFAmb(e.target.value)} onKeyDown={e => e.key === 'Enter' && salvarAmbiente()} />
              </div>
              <div className="flex gap-2 justify-end">
                <button className={btnSecondaryCls} onClick={() => setJanela(null)}>Cancelar</button>
                <button className={btnPrimaryCls} onClick={salvarAmbiente}>Criar Ambiente</button>
              </div>
            </div>
          </div>
        )}

        {janela === 'banco' && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[580px] max-h-[92vh] overflow-y-auto">
              <div className="text-base font-bold text-on-surface mb-5">📦 Novo Item no Banco</div>
              <div className="mb-3.5">
                <label className={labelCls}>Nome do Serviço/Item *</label>
                <input className={inputCls} placeholder="Ex: Pintura interna, Instalação elétrica..." value={fBanco.nome} onChange={e => setFBanco({ ...fBanco, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3.5">
                <div>
                  <label className={labelCls}>Unidade</label>
                  <select className={inputCls} value={fBanco.unidade} onChange={e => setFBanco({ ...fBanco, unidade: e.target.value })}>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Categoria</label>
                  <input className={inputCls} placeholder="Ex: Pintura, Elétrica..." value={fBanco.categoria} onChange={e => setFBanco({ ...fBanco, categoria: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div>
                  <label className={labelCls}>Preço Material (R$ / unidade)</label>
                  <input className={inputCls + ' text-primary'} type="number" placeholder="0,00" value={fBanco.preco_material} onChange={e => setFBanco({ ...fBanco, preco_material: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Preço Mão de Obra (R$ / unidade)</label>
                  <input className={inputCls + ' text-secondary'} type="number" placeholder="0,00" value={fBanco.preco_mao_obra} onChange={e => setFBanco({ ...fBanco, preco_mao_obra: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button className={btnSecondaryCls} onClick={() => setJanela(null)}>Cancelar</button>
                <button className={btnPrimaryCls} onClick={salvarBancoItem}>Salvar no Banco</button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    )
  }

  // ── LISTAGEM ───────────────────────────────────────────────
  return (
    <Layout
      userEmail={userEmail}
      onLogout={sair}
      searchSlot={
        <div className="relative w-full group">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline group-focus-within:text-primary transition-colors">search</span>
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar orçamentos ou propostas..."
            className="w-full bg-surface-container-low border border-outline-variant rounded-full pl-12 pr-4 py-2 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
          />
        </div>
      }
      topbarSlot={
        <>
          {topbarIcons}
          <button
            onClick={() => { setFOrc({ codigo: '', cliente_nome: '', endereco: '', condicao_pagamento: '', validade_dias: '30', observacao: '' }); setJanela('orcamento') }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-container text-on-primary-container rounded-xl hover:opacity-90 transition-all font-label-md text-label-md shadow-lg shadow-primary-container/20"
          >
            <span className="material-symbols-outlined text-[20px]">post_add</span>
            Novo Orçamento
          </button>
        </>
      }
    >
      <div className="mb-lg">
        <h2 className="font-headline text-headline-lg text-on-surface">Orçamento & Propostas</h2>
        <p className="text-body-md text-on-surface-variant">Gerenciamento centralizado de ofertas comerciais e faturamento previsto.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-lg">
        {[
          ['Total', orcamentos.length, 'text-primary'],
          ['Rascunho', orcamentos.filter(o => o.status === 'rascunho').length, 'text-on-surface-variant'],
          ['Enviados', orcamentos.filter(o => o.status === 'enviado').length, 'text-secondary'],
          ['Aprovados', orcamentos.filter(o => o.status === 'aprovado').length, 'text-primary-container'],
        ].map(([l, v, c]) => (
          <div key={l as string} className={cardCls}>
            <div className="text-[11px] text-on-surface-variant uppercase tracking-widest mb-2">{l}</div>
            <div className={`text-2xl font-bold ${c}`}>{v}</div>
          </div>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className={sectionCls + ' text-center py-16'}>
          <div className="text-5xl mb-4">💼</div>
          <div className="text-base font-bold text-on-surface mb-4">{orcamentos.length === 0 ? 'Nenhum orçamento ainda' : 'Nenhum resultado'}</div>
          {orcamentos.length === 0 && <button className={btnPrimaryCls} onClick={() => setJanela('orcamento')}>+ Criar primeiro orçamento</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-lg">
          {lista.map(orc => {
            const ambsOrc = ambientes.filter(a => a.orcamento_id === orc.id)
            const itensOrc = itens.filter(i => i.orcamento_id === orc.id)
            return (
              <div key={orc.id}
                onClick={() => { setDetalhe(orc); setAmbienteAtivo(null); setAbaDetalhe('itens') }}
                className="bg-surface-container border border-outline-variant hover:border-primary transition-all duration-300 rounded-xl p-5 cursor-pointer">
                <div className="flex justify-between items-start mb-3.5 gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-body-sm text-on-surface-variant font-semibold">{orc.codigo}</span>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${STATUS_BADGE[orc.status] || STATUS_BADGE.rascunho}`}>{STATUS_ORC[orc.status] || orc.status}</span>
                    </div>
                    <div className="text-base font-bold text-on-surface">{orc.cliente_nome}</div>
                    {orc.endereco && <div className="text-body-sm text-on-surface-variant mt-0.5">📍 {orc.endereco}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-bold text-primary-container">{fmt(parseFloat(orc.total_geral||0))}</div>
                    <div className="text-[10px] text-on-surface-variant mt-0.5">total geral</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-surface-container-high rounded-lg p-2.5">
                    <div className="text-[10px] text-on-surface-variant mb-1">AMBIENTES</div>
                    <div className="text-sm font-bold text-primary">{ambsOrc.length}</div>
                  </div>
                  <div className="bg-surface-container-high rounded-lg p-2.5">
                    <div className="text-[10px] text-on-surface-variant mb-1">ITENS</div>
                    <div className="text-sm font-bold text-tertiary">{itensOrc.length}</div>
                  </div>
                  <div className="bg-surface-container-high rounded-lg p-2.5">
                    <div className="text-[10px] text-on-surface-variant mb-1">VALIDADE</div>
                    <div className="text-sm font-bold text-on-surface-variant">{orc.validade_dias || 30}d</div>
                  </div>
                </div>
                <div className="flex gap-4 text-body-sm">
                  <span className="text-primary">Mat: {fmt(parseFloat(orc.total_material||0))}</span>
                  <span className="text-secondary">M.O: {fmt(parseFloat(orc.total_mao_obra||0))}</span>
                </div>
                <div className="mt-3 text-sm text-primary font-bold">Abrir orçamento →</div>
              </div>
            )
          })}
        </div>
      )}

      {janela === 'orcamento' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setJanela(null)}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[580px] max-h-[92vh] overflow-y-auto">
            <div className="text-base font-bold text-on-surface mb-5">💼 Novo Orçamento</div>
            <div className="grid grid-cols-2 gap-3 mb-3.5">
              <div>
                <label className={labelCls}>Código</label>
                <input className={inputCls} placeholder={gerarCodigo(orcamentos)} value={fOrc.codigo} onChange={e => setFOrc({ ...fOrc, codigo: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Validade (dias)</label>
                <input className={inputCls} type="number" value={fOrc.validade_dias} onChange={e => setFOrc({ ...fOrc, validade_dias: e.target.value })} />
              </div>
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Cliente *</label>
              <input className={inputCls} placeholder="Nome do cliente" value={fOrc.cliente_nome} onChange={e => setFOrc({ ...fOrc, cliente_nome: e.target.value })} />
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Endereço</label>
              <input className={inputCls} placeholder="Endereço do imóvel" value={fOrc.endereco} onChange={e => setFOrc({ ...fOrc, endereco: e.target.value })} />
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Forma de Pagamento</label>
              <select className={inputCls} value={fOrc.condicao_pagamento} onChange={e => setFOrc({ ...fOrc, condicao_pagamento: e.target.value })}>
                <option value="">Selecione</option>
                {FORMAS_PAG.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="mb-5">
              <label className={labelCls}>Observações</label>
              <input className={inputCls} placeholder="Observações para a proposta" value={fOrc.observacao} onChange={e => setFOrc({ ...fOrc, observacao: e.target.value })} />
            </div>
            <div className="flex gap-2 justify-end">
              <button className={btnSecondaryCls} onClick={() => setJanela(null)}>Cancelar</button>
              <button className={btnPrimaryCls} onClick={salvarOrcamento}>Criar Orçamento</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
