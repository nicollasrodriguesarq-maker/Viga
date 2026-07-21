# VIGA — Contexto Completo do Projeto para Claude Code

## PAPEL
Você é o desenvolvedor principal do sistema VIGA. Você conhece toda a arquitetura, decisões técnicas, bugs já resolvidos e estado atual do projeto. Sempre entregue arquivos completos e revisados — nunca parciais ou especulativos. Antes de entregar qualquer arquivo, confirme que parênteses e chaves estão balanceados.

---

## IDENTIDADE DO PROJETO

**Sistema:** VIGA — Sistema de Gestão Integrada para Construção Civil  
**Empresa:** Inverso Construção (diretor: Nicollas Rodrigues)  
**Objetivo:** Uso interno primeiro, depois SaaS  
**Projeto local:** `C:\Users\nicol\viga`  
**Rodar:** `cd C:\Users\nicol\viga && npm run dev` → acessa em `localhost:3000`

---

## STACK TÉCNICA

- **Frontend:** Next.js (Node v24), TypeScript, React
- **Banco:** Supabase (REST API direto — sem SDK)
- **Deploy:** Vercel
- **IDE:** VS Code

### Padrão de chamadas ao banco
```typescript
const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cGp0b2VxbHR6bG5wbGlqbnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTE4MzIsImV4cCI6MjA5NTIyNzgzMn0.gPSHIeM_dFQ_dmR1Ui1GSDLTVkFny2LDe2YtASapgPQ'
const H = { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': 'Bearer ' + ANON }

// GET
const r = await fetch(BASE + '/tabela?order=created_at.desc', { headers: H })
const data = await r.json() // sempre Array.isArray antes de usar

// POST
const r = await fetch(BASE + '/tabela', {
  method: 'POST',
  headers: { ...H, 'Prefer': 'return=representation' },
  body: JSON.stringify(dados)
})
const novo = await r.json() // retorna array — pegar [0]

// PATCH
await fetch(BASE + '/tabela?id=eq.' + id, {
  method: 'PATCH', headers: H, body: JSON.stringify(dados)
})

// DELETE
await fetch(BASE + '/tabela?id=eq.' + id, { method: 'DELETE', headers: H })
```

### RLS
Todas as tabelas têm `allow_all` policy:
```sql
create policy "allow_all" on tabela for all using (true) with check (true);
```

---

## DESIGN SYSTEM

```
Fundo principal:    #0D1117
Cards/Sections:     #161B22
Inputs/campos:      #1E2530
Bordas:             #2A3441
Texto principal:    #E6EDF3
Texto secundário:   #8B949E
Texto inativo:      #484F58

Cor primária:       #4ECDC4  (teal)
Verde/positivo:     #6BCB77
Vermelho/negativo:  #FF6B6B
Amarelo/alerta:     #FFD93D
Roxo/investimento:  #A78BFA

Fonte: system-ui, sans-serif
```

---

## ESTRUTURA DE PASTAS

```
C:\Users\nicol\viga\
├── app\
│   ├── page.tsx                  ← Dashboard + Login
│   ├── layout.tsx                ← RootLayout com suppressHydrationWarning
│   ├── financeiro\page.tsx       ← Módulo Financeiro
│   ├── obras\page.tsx            ← Módulo Obras & Projetos
│   ├── levantamento\page.tsx     ← Módulo Levantamento Técnico
│   ├── orcamento\page.tsx        ← Módulo Orçamento & Propostas
│   ├── globals.css
│   └── lib\supabase.ts
```

**Atenção:** rotas sem acento. A pasta é `orcamento` (sem cedilha), não `orçamento`.

---

## AUTENTICAÇÃO

- Login via fetch direto ao endpoint Supabase: `POST /auth/v1/token?grant_type=password`
- Token salvo em `localStorage` com chaves `viga_token` e `viga_email`
- Cada página verifica: `if (!localStorage.getItem('viga_token')) { window.location.href = '/'; return }`
- Layout: `app/layout.tsx` tem `suppressHydrationWarning` no `<html>` e `<body>` para evitar conflito com extensões do navegador (1Password)

---

## BANCO DE DADOS — TABELAS E COLUNAS

### Tabelas existentes

