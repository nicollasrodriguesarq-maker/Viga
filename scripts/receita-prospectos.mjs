#!/usr/bin/env node
// Gera o CSV de "empresas novas" para a Prospecção a partir da base aberta da Receita Federal.
//
// Por que: empresa que abriu há poucas semanas (loja, clínica, escritório, restaurante) quase sempre
// precisa de reforma/adequação do ponto — é o melhor "sinal de compra" gratuito que existe. A base
// já traz telefone e e-mail do cadastro.
//
// Como usar (1x por mês, no computador):
//   1. Baixe os arquivos "Estabelecimentos0.zip" ... "Estabelecimentos9.zip" (pasta mais recente) em
//      https://dadosabertos.rfb.gov.br/CNPJ/dados_abertos_cnpj/  (cada um tem ~400 MB; baixe todos
//      ou só os que quiser — a capital de SP está espalhada entre eles).
//   2. node scripts/receita-prospectos.mjs <pasta-ou-arquivos...> [--dias 90] [--municipio 7107] [--saida empresas-novas.csv]
//      Ex.: node scripts/receita-prospectos.mjs C:\Downloads\receita --dias 90
//   3. No VIGA: CRM → Prospecção → "Importar planilha" → escolha o CSV gerado.
//
// Aceita .zip (precisa de `tar` — já vem no Windows 10+ — ou `unzip`) ou o arquivo já extraído.
// O arquivo é lido em fluxo (não carrega 400 MB na memória).
// Layout oficial (sem cabeçalho, separador ";", Latin-1): 0 CNPJ básico · 1 ordem · 2 DV · 4 nome fantasia ·
// 5 situação (02 = ativa) · 10 início da atividade (AAAAMMDD) · 11 CNAE principal · 13 tipo logradouro ·
// 14 logradouro · 15 número · 17 bairro · 18 CEP · 19 UF · 20 município (7107 = São Paulo) · 21/22 DDD/tel ·
// 27 e-mail. Se a Receita mudar o layout, ajuste os índices em COL abaixo.
import { createReadStream, readdirSync, statSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { join, extname } from 'node:path'

const COL = { basico: 0, ordem: 1, dv: 2, fantasia: 4, situacao: 5, inicio: 10, cnae: 11, tipoLog: 13, logradouro: 14, numero: 15, complemento: 16, bairro: 17, cep: 18, uf: 19, municipio: 20, ddd1: 21, tel1: 22, email: 27 }

// Atividades (prefixo do CNAE) que costumam precisar de obra para abrir/adequar o ponto → segmento do VIGA
const CNAES = [
  ['47', 'Comércio varejista (loja)', 'empresa'], ['5611', 'Restaurante/lanchonete', 'empresa'], ['5612', 'Bar/serviço de alimentação', 'empresa'],
  ['8630', 'Clínica/consultório', 'empresa'], ['8650', 'Atividades de saúde', 'empresa'], ['9602', 'Salão de beleza/estética', 'empresa'],
  ['9313', 'Academia', 'empresa'], ['8512', 'Educação infantil', 'empresa'], ['8513', 'Ensino', 'empresa'], ['6911', 'Escritório de advocacia', 'empresa'],
  ['7111', 'Arquitetura/engenharia', 'empresa'], ['6920', 'Contabilidade', 'empresa'], ['6821', 'Imobiliária', 'investidor'], ['6822', 'Imobiliária/administração', 'investidor'],
  ['5510', 'Hotel/pousada', 'empresa'], ['4511', 'Concessionária', 'empresa'], ['9609', 'Serviços pessoais', 'empresa'],
]

const args = process.argv.slice(2)
const opt = (nome, padrao) => { const i = args.indexOf('--' + nome); if (i < 0) return padrao; const v = args[i + 1]; args.splice(i, 2); return v }
const dias = Number(opt('dias', '90'))
const municipio = opt('municipio', '7107')
const saida = opt('saida', 'empresas-novas.csv')
const entradas = args
if (entradas.length === 0) { console.error('Uso: node scripts/receita-prospectos.mjs <pasta-ou-arquivos...> [--dias 90] [--municipio 7107] [--saida arquivo.csv]'); process.exit(1) }

function listar(caminho) {
  if (statSync(caminho).isDirectory()) return readdirSync(caminho).flatMap(f => listar(join(caminho, f))).filter(f => /estabele/i.test(f))
  return [caminho]
}
const arquivos = entradas.flatMap(listar)
if (arquivos.length === 0) { console.error('Nenhum arquivo "Estabelecimentos*" encontrado.'); process.exit(1) }

const limite = new Date(); limite.setDate(limite.getDate() - dias)
const limiteNum = Number(limite.toISOString().slice(0, 10).replace(/-/g, ''))

function abrir(caminho) {
  if (extname(caminho).toLowerCase() !== '.zip') return createReadStream(caminho)
  // bsdtar (Windows 10+/macOS) lê zip; em Linux costuma haver `unzip -p`
  const tentativa = spawn('tar', ['-xOf', caminho], { stdio: ['ignore', 'pipe', 'inherit'] })
  tentativa.on('error', () => console.error('Não foi possível rodar `tar`. Extraia o .zip e passe o arquivo extraído.'))
  return tentativa.stdout
}

const limpa = v => (v || '').replace(/^"|"$/g, '').trim()
const csv = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
const formatarTel = (ddd, tel) => { const d = (ddd || '').replace(/\D/g, ''), t = (tel || '').replace(/\D/g, ''); return d && t ? `(${d}) ${t.length === 9 ? t.slice(0, 5) + '-' + t.slice(5) : t.slice(0, 4) + '-' + t.slice(4)}` : '' }

const linhasSaida = [['nome', 'telefone', 'email', 'cnpj', 'endereco', 'bairro', 'cidade', 'data de abertura', 'gatilho', 'segmento']]
let lidas = 0, ativas = 0
for (const arq of arquivos) {
  console.error('Lendo', arq)
  const rl = createInterface({ input: abrir(arq).setEncoding('latin1'), crlfDelay: Infinity })
  for await (const bruto of rl) {
    lidas++
    const c = bruto.split(';').map(limpa)
    if (c[COL.situacao] !== '02' || c[COL.municipio] !== municipio) continue
    const inicio = Number(c[COL.inicio])
    if (!(inicio >= limiteNum)) continue
    const cnae = c[COL.cnae] || ''
    const regra = CNAES.find(([p]) => cnae.startsWith(p))
    if (!regra) continue
    const tel = formatarTel(c[COL.ddd1], c[COL.tel1]), email = (c[COL.email] || '').toLowerCase()
    if (!tel && !email) continue // sem como abordar não serve
    ativas++
    const cnpj = c[COL.basico] + c[COL.ordem] + c[COL.dv]
    const nome = c[COL.fantasia] || `Empresa CNPJ ${cnpj}`
    const end = [c[COL.tipoLog], c[COL.logradouro], c[COL.numero]].filter(Boolean).join(' ')
    const data = String(inicio)
    linhasSaida.push([nome, tel, email, cnpj, end, c[COL.bairro], 'São Paulo', `${data.slice(6, 8)}/${data.slice(4, 6)}/${data.slice(0, 4)}`, `Abriu em ${data.slice(6, 8)}/${data.slice(4, 6)}/${data.slice(0, 4)} — ${regra[1]}`, regra[2]])
  }
}
writeFileSync(saida, '\uFEFF' + linhasSaida.map(l => l.map(csv).join(';')).join('\r\n'), 'utf8')
console.error(`Pronto: ${lidas.toLocaleString('pt-BR')} linhas lidas, ${ativas} empresas novas com contato → ${saida}`)
