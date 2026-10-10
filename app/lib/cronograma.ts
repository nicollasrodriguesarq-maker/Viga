// Lógica compartilhada do Cronograma de obras (desktop, mobile e portal do cliente).
//
// Uma "etapa" (tabela cronograma_etapas) pode vir de 3 origens:
//   - servico:   ligada a um serviço da obra (obra_servicos) — modo "servicos"
//   - orcamento: ligada a um item do orçamento (orcamento_itens) — modo "orcamento"
//   - manual:    criada à mão, só com nome/datas — modo "zero" (ou etapas extras em qualquer modo)

export type ModoCronograma = 'zero' | 'servicos' | 'orcamento'

export const MODOS_CRONOGRAMA: { id: ModoCronograma; titulo: string; icone: string; descricao: string }[] = [
  {
    id: 'zero',
    icone: '✏️',
    titulo: 'Montar do zero',
    descricao: 'Você cadastra cada etapa e as datas manualmente. Ideal quando o executor manda um orçamento com itens macros e depois um cronograma com serviços mais detalhados.',
  },
  {
    id: 'servicos',
    icone: '🔧',
    titulo: 'A partir dos serviços da obra',
    descricao: 'Cada serviço cadastrado na aba Serviços vira uma etapa, com as datas distribuídas entre o início e o fim da obra. Depois é só ajustar as datas de cada item.',
  },
  {
    id: 'orcamento',
    icone: '💼',
    titulo: 'A partir do orçamento',
    descricao: 'Puxa direto os itens do orçamento vinculado, já com as datas calculadas pelo tempo de execução de cada item. Dá para editar e acrescentar etapas para detalhar mais para o cliente. Indicado para obras em que a Inverso também executa.',
  },
]

export const ETAPA_STATUS: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em Andamento',
  concluida: 'Concluída',
  atrasada: 'Atrasada',
}

export const TIPOS_ALTERACAO_CRONOGRAMA: Record<string, string> = {
  atraso: 'Atraso na execução',
  reprogramacao: 'Reprogramação de data',
  ajuste: 'Ajuste de planejamento (sem atraso)',
}

// Sequência real de execução de obra (mesma lista usada em Obras/Orçamento).
export const CATEGORIAS_SERVICO = ['Serviços Preliminares', 'Demolição e Remoção', 'Terraplanagem e Fundação', 'Estrutura', 'Alvenaria', 'Cobertura', 'Impermeabilização', 'Instalações Elétricas', 'Instalações Hidráulicas', 'Instalações de Gás', 'Instalações de Incêndio', 'Climatização (AC)', 'Revestimento de Parede', 'Revestimento de Piso', 'Forro', 'Esquadrias', 'Vidraçaria', 'Serralheria', 'Marmoraria', 'Louças e Metais', 'Marcenaria', 'Pintura', 'Mobiliário', 'Paisagismo', 'Limpeza Pós-Obra', 'Outros']
export function ordemCategoriaPadrao(categoria: string | null | undefined): number {
  const idx = CATEGORIAS_SERVICO.indexOf(categoria || '')
  return idx === -1 ? CATEGORIAS_SERVICO.length : idx
}

