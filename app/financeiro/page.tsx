'use client'
import { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout'
import { obterMinhasPermissoes, temAcessoModulo } from '../lib/permissoes'
import { CHAVE, useAbrirAlvo } from '../lib/abrirAlvo'
import { hojeISO, somarDiasISO, somarMesesISO, arred2, dividirParcelas, dataBR } from '../lib/datas'
import { calcularPeriodo, dataEfetiva, ehMovInvestimento, lancamentosDaEmpresa, CAT_APORTE, CAT_RESGATE, CAT_FATURA } from '../lib/financeiroCalc'
import { agruparFaturas, vencimentoDaFatura } from '../lib/faturasCartao'

const SUPABASE_URL = 'https://vupjtoeqltzlnplijnzr.supabase.co'
// Chave pública (anon): o acesso real é decidido pelo token do usuário, injetado em lib/authFetch.ts.
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }

const fmt = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const num = (v: any) => parseFloat(v || 0) || 0
const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ── acesso ao banco ──────────────────────────────────────────────────────────────────────────────
// Toda gravação confere a resposta do banco: se ele recusar (permissão, dado inválido, sessão expirada) o
// erro sobe e o usuário é avisado — nada de "salvar" com sucesso aparente e o lançamento sumir.
async function erroDe(r: Response): Promise<string> {
  try { const d = await r.json(); return d?.message || d?.error || ('erro ' + r.status) } catch { return 'erro ' + r.status }
}
async function get(tabela: string, q = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}${q}`, { headers: H })
  const d = await r.json(); return Array.isArray(d) ? d : []
}
// Lê a tabela inteira em páginas de 1000 (o antigo limit=300 deixava os saldos errados depois de 300 lançamentos).
async function getTudo(tabela: string, q = ''): Promise<any[]> {
  const out: any[] = []
  const passo = 1000
  for (let off = 0; ; off += passo) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}${q}${q.includes('?') ? '&' : '?'}limit=${passo}&offset=${off}`, { headers: H })
    const d = await r.json()
    if (!Array.isArray(d)) throw new Error(`Não foi possível carregar "${tabela}": ${d?.message || r.status}`)
    out.push(...d)
    if (d.length < passo) break
  }
  return out
}
async function inserir(tabela: string, dados: object): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, { method: 'POST', headers: { ...H, 'Prefer': 'return=representation' }, body: JSON.stringify(dados) })
  if (!r.ok) throw new Error(await erroDe(r))
  const d = await r.json()
  return Array.isArray(d) ? d[0] : d
}
async function deletar(tabela: string, id: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${id}`, { method: 'DELETE', headers: H })
  if (!r.ok) throw new Error(await erroDe(r))
}
async function atualizar(tabela: string, id: string, dados: object) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${id}`, { method: 'PATCH', headers: H, body: JSON.stringify(dados) })
  if (!r.ok) throw new Error(await erroDe(r))
}
async function atualizarOnde(tabela: string, filtro: string, dados: object) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?${filtro}`, { method: 'PATCH', headers: H, body: JSON.stringify(dados) })
  if (!r.ok) throw new Error(await erroDe(r))
}

// Upload de arquivo para Supabase Storage (bucket notas-fiscais). Devolve null se falhar.
async function uploadNF(file: File, lancamentoDesc: string): Promise<string | null> {
  try {
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '')
    const limpo = lancamentoDesc.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 20)
    const nome = `nf_${Date.now()}_${limpo}.${ext}`
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/notas-fiscais/${nome}`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': file.type },
      body: file
    })
    if (r.ok) return `${SUPABASE_URL}/storage/v1/object/public/notas-fiscais/${nome}`
    return null
  } catch { return null }
}

// Sobrescrita de impressão: os relatórios usam tema escuro na tela, mas impressoras/PDF
// costumam ignorar o fundo escuro e imprimir em papel branco — sem isso, o texto claro
// (pensado pra contrastar com #0f141b/#1b2027) fica ilegível em cima do branco. Força fundo
// branco e texto escuro só no momento de imprimir/exportar, preservando o visual normal na tela.
const PRINT_SAFE_CSS = `
      @media print {
        html, body { background:#ffffff !important; }
        body { color:#12161c !important; }
        * { color:#12161c !important; }
        .card { background:#ffffff !important; }
        [style*="background:#0f141b"], [style*="background:#1b2027"], [style*="background:#171c23"], [style*="background:#252a32"], [style*="background:#3d4948"], [style*="linear-gradient"] { background:#ffffff !important; }
        [style*="border:1px solid #3d4948"], [style*="border-bottom:1px solid #3d4948"], [style*="border-top:1px solid #3d4948"], [style*="border-color:#3d4948"] { border-color:#d7dbda !important; }
      }`

