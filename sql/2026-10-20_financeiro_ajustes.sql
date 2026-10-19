-- ════════════════════════════════════════════════════════════════════════════════════════
-- VIGA — Financeiro: data de pagamento, faturas de cartão, investimentos ligados ao lançamento
-- Rodar ANTES de publicar o código novo do Financeiro (é só aditivo: não apaga nada).
-- Supabase → SQL Editor → colar tudo → Run.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- 1. Data em que o lançamento foi efetivamente pago/recebido (posiciona o lançamento no mês e no saldo)
alter table public.lancamentos add column if not exists data_pagamento date;

-- Lançamentos já pagos: usam a própria data. Exceção: pagamentos de medição, cuja "data" é o dia em que
-- o lançamento foi criado (não o do pagamento) — para esses vale a data de vencimento/pagamento programada.
update public.lancamentos
   set data_pagamento = case when categoria = 'Medição de obra' and data_vencimento is not null then data_vencimento else data end
 where status = 'pago' and data_pagamento is null;

-- 2. Compra no cartão passa a pertencer a um pagamento de fatura (que vira UMA saída na conta)
alter table public.gastos_cartao
  add column if not exists fatura_lancamento_id uuid references public.lancamentos(id) on delete set null;
create index if not exists gastos_cartao_fatura_idx on public.gastos_cartao(fatura_lancamento_id);

-- 3. Aporte/resgate de investimento é um lançamento (mexe na conta) com espelho em Investimentos
alter table public.investimentos
  add column if not exists lancamento_id uuid references public.lancamentos(id) on delete cascade;
create index if not exists investimentos_lancamento_idx on public.investimentos(lancamento_id);

-- Liga os movimentos que já existem ao lançamento correspondente (mesmo valor, data e descrição)
update public.investimentos i
   set lancamento_id = l.id
  from public.lancamentos l
 where i.lancamento_id is null
   and l.categoria in ('Investimento (aporte)', 'Resgate de investimento')
   and l.valor::numeric = i.valor::numeric
   and l.data = i.data
   and l.descricao = i.descricao
   and not exists (select 1 from public.investimentos i2 where i2.lancamento_id = l.id);

-- 4. Valores com mais de 2 casas (ex.: 28807.257999999994 numa medição) → centavos
update public.lancamentos   set valor = round(valor::numeric, 2) where valor is not null and valor::numeric <> round(valor::numeric, 2);
update public.gastos_cartao set valor = round(valor::numeric, 2) where valor is not null and valor::numeric <> round(valor::numeric, 2);
