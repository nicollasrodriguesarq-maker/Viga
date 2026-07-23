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
async function criar(tabela: string, dados: object) {
  try { const r = await fetch(BASE + '/' + tabela, { method: 'POST', headers: { ...H, 'Prefer': 'return=representation' }, body: JSON.stringify(dados) }); const d = await r.json(); return Array.isArray(d) ? d[0] : d } catch { return null }
}
async function editar(tabela: string, id: string, dados: object) {
  try { await fetch(BASE + '/' + tabela + '?id=eq.' + id, { method: 'PATCH', headers: H, body: JSON.stringify(dados) }) } catch {}
}

async function uploadFotoServico(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const nome = `foto_${Date.now()}.${ext}`
  const r = await fetch(`${BASE.replace('/rest/v1', '')}/storage/v1/object/levantamento-fotos/${nome}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': file.type },
    body: file,
  })
  if (r.ok) return `${BASE.replace('/rest/v1', '')}/storage/v1/object/public/levantamento-fotos/${nome}`
  return null
}

const num = (v: string) => parseFloat(String(v || '0').replace(',', '.')) || 0
function calcularArea(unidade: string, comprimento: string, largura: string, altura: string): string {
  const c = num(comprimento), l = num(largura), a = num(altura)
  if (unidade === 'm²') { if (c && a) return (c * a).toFixed(2); if (c && l) return (c * l).toFixed(2); return '' }
  if (unidade === 'm³') { if (c && l && a) return (c * l * a).toFixed(2); return '' }
  return ''
}

const STATUS_LEVA: Record<string, string> = { em_andamento: 'Em Andamento', concluido: 'Concluído', cancelado: 'Cancelado' }
const UNIDADES = ['m²', 'm³', 'ml', 'un', 'vb', 'cj', 'kg', 'hr']
const AMBIENTES_COMUNS = ['Sala de Estar', 'Sala de Jantar', 'Cozinha', 'Quarto 1', 'Quarto 2', 'Quarto 3', 'Banheiro Social', 'Banheiro Suíte', 'Área de Serviço', 'Varanda', 'Fachada', 'Área Externa', 'Corredor', 'Hall', 'Escritório', 'Garagem']
const CATEGORIAS = ['Demolição e Remoção', 'Terraplanagem e Fundação', 'Estrutura', 'Alvenaria', 'Cobertura', 'Impermeabilização', 'Instalações Elétricas', 'Instalações Hidráulicas', 'Instalações de Gás', 'Climatização (AC)', 'Forro', 'Revestimento de Parede', 'Revestimento de Piso', 'Pintura', 'Esquadrias', 'Marcenaria', 'Serralheria', 'Vidraçaria', 'Mobiliário', 'Paisagismo', 'Limpeza Pós-Obra', 'Outros']

function gerarCodigo(lista: any[]) {
  const a = new Date().getFullYear()
  const n = lista.filter(l => l.codigo?.startsWith('LEV-' + a)).length + 1
  return 'LEV-' + a + '-' + String(n).padStart(3, '0')
}

const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const labelCls = 'text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5'
const btnPrimaryCls = 'bg-primary text-on-primary rounded-lg px-4 py-3 text-sm font-bold hover:opacity-90 transition-all cursor-pointer w-full'
const btnSecondaryCls = 'bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg px-4 py-3 text-sm cursor-pointer w-full'

const FLEV_VAZIO = { codigo: '', nome: '', cliente: '', endereco: '', responsavel: '', status: 'em_andamento', obra_id: '', cliente_email: '', cliente_telefone: '' }
const FITEM_VAZIO = { servico: '', descricao: '', comprimento: '', largura: '', altura: '', area: '', unidade: 'm²', observacao: '', foto_url: '', banco_item_id: '', categoria: '' }
const FAMB_VAZIO = { nome: '', nomeCustom: '' }

export default function LevantamentoMobile() {
  const [levantamentos, setLevantamentos] = useState<any[]>([])
  const [ambientes, setAmbientes] = useState<any[]>([])
  const [itens, setItens] = useState<any[]>([])
  const [obras, setObras] = useState<any[]>([])
  const [bancoItens, setBancoItens] = useState<any[]>([])
  const [meuId, setMeuId] = useState('')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [detalhe, setDetalhe] = useState<any>(null)
  const [ambienteAtivo, setAmbienteAtivo] = useState<any>(null)
  const [tela, setTela] = useState<string | null>(null)
  const [fLev, setFLev] = useState(FLEV_VAZIO)
  const [fAmb, setFAmb] = useState(FAMB_VAZIO)
  const [fItem, setFItem] = useState(FITEM_VAZIO)
  const [arquivoFoto, setArquivoFoto] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [fotoCompartilhada, setFotoCompartilhada] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('viga_token')) { window.location.href = '/'; return }
    obterMinhasPermissoesApp().then(perm => {
      if (!temAcessoModuloApp(perm, 'levantamento')) { window.location.href = '/m'; return }
      if (perm) setMeuId(perm.id)
    })
    carregar()
  }, [])

  async function carregar() {
    const [l, a, it, o, b] = await Promise.all([
      buscar('levantamentos', '?order=created_at.desc'),
      buscar('levantamento_ambientes', '?order=ordem'),
      buscar('levantamento_itens', '?order=created_at'),
      buscar('obras', '?select=id,nome&order=nome'),
      buscar('banco_itens', '?order=nome'),
    ])
    setLevantamentos(l); setAmbientes(a); setItens(it); setObras(o); setBancoItens(b)
  }

  const filtrados = levantamentos.filter(l => {
    if (filtro !== 'todos' && l.status !== filtro) return false
    if (!busca) return true
    const alvo = (l.codigo + ' ' + l.nome + ' ' + l.cliente).toLowerCase()
    return alvo.includes(busca.toLowerCase())
  })

  async function salvarLevantamento() {
    if (!fLev.cliente) return alert('Preencha o nome do cliente')
    const codigo = fLev.codigo || gerarCodigo(levantamentos)
    const novo = await criar('levantamentos', { ...fLev, codigo, obra_id: fLev.obra_id || null, criado_por: meuId || null })
    setTela(null); setFLev(FLEV_VAZIO)
    await carregar()
    if (novo?.id) { setDetalhe(novo) }
  }

  async function salvarAmbiente() {
    if (!detalhe) return
    const nome = fAmb.nome === '__custom__' ? fAmb.nomeCustom : fAmb.nome
    if (!nome) return alert('Preencha o nome do ambiente')
    const ordem = ambientes.filter(a => a.levantamento_id === detalhe.id).length
    await criar('levantamento_ambientes', { levantamento_id: detalhe.id, nome, ordem })
    setTela('detalhe'); setFAmb(FAMB_VAZIO)
    await carregar()
  }

  function calcularTotalItemOrc(item: any) {
    const valorUnit = (parseFloat(item.preco_material || 0) + parseFloat(item.preco_mao_obra || 0)) * (1 + parseFloat(item.lucro_percentual || 0) / 100) * (1 + parseFloat(item.imposto_percentual || 0) / 100)
    return valorUnit * parseFloat(item.quantidade || 1)
  }
  async function atualizarTotaisOrcamento(orcId: string) {
    const todosItens = await buscar('orcamento_itens', '?orcamento_id=eq.' + orcId)
    const tMat = todosItens.reduce((a: number, i: any) => a + parseFloat(i.preco_material || 0) * parseFloat(i.quantidade || 1), 0)
    const tMao = todosItens.reduce((a: number, i: any) => a + parseFloat(i.preco_mao_obra || 0) * parseFloat(i.quantidade || 1), 0)
    const tGeral = todosItens.reduce((a: number, i: any) => a + calcularTotalItemOrc(i), 0)
    await editar('orcamentos', orcId, { total_material: tMat, total_mao_obra: tMao, total_geral: tGeral })
  }
  async function orcamentoVinculado(): Promise<string | null> {
    if (!detalhe) return null
    const existentes = await buscar('orcamentos', `?levantamento_id=eq.${detalhe.id}&limit=1`)
    if (existentes[0]) return existentes[0].id
    const ano = new Date().getFullYear()
    const orcLista = await buscar('orcamentos', '?order=created_at.desc&limit=200')
    const n = orcLista.filter((o: any) => o.codigo?.startsWith('ORC-' + ano)).length + 1
    const codigo = 'ORC-' + ano + '-' + String(n).padStart(3, '0')
    const novo = await criar('orcamentos', { codigo, levantamento_id: detalhe.id, cliente_nome: detalhe.cliente, endereco: detalhe.endereco, status: 'rascunho', total_material: 0, total_mao_obra: 0, total_geral: 0, desconto: 0 })
    return novo?.id || null
  }
  async function ambienteOrcamentoEspelhado(levAmbiente: any, orcId: string): Promise<string | null> {
    const existentes = await buscar('orcamento_ambientes', `?levantamento_ambiente_id=eq.${levAmbiente.id}`)
    if (existentes[0]) return existentes[0].id
    const novo = await criar('orcamento_ambientes', { orcamento_id: orcId, nome: levAmbiente.nome, ordem: levAmbiente.ordem || 0, levantamento_ambiente_id: levAmbiente.id })
    return novo?.id || null
  }
  async function sincronizarItemOrcamento(item: any, ambiente: any) {
    const orcId = await orcamentoVinculado()
    if (!orcId) return
    const oaId = await ambienteOrcamentoEspelhado(ambiente, orcId)
    if (!oaId) return
    const bi = item.banco_item_id ? bancoItens.find(b => b.id === item.banco_item_id) : null
    const qtd = parseFloat(item.area || 1) || 1
    const dadosOI = {
      orcamento_id: orcId, ambiente_id: oaId, servico: item.servico, descricao: item.descricao,
      quantidade: qtd, unidade: item.unidade,
      preco_material: bi ? bi.preco_material : 0, preco_mao_obra: bi ? bi.preco_mao_obra : 0,
      lucro_percentual: bi ? bi.lucro_percentual : 0, imposto_percentual: bi ? bi.imposto_percentual : 0,
      banco_item_id: item.banco_item_id || null, levantamento_item_id: item.id,
    }
    const totalItem = calcularTotalItemOrc(dadosOI)
    const existentesItem = await buscar('orcamento_itens', `?levantamento_item_id=eq.${item.id}`)
    if (existentesItem[0]) { await editar('orcamento_itens', existentesItem[0].id, { ...dadosOI, total_item: totalItem }) }
    else { await criar('orcamento_itens', { ...dadosOI, total_item: totalItem }) }
    await atualizarTotaisOrcamento(orcId)
  }

  async function selecionarFotoCompartilhada(file: File) {
    setEnviando(true)
    const url = await uploadFotoServico(file)
    setEnviando(false)
    if (url) setFotoCompartilhada(url)
  }

  async function salvarItem() {
    if (!ambienteAtivo || !fItem.servico) return alert('Preencha o serviço')
    const area = fItem.area ? num(fItem.area) : num(calcularArea(fItem.unidade, fItem.comprimento, fItem.largura, fItem.altura))
    const dados = {
      ambiente: ambienteAtivo.id, levantamento_id: detalhe.id, servico: fItem.servico, descricao: fItem.descricao,
      comprimento: num(fItem.comprimento) || null, largura: num(fItem.largura) || null, altura: num(fItem.altura) || null,
      area: area || null, unidade: fItem.unidade, observacao: fItem.observacao, foto_url: fotoCompartilhada || fItem.foto_url || null,
      banco_item_id: fItem.banco_item_id || null, categoria: fItem.categoria || null,
    }
    const itemSalvo = await criar('levantamento_itens', dados)
    setFItem(FITEM_VAZIO)
    if (itemSalvo?.id) await sincronizarItemOrcamento(itemSalvo, ambienteAtivo)
    await carregar()
  }

  function concluirServicos() {
    setTela('detalhe'); setArquivoFoto(null); setFotoCompartilhada(null); setFItem(FITEM_VAZIO)
  }

  const ambsDetalhe = detalhe ? ambientes.filter(a => a.levantamento_id === detalhe.id) : []
  const usaMedidas = fItem.unidade === 'm²' || fItem.unidade === 'm³'

  // ── Tela: Novo Levantamento ────────────────────────────────────
  if (tela === 'novoLevantamento') {
    return (
      <MobileShell title="Novo Levantamento">
        <div className="p-4 flex flex-col gap-3.5 pb-8">
          <div>
            <label className={labelCls}>Cliente *</label>
            <input className={inputCls} placeholder="Nome do cliente" value={fLev.cliente} onChange={e => setFLev({ ...fLev, cliente: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Nome do Levantamento</label>
            <input className={inputCls} placeholder="Ex: Vistoria Reforma Cozinha" value={fLev.nome} onChange={e => setFLev({ ...fLev, nome: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Endereço do imóvel</label>
            <input className={inputCls} placeholder="Rua, número, bairro, cidade" value={fLev.endereco} onChange={e => setFLev({ ...fLev, endereco: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Obra vinculada (opcional)</label>
            <select className={inputCls} value={fLev.obra_id} onChange={e => setFLev({ ...fLev, obra_id: e.target.value })}>
              <option value="">Nenhuma / cliente novo</option>
              {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Telefone do cliente</label>
            <input className={inputCls} placeholder="(11) 90000-0000" value={fLev.cliente_telefone} onChange={e => setFLev({ ...fLev, cliente_telefone: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Responsável pelo levantamento</label>
            <input className={inputCls} placeholder="Nome do técnico" value={fLev.responsavel} onChange={e => setFLev({ ...fLev, responsavel: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2 mt-2">
            <button className={btnPrimaryCls} onClick={salvarLevantamento}>Criar Levantamento</button>
            <button className={btnSecondaryCls} onClick={() => { setTela(null); setFLev(FLEV_VAZIO) }}>Cancelar</button>
          </div>
        </div>
      </MobileShell>
    )
  }

  // ── Tela: Novo Ambiente ─────────────────────────────────────────
  if (tela === 'novoAmbiente') {
    return (
      <MobileShell title="Novo Ambiente">
        <div className="p-4 flex flex-col gap-3.5 pb-8">
          <div>
            <label className={labelCls}>Ambiente</label>
            <select className={inputCls} value={fAmb.nome} onChange={e => setFAmb({ ...fAmb, nome: e.target.value })}>
              <option value="">Selecione ou digite abaixo</option>
              {AMBIENTES_COMUNS.map(a => <option key={a} value={a}>{a}</option>)}
              <option value="__custom__">+ Outro (digitar)</option>
            </select>
          </div>
          {fAmb.nome === '__custom__' && (
            <div>
              <label className={labelCls}>Nome personalizado</label>
              <input className={inputCls} placeholder="Ex: Área Gourmet" value={fAmb.nomeCustom} onChange={e => setFAmb({ ...fAmb, nomeCustom: e.target.value })} />
            </div>
          )}
          <div className="flex flex-col gap-2 mt-2">
            <button className={btnPrimaryCls} onClick={salvarAmbiente}>Adicionar Ambiente</button>
            <button className={btnSecondaryCls} onClick={() => setTela('detalhe')}>Cancelar</button>
          </div>
        </div>
      </MobileShell>
    )
  }

  // ── Tela: Novo Item ──────────────────────────────────────────────
  if (tela === 'novoItem') {
    return (
      <MobileShell title={`Novo Serviço — ${ambienteAtivo?.nome || ''}`}>
        <div className="p-4 flex flex-col gap-3.5 pb-8">
          <div>
            <label className={labelCls}>Serviço *</label>
            <select className={inputCls} value={fItem.banco_item_id || (fItem.servico ? '__custom__' : '')}
              onChange={e => {
                const v = e.target.value
                if (v === '' || v === '__custom__') setFItem({ ...fItem, banco_item_id: '', servico: v === '__custom__' ? '' : fItem.servico })
                else {
                  const bi = bancoItens.find(b => b.id === v)
                  if (bi) setFItem({ ...fItem, banco_item_id: bi.id, servico: bi.nome, categoria: bi.categoria || '', unidade: bi.unidade || fItem.unidade })
                }
              }}>
              <option value="">Selecione do banco de itens ou &quot;Outro&quot;</option>
              {bancoItens.map(b => <option key={b.id} value={b.id}>{b.nome}{b.categoria ? ' — ' + b.categoria : ''}</option>)}
              <option value="__custom__">+ Outro (digitar)</option>
            </select>
          </div>
          {!fItem.banco_item_id && (
            <div>
              <label className={labelCls}>Nome do serviço (personalizado)</label>
              <input className={inputCls} placeholder="Ex: Pintura das paredes" value={fItem.servico} onChange={e => setFItem({ ...fItem, servico: e.target.value })} />
            </div>
          )}
          <div>
            <label className={labelCls}>Categoria {fItem.banco_item_id ? '(definida pelo banco de itens)' : ''}</label>
            <select className={inputCls} value={fItem.categoria} disabled={!!fItem.banco_item_id} onChange={e => setFItem({ ...fItem, categoria: e.target.value })}>
              <option value="">Selecione</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Descrição</label>
            <input className={inputCls} placeholder="Ex: Tinta acrílica cor branco neve, 2 demãos" value={fItem.descricao} onChange={e => setFItem({ ...fItem, descricao: e.target.value })} />
          </div>
          <div className="flex items-center gap-3 bg-surface-container-low border border-outline-variant rounded-lg p-3">
            <div className="w-16 h-16 rounded-lg bg-surface-container border border-outline-variant flex items-center justify-center overflow-hidden shrink-0">
              {fotoCompartilhada ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fotoCompartilhada} alt="Foto do serviço" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-on-surface-variant/40">photo_camera</span>
              )}
            </div>
            <div className="flex-1">
              {fotoCompartilhada ? (
                <>
                  <div className="text-[11px] text-on-surface mb-1">Foto anexada — pode adicionar quantos serviços quiser nela</div>
                  <button className="text-xs text-primary font-semibold" onClick={() => setFotoCompartilhada(null)}>Trocar foto</button>
                </>
              ) : (
                <>
                  <label className={labelCls}>Foto (compartilhada entre vários serviços)</label>
                  <input
                    type="file" accept="image/*" capture="environment"
                    onChange={e => { const f = e.target.files?.[0]; if (f) selecionarFotoCompartilhada(f) }}
                    className="w-full bg-surface-container border border-outline-variant rounded-lg text-on-surface-variant text-xs px-2 py-2 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-primary/10 file:text-primary file:text-xs file:font-semibold cursor-pointer"
                  />
                  {enviando && <div className="text-[11px] text-primary mt-1">Enviando foto...</div>}
                </>
              )}
            </div>
          </div>
          {usaMedidas ? (
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={labelCls}>Comprim. (m)</label>
                <input className={inputCls} type="text" inputMode="decimal" placeholder="0,00" value={fItem.comprimento}
                  onChange={e => { const c = e.target.value; setFItem({ ...fItem, comprimento: c, area: calcularArea(fItem.unidade, c, fItem.largura, fItem.altura) }) }} />
              </div>
              <div>
                <label className={labelCls}>Largura (m)</label>
                <input className={inputCls} type="text" inputMode="decimal" placeholder="0,00" value={fItem.largura}
                  onChange={e => { const l = e.target.value; setFItem({ ...fItem, largura: l, area: calcularArea(fItem.unidade, fItem.comprimento, l, fItem.altura) }) }} />
              </div>
              <div>
                <label className={labelCls}>Altura (m)</label>
                <input className={inputCls} type="text" inputMode="decimal" placeholder="0,00" value={fItem.altura}
                  onChange={e => { const a = e.target.value; setFItem({ ...fItem, altura: a, area: calcularArea(fItem.unidade, fItem.comprimento, fItem.largura, a) }) }} />
              </div>
              <div>
                <label className={labelCls}>Unidade</label>
                <select className={inputCls} value={fItem.unidade}
                  onChange={e => { const u = e.target.value; setFItem({ ...fItem, unidade: u, area: calcularArea(u, fItem.comprimento, fItem.largura, fItem.altura) }) }}>
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={labelCls}>Quantidade</label>
                <input className={inputCls} type="text" inputMode="decimal" placeholder="0,00" value={fItem.area} onChange={e => setFItem({ ...fItem, area: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Unidade</label>
                <select className={inputCls} value={fItem.unidade} onChange={e => setFItem({ ...fItem, unidade: e.target.value, comprimento: '', largura: '', altura: '' })}>
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          )}
          {usaMedidas && (
            <div>
              <label className={labelCls}>Área / Quantidade calculada</label>
              <input className={inputCls + ' text-primary font-bold'} placeholder="Calculado automaticamente ou digite" value={fItem.area} onChange={e => setFItem({ ...fItem, area: e.target.value })} />
            </div>
          )}
          <div>
            <label className={labelCls}>Observação técnica</label>
            <input className={inputCls} placeholder="Ex: Infiltração detectada" value={fItem.observacao} onChange={e => setFItem({ ...fItem, observacao: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2 mt-2">
            <button className={btnPrimaryCls} onClick={salvarItem} disabled={enviando}>+ Adicionar e continuar</button>
            <button className={btnSecondaryCls} onClick={concluirServicos}>Concluir</button>
          </div>
        </div>
      </MobileShell>
    )
  }

  // ── Tela: Detalhe do Levantamento ────────────────────────────────
  if (detalhe && tela === 'detalhe') {
    return (
      <MobileShell title={detalhe.codigo}>
        <div className="p-4 flex flex-col gap-4 pb-8">
          <button className="text-primary text-sm font-semibold text-left" onClick={() => { setDetalhe(null); setTela(null) }}>← Voltar à lista</button>
          <div className="bg-surface-container border border-outline-variant rounded-xl p-4">
            <div className="font-bold text-on-surface">{detalhe.nome || detalhe.cliente}</div>
            <div className="text-body-sm text-on-surface-variant mt-1">{detalhe.cliente}</div>
            {detalhe.endereco && <div className="text-[11px] text-on-surface-variant mt-1">📍 {detalhe.endereco}</div>}
            <div className="text-[11px] text-on-surface-variant mt-1">Status: {STATUS_LEVA[detalhe.status] || detalhe.status}</div>
          </div>

          <button className={btnPrimaryCls} onClick={() => setTela('novoAmbiente')}>+ Ambiente</button>

          {ambsDetalhe.length === 0 ? (
            <div className="text-center py-6 text-on-surface-variant text-body-sm">Nenhum ambiente cadastrado ainda</div>
          ) : ambsDetalhe.map(amb => {
            const itensAmb = itens.filter(i => i.ambiente === amb.id)
            return (
              <div key={amb.id} className="bg-surface-container border border-outline-variant rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-on-surface text-sm">🏠 {amb.nome}</div>
                  <button className="text-primary text-xs font-semibold" onClick={() => { setAmbienteAtivo(amb); setFItem(FITEM_VAZIO); setArquivoFoto(null); setFotoCompartilhada(null); setTela('novoItem') }}>+ Serviço</button>
                </div>
                {itensAmb.length === 0 ? (
                  <div className="text-[12px] text-on-surface-variant py-2">Nenhum serviço registrado</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {itensAmb.map(item => (
                      <div key={item.id} className="flex gap-2.5 items-center py-2 border-t border-outline-variant first:border-0">
                        <div className="w-11 h-11 rounded-lg bg-surface-container-low border border-outline-variant overflow-hidden shrink-0 flex items-center justify-center">
                          {item.foto_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.foto_url} alt="" className="w-full h-full object-cover" />
                          ) : <span className="material-symbols-outlined text-[16px] text-on-surface-variant/40">image</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-on-surface truncate">{item.servico}</div>
                          {item.area && <div className="text-[11px] text-on-surface-variant">{item.area} {item.unidade}</div>}
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
    <MobileShell title="Levantamento">
      <div className="p-4 flex flex-col gap-3">
        <input className={inputCls} placeholder="Pesquisar por código, nome ou cliente..." value={busca} onChange={e => setBusca(e.target.value)} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {['todos', ...Object.keys(STATUS_LEVA)].map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${filtro === f ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-container text-on-surface-variant border-outline-variant'}`}>
              {f === 'todos' ? 'Todos' : STATUS_LEVA[f]}
            </button>
          ))}
        </div>
        <button className={btnPrimaryCls} onClick={() => setTela('novoLevantamento')}>+ Novo Levantamento</button>

        {filtrados.length === 0 ? (
          <div className="text-center py-10 text-on-surface-variant text-body-sm">Nenhum levantamento encontrado</div>
        ) : filtrados.map(l => {
          const qtdItens = itens.filter(i => i.levantamento_id === l.id).length
          return (
            <button key={l.id} onClick={() => { setDetalhe(l); setTela('detalhe') }}
              className="text-left bg-surface-container border border-outline-variant rounded-xl p-4">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-on-surface text-sm truncate">{l.nome || l.cliente}</div>
                  <div className="text-[11px] text-on-surface-variant truncate">{l.codigo} · {l.cliente}</div>
                </div>
                <span className="text-[10px] font-semibold text-on-surface-variant uppercase shrink-0">{STATUS_LEVA[l.status] || l.status}</span>
              </div>
              <div className="text-[11px] text-on-surface-variant mt-2">{qtdItens} serviço{qtdItens === 1 ? '' : 's'} registrado{qtdItens === 1 ? '' : 's'}</div>
            </button>
          )
        })}
      </div>
    </MobileShell>
  )
}
