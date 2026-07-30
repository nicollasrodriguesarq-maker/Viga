'use client'
import { useEffect, useState, Fragment } from 'react'
import MobileShell from '../components/MobileShell'
import { obterMinhasPermissoesApp, temAcessoModuloApp } from '../../lib/permissoes'

const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': 'Bearer ' + ANON }

async function buscar(tabela: string, q = '') {
  try { const r = await fetch(BASE + '/' + tabela + q, { headers: H }); const d = await r.json(); return Array.isArray(d) ? d : [] } catch { return [] }
}

const fmt = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtN = (v: number) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const STATUS_ORC: Record<string, string> = { rascunho: 'Rascunho', enviado: 'Enviado', aprovado: 'Aprovado', reprovado: 'Reprovado', expirado: 'Expirado' }
// Ordem = sequência real de execução de obra (usada para ordenar/agrupar itens e etapas).
const CATEGORIAS = ['Serviços Preliminares', 'Demolição e Remoção', 'Terraplanagem e Fundação', 'Estrutura', 'Alvenaria', 'Cobertura', 'Impermeabilização', 'Instalações Elétricas', 'Instalações Hidráulicas', 'Instalações de Gás', 'Instalações de Incêndio', 'Climatização (AC)', 'Revestimento de Parede', 'Revestimento de Piso', 'Forro', 'Esquadrias', 'Vidraçaria', 'Serralheria', 'Marmoraria', 'Louças e Metais', 'Marcenaria', 'Pintura', 'Mobiliário', 'Paisagismo', 'Limpeza Pós-Obra', 'Outros']

function ordemCategoria(categoria: string | null | undefined) {
  const idx = CATEGORIAS.indexOf(categoria || '')
  return idx === -1 ? CATEGORIAS.length : idx
}
function ordenarPorCategoria(itensList: any[]) {
  return [...itensList].sort((a, b) => ordemCategoria(a.categoria) - ordemCategoria(b.categoria))
}
function calcularValorUnitario(precoMaterial: number, precoMaoObra: number, lucroPct: number, impostoPct: number) {
  return (precoMaterial + precoMaoObra) * (1 + (lucroPct || 0) / 100) * (1 + (impostoPct || 0) / 100)
}
function calcularTotalItem(item: any) {
  const valorUnit = calcularValorUnitario(parseFloat(item.preco_material || 0), parseFloat(item.preco_mao_obra || 0), parseFloat(item.lucro_percentual || 0), parseFloat(item.imposto_percentual || 0))
  return valorUnit * parseFloat(item.quantidade || 1)
}
function valoresProposta(item: any) {
  const qtd = parseFloat(item.quantidade || 1)
  const mult = (1 + (parseFloat(item.lucro_percentual || 0)) / 100) * (1 + (parseFloat(item.imposto_percentual || 0)) / 100)
  return { material: parseFloat(item.preco_material || 0) * qtd * mult, maoObra: parseFloat(item.preco_mao_obra || 0) * qtd * mult }
}

const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-lg text-on-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary transition-all placeholder:text-on-surface-variant/50'
const labelCls = 'text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide block mb-1.5'
const btnPrimaryCls = 'bg-primary text-on-primary rounded-lg px-4 py-3 text-sm font-bold hover:opacity-90 transition-all cursor-pointer w-full'
const btnSecondaryCls = 'bg-surface-container-low border border-outline-variant text-on-surface-variant rounded-lg px-4 py-3 text-sm cursor-pointer w-full'

// Botão flutuante injetado em todo PDF gerado pelo app — sem ele o usuário fica preso na
// tela do PDF sem como voltar, já que o app roda como PWA instalado (sem barra do navegador).
function botaoVoltarApp(path: string) {
  return `<div class="voltar-app" style="position:fixed;top:12px;left:12px;z-index:99999">
    <a href="${path}" style="display:inline-flex;align-items:center;gap:6px;background:#1B3A5C;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:13px;font-weight:700;padding:10px 18px;border-radius:24px;box-shadow:0 2px 10px rgba(0,0,0,.3)">← Voltar ao App</a>
  </div>
  <style>@media print { .voltar-app { display:none !important } }</style>`
}

