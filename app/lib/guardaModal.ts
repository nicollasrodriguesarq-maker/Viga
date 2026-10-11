// Correção global: janelas (modais) que fechavam sozinhas ao selecionar texto.
//
// Todas as janelas do app têm um fundo escuro (classe "inset-0") que fecha a janela quando
// recebe um clique direto. Só que, ao selecionar um texto de um campo arrastando o mouse e
// soltar o botão FORA da janela (em cima do fundo), o navegador dispara um "click" no
// elemento comum aos dois pontos — o próprio fundo — e a janela fechava, perdendo o que
// estava sendo digitado.
//
// Aqui, em um único ponto: se o clique "no fundo" começou (mousedown) ou terminou (mouseup)
// em outro elemento, ele é descartado antes de chegar nas janelas. Cliques normais no fundo
// (apertar e soltar nele mesmo) continuam fechando como antes.
declare global { interface Window { __vigaGuardaModal?: boolean } }

export function instalarGuardaModal() {
  if (typeof window === 'undefined' || window.__vigaGuardaModal) return
  window.__vigaGuardaModal = true
  let alvoPressionado: EventTarget | null = null
  let alvoSolto: EventTarget | null = null

  document.addEventListener('mousedown', e => { alvoPressionado = e.target; alvoSolto = null }, true)
  document.addEventListener('mouseup', e => { alvoSolto = e.target }, true)
  document.addEventListener('touchstart', e => { alvoPressionado = e.target; alvoSolto = null }, { capture: true, passive: true })
  document.addEventListener('touchend', e => { alvoSolto = e.target }, { capture: true, passive: true })
  // teclado (Enter/Espaço em um botão) gera click sem mouse: não pode herdar o estado anterior
  document.addEventListener('keydown', () => { alvoPressionado = null; alvoSolto = null }, true)

  document.addEventListener('click', e => {
    const alvo = e.target as HTMLElement | null
    const ehFundoDeJanela = !!alvo && alvo.classList?.contains('inset-0')
    if (ehFundoDeJanela && alvoPressionado !== null && (alvoPressionado !== alvo || (alvoSolto !== null && alvoSolto !== alvo))) {
      e.stopPropagation()
      e.preventDefault()
    }
    alvoPressionado = null
    alvoSolto = null
  }, true)
}
