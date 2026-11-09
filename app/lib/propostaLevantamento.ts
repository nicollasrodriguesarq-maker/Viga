// Páginas do levantamento dentro da Proposta Completa (encarte entre o portfólio e o orçamento).
//
// Layout compacto: duas fotos lado a lado (menores), com o serviço, o ambiente e a descrição embaixo de cada uma —
// em A4 paisagem cabem 4 fotos por página, em vez de uma abaixo da outra. O relatório do levantamento (separado da
// proposta) continua com o layout próprio.
const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Largura em pixels da foto na página (≈ 9 cm). Em `data-max` vai o tamanho máximo que vale a pena embutir no PDF
// (≈ 300 dpi nesse tamanho): fica nítido no papel e o arquivo fica bem mais leve.
const LARGURA_FOTO = 350
const MAX_PX_PDF = 1100

export function paginasLevantamentoEncarte(lev: any, ambs: any[], itensList: any[], cfg: any): string {
  const nomeAmbiente = (ambienteId: string) => ambs.find((a: any) => a.id === ambienteId)?.nome || '—'
  const cartoes = itensList.map((item: any, i: number) => `
      <div style="break-inside:avoid;page-break-inside:avoid;display:flex;flex-direction:column;align-items:center">
        <div style="width:${LARGURA_FOTO}px">
          <div style="position:relative;width:100%;aspect-ratio:4/3;border-radius:6px;overflow:hidden;background:#171c23">
            <div style="position:absolute;top:8px;left:8px;z-index:1;width:22px;height:22px;border-radius:999px;background:#fff;color:#1A1A1A;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px">${i + 1}</div>
            ${item.foto_url
              ? `<img src="${esc(item.foto_url)}" data-max="${MAX_PX_PDF}" style="width:100%;height:100%;object-fit:cover;display:block" />`
              : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#5d6b69;font-size:11px">sem foto</div>'}
          </div>
          <h3 style="font-size:13px;color:#eee;margin:8px 0 2px;line-height:1.25">${esc(item.servico)}</h3>
          <p style="font-size:9px;letter-spacing:0.08em;color:#999;text-transform:uppercase;font-weight:700;margin-bottom:4px">${esc(nomeAmbiente(item.ambiente))}</p>
          ${item.descricao ? `<p style="font-size:10.5px;line-height:1.35;color:#bbb;font-style:italic">“${esc(item.descricao)}”</p>` : ''}
        </div>
      </div>`).join('')
  return `
    <div class="page-flow" style="background:#0f141b;color:#dee2ec;padding:30px 40px">
      <div style="display:flex;justify-content:space-between;margin-bottom:18px;border-bottom:1px solid #3d4948;padding-bottom:10px">
        <span style="font-size:11px;color:#6ee9e0;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Levantamento Técnico — ${esc(lev.codigo)}</span>
        <span style="font-size:10px;color:#869391">${esc((cfg.nome_empresa || 'INVERSO').toUpperCase())}</span>
      </div>
      ${itensList.length > 0
        ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:22px 28px">${cartoes}</div>`
        : '<p style="color:#869391;text-align:center;padding:40px 0">Nenhum item de levantamento registrado.</p>'}
    </div>`
}
