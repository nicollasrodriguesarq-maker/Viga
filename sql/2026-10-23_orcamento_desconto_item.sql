-- ════════════════════════════════════════════════════════════════════════════════════════
-- VIGA — Orçamentos: desconto por item (sem mexer na matriz de preços)
-- Só adiciona campos; os itens existentes ficam sem desconto. Supabase → SQL Editor → colar tudo → Run.
-- ════════════════════════════════════════════════════════════════════════════════════════

alter table public.orcamento_itens
  add column if not exists desconto_item_tipo text not null default 'percentual',
  add column if not exists desconto_item_valor numeric not null default 0,
  add column if not exists desconto_item_motivo text;

alter table public.orcamento_itens drop constraint if exists orcamento_itens_desconto_item_tipo_check;
alter table public.orcamento_itens
  add constraint orcamento_itens_desconto_item_tipo_check check (desconto_item_tipo in ('percentual', 'valor'));

-- Na proposta ao cliente: mostrar o desconto de cada item (true) ou apresentar só o valor já com desconto (false)
alter table public.orcamentos add column if not exists mostrar_desc_itens boolean not null default true;
