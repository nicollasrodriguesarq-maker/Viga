#!/usr/bin/env node
// Alivia as fotos JÁ guardadas no Supabase (levantamento e relatórios de visita): redimensiona para no máximo
// 2048 px no lado maior e regrava em JPEG de alta qualidade (90%), respeitando a orientação. O endereço (URL) da foto
// NÃO muda, então levantamentos, relatórios e portal do cliente continuam mostrando as mesmas fotos — só mais leves.
//
// Segurança:
//   • Por padrão só SIMULA (não altera nada) e mostra quanto espaço seria liberado.
//   • Para aplicar é obrigatório informar uma pasta de backup: os originais são salvos nela ANTES de serem trocados.
//   • Fotos que já são leves (< 700 KB) ou que não ficam pelo menos 15% menores são ignoradas.
//
// Uso (na pasta do projeto, com .env.local preenchido):
//   node scripts/otimizar-fotos.mjs                              → simula tudo
//   node scripts/otimizar-fotos.mjs --amostra 10                 → simula só 10 fotos (rápido)
//   node scripts/otimizar-fotos.mjs --aplicar --backup C:\backup-fotos   → troca de verdade (guardando os originais)
//   opções: --bucket levantamento-fotos | relatorio-visita-fotos   (padrão: os dois)
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import sharp from 'sharp'

const args = process.argv.slice(2)
const flag = n => args.includes('--' + n)
const valor = n => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined }
const aplicar = flag('aplicar')
const backup = valor('backup')
const amostra = valor('amostra') ? Number(valor('amostra')) : Infinity
const buckets = valor('bucket') ? [valor('bucket')] : ['levantamento-fotos', 'relatorio-visita-fotos']
if (aplicar && !backup) { console.error('Para aplicar, informe a pasta de backup: --backup <pasta>'); process.exit(1) }

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL, CHAVE = env.SUPABASE_SECRET_KEY
if (!URL_BASE || !CHAVE) { console.error('Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY no .env.local'); process.exit(1) }
const H = { apikey: CHAVE, Authorization: 'Bearer ' + CHAVE }
const MB = n => (n / 1048576).toFixed(2) + ' MB'
const LIMITE_LEVE = 700 * 1024

async function listar(bucket) {
  const saida = []
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${URL_BASE}/storage/v1/object/list/${bucket}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 1000, offset: off, sortBy: { column: 'name', order: 'asc' } }) })
    const l = await r.json()
    if (!Array.isArray(l) || !l.length) break
    for (const o of l) if (o.metadata?.size) saida.push({ nome: o.name, tamanho: o.metadata.size })
    if (l.length < 1000) break
  }
  return saida
}

let antes = 0, depois = 0, trocadas = 0, ignoradas = 0, falhas = 0, vistas = 0
for (const bucket of buckets) {
  const arquivos = (await listar(bucket)).filter(a => /\.jpe?g$/i.test(a.nome) && a.tamanho > LIMITE_LEVE).sort((a, b) => b.tamanho - a.tamanho)
  console.log(`\n${bucket}: ${arquivos.length} foto(s) pesada(s) (${MB(arquivos.reduce((s, a) => s + a.tamanho, 0))})`)
  for (const a of arquivos) {
    if (vistas >= amostra) break
    vistas++
    try {
      const r = await fetch(`${URL_BASE}/storage/v1/object/${bucket}/${encodeURIComponent(a.nome)}`, { headers: H })
      if (!r.ok) throw new Error('download ' + r.status)
      const original = Buffer.from(await r.arrayBuffer())
      const novo = await sharp(original).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer()
      if (novo.length > original.length * 0.85) { ignoradas++; continue }
      antes += original.length; depois += novo.length
      console.log(`  ${a.nome.slice(0, 40).padEnd(40)} ${MB(original.length).padStart(9)} → ${MB(novo.length).padStart(9)}  (-${Math.round((1 - novo.length / original.length) * 100)}%)`)
      if (aplicar) {
        const destino = join(backup, bucket, a.nome)
        mkdirSync(dirname(destino), { recursive: true }); writeFileSync(destino, original) // 1º o backup
        const up = await fetch(`${URL_BASE}/storage/v1/object/${bucket}/${encodeURIComponent(a.nome)}`, { method: 'POST', headers: { ...H, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: novo })
        if (!up.ok) throw new Error('envio ' + up.status + ' ' + (await up.text()).slice(0, 80))
        trocadas++
      }
    } catch (e) { falhas++; console.log(`  ${a.nome}: falhou (${e.message})`) }
  }
}
console.log(`\n${aplicar ? 'APLICADO' : 'SIMULAÇÃO'}: ${antes ? MB(antes) + ' → ' + MB(depois) + ` (libera ${MB(antes - depois)}, -${Math.round((1 - depois / antes) * 100)}%)` : 'nada a otimizar'} | ${aplicar ? trocadas + ' trocada(s)' : ''} ${ignoradas} ignorada(s) | ${falhas} falha(s)`)
if (!aplicar) console.log('Nada foi alterado. Para trocar de verdade: --aplicar --backup <pasta>')
