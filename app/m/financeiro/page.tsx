'use client'
import { useEffect, useState, useRef } from 'react'
import MobileShell from '../components/MobileShell'
import { obterMinhasPermissoesApp, temAcessoModuloApp } from '../../lib/permissoes'
import { hojeISO, somarDiasISO, somarMesesISO, arred2, dividirParcelas, dataBR } from '../../lib/datas'
import { CAT_APORTE, CAT_RESGATE, CAT_FATURA, ehMovInvestimento } from '../../lib/financeiroCalc'
import { vencimentoDaFatura } from '../../lib/faturasCartao'

const SUPABASE_URL = 'https://vupjtoeqltzlnplijnzr.supabase.co'
// Chave pública (anon): o acesso real é decidido pelo token do usuário, injetado em lib/authFetch.ts.
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }

// Toda gravação confere a resposta do banco: se ele recusar, o erro sobe e o usuário é avisado.
async function erroDe(r: Response): Promise<string> {
  try { const d = await r.json(); return d?.message || d?.error || ('erro ' + r.status) } catch { return 'erro ' + r.status }
}
async function get(tabela: string, q = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}${q}`, { headers: H })
  const d = await r.json(); return Array.isArray(d) ? d : []
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

async function uploadNF(file: File, lancamentoDesc: string): Promise<string | null> {
  try {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
    const limpo = lancamentoDesc.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 20)
    const nome = `nf_${Date.now()}_${limpo}.${ext}`
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/notas-fiscais/${nome}`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': file.type },
      body: file,
    })
    if (r.ok) return `${SUPABASE_URL}/storage/v1/object/public/notas-fiscais/${nome}`
    return null
  } catch { return null }
}

const fmt = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const CAT_IN = ['Medição de obra', 'Adiantamento', 'Sinal de contrato', 'Parcela de contrato', 'Outros']
const CAT_OUT = ['Medição de obra', 'Material', 'Mão de obra', 'Terceiros', 'Aluguel', 'Equipamento', 'Imposto', 'Pessoal', 'Marketing', 'Administrativo', 'Reembolso', CAT_APORTE, 'Outros']

const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const labelCls = 'text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5'
const btnPrimaryCls = 'bg-primary text-on-primary rounded-lg px-4 py-3 text-sm font-bold hover:opacity-90 transition-all cursor-pointer w-full'
const btnSecondaryCls = 'bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg px-4 py-3 text-sm cursor-pointer'

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