export default function OrcamentoMobile() {
  const [orcamentos, setOrcamentos] = useState<any[]>([])
  const [ambientes, setAmbientes] = useState<any[]>([])
  const [itens, setItens] = useState<any[]>([])
  const [bancoItens, setBancoItens] = useState<any[]>([])
  const [obras, setObras] = useState<any[]>([])
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [detalhe, setDetalhe] = useState<any>(null)
  const [ambienteAberto, setAmbienteAberto] = useState<string | null>(null)
  const [mostrarRegimeProposta, setMostrarRegimeProposta] = useState(false)
  const [regimeProposta, setRegimeProposta] = useState('seg_sex')

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('viga_token')) { window.location.href = '/'; return }
    obterMinhasPermissoesApp().then(perm => { if (!temAcessoModuloApp(perm, 'orcamento')) window.location.href = '/m' })
    carregar()
  }, [])

  async function carregar() {
    const [o, a, i, b, ob] = await Promise.all([
      buscar('orcamentos', '?order=created_at.desc'),
      buscar('orcamento_ambientes', '?order=ordem'),
      buscar('orcamento_itens', '?order=created_at'),
      buscar('banco_itens', '?order=nome'),
      buscar('obras', '?select=id,nome,dias_trabalho&order=nome'),
    ])
    setOrcamentos(o); setAmbientes(a); setItens(i); setBancoItens(b); setObras(ob)
  }

  function tempoExecucaoItem(item: any): number {
    const bi = item.banco_item_id ? bancoItens.find(b => b.id === item.banco_item_id) : null
    const valorBanco = bi?.tempo_execucao ? parseFloat(bi.tempo_execucao) : 0
    const valorProprio = item.tempo_execucao ? parseFloat(item.tempo_execucao) : 0
    const valor = valorBanco > 0 ? valorBanco : valorProprio
    const unidade = valorBanco > 0 ? bi?.tempo_execucao_unidade : item.tempo_execucao_unidade
    const dias = unidade === 'horas' ? valor / 8 : valor
    return dias > 0 ? dias : 1
  }
  function diaValido(d: Date, pattern: string): boolean {
    const dow = d.getDay()
    if (pattern === 'todos_dias') return true
    if (pattern === 'seg_sab') return dow >= 1 && dow <= 6
    return dow >= 1 && dow <= 5
  }
  function proximoDiaUtil(d: Date, pattern: string): Date {
    const nd = new Date(d)
    while (!diaValido(nd, pattern)) nd.setDate(nd.getDate() + 1)
    return nd
  }
  function somarDiasUteis(inicio: Date, dias: number, pattern: string): Date {
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

  function abrirRegimeProposta(orc: any) {
    const obraVinculada = obras.find(o => o.id === orc.obra_id)
    setRegimeProposta(obraVinculada?.dias_trabalho || 'seg_sex')
    setMostrarRegimeProposta(true)
  }

  // ═══ Proposta Completa (Inverso) — mesmo padrão visual de app/orcamento/page.tsx ═══
  function paginaCapaInversa(tituloProjeto: string, subtitulo: string, cliente: string, local: string, dataStr: string, validadeDias: number, cfg: any, origin: string) {
    return `
    <div class="page" style="background:#1A1A1A;color:#fff;display:flex">
      <div style="width:55%;padding:60px 56px;display:flex;flex-direction:column;justify-content:center">
        ${cfg.logo_url ? `<img src="${cfg.logo_url}" style="width:110px;height:110px;object-fit:contain;background:#DEDBD6;border-radius:4px;padding:16px;margin-bottom:28px" />` : `<div style="width:110px;height:110px;background:#DEDBD6;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#1A1A1A;font-weight:900;font-family:Cambria,serif;margin-bottom:28px">${(cfg.nome_empresa||'INVERSO').toUpperCase()}</div>`}
        <div style="border-top:1px solid #555;width:280px;margin-bottom:14px"></div>
        <div style="font-size:11px;letter-spacing:0.2em;color:#999;margin-bottom:10px">PROPOSTA COMERCIAL</div>
        <div style="font-family:Cambria,Georgia,serif;font-style:italic;font-weight:700;font-size:42px;line-height:1.1;margin-bottom:14px">${tituloProjeto}</div>
        <div style="font-size:16px;color:#ccc;margin-bottom:32px">${subtitulo}</div>
        <table style="font-size:12px;border-collapse:collapse">
          <tr><td style="color:#999;letter-spacing:0.1em;padding:5px 24px 5px 0;vertical-align:top">CLIENTE</td><td style="font-weight:700;padding:5px 0">${cliente}</td></tr>
          <tr><td style="color:#999;letter-spacing:0.1em;padding:5px 24px 5px 0;vertical-align:top">LOCAL</td><td style="font-weight:700;padding:5px 0">${local || '—'}</td></tr>
          <tr><td style="color:#999;letter-spacing:0.1em;padding:5px 24px 5px 0;vertical-align:top">DATA</td><td style="font-weight:700;padding:5px 0">${dataStr}</td></tr>
          <tr><td style="color:#999;letter-spacing:0.1em;padding:5px 24px 5px 0;vertical-align:top">VALIDADE</td><td style="font-weight:700;padding:5px 0">${validadeDias} dias</td></tr>
        </table>
      </div>
      <div style="width:45%;position:relative;background:#2a2a2a">
        <img src="${origin}/proposta/capa.jpg" style="width:100%;height:100%;object-fit:cover;display:block;opacity:0.9" />
        <div style="position:absolute;left:24px;bottom:24px;right:24px;font-family:Cambria,Georgia,serif;font-style:italic;color:#fff;font-size:13px;text-align:right;text-shadow:0 2px 8px rgba(0,0,0,0.7)">Construindo mais do que edifícios —<br/>construindo legados duradouros.</div>
      </div>
    </div>`
  }

  function paginaHistoriaInversa(cfg: any) {
    const areas = ['Residencial', 'Comercial', 'Varejo', 'Projetos', 'Regularização', 'Gestão de Obra']
    const cards = [
      ['MISSÃO', 'Viabilizar a construção para todos os públicos com qualidade e economia.'],
      ['VISÃO', 'Ser referência nacional, trazendo excelência em projetos e obras.'],
      ['VALORES', 'Transparência, Criatividade, Comprometimento e Ética.'],
      ['OBJETIVOS', 'Consolidar e quebrar paradigmas no setor de Projetos e Obras.'],
    ]
    return `
    <div class="page" style="background:#fff;display:flex;flex-direction:column">
      <div style="background:#1A1A1A;color:#fff;padding:14px 40px;font-weight:700;letter-spacing:0.05em">${(cfg.nome_empresa||'INVERSO').toUpperCase()}</div>
      <div style="flex:1;display:flex">
        <div style="width:62%;padding:40px 44px">
          <div style="font-size:11px;letter-spacing:0.15em;color:#888;margin-bottom:6px">QUEM SOMOS</div>
          <div style="font-family:Cambria,Georgia,serif;font-weight:700;font-size:32px;color:#1A1A1A;margin-bottom:6px">Nossa História</div>
          <div style="width:48px;border-top:3px solid #1A1A1A;margin-bottom:18px"></div>
          <p style="color:#444;line-height:1.7;margin-bottom:14px;font-size:13px">Somos uma empresa líder em Projetos e Construção, destacando-nos por oferecer excelência na gestão de obras e na elaboração de projetos inovadores. Com sede estratégica em São Paulo, a ${cfg.nome_empresa||'Inverso'} atende a todo o território brasileiro.</p>
          <p style="color:#444;line-height:1.7;margin-bottom:22px;font-size:13px">Nossas práticas se fundamentam nos princípios inabaláveis do Custo × Benefício, Comprometimento e Design Inovador — garantindo que cada projeto ultrapasse as expectativas e proporcione resultados duradouros.</p>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
            ${cards.map(([t, d]) => `
              <div style="background:#F5F4F1;border-radius:4px;padding:14px 12px">
                <div style="font-size:9px;letter-spacing:0.1em;color:#999;border-bottom:1px solid #DEDBD6;padding-bottom:8px;margin-bottom:8px">${t}</div>
                <div style="font-size:11px;color:#333;line-height:1.4">${d}</div>
              </div>`).join('')}
          </div>
        </div>
        <div style="width:38%;background:#1A1A1A;color:#fff;padding:40px 32px">
          <div style="font-size:10px;letter-spacing:0.15em;color:#999;border-bottom:1px solid #444;padding-bottom:10px;margin-bottom:18px">ÁREAS DE ATUAÇÃO</div>
          ${areas.map(a => `<div style="border-left:3px solid #fff;padding:8px 0 8px 14px;margin-bottom:14px;font-size:14px">${a}</div>`).join('')}
        </div>
      </div>
      <div style="background:#ECEAE5;color:#666;font-size:10px;padding:10px 40px;text-align:right">${[cfg.emails_gerais, cfg.telefone, cfg.site].filter(Boolean).join(' | ')}</div>
    </div>`
  }

  function paginaDivisorPortfolio(cfg: any) {
    return `
    <div class="page" style="background:#1A1A1A;color:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 64px;position:relative">
      <div style="font-family:Cambria,Georgia,serif;font-weight:700;font-size:48px;line-height:1.15;text-transform:uppercase">PROJETOS<br/>REALIZADOS</div>
      <div style="font-family:Cambria,Georgia,serif;font-style:italic;color:#999;margin-top:24px;font-size:14px">Cada projeto é uma oportunidade única de inovação e excelência.</div>
      <div style="position:absolute;left:32px;bottom:24px;font-weight:700;letter-spacing:0.05em">${(cfg.nome_empresa||'INVERSO').toUpperCase()}</div>
    </div>`
  }

  function paginaPortfolioItem(categoria: string, titulo: string, descricao: string, tags: string[], fotos: string[], origin: string, cfg: any) {
    const foto = (src: string) => `<div style="flex:1;height:100%;background:#171c23"><img src="${origin}${src}" style="width:100%;height:100%;object-fit:cover;display:block" /></div>`
    return `
    <div class="page" style="background:#F5F4F1;display:flex;flex-direction:column">
      <div style="background:#1A1A1A;color:#fff;padding:14px 40px;display:flex;justify-content:space-between;font-weight:700;letter-spacing:0.05em">
        <span>${(cfg.nome_empresa||'INVERSO').toUpperCase()}</span><span style="color:#999;font-size:11px;letter-spacing:0.15em">PORTFÓLIO</span>
      </div>
      <div style="display:flex;height:250px">${fotos.map(foto).join('')}</div>
      <div style="padding:28px 40px;flex:1">
        <div style="font-size:11px;letter-spacing:0.15em;color:#888;margin-bottom:8px">${categoria}</div>
        <div style="font-family:Cambria,Georgia,serif;font-style:italic;font-weight:700;font-size:30px;color:#1A1A1A;margin-bottom:12px">${titulo}</div>
        <p style="color:#444;line-height:1.7;font-size:13px;max-width:640px">${descricao}</p>
        <div style="display:flex;gap:10px;margin-top:20px">
          ${tags.map(t => `<div style="background:#1A1A1A;color:#fff;font-weight:700;font-size:12px;padding:10px 18px;border-radius:4px">${t}</div>`).join('')}
        </div>
      </div>
    </div>`
  }

  function paginasPortfolioInverso(origin: string, cfg: any) {
    return paginaPortfolioItem('COMERCIAL / CORPORATIVO', 'Makmo Infraestrutura',
      'Reforma e implantação de infraestrutura do escritório corporativo Makmo. O projeto contemplou layout de open space, divisórias em vidro, painéis de madeira, iluminação linear e área de recepção. Ambiente projetado para estimular a colaboração e produtividade, com acabamentos premium e identidade visual integrada.',
      ['Open Space', 'Painéis de Madeira', 'Infraestrutura'],
      ['/proposta/makmo-1.jpg', '/proposta/makmo-2.jpg', '/proposta/makmo-3.jpg', '/proposta/makmo-4.jpg', '/proposta/makmo-5.jpg', '/proposta/makmo-6.jpg'], origin, cfg) +
      paginaPortfolioItem('RESIDENCIAL / CONSTRUÇÃO', 'Apartamento Sabará',
      'Projeto de interiores completo com imagens 3D fotorrealistas. Conceito contemporâneo com madeira, neutros quentes e iluminação cuidadosamente projetada. Ambientes integrados e personalizados para máximo conforto e funcionalidade.',
      ['Projeto Arq.', 'Interiores', 'Imagens 3D'],
      ['/proposta/sabara-1.jpg', '/proposta/sabara-2.jpg', '/proposta/sabara-3.jpg'], origin, cfg) +
      paginaPortfolioItem('RESIDENCIAL / CONSTRUÇÃO', 'Residência Aclimação',
      'Construção residencial completa no bairro Aclimação. Piso em parquet de taco, banheiros com revestimento premium, cozinha integrada e acabamentos de alto padrão. A obra foi gerenciada do início ao fim com controle de prazos e qualidade, entregando um resultado sofisticado e funcional.',
      ['Construção', 'House Flipping', 'Reforma'],
      ['/proposta/aclimacao-1.jpg', '/proposta/aclimacao-2.jpg', '/proposta/aclimacao-3.jpg', '/proposta/aclimacao-4.jpg', '/proposta/aclimacao-5.jpg', '/proposta/aclimacao-6.jpg'], origin, cfg) +
      paginaPortfolioItem('RESIDENCIAL / CONSTRUÇÃO', 'Cobertura Marajoara',
      'Reforma e projeto de interiores de cobertura com terraço gourmet. Teto de madeira, cozinha integrada com adega embutida, piso de concreto e vista panorâmica da cidade.',
      ['Projeto', 'Construção', 'Reforma'],
      ['/proposta/marajoara-1.jpg', '/proposta/marajoara-2.jpg', '/proposta/marajoara-3.jpg', '/proposta/marajoara-4.jpg'], origin, cfg)
  }

  function paginaInvestimentoInverso(itensOrc: any[], codigo: string, cfg: any) {
    const rows = itensOrc.map((item, idx) => {
      const categoriaAtual = item.categoria || 'Outros'
      const categoriaAnterior = idx > 0 ? (itensOrc[idx - 1].categoria || 'Outros') : null
      const headerCategoria = categoriaAtual !== categoriaAnterior
        ? `<tr style="break-inside:avoid"><td colspan="5" style="padding:8px 16px;background:#F5F4F1;color:#1A1A1A;font-weight:700;font-size:11px;letter-spacing:0.05em;text-transform:uppercase">${categoriaAtual}</td></tr>`
        : ''
      return `${headerCategoria}
      <tr style="break-inside:avoid">
        <td style="padding:12px 16px;border-bottom:1px solid #333;color:#eee">${item.servico}${item.descricao ? `<br/><span style="color:#999;font-size:11px">${item.descricao}</span>` : ''}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #333;text-align:center;color:#ccc">${item.unidade}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #333;text-align:center;color:#ccc">${fmtN(parseFloat(item.quantidade || 1))}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #333;text-align:right;color:#ccc">${fmt(calcularValorUnitario(parseFloat(item.preco_material||0), parseFloat(item.preco_mao_obra||0), parseFloat(item.lucro_percentual||0), parseFloat(item.imposto_percentual||0)))}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #333;text-align:right;font-weight:700;color:#fff">${fmt(calcularTotalItem(item))}</td>
      </tr>`
    }).join('')
    const totalGeral = itensOrc.reduce((a, i) => a + calcularTotalItem(i), 0)
    return `
    <div class="page-flow" style="background:#1A1A1A;color:#fff;padding:36px 40px">
      <div style="display:flex;justify-content:space-between;font-weight:700;letter-spacing:0.05em;border-bottom:1px solid #333;padding-bottom:14px;margin-bottom:22px">
        <span>${(cfg.nome_empresa||'INVERSO').toUpperCase()}</span><span style="color:#999;font-size:11px;letter-spacing:0.15em">INVESTIMENTO</span>
      </div>
      <div style="font-size:11px;letter-spacing:0.15em;color:#999;margin-bottom:6px">ORÇAMENTO DETALHADO</div>
      <div style="font-family:Cambria,Georgia,serif;font-style:italic;font-weight:700;font-size:32px;margin-bottom:6px">Investimento</div>
      <div style="width:48px;border-top:3px solid #fff;margin-bottom:22px"></div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#F5F4F1;color:#1A1A1A">
          <th style="padding:10px 16px;text-align:left">Descrição do Serviço</th>
          <th style="padding:10px 16px;text-align:center">Unid.</th>
          <th style="padding:10px 16px;text-align:center">Qtd.</th>
          <th style="padding:10px 16px;text-align:right">Valor Unit.</th>
          <th style="padding:10px 16px;text-align:right">Total</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="5" style="padding:24px;text-align:center;color:#999">Nenhum item cadastrado ainda.</td></tr>`}</tbody>
      </table>
      <div style="display:flex;justify-content:flex-end;margin-top:18px;break-inside:avoid">
        <div style="background:#fff;color:#1A1A1A;padding:14px 28px;display:flex;align-items:center;gap:18px">
          <span style="font-size:12px;letter-spacing:0.1em;color:#666">TOTAL GERAL</span>
          <span style="font-family:Cambria,Georgia,serif;font-weight:700;font-size:22px">${fmt(totalGeral)}</span>
        </div>
      </div>
    </div>`
  }

  function paginaCondicoesInverso(prazoDias: number, condicaoPagamento: string, validadeDias: number, cfg: any) {
    return `
    <div class="page" style="background:#fff;display:flex;flex-direction:column">
      <div style="background:#1A1A1A;color:#fff;padding:14px 40px;display:flex;justify-content:space-between;font-weight:700;letter-spacing:0.05em">
        <span>${(cfg.nome_empresa||'INVERSO').toUpperCase()}</span><span style="color:#999;font-size:11px;letter-spacing:0.15em">CONDIÇÕES COMERCIAIS</span>
      </div>
      <div style="padding:36px 40px;flex:1">
        <div style="font-size:11px;letter-spacing:0.15em;color:#888;margin-bottom:6px">PRAZOS E PAGAMENTO</div>
        <div style="font-family:Cambria,Georgia,serif;font-weight:700;font-size:32px;color:#1A1A1A;margin-bottom:6px">Condições Comerciais</div>
        <div style="width:48px;border-top:3px solid #1A1A1A;margin-bottom:22px"></div>
        <div style="display:flex;gap:16px">
          <div style="flex:1;background:#F5F4F1;border-radius:4px;padding:22px 24px">
            <div style="font-size:10px;letter-spacing:0.1em;color:#888;border-bottom:1px solid #DEDBD6;padding-bottom:10px;margin-bottom:16px">PRAZO DE ENTREGA</div>
            <div style="color:#333;font-size:13px;margin-bottom:10px">Execução dos serviços descritos nesta proposta</div>
            <div style="font-family:Cambria,Georgia,serif;font-weight:700;font-size:20px;color:#1A1A1A">${prazoDias} dia${prazoDias === 1 ? '' : 's'} corrido${prazoDias === 1 ? '' : 's'}<br/>(após o briefing)</div>
          </div>
          <div style="flex:1;background:#1A1A1A;color:#fff;border-radius:4px;padding:22px 24px">
            <div style="font-size:10px;letter-spacing:0.1em;color:#999;border-bottom:1px solid #444;padding-bottom:10px;margin-bottom:16px">FORMAS DE PAGAMENTO</div>
            ${condicaoPagamento ? `<div style="font-size:13px;color:#eee;white-space:pre-line;line-height:1.7">${condicaoPagamento}</div>` : `<div style="font-size:13px;color:#777;font-style:italic">A combinar — preencha em "Forma de Pagamento" no orçamento.</div>`}
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:26px">
          <div style="background:#1A1A1A;color:#fff;font-weight:700;font-size:12px;padding:12px 20px;border-radius:4px">✦ Validade desta proposta: ${validadeDias} dias</div>
          <div style="font-size:11px;color:#888;font-style:italic;max-width:420px;text-align:right">* Quaisquer serviços não descritos nesta proposta deverão ser acordados separadamente.</div>
        </div>
      </div>
    </div>`
  }

  function paginaFechamentoInverso(cfg: any) {
    return `
    <div class="page" style="background:#1A1A1A;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 40px">
      <div style="font-family:Cambria,Georgia,serif;font-style:italic;font-weight:700;font-size:38px;line-height:1.25;margin-bottom:28px">Bora começar a<br/>projetar esse sonho?</div>
      <div style="width:340px;border-top:1px solid #555;margin-bottom:22px"></div>
      <div style="font-weight:700;font-size:14px;margin-bottom:12px">${cfg.emails_gerais || ''}</div>
      <div style="color:#999;font-size:13px;margin-bottom:8px">${cfg.telefone || ''}</div>
      <div style="color:#999;font-size:13px;margin-bottom:32px">${cfg.site || ''}</div>
      <div style="color:#666;font-size:11px">${(cfg.nome_empresa||'INVERSO').toUpperCase()} STUDIO ${cfg.cnpj ? '| CNPJ: ' + cfg.cnpj : ''}</div>
    </div>`
  }

  function envolverPropostaInversa(titulo: string, paginas: string) {
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>${titulo}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:Calibri,'Segoe UI',Arial,sans-serif; }
      @page { size: A4 landscape; margin:0; }
      .page { width:297mm; height:210mm; overflow:hidden; }
      .page-flow { width:297mm; min-height:210mm; }
      @media print {
        body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .page { break-after:page; }
        .page:last-child { break-after:auto; }
        .page-flow { break-before:page; break-after:page; }
        .page-flow:last-child { break-after:auto; }
      }
    </style></head><body>
    ${botaoVoltarApp('/m/orcamento')}
    ${paginas}
    <script>window.onload = () => { window.print() }</script>
    </body></html>`
  }

  // Reaproveita as mesmas páginas de levantamento (estilo escuro do sistema) já usadas em
  // app/levantamento/page.tsx — inseridas como um encarte entre o portfólio e o orçamento.
  function paginasLevantamentoEncarte(lev: any, ambs: any[], itensList: any[], cfg: any) {
    const nomeAmbiente = (ambienteId: string) => ambs.find((a: any) => a.id === ambienteId)?.nome || '—'
    const itensHtml = itensList.map((item: any, i: number) => `
      <div style="display:flex;gap:20px;margin-bottom:20px;break-inside:avoid;padding-bottom:20px;border-bottom:1px solid #333">
        <div style="width:38%;aspect-ratio:1;border-radius:6px;overflow:hidden;background:#171c23;flex-shrink:0;position:relative">
          <div style="position:absolute;top:10px;left:10px;width:24px;height:24px;border-radius:999px;background:#fff;color:#1A1A1A;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">${i + 1}</div>
          ${item.foto_url ? `<img src="${item.foto_url}" style="width:100%;height:100%;object-fit:cover;display:block" />` : ''}
        </div>
        <div style="flex:1">
          <h3 style="font-size:15px;color:#eee;margin-bottom:4px">${item.servico || ''}</h3>
          <p style="font-size:10px;letter-spacing:0.08em;color:#999;text-transform:uppercase;font-weight:700;margin-bottom:8px">${nomeAmbiente(item.ambiente)}</p>
          ${item.descricao ? `<p style="font-size:11px;color:#bbb;font-style:italic">"${item.descricao}"</p>` : ''}
        </div>
      </div>`).join('')
    return `
    <div class="page-flow" style="background:#0f141b;color:#dee2ec;padding:36px 40px">
      <div style="display:flex;justify-content:space-between;margin-bottom:20px;border-bottom:1px solid #3d4948;padding-bottom:10px">
        <span style="font-size:11px;color:#6ee9e0;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Levantamento Técnico — ${lev.codigo}</span>
        <span style="font-size:10px;color:#869391">${(cfg.nome_empresa||'INVERSO').toUpperCase()}</span>
      </div>
      ${itensList.length > 0 ? itensHtml : '<p style="color:#869391;text-align:center;padding:40px 0">Nenhum item de levantamento registrado.</p>'}
    </div>`
  }

  async function gerarPropostaCompleta() {
    if (!detalhe) return
    const cfg = (await buscar('empresa_config', '?limit=1'))[0] || {}
    const itensDoOrc = ordenarPorCategoria(itens.filter(i => i.orcamento_id === detalhe.id))
    const origin = window.location.origin

    let paginasLev = ''
    if (detalhe.levantamento_id) {
      const [levRows, ambsLev, itensLev] = await Promise.all([
        buscar('levantamentos', '?id=eq.' + detalhe.levantamento_id),
        buscar('levantamento_ambientes', '?levantamento_id=eq.' + detalhe.levantamento_id),
        buscar('levantamento_itens', '?levantamento_id=eq.' + detalhe.levantamento_id),
      ])
      if (levRows[0]) paginasLev = paginasLevantamentoEncarte(levRows[0], ambsLev, itensLev, cfg)
    }

    const totalDiasUteis = Math.max(1, Math.round(itensDoOrc.reduce((a, i) => a + tempoExecucaoItem(i), 0)))
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const inicioValido = proximoDiaUtil(hoje, regimeProposta)
    const fimPrazo = somarDiasUteis(hoje, totalDiasUteis, regimeProposta)
    const prazoDias = Math.round((fimPrazo.getTime() - inicioValido.getTime()) / 86400000) + 1
    const obraNome = obras.find(o => o.id === detalhe.obra_id)?.nome

    const paginas =
      paginaCapaInversa(obraNome || detalhe.cliente_nome, detalhe.tipo_execucao === 'projeto' ? 'Projeto' : 'Proposta de Obra', detalhe.cliente_nome, detalhe.endereco, new Date().toLocaleDateString('pt-BR'), parseInt(detalhe.validade_dias || '30'), cfg, origin) +
      paginaHistoriaInversa(cfg) +
      paginaDivisorPortfolio(cfg) +
      paginasPortfolioInverso(origin, cfg) +
      paginasLev +
      paginaInvestimentoInverso(itensDoOrc, detalhe.codigo, cfg) +
      paginaCondicoesInverso(prazoDias, detalhe.condicao_pagamento, parseInt(detalhe.validade_dias || '30'), cfg) +
      paginaFechamentoInverso(cfg)

    const html = envolverPropostaInversa(`Proposta ${detalhe.codigo} — ${cfg.nome_empresa || 'Inverso'}`, paginas)
    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  const filtrados = orcamentos.filter(o => {
    if (filtro !== 'todos' && o.status !== filtro) return false
    if (!busca) return true
    return [o.cliente_nome, o.codigo, o.endereco].some(v => v?.toLowerCase().includes(busca.toLowerCase()))
  })

  function gerarPDF(orc: any) {
    const ambsOrc = ambientes.filter(a => a.orcamento_id === orc.id).sort((a, b) => a.ordem - b.ordem)
    const itensDoOrc = itens.filter(i => i.orcamento_id === orc.id)
    const totalMat = itensDoOrc.reduce((a, i) => a + valoresProposta(i).material, 0)
    const totalMao = itensDoOrc.reduce((a, i) => a + valoresProposta(i).maoObra, 0)
    const totalGeral = itensDoOrc.reduce((a, i) => a + calcularTotalItem(i), 0)
    const descontoPct = parseFloat(orc.desconto_percentual || 0)
    const desconto = totalGeral * descontoPct / 100
    const totalFinal = totalGeral - desconto

    const ambContent = ambsOrc.map(amb => {
      const itensAmb = ordenarPorCategoria(itens.filter(i => i.ambiente_id === amb.id))
      if (itensAmb.length === 0) return ''
      const matAmb = itensAmb.reduce((a, i) => a + valoresProposta(i).material, 0)
      const maoAmb = itensAmb.reduce((a, i) => a + valoresProposta(i).maoObra, 0)
      const totalAmb = itensAmb.reduce((a, i) => a + calcularTotalItem(i), 0)
      const rows = itensAmb.map((item, idx) => {
        const { material: mat, maoObra: mao } = valoresProposta(item)
        const categoriaAtual = item.categoria || 'Outros'
        const categoriaAnterior = idx > 0 ? (itensAmb[idx - 1].categoria || 'Outros') : null
        const headerCategoria = categoriaAtual !== categoriaAnterior
          ? `<tr><td colspan="5" style="padding:6px 10px;background:#eef3f8;color:#1B3A5C;font-weight:700;font-size:11px;text-transform:uppercase">${categoriaAtual}</td></tr>`
          : ''
        return `${headerCategoria}<tr>
          <td style="padding:8px 10px;border-bottom:1px solid #eee">${item.servico}${item.descricao ? '<br><small style="color:#666">' + item.descricao + '</small>' : ''}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${fmtN(parseFloat(item.quantidade || 1))} ${item.unidade}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${fmt(mat)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${fmt(mao)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${fmt(calcularTotalItem(item))}</td>
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
                <td style="padding:8px 10px;text-align:right;font-weight:700;color:#1B3A5C">${fmt(totalAmb)}</td>
              </tr>
            </tfoot>
          </table>
        </div>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Proposta ${orc.codigo} — Inverso</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: Arial, sans-serif; color: #333; font-size: 13px; }
      @media print { body { -webkit-print-color-adjust: exact; } }
    </style></head><body>
    ${botaoVoltarApp('/m/orcamento')}
    <div style="max-width:800px;margin:0 auto;padding:40px 30px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #1B3A5C">
        <div>
          <div style="font-size:32px;font-weight:900;color:#1B3A5C;letter-spacing:-1px">INVERSO</div>
          <div style="font-size:12px;color:#666;margin-top:2px">Construção e Reforma</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:20px;font-weight:700;color:#1B3A5C">${orc.codigo}</div>
          <div style="font-size:12px;color:#666;margin-top:4px">Data: ${new Date().toLocaleDateString('pt-BR')}</div>
          <div style="font-size:12px;color:#666">Validade: ${orc.validade_dias || 30} dias</div>
        </div>
      </div>
      <div style="background:#f0f4f8;border-radius:8px;padding:16px 20px;margin-bottom:28px">
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Proposta para</div>
        <div style="font-size:18px;font-weight:700;color:#1B3A5C">${orc.cliente_nome}</div>
        ${orc.endereco ? '<div style="font-size:13px;color:#555;margin-top:4px">📍 ' + orc.endereco + '</div>' : ''}
      </div>
      <div style="margin-bottom:28px">${ambContent}</div>
      <div style="border:2px solid #1B3A5C;border-radius:8px;overflow:hidden;margin-bottom:24px">
        <div style="background:#1B3A5C;color:white;padding:12px 16px;font-weight:700;font-size:14px">Resumo Financeiro</div>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:10px 16px">Total Material</td><td style="padding:10px 16px;text-align:right;font-weight:600">${fmt(totalMat)}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding:10px 16px">Total Mão de Obra</td><td style="padding:10px 16px;text-align:right;font-weight:600">${fmt(totalMao)}</td></tr>
          ${desconto > 0 ? '<tr><td style="padding:10px 16px">Desconto (' + fmtN(descontoPct) + '%)</td><td style="padding:10px 16px;text-align:right;color:#e74c3c;font-weight:600">- ' + fmt(desconto) + '</td></tr>' : ''}
          <tr style="background:#1B3A5C;color:white">
            <td style="padding:14px 16px;font-size:16px;font-weight:700">TOTAL GERAL</td>
            <td style="padding:14px 16px;text-align:right;font-size:20px;font-weight:900">${fmt(totalFinal)}</td>
          </tr>
        </table>
      </div>
      ${orc.condicao_pagamento ? `<div style="margin-bottom:24px;padding:14px 16px;background:#f0f4f8;border-radius:8px">
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Forma de Pagamento</div>
        <div style="font-weight:600;color:#1B3A5C">${orc.condicao_pagamento}</div>
      </div>` : ''}
      ${orc.observacao ? `<div style="margin-bottom:24px;padding:14px 16px;border:1px solid #ddd;border-radius:8px">
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Observações</div>
        <div style="color:#555">${orc.observacao}</div>
      </div>` : ''}
      <div style="margin-top:32px;padding-top:20px;border-top:1px solid #ddd;text-align:center;color:#999;font-size:11px">
        <div>Esta proposta é válida por ${orc.validade_dias || 30} dias a partir da data de emissão.</div>
        <div style="margin-top:4px">INVERSO Construção e Reforma — contato@inversoconstrucao.com.br</div>
      </div>
    </div>
    <script>window.onload = () => { window.print() }</script>
    </body></html>`

    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  // ── Tela: Detalhe (somente leitura) ─────────────────────────────
  if (detalhe) {
    const ambsOrc = ambientes.filter(a => a.orcamento_id === detalhe.id).sort((a, b) => a.ordem - b.ordem)
    const itensOrc = itens.filter(i => i.orcamento_id === detalhe.id)
    const totalMat = itensOrc.reduce((a, i) => a + parseFloat(i.preco_material || 0) * parseFloat(i.quantidade || 1), 0)
    const totalMao = itensOrc.reduce((a, i) => a + parseFloat(i.preco_mao_obra || 0) * parseFloat(i.quantidade || 1), 0)
    const totalGeral = itensOrc.reduce((a, i) => a + calcularTotalItem(i), 0)
    const descontoPct = parseFloat(detalhe.desconto_percentual || 0)
    const desconto = totalGeral * descontoPct / 100
    const totalFinal = totalGeral - desconto

    return (
      <MobileShell title={detalhe.codigo}>
        <div className="p-4 flex flex-col gap-4 pb-8">
          <button className="text-primary text-sm font-semibold text-left" onClick={() => { setDetalhe(null); setAmbienteAberto(null) }}>← Voltar à lista</button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-on-surface-variant/10 text-on-surface-variant border-on-surface-variant/20">🔒 Somente leitura</span>
            </div>
            <div className="text-headline-sm font-headline text-on-surface">{detalhe.cliente_nome}</div>
            {detalhe.endereco && <div className="text-body-sm text-on-surface-variant">📍 {detalhe.endereco}</div>}
            <span className="text-[11px] font-semibold text-on-surface-variant uppercase">{STATUS_ORC[detalhe.status] || detalhe.status}</span>
          </div>

          <div className="flex gap-2">
            <button className={btnPrimaryCls} onClick={() => gerarPDF(detalhe)}>🖨️ Gerar Proposta PDF</button>
            <button className={btnSecondaryCls} onClick={() => abrirRegimeProposta(detalhe)}>📄 Proposta Completa</button>
          </div>

          {mostrarRegimeProposta && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-4" onClick={e => e.target === e.currentTarget && setMostrarRegimeProposta(false)}>
              <div className="bg-surface-container border border-outline-variant rounded-2xl p-6 w-full max-w-[420px]">
                <div className="text-base font-bold text-on-surface mb-1.5">📄 Gerar Proposta Completa</div>
                <div className="text-body-sm text-on-surface-variant mb-4">Cada obra roda em um ritmo diferente — escolha o regime de execução para calcular o prazo em dias corridos que vai na proposta.</div>
                <div className="mb-5">
                  <label className={labelCls}>Regime de Execução</label>
                  <select className={inputCls} value={regimeProposta} onChange={e => setRegimeProposta(e.target.value)}>
                    <option value="seg_sex">Segunda a Sexta</option>
                    <option value="seg_sab">Segunda a Sábado</option>
                    <option value="todos_dias">Todos os dias (dias corridos)</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button className={btnSecondaryCls + ' flex-1'} onClick={() => setMostrarRegimeProposta(false)}>Cancelar</button>
                  <button className={btnPrimaryCls + ' flex-1'} onClick={() => { setMostrarRegimeProposta(false); gerarPropostaCompleta() }}>Gerar</button>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            {([
              ['Total Material', fmt(totalMat), 'text-primary'],
              ['Total Mão de Obra', fmt(totalMao), 'text-secondary'],
              ['Desconto', fmt(desconto), 'text-error'],
              ['TOTAL FINAL', fmt(totalFinal), 'text-primary-container'],
            ] as [string, string, string][]).map(([l, v, c]) => (
              <div key={l} className="bg-surface-container-high border border-outline-variant rounded-lg p-3">
                <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1.5">{l}</div>
                <div className={`text-xs font-bold ${c}`}>{v}</div>
              </div>
            ))}
          </div>

          {ambsOrc.length === 0 ? (
            <div className="text-center py-8 text-on-surface-variant text-body-sm">Nenhum ambiente cadastrado</div>
          ) : ambsOrc.map(amb => {
            const itensAmb = ordenarPorCategoria(itens.filter(i => i.ambiente_id === amb.id))
            const totalAmb = itensAmb.reduce((a, i) => a + calcularTotalItem(i), 0)
            const aberto = ambienteAberto === amb.id
            return (
              <div key={amb.id} className="bg-surface-container border border-outline-variant rounded-xl overflow-hidden">
                <button className="w-full text-left px-4 py-3 flex justify-between items-center" onClick={() => setAmbienteAberto(aberto ? null : amb.id)}>
                  <div>
                    <div className="font-bold text-sm text-on-surface">🏠 {amb.nome}</div>
                    <div className="text-[11px] text-on-surface-variant">{itensAmb.length} item(ns) · {fmt(totalAmb)}</div>
                  </div>
                  <span className="text-[11px] text-on-surface-variant">{aberto ? '▲' : '▼'}</span>
                </button>
                {aberto && (
                  <div className="px-4 pb-4 flex flex-col gap-2">
                    {itensAmb.map((item, idx) => {
                      const categoriaAtual = item.categoria || 'Outros'
                      const categoriaAnterior = idx > 0 ? (itensAmb[idx - 1].categoria || 'Outros') : null
                      return (
                        <Fragment key={item.id}>
                          {categoriaAtual !== categoriaAnterior && (
                            <div className="text-[10px] font-bold text-primary uppercase tracking-wide mt-1 first:mt-0">{categoriaAtual}</div>
                          )}
                          <div className="border-t border-outline-variant pt-2.5 first:border-0 first:pt-0">
                            <div className="text-sm font-semibold text-on-surface">{item.servico}</div>
                            {item.descricao && <div className="text-[11px] text-on-surface-variant">{item.descricao}</div>}
                            <div className="flex justify-between text-[11px] mt-1">
                              <span className="text-on-surface-variant">{fmtN(parseFloat(item.quantidade || 1))} {item.unidade}</span>
                              <span className="font-bold text-primary">{fmt(calcularTotalItem(item))}</span>
                            </div>
                          </div>
                        </Fragment>
                      )
                    })}
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
    <MobileShell title="Orçamento">
      <div className="p-4 flex flex-col gap-3">
        <input className={inputCls} placeholder="Pesquisar por cliente, código ou endereço..." value={busca} onChange={e => setBusca(e.target.value)} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {['todos', ...Object.keys(STATUS_ORC)].map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${filtro === f ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-container text-on-surface-variant border-outline-variant'}`}>
              {f === 'todos' ? 'Todos' : STATUS_ORC[f]}
            </button>
          ))}
        </div>
        {filtrados.length === 0 ? (
          <div className="text-center py-10 text-on-surface-variant text-body-sm">Nenhum orçamento encontrado</div>
        ) : filtrados.map(o => (
          <button key={o.id} onClick={() => { setDetalhe(o); setAmbienteAberto(null) }}
            className="text-left bg-surface-container border border-outline-variant rounded-xl p-4">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="font-bold text-on-surface text-sm truncate">{o.cliente_nome}</div>
                <div className="text-[11px] text-on-surface-variant truncate">{o.codigo}{o.endereco ? ' · ' + o.endereco : ''}</div>
              </div>
              <span className="text-[10px] font-semibold text-on-surface-variant uppercase shrink-0">{STATUS_ORC[o.status] || o.status}</span>
            </div>
          </button>
        ))}
      </div>
    </MobileShell>
  )
}
