// Imagens leves sem perder qualidade visível — no envio das fotos e na geração dos PDFs.
//
// • Envio: foto de celular (3–6 MB, 4000 px) é redimensionada para no máximo 2048 px no lado maior e salva em JPEG
//   de alta qualidade (90%) — em geral 300–700 KB. A orientação (EXIF) é respeitada. PDFs e outros arquivos não são
//   tocados; imagem pequena que já é leve é enviada como está; se a versão otimizada não ficar menor, vale a original.
// • PDF: as imagens do relatório são trazidas, reduzidas para 1600 px (≈ 225 dpi numa foto de 17 cm — nítido no papel)
//   e embutidas no documento. O resultado é guardado em memória, então gerar de novo é imediato.
const MAX_ENVIO = 2048
const QUALIDADE_ENVIO = 0.9
const MAX_PDF = 1600
const QUALIDADE_PDF = 0.86
const LEVE_BYTES = 450 * 1024

async function decodificar(blob: Blob): Promise<{ fonte: CanvasImageSource; w: number; h: number; liberar: () => void } | null> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' } as any)
      return { fonte: bmp, w: bmp.width, h: bmp.height, liberar: () => bmp.close?.() }
    }
  } catch { /* tenta pelo elemento <img> */ }
  try {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((ok, erro) => { img.onload = () => ok(); img.onerror = () => erro(new Error('decode')); img.src = url })
    return { fonte: img, w: img.naturalWidth, h: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) }
  } catch { return null }
}

// PNG com transparência (logo, desenho) precisa continuar PNG; o resto vira JPEG.
function temTransparencia(fonte: CanvasImageSource, w: number, h: number): boolean {
  try {
    const lado = 48
    const c = document.createElement('canvas'); c.width = lado; c.height = Math.max(1, Math.round(lado * h / w))
    const ctx = c.getContext('2d'); if (!ctx) return false
    ctx.drawImage(fonte, 0, 0, c.width, c.height)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true
  } catch { /* se não der para ler, mantém PNG por segurança */ return true }
  return false
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string, qualidade?: number): Promise<Blob | null> {
  return new Promise(ok => canvas.toBlob(b => ok(b), tipo, qualidade))
}

async function reduzir(blob: Blob, maxLado: number, qualidade: number): Promise<{ blob: Blob; w: number; h: number; mudou: boolean } | null> {
  if (typeof document === 'undefined') return null
  const dec = await decodificar(blob)
  if (!dec) return null
  try {
    const escala = Math.min(1, maxLado / Math.max(dec.w, dec.h))
    const w = Math.max(1, Math.round(dec.w * escala)), h = Math.max(1, Math.round(dec.h * escala))
    const alfa = blob.type === 'image/png' && temTransparencia(dec.fonte, dec.w, dec.h)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const ctx = c.getContext('2d'); if (!ctx) return null
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
    if (!alfa) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h) }
    ctx.drawImage(dec.fonte, 0, 0, w, h)
    const novo = await paraBlob(c, alfa ? 'image/png' : 'image/jpeg', alfa ? undefined : qualidade)
    c.width = 0; c.height = 0
    if (!novo) return null
    return { blob: novo, w, h, mudou: true }
  } finally { dec.liberar() }
}

const TIPOS_REDUZIVEIS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

// Devolve o arquivo a enviar: a versão otimizada (se ficar menor) ou o próprio arquivo. Nunca lança erro.
export async function otimizarImagemParaUpload(file: File, maxLado = MAX_ENVIO): Promise<File> {
  try {
    const tipo = (file.type || '').toLowerCase()
    if (!TIPOS_REDUZIVEIS.includes(tipo)) return file // PDF, planilha, SVG, GIF...: intactos
    const dec = await decodificar(file)
    if (!dec) return file
    const { w, h } = dec; dec.liberar()
    if (Math.max(w, h) <= maxLado && file.size <= LEVE_BYTES) return file // já está leve
    const r = await reduzir(file, maxLado, QUALIDADE_ENVIO)
    if (!r || r.blob.size >= file.size * 0.95) return file // não compensa
    const base = file.name.replace(/\.[^.]+$/, '') || 'foto'
    return new File([r.blob], `${base}.${r.blob.type === 'image/png' ? 'png' : 'jpg'}`, { type: r.blob.type, lastModified: Date.now() })
  } catch { return file }
}