export default function FinanceiroMobile() {
  const [obras, setObras] = useState<any[]>([])
  const [servicosObra, setServicosObra] = useState<any[]>([])
  const [cartoes, setCartoes] = useState<any[]>([])
  const [contas, setContas] = useState<any[]>([])
  const [wizardAberto, setWizardAberto] = useState(false)
  const [wiz, setWiz] = useState<any>(WZ_VAZIO())
  const [wizSalvando, setWizSalvando] = useState(false)
  // Trava síncrona contra duplo-toque (o estado `wizSalvando` só bloqueia o botão depois de
  // um re-render; em toques muito rápidos no celular os dois cliques podem passar antes disso).
  const salvandoLockRef = useRef(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('viga_token')) { window.location.href = '/'; return }
    obterMinhasPermissoesApp().then(perm => { if (!temAcessoModuloApp(perm, 'financeiro')) window.location.href = '/m' })
    carregar()
    const obraId = localStorage.getItem('viga_financeiro_obra_id')
    if (obraId) {
      localStorage.removeItem('viga_financeiro_obra_id')
      setWiz({ ...WZ_VAZIO(), tipo: 'saida', destino: 'obra', obra_id: obraId, step: 's_dados' })
      setWizardAberto(true)
    }
  }, [])

  async function carregar() {
    const [o, sv, ca, ct] = await Promise.all([
      get('obras', '?order=created_at.desc'),
      get('obra_servicos', '?order=created_at'),
      get('cartoes', '?order=created_at'),
      get('contas', '?order=created_at'),
    ])
    setObras(o.filter((x: any) => x.status === 'em_execucao'))
    setServicosObra(sv)
    setCartoes(ca)
    setContas(ct)
  }

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
    alert('Lançamentos sem NF devem ser feitos pelo sistema no desktop.')
    fecharWizard()
  }

  // Aporte lançado aqui também aparece na aba Investimentos (desktop): um único registro de dinheiro (o
  // lançamento, que mexe na conta) com o espelho em Investimentos.
  async function sincronizarInvestimento(lanc: any) {
    if (!ehMovInvestimento(lanc)) return
    await inserir('investimentos', {
      descricao: lanc.descricao,
      tipo: lanc.categoria === CAT_APORTE ? 'aporte' : 'resgate',
      valor: Math.abs(parseFloat(lanc.valor || 0)),
      data: lanc.data_pagamento || lanc.data,
      instituicao: '',
      observacao: 'Gerado automaticamente a partir do lançamento financeiro',
      lancamento_id: lanc.id,
    })
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
        if (!url) { alert('Não foi possível enviar a foto/arquivo da NF. O lançamento NÃO foi salvo — tente de novo.'); return }
        nf_url = url
      }
      const obraId = wizFinal.destino === 'obra' ? wizFinal.obra_id : ''
      const servicoId = wizFinal.destino === 'obra' ? wizFinal.servico_id : ''

      if (wizFinal.forma_pagamento === 'cartao') {
        const n = Math.max(1, parseInt(wizFinal.parcelas || '1'))
        const valores = dividirParcelas(valorTotal, n)
        for (let i = 0; i < n; i++) {
          const dados: any = {
            data: somarMesesISO(wizFinal.data, i),
            descricao: wizFinal.descricao + (n > 1 ? ` (parcela ${i + 1}/${n})` : ''),
            valor: valores[i], categoria: wizFinal.categoria, cartao_id: wizFinal.cartao_id,
            parcelas: n, parcela_numero: i + 1,
          }
          if (wizFinal.nf_numero) dados.nf_numero = wizFinal.nf_numero
          if (obraId) dados.obra_id = obraId
          if (obraId && servicoId) dados.servico_id = servicoId
          if (nf_url) dados.nf_url = nf_url
          await inserir('gastos_cartao', dados)
        }
      } else {
        const pago = wizFinal.forma_pagamento !== 'faturado'
        const dados: any = {
          data: wizFinal.data, descricao: wizFinal.descricao, tipo: 'saida', valor: valorTotal,
          categoria: wizFinal.categoria, forma_pagamento: wizFinal.forma_pagamento,
          status: pago ? 'pago' : 'pendente', conta: wizFinal.conta,
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
      // O "valor realizado" do serviço é calculado pela tela de Obras a partir dos lançamentos vinculados a ele.
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
        if (!url) { alert('Não foi possível enviar a foto/arquivo da NF. O lançamento NÃO foi salvo — tente de novo.'); return }
        nf_url = url
      }
      const dados: any = {
        data: wiz.data, descricao: wiz.descricao, tipo: 'entrada', valor,
        categoria: wiz.categoria, status: 'pendente', data_vencimento: wiz.data_pagamento_combinada,
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
          wiz={wiz} setWiz={setWiz} obras={obras} servicos={servicosObra} cartoes={cartoes} contas={contas}
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

function WizardLancamento({ wiz, setWiz, obras, servicos, cartoes, contas, salvando, onVoltar, onCancelar, onFinalizarSaida, onFinalizarEntradaComNF, onIrParaFormularioTradicional }: any) {
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
            {wiz.categoria === 'Reembolso' && (
              <div className="mb-3.5">
                <label className={labelCls + ' text-primary'}>👤 Reembolsar para</label>
                <input className={inputCls + ' border-primary/40'} placeholder="Nome do funcionário ou terceiro que adiantou a compra" value={wiz.favorecido} onChange={e => setWiz({ ...wiz, favorecido: e.target.value })} />
              </div>
            )}
            <label className="flex items-center gap-2 mb-3.5 cursor-pointer select-none">
              <input type="checkbox" checked={wiz.recorrente} onChange={e => setWiz({ ...wiz, recorrente: e.target.checked })} className="w-4 h-4 accent-primary cursor-pointer" />
              <span className="text-sm text-on-surface">🔁 Custo fixo (repete automaticamente todo mês)</span>
            </label>
            <Botoes onProximo={() => {
              if (!wiz.descricao || !(parseFloat(wiz.valor) > 0)) return alert('Preencha o valor (maior que zero) e a descrição')
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
              <select className={inputCls} value={wiz.conta} onChange={e => setWiz({ ...wiz, conta: e.target.value })}>
                <option value="">Selecione a conta</option>
                {contas.map((c: any) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select>
              <div className="text-[11px] text-on-surface-variant mt-1">Necessária para o saldo de cada conta se atualizar sozinho</div>
            </div>
            <div className="flex flex-col gap-3">
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant bg-surface-container-low transition-all disabled:opacity-50" disabled={salvando || !wiz.conta} onClick={() => onFinalizarSaida({ forma_pagamento: 'a_vista' })}>
                <div className="font-bold text-on-surface">{salvando ? 'Salvando...' : '💵 À Vista'}</div>
                <div className="text-body-sm text-on-surface-variant">Lança automático no controle do mês como pago</div>
              </button>
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant bg-surface-container-low transition-all disabled:opacity-50" disabled={!wiz.conta} onClick={() => setWiz({ ...wiz, forma_pagamento: 'faturado', step: 's_faturado' })}>
                <div className="font-bold text-on-surface">📅 Faturado</div>
                <div className="text-body-sm text-on-surface-variant">Define prazo em dias e calcula a data de pagamento</div>
              </button>
              <button className="text-left px-5 py-4 rounded-xl border-2 border-outline-variant bg-surface-container-low transition-all" onClick={() => setWiz({ ...wiz, forma_pagamento: 'cartao', step: 's_cartao' })}>
                <div className="font-bold text-on-surface">💳 Cartão</div>
                <div className="text-body-sm text-on-surface-variant">À vista ou parcelado — lança nas faturas do cartão (o dinheiro sai da conta quando a fatura é paga)</div>
              </button>
            </div>
            <Botoes />
          </>
        )}

        {wiz.step === 's_faturado' && (() => {
          const venc = somarDiasISO(wiz.data, Math.max(0, parseInt(wiz.dias_prazo || '0') || 0))
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
                    {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(x => <option key={x} value={x}>{x}x</option>)}
                  </select>
                </div>
              </div>
              <div className="bg-secondary/10 border border-secondary/30 rounded-lg px-3.5 py-2.5 text-secondary text-sm mb-4">
                💳 {n > 1 ? `${n}x de ${fmt(partes[0])}${partes[n - 1] !== partes[0] ? ` (última ${fmt(partes[n - 1])})` : ''} = ${fmt(valorTotal)}` : `À vista: ${fmt(valorTotal)}`}
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