// Relatório Financeiro Mensal em PDF — usa o mesmo motor de cálculo da tela (calcularPeriodo), então os
// números do PDF são sempre os da tela. Realizado (pago no mês) e previsto (pendências) ficam separados.
async function gerarPDFRelatorioMensal(lancamentos: any[], obras: any[], contas: any[], mes: string) {
  const cfg = (await get('empresa_config', '?limit=1'))[0] || {}
  const nomeEmpresa = cfg.nome_empresa || 'VIGA'
  const mesNome = meses[parseInt(mes.slice(5,7))-1] + ' ' + mes.slice(0,4)
  const p = calcularPeriodo({ lancamentos, obras, contas, mes, hoje: hojeISO() })
  const resultado = arred2(p.entradasReal - p.saidasReal)
  const maxBarra = Math.max(p.entradasReal, p.saidasReal, 1)

  const categoriasOrdenadas = Object.entries(p.porCategoria).sort((a,b) => b[1]-a[1])
  const coresCategorias = ['#6ee9e0','#cebdff','#ffcbac','#ffb4ab','#a6d5a1','#f4d35e','#8ecae6','#869391']
  const distribuicaoHtml = categoriasOrdenadas.map(([cat, valor], i) => {
    const pct = p.saidasReal > 0 ? (valor/p.saidasReal)*100 : 0
    const cor = coresCategorias[i % coresCategorias.length]
    return `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span>${cat}</span>
          <span style="font-family:'JetBrains Mono',monospace;color:${cor}">${fmt(valor)} (${pct.toFixed(0)}%)</span>
        </div>
        <div style="height:8px;background:#30353d;border-radius:999px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${cor}"></div>
        </div>
      </div>`
  }).join('')

  const hoje = hojeISO()
  const linhasHtml = p.lista.map(l => {
    const obra = obras.find((o: any) => o.id === l.obra_id)
    const pago = l.status === 'pago'
    const ef = dataEfetiva(l)
    const atrasado = !pago && ef < hoje
    const foraDoMes = p.atrasadosAntes.includes(l)
    const rotuloStatus = pago ? 'Pago' : (atrasado ? 'Vencido' : 'Pendente')
    const corStatus = pago ? '#6ee9e0' : (atrasado ? '#ffb4ab' : '#ffcbac')
    return `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #3d4948;font-family:'JetBrains Mono',monospace;font-size:11px;white-space:nowrap">${dataBR(ef)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #3d4948">${l.descricao}${foraDoMes ? ' <span style="color:#ffb4ab;font-size:9px;font-weight:700;text-transform:uppercase">⚠ atrasado</span>' : ''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #3d4948;color:#bcc9c7;font-size:11px">${l.categoria || '—'}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #3d4948;color:#bcc9c7;font-size:11px">${obra ? obra.codigo : '—'}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:center">
        <span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;color:${corStatus};text-transform:uppercase">${rotuloStatus}</span>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:right;color:${l.tipo==='entrada'?'#6ee9e0':'#ffb4ab'};font-weight:600;white-space:nowrap">${l.tipo==='entrada'?'+':'-'}${fmt(num(l.valor))}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #3d4948;text-align:center">
        ${l.nf_url ? '<span style="color:#6ee9e0;font-size:11px;font-weight:600">📎 NF anexa</span>' : '<span style="color:#3d4948">—</span>'}
      </td>
    </tr>`
  }).join('')

  const card = (rotulo: string, valor: number, cor: string, sub = '') =>
    `<div class="card"><span style="font-size:9px;color:#869391;text-transform:uppercase">${rotulo}</span><p style="font-size:17px;font-weight:700;margin-top:4px;color:${cor}">${fmt(valor)}</p>${sub ? `<p style="font-size:9px;color:#869391;margin-top:3px">${sub}</p>` : ''}</div>`

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Relatório Financeiro ${mesNome} — ${nomeEmpresa}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#0f141b; color:#dee2ec; font-family:'Inter',sans-serif; font-size:13px; }
    h1,h2,h3 { font-family:'Manrope',sans-serif; }
    .page { max-width:900px; margin:0 auto; padding:40px 36px; }
    .card { background:#1b2027; border:1px solid #3d4948; border-radius:12px; padding:20px; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { break-after: page; }
      .page:last-child { break-after: auto; }
    }
    ${PRINT_SAFE_CSS}
  </style></head><body>

  <!-- PÁGINA 1 — VISÃO GERAL -->
  <div class="page">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #3d4948">
      <div style="display:flex;align-items:center;gap:12px">
        ${cfg.logo_url ? `<img src="${cfg.logo_url}" style="height:44px;object-fit:contain" />` : `<div style="width:44px;height:44px;background:#6ee9e0;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:900;color:#003734;font-size:20px">${nomeEmpresa.charAt(0)}</div>`}
        <div>
          <h1 style="font-size:20px;font-weight:800;color:#6ee9e0;text-transform:uppercase">${nomeEmpresa}</h1>
          <p style="font-size:9px;color:#869391;text-transform:uppercase;letter-spacing:0.08em">Relatório Financeiro Mensal</p>
        </div>
      </div>
      <div style="text-align:right">
        <h2 style="font-size:16px;font-weight:600">${mesNome}</h2>
        <p style="font-size:10px;color:#869391">Gerado em: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
      </div>
    </div>

    <p style="font-size:10px;color:#6ee9e0;text-transform:uppercase;font-weight:700;margin-bottom:8px">Realizado no mês (valores pagos / recebidos)</p>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:16px">
      ${card('Entradas recebidas', p.entradasReal, '#6ee9e0')}
      ${card('Saídas pagas', p.saidasReal, '#ffb4ab')}
      ${card('Impostos pagos', p.impostosPagos, '#ffcbac')}
      ${card('Resultado do mês', resultado, resultado>=0?'#6ee9e0':'#ffb4ab', 'entradas − saídas')}
    </div>
    <p style="font-size:10px;color:#ffcbac;text-transform:uppercase;font-weight:700;margin-bottom:8px">Previsto (pendências do mês e atrasadas)</p>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:20px">
      ${card('A receber', p.prevEntradas, '#6ee9e0')}
      ${card('A pagar', p.prevSaidas, '#ffb4ab')}
      ${card('Saldo final realizado', p.saldoFinalReal, p.saldoFinalReal>=0?'#6ee9e0':'#ffb4ab', 'saldo inicial ' + fmt(p.saldoAnterior))}
      ${card('Saldo projetado', p.saldoProjetado, p.saldoProjetado>=0?'#6ee9e0':'#ffb4ab', 'realizado + previsto')}
    </div>
    ${p.investLiquido !== 0 ? `<p style="font-size:11px;color:#869391;margin-bottom:16px">Aportes líquidos em investimentos no mês: <strong>${fmt(p.investLiquido)}</strong> (movimentação entre a conta e o investimento — não entra nas entradas, saídas nem no resultado).</p>` : ''}

    <div style="display:grid;grid-template-columns:1.1fr 1fr;gap:16px">
      <div class="card">
        <span style="font-size:10px;color:#6ee9e0;text-transform:uppercase;font-weight:700">Balanço do Mês — Entradas × Saídas</span>
        <div style="margin-top:16px">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px"><span>Entradas</span><span style="font-family:'JetBrains Mono',monospace;color:#6ee9e0;font-weight:700">${fmt(p.entradasReal)}</span></div>
          <div style="height:20px;background:#30353d;border-radius:6px;overflow:hidden;margin-bottom:16px"><div style="height:100%;width:${(p.entradasReal/maxBarra)*100}%;background:#6ee9e0"></div></div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px"><span>Saídas</span><span style="font-family:'JetBrains Mono',monospace;color:#ffb4ab;font-weight:700">${fmt(p.saidasReal)}</span></div>
          <div style="height:20px;background:#30353d;border-radius:6px;overflow:hidden"><div style="height:100%;width:${(p.saidasReal/maxBarra)*100}%;background:#ffb4ab"></div></div>
        </div>
      </div>
      <div class="card">
        <span style="font-size:10px;color:#6ee9e0;text-transform:uppercase;font-weight:700">Saídas pagas por Categoria</span>
        <div style="margin-top:16px">
          ${distribuicaoHtml || '<p style="color:#869391;text-align:center;padding:20px 0">Sem saídas pagas no período</p>'}
        </div>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;margin-top:24px;padding-top:16px;border-top:1px solid #3d4948;font-size:9px;color:#869391;text-transform:uppercase">
      <span>Documento Confidencial - ${nomeEmpresa}</span>
      <span>Página 1 de 2</span>
    </div>
  </div>

  <!-- PÁGINA 2 — LANÇAMENTOS DETALHADOS -->
  <div class="page">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid #3d4948">
      <span style="font-size:14px;font-weight:800;color:#6ee9e0">${nomeEmpresa}</span>
      <span style="font-size:10px;color:#869391;text-transform:uppercase">Lançamentos — ${mesNome}</span>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#252a32">
          <th style="padding:8px 10px;text-align:left;font-size:9px;color:#869391;text-transform:uppercase">Pago em / Vence</th>
          <th style="padding:8px 10px;text-align:left;font-size:9px;color:#869391;text-transform:uppercase">Descrição</th>
          <th style="padding:8px 10px;text-align:left;font-size:9px;color:#869391;text-transform:uppercase">Categoria</th>
          <th style="padding:8px 10px;text-align:left;font-size:9px;color:#869391;text-transform:uppercase">Obra</th>
          <th style="padding:8px 10px;text-align:center;font-size:9px;color:#869391;text-transform:uppercase">Status</th>
          <th style="padding:8px 10px;text-align:right;font-size:9px;color:#869391;text-transform:uppercase">Valor</th>
          <th style="padding:8px 10px;text-align:center;font-size:9px;color:#869391;text-transform:uppercase">Anexo</th>
        </tr>
      </thead>
      <tbody>${linhasHtml || '<tr><td colspan="7" style="padding:24px;text-align:center;color:#869391">Nenhum lançamento neste período</td></tr>'}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;gap:24px;margin-top:20px;padding-top:16px;border-top:1px solid #3d4948;flex-wrap:wrap">
      <span style="font-size:12px;color:#869391">Entradas recebidas: <strong style="color:#6ee9e0">${fmt(p.entradasReal)}</strong></span>
      <span style="font-size:12px;color:#869391">Saídas pagas: <strong style="color:#ffb4ab">${fmt(p.saidasReal)}</strong></span>
      <span style="font-size:13px;font-weight:700">Resultado: <strong style="color:${resultado>=0?'#6ee9e0':'#ffb4ab'}">${fmt(resultado)}</strong></span>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:24px;padding-top:16px;border-top:1px solid #3d4948;font-size:9px;color:#869391;text-transform:uppercase">
      <span>Documento Confidencial - ${nomeEmpresa}</span>
      <span>Página 2 de 2</span>
    </div>
  </div>

  <script>window.onload = () => { window.print() }</script>
  </body></html>`

  const win = window.open('', '_blank')
  if (win) { win.document.write(html); win.document.close() }
}

const CAT_IN  = ['Medição de obra','Adiantamento','Sinal de contrato','Parcela de contrato', CAT_RESGATE, 'Outros']
const CAT_OUT = ['Medição de obra','Material','Mão de obra','Terceiros','Aluguel','Equipamento','Imposto','Pessoal','Marketing','Administrativo','Reembolso', CAT_APORTE, CAT_FATURA,'Outros']

// Formulários em função (e não constante) para a data ser sempre a de HOJE no momento de abrir — e no horário local.
const LZ = () => ({ data: hojeISO(), descricao: '', tipo: 'saida', valor: '', categoria: '', conta: '', status: 'pago', data_pagamento: '', data_vencimento: '', obra_id: '', servico_id: '', nf_numero: '', nf_url: '', nf_arquivo: null as File | null, recorrente: false, favorecido: '' })
const CZ = () => ({ nome: '', banco: '', tipo: 'corrente', saldo_inicial: '' })
const CAZ = () => ({ nome: '', bandeira: '', limite: '', dia_fechamento: '', dia_vencimento: '' })
const GZ = () => ({ data: hojeISO(), descricao: '', valor: '', categoria: '', cartao_id: '', parcelas: '1', obra_id: '', servico_id: '', nf_numero: '', nf_arquivo: null as File | null })
const IZ = () => ({ descricao: '', tipo: 'aporte', valor: '', data: hojeISO(), instituicao: '', observacao: '', conta: '' })
const RCZ = () => ({ data: hojeISO(), valor: '', descricao: '', obra_id: '', servico_id: '', conta: '' })

const WZ_VAZIO = () => ({
  step: 'tipo',
  tipo: 'saida' as 'saida' | 'entrada',
  data: hojeISO(),
  descricao: '', valor: '', categoria: '',
  nf_numero: '', nf_arquivo: null as File | null,
  destino: 'empresa' as 'empresa' | 'obra',
  obra_id: '', servico_id: '',
  forma_pagamento: 'a_vista' as 'a_vista' | 'faturado' | 'cartao',
  dias_prazo: '30',
  cartao_id: '', parcelas: '1',
  data_pagamento_combinada: '',
  favorecido: '',
  recorrente: false,
  conta: '',
})

// classes reutilizáveis
const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const labelCls = 'text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5'
const fileCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface-variant text-xs px-2 py-2 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-primary/10 file:text-primary file:text-xs file:font-semibold cursor-pointer'
const btnPrimaryCls = 'bg-primary text-on-primary rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer'
const btnSecondaryCls = 'bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg px-4 py-2.5 text-sm hover:bg-surface-variant transition-all cursor-pointer'
const btnDangerSmCls = 'bg-error/10 border border-error/30 text-error rounded-md px-2.5 py-1 text-xs hover:bg-error/20 transition-all cursor-pointer'
const btnEditSmCls = 'bg-primary/10 border border-primary/30 text-primary rounded-md px-2.5 py-1 text-xs hover:bg-primary/20 transition-all cursor-pointer'
const cardCls = 'bg-surface-container border border-outline-variant rounded-xl p-5'
const sectionCls = 'bg-surface-container border border-outline-variant rounded-xl p-5 mb-4'
const rowCls = 'flex justify-between items-center py-3 border-b border-outline-variant last:border-0'

const TABS: [string, string, string][] = [
  ['visao', 'Visão Geral', 'grid_view'],
  ['lancamentos', 'Lançamentos', 'list_alt'],
  ['obras', 'Por Obra', 'construction'],
  ['contas', 'Contas', 'account_balance'],
  ['cartoes', 'Cartões', 'credit_card'],
  ['agenda', 'Agenda Pagamentos', 'calendar_month'],
  ['investimentos', 'Investimentos', 'monitoring'],
]
const tabActiveCls = 'px-5 py-2.5 rounded-xl bg-surface-container border-2 border-primary text-primary font-bold transition-all flex items-center gap-2 whitespace-nowrap'
const tabInactiveCls = 'px-5 py-2.5 rounded-xl bg-surface-container border border-outline-variant text-on-surface-variant hover:bg-surface-variant transition-all flex items-center gap-2 whitespace-nowrap'

function statusBadge(pago: boolean) {
  return pago ? 'bg-primary-container/10 text-primary-container border-primary-container/20' : 'bg-tertiary/10 text-tertiary border-tertiary/20'
}

export default function Financeiro() {
  const [aba, setAba] = useState('visao')
  const [contas, setContas] = useState<any[]>([])
  const [lancamentos, setLancamentos] = useState<any[]>([])
  const [cartoes, setCartoes] = useState<any[]>([])
  const [gastosCartao, setGastosCartao] = useState<any[]>([])
  const [obras, setObras] = useState<any[]>([])
  const [obraDetalhe, setObraDetalhe] = useState<any>(null)
  const [servicosObra, setServicosObra] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [salvando, setSalvando] = useState(false)
  const salvandoLancRef = useRef(false)
  const garantindoRecorrentesRef = useRef(false)
  const [modal, setModal] = useState('')
  const [filtroMes, setFiltroMes] = useState(hojeISO().slice(0, 7))
  const [fLanc, setFLanc] = useState<any>(LZ())
  const [lancEditando, setLancEditando] = useState<any>(null)
  const [fConta, setFConta] = useState(CZ())
  const [fCartao, setFCartao] = useState(CAZ())
  const [fGasto, setFGasto] = useState<any>(GZ())
  const [investimentos, setInvestimentos] = useState<any[]>([])
  const [fInvest, setFInvest] = useState(IZ())
  const [userEmail, setUserEmail] = useState('')
  const [wizardAberto, setWizardAberto] = useState(false)
  const [wiz, setWiz] = useState<any>(WZ_VAZIO())
  const [wizSalvando, setWizSalvando] = useState(false)
  // Trava síncrona contra duplo-clique (o estado `wizSalvando` só bloqueia o botão depois de
  // um re-render; um duplo-clique muito rápido pode passar antes disso).
  const salvandoLockRef = useRef(false)
  const [fRecebCartao, setFRecebCartao] = useState(RCZ())
  // pagar um lançamento pendente (data do pagamento + conta) e pagar fatura de cartão
  const [fPagamento, setFPagamento] = useState<{ lanc: any; data: string; conta: string } | null>(null)
  const [fFatura, setFFatura] = useState<{ cartao: any; fatura: any; conta: string; jaPaga: boolean; data: string } | null>(null)
  const [atribuicoes, setAtribuicoes] = useState<Record<string, string>>({})
  const [fSerie, setFSerie] = useState<any>(null) // custo fixo (recorrente) que o usuário quer excluir

  useEffect(() => {
    const token = localStorage.getItem('viga_token')
    if (!token) { window.location.href = '/'; return }
    setUserEmail(localStorage.getItem('viga_email') || '')
    obterMinhasPermissoes().then(perm => { if (!temAcessoModulo(perm, 'financeiro')) window.location.href = '/' })
    carregar()
  }, [])

  // abre o lançamento apontado por um alerta (conta a pagar/receber) já no mês dele
  useAbrirAlvo(CHAVE.lancamento, !loading, id => {
    const l = lancamentos.find((x: any) => x.id === id)
    if (!l) return alert('Esse lançamento não existe mais (pode já ter sido pago ou excluído).')
    const mes = String(l.data_vencimento || l.data || '').slice(0, 7)
    if (/^d{4}-d{2}$/.test(mes)) setFiltroMes(mes)
    editarLancamento(l)
  })

  function sair() {
    localStorage.removeItem('viga_token')
    localStorage.removeItem('viga_refresh_token')
    localStorage.removeItem('viga_email')
    window.location.href = '/'
  }

  async function carregar() {
    setLoading(true)
    try {
      const [c,l,ca,g,o,sv,inv] = await Promise.all([
        getTudo('contas','?order=created_at'),
        getTudo('lancamentos','?order=data.desc,id'),
        getTudo('cartoes','?order=created_at'),
        getTudo('gastos_cartao','?order=data.desc,id'),
        getTudo('obras','?order=created_at.desc'),
        getTudo('obra_servicos','?order=created_at'),
        getTudo('investimentos','?order=data.desc,id'),
      ])
      setContas(c); setCartoes(ca); setGastosCartao(g); setObras(o); setServicosObra(sv); setInvestimentos(inv)
      // Trava contra chamadas concorrentes de carregar() — sem isso, duas execuções em paralelo
      // veriam o mesmo "mês faltando" e cada uma criaria sua própria cópia da recorrência.
      let criouRecorrente = false
      if (!garantindoRecorrentesRef.current) {
        garantindoRecorrentesRef.current = true
        try { criouRecorrente = await garantirRecorrentes(l) } catch { /* recorrência é secundária: não impede de abrir o financeiro */ } finally { garantindoRecorrentesRef.current = false }
      }
      setLancamentos(criouRecorrente ? await getTudo('lancamentos','?order=data.desc,id') : l)
      setErroCarga('')
    } catch (e: any) {
      setErroCarga(e?.message || 'Falha ao carregar os dados financeiros')
    }
    setLoading(false)
  }

  // Custo fixo (energia, água, internet...): garante que o grupo recorrente sempre tenha
  // uma instância no mês atual e no próximo, gerada sob demanda (sem cron) toda vez que a
  // tela carrega. Idempotente — só cria o que ainda não existe para aquele mês.
  async function garantirRecorrentes(lancs: any[]): Promise<boolean> {
    const grupos = new Map<string, any[]>()
    lancs.forEach((l: any) => {
      if (l.recorrente && l.recorrente_grupo) {
        if (!grupos.has(l.recorrente_grupo)) grupos.set(l.recorrente_grupo, [])
        grupos.get(l.recorrente_grupo)!.push(l)
      }
    })
    const hoje = hojeISO()
    const mesAtual = hoje.slice(0, 7)
    const proxMes = somarMesesISO(mesAtual + '-01', 1).slice(0, 7)
    let criouAlgum = false
    for (const itens of grupos.values()) {
      const maisRecente = itens.slice().sort((a, b) => (a.data < b.data ? 1 : -1))[0]
      const mesesExistentes = new Set(itens.map((i: any) => i.data.slice(0, 7)))
      for (const mesAlvo of [mesAtual, proxMes]) {
        if (mesesExistentes.has(mesAlvo)) continue
        const diaOriginal = parseInt(maisRecente.data.slice(8, 10), 10)
        const [ano, mes] = mesAlvo.split('-').map(Number)
        const ultimoDiaMes = new Date(ano, mes, 0).getDate()
        const novaData = `${mesAlvo}-${String(Math.min(diaOriginal, ultimoDiaMes)).padStart(2, '0')}`
        const nova: any = {
          data: novaData, descricao: maisRecente.descricao, tipo: maisRecente.tipo,
          valor: maisRecente.valor, categoria: maisRecente.categoria, conta: maisRecente.conta,
          status: 'pendente', data_vencimento: novaData,
          recorrente: true, recorrente_grupo: maisRecente.recorrente_grupo,
        }
        if (maisRecente.obra_id) nova.obra_id = maisRecente.obra_id
        if (maisRecente.servico_id) nova.servico_id = maisRecente.servico_id
        await inserir('lancamentos', nova)
        criouAlgum = true
      }
    }
    return criouAlgum
  }

  // Aporte/resgate lançado no financeiro é a MESMA coisa que o movimento da aba Investimentos: um único
  // registro de dinheiro (o lançamento, que mexe na conta) com o espelho na aba Investimentos.
  async function sincronizarInvestimento(lanc: any, extra: { instituicao?: string; observacao?: string } = {}) {
    const existentes = await get('investimentos', `?lancamento_id=eq.${lanc.id}&select=id`)
    if (!ehMovInvestimento(lanc)) {
      for (const e of existentes) await deletar('investimentos', e.id)
      return
    }
    const dados: any = {
      descricao: lanc.descricao,
      tipo: lanc.categoria === CAT_APORTE ? 'aporte' : 'resgate',
      valor: Math.abs(num(lanc.valor)),
      data: lanc.data_pagamento || lanc.data,
      lancamento_id: lanc.id,
    }
    if (extra.instituicao !== undefined) dados.instituicao = extra.instituicao
    if (extra.observacao !== undefined) dados.observacao = extra.observacao
    if (existentes[0]) await atualizar('investimentos', existentes[0].id, dados)
    else await inserir('investimentos', { instituicao: '', observacao: 'Gerado automaticamente a partir do lançamento financeiro', ...dados })
  }

  async function salvarLanc() {
    if (salvandoLancRef.current) return
    const valor = arred2(fLanc.valor)
    if (!fLanc.descricao || !(valor > 0)) return alert('Preencha a descrição e um valor maior que zero')
    if (fLanc.status === 'pago' && !fLanc.conta) return alert('Selecione a conta: todo lançamento pago precisa de conta para os saldos fecharem')
    salvandoLancRef.current = true
    setSalvando(true)
    try {
      let nf_url = fLanc.nf_url || ''
      if (fLanc.nf_arquivo) {
        const url = await uploadNF(fLanc.nf_arquivo, fLanc.descricao)
        if (!url) { alert('Não foi possível enviar o arquivo da NF. O lançamento NÃO foi salvo — tente de novo.'); return }
        nf_url = url
      }
      const pago = fLanc.status === 'pago'
      const dados: any = {
        ...fLanc, valor, nf_arquivo: undefined, nf_url: nf_url || undefined,
        data_pagamento: pago ? (fLanc.data_pagamento || fLanc.data) : null,
        data_vencimento: pago ? (fLanc.data_vencimento || undefined) : (fLanc.data_vencimento || fLanc.data),
      }
      if (!dados.obra_id) delete dados.obra_id
      if (!dados.servico_id) delete dados.servico_id
      if (!dados.data_vencimento) delete dados.data_vencimento
      if (!dados.nf_url) delete dados.nf_url
      if (!dados.favorecido) delete dados.favorecido
      if (!dados.conta) delete dados.conta
      if (!dados.recorrente) { delete dados.recorrente; delete dados.recorrente_grupo }
      let gravado: any
      if (lancEditando) {
        delete dados.recorrente_grupo
        await atualizar('lancamentos', lancEditando.id, dados)
        gravado = { ...lancEditando, ...dados, id: lancEditando.id }
      } else {
        if (dados.recorrente) dados.recorrente_grupo = crypto.randomUUID()
        gravado = await inserir('lancamentos', dados)
      }
      await sincronizarInvestimento(gravado)
      setModal(''); setFLanc(LZ()); setLancEditando(null); await carregar()
    } catch (e: any) {
      alert('Não foi possível salvar o lançamento: ' + (e?.message || 'verifique a conexão e tente novamente.'))
    } finally {
      salvandoLancRef.current = false
      setSalvando(false)
    }
  }

  async function salvarConta() {
    if (!fConta.nome.trim()) return alert('Preencha o nome')
    if (contas.some(c => c.nome.trim().toLowerCase() === fConta.nome.trim().toLowerCase())) return alert('Já existe uma conta com esse nome')
    try {
      await inserir('contas', { ...fConta, nome: fConta.nome.trim(), saldo_inicial: arred2(fConta.saldo_inicial || '0') })
      setModal(''); setFConta(CZ()); await carregar()
    } catch (e: any) { alert('Não foi possível salvar a conta: ' + e.message) }
  }

  async function salvarCartao() {
    if (!fCartao.nome.trim()) return alert('Preencha o nome')
    const fech = parseInt(fCartao.dia_fechamento || '1'), venc = parseInt(fCartao.dia_vencimento || '10')
    if (!(fech >= 1 && fech <= 31 && venc >= 1 && venc <= 31)) return alert('Dias de fechamento e vencimento devem estar entre 1 e 31')
    try {
      await inserir('cartoes', { ...fCartao, nome: fCartao.nome.trim(), limite: arred2(fCartao.limite || '0'), dia_fechamento: fech, dia_vencimento: venc })
      setModal(''); setFCartao(CAZ()); await carregar()
    } catch (e: any) { alert('Não foi possível salvar o cartão: ' + e.message) }
  }

  // Pagar um lançamento pendente: pede a data em que foi pago e a conta (obrigatória, exceto saída de obra de gerenciamento).
  function abrirPagamento(l: any) {
    setFPagamento({ lanc: l, data: hojeISO(), conta: l.conta || '' })
  }
  const contaDispensada = (l: any) => l.tipo === 'saida' && !!l.obra_id && obras.some(o => o.id === l.obra_id && o.gerenciamento)
  async function confirmarPagamento() {
    if (!fPagamento) return
    const { lanc, data, conta } = fPagamento
    if (!data) return alert('Informe a data do pagamento')
    if (!conta && !contaDispensada(lanc)) return alert('Selecione a conta onde o pagamento foi feito/recebido')
    try {
      await atualizar('lancamentos', lanc.id, { status: 'pago', data_pagamento: data, ...(conta ? { conta } : {}) })
      const pagoAgora = { ...lanc, status: 'pago', data_pagamento: data, conta: conta || lanc.conta }
      if (ehMovInvestimento(pagoAgora)) await sincronizarInvestimento(pagoAgora)
      setFPagamento(null); await carregar()
    } catch (e: any) { alert('Não foi possível marcar como pago: ' + e.message) }
  }

  // ── exclusões (sempre com confirmação, sem deixar registro solto) ──────────────────────────────
  // Custo fixo (recorrente) é regerado todo mês enquanto a série existir — por isso excluir só "este" não adianta (voltava
  // sozinho). Aqui o usuário escolhe: encerrar a série a partir deste mês, ou apagar a série inteira.
  async function excluirSerie(l: any, modo: 'daqui' | 'toda') {
    const grupo = lancamentos.filter(x => x.recorrente_grupo === l.recorrente_grupo)
    const alvo = modo === 'toda' ? grupo : grupo.filter(x => (x.data || '') >= (l.data || ''))
    try {
      for (const x of alvo) {
        const meds = await get('medicoes', `?lancamento_id=eq.${x.id}&select=id`)
        for (const m of meds) await atualizar('medicoes', m.id, { lancamento_id: null, data_pagamento_programada: null })
        await deletar('lancamentos', x.id)
      }
      // os anteriores ficam como histórico, mas deixam de gerar novos meses
      if (modo === 'daqui') for (const x of grupo.filter(y => (y.data || '') < (l.data || ''))) await atualizar('lancamentos', x.id, { recorrente: false })
      setFSerie(null)
      await carregar()
    } catch (e: any) { alert('Não foi possível excluir: ' + e.message) }
  }
  async function excluirLancamento(l: any) {
    if (l.recorrente && l.recorrente_grupo) { setFSerie(l); return }
    const extras: string[] = []
    if (l.categoria === CAT_FATURA) extras.push('As compras dessa fatura voltam para "em aberto" no cartão.')
    if (l.categoria === 'Medição de obra') extras.push('Se for o pagamento de uma medição, a medição ficará sem pagamento programado.')
    if (ehMovInvestimento(l)) extras.push('O movimento correspondente na aba Investimentos também será removido.')
    if (!confirm(`Excluir o lançamento "${l.descricao}" (${fmt(num(l.valor))})?\n${extras.join('\n')}\nEsta ação não pode ser desfeita.`)) return
    try {
      const meds = await get('medicoes', `?lancamento_id=eq.${l.id}&select=id`)
      for (const m of meds) await atualizar('medicoes', m.id, { lancamento_id: null, data_pagamento_programada: null })
      await deletar('lancamentos', l.id)
      await carregar()
    } catch (e: any) { alert('Não foi possível excluir: ' + e.message) }
  }
  async function excluirGasto(g: any) {
    if (g.fatura_lancamento_id) return alert('Esta compra já faz parte de um pagamento de fatura. Exclua o lançamento da fatura (aba Lançamentos) antes de apagar a compra.')
    if (!confirm(`Excluir a compra "${g.descricao}" (${fmt(num(g.valor))}) do cartão?`)) return
    try { await deletar('gastos_cartao', g.id); await carregar() } catch (e: any) { alert('Não foi possível excluir: ' + e.message) }
  }
  async function excluirConta(c: any) {
    const usados = lancamentos.filter(l => l.conta === c.nome).length
    if (usados > 0) return alert(`A conta "${c.nome}" tem ${usados} lançamento(s) vinculado(s) e não pode ser excluída (os saldos deixariam de fechar). Mova os lançamentos para outra conta antes.`)
    if (!confirm(`Excluir a conta "${c.nome}"?`)) return
    try { await deletar('contas', c.id); await carregar() } catch (e: any) { alert('Não foi possível excluir: ' + e.message) }
  }
  async function excluirCartao(c: any) {
    const usados = gastosCartao.filter(g => g.cartao_id === c.id).length
    if (usados > 0) return alert(`O cartão "${c.nome}" tem ${usados} compra(s) lançada(s) e não pode ser excluído. Exclua as compras antes.`)
    if (!confirm(`Excluir o cartão "${c.nome}"?`)) return
    try { await deletar('cartoes', c.id); await carregar() } catch (e: any) { alert('Não foi possível excluir: ' + e.message) }
  }
  async function excluirInvestimento(inv: any) {
    if (!confirm(`Excluir o movimento "${inv.descricao}" (${fmt(num(inv.valor))})?${inv.lancamento_id ? '\nO lançamento correspondente na conta também será excluído.' : ''}`)) return
    try {
      if (inv.lancamento_id) await deletar('lancamentos', inv.lancamento_id) // o espelho some junto (cascade)
      else await deletar('investimentos', inv.id)
      await carregar()
    } catch (e: any) { alert('Não foi possível excluir: ' + e.message) }
  }

  async function salvarGasto() {
    const valor = arred2(fGasto.valor)
    if (!fGasto.descricao || !(valor > 0) || !fGasto.cartao_id) return alert('Preencha o cartão, a descrição e um valor maior que zero')
    if (salvandoLancRef.current) return
    salvandoLancRef.current = true
    setSalvando(true)
    try {
      let nf_url = ''
      if (fGasto.nf_arquivo) {
        const url = await uploadNF(fGasto.nf_arquivo, fGasto.descricao)
        if (!url) { alert('Não foi possível enviar o arquivo da NF. A compra NÃO foi salva — tente de novo.'); return }
        nf_url = url
      }
      await gravarCompraCartao({
        data: fGasto.data, descricao: fGasto.descricao, valor, categoria: fGasto.categoria, cartao_id: fGasto.cartao_id,
        parcelas: parseInt(fGasto.parcelas || '1'), obra_id: fGasto.obra_id, servico_id: fGasto.servico_id, nf_numero: fGasto.nf_numero, nf_url,
      })
      setModal(''); setFGasto(GZ()); await carregar()
    } catch (e: any) {
      alert('Não foi possível salvar a compra no cartão: ' + e.message)
    } finally {
      salvandoLancRef.current = false
      setSalvando(false)
    }
  }

  // Compra no cartão: uma linha por parcela, datas mês a mês (sem pular mês) e centavos que fecham o total.
  async function gravarCompraCartao(c: { data: string; descricao: string; valor: number; categoria: string; cartao_id: string; parcelas: number; obra_id?: string; servico_id?: string; nf_numero?: string; nf_url?: string }) {
    const n = Math.max(1, c.parcelas || 1)
    const valores = dividirParcelas(c.valor, n)
    for (let i = 0; i < n; i++) {
      const dados: any = {
        data: somarMesesISO(c.data, i),
        descricao: c.descricao + (n > 1 ? ` (parcela ${i + 1}/${n})` : ''),
        valor: valores[i],
        categoria: c.categoria,
        cartao_id: c.cartao_id,
        parcelas: n,
        parcela_numero: i + 1,
      }
      if (c.nf_numero) dados.nf_numero = c.nf_numero
      if (c.obra_id) dados.obra_id = c.obra_id
      if (c.obra_id && c.servico_id) dados.servico_id = c.servico_id
      if (c.nf_url) dados.nf_url = c.nf_url
      await inserir('gastos_cartao', dados)
    }
  }

  // Pagar (ou programar) a fatura: vira UM lançamento de saída na conta; as compras ficam ligadas a ele.
  async function confirmarFatura() {
    if (!fFatura) return
    const { cartao, fatura, conta, jaPaga, data } = fFatura
    if (fatura.aberto <= 0) return
    if (jaPaga && !conta) return alert('Selecione a conta de onde a fatura foi paga')
    if (jaPaga && !data) return alert('Informe a data do pagamento')
    if (salvandoLancRef.current) return
    salvandoLancRef.current = true
    try {
      const dados: any = {
        data: jaPaga ? data : fatura.vencimento,
        descricao: `Fatura ${cartao.nome} — venc. ${dataBR(fatura.vencimento)}`,
        tipo: 'saida', valor: fatura.aberto, categoria: CAT_FATURA, forma_pagamento: 'cartao',
        status: jaPaga ? 'pago' : 'pendente',
        data_vencimento: fatura.vencimento,
      }
      if (conta) dados.conta = conta
      if (jaPaga) dados.data_pagamento = data
      const lanc = await inserir('lancamentos', dados)
      for (const g of fatura.itensAbertos) await atualizar('gastos_cartao', g.id, { fatura_lancamento_id: lanc.id })
      setFFatura(null); await carregar()
    } catch (e: any) {
      alert('Não foi possível registrar a fatura: ' + e.message)
    } finally { salvandoLancRef.current = false }
  }

  // Investimento: aporte sai da conta, resgate volta para ela. É um lançamento (para os saldos) com o espelho em Investimentos.
  async function salvarInvestimento() {
    const valor = arred2(fInvest.valor)
    if (!fInvest.descricao || !(valor > 0)) return alert('Preencha a descrição e um valor maior que zero')
    if (!fInvest.conta) return alert(fInvest.tipo === 'aporte' ? 'Selecione a conta de onde o dinheiro saiu' : 'Selecione a conta para onde o dinheiro voltou')
    if (salvandoLancRef.current) return
    salvandoLancRef.current = true
    try {
      const lanc = await inserir('lancamentos', {
        data: fInvest.data, descricao: fInvest.descricao, valor,
        tipo: fInvest.tipo === 'aporte' ? 'saida' : 'entrada',
        categoria: fInvest.tipo === 'aporte' ? CAT_APORTE : CAT_RESGATE,
        status: 'pago', data_pagamento: fInvest.data, conta: fInvest.conta,
      })
      await sincronizarInvestimento(lanc, { instituicao: fInvest.instituicao, observacao: fInvest.observacao })
      setModal(''); setFInvest(IZ()); await carregar()
    } catch (e: any) {
      alert('Não foi possível registrar o movimento: ' + e.message)
    } finally { salvandoLancRef.current = false }
  }

  // Atribui conta, de uma vez, aos lançamentos pagos que estão sem conta.
  async function salvarAtribuicoes() {
    const itens = Object.entries(atribuicoes).filter(([, conta]) => conta)
    if (itens.length === 0) return alert('Escolha a conta de pelo menos um lançamento')
    try {
      for (const [id, conta] of itens) await atualizar('lancamentos', id, { conta })
      setAtribuicoes({}); setModal(''); await carregar()
    } catch (e: any) { alert('Não foi possível atribuir as contas: ' + e.message) }
  }

  // ── Fluxo guiado de lançamento (NF → obra/empresa → forma de pagamento) ──
  function abrirWizard() {
    setWiz({ ...WZ_VAZIO(), data: hojeISO() })
    setWizardAberto(true)
  }
  function fecharWizard() {
    setWizardAberto(false)
    setWiz(WZ_VAZIO())
  }
  function voltarWizard() {
    const anterior: Record<string, string> = {
      s_dados: 'tipo',
      s_destino: 's_dados',
      s_obra: 's_destino',
      s_pagamento: wiz.destino === 'obra' ? 's_obra' : 's_destino',
      s_faturado: 's_pagamento',
      s_cartao: 's_pagamento',
      e_pergunta_nf: 'tipo',
      e_dados_nf: 'e_pergunta_nf',
      e_obra: 'e_dados_nf',
      e_data_pagamento: 'e_obra',
    }
    setWiz({ ...wiz, step: anterior[wiz.step] || 'tipo' })
  }
  function irParaFormularioTradicional() {
    setWizardAberto(false)
    setFLanc({ ...LZ(), tipo: 'entrada' })
    setLancEditando(null)
    setModal('lancamento')
    setWiz(WZ_VAZIO())
  }

  async function finalizarSaidaWizard(overrides: Partial<ReturnType<typeof WZ_VAZIO>> = {}) {
    if (salvandoLockRef.current) return
    const wizFinal = { ...wiz, ...overrides }
    const valorTotal = arred2(wizFinal.valor)
    if (!wizFinal.descricao || !(valorTotal > 0)) return alert('Preencha a descrição e um valor maior que zero')
    if (wizFinal.forma_pagamento !== 'cartao' && !wizFinal.conta) return alert('Selecione a conta de saída')
    if (wizFinal.forma_pagamento === 'cartao' && !wizFinal.cartao_id) return alert('Selecione o cartão')
    salvandoLockRef.current = true
    setWizSalvando(true)
    try {
      let nf_url = ''
      if (wizFinal.nf_arquivo) {
        const url = await uploadNF(wizFinal.nf_arquivo, wizFinal.descricao)
        if (!url) { alert('Não foi possível enviar o arquivo da NF. O lançamento NÃO foi salvo — tente de novo.'); return }
        nf_url = url
      }
      const obraId = wizFinal.destino === 'obra' ? wizFinal.obra_id : ''
      const servicoId = wizFinal.destino === 'obra' ? wizFinal.servico_id : ''

      if (wizFinal.forma_pagamento === 'cartao') {
        await gravarCompraCartao({
          data: wizFinal.data, descricao: wizFinal.descricao, valor: valorTotal, categoria: wizFinal.categoria, cartao_id: wizFinal.cartao_id,
          parcelas: parseInt(wizFinal.parcelas || '1'), obra_id: obraId, servico_id: servicoId, nf_numero: wizFinal.nf_numero, nf_url,
        })
      } else {
        const pago = wizFinal.forma_pagamento !== 'faturado'
        const dados: any = {
          data: wizFinal.data,
          descricao: wizFinal.descricao,
          tipo: 'saida',
          valor: valorTotal,
          categoria: wizFinal.categoria,
          forma_pagamento: wizFinal.forma_pagamento,
          status: pago ? 'pago' : 'pendente',
          conta: wizFinal.conta,
        }
        if (pago) dados.data_pagamento = wizFinal.data
        else dados.data_vencimento = somarDiasISO(wizFinal.data, parseInt(wizFinal.dias_prazo || '0'))
        if (wizFinal.nf_numero) dados.nf_numero = wizFinal.nf_numero
        if (obraId) dados.obra_id = obraId
        if (servicoId) dados.servico_id = servicoId
        if (nf_url) dados.nf_url = nf_url
        if (wizFinal.favorecido) dados.favorecido = wizFinal.favorecido
        if (wizFinal.recorrente) { dados.recorrente = true; dados.recorrente_grupo = crypto.randomUUID() }
        const gravado = await inserir('lancamentos', dados)
        await sincronizarInvestimento(gravado)
      }
      // O "valor realizado" do serviço da obra é calculado a partir dos lançamentos vinculados a ele (tela de Obras):
      // não se soma mais nada manualmente aqui — era isso que duplicava custos e não voltava ao excluir.
      fecharWizard()
      await carregar()
    } catch (e: any) {
      alert('Não foi possível salvar o lançamento: ' + (e?.message || 'verifique a conexão e tente novamente.'))
    } finally {
      salvandoLockRef.current = false
      setWizSalvando(false)
    }
  }

  async function finalizarEntradaComNFWizard() {
    if (salvandoLockRef.current) return
    const valor = arred2(wiz.valor)
    if (!wiz.descricao || !(valor > 0) || !wiz.data_pagamento_combinada) return alert('Preencha descrição, valor maior que zero e data de pagamento')
    if (!wiz.conta) return alert('Selecione em qual conta o pagamento vai cair')
    salvandoLockRef.current = true
    setWizSalvando(true)
    try {
      let nf_url = ''
      if (wiz.nf_arquivo) {
        const url = await uploadNF(wiz.nf_arquivo, wiz.descricao)
        if (!url) { alert('Não foi possível enviar o arquivo da NF. O lançamento NÃO foi salvo — tente de novo.'); return }
        nf_url = url
      }
      const dados: any = {
        data: wiz.data,
        descricao: wiz.descricao,
        tipo: 'entrada',
        valor,
        categoria: wiz.categoria,
        status: 'pendente',
        data_vencimento: wiz.data_pagamento_combinada,
      }
      if (wiz.nf_numero) dados.nf_numero = wiz.nf_numero
      if (wiz.obra_id) dados.obra_id = wiz.obra_id
      if (wiz.servico_id) dados.servico_id = wiz.servico_id
      if (nf_url) dados.nf_url = nf_url
      dados.conta = wiz.conta
      await inserir('lancamentos', dados)
      fecharWizard()
      await carregar()
    } catch (e: any) {
      alert('Não foi possível salvar o lançamento: ' + (e?.message || 'verifique a conexão e tente novamente.'))
    } finally {
      salvandoLockRef.current = false
      setWizSalvando(false)
    }
  }

  async function salvarRecebimentoCartao() {
    if (salvandoLancRef.current) return
    const valor = arred2(fRecebCartao.valor)
    if (!(valor > 0) || !fRecebCartao.data) return alert('Preencha valor maior que zero e data de recebimento')
    if (!fRecebCartao.conta) return alert('Selecione em qual conta o valor vai cair')
    salvandoLancRef.current = true
    setSalvando(true)
    try {
      const hojeStr = hojeISO()
      const recebido = fRecebCartao.data <= hojeStr
      const dados: any = {
        data: fRecebCartao.data,
        descricao: fRecebCartao.descricao || 'Recebimento no cartão',
        tipo: 'entrada',
        valor,
        meio_recebimento: 'cartao',
        status: recebido ? 'pago' : 'pendente',
        conta: fRecebCartao.conta,
      }
      if (recebido) dados.data_pagamento = fRecebCartao.data
      else dados.data_vencimento = fRecebCartao.data
      if (fRecebCartao.obra_id) dados.obra_id = fRecebCartao.obra_id
      if (fRecebCartao.servico_id) dados.servico_id = fRecebCartao.servico_id
      await inserir('lancamentos', dados)
      setModal(''); setFRecebCartao(RCZ()); await carregar()
    } catch (e: any) {
      alert('Não foi possível salvar o recebimento: ' + (e?.message || 'verifique a conexão e tente novamente.'))
    } finally {
      salvandoLancRef.current = false
      setSalvando(false)
    }
  }

  // ── Cálculos (um só motor para tela, PDF e Dashboard) ──────────────────────────────────────────
  const hojeStr = hojeISO()
  const mesNome = meses[parseInt(filtroMes.slice(5,7))-1] + ' ' + filtroMes.slice(0,4)
  const P = calcularPeriodo({ lancamentos, obras, contas, mes: filtroMes, hoje: hojeStr })
  const totalInvestido = investimentos.reduce((a,i) => {
    const v = num(i.valor)
    return i.tipo === 'aporte' ? a + v : a - v
  }, 0)
  const lancamentosEmpresa = P.empresa
  const idsAtrasadosAntes = new Set(P.atrasadosAntes.map(l => l.id))
  const nomeObra = (id: string) => obras.find(o => o.id === id)?.codigo

  function getCustosObra(id: string) {
    return lancamentos.filter(l=>l.obra_id===id&&l.tipo==='saida').reduce((a,l)=>a+num(l.valor),0)
     + gastosCartao.filter(g=>g.obra_id===id).reduce((a,g)=>a+num(g.valor),0)
  }
  function getReceitasObra(id: string) {
    return lancamentos.filter(l=>l.obra_id===id&&l.tipo==='entrada').reduce((a,l)=>a+num(l.valor),0)
  }
  function getRecebidoObra(id: string) {
    return lancamentos.filter(l=>l.obra_id===id&&l.tipo==='entrada'&&l.status==='pago').reduce((a,l)=>a+num(l.valor),0)
  }

  function editarLancamento(l: any) {
    setLancEditando(l)
    setFLanc({
      data: l.data||'', descricao: l.descricao||'', tipo: l.tipo||'saida', valor: l.valor||'', categoria: l.categoria||'',
      conta: l.conta||'', status: l.status||'pago', data_pagamento: l.data_pagamento||'', data_vencimento: l.data_vencimento||'',
      obra_id: l.obra_id||'', servico_id: l.servico_id||'', nf_numero: l.nf_numero||'', nf_url: l.nf_url||'', nf_arquivo: null,
      recorrente: l.recorrente||false, favorecido: l.favorecido||'',
    })
    setModal('lancamento')
  }

  // Linha de lançamento reutilizada na lista do mês e no detalhe da obra
  function LinhaStatus({ l }: { l: any }) {
    const pago = l.status === 'pago'
    const atrasado = !pago && dataEfetiva(l) < hojeStr
    return (
      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${atrasado ? 'bg-error/10 text-error border-error/20' : statusBadge(pago)}`}>
        {atrasado ? 'Vencido' : (pago ? 'Pago' : 'Pendente')}
      </span>
    )
  }

  const modaisComuns = (
    <>
      {fSerie && (() => {
        const grupo = lancamentos.filter(x => x.recorrente_grupo === fSerie.recorrente_grupo)
        const daqui = grupo.filter(x => (x.data || '') >= (fSerie.data || ''))
        const pagosToda = grupo.filter(x => x.status === 'pago').length
        return (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1100] p-4" onClick={e=>e.target===e.currentTarget&&setFSerie(null)} data-testid="modal-serie">
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[500px]">
              <div className="text-base font-bold text-on-surface mb-1">🔁 Excluir custo fixo</div>
              <div className="text-body-sm text-on-surface-variant mb-4"><strong>{fSerie.descricao}</strong> se repete todo mês. Se for excluído só este mês, o sistema cria de novo no próximo carregamento — por isso escolha o que fazer com a série:</div>
              <div className="flex flex-col gap-2.5 mb-5">
                <button className="text-left px-4 py-3 rounded-xl border-2 border-outline-variant hover:border-primary bg-surface-container-low transition-all" onClick={()=>excluirSerie(fSerie,'daqui')} data-testid="serie-daqui">
                  <div className="font-bold text-on-surface text-sm">Encerrar a partir deste mês</div>
                  <div className="text-[12px] text-on-surface-variant">Apaga este e os próximos ({daqui.length} lançamento(s)). Os meses anteriores ficam no histórico e deixam de se repetir.</div>
                </button>
                <button className="text-left px-4 py-3 rounded-xl border-2 border-outline-variant hover:border-error bg-surface-container-low transition-all" onClick={()=>{ if (confirm(`Apagar a série inteira (${grupo.length} lançamento(s), ${pagosToda} já pago(s))? Esta ação não pode ser desfeita.`)) excluirSerie(fSerie,'toda') }} data-testid="serie-toda">
                  <div className="font-bold text-error text-sm">Excluir a série inteira</div>
                  <div className="text-[12px] text-on-surface-variant">Apaga todos os {grupo.length} lançamento(s) deste custo fixo, inclusive os já pagos.</div>
                </button>
              </div>
              <div className="flex justify-end"><button className={btnSecondaryCls} onClick={()=>setFSerie(null)}>Cancelar</button></div>
            </div>
          </div>
        )
      })()}
      {fPagamento && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1100] p-4" onClick={e=>e.target===e.currentTarget&&setFPagamento(null)}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[460px]">
            <div className="text-base font-bold text-on-surface mb-1">{fPagamento.lanc.tipo === 'entrada' ? '💰 Confirmar recebimento' : '✅ Confirmar pagamento'}</div>
            <div className="text-body-sm text-on-surface-variant mb-4">{fPagamento.lanc.descricao} — <strong>{fmt(num(fPagamento.lanc.valor))}</strong></div>
            <div className="mb-3.5"><label className={labelCls}>Data do {fPagamento.lanc.tipo === 'entrada' ? 'recebimento' : 'pagamento'} *</label>
              <input type="date" className={inputCls} value={fPagamento.data} onChange={e=>setFPagamento({...fPagamento, data:e.target.value})} /></div>
            <div className="mb-5"><label className={labelCls}>Conta {contaDispensada(fPagamento.lanc) ? '(opcional — obra de gerenciamento)' : '*'}</label>
              <select className={inputCls} value={fPagamento.conta} onChange={e=>setFPagamento({...fPagamento, conta:e.target.value})}>
                <option value="">Selecione</option>
                {contas.map(c=><option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select></div>
            <div className="flex gap-2 justify-end">
              <button className={btnSecondaryCls} onClick={()=>setFPagamento(null)}>Cancelar</button>
              <button className={btnPrimaryCls} onClick={confirmarPagamento} data-testid="confirmar-pagamento">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-primary text-lg">Carregando...</div>
    </div>
  )

  if (erroCarga) return (
    <Layout userEmail={userEmail} onLogout={sair}>
      <div className={sectionCls + ' text-center py-16'}>
        <div className="text-5xl mb-4">⚠️</div>
        <div className="text-base font-bold text-on-surface mb-2">Não foi possível carregar os dados financeiros</div>
        <p className="text-body-sm text-on-surface-variant mb-4">{erroCarga}. Os números não são exibidos para você não decidir em cima de dados incompletos.</p>
        <button className={btnPrimaryCls} onClick={carregar}>Tentar novamente</button>
      </div>
    </Layout>
  )

  // ── DETALHE OBRA ──────────────────────────────────────────────
  if (obraDetalhe) {
    const lancObra = lancamentos.filter(l=>l.obra_id===obraDetalhe.id)
    const gastObra = gastosCartao.filter(g=>g.obra_id===obraDetalhe.id)
    const receitas = getReceitasObra(obraDetalhe.id)
    const recebido = getRecebidoObra(obraDetalhe.id)
    const custos   = getCustosObra(obraDetalhe.id)
    const contrato = num(obraDetalhe.valor_contrato)
    // Gerenciamento: custo é do cliente, não da Inverso — margem é só a taxa recebida.
    const margem   = obraDetalhe.gerenciamento ? receitas : receitas - custos
    const pctC     = contrato > 0 ? Math.min(((obraDetalhe.gerenciamento ? receitas : custos)/contrato)*100, 100) : 0

    return (
      <Layout userEmail={userEmail} onLogout={sair}>
        <div className="flex items-center gap-4 flex-wrap mb-lg">
          <button onClick={() => setObraDetalhe(null)} className={btnSecondaryCls}>← Voltar</button>
          <div>
            <div className="text-xl font-bold text-on-surface flex items-center gap-2">
              {obraDetalhe.nome}
              {obraDetalhe.gerenciamento && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-secondary/10 text-secondary border-secondary/20" title="Custos de fornecedor são do cliente — não entram no balanço da Inverso">🤝 Gerenciamento</span>}
            </div>
            <div className="text-body-sm text-on-surface-variant">{obraDetalhe.codigo} · Financeiro da Obra</div>
          </div>
          <div className="ml-auto">
            <button className={btnPrimaryCls} onClick={() => { setLancEditando(null); setFLanc({...LZ(), obra_id: obraDetalhe.id}); setModal('lancamento') }}>+ Lançamento</button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-lg">
          {[
            {l:'Contrato', v:fmt(contrato), c:'text-primary', sub:''},
            {l:'Receitas', v:fmt(receitas), c:'text-primary-container', sub:`recebido ${fmt(recebido)} · a receber ${fmt(receitas-recebido)}`},
            {l: obraDetalhe.gerenciamento ? 'Custos (do Cliente)' : 'Custos', v:fmt(custos), c:'text-error', sub:'lançamentos + cartão'},
            {l:'Margem', v:fmt(margem), c: margem>=0?'text-primary-container':'text-error', sub:''},
          ].map(({l,v,c,sub}) => (
            <div key={l} className={cardCls}>
              <div className="text-[11px] text-on-surface-variant uppercase tracking-widest mb-2">{l}</div>
              <div className={`text-xl font-bold ${c}`}>{v}</div>
              {sub && <div className="text-[11px] text-on-surface-variant mt-1">{sub}</div>}
            </div>
          ))}
        </div>

        {contrato > 0 && (
          <div className={sectionCls}>
            <div className="flex justify-between text-body-sm text-on-surface-variant mb-2">
              <span>Consumo do orçamento</span><span>{pctC.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-surface-variant rounded overflow-hidden mb-1.5">
              <div className={`h-full rounded ${pctC>90?'bg-error':pctC>70?'bg-tertiary':'bg-primary'}`} style={{ width: `${pctC}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-on-surface-variant">
              <span>Gasto: {fmt(custos)}</span><span>Disponível: {fmt(contrato-custos)}</span>
            </div>
          </div>
        )}

        <div className={sectionCls}>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm font-bold text-on-surface">Lançamentos</div>
            <button className={btnPrimaryCls} onClick={() => { setLancEditando(null); setFLanc({...LZ(), obra_id: obraDetalhe.id}); setModal('lancamento') }}>+ Novo</button>
          </div>
          {lancObra.length === 0 && gastObra.length === 0 ? (
            <div className="text-center py-8 text-on-surface-variant">Nenhum lançamento nesta obra</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-outline-variant">
                    {['Data','Descrição','Categoria','NF','Status','Valor',''].map(h=>(
                      <th key={h} className="text-left px-3 py-2 text-[11px] text-on-surface-variant uppercase bg-surface-container-high">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lancObra.map(l=>(
                    <tr key={l.id} className="border-b border-outline-variant hover:bg-surface-variant/20">
                      <td className="px-3 py-2.5 text-on-surface-variant text-xs">{dataBR(dataEfetiva(l))}</td>
                      <td className="px-3 py-2.5 font-semibold text-on-surface">{l.descricao}{l.recorrente && <span title="Custo fixo — repete todo mês" className="ml-1.5 text-[10px] font-semibold text-tertiary">🔁</span>}{l.favorecido && <div className="text-[11px] font-normal text-on-surface-variant">👤 {l.favorecido}</div>}</td>
                      <td className="px-3 py-2.5 text-on-surface-variant text-xs">{l.categoria||'—'}</td>
                      <td className="px-3 py-2.5">
                        {l.nf_numero && <span className="text-[11px] text-on-surface-variant">#{l.nf_numero} </span>}
                        {l.nf_url && <a href={l.nf_url} target="_blank" rel="noreferrer" className="text-[11px] text-primary">📎 Ver NF</a>}
                        {!l.nf_numero && !l.nf_url && <span className="text-on-surface-variant/50 text-[11px]">—</span>}
                      </td>
                      <td className="px-3 py-2.5"><LinhaStatus l={l} /></td>
                      <td className={`px-3 py-2.5 font-bold ${l.tipo==='entrada'?'text-primary-container':'text-error'}`}>
                        {l.tipo==='entrada'?'+':'-'}{fmt(num(l.valor))}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1.5">
                          {l.status!=='pago' && <button className={btnEditSmCls} onClick={()=>abrirPagamento(l)}>✓ Pago</button>}
                          <button className={btnEditSmCls} onClick={()=>editarLancamento(l)}>✏️</button>
                          <button className={btnDangerSmCls} onClick={()=>excluirLancamento(l)}>×</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {gastObra.map(g=>(
                    <tr key={g.id} className="border-b border-outline-variant hover:bg-surface-variant/20">
                      <td className="px-3 py-2.5 text-on-surface-variant text-xs">{dataBR(g.data)}</td>
                      <td className="px-3 py-2.5 font-semibold text-on-surface">{g.descricao} <span className="text-[10px] text-secondary">💳</span></td>
                      <td className="px-3 py-2.5 text-on-surface-variant text-xs">{g.categoria||'—'}</td>
                      <td className="px-3 py-2.5">
                        {g.nf_numero && <span className="text-[11px] text-on-surface-variant">#{g.nf_numero} </span>}
                        {g.nf_url && <a href={g.nf_url} target="_blank" rel="noreferrer" className="text-[11px] text-primary">📎 Ver NF</a>}
                        {!g.nf_numero && !g.nf_url && <span className="text-on-surface-variant/50 text-[11px]">—</span>}
                      </td>
                      <td className="px-3 py-2.5"><span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-secondary/10 text-secondary border-secondary/20">Cartão</span></td>
                      <td className="px-3 py-2.5 font-bold text-error">-{fmt(num(g.valor))}</td>
                      <td className="px-3 py-2.5">
                        <button className={btnDangerSmCls} onClick={()=>excluirGasto(g)}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {modal === 'lancamento' && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e=>e.target===e.currentTarget&&setModal('')}>
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[560px] max-h-[92vh] overflow-y-auto">
              <div className="text-base font-bold text-on-surface mb-1.5">{lancEditando ? '✏️ Editar Lançamento' : '📋 Novo Lançamento'}</div>
              <div className="text-body-sm text-primary mb-4">Obra: {obraDetalhe.nome}</div>
              <ModalLancamento fLanc={fLanc} setFLanc={setFLanc} contas={contas} obras={obras} servicos={servicosObra} salvando={salvando} onSalvar={salvarLanc} onCancel={()=>{setModal('');setLancEditando(null)}} />
            </div>
          </div>
        )}
        {modaisComuns}
      </Layout>
    )
  }

  return (
    <Layout
      userEmail={userEmail}
      onLogout={sair}
      searchSlot={
        <div className="relative w-full group">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline group-focus-within:text-primary transition-colors">search</span>
          <input type="text" placeholder="Pesquisar lançamentos, faturas..." className="w-full bg-surface-container-low border border-outline-variant rounded-full pl-12 pr-4 py-2 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
        </div>
      }
      topbarSlot={
        <>
          <button className={btnSecondaryCls + ' flex items-center gap-2'} onClick={()=>gerarPDFRelatorioMensal(lancamentos, obras, contas, filtroMes)}>
            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span> PDF
          </button>
          <button onClick={abrirWizard} className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl hover:opacity-90 transition-all font-label-md text-label-md shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-[20px]">add_circle</span>
            Novo Lançamento
          </button>
        </>
      }
    >
      {/* ALERTAS */}
      {P.vencAtrasados.length > 0 && (
        <div className="bg-error/10 border border-error/30 rounded-lg px-4 py-3 mb-4 text-sm text-error" data-testid="alerta-atrasados">
          🔴 <strong>{P.vencAtrasados.length} pagamento(s) atrasado(s)</strong> — Total: {fmt(P.vencAtrasados.reduce((a,l)=>a+num(l.valor),0))}
        </div>
      )}
      {P.vencProximos.length > 0 && (
        <div className="bg-tertiary/10 border border-tertiary/30 rounded-lg px-4 py-3 mb-4 text-sm text-tertiary" data-testid="alerta-proximos">
          ⚠️ <strong>{P.vencProximos.length} pagamento(s) vencem hoje ou nos próximos 7 dias</strong> — Total: {fmt(P.vencProximos.reduce((a,l)=>a+num(l.valor),0))}
        </div>
      )}
      {P.semConta.length > 0 && (
        <div className="bg-tertiary/10 border border-tertiary/30 rounded-lg px-4 py-3 mb-4 text-sm text-tertiary flex items-center justify-between gap-3 flex-wrap" data-testid="alerta-sem-conta">
          <span>🏦 <strong>{P.semConta.length} lançamento(s) pago(s) sem conta</strong> (líquido {fmt(P.semContaLiquido)}) — o Saldo Acumulado já os considera, mas nenhuma conta mostra esse valor.</span>
          <button className={btnEditSmCls} onClick={()=>{ setAtribuicoes({}); setModal('semconta') }}>Atribuir contas</button>
        </div>
      )}

      {/* TABS */}
      <nav className="flex gap-3 mb-lg flex-wrap">
        {TABS.map(([id, label, icon]) => (
          <button key={id} className={aba===id?tabActiveCls:tabInactiveCls} onClick={()=>setAba(id)}>
            <span className="material-symbols-outlined">{icon}</span>{label}
          </button>
        ))}
      </nav>

      {/* ── VISÃO GERAL ── */}
      {aba==='visao' && (
        <>
          <div className="flex items-center gap-3 mb-lg flex-wrap">
            <span className="text-on-surface-variant text-sm">Período:</span>
            <input type="month" value={filtroMes} onChange={e=>e.target.value && setFiltroMes(e.target.value)} className={inputCls + ' w-40'} />
            <span className="text-on-surface font-semibold">{mesNome}</span>
            <button className={btnSecondaryCls + ' ml-auto flex items-center gap-2'} onClick={()=>gerarPDFRelatorioMensal(lancamentos, obras, contas, filtroMes)}>
              <span className="material-symbols-outlined text-[18px] text-primary">picture_as_pdf</span>
              Exportar Relatório Mensal — {mesNome}
            </button>
          </div>

          <div className="text-[11px] text-primary font-bold uppercase tracking-widest mb-2">Realizado — dinheiro que já entrou e saiu</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-lg" data-testid="cards-realizado">
            {[
              {l:'Saldo Acumulado', v:fmt(P.saldoTotal), c: P.saldoTotal>=0?'text-primary':'text-error', sub:'Contas + pagos sem conta'},
              {l:'Total Investido', v:fmt(totalInvestido), c:'text-secondary', sub:'Ver aba Investimentos'},
              {l:'Saldo Início '+mesNome, v:fmt(P.saldoAnterior), c: P.saldoAnterior>=0?'text-primary-fixed-dim':'text-error', sub:'Vindo de meses anteriores'},
              {l:'Entradas '+mesNome, v:fmt(P.entradasReal), c:'text-primary', sub:'recebidas no mês', border:'border-l-4 border-l-primary/30'},
              {l:'Saídas '+mesNome, v:fmt(P.saidasReal), c:'text-error', sub:'pagas no mês', border:'border-l-4 border-l-error/30'},
              {l:'Saldo Final '+mesNome, v:fmt(P.saldoFinalReal), c:P.saldoFinalReal>=0?'text-primary':'text-error', sub:P.investLiquido!==0 ? 'após '+fmt(P.investLiquido)+' em investimentos' : 'só o que foi pago', destaque:true},
            ].map(({l,v,c,sub,border,destaque}: any)=>(
              <div key={l} className={`${destaque ? 'bg-surface-container-high border border-primary/30 ring-2 ring-primary/10' : 'bg-surface-container border border-outline-variant'} ${border||''} rounded-xl p-4`}>
                <div className={`text-[11px] uppercase tracking-widest mb-2 ${destaque ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>{l}</div>
                <div className={`text-xl font-bold ${c}`}>{v}</div>
                <div className="text-[11px] text-on-surface-variant mt-1.5">{sub}</div>
              </div>
            ))}
          </div>

          <div className="text-[11px] text-tertiary font-bold uppercase tracking-widest mb-2">Previsto — pendências do mês e atrasadas (ainda não mexem no saldo)</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-lg" data-testid="cards-previsto">
            {[
              {l:'A receber', v:fmt(P.prevEntradas), c:'text-primary-container', sub:P.pendentesMes.filter(l=>l.tipo==='entrada'&&!ehMovInvestimento(l)).length+' lançamento(s)'},
              {l:'A pagar', v:fmt(P.prevSaidas), c:'text-error', sub:P.pendentesMes.filter(l=>l.tipo==='saida'&&!ehMovInvestimento(l)).length+' lançamento(s)'+(P.pendentesMes.filter(l=>dataEfetiva(l)<hojeStr).length>0?' · '+P.pendentesMes.filter(l=>dataEfetiva(l)<hojeStr).length+' atrasado(s)':'')},
              {l:'Saldo projetado '+mesNome, v:fmt(P.saldoProjetado), c:P.saldoProjetado>=0?'text-primary':'text-error', sub:'realizado + previsto'},
            ].map(({l,v,c,sub}: any)=>(
              <div key={l} className="bg-surface-container border border-tertiary/30 rounded-xl p-4">
                <div className="text-[11px] uppercase tracking-widest mb-2 text-on-surface-variant">{l}</div>
                <div className={`text-xl font-bold ${c}`}>{v}</div>
                <div className="text-[11px] text-on-surface-variant mt-1.5">{sub}</div>
              </div>
            ))}
          </div>

          <section className="bg-surface-container border border-outline-variant rounded-xl overflow-hidden mb-lg">
            <div className="p-4 border-b border-outline-variant flex items-center justify-between bg-surface-container-high/50">
              <div className="text-base font-bold text-on-surface">🏦 Contas Bancárias</div>
              <button className={btnPrimaryCls} onClick={()=>setModal('conta')}>+ Nova Conta</button>
            </div>
            {contas.length===0 ? (
              <div className="text-center py-10 text-on-surface-variant">
                <div>Nenhuma conta cadastrada</div>
                <button className={btnPrimaryCls + ' mt-3'} onClick={()=>setModal('conta')}>Cadastrar conta</button>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant">
                {P.saldosContas.map(({conta: c, saldo: saldoC})=>(
                  <div key={c.id} className="p-4 flex items-center justify-between hover:bg-surface-variant/20 transition-all">
                    <div><div className="font-semibold text-on-surface">{c.nome}</div><div className="text-[11px] text-on-surface-variant">{c.banco} · {c.tipo}</div></div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className={`text-lg font-bold ${saldoC>=0?'text-primary':'text-error'}`}>{fmt(saldoC)}</div>
                        <div className="text-[10px] text-on-surface-variant mt-0.5">saldo atual · inicial: {fmt(num(c.saldo_inicial))}</div>
                      </div>
                      <button className={btnDangerSmCls} onClick={()=>excluirConta(c)}>×</button>
                    </div>
                  </div>
                ))}
                {P.semConta.length > 0 && (
                  <div className="p-4 flex items-center justify-between bg-tertiary/5">
                    <div><div className="font-semibold text-tertiary">Pagos sem conta</div><div className="text-[11px] text-on-surface-variant">{P.semConta.length} lançamento(s) — atribua uma conta para o saldo de cada conta fechar</div></div>
                    <div className="flex items-center gap-3">
                      <div className={`text-lg font-bold ${P.semContaLiquido>=0?'text-primary':'text-error'}`}>{fmt(P.semContaLiquido)}</div>
                      <button className={btnEditSmCls} onClick={()=>{ setAtribuicoes({}); setModal('semconta') }}>Atribuir</button>
                    </div>
                  </div>
                )}
                <div className="p-4 flex items-center justify-between bg-surface-container-high/40">
                  <div className="font-bold text-on-surface">Total (= Saldo Acumulado)</div>
                  <div className={`text-lg font-bold ${P.saldoTotal>=0?'text-primary':'text-error'}`} data-testid="total-contas">{fmt(P.saldoTotal)}</div>
                </div>
              </div>
            )}
          </section>

          {P.custosFixosMes.length > 0 && (
            <div className="bg-surface-container border border-tertiary/30 rounded-xl p-5 mb-4">
              <div className="text-sm font-bold text-on-surface mb-3">🔁 Custos Fixos — {mesNome} — {fmt(P.custosFixosMes.reduce((a,l)=>a+num(l.valor),0))}</div>
              {P.custosFixosMes.map(l=>(
                <div key={l.id} className={rowCls}>
                  <div><div className="font-semibold text-on-surface">{l.descricao}</div><div className="text-[11px] text-on-surface-variant">{l.categoria||'—'} · {l.status==='pago'?'Pago em '+dataBR(l.data_pagamento||l.data):'Vence '+dataBR(l.data_vencimento||l.data)}</div></div>
                  <div className="text-tertiary font-bold">{fmt(num(l.valor))}</div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {P.aPagarTotal > 0 && (
              <div className="bg-surface-container border border-error/30 rounded-xl p-5">
                <div className="text-sm font-bold text-on-surface mb-3">⚠️ A Pagar (todas as pendências) — {fmt(P.aPagarTotal)}</div>
                {lancamentosEmpresa.filter(l=>l.tipo==='saida'&&l.status!=='pago').sort((a,b)=>dataEfetiva(a)<dataEfetiva(b)?-1:1).map(l=>(
                  <div key={l.id} className={rowCls}>
                    <div><div className="font-semibold text-on-surface">{l.descricao}</div><div className="text-[11px] text-on-surface-variant">Venc: {dataBR(dataEfetiva(l))}</div></div>
                    <div className="text-error font-bold">{fmt(num(l.valor))}</div>
                  </div>
                ))}
              </div>
            )}
            {P.aReceberTotal > 0 && (
              <div className="bg-surface-container border border-primary-container/30 rounded-xl p-5">
                <div className="text-sm font-bold text-on-surface mb-3">💰 A Receber (todas as pendências) — {fmt(P.aReceberTotal)}</div>
                {lancamentos.filter(l=>l.tipo==='entrada'&&l.status!=='pago').sort((a,b)=>dataEfetiva(a)<dataEfetiva(b)?-1:1).map(l=>(
                  <div key={l.id} className={rowCls}>
                    <div><div className="font-semibold text-on-surface">{l.descricao}</div><div className="text-[11px] text-on-surface-variant">Venc: {dataBR(dataEfetiva(l))}</div></div>
                    <div className="text-primary-container font-bold">{fmt(num(l.valor))}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── LANÇAMENTOS ── */}
      {aba==='lancamentos' && (
        <>
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="text-on-surface-variant text-sm">Mês:</span>
              <input type="month" value={filtroMes} onChange={e=>e.target.value && setFiltroMes(e.target.value)} className={inputCls + ' w-40'} />
            </div>
            <div className="flex gap-2">
              <button className={btnSecondaryCls} onClick={()=>gerarPDFRelatorioMensal(lancamentos, obras, contas, filtroMes)}>🖨️ Exportar PDF</button>
              <button className={btnPrimaryCls} onClick={abrirWizard}>+ Novo Lançamento</button>
            </div>
          </div>
          <div className={sectionCls}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-outline-variant">
                    {['Pago em / Vence','Descrição','Categoria','Obra','Conta','NF','Status','Valor',''].map(h=>(
                      <th key={h} className="text-left px-3 py-2 text-[11px] text-on-surface-variant uppercase bg-surface-container-high whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {P.lista.length===0 ? (
                    <tr><td colSpan={9} className="text-center py-8 text-on-surface-variant">Nenhum lançamento em {mesNome}</td></tr>
                  ) : P.lista.map(l=>{
                    const cod = nomeObra(l.obra_id)
                    const atrasadoDeOutroMes = idsAtrasadosAntes.has(l.id)
                    return (
                      <tr key={l.id} className={`border-b border-outline-variant hover:bg-surface-variant/20 ${atrasadoDeOutroMes ? 'bg-error/5' : ''}`}>
                        <td className="px-3 py-2.5 text-on-surface-variant text-xs whitespace-nowrap">{dataBR(dataEfetiva(l))}</td>
                        <td className="px-3 py-2.5 font-semibold text-on-surface">{l.descricao}{atrasadoDeOutroMes && <span title="Pendência de mês anterior ainda em aberto" className="ml-1.5 text-[10px] font-semibold text-error">⚠ atrasado</span>}{l.recorrente && <span title="Custo fixo — repete todo mês" className="ml-1.5 text-[10px] font-semibold text-tertiary">🔁</span>}{l.favorecido && <div className="text-[11px] font-normal text-on-surface-variant">👤 {l.favorecido}</div>}</td>
                        <td className="px-3 py-2.5 text-on-surface-variant text-xs">{l.categoria||'—'}</td>
                        <td className="px-3 py-2.5">
                          {cod ? <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-primary/10 text-primary border-primary/20">{cod}</span> : <span className="text-on-surface-variant/50 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs">{l.conta ? <span className="text-on-surface-variant">{l.conta}</span> : (l.status==='pago' ? <span className="text-tertiary font-semibold">sem conta</span> : <span className="text-on-surface-variant/50">—</span>)}</td>
                        <td className="px-3 py-2.5">
                          {l.nf_numero && <span className="text-[11px] text-on-surface-variant">#{l.nf_numero} </span>}
                          {l.nf_url && <a href={l.nf_url} target="_blank" rel="noreferrer" className="text-[11px] text-primary">📎</a>}
                          {!l.nf_numero && !l.nf_url && <span className="text-on-surface-variant/50 text-[11px]">—</span>}
                        </td>
                        <td className="px-3 py-2.5"><LinhaStatus l={l} /></td>
                        <td className={`px-3 py-2.5 font-bold whitespace-nowrap ${l.tipo==='entrada'?'text-primary-container':'text-error'}`}>
                          {l.tipo==='entrada'?'+':'-'}{fmt(num(l.valor))}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1.5">
                            {l.status!=='pago' && <button className={btnEditSmCls} onClick={()=>abrirPagamento(l)} data-testid="btn-pagar">✓ Pago</button>}
                            <button className={btnEditSmCls} onClick={()=>editarLancamento(l)}>✏️</button>
                            <button className={btnDangerSmCls} onClick={()=>excluirLancamento(l)} data-testid="btn-excluir">×</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="pt-4 mt-2 border-t-2 border-outline-variant flex flex-col gap-2">
              <div className="flex gap-3 flex-wrap items-center text-xs text-on-surface-variant font-semibold" data-testid="rodape-realizado">
                <span>Realizado:</span>
                <span>Saldo anterior <strong className="text-primary">{fmt(P.saldoAnterior)}</strong></span><span>+</span>
                <span>Entradas <strong className="text-primary-container">{fmt(P.entradasReal)}</strong></span><span>−</span>
                <span>Saídas <strong className="text-error">{fmt(P.saidasReal)}</strong></span>
                {P.investLiquido!==0 && <><span>−</span><span>Investimentos <strong className="text-secondary">{fmt(P.investLiquido)}</strong></span></>}
                <span>=</span>
                <span className={`text-sm font-black ${P.saldoFinalReal>=0?'text-primary':'text-error'}`}>Saldo final {mesNome}: {fmt(P.saldoFinalReal)}</span>
              </div>
              <div className="flex gap-3 flex-wrap items-center text-xs text-on-surface-variant font-semibold" data-testid="rodape-previsto">
                <span>Previsto:</span>
                <span>+ a receber <strong className="text-primary-container">{fmt(P.prevEntradas)}</strong></span>
                <span>− a pagar <strong className="text-error">{fmt(P.prevSaidas)}</strong></span>
                <span>=</span>
                <span className={`text-sm font-black ${P.saldoProjetado>=0?'text-primary':'text-error'}`}>Saldo projetado: {fmt(P.saldoProjetado)}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── POR OBRA ── */}
      {aba==='obras' && (
        obras.length===0 ? (
          <div className={sectionCls + ' text-center py-16'}>
            <div className="text-5xl mb-4">🏗️</div>
            <div className="text-on-surface text-base font-bold mb-4">Nenhuma obra cadastrada</div>
            <a href="/obras" className={btnPrimaryCls}>Ir para Obras & Projetos</a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {obras.map(obra=>{
              const custos = getCustosObra(obra.id)
              const receitas = getReceitasObra(obra.id)
              const contrato = num(obra.valor_contrato)
              const margem = obra.gerenciamento ? receitas : receitas - custos
              const pctO = contrato>0?Math.min(((obra.gerenciamento ? receitas : custos)/contrato)*100,100):0
              return (
                <div key={obra.id} onClick={()=>setObraDetalhe(obra)}
                  className="bg-surface-container border border-outline-variant hover:border-primary transition-all duration-300 rounded-xl p-5 cursor-pointer">
                  <div className="mb-3">
                    <div className="text-[11px] text-on-surface-variant mb-1">{obra.codigo}</div>
                    <div className="text-base font-bold text-on-surface flex items-center gap-1.5">
                      {obra.nome}
                      {obra.gerenciamento && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-secondary/10 text-secondary border-secondary/20">🤝</span>}
                    </div>
                    <div className="text-body-sm text-on-surface-variant">{obra.cliente}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[{l:'CONTRATO',v:fmt(contrato),c:'text-primary'},{l: obra.gerenciamento ? 'CUSTOS (CLIENTE)' : 'CUSTOS',v:fmt(custos),c:'text-error'},{l:'MARGEM',v:fmt(margem),c:margem>=0?'text-primary-container':'text-error'}].map(({l,v,c})=>(
                      <div key={l} className="bg-surface-container-high rounded-lg p-2.5">
                        <div className="text-[10px] text-on-surface-variant mb-1">{l}</div>
                        <div className={`text-xs font-bold ${c}`}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {contrato>0 && (
                    <div>
                      <div className="h-1.5 bg-surface-variant rounded overflow-hidden mb-1">
                        <div className={`h-full rounded ${pctO>90?'bg-error':pctO>70?'bg-tertiary':'bg-primary'}`} style={{ width: `${pctO}%` }} />
                      </div>
                      <div className="text-[10px] text-on-surface-variant">{pctO.toFixed(0)}% do orçamento utilizado</div>
                    </div>
                  )}
                  <div className="mt-3 text-sm text-primary font-bold">Ver detalhes →</div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── CONTAS ── */}
      {aba==='contas' && (
        <>
          <div className="flex justify-end mb-4">
            <button className={btnPrimaryCls} onClick={()=>setModal('conta')}>+ Nova Conta</button>
          </div>
          {contas.length===0 ? (
            <div className={sectionCls + ' text-center py-16'}>
              <div className="text-5xl mb-4">🏦</div>
              <button className={btnPrimaryCls} onClick={()=>setModal('conta')}>Cadastrar conta</button>
            </div>
          ) : P.saldosContas.map(({conta: c, saldo: saldoC})=>(
            <div key={c.id} className={sectionCls}>
              <div className="flex justify-between items-center">
                <div><div className="text-base font-bold text-on-surface">{c.nome}</div><div className="text-body-sm text-on-surface-variant mt-1">{c.banco} · Conta {c.tipo}</div></div>
                <div className="text-right">
                  <div className={`text-xl font-bold ${saldoC>=0?'text-primary':'text-error'}`}>{fmt(saldoC)}</div>
                  <div className="text-[11px] text-on-surface-variant mt-0.5">saldo atual</div>
                  <div className="text-[10px] text-on-surface-variant/60 mt-0.5">inicial: {fmt(num(c.saldo_inicial))}</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-outline-variant">
                <button className={btnDangerSmCls} onClick={()=>excluirConta(c)}>Excluir conta</button>
              </div>
            </div>
          ))}
          {P.semConta.length > 0 && (
            <div className={sectionCls + ' border-tertiary/40'}>
              <div className="flex justify-between items-center">
                <div><div className="text-base font-bold text-tertiary">Pagos sem conta</div><div className="text-body-sm text-on-surface-variant mt-1">{P.semConta.length} lançamento(s) pago(s) que não dizem de qual conta saiu/entrou o dinheiro</div></div>
                <div className="text-right"><div className="text-xl font-bold text-on-surface">{fmt(P.semContaLiquido)}</div><button className={btnEditSmCls + ' mt-2'} onClick={()=>{ setAtribuicoes({}); setModal('semconta') }}>Atribuir contas</button></div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── CARTÕES ── */}
      {aba==='cartoes' && (
        <>
          <div className="flex justify-between mb-4 gap-2 flex-wrap">
            <button className={btnPrimaryCls} onClick={()=>setModal('cartao')}>+ Novo Cartão</button>
            <div className="flex gap-2">
              {cartoes.length>0 && <button className={btnSecondaryCls} onClick={()=>{ setFGasto(GZ()); setModal('gasto') }}>+ Lançar Gasto no Cartão</button>}
              <button className="bg-primary-container text-on-primary-container rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer" onClick={()=>{ setFRecebCartao(RCZ()); setModal('recebimento_cartao') }}>+ Recebimento no Cartão</button>
            </div>
          </div>
          {cartoes.length===0 ? (
            <div className={sectionCls + ' text-center py-16'}>
              <div className="text-5xl mb-4">💳</div>
              <button className={btnPrimaryCls} onClick={()=>setModal('cartao')}>Cadastrar cartão</button>
            </div>
          ) : cartoes.map(c=>{
            const gastosDoCartao = gastosCartao.filter(g=>g.cartao_id===c.id)
            const faturas = agruparFaturas(gastosDoCartao, c)
            const emAberto = Math.round(faturas.reduce((a,f)=>a+f.aberto,0)*100)/100
            const limite = num(c.limite)
            const pctG = limite>0?Math.min((emAberto/limite)*100,100):0
            return (
              <div key={c.id} className={sectionCls} data-testid="cartao-bloco">
                <div className="bg-gradient-to-br from-[#1B3A5C] to-[#2E86AB] rounded-xl p-5 mb-4">
                  <div className="text-[11px] text-white/60 tracking-widest mb-3">INVERSO · {c.bandeira?.toUpperCase()}</div>
                  <div className="text-base font-bold text-white mb-4">{c.nome}</div>
                  <div className="flex justify-between">
                    <div><div className="text-[10px] text-white/50">FATURAS EM ABERTO</div><div className="text-xl font-bold text-white" data-testid="cartao-em-aberto">{fmt(emAberto)}</div></div>
                    <div className="text-right"><div className="text-[10px] text-white/50">LIMITE DISPONÍVEL</div><div className="text-xl font-bold text-primary">{fmt(limite-emAberto)}</div></div>
                  </div>
                </div>
                <div className="h-1.5 bg-surface-variant rounded overflow-hidden mb-3">
                  <div className={`h-full rounded ${pctG>80?'bg-error':'bg-primary'}`} style={{ width: `${pctG}%` }} />
                </div>
                <div className="text-body-sm text-on-surface-variant mb-3">Fecha dia {c.dia_fechamento} · Vence dia {c.dia_vencimento} · compra depois do fechamento entra na fatura seguinte</div>
                {faturas.length===0 && <div className="text-center py-4 text-on-surface-variant text-sm">Nenhuma compra neste cartão</div>}
                {faturas.slice().reverse().map(f=>{
                  const lancsFatura = [...new Set(f.itens.map(i=>i.fatura_lancamento_id).filter(Boolean))].map(id=>lancamentos.find(l=>l.id===id)).filter(Boolean)
                  const toda = f.aberto === 0
                  return (
                    <div key={f.vencimento} className="border border-outline-variant rounded-lg mb-3 overflow-hidden" data-testid="fatura-bloco">
                      <div className="px-3.5 py-2.5 bg-surface-container-high/60 flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <div className="text-sm font-bold text-on-surface">Fatura com vencimento em {dataBR(f.vencimento)} — {fmt(f.total)}</div>
                          <div className="text-[11px] text-on-surface-variant">
                            {toda
                              ? (lancsFatura.every(l=>l.status==='pago') ? '✅ Paga' + (lancsFatura[0]?.data_pagamento ? ' em ' + dataBR(lancsFatura[0].data_pagamento) : '') : '🗓️ Programada — aparece em "A pagar"')
                              : (f.aberto < f.total ? `Em aberto: ${fmt(f.aberto)} (o restante já foi incluído em pagamento)` : (f.vencimento < hojeStr ? '🔴 Vencida e não paga' : 'Em aberto'))}
                          </div>
                        </div>
                        {!toda && <button className={btnPrimaryCls + ' !py-1.5 !text-xs'} onClick={()=>setFFatura({ cartao: c, fatura: f, conta: '', jaPaga: true, data: hojeStr })} data-testid="btn-pagar-fatura">Pagar fatura</button>}
                      </div>
                      {f.itens.map(g=>{
                        const obra = obras.find(o=>o.id===g.obra_id)
                        return (
                          <div key={g.id} className={rowCls + ' px-3.5'}>
                            <div>
                              <div className="font-semibold text-sm text-on-surface">{g.descricao}</div>
                              <div className="text-[11px] text-on-surface-variant">
                                {dataBR(g.data)} · {g.categoria||'—'} {obra?`· ${obra.codigo}`:''}
                                {g.nf_numero && ` · NF #${g.nf_numero}`}
                                {g.nf_url && <a href={g.nf_url} target="_blank" rel="noreferrer" className="text-primary ml-1.5 text-[11px]">📎 NF</a>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2.5">
                              <div className="text-error font-bold">{fmt(num(g.valor))}</div>
                              <button className={btnDangerSmCls} onClick={()=>excluirGasto(g)}>×</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
                <div className="mt-3">
                  <button className={btnDangerSmCls} onClick={()=>excluirCartao(c)}>Excluir cartão</button>
                </div>
              </div>
            )
          })}

          {lancamentos.filter(l=>l.meio_recebimento==='cartao').length > 0 && (
            <div className={sectionCls}>
              <div className="text-sm font-bold text-on-surface mb-3">💳 Recebíveis no Cartão</div>
              {lancamentos.filter(l=>l.meio_recebimento==='cartao').sort((a,b)=>(a.data<b.data?1:-1)).map(l=>{
                const obra = obras.find(o=>o.id===l.obra_id)
                return (
                  <div key={l.id} className={rowCls}>
                    <div>
                      <div className="font-semibold text-sm text-on-surface">{l.descricao}</div>
                      <div className="text-[11px] text-on-surface-variant">{dataBR(dataEfetiva(l))} {obra?`· ${obra.codigo}`:''}</div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusBadge(l.status==='pago')}`}>{l.status==='pago'?'Recebido':'A receber'}</span>
                      <div className="text-primary-container font-bold">{fmt(num(l.valor))}</div>
                      <button className={btnDangerSmCls} onClick={()=>excluirLancamento(l)}>×</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── AGENDA PAGAMENTOS ── */}
      {aba==='agenda' && (
        <>
          <div className="flex items-center gap-3 mb-lg flex-wrap">
            <span className="text-on-surface-variant text-sm">Mês:</span>
            <input type="month" value={filtroMes} onChange={e=>e.target.value && setFiltroMes(e.target.value)} className={inputCls + ' w-40'} />
            <span className="font-semibold text-on-surface">{mesNome}</span>
          </div>

          {P.vencAtrasados.length>0 && (
            <div className="bg-surface-container border border-error/40 rounded-xl p-5 mb-4">
              <div className="text-sm font-bold text-error mb-3">🔴 Atrasados — {fmt(P.vencAtrasados.reduce((a,l)=>a+num(l.valor),0))}</div>
              {P.vencAtrasados.map(l=>(
                <div key={l.id} className={rowCls}>
                  <div>
                    <div className="font-semibold text-on-surface">{l.descricao}</div>
                    <div className="text-[11px] text-error">Venceu em {dataBR(dataEfetiva(l))} · {l.categoria||'—'}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button className={btnEditSmCls} onClick={()=>abrirPagamento(l)}>✓ Pago</button>
                    <div className="text-error font-bold">{fmt(num(l.valor))}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {P.vencProximos.length>0 && (
            <div className="bg-surface-container border border-tertiary/40 rounded-xl p-5 mb-4">
              <div className="text-sm font-bold text-tertiary mb-3">⚠️ Hoje e próximos 7 dias — {fmt(P.vencProximos.reduce((a,l)=>a+num(l.valor),0))}</div>
              {P.vencProximos.map(l=>(
                <div key={l.id} className={rowCls}>
                  <div>
                    <div className="font-semibold text-on-surface">{l.descricao}</div>
                    <div className="text-[11px] text-on-surface-variant">{dataEfetiva(l)===hojeStr ? 'Vence hoje' : 'Vence em ' + dataBR(dataEfetiva(l))} · {l.categoria||'—'}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button className={btnEditSmCls} onClick={()=>abrirPagamento(l)}>✓ Pago</button>
                    <div className="text-tertiary font-bold">{fmt(num(l.valor))}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(() => {
            const doMes = lancamentosEmpresa.filter(l=>l.tipo==='saida' && dataEfetiva(l).slice(0,7)===filtroMes).sort((a,b)=>(dataEfetiva(a)<dataEfetiva(b)?-1:1))
            return (
              <div className={sectionCls}>
                <div className="text-sm font-bold text-on-surface mb-3">📅 Todos os pagamentos — {mesNome}</div>
                {doMes.length===0 ? (
                  <div className="text-center py-8 text-on-surface-variant">Nenhum pagamento neste mês</div>
                ) : doMes.map(l=>(
                  <div key={l.id} className={rowCls}>
                    <div>
                      <div className="font-semibold text-on-surface">{l.descricao}</div>
                      <div className={`text-[11px] ${l.status!=='pago'&&dataEfetiva(l)<hojeStr?'text-error':'text-on-surface-variant'}`}>{l.status==='pago'?'Pago em ':'Vence '}{dataBR(dataEfetiva(l))} · {l.categoria||'—'}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <LinhaStatus l={l} />
                      {l.status!=='pago' && <button className={btnEditSmCls} onClick={()=>abrirPagamento(l)}>✓ Pago</button>}
                      <div className="text-error font-bold">{fmt(num(l.valor))}</div>
                    </div>
                  </div>
                ))}
                <div className="pt-3 border-t border-outline-variant mt-1 flex gap-5 flex-wrap">
                  <span className="text-sm text-error font-bold">Total do mês: {fmt(doMes.reduce((a,l)=>a+num(l.valor),0))}</span>
                  <span className="text-sm text-on-surface-variant">Já pago: {fmt(doMes.filter(l=>l.status==='pago').reduce((a,l)=>a+num(l.valor),0))}</span>
                  <span className="text-sm text-tertiary">A pagar: {fmt(doMes.filter(l=>l.status!=='pago').reduce((a,l)=>a+num(l.valor),0))}</span>
                </div>
              </div>
            )
          })()}
        </>
      )}

      {/* ── INVESTIMENTOS ── */}
      {aba==='investimentos' && (
        <>
          <div className="flex justify-between items-center mb-lg flex-wrap gap-3">
            <div className="text-base font-bold text-on-surface">📈 Controle de Investimentos</div>
            <button className={btnPrimaryCls} onClick={()=>{ setFInvest(IZ()); setModal('investimento') }}>+ Novo Movimento</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-lg">
            {[
              {l:'Total Investido', v:fmt(totalInvestido), c:'text-secondary', sub:'Saldo atual guardado'},
              {l:'Total Aportado', v:fmt(investimentos.filter(i=>i.tipo==='aporte').reduce((a,i)=>a+num(i.valor),0)), c:'text-primary-container', sub:`${investimentos.filter(i=>i.tipo==='aporte').length} aporte(s)`},
              {l:'Total Resgatado', v:fmt(investimentos.filter(i=>i.tipo==='resgate').reduce((a,i)=>a+num(i.valor),0)), c:'text-error', sub:`${investimentos.filter(i=>i.tipo==='resgate').length} resgate(s)`},
            ].map(({l,v,c,sub})=>(
              <div key={l} className={cardCls}>
                <div className="text-[11px] text-on-surface-variant uppercase tracking-widest mb-2">{l}</div>
                <div className={`text-xl font-bold ${c}`}>{v}</div>
                <div className="text-[11px] text-on-surface-variant mt-1.5">{sub}</div>
              </div>
            ))}
          </div>

          {totalInvestido > 0 && (
            <div className={sectionCls}>
              <div className="text-sm font-semibold text-secondary mb-3">💰 Saldo investido: {fmt(totalInvestido)}</div>
              <div className="h-3 bg-surface-variant rounded-full overflow-hidden mb-2">
                <div className="h-full bg-gradient-to-r from-secondary to-primary-container rounded-full" style={{ width: '100%' }} />
              </div>
              <div className="text-body-sm text-on-surface-variant">Rendimentos não são calculados automaticamente — registre como resgate/aporte ao receber. Aporte e resgate movimentam a conta escolhida, mas não entram como despesa nem receita no resultado.</div>
            </div>
          )}

          <div className={sectionCls}>
            <div className="text-sm font-bold text-on-surface mb-4">📋 Histórico de Movimentos</div>
            {investimentos.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">📈</div>
                <div className="text-on-surface text-base font-bold mb-2">Nenhum investimento registrado</div>
                <div className="text-on-surface-variant text-body-sm mb-5">Registre aportes quando transferir dinheiro para investimentos e resgates quando trazer de volta</div>
                <button className={btnPrimaryCls} onClick={()=>{ setFInvest(IZ()); setModal('investimento') }}>+ Registrar primeiro movimento</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant">
                      {['Data','Descrição','Instituição','Conta','Tipo','Observação','Valor',''].map(h=>(
                        <th key={h} className="text-left px-3 py-2 text-[11px] text-on-surface-variant uppercase bg-surface-container-high whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {investimentos.map(inv=>{
                      const lancVinc = inv.lancamento_id ? lancamentos.find(l=>l.id===inv.lancamento_id) : null
                      return (
                      <tr key={inv.id} className="border-b border-outline-variant hover:bg-surface-variant/20">
                        <td className="px-3 py-2.5 text-on-surface-variant text-xs">{dataBR(inv.data)}</td>
                        <td className="px-3 py-2.5 font-semibold text-on-surface">{inv.descricao}</td>
                        <td className="px-3 py-2.5 text-on-surface-variant text-xs">{inv.instituicao||'—'}</td>
                        <td className="px-3 py-2.5 text-on-surface-variant text-xs">{lancVinc ? (lancVinc.conta || <span className="text-tertiary">sem conta</span>) : '—'}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${inv.tipo==='aporte' ? 'bg-primary-container/10 text-primary-container border-primary-container/20' : 'bg-error/10 text-error border-error/20'}`}>
                            {inv.tipo==='aporte'?'⬆️ Aporte':'⬇️ Resgate'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-on-surface-variant text-xs">{inv.observacao||'—'}</td>
                        <td className={`px-3 py-2.5 font-bold whitespace-nowrap ${inv.tipo==='aporte'?'text-primary-container':'text-error'}`}>
                          {inv.tipo==='aporte'?'-':'+' }{fmt(num(inv.valor))}
                        </td>
                        <td className="px-3 py-2.5">
                          <button className={btnDangerSmCls} onClick={()=>excluirInvestimento(inv)}>×</button>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* MODAIS */}
      {modal==='lancamento' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e=>e.target===e.currentTarget&&setModal('')}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[560px] max-h-[92vh] overflow-y-auto">
            <div className="text-base font-bold text-on-surface mb-5">{lancEditando ? '✏️ Editar Lançamento' : '📋 Novo Lançamento'}</div>
            <ModalLancamento fLanc={fLanc} setFLanc={setFLanc} contas={contas} obras={obras} servicos={servicosObra} salvando={salvando} onSalvar={salvarLanc} onCancel={()=>{setModal('');setLancEditando(null)}} />
          </div>
        </div>
      )}

      {modal==='conta' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e=>e.target===e.currentTarget&&setModal('')}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[560px] max-h-[92vh] overflow-y-auto">
            <div className="text-base font-bold text-on-surface mb-5">🏦 Nova Conta Bancária</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
              <div><label className={labelCls}>Nome *</label><input className={inputCls} placeholder="Ex: Itaú PJ" value={fConta.nome} onChange={e=>setFConta({...fConta,nome:e.target.value})} /></div>
              <div><label className={labelCls}>Banco</label><input className={inputCls} placeholder="Ex: Itaú" value={fConta.banco} onChange={e=>setFConta({...fConta,banco:e.target.value})} /></div>
              <div><label className={labelCls}>Tipo</label>
                <select className={inputCls} value={fConta.tipo} onChange={e=>setFConta({...fConta,tipo:e.target.value})}>
                  <option value="corrente">Corrente</option><option value="poupanca">Poupança</option><option value="investimento">Investimento</option>
                </select>
              </div>
              <div><label className={labelCls}>Saldo inicial (R$)</label><input className={inputCls} type="number" placeholder="0,00" value={fConta.saldo_inicial} onChange={e=>setFConta({...fConta,saldo_inicial:e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end">
              <button className={btnSecondaryCls} onClick={()=>setModal('')}>Cancelar</button>
              <button className={btnPrimaryCls} onClick={salvarConta}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {modal==='cartao' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e=>e.target===e.currentTarget&&setModal('')}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[560px] max-h-[92vh] overflow-y-auto">
            <div className="text-base font-bold text-on-surface mb-5">💳 Novo Cartão</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
              <div><label className={labelCls}>Nome *</label><input className={inputCls} placeholder="Ex: Nubank PJ" value={fCartao.nome} onChange={e=>setFCartao({...fCartao,nome:e.target.value})} /></div>
              <div><label className={labelCls}>Bandeira</label>
                <select className={inputCls} value={fCartao.bandeira} onChange={e=>setFCartao({...fCartao,bandeira:e.target.value})}>
                  <option value="">Selecione</option><option>Visa</option><option>Mastercard</option><option>Elo</option><option>Amex</option>
                </select>
              </div>
              <div><label className={labelCls}>Limite (R$)</label><input className={inputCls} type="number" value={fCartao.limite} onChange={e=>setFCartao({...fCartao,limite:e.target.value})} /></div>
              <div><label className={labelCls}>Dia fechamento</label><input className={inputCls} type="number" min="1" max="31" value={fCartao.dia_fechamento} onChange={e=>setFCartao({...fCartao,dia_fechamento:e.target.value})} /></div>
              <div><label className={labelCls}>Dia vencimento</label><input className={inputCls} type="number" min="1" max="31" value={fCartao.dia_vencimento} onChange={e=>setFCartao({...fCartao,dia_vencimento:e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end">
              <button className={btnSecondaryCls} onClick={()=>setModal('')}>Cancelar</button>
              <button className={btnPrimaryCls} onClick={salvarCartao}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {modal==='gasto' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e=>e.target===e.currentTarget&&setModal('')}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[560px] max-h-[92vh] overflow-y-auto">
            <div className="text-base font-bold text-on-surface mb-5">💳 Lançar Gasto no Cartão</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
              <div><label className={labelCls}>Cartão *</label>
                <select className={inputCls} value={fGasto.cartao_id} onChange={e=>setFGasto({...fGasto,cartao_id:e.target.value})}>
                  <option value="">Selecione</option>
                  {cartoes.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Data *</label><input className={inputCls} type="date" value={fGasto.data} onChange={e=>setFGasto({...fGasto,data:e.target.value})} /></div>
              <div><label className={labelCls}>Valor total (R$) *</label><input className={inputCls} type="number" placeholder="0,00" value={fGasto.valor} onChange={e=>setFGasto({...fGasto,valor:e.target.value})} /></div>
              <div><label className={labelCls}>Parcelas</label>
                <select className={inputCls} value={fGasto.parcelas} onChange={e=>setFGasto({...fGasto,parcelas:e.target.value})}>
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(n=><option key={n} value={n}>{n}x</option>)}
                </select>
              </div>
            </div>
            <div className="mb-3.5"><label className={labelCls}>Descrição *</label><input className={inputCls} placeholder="Ex: Compra de material" value={fGasto.descricao} onChange={e=>setFGasto({...fGasto,descricao:e.target.value})} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
              <div><label className={labelCls}>Categoria</label>
                <select className={inputCls} value={fGasto.categoria} onChange={e=>setFGasto({...fGasto,categoria:e.target.value})}>
                  <option value="">Selecione</option>
                  {CAT_OUT.filter(c=>c!==CAT_FATURA&&c!==CAT_APORTE).map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Vincular à Obra</label>
                <select className={inputCls} value={fGasto.obra_id} onChange={e=>setFGasto({...fGasto,obra_id:e.target.value,servico_id:''})}>
                  <option value="">Nenhuma</option>
                  {obras.map(o=><option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}
                </select>
              </div>
              {fGasto.obra_id && servicosObra.filter(s=>s.obra_id===fGasto.obra_id).length > 0 && (
                <div className="sm:col-span-2"><label className={labelCls + ' text-primary'}>🔧 Serviço da Obra</label>
                  <select className={inputCls} value={fGasto.servico_id} onChange={e=>setFGasto({...fGasto,servico_id:e.target.value})}>
                    <option value="">Nenhum</option>
                    {servicosObra.filter(s=>s.obra_id===fGasto.obra_id).map(s=><option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div><label className={labelCls}>Número da NF</label><input className={inputCls} placeholder="Ex: 000847" value={fGasto.nf_numero} onChange={e=>setFGasto({...fGasto,nf_numero:e.target.value})} /></div>
              <div>
                <label className={labelCls}>Arquivo da NF (PDF/imagem)</label>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFGasto({...fGasto, nf_arquivo: e.target.files?.[0]||null})} className={fileCls} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button className={btnSecondaryCls} onClick={()=>setModal('')}>Cancelar</button>
              <button className={btnPrimaryCls} onClick={salvarGasto} disabled={salvando} data-testid="salvar-gasto">{salvando?'Salvando...':'Salvar Gasto'}</button>
            </div>
          </div>
        </div>
      )}

      {modal==='investimento' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e=>e.target===e.currentTarget&&setModal('')}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[560px] max-h-[92vh] overflow-y-auto">
            <div className="text-base font-bold text-on-surface mb-5">📈 Registrar Movimento de Investimento</div>

            <div className="flex gap-2 mb-5">
              <button className={(fInvest.tipo==='aporte' ? btnPrimaryCls : btnSecondaryCls) + ' flex-1'} onClick={()=>setFInvest({...fInvest, tipo:'aporte'})}>
                ⬆️ Aporte (saiu da conta)
              </button>
              <button className={(fInvest.tipo==='resgate' ? 'bg-primary-container text-on-primary-container rounded-lg px-4 py-2.5 text-sm font-bold' : btnSecondaryCls) + ' flex-1'} onClick={()=>setFInvest({...fInvest, tipo:'resgate'})}>
                ⬇️ Resgate (voltou pra conta)
              </button>
            </div>

            <div className={`rounded-lg px-3.5 py-2.5 mb-4 text-xs ${fInvest.tipo==='aporte' ? 'bg-error/10 text-error border border-error/20' : 'bg-primary-container/10 text-primary-container border border-primary-container/20'}`}>
              {fInvest.tipo==='aporte'
                ? '💸 Dinheiro saindo da conta corrente e indo para o investimento'
                : '💰 Dinheiro voltando do investimento para a conta corrente'}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3.5">
              <div>
                <label className={labelCls}>Data *</label>
                <input className={inputCls} type="date" value={fInvest.data} onChange={e=>setFInvest({...fInvest,data:e.target.value})} />
              </div>
              <div>
                <label className={labelCls}>Valor (R$) *</label>
                <input className={inputCls} type="number" placeholder="0,00" value={fInvest.valor} onChange={e=>setFInvest({...fInvest,valor:e.target.value})} />
              </div>
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>{fInvest.tipo==='aporte' ? 'Conta de onde saiu *' : 'Conta para onde voltou *'}</label>
              <select className={inputCls} value={fInvest.conta} onChange={e=>setFInvest({...fInvest,conta:e.target.value})} data-testid="invest-conta">
                <option value="">Selecione</option>
                {contas.map(c=><option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select>
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Descrição *</label>
              <input className={inputCls} placeholder="Ex: CDB Nubank, Poupança Itaú, Tesouro Direto..." value={fInvest.descricao} onChange={e=>setFInvest({...fInvest,descricao:e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className={labelCls}>Instituição</label>
                <input className={inputCls} placeholder="Ex: Nubank, XP, Inter..." value={fInvest.instituicao} onChange={e=>setFInvest({...fInvest,instituicao:e.target.value})} />
              </div>
              <div>
                <label className={labelCls}>Observação</label>
                <input className={inputCls} placeholder="Ex: Rendimento mensal, emergência..." value={fInvest.observacao} onChange={e=>setFInvest({...fInvest,observacao:e.target.value})} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button className={btnSecondaryCls} onClick={()=>setModal('')}>Cancelar</button>
              <button className={fInvest.tipo==='aporte' ? btnPrimaryCls : 'bg-primary-container text-on-primary-container rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer'} onClick={salvarInvestimento} data-testid="salvar-investimento">
                {fInvest.tipo==='aporte' ? '⬆️ Registrar Aporte' : '⬇️ Registrar Resgate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal==='recebimento_cartao' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e=>e.target===e.currentTarget&&setModal('')}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[520px] max-h-[92vh] overflow-y-auto">
            <div className="text-base font-bold text-on-surface mb-5">💳 Recebimento no Cartão</div>
            <div className="grid grid-cols-2 gap-3 mb-3.5">
              <div><label className={labelCls}>Valor (R$) *</label><input className={inputCls} type="number" placeholder="0,00" value={fRecebCartao.valor} onChange={e=>setFRecebCartao({...fRecebCartao,valor:e.target.value})} /></div>
              <div><label className={labelCls}>Data de Recebimento *</label><input className={inputCls} type="date" value={fRecebCartao.data} onChange={e=>setFRecebCartao({...fRecebCartao,data:e.target.value})} /></div>
            </div>
            <div className="mb-3.5"><label className={labelCls}>Descrição</label><input className={inputCls} placeholder="Ex: Pagamento serviço no cartão" value={fRecebCartao.descricao} onChange={e=>setFRecebCartao({...fRecebCartao,descricao:e.target.value})} /></div>
            <div className="mb-3.5"><label className={labelCls}>Conta que vai receber *</label>
              <select className={inputCls} value={fRecebCartao.conta} onChange={e=>setFRecebCartao({...fRecebCartao,conta:e.target.value})}>
                <option value="">Selecione</option>
                {contas.map(c=><option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <div><label className={labelCls}>Vincular à Obra (opcional)</label>
                <select className={inputCls} value={fRecebCartao.obra_id} onChange={e=>setFRecebCartao({...fRecebCartao,obra_id:e.target.value,servico_id:''})}>
                  <option value="">Nenhuma</option>
                  {obras.map(o=><option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}
                </select>
              </div>
              {fRecebCartao.obra_id && servicosObra.filter(s=>s.obra_id===fRecebCartao.obra_id).length > 0 && (
                <div><label className={labelCls}>Serviço da Obra</label>
                  <select className={inputCls} value={fRecebCartao.servico_id} onChange={e=>setFRecebCartao({...fRecebCartao,servico_id:e.target.value})}>
                    <option value="">Nenhum</option>
                    {servicosObra.filter(s=>s.obra_id===fRecebCartao.obra_id).map(s=><option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button className={btnSecondaryCls} onClick={()=>setModal('')}>Cancelar</button>
              <button className={btnPrimaryCls} onClick={salvarRecebimentoCartao} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar Recebimento'}</button>
            </div>
          </div>
        </div>
      )}

      {modal==='semconta' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e=>e.target===e.currentTarget&&setModal('')}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[680px] max-h-[92vh] overflow-y-auto">
            <div className="text-base font-bold text-on-surface mb-1">🏦 Atribuir conta aos lançamentos pagos</div>
            <div className="text-body-sm text-on-surface-variant mb-4">Escolha de qual conta cada valor saiu (ou em qual entrou). Depois disso, o saldo de cada conta passa a fechar com o Saldo Acumulado.</div>
            <div className="flex flex-col gap-2 mb-5">
              {P.semConta.map(l=>(
                <div key={l.id} className="flex items-center justify-between gap-3 border border-outline-variant rounded-lg px-3 py-2.5" data-testid="item-sem-conta">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-on-surface truncate">{l.descricao}</div>
                    <div className="text-[11px] text-on-surface-variant">{dataBR(dataEfetiva(l))} · {l.categoria||'—'} {nomeObra(l.obra_id)?`· ${nomeObra(l.obra_id)}`:''}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className={`font-bold ${l.tipo==='entrada'?'text-primary-container':'text-error'}`}>{l.tipo==='entrada'?'+':'-'}{fmt(num(l.valor))}</div>
                    <select className={inputCls + ' !w-40 !py-1.5'} value={atribuicoes[l.id]||''} onChange={e=>setAtribuicoes({...atribuicoes,[l.id]:e.target.value})}>
                      <option value="">— conta —</option>
                      {contas.map(c=><option key={c.id} value={c.nome}>{c.nome}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button className={btnSecondaryCls} onClick={()=>setModal('')}>Cancelar</button>
              <button className={btnPrimaryCls} onClick={salvarAtribuicoes} data-testid="salvar-atribuicoes">Salvar contas</button>
            </div>
          </div>
        </div>
      )}

      {fFatura && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1100] p-4" onClick={e=>e.target===e.currentTarget&&setFFatura(null)}>
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[480px]">
            <div className="text-base font-bold text-on-surface mb-1">💳 Pagar fatura — {fFatura.cartao.nome}</div>
            <div className="text-body-sm text-on-surface-variant mb-4">Vencimento {dataBR(fFatura.fatura.vencimento)} · {fFatura.fatura.itensAbertos.length} compra(s) · <strong>{fmt(fFatura.fatura.aberto)}</strong></div>
            <div className="flex gap-2 mb-4">
              <button className={(fFatura.jaPaga ? btnPrimaryCls : btnSecondaryCls) + ' flex-1'} onClick={()=>setFFatura({...fFatura, jaPaga:true})}>Já paguei</button>
              <button className={(!fFatura.jaPaga ? btnPrimaryCls : btnSecondaryCls) + ' flex-1'} onClick={()=>setFFatura({...fFatura, jaPaga:false})}>Programar para o vencimento</button>
            </div>
            {fFatura.jaPaga && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div><label className={labelCls}>Data do pagamento *</label><input type="date" className={inputCls} value={fFatura.data} onChange={e=>setFFatura({...fFatura,data:e.target.value})} /></div>
                <div><label className={labelCls}>Conta *</label>
                  <select className={inputCls} value={fFatura.conta} onChange={e=>setFFatura({...fFatura,conta:e.target.value})} data-testid="fatura-conta">
                    <option value="">Selecione</option>
                    {contas.map(c=><option key={c.id} value={c.nome}>{c.nome}</option>)}
                  </select>
                </div>
              </div>
            )}
            {!fFatura.jaPaga && (
              <div className="mb-4">
                <label className={labelCls}>Conta que vai pagar (opcional agora)</label>
                <select className={inputCls} value={fFatura.conta} onChange={e=>setFFatura({...fFatura,conta:e.target.value})}>
                  <option value="">Definir ao pagar</option>
                  {contas.map(c=><option key={c.id} value={c.nome}>{c.nome}</option>)}
                </select>
                <div className="text-[11px] text-tertiary mt-1">Fica como pendente em "A pagar" e na Agenda de Pagamentos até você marcar como pago.</div>
              </div>
            )}
            <div className="text-[11px] text-on-surface-variant mb-4">A fatura vira <strong>uma saída</strong> na conta (categoria "Fatura de cartão"). As compras continuam contando no custo das obras.</div>
            <div className="flex gap-2 justify-end">
              <button className={btnSecondaryCls} onClick={()=>setFFatura(null)}>Cancelar</button>
              <button className={btnPrimaryCls} onClick={confirmarFatura} data-testid="confirmar-fatura">{fFatura.jaPaga ? 'Registrar pagamento' : 'Programar'}</button>
            </div>
          </div>
        </div>
      )}

      {modaisComuns}

      {wizardAberto && (
        <WizardLancamento
          wiz={wiz} setWiz={setWiz}
          obras={obras.filter(o=>o.status==='em_execucao')}
          servicos={servicosObra}
          cartoes={cartoes}
          contas={contas}
          salvando={wizSalvando}
          onVoltar={voltarWizard}
          onCancelar={fecharWizard}
          onFinalizarSaida={finalizarSaidaWizard}
          onFinalizarEntradaComNF={finalizarEntradaComNFWizard}
          onIrParaFormularioTradicional={irParaFormularioTradicional}
        />
      )}
    </Layout>
  )
}

// Componente reutilizável do modal de lançamento
function ModalLancamento({ fLanc, setFLanc, contas, obras, servicos, salvando, onSalvar, onCancel }: any) {
  const categorias: string[] = fLanc.tipo==='entrada' ? CAT_IN : CAT_OUT
  const trocarTipo = (tipo: string) => {
    const lista = tipo==='entrada' ? CAT_IN : CAT_OUT
    setFLanc({ ...fLanc, tipo, categoria: lista.includes(fLanc.categoria) ? fLanc.categoria : '' })
  }
  return (
    <>
      <div className="flex gap-2 mb-4">
        <button className={fLanc.tipo==='saida' ? btnPrimaryCls : btnSecondaryCls} onClick={()=>trocarTipo('saida')}>💸 Saída</button>
        <button className={fLanc.tipo==='entrada' ? 'bg-primary-container text-on-primary-container rounded-lg px-4 py-2.5 text-sm font-bold' : btnSecondaryCls} onClick={()=>trocarTipo('entrada')}>💰 Entrada</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
        <div><label className={labelCls}>Data *</label><input className={inputCls} type="date" value={fLanc.data} onChange={(e:any)=>{
          const novaData = e.target.value
          const ehFutura = novaData > hojeISO()
          setFLanc(ehFutura ? {...fLanc, data:novaData, status:'pendente', data_vencimento:novaData} : {...fLanc, data:novaData})
        }} /></div>
        <div><label className={labelCls}>Valor (R$) *</label><input className={inputCls} type="number" placeholder="0,00" value={fLanc.valor} onChange={(e:any)=>setFLanc({...fLanc,valor:e.target.value})} /></div>
      </div>
      <div className="mb-3.5"><label className={labelCls}>Descrição *</label><input className={inputCls} placeholder="Ex: Pagamento fornecedor" value={fLanc.descricao} onChange={(e:any)=>setFLanc({...fLanc,descricao:e.target.value})} /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
        <div><label className={labelCls}>Categoria</label>
          <select className={inputCls} value={fLanc.categoria} onChange={(e:any)=>setFLanc({...fLanc,categoria:e.target.value})}>
            <option value="">Selecione</option>
            {categorias.map((c:string)=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>Vincular à Obra</label>
          <select className={inputCls} value={fLanc.obra_id} onChange={(e:any)=>setFLanc({...fLanc,obra_id:e.target.value,servico_id:''})}>
            <option value="">Nenhuma (empresa)</option>
            {obras.map((o:any)=><option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}
          </select>
        </div>
        {fLanc.obra_id && servicos && servicos.filter((s:any)=>s.obra_id===fLanc.obra_id).length > 0 && (
          <div className="sm:col-span-2">
            <label className={labelCls + ' text-primary'}>🔧 Categoria da Obra (Serviço)</label>
            <select className={inputCls + ' border-primary/40'} value={fLanc.servico_id} onChange={(e:any)=>setFLanc({...fLanc,servico_id:e.target.value})}>
              <option value="">— Selecione o serviço desta despesa —</option>
              {servicos.filter((s:any)=>s.obra_id===fLanc.obra_id).map((s:any)=>(
                <option key={s.id} value={s.id}>{s.nome} (Prev: {parseFloat(s.valor_previsto||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})})</option>
              ))}
            </select>
            <div className="text-[11px] text-on-surface-variant mt-1">Selecionar o serviço permite comparar o previsto com o realizado na aba de serviços da obra</div>
          </div>
        )}
        <div><label className={labelCls}>Conta {fLanc.status==='pago' ? '*' : ''}</label>
          <select className={inputCls} value={fLanc.conta} onChange={(e:any)=>setFLanc({...fLanc,conta:e.target.value})} data-testid="lanc-conta">
            <option value="">Selecione</option>
            {contas.map((c:any)=><option key={c.id} value={c.nome}>{c.nome}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>Status</label>
          <select className={inputCls} value={fLanc.status} onChange={(e:any)=>setFLanc({...fLanc,status:e.target.value})}>
            <option value="pago">Pago / Recebido</option>
            <option value="pendente">Pendente (futuro)</option>
          </select>
        </div>
        {fLanc.categoria === 'Reembolso' && (
          <div className="sm:col-span-2">
            <label className={labelCls + ' text-primary'}>👤 Reembolsar para</label>
            <input className={inputCls + ' border-primary/40'} placeholder="Nome do funcionário ou terceiro que adiantou a compra" value={fLanc.favorecido} onChange={(e:any)=>setFLanc({...fLanc,favorecido:e.target.value})} />
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 mb-3.5 cursor-pointer select-none">
        <input type="checkbox" checked={fLanc.recorrente} onChange={(e:any)=>setFLanc({...fLanc,recorrente:e.target.checked})} className="w-4 h-4 accent-primary cursor-pointer" />
        <span className="text-sm text-on-surface">🔁 Custo fixo (repete automaticamente todo mês — ex: energia, água, internet)</span>
      </label>
      {fLanc.status==='pago' && (
        <div className="mb-3.5">
          <label className={labelCls}>Data do {fLanc.tipo==='entrada' ? 'recebimento' : 'pagamento'}</label>
          <input className={inputCls} type="date" value={fLanc.data_pagamento || fLanc.data} onChange={(e:any)=>setFLanc({...fLanc,data_pagamento:e.target.value})} />
          <div className="text-[11px] text-on-surface-variant mt-1">É esta data que posiciona o lançamento no mês e no saldo.</div>
        </div>
      )}
      {fLanc.status==='pendente' && (
        <div className="mb-3.5">
          <label className={labelCls}>📅 Data de Vencimento</label>
          <input className={inputCls + ' border-tertiary/40'} type="date" value={fLanc.data_vencimento} onChange={(e:any)=>setFLanc({...fLanc,data_vencimento:e.target.value})} />
          <div className="text-[11px] text-tertiary mt-1">Este lançamento aparecerá na Agenda de Pagamentos</div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
        <div><label className={labelCls}>Número da NF</label><input className={inputCls} placeholder="Ex: 000847" value={fLanc.nf_numero} onChange={(e:any)=>setFLanc({...fLanc,nf_numero:e.target.value})} /></div>
        <div>
          <label className={labelCls}>Arquivo da NF (PDF/imagem)</label>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e:any)=>setFLanc({...fLanc, nf_arquivo: e.target.files?.[0]||null})} className={fileCls} />
        </div>
      </div>
      {fLanc.nf_arquivo && <div className="text-xs text-primary mb-3">📎 {(fLanc.nf_arquivo as File).name}</div>}
      <div className="flex gap-2 justify-end mt-2">
        <button className={btnSecondaryCls} onClick={onCancel}>Cancelar</button>
        <button className={btnPrimaryCls} onClick={onSalvar} disabled={salvando} data-testid="salvar-lancamento">{salvando?'Salvando...':'Salvar Lançamento'}</button>
      </div>
    </>
  )
}

// Fluxo guiado: anexar NF → obra/empresa → forma de pagamento (sem OCR — preenchimento manual)
function WizardLancamento({ wiz, setWiz, obras, servicos, cartoes, contas, salvando, onVoltar, onCancelar, onFinalizarSaida, onFinalizarEntradaComNF, onIrParaFormularioTradicional }: any) {
  const servicosDaObra = wiz.destino === 'obra' && wiz.obra_id ? servicos.filter((s: any) => s.obra_id === wiz.obra_id) : []
  const servicosDaObraEntrada = wiz.obra_id ? servicos.filter((s: any) => s.obra_id === wiz.obra_id) : []

  function Titulo({ children }: any) {
    return <div className="text-base font-bold text-on-surface mb-5">{children}</div>
  }
  function Botoes({ onFinalizar, finalizarLabel, podeAvancar, onProximo }: any) {
    return (
      <div className="flex gap-2 justify-end mt-5">
        {wiz.step !== 'tipo' && <button className={btnSecondaryCls} onClick={onVoltar}>← Voltar</button>}
        <button className={btnSecondaryCls} onClick={onCancelar}>Cancelar</button>
        {onProximo && <button className={btnPrimaryCls} onClick={onProximo} disabled={podeAvancar === false}>Próximo →</button>}
        {onFinalizar && <button className={btnPrimaryCls} onClick={() => onFinalizar()} disabled={salvando || podeAvancar === false}>{salvando ? 'Salvando...' : (finalizarLabel || 'Finalizar')}</button>}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && onCancelar()}>
      <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[560px] max-h-[92vh] overflow-y-auto">

        {wiz.step === 'tipo' && (
          <>
            <Titulo>📋 Novo Lançamento — qual o tipo?</Titulo>
            <div className="flex flex-col gap-3">
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant hover:border-error bg-surface-container-low transition-all" onClick={() => setWiz({ ...wiz, tipo: 'saida', step: 's_dados' })}>
                <div className="font-bold text-on-surface mb-1">💸 Saída</div>
                <div className="text-body-sm text-on-surface-variant">Compra ou pagamento a ser realizado — anexar NF/cupom fiscal</div>
              </button>
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant hover:border-primary-container bg-surface-container-low transition-all" onClick={() => setWiz({ ...wiz, tipo: 'entrada', step: 'e_pergunta_nf' })}>
                <div className="font-bold text-on-surface mb-1">💰 Entrada</div>
                <div className="text-body-sm text-on-surface-variant">Recebimento de cliente por serviço prestado</div>
              </button>
            </div>
            <div className="flex justify-end mt-5"><button className={btnSecondaryCls} onClick={onCancelar}>Cancelar</button></div>
          </>
        )}

        {wiz.step === 's_dados' && (
          <>
            <Titulo>💸 Dados da Compra / Pagamento</Titulo>
            <div className="text-body-sm text-on-surface-variant mb-4">Anexe a NF ou cupom fiscal e preencha os dados. A leitura automática do arquivo ainda não está disponível — preencha manualmente por enquanto.</div>
            <div className="mb-3.5">
              <label className={labelCls}>Arquivo da NF/Cupom (PDF/imagem)</label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setWiz({ ...wiz, nf_arquivo: e.target.files?.[0] || null })} className={fileCls} />
              {wiz.nf_arquivo && <div className="text-xs text-primary mt-1.5">📎 {(wiz.nf_arquivo as File).name}</div>}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3.5">
              <div><label className={labelCls}>Valor (R$) *</label><input className={inputCls} type="number" placeholder="0,00" value={wiz.valor} onChange={e => setWiz({ ...wiz, valor: e.target.value })} /></div>
              <div><label className={labelCls}>Data *</label><input className={inputCls} type="date" value={wiz.data} onChange={e => setWiz({ ...wiz, data: e.target.value })} /></div>
            </div>
            <div className="mb-3.5"><label className={labelCls}>O que foi comprado / serviço *</label><input className={inputCls} placeholder="Ex: Cimento e areia, mão de obra pedreiro..." value={wiz.descricao} onChange={e => setWiz({ ...wiz, descricao: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3 mb-3.5">
              <div><label className={labelCls}>Categoria</label>
                <select className={inputCls} value={wiz.categoria} onChange={e => setWiz({ ...wiz, categoria: e.target.value })}>
                  <option value="">Selecione</option>
                  {CAT_OUT.filter(c => c !== CAT_FATURA).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Número da NF</label><input className={inputCls} placeholder="Ex: 000847" value={wiz.nf_numero} onChange={e => setWiz({ ...wiz, nf_numero: e.target.value })} /></div>
            </div>
            {wiz.categoria === 'Reembolso' && (
              <div className="mb-3.5">
                <label className={labelCls + ' text-primary'}>👤 Reembolsar para</label>
                <input className={inputCls + ' border-primary/40'} placeholder="Nome do funcionário ou terceiro que adiantou a compra" value={wiz.favorecido} onChange={e => setWiz({ ...wiz, favorecido: e.target.value })} />
              </div>
            )}
            <label className="flex items-center gap-2 mb-3.5 cursor-pointer select-none">
              <input type="checkbox" checked={wiz.recorrente} onChange={e => setWiz({ ...wiz, recorrente: e.target.checked })} className="w-4 h-4 accent-primary cursor-pointer" />
              <span className="text-sm text-on-surface">🔁 Custo fixo (repete automaticamente todo mês — ex: energia, água, internet)</span>
            </label>
            <Botoes onProximo={() => { if (!wiz.descricao || !(parseFloat(wiz.valor) > 0)) return alert('Preencha o valor (maior que zero) e a descrição'); setWiz({ ...wiz, step: 's_destino' }) }} />
          </>
        )}

        {wiz.step === 's_destino' && (
          <>
            <Titulo>Esta despesa é para uma obra específica ou custo da empresa?</Titulo>
            <div className="flex flex-col gap-3">
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant hover:border-primary bg-surface-container-low transition-all" onClick={() => setWiz({ ...wiz, destino: 'empresa', step: 's_pagamento' })}>
                <div className="font-bold text-on-surface">🏢 Custo da Empresa</div>
              </button>
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant hover:border-primary bg-surface-container-low transition-all" onClick={() => setWiz({ ...wiz, destino: 'obra', step: 's_obra' })}>
                <div className="font-bold text-on-surface">🏗️ Obra Específica</div>
              </button>
            </div>
            <Botoes />
          </>
        )}

        {wiz.step === 's_obra' && (
          <>
            <Titulo>Qual obra e serviço?</Titulo>
            <div className="mb-3.5">
              <label className={labelCls}>Obra (ativas) *</label>
              <select className={inputCls} value={wiz.obra_id} onChange={e => setWiz({ ...wiz, obra_id: e.target.value, servico_id: '' })}>
                <option value="">Selecione a obra</option>
                {obras.map((o: any) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}
              </select>
            </div>
            {wiz.obra_id && servicosDaObra.length > 0 && (
              <div className="mb-3.5">
                <label className={labelCls + ' text-primary'}>🔧 Serviço da Obra</label>
                <select className={inputCls + ' border-primary/40'} value={wiz.servico_id} onChange={e => setWiz({ ...wiz, servico_id: e.target.value })}>
                  <option value="">— Selecione o serviço (opcional) —</option>
                  {servicosDaObra.map((s: any) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
                <div className="text-[11px] text-on-surface-variant mt-1">O gasto passa a compor o valor realizado desse serviço na tela da obra</div>
              </div>
            )}
            <Botoes onProximo={() => { if (!wiz.obra_id) return alert('Selecione a obra'); setWiz({ ...wiz, step: 's_pagamento' }) }} />
          </>
        )}

        {wiz.step === 's_pagamento' && (
          <>
            <Titulo>Forma de pagamento</Titulo>
            <div className="mb-3.5">
              <label className={labelCls}>Conta de saída *</label>
              <select className={inputCls} value={wiz.conta} onChange={e => setWiz({ ...wiz, conta: e.target.value })} data-testid="wiz-conta">
                <option value="">Selecione a conta</option>
                {contas.map((c: any) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select>
              <div className="text-[11px] text-on-surface-variant mt-1">Necessária para o saldo de cada conta se atualizar sozinho (não vale para cartão)</div>
            </div>
            <div className="flex flex-col gap-3">
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant hover:border-primary bg-surface-container-low transition-all disabled:opacity-50" disabled={salvando || !wiz.conta} onClick={() => onFinalizarSaida({ forma_pagamento: 'a_vista' })}>
                <div className="font-bold text-on-surface">{salvando ? 'Salvando...' : '💵 À Vista'}</div>
                <div className="text-body-sm text-on-surface-variant">Lança automático no controle do mês como pago</div>
              </button>
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant hover:border-tertiary bg-surface-container-low transition-all disabled:opacity-50" disabled={!wiz.conta} onClick={() => setWiz({ ...wiz, forma_pagamento: 'faturado', step: 's_faturado' })}>
                <div className="font-bold text-on-surface">📅 Faturado</div>
                <div className="text-body-sm text-on-surface-variant">Define prazo em dias e calcula a data de pagamento</div>
              </button>
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant hover:border-secondary bg-surface-container-low transition-all" onClick={() => setWiz({ ...wiz, forma_pagamento: 'cartao', step: 's_cartao' })}>
                <div className="font-bold text-on-surface">💳 Cartão</div>
                <div className="text-body-sm text-on-surface-variant">À vista ou parcelado — lança nas faturas do cartão (o dinheiro sai da conta quando a fatura é paga)</div>
              </button>
            </div>
            <Botoes />
          </>
        )}

        {wiz.step === 's_faturado' && (() => {
          const prazo = Math.max(0, parseInt(wiz.dias_prazo || '0') || 0)
          const venc = somarDiasISO(wiz.data, prazo)
          return (
            <>
              <Titulo>📅 Faturado — prazo para pagamento</Titulo>
              <div className="mb-3.5">
                <label className={labelCls}>Prazo (dias) *</label>
                <input className={inputCls} type="number" min="0" value={wiz.dias_prazo} onChange={e => setWiz({ ...wiz, dias_prazo: e.target.value })} />
              </div>
              <div className="bg-tertiary/10 border border-tertiary/30 rounded-lg px-3.5 py-2.5 text-tertiary text-sm mb-4">
                📅 Data de pagamento: <strong>{dataBR(venc)}</strong>
              </div>
              <Botoes onFinalizar={onFinalizarSaida} finalizarLabel="Finalizar Lançamento" />
            </>
          )
        })()}

        {wiz.step === 's_cartao' && (() => {
          const n = parseInt(wiz.parcelas || '1')
          const valorTotal = arred2(wiz.valor || '0')
          const partes = dividirParcelas(valorTotal, n)
          const cartaoSel = cartoes.find((c: any) => c.id === wiz.cartao_id)
          return (
            <>
              <Titulo>💳 Pagamento no Cartão</Titulo>
              <div className="grid grid-cols-2 gap-3 mb-3.5">
                <div><label className={labelCls}>Cartão *</label>
                  <select className={inputCls} value={wiz.cartao_id} onChange={e => setWiz({ ...wiz, cartao_id: e.target.value })}>
                    <option value="">Selecione</option>
                    {cartoes.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>Parcelas</label>
                  <select className={inputCls} value={wiz.parcelas} onChange={e => setWiz({ ...wiz, parcelas: e.target.value })}>
                    <option value="1">À vista</option>
                    {[2,3,4,5,6,7,8,9,10,11,12].map(x => <option key={x} value={x}>{x}x</option>)}
                  </select>
                </div>
              </div>
              <div className="bg-secondary/10 border border-secondary/30 rounded-lg px-3.5 py-2.5 text-secondary text-sm mb-4">
                💳 {n > 1 ? `${n}x de ${fmt(partes[0])}${partes[n-1] !== partes[0] ? ` (última ${fmt(partes[n-1])})` : ''} = ${fmt(valorTotal)}` : `À vista: ${fmt(valorTotal)}`}
                {cartaoSel && <div className="text-[11px] mt-1">1ª parcela na fatura que vence em {dataBR(vencimentoDaFatura(wiz.data, cartaoSel.dia_fechamento, cartaoSel.dia_vencimento))}</div>}
              </div>
              <Botoes onFinalizar={onFinalizarSaida} finalizarLabel="Finalizar Lançamento" podeAvancar={!!wiz.cartao_id} />
            </>
          )
        })()}

        {wiz.step === 'e_pergunta_nf' && (
          <>
            <Titulo>Foi gerada uma Nota Fiscal para o cliente?</Titulo>
            <div className="flex flex-col gap-3">
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant hover:border-primary-container bg-surface-container-low transition-all" onClick={() => setWiz({ ...wiz, step: 'e_dados_nf' })}>
                <div className="font-bold text-on-surface">✅ Sim, foi gerada NF</div>
              </button>
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant hover:border-primary bg-surface-container-low transition-all" onClick={onIrParaFormularioTradicional}>
                <div className="font-bold text-on-surface">❌ Não — lançar manualmente</div>
                <div className="text-body-sm text-on-surface-variant">Segue o formulário padrão de lançamento</div>
              </button>
            </div>
            <Botoes />
          </>
        )}

        {wiz.step === 'e_dados_nf' && (
          <>
            <Titulo>💰 Dados da NF de Serviço</Titulo>
            <div className="mb-3.5">
              <label className={labelCls}>Arquivo da NF (PDF/imagem)</label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setWiz({ ...wiz, nf_arquivo: e.target.files?.[0] || null })} className={fileCls} />
              {wiz.nf_arquivo && <div className="text-xs text-primary mt-1.5">📎 {(wiz.nf_arquivo as File).name}</div>}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3.5">
              <div><label className={labelCls}>Valor (R$) *</label><input className={inputCls} type="number" placeholder="0,00" value={wiz.valor} onChange={e => setWiz({ ...wiz, valor: e.target.value })} /></div>
              <div><label className={labelCls}>Data de Emissão *</label><input className={inputCls} type="date" value={wiz.data} onChange={e => setWiz({ ...wiz, data: e.target.value })} /></div>
            </div>
            <div className="mb-3.5"><label className={labelCls}>Descrição do serviço *</label><input className={inputCls} placeholder="Ex: Medição de obra, adiantamento..." value={wiz.descricao} onChange={e => setWiz({ ...wiz, descricao: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3 mb-3.5">
              <div><label className={labelCls}>Categoria</label>
                <select className={inputCls} value={wiz.categoria} onChange={e => setWiz({ ...wiz, categoria: e.target.value })}>
                  <option value="">Selecione</option>
                  {CAT_IN.filter(c => c !== CAT_RESGATE).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Número da NF</label><input className={inputCls} placeholder="Ex: 000847" value={wiz.nf_numero} onChange={e => setWiz({ ...wiz, nf_numero: e.target.value })} /></div>
            </div>
            <Botoes onProximo={() => { if (!wiz.descricao || !(parseFloat(wiz.valor) > 0)) return alert('Preencha o valor (maior que zero) e a descrição'); setWiz({ ...wiz, step: 'e_obra' }) }} />
          </>
        )}

        {wiz.step === 'e_obra' && (
          <>
            <Titulo>Qual obra/serviço esta NF se refere?</Titulo>
            <div className="mb-3.5">
              <label className={labelCls}>Obra</label>
              <select className={inputCls} value={wiz.obra_id} onChange={e => setWiz({ ...wiz, obra_id: e.target.value, servico_id: '' })}>
                <option value="">Nenhuma</option>
                {obras.map((o: any) => <option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}
              </select>
            </div>
            {wiz.obra_id && servicosDaObraEntrada.length > 0 && (
              <div className="mb-3.5">
                <label className={labelCls + ' text-primary'}>🔧 Serviço da Obra</label>
                <select className={inputCls + ' border-primary/40'} value={wiz.servico_id} onChange={e => setWiz({ ...wiz, servico_id: e.target.value })}>
                  <option value="">Nenhum</option>
                  {servicosDaObraEntrada.map((s: any) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </div>
            )}
            <Botoes onProximo={() => setWiz({ ...wiz, step: 'e_data_pagamento' })} />
          </>
        )}

        {wiz.step === 'e_data_pagamento' && (
          <>
            <Titulo>📅 Data de pagamento combinada com o cliente</Titulo>
            <div className="mb-3.5">
              <label className={labelCls}>Data de Pagamento *</label>
              <input className={inputCls} type="date" value={wiz.data_pagamento_combinada} onChange={e => setWiz({ ...wiz, data_pagamento_combinada: e.target.value })} />
              <div className="text-[11px] text-tertiary mt-1">Este lançamento entra na programação de pagamento como pendente</div>
            </div>
            <div className="mb-3.5">
              <label className={labelCls}>Vai cair em qual conta? *</label>
              <select className={inputCls} value={wiz.conta} onChange={e => setWiz({ ...wiz, conta: e.target.value })}>
                <option value="">Selecione a conta</option>
                {contas.map((c: any) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select>
              <div className="text-[11px] text-on-surface-variant mt-1">Necessária para o saldo de cada conta se atualizar sozinho</div>
            </div>
            <Botoes onFinalizar={onFinalizarEntradaComNF} finalizarLabel="Finalizar Lançamento" />
          </>
        )}

      </div>
    </div>
  )
}