export function hojeISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dia}`
}

// Status "de verdade" para exibição: uma etapa não concluída cujo prazo já passou é
// considerada atrasada mesmo que ninguém tenha marcado manualmente.
export function statusVisualEtapa(et: { status?: string | null; data_fim_prevista?: string | null }, hoje: string = hojeISO()): string {
  const status = et.status || 'pendente'
  if (status === 'concluida') return 'concluida'
  if (status === 'atrasada') return 'atrasada'
  if (et.data_fim_prevista && et.data_fim_prevista < hoje) return 'atrasada'
  return status
}

export interface LinhaCronograma {
  et: any
  nome: string
  categoria: string | null
  fornecedor: string | null
  origem: 'servico' | 'orcamento' | 'manual'
  servico?: any
  item?: any
}

// Modo efetivo da obra: o escolhido pelo usuário; senão, deduz do que já existe (obras antigas
// não têm o campo preenchido e já tinham etapas ligadas a serviços).
export function modoEfetivoCronograma(obra: any, etapasObra: any[]): ModoCronograma | null {
  const m = obra?.cronograma_modo
  if (m === 'zero' || m === 'servicos' || m === 'orcamento') return m
  if (etapasObra.length === 0) return null
  if (etapasObra.some(e => e.servico_id)) return 'servicos'
  if (etapasObra.some(e => e.orcamento_item_id)) return 'orcamento'
  return 'zero'
}

export function montarLinhasCronograma(etapasObra: any[], servicosObra: any[], orcItens: any[]): LinhaCronograma[] {
  const linhas: LinhaCronograma[] = []
  for (const et of etapasObra) {
    if (et.servico_id) {
      const servico = servicosObra.find(s => s.id === et.servico_id)
      if (!servico) continue
      linhas.push({
        et, servico, origem: 'servico',
        nome: et.nome || servico.nome,
        categoria: et.categoria ?? servico.categoria ?? null,
        fornecedor: et.fornecedor ?? servico.fornecedor ?? null,
      })
    } else if (et.orcamento_item_id) {
      const item = orcItens.find(i => i.id === et.orcamento_item_id)
      linhas.push({
        et, item, origem: 'orcamento',
        nome: et.nome || item?.servico || 'Item do orçamento',
        categoria: et.categoria ?? item?.categoria ?? null,
        fornecedor: et.fornecedor ?? null,
      })
    } else {
      linhas.push({ et, origem: 'manual', nome: et.nome || 'Etapa', categoria: et.categoria ?? null, fornecedor: et.fornecedor ?? null })
    }
  }
  return linhas
}

// Ordena as linhas: por categoria na sequência canônica de execução (quando há categorias),
// e dentro dela pelo `ordem` do serviço (modo servicos) ou pela data de início prevista.
export function ordenarLinhasCronograma(
  linhas: LinhaCronograma[],
  modo: ModoCronograma | null,
  ordemCategoria: (c: string | null | undefined) => number,
): { linhas: LinhaCronograma[]; agruparPorCategoria: boolean } {
  const agruparPorCategoria = modo !== 'zero' && linhas.some(l => !!l.categoria)
  const chaveData = (l: LinhaCronograma) => l.et.data_inicio_prevista || '9999-12-31'
  const ordenadas = [...linhas].sort((a, b) => {
    if (agruparPorCategoria) {
      const dc = ordemCategoria(a.categoria) - ordemCategoria(b.categoria)
      if (dc !== 0) return dc
    }
    if (modo === 'servicos' && a.servico && b.servico) {
      const doo = (a.servico.ordem ?? 0) - (b.servico.ordem ?? 0)
      if (doo !== 0) return doo
    }
    const dd = chaveData(a).localeCompare(chaveData(b))
    if (dd !== 0) return dd
    const oo = (a.et.ordem ?? 0) - (b.et.ordem ?? 0)
    if (oo !== 0) return oo
    return String(a.et.created_at || '').localeCompare(String(b.et.created_at || ''))
  })
  return { linhas: ordenadas, agruparPorCategoria }
}

// Último motivo registrado (atraso/reprogramação) de uma etapa — para mostrar no cronograma.
export function ultimoMotivoEtapa(etapaId: string, historico: any[]): any | null {
  return historico
    .filter(h => h.etapa_id === etapaId && h.motivo && (h.tipo === 'atraso' || h.tipo === 'reprogramacao'))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null
}

// ── Datas úteis (mesma lógica de app/orcamento/page.tsx) ──────────────────────────────
export function diaValido(d: Date, pattern: string): boolean {
  const dow = d.getDay()
  if (pattern === 'todos_dias') return true
  if (pattern === 'seg_sab') return dow >= 1 && dow <= 6
  return dow >= 1 && dow <= 5
}
export function proximoDiaUtil(d: Date, pattern: string): Date {
  const nd = new Date(d)
  while (!diaValido(nd, pattern)) nd.setDate(nd.getDate() + 1)
  return nd
}
export function somarDiasUteis(inicio: Date, dias: number, pattern: string): Date {
  let atual = proximoDiaUtil(inicio, pattern)
  let restante = Math.max(1, dias) - 1
  while (restante > 0) {
    atual = new Date(atual)
    atual.setDate(atual.getDate() + 1)
    atual = proximoDiaUtil(atual, pattern)
    restante--
  }
  return atual
}
export function dataParaISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dia}`
}

