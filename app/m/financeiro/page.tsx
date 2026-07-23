'use client'
import { useEffect, useState } from 'react'
import MobileShell from '../components/MobileShell'
import { obterMinhasPermissoesApp, temAcessoModuloApp } from '../../lib/permissoes'

const SUPABASE_URL = 'https://vupjtoeqltzlnplijnzr.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }

async function get(tabela: string, q = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}${q}`, { headers: H })
  const d = await r.json(); return Array.isArray(d) ? d : []
}
async function inserir(tabela: string, dados: object) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, { method: 'POST', headers: { ...H, 'Prefer': 'return=representation' }, body: JSON.stringify(dados) })
  return r.json()
}
async function atualizar(tabela: string, id: string, dados: object) {
  await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${id}`, { method: 'PATCH', headers: H, body: JSON.stringify(dados) })
}

async function uploadNF(file: File, lancamentoDesc: string): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const nome = `nf_${Date.now()}_${lancamentoDesc.replace(/\s+/g, '_').slice(0, 20)}.${ext}`
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/notas-fiscais/${nome}`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': file.type },
    body: file,
  })
  if (r.ok) return `${SUPABASE_URL}/storage/v1/object/public/notas-fiscais/${nome}`
  return null
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const CAT_IN = ['Medição de obra', 'Adiantamento', 'Sinal de contrato', 'Parcela de contrato', 'Outros']
const CAT_OUT = ['Material', 'Mão de obra', 'Terceiros', 'Aluguel', 'Equipamento', 'Imposto', 'Pessoal', 'Marketing', 'Administrativo', 'Investimento (aporte)', 'Resgate de investimento', 'Outros']

const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const labelCls = 'text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5'
const btnPrimaryCls = 'bg-primary text-on-primary rounded-lg px-4 py-3 text-sm font-bold hover:opacity-90 transition-all cursor-pointer w-full'
const btnSecondaryCls = 'bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg px-4 py-3 text-sm cursor-pointer'

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

export default function FinanceiroMobile() {
  const [obras, setObras] = useState<any[]>([])
  const [servicosObra, setServicosObra] = useState<any[]>([])
  const [cartoes, setCartoes] = useState<any[]>([])
  const [wizardAberto, setWizardAberto] = useState(false)
  const [wiz, setWiz] = useState<any>({ ...WZ_VAZIO })
  const [wizSalvando, setWizSalvando] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('viga_token')) { window.location.href = '/'; return }
    obterMinhasPermissoesApp().then(perm => { if (!temAcessoModuloApp(perm, 'financeiro')) window.location.href = '/m' })
    carregar()
    const obraId = localStorage.getItem('viga_financeiro_obra_id')
    if (obraId) {
      localStorage.removeItem('viga_financeiro_obra_id')
      setWiz({ ...WZ_VAZIO, tipo: 'saida', destino: 'obra', obra_id: obraId, step: 's_dados' })
      setWizardAberto(true)
    }
  }, [])

  async function carregar() {
    const [o, sv, ca] = await Promise.all([
      get('obras', '?order=created_at.desc'),
      get('obra_servicos', '?order=created_at'),
      get('cartoes', '?order=created_at'),
    ])
    setObras(o.filter((x: any) => x.status === 'em_execucao'))
    setServicosObra(sv)
    setCartoes(ca)
  }

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
    alert('Lançamentos sem NF devem ser feitos pelo sistema no desktop.')
    fecharWizard()
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
          valor: valorParcela, categoria: wizFinal.categoria, cartao_id: wizFinal.cartao_id,
          parcelas: n, parcela_numero: i + 1,
        }
        if (wizFinal.nf_numero) dados.nf_numero = wizFinal.nf_numero
        if (obraId) dados.obra_id = obraId
        if (nf_url) dados.nf_url = nf_url
        await inserir('gastos_cartao', dados)
      }
    } else {
      const dados: any = {
        data: wizFinal.data, descricao: wizFinal.descricao, tipo: 'saida', valor: valorTotal,
        categoria: wizFinal.categoria, forma_pagamento: wizFinal.forma_pagamento,
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
      data: wiz.data, descricao: wiz.descricao, tipo: 'entrada', valor: parseFloat(wiz.valor || '0'),
      categoria: wiz.categoria, status: 'pendente', data_vencimento: wiz.data_pagamento_combinada,
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

  return (
    <MobileShell title="Financeiro">
      <div className="p-4 flex flex-col gap-4">
        <div className="bg-surface-container border border-outline-variant rounded-xl p-5 text-center">
          <span className="material-symbols-outlined text-primary text-[40px]">receipt_long</span>
          <div className="font-bold text-on-surface mt-2">Lançar Nota Fiscal / Comprovante</div>
          <div className="text-body-sm text-on-surface-variant mt-1">Anexe a foto da NF e siga o passo a passo</div>
          <button className={btnPrimaryCls + ' mt-4'} onClick={abrirWizard}>+ Novo Lançamento</button>
        </div>
      </div>

      {wizardAberto && (
        <WizardLancamento
          wiz={wiz} setWiz={setWiz} obras={obras} servicos={servicosObra} cartoes={cartoes}
          salvando={wizSalvando}
          onVoltar={voltarWizard} onCancelar={fecharWizard}
          onFinalizarSaida={finalizarSaidaWizard}
          onFinalizarEntradaComNF={finalizarEntradaComNFWizard}
          onIrParaFormularioTradicional={irParaFormularioTradicional}
        />
      )}
    </MobileShell>
  )
}

function WizardLancamento({ wiz, setWiz, obras, servicos, cartoes, salvando, onVoltar, onCancelar, onFinalizarSaida, onFinalizarEntradaComNF, onIrParaFormularioTradicional }: any) {
  const servicosDaObra = wiz.destino === 'obra' && wiz.obra_id ? servicos.filter((s: any) => s.obra_id === wiz.obra_id) : []
  const servicosDaObraEntrada = wiz.obra_id ? servicos.filter((s: any) => s.obra_id === wiz.obra_id) : []

  function Titulo({ children }: any) {
    return <div className="text-base font-bold text-on-surface mb-5">{children}</div>
  }
  function SeletorArquivoNF({ value, onChange }: any) {
    return (
      <>
        <div className="flex gap-2">
          <label className={btnSecondaryCls + ' flex-1 text-center'}>
            📷 Tirar Foto
            <input type="file" accept="image/*" capture="environment" onChange={e => onChange(e.target.files?.[0] || null)} className="hidden" />
          </label>
          <label className={btnSecondaryCls + ' flex-1 text-center'}>
            📎 Anexar Arquivo
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => onChange(e.target.files?.[0] || null)} className="hidden" />
          </label>
        </div>
        {value && <div className="text-xs text-primary mt-1.5">📎 {(value as File).name}</div>}
      </>
    )
  }
  function Botoes({ onFinalizar, finalizarLabel, podeAvancar, onProximo }: any) {
    return (
      <div className="flex flex-col gap-2 mt-5">
        {onProximo && <button className={btnPrimaryCls} onClick={onProximo} disabled={podeAvancar === false}>Próximo →</button>}
        {onFinalizar && <button className={btnPrimaryCls} onClick={() => onFinalizar()} disabled={salvando}>{salvando ? 'Salvando...' : (finalizarLabel || 'Finalizar')}</button>}
        <div className="flex gap-2">
          {wiz.step !== 'tipo' && <button className={btnSecondaryCls + ' flex-1'} onClick={onVoltar}>← Voltar</button>}
          <button className={btnSecondaryCls + ' flex-1'} onClick={onCancelar}>Cancelar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-background z-[1000] overflow-y-auto">
      <div className="p-5 pb-10">

        {wiz.step === 'tipo' && (
          <>
            <Titulo>📋 Novo Lançamento — qual o tipo?</Titulo>
            <div className="flex flex-col gap-3">
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant bg-surface-container-low transition-all" onClick={() => setWiz({ ...wiz, tipo: 'saida', step: 's_dados' })}>
                <div className="font-bold text-on-surface mb-1">💸 Saída</div>
                <div className="text-body-sm text-on-surface-variant">Compra ou pagamento a ser realizado — anexar NF/cupom fiscal</div>
              </button>
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant bg-surface-container-low transition-all" onClick={() => setWiz({ ...wiz, tipo: 'entrada', step: 'e_pergunta_nf' })}>
                <div className="font-bold text-on-surface mb-1">💰 Entrada</div>
                <div className="text-body-sm text-on-surface-variant">Recebimento de cliente por serviço prestado</div>
              </button>
            </div>
            <div className="mt-5"><button className={btnSecondaryCls + ' w-full'} onClick={onCancelar}>Cancelar</button></div>
          </>
        )}

        {wiz.step === 's_dados' && (
          <>
            <Titulo>💸 Dados da Compra / Pagamento</Titulo>
            <div className="text-body-sm text-on-surface-variant mb-4">Tire uma foto da NF ou cupom fiscal e preencha os dados. A leitura automática ainda não está disponível — preencha manualmente por enquanto.</div>
            <div className="mb-3.5">
              <label className={labelCls}>Foto da NF/Cupom</label>
              <SeletorArquivoNF value={wiz.nf_arquivo} onChange={(f: File | null) => setWiz({ ...wiz, nf_arquivo: f })} />
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
            <Botoes onProximo={() => {
              if (!wiz.descricao || !wiz.valor) return alert('Preencha o valor e a descrição')
              if (wiz.destino === 'obra' && wiz.obra_id) setWiz({ ...wiz, step: 's_pagamento' })
              else setWiz({ ...wiz, step: 's_destino' })
            }} />
          </>
        )}

        {wiz.step === 's_destino' && (
          <>
            <Titulo>Esta despesa é para uma obra específica ou custo da empresa?</Titulo>
            <div className="flex flex-col gap-3">
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant bg-surface-container-low transition-all" onClick={() => setWiz({ ...wiz, destino: 'empresa', step: 's_pagamento' })}>
                <div className="font-bold text-on-surface">🏢 Custo da Empresa</div>
              </button>
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant bg-surface-container-low transition-all" onClick={() => setWiz({ ...wiz, destino: 'obra', step: 's_obra' })}>
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
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant bg-surface-container-low transition-all" onClick={() => onFinalizarSaida({ forma_pagamento: 'a_vista' })}>
                <div className="font-bold text-on-surface">💵 À Vista</div>
                <div className="text-body-sm text-on-surface-variant">Lança automático no controle do mês como pago</div>
              </button>
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant bg-surface-container-low transition-all" onClick={() => setWiz({ ...wiz, forma_pagamento: 'faturado', step: 's_faturado' })}>
                <div className="font-bold text-on-surface">📅 Faturado</div>
                <div className="text-body-sm text-on-surface-variant">Define prazo em dias e calcula a data de pagamento</div>
              </button>
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant bg-surface-container-low transition-all" onClick={() => setWiz({ ...wiz, forma_pagamento: 'cartao', step: 's_cartao' })}>
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
                    {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(x => <option key={x} value={x}>{x}x</option>)}
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
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant bg-surface-container-low transition-all" onClick={() => setWiz({ ...wiz, step: 'e_dados_nf' })}>
                <div className="font-bold text-on-surface">✅ Sim, foi gerada NF</div>
              </button>
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant bg-surface-container-low transition-all" onClick={onIrParaFormularioTradicional}>
                <div className="font-bold text-on-surface">❌ Não — lançar manualmente</div>
                <div className="text-body-sm text-on-surface-variant">Precisa ser feito pelo desktop</div>
              </button>
            </div>
            <Botoes />
          </>
        )}

        {wiz.step === 'e_dados_nf' && (
          <>
            <Titulo>💰 Dados da NF de Serviço</Titulo>
            <div className="mb-3.5">
              <label className={labelCls}>Foto da NF</label>
              <SeletorArquivoNF value={wiz.nf_arquivo} onChange={(f: File | null) => setWiz({ ...wiz, nf_arquivo: f })} />
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
