'use client'
import { useRef, useState } from 'react'
import { LIMITE_ANEXO_MB, criarTipo, tamanhoLegivel, type Atividade, type DadosAtividade } from '../lib/atividades'
import { hojeISO } from '../lib/datas'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const labelCls = 'text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5'
const btnPrimaryCls = 'bg-primary text-on-primary rounded-lg px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-all cursor-pointer disabled:opacity-50'
const btnSecondaryCls = 'bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg px-4 py-2.5 text-sm hover:bg-surface-variant transition-all cursor-pointer'
const nomeDe = (usuarios: any[], id: string) => { const u = usuarios.find(x => x.id === id); return u ? (u.nome || (u.email || '').split('@')[0]) : 'Usuário' }

export default function FormAtividade({ inicial, usuarios, tipos: tiposEntrada, meuId, onSalvar, onCancelar, onExcluirAnexo }: {
  inicial: Atividade | null
  usuarios: any[]          // quem pode ser escolhido como responsável
  tipos: { id: string; nome: string; alerta_dias: number }[]
  meuId: string
  onSalvar: (dados: DadosAtividade, responsaveis: string[], arquivos: File[]) => Promise<void>
  onCancelar: () => void
  onExcluirAnexo?: (anexo: Atividade['anexos'][number]) => Promise<void>
}) {
  const hoje = hojeISO()
  const [tipos, setTipos] = useState(tiposEntrada)
  const [f, setF] = useState<DadosAtividade>({
    titulo: inicial?.titulo || '', descricao: inicial?.descricao || '', tipo: inicial?.tipo || tiposEntrada[0]?.nome || 'Outro',
    data_inicio: inicial?.data_inicio || hoje, data_fim: inicial?.data_fim || hoje,
    alerta_dias: inicial?.alerta_dias ?? tiposEntrada.find(t => t.nome === (tiposEntrada[0]?.nome))?.alerta_dias ?? 1,
  })
  const [resp, setResp] = useState<string[]>(inicial?.responsaveis.map(r => r.usuario_id) || [])
  const [arquivos, setArquivos] = useState<File[]>([])
  const [anexosExistentes, setAnexosExistentes] = useState(inicial?.anexos || [])
  const [novoTipo, setNovoTipo] = useState<null | { nome: string; dias: string }>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const arquivoRef = useRef<HTMLInputElement>(null)

  const disponiveis = usuarios.filter(u => !resp.includes(u.id))

  function escolherTipo(nome: string) {
    // o tipo traz o aviso padrão; ao editar uma atividade existente o aviso já definido é mantido
    const t = tipos.find(x => x.nome === nome)
    setF(p => ({ ...p, tipo: nome, alerta_dias: inicial ? p.alerta_dias : (t?.alerta_dias ?? p.alerta_dias) }))
  }
  async function salvarNovoTipo() {
    if (!novoTipo?.nome.trim()) return
    try {
      const t = await criarTipo(novoTipo.nome, Math.min(30, Math.max(0, parseInt(novoTipo.dias) || 0)))
      setTipos(l => [...l, t].sort((a, b) => a.nome.localeCompare(b.nome)))
      setF(p => ({ ...p, tipo: t.nome, alerta_dias: t.alerta_dias }))
      setNovoTipo(null)
    } catch (e: any) { setErro(/duplicate|unique/i.test(e?.message || '') ? 'Já existe um tipo com esse nome' : (e?.message || 'Não foi possível criar o tipo')) }
  }
  function adicionarArquivos(lista: FileList | null) {
    const novos = Array.from(lista || [])
    const grande = novos.find(a => a.size > LIMITE_ANEXO_MB * 1024 * 1024)
    if (grande) return setErro(`"${grande.name}" passa de ${LIMITE_ANEXO_MB} MB`)
    setErro(''); setArquivos(a => [...a, ...novos])
  }
  async function salvar() {
    if (!f.titulo.trim()) return setErro('Informe o título da atividade')
    if (!f.data_inicio || !f.data_fim) return setErro('Informe o início e o término')
    if (f.data_fim < f.data_inicio) return setErro('O término não pode ser antes do início')
    if (resp.length === 0) return setErro('Escolha ao menos um responsável')
    setSalvando(true); setErro('')
    try { await onSalvar({ ...f, titulo: f.titulo.trim() }, resp, arquivos) } catch (e: any) { setErro(e?.message || 'Não foi possível salvar'); setSalvando(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && !salvando && onCancelar()}>
      <div className="bg-surface-container border border-outline-variant rounded-2xl p-7 w-full max-w-[620px] max-h-[92vh] overflow-y-auto" data-testid="form-atividade">
        <div className="text-base font-bold text-on-surface mb-5">{inicial ? 'Editar atividade' : '+ Nova atividade'}</div>

        <div className="mb-3.5">
          <label className={labelCls}>Título *</label>
          <input className={inputCls} value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: Medir o terraço da obra Bartolomeu" data-testid="atv-titulo" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3.5">
          <div>
            <label className={labelCls}>Tipo da atividade *</label>
            {novoTipo ? (
              <div className="flex gap-2">
                <input className={inputCls} placeholder="Nome do tipo" value={novoTipo.nome} onChange={e => setNovoTipo({ ...novoTipo, nome: e.target.value })} data-testid="atv-novo-tipo-nome" />
                <input className={inputCls + ' !w-20'} type="number" min="0" max="30" title="Avisar quantos dias antes" value={novoTipo.dias} onChange={e => setNovoTipo({ ...novoTipo, dias: e.target.value })} />
                <button type="button" className={btnPrimaryCls + ' !px-3'} onClick={salvarNovoTipo} data-testid="atv-salvar-tipo">OK</button>
                <button type="button" className={btnSecondaryCls + ' !px-3'} onClick={() => setNovoTipo(null)}>×</button>
              </div>
            ) : (
              <select className={inputCls} value={f.tipo} onChange={e => e.target.value === '__novo' ? setNovoTipo({ nome: '', dias: '1' }) : escolherTipo(e.target.value)} data-testid="atv-tipo">
                {tipos.map(t => <option key={t.id} value={t.nome}>{t.nome}</option>)}
                {!tipos.some(t => t.nome === f.tipo) && <option value={f.tipo}>{f.tipo}</option>}
                <option value="__novo">➕ Criar novo tipo...</option>
              </select>
            )}
            {novoTipo && <div className="text-[11px] text-on-surface-variant mt-1">O número é quantos dias antes do prazo o sistema avisa (padrão do tipo).</div>}
          </div>
          <div>
            <label className={labelCls}>Avisar antes do prazo</label>
            <select className={inputCls} value={f.alerta_dias} onChange={e => setF({ ...f, alerta_dias: parseInt(e.target.value) })} data-testid="atv-alerta">
              {[0, 1, 2, 3, 5, 7, 10, 15, 30].map(d => <option key={d} value={d}>{d === 0 ? 'Só no dia do prazo' : `${d} ${d === 1 ? 'dia' : 'dias'} antes`}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Início *</label>
            <input type="date" className={inputCls} value={f.data_inicio} onChange={e => setF({ ...f, data_inicio: e.target.value, data_fim: f.data_fim < e.target.value ? e.target.value : f.data_fim })} data-testid="atv-inicio" />
          </div>
          <div>
            <label className={labelCls}>Término (prazo) *</label>
            <input type="date" className={inputCls} min={f.data_inicio} value={f.data_fim} onChange={e => setF({ ...f, data_fim: e.target.value })} data-testid="atv-fim" />
          </div>
        </div>

        <div className="mb-3.5">
          <label className={labelCls}>Responsáveis * <span className="normal-case font-normal">(uma ou mais pessoas)</span></label>
          {resp.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {resp.map(id => (
                <span key={id} className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20" data-testid="chip-responsavel">
                  👤 {id === meuId ? 'Eu' : nomeDe(usuarios, id)}
                  <button type="button" className="text-primary/70 hover:text-error cursor-pointer" aria-label="Remover responsável" onClick={() => setResp(resp.filter(x => x !== id))}>×</button>
                </span>
              ))}
            </div>
          )}
          <select className={inputCls} value="" onChange={e => { if (e.target.value) setResp([...resp, e.target.value]) }} data-testid="atv-add-responsavel">
            <option value="">{disponiveis.length === 0 ? 'Todas as pessoas já foram adicionadas' : '➕ Adicionar responsável...'}</option>
            {disponiveis.map(u => <option key={u.id} value={u.id}>{u.nome || u.email}</option>)}
          </select>
        </div>

        <div className="mb-3.5">
          <label className={labelCls}>Descrição</label>
          <textarea className={inputCls + ' min-h-[80px] resize-y'} value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} placeholder="Detalhe o que precisa ser feito..." data-testid="atv-descricao" />
        </div>

        <div className="mb-4">
          <label className={labelCls}>Anexos</label>
          {anexosExistentes.map(x => (
            <div key={x.id} className="flex items-center gap-2 text-sm bg-surface-container-low rounded-lg px-3 py-2 mb-1">
              <span>📄</span><span className="truncate flex-1">{x.nome}</span><span className="text-[11px] text-on-surface-variant">{tamanhoLegivel(x.tamanho)}</span>
              {onExcluirAnexo && <button type="button" className="text-error text-xs cursor-pointer" aria-label="Remover anexo" onClick={async () => { if (!confirm(`Remover o anexo "${x.nome}"?`)) return; try { await onExcluirAnexo(x); setAnexosExistentes(l => l.filter(y => y.id !== x.id)) } catch (e: any) { setErro(e?.message || 'Não foi possível remover') } }}>×</button>}
            </div>
          ))}
          {arquivos.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-sm bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 mb-1" data-testid="anexo-pendente">
              <span>📎</span><span className="truncate flex-1">{a.name}</span><span className="text-[11px] text-on-surface-variant">{tamanhoLegivel(a.size)}</span>
              <button type="button" className="text-error text-xs cursor-pointer" aria-label="Remover arquivo" onClick={() => setArquivos(arquivos.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className={btnSecondaryCls + ' !py-2 mt-1'} onClick={() => arquivoRef.current?.click()} data-testid="atv-btn-anexar">📎 Anexar arquivos</button>
          <input ref={arquivoRef} type="file" multiple className="hidden" data-testid="atv-input-arquivo" onChange={e => { adicionarArquivos(e.target.files); e.target.value = '' }} />
          <div className="text-[11px] text-on-surface-variant mt-1">Até {LIMITE_ANEXO_MB} MB por arquivo (fotos, PDFs, planilhas...).</div>
        </div>

        {erro && <div className="bg-error/10 border border-error/30 rounded-lg px-3 py-2 text-error text-xs mb-3" data-testid="atv-erro">{erro}</div>}
        <div className="flex gap-2 justify-end">
          <button className={btnSecondaryCls} onClick={onCancelar} disabled={salvando}>Cancelar</button>
          <button className={btnPrimaryCls} onClick={salvar} disabled={salvando} data-testid="atv-salvar">{salvando ? 'Salvando...' : inicial ? 'Salvar' : 'Criar atividade'}</button>
        </div>
      </div>
    </div>
  )
}