// Tempo de execução (em dias) de um item do orçamento; horas viram dias de jornada de 8h.
// Sem tempo cadastrado, assume 1 dia.
export function tempoExecucaoItemDias(item: any, bancoItens: any[]): number {
  const bi = item.banco_item_id ? bancoItens.find(b => b.id === item.banco_item_id) : null
  const valorBanco = bi?.tempo_execucao ? parseFloat(bi.tempo_execucao) : 0
  const valorProprio = item.tempo_execucao ? parseFloat(item.tempo_execucao) : 0
  const valor = valorBanco > 0 ? valorBanco : valorProprio
  const unidade = valorBanco > 0 ? bi?.tempo_execucao_unidade : item.tempo_execucao_unidade
  const dias = unidade === 'horas' ? valor / 8 : valor
  return dias > 0 ? dias : 1
}

// Datas sequenciais (um item depois do outro) a partir de uma data de início, respeitando os
// dias de trabalho da obra. Os itens devem vir já ordenados.
export function calcularDatasOrcamento(itens: any[], dataInicioISO: string, regime: string, bancoItens: any[]) {
  let cursor = new Date(dataInicioISO + 'T00:00:00')
  return itens.map(item => {
    const inicio = proximoDiaUtil(cursor, regime)
    const fim = somarDiasUteis(inicio, tempoExecucaoItemDias(item, bancoItens), regime)
    const prox = new Date(fim); prox.setDate(prox.getDate() + 1)
    cursor = prox
    return { item, inicio: dataParaISO(inicio), fim: dataParaISO(fim) }
  })
}