```sql
-- OBRAS
obras (id, codigo, nome, tipo, cliente, endereco, responsavel, status, 
       data_inicio, data_previsao, valor_contrato, descricao, created_at)
-- status: captacao | em_execucao | pausada | concluida | cancelada

-- LANÇAMENTOS FINANCEIROS
lancamentos (id, data, descricao, tipo, valor, categoria, conta, status, 
             data_vencimento, obra_id, servico_id, nf_numero, nf_url, created_at)
-- tipo: entrada | saida
-- status: pago | pendente

-- CONTAS BANCÁRIAS
contas (id, nome, banco, tipo, saldo_inicial, created_at)

-- CARTÕES
cartoes (id, nome, bandeira, limite, dia_fechamento, dia_vencimento, created_at)

-- GASTOS CARTÃO
gastos_cartao (id, data, descricao, valor, categoria, cartao_id, parcelas, 
               obra_id, servico_id, nf_numero, nf_url, created_at)

-- SERVIÇOS POR OBRA
obra_servicos (id, obra_id, nome, valor_previsto, valor_realizado, 
               status, observacao, created_at)
-- status: pendente | em_execucao | concluido | cancelado

-- LEVANTAMENTOS
levantamentos (id, codigo, obra_id, cliente, endereco, status, responsavel, 
               created_at, cliente_id, cliente_nome, observacao)
-- ⚠️ coluna original é 'cliente' (não cliente_nome!)
-- status: em_andamento | concluido | cancelado

-- AMBIENTES DO LEVANTAMENTO
levantamento_ambientes (id, levantamento_id, nome, ordem, created_at)

-- ITENS DO LEVANTAMENTO
levantamento_itens (id, ambiente_id, levantamento_id, servico, descricao,
                    comprimento, largura, altura, area, unidade, observacao, created_at)

-- CLIENTES
clientes (id, nome, email, telefone, cpf_cnpj, endereco, tipo, observacao, created_at)

-- BANCO DE ITENS (preços reutilizáveis)
banco_itens (id, nome, unidade, preco_material, preco_mao_obra, categoria, created_at)

-- ORÇAMENTOS
orcamentos (id, codigo, levantamento_id, cliente_nome, endereco, status, 
            validade_dias, observacao, condicao_pagamento, desconto,
            total_material, total_mao_obra, total_geral, created_at)
-- status: rascunho | enviado | aprovado | reprovado | expirado

-- AMBIENTES DO ORÇAMENTO
orcamento_ambientes (id, orcamento_id, nome, ordem, created_at)

-- ITENS DO ORÇAMENTO
orcamento_itens (id, orcamento_id, ambiente_id, banco_item_id, servico, descricao,
                 quantidade, unidade, preco_material, preco_mao_obra, total_item, created_at)

-- INVESTIMENTOS
investimentos (id, descricao, tipo, valor, data, instituicao, observacao, created_at)
-- tipo: aporte | resgate
```

---

## MÓDULOS — O QUE CADA UM FAZ

### 📊 Dashboard (`app/page.tsx`)
- Tela de login + dashboard principal
- Cards com dados reais: obras ativas, saldo, receitas, obras recentes
- Saudação dinâmica por hora
- Menu de navegação para todos os módulos

### 💰 Financeiro (`app/financeiro/page.tsx`)
**Abas:** Visão Geral | Lançamentos | Por Obra | Contas | Cartões | Agenda Pagamentos | Investimentos

- **Extrato bancário:** saldo anterior (meses anteriores) + entradas - saídas = saldo final
- **Saldo acumulado:** saldoBase + todas entradas pagas - todas saídas pagas
- **NF:** número da nota + upload de arquivo (bucket `notas-fiscais` no Supabase Storage)
- **Vincular serviço:** ao selecionar obra, aparece dropdown dos serviços daquela obra (servico_id)
- **Exportar Excel:** CSV com todos lançamentos do mês
- **Editar lançamento:** botão ✏️ abre modal preenchido
- **Agenda:** atrasados 🔴, vencendo em 7 dias ⚠️, todos do mês
- **Investimentos:** aportes (saída da conta → investimento) e resgates (volta pra conta)
- **Categorias especiais de saída:** "Investimento (aporte)" e "Resgate de investimento"

### 🏗️ Obras (`app/obras/page.tsx`)
- Lista de obras com filtros por status e busca
- Detalhe: cards financeiros (contrato, receitas, custos, margem, previsto serviços, gasto serviços)
- Barras de progresso: consumo do contrato + margem + orçamento serviços
- **Aba Serviços:** previsto vs realizado por categoria com cálculo automático dos lançamentos vinculados (servico_id)
- **Aba Lançamentos:** todos os lançamentos da obra
- **Aba Cartão:** gastos de cartão vinculados à obra

### 📐 Levantamento (`app/levantamento/page.tsx`)
- Código automático: LEV-2026-001
- Por ambiente (16 ambientes comuns + personalizado)
- Dentro de cada ambiente: serviços com medidas (C × L = área automática), unidade, observações técnicas
- Botão **"📋 Gerar Orçamento"** → cria orçamento importando todos ambientes e itens
- Após criar → navega automaticamente para a tela de preenchimento

### 💼 Orçamento (`app/orcamento/page.tsx`)
- Código automático: ORC-2026-001
- Por ambiente, material + mão de obra separados
- **Banco de Itens:** salva automaticamente cada serviço novo; busca para reutilizar
- Preview do total ao preencher valores
- Desconto editável diretamente nos totais
- Forma de pagamento e observações na aba Configurações
- **Gerar Proposta PDF:** abre nova aba com HTML formatado, tabela por ambiente, resumo financeiro
- Após criar → navega automaticamente para a tela de preenchimento

---

## BUGS CRÍTICOS JÁ RESOLVIDOS — NÃO REPETIR

### 🔴 CRÍTICOS (causam travamento silencioso)

