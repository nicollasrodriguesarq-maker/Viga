'use client'
import { useEffect, useState } from 'react'
import { listarContatosDoCliente } from '../lib/clienteCrm'

// "Responsável" (contato da empresa) de um documento específico — proposta, levantamento ou obra.
// Escolhe entre os contatos cadastrados da empresa (CRM) ou digita um nome livre.
const inputCls = 'bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3 py-1.5 text-sm outline-none focus:border-primary transition-all'

interface Props {
  clienteId?: string | null
  contatoId?: string | null
  contatoNome?: string | null
  podeEditar?: boolean
  rotulo?: string
  onSalvar: (contatoId: string | null, contatoNome: string | null) => void | Promise<void>
}

export default function ResponsavelDoDocumento({ clienteId, contatoId, contatoNome, podeEditar = true, rotulo = 'Responsável', onSalvar }: Props) {
  const [editando, setEditando] = useState(false)
  const [contatos, setContatos] = useState<any[]>([])
  const [sel, setSel] = useState('') // id do contato, '' = livre
  const [livre, setLivre] = useState('')

  useEffect(() => {
    if (!editando) return
    setSel(contatoId || ''); setLivre(contatoId ? '' : (contatoNome || ''))
    if (clienteId) listarContatosDoCliente(clienteId).then(setContatos)
  }, [editando, clienteId, contatoId, contatoNome])

  async function salvar() {
    if (sel) {
      const c = contatos.find(x => x.id === sel)
      await onSalvar(sel, c?.nome || contatoNome || null)
    } else {
      await onSalvar(null, livre.trim() || null)
    }
    setEditando(false)
  }

  if (!editando) {
    return (
      <div className="flex items-center gap-2 text-body-sm text-on-surface-variant" data-testid="responsavel-documento">
        <span className="material-symbols-outlined text-[16px]">badge</span>
        <span>{rotulo}: <b className="text-on-surface">{contatoNome || '—'}</b></span>
        {podeEditar && <button type="button" onClick={() => setEditando(true)} className="text-primary text-[12px] font-semibold hover:underline cursor-pointer" data-testid="editar-responsavel">{contatoNome ? 'alterar' : 'definir'}</button>}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="responsavel-documento-edicao">
      <span className="text-body-sm text-on-surface-variant">{rotulo}:</span>
      {contatos.length > 0 && (
        <select className={inputCls} value={sel} onChange={e => setSel(e.target.value)} data-testid="select-responsavel">
          <option value="">Outro (digitar nome)</option>
          {contatos.map(c => <option key={c.id} value={c.id}>{c.nome}{c.cargo ? ' — ' + c.cargo : ''}</option>)}
        </select>
      )}
      {!sel && <input className={inputCls} placeholder="Nome do responsável" value={livre} onChange={e => setLivre(e.target.value)} data-testid="input-responsavel" />}
      <button type="button" onClick={salvar} className="bg-primary text-on-primary rounded-lg px-3 py-1.5 text-[12px] font-bold cursor-pointer" data-testid="salvar-responsavel">Salvar</button>
      <button type="button" onClick={() => setEditando(false)} className="text-on-surface-variant text-[12px] font-semibold cursor-pointer hover:underline">Cancelar</button>
    </div>
  )
}