// ── Seção de cronograma para os PDFs (tema escuro, igual aos demais relatórios da obra) ──
const COR_STATUS: Record<string, string> = { concluida: '#6ee9e0', atrasada: '#ffb4ab', em_andamento: '#ffcbac', pendente: '#69736f' }
const fmtData = (v?: string | null) => v ? new Date(v + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Motivos de atraso/reprogramação são controle interno: só entram no PDF se pedido (mostrarMotivos).
export function htmlSecaoCronogramaPDF(obra: any, linhas: LinhaCronograma[], historico: any[], opts: { titulo?: string; mostrarMotivos?: boolean } = {}): string {
  const hoje = hojeISO()
  const comStatus = linhas.map(l => ({ l, status: statusVisualEtapa(l.et, hoje) }))
  const total = comStatus.length
  const feitas = comStatus.filter(x => x.status === 'concluida').length
  const andamento = comStatus.filter(x => x.status === 'em_andamento').length
  const atrasadas = comStatus.filter(x => x.status === 'atrasada').length
  const pendentes = total - feitas - andamento - atrasadas

  const datas = linhas.flatMap(l => [l.et.data_inicio_prevista, l.et.data_fim_prevista]).filter(Boolean) as string[]
  const iniStr = obra?.data_inicio || (datas.length ? datas.slice().sort()[0] : null)
  const fimStr = obra?.data_previsao || (datas.length ? datas.slice().sort().slice(-1)[0] : null)
  const ini = iniStr ? new Date(iniStr + 'T00:00:00') : null
  const fim = fimStr ? new Date(fimStr + 'T00:00:00') : null
  const totalMs = ini && fim ? Math.max(fim.getTime() - ini.getTime(), 86400000) : 1

  const barra = (inicioP?: string | null, fimP?: string | null) => {
    if (!ini || !fim) return { x: 0, w: 1 }
    const i = inicioP ? new Date(inicioP + 'T00:00:00') : ini
    const f = fimP ? new Date(fimP + 'T00:00:00') : i
    const x = Math.max(0, Math.min(100, ((i.getTime() - ini.getTime()) / totalMs) * 100))
    const fx = Math.max(0, Math.min(100, ((f.getTime() - ini.getTime()) / totalMs) * 100))
    return { x, w: Math.max(fx - x, 0.8) }
  }
  const hojePct = ini && fim ? Math.max(0, Math.min(100, ((new Date().getTime() - ini.getTime()) / totalMs) * 100)) : null
  const hojeDentro = ini && fim ? new Date() >= ini && new Date() <= fim : false

  const ganttHtml = ini && fim ? comStatus.map(({ l, status }) => {
    const { x, w } = barra(l.et.data_inicio_prevista, l.et.data_fim_prevista)
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px">
      <div style="width:150px;flex-shrink:0;font-size:10px;color:#dee2ec;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.nome)}</div>
      <div style="position:relative;flex:1;height:14px;background:#1b2027;border-radius:4px;overflow:hidden">
        <div style="position:absolute;top:0;height:100%;border-radius:4px;left:${x}%;width:${w}%;background:${COR_STATUS[status] || COR_STATUS.pendente}"></div>
        ${hojeDentro && hojePct != null ? `<div style="position:absolute;top:0;height:100%;width:1px;background:#fff;left:${hojePct}%"></div>` : ''}
      </div>
    </div>`
  }).join('') : '<div style="text-align:center;color:#869391;padding:12px 0;font-size:11px">Datas da obra não informadas para montar o Gantt.</div>'

  const nomeStatus = (s: string) => s === 'concluida' ? 'Concluída' : s === 'em_andamento' ? 'Em andamento' : s === 'atrasada' ? 'Atrasada' : 'Pendente'
  const linhasTabela = comStatus.map(({ l, status }) => {
    const mot = opts.mostrarMotivos ? ultimoMotivoEtapa(l.et.id, historico) : null
    return `<tr style="break-inside:avoid">
      <td style="padding:7px 10px;border-bottom:1px solid #3d4948">${esc(l.nome)}${l.fornecedor ? ` <span style="color:#869391">(${esc(l.fornecedor)})</span>` : ''}${mot ? `<div style="font-size:10px;color:#ffcbac;margin-top:2px">↳ ${esc(mot.motivo)}</div>` : ''}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #3d4948;text-align:center">${fmtData(l.et.data_inicio_prevista)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #3d4948;text-align:center">${fmtData(l.et.data_fim_prevista)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #3d4948;text-align:center;font-weight:700;color:${COR_STATUS[status] || COR_STATUS.pendente}">${nomeStatus(status)}</td>
    </tr>`
  }).join('')

  const chip = (cor: string, n: number, rot: string) => `<div style="background:#1b2027;border:1px solid #3d4948;border-radius:10px;padding:10px 14px;flex:1;text-align:center"><div style="font-size:18px;font-weight:800;color:${cor}">${n}</div><div style="font-size:9px;color:#869391;text-transform:uppercase">${rot}</div></div>`

  return `
      <div style="page-break-before:always;margin-top:28px">
        <h2 style="font-size:16px;font-weight:700;color:#6ee9e0;text-transform:uppercase;margin-bottom:4px">${esc(opts.titulo || 'Cronograma da Obra')}</h2>
        <p style="color:#bcc9c7;font-size:11px;margin-bottom:12px">O que já foi feito, o que está em andamento e o que está atrasado${ini && fim ? ` · Período previsto: ${ini.toLocaleDateString('pt-BR')} — ${fim.toLocaleDateString('pt-BR')}` : ''}</p>
        <div style="display:flex;gap:10px;margin-bottom:14px">
          ${chip('#6ee9e0', feitas, 'Concluídas')}${chip('#ffcbac', andamento, 'Em andamento')}${chip('#ffb4ab', atrasadas, 'Atrasadas')}${chip('#69736f', pendentes, 'Pendentes')}
        </div>
        ${total === 0 ? '<div style="text-align:center;color:#869391;padding:16px 0">Cronograma ainda não montado para esta obra.</div>' : `
        <div style="background:#1b2027;border:1px solid #3d4948;border-radius:12px;padding:14px;margin-bottom:14px">
          <div style="display:flex;gap:10px;font-size:9px;color:#869391;margin-bottom:10px;flex-wrap:wrap">
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#69736f;margin-right:4px"></span>Pendente</span>
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#ffcbac;margin-right:4px"></span>Em andamento</span>
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#6ee9e0;margin-right:4px"></span>Concluída</span>
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#ffb4ab;margin-right:4px"></span>Atrasada</span>
            ${hojeDentro ? '<span><span style="display:inline-block;width:1px;height:8px;background:#fff;margin-right:4px"></span>Hoje</span>' : ''}
          </div>
          ${ganttHtml}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#252a32">
            <th style="padding:8px 10px;text-align:left;font-size:10px;color:#869391;text-transform:uppercase">Etapa</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;color:#869391;text-transform:uppercase">Início</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;color:#869391;text-transform:uppercase">Fim</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;color:#869391;text-transform:uppercase">Situação</th>
          </tr></thead>
          <tbody>${linhasTabela}</tbody>
        </table>`}
      </div>`
}