// ── Imagens dentro dos PDFs ──────────────────────────────────────────────────────
const cachePdf = new Map<string, Promise<string>>() // url → data URL otimizada ('' = manter a original)
const lerComoDataUrl = (b: Blob) => new Promise<string>((ok, erro) => { const l = new FileReader(); l.onload = () => ok(String(l.result)); l.onerror = () => erro(l.error); l.readAsDataURL(b) })

async function prepararParaPdf(url: string): Promise<string> {
  const r = await fetch(url)
  if (!r.ok) return ''
  const blob = await r.blob()
  if (!TIPOS_REDUZIVEIS.includes((blob.type || '').toLowerCase())) return ''
  const dec = await decodificar(blob)
  if (!dec) return await lerComoDataUrl(blob)
  const { w, h } = dec; dec.liberar()
  if (Math.max(w, h) <= MAX_PDF && blob.size <= LEVE_BYTES) return await lerComoDataUrl(blob) // já leve: só embute
  const red = await reduzir(blob, MAX_PDF, QUALIDADE_PDF)
  return await lerComoDataUrl(red && red.blob.size < blob.size ? red.blob : blob)
}

function imagemParaPdf(url: string): Promise<string> {
  let p = cachePdf.get(url)
  if (!p) { p = prepararParaPdf(url).catch(() => ''); cachePdf.set(url, p) }
  return p
}

const RE_IMG = /(<img\b[^>]*?\bsrc=)(["'])([^"']+)\2/gi
const RE_FUNDO = /url\((["']?)([^"')]+)\1\)/gi
const ehImagemRemota = (u: string) => /^(https?:)?\/\//i.test(u) || u.startsWith('/')
// só imagens de verdade (nada de fontes/CSS/SVG) e que ainda não estejam embutidas
const naoEhEmbutida = (u: string) => !u.startsWith('data:') && !u.startsWith('blob:') && /\.(jpe?g|png|webp|heic|heif)(\?|$)|\/storage\/v1\/object\//i.test(u)

// Troca as imagens do HTML (<img src> e fundos url(...)) pelas versões otimizadas. Falhou? Mantém a original.
export async function otimizarImagensDoHtml(html: string, aoProgredir?: (feitas: number, total: number) => void): Promise<string> {
  const urls = new Set<string>()
  for (const m of html.matchAll(RE_IMG)) if (ehImagemRemota(m[3]) && naoEhEmbutida(m[3])) urls.add(m[3])
  for (const m of html.matchAll(RE_FUNDO)) if (ehImagemRemota(m[2]) && naoEhEmbutida(m[2])) urls.add(m[2])
  const lista = [...urls]
  const resolvidas = new Map<string, string>()
  let feitas = 0
  const fila = [...lista]
  const trabalhador = async () => {
    for (let u = fila.shift(); u !== undefined; u = fila.shift()) {
      const abs = u.startsWith('//') ? 'https:' + u : u
      resolvidas.set(u, await imagemParaPdf(abs))
      aoProgredir?.(++feitas, lista.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, lista.length) }, trabalhador))
  const troca = (u: string) => resolvidas.get(u) || u
  return html
    .replace(RE_IMG, (_t, pre, asp, u) => `${pre}${asp}${troca(u)}${asp}`)
    .replace(RE_FUNDO, (t, asp, u) => (resolvidas.get(u) ? `url(${asp}${resolvidas.get(u)}${asp})` : t))
}

// Abre o relatório na janela já aberta: mostra "preparando", otimiza as imagens e só então escreve o documento.
export async function escreverRelatorio(win: Window, html: string): Promise<void> {
  const escrever = (conteudo: string) => { win.document.open(); win.document.write(conteudo); win.document.close() }
  try {
    const temImagens = /<img\b|url\(/i.test(html)
    if (temImagens) {
      win.document.open()
      win.document.write('<!doctype html><meta charset="utf-8"><title>Preparando...</title><body style="margin:0;background:#0f141b;color:#bcc9c7;font:15px system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><div id="msg">Preparando o documento...</div></body>')
      win.document.close()
    }
    const pronto = temImagens ? await otimizarImagensDoHtml(html, (f, t) => { const el = win.document.getElementById('msg'); if (el) el.textContent = `Otimizando imagens ${f}/${t}...` }) : html
    escrever(pronto)
  } catch {
    escrever(html) // qualquer falha: gera do jeito antigo, sem otimizar
  }
}