1. **`const URL`** é palavra reservada do JavaScript/browser → usar `BASE`, `SUPA_URL`, `ANON_URL` etc.
2. **`const modal`** como variável de estilo CSS conflita com `useState` que usa `setModal('modal')` → renomear para `modalStyle` ou `overlayStyle`
3. **`'use client'` deve estar na linha 1** do arquivo, absolutamente sem nada antes
4. **`const fetch`** é palavra reservada → nunca usar como nome de variável

### 🟡 IMPORTANTES

5. **`setDetalhe()` deve ser chamado após criar** um registro novo, com fallback por código:
```typescript
const novo = await criar('tabela', dados)
await carregarDados() // primeiro recarrega
if (novo?.id) {
  setDetalhe(novo)
} else {
  // Fallback: busca pelo código
  const encontrado = lista.find(x => x.codigo === codigo)
  if (encontrado) setDetalhe(encontrado)
}
```

6. **Tabela `levantamentos`** usa coluna `cliente` (não `cliente_nome`) — a coluna original foi criada assim
7. **`layout.tsx`** deve ter `suppressHydrationWarning` no `<html>` e `<body>`
8. **Extensão 1Password** injeta `cz-shortcut-listen="true"` no body → o `suppressHydrationWarning` resolve

### 🟠 ARQUITETURA

9. **Não usar SDK do Supabase** — somente fetch direto com headers `apikey` + `Authorization Bearer`
10. **RLS deve ser `allow_all`** com `using (true) with check (true)` em todas as tabelas
11. **Rotas sem acento:** pasta `orcamento` (não `orçamento`), `levantamento` (sem acento já está correto)
12. **Validação de arquivos:** sempre verificar parênteses e chaves balanceados antes de entregar
13. **`create table if not exists`** em todo SQL para evitar erros de conflito

---

## PADRÃO DE CÓDIGO

### Template de página
```typescript
'use client'
import { useState, useEffect } from 'react'

const BASE = 'https://vupjtoeqltzlnplijnzr.supabase.co/rest/v1'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
const H = { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': 'Bearer ' + ANON }

async function buscar(tabela: string, q = '') {
  try {
    const r = await fetch(BASE + '/' + tabela + q, { headers: H })
    const d = await r.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

async function criar(tabela: string, dados: object) {
  try {
    const r = await fetch(BASE + '/' + tabela, {
      method: 'POST', headers: { ...H, 'Prefer': 'return=representation' },
      body: JSON.stringify(dados)
    })
    const d = await r.json()
    return Array.isArray(d) ? d[0] : d
  } catch { return null }
}

export default function NomePagina() {
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    if (!localStorage.getItem('viga_token')) { window.location.href = '/'; return }
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    // fetch data...
    setLoading(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0D1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#4ECDC4', fontSize: 18 }}>Carregando...</div>
    </div>
  )

  return <div>...</div>
}
```

### Estilos padrão (inline)
```typescript
// Nunca usar classes do Tailwind pois o projeto usa inline styles
const ip: React.CSSProperties = { 
  background: '#1E2530', border: '1px solid #2A3441', borderRadius: 8, 
  color: '#E6EDF3', padding: '10px 14px', fontSize: 13, outline: 'none', 
  width: '100%', boxSizing: 'border-box', fontFamily: 'system-ui' 
}
const bt: React.CSSProperties = { 
  background: '#4ECDC4', color: '#0D1117', border: 'none', 
  borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 700 
}
```

---

## PRÓXIMOS MÓDULOS PLANEJADOS

Estes módulos estão no menu como "Em breve":
- **Suprimentos** — controle de materiais e fornecedores
- **CRM** — pipeline de captação de clientes
- **Equipes & Tarefas** — gestão de equipe e cronograma
- **Agenda** — calendário de obras e compromissos

---

## COMO PEDIR COISAS AO CLAUDE CODE

### Para correções
> "Corrija o bug em `app/obras/page.tsx` onde [descreva o problema]. Analise o arquivo, identifique a causa raiz, corrija e entregue o arquivo completo validado."

### Para novas features
> "Adicione [funcionalidade] ao módulo [nome]. O arquivo fica em `app/[modulo]/page.tsx`. Entregue o arquivo completo com a feature integrada, sintaxe verificada e balanceamento de parênteses/chaves confirmado."

### Para novo SQL
> "Preciso criar a tabela [nome] com as colunas [lista]. Gere o SQL usando `create table if not exists` e inclua o RLS `allow_all`."

### Para deploy
> "O projeto está em `C:\Users\nicol\viga`. Ajude a fazer o deploy no Vercel conectando ao repositório GitHub."

---

## ESTADO ATUAL DO SISTEMA (Julho 2026)

✅ Login e autenticação funcionando  
✅ Dashboard com dados reais  
✅ Financeiro completo (extrato, NF, edição, agenda, investimentos)  
✅ Obras com serviços e comparativo previsto vs realizado  
✅ Levantamento técnico por ambiente  
✅ Orçamento com banco de itens e geração de PDF  
✅ Integração levantamento → orçamento → obra  
✅ Lançamentos vinculados a obras e serviços (servico_id)  
⏳ Deploy em produção (próximo passo)  
⏳ Melhorias de design com Stitch  
⏳ Módulos: Suprimentos, CRM, Equipes, Agenda  
