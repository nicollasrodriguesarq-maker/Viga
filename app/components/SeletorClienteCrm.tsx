'use client'
import { useEffect, useState } from 'react'
import { CANAIS_CRM, ETAPA_POR_ORIGEM, NOME_ETAPA_CRM, listarClientesCarteira, type OrigemCrm, type ValorClienteCrm } from '../lib/clienteCrm'

// Pergunta, ao criar Orçamento / Levantamento / Obra, se o cliente é NOVO ou já da CARTEIRA, e
// guarda a escolha para o cadastro automático no CRM (agenda de clientes + pipeline).
// O nome (e, no levantamento/obra, e-mail/telefone/endereço) continua nos campos do próprio
// formulário; este bloco só preenche esses campos quando o cliente é escolhido da carteira.
const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const labelCls = 'text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5'

interface Props {
  valor: ValorClienteCrm
  onChange: (v: ValorClienteCrm) => void
  origem: OrigemCrm
  leads?: { id: string; codigo: string; nome: string }[] // habilita a 3ª opção (lead que já está no pipeline)
  mostrarContato?: boolean // pede telefone/e-mail aqui (quando o formulário não tem esses campos)
  onClienteSelecionado?: (cliente: any) => void
  onLeadSelecionado?: (lead: { id: string; codigo: string; nome: string }) => void
}

export default function SeletorClienteCrm({ valor, onChange, origem, leads, mostrarContato, onClienteSelecionado, onLeadSelecionado }: Props) {
  const [clientes, setClientes] = useState<any[]>([])
  const [busca, setBusca] = useState('')

  useEffect(() => { listarClientesCarteira().then(setClientes) }, [])

  const set = (parcial: Partial<ValorClienteCrm>) => onChange({ ...valor, ...parcial })
  const termo = busca.trim().toLowerCase()
  const filtrados = clientes.filter(c => !termo || [c.nome, c.telefone, c.email].some(x => String(x || '').toLowerCase().includes(termo)))
  const clienteSel = clientes.find(c => c.id === valor.clienteId)

  const botao = (modo: ValorClienteCrm['modo'], rotulo: string) => (
    <button type="button" data-testid={`modo-cliente-${modo}`}
      onClick={() => set({ modo })}
      className={`flex-1 rounded-lg py-2 text-[12px] font-bold border transition-all cursor-pointer ${valor.modo === modo ? 'bg-primary/15 border-primary text-primary' : 'bg-surface-container-low border-outline-variant text-on-surface-variant hover:bg-surface-variant/50'}`}>
      {rotulo}
    </button>
  )

  return (
    <div className="mb-3.5 rounded-xl border border-outline-variant bg-surface-container-low/60 p-3" data-testid="seletor-cliente-crm">
      <label className={labelCls}>Tipo de cliente *</label>
      <div className="flex gap-2 mb-2.5">
        {botao('novo', '🆕 Cliente novo')}
        {botao('carteira', '⭐ Já é da carteira')}
        {leads && botao('lead', '🔗 Lead do pipeline')}
      </div>

      {valor.modo === 'novo' && (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className={labelCls}>Como chegou até nós</label>
              <select className={inputCls} value={valor.canal} onChange={e => set({ canal: e.target.value })} data-testid="select-canal-crm">
                {CANAIS_CRM.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {valor.canal === 'Outro' && (
              <div>
                <label className={labelCls}>Qual canal?</label>
                <input className={inputCls} value={valor.canalOutro} onChange={e => set({ canalOutro: e.target.value })} />
              </div>
            )}
          </div>
          {mostrarContato && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className={labelCls}>Telefone</label>
                <input className={inputCls} placeholder="(11) 90000-0000" value={valor.telefone} onChange={e => set({ telefone: e.target.value })} data-testid="input-telefone-crm" />
              </div>
              <div>
                <label className={labelCls}>E-mail</label>
                <input className={inputCls} type="email" placeholder="cliente@email.com" value={valor.email} onChange={e => set({ email: e.target.value })} data-testid="input-email-crm" />
              </div>
            </div>
          )}
          <div className="text-[11px] text-on-surface-variant">Será cadastrado na <b>Agenda de Clientes</b> e entrará no <b>Pipeline</b> como lead novo na etapa “{NOME_ETAPA_CRM[ETAPA_POR_ORIGEM[origem]]}”.</div>
        </div>
      )}

      {valor.modo === 'carteira' && (
        <div className="flex flex-col gap-2">
          <input className={inputCls} placeholder="Buscar cliente por nome, telefone ou e-mail..." value={busca} onChange={e => setBusca(e.target.value)} data-testid="busca-cliente-carteira" />
          <select className={inputCls} value={valor.clienteId} data-testid="select-cliente-carteira"
            onChange={e => { const c = clientes.find(x => x.id === e.target.value); set({ clienteId: e.target.value }); if (c) onClienteSelecionado?.(c) }}>
            <option value="">{clientes.length === 0 ? 'Nenhum cliente cadastrado na carteira ainda' : 'Selecione o cliente...'}</option>
            {filtrados.map(c => <option key={c.id} value={c.id}>{c.nome}{c.telefone ? ' · ' + c.telefone : ''}</option>)}
          </select>
          {clienteSel && <div className="text-[11px] text-on-surface-variant">Um novo negócio será aberto no Pipeline para <b>{clienteSel.nome}</b> (tipo Carteira), na etapa “{NOME_ETAPA_CRM[ETAPA_POR_ORIGEM[origem]]}”.</div>}
        </div>
      )}

      {valor.modo === 'lead' && leads && (
        <div className="flex flex-col gap-2">
          <select className={inputCls} value={valor.leadId} data-testid="select-lead-crm"
            onChange={e => { const l = leads.find(x => x.id === e.target.value); set({ leadId: e.target.value }); if (l) onLeadSelecionado?.(l) }}>
            <option value="">Selecione o lead...</option>
            {leads.map(l => <option key={l.id} value={l.id}>{l.codigo} — {l.nome}</option>)}
          </select>
          <div className="text-[11px] text-on-surface-variant">Nada novo será criado: o orçamento fica ligado a este lead.</div>
        </div>
      )}
    </div>
  )
}
