'use client'
import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { obterMinhasPermissoes, temAcessoModulo } from '../lib/permissoes'

const SUPABASE_URL = 'https://vupjtoeqltzlnplijnzr.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (v: string) => v ? new Date(v + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

async function get(tabela: string, q = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}${q}`, { headers: H })
  const d = await r.json(); return Array.isArray(d) ? d : []
}
async function inserir(tabela: string, dados: object) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, {
    method: 'POST', headers: { ...H, 'Prefer': 'return=representation' },
    body: JSON.stringify(dados)
  }); return r.json()
}
async function deletar(tabela: string, id: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${id}`, { method: 'DELETE', headers: H })
}
async function atualizar(tabela: string, id: string, dados: object) {
  await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify(dados)
  })
}

// Upload de arquivo para Supabase Storage
async function uploadNF(file: File, lancamentoDesc: string): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const nome = `nf_${Date.now()}_${lancamentoDesc.replace(/\s+/g, '_').slice(0, 20)}.${ext}`
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/notas-fiscais/${nome}`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': file.type },
    body: file
  })
  if (r.ok) return `${SUPABASE_URL}/storage/v1/object/public/notas-fiscais/${nome}`
  return null
}

// Exportar Excel
function exportarExcel(lancamentos: any[], obras: any[], mes: string) {
  const mesNome = meses[parseInt(mes.slice(5,7))-1] + ' ' + mes.slice(0,4)
  const lancMes = lancamentos.filter(l => l.data?.slice(0,7) === mes)

  let csv = `VIGA - Lançamentos Financeiros - ${mesNome}\n`
  csv += `Gerado em: ${new Date().toLocaleDateString('pt-BR')}\n\n`
  csv += `Data;Descrição;Tipo;Categoria;Obra;Conta;Status;Número NF;Valor\n`

  lancMes.forEach(l => {
    const obra = obras.find(o => o.id === l.obra_id)
    const valor = (l.tipo === 'entrada' ? '+' : '-') + parseFloat(l.valor || 0).toFixed(2).replace('.', ',')
    csv += `${dataBR(l.data)};${l.descricao};${l.tipo === 'entrada' ? 'Entrada' : 'Saída'};${l.categoria || ''};${obra ? obra.nome : ''};${l.conta || ''};${l.status === 'pago' ? 'Pago' : 'Pendente'};${l.nf_numero || ''};${valor}\n`
  })

  const entradas = lancMes.filter(l=>l.tipo==='entrada').reduce((a,l)=>a+parseFloat(l.valor||0),0)
  const saidas = lancMes.filter(l=>l.tipo==='saida').reduce((a,l)=>a+parseFloat(l.valor||0),0)
  csv += `\n;;;;;;;\n`
  csv += `;TOTAL ENTRADAS;;;;;;;+${entradas.toFixed(2).replace('.',',')}\n`
  csv += `;TOTAL SAÍDAS;;;;;;;-${saidas.toFixed(2).replace('.',',')}\n`
  csv += `;RESULTADO;;;;;;;${(entradas-saidas).toFixed(2).replace('.',',')}\n`

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `VIGA_Lancamentos_${mes}.csv`
  a.click(); URL.revokeObjectURL(url)
}

const CAT_IN  = ['Medição de obra','Adiantamento','Sinal de contrato','Parcela de contrato','Outros']
const CAT_OUT = ['Material','Mão de obra','Terceiros','Aluguel','Equipamento','Imposto','Pessoal','Marketing','Administrativo','Investimento (aporte)','Resgate de investimento','Outros']

const LZ = { data: new Date().toISOString().slice(0,10), descricao: '', tipo: 'saida', valor: '', categoria: '', conta: '', status: 'pago', data_vencimento: '', obra_id: '', servico_id: '', nf_numero: '', nf_url: '', nf_arquivo: null as File | null }
const CZ = { nome: '', banco: '', tipo: 'corrente', saldo_inicial: '' }
const CAZ = { nome: '', bandeira: '', limite: '', dia_fechamento: '', dia_vencimento: '' }
const GZ = { data: new Date().toISOString().slice(0,10), descricao: '', valor: '', categoria: '', cartao_id: '', parcelas: '1', obra_id: '', servico_id: '', nf_numero: '', nf_arquivo: null as File | null }
const IZ = { descricao: '', tipo: 'aporte', valor: '', data: new Date().toISOString().slice(0,10), instituicao: '', observacao: '' }
const RCZ = { data: new Date().toISOString().slice(0,10), valor: '', descricao: '', obra_id: '', servico_id: '' }

const WZ_VAZIO = {
  step: 'tipo',
  tipo: 'saida' as 'saida' | 'entrada',
  data: new Date().toISOString().slice(0, 10),
  descricao: '', valor: '', categoria: '',
  nf_numero: '', nf_arquivo: null as File | null,
  destino: 'empresa' as 'empresa' | 'obra',
  obra_id: '', servico_id: '',
  forma_pagamento: 'a_vista' as 'a_vista' | 'faturado' | 'cartao',
  dias_prazo: '30',
  cartao_id: '', parcelas: '1',
  data_pagamento_combinada: '',
}

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
  const [salvando, setSalvando] = useState(false)
  const [modal, setModal] = useState('')
  const [filtroMes, setFiltroMes] = useState(new Date().toISOString().slice(0,7))
  const [fLanc, setFLanc] = useState<any>({...LZ})
  const [lancEditando, setLancEditando] = useState<any>(null)
  const [fConta, setFConta] = useState({...CZ})
  const [fCartao, setFCartao] = useState({...CAZ})
  const [fGasto, setFGasto] = useState<any>({...GZ})
  const [investimentos, setInvestimentos] = useState<any[]>([])
  const [fInvest, setFInvest] = useState({...IZ})
  const [userEmail, setUserEmail] = useState('')
  const [wizardAberto, setWizardAberto] = useState(false)
  const [wiz, setWiz] = useState<any>({...WZ_VAZIO})
  const [wizSalvando, setWizSalvando] = useState(false)
  const [fRecebCartao, setFRecebCartao] = useState({...RCZ})

  useEffect(() => {
    const token = localStorage.getItem('viga_token')
    if (!token) { window.location.href = '/'; return }
    setUserEmail(localStorage.getItem('viga_email') || '')
    obterMinhasPermissoes().then(perm => { if (!temAcessoModulo(perm, 'financeiro')) window.location.href = '/' })
    carregar()
  }, [])

  function sair() {
    localStorage.removeItem('viga_token')
    localStorage.removeItem('viga_refresh_token')
    localStorage.removeItem('viga_email')
    window.location.href = '/'
  }

  async function carregar() {
    setLoading(true)
    const [c,l,ca,g,o,sv,inv] = await Promise.all([
      get('contas','?order=created_at'),
      get('lancamentos','?order=data.desc&limit=300'),
      get('cartoes','?order=created_at'),
      get('gastos_cartao','?order=data.desc&limit=300'),
      get('obras','?order=created_at.desc'),
      get('obra_servicos','?order=created_at'),
      get('investimentos','?order=data.desc&limit=200'),
    ])
    setContas(c); setLancamentos(l); setCartoes(ca); setGastosCartao(g); setObras(o); setServicosObra(sv); setInvestimentos(inv)
    setLoading(false)
  }

  async function salvarLanc() {
    if (!fLanc.descricao || !fLanc.valor) return alert('Preencha descrição e valor')
    setSalvando(true)
    let nf_url = fLanc.nf_url || ''
    if (fLanc.nf_arquivo) {
      const url = await uploadNF(fLanc.nf_arquivo, fLanc.descricao)
      if (url) nf_url = url
    }
    const dados: any = { ...fLanc, valor: parseFloat(fLanc.valor), nf_arquivo: undefined, nf_url: nf_url || undefined }
    if (!dados.obra_id) delete dados.obra_id
    if (!dados.servico_id) delete dados.servico_id
    if (!dados.data_vencimento) delete dados.data_vencimento
    if (!dados.nf_url) delete dados.nf_url
    if (lancEditando) {
      await atualizar('lancamentos', lancEditando.id, dados)
    } else {
      await inserir('lancamentos', dados)
    }
    setModal(''); setFLanc({...LZ}); setLancEditando(null); await carregar(); setSalvando(false)
  }

  async function salvarConta() {
    if (!fConta.nome) return alert('Preencha o nome')
    await inserir('contas', { ...fConta, saldo_inicial: parseFloat(fConta.saldo_inicial||'0') })
    setModal(''); setFConta({...CZ}); carregar()
  }

  async function salvarCartao() {
    if (!fCartao.nome) return alert('Preencha o nome')
    await inserir('cartoes', { ...fCartao, limite: parseFloat(fCartao.limite||'0'), dia_fechamento: parseInt(fCartao.dia_fechamento||'1'), dia_vencimento: parseInt(fCartao.dia_vencimento||'10') })
    setModal(''); setFCartao({...CAZ}); carregar()
  }

  async function salvarGasto() {
    if (!fGasto.descricao || !fGasto.valor || !fGasto.cartao_id) return alert('Preencha todos os campos obrigatórios')
    setSalvando(true)
    let nf_url = ''
    if (fGasto.nf_arquivo) {
      const url = await uploadNF(fGasto.nf_arquivo, fGasto.descricao)
      if (url) nf_url = url
    }
    const dados: any = { ...fGasto, valor: parseFloat(fGasto.valor), parcelas: parseInt(fGasto.parcelas||'1'), nf_arquivo: undefined, nf_url: nf_url || undefined }
    if (!dados.obra_id) delete dados.obra_id
    if (!dados.nf_url) delete dados.nf_url
    await inserir('gastos_cartao', dados)
    setModal(''); setFGasto({...GZ}); await carregar(); setSalvando(false)
  }

  async function salvarInvestimento() {
    if (!fInvest.descricao || !fInvest.valor) return alert('Preencha descrição e valor')
    await inserir('investimentos', { ...fInvest, valor: parseFloat(fInvest.valor || '0') })
    setModal(''); setFInvest({...IZ}); carregar()
  }

  // ── Fluxo guiado de lançamento (NF → obra/empresa → forma de pagamento) ──
  function abrirWizard() {
    setWiz({ ...WZ_VAZIO, data: new Date().toISOString().slice(0, 10) })
    setWizardAberto(true)
  }
  function fecharWizard() {
    setWizardAberto(false)
    setWiz({ ...WZ_VAZIO })
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
    setFLanc({ ...LZ, tipo: 'entrada' })
    setModal('lancamento')
    setWiz({ ...WZ_VAZIO })
  }

  async function finalizarSaidaWizard(overrides: Partial<typeof WZ_VAZIO> = {}) {
    const wizFinal = { ...wiz, ...overrides }
    if (!wizFinal.descricao || !wizFinal.valor) return alert('Preencha descrição e valor')
    setWizSalvando(true)
    let nf_url = ''
    if (wizFinal.nf_arquivo) {
      const url = await uploadNF(wizFinal.nf_arquivo, wizFinal.descricao)
      if (url) nf_url = url
    }
    const obraId = wizFinal.destino === 'obra' ? wizFinal.obra_id : ''
    const servicoId = wizFinal.destino === 'obra' ? wizFinal.servico_id : ''
    const valorTotal = parseFloat(wizFinal.valor || '0')

    if (wizFinal.forma_pagamento === 'cartao') {
      const n = parseInt(wizFinal.parcelas || '1')
      const valorParcela = Math.round((valorTotal / n) * 100) / 100
      for (let i = 0; i < n; i++) {
        const dataParcela = new Date(wizFinal.data + 'T00:00:00')
        dataParcela.setMonth(dataParcela.getMonth() + i)
        const dados: any = {
          data: dataParcela.toISOString().slice(0, 10),
          descricao: wizFinal.descricao + (n > 1 ? ` (parcela ${i + 1}/${n})` : ''),
          valor: valorParcela,
          categoria: wizFinal.categoria,
          cartao_id: wizFinal.cartao_id,
          parcelas: n,
          parcela_numero: i + 1,
        }
        if (wizFinal.nf_numero) dados.nf_numero = wizFinal.nf_numero
        if (obraId) dados.obra_id = obraId
        if (nf_url) dados.nf_url = nf_url
        await inserir('gastos_cartao', dados)
      }
    } else {
      const dados: any = {
        data: wizFinal.data,
        descricao: wizFinal.descricao,
        tipo: 'saida',
        valor: valorTotal,
        categoria: wizFinal.categoria,
        forma_pagamento: wizFinal.forma_pagamento,
        status: wizFinal.forma_pagamento === 'faturado' ? 'pendente' : 'pago',
      }
      if (wizFinal.forma_pagamento === 'faturado') {
        const venc = new Date(wizFinal.data + 'T00:00:00')
        venc.setDate(venc.getDate() + parseInt(wizFinal.dias_prazo || '0'))
        dados.data_vencimento = venc.toISOString().slice(0, 10)
      }
      if (wizFinal.nf_numero) dados.nf_numero = wizFinal.nf_numero
      if (obraId) dados.obra_id = obraId
      if (servicoId) dados.servico_id = servicoId
      if (nf_url) dados.nf_url = nf_url
      await inserir('lancamentos', dados)
    }

    if (servicoId) {
      const serv = servicosObra.find((s: any) => s.id === servicoId)
      if (serv) {
        const novoRealizado = parseFloat(serv.valor_realizado || 0) + valorTotal
        await atualizar('obra_servicos', servicoId, { valor_realizado: novoRealizado })
      }
    }

    setWizSalvando(false)
    fecharWizard()
    await carregar()
  }

  async function finalizarEntradaComNFWizard() {
    if (!wiz.descricao || !wiz.valor || !wiz.data_pagamento_combinada) return alert('Preencha descrição, valor e data de pagamento')
    setWizSalvando(true)
    let nf_url = ''
    if (wiz.nf_arquivo) {
      const url = await uploadNF(wiz.nf_arquivo, wiz.descricao)
      if (url) nf_url = url
    }
    const dados: any = {
      data: wiz.data,
      descricao: wiz.descricao,
      tipo: 'entrada',
      valor: parseFloat(wiz.valor || '0'),
      categoria: wiz.categoria,
      status: 'pendente',
      data_vencimento: wiz.data_pagamento_combinada,
    }
    if (wiz.nf_numero) dados.nf_numero = wiz.nf_numero
    if (wiz.obra_id) dados.obra_id = wiz.obra_id
    if (wiz.servico_id) dados.servico_id = wiz.servico_id
    if (nf_url) dados.nf_url = nf_url
    await inserir('lancamentos', dados)
    setWizSalvando(false)
    fecharWizard()
    await carregar()
  }

  async function salvarRecebimentoCartao() {
    if (!fRecebCartao.valor || !fRecebCartao.data) return alert('Preencha valor e data de recebimento')
    const hojeStr = new Date().toISOString().slice(0, 10)
    const dados: any = {
      data: fRecebCartao.data,
      descricao: fRecebCartao.descricao || 'Recebimento no cartão',
      tipo: 'entrada',
      valor: parseFloat(fRecebCartao.valor),
      meio_recebimento: 'cartao',
      status: fRecebCartao.data <= hojeStr ? 'pago' : 'pendente',
    }
    if (fRecebCartao.data > hojeStr) dados.data_vencimento = fRecebCartao.data
    if (fRecebCartao.obra_id) dados.obra_id = fRecebCartao.obra_id
    if (fRecebCartao.servico_id) dados.servico_id = fRecebCartao.servico_id
    await inserir('lancamentos', dados)
    setModal(''); setFRecebCartao({...RCZ}); carregar()
  }

  // Cálculos
  const mesNome = meses[parseInt(filtroMes.slice(5,7))-1] + ' ' + filtroMes.slice(0,4)
  const lancMes = lancamentos.filter(l => l.data?.slice(0,7) === filtroMes)
  const entradas = lancMes.filter(l=>l.tipo==='entrada').reduce((a,l)=>a+parseFloat(l.valor||0),0)
  const saidas   = lancMes.filter(l=>l.tipo==='saida').reduce((a,l)=>a+parseFloat(l.valor||0),0)
  const saldoBase = contas.reduce((a,c)=>a+parseFloat(c.saldo_inicial||0),0)
  const saldoTotal = saldoBase
    + lancamentos.filter(l=>l.tipo==='entrada'&&l.status==='pago').reduce((a,l)=>a+parseFloat(l.valor||0),0)
    - lancamentos.filter(l=>l.tipo==='saida'&&l.status==='pago').reduce((a,l)=>a+parseFloat(l.valor||0),0)
  const saldoAnterior = saldoBase
    + lancamentos.filter(l=>l.tipo==='entrada'&&l.status==='pago'&&(l.data||'').slice(0,7)<filtroMes).reduce((a,l)=>a+parseFloat(l.valor||0),0)
    - lancamentos.filter(l=>l.tipo==='saida'&&l.status==='pago'&&(l.data||'').slice(0,7)<filtroMes).reduce((a,l)=>a+parseFloat(l.valor||0),0)
  const saldoFinalMes = saldoAnterior + entradas - saidas
  const aPagar  = lancamentos.filter(l=>l.tipo==='saida'&&l.status==='pendente').reduce((a,l)=>a+parseFloat(l.valor||0),0)
  const totalInvestido = investimentos.reduce((a,i) => {
    const v = parseFloat(i.valor||0)
    return i.tipo === 'aporte' ? a + v : a - v
  }, 0)
  const aReceber = lancamentos.filter(l=>l.tipo==='entrada'&&l.status==='pendente').reduce((a,l)=>a+parseFloat(l.valor||0),0)

  const hoje = new Date(); hoje.setHours(0,0,0,0)
  const em7dias = new Date(); em7dias.setDate(hoje.getDate()+7)
  const vencProximos = lancamentos.filter(l => {
    if (l.status !== 'pendente' || l.tipo !== 'saida') return false
    const venc = l.data_vencimento ? new Date(l.data_vencimento) : new Date(l.data)
    return venc >= hoje && venc <= em7dias
  })
  const vencAtrasados = lancamentos.filter(l => {
    if (l.status !== 'pendente' || l.tipo !== 'saida') return false
    const venc = l.data_vencimento ? new Date(l.data_vencimento) : new Date(l.data)
    return venc < hoje
  })

  function getCustosObra(id: string) {
    return lancamentos.filter(l=>l.obra_id===id&&l.tipo==='saida').reduce((a,l)=>a+parseFloat(l.valor||0),0)
     + gastosCartao.filter(g=>g.obra_id===id).reduce((a,g)=>a+parseFloat(g.valor||0),0)
  }
  function getReceitasObra(id: string) {
    return lancamentos.filter(l=>l.obra_id===id&&l.tipo==='entrada').reduce((a,l)=>a+parseFloat(l.valor||0),0)
  }

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-primary text-lg">Carregando...</div>
    </div>
  )

  // ── DETALHE OBRA ──────────────────────────────────────────────
  if (obraDetalhe) {
    const lancObra = lancamentos.filter(l=>l.obra_id===obraDetalhe.id)
    const gastObra = gastosCartao.filter(g=>g.obra_id===obraDetalhe.id)
    const receitas = getReceitasObra(obraDetalhe.id)
    const custos   = getCustosObra(obraDetalhe.id)
    const contrato = parseFloat(obraDetalhe.valor_contrato||0)
    const margem   = receitas - custos
    const pctC     = contrato > 0 ? Math.min((custos/contrato)*100, 100) : 0

    return (
      <Layout userEmail={userEmail} onLogout={sair}>
        <div className="flex items-center gap-4 flex-wrap mb-lg">
          <button onClick={() => setObraDetalhe(null)} className={btnSecondaryCls}>← Voltar</button>
          <div>
            <div className="text-xl font-bold text-on-surface">{obraDetalhe.nome}</div>
            <div className="text-body-sm text-on-surface-variant">{obraDetalhe.codigo} · Financeiro da Obra</div>
          </div>
          <div className="ml-auto">
            <button className={btnPrimaryCls} onClick={() => { setFLanc({...LZ, obra_id: obraDetalhe.id}); setModal('lancamento') }}>+ Lançamento</button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-lg">
          {[
            {l:'Contrato', v:fmt(contrato), c:'text-primary'},
            {l:'Receitas', v:fmt(receitas), c:'text-primary-container'},
            {l:'Custos', v:fmt(custos), c:'text-error'},
            {l:'Margem', v:fmt(margem), c: margem>=0?'text-primary-container':'text-error'},
          ].map(({l,v,c}) => (
            <div key={l} className={cardCls}>
              <div className="text-[11px] text-on-surface-variant uppercase tracking-widest mb-2">{l}</div>
              <div className={`text-xl font-bold ${c}`}>{v}</div>
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
            <button className={btnPrimaryCls} onClick={() => { setFLanc({...LZ, obra_id: obraDetalhe.id}); setModal('lancamento') }}>+ Novo</button>
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
                      <td className="px-3 py-2.5 text-on-surface-variant text-xs">{dataBR(l.data)}</td>
                      <td className="px-3 py-2.5 font-semibold text-on-surface">{l.descricao}</td>
                      <td className="px-3 py-2.5 text-on-surface-variant text-xs">{l.categoria||'—'}</td>
                      <td className="px-3 py-2.5">
                        {l.nf_numero && <span className="text-[11px] text-on-surface-variant">#{l.nf_numero} </span>}
                        {l.nf_url && <a href={l.nf_url} target="_blank" rel="noreferrer" className="text-[11px] text-primary">📎 Ver NF</a>}
                        {!l.nf_numero && !l.nf_url && <span className="text-on-surface-variant/50 text-[11px]">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusBadge(l.status==='pago')}`}>
                          {l.status==='pago'?'Pago':'Pendente'}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 font-bold ${l.tipo==='entrada'?'text-primary-container':'text-error'}`}>
                        {l.tipo==='entrada'?'+':'-'}{fmt(parseFloat(l.valor))}
                      </td>
                      <td className="px-3 py-2.5">
                        <button className={btnDangerSmCls} onClick={()=>deletar('lancamentos',l.id).then(carregar)}>×</button>
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
                      <td className="px-3 py-2.5 font-bold text-error">-{fmt(parseFloat(g.valor))}</td>
                      <td className="px-3 py-2.5">
                        <button className={btnDangerSmCls} onClick={()=>deletar('gastos_cartao',g.id).then(carregar)}>×</button>
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
              <div className="text-base font-bold text-on-surface mb-1.5">📋 Novo Lançamento</div>
              <div className="text-body-sm text-primary mb-4">Obra: {obraDetalhe.nome}</div>
              <ModalLancamento fLanc={fLanc} setFLanc={setFLanc} contas={contas} obras={obras} servicos={servicosObra} salvando={salvando} onSalvar={salvarLanc} onCancel={()=>setModal('')} />
            </div>
          </div>
        )}
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
          <button className={btnSecondaryCls + ' flex items-center gap-2'} onClick={()=>exportarExcel(lancamentos, obras, filtroMes)}>
            <span className="material-symbols-outlined text-[18px]">table_view</span> Excel
          </button>
          <button onClick={abrirWizard} className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl hover:opacity-90 transition-all font-label-md text-label-md shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-[20px]">add_circle</span>
            Novo Lançamento
          </button>
        </>
      }
    >
      {/* ALERTAS */}
      {vencAtrasados.length > 0 && (
        <div className="bg-error/10 border border-error/30 rounded-lg px-4 py-3 mb-4 text-sm text-error">
          🔴 <strong>{vencAtrasados.length} pagamento(s) atrasado(s)</strong> — Total: {fmt(vencAtrasados.reduce((a,l)=>a+parseFloat(l.valor||0),0))}
        </div>
      )}
      {vencProximos.length > 0 && (
        <div className="bg-tertiary/10 border border-tertiary/30 rounded-lg px-4 py-3 mb-4 text-sm text-tertiary">
          ⚠️ <strong>{vencProximos.length} pagamento(s) vencem nos próximos 7 dias</strong> — Total: {fmt(vencProximos.reduce((a,l)=>a+parseFloat(l.valor||0),0))}
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
            <input type="month" value={filtroMes} onChange={e=>setFiltroMes(e.target.value)} className={inputCls + ' w-40'} />
            <span className="text-on-surface font-semibold">{mesNome}</span>
            <button className={btnSecondaryCls + ' ml-auto flex items-center gap-2'} onClick={()=>exportarExcel(lancamentos, obras, filtroMes)}>
              <span className="material-symbols-outlined text-[18px] text-primary">cloud_download</span>
              Exportar Relatório Mensal — {mesNome}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-lg">
            {[
              {l:'Saldo Acumulado', v:fmt(saldoTotal), c: saldoTotal>=0?'text-primary':'text-error', sub:'Todas as contas'},
              {l:'Total Investido', v:fmt(totalInvestido), c:'text-secondary', sub:'Ver aba Investimentos'},
              {l:'Saldo Início '+mesNome, v:fmt(saldoAnterior), c: saldoAnterior>=0?'text-primary-fixed-dim':'text-error', sub:'Vindo de meses anteriores'},
              {l:'Entradas '+mesNome, v:fmt(entradas), c:'text-primary', sub:lancMes.filter(l=>l.tipo==='entrada').length+' lançamento(s)', border:'border-l-4 border-l-primary/30'},
              {l:'Saídas '+mesNome, v:fmt(saidas), c:'text-error', sub:lancMes.filter(l=>l.tipo==='saida').length+' lançamento(s)', border:'border-l-4 border-l-error/30'},
              {l:'Saldo Final '+mesNome, v:fmt(saldoFinalMes), c:saldoFinalMes>=0?'text-primary':'text-error', sub:'A receber: '+fmt(aReceber), destaque:true},
            ].map(({l,v,c,sub,border,destaque}: any)=>(
              <div key={l} className={`${destaque ? 'bg-surface-container-high border border-primary/30 ring-2 ring-primary/10' : 'bg-surface-container border border-outline-variant'} ${border||''} rounded-xl p-4`}>
                <div className={`text-[11px] uppercase tracking-widest mb-2 ${destaque ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>{l}</div>
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
                {contas.map(c=>(
                  <div key={c.id} className="p-4 flex items-center justify-between hover:bg-surface-variant/20 transition-all">
                    <div><div className="font-semibold text-on-surface">{c.nome}</div><div className="text-[11px] text-on-surface-variant">{c.banco} · {c.tipo}</div></div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className={`text-lg font-bold ${saldoTotal>=0?'text-primary':'text-error'}`}>{fmt(saldoTotal)}</div>
                        <div className="text-[10px] text-on-surface-variant mt-0.5">saldo atual · inicial: {fmt(parseFloat(c.saldo_inicial||0))}</div>
                      </div>
                      <button className={btnDangerSmCls} onClick={()=>deletar('contas',c.id).then(carregar)}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {aPagar > 0 && (
            <div className="bg-surface-container border border-error/30 rounded-xl p-5 mb-4">
              <div className="text-sm font-bold text-on-surface mb-3">⚠️ A Pagar — {fmt(aPagar)}</div>
              {lancamentos.filter(l=>l.tipo==='saida'&&l.status==='pendente').map(l=>(
                <div key={l.id} className={rowCls}>
                  <div><div className="font-semibold text-on-surface">{l.descricao}</div><div className="text-[11px] text-on-surface-variant">Venc: {l.data_vencimento||l.data}</div></div>
                  <div className="text-error font-bold">{fmt(parseFloat(l.valor))}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── LANÇAMENTOS ── */}
      {aba==='lancamentos' && (
        <>
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="text-on-surface-variant text-sm">Mês:</span>
              <input type="month" value={filtroMes} onChange={e=>setFiltroMes(e.target.value)} className={inputCls + ' w-40'} />
            </div>
            <div className="flex gap-2">
              <button className={btnSecondaryCls} onClick={()=>exportarExcel(lancamentos, obras, filtroMes)}>📊 Exportar Excel</button>
              <button className={btnPrimaryCls} onClick={abrirWizard}>+ Novo Lançamento</button>
            </div>
          </div>
          <div className={sectionCls}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-outline-variant">
                    {['Data','Descrição','Categoria','Obra','NF','Status','Valor',''].map(h=>(
                      <th key={h} className="text-left px-3 py-2 text-[11px] text-on-surface-variant uppercase bg-surface-container-high whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lancMes.length===0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-on-surface-variant">Nenhum lançamento em {mesNome}</td></tr>
                  ) : lancMes.map(l=>{
                    const obra = obras.find(o=>o.id===l.obra_id)
                    return (
                      <tr key={l.id} className="border-b border-outline-variant hover:bg-surface-variant/20">
                        <td className="px-3 py-2.5 text-on-surface-variant text-xs whitespace-nowrap">{dataBR(l.data)}</td>
                        <td className="px-3 py-2.5 font-semibold text-on-surface">{l.descricao}</td>
                        <td className="px-3 py-2.5 text-on-surface-variant text-xs">{l.categoria||'—'}</td>
                        <td className="px-3 py-2.5">
                          {obra ? <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-primary/10 text-primary border-primary/20">{obra.codigo}</span> : <span className="text-on-surface-variant/50 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {l.nf_numero && <span className="text-[11px] text-on-surface-variant">#{l.nf_numero} </span>}
                          {l.nf_url && <a href={l.nf_url} target="_blank" rel="noreferrer" className="text-[11px] text-primary">📎</a>}
                          {!l.nf_numero && !l.nf_url && <span className="text-on-surface-variant/50 text-[11px]">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusBadge(l.status==='pago')}`}>
                            {l.status==='pago'?'Pago':'Pendente'}
                          </span>
                        </td>
                        <td className={`px-3 py-2.5 font-bold whitespace-nowrap ${l.tipo==='entrada'?'text-primary-container':'text-error'}`}>
                          {l.tipo==='entrada'?'+':'-'}{fmt(parseFloat(l.valor))}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1.5">
                            <button className={btnEditSmCls} onClick={()=>{
                              setLancEditando(l)
                              setFLanc({data:l.data||'',descricao:l.descricao||'',tipo:l.tipo||'saida',valor:l.valor||'',categoria:l.categoria||'',conta:l.conta||'',status:l.status||'pago',data_vencimento:l.data_vencimento||'',obra_id:l.obra_id||'',servico_id:l.servico_id||'',nf_numero:l.nf_numero||'',nf_url:l.nf_url||'',nf_arquivo:null})
                              setModal('lancamento')
                            }}>✏️</button>
                            <button className={btnDangerSmCls} onClick={()=>deletar('lancamentos',l.id).then(carregar)}>×</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {lancMes.length>0 && (
              <div className="flex gap-5 pt-4 mt-2 border-t-2 border-outline-variant flex-wrap items-center">
                <span className="text-xs text-on-surface-variant font-semibold">Saldo anterior: <strong className="text-primary">{fmt(saldoAnterior)}</strong></span>
                <span className="text-xs text-on-surface-variant">+</span>
                <span className="text-xs text-on-surface-variant font-semibold">Entradas: <strong className="text-primary-container">{fmt(entradas)}</strong></span>
                <span className="text-xs text-on-surface-variant">−</span>
                <span className="text-xs text-on-surface-variant font-semibold">Saídas: <strong className="text-error">{fmt(saidas)}</strong></span>
                <span className="text-xs text-on-surface-variant">=</span>
                <span className={`text-sm font-black ${saldoFinalMes>=0?'text-primary':'text-error'}`}>Saldo Final {mesNome}: {fmt(saldoFinalMes)}</span>
              </div>
            )}
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
              const contrato = parseFloat(obra.valor_contrato||0)
              const margem = receitas - custos
              const pctO = contrato>0?Math.min((custos/contrato)*100,100):0
              return (
                <div key={obra.id} onClick={()=>setObraDetalhe(obra)}
                  className="bg-surface-container border border-outline-variant hover:border-primary transition-all duration-300 rounded-xl p-5 cursor-pointer">
                  <div className="mb-3">
                    <div className="text-[11px] text-on-surface-variant mb-1">{obra.codigo}</div>
                    <div className="text-base font-bold text-on-surface">{obra.nome}</div>
                    <div className="text-body-sm text-on-surface-variant">{obra.cliente}</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[{l:'CONTRATO',v:fmt(contrato),c:'text-primary'},{l:'CUSTOS',v:fmt(custos),c:'text-error'},{l:'MARGEM',v:fmt(margem),c:margem>=0?'text-primary-container':'text-error'}].map(({l,v,c})=>(
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
          ) : contas.map(c=>(
            <div key={c.id} className={sectionCls}>
              <div className="flex justify-between items-center">
                <div><div className="text-base font-bold text-on-surface">{c.nome}</div><div className="text-body-sm text-on-surface-variant mt-1">{c.banco} · Conta {c.tipo}</div></div>
                <div className="text-right">
                  <div className={`text-xl font-bold ${saldoTotal>=0?'text-primary':'text-error'}`}>{fmt(saldoTotal)}</div>
                  <div className="text-[11px] text-on-surface-variant mt-0.5">saldo atual</div>
                  <div className="text-[10px] text-on-surface-variant/60 mt-0.5">inicial: {fmt(parseFloat(c.saldo_inicial||0))}</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-outline-variant">
                <button className={btnDangerSmCls} onClick={()=>deletar('contas',c.id).then(carregar)}>Excluir conta</button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── CARTÕES ── */}
      {aba==='cartoes' && (
        <>
          <div className="flex justify-between mb-4 gap-2 flex-wrap">
            <button className={btnPrimaryCls} onClick={()=>setModal('cartao')}>+ Novo Cartão</button>
            <div className="flex gap-2">
              {cartoes.length>0 && <button className={btnSecondaryCls} onClick={()=>setModal('gasto')}>+ Lançar Gasto no Cartão</button>}
              <button className="bg-primary-container text-on-primary-container rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer" onClick={()=>{ setFRecebCartao({...RCZ}); setModal('recebimento_cartao') }}>+ Recebimento no Cartão</button>
            </div>
          </div>
          {cartoes.length===0 ? (
            <div className={sectionCls + ' text-center py-16'}>
              <div className="text-5xl mb-4">💳</div>
              <button className={btnPrimaryCls} onClick={()=>setModal('cartao')}>Cadastrar cartão</button>
            </div>
          ) : cartoes.map(c=>{
            const gastosMes = gastosCartao.filter(g=>g.cartao_id===c.id&&g.data?.slice(0,7)===filtroMes)
            const totalGasto = gastosMes.reduce((a,g)=>a+parseFloat(g.valor||0),0)
            const limite = parseFloat(c.limite||0)
            const pctG = limite>0?Math.min((totalGasto/limite)*100,100):0
            return (
              <div key={c.id} className={sectionCls}>
                <div className="bg-gradient-to-br from-[#1B3A5C] to-[#2E86AB] rounded-xl p-5 mb-4">
                  <div className="text-[11px] text-white/60 tracking-widest mb-3">INVERSO · {c.bandeira?.toUpperCase()}</div>
                  <div className="text-base font-bold text-white mb-4">{c.nome}</div>
                  <div className="flex justify-between">
                    <div><div className="text-[10px] text-white/50">FATURA {mesNome.toUpperCase()}</div><div className="text-xl font-bold text-white">{fmt(totalGasto)}</div></div>
                    <div className="text-right"><div className="text-[10px] text-white/50">DISPONÍVEL</div><div className="text-xl font-bold text-primary">{fmt(limite-totalGasto)}</div></div>
                  </div>
                </div>
                <div className="h-1.5 bg-surface-variant rounded overflow-hidden mb-3">
                  <div className={`h-full rounded ${pctG>80?'bg-error':'bg-primary'}`} style={{ width: `${pctG}%` }} />
                </div>
                <div className="text-body-sm text-on-surface-variant mb-3">Fecha dia {c.dia_fechamento} · Vence dia {c.dia_vencimento}</div>
                {gastosMes.map(g=>{
                  const obra = obras.find(o=>o.id===g.obra_id)
                  return (
                    <div key={g.id} className={rowCls}>
                      <div>
                        <div className="font-semibold text-sm text-on-surface">{g.descricao}</div>
                        <div className="text-[11px] text-on-surface-variant">
                          {dataBR(g.data)} · {g.categoria||'—'} {obra?`· ${obra.codigo}`:''}
                          {g.nf_numero && ` · NF #${g.nf_numero}`}
                          {g.nf_url && <a href={g.nf_url} target="_blank" rel="noreferrer" className="text-primary ml-1.5 text-[11px]">📎 NF</a>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className="text-error font-bold">{fmt(parseFloat(g.valor))}</div>
                        <button className={btnDangerSmCls} onClick={()=>deletar('gastos_cartao',g.id).then(carregar)}>×</button>
                      </div>
                    </div>
                  )
                })}
                <div className="mt-3">
                  <button className={btnDangerSmCls} onClick={()=>deletar('cartoes',c.id).then(carregar)}>Excluir cartão</button>
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
                      <div className="text-[11px] text-on-surface-variant">{dataBR(l.data)} {obra?`· ${obra.codigo}`:''}</div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusBadge(l.status==='pago')}`}>{l.status==='pago'?'Recebido':'A receber'}</span>
                      <div className="text-primary-container font-bold">{fmt(parseFloat(l.valor))}</div>
                      <button className={btnDangerSmCls} onClick={()=>deletar('lancamentos',l.id).then(carregar)}>×</button>
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
            <input type="month" value={filtroMes} onChange={e=>setFiltroMes(e.target.value)} className={inputCls + ' w-40'} />
            <span className="font-semibold text-on-surface">{mesNome}</span>
          </div>

          {vencAtrasados.length>0 && (
            <div className="bg-surface-container border border-error/40 rounded-xl p-5 mb-4">
              <div className="text-sm font-bold text-error mb-3">🔴 Atrasados — {fmt(vencAtrasados.reduce((a,l)=>a+parseFloat(l.valor||0),0))}</div>
              {vencAtrasados.map(l=>(
                <div key={l.id} className={rowCls}>
                  <div>
                    <div className="font-semibold text-on-surface">{l.descricao}</div>
                    <div className="text-[11px] text-error">Venceu em {l.data_vencimento||l.data} · {l.categoria||'—'}</div>
                  </div>
                  <div className="text-error font-bold">{fmt(parseFloat(l.valor))}</div>
                </div>
              ))}
            </div>
          )}

          {vencProximos.length>0 && (
            <div className="bg-surface-container border border-tertiary/40 rounded-xl p-5 mb-4">
              <div className="text-sm font-bold text-tertiary mb-3">⚠️ Próximos 7 dias — {fmt(vencProximos.reduce((a,l)=>a+parseFloat(l.valor||0),0))}</div>
              {vencProximos.map(l=>(
                <div key={l.id} className={rowCls}>
                  <div>
                    <div className="font-semibold text-on-surface">{l.descricao}</div>
                    <div className="text-[11px] text-on-surface-variant">Vence em {l.data_vencimento||l.data} · {l.categoria||'—'}</div>
                  </div>
                  <div className="text-tertiary font-bold">{fmt(parseFloat(l.valor))}</div>
                </div>
              ))}
            </div>
          )}

          <div className={sectionCls}>
            <div className="text-sm font-bold text-on-surface mb-3">📅 Todos os pagamentos — {mesNome}</div>
            {lancamentos.filter(l=>l.tipo==='saida'&&(l.data_vencimento||l.data)?.slice(0,7)===filtroMes).length===0 ? (
              <div className="text-center py-8 text-on-surface-variant">Nenhum pagamento neste mês</div>
            ) : lancamentos.filter(l=>l.tipo==='saida'&&(l.data_vencimento||l.data)?.slice(0,7)===filtroMes)
              .sort((a,b)=>((a.data_vencimento||a.data)<(b.data_vencimento||b.data)?-1:1))
              .map(l=>{
                const venc = l.data_vencimento||l.data
                const atrasado = l.status==='pendente' && new Date(venc)<hoje
                return (
                  <div key={l.id} className={rowCls}>
                    <div>
                      <div className="font-semibold text-on-surface">{l.descricao}</div>
                      <div className={`text-[11px] ${atrasado?'text-error':'text-on-surface-variant'}`}>{venc} · {l.categoria||'—'}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusBadge(l.status==='pago')}`}>
                        {l.status==='pago'?'Pago':'Pendente'}
                      </span>
                      <div className="text-error font-bold">{fmt(parseFloat(l.valor))}</div>
                    </div>
                  </div>
                )
              })}
            <div className="pt-3 border-t border-outline-variant mt-1">
              <span className="text-sm text-error font-bold">
                Total: {fmt(lancamentos.filter(l=>l.tipo==='saida'&&(l.data_vencimento||l.data)?.slice(0,7)===filtroMes).reduce((a,l)=>a+parseFloat(l.valor||0),0))}
              </span>
            </div>
          </div>
        </>
      )}

      {/* ── INVESTIMENTOS ── */}
      {aba==='investimentos' && (
        <>
          <div className="flex justify-between items-center mb-lg flex-wrap gap-3">
            <div className="text-base font-bold text-on-surface">📈 Controle de Investimentos</div>
            <button className={btnPrimaryCls} onClick={()=>setModal('investimento')}>+ Novo Movimento</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-lg">
            {[
              {l:'Total Investido', v:fmt(totalInvestido), c:'text-secondary', sub:'Saldo atual guardado'},
              {l:'Total Aportado', v:fmt(investimentos.filter(i=>i.tipo==='aporte').reduce((a,i)=>a+parseFloat(i.valor||0),0)), c:'text-primary-container', sub:`${investimentos.filter(i=>i.tipo==='aporte').length} aporte(s)`},
              {l:'Total Resgatado', v:fmt(investimentos.filter(i=>i.tipo==='resgate').reduce((a,i)=>a+parseFloat(i.valor||0),0)), c:'text-error', sub:`${investimentos.filter(i=>i.tipo==='resgate').length} resgate(s)`},
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
              <div className="text-body-sm text-on-surface-variant">Rendimentos não são calculados automaticamente — registre como novo aporte ao receber</div>
            </div>
          )}

          <div className={sectionCls}>
            <div className="text-sm font-bold text-on-surface mb-4">📋 Histórico de Movimentos</div>
            {investimentos.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">📈</div>
                <div className="text-on-surface text-base font-bold mb-2">Nenhum investimento registrado</div>
                <div className="text-on-surface-variant text-body-sm mb-5">Registre aportes quando transferir dinheiro para investimentos e resgates quando trazer de volta</div>
                <button className={btnPrimaryCls} onClick={()=>setModal('investimento')}>+ Registrar primeiro movimento</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant">
                      {['Data','Descrição','Instituição','Tipo','Observação','Valor',''].map(h=>(
                        <th key={h} className="text-left px-3 py-2 text-[11px] text-on-surface-variant uppercase bg-surface-container-high whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {investimentos.map(inv=>(
                      <tr key={inv.id} className="border-b border-outline-variant hover:bg-surface-variant/20">
                        <td className="px-3 py-2.5 text-on-surface-variant text-xs">{dataBR(inv.data)}</td>
                        <td className="px-3 py-2.5 font-semibold text-on-surface">{inv.descricao}</td>
                        <td className="px-3 py-2.5 text-on-surface-variant text-xs">{inv.instituicao||'—'}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${inv.tipo==='aporte' ? 'bg-primary-container/10 text-primary-container border-primary-container/20' : 'bg-error/10 text-error border-error/20'}`}>
                            {inv.tipo==='aporte'?'⬆️ Aporte':'⬇️ Resgate'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-on-surface-variant text-xs">{inv.observacao||'—'}</td>
                        <td className={`px-3 py-2.5 font-bold whitespace-nowrap ${inv.tipo==='aporte'?'text-primary-container':'text-error'}`}>
                          {inv.tipo==='aporte'?'-':'+' }{fmt(parseFloat(inv.valor||0))}
                        </td>
                        <td className="px-3 py-2.5">
                          <button className={btnDangerSmCls} onClick={()=>deletar('investimentos',inv.id).then(carregar)}>×</button>
                        </td>
                      </tr>
                    ))}
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
              <div><label className={labelCls}>Valor (R$) *</label><input className={inputCls} type="number" placeholder="0,00" value={fGasto.valor} onChange={e=>setFGasto({...fGasto,valor:e.target.value})} /></div>
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
                  {CAT_OUT.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Vincular à Obra</label>
                <select className={inputCls} value={fGasto.obra_id} onChange={e=>setFGasto({...fGasto,obra_id:e.target.value})}>
                  <option value="">Nenhuma</option>
                  {obras.map(o=><option key={o.id} value={o.id}>{o.codigo} — {o.nome}</option>)}
                </select>
              </div>
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
              <button className={btnPrimaryCls} onClick={salvarGasto} disabled={salvando}>{salvando?'Salvando...':'Salvar Gasto'}</button>
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
              <button className={fInvest.tipo==='aporte' ? btnPrimaryCls : 'bg-primary-container text-on-primary-container rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer'} onClick={salvarInvestimento}>
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
              <button className={btnPrimaryCls} onClick={salvarRecebimentoCartao}>Salvar Recebimento</button>
            </div>
          </div>
        </div>
      )}

      {wizardAberto && (
        <WizardLancamento
          wiz={wiz} setWiz={setWiz}
          obras={obras.filter(o=>o.status==='em_execucao')}
          servicos={servicosObra}
          cartoes={cartoes}
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
  return (
    <>
      <div className="flex gap-2 mb-4">
        <button className={fLanc.tipo==='saida' ? btnPrimaryCls : btnSecondaryCls} onClick={()=>setFLanc({...fLanc,tipo:'saida'})}>💸 Saída</button>
        <button className={fLanc.tipo==='entrada' ? 'bg-primary-container text-on-primary-container rounded-lg px-4 py-2.5 text-sm font-bold' : btnSecondaryCls} onClick={()=>setFLanc({...fLanc,tipo:'entrada'})}>💰 Entrada</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
        <div><label className={labelCls}>Data *</label><input className={inputCls} type="date" value={fLanc.data} onChange={(e:any)=>setFLanc({...fLanc,data:e.target.value})} /></div>
        <div><label className={labelCls}>Valor (R$) *</label><input className={inputCls} type="number" placeholder="0,00" value={fLanc.valor} onChange={(e:any)=>setFLanc({...fLanc,valor:e.target.value})} /></div>
      </div>
      <div className="mb-3.5"><label className={labelCls}>Descrição *</label><input className={inputCls} placeholder="Ex: Pagamento fornecedor" value={fLanc.descricao} onChange={(e:any)=>setFLanc({...fLanc,descricao:e.target.value})} /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
        <div><label className={labelCls}>Categoria</label>
          <select className={inputCls} value={fLanc.categoria} onChange={(e:any)=>setFLanc({...fLanc,categoria:e.target.value})}>
            <option value="">Selecione</option>
            {(fLanc.tipo==='entrada'?CAT_IN:CAT_OUT).map((c:string)=><option key={c} value={c}>{c}</option>)}
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
        <div><label className={labelCls}>Conta</label>
          <select className={inputCls} value={fLanc.conta} onChange={(e:any)=>setFLanc({...fLanc,conta:e.target.value})}>
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
      </div>
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
        <button className={btnPrimaryCls} onClick={onSalvar} disabled={salvando}>{salvando?'Salvando...':'Salvar Lançamento'}</button>
      </div>
    </>
  )
}

// Fluxo guiado: anexar NF → obra/empresa → forma de pagamento (sem OCR — preenchimento manual)
function WizardLancamento({ wiz, setWiz, obras, servicos, cartoes, salvando, onVoltar, onCancelar, onFinalizarSaida, onFinalizarEntradaComNF, onIrParaFormularioTradicional }: any) {
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
        {onFinalizar && <button className={btnPrimaryCls} onClick={() => onFinalizar()} disabled={salvando}>{salvando ? 'Salvando...' : (finalizarLabel || 'Finalizar')}</button>}
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
                  {CAT_OUT.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Número da NF</label><input className={inputCls} placeholder="Ex: 000847" value={wiz.nf_numero} onChange={e => setWiz({ ...wiz, nf_numero: e.target.value })} /></div>
            </div>
            <Botoes onProximo={() => { if (!wiz.descricao || !wiz.valor) return alert('Preencha o valor e a descrição'); setWiz({ ...wiz, step: 's_destino' }) }} />
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
                <div className="text-[11px] text-on-surface-variant mt-1">Selecionar o serviço atualiza automaticamente o valor realizado dele</div>
              </div>
            )}
            <Botoes onProximo={() => { if (!wiz.obra_id) return alert('Selecione a obra'); setWiz({ ...wiz, step: 's_pagamento' }) }} />
          </>
        )}

        {wiz.step === 's_pagamento' && (
          <>
            <Titulo>Forma de pagamento</Titulo>
            <div className="flex flex-col gap-3">
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant hover:border-primary bg-surface-container-low transition-all" onClick={() => onFinalizarSaida({ forma_pagamento: 'a_vista' })}>
                <div className="font-bold text-on-surface">💵 À Vista</div>
                <div className="text-body-sm text-on-surface-variant">Lança automático no controle do mês como pago</div>
              </button>
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant hover:border-tertiary bg-surface-container-low transition-all" onClick={() => setWiz({ ...wiz, forma_pagamento: 'faturado', step: 's_faturado' })}>
                <div className="font-bold text-on-surface">📅 Faturado</div>
                <div className="text-body-sm text-on-surface-variant">Define prazo em dias e calcula a data de pagamento</div>
              </button>
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant hover:border-secondary bg-surface-container-low transition-all" onClick={() => setWiz({ ...wiz, forma_pagamento: 'cartao', step: 's_cartao' })}>
                <div className="font-bold text-on-surface">💳 Cartão</div>
                <div className="text-body-sm text-on-surface-variant">À vista ou parcelado — lança nas faturas do cartão</div>
              </button>
            </div>
            <Botoes />
          </>
        )}

        {wiz.step === 's_faturado' && (() => {
          const venc = new Date(wiz.data + 'T00:00:00')
          venc.setDate(venc.getDate() + parseInt(wiz.dias_prazo || '0'))
          return (
            <>
              <Titulo>📅 Faturado — prazo para pagamento</Titulo>
              <div className="mb-3.5">
                <label className={labelCls}>Prazo (dias) *</label>
                <input className={inputCls} type="number" min="1" value={wiz.dias_prazo} onChange={e => setWiz({ ...wiz, dias_prazo: e.target.value })} />
              </div>
              <div className="bg-tertiary/10 border border-tertiary/30 rounded-lg px-3.5 py-2.5 text-tertiary text-sm mb-4">
                📅 Data de pagamento: <strong>{venc.toLocaleDateString('pt-BR')}</strong>
              </div>
              <Botoes onFinalizar={onFinalizarSaida} finalizarLabel="Finalizar Lançamento" />
            </>
          )
        })()}

        {wiz.step === 's_cartao' && (() => {
          const n = parseInt(wiz.parcelas || '1')
          const valorTotal = parseFloat(wiz.valor || '0')
          const valorParcela = n > 0 ? valorTotal / n : valorTotal
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
                💳 {n > 1 ? `${n}x de ${fmt(valorParcela)}` : `À vista: ${fmt(valorTotal)}`}
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
                  {CAT_IN.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Número da NF</label><input className={inputCls} placeholder="Ex: 000847" value={wiz.nf_numero} onChange={e => setWiz({ ...wiz, nf_numero: e.target.value })} /></div>
            </div>
            <Botoes onProximo={() => { if (!wiz.descricao || !wiz.valor) return alert('Preencha o valor e a descrição'); setWiz({ ...wiz, step: 'e_obra' }) }} />
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
            <Botoes onFinalizar={onFinalizarEntradaComNF} finalizarLabel="Finalizar Lançamento" />
          </>
        )}

      </div>
    </div>
  )
}
